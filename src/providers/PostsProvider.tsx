'use client';

import React, { createContext, useContext, useState } from 'react';
import PropTypes from 'prop-types';

const defaultValues: any = {
  postsByCategory: {},
  setPostsByCategory: () => { },
  currentPageByCategory: {},
  setCurrentPageByCategory: () => { },
  scrollPosition: 0,
  setScrollPosition: () => { },
  lastVisibleDocTimestamps: {},
  setLastVisibleDocTimestamps: () => { }
};

const PostsContext = createContext<any>(defaultValues);

export const usePosts = () => {
  return useContext(PostsContext);
};

export const PostsProvider = ({ children }: any) => {
  const [postsByCategory, setInternalPostsByCategory] = useState<any>({});
  const [lastVisibleDocTimestamps, setLastVisibleDocTimestamps] = useState<any>({});
  const [currentPageByCategory, setCurrentPageByCategoryState] = useState<any>({});
  const [scrollPosition, setScrollPosition] = useState<number>(0);

  const setPostsByCategory = (category: string, posts: any) => {
    setInternalPostsByCategory((prevState: any) => ({
      ...prevState,
      [category]: posts
    }));
  };

  const setCurrentPageByCategory = (category: string, pageNum: number) => {
    setCurrentPageByCategoryState((prevState: any) => ({
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

PostsProvider.propTypes = {
  children: PropTypes.node.isRequired
};
