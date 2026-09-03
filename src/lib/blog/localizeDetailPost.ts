import type { DetailPost } from '@/services/postsService';
import {
  pickTranslation,
  type PostLanguage,
  type Translation,
} from '@/lib/blog/postTranslations';

export interface LocalizedDetailPost {
  post: DetailPost;
  language: PostLanguage;
  translation: Translation;
}

/**
 * Keep only the rendered locale in the client payload. The complete
 * translations map remains server-side for metadata and hreflang decisions.
 */
export function localizeDetailPost(
  post: DetailPost,
  requestedLanguage: PostLanguage,
): LocalizedDetailPost | null {
  const picked = pickTranslation(post.translations, requestedLanguage);
  if (!picked) return null;

  return {
    post: {
      ...post,
      translations: { [picked.language]: picked.translation },
    },
    language: picked.language,
    translation: picked.translation,
  };
}
