import { NextRequest } from 'next/server'
import { runEntryMutation } from '@/lib/entry-route'
import { parseAmountField, requireDate, requireString } from '@/lib/api-response'
import { ServiceError } from '@/lib/entry-service/errors'
import { addOneOff } from '@/lib/entry-service/service'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  return runEntryMutation(request, 201, ({ workspaceId, body, today }) => {
    if (typeof body.alreadyHappened !== 'boolean') {
      throw new ServiceError('VALIDATION', 'alreadyHappened must be true or false', 'alreadyHappened')
    }
    if (body.description !== undefined && body.description !== null && typeof body.description !== 'string') {
      throw new ServiceError('VALIDATION', 'Description must be text', 'description')
    }
    return addOneOff(workspaceId, {
      direction: requireString(body.direction, 'direction'),
      amountCents: parseAmountField(body.amount, 'amount'),
      date: requireDate(body.date, 'date'),
      description: typeof body.description === 'string' ? body.description : undefined,
      alreadyHappened: body.alreadyHappened,
      today,
      submissionKey: requireString(body.submissionKey, 'submissionKey'),
    })
  })
}
