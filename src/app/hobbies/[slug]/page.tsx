'use client';

import { use } from 'react';
import Link from 'next/link';
import { useHobbyCategory, useHobbyItems } from '@/hooks/useHobbies';
import { HobbyGrid } from '@/components/hobby';
import { ArrowLeft, Loader2 } from 'lucide-react';

interface HobbyPageProps {
  params: Promise<{ slug: string }>;
}

export default function HobbyPage({ params }: HobbyPageProps) {
  const { slug } = use(params);
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
        />
      </div>
    </div>
  );
}
