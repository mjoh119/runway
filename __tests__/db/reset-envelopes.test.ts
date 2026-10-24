import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * Database tests for reset and cleanup of Spec 2 data (envelopes, line items,
 * occurrence records, submission keys). Require a Postgres database with the
 * schema applied (DATABASE_URL). Skipped when no database is configured.
 * Modules are imported lazily so the suite loads without a DB.
 *
 * Validates: Requirements 15.3, 15.4, 15.5
 */
async function databaseReachable(): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false
  try {
    const { prisma } = await import('@/lib/db')
    await prisma.$queryRaw`SELECT 1`
    await prisma.workspace.count()
    await prisma.envelope.count()
    await prisma.lineItem.count()
    await prisma.occurrenceRecord.count()
    await prisma.submissionKey.count()
    return true
  } catch {
    return false
  }
}

const hasDb = await databaseReachable()

describe.skipIf(!hasDb)('Reset demo and workspace cleanup (integration)', () => {
  type DbClient = typeof import('@/lib/db')['prisma']
  let db: DbClient
  let seedWorkspace: typeof import('@/lib/seed-workspace')['seedWorkspace']
  let resetWorkspace: typeof import('@/lib/reset-workspace')['resetWorkspace']
  const created: string[] = []

  const today = '2025-01-15'

  beforeAll(async () => {
    db = (await import('@/lib/db')).prisma
    seedWorkspace = (await import('@/lib/seed-workspace')).seedWorkspace
    resetWorkspace = (await import('@/lib/reset-workspace')).resetWorkspace
  })

  afterAll(async () => {
    if (!db) return
    for (const id of created) await db.workspace.deleteMany({ where: { id } })
    await db.$disconnect()
  })

  async function newSeededWorkspace(): Promise<string> {
    const ws = await db.workspace.create({ data: {} })
    created.push(ws.id)
    await seedWorkspace(ws.id, today)
    return ws.id
  }

  /** Workspace content with generated ids stripped, in a stable order. */
  async function snapshot(workspaceId: string) {
    const [ws, envelopes, lineItems, accounts, schedules, oneOffs] = await Promise.all([
      db.workspace.findUniqueOrThrow({ where: { id: workspaceId } }),
      db.envelope.findMany({ where: { workspaceId } }),
      db.lineItem.findMany({ where: { workspaceId }, include: { envelope: true } }),
      db.account.findMany({ where: { workspaceId } }),
      db.schedule.findMany({ where: { workspaceId }, include: { account: true } }),
      db.oneOffEntry.findMany({ where: { workspaceId }, include: { account: true } }),
    ])
    const byJson = (a: unknown, b: unknown) => JSON.stringify(a).localeCompare(JSON.stringify(b))
    return {
      settings: {
        lowBalanceThresholdCents: ws.lowBalanceThresholdCents,
        projectionHorizonDays: ws.projectionHorizonDays,
      },
      envelopes: envelopes
        .map((e) => ({
          name: e.name,
          nameKey: e.nameKey,
          budgetCents: e.budgetCents,
          resetPeriod: e.resetPeriod,
        }))
        .sort(byJson),
      lineItems: lineItems
        .map((l) => ({
          envelope: l.envelope.name,
          amountCents: l.amountCents,
          purchaseDate: l.purchaseDate.toISOString(),
          description: l.description,
        }))
        .sort(byJson),
      accounts: accounts
        .map((a) => ({
          name: a.name,
          type: a.type,
          isPrimary: a.isPrimary,
          ledgerBalanceCents: a.ledgerBalanceCents,
          availableBalanceCents: a.availableBalanceCents,
        }))
        .sort(byJson),
      schedules: schedules
        .map((s) => ({
          name: s.name,
          account: s.account.name,
          intervalType: s.intervalType,
          intervalValue: s.intervalValue,
          daysOfMonth: s.daysOfMonth,
          startDate: s.startDate.toISOString(),
          estimatedAmountCents: s.estimatedAmountCents,
          entryType: s.entryType,
        }))
        .sort(byJson),
      oneOffs: oneOffs
        .map((o) => ({
          account: o.account.name,
          postDate: o.postDate.toISOString(),
          estimatedAmountCents: o.estimatedAmountCents,
          actualAmountCents: o.actualAmountCents,
          actualDate: o.actualDate?.toISOString() ?? null,
          status: o.status,
          entryType: o.entryType,
          holdReleaseDate: o.holdReleaseDate?.toISOString() ?? null,
          isHoldEstimated: o.isHoldEstimated,
          description: o.description,
        }))
        .sort(byJson),
      occurrenceRecords: await db.occurrenceRecord.count({ where: { workspaceId } }),
      submissionKeys: await db.submissionKey.count({ where: { workspaceId } }),
    }
  }

  /** Add edits of every kind a visitor could make to a seeded workspace. */
  async function dirtyWorkspace(workspaceId: string): Promise<void> {
    const account = await db.account.findFirstOrThrow({ where: { workspaceId, isPrimary: true } })
    const schedule = await db.schedule.findFirstOrThrow({ where: { workspaceId } })
    await db.account.update({
      where: { id: account.id },
      data: { ledgerBalanceCents: { increment: 12_345 }, availableBalanceCents: { decrement: 999 } },
    })
    await db.workspace.update({
      where: { id: workspaceId },
      data: { lowBalanceThresholdCents: 1, projectionHorizonDays: 90 },
    })
    const envelope = await db.envelope.create({
      data: { workspaceId, name: 'Extra', nameKey: 'extra', budgetCents: 5_000, resetPeriod: 'WEEKLY' },
    })
    await db.lineItem.create({
      data: {
        workspaceId,
        envelopeId: envelope.id,
        amountCents: 700,
        purchaseDate: new Date(Date.UTC(2025, 0, 14)),
        description: 'edit',
      },
    })
    await db.envelope.updateMany({ where: { workspaceId, name: { not: 'Extra' } }, data: { budgetCents: 1 } })
    await db.lineItem.deleteMany({ where: { workspaceId, envelope: { name: { not: 'Extra' } } } })
    await db.oneOffEntry.create({
      data: {
        workspaceId,
        accountId: account.id,
        postDate: new Date(Date.UTC(2025, 0, 20)),
        estimatedAmountCents: -1_500,
        entryType: 'DEBIT',
        description: 'edit',
      },
    })
    await db.occurrenceRecord.create({
      data: {
        workspaceId,
        scheduleId: schedule.id,
        accountId: schedule.accountId,
        occurrenceDate: new Date(Date.UTC(2025, 0, 10)),
        entryType: schedule.entryType,
        status: 'POSTED',
        estimatedAmountCents: schedule.estimatedAmountCents,
        actualAmountCents: schedule.estimatedAmountCents,
        actualDate: new Date(Date.UTC(2025, 0, 10)),
      },
    })
    await db.submissionKey.create({
      data: { workspaceId, key: `key-${workspaceId}`, kind: 'POST', result: { ok: true } },
    })
  }

  it('reset of A leaves B untouched and matches a fresh workspace for the same date', async () => {
    const a = await newSeededWorkspace()
    const b = await newSeededWorkspace()
    const fresh = await newSeededWorkspace()
    await dirtyWorkspace(a)
    await dirtyWorkspace(b)

    const bBefore = await snapshot(b)
    const aDirty = await snapshot(a)
    expect(aDirty.occurrenceRecords).toBe(1)
    expect(aDirty.submissionKeys).toBe(1)

    await resetWorkspace(a, today)

    const aAfter = await snapshot(a)
    expect(aAfter).toEqual(await snapshot(fresh))
    expect(aAfter.occurrenceRecords).toBe(0)
    expect(aAfter.submissionKeys).toBe(0)
    expect(aAfter.envelopes.some((e) => e.name === 'Extra')).toBe(false)

    // B is unchanged, including its edits and its own records/keys.
    expect(await snapshot(b)).toEqual(bBefore)
    expect(bBefore.occurrenceRecords).toBe(1)
    expect(bBefore.submissionKeys).toBe(1)
  })

  it('deleting a workspace (inactivity cleanup) removes its Spec 2 rows and spares others', async () => {
    const doomed = await newSeededWorkspace()
    const keeper = await newSeededWorkspace()
    await dirtyWorkspace(doomed)
    await dirtyWorkspace(keeper)
    const keeperBefore = await snapshot(keeper)

    // Same operation as /api/cron/cleanup: deleteMany on stale workspaces.
    await db.workspace.update({
      where: { id: doomed },
      data: { lastActivity: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000) },
    })
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    await db.workspace.deleteMany({ where: { id: doomed, lastActivity: { lt: cutoff } } })

    expect(await db.workspace.count({ where: { id: doomed } })).toBe(0)
    expect(await db.envelope.count({ where: { workspaceId: doomed } })).toBe(0)
    expect(await db.lineItem.count({ where: { workspaceId: doomed } })).toBe(0)
    expect(await db.occurrenceRecord.count({ where: { workspaceId: doomed } })).toBe(0)
    expect(await db.submissionKey.count({ where: { workspaceId: doomed } })).toBe(0)

    expect(await snapshot(keeper)).toEqual(keeperBefore)
  })
})
