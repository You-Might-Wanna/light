import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    'handlers/api': 'src/handlers/api.ts',
  },
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  sourcemap: true,
  clean: true,
  dts: false, // Skip dts for Lambda handlers
  external: [
    '@aws-sdk/client-dynamodb',
    '@aws-sdk/client-kms',
    '@aws-sdk/client-s3',
    '@aws-sdk/lib-dynamodb',
    '@aws-sdk/s3-request-presigner',
  ],
  noExternal: ['@ledger/shared'],
  minify: false,
  splitting: false,
});
