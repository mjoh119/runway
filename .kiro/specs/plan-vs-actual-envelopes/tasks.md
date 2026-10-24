# Implementation Plan: Plan vs Actual and Envelopes

## Overview

Implementation follows the design's build order: pure modules and their tests first (Money_Parser, plan functions, balance deltas, variance, Envelope_Calculator), then the additive engine changes, then the Prisma schema and Entry_Service, then API routes, then UI, then seed and reset. Everything is TypeScript, matching the design. Money is integer cents throughout.

Pure modules never import `@/lib/db`, `@prisma/client`, `@/sources`, or call `fetch`. Each task builds on the previous ones and the work ends with the UI, seed, and a full regression run, so no code is left unwired.

Test sub-tasks the request names as required (post-at-estimate runway invariance, past-dated already-happened one-off, rejected planned past one-off, double-submit, Spec 1 regression) are not marked optional. All other test sub-tasks are optional.

## Tasks

- [x] 1. Shared types and Money_Parser
  - [x] 1.1 Add shared date helper and engine type additions
    - Add `isValidDate(value: string): boolean` (real calendar date in `YYYY-MM-DD`) to `src/lib/projection/dates.ts`
    - In `src/lib/projection/types.ts` add `Entry.actualDate?`, the `EnvelopeCommitment` interface, and optional `occurrenceRecords?` and `envelopeCommitments?` on `ProjectionInput`
    - Types only; no behavior change to the engine yet
    - _Requirements: 2.5, 5.5, 9.1, 9.9_

  - [x] 1.2 Implement the Money_Parser in `src/lib/money.ts`
    - Export `MAX_CENTS`, `MoneyParseResult`, `ParseMoneyOptions`, `parseMoney`, `formatCentsPlain`
    - Apply the design's precedence: trim, required, more than two decimals, grammar, more than 9 whole digits, range; use integer arithmetic only; support `allowZero`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.8_

  - [x] 1.3 Write property test for money round trip
    - **Property 1: Money round trip**
    - **Validates: Requirements 1.7**
    - File: `__tests__/money.test.ts`

  - [x] 1.4 Write property test for valid money text
    - **Property 2: Valid money text parses to exact cents**
    - **Validates: Requirements 1.1, 1.2**

  - [x] 1.5 Write property test for invalid money text and examples
    - **Property 3: Invalid money text is rejected with the right error and never rounded**
    - **Validates: Requirements 1.3, 1.4, 1.5, 1.6, 7.5**
    - Include examples "12.5", "0.99", "5.", ".5", "1e3", "-5", "1,200", "$5", and `allowZero` for "0" and "0.00"

