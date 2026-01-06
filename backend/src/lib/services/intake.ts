import { createHash } from 'crypto';
import { ulid } from 'ulid';
import type {
  IntakeItem,
  IntakeStatus,
  FeedConfig,
  IntakeRails,
  IntakeFeedsConfig,
  IntakeIngestResult,
  IntakeRunSummary,
} from '@ledger/shared';
import { config } from '../config.js';
import { putItem, getItem, queryItems, scanItems, stripKeys } from '../dynamodb.js';
import { logger } from '../logger.js';
import { NotFoundError } from '../errors.js';
import feedsConfig from '../../config/feeds.json' with { type: 'json' };

const TABLE = config.tables.intake;

// Type assertion for imported JSON
const typedFeedsConfig = feedsConfig as IntakeFeedsConfig;

/**
 * Get rails config with environment variable overrides.
 * Environment variables take precedence over feeds.json values.
 *
 * Supported env vars:
 * - INTAKE_MAX_ITEMS_PER_RUN: Override globalRails.maxItemsPerRun
 * - INTAKE_MAX_PER_FEED_PER_RUN: Override globalRails.maxPerFeedPerRun
 * - INTAKE_FETCH_TIMEOUT_MS: Override globalRails.fetchTimeoutMs
 */
export function getRailsWithEnvOverrides(baseRails: IntakeRails): IntakeRails {
  const rails = { ...baseRails };

  // Override maxItemsPerRun
  const maxItemsEnv = process.env.INTAKE_MAX_ITEMS_PER_RUN;
  if (maxItemsEnv) {
    const parsed = parseInt(maxItemsEnv, 10);
    if (!isNaN(parsed) && parsed > 0) {
      rails.maxItemsPerRun = parsed;
      logger.info({ envVar: 'INTAKE_MAX_ITEMS_PER_RUN', value: parsed }, 'Applied env override');
    }
  }

  // Override maxPerFeedPerRun
  const maxPerFeedEnv = process.env.INTAKE_MAX_PER_FEED_PER_RUN;
  if (maxPerFeedEnv) {
    const parsed = parseInt(maxPerFeedEnv, 10);
    if (!isNaN(parsed) && parsed > 0) {
      rails.maxPerFeedPerRun = parsed;
      logger.info({ envVar: 'INTAKE_MAX_PER_FEED_PER_RUN', value: parsed }, 'Applied env override');
    }
  }

  // Override fetchTimeoutMs
  const fetchTimeoutEnv = process.env.INTAKE_FETCH_TIMEOUT_MS;
  if (fetchTimeoutEnv) {
    const parsed = parseInt(fetchTimeoutEnv, 10);
    if (!isNaN(parsed) && parsed > 0) {
      rails.fetchTimeoutMs = parsed;
      logger.info({ envVar: 'INTAKE_FETCH_TIMEOUT_MS', value: parsed }, 'Applied env override');
    }
  }

  return rails;
}

// ============================================================
// URL Canonicalization
// ============================================================

/**
 * Canonicalize a URL by removing tracking parameters and normalizing format
 */
export function canonicalizeUrl(url: string, stripParams: string[]): string {
  try {
    const parsed = new URL(url);

    // Remove tracking parameters
    for (const param of stripParams) {
      parsed.searchParams.delete(param);
    }

    // Sort remaining query params for consistent hashing
    parsed.searchParams.sort();

    // Remove trailing slash from pathname (except for root)
    if (parsed.pathname !== '/' && parsed.pathname.endsWith('/')) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }

    return parsed.toString();
  } catch {
    // If URL parsing fails, return as-is
    return url;
  }
}

/**
 * Generate a dedupe key from canonical URL and published date
 */
export function generateDedupeKey(canonicalUrl: string, publishedAt: string): string {
  const data = `${canonicalUrl}|${publishedAt}`;
  return createHash('sha256').update(data).digest('hex');
}

// ============================================================
// Domain Allowlist Validation
// ============================================================

/**
 * Check if a URL is from an allowed domain
 */
