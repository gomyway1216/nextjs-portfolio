'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import PostListItem from '@/components/blog/PostListItem';
import type { PostLanguage } from '@/lib/blog/postTranslations';
import styles from './HomeBlogSection.module.css';

export interface HomeBlogPost {
  id: string;
  slug?: string;
  title: string;
  summary?: string;
  body: string;
  isPublic: boolean;
  category: string;
  tags: string[];
  image?: string;
  language: PostLanguage;
  availableLanguages: PostLanguage[];
  created: string;
  lastUpdated: string;
}

interface HomeBlogSectionProps {
  posts: HomeBlogPost[];
}

export default function HomeBlogSection({ posts }: HomeBlogSectionProps) {
  const { t } = useTranslation();
  const visiblePosts = posts.slice(0, 3);
  const handlePostClick = () => undefined;

  return (
    <section id="blog" className="section modern-section">
      <div className="container">
        <div className="title modern-title">
          <div className="modern-title__row">
            <h3>{t('home.sections.blog.title')}</h3>
            <Link className="modern-title__link" href="/blog">
              {t('home.sections.blog.viewAll')}
              <ArrowRight size={16} strokeWidth={2} aria-hidden="true" />
            </Link>
          </div>
          <p>{t('home.sections.blog.subtitle')}</p>
        </div>

        {visiblePosts.length > 0 ? (
          <div className={styles.grid}>
            {visiblePosts.map((post, index) => (
              <PostListItem
                key={post.id}
                id={post.id}
                slug={post.slug}
                title={post.title}
                summary={post.summary}
                body={post.body}
                isPublic={post.isPublic}
                created={post.created}
                lastUpdated={post.lastUpdated}
                category={post.category}
                tags={post.tags}
                image={post.image}
                language={post.language}
                index={index + 1}
                handleClick={handlePostClick}
              />
            ))}
          </div>
        ) : (
          <div className={styles.emptyState} role="status">
            <h4>{t('blogPage.index.emptyTitle')}</h4>
            <p>{t('blogPage.index.emptyText')}</p>
          </div>
        )}
      </div>
    </section>
  );
}
