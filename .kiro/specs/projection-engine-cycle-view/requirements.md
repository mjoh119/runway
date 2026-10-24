# Requirements Document

## Introduction

This is Spec 1 of the Runway app: the projection engine and the cycle view (hero screen). A visitor opens the live demo and immediately sees their runway — the lowest projected available balance on their primary spending account before the next expected income, and the date it happens — on a cycle view with a balance line, an upcoming-entry timeline, and a low-balance warning.

The projection engine is a set of pure functions that take inputs (accounts, schedules, generated entries, a pre-fetched holiday list) and return outputs (projected balances, runway, shifted dates) with no side effects and no I/O. The cycle view renders those outputs using Recharts and shadcn/ui. Data flows through an AccountDataSource interface whose default implementation (FakeSource) carries seeded demo data.

Out of scope for this spec: logging actuals, variance, envelopes, transfers, the schedules/accounts editing UI, and Plaid. Those arrive in later specs.

## Glossary

- **Runway_App**: the application, comprising the projection engine and the user interface.
- **Projection_Engine**: the pure-function module in `src/lib/projection/` that generates entries, computes pay-cycle boundaries, projects balances, shifts dates, and calculates runway. The engine performs no I/O and produces no side effects.
- **Cycle_View**: the hero screen at `/` that renders projected balances, the runway callout, the entry timeline, and the low-balance warning.
- **AccountDataSource**: the interface in `src/sources/interface.ts` that all data sources implement. The service layer reads through this interface and passes data to the projection engine as function arguments. The projection engine, envelopes, and matching logic never call a provider directly.
- **FakeSource**: the default AccountDataSource implementation in `src/sources/fake-source.ts`, seeded with fictional-persona demo data that also drives unit tests.
- **Holiday_Service**: the module in `src/lib/holidays/fetch.ts` that fetches, caches, and falls back for federal holidays. The projection engine never calls this service directly; it receives a holiday list as a function argument.
- **Workspace**: an isolated data scope identified by a workspace id. Every persisted record carries a `workspaceId` column.
- **Workspace_Cookie**: an HTTP-only cookie, set on first visit, that carries the workspace id for subsequent requests.
- **Account**: a financial account with a ledger balance and an available balance. Exactly one account is marked primary (the spending account runway is computed on).
- **Ledger_Balance**: the balance the institution records for the account, in integer cents. A deposit hits ledger on its post date.
- **Available_Balance**: the amount available to spend now, after holds and pending debits, in integer cents. May be null when an institution does not report it.
- **Primary_Account**: the single account flagged as the user's main spending account. Runway is computed on this account.
- **Schedule**: a recurring rule that generates future entries. Supports every N days, every N weeks, every N months, or chosen days of the month.
- **Entry**: one dated row with an estimated amount in integer cents and an optional actual amount. Has a status: planned, pending, posted, or skipped.
- **Entry_Status**: one of planned (scheduled, not yet seen), pending (seen by the source but not posted), posted (settled), or skipped (user excluded).
- **Post_Date**: the calendar date an entry is scheduled to settle.
- **Hold_Release_Date**: the date a deposit becomes available. May be user-entered or estimated; estimated dates are labeled as estimated.
- **Pay_Cycle**: the span from one income entry (scheduled or logged) to the day before the next expected income entry. The app's unit of time, not the calendar month.
- **Projection_Horizon**: the number of days the projection runs when no future income is scheduled. User-set, default 30 days.
- **Runway**: the lowest projected available balance on the Primary_Account before the next expected income (or within the Projection_Horizon when no income is scheduled), and the date it happens.
- **Low_Balance_Threshold**: a user-set amount in integer cents. A warning appears when runway falls below this threshold.
- **Holiday_List**: a list of federal holiday dates for a given year, passed as an argument to the projection engine's date-shifting function. Federal Reserve holidays that fall on Sunday are observed on the following Monday; holidays that fall on Saturday do not close the Federal Reserve (it is open the preceding Friday).
- **Business_Day**: a calendar day that is not a Saturday, Sunday, or a date in the Holiday_List.
- **Income_Entry**: an Entry explicitly typed as income. A refund or other credit does not qualify unless typed as income.
- **Current_Date**: the visitor's local calendar date from the browser, passed to the projection engine as an argument.
- **Estimated_Available_Balance**: a value computed as ledger minus known pending items and holds, used when an institution reports no available balance. Labeled as estimated.
- **Overdue_Entry**: a planned entry whose post date has passed with no actual amount recorded.

