import { describe, expect, it } from 'vitest';

import { normalizePostTags, normalizePostTaxonomyTags } from '@/lib/blog/postMetadata';

describe('post metadata tag normalization', () => {
  it('limits tags stored on a single post to 20', () => {
    const tags = Array.from({ length: 25 }, (_, index) => `tag-${index + 1}`);

    expect(normalizePostTags(tags)).toHaveLength(20);
    expect(normalizePostTags(tags).at(-1)).toBe('tag-20');
  });

  it('does not limit saved taxonomy tag suggestions', () => {
    const tags = Array.from({ length: 25 }, (_, index) => `tag-${index + 1}`);

    expect(normalizePostTaxonomyTags(tags)).toHaveLength(25);
    expect(normalizePostTaxonomyTags(tags)).toContain('tag-21');
  });
});
