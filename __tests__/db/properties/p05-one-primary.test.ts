import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { randomUUID } from 'node:crypto';
import { generateDemoData } from '@/sources/fake-source';

// Feature: projection-engine-cycle-view, Property 5: Exactly one primary account
// **Validates: Requirements 3.3**

/** Random valid 'YYYY-MM-DD' between 2000-01-01 and 2099-12-31. */
const todayArb = fc
  .integer({ min: Date.UTC(2000, 0, 1), max: Date.UTC(2099, 11, 31) })
  .map((ms) => new Date(ms).toISOString().slice(0, 10));

describe('Property 5: Exactly one primary account (pure)', () => {
  it('generateDemoData(today) always has exactly one primary account', () => {
    fc.assert(
      fc.property(todayArb, (today) => {
        const demo = generateDemoData(today);
        expect(demo.accounts.filter((a) => a.isPrimary)).toHaveLength(1);
      }),
      { numRuns: 100 },
    );
  });
});

/** DATABASE_URL may hold a placeholder; only run DB tests if the DB answers. */
async function dbReachable(): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  try {
    const { prisma } = await import('@/lib/db');
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}
const hasDb = await dbReachable();

describe.skipIf(!hasDb)('Property 5: Exactly one primary account (DB)', () => {
  it('every seeded workspace has exactly one primary account', async () => {
    const { prisma } = await import('@/lib/db');
    const { seedWorkspace } = await import('@/lib/seed-workspace');
    const created: string[] = [];
    try {
      await fc.assert(
        fc.asyncProperty(todayArb, async (today) => {
          const workspaceId = randomUUID();
          created.push(workspaceId);
          await seedWorkspace(workspaceId, today);
          const primaries = await prisma.account.count({
            where: { workspaceId, isPrimary: true },
          });
          expect(primaries).toBe(1);

          // Re-seeding (reset) must keep the invariant.
          await seedWorkspace(workspaceId, today);
          expect(
            await prisma.account.count({ where: { workspaceId, isPrimary: true } }),
          ).toBe(1);
        }),
        { numRuns: 20 },
      );
    } finally {
      await prisma.workspace.deleteMany({ where: { id: { in: created } } });
      await prisma.$disconnect();
    }
  }, 120_000);
});
