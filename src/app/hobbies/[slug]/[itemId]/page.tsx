'use client';

import { use } from 'react';
import Link from 'next/link';
import { useHobbyCategory, useHobbyItem } from '@/hooks/useHobbies';
import { HobbyItemDetail } from '@/components/hobby';
import { ArrowLeft, Loader2 } from 'lucide-react';

interface HobbyItemPageProps {
  params: Promise<{ slug: string; itemId: string }>;
}

export default function HobbyItemPage({ params }: HobbyItemPageProps) {
  const { slug, itemId } = use(params);
  const { hobby, loading: hobbyLoading, error: hobbyError } = useHobbyCategory(slug, true);
  const { item, loading: itemLoading, error: itemError } = useHobbyItem(itemId);

  const loading = hobbyLoading || itemLoading;

  if (loading) {
    return (
      <div className="hobby-item-page">
        <div className="hobby-item-page__loading">
          <Loader2 className="hobby-item-page__spinner" size={32} />
          <span>Loading...</span>
        </div>
      </div>
    );
  }

  if (hobbyError || !hobby) {
    return (
      <div className="hobby-item-page">
        <div className="hobby-item-page__error">
          <h1>Hobby Not Found</h1>
          <p>The hobby you are looking for does not exist.</p>
          <Link href="/hobbies" className="hobby-item-page__back-link">
            <ArrowLeft size={20} />
            Back to Hobbies
          </Link>
        </div>
      </div>
    );
  }

  if (itemError || !item) {
    return (
      <div className="hobby-item-page">
        <div className="hobby-item-page__error">
          <h1>Item Not Found</h1>
          <p>The item you are looking for does not exist.</p>
          <Link href={`/hobbies/${slug}`} className="hobby-item-page__back-link">
            <ArrowLeft size={20} />
            Back to {hobby.name}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="hobby-item-page">
      <div className="hobby-item-page__container">
        <HobbyItemDetail item={item} hobby={hobby} />
      </div>
    </div>
  );
}
