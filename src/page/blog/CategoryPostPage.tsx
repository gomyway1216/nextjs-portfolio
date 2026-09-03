'use client';

import React, { useEffect, useState } from 'react';
import PageIntro from '@/components/common/PageIntro';
import PostListItem from '@/components/blog/PostListItem';
import * as postApi from '@/services/postsService';
import type { ListingPost } from '@/services/postsService';
import SuggestionBar from '@/components/blog/SuggestionBar';
import LinkedErrorMessage from '@/components/common/LinkedErrorMessage';
import { useParams } from 'next/navigation';
import { useAuth } from '@/providers/AuthProvider';
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
  'applied-algorithms': 'blogPage.index.categories.appliedAlgorithms',
  'system-design': 'blogPage.index.categories.systemDesign',
  'engineering-practices': 'blogPage.index.categories.engineeringPractices',
  'fintech-payments': 'blogPage.index.categories.fintechPayments',
  career: 'blogPage.index.categories.career',
  technology: 'blogPage.index.categories.technology',
  life: 'blogPage.index.categories.life',
};

const titleCaseCategory = (value: string) =>
  value
    .split('-')
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');

const LoadingPostSkeleton = () => (
  <article className={styles.loadingCard} aria-hidden="true">
    <div className={styles.loadingMedia} />
    <div className={styles.loadingIndex} />
    <div className={styles.loadingMeta} />
    <div className={styles.loadingTitle} />
    <div className={styles.loadingTitleShort} />
    <div className={styles.loadingExcerpt} />
    <div className={styles.loadingExcerptShort} />
  </article>
);

