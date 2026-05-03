export type Result<T, E = AppError> =
  | { ok: true; value: T }
  | { ok: false; error: E };

import { AppError } from './AppError';

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function err<E = AppError>(error: E): Result<never, E> {
  return { ok: false, error };
}
