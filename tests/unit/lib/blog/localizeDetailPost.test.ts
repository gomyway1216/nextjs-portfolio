import { describe, expect, it } from 'vitest';

import { localizeDetailPost } from '@/lib/blog/localizeDetailPost';
import type { DetailPost } from '@/services/postsService';

const bilingualPost: DetailPost = {
  id: 'post-1',
  isPublic: true,
  category: 'system-design',
  tags: ['caching'],
  translations: {
    en: { title: 'English title', body: 'English body' },
    ja: { title: '日本語タイトル', body: '日本語本文' },
  },
  availableLanguages: ['en', 'ja'],
  created: '2026-01-01T00:00:00.000Z',
  lastUpdated: '2026-01-02T00:00:00.000Z',
};

describe('localizeDetailPost', () => {
  it('keeps only the requested translation in the browser payload', () => {
    const localized = localizeDetailPost(bilingualPost, 'ja');

    expect(localized?.post.translations).toEqual({
      ja: { title: '日本語タイトル', body: '日本語本文' },
    });
    expect(localized?.post.availableLanguages).toEqual(['en', 'ja']);
    expect(bilingualPost.translations.en).toBeDefined();
  });

  it('falls back to the available translation without inventing content', () => {
    const englishOnly = {
      ...bilingualPost,
      translations: { en: bilingualPost.translations.en },
      availableLanguages: ['en' as const],
    };

    const localized = localizeDetailPost(englishOnly, 'ja');

    expect(localized?.language).toBe('en');
    expect(localized?.post.translations).toEqual({
      en: { title: 'English title', body: 'English body' },
    });
  });
});
