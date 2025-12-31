import { ErrorCode, type ApiError } from '@ledger/shared';

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly statusCode: number = 500,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AppError';
  }

  toApiError(requestId: string): ApiError {
    return {
      error: {
        code: this.code,
        message: this.message,
        requestId,
        ...(this.details && { details: this.details }),
      },
    };
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(ErrorCode.VALIDATION_ERROR, message, 400, details);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id: string) {
    super(ErrorCode.NOT_FOUND, `${resource} not found: ${id}`, 404);
    this.name = 'NotFoundError';
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(ErrorCode.UNAUTHORIZED, message, 401);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(ErrorCode.FORBIDDEN, message, 403);
    this.name = 'ForbiddenError';
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(ErrorCode.CONFLICT, message, 409);
    this.name = 'ConflictError';
  }
}

export class RateLimitedError extends AppError {
  constructor(message = 'Rate limit exceeded') {
    super(ErrorCode.RATE_LIMITED, message, 429);
    this.name = 'RateLimitedError';
  }
}

export class InvalidStateTransitionError extends AppError {
  constructor(from: string, to: string) {
    super(
      ErrorCode.INVALID_STATE_TRANSITION,
      `Invalid state transition from ${from} to ${to}`,
      400
    );
    this.name = 'InvalidStateTransitionError';
  }
}

export class SourceNotVerifiedError extends AppError {
  constructor(sourceId: string) {
    super(
      ErrorCode.SOURCE_NOT_VERIFIED,
      `Source not verified: ${sourceId}`,
      400
    );
    this.name = 'SourceNotVerifiedError';
  }
}

export class FileTooLargeError extends AppError {
  constructor(maxBytes: number) {
    super(
      ErrorCode.FILE_TOO_LARGE,
      `File exceeds maximum size of ${maxBytes} bytes`,
      400
    );
    this.name = 'FileTooLargeError';
  }
}

export class InvalidMimeTypeError extends AppError {
  constructor(mimeType: string, allowed: readonly string[]) {
    super(
      ErrorCode.INVALID_MIME_TYPE,
      `Invalid MIME type: ${mimeType}. Allowed: ${allowed.join(', ')}`,
      400
    );
    this.name = 'InvalidMimeTypeError';
  }
}

export class IdempotencyConflictError extends AppError {
  constructor() {
    super(
      ErrorCode.IDEMPOTENCY_CONFLICT,
      'Idempotency key already used with different request',
      409
    );
    this.name = 'IdempotencyConflictError';
  }
}

export class ReadOnlyModeError extends AppError {
  constructor() {
    super(
      ErrorCode.FORBIDDEN,
      'System is in read-only mode',
      503
    );
    this.name = 'ReadOnlyModeError';
  }
}

export class SourceNotPublicError extends AppError {
  constructor(sourceId: string) {
    super(
      ErrorCode.FORBIDDEN,
      `Source not available for public download: ${sourceId}`,
      403
    );
    this.name = 'SourceNotPublicError';
  }
}
