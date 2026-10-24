import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { buildOccurrenceRecord, parseEntryRef } from '@/lib/entry-service/occurrence'

// Feature: plan-vs-actual-envelopes, Property 8: Occurrence records replace generated occurrences (record builder part)

const cents = fc.integer({ min: 1, max: 999_999_999 })
const direction = fc.constantFrom('INCOME' as const, 'DEBIT' as const)
const storedSign = fc.constantFrom(1, -1)
const idChars = fc.stringMatching(/^[a-z0-9]{1,25}$/)
const isoDate = fc
  .integer({ min: 0, max: 3000 })
  .map((n) => new Date(Date.UTC(2020, 0, 1) + n * 86_400_000).toISOString().slice(0, 10))
const sign = (d: 'INCOME' | 'DEBIT') => (d === 'INCOME' ? 1 : -1)

const scheduleArb = fc.record({
  id: idChars,
  accountId: idChars,
  name: fc.string({ minLength: 1, maxLength: 30 }),
  entryType: direction,
  estimatedAmountCents: fc.tuple(cents, storedSign).map(([c, s]) => c * s),
})

describe('Property 8: occurrence record building', () => {
  /** **Validates: Requirements 2.5, 4.2** */
  it('POSTED record keeps the original date, signs estimate and actual by direction', () => {
    fc.assert(
      fc.property(scheduleArb, isoDate, cents, isoDate, (schedule, occ, actual, actualDate) => {
        const r = buildOccurrenceRecord(schedule, occ, { status: 'POSTED', actualAmountCents: actual, actualDate })
        expect(r.status).toBe('POSTED')
        expect(r.scheduleId).toBe(schedule.id)
        expect(r.accountId).toBe(schedule.accountId)
        expect(r.occurrenceDate).toBe(occ)
        expect(r.entryType).toBe(schedule.entryType)
        expect(r.description).toBe(schedule.name)
        expect(r.estimatedAmountCents).toBe(sign(schedule.entryType) * Math.abs(schedule.estimatedAmountCents))
        expect(r.actualAmountCents).toBe(sign(schedule.entryType) * actual)
        expect(r.actualDate).toBe(actualDate)
      }),
    )
  })

  /** **Validates: Requirements 4.2** */
  it('SKIPPED record has no actual amount or date and keeps the signed estimate', () => {
    fc.assert(
      fc.property(scheduleArb, isoDate, (schedule, occ) => {
        const r = buildOccurrenceRecord(schedule, occ, { status: 'SKIPPED' })
        expect(r.status).toBe('SKIPPED')
        expect(r.actualAmountCents).toBeNull()
        expect(r.actualDate).toBeNull()
        expect(r.occurrenceDate).toBe(occ)
        expect(r.estimatedAmountCents).toBe(sign(schedule.entryType) * Math.abs(schedule.estimatedAmountCents))
      }),
    )
  })

  /** **Validates: Requirements 2.5** */
  it('generated id "<scheduleId>:<date>" round-trips through parseEntryRef', () => {
    fc.assert(
      fc.property(idChars, isoDate, (scheduleId, date) => {
        expect(parseEntryRef(`${scheduleId}:${date}`)).toEqual({
          kind: 'OCCURRENCE',
          scheduleId,
          occurrenceDate: date,
        })
      }),
    )
  })

  /** **Validates: Requirements 2.5** */
  it('ids without a colon are one-offs', () => {
    fc.assert(
      fc.property(idChars, (id) => {
        expect(parseEntryRef(id)).toEqual({ kind: 'ONE_OFF', id })
      }),
    )
  })
})

describe('parseEntryRef examples', () => {
  it('treats a cuid as a one-off', () => {
    expect(parseEntryRef('cl9ebqhxk00003b600tymydho')).toEqual({
      kind: 'ONE_OFF',
      id: 'cl9ebqhxk00003b600tymydho',
    })
  })

  it('parses <scheduleId>:<date> as an occurrence', () => {
    expect(parseEntryRef('cl9ebqhxk00003b600tymydho:2026-06-15')).toEqual({
      kind: 'OCCURRENCE',
      scheduleId: 'cl9ebqhxk00003b600tymydho',
      occurrenceDate: '2026-06-15',
    })
  })

  it('does not treat a malformed date suffix as an occurrence', () => {
    expect(parseEntryRef('abc:2026-6-15').kind).toBe('ONE_OFF')
  })
})