- [x] 2. Entry-service pure planning modules
  - [x] 2.1 Implement errors and balance deltas
    - Create `src/lib/entry-service/errors.ts` (`ServiceError`, `ServiceErrorCode`, `Result<T>`)
    - Create `src/lib/entry-service/balance-delta.ts` (`postingBalanceDelta`, `postedOneOffBalanceDelta`, `lineItemDelta`) following the design's delta table; pending income is treated like planned income
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.9, 3.10, 3.11, 8.10, 10.2, 10.3_

  - [x] 2.2 Write property test for posting balance deltas
    - **Property 6: Balance delta follows the posting rules**
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.9, 3.10, 3.11, 4.1**
    - File: `__tests__/entry-service/balance-delta.test.ts`

  - [x] 2.3 Write property test for line item deltas
    - **Property 19: Line item balance changes are exact and reversible**
    - **Validates: Requirements 8.10, 10.2, 10.3, 10.7**
    - Include the null available balance staying null when the delta is applied by a small pure apply helper in the test

  - [x] 2.4 Implement `planPost`, `planSkip`, and `planOneOff`
    - Create `src/lib/entry-service/plan-post.ts` and `plan-one-off.ts`
    - Error order and messages exactly as in the design, including `Planned entries need a date today or later`
    - Stay pure: use `isValidDate` and never import `reset-workspace.ts`
    - _Requirements: 2.1, 2.3, 2.4, 2.7, 2.8, 4.1, 4.4, 5.1, 5.2, 5.3, 5.5, 5.6, 5.7, 5.8, 5.10, 5.11_

  - [x] 2.5 Write property test for posting a plan
    - **Property 4: Posting records the signed actual and keeps the estimate**
    - **Validates: Requirements 2.1, 2.7, 2.8**
    - File: `__tests__/entry-service/plan-post.test.ts`
    - Include the Requirement 6.2 to 6.5 variance examples (-8,500 posted at -9,200 gives -700; at -7,000 gives +1,500; income 240,000 at 235,000 gives -5,000; at estimate gives 0)

  - [x] 2.6 Write property test for rejected post and skip
    - **Property 5: Invalid post and skip requests are rejected without a plan**
    - **Validates: Requirements 2.3, 2.4, 4.4**

  - [x] 2.7 Write required unit tests for one-off planning
    - File: `__tests__/entry-service/plan-one-off.test.ts`
    - A one-off dated before today with "This already happened" checked yields POSTED, actual and estimate equal to the entered amount, actual date equal to the entered date, and a balance delta that moves ledger and available; the resulting entry is not returned by `findOverdueEntries`
    - A planned one-off (unchecked) dated before today is rejected with exactly `Planned entries need a date today or later` and produces no plan
    - Checked and dated after today is rejected; unchecked and dated today or later is PLANNED with a zero delta
    - _Requirements: 5.3, 5.7, 5.8, 5.9, 5.14, 5.15_

  - [x] 2.8 Write property test for one-off planning
    - **Property 10: One-off planning validates and shapes the entry**
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.5, 5.6, 5.7, 5.8, 5.10, 5.11**

  - [x] 2.9 Implement occurrence helpers and input validation
    - Create `src/lib/entry-service/occurrence.ts` (`parseEntryRef`, `buildOccurrenceRecord`)
    - Create `src/lib/entry-service/validate.ts` (`validateEnvelopeInput`, `validateLineItemInput`, `validateSettings`) using `parseMoney`
    - _Requirements: 2.5, 4.2, 7.3, 7.4, 7.5, 7.6, 8.3, 10.5, 12.2, 12.3, 12.4, 12.5_

  - [x] 2.10 Write property test for envelope name validation
    - **Property 14: Envelope names are validated and unique ignoring case**
    - **Validates: Requirements 7.3, 7.4**
    - File: `__tests__/entry-service/validate.test.ts`

  - [x] 2.11 Write property test for settings validation
    - **Property 24: Settings validation**
    - **Validates: Requirements 12.2, 12.3, 12.4, 12.5**

  - [x] 2.12 Write property test for occurrence record building
    - **Property 8: Occurrence records replace generated occurrences** (record builder part)
    - **Validates: Requirements 2.5, 4.2**
    - File: `__tests__/entry-service/occurrence.test.ts`
    - Include `parseEntryRef` examples for cuid and `<scheduleId>:<date>` ids

