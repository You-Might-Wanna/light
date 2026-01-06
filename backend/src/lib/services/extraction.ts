// LLM-based entity and relationship extraction service

import {
  EntityType,
  RelationshipType,
  type IntakeItem,
  type SuggestedEntity,
  type SuggestedRelationship,
  type SuggestedSource,
} from '@ledger/shared';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import UserAgent from 'user-agents';
import { invokeClaudeExtraction } from '../anthropic.js';
import { searchEntities, normalizeName } from './entities.js';
import { config } from '../config.js';
import { logger } from '../logger.js';

// S3 client for fetching prompt template
const s3Client = new S3Client({ region: config.region });

// User agent generator - provides realistic desktop browser user agents
const userAgentGenerator = new UserAgent({ deviceCategory: 'desktop' });

// Maximum content length to send to LLM (characters)
const MAX_CONTENT_LENGTH = 50000;

// Timeout for fetching article content (ms)
const FETCH_TIMEOUT_MS = 15000;

// Cached prompt template (loaded once per Lambda cold start)
let cachedPromptTemplate: string | null = null;

// Entity types for prompt - derived from shared enum
const ENTITY_TYPE_VALUES = Object.values(EntityType);

// Relationship types for prompt - derived from shared enum
const RELATIONSHIP_TYPE_VALUES = Object.values(RelationshipType);

// Expected JSON response schema from LLM
interface ExtractionResponse {
  summary?: string;
  entities: Array<{
    name: string;
    type: string;
    confidence: number;
    evidence?: string;
  }>;
  relationships: Array<{
    from: string;
    to: string;
    type: string;
    confidence: number;
    evidence: string;
    description?: string;
  }>;
  sources: Array<{
    url: string;
    title: string;
    sourceType?: string;
    confidence: number;
    evidence?: string;
  }>;
}

/**
 * Extract entities, relationships, source links, and summary from an intake item using Claude.
 */
export async function extractFromIntakeItem(item: IntakeItem): Promise<{
  summary?: string;
  entities: SuggestedEntity[];
  relationships: SuggestedRelationship[];
  sources: SuggestedSource[];
}> {
  const prompt = await buildExtractionPrompt(item);

  const response = await invokeClaudeExtraction({
    prompt,
    maxTokens: config.extraction.maxTokens,
    temperature: 0, // Deterministic for extraction
  });

  logger.info(
    {
      intakeId: item.intakeId,
      inputTokens: response.inputTokens,
      outputTokens: response.outputTokens,
    },
    'LLM extraction completed'
  );

  const parsed = parseExtractionResponse(response.content);

  // Match entities against existing database
  const enrichedEntities = await matchEntitiesToDatabase(parsed.entities);

  // Build relationship suggestions with matched entity info
  const enrichedRelationships = buildRelationshipSuggestions(
    parsed.relationships,
    enrichedEntities
  );

  // Build source suggestions
  const enrichedSources = buildSourceSuggestions(parsed.sources);

  return {
    summary: parsed.summary,
    entities: enrichedEntities,
    relationships: enrichedRelationships,
    sources: enrichedSources,
  };
}

/**
 * Load the extraction prompt template from S3.
 * Caches the template for the lifetime of the Lambda instance.
 * Throws if S3 is not configured or template cannot be loaded.
 */
async function loadPromptTemplate(): Promise<string> {
  // Return cached template if available
  if (cachedPromptTemplate) {
    return cachedPromptTemplate;
  }

  const { promptTemplateBucket, promptTemplateKey } = config.extraction;

  // S3 bucket is required - no fallback
  if (!promptTemplateBucket) {
    throw new Error(
      'EXTRACTION_PROMPT_BUCKET environment variable is required. ' +
      'Upload your prompt template to S3 and configure the bucket name.'
    );
  }

  logger.info(
    { bucket: promptTemplateBucket, key: promptTemplateKey },
    'Loading extraction prompt template from S3'
  );

  const command = new GetObjectCommand({
    Bucket: promptTemplateBucket,
    Key: promptTemplateKey,
  });

  const response = await s3Client.send(command);
  const template = await response.Body?.transformToString();

  if (!template) {
    throw new Error(
      `Empty or missing prompt template at s3://${promptTemplateBucket}/${promptTemplateKey}`
    );
  }

  cachedPromptTemplate = template;
  logger.info('Successfully loaded extraction prompt template from S3');
  return cachedPromptTemplate;
}

/**
 * Fetch the full article content from the URL.
 * Returns the text content extracted from HTML, or falls back to RSS summary.
 */
