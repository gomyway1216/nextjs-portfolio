'use client';

import Link from 'next/link';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { HobbyCard } from '@/components/hobby';
import { useLanguage } from '@/contexts/LanguageContext';
import { useHobbyCategories } from '@/hooks/useHobbies';

const COPY = {
  en: {
    backHome: 'Back to home',
    title: 'Hobbies',
    subtitle: 'Collections, notes, and rankings across the things I follow closely.',
    loading: 'Loading...',
    error: 'Failed to load hobbies. Please try again later.',
    empty: 'No hobbies available yet.',
  },
  ja: {
    backHome: 'ホームへ戻る',
    title: '趣味',
    subtitle: 'よく追っている作品や分野のコレクション、メモ、ランキングです。',
    loading: '読み込み中...',
    error: '趣味データを読み込めませんでした。時間をおいて再度お試しください。',
    empty: 'まだ趣味データはありません。',
  },
} as const;

export default function HobbiesPage() {
  const { language } = useLanguage();
  const { categories, loading, error } = useHobbyCategories();
  const copy = COPY[language];

  return (
    <div className="hobbies-page">
      <div className="hobbies-page__container">
        <header className="hobbies-page__header">
          <Link href="/" className="hobbies-page__back-home">
            <ArrowLeft aria-hidden="true" size={16} strokeWidth={2} />
            {copy.backHome}
          </Link>
          <h1 className="hobbies-page__title">{copy.title}</h1>
          <p className="hobbies-page__subtitle">
            {copy.subtitle}
          </p>
        </header>

        {loading && (
          <div className="hobbies-page__loading">
            <Loader2 className="hobbies-page__spinner" size={32} />
            <span>{copy.loading}</span>
          </div>
        )}

        {error && !loading && (
          <div className="hobbies-page__error">
            <p>{copy.error}</p>
          </div>
        )}

        {!loading && !error && categories.length === 0 && (
          <div className="hobbies-page__empty">
            <p>{copy.empty}</p>
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
