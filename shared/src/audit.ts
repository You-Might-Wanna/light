import type { AuditAction } from './enums.js';

// Audit log entry
export interface AuditLogEntry {
  logId: string;
  actorUserId: string;
  action: AuditAction;
  targetType: 'entity' | 'card' | 'source' | 'relationship' | 'config' | 'user';
  targetId: string;
  timestamp: string;
  diff?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  requestId?: string;
  ipAddress?: string; // only for security-relevant actions
}

// Idempotency record for safe retries
export interface IdempotencyRecord {
  idempotencyKey: string;
  createdAt: string;
  expiresAt: string;
  requestFingerprint: string;
  responsePayload: string;
  statusCode: number;
  actorUserId: string;
}
