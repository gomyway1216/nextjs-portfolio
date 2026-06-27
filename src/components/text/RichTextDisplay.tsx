'use client';
import * as util from '@/lib/utils/util';
import { sanitizeRichHtml } from '@/lib/sanitizeHtml';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import styles from './rich-text-display.module.scss';

interface Post {
  id: string;
  title: string;
  body: string;
  created: Parameters<typeof util.formatDate>[0];
  lastUpdated?: Parameters<typeof util.formatDate>[0];
  category: string;
  tags?: string[];
  image: string;
}

interface RichTextDisplayProps {
  post: Post;
}

const RichTextDisplay = ({ post }: RichTextDisplayProps) => {
  const { title, body, created, category, tags = [], image } = post;

  // Sanitize after mount: DOMPurify needs a real DOM, and this component
  // now server-renders (the post page passes a server-fetched post).
  // Header/cover SSR for crawlers; the body fills in on hydration.
  const [purifiedBody, setPurifiedBody] = useState('');
  useEffect(() => {
    setPurifiedBody(sanitizeRichHtml(body));
  }, [body]);

  return (
    <article className={styles.root}>
      <header className={styles.header}>
        <p className={styles.category}>{category.replace(/-/g, ' ')}</p>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.date}>{util.formatDate(created)}</p>
        {tags.length > 0 && (
          <div className={styles.tags} aria-label="Post tags">
            {tags.map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </div>
        )}
      </header>
      {image && (
        <figure className={styles.cover}>
          <Image src={image} alt={title} width={1280} height={720} unoptimized />
        </figure>
      )}
      <div className={styles.body}
        dangerouslySetInnerHTML={{ __html: purifiedBody }} />
    </article>
  );
};

export default RichTextDisplay;
