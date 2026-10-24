# Implementation Plan: Projection Engine and Cycle View

## Overview

The repo has no application code yet, so this plan scaffolds Next.js (App Router) + TypeScript, Tailwind, shadcn/ui, Prisma + Postgres, Vitest and fast-check first. It then builds the pure projection engine test-first, then the FakeSource demo data and its two required demo tests, then persistence (workspaces, cookie, seeding, reset), then the holiday fetch, API route and cron cleanup, then the cycle view UI. All code is TypeScript, as used in the design. Money is integer cents everywhere. Dates are `'YYYY-MM-DD'` strings, with UTC-only weekday math.

Scope is Spec 1 only: no envelopes, variance, transfers, schedule/account editing UI, or Plaid.

## Tasks

- [x] 1. Scaffold the project and test tooling
  - [x] 1.1 Scaffold Next.js, Tailwind, shadcn/ui, Prisma and the folder layout
    - Create the Next.js App Router + TypeScript app in the repo root with the `@/` alias to `src/`
    - Add Tailwind CSS and initialize shadcn/ui (add the card, alert and button components the UI will need)
    - Install `recharts`, `prisma` and `@prisma/client` with exact pinned versions
    - Create the folders from structure.md: `src/lib/projection`, `src/lib/holidays`, `src/sources`, `src/components`, `prisma`, `__tests__`
    - Add `.env.example` with `DATABASE_URL` and `CRON_SECRET` placeholders; confirm `.env*` is git-ignored
    - Keep the existing `docs/` and `.kiro/` directories untouched
    - _Requirements: 3.1, 14.2_

  - [x] 1.2 Configure Vitest and fast-check
    - Add `vitest`, `@vitest/coverage-v8` and `fast-check` as exact-pinned dev dependencies
    - Create `vitest.config.ts` (node environment, globals, `@/` alias, coverage over `src/lib/projection/**` and `src/lib/holidays/**`)
    - Add npm scripts: `"test": "vitest --run"` and `"test:coverage": "vitest --run --coverage"`; no watch-mode script
    - Add one trivial smoke test under `__tests__/` to confirm the runner works
    - _Requirements: 14.1_

