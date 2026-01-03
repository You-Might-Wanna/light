import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
  Context,
} from 'aws-lambda';
import { ZodError } from 'zod';
import type { HealthResponse, ApiError } from '@ledger/shared';
import { config } from '../lib/config.js';
import { createRequestLogger, type Logger } from '../lib/logger.js';
import { AppError, ReadOnlyModeError, ValidationError } from '../lib/errors.js';
import { isReadOnlyMode } from '../lib/ssm.js';

// Services
import * as entityService from '../lib/services/entities.js';
import * as sourceService from '../lib/services/sources.js';
import * as cardService from '../lib/services/cards.js';
import * as auditService from '../lib/services/audit.js';
import * as intakeService from '../lib/services/intake.js';

// Validation schemas
import {
  createEntitySchema,
  updateEntitySchema,
  createSourceSchema,
  createCardSchema,
  updateCardSchema,
  disputeCardSchema,
  correctCardSchema,
  retractCardSchema,
  cardQuerySchema,
  entityQuerySchema,
  entityCardsQuerySchema,
  auditQuerySchema,
  intakeQuerySchema,
  intakePromoteSchema,
} from '../lib/validation.js';

// Route handler type
type RouteHandler = (
  event: APIGatewayProxyEventV2,
  context: HandlerContext
) => Promise<APIGatewayProxyResultV2>;

interface HandlerContext {
  requestId: string;
  logger: Logger;
  userId?: string;
  isAdmin: boolean;
}

// Parse path parameters
function getPathParam(event: APIGatewayProxyEventV2, name: string): string {
  return event.pathParameters?.[name] || '';
}

// Parse query parameters
function getQueryParams(event: APIGatewayProxyEventV2): Record<string, string> {
  const params = event.queryStringParameters || {};
  // Filter out undefined values
  return Object.fromEntries(
    Object.entries(params).filter((entry): entry is [string, string] => entry[1] !== undefined)
  );
}

// Parse JSON body
function parseBody<T>(event: APIGatewayProxyEventV2): T {
  if (!event.body) {
    throw new ValidationError('Request body is required');
  }
  try {
    return JSON.parse(event.isBase64Encoded
      ? Buffer.from(event.body, 'base64').toString('utf-8')
      : event.body) as T;
  } catch {
    throw new ValidationError('Invalid JSON in request body');
  }
}

// Create JSON response
function jsonResponse(
  statusCode: number,
  body: unknown,
  headers?: Record<string, string>
): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  };
}

// Check if route requires admin
function requiresAdmin(method: string, path: string): boolean {
  return path.startsWith('/admin/');
}

// Check read-only mode (async to support SSM parameter lookup)
async function checkReadOnly(method: string): Promise<void> {
  if (method === 'GET' || method === 'OPTIONS') {
    return;
  }
  const readOnly = await isReadOnlyMode();
  if (readOnly) {
    throw new ReadOnlyModeError();
  }
}

// Extract user info from JWT claims
interface JwtUserInfo {
  userId: string | undefined;
  groups: string[];
}

function getUserInfoFromEvent(event: APIGatewayProxyEventV2): JwtUserInfo {
  // Extract JWT from Authorization header (Bearer token)
  const authHeader = event.headers?.authorization || event.headers?.Authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { userId: undefined, groups: [] };
  }

  const token = authHeader.slice(7); // Remove 'Bearer ' prefix

  try {
    // Decode JWT payload (middle part) - we don't verify signature here as that's
    // done by Cognito during token issuance. In production, you might want to
    // verify the signature using Cognito's JWKS.
    const parts = token.split('.');
    if (parts.length !== 3) {
      return { userId: undefined, groups: [] };
    }

    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));

    // Extract groups from Cognito claims
    let groups: string[] = [];
    const groupsClaim = payload['cognito:groups'];
    if (Array.isArray(groupsClaim)) {
      groups = groupsClaim as string[];
    } else if (typeof groupsClaim === 'string') {
      try {
        const parsed = JSON.parse(groupsClaim);
        if (Array.isArray(parsed)) {
          groups = parsed;
        }
      } catch {
        groups = groupsClaim.split(',').map((g: string) => g.trim()).filter(Boolean);
      }
    }

    return {
      userId: payload.sub as string | undefined,
      groups,
    };
  } catch {
    // Invalid JWT format
    return { userId: undefined, groups: [] };
  }
}

