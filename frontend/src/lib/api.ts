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
} from '@ledger/shared';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

class ApiClient {
  private token: string | null = null;

  setToken(token: string | null) {
    this.token = token;
  }

  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
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
      throw new Error(error.error?.message || 'API request failed');
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
}

export const api = new ApiClient();
