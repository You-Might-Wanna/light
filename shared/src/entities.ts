import type { EntityType } from './enums.js';

// Entity identifiers (public records only)
export interface EntityIdentifiers {
  ticker?: string;
  ein?: string;
  duns?: string;
  lei?: string;
}

// Entity represents a corporation, agency, or public official
export interface Entity {
  entityId: string;
  name: string;
  type: EntityType;
  aliases: string[];
  website?: string;
  parentEntityId?: string;
  identifiers?: EntityIdentifiers;
  createdAt: string;
  updatedAt: string;
}

// Entity with aggregated scoring data
export interface EntityWithScore extends Entity {
  aggregateScore?: EntityAggregateScore;
}

// Pre-computed aggregates for entity scoring (O(1) reads)
export interface EntityAggregateScore {
  overallScore: number;
  categoryScores: Record<string, number>;
  totalCards: number;
  weightConfigVersion: string;
  lastComputedAt: string;
}

// Request DTOs
export interface CreateEntityRequest {
  name: string;
  type: EntityType;
  aliases?: string[];
  website?: string;
  parentEntityId?: string;
  identifiers?: EntityIdentifiers;
}

export interface UpdateEntityRequest {
  name?: string;
  type?: EntityType;
  aliases?: string[];
  website?: string;
  parentEntityId?: string;
  identifiers?: EntityIdentifiers;
}

// Relationship between entities (optional MVP)
export interface Relationship {
  relationshipId: string;
  fromEntityId: string;
  toEntityId: string;
  type: string;
  sourceRefs: string[];
  createdAt: string;
  updatedAt: string;
}
