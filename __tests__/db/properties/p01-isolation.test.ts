import { afterEach, describe, it, expect, vi } from 'vitest';
import fc from 'fast-check';
import { randomUUID } from 'node:crypto';

// Feature: projection-engine-cycle-view, Property 1: Workspace data isolation
// **Validates: Requirements 1.3**

const todayArb = fc
  .integer({ min: Date.UTC(2000, 0, 1), max: Date.UTC(2099, 11, 31) })
  .map((ms) => new Date(ms).toISOString().slice(0, 10));

describe('Property 1: Workspace data isolation (mocked prisma)', () => {
  afterEach(() => {
    vi.doUnmock('@/lib/db');
    vi.doUnmock('@/lib/workspace');
    vi.doUnmock('@/lib/holidays/fetch');
    vi.resetModules();
  });

  it('projection route scopes every model query by the resolved workspaceId', async () => {
    await fc.assert(
      fc.asyncProperty(fc.uuid(), todayArb, async (workspaceId, today) => {
        const accountFindMany = vi.fn().mockResolvedValue([]);
        const scheduleFindMany = vi.fn().mockResolvedValue([]);
        const oneOffFindMany = vi.fn().mockResolvedValue([]);
        const workspaceUpdate = vi.fn().mockResolvedValue({});

        vi.resetModules();
        vi.doMock('@/lib/db', () => ({
          prisma: {
            account: { findMany: accountFindMany },
            schedule: { findMany: scheduleFindMany },
            oneOffEntry: { findMany: oneOffFindMany },
            workspace: { update: workspaceUpdate },
          },
        }));
        vi.doMock('@/lib/workspace', () => ({
          resolveWorkspace: vi.fn().mockResolvedValue({
            workspace: {
              id: workspaceId,
              projectionHorizonDays: 30,
              lowBalanceThresholdCents: 10000,
            },
            setCookie: null,
          }),
        }));
        vi.doMock('@/lib/holidays/fetch', () => ({
          fetchHolidays: vi.fn().mockResolvedValue([]),
        }));

        const { GET } = await import('@/app/api/projection/route');
        const { NextRequest } = await import('next/server');
        // Result status is irrelevant (empty accounts); only the query shape matters.
        await GET(new NextRequest(`http://localhost/api/projection?today=${today}`));

        for (const fn of [accountFindMany, scheduleFindMany, oneOffFindMany]) {
          expect(fn).toHaveBeenCalled();
          for (const call of fn.mock.calls) {
            expect(call[0]).toEqual({ where: { workspaceId } });
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

describe.skipIf(!hasDb)('Property 1: Workspace data isolation (DB)', () => {
  it('queries for workspace A never return workspace B rows', async () => {
    const { prisma } = await import('@/lib/db');
    const { seedWorkspace } = await import('@/lib/seed-workspace');
    const created: string[] = [];
    try {
      await fc.assert(
        fc.asyncProperty(todayArb, async (today) => {
          const a = randomUUID();
          const b = randomUUID();
          created.push(a, b);
          await seedWorkspace(a, today);
          await seedWorkspace(b, today);

          const [accA, schA, entA, accB, schB, entB] = await Promise.all([
            prisma.account.findMany({ where: { workspaceId: a } }),
            prisma.schedule.findMany({ where: { workspaceId: a } }),
            prisma.oneOffEntry.findMany({ where: { workspaceId: a } }),
            prisma.account.findMany({ where: { workspaceId: b } }),
            prisma.schedule.findMany({ where: { workspaceId: b } }),
            prisma.oneOffEntry.findMany({ where: { workspaceId: b } }),
          ]);

          expect(accA.length).toBeGreaterThan(0);
          expect(accB.length).toBeGreaterThan(0);
          for (const rows of [accA, schA, entA]) {
            expect(rows.every((r) => r.workspaceId === a)).toBe(true);
          }
          const bIds = new Set([...accB, ...schB, ...entB].map((r) => r.id));
          for (const r of [...accA, ...schA, ...entA]) {
            expect(bIds.has(r.id)).toBe(false);
          }
        }),
        { numRuns: 10 },
      );
    } finally {
      await prisma.workspace.deleteMany({ where: { id: { in: created } } });
      await prisma.$disconnect();
    }
  }, 120_000);
});
