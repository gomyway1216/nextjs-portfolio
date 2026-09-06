'use client';

import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { categoryDisplayLabel } from '@/lib/blog/categoryLabelKeys';
import type { MorePost } from '@/lib/blog/morePosts';
import styles from './related-posts.module.css';

interface MoreFromCategoryProps {
  category: string;
  /** Server-selected posts (current + hand-picked related already removed). */
  posts: MorePost[];
}

const formatDate = (value: string, language: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(language.startsWith('ja') ? 'ja-JP' : 'en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
};

/**
 * "More in {category}" strip. Unlike RelatedPosts (hand-picked ids, loaded
 * client-side) this arrives server-rendered, so every article links onward
 * even when nothing was curated — and crawlers see the links too.
 */
const MoreFromCategory = ({ category, posts }: MoreFromCategoryProps) => {
  const { t, i18n } = useTranslation();
  if (posts.length === 0) return null;

  const heading = t('blogPage.post.moreFrom', {
    category: categoryDisplayLabel(category, t),
  });

  return (
    <nav className={styles.related} aria-label={heading}>
      <h2 className={styles.heading}>{heading}</h2>
      <ul className={styles.list}>
        {posts.map((post) => (
          <li key={post.id}>
            <Link
              href={`/blog/${encodeURIComponent(post.category)}/${encodeURIComponent(post.slug)}`}
              prefetch
              className={styles.card}
            >
              <span className={styles.cardCategory}>{formatDate(post.created, i18n.language)}</span>
              <span className={styles.cardTitle}>{post.title}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
};

export default MoreFromCategory;
