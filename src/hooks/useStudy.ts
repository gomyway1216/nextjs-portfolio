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
  orderBy?: string;
  orderDir?: 'asc' | 'desc';
}) {
  const [articles, setArticles] = useState<StudyArticle[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchArticles = useCallback(
    async (
      options: {
        categoryId?: string;
        topicId?: string;
        status?: string;
        language?: string;
        orderBy?: string;
        orderDir?: 'asc' | 'desc';
        limit?: number;
        lastId?: string;
        append?: boolean;
        listView?: boolean;  // Default true for list views, false when full article data is needed
      } = {}
    ) => {
      try {
        setLoading(true);
        setError(null);
        const data = await studyService.getArticles({
          categoryId: options.categoryId ?? initialOptions?.categoryId,
          topicId: options.topicId || initialOptions?.topicId,
          status: options.status || initialOptions?.status,
          language: options.language || initialOptions?.language,
          orderBy: options.orderBy || initialOptions?.orderBy || 'createdAt',
          orderDir: options.orderDir || initialOptions?.orderDir || 'desc',
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
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch articles'));
      } finally {
        setLoading(false);
      }
    },
    [initialOptions?.categoryId, initialOptions?.topicId, initialOptions?.status, initialOptions?.language, initialOptions?.orderBy, initialOptions?.orderDir]
  );

  const loadMore = useCallback(async () => {
    if (!hasMore || loading || articles.length === 0) return;
    const lastId = articles[articles.length - 1].id;
    await fetchArticles({
      lastId,
      append: true,
    });
  }, [hasMore, loading, articles, fetchArticles]);

  useEffect(() => {
    fetchArticles();
  }, [fetchArticles]);

  return {
    articles,
    hasMore,
    loading,
    error,
    fetchArticles,
    loadMore,
  };
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

export function useStudyProgress() {
  const [progress, setProgress] = useState<UserStudyProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchProgress = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await studyService.getUserProgress();
      setProgress(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch progress'));
    } finally {
      setLoading(false);
    }
  }, []);

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

export function useArticleReadHistory() {
  const [readArticleIds, setReadArticleIds] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchReadHistory = useCallback(async () => {
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
  }, []);

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
