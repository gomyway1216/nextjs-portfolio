import { htmlToText } from 'html-to-text';
import { ArrowUpRight, CalendarDays } from 'lucide-react';
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
  index?: number;
  featured?: boolean;
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

const HTML_START_PATTERN = /^\s*<\/?(p|div|h[1-6]|ul|ol|li|strong|em|a|img|blockquote|pre|code|table|thead|tbody|tr|td|th|br|iframe)\b/i;

const markdownToPlainText = (value: string) => value
  .replace(/```[\s\S]*?```/g, ' ')
  .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
  .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
  .replace(/`([^`\n]+)`/g, '$1')
  .replace(/^#{1,6}\s+/gm, '')
  .replace(/^\s{0,3}>\s?/gm, '')
  .replace(/^\s*[-*+]\s+/gm, '')
  .replace(/^\s*\d+\.\s+/gm, '')
  .replace(/\*\*([^*\n]+)\*\*/g, '$1')
  .replace(/\*([^*\n]+)\*/g, '$1')
  .replace(/~~([^~\n]+)~~/g, '$1')
  .replace(/\s+/g, ' ')
  .trim();

const PostListItem = forwardRef<HTMLElement, PostListItemProps>(
  ({ id, title, body, lastUpdated, category, tags = [], image, language, index, featured = false, handleClick }, ref) => {
    const rawBodyText = HTML_START_PATTERN.test(body) ? htmlToText(body, { wordwrap: false }) : body;
    const bodyText = markdownToPlainText(rawBodyText);
    const excerptLength = featured ? 260 : 190;
    const excerpt = bodyText.length > excerptLength ? `${bodyText.slice(0, excerptLength).trim()}...` : bodyText;
    const categoryLabel = category.replace(/-/g, ' ');
    const displayIndex = index ? String(index).padStart(2, '0') : '01';
    const readLabel = language?.startsWith('ja') ? '読む' : 'Read';
    const openLabel = language?.startsWith('ja') ? `${title}を開く` : `Open ${title}`;

    return (
      <article
        ref={ref}
        className={styles.card}
        data-featured={featured ? 'true' : undefined}
      >
        <Link
          href={`/blog/${category}/${id}`}
          className={styles.cardButton}
          onClick={handleClick}
          aria-label={openLabel}
        >
          <span className={styles.index}>{displayIndex}</span>
          <div className={styles.content}>
            <div className={styles.meta}>
              <span className={styles.date}>
                <CalendarDays size={14} aria-hidden="true" />
                {formatDisplayDate(lastUpdated, language)}
              </span>
              <span>{categoryLabel}</span>
            </div>
            <h2 className={styles.title}>{title}</h2>
            <p className={styles.excerpt}>{excerpt || 'No summary available.'}</p>
            <div className={styles.footer}>
              {tags.length > 0 && (
                <div className={styles.tags} aria-label="Post tags">
                  {tags.slice(0, 4).map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </div>
              )}
              <span className={styles.readMore}>
                {readLabel}
                <ArrowUpRight size={16} aria-hidden="true" />
              </span>
            </div>
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
              <span>{categoryLabel.slice(0, 1).toUpperCase()}</span>
            </span>
          )}
        </Link>
      </article>
    );
  }
);

PostListItem.displayName = 'PostListItem';

export default PostListItem;
