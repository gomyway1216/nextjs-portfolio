import type { LearningItem } from './learningLibrary';
import type { StudyArticle } from '@/types/study';

export type LearningArticle = Pick<StudyArticle, 'id' | 'title' | 'summary' | 'createdAt' | 'tags' | 'learningExperience'>;
export interface LearningTodayData {
  recent: LearningItem[];
  total?: number;
  due?: LearningItem;
  reviewChoices?: LearningItem[];
  dueTotal?: number;
  article?: LearningArticle;
  articleChoices?: LearningArticle[];
  articleReason: 'review-linked' | 'unread' | 'latest' | 'unknown';
  articleLearning?: Pick<LearningItem, 'id' | 'title' | 'lastAssessment'>;
  errors: Array<'library' | 'review' | 'articles' | 'history'>;
}
type Request = (path: string, body?: { action: string; input: object }) => Promise<Record<string, unknown>>;

function activeDue(item: LearningItem, now: number): boolean {
  return item.state !== 'saved' && item.lastAssessment !== 'pause'
    && Boolean(item.lastReviewedAt && item.nextReviewAt)
    && Number.isFinite(Date.parse(item.lastReviewedAt!)) && Date.parse(item.lastReviewedAt!) <= now
    && Number.isFinite(Date.parse(item.nextReviewAt!)) && Date.parse(item.nextReviewAt!) <= now;
}

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
    request('/api/study/library', { action: 'search', input: { view: 'review', limit: 8 } }),
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
    const dueItems = (review.value.items as LearningItem[]).filter(item => activeDue(item, now));
    // Only the owner's explicit "again" choice gets extra priority. An older
    // save, a read or a quiz click is not evidence of difficulty.
    dueItems.sort((a, b) => Number(b.lastAssessment === 'again') - Number(a.lastAssessment === 'again')
      || Date.parse(a.nextReviewAt!) - Date.parse(b.nextReviewAt!));
    result.reviewChoices = dueItems.slice(0, 3);
    result.due = dueItems[0];
    result.dueTotal = review.value.total as number;
  } else result.errors.push('review');
  if (history.status === 'rejected') result.errors.push('history');
  if (articles.status === 'fulfilled') {
    const candidates = articles.value.articles as LearningArticle[];
    const read = history.status === 'fulfilled' ? history.value.readArticleIds as Record<string, string> : undefined;
    const unread = read && candidates.find((article) => !Object.hasOwn(read, article.id));
    const due = result.reviewChoices?.find(item => item.state === 'learning'
      && (!item.lastAssessment || item.lastAssessment === 'again')
      && candidates.some(article => articleSourceIds(item).has(article.id)));
    // A save or click is not a review. Paused / self-assessed understood items do not
    // promote the same explanation, and unrelated topics never match via generic tags.
    const activeReview = due && activeDue(due, now);
    const sourceIds = activeReview ? articleSourceIds(due) : new Set<string>();
    const linked = activeReview && candidates.find(article => sourceIds.has(article.id));
    result.article = linked || unread || candidates[0];
    if (linked && due) result.articleLearning = { id: due.id, title: due.title, lastAssessment: due.lastAssessment };
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
