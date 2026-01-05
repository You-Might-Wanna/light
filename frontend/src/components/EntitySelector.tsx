import { useState, useCallback, useRef, useEffect } from 'react';
import type { EntitySearchResult, EntityType } from '@ledger/shared';
import { api } from '../lib/api';

interface EntitySelectorProps {
  value: EntitySearchResult[];
  onChange: (entities: EntitySearchResult[]) => void;
  multiple?: boolean;
  allowCreate?: boolean;
  placeholder?: string;
  disabled?: boolean;
  onCreateNew?: (name: string) => void;
}

// Format entity type for display
function formatEntityType(type: EntityType): string {
  return type.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function EntitySelector({
  value,
  onChange,
  multiple = true,
  allowCreate = true,
  placeholder = 'Search entities...',
  disabled = false,
  onCreateNew,
}: EntitySelectorProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<EntitySearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Filter out already-selected entities from results
  const filteredResults = results.filter(
    (r) => !value.some((v) => v.entityId === r.entityId)
  );

  // Total options count (results + create option if applicable)
  const showCreateOption = allowCreate && query.length >= 2 && onCreateNew;
  const totalOptions = filteredResults.length + (showCreateOption ? 1 : 0);

  // Debounced search
  const searchEntities = useCallback(async (searchQuery: string) => {
    if (searchQuery.length < 2) {
      setResults([]);
      return;
    }

    setIsLoading(true);
    try {
      const response = await api.searchEntities(searchQuery, 10);
      setResults(response.entities);
    } catch (error) {
      console.error('Entity search failed:', error);
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Handle input change with debounce
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newQuery = e.target.value;
    setQuery(newQuery);
    setIsOpen(true);
    setHighlightedIndex(-1);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      searchEntities(newQuery);
    }, 300);
  };

  // Select an entity
  const selectEntity = (entity: EntitySearchResult) => {
    if (multiple) {
      onChange([...value, entity]);
    } else {
      onChange([entity]);
    }
    setQuery('');
    setResults([]);
    setIsOpen(false);
    setHighlightedIndex(-1);
    inputRef.current?.focus();
  };

  // Remove an entity
  const removeEntity = (entityId: string) => {
    onChange(value.filter((e) => e.entityId !== entityId));
  };

  // Handle create new entity
  const handleCreateNew = () => {
    if (onCreateNew && query.length >= 2) {
      onCreateNew(query);
      setQuery('');
      setIsOpen(false);
    }
  };

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen && e.key === 'ArrowDown') {
      setIsOpen(true);
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev < totalOptions - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : -1));
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0) {
          if (highlightedIndex < filteredResults.length) {
            selectEntity(filteredResults[highlightedIndex]);
          } else if (showCreateOption) {
            handleCreateNew();
          }
        }
        break;
      case 'Escape':
        setIsOpen(false);
        setHighlightedIndex(-1);
        break;
      case 'Backspace':
        if (query === '' && value.length > 0) {
          removeEntity(value[value.length - 1].entityId);
        }
        break;
    }
  };

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setHighlightedIndex(-1);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  return (
    <div ref={containerRef} className="relative">
      {/* Selected entities as chips + input */}
      <div
        className={`flex flex-wrap gap-2 p-2 border rounded-md bg-white min-h-[42px] ${
          disabled ? 'bg-gray-100 cursor-not-allowed' : 'cursor-text'
        } ${isOpen ? 'ring-2 ring-primary-500 border-primary-500' : 'border-gray-300'}`}
        onClick={() => !disabled && inputRef.current?.focus()}
      >
        {/* Selected entity chips */}
        {value.map((entity) => (
          <span
            key={entity.entityId}
            className="inline-flex items-center gap-1 px-2 py-1 bg-primary-100 text-primary-800 rounded-md text-sm"
          >
            <span>{entity.name}</span>
            <span className="text-primary-500 text-xs">({formatEntityType(entity.type)})</span>
            {!disabled && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeEntity(entity.entityId);
                }}
                className="ml-1 text-primary-500 hover:text-primary-700"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            )}
          </span>
        ))}

        {/* Search input */}
        {(multiple || value.length === 0) && (
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onFocus={() => query.length >= 2 && setIsOpen(true)}
            placeholder={value.length === 0 ? placeholder : ''}
            disabled={disabled}
            className="flex-1 min-w-[120px] outline-none bg-transparent text-sm"
          />
        )}

        {/* Loading indicator */}
        {isLoading && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2">
            <svg className="animate-spin h-4 w-4 text-gray-400" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          </div>
        )}
      </div>

      {/* Dropdown */}
      {isOpen && (query.length >= 2 || filteredResults.length > 0) && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-auto">
          {filteredResults.length === 0 && !isLoading && !showCreateOption && (
            <div className="px-4 py-3 text-sm text-gray-500">
              No entities found
            </div>
          )}

          {/* Search results */}
          {filteredResults.map((entity, index) => (
            <button
              key={entity.entityId}
              type="button"
              onClick={() => selectEntity(entity)}
              className={`w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2 ${
                index === highlightedIndex ? 'bg-primary-50' : ''
              }`}
            >
              <span className="font-medium text-gray-900">{entity.name}</span>
              <span className="text-gray-500">({formatEntityType(entity.type)})</span>
              {entity.aliases && entity.aliases.length > 0 && (
                <span className="text-gray-400 text-xs">
                  — aka "{entity.aliases[0]}"
                </span>
              )}
            </button>
          ))}

          {/* Create new option */}
          {showCreateOption && (
            <>
              {filteredResults.length > 0 && (
                <div className="border-t border-gray-100" />
              )}
              <button
                type="button"
                onClick={handleCreateNew}
                className={`w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2 text-primary-600 ${
                  highlightedIndex === filteredResults.length ? 'bg-primary-50' : ''
                }`}
              >
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"
                    clipRule="evenodd"
                  />
                </svg>
                <span>Create "{query}" as new entity...</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
