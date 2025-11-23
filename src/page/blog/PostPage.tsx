'use client';

import React, { useEffect, useState } from 'react';
import * as postApi from '@/services/postsService';
import RichTextDisplay from '@/components/text/RichTextDisplay';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/providers/AuthProvider';

const PostPage = () => {
  const { category: routeCategory, id: routeId } = useParams();
  const [post, setPost] = useState<any>();
  const { currentUser } = useAuth();
  const router = useRouter();

  const category = Array.isArray(routeCategory) ? routeCategory[0] : routeCategory || '';
  const id = Array.isArray(routeId) ? routeId[0] : routeId || '';

  const getPost = async () => {
    const p = await postApi.getPostByCategory(id, category);
    setPost(p);
  };

  useEffect(() => {
    getPost();
  }, []);

  const handleEdit = () => {
    router.push(`/blog/${category}/${id}/edit`);
  };


  if (!post) {
    return (
      <h1>Post does not exist!</h1>
    );
  } else {
    return (
      <div>
        {currentUser && <Button onClick={handleEdit}>EDIT</Button>}
        <RichTextDisplay post={post} />
      </div>
    );
  }
};

export default PostPage;
