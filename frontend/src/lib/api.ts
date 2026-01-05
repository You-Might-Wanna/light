import type {
  Entity,
  EvidenceCard,
  EvidenceCardWithEntities,
  Source,
  PaginatedResponse,
  UploadUrlResponse,
  DownloadUrlResponse,
  SourceVerificationResponse,
  HealthResponse,
  ApiError,
  CreateEntityRequest,
  UpdateEntityRequest,
  CreateSourceRequest,
  CreateCardRequest,
  UpdateCardRequest,
  IntakeItem,
  IntakeStatus,
  IntakePromoteRequest,
  IntakePromoteResponse,
  Relationship,
  RelationshipWithEntities,
  CreateRelationshipRequest,
  UpdateRelationshipRequest,
  RelationshipStatus,
  RelationshipType,
  OwnershipTreeResponse,
  EntitySummary,
  ClaimType,
  EntitySearchResponse,
} from '@ledger/shared';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

/**
 * Generate a UUID v4 for request correlation
 */
function generateRequestId(): string {
  return crypto.randomUUID();
}

/**
 * Custom error class that includes the request ID for support reference
 */
export class ApiRequestError extends Error {
  public readonly requestId: string;
  public readonly statusCode: number;
  public readonly fields?: string[];

  constructor(message: string, requestId: string, statusCode: number, fields?: string[]) {
    super(message);
    this.name = 'ApiRequestError';
    this.requestId = requestId;
    this.statusCode = statusCode;
    this.fields = fields;
  }
}

class ApiClient {
  private token: string | null = null;

