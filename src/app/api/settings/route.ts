import { NextRequest, NextResponse } from 'next/server'
import { runEntryMutation } from '@/lib/entry-route'
import { errorToOutcome, requireDate, successOutcome } from '@/lib/api-response'
import { ServiceError } from '@/lib/entry-service/errors'
import { saveSettings } from '@/lib/entry-service/service'
import { resolveWorkspace } from '@/lib/workspace'

export const dynamic = 'force-dynamic'

function textField(value: unknown, field: string, optional: boolean): string {
  if (value === undefined || value === null) {
    if (optional) return ''
    throw new ServiceError('VALIDATION', `${field} is required`, field)
  }
  if (typeof value !== 'string') {
    throw new ServiceError('VALIDATION', `${field} must be text`, field)
  }
  return value
}

export async function GET(request: NextRequest) {
  let setCookie: string | null = null
  let outcome
  try {
    const today = requireDate(new URL(request.url).searchParams.get('today'), 'today')
    const resolved = await resolveWorkspace(request, today)
    setCookie = resolved.setCookie
    outcome = successOutcome({
      lowBalanceThresholdCents: resolved.workspace.lowBalanceThresholdCents,
      projectionHorizonDays: resolved.workspace.projectionHorizonDays,
    })
  } catch (error) {
    if (!(error instanceof ServiceError)) console.error('Settings read error:', error)
    outcome = errorToOutcome(error)
  }
  const response = NextResponse.json(outcome.body, { status: outcome.status })
  if (setCookie) response.headers.append('Set-Cookie', setCookie)
  return response
}

export async function PUT(request: NextRequest) {
  return runEntryMutation(request, 200, ({ workspaceId, body }) =>
    saveSettings(workspaceId, {
      thresholdText: textField(body.threshold, 'threshold', true),
      horizonText: textField(body.horizon, 'horizon', false),
    }),
  )
}