- [x] 2. Build the pure engine foundations
  - [x] 2.1 Implement `src/lib/projection/dates.ts`
    - Pure UTC date-only helpers on `'YYYY-MM-DD'` strings: `addDays(date, n)`, `dayOfWeek(date)` (0 = Sunday, via `Date.UTC` + `getUTCDay`), `daysInMonth(year, month)`
    - Never use local-time `Date` arithmetic or `toISOString()` on local dates
    - _Requirements: 14.1, 14.3_

  - [x] 2.2 Implement domain types in `src/lib/projection/types.ts`
    - Define `EntryDirection`, `Schedule`, `Entry`, `ProjectionInput`, `ProjectedBalance`, `RunwayResult`, `PayCycle`, `ProjectionOutput` as in the design
    - All money fields are `number` documented as integer cents; all dates are `'YYYY-MM-DD'` strings
    - _Requirements: 3.1, 3.2, 14.3_

  - [x] 2.3 Implement `src/lib/format.ts`
    - `formatCents(cents)` using integer math only (no floats), returning e.g. `$130.00`, plus a whole-dollar variant for reason lines (e.g. `$60`)
    - `formatMonthDay('2026-03-12')` returning `Mar 12` from a fixed month-name table (no locale dependence)
    - Pure and importable by both the engine and the UI
    - _Requirements: 3.2, 13.2, 13.4_

  - [x] 2.4 Implement `src/lib/projection/shift.ts`
    - `isBusinessDay(date, holidays)`: not Saturday, not Sunday, not in the holiday list
    - `shiftDate(date, direction, holidays)`: DEBIT moves to the next business day, INCOME to the prior business day, skipping consecutive non-business days; business days return unchanged
    - Re-export both from `engine.ts` later so the design's import paths work
    - _Requirements: 7.1, 7.2, 7.3, 7.5, 7.6, 7.7_

  - [x] 2.5 Implement `src/lib/holidays/generator.ts` and `src/lib/holidays/years.ts`
    - `generateFederalHolidays(year)` returns the 11 Federal Reserve holidays with Sunday-to-Monday observance and no Friday closure for Saturday holidays
    - Export a pure `applyObservanceRules(isoDate)` that `fetch.ts` will reuse for Nager.Date results
    - `calendarYearsTouched(startDate, endDate)` lists every calendar year in the inclusive range
    - No I/O in either file
    - _Requirements: 8.3, 8.4, 8.5, 8.6_

  - [x] 2.6 Write unit tests for date helpers and formatting
    - Cover `addDays` across month and year boundaries and leap years, `dayOfWeek`, `daysInMonth`, `formatCents` (negative, zero, whole-dollar variant) and `formatMonthDay`
    - _Requirements: 3.2, 14.1_

  - [x] 2.7 Write unit tests for holiday generation, observance and years
    - Saturday vs Sunday observance: 2027-07-04 (Sunday) becomes 2027-07-05; 2026-07-04 (Saturday) stays 2026-07-04
    - `generateFederalHolidays(year)` returns exactly 11 dates for several years
    - `calendarYearsTouched` spans a year boundary, multiple years, and a single year
    - _Requirements: 8.3, 8.4, 8.5_

  - [x] 2.8 Write property test for business day definition
    - **Property 24: Business day definition**
    - **Validates: Requirements 7.6**
    - File: `__tests__/projection/properties/p24-business-day.test.ts`; date arbitrary spans 2020 to 2030, `numRuns: 100`, holidays built with neighbouring years

  - [x] 2.9 Write property test for business day shift identity
    - **Property 25: Business day shift is identity**
    - **Validates: Requirements 7.7**
    - File: `__tests__/projection/properties/p25-shift-identity.test.ts`

  - [x] 2.10 Write property test for debit forward shifting
    - **Property 21: Debit forward shifting**
    - **Validates: Requirements 7.2**
    - File: `__tests__/projection/properties/p21-debit-shift.test.ts`

  - [x] 2.11 Write property test for income backward shifting
    - **Property 22: Income backward shifting**
    - **Validates: Requirements 7.3**
    - File: `__tests__/projection/properties/p22-income-shift.test.ts`

  - [x] 2.12 Write property test that both dates are preserved
    - **Property 23: Both dates preserved**
    - **Validates: Requirements 7.4**
    - File: `__tests__/projection/properties/p23-both-dates.test.ts`; asserts generated entries keep `postDate` and `shiftedPostDate`, including when they are equal

  - [x] 2.13 Write property test for Sunday holiday observance
    - **Property 26: Sunday holiday observance**
    - **Validates: Requirements 8.3**
    - File: `__tests__/holidays/properties/p26-sunday-observance.test.ts`

  - [x] 2.14 Write property test for Saturday holiday not observed on Friday
    - **Property 27: Saturday holiday not observed Friday**
    - **Validates: Requirements 8.4**
    - File: `__tests__/holidays/properties/p27-saturday-observance.test.ts`

