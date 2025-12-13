'use client';

import type { HobbyItem, HobbyCategory } from '@/types/hobby';
import HobbyItemCard from './HobbyItemCard';

export type Language = 'en' | 'ja';

interface HobbyGridProps {
  items: HobbyItem[];
  hobby: HobbyCategory;
  loading?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
  language?: Language;
}

export default function HobbyGrid({
  items,
  hobby,
  loading,
  hasMore,
  onLoadMore,
  language = 'en',
}: HobbyGridProps) {
  if (items.length === 0 && !loading) {
    return (
      <div className="hobby-grid__empty">
        <p>{language === 'en' ? 'No items yet' : 'アイテムがありません'}</p>
      </div>
    );
  }

  return (
    <div className="hobby-grid">
      <div className="hobby-grid__items">
        {items.map((item) => (
          <HobbyItemCard key={item.id} item={item} hobby={hobby} language={language} />
        ))}
      </div>
      {loading && (
        <div className="hobby-grid__loading">
          <div className="hobby-grid__spinner" />
        </div>
      )}
      {hasMore && !loading && (
        <div className="hobby-grid__load-more">
          <button onClick={onLoadMore} className="hobby-grid__load-more-btn">
            Load More
          </button>
        </div>
      )}
    </div>
  );
}
