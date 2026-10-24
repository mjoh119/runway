import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { projectCashFlow } from '@/lib/projection/engine'
import { addDays } from '@/lib/projection/dates'
import { fetchHolidays } from '@/lib/holidays/fetch'
import { calendarYearsTouched } from '@/lib/holidays/years'
import { resolveWorkspace } from '@/lib/workspace'
import type { ProjectionResponse } from '@/lib/projection-response'
import type { Account, AccountDataSource } from '@/sources/interface'

export const dynamic = 'force-dynamic'

// Prisma @db.Date values are UTC-midnight Dates, so toISOString().split('T')[0]
// yields the stored calendar date (no timezone drift).
const toDateOnly = (d: Date): string => d.toISOString().split('T')[0]

// Spec 1: accounts come from DB rows that were seeded from FakeSource.
// Exposed through AccountDataSource so the route reads accounts via the boundary.
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

/** Strict YYYY-MM-DD check that also rejects impossible calendar dates (e.g. 2025-02-30). */
function isValidDate(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  try {
    return addDays(value, 0) === value
  } catch {
    return false
  }
}

// Range the projection can touch: 7 days back (income near Jan 1 can shift backward across a
// year boundary); forward up to 732 days (next income <= 366 days away plus one full cycle
// <= 366 days); later one-off dates extend the range; +7 days of shift slack.
const MAX_PROJECTION_SPAN_DAYS = 732

export async function GET(request: NextRequest) {
  const today = new URL(request.url).searchParams.get('today')
  if (!isValidDate(today)) {
    return NextResponse.json(
      { error: 'Invalid date format. Expected a valid YYYY-MM-DD date.' },
      { status: 400 },
    )
  }

  try {
    const { workspace, setCookie } = await resolveWorkspace(request, today)

    const [accounts, schedules, oneOffEntries] = await Promise.all([
      new WorkspaceDbSource(workspace.id).getAccounts(),
      prisma.schedule.findMany({ where: { workspaceId: workspace.id } }),
      prisma.oneOffEntry.findMany({ where: { workspaceId: workspace.id } }),
    ])

    const latestKnownDate = oneOffEntries.reduce((max, e) => {
      const d = toDateOnly(e.holdReleaseDate ?? e.postDate)
      return d > max ? d : max
    }, addDays(today, MAX_PROJECTION_SPAN_DAYS))
    const years = calendarYearsTouched(addDays(today, -7), addDays(latestKnownDate, 7))
    const holidays = (await Promise.all(years.map((y) => fetchHolidays(y)))).flat()

    const projection = projectCashFlow({
      accounts: accounts.map((a) => ({
        id: a.id,
        isPrimary: a.isPrimary,
        ledgerBalanceCents: a.ledgerBalanceCents,
        availableBalanceCents: a.availableBalanceCents,
      })),
      schedules: schedules.map((s) => ({
        id: s.id,
        name: s.name,
        accountId: s.accountId,
        intervalType: s.intervalType,
        intervalValue: s.intervalValue,
        daysOfMonth: s.daysOfMonth,
        startDate: toDateOnly(s.startDate),
        estimatedAmountCents: s.estimatedAmountCents,
        entryType: s.entryType,
      })),
      oneOffEntries: oneOffEntries.map((e) => ({
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
      })),
      holidays,
      currentDate: today,
      projectionHorizonDays: workspace.projectionHorizonDays,
      lowBalanceThresholdCents: workspace.lowBalanceThresholdCents,
    })

    await prisma.workspace.update({
      where: { id: workspace.id },
      data: { lastActivity: new Date() },
    })

    // Additive echo of workspace settings so the UI can draw the threshold band even when no warning fired.
    const body: ProjectionResponse = {
      ...projection,
      settings: { lowBalanceThresholdCents: workspace.lowBalanceThresholdCents },
    }
    const response = NextResponse.json(body)
    if (setCookie) response.headers.append('Set-Cookie', setCookie)
    return response
  } catch (error) {
    console.error('Projection error:', error)
    return NextResponse.json(
      { error: 'Projection failed. Please try again.' },
      { status: 500 },
    )
  }
}
