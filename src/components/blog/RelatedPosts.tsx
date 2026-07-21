'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { normalizeLanguage } from '@/lib/blog/postTranslations';
import { getRelatedPosts, type RelatedPostSummary } from '@/services/postsService';
import styles from './related-posts.module.css';

interface RelatedPostsProps {
  /** relatedPostIds of the post being read; empty/undefined renders nothing. */
  ids?: string[];
}

/**
 * "Related posts" strip under an article. Titles come from a lightweight
 * summary endpoint (no bodies), so hand-picked links stay in sync with the
 * linked posts' current titles and the reader's language. Private or
 * deleted targets are dropped server-side, so a stale id simply vanishes
 * instead of rendering a dead link.
 */
const RelatedPosts = ({ ids }: RelatedPostsProps) => {
  const { t, i18n } = useTranslation();
  const language = normalizeLanguage(i18n.language);
  const [posts, setPosts] = useState<RelatedPostSummary[]>([]);

  const idsKey = (ids || []).join(',');

  useEffect(() => {
    if (!idsKey) {
      setPosts([]);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const summaries = await getRelatedPosts(idsKey.split(','), language);
        if (!cancelled) setPosts(summaries);
      } catch (error) {
        // A broken related strip should never take down the article.
        console.error('[blog] failed to load related posts', error);
        if (!cancelled) setPosts([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [idsKey, language]);

  if (posts.length === 0) return null;

  return (
    <nav className={styles.related} aria-label={t('blogPage.post.related')}>
      <h2 className={styles.heading}>{t('blogPage.post.related')}</h2>
      <ul className={styles.list}>
        {posts.map((post) => (
          <li key={post.id}>
            <Link
              href={`/blog/${encodeURIComponent(post.category)}/${encodeURIComponent(post.slug ?? post.id)}`}
              className={styles.card}
            >
              <span className={styles.cardCategory}>{post.category.replace(/-/g, ' ')}</span>
              <span className={styles.cardTitle}>{post.title}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
};

export default RelatedPosts;
