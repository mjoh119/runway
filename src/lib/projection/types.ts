// Domain types for the projection engine.
//
// Conventions:
// - Every money field is a `number` holding INTEGER CENTS. Never floats.
//   Debits are negative, income is positive where the sign is meaningful.
// - Every date is a date-only 'YYYY-MM-DD' string (no time, no timezone).

export type EntryDirection = 'INCOME' | 'DEBIT';

export interface Schedule {
  id: string;
  name: string;
  accountId: string;
  intervalType: 'DAYS' | 'WEEKS' | 'MONTHS' | 'DAYS_OF_MONTH';
  intervalValue: number;
  daysOfMonth: number[]; // for DAYS_OF_MONTH type
  startDate: string; // 'YYYY-MM-DD'
  estimatedAmountCents: number; // integer cents
  entryType: EntryDirection;
}

export interface Entry {
  id: string;
  accountId: string;
  scheduleId: string | null;
  postDate: string; // 'YYYY-MM-DD'
  shiftedPostDate: string; // 'YYYY-MM-DD', computed at projection time
  estimatedAmountCents: number; // integer cents
  actualAmountCents: number | null; // integer cents
  status: 'PLANNED' | 'PENDING' | 'POSTED' | 'SKIPPED';
  entryType: EntryDirection;
  holdReleaseDate?: string; // 'YYYY-MM-DD'
  isHoldEstimated?: boolean;
  description?: string;
}

export interface ProjectionInput {
  accounts: {
    id: string;
    isPrimary: boolean;
    ledgerBalanceCents: number; // integer cents
    availableBalanceCents: number | null; // integer cents
  }[];
  schedules: Schedule[];
  oneOffEntries: Entry[]; // from database (one-off entries only)
  holidays: string[]; // 'YYYY-MM-DD' strings, pre-fetched
  currentDate: string; // 'YYYY-MM-DD', projection start date
  projectionHorizonDays: number;
  /** Workspace low-balance threshold in integer cents; null/undefined when unset. */
  lowBalanceThresholdCents?: number | null;
}

export interface ProjectedBalance {
  date: string; // 'YYYY-MM-DD'
  ledgerBalanceCents: number; // integer cents
  availableBalanceCents: number; // integer cents
  isEstimated: boolean; // true if available balance was estimated
}

export interface RunwayResult {
  lowestBalanceCents: number; // integer cents
  lowestBalanceDate: string; // 'YYYY-MM-DD'
  isBeforePayday: boolean; // true if bounded by next income, false if horizon
  projectionEndDate: string; // 'YYYY-MM-DD'
}

export interface PayCycle {
  startDate: string; // 'YYYY-MM-DD'
  endDate: string; // 'YYYY-MM-DD', day before next income (or projection end)
  incomeEntryId: string | null; // the income entry that starts this cycle
}

export interface ProjectionOutput {
  balances: ProjectedBalance[];
  runway: RunwayResult | null;
  upcomingEntries: Entry[]; // entries with shiftedPostDate >= currentDate
  payCycles: PayCycle[];
  warnings: {
    belowThreshold?: {
      thresholdCents: number; // integer cents
      lowestBalanceCents: number; // integer cents
      date: string; // 'YYYY-MM-DD'
    };
    overdueEntries?: Entry[];
    availableBalanceDifference?: {
      reason: string; // e.g., "$500 deposit on hold until Oct 27"
    };
  };
}
