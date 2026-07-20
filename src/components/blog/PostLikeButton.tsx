'use client';

import { Heart } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getPostLikeCount, setPostLike } from '@/services/postsService';
import styles from './post-like-button.module.css';

interface PostLikeButtonProps {
  postId: string;
  /** Only public posts accept likes; hide the button otherwise. */
  enabled: boolean;
}

const likedKey = (postId: string) => `blog-post-liked-${postId}`;

function readLiked(postId: string): boolean {
  try {
    return localStorage.getItem(likedKey(postId)) === '1';
  } catch {
    return false;
  }
}

function writeLiked(postId: string, liked: boolean): void {
  try {
    if (liked) localStorage.setItem(likedKey(postId), '1');
    else localStorage.removeItem(likedKey(postId));
  } catch {
    // localStorage unavailable: the toggle still works for this pageview.
  }
}

/**
 * Anonymous like button — no account needed. "Has this reader liked it"
 * lives in localStorage; the server only keeps the total. Optimistic UI:
 * the count moves immediately and rolls back if the request fails.
 */
const PostLikeButton = ({ postId, enabled }: PostLikeButtonProps) => {
  const { t } = useTranslation();
  const [liked, setLiked] = useState(false);
  const [count, setCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  // Once the reader has toggled, the initial count fetch is stale — don't
  // let a slow response overwrite the optimistic/server value.
  const hasInteracted = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    setLiked(readLiked(postId));

    let cancelled = false;
    getPostLikeCount(postId)
      .then((n) => {
        if (!cancelled && !hasInteracted.current) setCount(n);
      })
      .catch(() => {
        // Leave the count hidden; the button still works.
      });
    return () => {
      cancelled = true;
    };
  }, [postId, enabled]);

  if (!enabled) return null;

  const toggle = async () => {
    if (busy) return;
    hasInteracted.current = true;
    const next = !liked;

    // Optimistic flip
    setBusy(true);
    setLiked(next);
    writeLiked(postId, next);
    setCount((c) => (c === null ? c : Math.max(0, c + (next ? 1 : -1))));

    try {
      const serverCount = await setPostLike(postId, next ? 'like' : 'unlike');
      setCount(serverCount);
    } catch {
      // Roll back on failure
      setLiked(!next);
      writeLiked(postId, !next);
      setCount((c) => (c === null ? c : Math.max(0, c + (next ? -1 : 1))));
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={liked}
      aria-label={liked ? t('blogPage.post.unlike') : t('blogPage.post.like')}
      className={`${styles.likeButton} ${liked ? styles.liked : ''}`}
    >
      <Heart
        aria-hidden="true"
        size={16}
        strokeWidth={2}
        fill={liked ? 'currentColor' : 'none'}
      />
      <span>{liked ? t('blogPage.post.liked') : t('blogPage.post.like')}</span>
      {count !== null && <span className={styles.count}>{count.toLocaleString()}</span>}
    </button>
  );
};

export default PostLikeButton;
