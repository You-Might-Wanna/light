import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import type { EvidenceCardWithEntities, Source } from '@ledger/shared';
import { api } from '../lib/api';
import ScoreDisplay from '../components/ScoreDisplay';

const statusLabels: Record<string, string> = {
  DRAFT: 'Draft',
  REVIEW: 'In Review',
  PUBLISHED: 'Published',
  DISPUTED: 'Disputed',
  CORRECTED: 'Corrected',
  RETRACTED: 'Retracted',
  ARCHIVED: 'Archived',
};

const categoryLabels: Record<string, string> = {
  labor: 'Labor',
  consumer: 'Consumer',
  environment: 'Environment',
  procurement: 'Procurement',
  privacy: 'Privacy',
  lobbying: 'Lobbying',
  fraud: 'Fraud',
  governance: 'Governance',
  other: 'Other',
};

export default function CardPage() {
  const { cardId } = useParams<{ cardId: string }>();
  const [card, setCard] = useState<EvidenceCardWithEntities | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cardId) {
      loadCard();
    }
  }, [cardId]);

  async function loadCard() {
    try {
      setLoading(true);
      const data = await api.getCard(cardId!);
      setCard(data);

      // Load sources
      const sourcePromises = data.sourceRefs.map((id) =>
        api.getSource(id).catch(() => null)
      );
      const sourceResults = await Promise.all(sourcePromises);
      setSources(sourceResults.filter((s): s is Source => s !== null));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load card');
    } finally {
      setLoading(false);
    }
  }

  async function handleDownload(sourceId: string) {
    try {
      const { downloadUrl } = await api.getSourceDownloadUrl(sourceId);
      window.open(downloadUrl, '_blank');
    } catch (err) {
      alert('Failed to get download URL');
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (error || !card) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Error</h1>
        <p className="text-gray-600 mb-4">{error || 'Card not found'}</p>
        <Link to="/" className="btn-primary">
          Back to Feed
        </Link>
      </div>
    );
  }

  const isRetracted = card.status === 'RETRACTED';
  const isDisputed = card.status === 'DISPUTED';
  const isCorrected = card.status === 'CORRECTED';

  return (
    <div className="max-w-4xl mx-auto">
      {/* Breadcrumb */}
      <nav className="mb-6 text-sm">
        <Link to="/" className="text-primary-600 hover:text-primary-800">
          Feed
        </Link>
        <span className="mx-2 text-gray-400">/</span>
        <span className="text-gray-600">{card.title}</span>
      </nav>

      {/* Status banners */}
      {isRetracted && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-6">
          <h2 className="font-semibold text-red-800 mb-1">Retracted</h2>
          <p className="text-sm text-red-700">
            This evidence card has been retracted. The information below is
            preserved for transparency but should not be relied upon.
          </p>
        </div>
      )}

      {isDisputed && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4 mb-6">
          <h2 className="font-semibold text-yellow-800 mb-1">Disputed</h2>
          <p className="text-sm text-yellow-700">
            This evidence card is currently being disputed. See counterpoint
            section for details.
          </p>
        </div>
      )}

      {isCorrected && (
        <div className="bg-blue-50 border border-blue-200 rounded-md p-4 mb-6">
          <h2 className="font-semibold text-blue-800 mb-1">Corrected</h2>
          <p className="text-sm text-blue-700">
            This evidence card has been corrected. See counterpoint section for
            correction details.
          </p>
        </div>
      )}

      {/* Main card */}
      <article className="card p-8">
        {/* Header */}
        <div className="mb-6">
          <div className="flex flex-wrap gap-2 mb-3">
            <span
              className={`badge ${
                isRetracted
                  ? 'badge-retracted'
                  : card.status === 'PUBLISHED'
                  ? 'badge-published'
                  : card.status === 'DISPUTED'
                  ? 'badge-disputed'
                  : card.status === 'CORRECTED'
                  ? 'badge-corrected'
                  : 'badge-draft'
              }`}
            >
              {statusLabels[card.status]}
            </span>
            <span className="badge bg-gray-100 text-gray-700">
              {categoryLabels[card.category] || card.category}
            </span>
            <span
              className={`badge ${
                card.evidenceStrength === 'HIGH'
                  ? 'bg-green-100 text-green-800'
                  : card.evidenceStrength === 'MEDIUM'
                  ? 'bg-yellow-100 text-yellow-800'
                  : 'bg-gray-100 text-gray-600'
              }`}
            >
              {card.evidenceStrength} evidence
            </span>
          </div>

          <h1
            className={`text-2xl font-bold text-gray-900 mb-2 ${
              isRetracted ? 'line-through' : ''
            }`}
          >
            {card.title}
          </h1>

          <div className="flex flex-wrap gap-4 text-sm text-gray-500">
            <span>
              Event date:{' '}
              {new Date(card.eventDate).toLocaleDateString()}
            </span>
            {card.publishDate && (
              <span>
                Published:{' '}
                {new Date(card.publishDate).toLocaleDateString()}
              </span>
            )}
            {card.jurisdiction && <span>Jurisdiction: {card.jurisdiction}</span>}
            <span>Version: {card.version}</span>
          </div>
        </div>

        {/* Claim */}
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Claim
          </h2>
          <blockquote
            className={`text-lg text-gray-900 border-l-4 border-primary-500 pl-4 ${
              isRetracted ? 'line-through' : ''
            }`}
          >
            {card.claim}
          </blockquote>
        </div>

        {/* Summary */}
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Summary
          </h2>
          <p className="text-gray-700 leading-relaxed">{card.summary}</p>
        </div>

        {/* Entities */}
        {card.entities && card.entities.length > 0 && (
          <div className="mb-6">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Related Entities
            </h2>
            <div className="flex flex-wrap gap-2">
              {card.entities.map((entity) => (
                <Link
                  key={entity.entityId}
                  to={`/entities/${entity.entityId}`}
                  className="btn-secondary text-sm"
                >
                  {entity.name}
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Counterpoint */}
        {card.counterpoint && (
          <div className="mb-6">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Response / Counterpoint
            </h2>
            <div className="bg-gray-50 border border-gray-200 rounded-md p-4">
              <p className="text-gray-700 whitespace-pre-wrap">
                {card.counterpoint}
              </p>
            </div>
          </div>
        )}

        {/* Score signals */}
        {card.scoreSignals && (
          <div className="mb-6">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Scoring Breakdown
            </h2>
            <div className="bg-gray-50 border border-gray-200 rounded-md p-4">
              <ScoreDisplay signals={card.scoreSignals} />
            </div>
          </div>
        )}

        {/* Sources */}
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Sources ({sources.length})
          </h2>
          <div className="space-y-3">
            {sources.map((source) => (
              <div
                key={source.sourceId}
                className="flex items-start justify-between gap-4 p-3 bg-gray-50 border border-gray-200 rounded-md"
              >
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-gray-900 truncate">
                    {source.title}
                  </h3>
                  <p className="text-sm text-gray-500">
                    {source.publisher} &middot; {source.docType}
                    {source.verificationStatus === 'VERIFIED' && (
                      <span className="ml-2 text-green-600">✓ Verified</span>
                    )}
                  </p>
                  {source.excerpt && (
                    <p className="text-sm text-gray-600 mt-1 italic">
                      "{source.excerpt}"
                    </p>
                  )}
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary-600 hover:text-primary-800"
                  >
                    Original source →
                  </a>
                </div>
                <button
                  onClick={() => handleDownload(source.sourceId)}
                  className="btn-secondary text-sm whitespace-nowrap"
                >
                  Download
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Tags */}
        {card.tags && card.tags.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Tags
            </h2>
            <div className="flex flex-wrap gap-2">
              {card.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-sm"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}
      </article>
    </div>
  );
}