- [x] 3. Variance, Envelope_Calculator, and Log_Flow state helpers
  - [x] 3.1 Implement variance in `src/lib/projection/variance.ts`
    - `entryVariance` and `computeCumulativeVariance` as specified; sign comes from `entryType` and magnitude; `actualDate` falls back to `postDate`
    - _Requirements: 6.1, 6.6, 6.10, 6.11_

  - [x] 3.2 Write property test for entry variance
    - **Property 12: Variance is signed actual minus signed estimate**
    - **Validates: Requirements 6.1, 6.11**
    - File: `__tests__/projection/variance.test.ts`

  - [x] 3.3 Write property test for cumulative variance
    - **Property 13: Cumulative variance sums the posted entries in the cycle**
    - **Validates: Requirements 6.6, 6.10**

  - [x] 3.4 Implement envelope types and period logic
    - Create `src/lib/envelopes/types.ts` and `period.ts` (`periodContaining`, `precedingPeriod`)
    - WEEKLY Monday to Sunday, MONTHLY including leap February, EACH_PAY_CYCLE from scheduled-income dates only with the `fallbackStart` and 30-day open-end rules
    - _Requirements: 7.7, 7.8, 7.9, 7.10_

  - [x] 3.5 Write property test for weekly periods
    - **Property 15: Weekly periods run Monday to Sunday**
    - **Validates: Requirements 7.7**
    - File: `__tests__/envelopes/period.test.ts`

  - [x] 3.6 Write property test for monthly periods
    - **Property 16: Monthly periods cover the calendar month**
    - **Validates: Requirements 7.8**

  - [x] 3.7 Write property test for pay-cycle periods
    - **Property 17: Pay-cycle periods use only scheduled income** (period part)
    - **Validates: Requirements 7.9, 7.10**

  - [x] 3.8 Implement `collectScheduledIncomeDates`
    - Create `src/lib/envelopes/income-dates.ts` using the engine's `generateEntries` and `shiftDate`
    - Drop recorded occurrences, add non-SKIPPED INCOME records, never accept one-off entries
    - _Requirements: 5.4, 7.9, 7.10_

  - [x] 3.9 Write property test for scheduled-income collection
    - **Property 17: Pay-cycle periods use only scheduled income** (collection part)
    - **Validates: Requirements 5.4, 7.9, 7.10**
    - File: `__tests__/envelopes/income-dates.test.ts`

  - [x] 3.10 Implement `computeEnvelopeTotals`
    - Create `src/lib/envelopes/totals.ts`
    - _Requirements: 8.5, 8.6, 8.7_

  - [x] 3.11 Write property test for envelope totals
    - **Property 18: Envelope totals partition line items by period**
    - **Validates: Requirements 8.5, 8.6, 8.7, 8.11, 10.1, 10.4**
    - File: `__tests__/envelopes/totals.test.ts`

  - [x] 3.12 Implement commitments and the envelope card view model
    - Create `src/lib/envelopes/commitments.ts` (`buildEnvelopeCommitments`) and `view-model.ts` (`buildEnvelopeCardView`, with `runwayImpactCents` equal to `overageCents`, line items grouped for the current and preceding period)
    - _Requirements: 8.8, 8.9, 9.1, 9.2, 9.4, 9.5, 9.8_

  - [x] 3.13 Write property test for commitments
    - **Property 20: Commitments exist exactly for envelopes with money left**
    - **Validates: Requirements 9.1, 9.2**
    - File: `__tests__/envelopes/commitments.test.ts`

  - [x] 3.14 Implement pure Log_Flow state helpers
    - Create `src/components/log-flow/log-flow-state.ts` with `alreadyHappenedDefault(date, today)` and `nextAlreadyHappened(state, newDate, today)`; no React imports so it stays unit-testable
    - _Requirements: 14.14, 14.15, 14.16, 14.17_

  - [x] 3.15 Write property test for the already-happened default
    - **Property 25: Already-happened default follows the date unless overridden**
    - **Validates: Requirements 14.14, 14.15, 14.16, 14.17**
    - File: `__tests__/log-flow-state.test.ts`

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Projection engine changes
  - [x] 5.1 Teach `projectCashFlow` about occurrence records and commitments
    - In `src/lib/projection/engine.ts`: skip generated schedule entries whose `scheduleId|postDate` has a record, add records as candidates with `shiftDate` applied (ids `<scheduleId>:<postDate>`)
    - Convert commitments to synthetic PLANNED debits on the primary account with `shiftedPostDate = date` (no shifting) and pass them to `projectBalances` only, so they never reach `entries`, `upcomingEntries`, pay cycles, or warnings
    - With both inputs absent or empty, no code path changes
    - _Requirements: 2.5, 2.6, 2.10, 4.2, 4.3, 9.3, 9.8, 9.9_

  - [x] 5.2 Write property test for absent inputs reproducing Spec 1 output
    - **Property 23: Absent new inputs reproduce Spec 1 output**
    - **Validates: Requirements 9.9**
    - File: `__tests__/projection/records-commitments.test.ts`

  - [x] 5.3 Write property test for record replacement in the engine
    - **Property 8: Occurrence records replace generated occurrences** (engine part)
    - **Validates: Requirements 2.6, 2.10**

  - [x] 5.4 Write property test for skipped entries
    - **Property 9: Skipped entries are inert**
    - **Validates: Requirements 4.3, 4.5**

  - [x] 5.5 Write property test for overdue rules
    - **Property 11: Only PLANNED entries can be overdue**
    - **Validates: Requirements 2.9, 5.9, 5.13, 16.6**

  - [x] 5.6 Write property test for commitment application
    - **Property 21: Commitments reduce both projected balances without shifting**
    - **Validates: Requirements 9.3**

  - [x] 5.7 Write required test: runway does not jump when a planned bill is posted at its estimate
    - Example test in `__tests__/projection/records-commitments.test.ts`: a planned bill whose shifted post date is the current date is posted at its estimate (balances adjusted with `postingBalanceDelta`, occurrence replaced by a POSTED record); runway lowest balance, runway date, and daily balance series are identical before and after
    - _Requirements: 3.7, 3.8_

  - [x] 5.8 Write property test for posting a due entry at its estimate
    - **Property 7: Posting a due entry at its estimate leaves the projection unchanged**
    - **Validates: Requirements 3.7**

  - [x] 5.9 Write property test for overspending
    - **Property 22: Overspending moves the runway by exactly the overage**
    - **Validates: Requirements 9.5, 9.6, 9.7**
    - Also assert the card view's `runwayImpactCents` equals the overage

  - [x] 5.10 Add the architecture smoke test
    - Create `__tests__/architecture.test.ts`: files under `src/lib/projection`, `src/lib/envelopes`, `src/lib/money.ts`, and the pure `entry-service` files must not import `@/lib/db`, `@prisma/client`, or `@/sources`, and must not call `fetch`
    - _Requirements: 9.8, 16.2, 16.3_