export function isAllowedDomain(url: string, allowedDomains: string[]): boolean {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();

    return allowedDomains.some((allowed) => {
      const normalizedAllowed = allowed.toLowerCase();
      return hostname === normalizedAllowed || hostname.endsWith(`.${normalizedAllowed}`);
    });
  } catch {
    return false;
  }
}

// ============================================================
// Rate Limiting
// ============================================================

interface RateLimiter {
  lastRequestTime: Map<string, number>;
  requestCounts: Map<string, number>;
}

const rateLimiter: RateLimiter = {
  lastRequestTime: new Map(),
  requestCounts: new Map(),
};

/**
 * Wait for rate limit before making request to a host
 */
export async function waitForRateLimit(host: string, rails: IntakeRails): Promise<void> {
  const now = Date.now();
  const lastTime = rateLimiter.lastRequestTime.get(host) || 0;
  const timeSinceLastRequest = now - lastTime;

  if (timeSinceLastRequest < rails.minDelayMsBetweenRequestsSameHost) {
    const waitTime = rails.minDelayMsBetweenRequestsSameHost - timeSinceLastRequest;
    await new Promise((resolve) => setTimeout(resolve, waitTime));
  }

  rateLimiter.lastRequestTime.set(host, Date.now());
}

// ============================================================
// RSS Parsing
// ============================================================

interface RssItem {
  title: string;
  link: string;
  pubDate?: string;
  guid?: string;
  description?: string;
  categories?: string[];
}

/** State tracking for round-robin feed processing */
interface FeedState {
  feed: FeedConfig;
  items: RssItem[];
  cursor: number;
  ingested: number;
  skipped: number;
  errors: string[];
  exhausted: boolean;
}

/**
 * Parse RSS feed XML and extract items
 * Simple regex-based parser for standard RSS 2.0 feeds
 */
export function parseRssFeed(xml: string): RssItem[] {
  const items: RssItem[] = [];

  // Match all <item> blocks
  const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  let itemMatch;

  while ((itemMatch = itemRegex.exec(xml)) !== null) {
    const itemContent = itemMatch[1];

    const title = extractTag(itemContent, 'title');
    const link = extractTag(itemContent, 'link');
    const pubDate = extractTag(itemContent, 'pubDate');
    const guid = extractTag(itemContent, 'guid');
    const description = extractTag(itemContent, 'description');

    // Extract categories
    const categories: string[] = [];
    const categoryRegex = /<category[^>]*>([^<]*)<\/category>/gi;
    let catMatch;
    while ((catMatch = categoryRegex.exec(itemContent)) !== null) {
      categories.push(decodeHtmlEntities(catMatch[1].trim()));
    }

    if (title && link) {
      items.push({
        title: decodeHtmlEntities(title),
        link: decodeHtmlEntities(link),
        pubDate: pubDate || undefined,
        guid: guid || undefined,
        description: description ? decodeHtmlEntities(description) : undefined,
        categories: categories.length > 0 ? categories : undefined,
      });
    }
  }

  return items;
}

