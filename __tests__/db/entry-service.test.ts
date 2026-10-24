import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

/**
 * Database tests for Entry_Service. Require a Postgres database with the
 * schema applied (DATABASE_URL). Skipped when no database is configured.
 * Modules are imported lazily so the suite loads without a DB.
 *
 * Shared setup helpers live in the `describe` block; later tasks (7.7-7.9)
 * append their own nested describe blocks below the double-submit one.
 */
async function databaseReachable(): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false
  try {
    const { prisma } = await import('@/lib/db')
    await prisma.$queryRaw`SELECT 1`
    await prisma.workspace.count()
    await prisma.submissionKey.count()
    return true
  } catch {
    // Placeholder/unreachable DATABASE_URL or schema not applied: treat as "no database".
    return false
  }
}

const hasDb = await databaseReachable()

describe.skipIf(!hasDb)('Entry_Service (integration)', () => {
  type ServiceModule = typeof import('@/lib/entry-service/service')
  type DbModule = typeof import('@/lib/db')
  let svc: ServiceModule
  let db: DbModule['prisma']
  const created: string[] = []

  /** Fixed "today" so the tests do not depend on the wall clock. */
  const today = '2025-01-15'
  /** A monthly schedule occurrence that is due on or before `today`. */
  const occurrenceDate = '2025-01-10'
  const START_LEDGER = 100_000
  const START_AVAILABLE = 90_000

  beforeAll(async () => {
    svc = await import('@/lib/entry-service/service')
    db = (await import('@/lib/db')).prisma
  })

  afterAll(async () => {
    if (!db) return
    for (const id of created) {
      // Children cascade on workspace delete.
      await db.workspace.deleteMany({ where: { id } })
    }
    await db.$disconnect()
  })

  interface Fixture {
    workspaceId: string
    accountId: string
    scheduleId: string
    envelopeId: string
  }

  /** One workspace: primary account, a monthly -$85.00 bill, and one envelope. */
  async function createFixture(
    opts: { availableBalanceCents?: number | null } = {},
  ): Promise<Fixture> {
    const availableBalanceCents =
      'availableBalanceCents' in opts ? (opts.availableBalanceCents ?? null) : START_AVAILABLE
    const workspace = await db.workspace.create({ data: {} })
    created.push(workspace.id)
    const account = await db.account.create({
      data: {
        workspaceId: workspace.id,
        name: 'Checking',
        type: 'CHECKING',
        isPrimary: true,
        ledgerBalanceCents: START_LEDGER,
        availableBalanceCents,
      },
    })
    const schedule = await db.schedule.create({
      data: {
        workspaceId: workspace.id,
        name: 'Internet',
        accountId: account.id,
        intervalType: 'MONTHS',
        intervalValue: 1,
        daysOfMonth: [],
        startDate: new Date(`${occurrenceDate}T00:00:00.000Z`),
        estimatedAmountCents: -8_500,
        entryType: 'DEBIT',
      },
    })
    const envelope = await db.envelope.create({
      data: {
        workspaceId: workspace.id,
        name: 'Groceries',
        nameKey: 'groceries',
        budgetCents: 20_000,
        resetPeriod: 'WEEKLY',
      },
    })
    return {
      workspaceId: workspace.id,
      accountId: account.id,
      scheduleId: schedule.id,
      envelopeId: envelope.id,
    }
  }

  async function balances(accountId: string) {
    const a = await db.account.findUniqueOrThrow({ where: { id: accountId } })
    return { ledger: a.ledgerBalanceCents, available: a.availableBalanceCents }
  }

  const keyCount = (workspaceId: string, key?: string) =>
    db.submissionKey.count({ where: { workspaceId, ...(key ? { key } : {}) } })

  const postRequest = (f: Fixture, submissionKey: string) => ({
    entryRef: `${f.scheduleId}:${occurrenceDate}`,
    amountCents: 9_200,
    actualDate: occurrenceDate,
    today,
    submissionKey,
  })

  const purchaseRequest = (f: Fixture, submissionKey: string) => ({
    envelopeId: f.envelopeId,
    amountText: '12.34',
    purchaseDate: today,
    description: 'Test purchase',
    today,
    submissionKey,
  })

  const oneOffRequest = (submissionKey: string) => ({
    direction: 'DEBIT',
    amountCents: 4_000,
    date: '2025-01-12',
    description: 'Already paid',
    alreadyHappened: true,
    today,
    submissionKey,
  })

  describe('double-submit protection', () => {
    it('post: the same request twice records once and moves balances once', async () => {
      const f = await createFixture()
      const key = randomUUID()

      const first = await svc.postActual(f.workspaceId, postRequest(f, key))
      const second = await svc.postActual(f.workspaceId, postRequest(f, key))

      expect(second).toEqual(first)
      expect(await db.occurrenceRecord.count({ where: { workspaceId: f.workspaceId } })).toBe(1)
      expect(await balances(f.accountId)).toEqual({
        ledger: START_LEDGER - 9_200,
        available: START_AVAILABLE - 9_200,
      })
      expect(await keyCount(f.workspaceId, key)).toBe(1)
    })

    it('purchase: the same request twice creates one line item and moves balances once', async () => {
      const f = await createFixture()
      const key = randomUUID()

      const first = await svc.createLineItem(f.workspaceId, purchaseRequest(f, key))
      const second = await svc.createLineItem(f.workspaceId, purchaseRequest(f, key))

      expect(second).toEqual(first)
      expect(await db.lineItem.count({ where: { workspaceId: f.workspaceId } })).toBe(1)
      expect(await balances(f.accountId)).toEqual({
        ledger: START_LEDGER - 1_234,
        available: START_AVAILABLE - 1_234,
      })
      expect(await keyCount(f.workspaceId, key)).toBe(1)
    })

    it('already-happened one-off: the same key twice creates one entry and moves balances once', async () => {
      const f = await createFixture()
      const key = randomUUID()

      const first = await svc.addOneOff(f.workspaceId, oneOffRequest(key))
      const second = await svc.addOneOff(f.workspaceId, oneOffRequest(key))

      expect(first.status).toBe('POSTED')
      expect(second).toEqual(first)
      expect(await db.oneOffEntry.count({ where: { workspaceId: f.workspaceId } })).toBe(1)
      expect(await balances(f.accountId)).toEqual({
        ledger: START_LEDGER - 4_000,
        available: START_AVAILABLE - 4_000,
      })
      expect(await keyCount(f.workspaceId, key)).toBe(1)
    })

    it('concurrent requests with one key apply exactly one', async () => {
      const f = await createFixture()
      const key = randomUUID()

      const results = await Promise.all([
        svc.createLineItem(f.workspaceId, purchaseRequest(f, key)),
        svc.createLineItem(f.workspaceId, purchaseRequest(f, key)),
      ])

      expect(results[1]).toEqual(results[0])
      expect(await db.lineItem.count({ where: { workspaceId: f.workspaceId } })).toBe(1)
      expect(await balances(f.accountId)).toEqual({
        ledger: START_LEDGER - 1_234,
        available: START_AVAILABLE - 1_234,
      })
      expect(await keyCount(f.workspaceId, key)).toBe(1)
    })

    it('the same key in two workspaces applies in both', async () => {
      const a = await createFixture()
      const b = await createFixture()
      const key = randomUUID()

      await svc.createLineItem(a.workspaceId, purchaseRequest(a, key))
      await svc.createLineItem(b.workspaceId, purchaseRequest(b, key))

      for (const f of [a, b]) {
        expect(await db.lineItem.count({ where: { workspaceId: f.workspaceId } })).toBe(1)
        expect(await balances(f.accountId)).toEqual({
          ledger: START_LEDGER - 1_234,
          available: START_AVAILABLE - 1_234,
        })
        expect(await keyCount(f.workspaceId, key)).toBe(1)
      }
    })

    it('a rejected request leaves no key row and no change, and the key stays usable', async () => {
      const f = await createFixture()
      const key = randomUUID()

      await expect(
        svc.createLineItem(f.workspaceId, { ...purchaseRequest(f, key), amountText: '12.345' }),
      ).rejects.toMatchObject({ code: 'VALIDATION' })

      expect(await keyCount(f.workspaceId)).toBe(0)
      expect(await db.lineItem.count({ where: { workspaceId: f.workspaceId } })).toBe(0)
      expect(await balances(f.accountId)).toEqual({
        ledger: START_LEDGER,
        available: START_AVAILABLE,
      })

      // A corrected retry with the same key applies normally.
      await svc.createLineItem(f.workspaceId, purchaseRequest(f, key))
      expect(await db.lineItem.count({ where: { workspaceId: f.workspaceId } })).toBe(1)
      expect(await keyCount(f.workspaceId, key)).toBe(1)
    })
  })

  describe('one-off behavior', () => {
    /** Map stored one-off rows to projection entries (shiftedPostDate = postDate). */
    async function storedEntries(workspaceId: string) {
      const rows = await db.oneOffEntry.findMany({ where: { workspaceId } })
      return rows.map((r) => ({
        id: r.id,
        accountId: r.accountId,
        scheduleId: null,
        postDate: r.postDate.toISOString().split('T')[0],
        shiftedPostDate: r.postDate.toISOString().split('T')[0],
        estimatedAmountCents: r.estimatedAmountCents,
        actualAmountCents: r.actualAmountCents,
        status: r.status,
        entryType: r.entryType,
      }))
    }

    it('a past-dated already-happened one-off is POSTED, moves balances, and is not overdue', async () => {
      const f = await createFixture()
      const key = randomUUID()

      const result = await svc.addOneOff(f.workspaceId, oneOffRequest(key))

      expect(result.status).toBe('POSTED')
      const rows = await db.oneOffEntry.findMany({ where: { workspaceId: f.workspaceId } })
      expect(rows).toHaveLength(1)
      expect(rows[0].status).toBe('POSTED')
      expect(rows[0].actualAmountCents).not.toBeNull()
      expect(rows[0].actualAmountCents).toBe(rows[0].estimatedAmountCents)
      expect(await balances(f.accountId)).toEqual({
        ledger: START_LEDGER - 4_000,
        available: START_AVAILABLE - 4_000,
      })

      const { findOverdueEntries } = await import('@/lib/projection/warnings')
      const overdue = findOverdueEntries(await storedEntries(f.workspaceId), today)
      expect(overdue).toEqual([])
    })

    it('a past-dated planned one-off is rejected with no entry, balance, or key change', async () => {
      const f = await createFixture()
      const key = randomUUID()

      await expect(
        svc.addOneOff(f.workspaceId, { ...oneOffRequest(key), alreadyHappened: false }),
      ).rejects.toMatchObject({ message: 'Planned entries need a date today or later' })

      expect(await db.oneOffEntry.count({ where: { workspaceId: f.workspaceId } })).toBe(0)
      expect(await balances(f.accountId)).toEqual({
        ledger: START_LEDGER,
        available: START_AVAILABLE,
      })
      expect(await keyCount(f.workspaceId)).toBe(0)
    })
  })

  describe('rollback, null balances, and reflection', () => {
    const STALE = new Date('2000-01-01T00:00:00.000Z')

    afterEach(() => {
      vi.restoreAllMocks()
    })

    const markStale = (workspaceId: string) =>
      db.workspace.update({ where: { id: workspaceId }, data: { lastActivity: STALE } })

    const lastActivity = async (workspaceId: string) =>
      (await db.workspace.findUniqueOrThrow({ where: { id: workspaceId } })).lastActivity

    const expectBumped = async (workspaceId: string) => {
      expect((await lastActivity(workspaceId)).getTime()).toBeGreaterThan(STALE.getTime())
      await markStale(workspaceId)
    }

    /** Fetch the projection + envelope cards the way a page load would. */
    async function view(f: Fixture) {
      const { buildWorkspaceView } = await import('@/lib/projection-service')
      const { view: v } = await buildWorkspaceView(
        { cookies: { get: () => ({ value: f.workspaceId }) } },
        today,
      )
      return v
    }

    const card = (v: Awaited<ReturnType<typeof view>>, f: Fixture) =>
      v.envelopes.find((e) => e.id === f.envelopeId)!

    it('a failure after the status update rolls back status, balances, key, and lastActivity', async () => {
      const f = await createFixture()
      const oneOff = await db.oneOffEntry.create({
        data: {
          workspaceId: f.workspaceId,
          accountId: f.accountId,
          postDate: new Date(`${occurrenceDate}T00:00:00.000Z`),
          estimatedAmountCents: -9_000,
          status: 'PLANNED',
          entryType: 'DEBIT',
          description: 'Rollback target',
        },
      })
      await markStale(f.workspaceId)

      // Make the balance step (which runs after the status update) throw.
      const client = db as unknown as {
        $transaction: (fn: (tx: unknown) => Promise<unknown>, ...rest: unknown[]) => Promise<unknown>
      }
      const original = client.$transaction.bind(db)
      vi.spyOn(client, '$transaction').mockImplementation((fn, ...rest) =>
        original(async (tx: unknown) => {
          const wrapped = new Proxy(tx as object, {
            get(target, prop, receiver) {
              if (prop === 'account') {
                return {
                  updateMany: async () => {
                    throw new Error('forced failure')
                  },
                }
              }
              return Reflect.get(target, prop, receiver)
            },
          })
          return fn(wrapped)
        }, ...rest),
      )

      const key = randomUUID()
      await expect(
        svc.postActual(f.workspaceId, {
          entryRef: oneOff.id,
          amountCents: 9_200,
          actualDate: occurrenceDate,
          today,
          submissionKey: key,
        }),
      ).rejects.toThrow('forced failure')
      vi.restoreAllMocks()

      const after = await db.oneOffEntry.findUniqueOrThrow({ where: { id: oneOff.id } })
      expect(after.status).toBe('PLANNED')
      expect(after.actualAmountCents).toBeNull()
      expect(after.actualDate).toBeNull()
      expect(await balances(f.accountId)).toEqual({
        ledger: START_LEDGER,
        available: START_AVAILABLE,
      })
      expect(await keyCount(f.workspaceId)).toBe(0)
      expect((await lastActivity(f.workspaceId)).getTime()).toBe(STALE.getTime())
    })

    it('null available balance stays null through post, one-off, and line item create/edit/delete', async () => {
      const f = await createFixture({ availableBalanceCents: null })
      let ledger = START_LEDGER
      const expectNullAvailable = async () => {
        expect(await balances(f.accountId)).toEqual({ ledger, available: null })
      }

      await svc.postActual(f.workspaceId, postRequest(f, randomUUID()))
      ledger -= 9_200
      await expectNullAvailable()

      await svc.addOneOff(f.workspaceId, oneOffRequest(randomUUID()))
      ledger -= 4_000
      await expectNullAvailable()

      const item = await svc.createLineItem(f.workspaceId, purchaseRequest(f, randomUUID()))
      ledger -= 1_234
      await expectNullAvailable()

      await svc.updateLineItem(f.workspaceId, item.id, { amountText: '20.00', today })
      ledger -= 2_000 - 1_234
      await expectNullAvailable()

      await svc.deleteLineItem(f.workspaceId, item.id)
      ledger += 2_000
      await expectNullAvailable()

      // The projection treats the missing available balance as estimated.
      const v = await view(f)
      expect(v.projection.balances[0].ledgerBalanceCents).toBe(ledger)
      expect(v.projection.balances[0].isEstimated).toBe(true)
    })

    it('lastActivity bumps after each mutation', async () => {
      const f = await createFixture()
      await markStale(f.workspaceId)

      await svc.postActual(f.workspaceId, postRequest(f, randomUUID()))
      await expectBumped(f.workspaceId)

      await svc.addOneOff(f.workspaceId, oneOffRequest(randomUUID()))
      await expectBumped(f.workspaceId)

      const item = await svc.createLineItem(f.workspaceId, purchaseRequest(f, randomUUID()))
      await expectBumped(f.workspaceId)

      await svc.updateLineItem(f.workspaceId, item.id, { amountText: '20.00', today })
      await expectBumped(f.workspaceId)

      await svc.deleteLineItem(f.workspaceId, item.id)
      await expectBumped(f.workspaceId)
    })

    it('a projection fetched after each mutation reflects it', async () => {
      const f = await createFixture()
      let ledger = START_LEDGER
      let available = START_AVAILABLE
      const expectReflects = async (spent: number) => {
        const v = await view(f)
        const first = v.projection.balances[0]
        expect(first.ledgerBalanceCents).toBe(ledger)
        expect(first.availableBalanceCents).toBe(available)
        expect(card(v, f).spentCents).toBe(spent)
        return v
      }

      await svc.postActual(f.workspaceId, postRequest(f, randomUUID()))
      ledger -= 9_200
      available -= 9_200
      await expectReflects(0)

      await svc.addOneOff(f.workspaceId, oneOffRequest(randomUUID()))
      ledger -= 4_000
      available -= 4_000
      await expectReflects(0)

      const item = await svc.createLineItem(f.workspaceId, purchaseRequest(f, randomUUID()))
      ledger -= 1_234
      available -= 1_234
      const afterCreate = await expectReflects(1_234)
      expect(card(afterCreate, f).currentItems.map((i) => i.id)).toContain(item.id)

      await svc.updateLineItem(f.workspaceId, item.id, { amountText: '20.00', today })
      ledger -= 766
      available -= 766
      await expectReflects(2_000)

      await svc.deleteLineItem(f.workspaceId, item.id)
      ledger += 2_000
      available += 2_000
      const afterDelete = await expectReflects(0)
      expect(card(afterDelete, f).currentItems).toEqual([])
    })
  })

  describe('workspace isolation', () => {
    /** Everything the service can change in one workspace, for before/after comparison. */
    async function snapshot(f: Fixture) {
      const [account, envelopes, lineItems, oneOffs, records, keys] = await Promise.all([
        db.account.findMany({ where: { workspaceId: f.workspaceId }, orderBy: { id: 'asc' } }),
        db.envelope.findMany({ where: { workspaceId: f.workspaceId }, orderBy: { id: 'asc' } }),
        db.lineItem.findMany({ where: { workspaceId: f.workspaceId }, orderBy: { id: 'asc' } }),
        db.oneOffEntry.findMany({ where: { workspaceId: f.workspaceId }, orderBy: { id: 'asc' } }),
        db.occurrenceRecord.findMany({ where: { workspaceId: f.workspaceId } }),
        db.submissionKey.findMany({ where: { workspaceId: f.workspaceId } }),
      ])
      return { account, envelopes, lineItems, oneOffs, records, keys }
    }

    /** Workspace A and B, B with a line item and a planned one-off. */
    async function createPair() {
      const a = await createFixture()
      const b = await createFixture()
      const bItem = await svc.createLineItem(b.workspaceId, purchaseRequest(b, randomUUID()))
      const bOneOff = await db.oneOffEntry.create({
        data: {
          workspaceId: b.workspaceId,
          accountId: b.accountId,
          postDate: new Date(`${occurrenceDate}T00:00:00.000Z`),
          estimatedAmountCents: -9_000,
          status: 'PLANNED',
          entryType: 'DEBIT',
          description: 'B one-off',
        },
      })
      return { a, b, bItem, bOneOff }
    }

    /** Run an action as workspace A against B's ids; both workspaces must be unchanged. */
    async function expectNotFoundAndUnchanged(
      a: Fixture,
      b: Fixture,
      action: () => Promise<unknown>,
    ) {
      const beforeA = await snapshot(a)
      const beforeB = await snapshot(b)
      await expect(action()).rejects.toMatchObject({ code: 'NOT_FOUND' })
      expect(await snapshot(a)).toEqual(beforeA)
      expect(await snapshot(b)).toEqual(beforeB)
    }

    it("post: B's one-off and B's schedule occurrence are NOT_FOUND in A", async () => {
      const { a, b, bOneOff } = await createPair()

      await expectNotFoundAndUnchanged(a, b, () =>
        svc.postActual(a.workspaceId, {
          entryRef: bOneOff.id,
          amountCents: 9_200,
          actualDate: occurrenceDate,
          today,
          submissionKey: randomUUID(),
        }),
      )
      await expectNotFoundAndUnchanged(a, b, () =>
        svc.postActual(a.workspaceId, {
          entryRef: `${b.scheduleId}:${occurrenceDate}`,
          amountCents: 9_200,
          actualDate: occurrenceDate,
          today,
          submissionKey: randomUUID(),
        }),
      )
    })

    it("skip: B's one-off and B's schedule occurrence are NOT_FOUND in A", async () => {
      const { a, b, bOneOff } = await createPair()

      await expectNotFoundAndUnchanged(a, b, () =>
        svc.skipEntry(a.workspaceId, { entryRef: bOneOff.id, today }),
      )
      await expectNotFoundAndUnchanged(a, b, () =>
        svc.skipEntry(a.workspaceId, { entryRef: `${b.scheduleId}:${occurrenceDate}`, today }),
      )
    })

    it("update and delete of B's line item are NOT_FOUND in A", async () => {
      const { a, b, bItem } = await createPair()

      await expectNotFoundAndUnchanged(a, b, () =>
        svc.updateLineItem(a.workspaceId, bItem.id, { amountText: '50.00', today }),
      )
      await expectNotFoundAndUnchanged(a, b, () => svc.deleteLineItem(a.workspaceId, bItem.id))
    })

    it("update of B's envelope is NOT_FOUND in A", async () => {
      const { a, b } = await createPair()

      await expectNotFoundAndUnchanged(a, b, () =>
        svc.updateEnvelope(a.workspaceId, b.envelopeId, {
          name: 'Renamed',
          budgetText: '99.00',
          resetPeriod: 'MONTHLY',
        }),
      )
    })

    it("creating a line item against B's envelope is NOT_FOUND in A and leaves no key", async () => {
      const { a, b } = await createPair()

      await expectNotFoundAndUnchanged(a, b, () =>
        svc.createLineItem(a.workspaceId, purchaseRequest(b, randomUUID())),
      )
      expect(await keyCount(a.workspaceId)).toBe(0)
    })

    it('deleting a missing line item is NOT_FOUND with no balance change', async () => {
      const f = await createFixture()
      const before = await balances(f.accountId)

      await expect(svc.deleteLineItem(f.workspaceId, randomUUID())).rejects.toMatchObject({
        code: 'NOT_FOUND',
      })
      expect(await balances(f.accountId)).toEqual(before)
      expect(before).toEqual({ ledger: START_LEDGER, available: START_AVAILABLE })
    })
  })
})
