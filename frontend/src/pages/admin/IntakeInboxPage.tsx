import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import type {
  IntakeItem,
  IntakeStatus,
  EntitySearchResult,
  EntityType,
  SuggestedEntity,
  SuggestedRelationship,
  SuggestedSource,
} from '@ledger/shared';
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
 * Prefers AI-extracted summary, falls back to RSS summary, then title.
 */
function generateDefaultSummary(item: IntakeItem): string {
  const date = new Date(item.publishedAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  // Prefer AI-extracted summary (from LLM extraction)
  if (item.extractedSummary) {
    return item.extractedSummary;
  }

  // Fall back to RSS summary if available
  if (item.summary && item.summary !== item.title) {
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
  const [createEntityType, setCreateEntityType] = useState<EntityType | undefined>(undefined);
  const [pendingSuggestion, setPendingSuggestion] = useState<SuggestedEntity | null>(null);

  // LLM extraction suggestions state
  const [unmatchedSuggestions, setUnmatchedSuggestions] = useState<SuggestedEntity[]>([]);
  const [suggestedRelationships, setSuggestedRelationships] = useState<SuggestedRelationship[]>([]);
  const [selectedRelationships, setSelectedRelationships] = useState<Set<number>>(new Set());
  const [suggestedSources, setSuggestedSources] = useState<SuggestedSource[]>([]);

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

    // Pre-populate with matched entities from LLM extraction
    const matchedEntities: EntitySearchResult[] = (item.suggestedEntities || [])
      .filter((e) => e.matchedEntityId && e.matchedEntityName)
      .map((e) => ({
        entityId: e.matchedEntityId!,
        name: e.matchedEntityName!,
        type: e.suggestedType,
      }));
    setSelectedEntities(matchedEntities);

    // Track unmatched suggestions for user to review
    const unmatched = (item.suggestedEntities || []).filter((e) => !e.matchedEntityId);
    setUnmatchedSuggestions(unmatched);

    // Load relationship suggestions
    setSuggestedRelationships(item.suggestedRelationships || []);
    setSelectedRelationships(new Set()); // None selected by default

    // Load source suggestions
    setSuggestedSources(item.suggestedSources || []);

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
    // Remove the pending suggestion from unmatched list (entity was created successfully)
    if (pendingSuggestion) {
      setUnmatchedSuggestions((prev) =>
        prev.filter((s) => s.extractedName !== pendingSuggestion.extractedName)
      );
      setPendingSuggestion(null);
    }
    setShowCreateModal(false);
  }

  function handleCreateFromSuggestion(suggestion: SuggestedEntity) {
    // Store pending suggestion to remove only on success (not on cancel)
    setPendingSuggestion(suggestion);
    // Open create modal with suggested name and type pre-filled
    setCreateEntityName(suggestion.extractedName);
    setCreateEntityType(suggestion.suggestedType);
    setShowCreateModal(true);
  }

  function handleDismissSuggestion(suggestion: SuggestedEntity) {
    setUnmatchedSuggestions((prev) =>
      prev.filter((s) => s.extractedName !== suggestion.extractedName)
    );
  }

  function toggleRelationship(index: number) {
    setSelectedRelationships((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }

  function getConfidenceColor(confidence: number): string {
    if (confidence >= 0.9) return 'text-green-600';
    if (confidence >= 0.7) return 'text-yellow-600';
    return 'text-orange-600';
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
      // Build relationship requests from selected suggestions
      // Only include relationships where both entities are matched
      const relationshipsToCreate = Array.from(selectedRelationships)
        .map((idx) => suggestedRelationships[idx])
        .filter((rel) => rel.fromEntity.matchedEntityId && rel.toEntity.matchedEntityId)
        .map((rel) => ({
          fromEntityId: rel.fromEntity.matchedEntityId!,
          toEntityId: rel.toEntity.matchedEntityId!,
          type: rel.suggestedType,
          description: rel.description,
        }));

      await api.promoteIntake(selectedItem.intakeId, {
        entityIds: selectedEntities.map((e) => e.entityId),
        createEntities: newEntitiesToCreate.length > 0 ? newEntitiesToCreate : undefined,
        createRelationships: relationshipsToCreate.length > 0 ? relationshipsToCreate : undefined,
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
                    {item.extractionStatus === 'COMPLETED' && (
                      <span className="badge bg-purple-100 text-purple-800" title="LLM extraction completed">
                        {(item.suggestedEntities?.length || 0)} entities,{' '}
                        {(item.suggestedRelationships?.length || 0)} relationships,{' '}
                        {(item.suggestedSources?.length || 0)} sources
                      </span>
                    )}
                    {item.extractionStatus === 'FAILED' && (
                      <span className="badge bg-red-100 text-red-800" title={item.extractionError}>
                        Extraction failed
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

              {/* Unmatched Entity Suggestions from LLM */}
              {unmatchedSuggestions.length > 0 && (
                <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <label className="block text-sm font-medium text-amber-800 mb-2">
                    Suggested Entities (not in database)
                  </label>
                  <div className="space-y-2">
                    {unmatchedSuggestions.map((suggestion, idx) => (
                      <div
                        key={idx}
                        className="flex items-start gap-2 bg-white p-2 rounded border border-amber-100"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-1">
                            <span className="font-medium text-gray-900">
                              {suggestion.extractedName}
                            </span>
                            <span className="text-xs text-gray-500">
                              ({suggestion.suggestedType})
                            </span>
                            <span className={`text-xs ${getConfidenceColor(suggestion.confidence)}`}>
                              {Math.round(suggestion.confidence * 100)}% confidence
                            </span>
                          </div>
                          {suggestion.evidenceSnippet && (
                            <p className="text-xs text-gray-500 mt-1 italic truncate">
                              "{suggestion.evidenceSnippet}"
                            </p>
                          )}
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                          <button
                            onClick={() => handleCreateFromSuggestion(suggestion)}
                            className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200"
                          >
                            Create
                          </button>
                          <button
                            onClick={() => handleDismissSuggestion(suggestion)}
                            className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded hover:bg-gray-200"
                          >
                            Dismiss
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Relationship Suggestions from LLM */}
              {suggestedRelationships.length > 0 && (
                <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <label className="block text-sm font-medium text-blue-800 mb-2">
                    Suggested Relationships
                  </label>
                  <p className="text-xs text-blue-600 mb-2">
                    Select relationships to create. Create missing entities above first to enable grayed-out relationships.
                  </p>
                  <div className="space-y-2">
                    {suggestedRelationships.map((rel, idx) => {
                      const fromMatched = rel.fromEntity.matchedEntityId || selectedEntities.some(e => e.name.toLowerCase() === rel.fromEntity.extractedName.toLowerCase());
                      const toMatched = rel.toEntity.matchedEntityId || selectedEntities.some(e => e.name.toLowerCase() === rel.toEntity.extractedName.toLowerCase());
                      const canCreate = fromMatched && toMatched;
                      const isSelected = selectedRelationships.has(idx);

                      // Identify which entities are missing
                      const missingEntities: string[] = [];
                      if (!fromMatched) missingEntities.push(rel.fromEntity.extractedName);
                      if (!toMatched) missingEntities.push(rel.toEntity.extractedName);

                      return (
                        <div
                          key={idx}
                          className={`flex items-start gap-3 p-2 rounded border ${
                            canCreate
                              ? isSelected
                                ? 'bg-blue-100 border-blue-300'
                                : 'bg-white border-blue-100 hover:bg-blue-50 cursor-pointer'
                              : 'bg-gray-50 border-gray-200'
                          }`}
                          onClick={() => canCreate && toggleRelationship(idx)}
                        >
                          {canCreate ? (
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleRelationship(idx)}
                              className="mt-1"
                            />
                          ) : (
                            <div className="w-4 mt-1" /> // Spacer for alignment
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="text-sm flex flex-wrap items-center gap-1">
                              <span className={`font-medium ${!fromMatched ? 'text-amber-600' : ''}`}>
                                {rel.fromEntity.matchedEntityName || rel.fromEntity.extractedName}
                              </span>
                              <span className="text-gray-500">→</span>
                              <span className="text-xs px-1.5 py-0.5 bg-gray-200 rounded">
                                {rel.suggestedType}
                              </span>
                              <span className="text-gray-500">→</span>
                              <span className={`font-medium ${!toMatched ? 'text-amber-600' : ''}`}>
                                {rel.toEntity.matchedEntityName || rel.toEntity.extractedName}
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 mt-1">
                              <span className={`text-xs ${getConfidenceColor(rel.confidence)}`}>
                                {Math.round(rel.confidence * 100)}% confidence
                              </span>
                              {!canCreate && (
                                <span className="text-xs text-amber-600">
                                  Create {missingEntities.join(' and ')} first
                                </span>
                              )}
                            </div>
                            {rel.evidenceSnippet && (
                              <p className="text-xs text-gray-500 mt-1 italic line-clamp-2">
                                "{rel.evidenceSnippet}"
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Suggested Sources from LLM */}
              {suggestedSources.length > 0 && (
                <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                  <label className="block text-sm font-medium text-green-800 mb-2">
                    Suggested Source Documents
                  </label>
                  <p className="text-xs text-green-600 mb-2">
                    Links to primary documents extracted from the article (for reference only)
                  </p>
                  <div className="space-y-2">
                    {suggestedSources.map((source, idx) => (
                      <div
                        key={idx}
                        className="flex items-start gap-3 p-2 rounded border bg-white border-green-100"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <a
                              href={source.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm font-medium text-primary-600 hover:underline truncate"
                              title={source.url}
                            >
                              {source.title}
                            </a>
                            {source.sourceType && (
                              <span className="text-xs px-1.5 py-0.5 bg-gray-200 rounded flex-shrink-0">
                                {source.sourceType}
                              </span>
                            )}
                            <span className={`text-xs flex-shrink-0 ${getConfidenceColor(source.confidence)}`}>
                              {Math.round(source.confidence * 100)}%
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 truncate mt-0.5" title={source.url}>
                            {source.url}
                          </p>
                          {source.evidenceSnippet && (
                            <p className="text-xs text-gray-500 mt-1 italic line-clamp-1">
                              "{source.evidenceSnippet}"
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

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
        onClose={() => {
          setShowCreateModal(false);
          setPendingSuggestion(null); // Clear pending suggestion on cancel (keeps it in unmatched list)
        }}
        onCreated={handleEntityCreated}
        initialName={createEntityName}
        initialType={createEntityType}
      />
    </div>
  );
}