async function fetchArticleContent(item: IntakeItem): Promise<string> {
  try {
    logger.info({ url: item.canonicalUrl }, 'Fetching article content for extraction');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      // Generate a realistic browser user agent for each request
      const ua = userAgentGenerator.random();
      const response = await fetch(item.canonicalUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': ua.toString(),
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const html = await response.text();
      const textContent = extractTextFromHtml(html);

      // Truncate if too long
      if (textContent.length > MAX_CONTENT_LENGTH) {
        logger.info(
          { url: item.canonicalUrl, originalLength: textContent.length, truncatedTo: MAX_CONTENT_LENGTH },
          'Truncating article content'
        );
        return textContent.slice(0, MAX_CONTENT_LENGTH) + '\n\n[Content truncated...]';
      }

      logger.info(
        { url: item.canonicalUrl, contentLength: textContent.length },
        'Successfully fetched article content'
      );
      return textContent;
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error) {
    logger.warn(
      { url: item.canonicalUrl, error: error instanceof Error ? error.message : 'Unknown' },
      'Failed to fetch article content, falling back to RSS summary'
    );
    // Fall back to RSS summary if fetch fails
    return item.summary || '[No content available - analyze title only]';
  }
}

/**
 * Extract readable text content from HTML.
 * Removes scripts, styles, navigation, and other non-content elements.
 */
function extractTextFromHtml(html: string): string {
  // Remove script and style tags with their content
  let text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');

  // Remove navigation, header, footer, sidebar elements (common non-content)
  text = text
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
    .replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, '');

  // Convert block elements to newlines for readability
  text = text
    .replace(/<\/?(p|div|br|h[1-6]|li|tr)[^>]*>/gi, '\n')
    .replace(/<\/?(ul|ol|table|article|section)[^>]*>/gi, '\n\n');

  // Remove all remaining HTML tags
  text = text.replace(/<[^>]*>/g, ' ');

  // Decode HTML entities
  text = text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));

  // Collapse whitespace and clean up
  text = text
    .replace(/[ \t]+/g, ' ')           // Collapse horizontal whitespace
    .replace(/\n[ \t]+/g, '\n')        // Remove leading whitespace on lines
    .replace(/[ \t]+\n/g, '\n')        // Remove trailing whitespace on lines
    .replace(/\n{3,}/g, '\n\n')        // Collapse multiple newlines to max 2
    .trim();

  return text;
}

/**
 * Build the extraction prompt for Claude by filling in the template.
 */
async function buildExtractionPrompt(item: IntakeItem): Promise<string> {
  const template = await loadPromptTemplate();

  // Fetch full article content (falls back to RSS summary on failure)
  const content = await fetchArticleContent(item);

  return template
    .replace('{{TITLE}}', item.title)
    .replace('{{PUBLISHER}}', item.publisher)
    .replace('{{PUBLISHED_AT}}', item.publishedAt)
    .replace('{{URL}}', item.canonicalUrl)
    .replace('{{CONTENT}}', content)
    .replace('{{ENTITY_TYPES}}', ENTITY_TYPE_VALUES.join(', '))
    .replace('{{RELATIONSHIP_TYPES}}', RELATIONSHIP_TYPE_VALUES.join(', '));
}

/**
 * Parse and validate the LLM extraction response.
 */
function parseExtractionResponse(content: string): ExtractionResponse {
  try {
    // Extract JSON from response (handle potential markdown code blocks)
    let jsonStr = content.trim();

    // Remove markdown code block if present
    if (jsonStr.startsWith('```')) {
      const lines = jsonStr.split('\n');
      // Remove first line (```json or ```) and last line (```)
      jsonStr = lines.slice(1, -1).join('\n');
    }

    // Find JSON object in response
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logger.warn({ content: content.slice(0, 500) }, 'No JSON found in LLM response');
      return { entities: [], relationships: [], sources: [] };
    }

    const parsed = JSON.parse(jsonMatch[0]) as ExtractionResponse;

    // Validate and filter by confidence
    const minConfidence = config.extraction.minConfidence;

    const entities = (parsed.entities || [])
      .filter((e) => e.confidence >= minConfidence && e.name && e.type)
      .map((e) => ({
        name: e.name.trim(),
        type: validateEntityType(e.type),
        confidence: Math.min(1, Math.max(0, e.confidence)),
        evidence: e.evidence?.trim(),
      }));

    const relationships = (parsed.relationships || [])
      .filter((r) => r.confidence >= minConfidence && r.from && r.to && r.type && r.evidence)
      .map((r) => ({
        from: r.from.trim(),
        to: r.to.trim(),
        type: validateRelationshipType(r.type),
        confidence: Math.min(1, Math.max(0, r.confidence)),
        evidence: r.evidence.trim(),
        description: r.description?.trim(),
      }));

    const sources = (parsed.sources || [])
      .filter((s) => s.confidence >= minConfidence && s.url && s.title)
      .map((s) => ({
        url: s.url.trim(),
        title: s.title.trim(),
        sourceType: s.sourceType?.trim(),
        confidence: Math.min(1, Math.max(0, s.confidence)),
        evidence: s.evidence?.trim(),
      }));

    // Extract summary (optional, 2-3 sentences)
    const summary = parsed.summary?.trim() || undefined;

    logger.debug(
      { entityCount: entities.length, relationshipCount: relationships.length, sourceCount: sources.length, hasSummary: !!summary },
      'Parsed extraction response'
    );

    return { summary, entities, relationships, sources };
  } catch (error) {
    logger.warn(
      { error: error instanceof Error ? error.message : 'Unknown', content: content.slice(0, 500) },
      'Failed to parse LLM response'
    );
    return { entities: [], relationships: [], sources: [] };
  }
}

