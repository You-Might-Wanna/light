import { describe, it, expect, vi, beforeEach } from 'vitest';
import { normalizeName, findEntityByName, createEntity } from './entities.js';
import * as dynamodb from '../dynamodb.js';
import { ConflictError } from '../errors.js';

// Mock dynamodb module
vi.mock('../dynamodb.js', () => ({
  getItem: vi.fn(),
  putItem: vi.fn(),
  queryItems: vi.fn(),
  scanItems: vi.fn(),
  encodeCursor: vi.fn(),
  decodeCursor: vi.fn(),
  stripKeys: vi.fn((item) => {
    const { PK, SK, GSI1PK, GSI1SK, ...rest } = item;
    return rest;
  }),
}));

// Mock config
vi.mock('../config.js', () => ({
  config: {
    tables: {
      entities: 'test-entities-table',
    },
  },
}));

describe('entities service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('normalizeName', () => {
    it('lowercases and removes non-alphanumeric characters', () => {
      expect(normalizeName('Acme Corporation')).toBe('acmecorporation');
      expect(normalizeName('U.S. Securities & Exchange Commission')).toBe('ussecuritiesexchangecommission');
      expect(normalizeName('ABC-123 Ltd.')).toBe('abc123ltd');
      expect(normalizeName('  Spaces  Everywhere  ')).toBe('spaceseverywhere');
    });

    it('handles unicode and special characters', () => {
      expect(normalizeName('Café Corp.')).toBe('cafcorp');
      expect(normalizeName('Über LLC')).toBe('berllc');
    });

    it('handles empty strings', () => {
      expect(normalizeName('')).toBe('');
    });
  });

  describe('findEntityByName', () => {
    it('returns entity when found', async () => {
      const mockEntity = {
        PK: 'ENTITY#123',
        SK: 'META',
        GSI1PK: 'NAME#acmecorp',
        GSI1SK: 'ENTITY#123',
        entityId: '123',
        name: 'Acme Corp',
        type: 'CORPORATION',
        aliases: [],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      vi.mocked(dynamodb.queryItems).mockResolvedValueOnce({
        items: [mockEntity],
        lastEvaluatedKey: undefined,
      });

      const result = await findEntityByName('Acme Corp');

      expect(result).toEqual({
        entityId: '123',
        name: 'Acme Corp',
        type: 'CORPORATION',
        aliases: [],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      });

      expect(dynamodb.queryItems).toHaveBeenCalledWith({
        TableName: 'test-entities-table',
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :pk',
        ExpressionAttributeValues: {
          ':pk': 'NAME#acmecorp',
        },
        Limit: 1,
      });
    });

    it('returns null when not found', async () => {
      vi.mocked(dynamodb.queryItems).mockResolvedValueOnce({
        items: [],
        lastEvaluatedKey: undefined,
      });

      const result = await findEntityByName('Non-Existent Corp');

      expect(result).toBeNull();
    });

    it('normalizes the name before searching', async () => {
      vi.mocked(dynamodb.queryItems).mockResolvedValueOnce({
        items: [],
        lastEvaluatedKey: undefined,
      });

      await findEntityByName('Acme Corp.');

      expect(dynamodb.queryItems).toHaveBeenCalledWith(
        expect.objectContaining({
          ExpressionAttributeValues: {
            ':pk': 'NAME#acmecorp',
          },
        })
      );
    });
  });

  describe('createEntity', () => {
    it('throws ConflictError when entity with same normalized name exists', async () => {
      const existingEntity = {
        PK: 'ENTITY#existing123',
        SK: 'META',
        entityId: 'existing123',
        name: 'Acme Corp',
        type: 'CORPORATION',
        aliases: [],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      vi.mocked(dynamodb.queryItems).mockResolvedValue({
        items: [existingEntity],
        lastEvaluatedKey: undefined,
      });

      await expect(
        createEntity({ name: 'Acme Corp', type: 'CORPORATION', aliases: [] }, 'user-123')
      ).rejects.toThrow(ConflictError);

      await expect(
        createEntity({ name: 'Acme Corp', type: 'CORPORATION', aliases: [] }, 'user-123')
      ).rejects.toThrow(/already exists/);

      // Should not have called putItem since we're rejecting duplicates
      expect(dynamodb.putItem).not.toHaveBeenCalled();
    });

    it('creates entity when no duplicate exists', async () => {
      vi.mocked(dynamodb.queryItems).mockResolvedValueOnce({
        items: [],
        lastEvaluatedKey: undefined,
      });
      vi.mocked(dynamodb.putItem).mockResolvedValueOnce(undefined);

      const result = await createEntity(
        { name: 'New Entity', type: 'CORPORATION', aliases: [] },
        'user-123'
      );

      expect(result.name).toBe('New Entity');
      expect(result.type).toBe('CORPORATION');
      expect(result.entityId).toBeDefined();
      expect(result.aliases).toEqual([]);
      expect(dynamodb.putItem).toHaveBeenCalledTimes(1);
    });

    it('detects duplicates with different casing or punctuation', async () => {
      const existingEntity = {
        PK: 'ENTITY#existing123',
        SK: 'META',
        entityId: 'existing123',
        name: 'SEC',
        type: 'AGENCY',
        aliases: [],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      // First call - check for duplicate
      vi.mocked(dynamodb.queryItems).mockResolvedValueOnce({
        items: [existingEntity],
        lastEvaluatedKey: undefined,
      });

      // Try to create "S.E.C." which normalizes to "sec"
      await expect(
        createEntity({ name: 'S.E.C.', type: 'AGENCY', aliases: [] }, 'user-123')
      ).rejects.toThrow(ConflictError);

      expect(dynamodb.putItem).not.toHaveBeenCalled();
    });
  });
});
