'use client';

import { useState, useEffect } from 'react';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { SORT_OPTIONS, type SortType } from '@/lib/animeUtils';

interface HobbySearchSortProps {
  onSearchChange: (query: string) => void;
  onSortChange: (sortType: SortType) => void;
  initialSearch?: string;
  initialSort?: SortType;
  showScoreSort?: boolean;
  language?: 'en' | 'ja';
  placeholder?: string;
}

export default function HobbySearchSort({
  onSearchChange,
  onSortChange,
  initialSearch = '',
  initialSort = 'alphabetical',
  showScoreSort = true,
  language = 'ja',
  placeholder,
}: HobbySearchSortProps) {
  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const [sortType, setSortType] = useState<SortType>(initialSort);
  const [showFilters, setShowFilters] = useState(false);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      onSearchChange(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, onSearchChange]);

  const handleSortChange = (newSort: SortType) => {
    setSortType(newSort);
    onSortChange(newSort);
  };

  const clearSearch = () => {
    setSearchQuery('');
    onSearchChange('');
  };

  // Filter sort options based on showScoreSort
  const filteredSortOptions = showScoreSort
    ? SORT_OPTIONS
    : SORT_OPTIONS.filter(opt => !opt.value.includes('score'));

  return (
    <div className="hobby-search-sort">
      {/* Search Input */}
      <div className="hobby-search-sort__search">
        <Search size={18} className="hobby-search-sort__search-icon" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={placeholder || (language === 'ja' ? '検索...' : 'Search...')}
          className="hobby-search-sort__input"
        />
        {searchQuery && (
          <button
            onClick={clearSearch}
            className="hobby-search-sort__clear"
            aria-label="Clear search"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Sort Controls */}
      <div className="hobby-search-sort__controls">
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`hobby-search-sort__toggle ${showFilters ? 'active' : ''}`}
        >
          <SlidersHorizontal size={18} />
          <span>{language === 'ja' ? '並び替え' : 'Sort'}</span>
        </button>

        {showFilters && (
          <div className="hobby-search-sort__dropdown">
            {filteredSortOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => handleSortChange(option.value)}
                className={`hobby-search-sort__option ${sortType === option.value ? 'active' : ''}`}
              >
                {language === 'ja' ? option.labelJa : option.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Current Sort Display (always visible) */}
      <div className="hobby-search-sort__current">
        <span className="hobby-search-sort__label">
          {language === 'ja' ? '並び順: ' : 'Sort: '}
        </span>
        <select
          value={sortType}
          onChange={(e) => handleSortChange(e.target.value as SortType)}
          className="hobby-search-sort__select"
        >
          {filteredSortOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {language === 'ja' ? option.labelJa : option.label}
            </option>
          ))}
        </select>
      </div>

      <style jsx>{`
        .hobby-search-sort {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          align-items: center;
          margin-bottom: 24px;
          padding: 16px;
          background: rgba(30, 41, 59, 0.5);
          backdrop-filter: blur(8px);
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .hobby-search-sort__search {
          position: relative;
          flex: 1;
          min-width: 200px;
        }

        .hobby-search-sort__search-icon {
          position: absolute;
          left: 12px;
          top: 50%;
          transform: translateY(-50%);
          color: #64748b;
          pointer-events: none;
        }

        .hobby-search-sort__input {
          width: 100%;
          padding: 10px 40px 10px 40px;
          border-radius: 8px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(15, 23, 42, 0.5);
          color: #ffffff;
          font-size: 14px;
          outline: none;
          transition: border-color 0.2s;
        }

        .hobby-search-sort__input:focus {
          border-color: #a855f7;
        }

        .hobby-search-sort__input::placeholder {
          color: #64748b;
        }

        .hobby-search-sort__clear {
          position: absolute;
          right: 12px;
          top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          color: #64748b;
          cursor: pointer;
          padding: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: color 0.2s;
        }

        .hobby-search-sort__clear:hover {
          color: #ffffff;
        }

        .hobby-search-sort__controls {
          position: relative;
          display: none;
        }

        .hobby-search-sort__toggle {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 16px;
          border-radius: 8px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(15, 23, 42, 0.5);
          color: #94a3b8;
          cursor: pointer;
          transition: all 0.2s;
        }

        .hobby-search-sort__toggle:hover,
        .hobby-search-sort__toggle.active {
          border-color: #a855f7;
          color: #ffffff;
        }

        .hobby-search-sort__dropdown {
          position: absolute;
          top: 100%;
          right: 0;
          margin-top: 8px;
          background: #1e293b;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          padding: 8px;
          z-index: 10;
          min-width: 180px;
        }

        .hobby-search-sort__option {
          display: block;
          width: 100%;
          padding: 8px 12px;
          text-align: left;
          background: none;
          border: none;
          color: #94a3b8;
          cursor: pointer;
          border-radius: 6px;
          transition: all 0.2s;
        }

        .hobby-search-sort__option:hover {
          background: rgba(168, 85, 247, 0.1);
          color: #ffffff;
        }

        .hobby-search-sort__option.active {
          background: rgba(168, 85, 247, 0.2);
          color: #a855f7;
        }

        .hobby-search-sort__current {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .hobby-search-sort__label {
          color: #64748b;
          font-size: 14px;
          white-space: nowrap;
        }

        .hobby-search-sort__select {
          padding: 10px 12px;
          border-radius: 8px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(15, 23, 42, 0.8);
          color: #ffffff;
          font-size: 14px;
          cursor: pointer;
          outline: none;
          min-width: 140px;
        }

        .hobby-search-sort__select:focus {
          border-color: #a855f7;
        }

        @media (max-width: 640px) {
          .hobby-search-sort {
            flex-direction: column;
            align-items: stretch;
          }

          .hobby-search-sort__search {
            width: 100%;
          }

          .hobby-search-sort__current {
            width: 100%;
          }

          .hobby-search-sort__select {
            flex: 1;
          }
        }
      `}</style>
    </div>
  );
}
