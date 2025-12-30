import { ulid } from 'ulid';
import type { Entity, PaginatedResponse } from '@ledger/shared';
import { config } from '../config.js';
import {
  getItem,
  putItem,
  queryItems,
  encodeCursor,
  decodeCursor,
  stripKeys,
} from '../dynamodb.js';
import { NotFoundError } from '../errors.js';
import type { CreateEntityInput, UpdateEntityInput, EntityQueryInput } from '../validation.js';

const TABLE = config.tables.entities;

// Normalize name for search index
function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export async function createEntity(
  input: CreateEntityInput,
  _userId: string
): Promise<Entity> {
  const now = new Date().toISOString();
  const entityId = ulid();

  const entity: Entity = {
    entityId,
    name: input.name,
    type: input.type,
    aliases: input.aliases || [],
    website: input.website,
    parentEntityId: input.parentEntityId,
    identifiers: input.identifiers,
    createdAt: now,
    updatedAt: now,
  };

  await putItem({
    TableName: TABLE,
    Item: {
      PK: `ENTITY#${entityId}`,
      SK: 'META',
      GSI1PK: `NAME#${normalizeName(entity.name)}`,
      GSI1SK: `ENTITY#${entityId}`,
      ...entity,
    },
  });

  return entity;
}

export async function getEntity(entityId: string): Promise<Entity> {
  const item = await getItem<Entity & { PK: string; SK: string }>({
    TableName: TABLE,
    Key: {
      PK: `ENTITY#${entityId}`,
      SK: 'META',
    },
  });

  if (!item) {
    throw new NotFoundError('Entity', entityId);
  }

  return stripKeys(item);
}

export async function updateEntity(
  entityId: string,
  input: UpdateEntityInput,
  _userId: string
): Promise<Entity> {
  const existing = await getEntity(entityId);
  const now = new Date().toISOString();

  const updated: Entity = {
    ...existing,
    ...input,
    updatedAt: now,
  };

  await putItem({
    TableName: TABLE,
    Item: {
      PK: `ENTITY#${entityId}`,
      SK: 'META',
      GSI1PK: `NAME#${normalizeName(updated.name)}`,
      GSI1SK: `ENTITY#${entityId}`,
      ...updated,
    },
  });

  return updated;
}

export async function listEntities(
  query: EntityQueryInput
): Promise<PaginatedResponse<Entity>> {
  const limit = query.limit || 20;
  const exclusiveStartKey = query.cursor ? decodeCursor(query.cursor) : undefined;

  // If searching by name prefix, use GSI1
  if (query.query) {
    const normalizedQuery = normalizeName(query.query);
    const { items, lastEvaluatedKey } = await queryItems<Entity & { PK: string; SK: string }>({
      TableName: TABLE,
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :pk',
      ExpressionAttributeValues: {
        ':pk': `NAME#${normalizedQuery}`,
      },
      Limit: limit,
      ExclusiveStartKey: exclusiveStartKey,
    });

    const entities = items.map((item) => stripKeys(item));

    return {
      items: entities,
      cursor: lastEvaluatedKey ? encodeCursor(lastEvaluatedKey) : undefined,
      hasMore: !!lastEvaluatedKey,
    };
  }

  // Otherwise, scan all entities (not ideal but works for MVP)
  // In production, you'd want a better approach
  const { items, lastEvaluatedKey } = await queryItems<Entity & { PK: string; SK: string }>({
    TableName: TABLE,
    KeyConditionExpression: 'begins_with(PK, :prefix) AND SK = :sk',
    ExpressionAttributeValues: {
      ':prefix': 'ENTITY#',
      ':sk': 'META',
    },
    Limit: limit,
    ExclusiveStartKey: exclusiveStartKey,
  });

  const entities = items.map((item) => stripKeys(item));

  return {
    items: entities,
    cursor: lastEvaluatedKey ? encodeCursor(lastEvaluatedKey) : undefined,
    hasMore: !!lastEvaluatedKey,
  };
}

export async function getEntitiesByIds(
  entityIds: string[]
): Promise<Array<{ entityId: string; name: string }>> {
  const results = await Promise.all(
    entityIds.map(async (id) => {
      try {
        const entity = await getEntity(id);
        return { entityId: entity.entityId, name: entity.name };
      } catch {
        return { entityId: id, name: '[Unknown Entity]' };
      }
    })
  );
  return results;
}
