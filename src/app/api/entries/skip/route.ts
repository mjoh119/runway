import { NextRequest } from 'next/server'
import { runEntryMutation } from '@/lib/entry-route'
import { requireString } from '@/lib/api-response'
import { skipEntry } from '@/lib/entry-service/service'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  return runEntryMutation(request, 200, ({ workspaceId, body, today }) =>
    skipEntry(workspaceId, {
      entryRef: requireString(body.entryRef, 'entryRef'),
      today,
    }),
  )
}
