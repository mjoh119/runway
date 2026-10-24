import { prisma } from '@/lib/db'
import { projectCashFlow } from '@/lib/projection/engine'
import { addDays } from '@/lib/projection/dates'
import { computeCumulativeVariance } from '@/lib/projection/variance'
import { fetchHolidays } from '@/lib/holidays/fetch'
import { calendarYearsTouched } from '@/lib/holidays/years'
import { resolveWorkspace, type WorkspaceRequest } from '@/lib/workspace'
import { collectScheduledIncomeDates } from '@/lib/envelopes/income-dates'
import { periodContaining } from '@/lib/envelopes/period'
import { computeEnvelopeTotals } from '@/lib/envelopes/totals'
import { buildEnvelopeCommitments } from '@/lib/envelopes/commitments'
import { buildEnvelopeCardView, type EnvelopeCardView } from '@/lib/envelopes/view-model'
import type { LineItemLike } from '@/lib/envelopes/types'
import type { Entry } from '@/lib/projection/types'
import type { ProjectionResponse } from '@/lib/projection-response'
import type { Account, AccountDataSource } from '@/sources/interface'

// Prisma @db.Date values are UTC-midnight Dates, so toISOString().split('T')[0]
// yields the stored calendar date (no timezone drift).
const toDateOnly = (d: Date): string => d.toISOString().split('T')[0]

// Range the projection can touch: 7 days back (income near Jan 1 can shift backward across a
// year boundary); forward up to 732 days (next income <= 366 days away plus one full cycle
// <= 366 days); later one-off dates extend the range; +7 days of shift slack.
const MAX_PROJECTION_SPAN_DAYS = 732

// Lookback / lookahead for scheduled-income dates used by envelope periods. Covers the
// preceding period of the longest allowed cycle (366 days) with margin.
const INCOME_WINDOW_DAYS = 800
// Holiday coverage starts here so lookback income dates shift correctly.
const HOLIDAY_LOOKBACK_DAYS = INCOME_WINDOW_DAYS + 7

// Spec 1: accounts come from DB rows that were seeded from FakeSource.
// Exposed through AccountDataSource so reads go through the boundary.
// The class lives here (not in src/sources) so source files never import workspace/DB state.
class WorkspaceDbSource implements AccountDataSource {
  constructor(private readonly workspaceId: string) {}

  async getAccounts(): Promise<Account[]> {
    const rows = await prisma.account.findMany({ where: { workspaceId: this.workspaceId } })
    return rows.map((a) => ({
      id: a.id,
      name: a.name,
      type: a.type,
      isPrimary: a.isPrimary,
      ledgerBalanceCents: a.ledgerBalanceCents,
      availableBalanceCents: a.availableBalanceCents,
    }))
  }

  async syncTransactions(cursor?: string) {
    return { added: [], modified: [], removed: [], nextCursor: cursor ?? '' }
  }
}

/** Everything a read endpoint needs: the projection response plus envelope cards. */
export interface WorkspaceView {
  /** Spec 1 response plus `variance` and `settings.projectionHorizonDays`. */
  projection: ProjectionResponse
  /** One card per envelope, for the current period. */
  envelopes: EnvelopeCardView[]
}

export interface BuildWorkspaceViewResult {
  view: WorkspaceView
  /** Set-Cookie header value when a new workspace was created, else null. */
  setCookie: string | null
}

/**
 * Resolves the workspace, loads its data, and runs the pure modules in order:
 * collectScheduledIncomeDates, periodContaining, computeEnvelopeTotals,
 * buildEnvelopeCommitments, projectCashFlow, computeCumulativeVariance.
 * `today` must be a valid YYYY-MM-DD date (callers validate).
 */
