/**
 * Entry_Service executors (Prisma). Thin: the pure plan functions decide every
 * rule, these functions apply the plan inside one transaction.
 *
 * Every read and write is scoped by `workspaceId`; an id from another
 * workspace is reported as NOT_FOUND. Every transaction bumps `lastActivity`.
 * Results are plain JSON so `runIdempotent` can store and replay them.
 */

import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { generateEntries } from '@/lib/projection/engine'
import type { Schedule } from '@/lib/projection/types'
import { formatCentsPlain } from '@/lib/money'
import { lineItemDelta, type BalanceDelta } from './balance-delta'
import { validateEnvelopeInput, validateLineItemInput, validateSettings } from './validate'
import { ServiceError } from './errors'
import { runIdempotent } from './idempotency'
import { buildOccurrenceRecord, parseEntryRef } from './occurrence'
import { planOneOff } from './plan-one-off'
import { planPost, planSkip } from './plan-post'

// ---------------------------------------------------------------------------
// Request / result types (type aliases so they are assignable to JSON values)
// ---------------------------------------------------------------------------

export type PostRequest = {
  entryRef: string
  /** Positive integer cents (magnitude). */
  amountCents: number
  actualDate: string
  today: string
  submissionKey: string
}
export type PostResult = {
  entryRef: string
  status: 'POSTED'
  /** signed(actual) - signed(estimate). */
  varianceCents: number
}

export type SkipRequest = { entryRef: string; today: string }
export type SkipResult = { entryRef: string; status: 'SKIPPED' }

export type OneOffRequest = {
  direction: string
  amountCents: number
  date: string
  description?: string
  alreadyHappened: boolean
  today: string
  submissionKey: string
}
export type OneOffResult = {
  id: string
  status: 'PLANNED' | 'POSTED'
  entryType: 'INCOME' | 'DEBIT'
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

type Tx = Prisma.TransactionClient

const toDateOnly = (d: Date): string => d.toISOString().split('T')[0]
const fromDateOnly = (s: string): Date => new Date(`${s}T00:00:00.000Z`)

function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002'
}

function conflict(message: string): ServiceError {
  return new ServiceError('CONFLICT', message)
}

function notFound(message: string): ServiceError {
  return new ServiceError('NOT_FOUND', message)
}

/** Unwrap a pure plan Result, throwing its ServiceError on failure. */
function unwrap<T>(r: { ok: true; value: T } | { ok: false; error: ServiceError }): T {
  if (!r.ok) throw r.error
  return r.value
}

/** Atomic ledger increment; available only moves when it is not null. */
async function applyBalanceDelta(
  tx: Tx,
  workspaceId: string,
  accountId: string,
  delta: BalanceDelta,
): Promise<void> {
  const ledger = await tx.account.updateMany({
    where: { id: accountId, workspaceId },
    data: { ledgerBalanceCents: { increment: delta.ledgerCents } },
  })
  if (ledger.count !== 1) throw notFound('Account not found')
  if (delta.availableCents !== 0) {
    await tx.account.updateMany({
      where: { id: accountId, workspaceId, availableBalanceCents: { not: null } },
      data: { availableBalanceCents: { increment: delta.availableCents } },
    })
  }
}

async function touchWorkspace(tx: Tx, workspaceId: string): Promise<void> {
  await tx.workspace.update({
    where: { id: workspaceId },
    data: { lastActivity: new Date() },
  })
}

/** Load a schedule (workspace-scoped) and confirm the occurrence date is real. */
async function loadOccurrence(
  tx: Tx,
  workspaceId: string,
  scheduleId: string,
  occurrenceDate: string,
) {
  const row = await tx.schedule.findFirst({ where: { id: scheduleId, workspaceId } })
  if (!row) throw notFound('Entry not found')
  const schedule: Schedule = {
    id: row.id,
    name: row.name,
    accountId: row.accountId,
    intervalType: row.intervalType,
    intervalValue: row.intervalValue,
    daysOfMonth: row.daysOfMonth,
    startDate: toDateOnly(row.startDate),
    estimatedAmountCents: row.estimatedAmountCents,
    entryType: row.entryType,
  }
  let valid = false
  try {
    const found = generateEntries(schedule, occurrenceDate, occurrenceDate, [])
    valid = found.length === 1 && found[0].postDate === occurrenceDate
  } catch {
    valid = false
  }
  if (!valid) throw notFound('Entry not found')
  return schedule
}

