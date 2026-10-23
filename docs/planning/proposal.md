# Runway — Product Proposal

Oct 23, 2026 · @Micah

## Summary

Runway is a forward-looking cash-flow ledger for anyone with income, however often it arrives: it shows today, and every day until the next expected income, how much money will actually be left after every scheduled bill lands. It turns the spreadsheet workflow I use for my own budget into an app: plan each pay cycle with estimates, log actuals against them, and watch the projected balance and its lowest point update in real time.

The core idea most budgeting apps miss: the risk isn't the monthly total, it's the timing. A month can balance on paper and still dip near zero two days before payday.

## The problem and the user

**User:** anyone with income, from a regular paycheck on any interval to irregular deposits such as freelance or gig work, with fixed bills on set dates, several accounts, and a handful of flexible spending categories. They aren't in crisis; they want to never be surprised by a low balance.

**Problem:** bank apps show the balance as of right now. Budgeting apps show monthly category totals. Neither answers the question this user asks every few days: *"After everything that's already committed, how low will my account get before I'm paid again?"*

**What goes wrong without an answer:**

- A bill and a weekend or bank holiday collide, a paycheck posts a day late, and an overdraft or NSF fee follows.
- Flexible spending (groceries, takeout) quietly runs over, and the overrun only shows up as a shortfall later in the cycle.
- Small recurring charges, such as account maintenance fees and forgotten subscriptions, erode side accounts unnoticed.

**Why it matters to a bank:** overdraft avoidance and low-balance alerts are a retention and trust lever for community banks and credit unions, and a forward-projection view is a natural feature for a digital banking front end.

## The workflow today

The spreadsheet is one running ledger, projected about three months ahead, with five mechanics worth productizing:

| Mechanic | How the sheet does it | What the app makes of it |
| --- | --- | --- |
| Forward ledger | Every bill, paycheck and envelope is a dated row through the next few months; a running balance follows | Recurring schedule that generates future entries automatically |
| Estimate vs. actual | Each row has an estimated and an actual amount; two running balances (planned, real) and a per-row and cumulative variance | Plan vs. actual on every entry, with a cumulative variance indicator |
| Envelopes per paycheck | Groceries, gas, takeout, entertainment and incidentals get a fixed amount each pay cycle | Per-cycle envelopes showing amount left |
| Roll-up line items | Individual purchases (e.g. three grocery stops) sit under the envelope row and sum to its actual | Transactions assigned to an envelope; the envelope's actual is their sum |
| Linked side accounts | Description text ("Chase Transfer", "Schwab") moves money into separate account balance columns via regex; fees deduct from them | Named accounts with explicit transfers between them, plus a total across all accounts |

**Pain points of the sheet:** the formulas depend on matching description text; rows must be hand-ordered by date (out-of-order rows break the running balance); some rows have no category; future months are copy-pasted by hand; and there's no warning when the projected balance gets thin.

## Proposed product

The MVP has one hero screen and three supporting ones. Everything is in service of a single number: **runway**, the lowest projected available balance before the next expected income (or within the projection horizon when none is scheduled), and the date it happens.

**Core concepts (the data model)**

- **Account**: checking, savings, investment or credit card, each with a ledger balance and an available balance (what can be spent now, after holds and pending debits).
- **Schedule**: a recurring rule ("Rent, -$2,400, 5th of each month"; "Paycheck, every 2 weeks"; "Retainer, 1st and 15th") that generates future entries. The user sets any interval: every N days, weeks or months, or chosen days of the month. Income can also be logged one-off, as often as needed, with no schedule at all.
- **Entry**: one dated row with an estimated amount and an optional actual amount. Status is planned, pending, posted or skipped. A deposit can carry a hold release date and counts toward available balance only from that date; a date the user doesn't enter is estimated from a standard schedule and labeled as estimated.
- **Envelope**: an entry for a flexible category, holding a budget amount that resets on a period the user picks (each pay cycle, weekly or monthly), so frequent or irregular income doesn't shrink envelopes to a day or two. Transactions assigned to it sum into its actual.
- **Transfer**: a paired entry that moves money between two accounts, replacing the regex matching.
- **Pay cycle**: the span from one income entry, scheduled or logged, to the day before the next expected one. With no income scheduled ahead, the projection runs to a horizon the user sets (default 30 days). This is the app's unit of time, not the calendar month.

