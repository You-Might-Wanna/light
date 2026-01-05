import type { EntityType, RelationshipType, RelationshipStatus, ClaimType } from './enums';
import type { EvidenceCard } from './cards';

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

// Relationship between entities
export interface Relationship {
  relationshipId: string;

  // The two entities in the relationship
  fromEntityId: string;
  toEntityId: string;

  // Relationship metadata
  type: RelationshipType;
  status: RelationshipStatus;

  // Optional descriptive fields
  description?: string;

  // Date range for the relationship (if known)
  startDate?: string;  // ISO date (YYYY-MM-DD)
  endDate?: string;    // ISO date, null if ongoing

  // Evidence linking
  sourceRefs: string[];  // Source IDs that verify this relationship

  // Ownership percentage (for OWNS/CONTROLS)
  ownershipPercentage?: number;

  // Retraction info
  retractionReason?: string;
  retractedAt?: string;
  retractedBy?: string;

  // Audit fields
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy?: string;
  publishedAt?: string;
  publishedBy?: string;
}

// API request/response types for relationships
export interface CreateRelationshipRequest {
  fromEntityId: string;
  toEntityId: string;
  type: RelationshipType;
  description?: string;
  startDate?: string;
  endDate?: string;
  sourceRefs?: string[];
  ownershipPercentage?: number;
}

export interface UpdateRelationshipRequest {
  type?: RelationshipType;
  description?: string;
  startDate?: string;
  endDate?: string;
  sourceRefs?: string[];
  ownershipPercentage?: number;
}

export interface RelationshipWithEntities extends Relationship {
  fromEntity: {
    entityId: string;
    name: string;
    type: string;
  };
  toEntity: {
    entityId: string;
    name: string;
    type: string;
  };
}

export interface RelationshipQueryParams {
  entityId?: string;
  type?: RelationshipType;
  status?: RelationshipStatus;
  limit?: number;
  cursor?: string;
}

// Ownership tree types for graph visualization
export interface OwnershipNode {
  entityId: string;
  name: string;
  type: string;
  children?: OwnershipNode[];
  parents?: OwnershipNode[];
  relationship?: {
    relationshipId: string;
    type: RelationshipType;
    ownershipPercentage?: number;
  };
}

export interface OwnershipTreeResponse {
  root: OwnershipNode;
  maxDepthReached: boolean;
}

// Summary types for entity fact packs

// A group of claims of the same type
export interface ClaimGroup {
  claimType: ClaimType;
  claims: EvidenceCard[];
  count: number;
  totalMonetaryValue?: number;  // in cents
}

// Entity summary - aggregated claims and narrative
export interface EntitySummary {
  entityId: string;
  entityName: string;
  claimGroups: ClaimGroup[];
  totalClaims: number;
  totalMonetaryValue: number;   // in cents
  dateRange: {
    earliest: string;  // ISO date
    latest: string;    // ISO date
  };
  categoryBreakdown: Record<string, number>;
  narrativeSummary: string;
  generatedAt: string;          // ISO timestamp
}

// Query params for entity summary endpoint
export interface EntitySummaryQueryParams {
  claimTypes?: ClaimType[];
  dateFrom?: string;
  dateTo?: string;
}

// Entity search types (for typeahead selector)
export interface EntitySearchResult {
  entityId: string;
  name: string;
  type: EntityType;
  aliases?: string[];  // Include aliases for disambiguation display
}

export interface EntitySearchResponse {
  entities: EntitySearchResult[];
  hasMore: boolean;
}
