import { NextRequest, NextResponse } from 'next/server'
import { runEntryMutation } from '@/lib/entry-route'
import { errorToOutcome, requireDate, successOutcome, type ApiOutcome } from '@/lib/api-response'
import { ServiceError } from '@/lib/entry-service/errors'
import { deleteLineItem, updateLineItem } from '@/lib/entry-service/service'
import { resolveWorkspace } from '@/lib/workspace'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

function optionalText(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string') {
    throw new ServiceError('VALIDATION', `${field} must be text`, field)
  }
  return value
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { id } = await context.params
  return runEntryMutation(request, 200, ({ workspaceId, body, today }) =>
    updateLineItem(workspaceId, id, {
      amountText: optionalText(body.amount, 'amount'),
      purchaseDate:
        body.purchaseDate === undefined ? undefined : requireDate(body.purchaseDate, 'purchaseDate'),
      description: optionalText(body.description, 'description'),
      envelopeId: optionalText(body.envelopeId, 'envelopeId'),
      today,
    }),
  )
}

/** DELETE may have no body: `today` comes from the query string, else a JSON body if present. */
export async function DELETE(request: NextRequest, context: RouteContext) {
  const { id } = await context.params
  let outcome: ApiOutcome<{ id: string }>
  let setCookie: string | null = null
  try {
    let todayRaw: unknown = request.nextUrl.searchParams.get('today')
    if (todayRaw === null) {
      try {
        const raw: unknown = await request.json()
        if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
          todayRaw = (raw as Record<string, unknown>).today
        }
      } catch {
        // Empty or non-JSON body: fall through to validation below.
      }
    }
    const today = requireDate(todayRaw, 'today')
    const resolved = await resolveWorkspace(request, today)
    setCookie = resolved.setCookie
    outcome = successOutcome(await deleteLineItem(resolved.workspace.id, id))
  } catch (error) {
    if (!(error instanceof ServiceError)) console.error('Line item delete error:', error)
    outcome = errorToOutcome(error)
  }
  const response = NextResponse.json(outcome.body, { status: outcome.status })
  if (setCookie) response.headers.append('Set-Cookie', setCookie)
  return response
}
