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
    <div className={styles.root}>
      <div className={styles.title}>{title}</div>
      <div className={styles.category}>{category}</div>
      <img src={image} alt="Post image" />
      <div className={styles.date}>{util.formatDate(created)}</div>
      <div className={styles.body}
        dangerouslySetInnerHTML={{ __html: purifiedBody }} />
    </div>
  );
};

export default RichTextDisplay;
