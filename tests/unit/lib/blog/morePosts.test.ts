import { describe, expect, it } from 'vitest';
import { MORE_POSTS_LIMIT, selectMorePosts } from '@/lib/blog/morePosts';

const candidate = (id: string, extra: Partial<Parameters<typeof selectMorePosts>[0][number]> = {}) => ({
  id,
  slug: `slug-${id}`,
  title: `Post ${id}`,
  category: 'system-design',
  language: 'en' as const,
  created: '2026-09-01T00:00:00.000Z',
  ...extra,
});

describe('selectMorePosts', () => {
  it('drops the current post and hand-picked related ids, keeps order, caps the count', () => {
    const posts = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => candidate(id));
    const picked = selectMorePosts(posts, 'a', ['c']);
    expect(picked.map((p) => p.id)).toEqual(['b', 'd', 'e']);
    expect(picked).toHaveLength(MORE_POSTS_LIMIT);
  });

  it('projects only the card fields', () => {
    const [picked] = selectMorePosts([candidate('x', { isPublic: true })], 'other');
    expect(picked).toEqual({
      id: 'x',
      slug: 'slug-x',
      title: 'Post x',
      category: 'system-design',
      language: 'en',
      created: '2026-09-01T00:00:00.000Z',
    });
  });

  it('skips non-public candidates and duplicate ids', () => {
    const posts = [candidate('a', { isPublic: false }), candidate('b'), candidate('b'), candidate('c')];
    expect(selectMorePosts(posts, 'z').map((p) => p.id)).toEqual(['b', 'c']);
  });

  it('honours a custom limit and returns empty for no candidates', () => {
    const posts = ['a', 'b', 'c'].map((id) => candidate(id));
    expect(selectMorePosts(posts, 'z', [], 1).map((p) => p.id)).toEqual(['a']);
    expect(selectMorePosts([], 'z')).toEqual([]);
  });
});
