/**
 * Shared runner for the entry mutation routes: parses the JSON body, validates
 * `today`, resolves the cookie workspace, runs the handler, and shapes the
 * response (mapping ServiceError codes to HTTP statuses).
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveWorkspace } from '@/lib/workspace'
import { ServiceError } from '@/lib/entry-service/errors'
import {
  errorToOutcome,
  requireDate,
  successOutcome,
  type ApiOutcome,
} from '@/lib/api-response'

export async function runEntryMutation<T>(
  request: NextRequest,
  successStatus: number,
  handler: (ctx: { workspaceId: string; body: Record<string, unknown>; today: string }) => Promise<T>,
): Promise<NextResponse> {
  let outcome: ApiOutcome<T>
  let setCookie: string | null = null
  try {
    let raw: unknown
    try {
      raw = await request.json()
    } catch {
      throw new ServiceError('VALIDATION', 'Request body must be valid JSON')
    }
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      throw new ServiceError('VALIDATION', 'Request body must be a JSON object')
    }
    const body = raw as Record<string, unknown>
    const today = requireDate(body.today, 'today')

    const resolved = await resolveWorkspace(request, today)
    setCookie = resolved.setCookie
    const result = await handler({ workspaceId: resolved.workspace.id, body, today })
    outcome = successOutcome(result, successStatus)
  } catch (error) {
    if (!(error instanceof ServiceError)) console.error('Entry mutation error:', error)
    outcome = errorToOutcome(error)
  }

  const response = NextResponse.json(outcome.body, { status: outcome.status })
  if (setCookie) response.headers.append('Set-Cookie', setCookie)
  return response
}
