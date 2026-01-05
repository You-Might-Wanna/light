import { describe, it, expect } from 'vitest';
import {
  uuidSchema,
  ulidSchema,
  idSchema,
  isoDateSchema,
  paginationSchema,
  createEntitySchema,
  createSourceSchema,
  createCardSchema,
  scoreSignalsSchema,
  entitySearchSchema,
  intakePromoteSchema,
} from './validation.js';
import { EntityType, DocType, CardCategory, EvidenceStrength } from '@ledger/shared';

describe('validation schemas', () => {
  describe('uuidSchema', () => {
    it('accepts valid UUIDs', () => {
      expect(uuidSchema.safeParse('123e4567-e89b-12d3-a456-426614174000').success).toBe(true);
      expect(uuidSchema.safeParse('00000000-0000-0000-0000-000000000000').success).toBe(true);
    });

    it('rejects invalid UUIDs', () => {
      expect(uuidSchema.safeParse('not-a-uuid').success).toBe(false);
      expect(uuidSchema.safeParse('123e4567-e89b-12d3-a456').success).toBe(false);
      expect(uuidSchema.safeParse('').success).toBe(false);
    });
  });

  describe('ulidSchema', () => {
    it('accepts valid ULIDs', () => {
      expect(ulidSchema.safeParse('01ARZ3NDEKTSV4RRFFQ69G5FAV').success).toBe(true);
      expect(ulidSchema.safeParse('01HN8Y1ZBPVD60W3YB6S5PQNRC').success).toBe(true);
    });

    it('rejects invalid ULIDs', () => {
      expect(ulidSchema.safeParse('not-a-ulid').success).toBe(false);
      expect(ulidSchema.safeParse('01ARZ3NDEKTSV4RRFFQ69G5FA').success).toBe(false); // 25 chars
      expect(ulidSchema.safeParse('01ARZ3NDEKTSV4RRFFQ69G5FAVO').success).toBe(false); // 27 chars
      expect(ulidSchema.safeParse('').success).toBe(false);
    });
  });

  describe('idSchema', () => {
    it('accepts both UUIDs and ULIDs', () => {
      expect(idSchema.safeParse('123e4567-e89b-12d3-a456-426614174000').success).toBe(true);
      expect(idSchema.safeParse('01ARZ3NDEKTSV4RRFFQ69G5FAV').success).toBe(true);
    });

    it('rejects invalid IDs', () => {
      expect(idSchema.safeParse('invalid').success).toBe(false);
    });
  });

  describe('isoDateSchema', () => {
    it('accepts valid ISO dates', () => {
      expect(isoDateSchema.safeParse('2024-01-15').success).toBe(true);
      expect(isoDateSchema.safeParse('1999-12-31').success).toBe(true);
    });

    it('rejects invalid date formats', () => {
      expect(isoDateSchema.safeParse('01-15-2024').success).toBe(false);
      expect(isoDateSchema.safeParse('2024/01/15').success).toBe(false);
      expect(isoDateSchema.safeParse('2024-1-15').success).toBe(false);
    });
  });

  describe('paginationSchema', () => {
    it('parses valid pagination params', () => {
      const result = paginationSchema.parse({ limit: 50, cursor: 'abc123' });
      expect(result.limit).toBe(50);
      expect(result.cursor).toBe('abc123');
    });

    it('applies defaults', () => {
      const result = paginationSchema.parse({});
      expect(result.limit).toBe(20);
      expect(result.cursor).toBeUndefined();
    });

    it('coerces string numbers', () => {
      const result = paginationSchema.parse({ limit: '30' });
      expect(result.limit).toBe(30);
    });

    it('enforces limits', () => {
      expect(paginationSchema.safeParse({ limit: 0 }).success).toBe(false);
      expect(paginationSchema.safeParse({ limit: 101 }).success).toBe(false);
    });
  });

  describe('createEntitySchema', () => {
    it('accepts valid entity data', () => {
      const result = createEntitySchema.parse({
        name: 'Acme Corporation',
        type: EntityType.CORPORATION,
      });
      expect(result.name).toBe('Acme Corporation');
      expect(result.type).toBe(EntityType.CORPORATION);
      expect(result.aliases).toEqual([]);
    });

    it('accepts optional fields', () => {
      const result = createEntitySchema.parse({
        name: 'Acme Corporation',
        type: EntityType.CORPORATION,
        aliases: ['Acme Inc', 'Acme Ltd'],
        website: 'https://acme.com',
        identifiers: { ticker: 'ACME', ein: '12-3456789' },
      });
      expect(result.aliases).toEqual(['Acme Inc', 'Acme Ltd']);
      expect(result.website).toBe('https://acme.com');
      expect(result.identifiers?.ticker).toBe('ACME');
    });

    it('rejects invalid entity types', () => {
      expect(
        createEntitySchema.safeParse({
          name: 'Test',
          type: 'INVALID_TYPE',
        }).success
      ).toBe(false);
    });

    it('rejects empty names', () => {
      expect(
        createEntitySchema.safeParse({
          name: '',
          type: EntityType.CORPORATION,
        }).success
      ).toBe(false);
    });

    it('rejects invalid URLs', () => {
      expect(
        createEntitySchema.safeParse({
          name: 'Test',
          type: EntityType.CORPORATION,
          website: 'not-a-url',
        }).success
      ).toBe(false);
    });
  });

  describe('createSourceSchema', () => {
    it('accepts valid source data', () => {
      const result = createSourceSchema.parse({
        title: 'Important Document',
        publisher: 'Reuters',
        url: 'https://reuters.com/article/123',
        docType: DocType.PDF,
      });
      expect(result.title).toBe('Important Document');
      expect(result.docType).toBe(DocType.PDF);
    });

    it('accepts optional fields', () => {
      const result = createSourceSchema.parse({
        title: 'Document',
        publisher: 'Publisher',
        url: 'https://example.com',
        docType: DocType.HTML,
        excerpt: 'Key quote from document',
        notes: 'Internal notes about this source',
      });
      expect(result.excerpt).toBe('Key quote from document');
      expect(result.notes).toBe('Internal notes about this source');
    });
  });

  describe('scoreSignalsSchema', () => {
    it('accepts valid scores', () => {
      const result = scoreSignalsSchema.parse({
        severity: 3,
        intent: 4,
        scope: 2,
        recidivism: 1,
        deception: 5,
        accountability: 0,
      });
      expect(result.severity).toBe(3);
      expect(result.accountability).toBe(0);
    });

    it('rejects out of range scores', () => {
      expect(
        scoreSignalsSchema.safeParse({
          severity: 6,
          intent: 4,
          scope: 2,
          recidivism: 1,
          deception: 5,
          accountability: 0,
        }).success
      ).toBe(false);

      expect(
        scoreSignalsSchema.safeParse({
          severity: -1,
          intent: 4,
          scope: 2,
          recidivism: 1,
          deception: 5,
          accountability: 0,
        }).success
      ).toBe(false);
    });
  });

  describe('createCardSchema', () => {
    const validCard = {
      title: 'Fraud Case',
      claim: 'Company committed fraud',
      summary: 'Detailed summary of the fraud case...',
      category: CardCategory.FRAUD,
      entityIds: ['01ARZ3NDEKTSV4RRFFQ69G5FAV'],
      eventDate: '2024-01-15',
      evidenceStrength: EvidenceStrength.HIGH,
    };

    it('accepts valid card data', () => {
      const result = createCardSchema.parse(validCard);
      expect(result.title).toBe('Fraud Case');
      expect(result.category).toBe(CardCategory.FRAUD);
      expect(result.sourceRefs).toEqual([]);
      expect(result.tags).toEqual([]);
    });

    it('accepts optional fields', () => {
      const result = createCardSchema.parse({
        ...validCard,
        jurisdiction: 'US-CA',
        counterpoint: 'Company disputes allegations',
        tags: ['fraud', 'securities'],
        scoreSignals: {
          severity: 4,
          intent: 5,
          scope: 3,
          recidivism: 2,
          deception: 4,
          accountability: 1,
        },
      });
      expect(result.jurisdiction).toBe('US-CA');
      expect(result.tags).toEqual(['fraud', 'securities']);
      expect(result.scoreSignals?.severity).toBe(4);
    });

    it('requires at least one entity', () => {
      expect(
        createCardSchema.safeParse({
          ...validCard,
          entityIds: [],
        }).success
      ).toBe(false);
    });

    it('enforces max entity count', () => {
      expect(
        createCardSchema.safeParse({
          ...validCard,
          entityIds: Array(21).fill('01ARZ3NDEKTSV4RRFFQ69G5FAV'),
        }).success
      ).toBe(false);
    });
  });

  describe('entitySearchSchema', () => {
    it('accepts valid search query', () => {
      const result = entitySearchSchema.parse({ q: 'Acme' });
      expect(result.q).toBe('Acme');
      expect(result.limit).toBe(10); // default
    });

    it('accepts custom limit', () => {
      const result = entitySearchSchema.parse({ q: 'Acme', limit: '25' });
      expect(result.limit).toBe(25);
    });

    it('rejects query shorter than 2 characters', () => {
      expect(entitySearchSchema.safeParse({ q: 'A' }).success).toBe(false);
      expect(entitySearchSchema.safeParse({ q: '' }).success).toBe(false);
    });

    it('rejects query longer than 100 characters', () => {
      expect(entitySearchSchema.safeParse({ q: 'A'.repeat(101) }).success).toBe(false);
    });

    it('enforces max limit of 50', () => {
      expect(entitySearchSchema.safeParse({ q: 'Acme', limit: '51' }).success).toBe(false);
    });

    it('enforces min limit of 1', () => {
      expect(entitySearchSchema.safeParse({ q: 'Acme', limit: '0' }).success).toBe(false);
    });
  });

  describe('intakePromoteSchema', () => {
    it('accepts single entityId (legacy)', () => {
      const result = intakePromoteSchema.parse({
        entityId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
        cardSummary: 'Summary of the article',
      });
      expect(result.entityId).toBe('01ARZ3NDEKTSV4RRFFQ69G5FAV');
    });

    it('accepts createEntity (legacy)', () => {
      const result = intakePromoteSchema.parse({
        createEntity: { name: 'Acme Corp', type: 'CORPORATION' },
        cardSummary: 'Summary of the article',
      });
      expect(result.createEntity?.name).toBe('Acme Corp');
    });

    it('accepts multiple entityIds', () => {
      const result = intakePromoteSchema.parse({
        entityIds: ['01ARZ3NDEKTSV4RRFFQ69G5FAV', '01ARZ3NDEKTSV4RRFFQ69G5FAW'],
        cardSummary: 'Summary of the article',
      });
      expect(result.entityIds).toHaveLength(2);
    });

    it('accepts createEntities array', () => {
      const result = intakePromoteSchema.parse({
        createEntities: [
          { name: 'Acme Corp', type: 'CORPORATION' },
          { name: 'Widget Inc', type: 'CORPORATION' },
        ],
        cardSummary: 'Summary of the article',
      });
      expect(result.createEntities).toHaveLength(2);
    });

    it('accepts mixed entityIds and createEntities', () => {
      const result = intakePromoteSchema.parse({
        entityIds: ['01ARZ3NDEKTSV4RRFFQ69G5FAV'],
        createEntities: [{ name: 'New Entity', type: 'AGENCY' }],
        cardSummary: 'Summary of the article',
      });
      expect(result.entityIds).toHaveLength(1);
      expect(result.createEntities).toHaveLength(1);
    });

    it('rejects when no entity is provided', () => {
      expect(
        intakePromoteSchema.safeParse({
          cardSummary: 'Summary of the article',
        }).success
      ).toBe(false);
    });

    it('rejects empty entityIds array when no other entity provided', () => {
      expect(
        intakePromoteSchema.safeParse({
          entityIds: [],
          cardSummary: 'Summary of the article',
        }).success
      ).toBe(false);
    });

    it('enforces max 10 entityIds', () => {
      expect(
        intakePromoteSchema.safeParse({
          entityIds: Array(11).fill('01ARZ3NDEKTSV4RRFFQ69G5FAV'),
          cardSummary: 'Summary',
        }).success
      ).toBe(false);
    });

    it('enforces max 5 createEntities', () => {
      expect(
        intakePromoteSchema.safeParse({
          createEntities: Array(6).fill({ name: 'Entity', type: 'CORPORATION' }),
          cardSummary: 'Summary',
        }).success
      ).toBe(false);
    });

    it('requires cardSummary', () => {
      expect(
        intakePromoteSchema.safeParse({
          entityId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
        }).success
      ).toBe(false);
    });
  });
});