- [x] 6. Checkpoint - Ensure all tests pass
  - Run the full suite and confirm every Spec 1 test still passes. Ensure all tests pass, ask the user if questions arise.

- [x] 7. Prisma schema and Entry_Service
  - [x] 7.1 Extend the Prisma schema and create the migration
    - In `prisma/schema.prisma` add `ResetPeriod`, `Envelope`, `LineItem`, `OccurrenceRecord`, `SubmissionKey`, `OneOffEntry.actualDate`, and the new relations on `Workspace`, `Schedule`, and `Account`; every new model carries `workspaceId` with cascade delete
    - Generate the migration `plan_vs_actual_envelopes` and regenerate the client; changes are additive
    - _Requirements: 8.1, 11.3, 11.7, 15.1, 15.5_

  - [x] 7.2 Implement `runIdempotent`
    - Create `src/lib/entry-service/idempotency.ts`: replay stored result, insert the `SubmissionKey` first inside the transaction, store the result and bump `lastActivity` in the same transaction, replay the winner on a unique violation (`isUniqueViolationOn` checks `meta.target`)
    - _Requirements: 11.2, 11.3, 11.5, 11.7, 11.8, 11.9_

  - [x] 7.3 Implement post, skip, and add one-off in `service.ts`
    - `postActual`, `skipEntry`, `addOneOff` using the pure plans; scope every read and write by `workspaceId`; guarded `updateMany` for status changes; `OccurrenceRecord` create for schedule occurrences with the occurrence validated via `generateEntries`; atomic `increment` for ledger and conditional `updateMany` for non-null available balance; one-offs target the primary account
    - Map unique violations to `CONFLICT`; bump `lastActivity` in every transaction
    - _Requirements: 2.1, 2.5, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.9, 3.10, 3.11, 3.12, 4.1, 4.2, 5.1, 5.2, 5.7, 5.8, 11.2, 11.3, 13.4, 15.2_

  - [x] 7.4 Implement envelope, line item, and settings mutations in `service.ts`
    - `createEnvelope`, `updateEnvelope`, `createLineItem`, `updateLineItem`, `deleteLineItem`, `saveSettings`; apply `lineItemDelta` to the primary account in the same transaction; `createLineItem` uses `runIdempotent`; envelope names stored with `nameKey`
    - _Requirements: 7.1, 7.2, 8.1, 8.3, 8.4, 8.10, 10.1, 10.2, 10.3, 10.5, 10.6, 11.2, 12.2, 12.3, 12.4, 13.4, 15.2_

  - [x] 7.5 Implement `buildWorkspaceView` and extend the projection response
    - Create `src/lib/projection-service.ts`: move the projection route's orchestration here, load envelopes, line items, and occurrence records, map records to engine `Entry` objects (`id = <scheduleId>:<occurrenceDate>`, `actualDate`), widen the holiday year range to `today - 807`, then run `collectScheduledIncomeDates`, `periodContaining`, `computeEnvelopeTotals`, `buildEnvelopeCommitments`, `projectCashFlow`, `computeCumulativeVariance` in that order
    - Extend `ProjectionResponse` in `src/lib/projection-response.ts` with `settings.projectionHorizonDays` and `variance`; update `/api/projection` to call the service with unchanged behavior for Spec 1 fields
    - Reads continue to go through the `AccountDataSource` wrapper
    - _Requirements: 6.7, 6.8, 9.1, 9.4, 13.1, 13.2, 16.4_

  - [x] 7.6 Write required database tests for double-submit protection
    - File: `__tests__/db/entry-service.test.ts`, using `describe.skipIf(!hasDb)` like existing `__tests__/db` files
    - The same post request submitted twice and the same purchase request submitted twice each produce exactly one record and exactly one balance change
    - A checked "already happened" one-off submitted twice with one Submission_Key produces one Entry and one balance change
    - Two concurrent requests with one key apply exactly one; the same key in two workspaces applies in both; a rejected request leaves no key row
    - _Requirements: 11.2, 11.5, 11.6, 11.7, 11.8, 11.9_

  - [x] 7.7 Write required database tests for one-off behavior
    - Same file as 7.6
    - A one-off dated before today with the already-happened option checked is saved as POSTED with equal estimate and actual, ledger and available balances updated, and is absent from the overdue list
    - A planned one-off dated before today is rejected with exactly `Planned entries need a date today or later`, with no Entry, balance, or Submission_Key change
    - _Requirements: 5.3, 5.7, 5.8, 5.9, 5.14, 5.15_

  - [x] 7.8 Write database tests for rollback, null balances, and reflection
    - Same file as 7.6
    - Forced failure after the status update persists nothing; null available balance stays null after post, one-off, and line item create, edit, and delete; `lastActivity` bumps after each mutation; a projection fetched after each mutation reflects it
    - _Requirements: 3.5, 3.6, 3.12, 8.10, 10.2, 10.3, 13.2, 13.4_

  - [x] 7.9 Write database tests for workspace isolation
    - Same file as 7.6
    - Ids from workspace B return `NOT_FOUND` in workspace A and change nothing in either workspace; a missing line item delete returns `NOT_FOUND` without a balance change
    - _Requirements: 10.6, 15.1, 15.2_