const CategoryPostPage = ({
  initialCategory,
  initialPosts,
  initialLastVisibleTimestamp,
  initialHasMore,
  initialLanguage,
}: CategoryPostPageProps = {}) => {
  const { category: routeCategory } = useParams();
  const { isAdmin } = useAuth();
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

  const hasUsableInitialPage =
    initialCategory === category &&
    initialLanguage === language &&
    Array.isArray(initialPosts) &&
    (initialPosts.length > 0 || initialHasMore === false);
  const hasCachedPosts = (postsByCategory[cacheKey]?.length ?? 0) > 0;
  const [isLoading, setIsLoading] = useState(() => !hasCachedPosts && !hasUsableInitialPage);
  const [hasMore, setHasMore] = useState(initialHasMore ?? true);
  const [previousCacheKey, setPreviousCacheKey] = useState(cacheKey);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Keep the first render after a category/language switch in loading mode,
  // so the empty state cannot flash before the fetch effect runs.
  if (cacheKey !== previousCacheKey) {
    setPreviousCacheKey(cacheKey);
    setIsLoading(!hasCachedPosts && !hasUsableInitialPage);
    setHasMore(hasUsableInitialPage ? (initialHasMore ?? true) : true);
  }

  const [ref, inView] = useInView({ threshold: 0.1, triggerOnce: false });
  const visiblePosts =
    postsByCategory[cacheKey] ||
    (initialCategory === category && initialLanguage === language ? initialPosts : undefined) ||
    [];
  const categoryLabel = CATEGORY_LABELS[category] ? t(CATEGORY_LABELS[category]) : titleCaseCategory(category);
  const showLoadingSkeletons = isLoading;
  const skeletonCount = visiblePosts.length === 0 ? PAGE_LIMIT : Math.min(3, PAGE_LIMIT);

  const fetchPosts = async () => {
    setIsLoading(true);
    setFetchError(null);
    try {
      const currentCategoryPage = (currentPageByCategory as Record<string, number>)[cacheKey] || 1;
      const result = await postApi.getPosts({
        category,
        isPublic: true,
        page: currentCategoryPage,
        limit: PAGE_LIMIT,
        lastVisibleTimestamp: lastVisibleDocTimestamps?.[cacheKey],
        language,
        includeAdminDiagnostics: isAdmin,
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
      setFetchError(error instanceof Error ? error.message : String(error));
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
      // Provider state is the navigation cache; applying it here restores
      // the previous list and scroll position after returning from a post.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHasMore(existing.length > 0);
      setFetchError(null);
      setIsLoading(false);
      window.scrollTo(0, scrollPosition);
      return;
    }

    if (
      initialCategory === category &&
      initialLanguage === language &&
      Array.isArray(initialPosts) &&
      (initialPosts.length > 0 || initialHasMore === false)
    ) {
      setPostsByCategory(cacheKey, initialPosts);
      setCurrentPageByCategory(cacheKey, 2);
      setFetchError(null);
      if (initialLastVisibleTimestamp != null) {
        setLastVisibleDocTimestamps((prev: Record<string, number>) => ({
          ...prev,
          [cacheKey]: initialLastVisibleTimestamp,
        }));
      }
      setHasMore(initialHasMore ?? true);
      setIsLoading(false);
      return;
    }

    if (!hasUsableInitialPage) {
      setHasMore(true);
      fetchPosts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, language, isAdmin]);

  useEffect(() => {
    const handleScroll = () => {
      if (inView && !isLoading && hasMore) {
        fetchPosts();
      }
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, isLoading, hasMore, category, language, isAdmin]);

  return (
    <main className={styles.page}>
      <section className={styles.shell}>
        <PageIntro
          kicker={t('blogPage.index.kicker')}
          title={categoryLabel}
          subtitle={t('blogPage.index.subtitle')}
          accent="#16a34a"
          aside={(
            <ul className={styles.heroSignals} aria-label={t('blogPage.index.signalLabel')}>
              <li>{t('blogPage.index.signals.systems')}</li>
              <li>{t('blogPage.index.signals.product')}</li>
              <li>{t('blogPage.index.signals.craft')}</li>
            </ul>
          )}
        >
          <SuggestionBar activeTab={category} />
        </PageIntro>

        <div className={styles.listHeader}>
          <div>
            <p>{t('blogPage.index.feedKicker')}</p>
            <h2>{t('blogPage.index.feedTitle', { category: categoryLabel })}</h2>
          </div>
          <span>{t('blogPage.index.loadedCount', { count: visiblePosts.length })}</span>
        </div>

        <div className={styles.postList}>
          {visiblePosts.map((item, index, arr) => {
            const isLoadMoreAnchor = arr.length - 3 === index;
            return (
              <PostListItem
                key={item.id}
                ref={isLoadMoreAnchor ? ref : undefined}
                id={item.id}
                slug={item.slug}
                title={item.title}
                summary={item.summary}
                body={item.body}
                isPublic={item.isPublic}
                created={item.created}
                lastUpdated={item.lastUpdated}
                category={item.category}
                tags={item.tags}
                image={item.image}
                language={item.language}
                index={index + 1}
                handleClick={handleClickPost}
              />
            );
          })}
          {!isLoading && fetchError && (
            <div className={`${styles.emptyState} ${styles.errorState}`}>
              <h2>{t('blogPage.index.errorTitle')}</h2>
              <p>{t(isAdmin ? 'blogPage.index.adminErrorText' : 'blogPage.index.errorText')}</p>
              {isAdmin && (
                <LinkedErrorMessage message={fetchError} className={styles.errorMessage} />
              )}
            </div>
          )}
          {!isLoading && !fetchError && visiblePosts.length === 0 && (
            <div className={styles.emptyState} role="status">
              <h2>{t('blogPage.index.emptyTitle')}</h2>
              <p>{t('blogPage.index.emptyText')}</p>
            </div>
          )}
          {showLoadingSkeletons && (
            <>
              <span className={styles.srOnly} role="status">
                {t('blogPage.index.loading')}
              </span>
              {Array.from({ length: skeletonCount }, (_, index) => (
                <LoadingPostSkeleton key={`loading-${index}`} />
              ))}
            </>
          )}
        </div>
      </section>
    </main>
  );
};

export default CategoryPostPage;
