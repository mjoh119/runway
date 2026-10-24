import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'

export type SubmissionKind = 'POST' | 'ONE_OFF' | 'PURCHASE'

/**
 * True when `e` is a Prisma P2002 unique violation on the given model.
 * `meta.target` is an array of column names on the default Postgres engine,
 * or a constraint/index name string on some drivers. Both shapes are handled.
 */
export function isUniqueViolationOn(e: unknown, model: string): boolean {
  if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== 'P2002') {
    return false
  }
  const target = (e.meta as { target?: unknown } | undefined)?.target
  const modelName = model.toLowerCase()
  if (Array.isArray(target)) {
    return target.includes('workspaceId') && target.includes('key')
  }
  if (typeof target === 'string') {
    return target.toLowerCase().includes(modelName)
  }
  return false
}

/**
 * Runs `work` at most once per (workspaceId, key).
 * - A stored result is replayed without running `work` (11.2, 11.8).
 * - The SubmissionKey insert is the first statement in the transaction, so
 *   concurrent duplicates serialise on the unique index (11.5).
 * - The result and lastActivity are written in the same transaction (11.3).
 * - If `work` throws, the transaction rolls back and the key is not stored,
 *   so a retry with the same key can run again (11.9).
 * - A loser of the race replays the winner's stored result.
 */
export async function runIdempotent<T extends Prisma.InputJsonValue>(
  workspaceId: string,
  key: string,
  kind: SubmissionKind,
  work: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  const where = { workspaceId_key: { workspaceId, key } }

  const seen = await prisma.submissionKey.findUnique({ where })
  if (seen?.result != null) return seen.result as T

  try {
    return await prisma.$transaction(async (tx) => {
      await tx.submissionKey.create({ data: { workspaceId, key, kind } })
      const result = await work(tx)
      await tx.submissionKey.update({ where, data: { result } })
      await tx.workspace.update({
        where: { id: workspaceId },
        data: { lastActivity: new Date() },
      })
      return result
    })
  } catch (e) {
    if (isUniqueViolationOn(e, 'SubmissionKey')) {
      const winner = await prisma.submissionKey.findUnique({ where })
      if (winner?.result != null) return winner.result as T
    }
    throw e
  }
}