- [x] 8. API routes
  - [x] 8.1 Add the entry mutation routes and shared response helper
    - Create `src/app/api/entries/post/route.ts`, `skip/route.ts`, `one-off/route.ts` and a small shared helper mapping `ServiceError` codes to HTTP 400, 404, 409 and anything else to 500 with a generic message
    - Each route resolves the workspace from the cookie with `resolveWorkspace`, rejects an invalid `today` with 400, and passes amount text through to the server-side `parseMoney`
    - _Requirements: 1.9, 2.1, 4.1, 5.1, 11.2, 13.3_

  - [x] 8.2 Add the envelope routes
    - Create `src/app/api/envelopes/route.ts` (POST) and `src/app/api/envelopes/[id]/route.ts` (PATCH)
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

  - [x] 8.3 Add the line item routes
    - Create `src/app/api/line-items/route.ts` (POST) and `src/app/api/line-items/[id]/route.ts` (PATCH, DELETE)
    - _Requirements: 8.1, 8.3, 8.4, 10.1, 10.5, 10.6_

  - [x] 8.4 Add the settings route
    - Create `src/app/api/settings/route.ts` (GET, PUT) taking threshold and horizon as text
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5_

  - [x] 8.5 Add `GET /api/envelopes`
    - Extend `src/app/api/envelopes/route.ts` with a GET returning `{ envelopes, runway }` from `buildWorkspaceView`; `dynamic = 'force-dynamic'`
    - _Requirements: 8.8, 8.9, 9.5, 13.1_

  - [x] 8.6 Write unit tests for route status mapping
    - Verify `VALIDATION`, `NOT_FOUND`, `CONFLICT`, and unexpected errors map to 400, 404, 409, and 500 with a generic message
    - _Requirements: 13.3_