/**
 * Validate and normalize entity type.
 */
function validateEntityType(type: string): EntityType {
  const normalized = type.toUpperCase().replace(/\s+/g, '_');
  if (ENTITY_TYPE_VALUES.includes(normalized as EntityType)) {
    return normalized as EntityType;
  }
  // Default to CORPORATION for unknown types
  return EntityType.CORPORATION;
}

/**
 * Validate and normalize relationship type.
 */
function validateRelationshipType(type: string): RelationshipType {
  const normalized = type.toUpperCase().replace(/\s+/g, '_');
  if (RELATIONSHIP_TYPE_VALUES.includes(normalized as RelationshipType)) {
    return normalized as RelationshipType;
  }
  // Default to OTHER for unknown types
  return RelationshipType.OTHER;
}

/**
 * Match extracted entities against existing entities in the database.
 */
async function matchEntitiesToDatabase(
  extractedEntities: Array<{
    name: string;
    type: string;
    confidence: number;
    evidence?: string;
  }>
): Promise<SuggestedEntity[]> {
  const results: SuggestedEntity[] = [];

  for (const entity of extractedEntities) {
    const suggestion: SuggestedEntity = {
      extractedName: entity.name,
      suggestedType: entity.type as EntityType,
      confidence: entity.confidence,
      evidenceSnippet: entity.evidence,
    };

    // Search for matching entities in database
    const searchResults = await searchEntities(entity.name, 5);

    if (searchResults.entities.length > 0) {
      const normalizedExtracted = normalizeName(entity.name);

      // Find best match
      for (const match of searchResults.entities) {
        const normalizedMatch = normalizeName(match.name);

        // Check for exact or prefix match
        if (
          normalizedMatch === normalizedExtracted ||
          normalizedMatch.startsWith(normalizedExtracted) ||
          normalizedExtracted.startsWith(normalizedMatch)
        ) {
          suggestion.matchedEntityId = match.entityId;
          suggestion.matchedEntityName = match.name;
          break;
        }

        // Check aliases
        if (match.aliases) {
          for (const alias of match.aliases) {
            const normalizedAlias = normalizeName(alias);
            if (normalizedAlias === normalizedExtracted) {
              suggestion.matchedEntityId = match.entityId;
              suggestion.matchedEntityName = match.name;
              break;
            }
          }
          if (suggestion.matchedEntityId) break;
        }
      }
    }

    results.push(suggestion);
  }

  return results;
}

/**
 * Build relationship suggestions with matched entity info.
 */
function buildRelationshipSuggestions(
  extractedRelationships: Array<{
    from: string;
    to: string;
    type: string;
    confidence: number;
    evidence: string;
    description?: string;
  }>,
  matchedEntities: SuggestedEntity[]
): SuggestedRelationship[] {
  // Create lookup map from extracted name to matched info
  const entityMap = new Map<string, SuggestedEntity>();
  for (const entity of matchedEntities) {
    entityMap.set(normalizeName(entity.extractedName), entity);
  }

  return extractedRelationships.map((rel) => {
    const fromEntity = entityMap.get(normalizeName(rel.from));
    const toEntity = entityMap.get(normalizeName(rel.to));

    return {
      fromEntity: {
        extractedName: rel.from,
        matchedEntityId: fromEntity?.matchedEntityId,
        matchedEntityName: fromEntity?.matchedEntityName,
      },
      toEntity: {
        extractedName: rel.to,
        matchedEntityId: toEntity?.matchedEntityId,
        matchedEntityName: toEntity?.matchedEntityName,
      },
      suggestedType: rel.type as RelationshipType,
      confidence: rel.confidence,
      evidenceSnippet: rel.evidence,
      description: rel.description,
    };
  });
}

/**
 * Build source suggestions from extracted links.
 * Validates URLs and normalizes source types.
 */
function buildSourceSuggestions(
  extractedSources: Array<{
    url: string;
    title: string;
    sourceType?: string;
    confidence: number;
    evidence?: string;
  }>
): SuggestedSource[] {
  return extractedSources
    .filter((s) => isValidUrl(s.url))
    .map((s) => ({
      url: s.url,
      title: s.title,
      sourceType: normalizeSourceType(s.sourceType),
      confidence: s.confidence,
      evidenceSnippet: s.evidence,
    }));
}

/**
 * Check if a string is a valid URL.
 */
function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Normalize source type to a consistent format.
 */
function normalizeSourceType(sourceType?: string): string | undefined {
  if (!sourceType) return undefined;

  const normalized = sourceType.toUpperCase().replace(/\s+/g, '_');

  // Map common variations to standard types
  const typeMap: Record<string, string> = {
    PDF: 'PDF',
    COURT_FILING: 'COURT_FILING',
    COURT: 'COURT_FILING',
    FILING: 'COURT_FILING',
    REPORT: 'REPORT',
    PRESS_RELEASE: 'PRESS_RELEASE',
    PRESS: 'PRESS_RELEASE',
    OTHER: 'OTHER',
  };

  return typeMap[normalized] || 'OTHER';
}
