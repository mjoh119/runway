import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import fc from 'fast-check';
import { projectCashFlow } from '@/lib/projection/engine';
import { seedWorkspace } from '@/lib/seed-workspace';
import { generateDemoData } from '@/sources/fake-source';
import { prisma as mockedPrisma } from '@/lib/db';

// Feature: projection-engine-cycle-view, Property 6: Null available balance preservation
// **Validates: Requirements 3.4**

vi.mock('@/lib/db', () => ({ prisma: { $transaction: vi.fn() } }));
vi.mock('@/sources/fake-source', () => ({ generateDemoData: vi.fn() }));

const availableArb = fc.option(fc.integer({ min: -1_000_000, max: 100_000_000 }), { nil: null });

describe('Property 6: Null available balance preservation (pure)', () => {
  it('projectCashFlow does not coerce a null available balance: rows are estimated, not zeroed', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100_000_000 }),
        fc.integer({ min: 1, max: 60 }),
        (ledger, horizon) => {
          const out = projectCashFlow({
            accounts: [
              { id: 'a', isPrimary: true, ledgerBalanceCents: ledger, availableBalanceCents: null },
            ],
            schedules: [],
            oneOffEntries: [],
            holidays: [],
            currentDate: '2025-03-03',
            projectionHorizonDays: horizon,
          });
          expect(out.balances.length).toBeGreaterThan(0);
          for (const b of out.balances) {
            expect(b.isEstimated).toBe(true);
            // Estimate is used (equals ledger with no holds/pending), not a 0 default.
            expect(b.availableBalanceCents).toBe(ledger);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('a non-null available balance is used as-is and not flagged estimated', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100_000_000 }),
        fc.integer({ min: 0, max: 100_000_000 }),
        (ledger, available) => {
          const out = projectCashFlow({
            accounts: [
              { id: 'a', isPrimary: true, ledgerBalanceCents: ledger, availableBalanceCents: available },
            ],
            schedules: [],
            oneOffEntries: [],
            holidays: [],
            currentDate: '2025-03-03',
            projectionHorizonDays: 7,
          });
          for (const b of out.balances) {
            expect(b.isEstimated).toBe(false);
            expect(b.availableBalanceCents).toBe(available);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('Property 6: Null available balance preservation (seedWorkspace mapping)', () => {
  let created: Array<{ data: Record<string, unknown> }>;

  beforeEach(() => {
    created = [];
    const tx = {
      workspace: { upsert: vi.fn() },
      account: {
        deleteMany: vi.fn(),
        create: vi.fn(async (args: { data: Record<string, unknown> }) => {
          created.push(args);
          return { id: `created-${created.length}` };
        }),
      },
      schedule: { create: vi.fn() },
      oneOffEntry: { create: vi.fn() },
    };
    vi.mocked(mockedPrisma.$transaction).mockImplementation((async (cb: (t: typeof tx) => unknown) =>
      cb(tx)) as never);
  });

  it('null stays null and non-null stays equal in tx.account.create data', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(availableArb, { minLength: 1, maxLength: 5 }), async (values) => {
        created = [];
        vi.mocked(generateDemoData).mockReturnValue({
          accounts: values.map((v, i) => ({
            id: `acc-${i}`,
            name: `Account ${i}`,
            type: 'CHECKING',
            isPrimary: i === 0,
            ledgerBalanceCents: 1000,
            availableBalanceCents: v,
          })),
          schedules: [],
          oneOffEntries: [],
          workspaceSettings: { lowBalanceThresholdCents: 0, projectionHorizonDays: 30 },
        } as never);

        await seedWorkspace('ws-test', '2025-03-03');

        expect(created).toHaveLength(values.length);
        values.forEach((v, i) => {
          expect(created[i].data.availableBalanceCents).toBe(v);
        });
      }),
      { numRuns: 100 },
    );
  });
});

/** DATABASE_URL may hold a placeholder; only run DB tests if the DB answers. */
async function dbReachable(): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  try {
    const { prisma } = await vi.importActual<typeof import('@/lib/db')>('@/lib/db');
    await prisma.$queryRaw`SELECT 1`;
    await prisma.workspace.count();
    return true;
  } catch {
    return false;
  }
}
const hasDb = await dbReachable();

describe.skipIf(!hasDb)('Property 6: DB round-trip', () => {
  const workspaceIds: string[] = [];

  afterAll(async () => {
    const { prisma } = await vi.importActual<typeof import('@/lib/db')>('@/lib/db');
    for (const id of workspaceIds) {
      await prisma.workspace.delete({ where: { id } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  it('a null availableBalanceCents reads back null; non-null reads back equal', async () => {
    const { prisma } = await vi.importActual<typeof import('@/lib/db')>('@/lib/db');
    await fc.assert(
      fc.asyncProperty(availableArb, async (available) => {
        const ws = await prisma.workspace.create({ data: {} });
        workspaceIds.push(ws.id);
        const acct = await prisma.account.create({
          data: {
            workspaceId: ws.id,
            name: 'P06 Checking',
            type: 'CHECKING',
            isPrimary: true,
            ledgerBalanceCents: 5000,
            availableBalanceCents: available,
          },
        });
        const back = await prisma.account.findUniqueOrThrow({ where: { id: acct.id } });
        expect(back.availableBalanceCents).toBe(available);
        await prisma.workspace.delete({ where: { id: ws.id } });
        workspaceIds.pop();
      }),
      { numRuns: 10 },
    );
  });
});
