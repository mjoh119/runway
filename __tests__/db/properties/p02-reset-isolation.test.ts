import { afterEach, describe, it, expect, vi } from 'vitest';
import fc from 'fast-check';
import { randomUUID } from 'node:crypto';

// Feature: projection-engine-cycle-view, Property 2: Reset isolation
// **Validates: Requirements 1.4**

const todayArb = fc
  .integer({ min: Date.UTC(2000, 0, 1), max: Date.UTC(2099, 11, 31) })
  .map((ms) => new Date(ms).toISOString().slice(0, 10));

describe('Property 2: Reset isolation (mocked prisma)', () => {
  afterEach(() => {
    vi.doUnmock('@/lib/db');
    vi.resetModules();
  });

  it('resetWorkspace only deletes with where: { workspaceId } and never calls unscoped deleteMany', async () => {
    await fc.assert(
      fc.asyncProperty(fc.uuid(), todayArb, async (workspaceId, today) => {
        const deleteSpies = {
          account: vi.fn().mockResolvedValue({ count: 0 }),
          schedule: vi.fn().mockResolvedValue({ count: 0 }),
          oneOffEntry: vi.fn().mockResolvedValue({ count: 0 }),
          workspace: vi.fn().mockResolvedValue({ count: 0 }),
          submissionKey: vi.fn().mockResolvedValue({ count: 0 }),
          occurrenceRecord: vi.fn().mockResolvedValue({ count: 0 }),
          lineItem: vi.fn().mockResolvedValue({ count: 0 }),
          envelope: vi.fn().mockResolvedValue({ count: 0 }),
        };
        const deleteOne = vi.fn().mockResolvedValue({});
        let n = 0;
        const tx = {
          workspace: { upsert: vi.fn().mockResolvedValue({}), deleteMany: deleteSpies.workspace, delete: deleteOne },
          account: {
            deleteMany: deleteSpies.account,
            delete: deleteOne,
            create: vi.fn(async () => ({ id: `acc-${n++}` })),
          },
          schedule: { deleteMany: deleteSpies.schedule, delete: deleteOne, create: vi.fn().mockResolvedValue({}) },
          oneOffEntry: { deleteMany: deleteSpies.oneOffEntry, delete: deleteOne, create: vi.fn().mockResolvedValue({}) },
          submissionKey: { deleteMany: deleteSpies.submissionKey, delete: deleteOne, create: vi.fn().mockResolvedValue({}) },
          occurrenceRecord: { deleteMany: deleteSpies.occurrenceRecord, delete: deleteOne, create: vi.fn().mockResolvedValue({}) },
          lineItem: { deleteMany: deleteSpies.lineItem, delete: deleteOne, create: vi.fn().mockResolvedValue({}) },
          envelope: {
            deleteMany: deleteSpies.envelope,
            delete: deleteOne,
            create: vi.fn(async () => ({ id: `env-${n++}` })),
          },
        };
        // Top-level client: any direct delete outside the transaction is a violation.
        const topDeleteMany = vi.fn();
        const topDelete = vi.fn();
        const prismaMock = {
          $transaction: vi.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)),
          account: { deleteMany: topDeleteMany, delete: topDelete },
          schedule: { deleteMany: topDeleteMany, delete: topDelete },
          oneOffEntry: { deleteMany: topDeleteMany, delete: topDelete },
          workspace: { deleteMany: topDeleteMany, delete: topDelete },
        };

        vi.resetModules();
        vi.doMock('@/lib/db', () => ({ prisma: prismaMock }));
        const { resetWorkspace } = await import('@/lib/reset-workspace');
        await resetWorkspace(workspaceId, today);

        expect(topDeleteMany).not.toHaveBeenCalled();
        expect(topDelete).not.toHaveBeenCalled();
        expect(deleteOne).not.toHaveBeenCalled();
        for (const fn of Object.values(deleteSpies)) {
          for (const call of fn.mock.calls) {
            expect(call[0]).toEqual({ where: { workspaceId } });
          }
        }
        // The account wipe for this workspace did happen.
        expect(deleteSpies.account).toHaveBeenCalledTimes(1);
        // Every created row is tagged with the given workspace id.
        for (const create of [tx.account.create, tx.schedule.create, tx.oneOffEntry.create]) {
          for (const call of create.mock.calls as unknown as Array<[{ data: { workspaceId: string } }]>) {
            expect(call[0].data.workspaceId).toBe(workspaceId);
          }
        }
      }),
      { numRuns: 25 },
    );
  });
});

/** DATABASE_URL may hold a placeholder; only run DB tests if the DB answers. */
async function dbReachable(): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  try {
    const { prisma } = await import('@/lib/db');
    await prisma.$queryRaw`SELECT 1`;
    await prisma.workspace.count();
    return true;
  } catch {
    return false;
  }
}
const hasDb = await dbReachable();

describe.skipIf(!hasDb)('Property 2: Reset isolation (DB)', () => {
  it('resetting workspace A leaves workspace B byte-for-byte unchanged and reseeds A', async () => {
    const { prisma } = await import('@/lib/db');
    const { seedWorkspace } = await import('@/lib/seed-workspace');
    const { resetWorkspace } = await import('@/lib/reset-workspace');
    const created: string[] = [];

    const snapshot = async (id: string) =>
      JSON.stringify({
        workspace: await prisma.workspace.findUnique({ where: { id } }),
        accounts: await prisma.account.findMany({ where: { workspaceId: id }, orderBy: { id: 'asc' } }),
        schedules: await prisma.schedule.findMany({ where: { workspaceId: id }, orderBy: { id: 'asc' } }),
        entries: await prisma.oneOffEntry.findMany({ where: { workspaceId: id }, orderBy: { id: 'asc' } }),
      });

    try {
      await fc.assert(
        fc.asyncProperty(todayArb, fc.integer({ min: 1, max: 100_000_000 }), async (today, newBalance) => {
          const a = randomUUID();
          const b = randomUUID();
          created.push(a, b);
          await seedWorkspace(a, today);
          await seedWorkspace(b, today);

          // Mutate both A and B.
          await prisma.account.updateMany({ where: { workspaceId: b }, data: { ledgerBalanceCents: newBalance } });
          await prisma.account.updateMany({ where: { workspaceId: a }, data: { ledgerBalanceCents: newBalance } });

          const bBefore = await snapshot(b);
          const aMutated = await snapshot(a);

          await resetWorkspace(a, today);

          expect(await snapshot(b)).toBe(bBefore);

          // A was reseeded: demo account rows are new and no longer carry the mutation.
          const aAccounts = await prisma.account.findMany({ where: { workspaceId: a } });
          expect(aAccounts.length).toBeGreaterThan(0);
          expect(await snapshot(a)).not.toBe(aMutated);
          const bAccountIds = new Set((await prisma.account.findMany({ where: { workspaceId: b } })).map((r) => r.id));
          expect(aAccounts.every((r) => !bAccountIds.has(r.id))).toBe(true);
        }),
        { numRuns: 5 },
      );
    } finally {
      await prisma.workspace.deleteMany({ where: { id: { in: created } } });
      await prisma.$disconnect();
    }
  }, 120_000);
});