- [x] 3. Implement entry generation and pay cycles
  - [x] 3.1 Implement entry generation in `src/lib/projection/engine.ts`
    - `clampDayOfMonth(year, month, day)` and `generateEntries(schedule, startDate, endDate, holidays)`
    - Support every N days (1 to 365), N weeks (1 to 52), N months (1 to 12), and chosen days of the month (1 to 31)
    - Clamp days 29 to 31 to the month's last day before business-day shifting; compute `shiftedPostDate` with `shiftDate`
    - Generated entries have status PLANNED, an integer-cent estimate, no actual, and ids derived from schedule id + post date
    - `validateSchedule(schedule)` throws a descriptive error for zero, negative or out-of-bounds N; `generateEntries` calls it
    - Re-export `shiftDate` and `isBusinessDay` from this file
    - _Requirements: 4.1, 4.2, 4.4, 4.5, 4.6, 7.4_

  - [x] 3.2 Write unit tests for month-end clamping
    - Day 31 in non-leap February (28), leap February (29), April (30), January (31 unchanged)
    - Also check a day-31 schedule generates the clamped date before shifting
    - _Requirements: 4.4_

  - [x] 3.3 Write property test for entry generation bounds
    - **Property 8: Entry generation within bounds**
    - **Validates: Requirements 4.2**
    - File: `__tests__/projection/properties/p08-generation-bounds.test.ts`

  - [x] 3.4 Write property test for month-end clamping
    - **Property 9: Month-end clamping**
    - **Validates: Requirements 4.4**
    - File: `__tests__/projection/properties/p09-month-end-clamp.test.ts`

  - [x] 3.5 Write property test for generated entry defaults
    - **Property 10: Generated entry defaults**
    - **Validates: Requirements 4.5**
    - File: `__tests__/projection/properties/p10-entry-defaults.test.ts`

  - [x] 3.6 Write property test for invalid interval rejection
    - **Property 11: Invalid interval rejection**
    - **Validates: Requirements 4.6**
    - File: `__tests__/projection/properties/p11-invalid-interval.test.ts`

  - [x] 3.7 Implement pay-cycle boundaries in `src/lib/projection/cycle.ts`
    - `computePayCycles(entries, currentDate, projectionEndDate)`: a cycle runs from one INCOME entry's shifted date to the day before the next
    - Scheduled and one-off income both create boundaries; a mid-cycle one-off income splits the cycle
    - The first cycle starts at `currentDate` when no income has posted on or before it
    - With no future income, the single cycle ends at the projection end date
    - Re-export from `engine.ts` as the design's import paths expect
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [x] 3.8 Write unit test for the three-paycheck month
    - Biweekly income on 2026-01-02, 01-16, 01-30 and 02-13 yields three cycles: 01-02 to 01-15, 01-16 to 01-29, 01-30 to 02-12
    - _Requirements: 5.1, 5.3_

  - [x] 3.9 Write property test for pay cycle boundaries
    - **Property 12: Pay cycle boundaries from income**
    - **Validates: Requirements 5.1, 5.5**
    - File: `__tests__/projection/properties/p12-cycle-boundaries.test.ts`

  - [x] 3.10 Write property test for horizon-based projection end
    - **Property 13: Horizon-based projection end**
    - **Validates: Requirements 5.2**
    - File: `__tests__/projection/properties/p13-horizon-end.test.ts`

  - [x] 3.11 Write property test that mid-cycle income splits a cycle
    - **Property 14: Mid-cycle income splits cycle**
    - **Validates: Requirements 5.4**
    - File: `__tests__/projection/properties/p14-cycle-split.test.ts`

