'use client';

import PostLikeButton from '@/components/blog/PostLikeButton';
import RelatedPosts from '@/components/blog/RelatedPosts';
import RichTextDisplay from '@/components/text/RichTextDisplay';
import { usePostViewBeacon } from '@/hooks/usePostViewBeacon';
import { normalizeLanguage, pickTranslation, type PostLanguage } from '@/lib/blog/postTranslations';
import { useAuth } from '@/providers/AuthProvider';
import type { DetailPost } from '@/services/postsService';
import * as postApi from '@/services/postsService';
import { ArrowLeft, Edit3 } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import BlogPostSkeleton from './BlogPostSkeleton';
import styles from './blog-post.module.css';

interface PostPageProps {
  /** Server-fetched public post; null/undefined falls back to client fetch. */
  initialPost?: DetailPost | null;
  /**
   * Pin the displayed translation regardless of the i18n cookie. Set by
   * the language-pinned /ja/... routes so one URL always means one
   * language (what hreflang promises crawlers).
   */
  forcedLanguage?: PostLanguage;
}

const PostPage = ({ initialPost, forcedLanguage }: PostPageProps) => {
  const { category: routeCategory, id: routeId } = useParams();
  const [post, setPost] = useState<DetailPost | null>(initialPost ?? null);
  const [isLoading, setIsLoading] = useState(!initialPost);
  const { isAdmin } = useAuth();
  const { t, i18n } = useTranslation();
  const activeLanguage = forcedLanguage ?? normalizeLanguage(i18n.language);

  const _category = Array.isArray(routeCategory) ? routeCategory[0] : routeCategory || '';
  const id = Array.isArray(routeId) ? routeId[0] : routeId || '';

  useEffect(() => {
    // Server already delivered the post (public path) — skip the refetch.
    // Private posts arrive with initialPost=null and load here with the
    // signed-in admin's token.
    if (initialPost) return;

    let cancelled = false;
    (async () => {
      if (!id) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        const p = await postApi.getPostById(id);
        if (!cancelled) setPost(p);
      } catch (error) {
        console.error('[blog] failed to load post', error);
        if (!cancelled) setPost(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, initialPost]);

  // Count anonymous reads of public posts only — the admin previewing
  // their own writing shouldn't move the number.
  usePostViewBeacon(post?.id, !!post && post.isPublic && !isAdmin);

  const router = useRouter();

  // Server-side the /ja route redirects posts without a Japanese
  // translation, but the client-fetch fallback (private posts, or a
  // failed server fetch) can still land one here — and pickTranslation
  // would quietly render English under the ja URL. Enforce the route
  // contract on the client too.
  useEffect(() => {
    if (forcedLanguage !== 'ja' || !post) return;
    if (!post.availableLanguages.includes('ja')) {
      router.replace(`/blog/${encodeURIComponent(post.category)}/${encodeURIComponent(post.id)}`);
    }
  }, [forcedLanguage, post, router]);

  // Keep the URL and the displayed language in sync when the reader
  // actively flips the global toggle: /ja → bare URL on switching to
  // English, bare URL → /ja on switching to Japanese (when a Japanese
  // translation exists). Listening to the change event (not the current
  // value) matters: someone landing on either URL from search with the
  // "other" cookie must NOT be bounced off the page they chose.
  useEffect(() => {
    const handleLanguageChanged = (lng: string) => {
      if (!post) return;
      const language = normalizeLanguage(lng);
      const barePath = `/blog/${encodeURIComponent(post.category)}/${encodeURIComponent(post.id)}`;

      if (forcedLanguage === 'ja') {
        if (language === 'en' && post.availableLanguages.includes('en')) {
          router.push(barePath);
        }
        return;
      }

      if (language === 'ja' && post.availableLanguages.includes('ja')) {
        router.push(`/ja${barePath}`);
      }
    };

    i18n.on('languageChanged', handleLanguageChanged);
    return () => {
      i18n.off('languageChanged', handleLanguageChanged);
    };
  }, [forcedLanguage, i18n, post, router]);

  const view = useMemo(() => {
    if (!post) return null;
    const picked = pickTranslation(post.translations, activeLanguage);
    if (!picked) return null;
    return {
      title: picked.translation.title,
      body: picked.translation.body,
      language: picked.language,
    };
  }, [post, activeLanguage]);

  if (isLoading) {
    return <BlogPostSkeleton label={t('blogPage.post.loading')} />;
  }

  if (!post || !view) {
    return (
      <main className={styles.page}>
        <div className={styles.shell}>
          <div className={styles.statusPanel}>
            <h1>{t('blogPage.post.notFoundTitle')}</h1>
            <p>{t('blogPage.post.notFoundText')}</p>
            <Link href={`/blog/${_category || 'all'}`} className={styles.backLink}>
              <ArrowLeft aria-hidden="true" size={16} strokeWidth={2} />
              {t('blogPage.post.backToBlog')}
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const backCategory = post.category || _category || 'all';
  const categoryLabel = post.category ? post.category.replace(/-/g, ' ') : '';

  // Cross-link to the same article's other-language URL when that
  // translation exists. The label is deliberately written in the target
  // language — it's addressed to the reader who wants that language.
  const postPath = `/blog/${encodeURIComponent(post.category)}/${encodeURIComponent(post.id)}`;
  const languageSwitch =
    forcedLanguage === 'ja'
      ? post.availableLanguages.includes('en')
        ? { href: postPath, label: 'Read in English' }
        : null
      : view.language === 'en' && post.availableLanguages.includes('ja')
        ? { href: `/ja${postPath}`, label: '日本語版を読む' }
        : null;

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <div className={styles.toolbar}>
          <Link href={`/blog/${backCategory}`} className={styles.backLink}>
            <ArrowLeft aria-hidden="true" size={16} strokeWidth={2} />
            {t('blogPage.post.backToBlog')}
          </Link>
          {languageSwitch && (
            <Link href={languageSwitch.href} className={styles.langSwitchLink}>
              {languageSwitch.label}
            </Link>
          )}
          {categoryLabel && <span className={styles.categoryPill}>{categoryLabel}</span>}
        </div>
        <RichTextDisplay
          showCategory={false}
          post={{
            id: post.id,
            title: view.title,
            body: view.body,
            created: post.created,
            lastUpdated: post.lastUpdated,
            category: post.category,
            tags: post.tags,
            image: post.image || '',
          }}
        />
        <PostLikeButton postId={post.id} enabled={post.isPublic} />
        <RelatedPosts ids={post.relatedPostIds} />
        {isAdmin && (
          <div className={styles.adminActions}>
            <Link href="/admin#posts" className={styles.adminEditLink}>
              <Edit3 aria-hidden="true" size={14} strokeWidth={2} />
              {t('blogPage.post.edit')}
            </Link>
          </div>
        )}
      </div>
    </main>
  );
};

export default PostPage;
