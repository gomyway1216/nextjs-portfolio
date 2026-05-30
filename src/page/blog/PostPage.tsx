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
import { useParams,useRouter } from 'next/navigation';
import { useEffect,useMemo,useState } from 'react';
import { useTranslation } from 'react-i18next';

const PostPage = () => {
  const { category: routeCategory, id: routeId } = useParams();
  const [post, setPost] = useState<DetailPost | null>(null);
  const { currentUser } = useAuth();
  const router = useRouter();
  const { i18n } = useTranslation();
  const activeLanguage = normalizeLanguage(i18n.language);

  const _category = Array.isArray(routeCategory) ? routeCategory[0] : routeCategory || '';
  const id = Array.isArray(routeId) ? routeId[0] : routeId || '';

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const p = await postApi.getPostById(id);
      if (!cancelled) setPost(p);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

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

  if (!post || !view) {
    return <h1>Post does not exist!</h1>;
  }

  const available = post.availableLanguages || [];
  const isBilingual = available.length > 1;

  return (
    <div>
      {currentUser && <Button onClick={handleEdit}>EDIT</Button>}
      {isBilingual && (
        <LanguageToggle
          available={available}
          active={view.language}
          onChange={handleSwitchLanguage}
        />
      )}
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
    style={{
      display: 'inline-flex',
      gap: '4px',
      padding: '4px',
      border: '1px solid rgba(0, 0, 0, 0.1)',
      borderRadius: '8px',
      margin: '8px 0 16px',
    }}
  >
    {available.map((lang) => {
      const isActive = lang === active;
      return (
        <button
          key={lang}
          role="tab"
          aria-selected={isActive}
          onClick={() => onChange(lang)}
          style={{
            padding: '6px 14px',
            border: 'none',
            borderRadius: '6px',
            backgroundColor: isActive ? '#111827' : 'transparent',
            color: isActive ? '#ffffff' : '#374151',
            fontSize: '13px',
            fontWeight: 500,
            cursor: isActive ? 'default' : 'pointer',
          }}
        >
          {LABELS[lang]}
        </button>
      );
    })}
  </div>
);

export default PostPage;