export async function buildWorkspaceView(
  request: WorkspaceRequest,
  today: string,
): Promise<BuildWorkspaceViewResult> {
  const { workspace, setCookie } = await resolveWorkspace(request, today)
  const where = { workspaceId: workspace.id }

  const [accounts, schedules, oneOffEntries, envelopes, lineItems, recordRows] = await Promise.all([
    new WorkspaceDbSource(workspace.id).getAccounts(),
    prisma.schedule.findMany({ where }),
    prisma.oneOffEntry.findMany({ where }),
    prisma.envelope.findMany({ where }),
    prisma.lineItem.findMany({ where }),
    prisma.occurrenceRecord.findMany({ where }),
  ])

  const latestKnownDate = oneOffEntries.reduce((max, e) => {
    const d = toDateOnly(e.holdReleaseDate ?? e.postDate)
    return d > max ? d : max
  }, addDays(today, MAX_PROJECTION_SPAN_DAYS))
  const years = calendarYearsTouched(addDays(today, -HOLIDAY_LOOKBACK_DAYS), addDays(latestKnownDate, 7))
  const holidays = (await Promise.all(years.map((y) => fetchHolidays(y)))).flat()

  const engineSchedules = schedules.map((s) => ({
    id: s.id,
    name: s.name,
    accountId: s.accountId,
    intervalType: s.intervalType,
    intervalValue: s.intervalValue,
    daysOfMonth: s.daysOfMonth,
    startDate: toDateOnly(s.startDate),
    estimatedAmountCents: s.estimatedAmountCents,
    entryType: s.entryType,
  }))
  const scheduleNames = new Map(schedules.map((s) => [s.id, s.name]))

  const engineOneOffs: Entry[] = oneOffEntries.map((e) => ({
    id: e.id,
    accountId: e.accountId,
    scheduleId: null,
    postDate: toDateOnly(e.postDate),
    shiftedPostDate: toDateOnly(e.postDate), // recomputed in the engine
    estimatedAmountCents: e.estimatedAmountCents,
    actualAmountCents: e.actualAmountCents,
    status: e.status,
    entryType: e.entryType,
    holdReleaseDate: e.holdReleaseDate ? toDateOnly(e.holdReleaseDate) : undefined,
    isHoldEstimated: e.isHoldEstimated,
    description: e.description ?? undefined,
    actualDate: e.actualDate ? toDateOnly(e.actualDate) : undefined,
  }))

  const records: Entry[] = recordRows.map((r) => {
    const occurrenceDate = toDateOnly(r.occurrenceDate)
    return {
      id: `${r.scheduleId}:${occurrenceDate}`,
      accountId: r.accountId,
      scheduleId: r.scheduleId,
      postDate: occurrenceDate,
      shiftedPostDate: occurrenceDate, // recomputed in the engine
      estimatedAmountCents: r.estimatedAmountCents,
      actualAmountCents: r.actualAmountCents,
      status: r.status,
      entryType: r.entryType,
      description: r.description ?? scheduleNames.get(r.scheduleId),
      actualDate: r.actualDate ? toDateOnly(r.actualDate) : undefined,
    }
  })

  // 1. Scheduled-income dates (lookback + generation window).
  const incomeDates = collectScheduledIncomeDates({
    schedules: engineSchedules,
    occurrenceRecords: records,
    holidays,
    from: addDays(today, -INCOME_WINDOW_DAYS),
    to: addDays(today, INCOME_WINDOW_DAYS),
  })

  // 2. Envelope periods and totals.
  const lineItemsByEnvelope = new Map<string, LineItemLike[]>()
  for (const li of lineItems) {
    const list = lineItemsByEnvelope.get(li.envelopeId) ?? []
    list.push({
      id: li.id,
      amountCents: li.amountCents,
      purchaseDate: toDateOnly(li.purchaseDate),
      description: li.description,
    })
    lineItemsByEnvelope.set(li.envelopeId, list)
  }
  const envelopeInputs = envelopes.map((e) => ({
    id: e.id,
    name: e.name,
    resetPeriod: e.resetPeriod,
    budgetCents: e.budgetCents,
    lineItems: lineItemsByEnvelope.get(e.id) ?? [],
  }))
  const envelopeTotals = envelopeInputs.map((e) => {
    const period = periodContaining(e.resetPeriod, today, incomeDates, today)
    const totals = computeEnvelopeTotals(e.budgetCents, e.lineItems, period)
    return { id: e.id, name: e.name, period, leftCents: totals.leftCents }
  })

  // 3. Commitments (recomputed per request, never stored).
  const envelopeCommitments = buildEnvelopeCommitments(envelopeTotals, today)

  // 4. Projection.
  const projection = projectCashFlow({
    accounts: accounts.map((a) => ({
      id: a.id,
      isPrimary: a.isPrimary,
      ledgerBalanceCents: a.ledgerBalanceCents,
      availableBalanceCents: a.availableBalanceCents,
    })),
    schedules: engineSchedules,
    oneOffEntries: engineOneOffs,
    holidays,
    currentDate: today,
    projectionHorizonDays: workspace.projectionHorizonDays,
    lowBalanceThresholdCents: workspace.lowBalanceThresholdCents,
    occurrenceRecords: records,
    envelopeCommitments,
  })

  // 5. Cumulative variance over the current pay cycle.
  const currentCycle = projection.payCycles[0]
  const variance: ProjectionResponse['variance'] = currentCycle
    ? {
        cycle: { startDate: currentCycle.startDate, endDate: currentCycle.endDate },
        ...computeCumulativeVariance([...records, ...engineOneOffs], currentCycle),
      }
    : null

  await prisma.workspace.update({
    where: { id: workspace.id },
    data: { lastActivity: new Date() },
  })

  const response: ProjectionResponse = {
    ...projection,
    // Additive echo of workspace settings so the UI can draw the threshold band even when no warning fired.
    settings: {
      lowBalanceThresholdCents: workspace.lowBalanceThresholdCents,
      projectionHorizonDays: workspace.projectionHorizonDays,
    },
    variance,
  }

  const envelopeCards = envelopeInputs.map((e) =>
    buildEnvelopeCardView({
      envelope: { id: e.id, name: e.name, resetPeriod: e.resetPeriod, budgetCents: e.budgetCents },
      lineItems: e.lineItems,
      incomeDates,
      today,
    }),
  )

  return { view: { projection: response, envelopes: envelopeCards }, setCookie }
}
