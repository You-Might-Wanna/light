import { ulid } from 'ulid';
import type { AuditLogEntry, AuditAction, PaginatedResponse } from '@ledger/shared';
import { config } from '../config.js';
import { putItem, queryItems, encodeCursor, decodeCursor, stripKeys } from '../dynamodb.js';
import type { AuditQueryInput } from '../validation.js';

const TABLE = config.tables.audit;

export async function logAuditEvent(
  action: AuditAction,
  targetType: AuditLogEntry['targetType'],
  targetId: string,
  actorUserId: string,
  options?: {
    diff?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
    requestId?: string;
  }
): Promise<AuditLogEntry> {
  const now = new Date().toISOString();
  const logId = ulid();
  const yearMonth = now.substring(0, 7); // YYYY-MM

  const entry: AuditLogEntry = {
    logId,
    actorUserId,
    action,
    targetType,
    targetId,
    timestamp: now,
    diff: options?.diff,
    metadata: options?.metadata,
    requestId: options?.requestId,
  };

  await putItem({
    TableName: TABLE,
    Item: {
      PK: `AUDIT#${yearMonth}`,
      SK: `LOG#${logId}`,
      GSI1PK: `ACTOR#${actorUserId}`,
      GSI1SK: `LOG#${now}#${logId}`,
      GSI2PK: `TARGET#${targetType}#${targetId}`,
      GSI2SK: `LOG#${now}#${logId}`,
      ...entry,
    },
  });

  return entry;
}

export async function listAuditLogs(
  query: AuditQueryInput
): Promise<PaginatedResponse<AuditLogEntry>> {
  const limit = query.limit || 20;
  const exclusiveStartKey = query.cursor ? decodeCursor(query.cursor) : undefined;

  // Get current month for partition key
  const now = new Date();
  const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  let filterExpression: string | undefined;
  const expressionAttributeValues: Record<string, unknown> = {
    ':pk': `AUDIT#${yearMonth}`,
  };

  const filters: string[] = [];

  if (query.action) {
    filters.push('action = :action');
    expressionAttributeValues[':action'] = query.action;
  }

  if (query.targetType) {
    filters.push('targetType = :targetType');
    expressionAttributeValues[':targetType'] = query.targetType;
  }

  if (filters.length > 0) {
    filterExpression = filters.join(' AND ');
  }

  const { items, lastEvaluatedKey } = await queryItems<AuditLogEntry & { PK: string; SK: string }>({
    TableName: TABLE,
    KeyConditionExpression: 'PK = :pk',
    ExpressionAttributeValues: expressionAttributeValues,
    FilterExpression: filterExpression,
    ScanIndexForward: false,
    Limit: limit,
    ExclusiveStartKey: exclusiveStartKey,
  });

  const logs = items.map((item) => stripKeys(item));

  return {
    items: logs,
    cursor: lastEvaluatedKey ? encodeCursor(lastEvaluatedKey) : undefined,
    hasMore: !!lastEvaluatedKey,
  };
}

export async function listAuditLogsByActor(
  actorUserId: string,
  query: AuditQueryInput
): Promise<PaginatedResponse<AuditLogEntry>> {
  const limit = query.limit || 20;
  const exclusiveStartKey = query.cursor ? decodeCursor(query.cursor) : undefined;

  const { items, lastEvaluatedKey } = await queryItems<AuditLogEntry & { PK: string; SK: string }>({
    TableName: TABLE,
    IndexName: 'GSI1',
    KeyConditionExpression: 'GSI1PK = :pk',
    ExpressionAttributeValues: {
      ':pk': `ACTOR#${actorUserId}`,
    },
    ScanIndexForward: false,
    Limit: limit,
    ExclusiveStartKey: exclusiveStartKey,
  });

  const logs = items.map((item) => stripKeys(item));

  return {
    items: logs,
    cursor: lastEvaluatedKey ? encodeCursor(lastEvaluatedKey) : undefined,
    hasMore: !!lastEvaluatedKey,
  };
}
