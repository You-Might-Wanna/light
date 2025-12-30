import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { config } from './config.js';
import { logger } from './logger.js';

const ssmClient = new SSMClient({ region: config.region });

// Cache the read-only parameter value for 60 seconds
let cachedReadOnlyValue: boolean | null = null;
let cacheExpiry = 0;
const CACHE_TTL_MS = 60_000; // 60 seconds

/**
 * Check if the system is in read-only mode by reading from SSM parameter.
 * The value is cached for 60 seconds to avoid excessive SSM calls.
 */
export async function isReadOnlyMode(): Promise<boolean> {
  const paramName = process.env.READONLY_PARAM_NAME;

  // If no SSM parameter configured, fall back to env var
  if (!paramName) {
    return process.env.LEDGER_READONLY === 'true';
  }

  const now = Date.now();

  // Return cached value if still valid
  if (cachedReadOnlyValue !== null && now < cacheExpiry) {
    return cachedReadOnlyValue;
  }

  try {
    const command = new GetParameterCommand({
      Name: paramName,
      WithDecryption: false,
    });

    const response = await ssmClient.send(command);
    const value = response.Parameter?.Value?.toLowerCase() === 'true';

    // Update cache
    cachedReadOnlyValue = value;
    cacheExpiry = now + CACHE_TTL_MS;

    return value;
  } catch (error) {
    logger.error({ error, paramName }, 'Failed to read SSM parameter');

    // On error, return cached value if available, otherwise default to false
    if (cachedReadOnlyValue !== null) {
      return cachedReadOnlyValue;
    }
    return false;
  }
}

/**
 * Clear the read-only mode cache (useful for testing)
 */
export function clearReadOnlyCache(): void {
  cachedReadOnlyValue = null;
  cacheExpiry = 0;
}