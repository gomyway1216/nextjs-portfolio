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
  articleReason: 'unread' | 'latest' | 'unknown';
  errors: Array<'library' | 'review' | 'articles' | 'history'>;
}
type Request = (path: string, body?: { action: string; input: object }) => Promise<Record<string, unknown>>;

/** A small, read-only start page, not a mastery score or AI recommendation. */
export async function loadLearningToday(request: Request): Promise<LearningTodayData> {
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
    result.article = unread || candidates[0];
    // Offer alternatives, not a compulsory assignment. Read state only orders choices.
    result.articleChoices = [...candidates].sort((a, b) =>
      Number(Boolean(read && Object.hasOwn(read, a.id))) - Number(Boolean(read && Object.hasOwn(read, b.id)))
    ).slice(0, 3);
    result.articleReason = !read ? 'unknown' : unread ? 'unread' : 'latest';
  } else result.errors.push('articles');
  return result;
}
