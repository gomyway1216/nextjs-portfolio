'use client';

import { use, useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useHobbyCategory, useHobbyItems } from '@/hooks/useHobbies';
import { HobbyGrid } from '@/components/hobby';
import HobbySearchSort from '@/components/hobby/HobbySearchSort';
import { applyFiltersAndSort, type SortType } from '@/lib/animeUtils';
import { useLanguage } from '@/contexts/LanguageContext';
import { ArrowLeft, Loader2, HelpCircle, Languages } from 'lucide-react';

interface HobbyPageProps {
  params: Promise<{ slug: string }>;
}

export default function HobbyPage({ params }: HobbyPageProps) {
  const { slug } = use(params);
  const { language, toggleLanguage } = useLanguage();
  const [searchQuery, setSearchQuery] = useState('');
  const [sortType, setSortType] = useState<SortType>('alphabetical');
  const { hobby, loading: hobbyLoading, error: hobbyError } = useHobbyCategory(slug, true);
  const {
    items,
    loading: itemsLoading,
    error: itemsError,
    hasMore,
    loadMore,
  } = useHobbyItems({
    hobbyId: hobby?.id || '',
    includePrivate: false,
  });

  // Check if this hobby has score field (for anime)
  const hasScoreField = useMemo(() => {
    return hobby?.fields.some(f => f.name === 'score') ?? false;
  }, [hobby?.fields]);

  // Apply search and sort to items
  const filteredItems = useMemo(() => {
    return applyFiltersAndSort(items, {
      searchQuery,
      sortType,
    });
  }, [items, searchQuery, sortType]);

  const handleSearchChange = useCallback((query: string) => {
    setSearchQuery(query);
  }, []);

  const handleSortChange = useCallback((sort: SortType) => {
    setSortType(sort);
  }, []);

  if (hobbyLoading) {
    return (
      <div className="hobby-page">
        <div className="hobby-page__loading">
          <Loader2 className="hobby-page__spinner" size={32} />
          <span>Loading...</span>
        </div>
      </div>
    );
  }

  if (hobbyError || !hobby) {
    return (
      <div className="hobby-page">
        <div className="hobby-page__error">
          <h1>Hobby Not Found</h1>
          <p>The hobby you are looking for does not exist.</p>
          <Link href="/hobbies" className="hobby-page__back-link">
            <ArrowLeft size={20} />
            Back to Hobbies
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="hobby-page">
      {/* Hero Section */}
      <div
        className="hobby-page__hero"
        style={{
          backgroundImage: hobby.coverImage
            ? `linear-gradient(rgba(0,0,0,0.5), rgba(0,0,0,0.7)), url(${hobby.coverImage})`
            : undefined,
        }}
      >
        <div className="hobby-page__hero-content">
          <Link href="/hobbies" className="hobby-page__back">
            <ArrowLeft size={20} />
            <span>All Hobbies</span>
          </Link>
          <h1 className="hobby-page__title">{hobby.name}</h1>
          <p className="hobby-page__description">{hobby.description}</p>
          <div className="hobby-page__actions">
            {/* Language Toggle */}
            <button
              className="hobby-page__lang-toggle"
              onClick={toggleLanguage}
              title={language === 'en' ? 'Switch to Japanese' : 'Switch to English'}
            >
              <Languages size={16} />
              <span>{language === 'en' ? 'English' : '日本語'}</span>
            </button>
            {items.length >= 4 && (
              <Link href={`/hobbies/${slug}/quiz`} className="hobby-page__quiz-btn">
                <HelpCircle size={20} />
                <span>Take Quiz</span>
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Items Section */}
      <div className="hobby-page__container">
        {/* Search and Sort */}
        {items.length > 0 && (
          <HobbySearchSort
            onSearchChange={handleSearchChange}
            onSortChange={handleSortChange}
            initialSearch={searchQuery}
            initialSort={sortType}
            showScoreSort={hasScoreField}
            language={language}
            placeholder={language === 'ja' ? '名前で検索...' : 'Search by name...'}
          />
        )}

        {itemsError && (
          <div className="hobby-page__items-error">
            <p>Failed to load items: {itemsError}</p>
          </div>
        )}

        {/* Show result count if searching */}
        {searchQuery && !itemsLoading && (
          <div className="hobby-page__results-count">
            {filteredItems.length} {language === 'ja' ? '件の結果' : 'results'}
            {filteredItems.length !== items.length && (
              <span> ({language === 'ja' ? `全${items.length}件中` : `of ${items.length} total`})</span>
            )}
          </div>
        )}

        <HobbyGrid
          items={filteredItems}
          hobby={hobby}
          loading={itemsLoading}
          hasMore={hasMore && !searchQuery}
          onLoadMore={loadMore}
          language={language}
        />
      </div>
    </div>
  );
}
