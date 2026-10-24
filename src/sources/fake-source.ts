import { addDays, dayOfWeek } from '../lib/projection/dates';
import type { Entry, Schedule } from '../lib/projection/types';
import type { Account, AccountDataSource, Transaction } from './interface';

export interface DemoData {
  accounts: Account[];
  schedules: Schedule[];
  oneOffEntries: Entry[];
  workspaceSettings: {
    lowBalanceThresholdCents: number;
    projectionHorizonDays: number;
  };
}

/** Demo accounts, identical on every call. */
function demoAccounts(): Account[] {
  return [
    {
      id: 'demo-checking',
      name: 'Demo Checking',
      type: 'CHECKING',
      isPrimary: true,
      ledgerBalanceCents: 160_000, // $1,600.00
      availableBalanceCents: 150_000, // $1,500.00 ($60 pending debit + $40 deposit on hold)
    },
    {
      id: 'demo-savings',
      name: 'Demo Savings',
      type: 'SAVINGS',
      isPrimary: false,
      ledgerBalanceCents: 512_000,
      availableBalanceCents: 512_000,
    },
  ];
}

export class FakeSource implements AccountDataSource {
  async getAccounts(): Promise<Account[]> {
    return demoAccounts();
  }

  async syncTransactions(cursor?: string): Promise<{
    added: Transaction[];
    modified: Transaction[];
    removed: string[];
    nextCursor: string;
  }> {
    return { added: [], modified: [], removed: [], nextCursor: cursor ?? 'fake-cursor-0' };
  }
}

/**
 * Generate demo data relative to the current date.
 * All dates are 'YYYY-MM-DD' strings.
 */
export function generateDemoData(currentDateStr: string): DemoData {
  // Next Saturday strictly after the current date (+7 if today is a Saturday)
  const nextSaturday = (d: string): string => addDays(d, (6 - dayOfWeek(d) + 7) % 7 || 7);

  return {
    accounts: demoAccounts(),

    schedules: [
      {
        id: 'schedule-paycheck',
        name: 'Biweekly Paycheck',
        accountId: 'demo-checking',
        intervalType: 'WEEKS',
        intervalValue: 2,
        daysOfMonth: [],
        startDate: addDays(currentDateStr, -1), // that occurrence is already in the starting balances
        estimatedAmountCents: 240_000, // $2,400
        entryType: 'INCOME',
      },
    ],

    // shiftedPostDate may equal postDate in the seed; the engine computes the real value
    oneOffEntries: [
      {
        id: 'entry-phone-overdue',
        accountId: 'demo-checking',
        scheduleId: null,
        postDate: addDays(currentDateStr, -5),
        shiftedPostDate: addDays(currentDateStr, -5),
        estimatedAmountCents: -7_500,
        actualAmountCents: null,
        status: 'PLANNED',
        entryType: 'DEBIT',
        description: 'Phone Bill (overdue)',
      },
      {
        id: 'entry-rent',
        accountId: 'demo-checking',
        scheduleId: null,
        postDate: addDays(currentDateStr, 1),
        shiftedPostDate: addDays(currentDateStr, 1),
        estimatedAmountCents: -120_000,
        actualAmountCents: null,
        status: 'PLANNED',
        entryType: 'DEBIT',
        description: 'Rent',
      },
      {
        id: 'entry-electric',
        accountId: 'demo-checking',
        scheduleId: null,
        postDate: addDays(currentDateStr, 2),
        shiftedPostDate: addDays(currentDateStr, 2),
        estimatedAmountCents: -8_500,
        actualAmountCents: null,
        status: 'PLANNED',
        entryType: 'DEBIT',
        description: 'Electric Bill',
      },
      {
        id: 'entry-weekend',
        accountId: 'demo-checking',
        scheduleId: null,
        postDate: nextSaturday(currentDateStr),
        shiftedPostDate: nextSaturday(currentDateStr),
        estimatedAmountCents: -5_000,
        actualAmountCents: null,
        status: 'PLANNED',
        entryType: 'DEBIT',
        description: 'Weekend Debit (shifts to next business day)',
      },
      {
        id: 'entry-posted-held',
        accountId: 'demo-checking',
        scheduleId: null,
        postDate: addDays(currentDateStr, -1),
        shiftedPostDate: addDays(currentDateStr, -1),
        estimatedAmountCents: 4_000,
        actualAmountCents: 4_000,
        status: 'POSTED',
        entryType: 'INCOME',
        holdReleaseDate: addDays(currentDateStr, 1),
        isHoldEstimated: false,
        description: 'Posted Deposit (held until tomorrow)',
      },
      {
        id: 'entry-grocery-pending',
        accountId: 'demo-checking',
        scheduleId: null,
        postDate: addDays(currentDateStr, 1),
        shiftedPostDate: addDays(currentDateStr, 1),
        estimatedAmountCents: -6_000,
        actualAmountCents: null,
        status: 'PENDING',
        entryType: 'DEBIT',
        description: 'Grocery Store (pending)',
      },
    ],

    workspaceSettings: {
      lowBalanceThresholdCents: 20_000, // $200
      projectionHorizonDays: 30,
    },
  };
}
