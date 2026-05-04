export type ErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'UNPROCESSABLE'
  | 'INTERNAL'
  | 'SERVICE_UNAVAILABLE';

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly statusCode: number;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = AppError.toHttpStatus(code);
    this.details = details;
  }

  static toHttpStatus(code: ErrorCode): number {
    const map: Record<ErrorCode, number> = {
      BAD_REQUEST: 400,
      UNAUTHORIZED: 401,
      FORBIDDEN: 403,
      NOT_FOUND: 404,
      CONFLICT: 409,
      UNPROCESSABLE: 422,
      INTERNAL: 500,
      SERVICE_UNAVAILABLE: 503,
    };
    return map[code];
  }

  toJSON() {
    return { code: this.code, message: this.message, details: this.details };
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}
