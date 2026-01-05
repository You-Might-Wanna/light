import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import type { IntakeItem, IntakeStatus, EntitySearchResult, EntityType } from '@ledger/shared';
import { api } from '../../lib/api';
import ErrorMessage from '../../components/ErrorMessage';
import { useToast } from '../../components/Toast';
import EntitySelector from '../../components/EntitySelector';
import CreateEntityModal from '../../components/CreateEntityModal';

type StatusFilter = IntakeStatus | 'ALL';

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'NEW', label: 'New' },
  { value: 'PROMOTED', label: 'Promoted' },
  { value: 'REJECTED', label: 'Rejected' },
];

/**
 * Generate a default summary template from intake item metadata.
 * Uses a deterministic template that the admin can edit before promoting.
 */
function generateDefaultSummary(item: IntakeItem): string {
  const date = new Date(item.publishedAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  // Start with the RSS summary if available, otherwise build from title
  if (item.summary) {
    // Clean up common RSS cruft: excessive whitespace, [Continue reading...], etc.
    let cleaned = item.summary
      .replace(/\[Continue reading.*?\]/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    // If summary is too long, truncate at sentence boundary
    if (cleaned.length > 500) {
      const sentences = cleaned.split(/(?<=[.!?])\s+/);
      cleaned = '';
      for (const sentence of sentences) {
        if ((cleaned + sentence).length > 450) break;
        cleaned += (cleaned ? ' ' : '') + sentence;
      }
    }

    return cleaned;
  }

  // Fallback: generate from title and publisher
  return `On ${date}, ${item.publisher} published: "${item.title}". [Summary to be added by reviewer.]`;
}

export default function IntakeInboxPage() {
  const [items, setItems] = useState<IntakeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [statusFilter, setStatusFilter] = useState<IntakeStatus>('NEW');
  const [selectedItem, setSelectedItem] = useState<IntakeItem | null>(null);
  const [promoting, setPromoting] = useState(false);
  const { showError, showSuccess } = useToast();

  // Promote form state
  const [selectedEntities, setSelectedEntities] = useState<EntitySearchResult[]>([]);
  const [newEntitiesToCreate, setNewEntitiesToCreate] = useState<Array<{ name: string; type: EntityType }>>([]);
  const [cardSummary, setCardSummary] = useState('');
  const [tags, setTags] = useState('');

  // Create entity modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createEntityName, setCreateEntityName] = useState('');

  useEffect(() => {
    loadItems();
  }, [statusFilter]);

  async function loadItems() {
    try {
      setLoading(true);
      setError(null);
      const result = await api.listIntake({ status: statusFilter, limit: 50 });
      setItems(result.items);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load intake items'));
    } finally {
      setLoading(false);
    }
  }

  async function handleReject(item: IntakeItem) {
    if (!confirm(`Reject "${item.title}"?`)) return;

    try {
      await api.rejectIntake(item.intakeId);
      setItems((prev) => prev.filter((i) => i.intakeId !== item.intakeId));
      showSuccess('Item rejected');
    } catch (err) {
      showError(err);
    }
  }

  function openPromoteModal(item: IntakeItem) {
    setSelectedItem(item);
    setSelectedEntities([]);
    setNewEntitiesToCreate([]);
    setCardSummary(generateDefaultSummary(item));
    setTags(item.suggestedTags?.join(', ') || '');
    setPromoting(true);
  }

  function handleCreateNewEntity(name: string) {
    setCreateEntityName(name);
    setShowCreateModal(true);
  }

  function handleEntityCreated(entity: EntitySearchResult) {
    setSelectedEntities((prev) => [...prev, entity]);
    setShowCreateModal(false);
  }

  async function handlePromote() {
    if (!selectedItem) return;

    const tagList = tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    if (selectedEntities.length === 0 && newEntitiesToCreate.length === 0) {
      showError('Please select or create at least one entity');
      return;
    }
    if (!cardSummary) {
      showError('Please enter a card summary');
      return;
    }

    try {
      await api.promoteIntake(selectedItem.intakeId, {
        entityIds: selectedEntities.map((e) => e.entityId),
        createEntities: newEntitiesToCreate.length > 0 ? newEntitiesToCreate : undefined,
        cardSummary,
        tags: tagList,
      });

      setItems((prev) => prev.filter((i) => i.intakeId !== selectedItem.intakeId));
      setPromoting(false);
      setSelectedItem(null);
      showSuccess('Item promoted to evidence card');
    } catch (err) {
      showError(err);
    }
  }

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
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
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Intake Inbox</h1>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600">Status:</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as IntakeStatus)}
            className="input py-1 px-2 text-sm"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <ErrorMessage error={error} onDismiss={() => setError(null)} />

      {items.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-gray-500">
            No {statusFilter.toLowerCase()} intake items.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <div key={item.intakeId} className="card p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="badge badge-primary">{item.publisher}</span>
                    <span className="badge badge-secondary">{item.feedId}</span>
                    {item.status !== 'NEW' && (
                      <span
                        className={`badge ${
                          item.status === 'PROMOTED'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {item.status}
                      </span>
                    )}
                  </div>
                  <h2 className="text-lg font-semibold text-gray-900 mb-1 truncate">
                    <a
                      href={item.canonicalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-primary-600"
                    >
                      {item.title}
                    </a>
                  </h2>
                  {item.summary && (
                    <p className="text-gray-600 text-sm mb-2 line-clamp-2">
                      {item.summary}
                    </p>
                  )}
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    <span>Published: {formatDate(item.publishedAt)}</span>
                    <span>Ingested: {formatDate(item.ingestedAt)}</span>
                    {item.suggestedTags && item.suggestedTags.length > 0 && (
                      <span>Tags: {item.suggestedTags.join(', ')}</span>
                    )}
                  </div>
                  {item.promotedCardId && (
                    <div className="mt-2">
                      <Link
                        to={`/cards/${item.promotedCardId}`}
                        className="text-sm text-primary-600 hover:underline"
                      >
                        View Card
                      </Link>
                    </div>
                  )}
                </div>

                {item.status === 'NEW' && (
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => openPromoteModal(item)}
                      className="btn-primary text-sm bg-green-600 hover:bg-green-700"
                    >
                      Promote
                    </button>
                    <button
                      onClick={() => handleReject(item)}
                      className="btn-secondary text-sm text-red-600 hover:text-red-700"
                    >
                      Reject
                    </button>
                    <a
                      href={item.canonicalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-secondary text-sm text-center"
                    >
                      View Source
                    </a>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Promote Modal */}
      {promoting && selectedItem && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">
                Promote to Evidence Card
              </h2>
              <p className="text-sm text-gray-600 mb-4">
                <strong>{selectedItem.title}</strong>
              </p>

              {/* Entity Selection */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Entities
                </label>
                <p className="text-xs text-gray-500 mb-2">
                  Search for existing entities or create new ones. Multiple entities can be selected.
                </p>
                <EntitySelector
                  value={selectedEntities}
                  onChange={setSelectedEntities}
                  multiple={true}
                  allowCreate={true}
                  onCreateNew={handleCreateNewEntity}
                  placeholder="Search entities..."
                />
              </div>

              {/* Card Summary */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Card Summary
                </label>
                <textarea
                  value={cardSummary}
                  onChange={(e) => setCardSummary(e.target.value)}
                  className="input w-full h-24"
                  placeholder="Summarize the key facts and significance..."
                />
              </div>

              {/* Tags */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tags (comma-separated)
                </label>
                <input
                  type="text"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  className="input w-full"
                  placeholder="enforcement, consumer-protection"
                />
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => {
                    setPromoting(false);
                    setSelectedItem(null);
                  }}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button onClick={handlePromote} className="btn-primary">
                  Promote to Card
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Entity Modal */}
      <CreateEntityModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={handleEntityCreated}
        initialName={createEntityName}
      />
    </div>
  );
}