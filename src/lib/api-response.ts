/**
 * Pure helpers that shape mutation API responses. No Next.js or DB imports,
 * so they are unit-testable on their own.
 *
 * Success: { ok: true, result }
 * Failure: { ok: false, error: { message, field } }
 */

import { ServiceError } from '@/lib/entry-service/errors'
import { parseMoney, type ParseMoneyOptions } from '@/lib/money'
import { isValidDate } from '@/lib/projection/dates'

export type ApiSuccessBody<T> = { ok: true; result: T }
export type ApiErrorBody = { ok: false; error: { message: string; field: string | null } }
export type ApiOutcome<T> = { status: number; body: ApiSuccessBody<T> | ApiErrorBody }

export const GENERIC_ERROR_MESSAGE = 'Something went wrong. Please try again.'

const STATUS_BY_CODE = { VALIDATION: 400, NOT_FOUND: 404, CONFLICT: 409 } as const

export function successOutcome<T>(result: T, status = 200): ApiOutcome<T> {
  return { status, body: { ok: true, result } }
}

export function failureOutcome(status: number, message: string, field?: string | null): ApiOutcome<never> {
  return { status, body: { ok: false, error: { message, field: field ?? null } } }
}

/** Map a thrown value to an HTTP outcome. Non-ServiceError errors become a generic 500. */
export function errorToOutcome(error: unknown): ApiOutcome<never> {
  if (error instanceof ServiceError) {
    const status = (STATUS_BY_CODE as Record<string, number | undefined>)[error.code]
    if (status === undefined) return failureOutcome(500, GENERIC_ERROR_MESSAGE)
    return failureOutcome(status, error.message, error.field)
  }
  return failureOutcome(500, GENERIC_ERROR_MESSAGE)
}

/** Strict 'YYYY-MM-DD' check that rejects impossible dates and non-strings. */
export function isValidDateString(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && isValidDate(value)
}

/** Server-side amountText -> cents. Throws a VALIDATION ServiceError carrying the field name. */
export function parseAmountField(
  value: unknown,
  field: string,
  options?: ParseMoneyOptions,
): number {
  if (typeof value !== 'string') {
    throw new ServiceError('VALIDATION', 'Enter an amount', field)
  }
  const parsed = parseMoney(value, options)
  if (!parsed.ok) throw new ServiceError('VALIDATION', parsed.error, field)
  return parsed.cents
}

/** Require a non-empty string body field, else VALIDATION with the field name. */
export function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ServiceError('VALIDATION', `${field} is required`, field)
  }
  return value
}

/** Require a valid 'YYYY-MM-DD' body field, else VALIDATION with the field name. */
export function requireDate(value: unknown, field: string): string {
  if (!isValidDateString(value)) {
    throw new ServiceError('VALIDATION', 'Enter a valid date', field)
  }
  return value
}
