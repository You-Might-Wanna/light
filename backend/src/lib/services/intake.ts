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

  // Handle regular content
  const regex = new RegExp(`<${tagName}[^>]*>([^<]*)<\\/${tagName}>`, 'i');
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
  runId: string
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
 * Run the full intake ingestion process
 */
export async function runIntakeIngestion(): Promise<IntakeRunSummary> {
  const runId = ulid();
  const startedAt = new Date().toISOString();

  logger.info({ runId }, 'Starting intake ingestion run');

  const { globalRails, feeds } = typedFeedsConfig;
  const enabledFeeds = feeds.filter((f) => f.enabled);

  const feedResults: IntakeIngestResult[] = [];
  let totalIngested = 0;
  let totalSkipped = 0;

  // Process each enabled feed
  for (const feed of enabledFeeds) {
    // Check global limit
    if (totalIngested >= globalRails.maxItemsPerRun) {
      logger.info({ totalIngested, maxItems: globalRails.maxItemsPerRun }, 'Reached global item limit');
      break;
    }

    const result = await processFeed(feed, globalRails, runId);
    feedResults.push(result);

    totalIngested += result.itemsIngested;
    totalSkipped += result.itemsSkipped;
  }

  const completedAt = new Date().toISOString();

  const summary: IntakeRunSummary = {
    runId,
    startedAt,
    completedAt,
    totalIngested,
    totalSkipped,
    feedResults,
  };

  logger.info(
    { runId, totalIngested, totalSkipped, feedCount: feedResults.length },
    'Completed intake ingestion run'
  );

  return summary;
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