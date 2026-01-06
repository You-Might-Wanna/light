import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  QueryCommand,
  ScanCommand,
  BatchWriteCommand,
  TransactWriteCommand,
  type GetCommandInput,
  type PutCommandInput,
  type UpdateCommandInput,
  type QueryCommandInput,
  type ScanCommandInput,
  type BatchWriteCommandInput,
  type TransactWriteCommandInput,
} from '@aws-sdk/lib-dynamodb';
import { config } from './config.js';

// Create DynamoDB client
const client = new DynamoDBClient({ region: config.region });

// Create document client with marshalling options
export const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true,
    convertEmptyValues: false,
  },
  unmarshallOptions: {
    wrapNumbers: false,
  },
});

// Helper functions for common operations
export async function getItem<T>(params: GetCommandInput): Promise<T | null> {
  const result = await docClient.send(new GetCommand(params));
  return (result.Item as T) || null;
}

export async function putItem(params: PutCommandInput): Promise<void> {
  await docClient.send(new PutCommand(params));
}

export async function updateItem(params: UpdateCommandInput): Promise<void> {
  await docClient.send(new UpdateCommand(params));
}

export async function queryItems<T>(
  params: QueryCommandInput
): Promise<{ items: T[]; lastEvaluatedKey?: Record<string, unknown> }> {
  const result = await docClient.send(new QueryCommand(params));
  return {
    items: (result.Items as T[]) || [],
    lastEvaluatedKey: result.LastEvaluatedKey as Record<string, unknown> | undefined,
  };
}

export async function scanItems<T>(
  params: ScanCommandInput
): Promise<{ items: T[]; lastEvaluatedKey?: Record<string, unknown> }> {
  const result = await docClient.send(new ScanCommand(params));
  return {
    items: (result.Items as T[]) || [],
    lastEvaluatedKey: result.LastEvaluatedKey as Record<string, unknown> | undefined,
  };
}

/**
 * Count items matching a query using Select: 'COUNT'.
 * Paginates through all results to get accurate total count.
 */
export async function countQueryItems(
  params: Omit<QueryCommandInput, 'Select'>
): Promise<number> {
  let count = 0;
  let lastEvaluatedKey: Record<string, unknown> | undefined;

  do {
    const result = await docClient.send(
      new QueryCommand({
        ...params,
        Select: 'COUNT',
        ExclusiveStartKey: lastEvaluatedKey,
      })
    );
    count += result.Count ?? 0;
    lastEvaluatedKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastEvaluatedKey);

  return count;
}

/**
 * Count items matching a scan using Select: 'COUNT'.
 * Paginates through all results to get accurate total count.
 */
export async function countScanItems(
  params: Omit<ScanCommandInput, 'Select'>
): Promise<number> {
  let count = 0;
  let lastEvaluatedKey: Record<string, unknown> | undefined;

  do {
    const result = await docClient.send(
      new ScanCommand({
        ...params,
        Select: 'COUNT',
        ExclusiveStartKey: lastEvaluatedKey,
      })
    );
    count += result.Count ?? 0;
    lastEvaluatedKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastEvaluatedKey);

  return count;
}

export async function batchWrite(params: BatchWriteCommandInput): Promise<void> {
  await docClient.send(new BatchWriteCommand(params));
}

export async function transactWrite(params: TransactWriteCommandInput): Promise<void> {
  await docClient.send(new TransactWriteCommand(params));
}

// Cursor encoding/decoding for pagination
export function encodeCursor(lastEvaluatedKey: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(lastEvaluatedKey)).toString('base64url');
}

// DynamoDB key attributes that get added to items
type DynamoKeys = 'PK' | 'SK' | 'GSI1PK' | 'GSI1SK' | 'GSI2PK' | 'GSI2SK';
const DYNAMO_KEYS: DynamoKeys[] = ['PK', 'SK', 'GSI1PK', 'GSI1SK', 'GSI2PK', 'GSI2SK'];

// Strip DynamoDB key attributes from an item
export function stripKeys<T extends { PK: string; SK: string }>(
  item: T
): Omit<T, DynamoKeys> {
  const result = { ...item };
  for (const key of DYNAMO_KEYS) {
    delete (result as Record<string, unknown>)[key];
  }
  return result as Omit<T, DynamoKeys>;
}

export function decodeCursor(cursor: string): Record<string, unknown> | undefined {
  try {
    return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf-8'));
  } catch {
    return undefined;
  }
}
