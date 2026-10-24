import { addDays, dayOfWeek } from '../lib/projection/dates';
import type { ResetPeriod } from '../lib/envelopes/types';
import type { Entry, Schedule } from '../lib/projection/types';
import type { Account, AccountDataSource, Transaction } from './interface';

export interface DemoEnvelope {
  id: string;
  name: string;
  resetPeriod: ResetPeriod;
  budgetCents: number;
}

export interface DemoLineItem {
  envelopeId: string;
  amountCents: number;
  purchaseDate: string;
  description: string;
}

export interface DemoData {
  accounts: Account[];
  schedules: Schedule[];
  oneOffEntries: Entry[];
  envelopes: DemoEnvelope[];
  lineItems: DemoLineItem[];
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
        name: 'Biweekly paycheck',
        accountId: 'demo-checking',
        intervalType: 'WEEKS',
        intervalValue: 2,
        daysOfMonth: [],
        startDate: addDays(currentDateStr, -1), // that occurrence is already in the starting balances
        estimatedAmountCents: 240_000, // $2,400
        entryType: 'INCOME',
      },
      // Second pay cycle bills: all fall after the next paycheck (offset +13 days),
      // so they never change the runway before payday.
      {
        id: 'schedule-streaming',
        name: 'Streaming',
        accountId: 'demo-checking',
        intervalType: 'DAYS',
        intervalValue: 30,
        daysOfMonth: [],
        startDate: addDays(currentDateStr, 17),
        estimatedAmountCents: -1_549, // $15.49
        entryType: 'DEBIT',
      },
      {
        id: 'schedule-car-insurance',
        name: 'Car insurance',
        accountId: 'demo-checking',
        intervalType: 'DAYS',
        intervalValue: 30,
        daysOfMonth: [],
        startDate: addDays(currentDateStr, 21),
        estimatedAmountCents: -14_200, // $142.00
        entryType: 'DEBIT',
      },    ],

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
        description: 'Phone bill',
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
        description: 'Electric',
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
        description: 'Gym membership',
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
        description: 'Freelance deposit',
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
        description: 'Grocery store',
      },
    ],

    envelopes: [
      { id: 'envelope-groceries', name: 'Groceries', resetPeriod: 'WEEKLY', budgetCents: 6_000 },
      { id: 'envelope-dining', name: 'Dining out', resetPeriod: 'EACH_PAY_CYCLE', budgetCents: 4_500 },
      { id: 'envelope-fun', name: 'Fun money', resetPeriod: 'MONTHLY', budgetCents: 4_000 },
    ],

    // Today is always in the current period of every envelope. today - 7 is always in the
    // previous week, and the last day of the previous month is always in the previous month.
    lineItems: [
      {
        envelopeId: 'envelope-groceries',
        amountCents: 4_100,
        purchaseDate: currentDateStr,
        description: 'Weekly shop',
      },
      {
        envelopeId: 'envelope-groceries',
        amountCents: 5_500,
        purchaseDate: addDays(currentDateStr, -7),
        description: 'Last week shop',
      },
      {
        envelopeId: 'envelope-dining',
        amountCents: 1_840,
        purchaseDate: currentDateStr,
        description: 'Lunch out',
      },
      {
        envelopeId: 'envelope-fun',
        amountCents: 1_299,
        purchaseDate: currentDateStr,
        description: 'Movie rental',
      },
      {
        envelopeId: 'envelope-fun',
        amountCents: 3_500,
        purchaseDate: addDays(`${currentDateStr.slice(0, 8)}01`, -1),
        description: 'Concert tickets',
      },
    ],

    workspaceSettings: {
      lowBalanceThresholdCents: 20_000, // $200
      projectionHorizonDays: 30,
    },
  };
}