- [ ] 4. Implement balance projection, runway, warnings and the orchestrator
  - [x] 4.1 Implement balance projection and available-balance estimation in `engine.ts`
    - `projectBalances(startingLedger, startingAvailable, entries, startDate, endDate)` returns one row per day, inclusive
    - Starting balances already include posted, pending and held items; apply only future events:
      - Planned debit: subtract from both on the shifted date
      - Planned deposit without hold: add to both on the shifted date
      - Planned deposit with hold: ledger on the shifted date, available on `holdReleaseDate` (hold dates are not business-day shifted)
      - Posted deposit still on hold: available only, on `holdReleaseDate`
      - Pending debit: ledger only, on its expected post date
      - Posted entries otherwise ignored; skipped entries ignored
      - Overdue planned entries without an actual: apply the estimate to both at the start date
    - `estimateAvailableBalance(ledger, entries)` = ledger minus pending debits minus deposits on hold; projected rows set `isEstimated` when the source available balance was null
    - Input arrays are never mutated
    - _Requirements: 3.6, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 11.1, 11.2, 11.3, 12.1_

  - [x] 4.2 Write unit test for pending debit posting (ledger only)
    - Start ledger 100000, available 98000, pending -2000 expected 2026-01-05: ledger drops to 98000 on 01-05, available unchanged throughout
    - File: `__tests__/projection/pending-debit.test.ts`
    - _Requirements: 6.8_

  - [x] 4.3 Write unit tests for held deposit release
    - Planned deposit with hold: ledger +50000 on 01-05, available +50000 on 01-10
    - Posted-but-held $40 deposit: available +4000 on 01-08, ledger unchanged
    - File: `__tests__/projection/held-deposit.test.ts`
    - _Requirements: 6.6, 6.7_

  - [x] 4.4 Write unit test for null available balance estimation
    - Ledger 200000, pending debit -5000, posted deposit 30000 held: estimate is 165000
    - Also assert `isEstimated` is true on projected rows when the source value is null
    - File: `__tests__/projection/estimate-available.test.ts`
    - _Requirements: 11.1, 11.2, 11.3_

  - [x] 4.5 Write unit test for overdue planned entries
    - Planned -12000 dated before the start date with no actual is applied to both balances on the start date
    - File: `__tests__/projection/overdue-balance.test.ts`
    - _Requirements: 12.1_

  - [x] 4.6 Write property test for daily balance rows
    - **Property 15: Daily balance projection**
    - **Validates: Requirements 6.1**
    - File: `__tests__/projection/properties/p15-daily-rows.test.ts`

  - [x] 4.7 Write property test that posted entries are not double-applied
    - **Property 16: Posted entries not double-applied**
    - **Validates: Requirements 6.3, 6.7**
    - File: `__tests__/projection/properties/p16-posted-not-doubled.test.ts`

  - [x] 4.8 Write property test for debits decreasing both balances
    - **Property 17: Debit decreases both balances**
    - **Validates: Requirements 6.4**
    - File: `__tests__/projection/properties/p17-debit-both.test.ts`

  - [x] 4.9 Write property test for simple deposits
    - **Property 18: Simple deposit increases both balances**
    - **Validates: Requirements 6.5**
    - File: `__tests__/projection/properties/p18-simple-deposit.test.ts`

  - [x] 4.10 Write property test for held deposit split
    - **Property 19: Held deposit splits into ledger and available**
    - **Validates: Requirements 6.6**
    - File: `__tests__/projection/properties/p19-held-deposit.test.ts`

  - [x] 4.11 Write property test for estimated hold labeling
    - **Property 20: Hold date estimation labeled**
    - **Validates: Requirements 6.9**
    - File: `__tests__/projection/properties/p20-hold-estimated.test.ts`

  - [x] 4.12 Write property test for available balance estimation
    - **Property 35: Available balance estimation**
    - **Validates: Requirements 11.1, 11.3**
    - File: `__tests__/projection/properties/p35-estimate-formula.test.ts`

  - [x] 4.13 Write property test for estimated balance labeling
    - **Property 36: Estimated balance labeled**
    - **Validates: Requirements 11.2**
    - File: `__tests__/projection/properties/p36-estimated-label.test.ts`

  - [x] 4.14 Write property test for overdue entry application
    - **Property 37: Overdue entry application**
    - **Validates: Requirements 12.1**
    - File: `__tests__/projection/properties/p37-overdue-applied.test.ts`

  - [x] 4.15 Implement runway in `src/lib/projection/runway.ts`
    - `computeRunway(balances, nextIncomeDate, projectionEndDate)`: lowest available balance from the start up to but excluding the next income's shifted date, or within the horizon when there is none
    - Ties resolve to the earliest date; set `isBeforePayday` accordingly
    - Returns null when there is no primary account (handled by the orchestrator passing no balances)
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

  - [x] 4.16 Write unit test for runway tie-breaking
    - Balances 20000, 10000, 10000, 30000 with next income on 01-20: lowest is 10000 on the earlier date
    - File: `__tests__/projection/runway-ties.test.ts`
    - _Requirements: 9.3_

  - [x] 4.17 Write property test for runway before income
    - **Property 28: Runway before income**
    - **Validates: Requirements 9.1, 9.2**
    - File: `__tests__/projection/properties/p28-runway-before-income.test.ts`

  - [x] 4.18 Write property test for runway tie-breaking
    - **Property 29: Runway tie-breaking**
    - **Validates: Requirements 9.3**
    - File: `__tests__/projection/properties/p29-runway-ties.test.ts`

  - [x] 4.19 Write property test for runway within horizon
    - **Property 30: Runway within horizon**
    - **Validates: Requirements 9.4**
    - File: `__tests__/projection/properties/p30-runway-horizon.test.ts`

  - [x] 4.20 Write property test for runway on the primary account
    - **Property 7: Runway computed on primary account**
    - **Validates: Requirements 3.5, 3.6**
    - File: `__tests__/projection/properties/p07-runway-primary.test.ts`; runs through `projectCashFlow` with several accounts, and also covers the null-runway case when no primary account exists (Req 9.6)
    - _Requirements: 3.5, 3.6, 9.6_

  - [x] 4.21 Implement warnings in `src/lib/projection/warnings.ts`
    - `buildWarnings(...)` returns `belowThreshold` when a threshold is set and runway is below it, or whenever runway is negative regardless of threshold; omit otherwise
    - `overdueEntries`: planned entries before the start date with no actual
    - `availableBalanceDifference.reason`: one line naming the cause, e.g. `$60 pending debit and $40 deposit on hold until Mar 12`, built with `format.ts`; omitted when ledger equals available
    - _Requirements: 10.1, 10.2, 10.4, 12.2, 13.4_

  - [x] 4.22 Write property test for threshold warning
    - **Property 31: Threshold warning display**
    - **Validates: Requirements 10.1**
    - File: `__tests__/projection/properties/p31-threshold-warning.test.ts`

  - [x] 4.23 Write property test for negative runway warning
    - **Property 32: Negative runway warning**
    - **Validates: Requirements 10.2**
    - File: `__tests__/projection/properties/p32-negative-warning.test.ts`

  - [x] 4.24 Write property test for no warning without a trigger
    - **Property 34: No warning without trigger**
    - **Validates: Requirements 10.4**
    - File: `__tests__/projection/properties/p34-no-warning.test.ts`

  - [x] 4.25 Write property test for overdue entry flagging
    - **Property 38: Overdue entry flagging**
    - **Validates: Requirements 12.2**
    - File: `__tests__/projection/properties/p38-overdue-flag.test.ts`

  - [x] 4.26 Implement the `projectCashFlow` orchestrator in `engine.ts`
    - Follow the design's order of operations: projection end date (next income's shifted date plus one full cycle, else `currentDate + horizon`), generate entries, merge one-offs, shift dates, pay cycles, estimate available when null, project balances on the primary account, runway, warnings, upcoming entries
    - `upcomingEntries` are entries with shifted date on or after `currentDate`, sorted ascending by shifted date
    - Validate inputs: end before start throws; no primary account returns null runway; empty holiday list is allowed; horizon bounded 1 to 365
    - Must not mutate its input
    - _Requirements: 3.5, 3.6, 5.2, 9.5, 9.6, 13.3, 14.1, 14.2, 14.3_

  - [x] 4.27 Write property test for upcoming entries ordering
    - **Property 39: Upcoming entries ordering**
    - **Validates: Requirements 13.3**
    - File: `__tests__/projection/properties/p39-upcoming-order.test.ts`

