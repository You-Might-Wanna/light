// Category of misconduct
export const CardCategory = {
  LABOR: 'labor',
  CONSUMER: 'consumer',
  ENVIRONMENT: 'environment',
  PROCUREMENT: 'procurement',
  PRIVACY: 'privacy',
  LOBBYING: 'lobbying',
  FRAUD: 'fraud',
  GOVERNANCE: 'governance',
  OTHER: 'other',
} as const;
export type CardCategory = (typeof CardCategory)[keyof typeof CardCategory];

// Evidence card lifecycle status
export const CardStatus = {
  DRAFT: 'DRAFT',
  REVIEW: 'REVIEW',
  PUBLISHED: 'PUBLISHED',
  DISPUTED: 'DISPUTED',
  CORRECTED: 'CORRECTED',
  RETRACTED: 'RETRACTED',
  ARCHIVED: 'ARCHIVED',
} as const;
export type CardStatus = (typeof CardStatus)[keyof typeof CardStatus];

// Entity type
export const EntityType = {
  CORPORATION: 'CORPORATION',
  AGENCY: 'AGENCY',
  NONPROFIT: 'NONPROFIT',
  VENDOR: 'VENDOR',
  INDIVIDUAL_PUBLIC_OFFICIAL: 'INDIVIDUAL_PUBLIC_OFFICIAL',
} as const;
export type EntityType = (typeof EntityType)[keyof typeof EntityType];

// Document type for sources
export const DocType = {
  PDF: 'PDF',
  HTML: 'HTML',
  IMAGE: 'IMAGE',
  OTHER: 'OTHER',
} as const;
export type DocType = (typeof DocType)[keyof typeof DocType];

// Source verification status
export const VerificationStatus = {
  PENDING: 'PENDING',
  VERIFIED: 'VERIFIED',
  FAILED: 'FAILED',
} as const;
export type VerificationStatus = (typeof VerificationStatus)[keyof typeof VerificationStatus];

// Evidence strength level
export const EvidenceStrength = {
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW',
} as const;
export type EvidenceStrength = (typeof EvidenceStrength)[keyof typeof EvidenceStrength];

// Relationship types between entities
export const RelationshipType = {
  PARENT_OF: 'PARENT_OF',
  SUBSIDIARY_OF: 'SUBSIDIARY_OF',
  CONTRACTOR_TO: 'CONTRACTOR_TO',
  REGULATED_BY: 'REGULATED_BY',
  BOARD_INTERLOCK: 'BOARD_INTERLOCK',
  LOBBIED_BY: 'LOBBIED_BY',
  OTHER: 'OTHER',
} as const;
export type RelationshipType = (typeof RelationshipType)[keyof typeof RelationshipType];

// Audit log action types
export const AuditAction = {
  CREATE_ENTITY: 'CREATE_ENTITY',
  UPDATE_ENTITY: 'UPDATE_ENTITY',
  CREATE_SOURCE: 'CREATE_SOURCE',
  UPDATE_SOURCE: 'UPDATE_SOURCE',
  UPLOAD_SOURCE: 'UPLOAD_SOURCE',
  VERIFY_SOURCE: 'VERIFY_SOURCE',
  CREATE_CARD: 'CREATE_CARD',
  UPDATE_CARD: 'UPDATE_CARD',
  SUBMIT_CARD: 'SUBMIT_CARD',
  PUBLISH_CARD: 'PUBLISH_CARD',
  DISPUTE_CARD: 'DISPUTE_CARD',
  CORRECT_CARD: 'CORRECT_CARD',
  RETRACT_CARD: 'RETRACT_CARD',
  ARCHIVE_CARD: 'ARCHIVE_CARD',
  RESTORE_CARD: 'RESTORE_CARD',
  ADMIN_LOGIN: 'ADMIN_LOGIN',
  ADMIN_LOGOUT: 'ADMIN_LOGOUT',
  MFA_RESET: 'MFA_RESET',
} as const;
export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];