## Requirements

### Requirement 1: Workspace Lifecycle

**User Story:** As a visitor, I want a private workspace created on first visit with seeded demo data and a reset button, so that I can explore the app without signing in and never see another reviewer's edits.

#### Acceptance Criteria

1. WHEN a request arrives without a Workspace_Cookie, THE Runway_App SHALL create a new Workspace, set an HTTP-only Secure SameSite=Lax Workspace_Cookie containing the workspace id with a maximum age of 365 days, and seed the Workspace with fictional-persona demo data.
2. WHEN a request arrives with a Workspace_Cookie, THE Runway_App SHALL load the Workspace identified by that cookie's workspace id.
3. THE Runway_App SHALL scope every persisted record by `workspaceId`, and every query SHALL filter by the current Workspace's id.
4. WHEN a visitor triggers "Reset demo" for a Workspace, THE Runway_App SHALL delete all existing data for that Workspace, reseed it with fresh demo data, and leave every other Workspace's data unchanged.
5. IF the Workspace_Cookie references a workspace id that does not exist, THEN THE Runway_App SHALL create a new Workspace, set a new HTTP-only Secure SameSite=Lax Workspace_Cookie with a maximum age of 365 days, and seed it with demo data.
6. WHEN a Workspace has had no activity for 30 consecutive days, THE Runway_App SHALL delete that Workspace and all its data.

### Requirement 2: Account Data Source Boundary

**User Story:** As a developer, I want all account and transaction data to flow through a single AccountDataSource interface with FakeSource as the default, so that the projection engine stays decoupled from any provider and the demo runs without external keys.

#### Acceptance Criteria

1. THE service layer SHALL read account and transaction data exclusively through the AccountDataSource interface and SHALL pass that data to the Projection_Engine as function arguments.
2. THE Projection_Engine SHALL NOT read through the AccountDataSource interface or any other I/O mechanism; it SHALL receive all data as function arguments.
3. THE Runway_App SHALL use FakeSource as the default AccountDataSource implementation.
4. THE FakeSource SHALL return the same fictional-persona demo data on every invocation, including at least one Account with a non-null ledger balance and a non-null available balance.
5. WHERE a source supplies optional rich fields such as Hold_Release_Date, THE AccountDataSource interface SHALL accept those fields without requiring them.
6. THE AccountDataSource interface SHALL define `getAccounts()` returning a Promise of an array of Account objects, and `syncTransactions(cursor?: string)` returning a Promise of an object with `added` as an array of transaction objects, `modified` as an array of transaction objects, `removed` as an array of string identifiers, and `nextCursor` as a string.

### Requirement 3: Account Model and Money Representation

**User Story:** As a developer, I want accounts with ledger and available balances stored as integer cents and one account marked primary, so that runway is computed on the correct account and money never suffers floating-point error.

#### Acceptance Criteria

1. THE Runway_App SHALL represent every money value, including balances, amounts, and thresholds, as integer cents.
2. THE Runway_App SHALL NOT store, transmit, or compute money using floating-point numbers.
3. THE Runway_App SHALL mark exactly one Account as Primary_Account per Workspace.
4. WHEN an Account's available balance is reported as null by the source, THE Runway_App SHALL retain the null value on the Account for use by the available-balance estimation requirement.
5. THE Projection_Engine SHALL compute runway on the Primary_Account's available balance.
6. IF the Primary_Account's available balance is null, THEN THE Projection_Engine SHALL compute runway on the Estimated_Available_Balance.

### Requirement 4: Schedule and Entry Generation

**User Story:** As a user with any income interval, I want schedules that generate future entries through the projection horizon and the ability to log one-off income, so that my projection reflects how I actually get paid.

#### Acceptance Criteria

1. THE Runway_App SHALL support Schedule intervals of every N days (where N is an integer from 1 to 365), every N weeks (where N is an integer from 1 to 52), every N months (where N is an integer from 1 to 12), and one or more chosen days of the month from the 1st through the 31st.
2. WHEN the Projection_Engine generates entries for a Schedule, THE Projection_Engine SHALL produce entries from the schedule start date through the projection end date.
3. THE Runway_App SHALL allow a one-off Income_Entry to be logged without a Schedule.
4. WHEN a Schedule specifies a day of the month from the 29th through the 31st, THE Projection_Engine SHALL place that entry on the month's last day in months where the specified day does not exist, before applying business-day shifting.
5. THE Runway_App SHALL store each generated Entry's estimated amount in integer cents and set its status to planned when no actual is recorded.
6. IF a Schedule specifies an N value that is zero, negative, or exceeds the bounds for its interval type, THEN THE Runway_App SHALL reject the Schedule with an error indicating the invalid interval value.

