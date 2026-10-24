import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import {
  lineItemDelta,
  type BalanceDelta,
  postedOneOffBalanceDelta,
  postingBalanceDelta,
} from '@/lib/entry-service/balance-delta'

// Feature: plan-vs-actual-envelopes, Property 6: Balance delta follows the posting rules

const cents = fc.integer({ min: 1, max: 999_999_999 })
const estimate = fc.integer({ min: 0, max: 999_999_999 })
const date = fc
  .integer({ min: 0, max: 3650 })
  .map((n) => new Date(Date.UTC(2025, 0, 1) + n * 86_400_000).toISOString().slice(0, 10))

describe('Property 6: balance delta follows the posting rules', () => {
  /** **Validates: Requirements 3.1** */
  it('planned debit moves ledger and available by -A', () => {
    fc.assert(
      fc.property(estimate, cents, date, (e, a, d) => {
        const delta = postingBalanceDelta({
          direction: 'DEBIT',
          status: 'PLANNED',
          estimateMagnitudeCents: e,
          actualMagnitudeCents: a,
          actualDate: d,
        })
        expect(delta).toEqual({ ledgerCents: -a, availableCents: -a })
      }),
    )
  })

  /** **Validates: Requirements 3.4** */
  it('pending debit moves ledger by -A and available by E - A', () => {
    fc.assert(
      fc.property(estimate, cents, date, (e, a, d) => {
        const delta = postingBalanceDelta({
          direction: 'DEBIT',
          status: 'PENDING',
          estimateMagnitudeCents: e,
          actualMagnitudeCents: a,
          actualDate: d,
        })
        expect(delta).toEqual({ ledgerCents: -a, availableCents: e - a })
      }),
    )
  })

  /** **Validates: Requirements 3.2, 3.3** */
  it('income raises ledger by A; available only when no later hold', () => {
    fc.assert(
      fc.property(
        estimate,
        cents,
        date,
        fc.option(date, { nil: undefined }),
        fc.constantFrom('PLANNED' as const, 'PENDING' as const),
        (e, a, d, hold, status) => {
          const delta = postingBalanceDelta({
            direction: 'INCOME',
            status,
            estimateMagnitudeCents: e,
            actualMagnitudeCents: a,
            actualDate: d,
            holdReleaseDate: hold,
          })
          const held = hold !== undefined && hold > d
          expect(delta.ledgerCents).toBe(a)
          expect(delta.availableCents).toBe(held ? 0 : a)
        },
      ),
    )
  })

  /** **Validates: Requirements 3.9, 3.10, 3.11** */
  it('posted one-off follows the planned rules for both directions', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('INCOME' as const, 'DEBIT' as const),
        cents,
        date,
        fc.option(date, { nil: undefined }),
        (direction, a, d, hold) => {
          const delta = postedOneOffBalanceDelta({
            direction,
            actualMagnitudeCents: a,
            actualDate: d,
            holdReleaseDate: hold,
          })
          if (direction === 'DEBIT') {
            expect(delta).toEqual({ ledgerCents: -a, availableCents: -a })
          } else {
            const held = hold !== undefined && hold > d
            expect(delta).toEqual({ ledgerCents: a, availableCents: held ? 0 : a })
          }
        },
      ),
    )
  })

  /** **Validates: Requirements 3.1, 3.2, 3.9** — examples */
  it('matches worked examples', () => {
    expect(
      postingBalanceDelta({
        direction: 'DEBIT',
        status: 'PENDING',
        estimateMagnitudeCents: 8500,
        actualMagnitudeCents: 9200,
        actualDate: '2026-03-02',
      }),
    ).toEqual({ ledgerCents: -9200, availableCents: -700 })
    expect(
      postingBalanceDelta({
        direction: 'INCOME',
        status: 'PLANNED',
        estimateMagnitudeCents: 240000,
        actualMagnitudeCents: 235000,
        actualDate: '2026-03-02',
        holdReleaseDate: '2026-03-04',
      }),
    ).toEqual({ ledgerCents: 235000, availableCents: 0 })
  })

  // Requirement 4.1 (skip changes no balance) is covered by planSkip's own tests (task 2.6),
  // since planSkip is implemented in task 2.4.
})

// Feature: plan-vs-actual-envelopes, Property 19: Line item balance changes are exact and reversible

interface Balances {
  ledgerCents: number
  availableCents: number | null
}

/** Small pure apply helper: ledger always moves; a null available balance stays null. */
function applyDelta(b: Balances, d: BalanceDelta): Balances {
  return {
    ledgerCents: b.ledgerCents + d.ledgerCents,
    availableCents: b.availableCents === null ? null : b.availableCents + d.availableCents,
  }
}

const amount = fc.integer({ min: 1, max: 999_999_999 })
const startBalance = fc.integer({ min: -999_999_999, max: 999_999_999 })
const startAvailable = fc.option(startBalance, { nil: null })

describe('Property 19: line item balance changes are exact and reversible', () => {
  /** **Validates: Requirements 8.10, 10.2, 10.3, 10.7** */
  it('create is -X, edit A to B is A - B, delete is +A on both balances', () => {
    fc.assert(
      fc.property(amount, amount, (a, b) => {
        expect(lineItemDelta({ kind: 'create', amountCents: a })).toEqual({
          ledgerCents: -a,
          availableCents: -a,
        })
        expect(lineItemDelta({ kind: 'edit', oldCents: a, newCents: b })).toEqual({
          ledgerCents: a - b,
          availableCents: a - b,
        })
        expect(lineItemDelta({ kind: 'delete', amountCents: a })).toEqual({
          ledgerCents: a,
          availableCents: a,
        })
      }),
    )
  })

  /** **Validates: Requirements 10.2, 10.3, 10.7** */
  it('create then delete restores starting balances; null available stays null', () => {
    fc.assert(
      fc.property(startBalance, startAvailable, amount, (ledger, available, x) => {
        const start: Balances = { ledgerCents: ledger, availableCents: available }
        const afterCreate = applyDelta(start, lineItemDelta({ kind: 'create', amountCents: x }))
        if (available === null) expect(afterCreate.availableCents).toBeNull()
        expect(afterCreate.ledgerCents).toBe(ledger - x)
        const afterDelete = applyDelta(
          afterCreate,
          lineItemDelta({ kind: 'delete', amountCents: x }),
        )
        expect(afterDelete).toEqual(start)
      }),
    )
  })

  /** **Validates: Requirements 8.10, 10.7** */
  it('edit A to B then B to A restores starting balances', () => {
    fc.assert(
      fc.property(startBalance, startAvailable, amount, amount, (ledger, available, a, b) => {
        const start: Balances = { ledgerCents: ledger, availableCents: available }
        const edited = applyDelta(start, lineItemDelta({ kind: 'edit', oldCents: a, newCents: b }))
        const back = applyDelta(edited, lineItemDelta({ kind: 'edit', oldCents: b, newCents: a }))
        expect(back).toEqual(start)
      }),
    )
  })
})