async function createOccurrenceRecord(
  tx: Tx,
  workspaceId: string,
  data: ReturnType<typeof buildOccurrenceRecord>,
): Promise<void> {
  try {
    await tx.occurrenceRecord.create({
      data: {
        workspaceId,
        scheduleId: data.scheduleId,
        accountId: data.accountId,
        occurrenceDate: fromDateOnly(data.occurrenceDate),
        status: data.status,
        entryType: data.entryType,
        description: data.description,
        estimatedAmountCents: data.estimatedAmountCents,
        actualAmountCents: data.actualAmountCents,
        actualDate: data.actualDate ? fromDateOnly(data.actualDate) : null,
      },
    })
  } catch (e) {
    if (isUniqueViolation(e)) {
      throw conflict('This entry was already posted or skipped')
    }
    throw e
  }
}

// ---------------------------------------------------------------------------
// postActual
// ---------------------------------------------------------------------------

export async function postActual(workspaceId: string, req: PostRequest): Promise<PostResult> {
  return runIdempotent<PostResult>(workspaceId, req.submissionKey, 'POST', async (tx) => {
    const ref = parseEntryRef(req.entryRef)
    const input = { amountCents: req.amountCents, actualDate: req.actualDate, today: req.today }

    if (ref.kind === 'ONE_OFF') {
      const row = await tx.oneOffEntry.findFirst({ where: { id: ref.id, workspaceId } })
      if (!row) throw notFound('Entry not found')

      const plan = unwrap(
        planPost(
          {
            entryType: row.entryType,
            status: row.status,
            estimatedAmountCents: row.estimatedAmountCents,
            holdReleaseDate: row.holdReleaseDate ? toDateOnly(row.holdReleaseDate) : undefined,
          },
          input,
        ),
      )

      const updated = await tx.oneOffEntry.updateMany({
        where: { id: row.id, workspaceId, status: { in: ['PLANNED', 'PENDING'] } },
        data: {
          status: 'POSTED',
          actualAmountCents: plan.actualAmountCents,
          actualDate: fromDateOnly(plan.actualDate),
        },
      })
      if (updated.count !== 1) {
        throw conflict('This entry cannot be posted from its current status')
      }

      await applyBalanceDelta(tx, workspaceId, row.accountId, plan.balanceDelta)
      return {
        entryRef: req.entryRef,
        status: 'POSTED',
        varianceCents: plan.actualAmountCents - plan.estimatedAmountCents,
      }
    }

    const schedule = await loadOccurrence(tx, workspaceId, ref.scheduleId, ref.occurrenceDate)
    const plan = unwrap(
      planPost(
        {
          entryType: schedule.entryType,
          status: 'PLANNED',
          estimatedAmountCents: schedule.estimatedAmountCents,
        },
        input,
      ),
    )

    await createOccurrenceRecord(
      tx,
      workspaceId,
      buildOccurrenceRecord(schedule, ref.occurrenceDate, {
        status: 'POSTED',
        actualAmountCents: req.amountCents,
        actualDate: plan.actualDate,
      }),
    )
    await applyBalanceDelta(tx, workspaceId, schedule.accountId, plan.balanceDelta)
    return {
      entryRef: req.entryRef,
      status: 'POSTED',
      varianceCents: plan.actualAmountCents - plan.estimatedAmountCents,
    }
  })
}

// ---------------------------------------------------------------------------
// skipEntry
// ---------------------------------------------------------------------------

/**
 * No Submission_Key: the status guard (one-offs) and the occurrence unique key
 * make a repeat skip fail with CONFLICT instead of applying twice.
 */
export async function skipEntry(workspaceId: string, req: SkipRequest): Promise<SkipResult> {
  const ref = parseEntryRef(req.entryRef)

  return prisma.$transaction(async (tx) => {
    if (ref.kind === 'ONE_OFF') {
      const row = await tx.oneOffEntry.findFirst({ where: { id: ref.id, workspaceId } })
      if (!row) throw notFound('Entry not found')
      unwrap(planSkip({ status: row.status }))

      const updated = await tx.oneOffEntry.updateMany({
        where: { id: row.id, workspaceId, status: { in: ['PLANNED', 'PENDING'] } },
        data: { status: 'SKIPPED' },
      })
      if (updated.count !== 1) {
        throw conflict('This entry cannot be skipped from its current status')
      }
    } else {
      const schedule = await loadOccurrence(tx, workspaceId, ref.scheduleId, ref.occurrenceDate)
      unwrap(planSkip({ status: 'PLANNED' }))
      await createOccurrenceRecord(
        tx,
        workspaceId,
        buildOccurrenceRecord(schedule, ref.occurrenceDate, { status: 'SKIPPED' }),
      )
    }

    await touchWorkspace(tx, workspaceId)
    return { entryRef: req.entryRef, status: 'SKIPPED' as const }
  })
}

// ---------------------------------------------------------------------------
// addOneOff
// ---------------------------------------------------------------------------