### Requirement 5: Pay Cycle Boundaries

**User Story:** As a user, I want pay cycles defined around my actual income entries rather than the calendar month, so that the projection's time unit matches how my money arrives.

#### Acceptance Criteria

1. THE Projection_Engine SHALL define a Pay_Cycle as the span from one Income_Entry's shifted post date to the day before the next expected Income_Entry's shifted post date.
2. WHEN no future Income_Entry is scheduled, THE Projection_Engine SHALL project to a user-set Projection_Horizon with a default of 30 days, bounded between 1 and 365 days inclusive.
3. WHEN a Workspace has biweekly income scheduled, THE Projection_Engine SHALL produce three distinct Pay_Cycles for months containing three Income_Entry instances, each bounded by consecutive Income_Entry shifted post dates, without merging or dropping any cycle.
4. WHEN a one-off Income_Entry is logged mid-cycle, THE Projection_Engine SHALL split the current Pay_Cycle at that entry's shifted post date and begin a new Pay_Cycle from that entry.
5. THE Projection_Engine SHALL treat both scheduled Income_Entry instances and logged one-off Income_Entry instances as Pay_Cycle boundaries.
6. IF no Income_Entry has been posted on or before the Current_Date, THEN the current Pay_Cycle SHALL start from the Current_Date.

### Requirement 6: Available and Ledger Balance Projection

**User Story:** As a user, I want to see projected available and ledger balances with deposit holds modeled, so that I can tell the difference between what the bank records and what I can actually spend.

#### Acceptance Criteria

1. THE Projection_Engine SHALL project a running available balance and a running ledger balance for each day from the projection start date to the projection end date.
2. THE Projection_Engine SHALL use the source-reported available balance and ledger balance as the starting balances, which already include all posted, pending, and on-hold items reported by the source.
3. THE Projection_Engine SHALL apply only future events to the starting balances, excluding any entries whose status is posted unless explicitly handled as overdue planned entries per Requirement 12.
4. WHEN a planned debit Entry is scheduled, THE Projection_Engine SHALL subtract the Entry's estimated amount from both available balance and ledger balance on the Entry's shifted Post_Date.
5. WHEN a planned deposit Entry is scheduled and has no Hold_Release_Date, THE Projection_Engine SHALL add the Entry's estimated amount to both available balance and ledger balance on the Entry's shifted Post_Date.
6. WHEN a planned deposit Entry is scheduled and has a Hold_Release_Date, THE Projection_Engine SHALL add the Entry's estimated amount to ledger balance on the Entry's shifted Post_Date and add the Entry's estimated amount to available balance on the Hold_Release_Date.
7. WHEN an existing deposit is already on hold (already included in the source-reported ledger balance but not in the source-reported available balance), THE Projection_Engine SHALL add the deposit amount to available balance on the Hold_Release_Date only.
8. WHEN an existing pending debit is reported by the source (already reflected in the source-reported available balance but not in the source-reported ledger balance), THE Projection_Engine SHALL subtract the debit amount from ledger balance on the expected post date only.
9. IF a Hold_Release_Date is estimated rather than user-entered, THEN THE Projection_Engine SHALL label that date as estimated.

### Requirement 7: Date Shifting

**User Story:** As a user, I want bills and paychecks that land on a weekend or bank holiday shifted to the actual settlement date, so that the runway date is correct and I understand why an entry moved.

#### Acceptance Criteria

1. THE Projection_Engine SHALL provide a pure date-shifting function that takes a date, an entry direction of 'debit' or 'income', and a Holiday_List, and returns a shifted date with no side effects.
2. WHEN a debit Entry's Post_Date falls on a non-Business_Day, THE date-shifting function SHALL return the next Business_Day after the Post_Date, skipping any consecutive non-Business_Days.
3. WHEN an Income_Entry's Post_Date falls on a non-Business_Day, THE date-shifting function SHALL return the prior Business_Day before the Post_Date, skipping any consecutive non-Business_Days.
4. THE Projection_Engine SHALL retain the original Post_Date alongside the shifted date and SHALL make both dates available for display, including when the shifted date equals the original Post_Date.
5. THE Projection_Engine SHALL NOT perform network I/O to obtain the Holiday_List; it SHALL receive the Holiday_List as a function argument.
6. THE Projection_Engine SHALL consider a calendar day to be a Business_Day only when the day is not a Saturday, not a Sunday, and not present in the Holiday_List.
7. IF an Entry's Post_Date is already a Business_Day, THEN the date-shifting function SHALL return the Post_Date unchanged.

