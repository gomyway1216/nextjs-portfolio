import { expect, it, vi } from 'vitest';
import { loadLearningToday } from '@/lib/learningToday';

const articles = [{ id: 'newest', title: 'Latest' }, { id: 'unread', title: 'Next' }];
function requestFixture() {
  return vi.fn(async (path: string, body?: { action: string; input: object }): Promise<Record<string, unknown>> => {
    if (path.includes('read-history')) return { readArticleIds: { newest: '2026-09-08' } };
    if (path.includes('articles?')) return { articles };
    if (body && 'view' in body.input) return { items: [{ id: 'old-due-item' }], total: 2 };
    return { items: [{ id: 'recent' }], total: 40 };
  });
}
it('selects a real unread article, oldest server-selected due item and recent saves without writes', async () => {
  const request = requestFixture();
  const result = await loadLearningToday(request);
  expect(result.article?.id).toBe('unread');
  expect(result.articleReason).toBe('unread');
  expect(result.articleChoices?.map((a) => a.id)).toEqual(['unread', 'newest']);
  expect(result.due?.id).toBe('old-due-item');
  expect(result.total).toBe(40);
  expect(result.errors).toEqual([]);
  for (const [path, body] of request.mock.calls) {
    expect(path).not.toContain('userId');
    if (body) expect(body.action).toBe('search');
  }
});
it('does not claim an unread article when read history is unavailable', async () => {
  const fixture = requestFixture();
  const result = await loadLearningToday(async (path, body) => {
    if (path.includes('read-history')) throw new Error('401');
    return fixture(path, body);
  });
  expect(result.article?.id).toBe('newest');
  expect(result.articleReason).toBe('unknown');
  expect(result.errors).toEqual(['history']);
});
it('keeps each successful panel when other services fail, without fabricating zero counts', async () => {
  const fixture = requestFixture();
  const result = await loadLearningToday(async (path, body) => {
    if (path.includes('articles?') || body && 'view' in body.input) throw new Error('503');
    return fixture(path, body);
  });
  expect(result.recent).toHaveLength(1);
  expect(result.total).toBe(40);
  expect(result.dueTotal).toBeUndefined();
  expect(result.article).toBeUndefined();
  expect(result.errors).toEqual(['review', 'articles']);
});
it('offers rereading without treating reading as mastery', async () => {
  const fixture = requestFixture();
  const result = await loadLearningToday(async (path, body) => path.includes('read-history')
    ? { readArticleIds: { newest: 'date', unread: 'date' } } : fixture(path, body));
  expect(result.article?.id).toBe('newest');
  expect(result.articleReason).toBe('latest');
});
