import { useState } from 'react';
import { EntityType, type EntitySearchResult, type CreateEntityRequest } from '@ledger/shared';
import { api } from '../lib/api';
import { useToast } from './Toast';

interface CreateEntityModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (entity: EntitySearchResult) => void;
  initialName?: string;
}

const ENTITY_TYPE_OPTIONS: { value: EntityType; label: string }[] = [
  { value: 'CORPORATION', label: 'Corporation' },
  { value: 'AGENCY', label: 'Government Agency' },
  { value: 'NONPROFIT', label: 'Nonprofit' },
  { value: 'VENDOR', label: 'Vendor' },
  { value: 'INDIVIDUAL_PUBLIC_OFFICIAL', label: 'Public Official' },
];

export default function CreateEntityModal({
  isOpen,
  onClose,
  onCreated,
  initialName = '',
}: CreateEntityModalProps) {
  const { showError, showSuccess } = useToast();
  const [name, setName] = useState(initialName);
  const [type, setType] = useState<EntityType>('CORPORATION');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset form when modal opens with new initial name
  useState(() => {
    if (isOpen) {
      setName(initialName);
    }
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      showError('Entity name is required');
      return;
    }

    setIsSubmitting(true);
    try {
      const request: CreateEntityRequest = {
        name: name.trim(),
        type,
      };
      const entity = await api.createEntity(request);
      showSuccess(`Created entity: ${entity.name}`);
      onCreated({
        entityId: entity.entityId,
        name: entity.name,
        type: entity.type,
      });
      onClose();
      // Reset form
      setName('');
      setType('CORPORATION');
    } catch (error) {
      showError(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Create New Entity
          </h3>

          <form onSubmit={handleSubmit}>
            {/* Name input */}
            <div className="mb-4">
              <label htmlFor="entity-name" className="label">
                Name
              </label>
              <input
                id="entity-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter entity name"
                className="input"
                autoFocus
              />
            </div>

            {/* Type select */}
            <div className="mb-6">
              <label htmlFor="entity-type" className="label">
                Type
              </label>
              <select
                id="entity-type"
                value={type}
                onChange={(e) => setType(e.target.value as EntityType)}
                className="input"
              >
                {ENTITY_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="btn-secondary"
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={isSubmitting || !name.trim()}
              >
                {isSubmitting ? 'Creating...' : 'Create Entity'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
