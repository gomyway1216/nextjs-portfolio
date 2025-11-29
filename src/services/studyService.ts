// Study Service - Frontend API client for study tool
import { auth } from '@/lib/firebaseConnect';
import {
  StudyCategory,
  StudyTopic,
  StudyArticle,
  Quiz,
  QuizAttempt,
  ArticleSchedule,
  UserStudyProgress,
  LearningInsight,
  StudyConfig,
  TopicSuggestion,
  ArticleNote,
  ArticleChat,
  AIProvider,
  QuizDifficulty,
  TopicSuggestionType,
  QuizAnswer,
} from '@/types/study';

// Helper to get auth headers
async function getAuthHeaders(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) return {};
  const token = await user.getIdToken();
  return { Authorization: `Bearer ${token}` };
}

// Helper for API calls
async function apiCall<T>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = await getAuthHeaders();

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
      ...options.headers,
    },
  });

  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.error || 'API request failed');
  }

  return data;
}

// ============================================================================
// CATEGORIES
// ============================================================================

export async function getCategories(): Promise<StudyCategory[]> {
  const data = await apiCall<{ success: boolean; categories: StudyCategory[] }>(
    '/api/study/categories'
  );
  return data.categories;
}

export async function createCategory(
  category: Omit<StudyCategory, 'id' | 'createdAt' | 'updatedAt'>
): Promise<StudyCategory> {
  const data = await apiCall<{ success: boolean; category: StudyCategory }>(
    '/api/study/categories',
    {
      method: 'POST',
      body: JSON.stringify(category),
    }
  );
  return data.category;
}

export async function updateCategory(
  id: string,
  updates: Partial<StudyCategory>
): Promise<void> {
  await apiCall('/api/study/categories', {
    method: 'PUT',
    body: JSON.stringify({ id, ...updates }),
  });
}

export async function deleteCategory(id: string): Promise<void> {
  await apiCall('/api/study/categories', {
    method: 'DELETE',
    body: JSON.stringify({ id }),
  });
}

// ============================================================================
// TOPICS
// ============================================================================

export async function getTopics(
  options: { categoryId?: string; isActive?: boolean } = {}
): Promise<StudyTopic[]> {
  const params = new URLSearchParams();
  if (options.categoryId) params.set('categoryId', options.categoryId);
  if (options.isActive !== undefined) params.set('isActive', String(options.isActive));

  const url = `/api/study/topics${params.toString() ? `?${params}` : ''}`;
  const data = await apiCall<{ success: boolean; topics: StudyTopic[] }>(url);
  return data.topics;
}

export async function createTopic(
  topic: Omit<StudyTopic, 'id' | 'createdAt' | 'updatedAt' | 'timesGenerated' | 'lastGeneratedAt'>
): Promise<StudyTopic> {
  const data = await apiCall<{ success: boolean; topic: StudyTopic }>(
    '/api/study/topics',
    {
      method: 'POST',
      body: JSON.stringify(topic),
    }
  );
  return data.topic;
}

export async function updateTopic(
  id: string,
  updates: Partial<StudyTopic>
): Promise<void> {
  await apiCall('/api/study/topics', {
    method: 'PUT',
    body: JSON.stringify({ id, ...updates }),
  });
}

export async function deleteTopic(id: string): Promise<void> {
  await apiCall('/api/study/topics', {
    method: 'DELETE',
    body: JSON.stringify({ id }),
  });
}

export async function suggestTopics(options: {
  categoryId?: string;
  basedOnTopicIds?: string[];
  suggestionType: TopicSuggestionType;
  count: number;
  excludeTopicIds?: string[];
}): Promise<TopicSuggestion[]> {
  const data = await apiCall<{ success: boolean; suggestions: TopicSuggestion[] }>(
    '/api/study/topics/suggest',
    {
      method: 'POST',
      body: JSON.stringify(options),
    }
  );
  return data.suggestions;
}

// ============================================================================
// ARTICLES
// ============================================================================

export async function getArticles(
  options: {
    categoryId?: string;
    topicId?: string;
    status?: string;
    limit?: number;
    lastId?: string;
  } = {}
): Promise<{ articles: StudyArticle[]; hasMore: boolean }> {
  const params = new URLSearchParams();
  if (options.categoryId) params.set('categoryId', options.categoryId);
  if (options.topicId) params.set('topicId', options.topicId);
  if (options.status) params.set('status', options.status);
  if (options.limit) params.set('limit', String(options.limit));
  if (options.lastId) params.set('lastId', options.lastId);

  const url = `/api/study/articles${params.toString() ? `?${params}` : ''}`;
  const data = await apiCall<{ success: boolean; articles: StudyArticle[]; hasMore: boolean }>(url);
  return { articles: data.articles, hasMore: data.hasMore };
}

