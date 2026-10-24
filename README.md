# Runway

**Live demo:** https://runway-ivory-chi.vercel.app/

Runway answers one question: *after everything that is already committed, how low will my account get before I am paid again?*

Bank apps show the balance as of right now. Budgeting apps show monthly category totals. Neither tells you that a month can balance on paper and still dip near zero two days before payday. Runway projects your balance day by day and surfaces the lowest point (the "runway") and the date it happens.

## Why I built this

I already do this in a Google Sheet. I list my paychecks, my fixed bills and my flexible spending buckets, and I use the sheet to see where my balance will land before the next paycheck. It works, but it is manual, easy to break, and hard to look at on a phone.

This project is a chance to build the same thing as a real app, and to keep building on it. The long-term goal is to grow it until it can replace my spreadsheet.

## Product decisions

The whole app mirrors how my spreadsheet works. The decisions below came from that.

- **Envelopes mirror my budgeting buckets.** In the sheet, each row of flexible spending (groceries, gas, takeout, fun money) is a bucket with a budget. Envelopes are the same idea: a budget, a reset period (each pay cycle, weekly or monthly), and purchases logged against it. I chose the envelope model because it is the closest match to the way I already think about my money.
- **Projection, not just a balance.** The goal is not to show what I have available now. It is to show how much money I *will* have, given my budgets (envelopes) measured against both my plan and my actual spending. Unspent envelope money is treated as already spoken for, so it lowers the projected balance. Overspending lowers it further, and the Envelopes page shows by exactly how much.
- **Plan vs actual.** Every bill and paycheck has an estimate. When the real amount posts, the app records the difference (variance) and recomputes the runway straight away, just as I would edit a cell in the sheet.
- **Available balance and ledger balance are both shown.** Pending charges and deposits on hold explain why the two differ, and the Overview says so.
- **Deliberately small.** Investments, credit-card statement modelling, multi-user households and a mobile app were cut from the first version.

## What is in the app

- **Overview:** the runway number and date, available and ledger balance, next payday, a projected-balance chart, upcoming bills grouped by date, and a plan-vs-actual summary.
- **Envelopes:** budgets with spent and left, near-limit and over-budget states, purchases that can be edited or deleted, and the runway impact of overspending.
- **Log:** a feed of what has been posted, plus quick entry for marking a bill paid, adding a purchase, or adding a one-off entry.
- **Settings:** the low-balance threshold (dollars, stored as cents) and the projection horizon (1 to 365 days).

Each visitor gets their own copy of the demo data (a fictional persona), tied to an HTTP-only cookie. A "Reset" link in the sidebar restores only that visitor's data.

## How it works

- **Money is integer cents everywhere.** There are no floats for money.
- **The projection engine is made of pure functions** (`src/lib/projection/`). Entry generation, pay-cycle boundaries, deposit holds, weekend and holiday date shifting, variance and runway all take inputs and return outputs, with no database or network access. That makes them straightforward to unit test.
- **Holidays** are fetched and cached in `src/lib/holidays/` and passed into the engine as a list. A bundled fallback list is used if the fetch fails.
- **Every table carries a `workspaceId`** and every query filters by it.
- **Writes are protected against double submission.** Each post, purchase and one-off carries a submission key, so a double click or retry is recorded once.

Stack: Next.js (App Router) and TypeScript, Prisma with Postgres (Neon), Tailwind CSS, Recharts, Vitest and fast-check, deployed on Vercel.

## API endpoints

The app talks to its own route handlers only. The browser sends its local date as `today` so that "today" is the visitor's date, never the server's. Every endpoint resolves the visitor's workspace from the cookie and scopes all reads and writes to it.

Mutating endpoints reply with `{ ok: true, result }` or `{ ok: false, error: { message, field } }`. Status codes: `400` validation, `404` not found (including ids from another workspace), `409` conflict (for example posting an entry twice), `500` unexpected, with a generic message.

