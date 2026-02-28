'use client';

import Link from 'next/link';
import { useHobbyCategories } from '@/hooks/useHobbies';
import { HobbyCard } from '@/components/hobby';
import { Loader2 } from 'lucide-react';

export default function HobbiesPage() {
  const { categories, loading, error } = useHobbyCategories();

  return (
    <div className="hobbies-page">
      <div className="hobbies-page__container">
        <header className="hobbies-page__header">
          <h1 className="hobbies-page__title">My Hobbies</h1>
          <p className="hobbies-page__subtitle">
            Explore my interests and passions
          </p>
          <Link href="/#tools" className="hobbies-page__back-home">
            Back to Home Tools
          </Link>
        </header>

        {loading && (
          <div className="hobbies-page__loading">
            <Loader2 className="hobbies-page__spinner" size={32} />
            <span>Loading hobbies...</span>
          </div>
        )}

        {error && (
          <div className="hobbies-page__error">
            <p>Failed to load hobbies: {error}</p>
          </div>
        )}

        {!loading && !error && categories.length === 0 && (
          <div className="hobbies-page__empty">
            <p>No hobbies available yet.</p>
          </div>
        )}

        {!loading && !error && categories.length > 0 && (
          <div className="hobbies-page__grid">
            {categories.map((hobby) => (
              <HobbyCard key={hobby.id} hobby={hobby} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