// Check if user has admin group membership
function isUserAdmin(groups: string[]): boolean {
  return groups.includes('admin');
}

// Route definitions
const routes: Record<string, Record<string, RouteHandler>> = {
  // Public routes
  'GET /health': {
    handler: async () => {
      const response: HealthResponse = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: config.version,
      };
      return jsonResponse(200, response);
    },
  },

  // Entities
  'GET /entities': {
    handler: async (event, _ctx) => {
      const query = entityQuerySchema.parse(getQueryParams(event));
      const result = await entityService.listEntities(query);
      return jsonResponse(200, result);
    },
  },
  'GET /entities/{entityId}': {
    handler: async (event, _ctx) => {
      const entityId = getPathParam(event, 'entityId');
      const entity = await entityService.getEntity(entityId);
      return jsonResponse(200, entity);
    },
  },
  'GET /entities/{entityId}/cards': {
    handler: async (event, _ctx) => {
      const entityId = getPathParam(event, 'entityId');
      const query = entityCardsQuerySchema.parse(getQueryParams(event));
      // Only show published cards to public
      const publicQuery = { ...query, status: 'PUBLISHED' as const };
      const result = await cardService.listEntityCards(entityId, publicQuery);
      return jsonResponse(200, result);
    },
  },

  // Cards
  'GET /cards': {
    handler: async (event, _ctx) => {
      const query = cardQuerySchema.parse(getQueryParams(event));
      const result = await cardService.listPublishedCards(query);
      return jsonResponse(200, result);
    },
  },
  'GET /cards/{cardId}': {
    handler: async (event, _ctx) => {
      const cardId = getPathParam(event, 'cardId');
      const card = await cardService.getCardWithEntities(cardId);
      // Only return if published (or related statuses visible to public)
      const publicStatuses = ['PUBLISHED', 'DISPUTED', 'CORRECTED', 'RETRACTED'];
      if (!publicStatuses.includes(card.status)) {
        throw new AppError('NOT_FOUND', 'Card not found', 404);
      }
      return jsonResponse(200, card);
    },
  },

  // Sources
  'GET /sources/{sourceId}': {
    handler: async (event, _ctx) => {
      const sourceId = getPathParam(event, 'sourceId');
      const source = await sourceService.getSource(sourceId);
      // Return only public metadata
      return jsonResponse(200, {
        sourceId: source.sourceId,
        title: source.title,
        publisher: source.publisher,
        url: source.url,
        docType: source.docType,
        verificationStatus: source.verificationStatus,
        excerpt: source.excerpt,
      });
    },
  },
  'GET /sources/{sourceId}/download': {
    handler: async (event, _ctx) => {
      const sourceId = getPathParam(event, 'sourceId');
      const result = await sourceService.generateDownloadUrl(sourceId);
      return jsonResponse(200, result);
    },
  },
  'GET /sources/{sourceId}/verification': {
    handler: async (event, _ctx) => {
      const sourceId = getPathParam(event, 'sourceId');
      const result = await sourceService.getSourceVerification(sourceId);
      return jsonResponse(200, result);
    },
  },

  // Admin: Entities
  'POST /admin/entities': {
    handler: async (event, ctx) => {
      const input = createEntitySchema.parse(parseBody(event));
      const entity = await entityService.createEntity(input, ctx.userId!);
      await auditService.logAuditEvent(
        'CREATE_ENTITY',
        'entity',
        entity.entityId,
        ctx.userId!,
        { requestId: ctx.requestId }
      );
      return jsonResponse(201, entity);
    },
  },
  'PUT /admin/entities/{entityId}': {
    handler: async (event, ctx) => {
      const entityId = getPathParam(event, 'entityId');
      const input = updateEntitySchema.parse(parseBody(event));
      const entity = await entityService.updateEntity(entityId, input, ctx.userId!);
      await auditService.logAuditEvent(
        'UPDATE_ENTITY',
        'entity',
        entity.entityId,
        ctx.userId!,
        { diff: input, requestId: ctx.requestId }
      );
      return jsonResponse(200, entity);
    },
  },

  // Admin: Sources
  'POST /admin/sources': {
    handler: async (event, ctx) => {
      const input = createSourceSchema.parse(parseBody(event));
      const source = await sourceService.createSource(input, ctx.userId!);
      await auditService.logAuditEvent(
        'CREATE_SOURCE',
        'source',
        source.sourceId,
        ctx.userId!,
        { requestId: ctx.requestId }
      );
      return jsonResponse(201, source);
    },
  },
  'POST /admin/sources/{sourceId}/upload-url': {
    handler: async (event, ctx) => {
      const sourceId = getPathParam(event, 'sourceId');
      const body = parseBody<{ contentType: string }>(event);
      const result = await sourceService.generateUploadUrl(
        sourceId,
        body.contentType,
        ctx.userId!
      );
      return jsonResponse(200, result);
    },
  },
  'POST /admin/sources/{sourceId}/finalize': {
    handler: async (event, ctx) => {
      const sourceId = getPathParam(event, 'sourceId');
      const source = await sourceService.finalizeSource(sourceId, ctx.userId!);
      await auditService.logAuditEvent(
        'VERIFY_SOURCE',
        'source',
        source.sourceId,
        ctx.userId!,
        { requestId: ctx.requestId }
      );
      return jsonResponse(200, source);
    },
  },

  // Admin: Cards
  'GET /admin/cards': {
    handler: async (event, _ctx) => {
      const query = cardQuerySchema.parse(getQueryParams(event));
      const result = await cardService.listCards(query, true); // true = include all statuses
      return jsonResponse(200, result);
    },
  },
  'GET /admin/cards/{cardId}': {
    handler: async (event, _ctx) => {
      const cardId = getPathParam(event, 'cardId');
      const card = await cardService.getCardWithEntities(cardId);
      // Admin can view any status
      return jsonResponse(200, card);
    },
  },
  'POST /admin/cards': {
    handler: async (event, ctx) => {
      const input = createCardSchema.parse(parseBody(event));
      const card = await cardService.createCard(input, ctx.userId!);
      await auditService.logAuditEvent(
        'CREATE_CARD',
        'card',
        card.cardId,
        ctx.userId!,
        { requestId: ctx.requestId }
      );
      return jsonResponse(201, card);
    },
  },
  'PUT /admin/cards/{cardId}': {
    handler: async (event, ctx) => {
      const cardId = getPathParam(event, 'cardId');
      const input = updateCardSchema.parse(parseBody(event));
      const card = await cardService.updateCard(cardId, input, ctx.userId!);
      await auditService.logAuditEvent(
        'UPDATE_CARD',
        'card',
        card.cardId,
        ctx.userId!,
        { diff: input, requestId: ctx.requestId }
      );
      return jsonResponse(200, card);
    },
  },
  'POST /admin/cards/{cardId}/submit': {
    handler: async (event, ctx) => {
      const cardId = getPathParam(event, 'cardId');
      const card = await cardService.submitCard(cardId, ctx.userId!);
      await auditService.logAuditEvent(
        'SUBMIT_CARD',
        'card',
        card.cardId,
        ctx.userId!,
        { requestId: ctx.requestId }
      );
      return jsonResponse(200, card);
    },
  },
  'POST /admin/cards/{cardId}/publish': {
    handler: async (event, ctx) => {
      const cardId = getPathParam(event, 'cardId');
      const card = await cardService.publishCard(cardId, ctx.userId!);
      await auditService.logAuditEvent(
        'PUBLISH_CARD',
        'card',
        card.cardId,
        ctx.userId!,
        { requestId: ctx.requestId }
      );
      return jsonResponse(200, card);
    },
  },
  'POST /admin/cards/{cardId}/dispute': {
    handler: async (event, ctx) => {
      const cardId = getPathParam(event, 'cardId');
      const input = disputeCardSchema.parse(parseBody(event));
      const card = await cardService.disputeCard(cardId, input.reason, ctx.userId!);
      await auditService.logAuditEvent(
        'DISPUTE_CARD',
        'card',
        card.cardId,
        ctx.userId!,
        { metadata: { reason: input.reason }, requestId: ctx.requestId }
      );
      return jsonResponse(200, card);
    },
  },
  'POST /admin/cards/{cardId}/correct': {
    handler: async (event, ctx) => {
      const cardId = getPathParam(event, 'cardId');
      const input = correctCardSchema.parse(parseBody(event));
      const card = await cardService.correctCard(cardId, input.correctionNote, ctx.userId!);
      await auditService.logAuditEvent(
        'CORRECT_CARD',
        'card',
        card.cardId,
        ctx.userId!,
        { metadata: { correctionNote: input.correctionNote }, requestId: ctx.requestId }
      );
      return jsonResponse(200, card);
    },
  },
  'POST /admin/cards/{cardId}/retract': {
    handler: async (event, ctx) => {
      const cardId = getPathParam(event, 'cardId');
      const input = retractCardSchema.parse(parseBody(event));
      const card = await cardService.retractCard(cardId, input.reason, ctx.userId!);
      await auditService.logAuditEvent(
        'RETRACT_CARD',
        'card',
        card.cardId,
        ctx.userId!,
        { metadata: { reason: input.reason }, requestId: ctx.requestId }
      );
      return jsonResponse(200, card);
    },
  },
  'POST /admin/cards/{cardId}/archive': {
    handler: async (event, ctx) => {
      const cardId = getPathParam(event, 'cardId');
      const card = await cardService.archiveCard(cardId, ctx.userId!);
      await auditService.logAuditEvent(
        'ARCHIVE_CARD',
        'card',
        card.cardId,
        ctx.userId!,
        { requestId: ctx.requestId }
      );
      return jsonResponse(200, card);
    },
  },
  'POST /admin/cards/{cardId}/restore': {
    handler: async (event, ctx) => {
      const cardId = getPathParam(event, 'cardId');
      const card = await cardService.restoreCard(cardId, ctx.userId!);
      await auditService.logAuditEvent(
        'RESTORE_CARD',
        'card',
        card.cardId,
        ctx.userId!,
        { requestId: ctx.requestId }
      );
      return jsonResponse(200, card);
    },
  },

  // Admin: Stats
  'GET /admin/stats': {
    handler: async () => {
      const cardStats = await cardService.getAdminStats();
      // Get entity count
      const entities = await entityService.listEntities({ limit: 1 });
      // Get pending intake count
      const pendingIntake = await intakeService.listIntakeByStatus('NEW', 1);

      return jsonResponse(200, {
        publishedCards: cardStats.publishedCards,
        draftCards: cardStats.draftCards,
        reviewCards: cardStats.reviewCards,
        totalCards: cardStats.totalCards,
        pendingReview: cardStats.draftCards + cardStats.reviewCards,
        // These are approximations - will need proper count endpoints
        entitiesTracked: entities.hasMore ? '10+' : entities.items.length,
        pendingIntake: pendingIntake.items.length + (pendingIntake.lastEvaluatedKey ? '+' : ''),
      });
    },
  },

  // Admin: Audit
  'GET /admin/audit': {
    handler: async (event, _ctx) => {
      const query = auditQuerySchema.parse(getQueryParams(event));
      const result = await auditService.listAuditLogs(query);
      return jsonResponse(200, result);
    },
  },

  // Admin: Intake
  'GET /admin/intake': {
    handler: async (event, _ctx) => {
      const query = intakeQuerySchema.parse(getQueryParams(event));
      const result = await intakeService.listIntakeByStatus(
        query.status,
        query.limit,
        query.cursor ? JSON.parse(Buffer.from(query.cursor, 'base64').toString()) : undefined
      );
      return jsonResponse(200, {
        items: result.items,
        nextToken: result.lastEvaluatedKey
          ? Buffer.from(JSON.stringify(result.lastEvaluatedKey)).toString('base64')
          : undefined,
      });
    },
  },
  'GET /admin/intake/{intakeId}': {
    handler: async (event, _ctx) => {
      const intakeId = getPathParam(event, 'intakeId');
      const item = await intakeService.getIntakeItem(intakeId);
      return jsonResponse(200, item);
    },
  },
  'POST /admin/intake/{intakeId}/reject': {
    handler: async (event, ctx) => {
      const intakeId = getPathParam(event, 'intakeId');
      // First get the item to get feedId and publishedAt
      const existing = await intakeService.getIntakeItem(intakeId);
      const item = await intakeService.rejectIntakeItem(
        existing.feedId,
        existing.publishedAt,
        intakeId,
        ctx.userId!
      );
      await auditService.logAuditEvent(
        'REJECT_INTAKE',
        'intake',
        intakeId,
        ctx.userId!,
        { requestId: ctx.requestId, metadata: { title: item.title } }
      );
      return jsonResponse(200, item);
    },
  },
  'POST /admin/intake/{intakeId}/promote': {
    handler: async (event, ctx) => {
      const intakeId = getPathParam(event, 'intakeId');
      const input = intakePromoteSchema.parse(parseBody(event));

      // Get the intake item
      const intakeItem = await intakeService.getIntakeItem(intakeId);

      // Determine entity ID (use existing or create new)
      let entityId: string;
      if (input.entityId) {
        entityId = input.entityId;
      } else if (input.createEntity) {
        const entity = await entityService.createEntity(
          {
            name: input.createEntity.name,
            type: input.createEntity.type,
            aliases: [],
          },
          ctx.userId!
        );
        entityId = entity.entityId;
        await auditService.logAuditEvent(
          'CREATE_ENTITY',
          'entity',
          entityId,
          ctx.userId!,
          { requestId: ctx.requestId, metadata: { fromIntake: intakeId } }
        );
      } else {
        throw new ValidationError('Either entityId or createEntity must be provided');
      }

      // Create source from intake item
      const source = await sourceService.createSource(
        {
          title: intakeItem.title,
          publisher: intakeItem.publisher,
          url: intakeItem.canonicalUrl,
          docType: 'HTML',
          excerpt: intakeItem.summary,
        },
        ctx.userId!
      );
      await auditService.logAuditEvent(
        'CREATE_SOURCE',
        'source',
        source.sourceId,
        ctx.userId!,
        { requestId: ctx.requestId, metadata: { fromIntake: intakeId } }
      );

      // Capture HTML snapshot from the URL
      // This fetches the page, computes SHA-256, uploads to S3, and creates signed manifest
      let verifiedSource = source;
      try {
        verifiedSource = await sourceService.captureHtmlSnapshot(
          source.sourceId,
          intakeItem.canonicalUrl,
          ctx.userId!
        );
        ctx.logger.info('HTML snapshot captured', {
          sourceId: source.sourceId,
          sha256: verifiedSource.sha256,
          byteLength: verifiedSource.byteLength,
        });
      } catch (snapshotError) {
        // Log warning but don't fail the promotion - source is still created
        ctx.logger.warn('Failed to capture HTML snapshot', {
          sourceId: source.sourceId,
          url: intakeItem.canonicalUrl,
          error: snapshotError instanceof Error ? snapshotError.message : String(snapshotError),
        });
      }

      // Create card from intake item
      const card = await cardService.createCard(
        {
          title: intakeItem.title,
          claim: intakeItem.title,
          summary: input.cardSummary,
          category: 'consumer',
          entityIds: [entityId],
          eventDate: intakeItem.publishedAt.split('T')[0],
          sourceRefs: [source.sourceId],
          evidenceStrength: 'HIGH',
          tags: input.tags || intakeItem.suggestedTags || [],
        },
        ctx.userId!
      );
      await auditService.logAuditEvent(
        'CREATE_CARD',
        'card',
        card.cardId,
        ctx.userId!,
        { requestId: ctx.requestId, metadata: { fromIntake: intakeId } }
      );

      // Mark intake item as promoted
      await intakeService.markIntakePromoted(
        intakeItem.feedId,
        intakeItem.publishedAt,
        intakeId,
        source.sourceId,
        card.cardId,
        ctx.userId!
      );
      await auditService.logAuditEvent(
        'PROMOTE_INTAKE',
        'intake',
        intakeId,
        ctx.userId!,
        { requestId: ctx.requestId, metadata: { sourceId: source.sourceId, cardId: card.cardId } }
      );

      return jsonResponse(201, {
        sourceId: source.sourceId,
        cardId: card.cardId,
      });
    },
  },
};

