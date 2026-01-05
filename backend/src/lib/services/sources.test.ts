import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SourceNotPublicError, NotFoundError } from '../errors.js';

// Mock dependencies before importing the module under test
vi.mock('../dynamodb.js', () => ({
  getItem: vi.fn(),
  putItem: vi.fn(),
  stripKeys: vi.fn((item: Record<string, unknown>) => {
    const result = { ...item };
    delete result.PK;
    delete result.SK;
    return result;
  }),
}));

vi.mock('../s3.js', () => ({
  getPresignedDownloadUrl: vi.fn().mockResolvedValue('https://presigned-url.example.com'),
}));

vi.mock('./cards.js', () => ({
  isSourceReferencedByPublishedCard: vi.fn(),
}));

vi.mock('../config.js', () => ({
  config: {
    tables: { sources: 'test-sources-table' },
    buckets: { sources: 'test-sources-bucket' },
    api: { presignedUrlExpirySeconds: 3600 },
  },
}));

// Import after mocks are set up
import { generateDownloadUrl, getSourcesByIds } from './sources.js';
import { getItem } from '../dynamodb.js';
import { isSourceReferencedByPublishedCard } from './cards.js';

describe('generateDownloadUrl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const baseSource = {
    PK: 'SOURCE#test-source-id',
    SK: 'META',
    sourceId: 'test-source-id',
    title: 'Test Document',
    publisher: 'Test Publisher',
    url: 'https://example.com/document',
    retrievedAt: '2024-01-01T00:00:00Z',
    docType: 'pdf',
    verificationStatus: 'VERIFIED',
    s3Key: 'sources/test-source-id/abc123.pdf',
    sha256: 'abc123',
    mimeType: 'application/pdf',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    createdBy: 'user-123',
    updatedBy: 'user-123',
  };

  describe('security: download authorization', () => {
    it('throws NotFoundError when source does not exist', async () => {
      vi.mocked(getItem).mockResolvedValue(null);

      await expect(generateDownloadUrl('nonexistent-id')).rejects.toThrow(NotFoundError);
    });

    it('throws NotFoundError when source has no s3Key', async () => {
      vi.mocked(getItem).mockResolvedValue({
        ...baseSource,
        s3Key: undefined,
      });

      await expect(generateDownloadUrl('test-source-id')).rejects.toThrow(NotFoundError);
    });

    it('throws SourceNotPublicError when source is PENDING verification', async () => {
      vi.mocked(getItem).mockResolvedValue({
        ...baseSource,
        verificationStatus: 'PENDING',
      });

      await expect(generateDownloadUrl('test-source-id')).rejects.toThrow(SourceNotPublicError);

      // Should not even check if published - fail fast on verification status
      expect(isSourceReferencedByPublishedCard).not.toHaveBeenCalled();
    });

    it('throws SourceNotPublicError when source is FAILED verification', async () => {
      vi.mocked(getItem).mockResolvedValue({
        ...baseSource,
        verificationStatus: 'FAILED',
      });

      await expect(generateDownloadUrl('test-source-id')).rejects.toThrow(SourceNotPublicError);
      expect(isSourceReferencedByPublishedCard).not.toHaveBeenCalled();
    });

    it('throws SourceNotPublicError when source is VERIFIED but NOT referenced by a published card', async () => {
      vi.mocked(getItem).mockResolvedValue(baseSource);
      vi.mocked(isSourceReferencedByPublishedCard).mockResolvedValue(false);

      await expect(generateDownloadUrl('test-source-id')).rejects.toThrow(SourceNotPublicError);
      expect(isSourceReferencedByPublishedCard).toHaveBeenCalledWith('test-source-id');
    });

    it('returns download URL when source is VERIFIED AND referenced by a published card', async () => {
      vi.mocked(getItem).mockResolvedValue(baseSource);
      vi.mocked(isSourceReferencedByPublishedCard).mockResolvedValue(true);

      const result = await generateDownloadUrl('test-source-id');

      expect(result).toEqual({
        downloadUrl: 'https://presigned-url.example.com',
        expiresAt: expect.any(String),
        filename: 'Test Document',
      });
      expect(isSourceReferencedByPublishedCard).toHaveBeenCalledWith('test-source-id');
    });

    it('prevents ID-guessing attacks by requiring both verification AND publication', async () => {
      // Even if an attacker guesses a valid source ID, they cannot download
      // unless the source is both verified AND referenced by a published card

      // Scenario: Attacker guesses ID of a verified but draft/unpublished source
      vi.mocked(getItem).mockResolvedValue({
        ...baseSource,
        verificationStatus: 'VERIFIED',
      });
      vi.mocked(isSourceReferencedByPublishedCard).mockResolvedValue(false);

      const error = await generateDownloadUrl('test-source-id').catch(e => e);

      expect(error).toBeInstanceOf(SourceNotPublicError);
      expect(error.statusCode).toBe(403);
      expect(error.message).toContain('not available for public download');
    });
  });
});

describe('getSourcesByIds', () => {
  const baseSource = {
    PK: 'SOURCE#source-1',
    SK: 'META',
    sourceId: 'source-1',
    title: 'First Document',
    publisher: 'Publisher A',
    url: 'https://example.com/doc1',
    verificationStatus: 'VERIFIED',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns source info for all found sources', async () => {
    vi.mocked(getItem)
      .mockResolvedValueOnce(baseSource)
      .mockResolvedValueOnce({
        ...baseSource,
        sourceId: 'source-2',
        title: 'Second Document',
        url: 'https://example.com/doc2',
        verificationStatus: 'PENDING',
      });

    const result = await getSourcesByIds(['source-1', 'source-2']);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      sourceId: 'source-1',
      title: 'First Document',
      url: 'https://example.com/doc1',
      verificationStatus: 'VERIFIED',
    });
    expect(result[1]).toEqual({
      sourceId: 'source-2',
      title: 'Second Document',
      url: 'https://example.com/doc2',
      verificationStatus: 'PENDING',
    });
  });

  it('returns placeholder for missing sources', async () => {
    vi.mocked(getItem)
      .mockResolvedValueOnce(baseSource)
      .mockResolvedValueOnce(null); // source-2 not found

    const result = await getSourcesByIds(['source-1', 'source-2']);

    expect(result).toHaveLength(2);
    expect(result[0].title).toBe('First Document');
    expect(result[1]).toEqual({
      sourceId: 'source-2',
      title: '[Source Not Found]',
      verificationStatus: 'UNKNOWN',
    });
  });

  it('returns empty array for empty input', async () => {
    const result = await getSourcesByIds([]);
    expect(result).toEqual([]);
  });
});