import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import type { Entity, EvidenceCard as EvidenceCardType } from '@ledger/shared';
import { api } from '../lib/api';
import EvidenceCard from '../components/EvidenceCard';

const entityTypes: Record<string, string> = {
  CORPORATION: 'Corporation',
  AGENCY: 'Government Agency',
  NONPROFIT: 'Nonprofit Organization',
  VENDOR: 'Vendor',
  INDIVIDUAL_PUBLIC_OFFICIAL: 'Public Official',
};

export default function EntityPage() {
  const { entityId } = useParams<{ entityId: string }>();
  const [entity, setEntity] = useState<Entity | null>(null);
  const [cards, setCards] = useState<EvidenceCardType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | undefined>();
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    if (entityId) {
      loadEntity();
      loadCards();
    }
  }, [entityId]);

  async function loadEntity() {
    try {
      const data = await api.getEntity(entityId!);
      setEntity(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load entity');
    }
  }

  async function loadCards(loadMore = false) {
    try {
      setLoading(true);

      const result = await api.getEntityCards(entityId!, {
        cursor: loadMore ? cursor : undefined,
        limit: 20,
      });

      if (loadMore) {
        setCards((prev) => [...prev, ...result.items]);
      } else {
        setCards(result.items);
      }

      setCursor(result.cursor);
      setHasMore(result.hasMore);
    } catch (err) {
      // Don't override entity error
      if (!error) {
        setError(err instanceof Error ? err.message : 'Failed to load cards');
      }
    } finally {
      setLoading(false);
    }
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Error</h1>
        <p className="text-gray-600 mb-4">{error}</p>
        <Link to="/entities" className="btn-primary">
          Back to Entities
        </Link>
      </div>
    );
  }

  if (!entity) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div>
      {/* Breadcrumb */}
      <nav className="mb-6 text-sm">
        <Link to="/entities" className="text-primary-600 hover:text-primary-800">
          Entities
        </Link>
        <span className="mx-2 text-gray-400">/</span>
        <span className="text-gray-600">{entity.name}</span>
      </nav>

      {/* Entity header */}
      <div className="card p-6 mb-8">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              {entity.name}
            </h1>
            <p className="text-gray-600 mb-4">
              {entityTypes[entity.type] || entity.type}
            </p>

            {entity.aliases && entity.aliases.length > 0 && (
              <p className="text-sm text-gray-500 mb-2">
                <strong>Also known as:</strong> {entity.aliases.join(', ')}
              </p>
            )}

            {entity.website && (
              <a
                href={entity.website}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary-600 hover:text-primary-800"
              >
                {entity.website}
              </a>
            )}

            {entity.identifiers && (
              <div className="mt-4 text-sm text-gray-500">
                {entity.identifiers.ticker && (
                  <span className="mr-4">Ticker: {entity.identifiers.ticker}</span>
                )}
                {entity.identifiers.ein && (
                  <span className="mr-4">EIN: {entity.identifiers.ein}</span>
                )}
              </div>
            )}
          </div>

          {/* Stats placeholder */}
          <div className="text-right">
            <div className="text-3xl font-bold text-gray-900">
              {cards.length}
            </div>
            <div className="text-sm text-gray-500">Evidence Cards</div>
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          Evidence Timeline
        </h2>
      </div>

      {/* Cards */}
      <div className="space-y-4">
        {cards.map((card) => (
          <EvidenceCard
            key={card.cardId}
            card={card}
            showEntities={false}
          />
        ))}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      )}

      {/* Empty state */}
      {!loading && cards.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-500">No evidence cards found for this entity.</p>
        </div>
      )}

      {/* Load more */}
      {hasMore && !loading && (
        <div className="flex justify-center mt-8">
          <button onClick={() => loadCards(true)} className="btn-secondary">
            Load More
          </button>
        </div>
      )}
    </div>
  );
}
