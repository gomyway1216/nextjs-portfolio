'use client';

import { useRelatedItems } from '@/hooks/useHobbies';
import type { HobbyCategory } from '@/types/hobby';
import { Loader2 } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

interface RelatedItemsListProps {
  hobbyId: string;
  hobbySlug: string;
  fieldName: string;
  targetItemId: string;
  title: string;
  language?: 'en' | 'ja';
}

export default function RelatedItemsList({
  hobbyId,
  hobbySlug,
  fieldName,
  targetItemId,
  title,
  language = 'ja',
}: RelatedItemsListProps) {
  const { items, loading, error } = useRelatedItems({
    hobbyId,
    fieldName,
    targetItemId,
  });

  if (loading) {
    return (
      <div className="related-items related-items--loading">
        <h3 className="related-items__title">{title}</h3>
        <div className="related-items__loader">
          <Loader2 size={24} className="animate-spin" />
        </div>
        <style jsx>{styles}</style>
      </div>
    );
  }

  if (error || items.length === 0) {
    return null;
  }

  return (
    <div className="related-items">
      <h3 className="related-items__title">{title}</h3>
      <div className="related-items__grid">
        {items.map((item) => {
          const nameKanji = item.customFields.nameKanji as string;
          const nameEnglish = item.customFields.nameEnglish as string;
          const displayName = language === 'ja' ? (nameKanji || item.title) : (nameEnglish || item.title);

          return (
            <Link
              key={item.id}
              href={`/hobbies/${hobbySlug}/${item.id}`}
              className="related-items__card"
            >
              {item.thumbImage && (
                <div className="related-items__image-wrapper">
                  <Image
                    src={item.thumbImage}
                    alt={displayName}
                    fill
                    sizes="80px"
                    className="related-items__image"
                  />
                </div>
              )}
              <div className="related-items__info">
                <span className="related-items__name">{displayName}</span>
                {language === 'ja' && nameEnglish && (
                  <span className="related-items__name-alt">{nameEnglish}</span>
                )}
                {language === 'en' && nameKanji && (
                  <span className="related-items__name-alt">{nameKanji}</span>
                )}
              </div>
            </Link>
          );
        })}
      </div>

      <style jsx>{styles}</style>
    </div>
  );
}

const styles = `
  .related-items {
    margin-top: 32px;
    padding: 24px;
    background: rgba(30, 41, 59, 0.5);
    backdrop-filter: blur(8px);
    border-radius: 16px;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .related-items--loading {
    min-height: 120px;
  }

  .related-items__title {
    font-size: 18px;
    font-weight: 600;
    color: #ffffff;
    margin: 0 0 16px 0;
  }

  .related-items__loader {
    display: flex;
    justify-content: center;
    padding: 24px;
  }

  .related-items__grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 16px;
  }

  .related-items__card {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    background: rgba(15, 23, 42, 0.5);
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    text-decoration: none;
    transition: all 0.2s;
  }

  .related-items__card:hover {
    border-color: #a855f7;
    transform: translateY(-2px);
  }

  .related-items__image-wrapper {
    position: relative;
    width: 60px;
    height: 60px;
    border-radius: 8px;
    overflow: hidden;
    flex-shrink: 0;
  }

  .related-items__image {
    object-fit: cover;
  }

  .related-items__info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    overflow: hidden;
  }

  .related-items__name {
    color: #ffffff;
    font-size: 14px;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .related-items__name-alt {
    color: #64748b;
    font-size: 12px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  @media (max-width: 640px) {
    .related-items__grid {
      grid-template-columns: 1fr;
    }
  }
`;

// Compact version for inline display
interface RelatedItemBadgeProps {
  itemId: string;
  hobbySlug: string;
  hobbyCategory?: HobbyCategory;
  language?: 'en' | 'ja';
}

export function RelatedItemBadge({
  itemId,
  hobbySlug,
  language: _language = 'ja',
}: RelatedItemBadgeProps) {
  // This is a simpler component that just shows a link badge
  // It requires the parent to have already fetched the item data
  return (
    <Link
      href={`/hobbies/${hobbySlug}/${itemId}`}
      className="related-item-badge"
    >
      <style jsx>{`
        .related-item-badge {
          display: inline-flex;
          align-items: center;
          padding: 4px 12px;
          background: rgba(168, 85, 247, 0.1);
          border: 1px solid rgba(168, 85, 247, 0.3);
          border-radius: 9999px;
          color: #a855f7;
          text-decoration: none;
          font-size: 13px;
          transition: all 0.2s;
        }

        .related-item-badge:hover {
          background: rgba(168, 85, 247, 0.2);
          border-color: #a855f7;
        }
      `}</style>
    </Link>
  );
}
