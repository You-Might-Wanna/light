// Common API types

// Standard error response
export interface ApiError {
  error: {
    code: string;
    message: string;
    requestId: string;
    details?: Record<string, unknown>;
  };
}

// Error codes
export const ErrorCode = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  BAD_REQUEST: 'BAD_REQUEST',
  INVALID_STATE_TRANSITION: 'INVALID_STATE_TRANSITION',
  SOURCE_NOT_VERIFIED: 'SOURCE_NOT_VERIFIED',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  INVALID_MIME_TYPE: 'INVALID_MIME_TYPE',
  IDEMPOTENCY_CONFLICT: 'IDEMPOTENCY_CONFLICT',
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

// Paginated response wrapper
export interface PaginatedResponse<T> {
  items: T[];
  cursor?: string;
  hasMore: boolean;
}

// Query parameters for list endpoints
export interface PaginationParams {
  limit?: number;
  cursor?: string;
}

export interface CardQueryParams extends PaginationParams {
  category?: string;
  tag?: string;
  status?: string;
}

export interface EntityQueryParams extends PaginationParams {
  query?: string;
  type?: string;
}

export interface EntityCardsQueryParams extends PaginationParams {
  status?: string;
}

export interface AuditQueryParams extends PaginationParams {
  action?: string;
  targetType?: string;
  actorUserId?: string;
  startDate?: string;
  endDate?: string;
}

// Health check response
export interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
}
