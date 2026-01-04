import { describe, it, expect } from 'vitest';
import { generateNarrativeSummary, formatCurrency, formatDateRange, getClaimTypeLabel } from '../templates/summary.js';
import type { ClaimGroup, ClaimType } from '@ledger/shared';

describe('summary templates', () => {
  describe('formatCurrency', () => {
    it('formats cents to USD string', () => {
      expect(formatCurrency(100000000)).toBe('$1,000,000');
      expect(formatCurrency(50000)).toBe('$500');
      expect(formatCurrency(0)).toBe('$0');
    });

    it('handles different currencies', () => {
      expect(formatCurrency(100000, 'EUR')).toBe('€1,000');
      expect(formatCurrency(100000, 'GBP')).toBe('£1,000');
    });
  });

  describe('formatDateRange', () => {
    it('formats single date', () => {
      const result = formatDateRange('2024-01-15', '2024-01-15');
      expect(result).toContain('2024');
    });

    it('formats date range with different dates', () => {
      const result = formatDateRange('2020-03-15', '2024-12-15');
      // Should contain " to " for ranges
      expect(result).toContain(' to ');
      expect(result).toContain('2020');
      expect(result).toContain('2024');
    });
  });

  describe('getClaimTypeLabel', () => {
    it('returns human-readable labels', () => {
      expect(getClaimTypeLabel('ENFORCEMENT_ACTION')).toBe('enforcement actions');
      expect(getClaimTypeLabel('SETTLEMENT')).toBe('settlements');
      expect(getClaimTypeLabel('PENALTY')).toBe('penalties');
      expect(getClaimTypeLabel('UNCLASSIFIED')).toBe('other claims');
    });
  });

  describe('generateNarrativeSummary', () => {
    it('returns empty message when no claims', () => {
      const result = generateNarrativeSummary(
        'Acme Corp',
        [],
        0,
        0,
        { earliest: '2024-01-01', latest: '2024-01-01' }
      );
      expect(result).toBe('No published claims are currently recorded for Acme Corp.');
    });

    it('generates summary for single claim type', () => {
      const claimGroups: ClaimGroup[] = [
        {
          claimType: 'PENALTY' as ClaimType,
          claims: [],
          count: 3,
          totalMonetaryValue: 500000000, // $5M
        },
      ];

      const result = generateNarrativeSummary(
        'Acme Corp',
        claimGroups,
        3,
        500000000,
        { earliest: '2020-01-15', latest: '2024-06-30' }
      );

      expect(result).toContain('Acme Corp has 3 documented claims');
      expect(result).toContain('January 2020 to June 2024');
      expect(result).toContain('$5,000,000');
      expect(result).toContain('3 penalties');
    });

    it('generates summary for multiple claim types', () => {
      const claimGroups: ClaimGroup[] = [
        {
          claimType: 'ENFORCEMENT_ACTION' as ClaimType,
          claims: [],
          count: 5,
        },
        {
          claimType: 'SETTLEMENT' as ClaimType,
          claims: [],
          count: 2,
          totalMonetaryValue: 100000000,
        },
      ];

      const result = generateNarrativeSummary(
        'Big Corp',
        claimGroups,
        7,
        100000000,
        { earliest: '2022-01-01', latest: '2024-12-31' }
      );

      expect(result).toContain('Big Corp has 7 documented claims');
      expect(result).toContain('5 enforcement actions');
      expect(result).toContain('2 settlements');
    });

    it('handles single claim correctly', () => {
      const claimGroups: ClaimGroup[] = [
        {
          claimType: 'WARNING_LETTER' as ClaimType,
          claims: [],
          count: 1,
        },
      ];

      const result = generateNarrativeSummary(
        'Small Inc',
        claimGroups,
        1,
        0,
        { earliest: '2024-06-15', latest: '2024-06-15' }
      );

      expect(result).toContain('Small Inc has 1 documented claim');
      expect(result).not.toContain('claims spanning');
    });
  });
});
