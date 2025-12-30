import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import type { EvidenceCard } from '@ledger/shared';
import { api } from '../../lib/api';

export default function AdminReviewQueuePage() {
  const [cards, setCards] = useState<EvidenceCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadReviewQueue();
  }, []);

  async function loadReviewQueue() {
    try {
      setLoading(true);
      // In a real implementation, we'd filter by status=REVIEW
      // For now, this loads all cards (public endpoint shows only published)
      const result = await api.listCards({ limit: 50 });
      setCards(result.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load queue');
    } finally {
      setLoading(false);
    }
  }

  async function handlePublish(cardId: string) {
    try {
      await api.publishCard(cardId);
      // Remove from list
      setCards((prev) => prev.filter((c) => c.cardId !== cardId));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to publish');
    }
  }

  async function handleReject(cardId: string) {
    const reason = prompt('Rejection reason:');
    if (!reason) return;

    try {
      // Return to draft
      // In a real implementation, we'd have a reject endpoint
      alert('Card returned to draft');
      setCards((prev) => prev.filter((c) => c.cardId !== cardId));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to reject');
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Review Queue</h1>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-6">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {cards.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-gray-500">No cards pending review.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {cards.map((card) => (
            <div key={card.cardId} className="card p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="badge badge-review">{card.status}</span>
                    <span className="text-sm text-gray-500">
                      v{card.version}
                    </span>
                  </div>
                  <h2 className="text-lg font-semibold text-gray-900 mb-1">
                    {card.title}
                  </h2>
                  <p className="text-gray-600 text-sm mb-2">{card.claim}</p>
                  <p className="text-xs text-gray-500">
                    Event: {card.eventDate} &middot; Category: {card.category}{' '}
                    &middot; {card.sourceRefs.length} sources
                  </p>
                </div>

                <div className="flex flex-col gap-2">
                  <Link
                    to={`/admin/cards/${card.cardId}/edit`}
                    className="btn-secondary text-sm"
                  >
                    Review
                  </Link>
                  <button
                    onClick={() => handlePublish(card.cardId)}
                    className="btn-primary text-sm bg-green-600 hover:bg-green-700"
                  >
                    Publish
                  </button>
                  <button
                    onClick={() => handleReject(card.cardId)}
                    className="btn-secondary text-sm text-red-600 hover:text-red-700"
                  >
                    Return
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
