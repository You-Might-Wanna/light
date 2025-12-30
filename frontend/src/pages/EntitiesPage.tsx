import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import type { Entity } from '@ledger/shared';
import { api } from '../lib/api';

const entityTypes: Record<string, string> = {
  CORPORATION: 'Corporation',
  AGENCY: 'Agency',
  NONPROFIT: 'Nonprofit',
  VENDOR: 'Vendor',
  INDIVIDUAL_PUBLIC_OFFICIAL: 'Public Official',
};

export default function EntitiesPage() {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [cursor, setCursor] = useState<string | undefined>();
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadEntities();
    }, search ? 300 : 0);

    return () => clearTimeout(timer);
  }, [search]);

  async function loadEntities(loadMore = false) {
    try {
      setLoading(true);
      setError(null);

      const result = await api.listEntities({
        query: search || undefined,
        cursor: loadMore ? cursor : undefined,
        limit: 20,
      });

      if (loadMore) {
        setEntities((prev) => [...prev, ...result.items]);
      } else {
        setEntities(result.items);
      }

      setCursor(result.cursor);
      setHasMore(result.hasMore);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load entities');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Entities</h1>
        <p className="text-gray-600">
          Organizations, agencies, and public officials tracked in the ledger.
        </p>
      </div>

      {/* Search */}
      <div className="mb-6">
        <label htmlFor="search" className="sr-only">
          Search entities
        </label>
        <input
          id="search"
          type="text"
          placeholder="Search by name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input max-w-md"
        />
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-6">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {/* Entities grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {entities.map((entity) => (
          <Link
            key={entity.entityId}
            to={`/entities/${entity.entityId}`}
            className="card p-4 hover:shadow-md transition-shadow"
          >
            <h2 className="font-semibold text-gray-900 mb-1">{entity.name}</h2>
            <p className="text-sm text-gray-500 mb-2">
              {entityTypes[entity.type] || entity.type}
            </p>
            {entity.aliases && entity.aliases.length > 0 && (
              <p className="text-xs text-gray-400">
                Also known as: {entity.aliases.slice(0, 3).join(', ')}
                {entity.aliases.length > 3 && '...'}
              </p>
            )}
          </Link>
        ))}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      )}

      {/* Empty state */}
      {!loading && entities.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-500">
            {search ? 'No entities found matching your search.' : 'No entities found.'}
          </p>
        </div>
      )}

      {/* Load more */}
      {hasMore && !loading && (
        <div className="flex justify-center mt-8">
          <button onClick={() => loadEntities(true)} className="btn-secondary">
            Load More
          </button>
        </div>
      )}
    </div>
  );
}
