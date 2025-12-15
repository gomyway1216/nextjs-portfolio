// Study Tool Hooks
import { useState, useCallback, useEffect } from 'react';
import * as studyService from '@/services/studyService';
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
  // Learning Path types
  LearningPath,
  LearningPathStatus,
  DailyLearningPlan,
  LearningPathRecommendations,
  GenerateLearningPathRequest,
  StartTopicRequest,
  CompleteTopicRequest,
  UpdateLearningPath,
  GetDailyPlanRequest,
  UpdateDailyPlanItemRequest,
} from '@/types/study';

// ============================================================================
// CATEGORIES HOOK
// ============================================================================

export function useStudyCategories() {
  const [categories, setCategories] = useState<StudyCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchCategories = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await studyService.getCategories();
      setCategories(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch categories'));
    } finally {
      setLoading(false);
    }
  }, []);

  const createCategory = useCallback(
    async (category: Omit<StudyCategory, 'id' | 'createdAt' | 'updatedAt'>) => {
      const newCategory = await studyService.createCategory(category);
      setCategories((prev) => [...prev, newCategory]);
      return newCategory;
    },
    []
  );

  const updateCategory = useCallback(
    async (id: string, updates: Partial<StudyCategory>) => {
      await studyService.updateCategory(id, updates);
      setCategories((prev) =>
        prev.map((cat) => (cat.id === id ? { ...cat, ...updates } : cat))
      );
    },
    []
  );

  const deleteCategory = useCallback(async (id: string) => {
    await studyService.deleteCategory(id);
    setCategories((prev) => prev.filter((cat) => cat.id !== id));
  }, []);

  const seedCategories = useCallback(async () => {
    const result = await studyService.seedCategories();
    await fetchCategories();  // Refresh the list after seeding
    return result;
  }, [fetchCategories]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  return {
    categories,
    loading,
    error,
    fetchCategories,
    createCategory,
    updateCategory,
    deleteCategory,
    seedCategories,
  };
}

// ============================================================================
// TOPICS HOOK
// ============================================================================

export function useStudyTopics(categoryId?: string) {
  const [topics, setTopics] = useState<StudyTopic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchTopics = useCallback(
    async (options: { categoryId?: string; isActive?: boolean } = {}) => {
      try {
        setLoading(true);
        setError(null);
        const data = await studyService.getTopics({
          categoryId: options.categoryId || categoryId,
          ...options,
        });
        setTopics(data);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch topics'));
      } finally {
        setLoading(false);
      }
    },
    [categoryId]
  );

  const createTopic = useCallback(
    async (
      topic: Omit<
        StudyTopic,
        'id' | 'createdAt' | 'updatedAt' | 'timesGenerated' | 'lastGeneratedAt'
      >
    ) => {
      const newTopic = await studyService.createTopic(topic);
      setTopics((prev) => [...prev, newTopic]);
      return newTopic;
    },
    []
  );

  const updateTopic = useCallback(
    async (id: string, updates: Partial<StudyTopic>) => {
      await studyService.updateTopic(id, updates);
      setTopics((prev) =>
        prev.map((topic) => (topic.id === id ? { ...topic, ...updates } : topic))
      );
    },
    []
  );

  const deleteTopic = useCallback(async (id: string) => {
    await studyService.deleteTopic(id);
    setTopics((prev) => prev.filter((topic) => topic.id !== id));
  }, []);

  useEffect(() => {
    fetchTopics();
  }, [fetchTopics]);

  return {
    topics,
    loading,
    error,
    fetchTopics,
    createTopic,
    updateTopic,
    deleteTopic,
  };
}

// ============================================================================
// TOPIC SUGGESTIONS HOOK
// ============================================================================