### Requirement 8: Holiday Data Fetch

**User Story:** As a developer, I want federal holidays fetched once per year and cached with a static fallback, so that date shifting is correct and the projection still works when the holiday API is unavailable.

#### Acceptance Criteria

1. WHEN a holiday lookup is requested for a calendar year whose holidays are not yet cached, THE Holiday_Service SHALL fetch the federal holidays for that calendar year from Nager.Date and cache them so that each calendar year is fetched at most once.
2. THE Holiday_Service SHALL retain only holidays observed nationwide across all states and SHALL exclude any holiday observed only in a subset of states or counties.
3. WHEN a federal holiday falls on a Sunday, THE Holiday_Service SHALL treat the following Monday as the observed date for closure purposes.
4. WHEN a federal holiday falls on a Saturday, THE Holiday_Service SHALL NOT treat the preceding Friday as a closure date, because the Federal Reserve is open that Friday.
5. IF the Nager.Date fetch for a requested calendar year fails to return a valid response within 5 seconds due to a network error, an unsuccessful HTTP response, or a malformed or empty result, THEN THE Holiday_Service SHALL fall back to a bundled static list that yields the 11 Federal Reserve holidays with their correct observed dates for the requested calendar year, applying the same Sunday-to-Monday and Saturday rules.
6. THE Holiday_Service SHALL reside in `src/lib/holidays/` and SHALL NOT be imported by the Projection_Engine for holiday data; the Projection_Engine SHALL receive the Holiday_List as a function argument.

### Requirement 9: Runway Calculation

**User Story:** As a user, I want to know the lowest my available balance will get before I'm paid again and the date it happens, so that I am never surprised by a low balance.

#### Acceptance Criteria

1. IF a future Income_Entry is scheduled, THEN THE Projection_Engine SHALL compute Runway as the lowest projected available balance on the Primary_Account from the projection start date up to and excluding the next expected Income_Entry's shifted post date, and SHALL label it as "before payday."
2. THE Projection_Engine SHALL compute the Runway date as the date on which that lowest available balance occurs.
3. IF two or more dates share the lowest projected available balance, THEN THE Projection_Engine SHALL report the earliest date.
4. IF no future Income_Entry is scheduled, THEN THE Projection_Engine SHALL compute Runway within the Projection_Horizon and SHALL label it as "within the next N days" where N equals the Projection_Horizon value, rather than "before payday."
5. THE Projection_Engine SHALL compute Runway as a pure function of its inputs and SHALL NOT perform I/O.
6. IF no Primary_Account exists, THEN THE Projection_Engine SHALL return a null Runway value and a null Runway date.

### Requirement 10: Low-Balance Warning

**User Story:** As a user, I want a clear warning when my projected runway drops below a threshold I set or goes negative, so that I can act before a low balance arrives.

#### Acceptance Criteria

1. WHERE a visitor has set a Low_Balance_Threshold, IF the computed Runway falls below that threshold, THEN THE Runway_App SHALL display a warning on the Cycle_View showing the projected lowest available balance amount and the date it occurs.
2. IF the computed Runway is a negative value, THEN THE Runway_App SHALL display a warning on the Cycle_View showing the projected lowest available balance amount and the date it occurs, regardless of whether a Low_Balance_Threshold is set.
3. THE Runway_App SHALL store the Low_Balance_Threshold as integer cents scoped to the Workspace, with a value from 0 to 999,999,999 cents inclusive.
4. WHEN no Low_Balance_Threshold value is stored for the current Workspace and the computed Runway is not negative, THE Runway_App SHALL omit the low-balance warning.

### Requirement 11: Available Balance Estimation

**User Story:** As a user whose bank does not report an available balance, I want an estimated available balance computed from ledger minus pending items and holds, so that runway still reflects spendable money.

#### Acceptance Criteria