export async function addOneOff(workspaceId: string, req: OneOffRequest): Promise<OneOffResult> {
  return runIdempotent<OneOffResult>(workspaceId, req.submissionKey, 'ONE_OFF', async (tx) => {
    const plan = unwrap(
      planOneOff({
        direction: req.direction,
        amountCents: req.amountCents,
        date: req.date,
        description: req.description,
        alreadyHappened: req.alreadyHappened,
        today: req.today,
      }),
    )

    const primary = await tx.account.findFirst({ where: { workspaceId, isPrimary: true } })
    if (!primary) throw notFound('Primary account not found')

    const description = req.description?.trim()
    const created = await tx.oneOffEntry.create({
      data: {
        workspaceId,
        accountId: primary.id,
        postDate: fromDateOnly(plan.postDate),
        estimatedAmountCents: plan.estimatedAmountCents,
        actualAmountCents: plan.actualAmountCents,
        actualDate: plan.actualDate ? fromDateOnly(plan.actualDate) : null,
        status: plan.status,
        entryType: plan.entryType,
        description: description ? description : null,
      },
    })

    if (plan.status === 'POSTED') {
      await applyBalanceDelta(tx, workspaceId, primary.id, plan.balanceDelta)
    }
    return { id: created.id, status: plan.status, entryType: plan.entryType }
  })
}

// ---------------------------------------------------------------------------
// Envelope, line item, and settings mutations (task 7.4)
// Amount fields are text; validate.ts parses them.
// ---------------------------------------------------------------------------

export type EnvelopeRequest = {
  name: string
  /** Dollar text, e.g. "250.00". */
  budgetText: string
  resetPeriod: string
}
export type EnvelopeResult = {
  id: string
  name: string
  budgetCents: number
  resetPeriod: 'EACH_PAY_CYCLE' | 'WEEKLY' | 'MONTHLY'
}

export type LineItemRequest = {
  envelopeId: string
  /** Dollar text, e.g. "12.34". */
  amountText: string
  purchaseDate: string
  description?: string
  today: string
  submissionKey: string
}
export type LineItemPatch = {
  amountText?: string
  purchaseDate?: string
  description?: string
  envelopeId?: string
  today: string
}
export type LineItemResult = {
  id: string
  envelopeId: string
  amountCents: number
  purchaseDate: string
  description: string | null
}

export type SettingsRequest = {
  /** Dollar text; empty string clears the threshold. */
  thresholdText: string
  horizonText: string
}
export type SettingsResult = {
  lowBalanceThresholdCents: number | null
  projectionHorizonDays: number
}

const NAME_IN_USE = 'That name is already in use'

function lineItemResult(row: {
  id: string
  envelopeId: string
  amountCents: number
  purchaseDate: Date
  description: string | null
}): LineItemResult {
  return {
    id: row.id,
    envelopeId: row.envelopeId,
    amountCents: row.amountCents,
    purchaseDate: toDateOnly(row.purchaseDate),
    description: row.description,
  }
}

async function primaryAccountId(tx: Tx, workspaceId: string): Promise<string> {
  const primary = await tx.account.findFirst({ where: { workspaceId, isPrimary: true } })
  if (!primary) throw notFound('Primary account not found')
  return primary.id
}

async function requireEnvelope(tx: Tx, workspaceId: string, id: string) {
  const env = await tx.envelope.findFirst({ where: { id, workspaceId } })
  if (!env) throw notFound('Envelope not found')
  return env
}

function isNameKeyViolation(e: unknown): boolean {
  if (!isUniqueViolation(e)) return false
  const target = (e as Prisma.PrismaClientKnownRequestError).meta?.target
  if (Array.isArray(target)) return target.includes('nameKey')
  if (typeof target === 'string') return target.toLowerCase().includes('namekey')
  return true
}

export async function createEnvelope(
  workspaceId: string,
  req: EnvelopeRequest,
): Promise<EnvelopeResult> {
  try {
    return await prisma.$transaction(async (tx) => {
      const others = await tx.envelope.findMany({ where: { workspaceId }, select: { name: true } })
      const v = unwrap(
        validateEnvelopeInput(req, others.map((o) => o.name)),
      )
      const created = await tx.envelope.create({
        data: {
          workspaceId,
          name: v.name,
          nameKey: v.nameKey,
          budgetCents: v.budgetCents,
          resetPeriod: v.resetPeriod,
        },
      })
      await touchWorkspace(tx, workspaceId)
      return {
        id: created.id,
        name: created.name,
        budgetCents: created.budgetCents,
        resetPeriod: created.resetPeriod,
      }
    })
  } catch (e) {
    if (isNameKeyViolation(e)) throw new ServiceError('CONFLICT', NAME_IN_USE, 'name')
    throw e
  }
}

