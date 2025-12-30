import type { DocType, VerificationStatus } from './enums.js';

// Source - a public record or document
export interface Source {
  sourceId: string;
  title: string;
  publisher: string;              // e.g., DOJ, SEC, EPA
  url: string;                    // original public URL
  retrievedAt: string;            // ISO timestamp
  docType: DocType;
  sha256?: string;                // content hash (set after upload)
  byteLength?: number;            // file size in bytes
  mimeType?: string;              // detected MIME type
  verificationStatus: VerificationStatus;
  verifiedAt?: string;
  verificationManifestS3Key?: string;
  verificationSignature?: string; // base64
  verificationKeyId?: string;     // KMS key ID/ARN
  verificationAlgorithm?: string; // e.g., RSASSA_PSS_SHA_256
  s3Key?: string;                 // private object key
  excerpt?: string;               // short quoted excerpt
  notes?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

// Verification manifest stored in S3
export interface VerificationManifest {
  sourceId: string;
  s3Key: string;
  sha256: string;
  byteLength: number;
  mimeType: string;
  retrievedAt: string;
  publisher: string;
  url: string;
  verifiedAt: string;
  verificationAlgorithm: string;
  verificationKeyId: string;
}

// Request DTOs
export interface CreateSourceRequest {
  title: string;
  publisher: string;
  url: string;
  docType: DocType;
  excerpt?: string;
  notes?: string;
}

export interface UpdateSourceRequest {
  title?: string;
  publisher?: string;
  url?: string;
  docType?: DocType;
  excerpt?: string;
  notes?: string;
}

// Upload URL response
export interface UploadUrlResponse {
  uploadUrl: string;
  s3Key: string;
  expiresAt: string;
}

// Download URL response
export interface DownloadUrlResponse {
  downloadUrl: string;
  expiresAt: string;
  filename: string;
}

// Verification response for public API
export interface SourceVerificationResponse {
  sourceId: string;
  verificationStatus: VerificationStatus;
  verifiedAt?: string;
  sha256?: string;
  byteLength?: number;
  mimeType?: string;
  manifestUrl?: string;
  signature?: string;
  keyId?: string;
  algorithm?: string;
}

// Allowed MIME types for uploads
export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'text/html',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
] as const;

export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

// Max file size in bytes (50 MB)
export const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;