**MVP screens**

1. **Cycle view (hero):** an available-balance line for the current and next cycle with ledger balance as a quieter second line, the runway number and date, a timeline of upcoming entries, and a one-line reason whenever the two balances differ ("$500 deposit on hold until Oct 27"). A clear warning appears if the projection crosses a threshold the user sets.
2. **Envelopes:** per-cycle cards (budget, spent, left) with their line items. Overspend shows how it pushes the runway down.
3. **Log an actual:** a fast entry to post a real amount against a planned entry, or add a purchase to an envelope.
4. **Schedules & accounts:** set up recurring bills, paychecks and accounts once.

**Explicitly cut from MVP:** investment tracking, credit card statement modeling beyond payments, multi-user households, mobile app, and budgeting reports or history charts.

## API integrations

Two APIs, each tied to a specific product job; neither is decoration.

| API | Job in the product | Pattern and failure handling |
| --- | --- | --- |
| [Plaid](https://plaid.com/docs/transactions/) (Sandbox, `/transactions/sync`) | Pulls ledger and available balances plus pending and posted transactions so actuals fill in without manual entry, then suggests matches to planned entries and envelopes | Server-side token exchange, cursor-based incremental sync, idempotent upsert by transaction id. If Plaid is down or not linked, the app works fully on manual entry. The [`user_transactions_dynamic`](https://plaid.com/docs/sandbox/test-credentials/) sandbox user gives realistic test history. |
| [Nager.Date](https://github.com/nager/Nager.Date) public holidays | Shifts paychecks and bills that land on a weekend or bank holiday to the actual settlement date, so the runway date is right | Fetched once per year and cached. Keep only nationwide holidays, since state-level ones don't close the Fed. If the API fails, fall back to a bundled static list of the 11 Federal Reserve holidays. |

**Matching logic (the interesting part of the Plaid spec):** a posted transaction matches a planned entry when the merchant name is similar, the amount is within a tolerance (exact for fixed bills, any amount for envelopes), and the date is within ±3 business days. Ambiguous matches are suggested, never auto-applied. Unmatched transactions go to an inbox for the user to assign.

Plaid is the riskiest item for a 3–5 hour build. Recommendation: build the manual flow first (spec 1–2) and treat Plaid as spec 3, so a working app exists even if sync is cut. Demo data is the default, so reviewers can run the app without Plaid keys.

**Data source boundary:** the projection, envelopes and matching never call Plaid directly. They read through one small interface written in the app's own terms:

```ts
interface AccountDataSource {
  getAccounts(): Promise<Account[]>   // ledger + available (available may be null)
  syncTransactions(cursor?: string): Promise<{
    added: Txn[]; modified: Txn[]; removed: string[]; nextCursor: string
  }>
}
```

- **Implementations:** `FakeSource` (the default; seeded demo data that also drives unit tests), `ManualSource`, and `PlaidSource`. Each translates its provider's format into the app's types.
- **Plaid quirks stay in `PlaidSource`:** positive amounts mean money out, pending and posted versions of one charge are linked by id, and some institutions report no available balance.
- **Optional rich fields:** fields such as `holdReleaseDate` are optional, so a source that knows them (a bank's core) can supply them; the interface isn't cut down to what Plaid offers.
- **Deliberately not built:** a plugin system or provider registry.

## Spec plan for Kiro

Three specs, each shippable on its own. Splitting them shows scope judgment: if time runs out, specs 1 and 2 are a complete product.

1. **Projection engine & cycle view** (about 2 hours)
   - Accounts, schedules and entry generation; pay-cycle boundaries; projected available and ledger balances with deposit holds; the data source interface with FakeSource demo data; runway number and date; low-balance threshold warning; weekend and holiday date shifting.
   - Sample EARS requirement: *WHEN a scheduled entry falls on a weekend or bank holiday, THE SYSTEM SHALL move a debit to the next business day and an income entry to the prior business day, and show the original date.*
2. **Plan vs. actual & envelopes** (about 1.5 hours)
   - Posting actuals, per-entry and cumulative variance, envelopes with line items, transfers between accounts.
   - Sample: *WHEN the line items in an envelope exceed its budget, THE SYSTEM SHALL show the overage and recompute runway using the actual spend.*
3. **Bank sync (Plaid Sandbox)** (about 1.5 hours, cuttable)
   - PlaidSource: link, incremental sync, pending-to-posted linking, the match-suggestion engine, an unmatched-transactions inbox.
   - Sample: *IF a sync request fails, THEN THE SYSTEM SHALL keep the last successful data, show when it was last synced, and offer a retry, without blocking manual entry.*

**Edge cases worth writing into the specs** (these are where the spec quality shows):

- An entry with an estimate but no actual, in a past date: is it late, skipped or forgotten? Projection uses the estimate until it's marked.
- Posting date differs from the scheduled date (a bill clears two days late): the projection shifts and the variance must not double-count.
- Any income interval: biweekly pay gives two months a year with three checks; one-off income logged mid-cycle splits the cycle; no future income scheduled means runway projects to the horizon and says so, rather than showing a misleading low point.
- Bills due on the 29th to 31st in short months.
- Transfers count once in the all-accounts total, not twice.
- Credit card payments reduce checking and the card balance; card purchases don't touch checking until paid.
- A pending debit already reduces available balance, so when it posts it must not be subtracted again; its amount can also change on posting (gas pre-authorizations, restaurant tips), and the difference counts as variance. If an institution reports no available balance, use ledger minus known pending items and holds, labeled as estimated.
- Rounding: store integer cents, never floats.

**Stack suggestion:** Next.js + TypeScript, Postgres via Prisma (Neon in the live demo; Docker Postgres or a free Neon branch locally), with the projection engine as pure functions (easy to unit test, which strengthens the code-quality score). Seed data is a fictional persona rather than real numbers. Deployment: a live demo on Vercel's free Hobby plan, deployed on every push to main. Each visitor gets their own copy of the demo data on first visit, with a "Reset demo" button, so reviewers never see each other's edits. Plaid Sandbox keys live in Vercel environment settings, never in the repo; the demo runs on the built-in data source if Plaid is unavailable. The README also keeps a short, tested local setup.

## With more time, risks, open decisions

**With more time (README material):** detecting schedules automatically from transaction history; flagging recurring fees and unused subscriptions; "what if" moves (pay a bill early, delay a purchase) previewed on the runway line; a bank-embedded version, where a CoreSource at the data source boundary reads accounts, holds and transactions straight from the bank's core instead of Plaid; push alerts.

**Risks**

- **Overlap with "it's just a budgeting app."** Mitigation: lead every screen and the README with runway and timing, not categories.
- **Plaid setup time.** Mitigation: spec 3 is last and cuttable; manual flow stands alone.
- **Real financial data in a public repo.** Mitigation: seed with a fictional persona; never commit real balances or account names.

**Open decisions**

- [ ] Name: Runway, or an alternative (Payday Runway, Float, Low Point).
- [ ] Resolved: no login; each visitor gets their own copy of the demo data (see Collaboration Context).
- [ ] Do credit cards get their own projection in MVP, or only as payment entries from checking?
- [ ] Resolved: live demo on Vercel Hobby with a Neon Postgres database, still runnable locally (see Collaboration Context).

## Collaboration Context

This is the planning stage, done in conversation with Claude before any Kiro spec was written: what I asked, what the AI proposed, where I pushed back, and what I decided. Entries are in the order they happened on Oct 23, 2026 (Arizona time). Claude was a supplementary planning aid; Kiro's spec workflow drives the specs and the build from here.

1. **12:01 · Choosing a problem**
   - **Me:** asked for a list of app ideas for the exercise.
   - **Claude:** ten ideas in three groups. It recommended ideas from my day job (stop-payment self-service, a mobile deposit pre-check) as the most differentiated.
   - **Decision:** none of the ten. I chose to turn my own personal budgeting spreadsheet into an app.
2. **13:10 · First proposal from the spreadsheet**
   - **Me:** shared my budgeting workbook and asked for a proposal to make an app out of its workflow.
   - **Claude:** mapped the sheet's mechanics (forward-dated ledger, estimate vs. actual, per-paycheck envelopes, roll-up line items, side accounts tracked by description text) and its gaps (rows must stay in date order, uncategorized rows, hand-copied future months, no low-balance warning). It drafted "Runway" around one number, the lowest projected balance before the next income, and kept my real figures out because the repo is public.
   - **Result:** first draft with Plaid and a holiday API as integrations and three Kiro specs.
3. **13:15 · Catching an assumption**
   - **Me:** asked whether we had limited income to twice a month.
   - **Claude:** confirmed the summary assumed it (from my sheet's paydays) and contradicted the rest of the draft. It proposed supporting any regular interval and cutting irregular income from the MVP.
4. **13:17 · Going further than the suggestion**
   - **Me:** no limit at all. People should log income as often as they need, or set any recurring interval. I also asked for a running record of my edits after each review, which became this section.
   - **Result:** pay cycle redefined around income entries, a projection horizon for when no income is scheduled, user-chosen envelope reset periods. Irregular income stays in scope.
5. **13:22 · Testing a reframe**
   - **Me:** asked whether it made more sense, given Nymbus is a core banking provider, to frame Runway as a companion app connected to a core platform.
   - **Claude:** recommended the reframe, since core data (available balance, holds, scheduled ACH) is richer than an aggregator's. It flagged the costs: a mock core instead of a real API, an overdraft-fee business case to defend, and scope.
6. **13:25 · Pushing back on the reframe**
   - **Me:** read the brief as asking me to show my capabilities in personal finance or fintech, not to build something Nymbus itself would use.
   - **Claude:** agreed it doesn't need to serve Nymbus, but corrected one point: the brief weighs product thinking, not just technical ability. It reversed its recommendation and suggested keeping two cheap pieces of the reframe.
   - **Decision:** stay a consumer app.
7. **13:28–13:29 · Understanding before adopting**
   - **Me:** asked what the Plaid integration actually does, what basing runway on available vs. ledger balance implies, and what keeping the data-source boundary clean gains or loses.
   - **Claude:** Plaid fills in actuals and envelope line items through sync and matching. Available balance makes runway honest but means modeling holds, not double-counting pending debits, and a fallback when a bank reports no available balance. The boundary adds no user feature, but lets the demo run without keys, keeps Plaid's quirks (positive amounts mean money out) in one file, and makes matching testable; the risk is over-abstraction.
8. **13:31 · Adopting both**
   - **Decision:** runway uses available balance, with deposit holds and pending-to-posted handling. Plaid sits behind one data-source interface, with demo data as the default. I asked that the decisions and reasoning be recorded here.
9. **13:38–13:41 · Hosting, decided twice**
   - **Me:** asked which free services could host a live demo.
   - **Claude:** recommended Vercel Hobby with a free Neon Postgres database. It flagged that SQLite won't persist on free hosts, that Render's free tier sleeps for about a minute and deletes free databases after 30 days, and that one shared database would mix reviewers' edits.
   - **Me (13:40):** chose to run locally only.
   - **Me (13:41):** reversed that after rereading the brief: "Ideally, host a live demo."
   - **Decision:** live demo on Vercel with Neon, each visitor gets their own copy of the demo data with a reset button, and local setup stays in the README.
10. **13:43 · Reframing this record**
    - **Me:** renamed this section from Revision log to Collaboration Context so it shows how the plan formed, which is what the brief asks for.
