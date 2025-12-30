import { useState, useEffect } from 'react';
import type { EvidenceCard as EvidenceCardType } from '@ledger/shared';
import { api } from '../lib/api';
import EvidenceCard from '../components/EvidenceCard';

const categories = [
  { value: '', label: 'All Categories' },
  { value: 'labor', label: 'Labor' },
  { value: 'consumer', label: 'Consumer' },
  { value: 'environment', label: 'Environment' },
  { value: 'procurement', label: 'Procurement' },
  { value: 'privacy', label: 'Privacy' },
  { value: 'lobbying', label: 'Lobbying' },
  { value: 'fraud', label: 'Fraud' },
  { value: 'governance', label: 'Governance' },
  { value: 'other', label: 'Other' },
];

export default function HomePage() {
  const [cards, setCards] = useState<EvidenceCardType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState('');
  const [cursor, setCursor] = useState<string | undefined>();
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    loadCards();
  }, [category]);

  async function loadCards(loadMore = false) {
    try {
      setLoading(true);
      setError(null);

      const result = await api.listCards({
        category: category || undefined,
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
      setError(err instanceof Error ? err.message : 'Failed to load cards');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Evidence Feed
        </h1>
        <p className="text-gray-600">
          Verified evidence cards documenting corporate and government
          misconduct from public sources.
        </p>
      </div>

      {/* Filters */}
      <div className="mb-6 flex flex-wrap gap-4">
        <div>
          <label htmlFor="category" className="sr-only">
            Filter by category
          </label>
          <select
            id="category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="input"
          >
            {categories.map((cat) => (
              <option key={cat.value} value={cat.value}>
                {cat.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-6">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {/* Cards */}
      <div className="space-y-4">
        {cards.map((card) => (
          <EvidenceCard key={card.cardId} card={card} showEntities={true} />
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
          <p className="text-gray-500">No evidence cards found.</p>
        </div>
      )}

      {/* Load more */}
      {hasMore && !loading && (
        <div className="flex justify-center mt-8">
          <button
            onClick={() => loadCards(true)}
            className="btn-secondary"
          >
            Load More
          </button>
        </div>
      )}
    </div>
  );
}
