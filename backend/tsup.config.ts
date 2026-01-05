import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    'handlers/api': 'src/handlers/api.ts',
    'handlers/intake-ingest': 'src/handlers/intake-ingest.ts',
    'handlers/intake-extract': 'src/handlers/intake-extract.ts',
  },
  format: ['cjs'],
  outExtension: () => ({ js: '.js' }), // Use .js extension for Lambda compatibility
  target: 'node20',
  platform: 'node',
  sourcemap: true,
  clean: true,
  bundle: true, // Explicitly bundle dependencies
  dts: false, // Skip dts for Lambda handlers
  external: [
    // Only AWS SDKs are external (pre-installed in Lambda)
    '@aws-sdk/client-dynamodb',
    '@aws-sdk/client-kms',
    '@aws-sdk/client-s3',
    '@aws-sdk/client-ssm',
    '@aws-sdk/lib-dynamodb',
    '@aws-sdk/s3-request-presigner',
  ],
  noExternal: ['@ledger/shared', 'zod', 'ulid', 'pino', '@anthropic-ai/sdk'], // Bundle these deps
  minify: false,
  splitting: false,
});
