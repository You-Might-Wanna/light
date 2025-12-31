import { ulid } from 'ulid';
import { createHash } from 'crypto';
import type {
  Source,
  VerificationManifest,
  UploadUrlResponse,
  DownloadUrlResponse,
  SourceVerificationResponse,
  VerificationStatus,
} from '@ledger/shared';
import { config } from '../config.js';
import { getItem, putItem, stripKeys } from '../dynamodb.js';
import {
  getPresignedUploadUrl,
  getPresignedDownloadUrl,
  getObjectMetadata,
  getObjectStream,
  putObject,
  copyObject,
  deleteObject,
} from '../s3.js';
import { signData } from '../kms.js';
import {
  NotFoundError,
  FileTooLargeError,
  InvalidMimeTypeError,
  SourceNotPublicError,
} from '../errors.js';
import { isSourceReferencedByPublishedCard } from './cards.js';
import type { CreateSourceInput, UpdateSourceInput } from '../validation.js';

const TABLE = config.tables.sources;
const BUCKET = config.buckets.sources;

export async function createSource(
  input: CreateSourceInput,
  userId: string
): Promise<Source> {
  const now = new Date().toISOString();
  const sourceId = ulid();

  const source: Source = {
    sourceId,
    title: input.title,
    publisher: input.publisher,
    url: input.url,
    retrievedAt: now,
    docType: input.docType,
    verificationStatus: 'PENDING' as VerificationStatus,
    excerpt: input.excerpt,
    notes: input.notes,
    createdAt: now,
    updatedAt: now,
    createdBy: userId,
    updatedBy: userId,
  };

  await putItem({
    TableName: TABLE,
    Item: {
      PK: `SOURCE#${sourceId}`,
      SK: 'META',
      ...source,
    },
  });

  return source;
}

export async function getSource(sourceId: string): Promise<Source> {
  const item = await getItem<Source & { PK: string; SK: string }>({
    TableName: TABLE,
    Key: {
      PK: `SOURCE#${sourceId}`,
      SK: 'META',
    },
  });

  if (!item) {
    throw new NotFoundError('Source', sourceId);
  }

  return stripKeys(item);
}

export async function updateSource(
  sourceId: string,
  input: UpdateSourceInput,
  userId: string
): Promise<Source> {
  const existing = await getSource(sourceId);
  const now = new Date().toISOString();

  const updated: Source = {
    ...existing,
    ...input,
    updatedAt: now,
    updatedBy: userId,
  };

  await putItem({
    TableName: TABLE,
    Item: {
      PK: `SOURCE#${sourceId}`,
      SK: 'META',
      ...updated,
    },
  });

  return updated;
}

export async function generateUploadUrl(
  sourceId: string,
  contentType: string,
  userId: string
): Promise<UploadUrlResponse> {
  // Verify source exists
  await getSource(sourceId);

  // Validate content type
  const allowedTypes: readonly string[] = [
    'application/pdf',
    'text/html',
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp',
  ];

  if (!allowedTypes.includes(contentType)) {
    throw new InvalidMimeTypeError(contentType, allowedTypes);
  }

  // Generate S3 key
  const extension = getExtensionForMimeType(contentType);
  const s3Key = `sources/${sourceId}/upload.${extension}`;

  // Generate presigned URL
  const uploadUrl = await getPresignedUploadUrl(
    BUCKET,
    s3Key,
    contentType,
    50 * 1024 * 1024 // 50 MB max
  );

  const expiresAt = new Date(
    Date.now() + config.api.presignedUrlExpirySeconds * 1000
  ).toISOString();

  // Update source with pending s3Key
  await updateSource(sourceId, {}, userId);

  return {
    uploadUrl,
    s3Key,
    expiresAt,
  };
}

