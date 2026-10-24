import { NextRequest, NextResponse } from 'next/server'
import { addDays } from '@/lib/projection/dates'
import { buildWorkspaceView } from '@/lib/projection-service'
import { runEntryMutation } from '@/lib/entry-route'
import { createEnvelope } from '@/lib/entry-service/service'

export const dynamic = 'force-dynamic'

/** Non-strings become '' so the service validator reports the field error. */
const text = (value: unknown): string => (typeof value === 'string' ? value : '')

export async function POST(request: NextRequest) {
  return runEntryMutation(request, 201, ({ workspaceId, body }) =>
    createEnvelope(workspaceId, {
      name: text(body.name),
      budgetText: text(body.budget),
      resetPeriod: text(body.resetPeriod),
    }),
  )
}

/** Strict YYYY-MM-DD check that also rejects impossible calendar dates. */
function isValidDate(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  try {
    return addDays(value, 0) === value
  } catch {
    return false
  }
}

export async function GET(request: NextRequest) {
  const today = new URL(request.url).searchParams.get('today')
  if (!isValidDate(today)) {
    return NextResponse.json(
      { error: 'Invalid date format. Expected a valid YYYY-MM-DD date.' },
      { status: 400 },
    )
  }

  try {
    const { view, setCookie } = await buildWorkspaceView(request, today)
    const response = NextResponse.json({
      envelopes: view.envelopes,
      runway: view.projection.runway,
    })
    if (setCookie) response.headers.append('Set-Cookie', setCookie)
    return response
  } catch (error) {
    console.error('Envelopes error:', error)
    return NextResponse.json(
      { error: 'Envelopes failed to load. Please try again.' },
      { status: 500 },
    )
  }
}