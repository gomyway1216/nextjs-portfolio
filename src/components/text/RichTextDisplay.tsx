'use client';
import * as util from '@/lib/utils/util';
import DOMPurify from 'dompurify';
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

  const purifiedBody = DOMPurify.sanitize(body, {
    ADD_TAGS: ['iframe'],
    ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'scrolling']
  });

  return (
    <article className={styles.root}>
      <header className={styles.header}>
        <p className={styles.category}>{category.replace(/-/g, ' ')}</p>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.date}>{util.formatDate(created)}</p>
      </header>
      {image && (
        <figure className={styles.cover}>
          <img src={image} alt="" />
        </figure>
      )}
      <div className={styles.body}
        dangerouslySetInnerHTML={{ __html: purifiedBody }} />
    </article>
  );
};

export default RichTextDisplay;
