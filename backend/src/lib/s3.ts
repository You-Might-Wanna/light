import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from './config.js';

// Create S3 client
export const s3Client = new S3Client({ region: config.region });

// Generate presigned URL for upload
export async function getPresignedUploadUrl(
  bucket: string,
  key: string,
  contentType: string,
  maxSizeBytes: number,
  expiresIn: number = config.api.presignedUrlExpirySeconds
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
  });

  return getSignedUrl(s3Client, command, {
    expiresIn,
    signableHeaders: new Set(['content-type']),
  });
}

// Generate presigned URL for download
export async function getPresignedDownloadUrl(
  bucket: string,
  key: string,
  filename: string,
  expiresIn: number = config.api.presignedUrlExpirySeconds
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
    ResponseContentDisposition: `attachment; filename="${filename}"`,
  });

  return getSignedUrl(s3Client, command, { expiresIn });
}

// Get object metadata
export async function getObjectMetadata(
  bucket: string,
  key: string
): Promise<{ contentLength: number; contentType: string; eTag: string } | null> {
  try {
    const command = new HeadObjectCommand({
      Bucket: bucket,
      Key: key,
    });
    const response = await s3Client.send(command);
    return {
      contentLength: response.ContentLength || 0,
      contentType: response.ContentType || 'application/octet-stream',
      eTag: response.ETag || '',
    };
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'name' in error && error.name === 'NotFound') {
      return null;
    }
    throw error;
  }
}

// Stream object for hash computation
export async function getObjectStream(
  bucket: string,
  key: string
): Promise<ReadableStream | null> {
  try {
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    });
    const response = await s3Client.send(command);
    return response.Body?.transformToWebStream() || null;
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'name' in error && error.name === 'NoSuchKey') {
      return null;
    }
    throw error;
  }
}

// Upload object
export async function putObject(
  bucket: string,
  key: string,
  body: string | Buffer,
  contentType: string
): Promise<void> {
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: contentType,
  });
  await s3Client.send(command);
}
