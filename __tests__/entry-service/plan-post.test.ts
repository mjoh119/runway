import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { planPost, planSkip, type PostableEntry } from '@/lib/entry-service/plan-post'
import { entryVariance } from '@/lib/projection/variance'
import type { Entry } from '@/lib/projection/types'

// Feature: plan-vs-actual-envelopes, Property 4: Posting records the signed actual and keeps the estimate

const TODAY = '2026-06-15'

const magnitude = fc.integer({ min: 1, max: 999_999_999 })
const direction = fc.constantFrom('INCOME' as const, 'DEBIT' as const)
const openStatus = fc.constantFrom('PLANNED' as const, 'PENDING' as const)
// Dates on or before TODAY.
const pastDate = fc
  .integer({ min: 0, max: 400 })
  .map((n) => new Date(Date.UTC(2026, 5, 15) - n * 86_400_000).toISOString().slice(0, 10))
// Stored estimates may be signed either way; only the magnitude and direction matter.
const storedSign = fc.constantFrom(1, -1)

const sign = (d: 'INCOME' | 'DEBIT') => (d === 'INCOME' ? 1 : -1)

describe('Property 4: posting records the signed actual and keeps the estimate', () => {
  /** **Validates: Requirements 2.1, 2.7, 2.8** */
  it('actual is signed by direction, estimate is kept, status POSTED, date recorded', () => {
    fc.assert(
      fc.property(direction, openStatus, magnitude, magnitude, storedSign, pastDate, (dir, status, e, a, s, d) => {
        const entry: PostableEntry = { entryType: dir, status, estimatedAmountCents: s * e }
        const result = planPost(entry, { amountCents: a, actualDate: d, today: TODAY })
        expect(result.ok).toBe(true)
        if (!result.ok) return
        const plan = result.value
        expect(plan.status).toBe('POSTED')
        expect(plan.actualAmountCents).toBe(sign(dir) * a)
        expect(plan.estimatedAmountCents).toBe(sign(dir) * e)
        expect(plan.actualDate).toBe(d)
        expect(Number.isInteger(plan.actualAmountCents)).toBe(true)
      }),
    )
  })

  /** **Validates: Requirements 2.1, 2.8** */
  it('posting on today is allowed', () => {
    const result = planPost(
      { entryType: 'DEBIT', status: 'PLANNED', estimatedAmountCents: -1000 },
      { amountCents: 1000, actualDate: TODAY, today: TODAY },
    )
    expect(result.ok).toBe(true)
  })
})

describe('variance examples from planned values (Requirements 6.2 to 6.5)', () => {
  function varianceOf(entryType: 'INCOME' | 'DEBIT', estimate: number, posted: number): number {
    const planned = planPost(
      { entryType, status: 'PLANNED', estimatedAmountCents: estimate },
      { amountCents: Math.abs(posted), actualDate: TODAY, today: TODAY },
    )
    if (!planned.ok) throw new Error('plan failed')
    const entry: Entry = {
      id: 'e1',
      accountId: 'a1',
      scheduleId: null,
      postDate: TODAY,
      shiftedPostDate: TODAY,
      estimatedAmountCents: planned.value.estimatedAmountCents,
      actualAmountCents: planned.value.actualAmountCents,
      status: planned.value.status,
      entryType,
      actualDate: planned.value.actualDate,
    }
    return entryVariance(entry)
  }

  /** **Validates: Requirements 6.2** */
  it('debit -8,500 posted at -9,200 gives -700', () => {
    expect(varianceOf('DEBIT', -8_500, -9_200)).toBe(-700)
  })

  /** **Validates: Requirements 6.3** */
  it('debit -8,500 posted at -7,000 gives +1,500', () => {
    expect(varianceOf('DEBIT', -8_500, -7_000)).toBe(1_500)
  })

  /** **Validates: Requirements 6.4** */
  it('income 240,000 posted at 235,000 gives -5,000', () => {
    expect(varianceOf('INCOME', 240_000, 235_000)).toBe(-5_000)
  })

  /** **Validates: Requirements 6.5** */
  it('posting at the estimate gives 0', () => {
    expect(varianceOf('DEBIT', -8_500, -8_500)).toBe(0)
    expect(varianceOf('INCOME', 240_000, 240_000)).toBe(0)
  })
})

// Feature: plan-vs-actual-envelopes, Property 5: Invalid post and skip requests are rejected without a plan

const closedStatus = fc.constantFrom('POSTED' as const, 'SKIPPED' as const)
const futureDate = fc
  .integer({ min: 1, max: 400 })
  .map((n) => new Date(Date.UTC(2026, 5, 15) + n * 86_400_000).toISOString().slice(0, 10))
const badDate = fc.constantFrom('', 'abc', '2026-13-01', '2026-02-30', '2026-6-1', '06/15/2026')

describe('Property 5: invalid post and skip requests are rejected without a plan', () => {
  /** **Validates: Requirements 2.3** */
  it('posting a POSTED or SKIPPED entry is rejected', () => {
    fc.assert(
      fc.property(direction, closedStatus, magnitude, magnitude, pastDate, (dir, status, e, a, d) => {
        const result = planPost(
          { entryType: dir, status, estimatedAmountCents: e },
          { amountCents: a, actualDate: d, today: TODAY },
        )
        expect(result.ok).toBe(false)
        if (result.ok) return
        expect(result.error.code).toBe('VALIDATION')
        expect(result.error.message).toBe('This entry cannot be posted from its current status')
      }),
    )
  })

  /** **Validates: Requirements 2.4** */
  it('posting with a future or invalid actual date is rejected', () => {
    fc.assert(
      fc.property(direction, openStatus, magnitude, magnitude, fc.oneof(futureDate, badDate), (dir, status, e, a, d) => {
        const result = planPost(
          { entryType: dir, status, estimatedAmountCents: e },
          { amountCents: a, actualDate: d, today: TODAY },
        )
        expect(result.ok).toBe(false)
        if (result.ok) return
        expect(result.error.code).toBe('VALIDATION')
        expect(result.error.field).toBe('actualDate')
        expect(['An actual cannot be dated in the future', 'Enter a valid date']).toContain(result.error.message)
        if (d > TODAY && /^\d{4}-\d{2}-\d{2}$/.test(d) && d !== '2026-13-01' && d !== '2026-02-30') {
          expect(result.error.message).toBe('An actual cannot be dated in the future')
        }
      }),
    )
  })

  /** **Validates: Requirements 4.4** */
  it('skipping a POSTED or SKIPPED entry is rejected', () => {
    fc.assert(
      fc.property(closedStatus, (status) => {
        const result = planSkip({ status })
        expect(result.ok).toBe(false)
        if (result.ok) return
        expect(result.error.code).toBe('VALIDATION')
        expect(result.error.message).toBe('This entry cannot be skipped from its current status')
      }),
    )
  })

  /** **Validates: Requirements 4.1** */
  it('skipping a PLANNED or PENDING entry yields SKIPPED with zero balance delta', () => {
    fc.assert(
      fc.property(openStatus, (status) => {
        const result = planSkip({ status })
        expect(result.ok).toBe(true)
        if (!result.ok) return
        expect(result.value.status).toBe('SKIPPED')
        expect(result.value.balanceDelta).toEqual({ ledgerCents: 0, availableCents: 0 })
      }),
    )
  })
})