- [x] 9. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. User interface
  - [x] 10.1 Build Log_Flow plumbing and mount it in the shell
    - Create `src/components/log-flow/events.ts` (`runway:changed`), `use-submit.ts` (one `crypto.randomUUID()` key per opened form, reused on every attempt, submit disabled while in flight, form kept open with values on failure, close and dispatch on success), and a context exposing `openLogFlow({ mode, entryRef? })`
    - Mount the provider once in `src/components/app-shell.tsx`
    - _Requirements: 11.1, 11.4, 13.1, 13.3, 14.9, 14.10_

  - [x] 10.2 Build the Log_Flow dialog and its three forms
    - Create `log-flow.tsx`, `post-actual-form.tsx`, `purchase-form.tsx`, `one-off-form.tsx`
    - Post mode pre-fills the estimate via `formatCentsPlain` and today, offers Skip, and preselects the entry when opened from a timeline row; purchase mode pre-fills today; one-off mode opens with today and "This already happened" checked, driven by `log-flow-state.ts`
    - Programmatic labels, focus on the amount field, Enter submits, errors in a `role="alert"` element next to the field, client-side `parseMoney` before sending
    - _Requirements: 1.9, 2.2, 8.2, 12.7, 14.6, 14.7, 14.8, 14.11, 14.12, 14.13, 14.14, 14.15, 14.16, 14.17, 14.18_

  - [x] 10.3 Update the Cycle_View
    - Add Post and Skip buttons to `upcoming-card.tsx` rows, create `variance-card.tsx` listing posted entries with estimate, actual, and variance plus the cumulative variance chip ("Over by", "Under by", "On plan" text and tone), add a "Log" button to the page header, and refetch on `runway:changed`
    - _Requirements: 2.9, 4.5, 6.7, 6.8, 6.9, 6.11, 12.6, 13.1, 14.10, 14.11_

  - [x] 10.4 Build the Envelopes page
    - Replace the placeholder at `src/app/envelopes/page.tsx` and add `envelope-card.tsx` using Card, Money, Chip, and PageHeader; loading, error with Retry, and empty states with a create action; create and edit envelope forms; `role="progressbar"` with text equivalents; "Overspent" chip with overage and "Runway is $X lower"; line items for current and preceding period with edit and delete; refetch on `runway:changed`
    - _Requirements: 7.1, 7.2, 8.8, 8.9, 9.5, 10.1, 13.1, 14.1, 14.2, 14.3, 14.4, 14.5, 14.10_

  - [x] 10.5 Build the Settings page
    - Replace `ComingSoon` in `src/app/settings/page.tsx` with threshold and horizon fields that show current values, show errors next to the field, and save through `/api/settings`; schedule and account editing stay unavailable
    - _Requirements: 1.9, 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7_

  - [x] 10.6 Write example tests for Log_Flow helpers
    - Pre-fill values, Submission_Key reuse across attempts, and no new key until the form reopens
    - _Requirements: 2.2, 8.2, 11.1_

