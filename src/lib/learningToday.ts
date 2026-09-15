import type { LearningItem } from './learningLibrary';
import type { StudyArticle } from '@/types/study';

export type LearningArticle = Pick<StudyArticle, 'id' | 'title' | 'summary' | 'createdAt' | 'tags' | 'learningExperience'>;
export interface LearningTodayData {
  recent: LearningItem[];
  total?: number;
  due?: LearningItem;
  dueTotal?: number;
  article?: LearningArticle;
  articleChoices?: LearningArticle[];
  articleReason: 'review-linked' | 'unread' | 'latest' | 'unknown';
  articleLearning?: Pick<LearningItem, 'id' | 'title'>;
  errors: Array<'library' | 'review' | 'articles' | 'history'>;
}
type Request = (path: string, body?: { action: string; input: object }) => Promise<Record<string, unknown>>;

function articleSourceIds(item: LearningItem): Set<string> {
  const ids = new Set(item.linkedArticleIds ?? []);
  // MCP saves retain the article URL as a source rather than a learning relatedId.
  for (const source of item.sources ?? []) {
    try {
      const url = new URL(source.url ?? '');
      if (url.protocol !== 'https:' || !['www.meetyudai.com', 'meetyudai.com'].includes(url.host) || url.username || url.password) continue;
      const match = /^\/study\/articles\/([A-Za-z0-9_-]+)\/?$/.exec(url.pathname);
      if (match) ids.add(match[1]);
    } catch { /* A malformed or non-article source is not a recommendation signal. */ }
  }
  return ids;
}

/** Uses only explicit, active review choices and exact source links, never inferred mastery. */
export async function loadLearningToday(request: Request, now = Date.now()): Promise<LearningTodayData> {
  const [library, review, articles, history] = await Promise.allSettled([
    request('/api/study/library', { action: 'search', input: { limit: 3 } }),
    request('/api/study/library', { action: 'search', input: { view: 'review', limit: 1 } }),
    request('/api/study/articles?status=all&listView=true&orderBy=createdAt&orderDir=desc&limit=20'),
    // The server derives the owner from authentication, never a caller-supplied UID.
    request('/api/study/articles/read-history'),
  ]);
  const result: LearningTodayData = { recent: [], articleReason: 'unknown', errors: [] };
  if (library.status === 'fulfilled') {
    result.recent = library.value.items as LearningItem[];
    result.total = library.value.total as number;
  } else result.errors.push('library');
  if (review.status === 'fulfilled') {
    result.due = (review.value.items as LearningItem[])[0];
    result.dueTotal = review.value.total as number;
  } else result.errors.push('review');
  if (history.status === 'rejected') result.errors.push('history');
  if (articles.status === 'fulfilled') {
    const candidates = articles.value.articles as LearningArticle[];
    const read = history.status === 'fulfilled' ? history.value.readArticleIds as Record<string, string> : undefined;
    const unread = read && candidates.find((article) => !Object.hasOwn(read, article.id));
    const due = result.due;
    // A save or click is not a review. Paused / self-assessed understood items do not
    // promote the same explanation, and unrelated topics never match via generic tags.
    const activeReview = due?.state === 'learning' && due.lastReviewedAt && due.nextReviewAt
      && Number.isFinite(Date.parse(due.lastReviewedAt)) && Date.parse(due.lastReviewedAt) <= now
      && Date.parse(due.nextReviewAt) <= now;
    const sourceIds = activeReview ? articleSourceIds(due) : new Set<string>();
    const linked = activeReview && candidates.find(article => sourceIds.has(article.id));
    result.article = linked || unread || candidates[0];
    if (linked && due) result.articleLearning = { id: due.id, title: due.title };
    const preferredId = linked ? linked.id : undefined;
    // Keep the choice finite and optional, with unread alternatives after the review source.
    result.articleChoices = [...candidates].sort((a, b) =>
      Number(b.id === preferredId) - Number(a.id === preferredId) ||
      Number(Boolean(read && Object.hasOwn(read, a.id))) - Number(Boolean(read && Object.hasOwn(read, b.id)))
    ).slice(0, 3);
    result.articleReason = linked ? 'review-linked' : !read ? 'unknown' : unread ? 'unread' : 'latest';
  } else result.errors.push('articles');
  return result;
}
