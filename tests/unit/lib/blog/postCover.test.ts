import { describe, expect, it } from 'vitest';
import { resolvePostCover } from '@/lib/blog/postCover';

describe('resolvePostCover', () => {
  it('keeps an explicitly selected image', () => {
    expect(
      resolvePostCover(
        'https://cdn.example.com/custom.webp',
        'i-built-my-own-notebooklm-style-article-to-podcast-pipeline',
      ),
    ).toBe('https://cdn.example.com/custom.webp');
  });

  it('returns the generated cover for a known post slug', () => {
    expect(
      resolvePostCover(
        undefined,
        'spaced-repetition-flashcards-and-auto-generated-quizzes-turning-learning-science',
      ),
    ).toBe('/img/blog/personalized/srs-flashcards-engineering.webp');
  });

  it('returns no cover for an unknown post', () => {
    expect(resolvePostCover(undefined, 'another-post')).toBeUndefined();
  });
});