- [x] 5. Checkpoint - Ensure the engine tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Build FakeSource and demo data
  - [x] 6.1 Implement `src/sources/interface.ts`, `src/sources/fake-source.ts` and the test helper
    - `interface.ts`: `Account`, `Transaction` (with optional `holdReleaseDate`) and `AccountDataSource` as in the design
    - `fake-source.ts`: `FakeSource` returning identical accounts on every call and an empty sync result; `generateDemoData(currentDate)` with every offset exactly as in the design (paycheck schedule start -1, overdue phone bill -5, posted held deposit -1 releasing +1, pending grocery +1, rent +1, electric +2, weekend debit on the next Saturday, threshold $200, horizon 30)
    - `__tests__/helpers/demo.ts`: `holidaysAround(year)` and `run(today)` that builds the `ProjectionInput` from `generateDemoData` and calls `projectCashFlow`
    - _Requirements: 2.3, 2.4, 2.5, 2.6, 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 15.7, 15.8_

  - [x] 6.2 Write the exact-value demo projection test for 2026-03-11
    - Assert the hand-computed values from the design: runway 13000 on 2026-03-16 with `isBeforePayday` true; below-threshold warning; balances for 03-11, 03-12, 03-13, 03-15, 03-16, 03-23, 03-24; weekend debit shifted from 03-14 to 03-16; overdue entry `entry-phone-overdue`; reason line `$60 pending debit and $40 deposit on hold until Mar 12`; pay cycles 03-11 to 03-23 and 03-24 to 04-06
    - File: `__tests__/projection/demo-exact.test.ts`
    - _Requirements: 15.2, 15.3, 15.4, 15.5, 15.7, 9.1, 9.3, 10.1, 13.4_

  - [x] 6.3 Write the full-year demo guarantees test
    - For every day of 2026 and 2028, assert: threshold warning present, runway 13000 before payday, ledger minus available is 10000 on day one, reason names the pending debit and deposit on hold, a pending debit exists, at least one entry is shifted, exactly one overdue entry (`entry-phone-overdue`)
    - Build dates with `addDays`; include the date in every assertion message
    - File: `__tests__/projection/demo-full-year.test.ts`
    - _Requirements: 15.2, 15.3, 15.4, 15.5, 15.6, 15.7, 15.8_

  - [x] 6.4 Write property test for FakeSource determinism
    - **Property 3: FakeSource determinism**
    - **Validates: Requirements 2.4**
    - File: `__tests__/sources/properties/p03-fake-determinism.test.ts`

  - [x] 6.5 Write property test for demo data relative dates
    - **Property 41: Demo data relative dates**
    - **Validates: Requirements 15.8**
    - File: `__tests__/sources/properties/p41-demo-relative.test.ts`

  - [x] 6.6 Write property test for projection purity
    - **Property 40: Projection purity**
    - **Validates: Requirements 14.1**
    - File: `__tests__/projection/properties/p40-purity.test.ts`; also asserts the input is deep-equal to a `structuredClone` taken beforehand

  - [x] 6.7 Write property test for integer-cent money
    - **Property 4: Integer cents representation**
    - **Validates: Requirements 3.1**
    - File: `__tests__/projection/properties/p04-integer-cents.test.ts`; every money field in demo projections is an integer