| Method and path | What it does | Why it exists |
| --- | --- | --- |
| `GET /api/projection?today=` | Runs the projection and returns balances, runway, upcoming entries, pay cycles, warnings, variance and settings. | The one read behind the Overview, the Log page and the Log side panel. Keeping it a single call means every screen shows the same numbers. |
| `POST /api/entries/post` | Posts an actual amount and date against a planned bill or paycheck. Updates the account balances and records the variance. | The core "plan vs actual" action. There is no bank feed yet, so the app updates the balances itself. |
| `POST /api/entries/skip` | Marks a planned entry as skipped so it drops out of the projection. | For a bill that does not occur this time, without deleting the schedule. |
| `POST /api/entries/one-off` | Adds a one-time debit or income, either planned for later or already happened. | For things the schedules do not cover, like a refund or a surprise bill. |
| `GET /api/envelopes?today=` | Returns each envelope with its current-period totals, line items and runway impact, plus the runway. | Powers the Envelopes page. |
| `POST /api/envelopes` | Creates an envelope with a name, budget and reset period. | Setting up a budgeting bucket. |
| `PATCH /api/envelopes/[id]` | Edits an envelope. | Budgets change, and the runway recomputes. |
| `POST /api/line-items` | Logs a purchase against an envelope and lowers the account balances. | The "I just spent money" action. It is the one I use most, so it has to be quick. |
| `PATCH /api/line-items/[id]` | Edits a purchase and adjusts the balances by the difference. | Fixing a typo should not need a delete and re-enter. |
| `DELETE /api/line-items/[id]` | Deletes a purchase and gives the money back to the balances. | Removing a mistaken or duplicate purchase. |
| `GET /api/settings`, `PUT /api/settings` | Reads and saves the low-balance threshold and projection horizon. | These drive the warning and how far ahead the projection looks. |
| `POST /api/workspace/reset` | Reseeds only the caller's workspace with the demo data. | Lets reviewers experiment without affecting anyone else. |
| `GET /api/cron/cleanup` | Deletes workspaces inactive for 30 days. Called daily by Vercel Cron and protected by `CRON_SECRET`. | Keeps the demo database from growing without limit. |
## Running it locally

```bash
npm install
cp .env.example .env        # set DATABASE_URL (Docker Postgres or a free Neon branch) and CRON_SECRET
npx prisma migrate deploy   # create the tables
npm run dev                     # open http://localhost:3000
```

Other commands:

```bash
npm test          # unit and property tests (database tests are skipped unless DATABASE_URL is set)
npm run build     # generates the Prisma client, then builds
```

On Vercel, set `DATABASE_URL` and `CRON_SECRET` in the project's environment settings, and run `npx prisma migrate deploy` against the production database whenever a migration is added.

## What I would add with more time

- **Plaid integration.** This is the biggest gap. Today I have to post debits and credits myself. With Plaid, transactions would be pulled in automatically (using Plaid's incremental sync, with each transaction saved once by its id) and posted to the ledger, then matched to planned entries and envelopes. The design already allows for this: the projection, envelopes and matching logic read through a single `AccountDataSource` interface in `src/sources/`. The demo data is one implementation of it, and a Plaid source would be another, with all of Plaid's quirks kept inside that one file. It is not built yet.
- **Better error handling.** Right now a failed request mostly shows a generic message, and a server failure (for example a database that has not been migrated) returns a 500 with no useful hint on screen. I would add clear, specific messages, retry options, error boundaries so one broken panel does not blank the page, and structured logging so I can see what went wrong.
- **CI/CD with automated tests.** I would add a GitHub Actions workflow that runs the type check, the unit and property tests, and the production build on every push and pull request, so a broken change cannot reach main and trigger a bad Vercel deploy. It would also run the database tests against a throwaway Postgres service, which today only run when I set DATABASE_URL locally. A failed Vercel build earlier in this project (a stale Prisma client) is the kind of problem this would have caught before deploy.
- **Editing schedules and accounts.** The Settings page says these are not available yet. For this to replace my spreadsheet I need to set up and change my own paychecks, bills and accounts in the app.
- **Showing envelopes on the Overview.** Envelopes already lower the runway, but the Overview does not explain it. A line such as "includes $X set aside in envelopes" would make the link visible.
- **Transfers between accounts, a light theme toggle, and history views** are further down the list.

## Project layout

```
prisma/                 schema and migrations
src/app/                pages and API route handlers
src/components/         UI components (shared cards, badges, log side panel, charts)
src/lib/projection/     pure projection engine
src/lib/envelopes/      envelope periods, totals and commitments
src/lib/entry-service/  validation, planning and the database writes
src/lib/holidays/       holiday fetch and cache
src/sources/            AccountDataSource interface and demo data
__tests__/              unit, property-based and database tests
.kiro/                  steering files and specs used to plan and build this
docs/                   planning notes and the AI collaboration log
```

## AI collaboration

This was built with Kiro. The prompts and agent runs are recorded in `docs/ai-collaboration/session-log.md`, and the specs behind each feature are in `.kiro/specs/`.