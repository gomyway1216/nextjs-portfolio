import { describe, expect, it } from 'vitest';
import { MAX_RELATED_POSTS, normalizeRelatedPostIds } from '@/lib/blog/relatedPosts';

describe('normalizeRelatedPostIds', () => {
  it('returns [] for non-array input', () => {
    expect(normalizeRelatedPostIds(undefined)).toEqual([]);
    expect(normalizeRelatedPostIds(null)).toEqual([]);
    expect(normalizeRelatedPostIds('abc')).toEqual([]);
    expect(normalizeRelatedPostIds({ 0: 'abc' })).toEqual([]);
  });

  it('keeps only non-empty trimmed strings', () => {
    expect(normalizeRelatedPostIds(['a', '', '  ', 42, null, ' b '])).toEqual(['a', 'b']);
  });

  it('dedupes while preserving first-seen order', () => {
    expect(normalizeRelatedPostIds(['a', 'b', 'a', 'c', 'b'])).toEqual(['a', 'b', 'c']);
  });

  it('drops a self-reference', () => {
    expect(normalizeRelatedPostIds(['a', 'self', 'b'], 'self')).toEqual(['a', 'b']);
  });

  it('drops ids containing a slash (would break Firestore doc paths)', () => {
    expect(normalizeRelatedPostIds(['a', 'some/invalid/path', '/b', 'c'])).toEqual(['a', 'c']);
  });

  it('caps the list at MAX_RELATED_POSTS', () => {
    const ids = Array.from({ length: MAX_RELATED_POSTS + 3 }, (_, i) => `post-${i}`);
    const result = normalizeRelatedPostIds(ids);
    expect(result).toHaveLength(MAX_RELATED_POSTS);
    expect(result).toEqual(ids.slice(0, MAX_RELATED_POSTS));
  });
});