- [x] 7. Implement persistence, workspaces and reset
  - [x] 7.1 Create the Prisma schema, migration and client singleton
    - `prisma/schema.prisma` with `Workspace`, `Account`, `Schedule`, `OneOffEntry` and the enums, exactly as in the design: `workspaceId` on every model, `onDelete: Cascade`, `@db.Date` for `startDate`, `postDate` and `holdReleaseDate`, integer-cent columns, the listed indexes and unique constraint
    - Generate the client and the initial migration; add `src/lib/db.ts` Prisma singleton
    - _Requirements: 1.3, 3.1, 3.3, 3.4_

  - [x] 7.2 Implement `src/lib/workspace-settings.ts` validation
    - Validate `lowBalanceThresholdCents` as an integer from 0 to 999,999,999 and `projectionHorizonDays` as an integer from 1 to 365; throw descriptive errors otherwise
    - _Requirements: 5.2, 10.3_

  - [x] 7.3 Implement workspace seeding
    - `src/lib/seed-workspace.ts`: `seedWorkspace(workspaceId, today)` writes the `generateDemoData(today)` accounts, schedules, one-off entries and settings in one Prisma transaction that rolls back on error
    - Exactly one primary account; null available balances are stored as null
    - `prisma/seed.ts` is a thin CLI wrapper
    - _Requirements: 1.1, 1.3, 3.3, 3.4, 15.1_

  - [x] 7.4 Implement `src/lib/workspace.ts` workspace resolution
    - `resolveWorkspace(request, today)` reads the cookie, loads the workspace, and creates and seeds a new one when the cookie is missing or references a nonexistent id
    - New cookies are HTTP-only, Secure, SameSite=Lax, max age 365 days; return `{ workspace, setCookie }`
    - Every query filters by the resolved workspace id
    - _Requirements: 1.1, 1.2, 1.3, 1.5_

  - [x] 7.5 Implement Reset demo for one workspace
    - `resetWorkspace(workspaceId, today)` deletes only that workspace's accounts, schedules and entries, then reseeds, in a single transaction
    - Add `POST /api/workspace/reset` that resolves the workspace from the cookie, calls it, and returns success
    - _Requirements: 1.3, 1.4_

  - [x] 7.6 Write integration tests for workspace resolution
    - Missing cookie creates and seeds a workspace with two accounts and returns a cookie string with HttpOnly, Secure, SameSite=Lax and the 365-day max age
    - Valid cookie loads the existing workspace; unknown id creates a new one
    - Requires a test Postgres database via `DATABASE_URL`
    - _Requirements: 1.1, 1.2, 1.5_

  - [x] 7.7 Write property test for workspace data isolation
    - **Property 1: Workspace data isolation**
    - **Validates: Requirements 1.3**
    - File: `__tests__/db/properties/p01-isolation.test.ts`

  - [x] 7.8 Write property test for reset isolation
    - **Property 2: Reset isolation**
    - **Validates: Requirements 1.4**
    - File: `__tests__/db/properties/p02-reset-isolation.test.ts`

  - [x] 7.9 Write property test for exactly one primary account
    - **Property 5: Exactly one primary account**
    - **Validates: Requirements 3.3**
    - File: `__tests__/db/properties/p05-one-primary.test.ts`

  - [x] 7.10 Write property test for null available balance preservation
    - **Property 6: Null available balance preservation**
    - **Validates: Requirements 3.4**
    - File: `__tests__/db/properties/p06-null-preserved.test.ts`

  - [x] 7.11 Write property test for threshold storage bounds
    - **Property 33: Threshold storage bounds**
    - **Validates: Requirements 10.3**
    - File: `__tests__/db/properties/p33-threshold-bounds.test.ts`; exercises `workspace-settings.ts`

