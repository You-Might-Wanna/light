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

// Services
import * as entityService from '../lib/services/entities.js';
import * as sourceService from '../lib/services/sources.js';
import * as cardService from '../lib/services/cards.js';
import * as auditService from '../lib/services/audit.js';

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

// Check read-only mode
function checkReadOnly(method: string): void {
  if (config.features.readOnly && method !== 'GET' && method !== 'OPTIONS') {
    throw new ReadOnlyModeError();
  }
}

// Extract user ID from JWT claims
function getUserIdFromEvent(event: APIGatewayProxyEventV2): string | undefined {
  // Type assertion needed for JWT authorizer claims - requestContext type varies by authorizer configuration
  const requestContext = event.requestContext as unknown as {
    authorizer?: { jwt?: { claims?: Record<string, unknown> } }
  };
  const claims = requestContext.authorizer?.jwt?.claims;
  return claims?.sub as string | undefined;
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
    handler: async (event, ctx) => {
      const query = entityQuerySchema.parse(getQueryParams(event));
      const result = await entityService.listEntities(query);
      return jsonResponse(200, result);
    },
  },
  'GET /entities/{entityId}': {
    handler: async (event, ctx) => {
      const entityId = getPathParam(event, 'entityId');
      const entity = await entityService.getEntity(entityId);
      return jsonResponse(200, entity);
    },
  },
  'GET /entities/{entityId}/cards': {
    handler: async (event, ctx) => {
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
    handler: async (event, ctx) => {
      const query = cardQuerySchema.parse(getQueryParams(event));
      const result = await cardService.listPublishedCards(query);
      return jsonResponse(200, result);
    },
  },
  'GET /cards/{cardId}': {
    handler: async (event, ctx) => {
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
    handler: async (event, ctx) => {
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
    handler: async (event, ctx) => {
      const sourceId = getPathParam(event, 'sourceId');
      const result = await sourceService.generateDownloadUrl(sourceId);
      return jsonResponse(200, result);
    },
  },
  'GET /sources/{sourceId}/verification': {
    handler: async (event, ctx) => {
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

  // Admin: Audit
  'GET /admin/audit': {
    handler: async (event, ctx) => {
      const query = auditQuerySchema.parse(getQueryParams(event));
      const result = await auditService.listAuditLogs(query);
      return jsonResponse(200, result);
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
  context: Context
): Promise<APIGatewayProxyResultV2> {
  const requestId = event.requestContext.requestId;
  const logger = createRequestLogger(requestId);
  const method = event.requestContext.http.method;
  const path = event.rawPath;

  logger.info({ method, path }, 'Request received');

  try {
    // Check read-only mode for writes
    checkReadOnly(method);

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
    const userId = getUserIdFromEvent(event);

    if (isAdminRoute && !userId) {
      return jsonResponse(401, {
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
          requestId,
        },
      });
    }

    const handlerContext: HandlerContext = {
      requestId,
      logger,
      userId,
      isAdmin: !!userId,
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
