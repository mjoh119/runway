import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * Integration tests for resolveWorkspace. Require a Postgres database with the
 * schema applied (DATABASE_URL). Skipped when no database is configured.
 * Modules are imported lazily so the suite loads without a DB.
 */
async function databaseReachable(): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false
  try {
    const { prisma } = await import('@/lib/db')
    await prisma.$queryRaw`SELECT 1`
    await prisma.workspace.count()
    return true
  } catch {
    // Placeholder/unreachable DATABASE_URL: treat as "no database".
    return false
  }
}

const hasDb = await databaseReachable()

describe.skipIf(!hasDb)('resolveWorkspace (integration)', () => {
  type WorkspaceModule = typeof import('@/lib/workspace')
  type DbModule = typeof import('@/lib/db')
  let ws: WorkspaceModule
  let db: DbModule['prisma']
  const created: string[] = []
  const today = '2025-01-15'

  beforeAll(async () => {
    ws = await import('@/lib/workspace')
    db = (await import('@/lib/db')).prisma
  })

  afterAll(async () => {
    if (!db) return
    for (const id of created) {
      // Children cascade on workspace delete.
      await db.workspace.deleteMany({ where: { id } })
    }
    await db.$disconnect()
  })

  function idFromCookie(setCookie: string): string {
    const m = setCookie.match(new RegExp(`^${ws.WORKSPACE_COOKIE}=([^;]+)`))
    return decodeURIComponent(m![1])
  }

  it('creates and seeds a workspace when the cookie is missing', async () => {
    const result = await ws.resolveWorkspace({ headers: new Headers() }, today)
    created.push(result.workspace.id)

    expect(result.setCookie).not.toBeNull()
    const cookie = result.setCookie!
    expect(idFromCookie(cookie)).toBe(result.workspace.id)
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('Secure')
    expect(cookie).toContain('SameSite=Lax')
    expect(cookie).toContain(`Max-Age=${365 * 24 * 60 * 60}`)

    const accounts = await db.account.findMany({ where: { workspaceId: result.workspace.id } })
    expect(accounts).toHaveLength(2)
  })

  it('loads the existing workspace for a valid cookie with setCookie null', async () => {
    const first = await ws.resolveWorkspace({ headers: new Headers() }, today)
    created.push(first.workspace.id)

    const headers = new Headers({ cookie: `${ws.WORKSPACE_COOKIE}=${first.workspace.id}` })
    const second = await ws.resolveWorkspace({ headers }, today)

    expect(second.setCookie).toBeNull()
    expect(second.workspace.id).toBe(first.workspace.id)
    const accounts = await db.account.findMany({ where: { workspaceId: first.workspace.id } })
    expect(accounts).toHaveLength(2)
  })

  it('creates a new workspace when the cookie id is unknown', async () => {
    const unknownId = randomUUID()
    const headers = new Headers({ cookie: `${ws.WORKSPACE_COOKIE}=${unknownId}` })
    const result = await ws.resolveWorkspace({ headers }, today)
    created.push(result.workspace.id)

    expect(result.workspace.id).not.toBe(unknownId)
    expect(result.setCookie).not.toBeNull()
    expect(idFromCookie(result.setCookie!)).toBe(result.workspace.id)
  })
})