- [x] 8. Implement holiday fetch, projection API and cleanup cron
  - [x] 8.1 Implement `src/lib/holidays/fetch.ts`
    - `fetchHolidays(year)` calls Nager.Date with `next: { revalidate: 604800 }` and `AbortSignal.timeout(5000)`
    - Keep only `global === true` holidays and apply `applyObservanceRules`
    - On any network error, non-OK status, timeout, or empty/malformed result, log a warning and return `generateFederalHolidays(year)`
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

  - [x] 8.2 Write tests for holiday fetch caching and fallback
    - Mock `fetch`: a failing response, a timeout and an empty array each yield the 11 generated holidays; non-global holidays are filtered out
    - _Requirements: 8.1, 8.2, 8.5_

  - [x] 8.3 Implement `GET /api/projection`
    - Validate `?today=YYYY-MM-DD` (400 on bad format)
    - Resolve the workspace (set the cookie on the response when new), load accounts, schedules and one-off entries filtered by workspace, read accounts through the data-source layer
    - Compute holiday years with `calendarYearsTouched` over today minus 7 days to the latest known date plus 7 days (732-day span, extended by later one-off dates), fetch them, run `projectCashFlow`, update `lastActivity`, return the view model
    - Convert `@db.Date` values with `toISOString().split('T')[0]`; return a generic 500 on failure
    - _Requirements: 1.2, 2.1, 2.2, 8.1, 13.7, 14.3_

  - [x] 8.4 Implement the cleanup cron route and `vercel.json`
    - `GET /api/cron/cleanup` requires `Authorization: Bearer ${CRON_SECRET}` (401 otherwise) and deletes workspaces with `lastActivity` older than 30 days
    - `vercel.json` schedules it daily at `0 2 * * *`
    - _Requirements: 1.6_

