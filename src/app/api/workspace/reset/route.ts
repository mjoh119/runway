import { NextRequest, NextResponse } from 'next/server'
import { isValidIsoDate, resetWorkspace } from '@/lib/reset-workspace'
import { resolveWorkspace } from '@/lib/workspace'

export const dynamic = 'force-dynamic'

/**
 * Reset demo for the caller's workspace only.
 * Unauthenticated by design: each visitor owns a demo workspace scoped by an
 * HTTP-only cookie, and the reset only ever touches that workspace.
 * `today` (YYYY-MM-DD) comes from the JSON body or the ?today= query param.
 */
export async function POST(request: NextRequest) {
  let today: unknown = request.nextUrl.searchParams.get('today')
  if (!today) {
    try {
      const body: unknown = await request.json()
      if (body && typeof body === 'object') today = (body as { today?: unknown }).today
    } catch {
      // no/invalid JSON body: fall through to validation
    }
  }

  if (!isValidIsoDate(today)) {
    return NextResponse.json({ error: 'today must be a valid YYYY-MM-DD date' }, { status: 400 })
  }

  try {
    const { workspace, setCookie } = await resolveWorkspace(request, today)
    await resetWorkspace(workspace.id, today)

    const response = NextResponse.json({ ok: true })
    if (setCookie) response.headers.append('Set-Cookie', setCookie)
    return response
  } catch (error) {
    console.error('Workspace reset error:', error)
    return NextResponse.json({ error: 'Reset failed' }, { status: 500 })
  }
}