  setToken(token: string | null) {
    this.token = token;
  }

  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const requestId = generateRequestId();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Request-Id': requestId,
      ...((options.headers as Record<string, string>) || {}),
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
    });

    const data = await response.json();

    if (!response.ok) {
      const error = data as ApiError;
      throw new ApiRequestError(
        error.error?.message || 'An unexpected error occurred',
        requestId,
        response.status,
        error.error?.fields
      );
    }

    return data as T;
  }

  // Health
  async getHealth(): Promise<HealthResponse> {
    return this.request('/health');
  }

  // Entities
  async listEntities(params?: {
    query?: string;
    limit?: number;
    cursor?: string;
  }): Promise<PaginatedResponse<Entity>> {
    const searchParams = new URLSearchParams();
    if (params?.query) searchParams.set('query', params.query);
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.cursor) searchParams.set('cursor', params.cursor);
    const qs = searchParams.toString();
    return this.request(`/entities${qs ? `?${qs}` : ''}`);
  }

  async searchEntities(query: string, limit?: number): Promise<EntitySearchResponse> {
    const searchParams = new URLSearchParams();
    searchParams.set('q', query);
    if (limit) searchParams.set('limit', String(limit));
    return this.request(`/entities/search?${searchParams.toString()}`);
  }

  async getEntity(entityId: string): Promise<Entity> {
    return this.request(`/entities/${entityId}`);
  }

  async getEntityCards(
    entityId: string,
    params?: { limit?: number; cursor?: string }
  ): Promise<PaginatedResponse<EvidenceCard>> {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.cursor) searchParams.set('cursor', params.cursor);
    const qs = searchParams.toString();
    return this.request(`/entities/${entityId}/cards${qs ? `?${qs}` : ''}`);
  }

  async getEntitySummary(
    entityId: string,
    params?: {
      claimTypes?: ClaimType[];
      dateFrom?: string;
      dateTo?: string;
    }
  ): Promise<EntitySummary> {
    const searchParams = new URLSearchParams();
    if (params?.claimTypes?.length) {
      searchParams.set('claimTypes', params.claimTypes.join(','));
    }
    if (params?.dateFrom) searchParams.set('dateFrom', params.dateFrom);
    if (params?.dateTo) searchParams.set('dateTo', params.dateTo);
    const qs = searchParams.toString();
    return this.request(`/entities/${entityId}/summary${qs ? `?${qs}` : ''}`);
  }

  // Cards
  async listCards(params?: {
    category?: string;
    tag?: string;
    limit?: number;
    cursor?: string;
  }): Promise<PaginatedResponse<EvidenceCard>> {
    const searchParams = new URLSearchParams();
    if (params?.category) searchParams.set('category', params.category);
    if (params?.tag) searchParams.set('tag', params.tag);
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.cursor) searchParams.set('cursor', params.cursor);
    const qs = searchParams.toString();
    return this.request(`/cards${qs ? `?${qs}` : ''}`);
  }

  async getCard(cardId: string): Promise<EvidenceCardWithEntities> {
    return this.request(`/cards/${cardId}`);
  }

  // Sources
  async getSource(sourceId: string): Promise<Source> {
    return this.request(`/sources/${sourceId}`);
  }

  async getSourceDownloadUrl(sourceId: string): Promise<DownloadUrlResponse> {
    return this.request(`/sources/${sourceId}/download`);
  }

  async getSourceVerification(
    sourceId: string
  ): Promise<SourceVerificationResponse> {
    return this.request(`/sources/${sourceId}/verification`);
  }

  // Admin: Entities
  async createEntity(data: CreateEntityRequest): Promise<Entity> {
    return this.request('/admin/entities', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateEntity(
    entityId: string,
    data: UpdateEntityRequest
  ): Promise<Entity> {
    return this.request(`/admin/entities/${entityId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  // Admin: Sources
  async createSource(data: CreateSourceRequest): Promise<Source> {
    return this.request('/admin/sources', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getSourceUploadUrl(
    sourceId: string,
    contentType: string
  ): Promise<UploadUrlResponse> {
    return this.request(`/admin/sources/${sourceId}/upload-url`, {
      method: 'POST',
      body: JSON.stringify({ contentType }),
    });
  }

  async finalizeSource(sourceId: string): Promise<Source> {
    return this.request(`/admin/sources/${sourceId}/finalize`, {
      method: 'POST',
    });
  }

  // Admin: Cards
  async listAdminCards(params?: {
    status?: string;
    limit?: number;
    cursor?: string;
  }): Promise<PaginatedResponse<EvidenceCard>> {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.set('status', params.status);
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.cursor) searchParams.set('cursor', params.cursor);
    const qs = searchParams.toString();
    return this.request(`/admin/cards${qs ? `?${qs}` : ''}`);
  }

  async getAdminCard(cardId: string): Promise<EvidenceCardWithEntities> {
    return this.request(`/admin/cards/${cardId}`);
  }

  async getAdminStats(): Promise<{
    publishedCards: number;
    draftCards: number;
    reviewCards: number;
    totalCards: number;
    pendingReview: number;
    entitiesTracked: number | string;
    pendingIntake: number | string;
  }> {
    return this.request('/admin/stats');
  }

  async createCard(data: CreateCardRequest): Promise<EvidenceCard> {
    return this.request('/admin/cards', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateCard(
    cardId: string,
    data: UpdateCardRequest
  ): Promise<EvidenceCard> {
    return this.request(`/admin/cards/${cardId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async submitCard(cardId: string): Promise<EvidenceCard> {
    return this.request(`/admin/cards/${cardId}/submit`, {
      method: 'POST',
    });
  }

  async publishCard(cardId: string): Promise<EvidenceCard> {
    return this.request(`/admin/cards/${cardId}/publish`, {
      method: 'POST',
    });
  }

  async disputeCard(cardId: string, reason: string): Promise<EvidenceCard> {
    return this.request(`/admin/cards/${cardId}/dispute`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  }

  async correctCard(
    cardId: string,
    correctionNote: string
  ): Promise<EvidenceCard> {
    return this.request(`/admin/cards/${cardId}/correct`, {
      method: 'POST',
      body: JSON.stringify({ correctionNote }),
    });
  }

  async retractCard(cardId: string, reason: string): Promise<EvidenceCard> {
    return this.request(`/admin/cards/${cardId}/retract`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  }

  async archiveCard(cardId: string): Promise<EvidenceCard> {
    return this.request(`/admin/cards/${cardId}/archive`, {
      method: 'POST',
    });
  }

  async restoreCard(cardId: string): Promise<EvidenceCard> {
    return this.request(`/admin/cards/${cardId}/restore`, {
      method: 'POST',
    });
  }

  // Admin: Intake
  async listIntake(params?: {
    status?: IntakeStatus;
    limit?: number;
    cursor?: string;
  }): Promise<{ items: IntakeItem[]; nextToken?: string }> {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.set('status', params.status);
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.cursor) searchParams.set('cursor', params.cursor);
    const qs = searchParams.toString();
    return this.request(`/admin/intake${qs ? `?${qs}` : ''}`);
  }

  async getIntakeItem(intakeId: string): Promise<IntakeItem> {
    return this.request(`/admin/intake/${intakeId}`);
  }

  async rejectIntake(intakeId: string): Promise<IntakeItem> {
    return this.request(`/admin/intake/${intakeId}/reject`, {
      method: 'POST',
    });
  }

  async promoteIntake(
    intakeId: string,
    data: IntakePromoteRequest
  ): Promise<IntakePromoteResponse> {
    return this.request(`/admin/intake/${intakeId}/promote`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Admin: Relationships
  async listAdminRelationships(params?: {
    entityId?: string;
    type?: RelationshipType;
    status?: RelationshipStatus;
    limit?: number;
    cursor?: string;
  }): Promise<PaginatedResponse<RelationshipWithEntities>> {
    const searchParams = new URLSearchParams();
    if (params?.entityId) searchParams.set('entityId', params.entityId);
    if (params?.type) searchParams.set('type', params.type);
    if (params?.status) searchParams.set('status', params.status);
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.cursor) searchParams.set('cursor', params.cursor);
    const qs = searchParams.toString();
    return this.request(`/admin/relationships${qs ? `?${qs}` : ''}`);
  }

  async getAdminRelationship(
    relationshipId: string
  ): Promise<RelationshipWithEntities> {
    return this.request(`/admin/relationships/${relationshipId}`);
  }

  async createRelationship(
    data: CreateRelationshipRequest
  ): Promise<Relationship> {
    return this.request('/admin/relationships', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateRelationship(
    relationshipId: string,
    data: UpdateRelationshipRequest
  ): Promise<Relationship> {
    return this.request(`/admin/relationships/${relationshipId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async publishRelationship(relationshipId: string): Promise<Relationship> {
    return this.request(`/admin/relationships/${relationshipId}/publish`, {
      method: 'POST',
    });
  }

  async retractRelationship(
    relationshipId: string,
    reason: string
  ): Promise<Relationship> {
    return this.request(`/admin/relationships/${relationshipId}/retract`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  }

  // Public: Relationships
  async getEntityRelationships(
    entityId: string,
    params?: {
      type?: RelationshipType;
      limit?: number;
      cursor?: string;
    }
  ): Promise<PaginatedResponse<RelationshipWithEntities>> {
    const searchParams = new URLSearchParams();
    if (params?.type) searchParams.set('type', params.type);
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.cursor) searchParams.set('cursor', params.cursor);
    const qs = searchParams.toString();
    return this.request(`/entities/${entityId}/relationships${qs ? `?${qs}` : ''}`);
  }

  async getRelationship(relationshipId: string): Promise<RelationshipWithEntities> {
    return this.request(`/relationships/${relationshipId}`);
  }

  async getOwnershipTree(
    entityId: string,
    params?: {
      direction?: 'up' | 'down' | 'both';
      maxDepth?: number;
    }
  ): Promise<OwnershipTreeResponse> {
    const searchParams = new URLSearchParams();
    if (params?.direction) searchParams.set('direction', params.direction);
    if (params?.maxDepth) searchParams.set('maxDepth', String(params.maxDepth));
    const qs = searchParams.toString();
    return this.request(`/entities/${entityId}/ownership-tree${qs ? `?${qs}` : ''}`);
  }

  // Admin: Entity aliases
  async addEntityAlias(entityId: string, alias: string): Promise<Entity> {
    return this.request(`/admin/entities/${entityId}/aliases`, {
      method: 'POST',
      body: JSON.stringify({ alias }),
    });
  }
}

export const api = new ApiClient();
