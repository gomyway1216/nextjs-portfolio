'use client';

import React, { useEffect, useState } from 'react';
import PostListItem from '@/components/blog/PostListItem';
import * as postApi from '@/services/postsService';
import SuggestionBar from '@/components/blog/SuggestionBar';
import { useParams, useRouter } from 'next/navigation';
import { usePosts } from '@/providers/PostsProvider';
import { useInView } from 'react-intersection-observer';

interface InitialPost {
  id: string;
  title: string;
  body: string;
  isPublic: boolean;
  category: string;
  image?: string;
  language?: string;
  created: string;
  lastUpdated: string;
}

interface CategoryPostPageProps {
  initialCategory?: string;
  initialPosts?: InitialPost[];
  initialLastVisibleTimestamp?: number | null;
  initialHasMore?: boolean;
}

const PAGE_LIMIT = 5;

const CategoryPostPage = ({
  initialCategory,
  initialPosts,
  initialLastVisibleTimestamp,
  initialHasMore,
}: CategoryPostPageProps = {}) => {
  const { category: routeCategory } = useParams();
  const router = useRouter();
  const category =
    initialCategory || (Array.isArray(routeCategory) ? routeCategory[0] : routeCategory || 'all');

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
  const [tabValue, setTabValue] = useState(category);

  const [ref, inView] = useInView({ threshold: 0.1, triggerOnce: false });

  const fetchPosts = async () => {
    setIsLoading(true);
    const currentCategoryPage = (currentPageByCategory as Record<string, number>)[category] || 1;
    const result = await postApi.getPosts({
      category,
      isPublic: true,
      page: currentCategoryPage,
      limit: PAGE_LIMIT,
      lastVisibleTimestamp: lastVisibleDocTimestamps?.[category],
    });

    const fetchedPosts = result.posts || [];

    if (fetchedPosts.length === 0) {
      setHasMore(false);
    } else {
      const updatedPosts = [
        ...((postsByCategory as Record<string, unknown[]>)[category] || []),
        ...fetchedPosts,
      ];
      setPostsByCategory(category, updatedPosts);
      setCurrentPageByCategory(category, currentCategoryPage + 1);
    }

    setIsLoading(false);
  };

  const handleClickPost = (id: string, postCategory: string) => {
    setScrollPosition(window.scrollY);
    router.push(`/blog/${postCategory}/${id}`);
  };

  // On category change: prefer (a) existing context data, then
  // (b) server-rendered initial data (SSR cold-load case), and only
  // fall back to a client-side fetch if neither is available.
  useEffect(() => {
    window.scrollTo(0, 0);

    const existing = (postsByCategory as Record<string, InitialPost[]>)[category];
    if (existing && existing.length > 0) {
      setHasMore(existing.length > 0);
      window.scrollTo(0, scrollPosition);
      return;
    }

    if (
      initialCategory === category &&
      initialPosts &&
      initialPosts.length > 0
    ) {
      setPostsByCategory(category, initialPosts);
      setCurrentPageByCategory(category, 2);
      if (initialLastVisibleTimestamp != null) {
        setLastVisibleDocTimestamps((prev: Record<string, number>) => ({
          ...prev,
          [category]: initialLastVisibleTimestamp,
        }));
      }
      setHasMore(initialHasMore ?? true);
      return;
    }

    setHasMore(true);
    fetchPosts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  // Infinite scroll
  useEffect(() => {
    const handleScroll = () => {
      if (inView && !isLoading && hasMore) {
        fetchPosts();
      }
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, isLoading, hasMore, category]);

  return (
    <div className="container" style={{ display: 'flex', flexDirection: 'row' }}>
      <div
        className="postsList"
        style={{
          borderRight: 'solid 1px rgba(242, 242, 242, 1)',
          width: '69%',
          paddingTop: '3vh',
          minHeight: '97vh',
          display: 'flex',
          flexDirection: 'column',
          gap: '38px',
          marginRight: 'auto',
        }}
      >
        <SuggestionBar activeTab={tabValue} setActiveTab={setTabValue} />
        <div
          className="inner_container_main"
          style={{
            width: '90%',
            marginRight: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '30px',
            marginTop: '22px',
          }}
        >
          {(
            ((postsByCategory as Record<string, InitialPost[]>)[category] as InitialPost[]) ||
            (initialCategory === category ? initialPosts : undefined) ||
            []
          ).map((item, index, arr) => {
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
          {isLoading && <p>Loading more posts...</p>}
        </div>
      </div>
      <div
        className="rightbar"
        style={{
          width: '31%',
          paddingTop: '3vh',
          display: 'flex',
          flexDirection: 'column',
          gap: '38px',
        }}
      >
        Placeholder for rightbar
      </div>
    </div>
  );
};

export default CategoryPostPage;