export async function getArticle(id: string): Promise<StudyArticle> {
  const data = await apiCall<{ success: boolean; article: StudyArticle }>(
    `/api/study/articles/${id}`
  );
  return data.article;
}

export async function generateArticle(options: {
  topicId?: string;
  categoryId: string;
  aiProvider: AIProvider;
  difficulty?: QuizDifficulty;  // Optional - AI will decide if not provided
  includeQuiz: boolean;
  numberOfQuestions: number;
  customPrompt?: string;
}): Promise<{ article: StudyArticle; quizId?: string }> {
  // Filter out undefined values
  const cleanOptions = Object.fromEntries(
    Object.entries(options).filter(([, v]) => v !== undefined && v !== '')
  );

  const data = await apiCall<{
    success: boolean;
    article: StudyArticle;
    quizId?: string;
  }>('/api/study/articles', {
    method: 'POST',
    body: JSON.stringify(cleanOptions),
  });
  return { article: data.article, quizId: data.quizId };
}

export async function updateArticle(
  id: string,
  updates: Partial<StudyArticle>
): Promise<void> {
  await apiCall(`/api/study/articles/${id}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
}

export async function deleteArticle(id: string): Promise<void> {
  await apiCall(`/api/study/articles/${id}`, {
    method: 'DELETE',
  });
}

export async function markArticleAsRead(
  id: string,
  timeSpent?: number
): Promise<void> {
  await apiCall(`/api/study/articles/${id}/read`, {
    method: 'POST',
    body: JSON.stringify({ timeSpent }),
  });
}

// ============================================================================
// ARTICLE NOTES
// ============================================================================

export async function getArticleNotes(articleId: string): Promise<ArticleNote[]> {
  const data = await apiCall<{ success: boolean; notes: ArticleNote[] }>(
    `/api/study/articles/${articleId}/notes`
  );
  return data.notes;
}

export async function createArticleNote(
  articleId: string,
  note: { content: string; sectionId?: string; highlightedText?: string }
): Promise<ArticleNote> {
  const data = await apiCall<{ success: boolean; note: ArticleNote }>(
    `/api/study/articles/${articleId}/notes`,
    {
      method: 'POST',
      body: JSON.stringify(note),
    }
  );
  return data.note;
}

export async function updateArticleNote(
  noteId: string,
  content: string
): Promise<void> {
  await apiCall(`/api/study/articles/_/notes`, {
    method: 'PUT',
    body: JSON.stringify({ id: noteId, content }),
  });
}

export async function deleteArticleNote(noteId: string): Promise<void> {
  await apiCall(`/api/study/articles/_/notes`, {
    method: 'DELETE',
    body: JSON.stringify({ id: noteId }),
  });
}

// ============================================================================
// ARTICLE CHAT
// ============================================================================

export async function getArticleChat(articleId: string): Promise<ArticleChat | null> {
  const data = await apiCall<{ success: boolean; chat: ArticleChat | null }>(
    `/api/study/articles/${articleId}/chat`
  );
  return data.chat;
}

export async function sendChatMessage(
  articleId: string,
  message: string
): Promise<{ response: string; messageId: string }> {
  const data = await apiCall<{
    success: boolean;
    response: string;
    messageId: string;
  }>(`/api/study/articles/${articleId}/chat`, {
    method: 'POST',
    body: JSON.stringify({ message }),
  });
  return { response: data.response, messageId: data.messageId };
}

export async function generateChatSummary(
  articleId: string
): Promise<string> {
  const data = await apiCall<{ success: boolean; summary: string }>(
    `/api/study/articles/${articleId}/chat/summary`,
    { method: 'POST' }
  );
  return data.summary;
}

// ============================================================================
// QUIZZES
// ============================================================================

export async function getQuizzes(
  options: { articleId?: string; categoryId?: string; topicId?: string } = {}
): Promise<Quiz[]> {
  const params = new URLSearchParams();
  if (options.articleId) params.set('articleId', options.articleId);
  if (options.categoryId) params.set('categoryId', options.categoryId);
  if (options.topicId) params.set('topicId', options.topicId);

  const url = `/api/study/quizzes${params.toString() ? `?${params}` : ''}`;
  const data = await apiCall<{ success: boolean; quizzes: Quiz[] }>(url);
  return data.quizzes;
}

export async function getQuiz(id: string): Promise<Quiz> {
  const data = await apiCall<{ success: boolean; quiz: Quiz }>(
    `/api/study/quizzes/${id}`
  );
  return data.quiz;
}

export async function submitQuiz(
  quizId: string,
  answers: QuizAnswer[],
  startedAt: string
): Promise<QuizAttempt> {
  const data = await apiCall<{ success: boolean; attempt: QuizAttempt }>(
    `/api/study/quizzes/${quizId}/submit`,
    {
      method: 'POST',
      body: JSON.stringify({ answers, startedAt }),
    }
  );
  return data.attempt;
}

export async function getQuizAttempts(
  quizId?: string
): Promise<QuizAttempt[]> {
  const params = new URLSearchParams();
  if (quizId) params.set('quizId', quizId);

  const url = `/api/study/quizzes/attempts${params.toString() ? `?${params}` : ''}`;
  const data = await apiCall<{ success: boolean; attempts: QuizAttempt[] }>(url);
  return data.attempts;
}

// ============================================================================
// SCHEDULES
// ============================================================================

export async function getSchedules(): Promise<ArticleSchedule[]> {
  const data = await apiCall<{ success: boolean; schedules: ArticleSchedule[] }>(
    '/api/study/schedules'
  );
  return data.schedules;
}

export async function createSchedule(
  schedule: Omit<
    ArticleSchedule,
    'id' | 'createdAt' | 'updatedAt' | 'lastRunAt' | 'nextRunAt' | 'articlesGenerated'
  >
): Promise<ArticleSchedule> {
  const data = await apiCall<{ success: boolean; schedule: ArticleSchedule }>(
    '/api/study/schedules',
    {
      method: 'POST',
      body: JSON.stringify(schedule),
    }
  );
  return data.schedule;
}

export async function updateSchedule(
  id: string,
  updates: Partial<ArticleSchedule>
): Promise<void> {
  await apiCall('/api/study/schedules', {
    method: 'PUT',
    body: JSON.stringify({ id, ...updates }),
  });
}

export async function deleteSchedule(id: string): Promise<void> {
  await apiCall('/api/study/schedules', {
    method: 'DELETE',
    body: JSON.stringify({ id }),
  });
}

export async function runScheduleNow(
  scheduleId: string
): Promise<{ articleIds: string[]; runId: string }> {
  const data = await apiCall<{
    success: boolean;
    articleIds: string[];
    runId: string;
  }>(`/api/study/schedules/${scheduleId}/run`, {
    method: 'POST',
  });
  return { articleIds: data.articleIds, runId: data.runId };
}

// ============================================================================
// PROGRESS
// ============================================================================

export async function getUserProgress(): Promise<UserStudyProgress | null> {
  const data = await apiCall<{ success: boolean; progress: UserStudyProgress | null }>(
    '/api/study/progress'
  );
  return data.progress;
}

export async function getLearningInsights(): Promise<{
  insights: LearningInsight[];
  overallProgress: {
    totalProgress: number;
    trend: 'improving' | 'stable' | 'declining';
    suggestedFocus: string[];
  };
}> {
  const data = await apiCall<{
    success: boolean;
    insights: LearningInsight[];
    overallProgress: {
      totalProgress: number;
      trend: 'improving' | 'stable' | 'declining';
      suggestedFocus: string[];
    };
  }>('/api/study/progress/insights');
  return { insights: data.insights, overallProgress: data.overallProgress };
}

// ============================================================================
// CONFIG
// ============================================================================

export async function getStudyConfig(): Promise<StudyConfig | null> {
  const data = await apiCall<{ success: boolean; config: StudyConfig | null }>(
    '/api/study/config'
  );
  return data.config;
}

export async function updateStudyConfig(
  updates: Partial<StudyConfig>
): Promise<void> {
  await apiCall('/api/study/config', {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
}

// ============================================================================
// SEARCH
// ============================================================================

export async function searchStudyContent(
  query: string,
  type?: 'articles' | 'quizzes' | 'topics'
): Promise<{
  articles: Array<{ id: string; title: string; summary: string; categoryId: string }>;
  quizzes: Array<{ id: string; title: string; description: string }>;
  topics: Array<{ id: string; name: string; description: string; categoryId: string }>;
}> {
  const params = new URLSearchParams({ q: query });
  if (type) params.set('type', type);

  const data = await apiCall<{
    success: boolean;
    results: {
      articles: Array<{ id: string; title: string; summary: string; categoryId: string }>;
      quizzes: Array<{ id: string; title: string; description: string }>;
      topics: Array<{ id: string; name: string; description: string; categoryId: string }>;
    };
  }>(`/api/study/search?${params}`);
  return data.results;
}