export function useTopicSuggestions() {
  const [suggestions, setSuggestions] = useState<TopicSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchSuggestions = useCallback(
    async (options: {
      categoryId?: string;
      basedOnTopicIds?: string[];
      suggestionType: TopicSuggestionType;
      count: number;
      excludeTopicIds?: string[];
    }) => {
      try {
        setLoading(true);
        setError(null);
        const data = await studyService.suggestTopics(options);
        setSuggestions(data);
        return data;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch suggestions'));
        return [];
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return {
    suggestions,
    loading,
    error,
    fetchSuggestions,
  };
}

// ============================================================================
// ARTICLES HOOK
// ============================================================================

export function useStudyArticles(initialOptions?: {
  categoryId?: string;
  topicId?: string;
  status?: string;  // 'all' to show all statuses (for admin), or specific status
  language?: string;
  search?: string;  // Search query for backend filtering
  difficulty?: string;  // Difficulty filter
  orderBy?: string;
  orderDir?: 'asc' | 'desc';
  readStatus?: 'all' | 'unread' | 'read';  // Filter by read status
  userId?: string;  // User ID for read status filtering
}) {
  const [articles, setArticles] = useState<StudyArticle[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [readArticleIds, setReadArticleIds] = useState<Set<string>>(new Set());
  // Track current filters for load more
  const [currentFilters, setCurrentFilters] = useState<{
    categoryId?: string;
    topicId?: string;
    status?: string;
    language?: string;
    search?: string;
    difficulty?: string;
    orderBy?: string;
    orderDir?: 'asc' | 'desc';
    readStatus?: 'all' | 'unread' | 'read';
    userId?: string;
  }>({});

  const fetchArticles = useCallback(
    async (
      options: {
        categoryId?: string;
        topicId?: string;
        status?: string;
        language?: string;
        search?: string;  // Search query for backend filtering
        difficulty?: string;  // Difficulty filter
        orderBy?: string;
        orderDir?: 'asc' | 'desc';
        limit?: number;
        lastId?: string;
        append?: boolean;
        listView?: boolean;  // Default true for list views, false when full article data is needed
        readStatus?: 'all' | 'unread' | 'read';
        userId?: string;
      } = {}
    ) => {
      try {
        setLoading(true);
        setError(null);

        const filters = {
          categoryId: options.categoryId ?? initialOptions?.categoryId,
          topicId: options.topicId || initialOptions?.topicId,
          status: options.status || initialOptions?.status,
          language: options.language || initialOptions?.language,
          search: options.search ?? initialOptions?.search,
          difficulty: options.difficulty ?? initialOptions?.difficulty,
          orderBy: options.orderBy || initialOptions?.orderBy || 'createdAt',
          orderDir: options.orderDir || initialOptions?.orderDir || 'desc',
          readStatus: options.readStatus ?? initialOptions?.readStatus,
          userId: options.userId ?? initialOptions?.userId,
        };

        // Save current filters for load more (only if not appending)
        if (!options.append) {
          setCurrentFilters(filters);
        }

        const data = await studyService.getArticles({
          ...filters,
          limit: options.limit,
          lastId: options.lastId,
          listView: options.listView !== false,  // Default to true for optimized list loading
        });

        if (options.append) {
          setArticles((prev) => [...prev, ...data.articles]);
        } else {
          setArticles(data.articles);
        }
        setHasMore(data.hasMore);

        // Update read article IDs from backend
        if (data.readArticleIds) {
          setReadArticleIds(new Set(data.readArticleIds));
        }
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch articles'));
      } finally {
        setLoading(false);
      }
    },
    [initialOptions?.categoryId, initialOptions?.topicId, initialOptions?.status, initialOptions?.language, initialOptions?.search, initialOptions?.difficulty, initialOptions?.orderBy, initialOptions?.orderDir, initialOptions?.readStatus, initialOptions?.userId]
  );

  const loadMore = useCallback(async () => {
    if (!hasMore || loading || articles.length === 0) return;
    const lastId = articles[articles.length - 1].id;
    // Use saved filters when loading more to maintain consistency
    await fetchArticles({
      ...currentFilters,
      lastId,
      append: true,
    });
  }, [hasMore, loading, articles, fetchArticles, currentFilters]);

  useEffect(() => {
    fetchArticles();
  }, [fetchArticles]);

  // Helper function to check if an article is read
  const isArticleRead = useCallback((articleId: string) => {
    return readArticleIds.has(articleId);
  }, [readArticleIds]);

  return {
    articles,
    hasMore,
    loading,
    error,
    fetchArticles,
    loadMore,
    readArticleIds,
    isArticleRead,
  };
}

// ============================================================================
// ARTICLE COUNTS HOOK - Efficient separate endpoint for read/unread counts
// ============================================================================

export function useArticleCounts(userId: string | undefined) {
  const [counts, setCounts] = useState<{ total: number; read: number; unread: number }>({
    total: 0,
    read: 0,
    unread: 0,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchCounts = useCallback(async () => {
    if (!userId) {
      setCounts({ total: 0, read: 0, unread: 0 });
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const data = await studyService.getArticleCounts(userId);
      setCounts(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch counts'));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchCounts();
  }, [fetchCounts]);

  return { counts, loading, error, refetch: fetchCounts };
}

// ============================================================================
// SINGLE ARTICLE HOOK
// ============================================================================

export function useStudyArticle(articleId: string | null) {
  const [article, setArticle] = useState<StudyArticle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchArticle = useCallback(async () => {
    if (!articleId) {
      setArticle(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const data = await studyService.getArticle(articleId);
      setArticle(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch article'));
    } finally {
      setLoading(false);
    }
  }, [articleId]);

  useEffect(() => {
    fetchArticle();
  }, [fetchArticle]);

  return {
    article,
    loading,
    error,
    fetchArticle,
  };
}

// ============================================================================
// ARTICLE GENERATION HOOK
// ============================================================================

export function useArticleGeneration() {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [result, setResult] = useState<{
    article: StudyArticle;
    quizId?: string;
  } | null>(null);

  const generateArticle = useCallback(
    async (options: {
      topicId?: string;
      topicName?: string;
      categoryId: string;
      aiProvider: AIProvider;
      difficulty?: QuizDifficulty;  // Optional - AI decides if not provided
      includeQuiz: boolean;
      numberOfQuestions: number;
      customPrompt?: string;
      language?: string;  // Output language (e.g., "en", "ja")
      codingLanguage?: string;  // Preferred coding language for examples
    }) => {
      try {
        setGenerating(true);
        setError(null);
        const data = await studyService.generateArticle(options);
        setResult(data);
        return data;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to generate article'));
        return null;
      } finally {
        setGenerating(false);
      }
    },
    []
  );

  return {
    generating,
    error,
    result,
    generateArticle,
  };
}

// ============================================================================
// ARTICLE NOTES HOOK
// ============================================================================

export function useArticleNotes(articleId: string | null) {
  const [notes, setNotes] = useState<ArticleNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchNotes = useCallback(async () => {
    if (!articleId) {
      setNotes([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const data = await studyService.getArticleNotes(articleId);
      setNotes(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch notes'));
    } finally {
      setLoading(false);
    }
  }, [articleId]);

  const createNote = useCallback(
    async (note: { content: string; sectionId?: string; highlightedText?: string }) => {
      if (!articleId) return null;
      const newNote = await studyService.createArticleNote(articleId, note);
      setNotes((prev) => [newNote, ...prev]);
      return newNote;
    },
    [articleId]
  );

  const updateNote = useCallback(
    async (noteId: string, content: string) => {
      await studyService.updateArticleNote(noteId, content);
      setNotes((prev) =>
        prev.map((note) => (note.id === noteId ? { ...note, content } : note))
      );
    },
    []
  );

  const deleteNote = useCallback(async (noteId: string) => {
    await studyService.deleteArticleNote(noteId);
    setNotes((prev) => prev.filter((note) => note.id !== noteId));
  }, []);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  return {
    notes,
    loading,
    error,
    fetchNotes,
    createNote,
    updateNote,
    deleteNote,
  };
}

// ============================================================================
// ARTICLE CHAT HOOK
// ============================================================================

export function useArticleChat(articleId: string | null) {
  const [chat, setChat] = useState<ArticleChat | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchChat = useCallback(async () => {
    if (!articleId) {
      setChat(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const data = await studyService.getArticleChat(articleId);
      setChat(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch chat'));
    } finally {
      setLoading(false);
    }
  }, [articleId]);

  const sendMessage = useCallback(
    async (message: string) => {
      if (!articleId) return null;

      try {
        setSending(true);
        const response = await studyService.sendChatMessage(articleId, message);

        // Update local chat state
        setChat((prev) => {
          if (!prev) {
            return {
              id: '',
              articleId,
              userId: '',
              messages: [
                { id: '', role: 'user' as const, content: message, timestamp: new Date().toISOString() },
                {
                  id: response.messageId,
                  role: 'assistant' as const,
                  content: response.response,
                  timestamp: new Date().toISOString(),
                },
              ],
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };
          }

          return {
            ...prev,
            messages: [
              ...prev.messages,
              { id: '', role: 'user' as const, content: message, timestamp: new Date().toISOString() },
              {
                id: response.messageId,
                role: 'assistant' as const,
                content: response.response,
                timestamp: new Date().toISOString(),
              },
            ],
          };
        });

        return response;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to send message'));
        return null;
      } finally {
        setSending(false);
      }
    },
    [articleId]
  );

  const generateSummary = useCallback(async () => {
    if (!articleId) return null;

    try {
      const summary = await studyService.generateChatSummary(articleId);
      setChat((prev) => (prev ? { ...prev, summary } : prev));
      return summary;
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to generate summary'));
      return null;
    }
  }, [articleId]);

  useEffect(() => {
    fetchChat();
  }, [fetchChat]);

  return {
    chat,
    loading,
    sending,
    error,
    fetchChat,
    sendMessage,
    generateSummary,
  };
}

// ============================================================================
// QUIZ HOOK
// ============================================================================

export function useStudyQuiz(quizId: string | null) {
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<QuizAttempt | null>(null);

  const fetchQuiz = useCallback(async () => {
    if (!quizId) {
      setQuiz(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const data = await studyService.getQuiz(quizId);
      setQuiz(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch quiz'));
    } finally {
      setLoading(false);
    }
  }, [quizId]);

  const submitQuiz = useCallback(
    async (answers: QuizAnswer[], startedAt: string) => {
      if (!quizId) return null;

      try {
        setSubmitting(true);
        const attempt = await studyService.submitQuiz(quizId, answers, startedAt);
        setResult(attempt);
        return attempt;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to submit quiz'));
        return null;
      } finally {
        setSubmitting(false);
      }
    },
    [quizId]
  );

  useEffect(() => {
    fetchQuiz();
  }, [fetchQuiz]);

  return {
    quiz,
    loading,
    error,
    submitting,
    result,
    fetchQuiz,
    submitQuiz,
  };
}

// ============================================================================
// QUIZZES LIST HOOK
// ============================================================================

export function useStudyQuizzes(options?: {
  articleId?: string;
  categoryId?: string;
  topicId?: string;
}) {
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Extract individual values to use as stable dependencies
  const articleId = options?.articleId;
  const categoryId = options?.categoryId;
  const topicId = options?.topicId;

  const fetchQuizzes = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await studyService.getQuizzes({ articleId, categoryId, topicId });
      setQuizzes(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch quizzes'));
    } finally {
      setLoading(false);
    }
  }, [articleId, categoryId, topicId]);

  useEffect(() => {
    fetchQuizzes();
  }, [fetchQuizzes]);

  return {
    quizzes,
    loading,
    error,
    fetchQuizzes,
  };
}

// ============================================================================
// QUIZ ATTEMPTS HOOK
// ============================================================================

export function useQuizAttempts(quizId?: string) {
  const [attempts, setAttempts] = useState<QuizAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchAttempts = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await studyService.getQuizAttempts(quizId);
      setAttempts(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch attempts'));
    } finally {
      setLoading(false);
    }
  }, [quizId]);

  useEffect(() => {
    fetchAttempts();
  }, [fetchAttempts]);

  return {
    attempts,
    loading,
    error,
    fetchAttempts,
  };
}

// ============================================================================
// SCHEDULES HOOK
// ============================================================================

export function useStudySchedules() {
  const [schedules, setSchedules] = useState<ArticleSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchSchedules = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await studyService.getSchedules();
      setSchedules(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch schedules'));
    } finally {
      setLoading(false);
    }
  }, []);

  const createSchedule = useCallback(
    async (
      schedule: Omit<
        ArticleSchedule,
        'id' | 'createdAt' | 'updatedAt' | 'lastRunAt' | 'nextRunAt' | 'articlesGenerated'
      >
    ) => {
      const newSchedule = await studyService.createSchedule(schedule);
      setSchedules((prev) => [...prev, newSchedule]);
      return newSchedule;
    },
    []
  );

  const updateSchedule = useCallback(
    async (id: string, updates: Partial<ArticleSchedule>) => {
      await studyService.updateSchedule(id, updates);
      setSchedules((prev) =>
        prev.map((schedule) =>
          schedule.id === id ? { ...schedule, ...updates } : schedule
        )
      );
    },
    []
  );

  const deleteSchedule = useCallback(async (id: string) => {
    await studyService.deleteSchedule(id);
    setSchedules((prev) => prev.filter((schedule) => schedule.id !== id));
  }, []);

  const runScheduleNow = useCallback(async (scheduleId: string) => {
    return await studyService.runScheduleNow(scheduleId);
  }, []);

  useEffect(() => {
    fetchSchedules();
  }, [fetchSchedules]);

  return {
    schedules,
    loading,
    error,
    fetchSchedules,
    createSchedule,
    updateSchedule,
    deleteSchedule,
    runScheduleNow,
  };
}

// ============================================================================
// PROGRESS HOOK
// ============================================================================

export function useStudyProgress(isAuthenticated?: boolean) {
  const [progress, setProgress] = useState<UserStudyProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchProgress = useCallback(async () => {
    // Skip API call if explicitly not authenticated
    if (isAuthenticated === false) {
      setLoading(false);
      setProgress(null);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const data = await studyService.getUserProgress();
      setProgress(data);
    } catch (err) {
      // Don't set error for auth failures - user might not be logged in
      if (err instanceof Error && !err.message.includes('401') && !err.message.includes('500')) {
        setError(err instanceof Error ? err : new Error('Failed to fetch progress'));
      }
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    fetchProgress();
  }, [fetchProgress]);

  return {
    progress,
    loading,
    error,
    fetchProgress,
  };
}

// ============================================================================
// LEARNING INSIGHTS HOOK
// ============================================================================

export function useLearningInsights() {
  const [insights, setInsights] = useState<LearningInsight[]>([]);
  const [overallProgress, setOverallProgress] = useState<{
    totalProgress: number;
    trend: 'improving' | 'stable' | 'declining';
    suggestedFocus: string[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchInsights = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await studyService.getLearningInsights();
      setInsights(data.insights);
      setOverallProgress(data.overallProgress);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch insights'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInsights();
  }, [fetchInsights]);

  return {
    insights,
    overallProgress,
    loading,
    error,
    fetchInsights,
  };
}

// ============================================================================
// CONFIG HOOK
// ============================================================================

export function useStudyConfig() {
  const [config, setConfig] = useState<StudyConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchConfig = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await studyService.getStudyConfig();
      setConfig(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch config'));
    } finally {
      setLoading(false);
    }
  }, []);

  const updateConfig = useCallback(
    async (updates: Partial<StudyConfig>) => {
      await studyService.updateStudyConfig(updates);
      setConfig((prev) => (prev ? { ...prev, ...updates } : prev));
    },
    []
  );

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  return {
    config,
    loading,
    error,
    fetchConfig,
    updateConfig,
  };
}

// ============================================================================
// SEARCH HOOK
// ============================================================================

export function useStudySearch() {
  const [results, setResults] = useState<{
    articles: Array<{ id: string; title: string; summary: string; categoryId: string }>;
    quizzes: Array<{ id: string; title: string; description: string }>;
    topics: Array<{ id: string; name: string; description: string; categoryId: string }>;
  }>({ articles: [], quizzes: [], topics: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const search = useCallback(
    async (query: string, type?: 'articles' | 'quizzes' | 'topics') => {
      if (!query || query.length < 2) {
        setResults({ articles: [], quizzes: [], topics: [] });
        return;
      }

      try {
        setLoading(true);
        setError(null);
        const data = await studyService.searchStudyContent(query, type);
        setResults(data);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to search'));
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const clearResults = useCallback(() => {
    setResults({ articles: [], quizzes: [], topics: [] });
  }, []);

  return {
    results,
    loading,
    error,
    search,
    clearResults,
  };
}

// ============================================================================
// ARTICLE READ HISTORY HOOK (Admin feature)
// ============================================================================

export function useArticleReadHistory(isAuthenticated?: boolean) {
  const [readArticleIds, setReadArticleIds] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchReadHistory = useCallback(async () => {
    // Skip API call if explicitly not authenticated
    if (isAuthenticated === false) {
      setLoading(false);
      setReadArticleIds({});
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const data = await studyService.getReadHistory();
      setReadArticleIds(data.readArticleIds);
    } catch (err) {
      // Don't set error for auth failures - user might not be logged in
      if (err instanceof Error && !err.message.includes('401')) {
        setError(err);
      }
      setReadArticleIds({});
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  const markAsRead = useCallback(async (articleId: string, timeSpentSeconds?: number) => {
    try {
      await studyService.markArticleAsReadAdmin(articleId, timeSpentSeconds);
      setReadArticleIds((prev) => ({
        ...prev,
        [articleId]: new Date().toISOString(),
      }));
      return true;
    } catch (err) {
      console.error('Failed to mark article as read:', err);
      return false;
    }
  }, []);

  const unmarkAsRead = useCallback(async (articleId: string) => {
    try {
      await studyService.unmarkArticleAsRead(articleId);
      setReadArticleIds((prev) => {
        const updated = { ...prev };
        delete updated[articleId];
        return updated;
      });
      return true;
    } catch (err) {
      console.error('Failed to unmark article as read:', err);
      return false;
    }
  }, []);

  const isRead = useCallback(
    (articleId: string) => articleId in readArticleIds,
    [readArticleIds]
  );

  useEffect(() => {
    fetchReadHistory();
  }, [fetchReadHistory]);

  return {
    readArticleIds,
    loading,
    error,
    fetchReadHistory,
    markAsRead,
    unmarkAsRead,
    isRead,
  };
}

// ============================================================================
// LEARNING ENTRIES HOOK
// ============================================================================

export function useLearningEntries(initialParams?: {
  categoryId?: string;
  sourceType?: LearningSourceType;
  tags?: string;
  search?: string;
}) {
  const [entries, setEntries] = useState<LearningEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchEntries = useCallback(
    async (params?: {
      categoryId?: string;
      sourceType?: LearningSourceType;
      tags?: string;
      search?: string;
      limit?: number;
      offset?: number;
    }) => {
      try {
        setLoading(true);
        setError(null);
        const data = await studyService.getLearningEntries(params || initialParams);
        setEntries(data);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch entries'));
      } finally {
        setLoading(false);
      }
    },
    [initialParams]
  );

  const createEntry = useCallback(
    async (entry: CreateLearningEntryRequest) => {
      const newEntry = await studyService.createLearningEntry(entry);
      setEntries((prev) => [newEntry, ...prev]);
      return newEntry;
    },
    []
  );

  const updateEntry = useCallback(
    async (entryId: string, updates: Partial<LearningEntry>) => {
      await studyService.updateLearningEntry(entryId, updates);
      setEntries((prev) =>
        prev.map((e) => (e.id === entryId ? { ...e, ...updates } : e))
      );
    },
    []
  );

  const deleteEntry = useCallback(async (entryId: string) => {
    await studyService.deleteLearningEntry(entryId);
    setEntries((prev) => prev.filter((e) => e.id !== entryId));
  }, []);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  return {
    entries,
    loading,
    error,
    fetchEntries,
    createEntry,
    updateEntry,
    deleteEntry,
  };
}

// ============================================================================
// DICTIONARY HOOK
// ============================================================================

export function useDictionary(initialParams?: {
  category?: string;
  search?: string;
}) {
  const [terms, setTerms] = useState<DictionaryTerm[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchTerms = useCallback(
    async (params?: { category?: string; search?: string; limit?: number }) => {
      try {
        setLoading(true);
        setError(null);
        const data = await studyService.getDictionaryTerms(params || initialParams);
        setTerms(data);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch terms'));
      } finally {
        setLoading(false);
      }
    },
    [initialParams]
  );

  const createTerm = useCallback(
    async (
      term: Omit<DictionaryTerm, 'id' | 'userId' | 'createdAt' | 'updatedAt' | 'reviewCount' | 'lastReviewedAt'>
    ) => {
      const newTerm = await studyService.createDictionaryTerm(term);
      setTerms((prev) => [...prev, newTerm].sort((a, b) => a.term.localeCompare(b.term)));
      return newTerm;
    },
    []
  );

  const updateTerm = useCallback(
    async (termId: string, updates: Partial<DictionaryTerm>) => {
      await studyService.updateDictionaryTerm(termId, updates);
      setTerms((prev) =>
        prev.map((t) => (t.id === termId ? { ...t, ...updates } : t))
      );
    },
    []
  );

  const deleteTerm = useCallback(async (termId: string) => {
    await studyService.deleteDictionaryTerm(termId);
    setTerms((prev) => prev.filter((t) => t.id !== termId));
  }, []);

  useEffect(() => {
    fetchTerms();
  }, [fetchTerms]);

  return {
    terms,
    loading,
    error,
    fetchTerms,
    createTerm,
    updateTerm,
    deleteTerm,
  };
}

// ============================================================================
// FLASHCARDS HOOK
// ============================================================================

export function useFlashcards(params?: {
  deckId?: string;
  categoryId?: string;
  dueOnly?: boolean;
}) {
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [decks, setDecks] = useState<FlashcardDeck[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchFlashcards = useCallback(
    async (fetchParams?: {
      deckId?: string;
      categoryId?: string;
      dueOnly?: boolean;
      limit?: number;
    }) => {
      try {
        setLoading(true);
        setError(null);
        const data = await studyService.getFlashcards(fetchParams || params);
        setFlashcards(data);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch flashcards'));
      } finally {
        setLoading(false);
      }
    },
    [params]
  );

  const fetchDecks = useCallback(async () => {
    try {
      const data = await studyService.getFlashcardDecks();
      setDecks(data);
    } catch (err) {
      console.error('Failed to fetch decks:', err);
    }
  }, []);

  const createFlashcard = useCallback(
    async (
      flashcard: Omit<Flashcard, 'id' | 'userId' | 'createdAt' | 'updatedAt' | 'reviewHistory' | 'lastReviewedAt'>
    ) => {
      const newFlashcard = await studyService.createFlashcard(flashcard);
      setFlashcards((prev) => [...prev, newFlashcard]);
      return newFlashcard;
    },
    []
  );

  const updateFlashcard = useCallback(
    async (flashcardId: string, updates: Partial<Flashcard>) => {
      const updatedFlashcard = await studyService.updateFlashcard(flashcardId, updates);
      setFlashcards((prev) =>
        prev.map((f) => (f.id === flashcardId ? updatedFlashcard : f))
      );
      return updatedFlashcard;
    },
    []
  );

  const deleteFlashcard = useCallback(async (flashcardId: string) => {
    await studyService.deleteFlashcard(flashcardId);
    setFlashcards((prev) => prev.filter((f) => f.id !== flashcardId));
  }, []);

  const createDeck = useCallback(
    async (
      deck: Omit<FlashcardDeck, 'id' | 'userId' | 'createdAt' | 'updatedAt' | 'cardsDue' | 'cardsNew'>
    ) => {
      const newDeck = await studyService.createFlashcardDeck(deck);
      setDecks((prev) => [...prev, newDeck]);
      return newDeck;
    },
    []
  );

  const deleteDeck = useCallback(async (deckId: string) => {
    await studyService.deleteFlashcardDeck(deckId);
    setDecks((prev) => prev.filter((d) => d.id !== deckId));
    // Also remove flashcards from this deck from the local state
    setFlashcards((prev) => prev.filter((f) => f.deckId !== deckId));
  }, []);

  useEffect(() => {
    fetchFlashcards();
    fetchDecks();
  }, [fetchFlashcards, fetchDecks]);

  return {
    flashcards,
    decks,
    loading,
    error,
    fetchFlashcards,
    fetchDecks,
    createFlashcard,
    updateFlashcard,
    deleteFlashcard,
    createDeck,
    deleteDeck,
  };
}

// ============================================================================
// SPACED REPETITION REVIEW HOOK
// ============================================================================

export function useSpacedRepetition(params?: {
  itemType?: 'flashcard' | 'dictionary' | 'mixed';
  deckId?: string;
  categoryId?: string;
}) {
  const [dueFlashcards, setDueFlashcards] = useState<Flashcard[]>([]);
  const [dueTerms, setDueTerms] = useState<DictionaryTerm[]>([]);
  const [totalDue, setTotalDue] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [reviewing, setReviewing] = useState(false);

  const fetchDueItems = useCallback(
    async (fetchParams?: {
      itemType?: 'flashcard' | 'dictionary' | 'mixed';
      deckId?: string;
      categoryId?: string;
      limit?: number;
    }) => {
      try {
        setLoading(true);
        setError(null);
        const data = await studyService.getDueReviewItems(fetchParams || params);
        setDueFlashcards(data.flashcards);
        setDueTerms(data.dictionaryTerms);
        setTotalDue(data.totalDue);
        setCurrentIndex(0);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch due items'));
      } finally {
        setLoading(false);
      }
    },
    [params]
  );

  const submitReview = useCallback(
    async (
      itemId: string,
      itemType: 'flashcard' | 'dictionary_term',
      difficulty: FlashcardDifficulty,
      timeTaken: number
    ) => {
      setReviewing(true);
      try {
        const result = await studyService.submitReview({
          itemId,
          itemType,
          difficulty,
          timeTaken,
        });

        // Move to next item
        setCurrentIndex((prev) => prev + 1);

        return result;
      } finally {
        setReviewing(false);
      }
    },
    []
  );

  const getCurrentItem = useCallback(() => {
    const allItems = [
      ...dueFlashcards.map((f) => ({ ...f, type: 'flashcard' as const })),
      ...dueTerms.map((t) => ({ ...t, type: 'dictionary_term' as const })),
    ];
    return allItems[currentIndex] || null;
  }, [dueFlashcards, dueTerms, currentIndex]);

  const isComplete = currentIndex >= dueFlashcards.length + dueTerms.length;

  useEffect(() => {
    fetchDueItems();
  }, [fetchDueItems]);

  return {
    dueFlashcards,
    dueTerms,
    totalDue,
    currentIndex,
    loading,
    error,
    reviewing,
    isComplete,
    fetchDueItems,
    submitReview,
    getCurrentItem,
  };
}

// ============================================================================
// LEARNING STATS HOOK
// ============================================================================

export function useLearningStats() {
  const [stats, setStats] = useState<LearningStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await studyService.getLearningStats();
      setStats(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch learning stats'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return {
    stats,
    loading,
    error,
    fetchStats,
  };
}

// ============================================================================
// QUICK CAPTURE HOOK
// ============================================================================

export function useQuickCapture() {
  const [captures, setCaptures] = useState<QuickCapture[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchCaptures = useCallback(
    async (status?: 'pending' | 'processed' | 'archived') => {
      try {
        setLoading(true);
        setError(null);
        const data = await studyService.getQuickCaptures(status);
        setCaptures(data);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch captures'));
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const createCapture = useCallback(
    async (capture: {
      content: string;
      sourceType?: LearningSourceType;
      sourceUrl?: string;
      tags?: string[];
    }) => {
      const newCapture = await studyService.createQuickCapture(capture);
      setCaptures((prev) => [newCapture, ...prev]);
      return newCapture;
    },
    []
  );

  return {
    captures,
    loading,
    error,
    fetchCaptures,
    createCapture,
  };
}

// ============================================================================
// AI GENERATION HOOK
// ============================================================================

export function useLearningAI() {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const generateFlashcards = useCallback(
    async (params: {
      entryId?: string;
      content?: string;
      count?: number;
      difficulty?: QuizDifficulty;
    }) => {
      try {
        setGenerating(true);
        setError(null);
        return await studyService.generateFlashcardsFromContent(params);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to generate flashcards'));
        throw err;
      } finally {
        setGenerating(false);
      }
    },
    []
  );

  const extractTerms = useCallback(
    async (params: {
      entryId?: string;
      content?: string;
      existingTerms?: string[];
    }) => {
      try {
        setGenerating(true);
        setError(null);
        return await studyService.extractTermsFromContent(params);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to extract terms'));
        throw err;
      } finally {
        setGenerating(false);
      }
    },
    []
  );

  const generateSummary = useCallback(
    async (params: { entryId?: string; content?: string; maxLength?: number }) => {
      try {
        setGenerating(true);
        setError(null);
        return await studyService.generateSummaryFromContent(params);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to generate summary'));
        throw err;
      } finally {
        setGenerating(false);
      }
    },
    []
  );

  const generateQuizFromEntries = useCallback(
    async (params: {
      entryIds: string[];
      questionCount?: number;
      difficulty?: QuizDifficulty;
    }) => {
      try {
        setGenerating(true);
        setError(null);
        return await studyService.generateQuizFromLearningEntries(params);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to generate quiz'));
        throw err;
      } finally {
        setGenerating(false);
      }
    },
    []
  );

  return {
    generating,
    error,
    generateFlashcards,
    extractTerms,
    generateSummary,
    generateQuizFromEntries,
  };
}

// ============================================================================
// LEARNING PATHS HOOK
// ============================================================================

export function useLearningPaths(initialParams?: { status?: LearningPathStatus; limit?: number }) {
  const [paths, setPaths] = useState<LearningPath[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [creating, setCreating] = useState(false);

  const fetchPaths = useCallback(
    async (params?: { status?: LearningPathStatus; limit?: number }) => {
      try {
        setLoading(true);
        setError(null);
        const data = await studyService.getLearningPaths(params || initialParams);
        setPaths(data);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch learning paths'));
      } finally {
        setLoading(false);
      }
    },
    [initialParams]
  );

  useEffect(() => {
    fetchPaths();
  }, [fetchPaths]);

  const createPath = useCallback(
    async (request: GenerateLearningPathRequest) => {
      try {
        setCreating(true);
        setError(null);
        const result = await studyService.createLearningPath(request);
        setPaths((prev) => [result.path, ...prev]);
        return result;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to create learning path'));
        throw err;
      } finally {
        setCreating(false);
      }
    },
    []
  );

  const updatePath = useCallback(async (pathId: string, updates: UpdateLearningPath) => {
    try {
      setError(null);
      const updated = await studyService.updateLearningPath(pathId, updates);
      setPaths((prev) => prev.map((p) => (p.id === pathId ? updated : p)));
      return updated;
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to update learning path'));
      throw err;
    }
  }, []);

  const deletePath = useCallback(async (pathId: string) => {
    try {
      setError(null);
      await studyService.deleteLearningPath(pathId);
      setPaths((prev) => prev.filter((p) => p.id !== pathId));
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to delete learning path'));
      throw err;
    }
  }, []);

  return {
    paths,
    loading,
    error,
    creating,
    fetchPaths,
    createPath,
    updatePath,
    deletePath,
  };
}

// ============================================================================
// SINGLE LEARNING PATH HOOK
// ============================================================================

export function useLearningPath(pathId: string | null) {
  const [path, setPath] = useState<LearningPath | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [updating, setUpdating] = useState(false);

  const fetchPath = useCallback(async () => {
    if (!pathId) {
      setPath(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const data = await studyService.getLearningPath(pathId);
      setPath(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch learning path'));
    } finally {
      setLoading(false);
    }
  }, [pathId]);

  useEffect(() => {
    fetchPath();
  }, [fetchPath]);

  const startTopic = useCallback(
    async (topicId: string, generateContent = true) => {
      if (!pathId) return;

      try {
        setUpdating(true);
        setError(null);
        const result = await studyService.startLearningPathTopic({
          pathId,
          topicId,
          generateContent,
        });
        // Refresh path to get updated state
        await fetchPath();
        return result;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to start topic'));
        throw err;
      } finally {
        setUpdating(false);
      }
    },
    [pathId, fetchPath]
  );

  const completeTopic = useCallback(
    async (topicId: string) => {
      if (!pathId) return;

      try {
        setUpdating(true);
        setError(null);
        const result = await studyService.completeLearningPathTopic({
          pathId,
          topicId,
        });
        // Refresh path to get updated state
        await fetchPath();
        return result;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to complete topic'));
        throw err;
      } finally {
        setUpdating(false);
      }
    },
    [pathId, fetchPath]
  );

  const updatePath = useCallback(
    async (updates: UpdateLearningPath) => {
      if (!pathId) return;

      try {
        setUpdating(true);
        setError(null);
        const updated = await studyService.updateLearningPath(pathId, updates);
        setPath(updated);
        return updated;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to update learning path'));
        throw err;
      } finally {
        setUpdating(false);
      }
    },
    [pathId]
  );

  return {
    path,
    loading,
    error,
    updating,
    fetchPath,
    startTopic,
    completeTopic,
    updatePath,
  };
}

// ============================================================================
// DAILY LEARNING PLAN HOOK
// ============================================================================

export function useDailyLearningPlan(initialParams?: GetDailyPlanRequest) {
  const [plan, setPlan] = useState<DailyLearningPlan | null>(null);
  const [motivationalMessage, setMotivationalMessage] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [updating, setUpdating] = useState(false);

  const fetchPlan = useCallback(
    async (params?: GetDailyPlanRequest) => {
      try {
        setLoading(true);
        setError(null);
        const result = await studyService.getDailyLearningPlan(params || initialParams);
        setPlan(result.plan);
        setMotivationalMessage(result.motivationalMessage);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch daily plan'));
      } finally {
        setLoading(false);
      }
    },
    [initialParams]
  );

  useEffect(() => {
    fetchPlan();
  }, [fetchPlan]);

  const regeneratePlan = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await studyService.getDailyLearningPlan({
        ...initialParams,
        regenerate: true,
      });
      setPlan(result.plan);
      setMotivationalMessage(result.motivationalMessage);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to regenerate daily plan'));
      throw err;
    } finally {
      setLoading(false);
    }
  }, [initialParams]);

  const completeItem = useCallback(
    async (itemId: string, actualTime?: number) => {
      if (!plan) return;

      try {
        setUpdating(true);
        setError(null);
        const result = await studyService.updateDailyPlanItem({
          planId: plan.id,
          itemId,
          completed: true,
          actualTime,
        });

        // Update local state
        setPlan((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            items: prev.items.map((item) =>
              item.id === itemId ? { ...item, completed: true } : item
            ),
            completedItems: result.completedItems,
            completed: result.completed,
          };
        });

        return result;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to complete item'));
        throw err;
      } finally {
        setUpdating(false);
      }
    },
    [plan]
  );

  const uncompleteItem = useCallback(
    async (itemId: string) => {
      if (!plan) return;

      try {
        setUpdating(true);
        setError(null);
        const result = await studyService.updateDailyPlanItem({
          planId: plan.id,
          itemId,
          completed: false,
        });

        // Update local state
        setPlan((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            items: prev.items.map((item) =>
              item.id === itemId ? { ...item, completed: false } : item
            ),
            completedItems: result.completedItems,
            completed: result.completed,
          };
        });

        return result;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to uncomplete item'));
        throw err;
      } finally {
        setUpdating(false);
      }
    },
    [plan]
  );

  return {
    plan,
    motivationalMessage,
    loading,
    error,
    updating,
    fetchPlan,
    regeneratePlan,
    completeItem,
    uncompleteItem,
  };
}
