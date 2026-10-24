# Tech

## Stack

- **Next.js + TypeScript** — App Router, server components where practical.
- **Prisma + Postgres** — Neon in the live demo; Docker Postgres or a free Neon branch locally.
- **Vercel Hobby** — deployed on every push to main. Plaid Sandbox keys live in Vercel environment settings, never in the repo.
- **Tailwind CSS + shadcn/ui** — styling and component library.
- **Recharts** — balance projection chart on the cycle view.
- **Vitest** — unit tests for the projection engine and matching logic.
- **Plaid Sandbox** (`/transactions/sync`) — server-side token exchange, cursor-based incremental sync, idempotent upsert by transaction id. Cuttable: the app works fully on manual entry if Plaid is unavailable.
- **Nager.Date** — federal holidays fetched once per year and cached. The fetch lives in `src/lib/holidays/`, not in the projection engine. Fallback to a bundled static list of the 11 Federal Reserve holidays if the API fails.

## Money

Store integer cents. Never use floats for money anywhere.

## Projection engine

Pure functions only. Entry generation, pay-cycle boundaries, balance projection, deposit holds, holiday shifting, and variance are all pure functions that take inputs and return outputs with no side effects. The engine takes a pre-fetched holiday list as an argument — it never does network I/O itself. This makes everything easy to unit test.

## AccountDataSource boundary

The projection engine, envelopes, and matching logic never call Plaid directly. They read through one interface written in the app's own types:

```ts
interface AccountDataSource {
  getAccounts(): Promise<Account[]> // ledger + available (available may be null)
  syncTransactions(cursor?: string): Promise<{
    added: Txn[]; modified: Txn[]; removed: string[]; nextCursor: string
  }>
}
```

Implementations:
- **FakeSource** — default; seeded demo data that also drives unit tests.
- **ManualSource** — manual entry only.
- **PlaidSource** — translates Plaid's format into app types. All Plaid quirks (positive amounts mean money out, pending-to-posted linking by id, institutions that report no available balance) stay inside this file.

Optional rich fields (e.g. `holdReleaseDate`) are optional on the interface so a source that knows them can supply them; the interface is not cut down to what Plaid offers.

No plugin system or provider registry.

## Demo data

Seed with a fictional persona, never real numbers. Each visitor gets their own copy on first visit with a "Reset demo" button so reviewers never see each other's edits.

## Workspace scoping

Every Prisma model carries a `workspaceId` column. The workspace is set from an HTTP-only cookie generated on first visit. All queries filter by the current workspace. "Reset demo" reseeds only the calling workspace, not every visitor's data.
