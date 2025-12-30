import { ulid } from 'ulid';
import type { EvidenceCard, EvidenceCardWithEntities, PaginatedResponse, CardStatus } from '@ledger/shared';
import { config } from '../config.js';
import {
  getItem,
  putItem,
  queryItems,
  transactWrite,
  encodeCursor,
  decodeCursor,
  stripKeys,
} from '../dynamodb.js';
import { NotFoundError, InvalidStateTransitionError, SourceNotVerifiedError } from '../errors.js';
import { getSource } from './sources.js';
import { getEntitiesByIds } from './entities.js';
import type { CreateCardInput, UpdateCardInput, CardQueryInput, EntityCardsQueryInput } from '../validation.js';

const TABLE = config.tables.cards;

// Valid state transitions
const VALID_TRANSITIONS: Record<CardStatus, CardStatus[]> = {
  DRAFT: ['REVIEW', 'ARCHIVED'],
  REVIEW: ['DRAFT', 'PUBLISHED', 'ARCHIVED'],
  PUBLISHED: ['DISPUTED', 'CORRECTED', 'RETRACTED', 'ARCHIVED'],
  DISPUTED: ['PUBLISHED', 'CORRECTED', 'RETRACTED', 'ARCHIVED'],
  CORRECTED: ['DISPUTED', 'RETRACTED', 'ARCHIVED'],
  RETRACTED: ['ARCHIVED'],
  ARCHIVED: ['DRAFT'], // Can restore to draft
};

