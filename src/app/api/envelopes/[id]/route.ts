import { NextRequest } from 'next/server'
import { runEntryMutation } from '@/lib/entry-route'
import { updateEnvelope } from '@/lib/entry-service/service'

export const dynamic = 'force-dynamic'

/** Non-strings become '' so the service validator reports the field error. */
const text = (value: unknown): string => (typeof value === 'string' ? value : '')

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params
  return runEntryMutation(request, 200, ({ workspaceId, body }) =>
    updateEnvelope(workspaceId, id, {
      name: text(body.name),
      budgetText: text(body.budget),
      resetPeriod: text(body.resetPeriod),
    }),
  )
}
