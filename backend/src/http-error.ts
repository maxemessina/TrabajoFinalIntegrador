export type HttpErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'SERVICE_UNAVAILABLE';

export class HttpError extends Error {
  readonly status: 400 | 401 | 403 | 404 | 409 | 503;
  readonly code: HttpErrorCode;
  readonly details?: Array<{ field: string; message: string }>;

  constructor(
    status: 400 | 401 | 403 | 404 | 409 | 503,
    code: HttpErrorCode,
    message: string,
    details?: Array<{ field: string; message: string }>,
  ) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    if (details) {
      this.details = details;
    }
  }
}