- [x] 9. Checkpoint - Ensure backend tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Build the cycle view UI
  - [x] 10.1 Implement the cycle view model helper
    - `src/lib/cycle-view-model.ts` (pure): slices `balances` to the span of the current and next pay cycles and returns chart series for available (primary) and ledger (secondary)
    - Chooses the runway label: "before payday" or "within the next N days"
    - _Requirements: 13.1, 13.2, 9.1, 9.4_

  - [x] 10.2 Write unit tests for the view model helper
    - Chart range covers two cycles; falls back to the horizon when there is no income; label text for both cases
    - _Requirements: 13.1, 13.2_

  - [x] 10.3 Implement runway callout, low-balance warning and balance-difference line
    - `src/components/runway-callout.tsx`: amount, date, label, "(estimated)" when the balance is estimated
    - `src/components/low-balance-warning.tsx`: shadcn alert with the projected lowest balance and date
    - Balance-difference reason line shown only when ledger and available differ
    - Accessible markup (roles, text contrast, not color-only)
    - _Requirements: 10.1, 10.2, 11.2, 13.2, 13.4_

  - [x] 10.4 Implement the balance chart
    - `src/components/balance-chart.tsx` with Recharts: available line prominent, ledger line quieter, pay-cycle boundaries marked, runway point highlighted
    - Accessible text summary alongside the chart
    - _Requirements: 13.1, 9.2_

  - [x] 10.5 Implement the entry timeline
    - `src/components/entry-timeline.tsx`: upcoming entries ordered by shifted date, showing shifted and original dates when they differ, amounts via `formatCents`, an overdue flag, and hold/estimated labels
    - _Requirements: 7.4, 6.9, 12.2, 13.3_

  - [x] 10.6 Implement the Reset demo button
    - Client component that posts to `/api/workspace/reset`, then refreshes the projection; shows a pending state and an error message on failure
    - _Requirements: 1.4_

  - [x] 10.7 Implement the cycle view page and layout
    - `src/app/layout.tsx` and client `src/app/page.tsx`
    - Compute today with `new Date().toLocaleDateString('en-CA')` (never `toISOString()`), fetch `/api/projection?today=...`
    - Render loading, error ("Projection failed") and empty (no accounts or entries) states, then the runway callout, chart, timeline, reason line, low-balance warning and Reset demo button
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7, 10.1, 10.2_

- [x] 11. Final checkpoint - Ensure all tests pass
  - Run the full suite once with `npm test` and ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP.
- Required tests: the exact-value demo test (6.2), the full-year demo test (6.3), and the edge-case tests named in the design: month-end clamping (3.2), three-paycheck month (3.8), Saturday vs Sunday observance (2.7), pending to posted (4.2), held deposit release (4.3), runway ties (4.16), null available (4.4) and overdue (4.5).
- Each property test lives in its own file so property tasks can run in parallel.
- Database tests (7.6 to 7.11) need a Postgres instance reachable through `DATABASE_URL` (Docker or a free Neon branch).
- Demo workspace rows are seeded relative to the date of seeding; "Reset demo" refreshes them. The projection engine itself is always driven by the visitor's current date.
- Run tests with `npm test` (single run). Do not start dev servers or watchers from tasks.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "2.1", "2.2", "2.3"] },
    { "id": 2, "tasks": ["2.4", "2.5", "2.6", "7.1", "7.2"] },
    { "id": 3, "tasks": ["2.7", "2.8", "2.9", "2.10", "2.11", "2.12", "2.13", "2.14", "3.1", "4.15", "4.21", "8.1"] },
    { "id": 4, "tasks": ["3.2", "3.3", "3.4", "3.5", "3.6", "3.7", "4.1", "4.16", "4.17", "4.18", "4.19", "4.22", "4.23", "4.24", "4.25", "7.11", "8.2", "8.4", "10.1", "10.3", "10.5"] },
    { "id": 5, "tasks": ["3.8", "3.9", "3.10", "3.11", "4.2", "4.3", "4.4", "4.5", "4.6", "4.7", "4.8", "4.9", "4.10", "4.11", "4.12", "4.13", "4.14", "4.26", "10.2", "10.4"] },
    { "id": 6, "tasks": ["4.20", "4.27", "6.1"] },
    { "id": 7, "tasks": ["6.2", "6.3", "6.4", "6.5", "6.6", "6.7", "7.3"] },
    { "id": 8, "tasks": ["7.4"] },
    { "id": 9, "tasks": ["7.5", "7.6", "7.7", "7.9", "7.10", "8.3"] },
    { "id": 10, "tasks": ["7.8", "10.6"] },
    { "id": 11, "tasks": ["10.7"] }
  ]
}
```
