'use client';

import React, { FC } from 'react';
import * as api from '@/services/postsService';
import { useParams } from 'next/navigation';
import PostEditor from '@/components/editPost/PostEditor';

const EditPostPage = () => {
  const { category: routeCategory, id: routeId } = useParams();
  const category = Array.isArray(routeCategory) ? routeCategory[0] : routeCategory;
  const id = Array.isArray(routeId) ? routeId[0] : routeId;

  // Wrapper functions to adapt the API to PostEditor's expected interface
  const handleUpdatePost = async (post: any) => {
    if (!id || !category) throw new Error('Missing id or category');
    await api.updatePost(id, category, post);
  };

  return (
    <PostEditor
      category={category}
      postId={id}
      getPost={api.getPostByCategory}
      createPost={api.createPost}
      updatePost={handleUpdatePost}
      deletePost={api.deletePostByCategory}
    />
  );
};

export default EditPostPage;
