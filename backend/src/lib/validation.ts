import { z } from 'zod';
import {
  CardCategory,
  CardStatus,
  EntityType,
  DocType,
  EvidenceStrength,
} from '@ledger/shared';

// Common validators
export const uuidSchema = z.string().uuid();
export const ulidSchema = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/);
export const idSchema = z.union([uuidSchema, ulidSchema]);

export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const isoTimestampSchema = z.string().datetime();

export const paginationSchema = z.object({
  limit: z.coerce.number().min(1).max(100).optional().default(20),
  cursor: z.string().optional(),
});

// Entity schemas
export const createEntitySchema = z.object({
  name: z.string().min(1).max(500),
  type: z.nativeEnum(EntityType),
  aliases: z.array(z.string().max(500)).max(50).optional().default([]),
  website: z.string().url().optional(),
  parentEntityId: idSchema.optional(),
  identifiers: z
    .object({
      ticker: z.string().max(10).optional(),
      ein: z.string().max(20).optional(),
      duns: z.string().max(20).optional(),
      lei: z.string().max(30).optional(),
    })
    .optional(),
});

export const updateEntitySchema = createEntitySchema.partial();

// Source schemas
export const createSourceSchema = z.object({
  title: z.string().min(1).max(1000),
  publisher: z.string().min(1).max(500),
  url: z.string().url(),
  docType: z.nativeEnum(DocType),
  excerpt: z.string().max(2000).optional(),
  notes: z.string().max(5000).optional(),
});

export const updateSourceSchema = createSourceSchema.partial();

// Score signals schema
export const scoreSignalsSchema = z.object({
  severity: z.number().min(0).max(5),
  intent: z.number().min(0).max(5),
  scope: z.number().min(0).max(5),
  recidivism: z.number().min(0).max(5),
  deception: z.number().min(0).max(5),
  accountability: z.number().min(0).max(5),
});

// Card schemas
export const createCardSchema = z.object({
  title: z.string().min(1).max(500),
  claim: z.string().min(1).max(1000),
  summary: z.string().min(1).max(5000),
  category: z.nativeEnum(CardCategory),
  entityIds: z.array(idSchema).min(1).max(20),
  eventDate: isoDateSchema,
  jurisdiction: z.string().max(100).optional(),
  sourceRefs: z.array(idSchema).max(50).optional().default([]),
  evidenceStrength: z.nativeEnum(EvidenceStrength),
  counterpoint: z.string().max(5000).optional(),
  tags: z.array(z.string().max(100)).max(20).optional().default([]),
  scoreSignals: scoreSignalsSchema.optional(),
});

export const updateCardSchema = createCardSchema.partial();

// Card transition schemas
export const disputeCardSchema = z.object({
  reason: z.string().min(1).max(5000),
});

export const correctCardSchema = z.object({
  correctionNote: z.string().min(1).max(5000),
});

export const retractCardSchema = z.object({
  reason: z.string().min(1).max(5000),
});

// Query parameter schemas
export const cardQuerySchema = paginationSchema.extend({
  category: z.nativeEnum(CardCategory).optional(),
  tag: z.string().max(100).optional(),
  status: z.nativeEnum(CardStatus).optional(),
});

export const entityQuerySchema = paginationSchema.extend({
  query: z.string().max(200).optional(),
  type: z.nativeEnum(EntityType).optional(),
});

export const entityCardsQuerySchema = paginationSchema.extend({
  status: z.nativeEnum(CardStatus).optional(),
});

export const auditQuerySchema = paginationSchema.extend({
  action: z.string().optional(),
  targetType: z.string().optional(),
  actorUserId: z.string().optional(),
  startDate: isoTimestampSchema.optional(),
  endDate: isoTimestampSchema.optional(),
});

// Intake schemas
const intakeStatusValues = ['NEW', 'REVIEWED', 'PROMOTED', 'REJECTED'] as const;

export const intakeQuerySchema = paginationSchema.extend({
  status: z.enum(intakeStatusValues).optional().default('NEW'),
});

