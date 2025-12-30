import { Link } from 'react-router-dom';
import type { EvidenceCard as EvidenceCardType, CardStatus } from '@ledger/shared';

interface EvidenceCardProps {
  card: EvidenceCardType;
  showEntities?: boolean;
  entities?: Array<{ entityId: string; name: string }>;
}

const statusLabels: Record<CardStatus, string> = {
  DRAFT: 'Draft',
  REVIEW: 'In Review',
  PUBLISHED: 'Published',
  DISPUTED: 'Disputed',
  CORRECTED: 'Corrected',
  RETRACTED: 'Retracted',
  ARCHIVED: 'Archived',
};

const statusClasses: Record<CardStatus, string> = {
  DRAFT: 'badge-draft',
  REVIEW: 'badge-review',
  PUBLISHED: 'badge-published',
  DISPUTED: 'badge-disputed',
  CORRECTED: 'badge-corrected',
  RETRACTED: 'badge-retracted',
  ARCHIVED: 'badge-archived',
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

export default function EvidenceCard({
  card,
  showEntities = true,
  entities = [],
}: EvidenceCardProps) {
  const isRetracted = card.status === 'RETRACTED';
  const isDisputed = card.status === 'DISPUTED';
  const isCorrected = card.status === 'CORRECTED';

  return (
    <article
      className={`card p-6 ${isRetracted ? 'opacity-75' : ''}`}
      aria-label={`Evidence card: ${card.title}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className={statusClasses[card.status]}>
              {statusLabels[card.status]}
            </span>
            <span className="badge bg-gray-100 text-gray-700">
              {categoryLabels[card.category] || card.category}
            </span>
            {card.evidenceStrength && (
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
            )}
          </div>
          <Link
            to={`/cards/${card.cardId}`}
            className={`text-lg font-semibold text-gray-900 hover:text-primary-600 ${
              isRetracted ? 'line-through' : ''
            }`}
          >
            {card.title}
          </Link>
        </div>
        <time
          className="text-sm text-gray-500 whitespace-nowrap"
          dateTime={card.eventDate}
        >
          {new Date(card.eventDate).toLocaleDateString()}
        </time>
      </div>

      {/* Claim */}
      <blockquote
        className={`text-gray-700 mb-3 ${isRetracted ? 'line-through' : ''}`}
      >
        {card.claim}
      </blockquote>

      {/* Summary */}
      <p className="text-gray-600 text-sm mb-4">{card.summary}</p>

      {/* Status banners */}
      {isRetracted && card.counterpoint && (
        <div className="bg-red-50 border border-red-200 rounded-md p-3 mb-4">
          <p className="text-sm text-red-800">
            <strong>Retraction Notice:</strong>{' '}
            {card.counterpoint.split('[Retraction').pop()?.split(']:')[1]?.trim() ||
              'This card has been retracted.'}
          </p>
        </div>
      )}

      {isDisputed && card.counterpoint && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3 mb-4">
          <p className="text-sm text-yellow-800">
            <strong>Disputed:</strong> This evidence is currently disputed.
          </p>
        </div>
      )}

      {isCorrected && card.counterpoint && (
        <div className="bg-blue-50 border border-blue-200 rounded-md p-3 mb-4">
          <p className="text-sm text-blue-800">
            <strong>Correction:</strong> This card has been corrected. See
            version history for details.
          </p>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-4 border-t border-gray-100">
        {/* Entities */}
        {showEntities && entities.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {entities.map((entity) => (
              <Link
                key={entity.entityId}
                to={`/entities/${entity.entityId}`}
                className="text-sm text-primary-600 hover:text-primary-800 hover:underline"
              >
                {entity.name}
              </Link>
            ))}
          </div>
        )}

        {/* Sources count */}
        <div className="text-sm text-gray-500">
          {card.sourceRefs.length} source{card.sourceRefs.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Tags */}
      {card.tags && card.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-3">
          {card.tags.map((tag) => (
            <span
              key={tag}
              className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </article>
  );
}
