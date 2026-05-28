'use client';

import React, { createContext, useContext, useState, ReactNode } from 'react';
import type { ListingPost } from '@/services/postsService';

interface PostsContextType {
  postsByCategory: Record<string, ListingPost[]>;
  setPostsByCategory: (category: string, posts: ListingPost[]) => void;
  currentPageByCategory: Record<string, number>;
  setCurrentPageByCategory: (category: string, pageNum: number) => void;
  scrollPosition: number;
  setScrollPosition: React.Dispatch<React.SetStateAction<number>>;
  lastVisibleDocTimestamps: Record<string, number>;
  setLastVisibleDocTimestamps: React.Dispatch<React.SetStateAction<Record<string, number>>>;
}

const defaultValues: PostsContextType = {
  postsByCategory: {},
  setPostsByCategory: () => { },
  currentPageByCategory: {},
  setCurrentPageByCategory: () => { },
  scrollPosition: 0,
  setScrollPosition: () => { },
  lastVisibleDocTimestamps: {},
  setLastVisibleDocTimestamps: () => { }
};

const PostsContext = createContext<PostsContextType>(defaultValues);

export const usePosts = () => {
  return useContext(PostsContext);
};

interface PostsProviderProps {
  children: ReactNode;
}

export const PostsProvider = ({ children }: PostsProviderProps) => {
  const [postsByCategory, setInternalPostsByCategory] = useState<Record<string, ListingPost[]>>({});
  const [lastVisibleDocTimestamps, setLastVisibleDocTimestamps] = useState<Record<string, number>>({});
  const [currentPageByCategory, setCurrentPageByCategoryState] = useState<Record<string, number>>({});
  const [scrollPosition, setScrollPosition] = useState<number>(0);

  const setPostsByCategory = (category: string, posts: ListingPost[]) => {
    setInternalPostsByCategory((prevState) => ({
      ...prevState,
      [category]: posts
    }));
  };

  const setCurrentPageByCategory = (category: string, pageNum: number) => {
    setCurrentPageByCategoryState((prevState) => ({
      ...prevState,
      [category]: pageNum
    }));
  };

  return (
    <PostsContext.Provider value={{
      postsByCategory,
      setPostsByCategory,
      currentPageByCategory,
      setCurrentPageByCategory,
      scrollPosition,
      setScrollPosition,
      lastVisibleDocTimestamps,
      setLastVisibleDocTimestamps
    }}>
      {children}
    </PostsContext.Provider>
  );
};