// Match route to handler
function matchRoute(
  method: string,
  path: string
): { handler: RouteHandler; params: Record<string, string> } | null {
  const routeKey = `${method} ${path}`;

  // Direct match
  if (routes[routeKey]) {
    return { handler: routes[routeKey].handler, params: {} };
  }

  // Pattern matching with path parameters
  for (const [pattern, route] of Object.entries(routes)) {
    const [patternMethod, patternPath] = pattern.split(' ');
    if (patternMethod !== method) continue;

    const patternParts = patternPath.split('/');
    const pathParts = path.split('/');

    if (patternParts.length !== pathParts.length) continue;

    const params: Record<string, string> = {};
    let matches = true;

    for (let i = 0; i < patternParts.length; i++) {
      if (patternParts[i].startsWith('{') && patternParts[i].endsWith('}')) {
        const paramName = patternParts[i].slice(1, -1);
        params[paramName] = pathParts[i];
      } else if (patternParts[i] !== pathParts[i]) {
        matches = false;
        break;
      }
    }

    if (matches) {
      return { handler: route.handler, params };
    }
  }

  return null;
}

// Main handler
export async function handler(
  event: APIGatewayProxyEventV2,
  _context: Context
): Promise<APIGatewayProxyResultV2> {
  const requestId = event.requestContext.requestId;
  const logger = createRequestLogger(requestId);
  const method = event.requestContext.http.method;
  // Strip /api prefix if present (CloudFront forwards /api/* to API Gateway)
  const rawPath = event.rawPath;
  const path = rawPath.startsWith('/api') ? rawPath.slice(4) || '/' : rawPath;

  logger.info({ method, path, rawPath }, 'Request received');

  try {
    // Check read-only mode for writes
    await checkReadOnly(method);

    // Match route
    const match = matchRoute(method, path);

    if (!match) {
      return jsonResponse(404, {
        error: {
          code: 'NOT_FOUND',
          message: `Route not found: ${method} ${path}`,
          requestId,
        },
      });
    }

    // Inject path parameters
    event.pathParameters = { ...event.pathParameters, ...match.params };

    // Check admin requirement
    const isAdminRoute = requiresAdmin(method, path);
    const { userId, groups } = getUserInfoFromEvent(event);

    if (isAdminRoute) {
      // Must have a valid JWT
      if (!userId) {
        return jsonResponse(401, {
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required',
            requestId,
          },
        });
      }

      // Must be in the admin group - having a valid JWT is not enough
      if (!isUserAdmin(groups)) {
        logger.warn({ userId, groups }, 'User attempted admin access without admin group');
        return jsonResponse(403, {
          error: {
            code: 'FORBIDDEN',
            message: 'Admin group membership required',
            requestId,
          },
        });
      }
    }

    const handlerContext: HandlerContext = {
      requestId,
      logger,
      userId,
      isAdmin: isUserAdmin(groups),
    };

    // Execute handler
    const response = await match.handler(event, handlerContext);

    // Log status code if available (response can be string for HTTP API format 2.0)
    const statusCode = typeof response === 'object' && response !== null ? (response as { statusCode?: number }).statusCode : undefined;
    logger.info({ statusCode }, 'Request completed');

    return response;
  } catch (error) {
    // Handle known errors
    if (error instanceof AppError) {
      logger.warn({ error: error.message, code: error.code }, 'Application error');
      return jsonResponse(error.statusCode, error.toApiError(requestId));
    }

    // Handle Zod validation errors
    if (error instanceof ZodError) {
      logger.warn({ errors: error.errors }, 'Validation error');
      return jsonResponse(400, {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          requestId,
          details: { issues: error.errors },
        },
      } as ApiError);
    }

    // Unknown errors
    logger.error({ error }, 'Unexpected error');
    return jsonResponse(500, {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
        requestId,
      },
    });
  }
}
