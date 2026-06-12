'use client';

import React, { useEffect, useState } from 'react';
import PostListItem from '@/components/blog/PostListItem';
import * as postApi from '@/services/postsService';
import type { ListingPost } from '@/services/postsService';
import SuggestionBar from '@/components/blog/SuggestionBar';
import { useParams } from 'next/navigation';
import { usePosts } from '@/providers/PostsProvider';
import { useInView } from 'react-intersection-observer';
import { useTranslation } from 'react-i18next';
import { normalizeLanguage, type PostLanguage } from '@/lib/blog/postTranslations';
import styles from './category-post-page.module.css';

interface CategoryPostPageProps {
  initialCategory?: string;
  initialPosts?: ListingPost[];
  initialLastVisibleTimestamp?: number | null;
  initialHasMore?: boolean;
  initialLanguage?: PostLanguage;
}

const PAGE_LIMIT = 5;

const CATEGORY_LABELS: Record<string, string> = {
  all: 'blogPage.index.categories.all',
  technology: 'blogPage.index.categories.technology',
  life: 'blogPage.index.categories.life',
};

const titleCaseCategory = (value: string) =>
  value
    .split('-')
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');

const CategoryPostPage = ({
  initialCategory,
  initialPosts,
  initialLastVisibleTimestamp,
  initialHasMore,
  initialLanguage,
}: CategoryPostPageProps = {}) => {
  const { category: routeCategory } = useParams();
  const { t, i18n } = useTranslation();
  const language = normalizeLanguage(i18n.language);
  const category =
    initialCategory || (Array.isArray(routeCategory) ? routeCategory[0] : routeCategory || 'all');
  // Caches in PostsProvider are scoped by category + language so switching
  // locales doesn't pollute the cached list with posts from the wrong locale.
  const cacheKey = `${category}::${language}`;

  const {
    postsByCategory,
    setPostsByCategory,
    currentPageByCategory,
    setCurrentPageByCategory,
    scrollPosition,
    setScrollPosition,
    lastVisibleDocTimestamps,
    setLastVisibleDocTimestamps,
  } = usePosts();

  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(initialHasMore ?? true);

  const [ref, inView] = useInView({ threshold: 0.1, triggerOnce: false });
  const visiblePosts =
    postsByCategory[cacheKey] ||
    (initialCategory === category && initialLanguage === language ? initialPosts : undefined) ||
    [];
  const categoryLabel = CATEGORY_LABELS[category] ? t(CATEGORY_LABELS[category]) : titleCaseCategory(category);

  const fetchPosts = async () => {
    setIsLoading(true);
    try {
      const currentCategoryPage = (currentPageByCategory as Record<string, number>)[cacheKey] || 1;
      const result = await postApi.getPosts({
        category,
        isPublic: true,
        page: currentCategoryPage,
        limit: PAGE_LIMIT,
        lastVisibleTimestamp: lastVisibleDocTimestamps?.[cacheKey],
        language,
      });

      const fetchedPosts = result.posts || [];

      if (fetchedPosts.length === 0) {
        setHasMore(false);
      } else {
        const updatedPosts = [
          ...(postsByCategory[cacheKey] || []),
          ...fetchedPosts,
        ];
        setPostsByCategory(cacheKey, updatedPosts);
        setCurrentPageByCategory(cacheKey, currentCategoryPage + 1);
        const nextLastVisibleTimestamp = result.lastVisibleTimestamp;
        if (nextLastVisibleTimestamp != null) {
          setLastVisibleDocTimestamps((prev: Record<string, number>) => ({
            ...prev,
            [cacheKey]: nextLastVisibleTimestamp,
          }));
        }
      }
    } catch (error) {
      console.error('[blog] failed to fetch posts', error);
      setHasMore(false);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClickPost = () => {
    setScrollPosition(window.scrollY);
  };

  useEffect(() => {
    window.scrollTo(0, 0);

    const existing = postsByCategory[cacheKey];
    if (existing && existing.length > 0) {
      setHasMore(existing.length > 0);
      window.scrollTo(0, scrollPosition);
      return;
    }

    if (
      initialCategory === category &&
      initialLanguage === language &&
      initialPosts &&
      initialPosts.length > 0
    ) {
      setPostsByCategory(cacheKey, initialPosts);
      setCurrentPageByCategory(cacheKey, 2);
      if (initialLastVisibleTimestamp != null) {
        setLastVisibleDocTimestamps((prev: Record<string, number>) => ({
          ...prev,
          [cacheKey]: initialLastVisibleTimestamp,
        }));
      }
      setHasMore(initialHasMore ?? true);
      return;
    }

    setHasMore(true);
    fetchPosts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, language]);

  useEffect(() => {
    const handleScroll = () => {
      if (inView && !isLoading && hasMore) {
        fetchPosts();
      }
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, isLoading, hasMore, category, language]);

  return (
    <main className={styles.page}>
      <section className={styles.shell}>
        <header className={styles.hero}>
          <p className={styles.kicker}>{t('blogPage.index.kicker')}</p>
          <h1 className={styles.title}>{categoryLabel}</h1>
          <p className={styles.subtitle}>
            {t('blogPage.index.subtitle')}
          </p>
          <SuggestionBar activeTab={category} />
        </header>

        <div className={styles.postList}>
          {visiblePosts.map((item, index, arr) => {
            const isLoadMoreAnchor = arr.length - 3 === index;
            return (
              <PostListItem
                key={item.id}
                ref={isLoadMoreAnchor ? ref : undefined}
                id={item.id}
                title={item.title}
                body={item.body}
                isPublic={item.isPublic}
                created={item.created}
                lastUpdated={item.lastUpdated}
                category={item.category}
                image={item.image}
                language={item.language}
                handleClick={handleClickPost}
              />
            );
          })}
          {!isLoading && visiblePosts.length === 0 && (
            <div className={styles.emptyState} role="status">
              <h2>{t('blogPage.index.emptyTitle')}</h2>
              <p>{t('blogPage.index.emptyText')}</p>
            </div>
          )}
          {isLoading && (
            <div className={styles.loadingState} role="status">
              <span className={styles.loadingDot} aria-hidden="true" />
              {t('blogPage.index.loading')}
            </div>
          )}
        </div>
      </section>
    </main>
  );
};

export default CategoryPostPage;
