import { htmlToText } from 'html-to-text';
import Image from 'next/image';
import Link from 'next/link';
import { forwardRef } from 'react';
import styles from './post-list-item.module.css';

interface PostListItemProps {
  id: string;
  title: string;
  body: string;
  isPublic?: boolean;
  created?: string | Date;
  lastUpdated: string | Date;
  category: string;
  tags?: string[];
  image?: string;
  language?: string;
  handleClick: () => void;
}

const formatDisplayDate = (value?: string | Date, language?: string) => {
  if (!value) return 'Recently updated';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return 'Recently updated';
  const locale = language?.startsWith('ja') ? 'ja-JP' : 'en';
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
};

const PostListItem = forwardRef<HTMLElement, PostListItemProps>(
  ({ id, title, body, lastUpdated, category, tags = [], image, language, handleClick }, ref) => {
    const bodyText = htmlToText(body, { wordwrap: false }).replace(/\s+/g, ' ').trim();
    const excerpt = bodyText.length > 190 ? `${bodyText.slice(0, 190).trim()}...` : bodyText;
    const categoryLabel = category.replace(/-/g, ' ');

    return (
      <article
        ref={ref}
        className={styles.card}
      >
        <Link
          href={`/blog/${category}/${id}`}
          className={styles.cardButton}
          onClick={handleClick}
          aria-label={`Open ${title}`}
        >
          <div className={styles.content}>
            <div className={styles.meta}>
              <span>{formatDisplayDate(lastUpdated, language)}</span>
              <span>{categoryLabel}</span>
            </div>
            <h2 className={styles.title}>{title}</h2>
            <p className={styles.excerpt}>{excerpt || 'No summary available.'}</p>
            {tags.length > 0 && (
              <div className={styles.tags} aria-label="Post tags">
                {tags.slice(0, 4).map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
            )}
          </div>

          {image ? (
            <span className={styles.thumbnail}>
              <Image
                src={image}
                alt=""
                width={128}
                height={128}
                unoptimized
              />
            </span>
          ) : (
            <span className={styles.thumbnailPlaceholder} aria-hidden="true">
              {categoryLabel.slice(0, 1).toUpperCase()}
            </span>
          )}
        </Link>
      </article>
    );
  }
);

PostListItem.displayName = 'PostListItem';

export default PostListItem;
