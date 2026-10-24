import { randomUUID } from 'node:crypto'
import type { Workspace } from '@prisma/client'
import { prisma } from './db'
import { seedWorkspace } from './seed-workspace'

export const WORKSPACE_COOKIE = 'runway_workspace'
export const WORKSPACE_COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60

/**
 * Minimal request shape: a NextRequest (cookies.get) or a plain Request
 * (headers.get('cookie')). Either accessor is enough.
 */
export interface WorkspaceRequest {
  headers?: { get(name: string): string | null }
  cookies?: { get(name: string): { value: string } | undefined }
}

export interface ResolvedWorkspace {
  workspace: Workspace
  /** Serialized Set-Cookie header value, or null when the existing cookie is valid. */
  setCookie: string | null
}

function parseCookieHeader(header: string, name: string): string | undefined {
  for (const part of header.split(';')) {
    const idx = part.indexOf('=')
    if (idx === -1) continue
    if (part.slice(0, idx).trim() === name) {
      const raw = part.slice(idx + 1).trim()
      try {
        return decodeURIComponent(raw)
      } catch {
        return raw
      }
    }
  }
  return undefined
}

function readWorkspaceId(request: WorkspaceRequest): string | undefined {
  const fromAccessor = request.cookies?.get(WORKSPACE_COOKIE)?.value
  if (fromAccessor) return fromAccessor
  const header = request.headers?.get('cookie')
  return header ? parseCookieHeader(header, WORKSPACE_COOKIE) : undefined
}

export function serializeWorkspaceCookie(workspaceId: string): string {
  return [
    `${WORKSPACE_COOKIE}=${encodeURIComponent(workspaceId)}`,
    'Path=/',
    `Max-Age=${WORKSPACE_COOKIE_MAX_AGE_SECONDS}`,
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
  ].join('; ')
}

/**
 * Resolve the caller's workspace from the cookie. Creates and seeds a new
 * workspace (and returns a Set-Cookie string) when the cookie is missing or
 * references a workspace that does not exist. `today` is 'YYYY-MM-DD'.
 * Callers must filter every query by the returned `workspace.id`.
 */
export async function resolveWorkspace(
  request: WorkspaceRequest,
  today: string,
): Promise<ResolvedWorkspace> {
  const existingId = readWorkspaceId(request)
  if (existingId) {
    const existing = await prisma.workspace.findUnique({ where: { id: existingId } })
    if (existing) return { workspace: existing, setCookie: null }
  }

  const id = randomUUID()
  await seedWorkspace(id, today)
  const workspace = await prisma.workspace.findUniqueOrThrow({ where: { id } })
  return { workspace, setCookie: serializeWorkspaceCookie(id) }
}
