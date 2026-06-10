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
  image: string;
}

interface RichTextDisplayProps {
  post: Post;
}

const RichTextDisplay = ({ post }: RichTextDisplayProps) => {
  const { title, body, created, category, image } = post;

  // Sanitize after mount: DOMPurify needs a real DOM, and setting state
  // in an effect keeps the SSR and first client render identical (no
  // hydration mismatch) if this component ever server-renders.
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
      </header>
      {image && (
        <figure className={styles.cover}>
          <Image src={image} alt="" width={1280} height={720} unoptimized />
        </figure>
      )}
      <div className={styles.body}
        dangerouslySetInnerHTML={{ __html: purifiedBody }} />
    </article>
  );
};

export default RichTextDisplay;
