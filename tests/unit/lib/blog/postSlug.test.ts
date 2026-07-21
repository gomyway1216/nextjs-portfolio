import { describe, expect, it } from 'vitest';
import { postSlug, slugifyTitle } from '@/lib/blog/postSlug';

describe('slugifyTitle', () => {
  it('lowercases and hyphenates words', () => {
    expect(slugifyTitle('How Email Actually Works')).toBe('how-email-actually-works');
  });

  it('collapses punctuation, em dashes, and whitespace runs', () => {
    expect(slugifyTitle('From Send to Read—What a Messaging App Does')).toBe(
      'from-send-to-read-what-a-messaging-app-does',
    );
  });

  it('drops apostrophes instead of hyphenating them', () => {
    expect(slugifyTitle("Why Financial Products Need Explainable States, Don't They?")).toBe(
      'why-financial-products-need-explainable-states-dont-they',
    );
  });

  it('folds diacritics to ASCII', () => {
    expect(slugifyTitle('Café Résumé')).toBe('cafe-resume');
  });

  it('returns empty for titles with no ASCII words', () => {
    expect(slugifyTitle('日本語だけのタイトル')).toBe('');
  });

  it('truncates long titles without a trailing hyphen', () => {
    const slug = slugifyTitle('word '.repeat(40));
    expect(slug.length).toBeLessThanOrEqual(80);
    expect(slug.endsWith('-')).toBe(false);
  });
});

describe('postSlug', () => {
  it('uses the English title', () => {
    expect(
      postSlug({ en: { title: 'A Primer on Machine Learning', body: '' } }, 'abc123'),
    ).toBe('a-primer-on-machine-learning');
  });

  it('falls back to the id when only Japanese exists', () => {
    expect(
      postSlug({ ja: { title: '日本語だけのタイトル', body: '' } }, 'abc123'),
    ).toBe('abc123');
  });

  it('falls back to the id when translations are missing', () => {
    expect(postSlug(undefined, 'abc123')).toBe('abc123');
    expect(postSlug({}, 'abc123')).toBe('abc123');
  });
});
