// Environment configuration
export const config = {
  // AWS Region
  region: process.env.AWS_REGION || 'us-east-1',

  // DynamoDB Tables
  tables: {
    entities: process.env.ENTITIES_TABLE || 'LedgerEntities',
    cards: process.env.CARDS_TABLE || 'LedgerCards',
    sources: process.env.SOURCES_TABLE || 'LedgerSources',
    audit: process.env.AUDIT_TABLE || 'LedgerAudit',
    idempotency: process.env.IDEMPOTENCY_TABLE || 'LedgerIdempotency',
    tagIndex: process.env.TAG_INDEX_TABLE || 'LedgerTagIndex',
  },

  // S3 Buckets
  buckets: {
    sources: process.env.SOURCES_BUCKET || 'ledger-sources',
    publicSite: process.env.PUBLIC_SITE_BUCKET || 'ledger-public-site',
  },

  // KMS
  kms: {
    signingKeyId: process.env.KMS_SIGNING_KEY_ID || '',
  },

  // API settings
  api: {
    defaultPageSize: 20,
    maxPageSize: 100,
    presignedUrlExpirySeconds: 3600, // 1 hour
    idempotencyTtlHours: 48,
  },

  // Feature flags
  features: {
    readOnly: process.env.LEDGER_READONLY === 'true',
  },

  // App version (set during build)
  version: process.env.APP_VERSION || '0.1.0',
} as const;
