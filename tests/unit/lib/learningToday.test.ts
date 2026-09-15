import { expect, it, vi } from 'vitest';
import { loadLearningToday } from '@/lib/learningToday';

const now = Date.parse('2026-09-15T12:00:00Z');
const dueLearning = { id: 'review-me', title: 'My learning', state: 'learning',
  lastReviewedAt: '2026-09-13T12:00:00Z', nextReviewAt: '2026-09-14T12:00:00Z', linkedArticleIds: ['newest'] };
async function withReview(due: object, historyUnavailable = false) {
  const fixture = requestFixture();
  return loadLearningToday(async (path, body) => {
    if (historyUnavailable && path.includes('read-history')) throw new Error('503');
    if (body && 'view' in body.input) return { items: [due], total: 1 };
    return fixture(path, body);
  }, now);
}
it('promotes the exact source of an explicitly reviewed, due learning and explains why', async () => {
  const result = await withReview(dueLearning);
  expect(result.article?.id).toBe('newest');
  expect(result.articleReason).toBe('review-linked');
  expect(result.articleLearning).toEqual({ id: 'review-me', title: 'My learning' });
  expect(result.articleChoices?.map(a => a.id)).toEqual(['newest', 'unread']);
});
it('also uses the canonical source URL retained by MCP-created learning items', async () => {
  const result = await withReview({ ...dueLearning, linkedArticleIds: [], sources: [{ url: 'https://www.meetyudai.com/study/articles/newest#takeaways' }] });
  expect(result.article?.id).toBe('newest');
  expect(result.articleReason).toBe('review-linked');
});
it.each([
  'https://other.example/study/articles/newest', 'https://www.meetyudai.com.evil.example/study/articles/newest',
  'https://user@www.meetyudai.com/study/articles/newest', 'http://www.meetyudai.com/study/articles/newest',
  'https://www.meetyudai.com/study/articles/newest/edit', 'https://www.meetyudai.com/study/documents?id=newest', 'bad url',
])('does not turn unrelated or unsafe source links into article references: %s', async url => {
  const result = await withReview({ ...dueLearning, linkedArticleIds: [], sources: [{ url }] });
  expect(result.articleReason).toBe('unread');
});
it.each([
  { state: 'saved' }, { state: 'understood' }, { nextReviewAt: undefined },
  { nextReviewAt: '2026-09-16T12:00:00Z' }, { nextReviewAt: 'bad date' },
  { lastReviewedAt: undefined }, { lastReviewedAt: 'bad date' },
  { linkedArticleIds: [] }, { linkedArticleIds: ['outside-latest-20'] },
])('does not infer a need to repeat from saved/paused/understood/unrelated items: %j', change => {
  return withReview({ ...dueLearning, ...change }).then(result => {
    expect(result.articleReason).toBe('unread');
    expect(result.article?.id).toBe('unread');
    expect(result.articleLearning).toBeUndefined();
  });
});
it('can explain a review source without claiming read status when history fails', async () => {
  const result = await withReview(dueLearning, true);
  expect(result.articleReason).toBe('review-linked');
  expect(result.errors).toEqual(['history']);
});

const articles = [{ id: 'newest', title: 'Latest' }, { id: 'unread', title: 'Next' }];
function requestFixture() {
  return vi.fn(async (path: string, body?: { action: string; input: object }): Promise<Record<string, unknown>> => {
    if (path.includes('read-history')) return { readArticleIds: { newest: '2026-09-08' } };
    if (path.includes('articles?')) return { articles };
    if (body && 'view' in body.input) return { items: [{ ...dueLearning, id: 'old-due-item', linkedArticleIds: [] }], total: 2 };
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

it('prioritizes an explicit again among several due items, not the first returned item', async () => {
  const fixture = requestFixture();
  const result = await loadLearningToday(async (path, body) => body && 'view' in body.input
    ? { items: [{ ...dueLearning, id: 'recalled', lastAssessment: 'remembered' },
      { ...dueLearning, id: 'unclear', lastAssessment: 'again' }], total: 2 }
    : fixture(path, body), now);
  expect(result.due?.id).toBe('unclear');
  expect(result.reviewChoices?.map(item => item.id)).toEqual(['unclear', 'recalled']);
  expect(result.articleLearning).toEqual({ id: 'unclear', title: 'My learning', lastAssessment: 'again' });
});
it.each(['remembered', 'understood'])('offers recall but does not promote rereading for %s', async lastAssessment => {
  const result = await withReview({ ...dueLearning, lastAssessment, state: lastAssessment === 'understood' ? 'understood' : 'learning' });
  expect(result.due?.lastAssessment).toBe(lastAssessment);
  expect(result.articleReason).toBe('unread');
});
it('filters paused/future/invalid schedules without silently changing any review', async () => {
  const fixture = requestFixture();
  const result = await loadLearningToday(async (path, body) => body && 'view' in body.input
    ? { items: [{ ...dueLearning, lastAssessment: 'pause' }, { ...dueLearning, lastReviewedAt: 'bad' },
      { ...dueLearning, nextReviewAt: '2027-01-01' }], total: 3 } : fixture(path, body), now);
  expect(result.due).toBeUndefined();
  expect(result.reviewChoices).toEqual([]);
  expect(result.articleReason).toBe('unread');
});
