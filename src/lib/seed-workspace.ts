import { prisma } from './db'
import { generateDemoData } from '../sources/fake-source'

/** Convert 'YYYY-MM-DD' to a UTC-midnight Date for @db.Date columns. */
function toUtcDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

/**
 * Write the demo data for `today` ('YYYY-MM-DD') into one workspace.
 * Runs in a single transaction (rolls back on any error). Creates the
 * workspace row if missing and replaces any existing accounts, schedules,
 * entries, envelopes, line items, occurrence records and submission keys of
 * that workspace only, so it doubles as "Reset demo".
 */
export async function seedWorkspace(workspaceId: string, today: string): Promise<void> {
  const demo = generateDemoData(today)

  const primaryCount = demo.accounts.filter((a) => a.isPrimary).length
  if (primaryCount !== 1) {
    throw new Error(`Demo data must have exactly one primary account (found ${primaryCount})`)
  }

  await prisma.$transaction(async (tx) => {
    await tx.workspace.upsert({
      where: { id: workspaceId },
      create: {
        id: workspaceId,
        lowBalanceThresholdCents: demo.workspaceSettings.lowBalanceThresholdCents,
        projectionHorizonDays: demo.workspaceSettings.projectionHorizonDays,
      },
      update: {
        lowBalanceThresholdCents: demo.workspaceSettings.lowBalanceThresholdCents,
        projectionHorizonDays: demo.workspaceSettings.projectionHorizonDays,
        lastActivity: new Date(),
      },
    })

    // Clear Spec 2 rows first (explicit, workspace-scoped), then accounts,
    // which cascade-delete their schedules and entries.
    await tx.submissionKey.deleteMany({ where: { workspaceId } })
    await tx.occurrenceRecord.deleteMany({ where: { workspaceId } })
    await tx.lineItem.deleteMany({ where: { workspaceId } })
    await tx.envelope.deleteMany({ where: { workspaceId } })
    await tx.account.deleteMany({ where: { workspaceId } })

    const accountIds = new Map<string, string>() // demo id -> created id
    for (const a of demo.accounts) {
      const created = await tx.account.create({
        data: {
          workspaceId,
          name: a.name,
          type: a.type,
          isPrimary: a.isPrimary,
          ledgerBalanceCents: a.ledgerBalanceCents,
          availableBalanceCents: a.availableBalanceCents ?? null,
        },
      })
      accountIds.set(a.id, created.id)
    }

    const resolveAccount = (demoId: string): string => {
      const id = accountIds.get(demoId)
      if (!id) throw new Error(`Unknown demo account id: ${demoId}`)
      return id
    }

    for (const s of demo.schedules) {
      await tx.schedule.create({
        data: {
          workspaceId,
          name: s.name,
          accountId: resolveAccount(s.accountId),
          intervalType: s.intervalType,
          intervalValue: s.intervalValue,
          daysOfMonth: s.daysOfMonth,
          startDate: toUtcDate(s.startDate),
          estimatedAmountCents: s.estimatedAmountCents,
          entryType: s.entryType,
        },
      })
    }

    for (const e of demo.oneOffEntries) {
      await tx.oneOffEntry.create({
        data: {
          workspaceId,
          accountId: resolveAccount(e.accountId),
          postDate: toUtcDate(e.postDate),
          estimatedAmountCents: e.estimatedAmountCents,
          actualAmountCents: e.actualAmountCents,
          status: e.status,
          entryType: e.entryType,
          holdReleaseDate: e.holdReleaseDate ? toUtcDate(e.holdReleaseDate) : null,
          isHoldEstimated: e.isHoldEstimated ?? false,
          description: e.description ?? null,
        },
      })
    }

    const envelopeIds = new Map<string, string>() // demo id -> created id
    for (const env of demo.envelopes) {
      const created = await tx.envelope.create({
        data: {
          workspaceId,
          name: env.name,
          nameKey: env.name.trim().toLowerCase(),
          budgetCents: env.budgetCents,
          resetPeriod: env.resetPeriod,
        },
      })
      envelopeIds.set(env.id, created.id)
    }

    for (const li of demo.lineItems) {
      const envelopeId = envelopeIds.get(li.envelopeId)
      if (!envelopeId) throw new Error(`Unknown demo envelope id: ${li.envelopeId}`)
      await tx.lineItem.create({
        data: {
          workspaceId,
          envelopeId,
          amountCents: li.amountCents,
          purchaseDate: toUtcDate(li.purchaseDate),
          description: li.description,
        },
      })
    }
  })
}
