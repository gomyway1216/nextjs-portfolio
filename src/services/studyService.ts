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
  LearningEntry,
  DictionaryTerm,
  Flashcard,
  FlashcardDeck,
  LearningStats,
  QuickCapture,
  LearningSourceType,
  FlashcardDifficulty,
  CreateLearningEntryRequest,
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

export async function seedCategories(): Promise<{ addedCount: number; skippedCount: number }> {
  const data = await apiCall<{ success: boolean; addedCount: number; skippedCount: number }>(
    '/api/study/categories',
    {
      method: 'PATCH',
    }
  );
  return { addedCount: data.addedCount, skippedCount: data.skippedCount };
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
    language?: string;
    orderBy?: string;
    orderDir?: 'asc' | 'desc';
    limit?: number;
    lastId?: string;
    listView?: boolean;  // Optimization: only return fields needed for list view
  } = {}
): Promise<{ articles: StudyArticle[]; hasMore: boolean }> {
  const params = new URLSearchParams();
  if (options.categoryId) params.set('categoryId', options.categoryId);
  if (options.topicId) params.set('topicId', options.topicId);
  if (options.status) params.set('status', options.status);
  if (options.language) params.set('language', options.language);
  if (options.orderBy) params.set('orderBy', options.orderBy);
  if (options.orderDir) params.set('orderDir', options.orderDir);
  if (options.limit) params.set('limit', String(options.limit));
  if (options.lastId) params.set('lastId', options.lastId);
  if (options.listView) params.set('listView', 'true');

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
  language?: string;  // Output language (e.g., "en", "ja")
  codingLanguage?: string;  // Preferred coding language for examples
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

// ============================================================================
// ARTICLE READ HISTORY (Admin feature)
// ============================================================================

export async function getReadHistory(): Promise<{
  readHistory: Array<{ id: string; articleId: string; userId: string; readAt: string; timeSpentSeconds?: number }>;
  readArticleIds: Record<string, string>;
}> {
  const data = await apiCall<{
    success: boolean;
    readHistory: Array<{ id: string; articleId: string; userId: string; readAt: string; timeSpentSeconds?: number }>;
    readArticleIds: Record<string, string>;
  }>('/api/study/articles/read-history');
  return { readHistory: data.readHistory, readArticleIds: data.readArticleIds };
}

export async function markArticleAsReadAdmin(
  articleId: string,
  timeSpentSeconds?: number
): Promise<{ id: string; message: string }> {
  const data = await apiCall<{ success: boolean; id: string; message: string }>(
    '/api/study/articles/read-history',
    {
      method: 'POST',
      body: JSON.stringify({ articleId, timeSpentSeconds }),
    }
  );
  return { id: data.id, message: data.message };
}

export async function unmarkArticleAsRead(articleId: string): Promise<void> {
  await apiCall('/api/study/articles/read-history', {
    method: 'DELETE',
    body: JSON.stringify({ articleId }),
  });
}

// ============================================================================
// LEARNING ENTRIES
// ============================================================================

export async function getLearningEntries(params?: {
  categoryId?: string;
  sourceType?: LearningSourceType;
  tags?: string;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<LearningEntry[]> {
  const searchParams = new URLSearchParams();
  if (params?.categoryId) searchParams.set('categoryId', params.categoryId);
  if (params?.sourceType) searchParams.set('sourceType', params.sourceType);
  if (params?.tags) searchParams.set('tags', params.tags);
  if (params?.search) searchParams.set('search', params.search);
  if (params?.limit) searchParams.set('limit', params.limit.toString());
  if (params?.offset) searchParams.set('offset', params.offset.toString());

  const queryString = searchParams.toString();
  const url = `/api/study/learning/entries${queryString ? `?${queryString}` : ''}`;

  const data = await apiCall<{ success: boolean; entries: LearningEntry[] }>(url);
  return data.entries;
}

export async function getLearningEntry(entryId: string): Promise<LearningEntry> {
  const data = await apiCall<{ success: boolean; entry: LearningEntry }>(
    `/api/study/learning/entries/${entryId}`
  );
  return data.entry;
}

export async function createLearningEntry(
  entry: CreateLearningEntryRequest
): Promise<LearningEntry> {
  const data = await apiCall<{ success: boolean; entry: LearningEntry }>(
    '/api/study/learning/entries',
    {
      method: 'POST',
      body: JSON.stringify(entry),
    }
  );
  return data.entry;
}

export async function updateLearningEntry(
  entryId: string,
  updates: Partial<LearningEntry>
): Promise<void> {
  await apiCall(`/api/study/learning/entries?entryId=${entryId}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
}

export async function deleteLearningEntry(entryId: string): Promise<void> {
  await apiCall(`/api/study/learning/entries?entryId=${entryId}`, {
    method: 'DELETE',
  });
}

// ============================================================================
// DICTIONARY
// ============================================================================

export async function getDictionaryTerms(params?: {
  category?: string;
  search?: string;
  limit?: number;
}): Promise<DictionaryTerm[]> {
  const searchParams = new URLSearchParams();
  if (params?.category) searchParams.set('category', params.category);
  if (params?.search) searchParams.set('search', params.search);
  if (params?.limit) searchParams.set('limit', params.limit.toString());

  const queryString = searchParams.toString();
  const url = `/api/study/learning/dictionary${queryString ? `?${queryString}` : ''}`;

  const data = await apiCall<{ success: boolean; terms: DictionaryTerm[] }>(url);
  return data.terms;
}

export async function createDictionaryTerm(
  term: Omit<DictionaryTerm, 'id' | 'userId' | 'createdAt' | 'updatedAt' | 'reviewCount' | 'lastReviewedAt'>
): Promise<DictionaryTerm> {
  const data = await apiCall<{ success: boolean; term: DictionaryTerm }>(
    '/api/study/learning/dictionary',
    {
      method: 'POST',
      body: JSON.stringify(term),
    }
  );
  return data.term;
}

export async function updateDictionaryTerm(
  termId: string,
  updates: Partial<DictionaryTerm>
): Promise<void> {
  await apiCall(`/api/study/learning/dictionary?termId=${termId}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
}

export async function deleteDictionaryTerm(termId: string): Promise<void> {
  await apiCall(`/api/study/learning/dictionary?termId=${termId}`, {
    method: 'DELETE',
  });
}

// ============================================================================
// FLASHCARDS
// ============================================================================

export async function getFlashcards(params?: {
  deckId?: string;
  categoryId?: string;
  dueOnly?: boolean;
  limit?: number;
}): Promise<Flashcard[]> {
  const searchParams = new URLSearchParams();
  if (params?.deckId) searchParams.set('deckId', params.deckId);
  if (params?.categoryId) searchParams.set('categoryId', params.categoryId);
  if (params?.dueOnly) searchParams.set('dueOnly', 'true');
  if (params?.limit) searchParams.set('limit', params.limit.toString());

  const queryString = searchParams.toString();
  const url = `/api/study/learning/flashcards${queryString ? `?${queryString}` : ''}`;

  const data = await apiCall<{ success: boolean; flashcards: Flashcard[] }>(url);
  return data.flashcards;
}

export async function createFlashcard(
  flashcard: Omit<Flashcard, 'id' | 'userId' | 'createdAt' | 'updatedAt' | 'reviewHistory' | 'lastReviewedAt'>
): Promise<Flashcard> {
  const data = await apiCall<{ success: boolean; flashcard: Flashcard }>(
    '/api/study/learning/flashcards',
    {
      method: 'POST',
      body: JSON.stringify(flashcard),
    }
  );
  return data.flashcard;
}

export async function deleteFlashcard(flashcardId: string): Promise<void> {
  await apiCall(`/api/study/learning/flashcards?flashcardId=${flashcardId}`, {
    method: 'DELETE',
  });
}

export async function getFlashcardDecks(): Promise<FlashcardDeck[]> {
  const data = await apiCall<{ success: boolean; decks: FlashcardDeck[] }>(
    '/api/study/learning/flashcards/decks'
  );
  return data.decks;
}

export async function createFlashcardDeck(
  deck: Omit<FlashcardDeck, 'id' | 'userId' | 'createdAt' | 'updatedAt' | 'cardsDue' | 'cardsNew'>
): Promise<FlashcardDeck> {
  const data = await apiCall<{ success: boolean; deck: FlashcardDeck }>(
    '/api/study/learning/flashcards/decks',
    {
      method: 'POST',
      body: JSON.stringify(deck),
    }
  );
  return data.deck;
}

// ============================================================================
// SPACED REPETITION REVIEW
// ============================================================================

export async function getDueReviewItems(params?: {
  itemType?: 'flashcard' | 'dictionary' | 'mixed';
  deckId?: string;
  categoryId?: string;
  limit?: number;
}): Promise<{
  flashcards: Flashcard[];
  dictionaryTerms: DictionaryTerm[];
  totalDue: number;
}> {
  const searchParams = new URLSearchParams();
  if (params?.itemType) searchParams.set('itemType', params.itemType);
  if (params?.deckId) searchParams.set('deckId', params.deckId);
  if (params?.categoryId) searchParams.set('categoryId', params.categoryId);
  if (params?.limit) searchParams.set('limit', params.limit.toString());

  const queryString = searchParams.toString();
  const url = `/api/study/learning/review${queryString ? `?${queryString}` : ''}`;

  const data = await apiCall<{
    success: boolean;
    flashcards: Flashcard[];
    dictionaryTerms: DictionaryTerm[];
    totalDue: number;
  }>(url);

  return {
    flashcards: data.flashcards,
    dictionaryTerms: data.dictionaryTerms,
    totalDue: data.totalDue,
  };
}

export async function submitReview(params: {
  itemId: string;
  itemType: 'flashcard' | 'dictionary_term';
  difficulty: FlashcardDifficulty;
  timeTaken: number;
}): Promise<{
  nextReviewDate: string;
  easeFactor: number;
  interval: number;
}> {
  const data = await apiCall<{
    success: boolean;
    nextReviewDate: string;
    easeFactor: number;
    interval: number;
  }>('/api/study/learning/review', {
    method: 'POST',
    body: JSON.stringify(params),
  });

  return {
    nextReviewDate: data.nextReviewDate,
    easeFactor: data.easeFactor,
    interval: data.interval,
  };
}

// ============================================================================
// LEARNING STATS
// ============================================================================

export async function getLearningStats(): Promise<LearningStats> {
  const data = await apiCall<{ success: boolean; stats: LearningStats }>(
    '/api/study/learning/stats'
  );
  return data.stats;
}

// ============================================================================
// QUICK CAPTURE
// ============================================================================

export async function getQuickCaptures(status?: 'pending' | 'processed' | 'archived'): Promise<QuickCapture[]> {
  const url = status
    ? `/api/study/learning/quick-capture?status=${status}`
    : '/api/study/learning/quick-capture';

  const data = await apiCall<{ success: boolean; captures: QuickCapture[] }>(url);
  return data.captures;
}

export async function createQuickCapture(capture: {
  content: string;
  sourceType?: LearningSourceType;
  sourceUrl?: string;
  tags?: string[];
}): Promise<QuickCapture> {
  const data = await apiCall<{ success: boolean; capture: QuickCapture }>(
    '/api/study/learning/quick-capture',
    {
      method: 'POST',
      body: JSON.stringify(capture),
    }
  );
  return data.capture;
}

// ============================================================================
// AI GENERATION
// ============================================================================

export async function generateFlashcardsFromContent(params: {
  entryId?: string;
  content?: string;
  count?: number;
  difficulty?: QuizDifficulty;
}): Promise<Omit<Flashcard, 'id' | 'userId' | 'createdAt' | 'updatedAt' | 'reviewHistory' | 'lastReviewedAt'>[]> {
  const data = await apiCall<{
    success: boolean;
    flashcards: Omit<Flashcard, 'id' | 'userId' | 'createdAt' | 'updatedAt' | 'reviewHistory' | 'lastReviewedAt'>[];
  }>('/api/study/learning/ai', {
    method: 'POST',
    body: JSON.stringify({ action: 'flashcards', ...params }),
  });
  return data.flashcards;
}

export async function extractTermsFromContent(params: {
  entryId?: string;
  content?: string;
  existingTerms?: string[];
}): Promise<Omit<DictionaryTerm, 'id' | 'userId' | 'createdAt' | 'updatedAt' | 'reviewCount' | 'lastReviewedAt'>[]> {
  const data = await apiCall<{
    success: boolean;
    terms: Omit<DictionaryTerm, 'id' | 'userId' | 'createdAt' | 'updatedAt' | 'reviewCount' | 'lastReviewedAt'>[];
  }>('/api/study/learning/ai', {
    method: 'POST',
    body: JSON.stringify({ action: 'terms', ...params }),
  });
  return data.terms;
}

export async function generateSummaryFromContent(params: {
  entryId?: string;
  content?: string;
  maxLength?: number;
}): Promise<{ summary: string; keyPoints: string[]; mainConcepts: string[] }> {
  const data = await apiCall<{
    success: boolean;
    summary: string;
    keyPoints: string[];
    mainConcepts: string[];
  }>('/api/study/learning/ai', {
    method: 'POST',
    body: JSON.stringify({ action: 'summary', ...params }),
  });
  return {
    summary: data.summary,
    keyPoints: data.keyPoints,
    mainConcepts: data.mainConcepts,
  };
}

export async function generateQuizFromLearningEntries(params: {
  entryIds: string[];
  questionCount?: number;
  difficulty?: QuizDifficulty;
}): Promise<unknown[]> {
  const data = await apiCall<{ success: boolean; questions: unknown[] }>(
    '/api/study/learning/ai',
    {
      method: 'POST',
      body: JSON.stringify({ action: 'quiz', ...params }),
    }
  );
  return data.questions;
}
