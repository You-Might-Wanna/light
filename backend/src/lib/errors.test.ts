import { describe, it, expect } from 'vitest';
import { ErrorCode } from '@ledger/shared';
import {
  AppError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  RateLimitedError,
  InvalidStateTransitionError,
  SourceNotVerifiedError,
  FileTooLargeError,
  InvalidMimeTypeError,
  IdempotencyConflictError,
  ReadOnlyModeError,
} from './errors.js';

describe('error classes', () => {
  describe('AppError', () => {
    it('creates error with correct properties', () => {
      const error = new AppError(ErrorCode.INTERNAL_ERROR, 'Something went wrong', 500);
      expect(error.code).toBe(ErrorCode.INTERNAL_ERROR);
      expect(error.message).toBe('Something went wrong');
      expect(error.statusCode).toBe(500);
      expect(error.name).toBe('AppError');
    });

    it('includes optional details', () => {
      const error = new AppError(ErrorCode.VALIDATION_ERROR, 'Invalid input', 400, {
        field: 'email',
        reason: 'format',
      });
      expect(error.details).toEqual({ field: 'email', reason: 'format' });
    });

    it('converts to API error format', () => {
      const error = new AppError(ErrorCode.INTERNAL_ERROR, 'Oops', 500, { foo: 'bar' });
      const apiError = error.toApiError('req-123');
      expect(apiError).toEqual({
        error: {
          code: ErrorCode.INTERNAL_ERROR,
          message: 'Oops',
          requestId: 'req-123',
          details: { foo: 'bar' },
        },
      });
    });

    it('omits details from API error when not present', () => {
      const error = new AppError(ErrorCode.INTERNAL_ERROR, 'Oops', 500);
      const apiError = error.toApiError('req-123');
      expect(apiError.error).not.toHaveProperty('details');
    });
  });

  describe('ValidationError', () => {
    it('has correct status code and error code', () => {
      const error = new ValidationError('Invalid input');
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(error.name).toBe('ValidationError');
    });
  });

  describe('NotFoundError', () => {
    it('formats message with resource and id', () => {
      const error = new NotFoundError('Entity', 'ent-123');
      expect(error.message).toBe('Entity not found: ent-123');
      expect(error.statusCode).toBe(404);
      expect(error.code).toBe(ErrorCode.NOT_FOUND);
    });
  });

  describe('UnauthorizedError', () => {
    it('has default message', () => {
      const error = new UnauthorizedError();
      expect(error.message).toBe('Unauthorized');
      expect(error.statusCode).toBe(401);
    });

    it('accepts custom message', () => {
      const error = new UnauthorizedError('Token expired');
      expect(error.message).toBe('Token expired');
    });
  });

  describe('ForbiddenError', () => {
    it('has default message', () => {
      const error = new ForbiddenError();
      expect(error.message).toBe('Forbidden');
      expect(error.statusCode).toBe(403);
    });
  });

  describe('ConflictError', () => {
    it('has correct status code', () => {
      const error = new ConflictError('Resource already exists');
      expect(error.statusCode).toBe(409);
      expect(error.code).toBe(ErrorCode.CONFLICT);
    });
  });

  describe('RateLimitedError', () => {
    it('has default message and correct status', () => {
      const error = new RateLimitedError();
      expect(error.message).toBe('Rate limit exceeded');
      expect(error.statusCode).toBe(429);
      expect(error.code).toBe(ErrorCode.RATE_LIMITED);
    });
  });

  describe('InvalidStateTransitionError', () => {
    it('formats transition message', () => {
      const error = new InvalidStateTransitionError('DRAFT', 'PUBLISHED');
      expect(error.message).toBe('Invalid state transition from DRAFT to PUBLISHED');
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe(ErrorCode.INVALID_STATE_TRANSITION);
    });
  });

  describe('SourceNotVerifiedError', () => {
    it('includes source ID in message', () => {
      const error = new SourceNotVerifiedError('src-456');
      expect(error.message).toBe('Source not verified: src-456');
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe(ErrorCode.SOURCE_NOT_VERIFIED);
    });
  });

  describe('FileTooLargeError', () => {
    it('includes max size in message', () => {
      const error = new FileTooLargeError(10485760);
      expect(error.message).toBe('File exceeds maximum size of 10485760 bytes');
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe(ErrorCode.FILE_TOO_LARGE);
    });
  });

  describe('InvalidMimeTypeError', () => {
    it('lists allowed types', () => {
      const error = new InvalidMimeTypeError('text/plain', ['application/pdf', 'image/png']);
      expect(error.message).toBe('Invalid MIME type: text/plain. Allowed: application/pdf, image/png');
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe(ErrorCode.INVALID_MIME_TYPE);
    });
  });

  describe('IdempotencyConflictError', () => {
    it('has correct message and status', () => {
      const error = new IdempotencyConflictError();
      expect(error.message).toBe('Idempotency key already used with different request');
      expect(error.statusCode).toBe(409);
      expect(error.code).toBe(ErrorCode.IDEMPOTENCY_CONFLICT);
    });
  });

  describe('ReadOnlyModeError', () => {
    it('has correct message and status', () => {
      const error = new ReadOnlyModeError();
      expect(error.message).toBe('System is in read-only mode');
      expect(error.statusCode).toBe(503);
    });
  });
});