// Intake types for automated RSS ingestion

export type IntakeStatus = 'NEW' | 'REVIEWED' | 'PROMOTED' | 'REJECTED';

export interface IntakeItem {
  // Primary identifiers
  intakeId: string;        // ULID
  feedId: string;          // e.g., "ftc_press_releases"

  // Content from RSS feed
  canonicalUrl: string;
  title: string;
  publishedAt: string;     // ISO timestamp from feed
  publisher: string;       // FTC, SEC, DOJ, GAO
  summary?: string;        // RSS description/summary
  categories?: string[];   // RSS categories
  guid?: string;           // RSS guid if available

  // Dedupe key (sha256 of canonicalUrl + publishedAt)
  dedupeKey: string;

  // Processing status
  status: IntakeStatus;

  // Suggestions (can be set by automation or human)
  suggestedEntities?: string[];
  suggestedTags?: string[];

  // Snapshot info (if captured)
  snapshot?: IntakeSnapshot;

  // Promotion tracking
  promotedSourceId?: string;
  promotedCardId?: string;

  // Timestamps
  ingestedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;

  // Error tracking
  error?: string;
}

export interface IntakeSnapshot {
  bucket: string;
  key: string;
  sha256: string;
  byteLength: number;
  mimeType: string;
  capturedAt: string;
}

// Feed configuration
export interface FeedConfig {
  id: string;
  publisher: string;
  name: string;
  url: string;
  defaultTags: string[];
  perFeedCap: number;
  enabled: boolean;
}

export interface IntakeRails {
  maxItemsPerRun: number;
  maxPerFeedPerRun: number;
  maxRequestsPerHostPerMinute: number;
  minDelayMsBetweenRequestsSameHost: number;
  fetchTimeoutMs: number;
  maxHtmlSnapshotBytes: number;
  maxPdfBytes: number;
  allowedDomains: string[];
  stripQueryParams: string[];
}

export interface IntakeFeedsConfig {
  version: number;
  globalRails: IntakeRails;
  feeds: FeedConfig[];
}

// API types
export interface IntakeListResponse {
  items: IntakeItem[];
  nextToken?: string;
}

export interface IntakePromoteRequest {
  // Legacy single entity (backwards compat)
  entityId?: string;         // Optional: link to existing entity
  createEntity?: {           // Optional: create new entity
    name: string;
    type: string;
  };
  // Multi-entity support
  entityIds?: string[];      // Optional: link to multiple existing entities
  createEntities?: Array<{   // Optional: create multiple new entities
    name: string;
    type: string;
  }>;
  // Card metadata
  tags?: string[];
  cardSummary: string;
}

export interface IntakePromoteResponse {
  sourceId: string;
  cardId: string;
  entityIds?: string[];      // All entity IDs linked to the card
}

export interface IntakeIngestResult {
  feedId: string;
  itemsIngested: number;
  itemsSkipped: number;
  errors: string[];
}

export interface IntakeRunSummary {
  runId: string;
  startedAt: string;
  completedAt: string;
  totalIngested: number;
  totalSkipped: number;
  feedResults: IntakeIngestResult[];
}