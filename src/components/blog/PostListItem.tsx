import { htmlToText } from 'html-to-text';
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
  image?: string;
  language?: string;
  handleClick: (id: string, category: string) => void;
}

const formatDisplayDate = (value?: string | Date) => {
  if (!value) return 'Recently updated';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return 'Recently updated';
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
};

const PostListItem = forwardRef<HTMLElement, PostListItemProps>(
  ({ id, title, body, lastUpdated, category, image, handleClick }, ref) => {
    const bodyText = htmlToText(body, { wordwrap: false }).replace(/\s+/g, ' ').trim();
    const excerpt = bodyText.length > 190 ? `${bodyText.slice(0, 190).trim()}...` : bodyText;
    const categoryLabel = category.replace(/-/g, ' ');

    return (
      <article
        ref={ref}
        className={styles.card}
      >
        <button
          type="button"
          className={styles.cardButton}
          onClick={() => handleClick(id, category)}
          aria-label={`Open ${title}`}
        >
          <div className={styles.content}>
            <div className={styles.meta}>
              <span>{formatDisplayDate(lastUpdated)}</span>
              <span>{categoryLabel}</span>
            </div>
            <h2 className={styles.title}>{title}</h2>
            <p className={styles.excerpt}>{excerpt || 'No summary available.'}</p>
          </div>

          {image ? (
            <span className={styles.thumbnail}>
              <img
                src={image}
                alt=""
                loading="lazy"
              />
            </span>
          ) : (
            <span className={styles.thumbnailPlaceholder} aria-hidden="true">
              {categoryLabel.slice(0, 1).toUpperCase()}
            </span>
          )}
        </button>
      </article>
    );
  }
);

PostListItem.displayName = 'PostListItem';

export default PostListItem;
