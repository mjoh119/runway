import { describe, expect, it } from 'vitest'
import {
  GENERIC_ERROR_MESSAGE,
  errorToOutcome,
  failureOutcome,
  isValidDateString,
  parseAmountField,
  requireDate,
  requireString,
  successOutcome,
} from '@/lib/api-response'
import { ServiceError } from '@/lib/entry-service/errors'

describe('errorToOutcome', () => {
  it('maps VALIDATION to 400 with message and field', () => {
    expect(errorToOutcome(new ServiceError('VALIDATION', 'Bad amount', 'amountText'))).toEqual({
      status: 400,
      body: { ok: false, error: { message: 'Bad amount', field: 'amountText' } },
    })
  })

  it('maps NOT_FOUND to 404', () => {
    const out = errorToOutcome(new ServiceError('NOT_FOUND', 'Entry not found'))
    expect(out.status).toBe(404)
    expect(out.body).toEqual({ ok: false, error: { message: 'Entry not found', field: null } })
  })

  it('maps CONFLICT to 409', () => {
    const out = errorToOutcome(new ServiceError('CONFLICT', 'Cannot be posted from its current status'))
    expect(out.status).toBe(409)
    expect(out.body).toEqual({
      ok: false,
      error: { message: 'Cannot be posted from its current status', field: null },
    })
  })

  it('maps unexpected errors to 500 with a generic message that hides details', () => {
    for (const err of [new Error('connection string postgres://secret'), 'boom', null, undefined, { code: 'VALIDATION' }]) {
      const out = errorToOutcome(err)
      expect(out.status).toBe(500)
      expect(out.body).toEqual({ ok: false, error: { message: GENERIC_ERROR_MESSAGE, field: null } })
    }
  })

  it('maps a ServiceError with an unknown code to 500 generic', () => {
    const err = new ServiceError('VALIDATION', 'x')
    ;(err as unknown as { code: string }).code = 'OTHER'
    const out = errorToOutcome(err)
    expect(out.status).toBe(500)
    expect(out.body).toEqual({ ok: false, error: { message: GENERIC_ERROR_MESSAGE, field: null } })
  })
})

describe('outcome builders', () => {
  it('successOutcome defaults to 200', () => {
    expect(successOutcome({ a: 1 })).toEqual({ status: 200, body: { ok: true, result: { a: 1 } } })
    expect(successOutcome(1, 201).status).toBe(201)
  })

  it('failureOutcome defaults field to null', () => {
    expect(failureOutcome(400, 'm').body).toEqual({ ok: false, error: { message: 'm', field: null } })
  })
})

describe('parseAmountField', () => {
  it('parses valid text to cents', () => {
    expect(parseAmountField('12.5', 'amountText')).toBe(1250)
  })

  it('throws VALIDATION with the field for non-strings', () => {
    try {
      parseAmountField(12, 'amountText')
      expect.unreachable()
    } catch (e) {
      expect(e).toBeInstanceOf(ServiceError)
      expect((e as ServiceError).code).toBe('VALIDATION')
      expect((e as ServiceError).field).toBe('amountText')
    }
  })

  it('throws VALIDATION for unparseable text and zero unless allowed', () => {
    expect(() => parseAmountField('abc', 'amountText')).toThrow(ServiceError)
    expect(() => parseAmountField('0', 'amountText')).toThrow(ServiceError)
    expect(parseAmountField('0', 'threshold', { allowZero: true })).toBe(0)
  })
})

describe('field helpers', () => {
  it('isValidDateString accepts real dates only', () => {
    expect(isValidDateString('2025-03-14')).toBe(true)
    expect(isValidDateString('2025-02-30')).toBe(false)
    expect(isValidDateString('2025-3-4')).toBe(false)
    expect(isValidDateString(20250314)).toBe(false)
  })

  it('requireString rejects blank and non-strings', () => {
    expect(requireString('abc', 'name')).toBe('abc')
    expect(() => requireString('  ', 'name')).toThrow(ServiceError)
    expect(() => requireString(undefined, 'name')).toThrow(ServiceError)
  })

  it('requireDate returns valid dates and throws VALIDATION otherwise', () => {
    expect(requireDate('2025-03-14', 'today')).toBe('2025-03-14')
    try {
      requireDate('nope', 'today')
      expect.unreachable()
    } catch (e) {
      expect((e as ServiceError).code).toBe('VALIDATION')
      expect((e as ServiceError).field).toBe('today')
    }
  })
})
