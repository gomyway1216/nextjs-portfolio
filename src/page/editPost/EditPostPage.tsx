'use client';

import React, { FC } from 'react';
import * as api from '@/services/postsService';
import { useParams } from 'next/navigation';
import PostEditor from '@/components/editPost/PostEditor';

const EditPostPage = () => {
  const { category: routeCategory, id: routeId } = useParams();
  const category = Array.isArray(routeCategory) ? routeCategory[0] : routeCategory;
  const id = Array.isArray(routeId) ? routeId[0] : routeId;

  return (
    <PostEditor
      category={category}
      postId={id}
      getPost={api.getPostByCategory}
      createPost={api.createPost}
      updatePost={api.updatePost}
      deletePost={api.deletePostByCategory}
    />
  );
};

export default EditPostPage;