function canTransition(from: CardStatus, to: CardStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export async function createCard(
  input: CreateCardInput,
  userId: string
): Promise<EvidenceCard> {
  const now = new Date().toISOString();
  const cardId = ulid();

  const card: EvidenceCard = {
    cardId,
    title: input.title,
    claim: input.claim,
    summary: input.summary,
    category: input.category,
    entityIds: input.entityIds,
    eventDate: input.eventDate,
    jurisdiction: input.jurisdiction,
    sourceRefs: input.sourceRefs || [],
    evidenceStrength: input.evidenceStrength,
    status: 'DRAFT' as CardStatus,
    counterpoint: input.counterpoint,
    tags: input.tags || [],
    scoreSignals: input.scoreSignals,
    version: 1,
    createdAt: now,
    updatedAt: now,
    createdBy: userId,
    updatedBy: userId,
  };

  await putItem({
    TableName: TABLE,
    Item: {
      PK: `CARD#${cardId}`,
      SK: `V#${card.version}`,
      ...card,
    },
  });

  return card;
}

export async function getCard(cardId: string, version?: number): Promise<EvidenceCard> {
  if (version) {
    const item = await getItem<EvidenceCard & { PK: string; SK: string }>({
      TableName: TABLE,
      Key: {
        PK: `CARD#${cardId}`,
        SK: `V#${version}`,
      },
    });

    if (!item) {
      throw new NotFoundError('Card', `${cardId}@v${version}`);
    }

    return stripKeys(item);
  }

  // Get latest version
  const { items } = await queryItems<EvidenceCard & { PK: string; SK: string }>({
    TableName: TABLE,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
    ExpressionAttributeValues: {
      ':pk': `CARD#${cardId}`,
      ':skPrefix': 'V#',
    },
    ScanIndexForward: false,
    Limit: 1,
  });

  if (items.length === 0) {
    throw new NotFoundError('Card', cardId);
  }

  return stripKeys(items[0]);
}

export async function getCardWithEntities(
  cardId: string
): Promise<EvidenceCardWithEntities> {
  const card = await getCard(cardId);
  const entities = await getEntitiesByIds(card.entityIds);

  return {
    ...card,
    entities,
  };
}

export async function updateCard(
  cardId: string,
  input: UpdateCardInput,
  userId: string
): Promise<EvidenceCard> {
  const existing = await getCard(cardId);

  // Only allow updates to DRAFT or REVIEW cards
  if (!['DRAFT', 'REVIEW'].includes(existing.status)) {
    throw new InvalidStateTransitionError(
      existing.status,
      'Cannot update card in current status'
    );
  }

  const now = new Date().toISOString();
  const newVersion = existing.version + 1;

  const updated: EvidenceCard = {
    ...existing,
    ...input,
    version: newVersion,
    updatedAt: now,
    updatedBy: userId,
  };

  await putItem({
    TableName: TABLE,
    Item: {
      PK: `CARD#${cardId}`,
      SK: `V#${newVersion}`,
      ...updated,
    },
  });

  return updated;
}

export async function submitCard(cardId: string, userId: string): Promise<EvidenceCard> {
  return transitionCard(cardId, 'REVIEW', userId);
}

export async function publishCard(cardId: string, userId: string): Promise<EvidenceCard> {
  const card = await getCard(cardId);

  // Verify all sources are verified
  for (const sourceId of card.sourceRefs) {
    const source = await getSource(sourceId);
    if (source.verificationStatus !== 'VERIFIED') {
      throw new SourceNotVerifiedError(sourceId);
    }
  }

  const now = new Date().toISOString();
  const publishDate = now.split('T')[0]; // ISO date only
  const yearMonth = publishDate.substring(0, 7); // YYYY-MM

  const newVersion = card.version + 1;
  const updated: EvidenceCard = {
    ...card,
    status: 'PUBLISHED' as CardStatus,
    publishDate,
    version: newVersion,
    updatedAt: now,
    updatedBy: userId,
  };

  // Use transaction to update card and create index entries
  const transactItems: Array<{
    Put: {
      TableName: string;
      Item: Record<string, unknown>;
    };
  }> = [
    {
      Put: {
        TableName: TABLE,
        Item: {
          PK: `CARD#${cardId}`,
          SK: `V#${newVersion}`,
          ...updated,
        },
      },
    },
    // GSI1 entry for public feed
    {
      Put: {
        TableName: TABLE,
        Item: {
          PK: `CARD#${cardId}`,
          SK: 'LATEST',
          GSI1PK: `STATUS#PUBLISHED#${yearMonth}`,
          GSI1SK: `PUBLISH#${publishDate}#CARD#${cardId}`,
          ...updated,
        },
      },
    },
  ];

  // Add entity index entries (fan-out)
  for (const entityId of card.entityIds) {
    transactItems.push({
      Put: {
        TableName: TABLE,
        Item: {
          PK: `CARD#${cardId}`,
          SK: `ENTITY#${entityId}`,
          GSI2PK: `ENTITY#${entityId}`,
          GSI2SK: `EVENT#${card.eventDate}#CARD#${cardId}`,
          ...updated,
        },
      },
    });
  }

  await transactWrite({ TransactItems: transactItems });

  return updated;
}

export async function disputeCard(
  cardId: string,
  reason: string,
  userId: string
): Promise<EvidenceCard> {
  const card = await getCard(cardId);

  const now = new Date().toISOString();
  const newVersion = card.version + 1;

  const updated: EvidenceCard = {
    ...card,
    status: 'DISPUTED' as CardStatus,
    counterpoint: card.counterpoint
      ? `${card.counterpoint}\n\n---\n\n[Dispute ${now}]: ${reason}`
      : `[Dispute ${now}]: ${reason}`,
    version: newVersion,
    updatedAt: now,
    updatedBy: userId,
  };

  return saveCardVersion(updated);
}

export async function correctCard(
  cardId: string,
  correctionNote: string,
  userId: string
): Promise<EvidenceCard> {
  const card = await getCard(cardId);

  const now = new Date().toISOString();
  const newVersion = card.version + 1;

  const updated: EvidenceCard = {
    ...card,
    status: 'CORRECTED' as CardStatus,
    counterpoint: card.counterpoint
      ? `${card.counterpoint}\n\n---\n\n[Correction ${now}]: ${correctionNote}`
      : `[Correction ${now}]: ${correctionNote}`,
    version: newVersion,
    updatedAt: now,
    updatedBy: userId,
  };

  return saveCardVersion(updated);
}

export async function retractCard(
  cardId: string,
  reason: string,
  userId: string
): Promise<EvidenceCard> {
  const card = await getCard(cardId);

  const now = new Date().toISOString();
  const newVersion = card.version + 1;

  const updated: EvidenceCard = {
    ...card,
    status: 'RETRACTED' as CardStatus,
    counterpoint: card.counterpoint
      ? `${card.counterpoint}\n\n---\n\n[Retraction ${now}]: ${reason}`
      : `[Retraction ${now}]: ${reason}`,
    version: newVersion,
    updatedAt: now,
    updatedBy: userId,
  };

  return saveCardVersion(updated);
}

export async function archiveCard(cardId: string, userId: string): Promise<EvidenceCard> {
  return transitionCard(cardId, 'ARCHIVED', userId);
}

export async function restoreCard(cardId: string, userId: string): Promise<EvidenceCard> {
  return transitionCard(cardId, 'DRAFT', userId);
}

async function transitionCard(
  cardId: string,
  newStatus: CardStatus,
  userId: string
): Promise<EvidenceCard> {
  const card = await getCard(cardId);

  if (!canTransition(card.status, newStatus)) {
    throw new InvalidStateTransitionError(card.status, newStatus);
  }

  const now = new Date().toISOString();
  const newVersion = card.version + 1;

  const updated: EvidenceCard = {
    ...card,
    status: newStatus,
    version: newVersion,
    updatedAt: now,
    updatedBy: userId,
  };

  return saveCardVersion(updated);
}

async function saveCardVersion(card: EvidenceCard): Promise<EvidenceCard> {
  await putItem({
    TableName: TABLE,
    Item: {
      PK: `CARD#${card.cardId}`,
      SK: `V#${card.version}`,
      ...card,
    },
  });

  return card;
}

export async function listPublishedCards(
  query: CardQueryInput
): Promise<PaginatedResponse<EvidenceCard>> {
  const limit = query.limit || 20;
  const exclusiveStartKey = query.cursor ? decodeCursor(query.cursor) : undefined;

  // Get current month for partition key
  const now = new Date();
  const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const { items, lastEvaluatedKey } = await queryItems<EvidenceCard & { PK: string; SK: string }>({
    TableName: TABLE,
    IndexName: 'GSI1',
    KeyConditionExpression: 'GSI1PK = :pk',
    ExpressionAttributeValues: {
      ':pk': `STATUS#PUBLISHED#${yearMonth}`,
    },
    ScanIndexForward: false, // Most recent first
    Limit: limit,
    ExclusiveStartKey: exclusiveStartKey,
  });

  const cards = items.map((item) => stripKeys(item));

  return {
    items: cards,
    cursor: lastEvaluatedKey ? encodeCursor(lastEvaluatedKey) : undefined,
    hasMore: !!lastEvaluatedKey,
  };
}

export async function listEntityCards(
  entityId: string,
  query: EntityCardsQueryInput
): Promise<PaginatedResponse<EvidenceCard>> {
  const limit = query.limit || 20;
  const exclusiveStartKey = query.cursor ? decodeCursor(query.cursor) : undefined;

  const { items, lastEvaluatedKey } = await queryItems<EvidenceCard & { PK: string; SK: string }>({
    TableName: TABLE,
    IndexName: 'GSI2',
    KeyConditionExpression: 'GSI2PK = :pk',
    ExpressionAttributeValues: {
      ':pk': `ENTITY#${entityId}`,
      ...(query.status && { ':status': query.status }),
    },
    FilterExpression: query.status ? 'status = :status' : undefined,
    ScanIndexForward: false,
    Limit: limit,
    ExclusiveStartKey: exclusiveStartKey,
  });

  const cards = items.map((item) => stripKeys(item));

  return {
    items: cards,
    cursor: lastEvaluatedKey ? encodeCursor(lastEvaluatedKey) : undefined,
    hasMore: !!lastEvaluatedKey,
  };
}
