import pino from 'pino';

// Create logger instance with Lambda-friendly settings
export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  // Lambda already adds timestamp
  timestamp: false,
  // Structured logging for CloudWatch
  formatters: {
    level: (label) => ({ level: label }),
  },
  // Redact sensitive fields
  redact: {
    paths: [
      'authorization',
      'Authorization',
      'token',
      'accessToken',
      'refreshToken',
      'idToken',
      'presignedUrl',
      'uploadUrl',
      'downloadUrl',
    ],
    censor: '[REDACTED]',
  },
});

// Create child logger with request context
export function createRequestLogger(requestId: string, userId?: string) {
  return logger.child({
    requestId,
    ...(userId && { userId }),
  });
}

export type Logger = typeof logger;