export const intakePromoteSchema = z.object({
  entityId: idSchema.optional(),
  createEntity: z.object({
    name: z.string().min(1).max(500),
    type: z.nativeEnum(EntityType),
  }).optional(),
  tags: z.array(z.string().max(100)).max(20).optional(),
  cardSummary: z.string().min(1).max(5000),
}).refine(
  (data) => data.entityId || data.createEntity,
  { message: 'Either entityId or createEntity must be provided' }
);

// Relationship schemas
// Use Object.values to get the actual values from the const objects
const relationshipTypeValues = [
  'OWNS', 'CONTROLS', 'SUBSIDIARY_OF', 'ACQUIRED', 'DIVESTED', 'JV_PARTNER', 'AFFILIATED',
  'PARENT_OF', 'CONTRACTOR_TO', 'REGULATED_BY', 'BOARD_INTERLOCK', 'LOBBIED_BY', 'OTHER'
] as const;

const relationshipStatusValues = ['DRAFT', 'PUBLISHED', 'RETRACTED'] as const;

export const createRelationshipSchema = z.object({
  fromEntityId: idSchema,
  toEntityId: idSchema,
  type: z.enum(relationshipTypeValues),
  description: z.string().max(2000).optional(),
  startDate: isoDateSchema.optional(),
  endDate: isoDateSchema.optional(),
  sourceRefs: z.array(idSchema).max(50).optional().default([]),
  ownershipPercentage: z.number().min(0).max(100).optional(),
});

export const updateRelationshipSchema = z.object({
  type: z.enum(relationshipTypeValues).optional(),
  description: z.string().max(2000).optional(),
  startDate: isoDateSchema.optional(),
  endDate: isoDateSchema.optional(),
  sourceRefs: z.array(idSchema).max(50).optional(),
  ownershipPercentage: z.number().min(0).max(100).optional(),
});

export const retractRelationshipSchema = z.object({
  reason: z.string().min(1).max(5000),
});

export const relationshipQuerySchema = paginationSchema.extend({
  entityId: idSchema.optional(),
  type: z.enum(relationshipTypeValues).optional(),
  status: z.enum(relationshipStatusValues).optional(),
});

export const ownershipTreeQuerySchema = z.object({
  direction: z.enum(['up', 'down', 'both']).optional().default('both'),
  maxDepth: z.coerce.number().min(1).max(10).optional().default(6),
});

export const addAliasSchema = z.object({
  alias: z.string().min(1).max(500),
});

// Export types
export type CreateEntityInput = z.infer<typeof createEntitySchema>;
export type UpdateEntityInput = z.infer<typeof updateEntitySchema>;
export type CreateSourceInput = z.infer<typeof createSourceSchema>;
export type UpdateSourceInput = z.infer<typeof updateSourceSchema>;
export type CreateCardInput = z.infer<typeof createCardSchema>;
export type UpdateCardInput = z.infer<typeof updateCardSchema>;
export type DisputeCardInput = z.infer<typeof disputeCardSchema>;
export type CorrectCardInput = z.infer<typeof correctCardSchema>;
export type RetractCardInput = z.infer<typeof retractCardSchema>;
export type CardQueryInput = z.infer<typeof cardQuerySchema>;
export type EntityQueryInput = z.infer<typeof entityQuerySchema>;
export type EntityCardsQueryInput = z.infer<typeof entityCardsQuerySchema>;
export type AuditQueryInput = z.infer<typeof auditQuerySchema>;
export type IntakeQueryInput = z.infer<typeof intakeQuerySchema>;
export type IntakePromoteInput = z.infer<typeof intakePromoteSchema>;
export type CreateRelationshipInput = z.infer<typeof createRelationshipSchema>;
export type UpdateRelationshipInput = z.infer<typeof updateRelationshipSchema>;
export type RetractRelationshipInput = z.infer<typeof retractRelationshipSchema>;
export type RelationshipQueryInput = z.infer<typeof relationshipQuerySchema>;
export type OwnershipTreeQueryInput = z.infer<typeof ownershipTreeQuerySchema>;
export type AddAliasInput = z.infer<typeof addAliasSchema>;
