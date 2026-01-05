import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type {
  CardCategory,
  EvidenceStrength,
  ScoreSignals,
  ClaimStance,
  ClaimType,
  MonetaryAmount,
  AffectedCount,
  MonetaryAmountType,
  AffectedCountUnit,
  EntitySearchResult,
} from '@ledger/shared';
import { api } from '../../lib/api';
import ErrorMessage from '../../components/ErrorMessage';
import EntitySelector from '../../components/EntitySelector';
import CreateEntityModal from '../../components/CreateEntityModal';

const categories: Array<{ value: CardCategory; label: string }> = [
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

const evidenceStrengths: Array<{ value: EvidenceStrength; label: string }> = [
  { value: 'HIGH', label: 'High' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'LOW', label: 'Low' },
];

const claimStances: Array<{ value: ClaimStance; label: string }> = [
  { value: 'AGENCY_ALLEGES', label: 'Agency Alleges' },
  { value: 'COURT_HELD', label: 'Court Held' },
  { value: 'COMPANY_DISCLOSED', label: 'Company Disclosed' },
  { value: 'SETTLEMENT_TERMS', label: 'Settlement Terms' },
  { value: 'WHISTLEBLOWER_ALLEGED', label: 'Whistleblower Alleged' },
  { value: 'INSPECTOR_FOUND', label: 'Inspector Found' },
  { value: 'MEDIA_REPORTED', label: 'Media Reported' },
];

const claimTypes: Array<{ value: ClaimType; label: string }> = [
  { value: 'ENFORCEMENT_ACTION', label: 'Enforcement Action' },
  { value: 'AUDIT_FINDING', label: 'Audit Finding' },
  { value: 'DISCLOSURE', label: 'Disclosure' },
  { value: 'SETTLEMENT', label: 'Settlement' },
  { value: 'COURT_RULING', label: 'Court Ruling' },
  { value: 'PENALTY', label: 'Penalty' },
  { value: 'INJUNCTION', label: 'Injunction' },
  { value: 'CONSENT_DECREE', label: 'Consent Decree' },
  { value: 'RECALL', label: 'Recall' },
  { value: 'WARNING_LETTER', label: 'Warning Letter' },
  { value: 'INVESTIGATION', label: 'Investigation' },
];

const monetaryAmountTypes: Array<{ value: MonetaryAmountType; label: string }> = [
  { value: 'PENALTY', label: 'Penalty' },
  { value: 'SETTLEMENT', label: 'Settlement' },
  { value: 'RESTITUTION', label: 'Restitution' },
  { value: 'DISGORGEMENT', label: 'Disgorgement' },
  { value: 'OTHER', label: 'Other' },
];

const affectedCountUnits: Array<{ value: AffectedCountUnit; label: string }> = [
  { value: 'INDIVIDUALS', label: 'Individuals' },
  { value: 'ACCOUNTS', label: 'Accounts' },
  { value: 'TRANSACTIONS', label: 'Transactions' },
  { value: 'FACILITIES', label: 'Facilities' },
  { value: 'PRODUCTS', label: 'Products' },
  { value: 'OTHER', label: 'Other' },
];

export default function AdminCardEditPage() {
  const { cardId } = useParams<{ cardId: string }>();
  const navigate = useNavigate();
  const isNew = !cardId;

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Form state
  const [title, setTitle] = useState('');
  const [claim, setClaim] = useState('');
  const [summary, setSummary] = useState('');
  const [category, setCategory] = useState<CardCategory>('other');
  const [eventDate, setEventDate] = useState('');
  const [jurisdiction, setJurisdiction] = useState('');
  const [evidenceStrength, setEvidenceStrength] = useState<EvidenceStrength>('MEDIUM');
  const [counterpoint, setCounterpoint] = useState('');
  const [tags, setTags] = useState('');
  const [selectedEntities, setSelectedEntities] = useState<EntitySearchResult[]>([]);
  const [sourceRefs, setSourceRefs] = useState<string[]>([]);
  const [resolvedSources, setResolvedSources] = useState<Array<{ sourceId: string; title: string; url?: string; verificationStatus: string }>>([]);

  // Create entity modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createEntityName, setCreateEntityName] = useState('');
  const [scoreSignals, setScoreSignals] = useState<ScoreSignals>({
    severity: 0,
    intent: 0,
    scope: 0,
    recidivism: 0,
    deception: 0,
    accountability: 0,
  });

  // Claim metadata
  const [claimStance, setClaimStance] = useState<ClaimStance | ''>('');
  const [claimType, setClaimType] = useState<ClaimType | ''>('');
  const [monetaryAmount, setMonetaryAmount] = useState<MonetaryAmount | null>(null);
  const [affectedCount, setAffectedCount] = useState<AffectedCount | null>(null);

  // Current card status (for edit mode)
  const [currentStatus, setCurrentStatus] = useState<string>('DRAFT');

  useEffect(() => {
    if (cardId) {
      loadCard();
    }
  }, [cardId]);

  async function loadCard() {
    try {
      setLoading(true);
      const card = await api.getAdminCard(cardId!);

      setTitle(card.title);
      setClaim(card.claim);
      setSummary(card.summary);
      setCategory(card.category);
      setEventDate(card.eventDate);
      setJurisdiction(card.jurisdiction || '');
      setEvidenceStrength(card.evidenceStrength);
      setCounterpoint(card.counterpoint || '');
      setTags(card.tags?.join(', ') || '');

      // Convert entities array to EntitySearchResult format
      // The entities array from the API includes { entityId, name }
      // We need to fetch full entity details for type info
      if (card.entities && card.entities.length > 0) {
        const entitiesWithType: EntitySearchResult[] = await Promise.all(
          card.entities.map(async (e) => {
            try {
              const fullEntity = await api.getEntity(e.entityId);
              return {
                entityId: e.entityId,
                name: e.name,
                type: fullEntity.type,
              };
            } catch {
              // If entity fetch fails, use a default type
              return {
                entityId: e.entityId,
                name: e.name,
                type: 'CORPORATION' as const,
              };
            }
          })
        );
        setSelectedEntities(entitiesWithType);
      }

      setSourceRefs(card.sourceRefs);
      setResolvedSources(card.sources || []);
      setCurrentStatus(card.status);
      if (card.scoreSignals) {
        setScoreSignals(card.scoreSignals);
      }
      // Claim metadata
      setClaimStance(card.claimStance || '');
      setClaimType(card.claimType || '');
      setMonetaryAmount(card.monetaryAmount || null);
      setAffectedCount(card.affectedCount || null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load card'));
    } finally {
      setLoading(false);
    }
  }

  function handleCreateNewEntity(name: string) {
    setCreateEntityName(name);
    setShowCreateModal(true);
  }

  function handleEntityCreated(entity: EntitySearchResult) {
    setSelectedEntities((prev) => [...prev, entity]);
    setShowCreateModal(false);
  }

  async function handleSave() {
    try {
      setSaving(true);
      setError(null);

      const data = {
        title,
        claim,
        summary,
        category,
        eventDate,
        jurisdiction: jurisdiction || undefined,
        evidenceStrength,
        counterpoint: counterpoint || undefined,
        tags: tags ? tags.split(',').map((t) => t.trim()) : [],
        entityIds: selectedEntities.map((e) => e.entityId),
        sourceRefs,
        scoreSignals,
        // Claim metadata (only include if set)
        claimStance: claimStance || undefined,
        claimType: claimType || undefined,
        monetaryAmount: monetaryAmount || undefined,
        affectedCount: affectedCount || undefined,
      };

      if (isNew) {
        const card = await api.createCard(data);
        navigate(`/admin/cards/${card.cardId}/edit`);
      } else {
        await api.updateCard(cardId!, data);
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to save card'));
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmitForReview() {
    try {
      setSaving(true);
      await api.submitCard(cardId!);
      setCurrentStatus('REVIEW');
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to submit card'));
    } finally {
      setSaving(false);
    }
  }

  async function handlePublish() {
    try {
      setSaving(true);
      await api.publishCard(cardId!);
      setCurrentStatus('PUBLISHED');
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to publish card'));
    } finally {
      setSaving(false);
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
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          {isNew ? 'New Evidence Card' : 'Edit Evidence Card'}
        </h1>
        {!isNew && (
          <span className={`badge badge-${currentStatus.toLowerCase()}`}>
            {currentStatus}
          </span>
        )}
      </div>

      <ErrorMessage error={error} onDismiss={() => setError(null)} />

      <div className="card p-6 space-y-6">
        {/* Title */}
        <div>
          <label htmlFor="title" className="label">
            Title *
          </label>
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="input"
            required
          />
        </div>

        {/* Claim */}
        <div>
          <label htmlFor="claim" className="label">
            Claim * <span className="font-normal text-gray-500">(one sentence, falsifiable)</span>
          </label>
          <textarea
            id="claim"
            value={claim}
            onChange={(e) => setClaim(e.target.value)}
            className="input"
            rows={2}
            required
          />
        </div>

        {/* Summary */}
        <div>
          <label htmlFor="summary" className="label">
            Summary * <span className="font-normal text-gray-500">(plain language explanation)</span>
          </label>
          <textarea
            id="summary"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            className="input"
            rows={4}
            required
          />
        </div>

        {/* Category & Evidence Strength */}
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="category" className="label">
              Category *
            </label>
            <select
              id="category"
              value={category}
              onChange={(e) => setCategory(e.target.value as CardCategory)}
              className="input"
            >
              {categories.map((cat) => (
                <option key={cat.value} value={cat.value}>
                  {cat.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="evidenceStrength" className="label">
              Evidence Strength *
            </label>
            <select
              id="evidenceStrength"
              value={evidenceStrength}
              onChange={(e) => setEvidenceStrength(e.target.value as EvidenceStrength)}
              className="input"
            >
              {evidenceStrengths.map((str) => (
                <option key={str.value} value={str.value}>
                  {str.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Event Date & Jurisdiction */}
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="eventDate" className="label">
              Event Date *
            </label>
            <input
              id="eventDate"
              type="date"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              className="input"
              required
            />
          </div>
          <div>
            <label htmlFor="jurisdiction" className="label">
              Jurisdiction
            </label>
            <input
              id="jurisdiction"
              type="text"
              value={jurisdiction}
              onChange={(e) => setJurisdiction(e.target.value)}
              className="input"
              placeholder="e.g., US-FED, CA, NYC"
            />
          </div>
        </div>

        {/* Entities */}
        <div>
          <label className="label">
            Entities *
          </label>
          <p className="text-xs text-gray-500 mb-2">
            Search for existing entities or create new ones.
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

        {/* Sources */}
        <div>
          <label className="label">
            Sources
          </label>
          {resolvedSources.length > 0 ? (
            <div className="space-y-2">
              {resolvedSources.map((source) => (
                <div
                  key={source.sourceId}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">{source.title}</p>
                    {source.url && (
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 hover:underline truncate block"
                      >
                        {source.url}
                      </a>
                    )}
                  </div>
                  <span
                    className={`ml-3 px-2 py-1 text-xs font-medium rounded ${
                      source.verificationStatus === 'VERIFIED'
                        ? 'bg-green-100 text-green-800'
                        : source.verificationStatus === 'PENDING'
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {source.verificationStatus}
                  </span>
                </div>
              ))}
            </div>
          ) : sourceRefs.length > 0 ? (
            <p className="text-sm text-gray-500 italic">
              {sourceRefs.length} source(s) linked (loading details...)
            </p>
          ) : (
            <p className="text-sm text-gray-500 italic">
              No sources linked. Sources are automatically linked when promoting from the Intake Inbox.
            </p>
          )}
        </div>

        {/* Counterpoint */}
        <div>
          <label htmlFor="counterpoint" className="label">
            Counterpoint / Response
          </label>
          <textarea
            id="counterpoint"
            value={counterpoint}
            onChange={(e) => setCounterpoint(e.target.value)}
            className="input"
            rows={3}
            placeholder="Company response, rebuttal, or appeal result"
          />
        </div>

        {/* Tags */}
        <div>
          <label htmlFor="tags" className="label">
            Tags <span className="font-normal text-gray-500">(comma-separated)</span>
          </label>
          <input
            id="tags"
            type="text"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            className="input"
            placeholder="tag1, tag2, tag3"
          />
        </div>

        {/* Claim Metadata Section */}
        <div className="border-t border-gray-200 pt-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            Claim Metadata <span className="text-sm font-normal text-gray-500">(optional)</span>
          </h3>

          {/* Claim Stance & Type */}
          <div className="grid gap-4 md:grid-cols-2 mb-4">
            <div>
              <label htmlFor="claimStance" className="label">
                Claim Stance
              </label>
              <select
                id="claimStance"
                value={claimStance}
                onChange={(e) => setClaimStance(e.target.value as ClaimStance | '')}
                className="input"
              >
                <option value="">-- Select --</option>
                {claimStances.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="claimType" className="label">
                Claim Type
              </label>
              <select
                id="claimType"
                value={claimType}
                onChange={(e) => setClaimType(e.target.value as ClaimType | '')}
                className="input"
              >
                <option value="">-- Select --</option>
                {claimTypes.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Monetary Amount */}
          <div className="mb-4">
            <label className="label">Monetary Amount</label>
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <input
                  type="number"
                  placeholder="Amount in dollars"
                  value={monetaryAmount ? monetaryAmount.value / 100 : ''}
                  onChange={(e) => {
                    const dollars = parseFloat(e.target.value);
                    if (isNaN(dollars) || dollars === 0) {
                      setMonetaryAmount(null);
                    } else {
                      setMonetaryAmount({
                        value: Math.round(dollars * 100),
                        currency: monetaryAmount?.currency || 'USD',
                        type: monetaryAmount?.type || 'PENALTY',
                      });
                    }
                  }}
                  className="input"
                />
              </div>
              <div>
                <select
                  value={monetaryAmount?.currency || 'USD'}
                  onChange={(e) => {
                    if (monetaryAmount) {
                      setMonetaryAmount({ ...monetaryAmount, currency: e.target.value });
                    }
                  }}
                  className="input"
                  disabled={!monetaryAmount}
                >
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                  <option value="GBP">GBP</option>
                </select>
              </div>
              <div>
                <select
                  value={monetaryAmount?.type || ''}
                  onChange={(e) => {
                    if (monetaryAmount) {
                      setMonetaryAmount({
                        ...monetaryAmount,
                        type: e.target.value as MonetaryAmountType,
                      });
                    }
                  }}
                  className="input"
                  disabled={!monetaryAmount}
                >
                  {monetaryAmountTypes.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Affected Count */}
          <div className="mb-4">
            <label className="label">Affected Count</label>
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <input
                  type="number"
                  placeholder="Count"
                  value={affectedCount?.count || ''}
                  onChange={(e) => {
                    const count = parseInt(e.target.value);
                    if (isNaN(count) || count === 0) {
                      setAffectedCount(null);
                    } else {
                      setAffectedCount({
                        count,
                        unit: affectedCount?.unit || 'INDIVIDUALS',
                        isEstimate: affectedCount?.isEstimate || false,
                      });
                    }
                  }}
                  className="input"
                />
              </div>
              <div>
                <select
                  value={affectedCount?.unit || ''}
                  onChange={(e) => {
                    if (affectedCount) {
                      setAffectedCount({
                        ...affectedCount,
                        unit: e.target.value as AffectedCountUnit,
                      });
                    }
                  }}
                  className="input"
                  disabled={!affectedCount}
                >
                  {affectedCountUnits.map((u) => (
                    <option key={u.value} value={u.value}>
                      {u.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="isEstimate"
                  checked={affectedCount?.isEstimate || false}
                  onChange={(e) => {
                    if (affectedCount) {
                      setAffectedCount({
                        ...affectedCount,
                        isEstimate: e.target.checked,
                      });
                    }
                  }}
                  className="mr-2"
                  disabled={!affectedCount}
                />
                <label htmlFor="isEstimate" className="text-sm text-gray-600">
                  Is Estimate
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Score Signals */}
        <div>
          <h3 className="label mb-3">Score Signals (0-5)</h3>
          <div className="grid gap-4 md:grid-cols-3">
            {(Object.keys(scoreSignals) as Array<keyof ScoreSignals>).map((key) => (
              <div key={key}>
                <label htmlFor={key} className="text-sm text-gray-600 capitalize">
                  {key}
                </label>
                <input
                  id={key}
                  type="number"
                  min={0}
                  max={5}
                  value={scoreSignals[key]}
                  onChange={(e) =>
                    setScoreSignals({
                      ...scoreSignals,
                      [key]: parseInt(e.target.value) || 0,
                    })
                  }
                  className="input"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-3 pt-4 border-t border-gray-200">
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary"
          >
            {saving ? 'Saving...' : 'Save Draft'}
          </button>

          {!isNew && currentStatus === 'DRAFT' && (
            <button
              onClick={handleSubmitForReview}
              disabled={saving}
              className="btn-secondary"
            >
              Submit for Review
            </button>
          )}

          {!isNew && currentStatus === 'REVIEW' && (
            <button
              onClick={handlePublish}
              disabled={saving}
              className="btn-primary bg-green-600 hover:bg-green-700"
            >
              Publish
            </button>
          )}

          <button
            onClick={() => navigate('/admin/dashboard')}
            className="btn-secondary"
          >
            Cancel
          </button>
        </div>
      </div>

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