function extractTag(content: string, tagName: string): string | null {
  // Handle CDATA sections
  const cdataRegex = new RegExp(`<${tagName}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tagName}>`, 'i');
  const cdataMatch = cdataRegex.exec(content);
  if (cdataMatch) {
    return cdataMatch[1].trim();
  }

  // Handle regular content (including content with newlines like SEC feeds)
  const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i');
  const match = regex.exec(content);
  return match ? match[1].trim() : null;
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

/**
 * Strip HTML tags and convert to plain text
 */
function stripHtml(html: string): string {
  return html
    // Remove HTML tags
    .replace(/<[^>]*>/g, ' ')
    // Collapse multiple spaces
    .replace(/\s+/g, ' ')
    // Decode HTML entities
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .trim();
}

// ============================================================
// Dedupe Check
// ============================================================

/**
 * Check if an item with this dedupe key already exists
 */
export async function itemExists(dedupeKey: string): Promise<boolean> {
  const result = await queryItems<{ PK: string }>({
    TableName: TABLE,
    IndexName: 'GSI2',
    KeyConditionExpression: 'GSI2PK = :pk',
    ExpressionAttributeValues: {
      ':pk': `DEDUPE#${dedupeKey}`,
    },
    Limit: 1,
  });

  return result.items.length > 0;
}

// ============================================================
// Fetch and Ingest
// ============================================================

/**
 * Fetch RSS feed from URL with timeout
 */
async function fetchFeed(url: string, timeoutMs: number): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'AccountabilityLedger/1.0 (https://accountabilityledger.org)',
        Accept: 'application/rss+xml, application/xml, text/xml',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Save an intake item to DynamoDB
 */
async function saveIntakeItem(item: IntakeItem): Promise<void> {
  await putItem({
    TableName: TABLE,
    Item: {
      // Primary key: by feed, sorted by published date
      PK: `FEED#${item.feedId}`,
      SK: `TS#${item.publishedAt}#${item.intakeId}`,

      // GSI1: by status, sorted by ingested date
      GSI1PK: `STATUS#${item.status}`,
      GSI1SK: `TS#${item.ingestedAt}`,

      // GSI2: dedupe lookup
      GSI2PK: `DEDUPE#${item.dedupeKey}`,
      GSI2SK: item.intakeId,

      ...item,
    },
  });
}

/**
 * Process a single feed and ingest new items
 */
export async function processFeed(
  feed: FeedConfig,
  rails: IntakeRails,
  _runId: string
): Promise<IntakeIngestResult> {
  const result: IntakeIngestResult = {
    feedId: feed.id,
    itemsIngested: 0,
    itemsSkipped: 0,
    errors: [],
  };

  try {
    // Check domain allowlist
    if (!isAllowedDomain(feed.url, rails.allowedDomains)) {
      result.errors.push(`Feed URL not in allowed domains: ${feed.url}`);
      return result;
    }

    // Rate limit
    const host = new URL(feed.url).hostname;
    await waitForRateLimit(host, rails);

    // Fetch feed
    logger.info({ feedId: feed.id, url: feed.url }, 'Fetching RSS feed');
    const xml = await fetchFeed(feed.url, rails.fetchTimeoutMs);

    // Parse feed
    const items = parseRssFeed(xml);
    logger.info({ feedId: feed.id, itemCount: items.length }, 'Parsed RSS feed');

    // Process items (up to per-feed cap)
    let processed = 0;

    for (const rssItem of items) {
      if (processed >= feed.perFeedCap) {
        break;
      }

      try {
        // Validate link domain
        if (!isAllowedDomain(rssItem.link, rails.allowedDomains)) {
          logger.debug({ link: rssItem.link }, 'Skipping item: link not in allowed domains');
          result.itemsSkipped++;
          continue;
        }

        // Canonicalize URL
        const canonicalUrl = canonicalizeUrl(rssItem.link, rails.stripQueryParams);

        // Parse and normalize published date
        const publishedAt = rssItem.pubDate
          ? new Date(rssItem.pubDate).toISOString()
          : new Date().toISOString();

        // Generate dedupe key
        const dedupeKey = generateDedupeKey(canonicalUrl, publishedAt);

        // Check if already exists
        if (await itemExists(dedupeKey)) {
          logger.debug({ dedupeKey, title: rssItem.title }, 'Skipping duplicate item');
          result.itemsSkipped++;
          continue;
        }

        // Create intake item
        const intakeItem: IntakeItem = {
          intakeId: ulid(),
          feedId: feed.id,
          canonicalUrl,
          title: rssItem.title,
          publishedAt,
          publisher: feed.publisher,
          summary: rssItem.description ? stripHtml(rssItem.description) : undefined,
          categories: rssItem.categories,
          guid: rssItem.guid,
          dedupeKey,
          status: 'NEW' as IntakeStatus,
          suggestedTags: feed.defaultTags,
          ingestedAt: new Date().toISOString(),
        };

        // Save to DynamoDB
        await saveIntakeItem(intakeItem);
        result.itemsIngested++;
        processed++;

        logger.info({ intakeId: intakeItem.intakeId, title: intakeItem.title }, 'Ingested item');
      } catch (itemError) {
        const errorMessage =
          itemError instanceof Error ? itemError.message : 'Unknown error processing item';
        result.errors.push(`Item "${rssItem.title}": ${errorMessage}`);
        logger.error({ error: itemError, title: rssItem.title }, 'Error processing RSS item');
      }
    }
  } catch (feedError) {
    const errorMessage =
      feedError instanceof Error ? feedError.message : 'Unknown error fetching feed';
    result.errors.push(errorMessage);
    logger.error({ error: feedError, feedId: feed.id }, 'Error processing feed');
  }

  return result;
}

/**
 * Run the full intake ingestion process.
 *
 * Uses round-robin strategy to ensure at least one item from each enabled feed
 * before taking additional items from any feed. This prevents early feeds from
 * exhausting the global limit.
 */
export async function runIntakeIngestion(): Promise<IntakeRunSummary> {
  const runId = ulid();
  const startedAt = new Date().toISOString();

  logger.info({ runId }, 'Starting intake ingestion run');

  const { globalRails: baseRails, feeds } = typedFeedsConfig;

  // Apply environment variable overrides
  const rails = getRailsWithEnvOverrides(baseRails);

  logger.info(
    {
      maxItemsPerRun: rails.maxItemsPerRun,
      maxPerFeedPerRun: rails.maxPerFeedPerRun,
      fetchTimeoutMs: rails.fetchTimeoutMs,
    },
    'Using rails config'
  );

  const enabledFeeds = feeds.filter((f) => f.enabled);

  const feedStates: FeedState[] = [];

  // Fetch all feeds first
  for (const feed of enabledFeeds) {
    const state: FeedState = {
      feed,
      items: [],
      cursor: 0,
      ingested: 0,
      skipped: 0,
      errors: [],
      exhausted: false,
    };

    try {
      // Check domain allowlist
      if (!isAllowedDomain(feed.url, rails.allowedDomains)) {
        state.errors.push(`Feed URL not in allowed domains: ${feed.url}`);
        state.exhausted = true;
      } else {
        // Rate limit
        const host = new URL(feed.url).hostname;
        await waitForRateLimit(host, rails);

        // Fetch and parse feed
        logger.info({ feedId: feed.id, url: feed.url }, 'Fetching RSS feed');
        const xml = await fetchFeed(feed.url, rails.fetchTimeoutMs);
        state.items = parseRssFeed(xml);
        logger.info({ feedId: feed.id, itemCount: state.items.length }, 'Parsed RSS feed');
      }
    } catch (feedError) {
      const errorMessage =
        feedError instanceof Error ? feedError.message : 'Unknown error fetching feed';
      state.errors.push(errorMessage);
      state.exhausted = true;
      logger.error({ error: feedError, feedId: feed.id }, 'Error fetching feed');
    }

    feedStates.push(state);
  }

  let totalIngested = 0;
  let totalSkipped = 0;

  // Round-robin processing: take one item from each feed in rotation
  let activeFeedsRemain = true;
  while (activeFeedsRemain && totalIngested < rails.maxItemsPerRun) {
    activeFeedsRemain = false;

    for (const state of feedStates) {
      // Stop if global limit reached
      if (totalIngested >= rails.maxItemsPerRun) {
        break;
      }

      // Skip if this feed is exhausted or hit its per-feed cap
      if (state.exhausted || state.ingested >= state.feed.perFeedCap) {
        continue;
      }

      // Try to ingest one item from this feed
      const processed = await processNextItem(state, rails);
      if (processed === 'ingested') {
        totalIngested++;
        activeFeedsRemain = true;
      } else if (processed === 'skipped') {
        totalSkipped++;
        activeFeedsRemain = true;
      }
      // 'exhausted' means no more items in this feed
    }
  }

  // Build results summary
  const feedResults: IntakeIngestResult[] = feedStates.map((state) => ({
    feedId: state.feed.id,
    itemsIngested: state.ingested,
    itemsSkipped: state.skipped,
    errors: state.errors,
  }));

  const completedAt = new Date().toISOString();

  const summary: IntakeRunSummary = {
    runId,
    startedAt,
    completedAt,
    totalIngested,
    totalSkipped,
    feedResults,
  };

  // Log which feeds were processed
  const feedSummary = feedStates.map((s) => ({
    feedId: s.feed.id,
    ingested: s.ingested,
    skipped: s.skipped,
    errors: s.errors.length,
  }));

  logger.info(
    { runId, totalIngested, totalSkipped, feedCount: feedResults.length, feedSummary },
    'Completed intake ingestion run'
  );

  return summary;
}

/**
 * Process the next item from a feed state.
 * Returns 'ingested', 'skipped', or 'exhausted'.
 */
async function processNextItem(
  state: FeedState,
  rails: IntakeRails
): Promise<'ingested' | 'skipped' | 'exhausted'> {
  while (state.cursor < state.items.length) {
    const rssItem = state.items[state.cursor];
    state.cursor++;

    try {
      // Validate link domain
      if (!isAllowedDomain(rssItem.link, rails.allowedDomains)) {
        logger.debug({ link: rssItem.link }, 'Skipping item: link not in allowed domains');
        state.skipped++;
        return 'skipped';
      }

      // Canonicalize URL
      const canonicalUrl = canonicalizeUrl(rssItem.link, rails.stripQueryParams);

      // Parse and normalize published date
      const publishedAt = rssItem.pubDate
        ? new Date(rssItem.pubDate).toISOString()
        : new Date().toISOString();

      // Generate dedupe key
      const dedupeKey = generateDedupeKey(canonicalUrl, publishedAt);

      // Check if already exists
      if (await itemExists(dedupeKey)) {
        logger.debug({ dedupeKey, title: rssItem.title }, 'Skipping duplicate item');
        state.skipped++;
        return 'skipped';
      }

      // Create intake item
      const intakeItem: IntakeItem = {
        intakeId: ulid(),
        feedId: state.feed.id,
        canonicalUrl,
        title: rssItem.title,
        publishedAt,
        publisher: state.feed.publisher,
        summary: rssItem.description ? stripHtml(rssItem.description) : undefined,
        categories: rssItem.categories,
        guid: rssItem.guid,
        dedupeKey,
        status: 'NEW' as IntakeStatus,
        suggestedTags: state.feed.defaultTags,
        ingestedAt: new Date().toISOString(),
      };

      // Save to DynamoDB
      await saveIntakeItem(intakeItem);
      state.ingested++;

      logger.info(
        { intakeId: intakeItem.intakeId, feedId: state.feed.id, title: intakeItem.title },
        'Ingested item'
      );

      return 'ingested';
    } catch (itemError) {
      const errorMessage =
        itemError instanceof Error ? itemError.message : 'Unknown error processing item';
      state.errors.push(`Item "${rssItem.title}": ${errorMessage}`);
      logger.error({ error: itemError, title: rssItem.title }, 'Error processing RSS item');
      state.skipped++;
      return 'skipped';
    }
  }

  // No more items in this feed
  state.exhausted = true;
  return 'exhausted';
}

// ============================================================
// Query Functions (for admin API)
// ============================================================

/**
 * List intake items by status
 */
export async function listIntakeByStatus(
  status: IntakeStatus,
  limit: number = 50,
  lastEvaluatedKey?: Record<string, unknown>
): Promise<{ items: IntakeItem[]; lastEvaluatedKey?: Record<string, unknown> }> {
  const result = await queryItems<IntakeItem & { PK: string; SK: string }>({
    TableName: TABLE,
    IndexName: 'GSI1',
    KeyConditionExpression: 'GSI1PK = :pk',
    ExpressionAttributeValues: {
      ':pk': `STATUS#${status}`,
    },
    Limit: limit,
    ScanIndexForward: false, // Newest first
    ExclusiveStartKey: lastEvaluatedKey,
  });

  return {
    items: result.items,
    lastEvaluatedKey: result.lastEvaluatedKey,
  };
}

/**
 * Get a single intake item by its intakeId
 * Uses a scan with filter - not ideal for production, but works for MVP
 */
export async function getIntakeItem(intakeId: string): Promise<IntakeItem> {
  // Scan with filter on intakeId - inefficient but works for MVP
  // In production, add a GSI with intakeId as partition key
  const result = await scanItems<IntakeItem & { PK: string; SK: string }>({
    TableName: TABLE,
    FilterExpression: 'intakeId = :id',
    ExpressionAttributeValues: {
      ':id': intakeId,
    },
    Limit: 100, // Scan more items since filter is applied after
  });

  if (result.items.length === 0) {
    throw new NotFoundError('Intake item', intakeId);
  }

  return stripKeys(result.items[0]);
}

/**
 * Get intake item by feed and SK components
 */
export async function getIntakeItemByKey(
  feedId: string,
  publishedAt: string,
  intakeId: string
): Promise<IntakeItem> {
  const item = await getItem<IntakeItem & { PK: string; SK: string }>({
    TableName: TABLE,
    Key: {
      PK: `FEED#${feedId}`,
      SK: `TS#${publishedAt}#${intakeId}`,
    },
  });

  if (!item) {
    throw new NotFoundError('Intake item', intakeId);
  }

  return stripKeys(item);
}

/**
 * Update intake item status (reject)
 */
export async function rejectIntakeItem(
  feedId: string,
  publishedAt: string,
  intakeId: string,
  userId: string
): Promise<IntakeItem> {
  // Get existing item first
  const existing = await getIntakeItemByKey(feedId, publishedAt, intakeId);
  const now = new Date().toISOString();

  const updated: IntakeItem = {
    ...existing,
    status: 'REJECTED',
    reviewedAt: now,
    reviewedBy: userId,
  };

  await putItem({
    TableName: TABLE,
    Item: {
      PK: `FEED#${feedId}`,
      SK: `TS#${publishedAt}#${intakeId}`,
      GSI1PK: 'STATUS#REJECTED',
      GSI1SK: `TS#${now}`,
      GSI2PK: `DEDUPE#${existing.dedupeKey}`,
      GSI2SK: intakeId,
      ...updated,
    },
  });

  return updated;
}

/**
 * Mark intake item as promoted (after source/card creation)
 */
export async function markIntakePromoted(
  feedId: string,
  publishedAt: string,
  intakeId: string,
  sourceId: string,
  cardId: string,
  userId: string
): Promise<IntakeItem> {
  const existing = await getIntakeItemByKey(feedId, publishedAt, intakeId);
  const now = new Date().toISOString();

  const updated: IntakeItem = {
    ...existing,
    status: 'PROMOTED',
    promotedSourceId: sourceId,
    promotedCardId: cardId,
    reviewedAt: now,
    reviewedBy: userId,
  };

  await putItem({
    TableName: TABLE,
    Item: {
      PK: `FEED#${feedId}`,
      SK: `TS#${publishedAt}#${intakeId}`,
      GSI1PK: 'STATUS#PROMOTED',
      GSI1SK: `TS#${now}`,
      GSI2PK: `DEDUPE#${existing.dedupeKey}`,
      GSI2SK: intakeId,
      ...updated,
    },
  });

  return updated;
}

/**
 * Update an intake item with extraction results or other partial updates.
 * Used by the LLM extraction pipeline to store suggested entities and relationships.
 */
export async function updateIntakeItem(
  item: IntakeItem,
  updates: Partial<IntakeItem>
): Promise<IntakeItem> {
  const updated: IntakeItem = {
    ...item,
    ...updates,
  };

  // Determine GSI1 partition key based on current status
  const gsi1pk = `STATUS#${updated.status}`;
  const gsi1sk = `TS#${updated.ingestedAt}`;

  await putItem({
    TableName: TABLE,
    Item: {
      PK: `FEED#${item.feedId}`,
      SK: `TS#${item.publishedAt}#${item.intakeId}`,
      GSI1PK: gsi1pk,
      GSI1SK: gsi1sk,
      GSI2PK: `DEDUPE#${item.dedupeKey}`,
      GSI2SK: item.intakeId,
      ...updated,
    },
  });

  return updated;
}