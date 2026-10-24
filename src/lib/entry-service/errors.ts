export type ServiceErrorCode = 'VALIDATION' | 'NOT_FOUND' | 'CONFLICT';

export class ServiceError extends Error {
  readonly code: ServiceErrorCode;
  readonly field?: string;

  constructor(code: ServiceErrorCode, message: string, field?: string) {
    super(message);
    this.name = 'ServiceError';
    this.code = code;
    this.field = field;
  }
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: ServiceError };
