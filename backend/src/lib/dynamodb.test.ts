import { describe, it, expect } from 'vitest';
import { encodeCursor, decodeCursor, stripKeys } from './dynamodb.js';

describe('dynamodb utilities', () => {
  describe('encodeCursor / decodeCursor', () => {
    it('encodes and decodes cursor correctly', () => {
      const key = { PK: 'ENTITY#123', SK: 'META' };
      const encoded = encodeCursor(key);
      const decoded = decodeCursor(encoded);
      expect(decoded).toEqual(key);
    });

    it('produces base64url encoded string', () => {
      const key = { PK: 'TEST' };
      const encoded = encodeCursor(key);
      // base64url should not contain +, /, or =
      expect(encoded).not.toMatch(/[+/=]/);
    });

    it('handles complex keys', () => {
      const key = {
        PK: 'CARD#01ARZ3NDEKTSV4RRFFQ69G5FAV',
        SK: 'V#00001',
        GSI1PK: 'STATUS#PUBLISHED#2024-01',
        GSI1SK: '2024-01-15T10:30:00Z',
      };
      const encoded = encodeCursor(key);
      const decoded = decodeCursor(encoded);
      expect(decoded).toEqual(key);
    });

    it('returns undefined for invalid cursor', () => {
      expect(decodeCursor('not-valid-base64url!!!')).toBeUndefined();
      expect(decodeCursor('')).toBeUndefined();
    });

    it('returns undefined for non-JSON content', () => {
      const notJson = Buffer.from('hello world').toString('base64url');
      expect(decodeCursor(notJson)).toBeUndefined();
    });
  });

  describe('stripKeys', () => {
    it('removes PK and SK from item', () => {
      const item = {
        PK: 'ENTITY#123',
        SK: 'META',
        entityId: '123',
        name: 'Test Entity',
      };
      const stripped = stripKeys(item);
      expect(stripped).toEqual({
        entityId: '123',
        name: 'Test Entity',
      });
      expect(stripped).not.toHaveProperty('PK');
      expect(stripped).not.toHaveProperty('SK');
    });

    it('removes GSI keys if present', () => {
      const item = {
        PK: 'CARD#456',
        SK: 'V#00001',
        GSI1PK: 'STATUS#PUBLISHED',
        GSI1SK: '2024-01-15',
        GSI2PK: 'ENTITY#123',
        GSI2SK: '2024-01-15',
        cardId: '456',
        title: 'Test Card',
      };
      const stripped = stripKeys(item);
      expect(stripped).toEqual({
        cardId: '456',
        title: 'Test Card',
      });
      expect(stripped).not.toHaveProperty('GSI1PK');
      expect(stripped).not.toHaveProperty('GSI1SK');
      expect(stripped).not.toHaveProperty('GSI2PK');
      expect(stripped).not.toHaveProperty('GSI2SK');
    });

    it('does not modify original item', () => {
      const item = {
        PK: 'TEST#1',
        SK: 'META',
        id: '1',
      };
      stripKeys(item);
      expect(item.PK).toBe('TEST#1');
      expect(item.SK).toBe('META');
    });

    it('handles items with only required keys', () => {
      const item = {
        PK: 'MINIMAL',
        SK: 'ITEM',
        data: 'value',
      };
      const stripped = stripKeys(item);
      expect(stripped).toEqual({ data: 'value' });
    });
  });
});