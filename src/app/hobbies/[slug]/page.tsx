'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useHobbyCategory, useHobbyItems } from '@/hooks/useHobbies';
import { HobbyGrid } from '@/components/hobby';
import { ArrowLeft, Loader2, HelpCircle, Languages } from 'lucide-react';

interface HobbyPageProps {
  params: Promise<{ slug: string }>;
}

export type Language = 'en' | 'ja';

export default function HobbyPage({ params }: HobbyPageProps) {
  const { slug } = use(params);
  const [language, setLanguage] = useState<Language>('en');
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
              onClick={() => setLanguage(language === 'en' ? 'ja' : 'en')}
              title={language === 'en' ? 'Switch to Japanese' : 'Switch to English'}
            >
              <Languages size={20} />
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
        {itemsError && (
          <div className="hobby-page__items-error">
            <p>Failed to load items: {itemsError}</p>
          </div>
        )}

        <HobbyGrid
          items={items}
          hobby={hobby}
          loading={itemsLoading}
          hasMore={hasMore}
          onLoadMore={loadMore}
          language={language}
        />
      </div>
    </div>
  );
}
