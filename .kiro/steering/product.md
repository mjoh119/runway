# Product

## User

Anyone with income — regular paycheck on any interval, or irregular deposits like freelance or gig work — who has fixed bills on set dates, several accounts, and a handful of flexible spending categories. They are not in crisis. They want to never be surprised by a low balance.

## Problem

Bank apps show the balance as of right now. Budgeting apps show monthly category totals. Neither answers the question this user asks every few days: *"After everything that's already committed, how low will my account get before I'm paid again?"*

A month can balance on paper and still dip near zero two days before payday. The risk is timing, not the monthly total.

## Runway

The hero number: the lowest projected available balance before the next expected income (or within the projection horizon when no income is scheduled), and the date it happens. Every screen serves this number.

## MVP scope

Four screens:

1. **Cycle view (hero)** — available-balance line for current and next pay cycle, ledger balance as a quieter second line, runway number and date, upcoming-entry timeline, one-line reason when available and ledger differ, low-balance warning at a user-set threshold.
2. **Envelopes** — per-cycle cards (budget, spent, left) with line items; overspend shows how it pushes runway down.
3. **Log an actual** — fast entry to post a real amount against a planned entry or add a purchase to an envelope.
4. **Schedules & accounts** — set up recurring bills, paychecks, and accounts once.

Core data model: Account (ledger + available balance), Schedule (recurring rule generating entries), Entry (dated row with estimate and optional actual; status: planned / pending / posted / skipped), Envelope (flexible category with a budget that resets on a user-chosen period: each pay cycle, weekly, or monthly), Transfer (paired entry between two accounts), Pay cycle (span from one income entry to the day before the next; defaults to a 30-day horizon when no income is scheduled).

Key mechanics: available balance with deposit hold dates; estimate vs actual with per-entry and cumulative variance; weekend and bank-holiday date shifting (debit → next business day, income → prior business day); per-visitor demo data with a reset button.

## Explicitly cut from MVP

- Investment tracking
- Credit card statement modeling beyond payment entries
- Multi-user households
- Mobile app
- Budgeting reports or history charts
