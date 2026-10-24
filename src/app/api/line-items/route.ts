import { NextRequest } from 'next/server'
import { runEntryMutation } from '@/lib/entry-route'
import { requireDate, requireString } from '@/lib/api-response'
import { ServiceError } from '@/lib/entry-service/errors'
import { createLineItem } from '@/lib/entry-service/service'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  return runEntryMutation(request, 201, ({ workspaceId, body, today }) => {
    if (body.description !== undefined && body.description !== null && typeof body.description !== 'string') {
      throw new ServiceError('VALIDATION', 'Description must be text', 'description')
    }
    return createLineItem(workspaceId, {
      envelopeId: requireString(body.envelopeId, 'envelopeId'),
      // Raw text; the service parses it with parseMoney.
      amountText: typeof body.amount === 'string' ? body.amount : '',
      purchaseDate: requireDate(body.purchaseDate, 'purchaseDate'),
      description: typeof body.description === 'string' ? body.description : undefined,
      today,
      submissionKey: requireString(body.submissionKey, 'submissionKey'),
    })
  })
}
