'use client';

import RichTextDisplay from '@/components/text/RichTextDisplay';
import { Button } from '@/components/ui/button';
import {
  normalizeLanguage,
  pickTranslation,
  type PostLanguage,
} from '@/lib/blog/postTranslations';
import { useAuth } from '@/providers/AuthProvider';
import type { DetailPost } from '@/services/postsService';
import * as postApi from '@/services/postsService';
import { ArrowLeft, Edit3 } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './blog-post.module.css';

interface PostPageProps {
  /** Server-fetched public post; null/undefined falls back to client fetch. */
  initialPost?: DetailPost | null;
}

const PostPage = ({ initialPost }: PostPageProps) => {
  const { category: routeCategory, id: routeId } = useParams();
  const [post, setPost] = useState<DetailPost | null>(initialPost ?? null);
  const [isLoading, setIsLoading] = useState(!initialPost);
  const { currentUser } = useAuth();
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const activeLanguage = normalizeLanguage(i18n.language);

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

  const handleEdit = () => {
    router.push('/admin#posts');
  };

  const handleSwitchLanguage = (lang: PostLanguage) => {
    if (lang === activeLanguage) return;
    i18n.changeLanguage(lang);
  };

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
    return (
      <main className={styles.page}>
        <div className={styles.shell}>
          <div className={styles.statusPanel}>
            <span className={styles.statusDot} aria-hidden="true" />
            {t('blogPage.post.loading')}
          </div>
        </div>
      </main>
    );
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

  const available = post.availableLanguages || [];
  const isBilingual = available.length > 1;
  const backCategory = post.category || _category || 'all';

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <div className={styles.toolbar}>
          <Link href={`/blog/${backCategory}`} className={styles.backLink}>
            <ArrowLeft aria-hidden="true" size={16} strokeWidth={2} />
            {t('blogPage.post.backToBlog')}
          </Link>
          <div className={styles.actions}>
            {isBilingual && (
              <LanguageToggle
                available={available}
                active={view.language}
                onChange={handleSwitchLanguage}
              />
            )}
            {currentUser && (
              <Button onClick={handleEdit} className={styles.editButton}>
                <Edit3 aria-hidden="true" size={15} strokeWidth={2} />
                {t('blogPage.post.edit')}
              </Button>
            )}
          </div>
        </div>
        <RichTextDisplay
          post={{
            id: post.id,
            title: view.title,
            body: view.body,
            created: post.created,
            lastUpdated: post.lastUpdated,
            category: post.category,
            image: post.image || '',
          }}
        />
      </div>
    </main>
  );
};

interface LanguageToggleProps {
  available: PostLanguage[];
  active: PostLanguage;
  onChange: (lang: PostLanguage) => void;
}

const LABELS: Record<PostLanguage, string> = {
  en: 'EN',
  ja: '日本語',
};

const LanguageToggle = ({ available, active, onChange }: LanguageToggleProps) => (
  <div
    role="tablist"
    aria-label="Post language"
    className={styles.languageToggle}
  >
    {available.map((lang) => {
      const isActive = lang === active;
      return (
        <button
          key={lang}
          role="tab"
          aria-selected={isActive}
          onClick={() => onChange(lang)}
          className={`${styles.languageButton} ${isActive ? styles.languageButtonActive : ''}`}
        >
          {LABELS[lang]}
        </button>
      );
    })}
  </div>
);

export default PostPage;