1. WHEN an Account's available balance is null, THE Projection_Engine SHALL compute an Estimated_Available_Balance as ledger balance minus pending debit Entry amounts and deposits on hold, in integer cents.
2. WHILE an Account's available balance is computed as Estimated_Available_Balance, THE Runway_App SHALL label that balance as estimated.
3. IF the reported available balance is null, THEN THE Projection_Engine SHALL use the Estimated_Available_Balance in place of the available balance for all projection and runway calculations.

### Requirement 12: Overdue Planned Entries

**User Story:** As a user, I want past-dated planned entries with no actual to still count at their estimate and be flagged, so that a forgotten bill does not silently drop out of the projection.

#### Acceptance Criteria

1. WHEN a planned Entry's shifted Post_Date is earlier than the projection start date and no actual amount is recorded, THE Projection_Engine SHALL include the Entry's estimated amount in the projection, applying it at the projection start date.
2. WHEN a planned Entry's shifted Post_Date is earlier than the projection start date and no actual amount is recorded, THE Runway_App SHALL flag that Entry as an Overdue_Entry and SHALL display the flag in the entry timeline on the Cycle_View.

### Requirement 13: Cycle View Display

**User Story:** As a user, I want a cycle view with available and ledger balance lines covering the current and next pay cycle, a runway callout, an entry timeline, and a specific reason when the two balances differ, so that I can see my full cash-flow picture at a glance.

#### Acceptance Criteria

1. THE Cycle_View SHALL render an available-balance line as the primary line and a ledger-balance line as a secondary line with lower visual prominence than the available-balance line, covering the current Pay_Cycle and the next Pay_Cycle.
2. THE Cycle_View SHALL render a runway callout displaying the Runway amount, the Runway date, and a label indicating whether the Runway is before the next expected income or within the Projection_Horizon.
3. THE Cycle_View SHALL render a timeline of upcoming entries, defined as entries whose shifted Post_Date is on or after the Current_Date, ordered by shifted Post_Date in ascending order.
4. IF the available balance and ledger balance differ, THEN THE Cycle_View SHALL display a one-line reason naming the specific item causing the difference, such as "$500 deposit on hold until Oct 27" or "$120 pending debit not yet posted."
5. WHILE the projection is loading, THE Cycle_View SHALL display a loading state indicating that the projection is being computed.
6. IF the Workspace has no accounts or no entries to project, THEN THE Cycle_View SHALL display an empty state indicating that no accounts or entries are available.
7. IF the projection encounters an error, THEN THE Cycle_View SHALL display an error state indicating that the projection failed, without crashing the application.

### Requirement 14: Projection Engine Purity

**User Story:** As a developer, I want the projection engine to be pure functions only, so that the engine is easy to unit test and free of hidden side effects.

#### Acceptance Criteria

1. THE Projection_Engine SHALL be implemented as pure functions that take inputs and return outputs, where identical inputs yield identical outputs, and the functions SHALL NOT mutate their input arguments.
2. THE Projection_Engine SHALL NOT perform database calls, network calls, file system reads or writes, or mutation of shared or global state.
3. THE Projection_Engine SHALL receive all external data, including the Holiday_List, account balances, and the Current_Date used as the projection start date, as function arguments.

### Requirement 15: Demo Persona Data

**User Story:** As a visitor exploring the demo, I want seeded data that showcases all key features, so that I can immediately see how the app handles real-world scenarios.

#### Acceptance Criteria

1. THE FakeSource demo persona SHALL include at least two Account objects.
2. THE FakeSource demo persona SHALL include at least one deposit Entry with a Hold_Release_Date.
3. THE FakeSource demo persona SHALL include at least one pending debit Entry.
4. THE FakeSource demo persona SHALL include at least one Entry whose Post_Date falls on a weekend or federal holiday, requiring business-day shifting.
5. THE FakeSource demo persona SHALL include at least one Overdue_Entry whose shifted Post_Date is earlier than the Current_Date with no actual amount recorded.
6. THE FakeSource demo persona SHALL set a Low_Balance_Threshold on the demo Workspace.
7. THE FakeSource demo persona SHALL generate a projection where the computed Runway falls below the Low_Balance_Threshold, triggering the low-balance warning.
8. THE FakeSource demo persona SHALL generate all dates (entry post dates, hold release dates, schedule start dates) relative to the Current_Date so that the demo showcases all features regardless of when a reviewer visits.
