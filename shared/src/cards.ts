import type {
  CardCategory,
  CardStatus,
  EvidenceStrength,
  ClaimStance,
  ClaimType,
  MonetaryAmountType,
  AffectedCountUnit,
} from './enums';

// Score signals for transparent scoring (0-5 each)
export interface ScoreSignals {
  severity: number;      // harm magnitude
  intent: number;        // negligence → knowing → deliberate
  scope: number;         // # people / dollars / facilities
  recidivism: number;    // repeat offense pattern
  deception: number;     // concealment / misleading statements
  accountability: number; // remediation quality
}

// Detailed source reference with page/section pointers
export interface SourceReference {
  sourceId: string;
  pageNumber?: number;
  pageRange?: { start: number; end: number };
  section?: string;
  paragraph?: number;
  quote?: string;      // max 500 chars - exact quote from source
  notes?: string;      // max 500 chars - analyst notes
}

// Monetary amount with cents precision (avoids floating point issues)
export interface MonetaryAmount {
  value: number;         // amount in cents
  currency: string;      // ISO 4217 code (e.g., USD)
  type: MonetaryAmountType;
}

// Count of affected entities (people, accounts, etc.)
export interface AffectedCount {
  count: number;
  unit: AffectedCountUnit;
  isEstimate?: boolean;
}

// Evidence Card - the atomic unit of the platform
export interface EvidenceCard {
  cardId: string;
  title: string;
  claim: string;                    // one sentence, falsifiable
  summary: string;                  // plain-language explanation
  category: CardCategory;
  entityIds: string[];
  eventDate: string;                // ISO date of incident
  publishDate?: string;             // ISO date published on platform
  jurisdiction?: string;            // US-FED / state / city / etc
  sourceRefs: string[];             // Source IDs
  evidenceStrength: EvidenceStrength;
  status: CardStatus;
  counterpoint?: string;            // company response / rebuttal
  tags: string[];
  scoreSignals?: ScoreSignals;

  // Claim metadata (optional, for enhanced claims)
  claimStance?: ClaimStance;
  claimType?: ClaimType;
  sourceReferences?: SourceReference[];
  monetaryAmount?: MonetaryAmount;
  affectedCount?: AffectedCount;
  relatedCardIds?: string[];

  version: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

// Card with resolved entity names for display
export interface EvidenceCardWithEntities extends EvidenceCard {
  entities: Array<{ entityId: string; name: string }>;
  sources?: Array<{ sourceId: string; title: string; url?: string; verificationStatus: string }>;
}

// Request DTOs
export interface CreateCardRequest {
  title: string;
  claim: string;
  summary: string;
  category: CardCategory;
  entityIds: string[];
  eventDate: string;
  jurisdiction?: string;
  sourceRefs?: string[];
  evidenceStrength: EvidenceStrength;
  counterpoint?: string;
  tags?: string[];
  scoreSignals?: ScoreSignals;
  // Claim metadata
  claimStance?: ClaimStance;
  claimType?: ClaimType;
  sourceReferences?: SourceReference[];
  monetaryAmount?: MonetaryAmount;
  affectedCount?: AffectedCount;
  relatedCardIds?: string[];
}

export interface UpdateCardRequest {
  title?: string;
  claim?: string;
  summary?: string;
  category?: CardCategory;
  entityIds?: string[];
  eventDate?: string;
  jurisdiction?: string;
  sourceRefs?: string[];
  evidenceStrength?: EvidenceStrength;
  counterpoint?: string;
  tags?: string[];
  scoreSignals?: ScoreSignals;
  // Claim metadata
  claimStance?: ClaimStance;
  claimType?: ClaimType;
  sourceReferences?: SourceReference[];
  monetaryAmount?: MonetaryAmount;
  affectedCount?: AffectedCount;
  relatedCardIds?: string[];
}

// Transition requests
export interface SubmitCardRequest {
  cardId: string;
}

export interface PublishCardRequest {
  cardId: string;
}

export interface DisputeCardRequest {
  cardId: string;
  reason: string;
}

export interface CorrectCardRequest {
  cardId: string;
  correctionNote: string;
}

export interface RetractCardRequest {
  cardId: string;
  reason: string;
}

// Scoring weights configuration
export interface ScoringWeights {
  severity: number;
  intent: number;
  scope: number;
  recidivism: number;
  deception: number;
  accountability: number;
}

export const DEFAULT_SCORING_WEIGHTS: ScoringWeights = {
  severity: 0.25,
  intent: 0.15,
  scope: 0.20,
  recidivism: 0.15,
  deception: 0.15,
  accountability: 0.10,
};