- [x] 11. Demo seed and reset
  - [x] 11.1 Extend `generateDemoData` with envelopes and line items
    - In `src/sources/fake-source.ts` add `DemoEnvelope`, `DemoLineItem`, and the Groceries (WEEKLY, $60.00), Dining out (EACH_PAY_CYCLE, $45.00), Fun money (MONTHLY, $40.00) data with dates relative to today; keep every existing field unchanged
    - _Requirements: 15.6, 15.7, 15.8_

  - [x] 11.2 Extend `seedWorkspace` and reset
    - In `src/lib/seed-workspace.ts` delete `submissionKey`, `occurrenceRecord`, `lineItem`, and `envelope` rows for the workspace before reseeding, then insert the demo envelopes and line items with `workspaceId`, all inside the existing transaction; confirm `reset-workspace.ts` and the cleanup cron need no change thanks to cascade deletes
    - _Requirements: 15.3, 15.4, 15.5, 15.6_

  - [x] 11.3 Write property test for the seed shape
    - **Property 26: Demo seed covers each reset period with relative dates**
    - **Validates: Requirements 15.6, 15.8**
    - File: `__tests__/sources/fake-source-envelopes.test.ts`

  - [x] 11.4 Write property test for the seeded runway
    - **Property 27: Seeded runway stays below the threshold**
    - **Validates: Requirements 15.7**

  - [x] 11.5 Write database tests for reset and cleanup
    - File: `__tests__/db/reset-envelopes.test.ts`
    - Reset of workspace A leaves workspace B untouched and matches a freshly created workspace for the same date; deleting a workspace removes its envelopes, line items, records, and keys
    - _Requirements: 15.3, 15.4, 15.5_

- [x] 12. Spec 1 regression confirmation
  - [x] 12.1 Confirm all Spec 1 tests still pass unmodified
    - Run `npm test` (`vitest --run`), the TypeScript type check, lint, and the production build
    - Confirm via `git diff` that no Spec 1 test assertion was changed; any failure is fixed in the new code, not by editing Spec 1 assertions
    - _Requirements: 9.9, 16.1, 16.2, 16.3, 16.4, 16.6_

- [x] 13. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Required tests (not marked `*`): 2.7, 5.7, 7.6, 7.7, 12.1
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation; checkpoint 6 includes a Spec 1 regression run
- Property tests validate universal correctness properties; unit and database tests validate examples and edge cases
- Database tests are skipped when `DATABASE_URL` is unavailable, following the existing `__tests__/db` pattern
- Tasks that write to the same file (for example `records-commitments.test.ts`, `entry-service.test.ts`, `service.ts`) are placed in separate waves

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "2.1", "3.1", "3.4", "3.14"] },
    { "id": 2, "tasks": ["1.3", "2.2", "2.4", "2.9", "3.2", "3.5", "3.8", "3.10", "3.15"] },
    { "id": 3, "tasks": ["1.4", "2.3", "2.5", "2.7", "2.10", "2.12", "3.3", "3.6", "3.9", "3.11", "3.12"] },
    { "id": 4, "tasks": ["1.5", "2.6", "2.8", "2.11", "3.7", "3.13"] },
    { "id": 5, "tasks": ["5.1"] },
    { "id": 6, "tasks": ["5.2", "5.10", "7.1"] },
    { "id": 7, "tasks": ["5.3", "7.2"] },
    { "id": 8, "tasks": ["5.4", "7.3"] },
    { "id": 9, "tasks": ["5.5", "7.4", "8.1"] },
    { "id": 10, "tasks": ["5.6", "7.5", "8.2", "8.3", "8.4"] },
    { "id": 11, "tasks": ["5.7", "7.6", "8.5", "8.6", "10.1", "10.5"] },
    { "id": 12, "tasks": ["5.8", "7.7", "10.2"] },
    { "id": 13, "tasks": ["5.9", "7.8", "10.3", "10.4", "10.6"] },
    { "id": 14, "tasks": ["7.9", "11.1"] },
    { "id": 15, "tasks": ["11.2", "11.3"] },
    { "id": 16, "tasks": ["11.4", "11.5"] },
    { "id": 17, "tasks": ["12.1"] }
  ]
}
```