export async function finalizeSource(
  sourceId: string,
  userId: string
): Promise<Source> {
  const source = await getSource(sourceId);

  // Find the uploaded file - try all supported extensions
  const extensions = ['pdf', 'html', 'png', 'jpeg', 'jpg', 'gif', 'webp'];
  let uploadKey: string | null = null;
  let metadata: { contentLength: number; contentType: string; eTag: string } | null = null;

  for (const ext of extensions) {
    const tryKey = `sources/${sourceId}/upload.${ext}`;
    metadata = await getObjectMetadata(BUCKET, tryKey);
    if (metadata) {
      uploadKey = tryKey;
      break;
    }
  }

  if (!metadata || !uploadKey) {
    throw new NotFoundError('Uploaded file', sourceId);
  }

  // Validate file size
  if (metadata.contentLength > 50 * 1024 * 1024) {
    throw new FileTooLargeError(50 * 1024 * 1024);
  }

  // Compute SHA-256 from the actual upload key
  const stream = await getObjectStream(BUCKET, uploadKey);
  if (!stream) {
    throw new NotFoundError('Uploaded file stream', sourceId);
  }

  const hash = createHash('sha256');
  const reader = stream.getReader();

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    hash.update(value);
  }

  const sha256 = hash.digest('hex');

  // Determine final key with hash
  const extension = getExtensionForMimeType(metadata.contentType);
  const finalS3Key = `sources/${sourceId}/${sha256}.${extension}`;

  // Copy uploaded file to final hash-based key
  await copyObject(BUCKET, uploadKey, finalS3Key);

  // Delete the temporary upload file
  await deleteObject(BUCKET, uploadKey);

  // Create verification manifest
  const now = new Date().toISOString();
  const manifest: VerificationManifest = {
    sourceId,
    s3Key: finalS3Key,
    sha256,
    byteLength: metadata.contentLength,
    mimeType: metadata.contentType,
    retrievedAt: source.retrievedAt,
    publisher: source.publisher,
    url: source.url,
    verifiedAt: now,
    verificationAlgorithm: 'RSASSA_PSS_SHA_256',
    verificationKeyId: config.kms.signingKeyId,
  };

  // Sign the manifest
  const manifestJson = JSON.stringify(manifest);
  const { signature, keyId, algorithm } = await signData(
    Buffer.from(manifestJson)
  );

  // Store manifest in S3
  const manifestS3Key = `sources/${sourceId}/manifests/${sha256}.json`;
  await putObject(BUCKET, manifestS3Key, manifestJson, 'application/json');

  // Update source with verification info
  const updated: Source = {
    ...source,
    sha256,
    byteLength: metadata.contentLength,
    mimeType: metadata.contentType,
    s3Key: finalS3Key,
    verificationStatus: 'VERIFIED' as VerificationStatus,
    verifiedAt: now,
    verificationManifestS3Key: manifestS3Key,
    verificationSignature: signature,
    verificationKeyId: keyId,
    verificationAlgorithm: algorithm,
    updatedAt: now,
    updatedBy: userId,
  };

  await putItem({
    TableName: TABLE,
    Item: {
      PK: `SOURCE#${sourceId}`,
      SK: 'META',
      ...updated,
    },
  });

  return updated;
}

export async function generateDownloadUrl(
  sourceId: string
): Promise<DownloadUrlResponse> {
  const source = await getSource(sourceId);

  if (!source.s3Key) {
    throw new NotFoundError('Source file', sourceId);
  }

  // Security: Only allow downloads for verified sources referenced by published cards
  // This prevents ID-guessing attacks and leakage of unpublished/unverified content
  if (source.verificationStatus !== 'VERIFIED') {
    throw new SourceNotPublicError(sourceId);
  }

  const isPublished = await isSourceReferencedByPublishedCard(sourceId);
  if (!isPublished) {
    throw new SourceNotPublicError(sourceId);
  }

  const downloadUrl = await getPresignedDownloadUrl(
    BUCKET,
    source.s3Key,
    `${source.title}.${getExtensionForMimeType(source.mimeType || 'application/pdf')}`
  );

  const expiresAt = new Date(
    Date.now() + config.api.presignedUrlExpirySeconds * 1000
  ).toISOString();

  return {
    downloadUrl,
    expiresAt,
    filename: source.title,
  };
}

export async function getSourceVerification(
  sourceId: string
): Promise<SourceVerificationResponse> {
  const source = await getSource(sourceId);

  return {
    sourceId: source.sourceId,
    verificationStatus: source.verificationStatus,
    verifiedAt: source.verifiedAt,
    sha256: source.sha256,
    byteLength: source.byteLength,
    mimeType: source.mimeType,
    manifestUrl: source.verificationManifestS3Key
      ? await getPresignedDownloadUrl(
          BUCKET,
          source.verificationManifestS3Key,
          'manifest.json'
        )
      : undefined,
    signature: source.verificationSignature,
    keyId: source.verificationKeyId,
    algorithm: source.verificationAlgorithm,
  };
}

function getExtensionForMimeType(mimeType: string): string {
  const map: Record<string, string> = {
    'application/pdf': 'pdf',
    'text/html': 'html',
    'image/png': 'png',
    'image/jpeg': 'jpeg',
    'image/gif': 'gif',
    'image/webp': 'webp',
  };
  return map[mimeType] || 'bin';
}
