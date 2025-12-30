import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { CardCategory, EvidenceStrength, ScoreSignals } from '@ledger/shared';
import { api } from '../../lib/api';

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

export default function AdminCardEditPage() {
  const { cardId } = useParams<{ cardId: string }>();
  const navigate = useNavigate();
  const isNew = !cardId;

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
  const [entityIds, setEntityIds] = useState<string[]>([]);
  const [sourceRefs, setSourceRefs] = useState<string[]>([]);
  const [scoreSignals, setScoreSignals] = useState<ScoreSignals>({
    severity: 0,
    intent: 0,
    scope: 0,
    recidivism: 0,
    deception: 0,
    accountability: 0,
  });

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
      const card = await api.getCard(cardId!);

      setTitle(card.title);
      setClaim(card.claim);
      setSummary(card.summary);
      setCategory(card.category);
      setEventDate(card.eventDate);
      setJurisdiction(card.jurisdiction || '');
      setEvidenceStrength(card.evidenceStrength);
      setCounterpoint(card.counterpoint || '');
      setTags(card.tags?.join(', ') || '');
      setEntityIds(card.entityIds);
      setSourceRefs(card.sourceRefs);
      setCurrentStatus(card.status);
      if (card.scoreSignals) {
        setScoreSignals(card.scoreSignals);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load card');
    } finally {
      setLoading(false);
    }
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
        entityIds,
        sourceRefs,
        scoreSignals,
      };

      if (isNew) {
        const card = await api.createCard(data);
        navigate(`/admin/cards/${card.cardId}/edit`);
      } else {
        await api.updateCard(cardId!, data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save card');
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
      setError(err instanceof Error ? err.message : 'Failed to submit card');
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
      setError(err instanceof Error ? err.message : 'Failed to publish card');
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

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-6">
          <p className="text-red-800">{error}</p>
        </div>
      )}

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

        {/* Entity IDs */}
        <div>
          <label htmlFor="entityIds" className="label">
            Entity IDs * <span className="font-normal text-gray-500">(comma-separated)</span>
          </label>
          <input
            id="entityIds"
            type="text"
            value={entityIds.join(', ')}
            onChange={(e) => setEntityIds(e.target.value.split(',').map((s) => s.trim()).filter(Boolean))}
            className="input"
            placeholder="entity-id-1, entity-id-2"
          />
        </div>

        {/* Source Refs */}
        <div>
          <label htmlFor="sourceRefs" className="label">
            Source IDs <span className="font-normal text-gray-500">(comma-separated)</span>
          </label>
          <input
            id="sourceRefs"
            type="text"
            value={sourceRefs.join(', ')}
            onChange={(e) => setSourceRefs(e.target.value.split(',').map((s) => s.trim()).filter(Boolean))}
            className="input"
            placeholder="source-id-1, source-id-2"
          />
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
    </div>
  );
}
