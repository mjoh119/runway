# Structure

## Folder layout

```
runway/
├── prisma/
│   ├── schema.prisma          # Data model: Account, Schedule, Entry, Envelope, Transfer (all scoped by workspaceId)
│   └── seed.ts                # Fictional persona demo data
├── src/
│   ├── app/                   # Next.js App Router
│   │   ├── layout.tsx
│   │   ├── page.tsx           # Cycle view (hero screen)
│   │   ├── envelopes/
│   │   ├── log/
│   │   └── settings/          # Schedules & accounts
│   ├── components/            # Reusable UI (balance chart, entry timeline, envelope cards)
│   ├── lib/
│   │   ├── projection/        # Pure-function engine (no side effects, no I/O)
│   │   │   ├── types.ts        # Domain types: Account, Entry, Schedule, Envelope, Transfer
│   │   │   ├── engine.ts       # Entry generation, balance projection, deposit holds
│   │   │   ├── cycle.ts        # Pay-cycle boundary logic
│   │   │   └── runway.ts       # Runway number and date, low-balance warning
│   │   ├── holidays/          # Nager.Date fetch + static fallback (I/O lives here, not in projection)
│   │   │   └── fetch.ts        # Fetch + cache, with bundled Federal Reserve holiday fallback
│   │   ├── envelopes/         # Envelope math and line-item assignment
│   │   ├── matching/          # Transaction-to-entry match suggestions
│   │   └── db.ts              # Prisma client singleton
│   └── sources/               # AccountDataSource implementations
│       ├── interface.ts       # AccountDataSource interface
│       ├── fake-source.ts     # Demo data (default)
│       ├── manual-source.ts
│       └── plaid-source.ts     # All Plaid quirks live here
├── __tests__/                # Unit tests, especially for the projection engine
├── docs/
│   ├── planning/proposal.md
│   └── ai-collaboration/
└── .kiro/
    ├── steering/
    └── hooks/
```

## Conventions

- **Money:** integer cents everywhere. Never floats.
- **Projection engine:** pure functions in `src/lib/projection/`. No database calls, no network calls, no side effects. Inputs go in, outputs come out.
- **Holiday data:** the projection engine takes a holiday list as a function argument. The fetch and cache live in `src/lib/holidays/`, never inside `src/lib/projection/`.
- **Data sources:** all sit behind `AccountDataSource` in `src/sources/`. Provider quirks never leak past their source file.
- **Types:** domain types live in `src/lib/projection/types.ts` and are shared by sources, the engine, and the UI.
- **Tests:** the projection engine and matching logic have unit tests (Vitest). FakeSource doubles as test fixtures.
- **Workspace scoping:** every table carries `workspaceId`, set from an HTTP-only cookie. All queries filter by the current workspace. Reset reseeds only that workspace.
- **Naming:** `kebab-case` for files, `camelCase` for functions and variables, `PascalCase` for types and components.
