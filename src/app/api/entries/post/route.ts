import { NextRequest } from 'next/server'
import { runEntryMutation } from '@/lib/entry-route'
import { parseAmountField, requireDate, requireString } from '@/lib/api-response'
import { postActual } from '@/lib/entry-service/service'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  return runEntryMutation(request, 200, ({ workspaceId, body, today }) =>
    postActual(workspaceId, {
      entryRef: requireString(body.entryRef, 'entryRef'),
      amountCents: parseAmountField(body.amount, 'amount'),
      actualDate: requireDate(body.actualDate, 'actualDate'),
      today,
      submissionKey: requireString(body.submissionKey, 'submissionKey'),
    }),
  )
}