export async function updateEnvelope(
  workspaceId: string,
  id: string,
  req: EnvelopeRequest,
): Promise<EnvelopeResult> {
  try {
    return await prisma.$transaction(async (tx) => {
      await requireEnvelope(tx, workspaceId, id)
      const others = await tx.envelope.findMany({
        where: { workspaceId, id: { not: id } },
        select: { name: true },
      })
      const v = unwrap(validateEnvelopeInput(req, others.map((o) => o.name)))
      const updated = await tx.envelope.update({
        where: { id },
        data: {
          name: v.name,
          nameKey: v.nameKey,
          budgetCents: v.budgetCents,
          resetPeriod: v.resetPeriod,
        },
      })
      await touchWorkspace(tx, workspaceId)
      return {
        id: updated.id,
        name: updated.name,
        budgetCents: updated.budgetCents,
        resetPeriod: updated.resetPeriod,
      }
    })
  } catch (e) {
    if (isNameKeyViolation(e)) throw new ServiceError('CONFLICT', NAME_IN_USE, 'name')
    throw e
  }
}

export async function createLineItem(
  workspaceId: string,
  req: LineItemRequest,
): Promise<LineItemResult> {
  return runIdempotent<LineItemResult>(workspaceId, req.submissionKey, 'PURCHASE', async (tx) => {
    const v = unwrap(
      validateLineItemInput(
        { amountText: req.amountText, purchaseDate: req.purchaseDate, description: req.description },
        req.today,
      ),
    )
    await requireEnvelope(tx, workspaceId, req.envelopeId)
    const accountId = await primaryAccountId(tx, workspaceId)

    const created = await tx.lineItem.create({
      data: {
        workspaceId,
        envelopeId: req.envelopeId,
        amountCents: v.amountCents,
        purchaseDate: fromDateOnly(v.purchaseDate),
        description: v.description,
      },
    })
    await applyBalanceDelta(
      tx,
      workspaceId,
      accountId,
      lineItemDelta({ kind: 'create', amountCents: v.amountCents }),
    )
    return lineItemResult(created)
  })
}

export async function updateLineItem(
  workspaceId: string,
  id: string,
  req: LineItemPatch,
): Promise<LineItemResult> {
  return prisma.$transaction(async (tx) => {
    const row = await tx.lineItem.findFirst({ where: { id, workspaceId } })
    if (!row) throw notFound('Line item not found')

    const v = unwrap(
      validateLineItemInput(
        {
          amountText: req.amountText ?? formatCentsPlain(row.amountCents),
          purchaseDate: req.purchaseDate ?? toDateOnly(row.purchaseDate),
          description: req.description !== undefined ? req.description : (row.description ?? ''),
        },
        req.today,
      ),
    )
    const envelopeId = req.envelopeId ?? row.envelopeId
    if (envelopeId !== row.envelopeId) await requireEnvelope(tx, workspaceId, envelopeId)
    const accountId = await primaryAccountId(tx, workspaceId)

    const updated = await tx.lineItem.update({
      where: { id: row.id },
      data: {
        envelopeId,
        amountCents: v.amountCents,
        purchaseDate: fromDateOnly(v.purchaseDate),
        description: v.description,
      },
    })
    if (v.amountCents !== row.amountCents) {
      await applyBalanceDelta(
        tx,
        workspaceId,
        accountId,
        lineItemDelta({ kind: 'edit', oldCents: row.amountCents, newCents: v.amountCents }),
      )
    }
    await touchWorkspace(tx, workspaceId)
    return lineItemResult(updated)
  })
}

export async function deleteLineItem(workspaceId: string, id: string): Promise<{ id: string }> {
  return prisma.$transaction(async (tx) => {
    const row = await tx.lineItem.findFirst({ where: { id, workspaceId } })
    if (!row) throw notFound('Line item not found')
    const accountId = await primaryAccountId(tx, workspaceId)

    // Guarded delete: a concurrent delete cannot refund twice.
    const removed = await tx.lineItem.deleteMany({ where: { id: row.id, workspaceId } })
    if (removed.count !== 1) throw notFound('Line item not found')
    await applyBalanceDelta(
      tx,
      workspaceId,
      accountId,
      lineItemDelta({ kind: 'delete', amountCents: row.amountCents }),
    )
    await touchWorkspace(tx, workspaceId)
    return { id: row.id }
  })
}

export async function saveSettings(
  workspaceId: string,
  req: SettingsRequest,
): Promise<SettingsResult> {
  const v = unwrap(validateSettings(req))
  return prisma.$transaction(async (tx) => {
    const updated = await tx.workspace.updateMany({
      where: { id: workspaceId },
      data: {
        lowBalanceThresholdCents: v.lowBalanceThresholdCents,
        projectionHorizonDays: v.projectionHorizonDays,
        lastActivity: new Date(),
      },
    })
    if (updated.count !== 1) throw notFound('Workspace not found')
    return v
  })
}
