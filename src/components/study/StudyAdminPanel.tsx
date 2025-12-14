'use client';

import { useState, CSSProperties } from 'react';
import {
  BookOpen,
  Tags,
  FileText,
  Calendar,
  BarChart3,
  Settings,
  Plus,
  Pencil,
  Trash2,
  Play,
  Pause,
  Loader2,
  Save,
  X,
  Sparkles,
  Clock,
  CheckCircle,
  AlertCircle,
} from 'lucide-react';
import {
  useStudyCategories,
  useStudyTopics,
  useStudySchedules,
  useStudyConfig,
  useTopicSuggestions,
  useArticleGeneration,
  useStudyArticles,
} from '@/hooks/useStudy';
import * as studyService from '@/services/studyService';
import {
  StudyCategory,
  StudyTopic,
  StudyArticle,
  ArticleSchedule,
  AIProvider,
  QuizDifficulty,
  ScheduleStatus,
  TopicSuggestionType,
  ScheduleFrequency,
  ArticleStatus,
} from '@/types/study';

type StudyAdminSection = 'overview' | 'categories' | 'topics' | 'articles' | 'schedules' | 'generate' | 'config';

// Helper functions for local time <-> UTC conversion
// Convert local time (HH:MM) to UTC time (HH:MM)
function localTimeToUTC(localTime: string): string {
  const [hours, minutes] = localTime.split(':').map(Number);
  const now = new Date();
  now.setHours(hours, minutes, 0, 0);
  const utcHours = now.getUTCHours().toString().padStart(2, '0');
  const utcMinutes = now.getUTCMinutes().toString().padStart(2, '0');
  return `${utcHours}:${utcMinutes}`;
}

// Convert UTC time (HH:MM) to local time (HH:MM)
function utcTimeToLocal(utcTime: string): string {
  const [hours, minutes] = utcTime.split(':').map(Number);
  const now = new Date();
  now.setUTCHours(hours, minutes, 0, 0);
  const localHours = now.getHours().toString().padStart(2, '0');
  const localMinutes = now.getMinutes().toString().padStart(2, '0');
  return `${localHours}:${localMinutes}`;
}

// Shared styles (matching admin page)
const styles: Record<string, CSSProperties> = {
  card: {
    backgroundColor: 'rgba(30, 41, 59, 0.5)',
    backdropFilter: 'blur(8px)',
    borderRadius: '16px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    overflow: 'hidden',
  },
  button: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 20px',
    borderRadius: '8px',
    border: 'none',
    cursor: 'pointer',
    fontWeight: '500',
    fontSize: '14px',
    transition: 'all 0.2s',
  },
  primaryButton: {
    background: 'linear-gradient(to right, #a855f7, #ec4899)',
    color: '#ffffff',
  },
  outlineButton: {
    backgroundColor: 'transparent',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    color: '#ffffff',
  },
  dangerButton: {
    backgroundColor: '#ef4444',
    color: '#ffffff',
  },
  ghostButton: {
    backgroundColor: 'transparent',
    color: '#94a3b8',
    padding: '8px',
  },
  successButton: {
    backgroundColor: '#10b981',
    color: '#ffffff',
  },
  input: {
    width: '100%',
    padding: '10px 14px',
    borderRadius: '8px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    color: '#ffffff',
    fontSize: '14px',
    outline: 'none',
  },
  textarea: {
    width: '100%',
    padding: '10px 14px',
    borderRadius: '8px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    color: '#ffffff',
    fontSize: '14px',
    outline: 'none',
    resize: 'vertical' as const,
    minHeight: '100px',
  },
  select: {
    width: '100%',
    padding: '10px 36px 10px 14px',
    borderRadius: '8px',
    border: '1px solid rgba(255, 255, 255, 0.15)',
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
    color: '#ffffff',
    fontSize: '14px',
    outline: 'none',
    cursor: 'pointer',
    appearance: 'none' as const,
    WebkitAppearance: 'none' as const,
    MozAppearance: 'none' as const,
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 12px center',
    backgroundSize: '16px',
    transition: 'all 0.15s ease',
  },
  selectWrapper: {
    position: 'relative' as const,
  },
  label: {
    display: 'block',
    color: '#cbd5e1',
    fontSize: '14px',
    fontWeight: '500',
    marginBottom: '8px',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
  },
  th: {
    textAlign: 'left' as const,
    padding: '16px 24px',
    fontWeight: '500',
    color: '#94a3b8',
    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
  },
  td: {
    padding: '16px 24px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
  },
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '4px 12px',
    borderRadius: '9999px',
    fontSize: '12px',
    fontWeight: '500',
  },
  modal: {
    position: 'fixed' as const,
    inset: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50,
    padding: '16px',
  },
  modalContent: {
    backgroundColor: '#0f172a',
    borderRadius: '16px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    maxWidth: '640px',
    width: '100%',
    maxHeight: '90vh',
    overflow: 'auto',
  },
  modalHeader: {
    padding: '24px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
  },
  modalTitle: {
    fontSize: '20px',
    fontWeight: '600',
    color: '#ffffff',
  },
  modalBody: {
    padding: '24px',
  },
  modalFooter: {
    padding: '24px',
    borderTop: '1px solid rgba(255, 255, 255, 0.1)',
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
  },
  navTab: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 16px',
    borderRadius: '8px',
    border: 'none',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
    transition: 'all 0.2s',
  },
  navTabActive: {
    background: 'linear-gradient(to right, rgba(168, 85, 247, 0.2), rgba(236, 72, 153, 0.2))',
    color: '#ffffff',
    border: '1px solid rgba(168, 85, 247, 0.3)',
  },
  navTabInactive: {
    backgroundColor: 'transparent',
    color: '#94a3b8',
  },
};

interface StudyAdminPanelProps {
  onNavigateToArticles?: () => void;
}

export default function StudyAdminPanel({ onNavigateToArticles }: StudyAdminPanelProps) {
  const [activeSection, setActiveSection] = useState<StudyAdminSection>('overview');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Hooks
  const { categories, loading: categoriesLoading, createCategory, updateCategory, deleteCategory, fetchCategories, seedCategories } = useStudyCategories();
  const { topics, loading: topicsLoading, createTopic, updateTopic, deleteTopic, fetchTopics } = useStudyTopics();
  const { schedules, loading: schedulesLoading, createSchedule, updateSchedule, deleteSchedule, runScheduleNow } = useStudySchedules();
  const { config, loading: configLoading, updateConfig } = useStudyConfig();
  const { suggestions, loading: suggestionsLoading, fetchSuggestions } = useTopicSuggestions();
  const { generating, generateArticle, result: generationResult } = useArticleGeneration();
  const { articles, loading: articlesLoading, fetchArticles, hasMore: articlesHasMore, loadMore: loadMoreArticles } = useStudyArticles({ status: 'all' });

  // Modal states
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showTopicModal, setShowTopicModal] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [showArticleModal, setShowArticleModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<{ type: 'category' | 'topic' | 'schedule' | 'article'; id: string; name: string } | null>(null);

  // Edit states
  const [editingCategory, setEditingCategory] = useState<StudyCategory | null>(null);
  const [editingTopic, setEditingTopic] = useState<StudyTopic | null>(null);
  const [editingSchedule, setEditingSchedule] = useState<ArticleSchedule | null>(null);
  const [editingArticle, setEditingArticle] = useState<StudyArticle | null>(null);
  const [articleSaving, setArticleSaving] = useState(false);

  // Running schedule state
  const [runningScheduleId, setRunningScheduleId] = useState<string | null>(null);
  const [seedingCategories, setSeedingCategories] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [deletingSchedule, setDeletingSchedule] = useState(false);

  // Article multi-select state
  const [selectedArticleIds, setSelectedArticleIds] = useState<Set<string>>(new Set());
  const [deletingMultipleArticles, setDeletingMultipleArticles] = useState(false);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);

  // Form states
  const [categoryForm, setCategoryForm] = useState({
    name: '',
    description: '',
    icon: '',
    color: '',
    order: 0,
  });

  const [topicForm, setTopicForm] = useState({
    name: '',
    categoryId: '',
    description: '',
    tags: '',
    difficulty: QuizDifficulty.INTERMEDIATE,
    estimatedReadTime: 15,
    isActive: true,
  });

  const [scheduleForm, setScheduleForm] = useState<{
    name: string;
    description: string;
    categoryIds: string[];
    frequency: ScheduleFrequency;
    scheduledTimes: string[];
    timezone: string;
    aiProvider: AIProvider;
    numberOfArticles: number;
    topicSelectionMode: 'sequential' | 'random' | 'ai_suggested';
    suggestionType: TopicSuggestionType;
    language: string;
    codingLanguage: string;
    sendEmailNotification: boolean;
    notificationEmail: string;
  }>({
    name: '',
    description: '',
    categoryIds: [],
    frequency: ScheduleFrequency.DAILY,
    scheduledTimes: ['09:00'],
    timezone: 'America/Los_Angeles',
    aiProvider: AIProvider.CLAUDE,
    numberOfArticles: 1,
    topicSelectionMode: 'ai_suggested',
    suggestionType: TopicSuggestionType.SIMILAR,
    language: 'ja',
    codingLanguage: 'typescript',
    sendEmailNotification: false,
    notificationEmail: '',
  });

  const [generateForm, setGenerateForm] = useState({
    categoryId: '',
    aiProvider: AIProvider.CHATGPT,  // Changed default to ChatGPT
    difficulty: '' as QuizDifficulty | '',  // Empty means AI decides
    includeQuiz: true,
    numberOfQuestions: 5,
    customPrompt: '',
    language: 'ja',  // Changed default to Japanese
    codingLanguage: 'typescript',  // Default coding language
  });

  const [articleForm, setArticleForm] = useState({
    title: '',
    summary: '',
    status: ArticleStatus.PUBLISHED as ArticleStatus,
    difficulty: QuizDifficulty.INTERMEDIATE as QuizDifficulty,
    isPublic: true,
  });

  // Articles filter state
  const [articlesFilter, setArticlesFilter] = useState({
    language: '',
    orderBy: 'createdAt',
    orderDir: 'desc' as 'asc' | 'desc',
  });

  // Suggestion state
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestionType, setSuggestionType] = useState<TopicSuggestionType>(TopicSuggestionType.SIMILAR);

  const showMessageToast = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  // Category handlers
  const handleOpenCategoryModal = (category?: StudyCategory) => {
    if (category) {
      setEditingCategory(category);
      setCategoryForm({
        name: category.name,
        description: category.description,
        icon: category.icon || '',
        color: category.color || '',
        order: category.order,
      });
    } else {
      setEditingCategory(null);
      setCategoryForm({
        name: '',
        description: '',
        icon: '',
        color: '',
        order: categories.length,
      });
    }
    setShowCategoryModal(true);
  };

  const handleSaveCategory = async () => {
    try {
      if (editingCategory) {
        await updateCategory(editingCategory.id, categoryForm);
        showMessageToast('success', 'Category updated successfully!');
      } else {
        await createCategory({
          ...categoryForm,
          slug: categoryForm.name.toLowerCase().replace(/\s+/g, '-'),
        });
        showMessageToast('success', 'Category created successfully!');
      }
      setShowCategoryModal(false);
    } catch (error) {
      showMessageToast('error', `Failed to save category: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleDeleteCategory = async (id: string) => {
    try {
      await deleteCategory(id);
      showMessageToast('success', 'Category deleted successfully!');
    } catch (error) {
      showMessageToast('error', `Failed to delete category: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    setShowDeleteConfirm(null);
  };

  const handleSeedCategories = async () => {
    try {
      setSeedingCategories(true);
      const result = await seedCategories();
      showMessageToast('success', `Added ${result.addedCount} categories, ${result.skippedCount} already existed`);
    } catch (error) {
      showMessageToast('error', `Failed to seed categories: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setSeedingCategories(false);
    }
  };

  // Topic handlers
  const handleOpenTopicModal = (topic?: StudyTopic) => {
    if (topic) {
      setEditingTopic(topic);
      setTopicForm({
        name: topic.name,
        categoryId: topic.categoryId,
        description: topic.description,
        tags: topic.tags.join(', '),
        difficulty: topic.difficulty,
        estimatedReadTime: topic.estimatedReadTime,
        isActive: topic.isActive,
      });
    } else {
      setEditingTopic(null);
      setTopicForm({
        name: '',
        categoryId: categories[0]?.id || '',
        description: '',
        tags: '',
        difficulty: QuizDifficulty.INTERMEDIATE,
        estimatedReadTime: 15,
        isActive: true,
      });
    }
    setShowTopicModal(true);
  };

  const handleSaveTopic = async () => {
    try {
      const topicData = {
        ...topicForm,
        tags: topicForm.tags.split(',').map(t => t.trim()).filter(t => t),
      };

      if (editingTopic) {
        await updateTopic(editingTopic.id, topicData);
        showMessageToast('success', 'Topic updated successfully!');
      } else {
        await createTopic(topicData);
        showMessageToast('success', 'Topic created successfully!');
      }
      setShowTopicModal(false);
    } catch (error) {
      showMessageToast('error', `Failed to save topic: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleDeleteTopic = async (id: string) => {
    try {
      await deleteTopic(id);
      showMessageToast('success', 'Topic deleted successfully!');
    } catch (error) {
      showMessageToast('error', `Failed to delete topic: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    setShowDeleteConfirm(null);
  };

  // Schedule handlers
  const handleOpenScheduleModal = (schedule?: ArticleSchedule) => {
    if (schedule) {
      setEditingSchedule(schedule);
      // Convert UTC times from database to local time for display (normalize to :00)
      const localTimes = schedule.scheduledTimes.map(t => {
        const localTime = utcTimeToLocal(t);
        return localTime.split(':')[0] + ':00';
      });
      setScheduleForm({
        name: schedule.name,
        description: schedule.description || '',
        categoryIds: schedule.categoryIds,
        frequency: schedule.frequency,
        scheduledTimes: localTimes,
        timezone: schedule.timezone,
        aiProvider: schedule.aiProvider,
        numberOfArticles: schedule.numberOfArticles,
        topicSelectionMode: schedule.topicSelectionMode,
        suggestionType: schedule.suggestionType,
        language: schedule.language || 'ja',
        codingLanguage: schedule.codingLanguage || 'typescript',
        sendEmailNotification: schedule.sendEmailNotification,
        notificationEmail: schedule.notificationEmail || '',
      });
    } else {
      setEditingSchedule(null);
      setScheduleForm({
        name: '',
        description: '',
        categoryIds: [],
        frequency: ScheduleFrequency.DAILY,
        scheduledTimes: ['09:00'], // Default 9 AM local time
        timezone: 'America/Los_Angeles',
        aiProvider: AIProvider.CLAUDE,
        numberOfArticles: 1,
        topicSelectionMode: 'ai_suggested',
        suggestionType: TopicSuggestionType.SIMILAR,
        language: 'ja',
        codingLanguage: 'typescript',
        sendEmailNotification: false,
        notificationEmail: '',
      });
    }
    setShowScheduleModal(true);
  };

  const handleSaveSchedule = async () => {
    try {
      setSavingSchedule(true);
      // Convert local times to UTC before saving to database
      const utcTimes = scheduleForm.scheduledTimes.map(localTimeToUTC);
      const scheduleData = {
        ...scheduleForm,
        scheduledTimes: utcTimes,
        topicIds: [],
        status: ScheduleStatus.ACTIVE,
      };

      if (editingSchedule) {
        await updateSchedule(editingSchedule.id, scheduleData);
        showMessageToast('success', 'Schedule updated successfully!');
      } else {
        await createSchedule(scheduleData);
        showMessageToast('success', 'Schedule created successfully!');
      }
      setShowScheduleModal(false);
    } catch (error) {
      showMessageToast('error', `Failed to save schedule: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setSavingSchedule(false);
    }
  };

  const handleRunSchedule = async (scheduleId: string) => {
    try {
      setRunningScheduleId(scheduleId);
      showMessageToast('success', 'Running schedule... This may take a few minutes.');
      const result = await runScheduleNow(scheduleId);
      showMessageToast('success', `Schedule completed! Generated ${result.articleIds.length} article(s).`);
    } catch (error) {
      showMessageToast('error', `Failed to run schedule: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setRunningScheduleId(null);
    }
  };

  const handleToggleScheduleStatus = async (schedule: ArticleSchedule) => {
    try {
      const newStatus = schedule.status === ScheduleStatus.ACTIVE ? ScheduleStatus.PAUSED : ScheduleStatus.ACTIVE;
      await updateSchedule(schedule.id, { status: newStatus });
      showMessageToast('success', `Schedule ${newStatus === ScheduleStatus.ACTIVE ? 'activated' : 'paused'} successfully!`);
    } catch (error) {
      showMessageToast('error', `Failed to update schedule: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleDeleteSchedule = async (id: string) => {
    try {
      setDeletingSchedule(true);
      await deleteSchedule(id);
      showMessageToast('success', 'Schedule deleted successfully!');
    } catch (error) {
      showMessageToast('error', `Failed to delete schedule: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setDeletingSchedule(false);
      setShowDeleteConfirm(null);
    }
  };

  // Article handlers
  const handleOpenArticleModal = (article: StudyArticle) => {
    setEditingArticle(article);
    setArticleForm({
      title: article.title,
      summary: article.summary,
      status: article.status,
      difficulty: article.difficulty,
      isPublic: article.isPublic,
    });
    setShowArticleModal(true);
  };

  const handleSaveArticle = async () => {
    if (!editingArticle) return;

    try {
      setArticleSaving(true);
      await studyService.updateArticle(editingArticle.id, articleForm);
      showMessageToast('success', 'Article updated successfully!');
      setShowArticleModal(false);
      fetchArticles({ status: 'all' });
    } catch (error) {
      showMessageToast('error', `Failed to update article: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setArticleSaving(false);
    }
  };

  const handleDeleteArticle = async (id: string) => {
    try {
      await studyService.deleteArticle(id);
      showMessageToast('success', 'Article deleted successfully!');
      fetchArticles({ status: 'all' });
    } catch (error) {
      showMessageToast('error', `Failed to delete article: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    setShowDeleteConfirm(null);
  };

  // Article multi-select handlers
  const handleToggleArticleSelection = (id: string) => {
    setSelectedArticleIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectAllArticles = () => {
    if (selectedArticleIds.size === articles.length) {
      // Deselect all
      setSelectedArticleIds(new Set());
    } else {
      // Select all
      setSelectedArticleIds(new Set(articles.map(a => a.id)));
    }
  };

  const handleDeleteSelectedArticles = async () => {
    if (selectedArticleIds.size === 0) return;

    setDeletingMultipleArticles(true);
    let successCount = 0;
    let failCount = 0;

    for (const id of selectedArticleIds) {
      try {
        await studyService.deleteArticle(id);
        successCount++;
      } catch {
        failCount++;
      }
    }

    if (failCount === 0) {
      showMessageToast('success', `Successfully deleted ${successCount} article(s)!`);
    } else {
      showMessageToast('error', `Deleted ${successCount} article(s), but ${failCount} failed.`);
    }

    setSelectedArticleIds(new Set());
    setShowBulkDeleteConfirm(false);
    setDeletingMultipleArticles(false);
    fetchArticles({ status: 'all' });
  };

  // Generate handlers
  const handleFetchSuggestions = async () => {
    setShowSuggestions(true);
    await fetchSuggestions({
      categoryId: generateForm.categoryId || undefined,
      suggestionType,
      count: 5,
      excludeTopicIds: [],
    });
  };

  const handleSelectSuggestion = (suggestion: { name: string; description: string }) => {
    setGenerateForm(prev => ({
      ...prev,
      customPrompt: `Topic: ${suggestion.name}\n\n${suggestion.description}`,
    }));
    setShowSuggestions(false);
  };

  const handleGenerateArticle = async () => {
    if (!generateForm.categoryId) {
      showMessageToast('error', 'Please select a category');
      return;
    }

    try {
      const result = await generateArticle({
        categoryId: generateForm.categoryId,
        aiProvider: generateForm.aiProvider,
        difficulty: generateForm.difficulty === '' ? undefined : generateForm.difficulty,  // empty means AI decides
        includeQuiz: generateForm.includeQuiz,
        numberOfQuestions: generateForm.numberOfQuestions,
        customPrompt: generateForm.customPrompt || undefined,
        language: generateForm.language || 'ja',
        codingLanguage: generateForm.codingLanguage || 'typescript',
      });

      if (result) {
        showMessageToast('success', `Article "${result.article.title}" generated successfully!`);
        setShowGenerateModal(false);
        fetchArticles({ status: 'all' });
        // Reset form
        setGenerateForm({
          categoryId: '',
          aiProvider: AIProvider.CHATGPT,
          difficulty: '',
          includeQuiz: true,
          numberOfQuestions: 5,
          customPrompt: '',
          language: 'ja',
          codingLanguage: 'typescript',
        });
      }
    } catch (error) {
      showMessageToast('error', `Failed to generate article: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Config handlers
  const handleSaveConfig = async () => {
    if (!config) return;
    try {
      await updateConfig(config);
      showMessageToast('success', 'Configuration saved successfully!');
    } catch (error) {
      showMessageToast('error', `Failed to save config: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const navTabs = [
    { id: 'overview' as const, label: 'Overview', icon: BarChart3 },
    { id: 'categories' as const, label: 'Categories', icon: Tags },
    { id: 'topics' as const, label: 'Topics', icon: BookOpen },
    { id: 'articles' as const, label: 'Articles', icon: FileText },
    { id: 'schedules' as const, label: 'Schedules', icon: Calendar },
    { id: 'generate' as const, label: 'Generate', icon: Sparkles },
    { id: 'config' as const, label: 'Settings', icon: Settings },
  ];

  const getCategoryName = (categoryId: string) => {
    const category = categories.find(c => c.id === categoryId);
    return category?.name || 'Unknown';
  };

  return (
    <div>
      {/* Toast Message */}
      {message && (
        <div style={{
          position: 'fixed',
          top: '80px',
          right: '16px',
          zIndex: 100,
          padding: '16px 24px',
          borderRadius: '12px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          backgroundColor: message.type === 'success' ? 'rgba(16, 185, 129, 0.9)' : 'rgba(239, 68, 68, 0.9)',
          border: `1px solid ${message.type === 'success' ? '#34d399' : '#f87171'}`,
          color: '#ffffff',
        }}>
          {message.type === 'success' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
          <span style={{ fontWeight: '500' }}>{message.text}</span>
          <button
            onClick={() => setMessage(null)}
            style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: '4px' }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', flexWrap: 'wrap' }}>
        {navTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveSection(tab.id)}
            style={{
              ...styles.navTab,
              ...(activeSection === tab.id ? styles.navTabActive : styles.navTabInactive),
            }}
          >
            <tab.icon size={18} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Overview Section */}
      {activeSection === 'overview' && (
        <div>
          <h2 style={{ fontSize: '24px', fontWeight: 'bold', color: '#ffffff', marginBottom: '8px' }}>
            Study Tool Overview
          </h2>
          <p style={{ color: '#94a3b8', marginBottom: '24px' }}>
            Manage your learning content and track progress
          </p>

          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
            <div style={{ ...styles.card, padding: '24px' }}>
              <Tags size={24} color="#a855f7" style={{ marginBottom: '12px' }} />
              <p style={{ fontSize: '32px', fontWeight: 'bold', color: '#ffffff' }}>{categories.length}</p>
              <p style={{ color: '#94a3b8' }}>Categories</p>
            </div>
            <div style={{ ...styles.card, padding: '24px' }}>
              <BookOpen size={24} color="#3b82f6" style={{ marginBottom: '12px' }} />
              <p style={{ fontSize: '32px', fontWeight: 'bold', color: '#ffffff' }}>{topics.length}</p>
              <p style={{ color: '#94a3b8' }}>Topics</p>
            </div>
            <div style={{ ...styles.card, padding: '24px' }}>
              <Calendar size={24} color="#10b981" style={{ marginBottom: '12px' }} />
              <p style={{ fontSize: '32px', fontWeight: 'bold', color: '#ffffff' }}>
                {schedules.filter(s => s.status === ScheduleStatus.ACTIVE).length}
              </p>
              <p style={{ color: '#94a3b8' }}>Active Schedules</p>
            </div>
            <div style={{ ...styles.card, padding: '24px' }}>
              <FileText size={24} color="#f59e0b" style={{ marginBottom: '12px' }} />
              <p style={{ fontSize: '32px', fontWeight: 'bold', color: '#ffffff' }}>
                {schedules.reduce((acc, s) => acc + s.articlesGenerated, 0)}
              </p>
              <p style={{ color: '#94a3b8' }}>Articles Generated</p>
            </div>
          </div>

          {/* Quick Actions */}
          <div style={{ ...styles.card, padding: '24px', marginBottom: '24px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#ffffff', marginBottom: '16px' }}>
              Quick Actions
            </h3>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <button
                onClick={() => setShowGenerateModal(true)}
                style={{ ...styles.button, ...styles.primaryButton }}
              >
                <Sparkles size={16} /> Generate Article
              </button>
              <button
                onClick={() => setActiveSection('topics')}
                style={{ ...styles.button, ...styles.outlineButton }}
              >
                <Plus size={16} /> Add Topic
              </button>
              <button
                onClick={() => setActiveSection('schedules')}
                style={{ ...styles.button, ...styles.outlineButton }}
              >
                <Calendar size={16} /> Manage Schedules
              </button>
              {onNavigateToArticles && (
                <button
                  onClick={onNavigateToArticles}
                  style={{ ...styles.button, ...styles.outlineButton }}
                >
                  <FileText size={16} /> View Articles
                </button>
              )}
            </div>
          </div>

          {/* Recent Schedules */}
          <div style={styles.card}>
            <div style={{ padding: '24px', borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>
              <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#ffffff' }}>
                Active Schedules
              </h3>
            </div>
            <div style={{ padding: '16px 24px' }}>
              {schedulesLoading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '24px' }}>
                  <Loader2 size={24} color="#a855f7" style={{ animation: 'spin 1s linear infinite' }} />
                </div>
              ) : schedules.filter(s => s.status === ScheduleStatus.ACTIVE).length === 0 ? (
                <p style={{ color: '#64748b', textAlign: 'center', padding: '24px' }}>
                  No active schedules. Create one to start generating articles automatically.
                </p>
              ) : (
                schedules
                  .filter(s => s.status === ScheduleStatus.ACTIVE)
                  .slice(0, 5)
                  .map(schedule => (
                    <div
                      key={schedule.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '12px 0',
                        borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                      }}
                    >
                      <div>
                        <p style={{ color: '#ffffff', fontWeight: '500' }}>{schedule.name}</p>
                        <p style={{ color: '#64748b', fontSize: '14px' }}>
                          {schedule.frequency} at {(schedule.scheduledTimes || ['09:00']).map(t => utcTimeToLocal(t).split(':')[0] + ':00').join(', ')} (local) - {schedule.numberOfArticles} article(s)
                        </p>
                      </div>
                      <button
                        onClick={() => handleRunSchedule(schedule.id)}
                        disabled={runningScheduleId === schedule.id}
                        style={{
                          ...styles.button,
                          ...styles.successButton,
                          padding: '8px 16px',
                          opacity: runningScheduleId === schedule.id ? 0.7 : 1,
                          cursor: runningScheduleId === schedule.id ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {runningScheduleId === schedule.id ? (
                          <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Running...</>
                        ) : (
                          <><Play size={14} /> Run Now</>
                        )}
                      </button>
                    </div>
                  ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Categories Section */}
      {activeSection === 'categories' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
            <div>
              <h2 style={{ fontSize: '24px', fontWeight: 'bold', color: '#ffffff', marginBottom: '8px' }}>
                Categories
              </h2>
              <p style={{ color: '#94a3b8' }}>Organize your learning topics into categories</p>
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={handleSeedCategories}
                disabled={seedingCategories}
                style={{ ...styles.button, ...styles.outlineButton }}
              >
                {seedingCategories ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Sparkles size={16} />}
                {seedingCategories ? 'Seeding...' : 'Seed All Categories'}
              </button>
              <button onClick={() => handleOpenCategoryModal()} style={{ ...styles.button, ...styles.primaryButton }}>
                <Plus size={16} /> Add Category
              </button>
            </div>
          </div>

          {categoriesLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '48px' }}>
              <Loader2 size={32} color="#a855f7" style={{ animation: 'spin 1s linear infinite' }} />
            </div>
          ) : (
            <div style={styles.card}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Name</th>
                    <th style={styles.th}>Description</th>
                    <th style={styles.th}>Topics</th>
                    <th style={styles.th}>Order</th>
                    <th style={{ ...styles.th, textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {categories.map((category) => (
                    <tr key={category.id}>
                      <td style={styles.td}>
                        <span style={{ color: '#ffffff', fontWeight: '500' }}>{category.name}</span>
                      </td>
                      <td style={{ ...styles.td, color: '#94a3b8', maxWidth: '300px' }}>
                        {category.description}
                      </td>
                      <td style={styles.td}>
                        <span style={{
                          ...styles.badge,
                          backgroundColor: 'rgba(168, 85, 247, 0.2)',
                          color: '#c084fc',
                          border: '1px solid rgba(168, 85, 247, 0.3)',
                        }}>
                          {topics.filter(t => t.categoryId === category.id).length}
                        </span>
                      </td>
                      <td style={{ ...styles.td, color: '#94a3b8' }}>{category.order}</td>
                      <td style={{ ...styles.td, textAlign: 'right' }}>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                          <button onClick={() => handleOpenCategoryModal(category)} style={{ ...styles.ghostButton, borderRadius: '8px' }}>
                            <Pencil size={16} />
                          </button>
                          <button
                            onClick={() => setShowDeleteConfirm({ type: 'category', id: category.id, name: category.name })}
                            style={{ ...styles.ghostButton, borderRadius: '8px', color: '#f87171' }}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {categories.length === 0 && (
                    <tr>
                      <td colSpan={5} style={{ ...styles.td, textAlign: 'center', color: '#64748b', padding: '48px' }}>
                        No categories yet. Click &quot;Add Category&quot; to create one.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Topics Section */}
      {activeSection === 'topics' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
            <div>
              <h2 style={{ fontSize: '24px', fontWeight: 'bold', color: '#ffffff', marginBottom: '8px' }}>
                Topics
              </h2>
              <p style={{ color: '#94a3b8' }}>Manage learning topics for article generation</p>
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button onClick={handleFetchSuggestions} style={{ ...styles.button, ...styles.outlineButton }}>
                <Sparkles size={16} /> Get AI Suggestions
              </button>
              <button onClick={() => handleOpenTopicModal()} style={{ ...styles.button, ...styles.primaryButton }}>
                <Plus size={16} /> Add Topic
              </button>
            </div>
          </div>

          {/* AI Suggestions Panel */}
          {showSuggestions && (
            <div style={{ ...styles.card, marginBottom: '24px', padding: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ color: '#ffffff', fontWeight: '600' }}>AI Topic Suggestions</h3>
                <button onClick={() => setShowSuggestions(false)} style={{ ...styles.ghostButton }}>
                  <X size={16} />
                </button>
              </div>

              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                {Object.values(TopicSuggestionType).map(type => (
                  <button
                    key={type}
                    onClick={() => {
                      setSuggestionType(type);
                      handleFetchSuggestions();
                    }}
                    style={{
                      ...styles.button,
                      ...(suggestionType === type ? styles.primaryButton : styles.outlineButton),
                      padding: '6px 12px',
                      fontSize: '12px',
                    }}
                  >
                    {type}
                  </button>
                ))}
              </div>

              {suggestionsLoading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '24px' }}>
                  <Loader2 size={24} color="#a855f7" style={{ animation: 'spin 1s linear infinite' }} />
                </div>
              ) : suggestions.length === 0 ? (
                <p style={{ color: '#64748b', textAlign: 'center' }}>No suggestions available</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {suggestions.map((suggestion, index) => (
                    <div
                      key={index}
                      style={{
                        padding: '16px',
                        backgroundColor: 'rgba(15, 23, 42, 0.5)',
                        borderRadius: '12px',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <h4 style={{ color: '#ffffff', fontWeight: '500', marginBottom: '4px' }}>
                            {suggestion.name}
                          </h4>
                          <p style={{ color: '#94a3b8', fontSize: '14px', marginBottom: '8px' }}>
                            {suggestion.description}
                          </p>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <span style={{
                              ...styles.badge,
                              backgroundColor: 'rgba(59, 130, 246, 0.2)',
                              color: '#93c5fd',
                              border: '1px solid rgba(59, 130, 246, 0.3)',
                            }}>
                              {suggestion.difficulty}
                            </span>
                            <span style={{
                              ...styles.badge,
                              backgroundColor: 'rgba(16, 185, 129, 0.2)',
                              color: '#6ee7b7',
                              border: '1px solid rgba(16, 185, 129, 0.3)',
                            }}>
                              {Math.round(suggestion.confidence * 100)}% confidence
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            setTopicForm({
                              name: suggestion.name,
                              categoryId: suggestion.categoryId,
                              description: suggestion.description,
                              tags: suggestion.tags.join(', '),
                              difficulty: suggestion.difficulty,
                              estimatedReadTime: 15,
                              isActive: true,
                            });
                            setShowTopicModal(true);
                          }}
                          style={{ ...styles.button, ...styles.primaryButton, padding: '8px 16px' }}
                        >
                          <Plus size={14} /> Add
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {topicsLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '48px' }}>
              <Loader2 size={32} color="#a855f7" style={{ animation: 'spin 1s linear infinite' }} />
            </div>
          ) : (
            <div style={styles.card}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Name</th>
                    <th style={styles.th}>Category</th>
                    <th style={styles.th}>Difficulty</th>
                    <th style={styles.th}>Generated</th>
                    <th style={styles.th}>Status</th>
                    <th style={{ ...styles.th, textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {topics.map((topic) => (
                    <tr key={topic.id}>
                      <td style={styles.td}>
                        <div>
                          <span style={{ color: '#ffffff', fontWeight: '500' }}>{topic.name}</span>
                          <p style={{ color: '#64748b', fontSize: '13px', marginTop: '2px' }}>
                            {topic.description.substring(0, 60)}...
                          </p>
                        </div>
                      </td>
                      <td style={{ ...styles.td, color: '#94a3b8' }}>
                        {getCategoryName(topic.categoryId)}
                      </td>
                      <td style={styles.td}>
                        <span style={{
                          ...styles.badge,
                          backgroundColor: 'rgba(59, 130, 246, 0.2)',
                          color: '#93c5fd',
                          border: '1px solid rgba(59, 130, 246, 0.3)',
                        }}>
                          {topic.difficulty}
                        </span>
                      </td>
                      <td style={{ ...styles.td, color: '#94a3b8' }}>{topic.timesGenerated}x</td>
                      <td style={styles.td}>
                        {topic.isActive ? (
                          <span style={{
                            ...styles.badge,
                            backgroundColor: 'rgba(16, 185, 129, 0.2)',
                            color: '#6ee7b7',
                            border: '1px solid rgba(16, 185, 129, 0.3)',
                          }}>
                            Active
                          </span>
                        ) : (
                          <span style={{
                            ...styles.badge,
                            backgroundColor: 'transparent',
                            color: '#94a3b8',
                            border: '1px solid rgba(255, 255, 255, 0.2)',
                          }}>
                            Inactive
                          </span>
                        )}
                      </td>
                      <td style={{ ...styles.td, textAlign: 'right' }}>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                          <button onClick={() => handleOpenTopicModal(topic)} style={{ ...styles.ghostButton, borderRadius: '8px' }}>
                            <Pencil size={16} />
                          </button>
                          <button
                            onClick={() => setShowDeleteConfirm({ type: 'topic', id: topic.id, name: topic.name })}
                            style={{ ...styles.ghostButton, borderRadius: '8px', color: '#f87171' }}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {topics.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ ...styles.td, textAlign: 'center', color: '#64748b', padding: '48px' }}>
                        No topics yet. Click &quot;Add Topic&quot; to create one.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Articles Section */}
      {activeSection === 'articles' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
            <div>
              <h2 style={{ fontSize: '24px', fontWeight: 'bold', color: '#ffffff', marginBottom: '8px' }}>
                Articles
              </h2>
              <p style={{ color: '#94a3b8' }}>Manage generated study articles</p>
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              {selectedArticleIds.size > 0 && (
                <button
                  onClick={() => setShowBulkDeleteConfirm(true)}
                  style={{
                    ...styles.button,
                    backgroundColor: 'rgba(239, 68, 68, 0.2)',
                    color: '#f87171',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                  }}
                >
                  <Trash2 size={16} /> Delete Selected ({selectedArticleIds.size})
                </button>
              )}
              <button onClick={() => setShowGenerateModal(true)} style={{ ...styles.button, ...styles.primaryButton }}>
                <Sparkles size={16} /> Generate New
              </button>
            </div>
          </div>

          {/* Filter Controls */}
          <div style={{ display: 'flex', gap: '16px', marginBottom: '16px', flexWrap: 'wrap' }}>
            <div>
              <label style={{ color: '#94a3b8', fontSize: '12px', display: 'block', marginBottom: '4px' }}>Language</label>
              <select
                value={articlesFilter.language}
                onChange={(e) => {
                  setArticlesFilter({ ...articlesFilter, language: e.target.value });
                  fetchArticles({ status: 'all', language: e.target.value || undefined, orderBy: articlesFilter.orderBy, orderDir: articlesFilter.orderDir });
                }}
                style={{ ...styles.select, minWidth: '120px' }}
              >
                <option value="">All Languages</option>
                <option value="en">English</option>
                <option value="ja">Japanese</option>
                <option value="es">Spanish</option>
                <option value="zh">Chinese</option>
                <option value="ko">Korean</option>
                <option value="fr">French</option>
                <option value="de">German</option>
              </select>
            </div>
            <div>
              <label style={{ color: '#94a3b8', fontSize: '12px', display: 'block', marginBottom: '4px' }}>Order By</label>
              <select
                value={articlesFilter.orderBy}
                onChange={(e) => {
                  setArticlesFilter({ ...articlesFilter, orderBy: e.target.value });
                  fetchArticles({ status: 'all', language: articlesFilter.language || undefined, orderBy: e.target.value, orderDir: articlesFilter.orderDir });
                }}
                style={{ ...styles.select, minWidth: '140px' }}
              >
                <option value="createdAt">Created Date</option>
                <option value="title">Title</option>
                <option value="difficulty">Difficulty</option>
                <option value="viewCount">View Count</option>
              </select>
            </div>
            <div>
              <label style={{ color: '#94a3b8', fontSize: '12px', display: 'block', marginBottom: '4px' }}>Direction</label>
              <select
                value={articlesFilter.orderDir}
                onChange={(e) => {
                  const dir = e.target.value as 'asc' | 'desc';
                  setArticlesFilter({ ...articlesFilter, orderDir: dir });
                  fetchArticles({ status: 'all', language: articlesFilter.language || undefined, orderBy: articlesFilter.orderBy, orderDir: dir });
                }}
                style={{ ...styles.select, minWidth: '120px' }}
              >
                <option value="desc">Newest First</option>
                <option value="asc">Oldest First</option>
              </select>
            </div>
          </div>

          {articlesLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '48px' }}>
              <Loader2 size={32} color="#a855f7" style={{ animation: 'spin 1s linear infinite' }} />
            </div>
          ) : (
            <div style={styles.card}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={{ ...styles.th, width: '40px', padding: '12px 8px' }}>
                      <input
                        type="checkbox"
                        checked={articles.length > 0 && selectedArticleIds.size === articles.length}
                        onChange={handleSelectAllArticles}
                        style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                        title="Select all"
                      />
                    </th>
                    <th style={styles.th}>Title</th>
                    <th style={styles.th}>Category</th>
                    <th style={styles.th}>Lang</th>
                    <th style={styles.th}>Difficulty</th>
                    <th style={styles.th}>Status</th>
                    <th style={styles.th}>Created</th>
                    <th style={{ ...styles.th, textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {articles.map((article) => (
                    <tr
                      key={article.id}
                      style={{
                        backgroundColor: selectedArticleIds.has(article.id) ? 'rgba(168, 85, 247, 0.1)' : 'transparent',
                      }}
                    >
                      <td style={{ ...styles.td, padding: '12px 8px' }}>
                        <input
                          type="checkbox"
                          checked={selectedArticleIds.has(article.id)}
                          onChange={() => handleToggleArticleSelection(article.id)}
                          style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                        />
                      </td>
                      <td style={styles.td}>
                        <div>
                          <span style={{ color: '#ffffff', fontWeight: '500' }}>{article.title}</span>
                          <p style={{ color: '#64748b', fontSize: '13px', marginTop: '2px' }}>
                            {article.summary?.substring(0, 80)}...
                          </p>
                        </div>
                      </td>
                      <td style={{ ...styles.td, color: '#94a3b8' }}>
                        {getCategoryName(article.categoryId)}
                      </td>
                      <td style={{ ...styles.td, color: '#94a3b8', textTransform: 'uppercase', fontSize: '12px' }}>
                        {(article as StudyArticle & { language?: string }).language || 'en'}
                      </td>
                      <td style={styles.td}>
                        <span style={{
                          ...styles.badge,
                          backgroundColor: 'rgba(59, 130, 246, 0.2)',
                          color: '#93c5fd',
                          border: '1px solid rgba(59, 130, 246, 0.3)',
                        }}>
                          {article.difficulty}
                        </span>
                      </td>
                      <td style={styles.td}>
                        {article.status === ArticleStatus.PUBLISHED ? (
                          <span style={{
                            ...styles.badge,
                            backgroundColor: 'rgba(16, 185, 129, 0.2)',
                            color: '#6ee7b7',
                            border: '1px solid rgba(16, 185, 129, 0.3)',
                          }}>
                            Published
                          </span>
                        ) : article.status === ArticleStatus.DRAFT ? (
                          <span style={{
                            ...styles.badge,
                            backgroundColor: 'rgba(245, 158, 11, 0.2)',
                            color: '#fbbf24',
                            border: '1px solid rgba(245, 158, 11, 0.3)',
                          }}>
                            Draft
                          </span>
                        ) : (
                          <span style={{
                            ...styles.badge,
                            backgroundColor: 'transparent',
                            color: '#94a3b8',
                            border: '1px solid rgba(255, 255, 255, 0.2)',
                          }}>
                            {article.status}
                          </span>
                        )}
                      </td>
                      <td style={{ ...styles.td, color: '#94a3b8', fontSize: '14px' }}>
                        {new Date(article.createdAt).toLocaleDateString()}
                      </td>
                      <td style={{ ...styles.td, textAlign: 'right' }}>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                          <button
                            onClick={() => handleOpenArticleModal(article)}
                            style={{ ...styles.ghostButton, borderRadius: '8px' }}
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            onClick={() => setShowDeleteConfirm({ type: 'article', id: article.id, name: article.title })}
                            style={{ ...styles.ghostButton, borderRadius: '8px', color: '#f87171' }}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {articles.length === 0 && (
                    <tr>
                      <td colSpan={8} style={{ ...styles.td, textAlign: 'center', color: '#64748b', padding: '48px' }}>
                        No articles yet. Click &quot;Generate New&quot; to create one.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              {articlesHasMore && (
                <div style={{ padding: '16px 24px', borderTop: '1px solid rgba(255, 255, 255, 0.1)' }}>
                  <button
                    onClick={loadMoreArticles}
                    style={{ ...styles.button, ...styles.outlineButton, width: '100%', justifyContent: 'center' }}
                  >
                    Load More
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Schedules Section */}
      {activeSection === 'schedules' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
            <div>
              <h2 style={{ fontSize: '24px', fontWeight: 'bold', color: '#ffffff', marginBottom: '8px' }}>
                Schedules
              </h2>
              <p style={{ color: '#94a3b8' }}>Configure automatic article generation schedules</p>
            </div>
            <button onClick={() => handleOpenScheduleModal()} style={{ ...styles.button, ...styles.primaryButton }}>
              <Plus size={16} /> Add Schedule
            </button>
          </div>

          {schedulesLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '48px' }}>
              <Loader2 size={32} color="#a855f7" style={{ animation: 'spin 1s linear infinite' }} />
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {schedules.map((schedule) => (
                <div key={schedule.id} style={styles.card}>
                  <div style={{ padding: '24px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
                          <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#ffffff' }}>
                            {schedule.name}
                          </h3>
                          {schedule.status === ScheduleStatus.ACTIVE ? (
                            <span style={{
                              ...styles.badge,
                              backgroundColor: 'rgba(16, 185, 129, 0.2)',
                              color: '#6ee7b7',
                              border: '1px solid rgba(16, 185, 129, 0.3)',
                            }}>
                              Active
                            </span>
                          ) : (
                            <span style={{
                              ...styles.badge,
                              backgroundColor: 'rgba(245, 158, 11, 0.2)',
                              color: '#fbbf24',
                              border: '1px solid rgba(245, 158, 11, 0.3)',
                            }}>
                              Paused
                            </span>
                          )}
                        </div>
                        {schedule.description && (
                          <p style={{ color: '#94a3b8', fontSize: '14px' }}>{schedule.description}</p>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          onClick={() => handleRunSchedule(schedule.id)}
                          disabled={runningScheduleId === schedule.id}
                          style={{
                            ...styles.button,
                            ...styles.successButton,
                            padding: '8px 16px',
                            opacity: runningScheduleId === schedule.id ? 0.7 : 1,
                            cursor: runningScheduleId === schedule.id ? 'not-allowed' : 'pointer',
                          }}
                        >
                          {runningScheduleId === schedule.id ? (
                            <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Running...</>
                          ) : (
                            <><Play size={14} /> Run Now</>
                          )}
                        </button>
                        <button
                          onClick={() => handleToggleScheduleStatus(schedule)}
                          style={{ ...styles.button, ...styles.outlineButton, padding: '8px 16px' }}
                        >
                          {schedule.status === ScheduleStatus.ACTIVE ? <Pause size={14} /> : <Play size={14} />}
                        </button>
                        <button
                          onClick={() => handleOpenScheduleModal(schedule)}
                          style={{ ...styles.ghostButton, borderRadius: '8px' }}
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          onClick={() => setShowDeleteConfirm({ type: 'schedule', id: schedule.id, name: schedule.name })}
                          style={{ ...styles.ghostButton, borderRadius: '8px', color: '#f87171' }}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '16px' }}>
                      <div>
                        <p style={{ color: '#64748b', fontSize: '12px', marginBottom: '4px' }}>Frequency</p>
                        <p style={{ color: '#ffffff' }}>{schedule.frequency}</p>
                      </div>
                      <div>
                        <p style={{ color: '#64748b', fontSize: '12px', marginBottom: '4px' }}>Run Hours (local)</p>
                        <p style={{ color: '#ffffff' }}>{(schedule.scheduledTimes || ['09:00']).map(t => utcTimeToLocal(t).split(':')[0] + ':00').join(', ')}</p>
                      </div>
                      <div>
                        <p style={{ color: '#64748b', fontSize: '12px', marginBottom: '4px' }}>Articles/Run</p>
                        <p style={{ color: '#ffffff' }}>{schedule.numberOfArticles}</p>
                      </div>
                      <div>
                        <p style={{ color: '#64748b', fontSize: '12px', marginBottom: '4px' }}>AI Provider</p>
                        <p style={{ color: '#ffffff' }}>{schedule.aiProvider}</p>
                      </div>
                      <div>
                        <p style={{ color: '#64748b', fontSize: '12px', marginBottom: '4px' }}>Total Generated</p>
                        <p style={{ color: '#ffffff' }}>{schedule.articlesGenerated}</p>
                      </div>
                    </div>

                    {schedule.lastRunAt && (
                      <p style={{ color: '#64748b', fontSize: '12px', marginTop: '16px' }}>
                        Last run: {new Date(schedule.lastRunAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                </div>
              ))}
              {schedules.length === 0 && (
                <div style={{ ...styles.card, padding: '48px', textAlign: 'center' }}>
                  <Calendar size={48} color="#64748b" style={{ marginBottom: '16px' }} />
                  <p style={{ color: '#64748b' }}>No schedules yet. Click &quot;Add Schedule&quot; to create one.</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Generate Section */}
      {activeSection === 'generate' && (
        <div>
          <h2 style={{ fontSize: '24px', fontWeight: 'bold', color: '#ffffff', marginBottom: '8px' }}>
            Generate Article
          </h2>
          <p style={{ color: '#94a3b8', marginBottom: '24px' }}>
            Manually generate a new study article
          </p>

          <div style={{ ...styles.card, maxWidth: '640px' }}>
            <div style={{ padding: '24px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div>
                  <label style={styles.label}>Category *</label>
                  <select
                    value={generateForm.categoryId}
                    onChange={(e) => setGenerateForm({ ...generateForm, categoryId: e.target.value })}
                    style={styles.select}
                  >
                    <option value="">Select category</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={styles.label}>AI Provider</label>
                    <select
                      value={generateForm.aiProvider}
                      onChange={(e) => setGenerateForm({ ...generateForm, aiProvider: e.target.value as AIProvider })}
                      style={styles.select}
                    >
                      <option value={AIProvider.CHATGPT}>ChatGPT</option>
                      <option value={AIProvider.CLAUDE}>Claude</option>
                    </select>
                  </div>
                  <div>
                    <label style={styles.label}>Language</label>
                    <select
                      value={generateForm.language}
                      onChange={(e) => setGenerateForm({ ...generateForm, language: e.target.value })}
                      style={styles.select}
                    >
                      <option value="ja">日本語</option>
                      <option value="en">English</option>
                      <option value="es">Spanish</option>
                      <option value="zh">Chinese</option>
                      <option value="ko">Korean</option>
                    </select>
                  </div>
                  <div>
                    <label style={styles.label}>Code Language</label>
                    <select
                      value={generateForm.codingLanguage}
                      onChange={(e) => setGenerateForm({ ...generateForm, codingLanguage: e.target.value })}
                      style={styles.select}
                    >
                      <option value="typescript">TypeScript</option>
                      <option value="javascript">JavaScript</option>
                      <option value="python">Python</option>
                      <option value="java">Java</option>
                      <option value="go">Go</option>
                      <option value="rust">Rust</option>
                      <option value="csharp">C#</option>
                    </select>
                  </div>
                  <div>
                    <label style={styles.label}>Difficulty</label>
                    <select
                      value={generateForm.difficulty}
                      onChange={(e) => setGenerateForm({ ...generateForm, difficulty: e.target.value as QuizDifficulty | '' })}
                      style={styles.select}
                    >
                      <option value="">AI decides</option>
                      {Object.values(QuizDifficulty).map((diff) => (
                        <option key={diff} value={diff}>{diff}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <input
                    type="checkbox"
                    id="include-quiz"
                    checked={generateForm.includeQuiz}
                    onChange={(e) => setGenerateForm({ ...generateForm, includeQuiz: e.target.checked })}
                    style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                  />
                  <label htmlFor="include-quiz" style={{ color: '#cbd5e1', cursor: 'pointer' }}>
                    Include quiz questions
                  </label>
                  {generateForm.includeQuiz && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input
                        type="number"
                        value={generateForm.numberOfQuestions}
                        onChange={(e) => setGenerateForm({ ...generateForm, numberOfQuestions: parseInt(e.target.value) || 5 })}
                        min={1}
                        max={20}
                        style={{ ...styles.input, width: '80px' }}
                      />
                      <span style={{ color: '#94a3b8', fontSize: '14px' }}>questions</span>
                    </div>
                  )}
                </div>

                <div>
                  <label style={styles.label}>Custom Instructions (Optional)</label>
                  <textarea
                    value={generateForm.customPrompt}
                    onChange={(e) => setGenerateForm({ ...generateForm, customPrompt: e.target.value })}
                    placeholder="Add any specific topic or instructions for the AI to generate an article about..."
                    style={styles.textarea}
                  />
                </div>

                <button
                  onClick={handleGenerateArticle}
                  disabled={generating || !generateForm.categoryId}
                  style={{
                    ...styles.button,
                    ...styles.primaryButton,
                    opacity: generating || !generateForm.categoryId ? 0.5 : 1,
                    cursor: generating || !generateForm.categoryId ? 'not-allowed' : 'pointer',
                  }}
                >
                  {generating ? (
                    <>
                      <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles size={16} /> Generate Article
                    </>
                  )}
                </button>

                {generationResult && (
                  <div style={{
                    padding: '16px',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    borderRadius: '12px',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                  }}>
                    <p style={{ color: '#6ee7b7', fontWeight: '500', marginBottom: '4px' }}>
                      Article Generated Successfully!
                    </p>
                    <p style={{ color: '#94a3b8', fontSize: '14px' }}>
                      &quot;{generationResult.article.title}&quot;
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Config Section */}
      {activeSection === 'config' && (
        <div>
          <h2 style={{ fontSize: '24px', fontWeight: 'bold', color: '#ffffff', marginBottom: '8px' }}>
            Settings
          </h2>
          <p style={{ color: '#94a3b8', marginBottom: '24px' }}>
            Configure study tool settings
          </p>

          {configLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '48px' }}>
              <Loader2 size={32} color="#a855f7" style={{ animation: 'spin 1s linear infinite' }} />
            </div>
          ) : (
            <div style={{ ...styles.card, maxWidth: '640px' }}>
              <div style={{ padding: '24px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  <div>
                    <h3 style={{ color: '#ffffff', fontWeight: '600', marginBottom: '16px' }}>AI Settings</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                      <div>
                        <label style={styles.label}>Default AI Provider</label>
                        <select
                          value={config?.aiConfig.defaultProvider || AIProvider.CLAUDE}
                          onChange={(e) => config && updateConfig({
                            aiConfig: { ...config.aiConfig, defaultProvider: e.target.value as AIProvider }
                          })}
                          style={styles.select}
                        >
                          <option value={AIProvider.CLAUDE}>Claude</option>
                          <option value={AIProvider.CHATGPT}>ChatGPT</option>
                        </select>
                      </div>
                      <div>
                        <label style={styles.label}>Default Difficulty</label>
                        <select
                          value={config?.defaultArticleSettings.difficulty || QuizDifficulty.INTERMEDIATE}
                          onChange={(e) => config && updateConfig({
                            defaultArticleSettings: { ...config.defaultArticleSettings, difficulty: e.target.value as QuizDifficulty }
                          })}
                          style={styles.select}
                        >
                          {Object.values(QuizDifficulty).map((diff) => (
                            <option key={diff} value={diff}>{diff}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.1)', paddingTop: '24px' }}>
                    <h3 style={{ color: '#ffffff', fontWeight: '600', marginBottom: '16px' }}>Article Settings</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <input
                          type="checkbox"
                          id="include-code"
                          checked={config?.defaultArticleSettings.includeCodeExamples ?? true}
                          onChange={(e) => config && updateConfig({
                            defaultArticleSettings: { ...config.defaultArticleSettings, includeCodeExamples: e.target.checked }
                          })}
                          style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                        />
                        <label htmlFor="include-code" style={{ color: '#cbd5e1', cursor: 'pointer' }}>
                          Include code examples by default
                        </label>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <input
                          type="checkbox"
                          id="include-links"
                          checked={config?.defaultArticleSettings.includeExternalLinks ?? true}
                          onChange={(e) => config && updateConfig({
                            defaultArticleSettings: { ...config.defaultArticleSettings, includeExternalLinks: e.target.checked }
                          })}
                          style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                        />
                        <label htmlFor="include-links" style={{ color: '#cbd5e1', cursor: 'pointer' }}>
                          Include external links by default
                        </label>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <label style={{ color: '#cbd5e1' }}>Default quiz questions:</label>
                        <input
                          type="number"
                          value={config?.defaultArticleSettings.numberOfQuestions || 5}
                          onChange={(e) => config && updateConfig({
                            defaultArticleSettings: { ...config.defaultArticleSettings, numberOfQuestions: parseInt(e.target.value) || 5 }
                          })}
                          min={1}
                          max={20}
                          style={{ ...styles.input, width: '80px' }}
                        />
                      </div>
                    </div>
                  </div>

                  <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.1)', paddingTop: '24px' }}>
                    <h3 style={{ color: '#ffffff', fontWeight: '600', marginBottom: '16px' }}>Email Notifications</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <input
                          type="checkbox"
                          id="email-enabled"
                          checked={config?.emailConfig.enabled ?? false}
                          onChange={(e) => config && updateConfig({
                            emailConfig: { ...config.emailConfig, enabled: e.target.checked }
                          })}
                          style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                        />
                        <label htmlFor="email-enabled" style={{ color: '#cbd5e1', cursor: 'pointer' }}>
                          Enable email notifications
                        </label>
                      </div>
                      {config?.emailConfig.enabled && (
                        <div>
                          <label style={styles.label}>Default Email</label>
                          <input
                            type="email"
                            value={config?.emailConfig.defaultEmail || ''}
                            onChange={(e) => config && updateConfig({
                              emailConfig: { ...config.emailConfig, defaultEmail: e.target.value }
                            })}
                            placeholder="your@email.com"
                            style={styles.input}
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  <button onClick={handleSaveConfig} style={{ ...styles.button, ...styles.primaryButton }}>
                    <Save size={16} /> Save Settings
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Category Modal */}
      {showCategoryModal && (
        <div style={styles.modal}>
          <div style={styles.modalContent}>
            <div style={styles.modalHeader}>
              <h2 style={styles.modalTitle}>{editingCategory ? 'Edit Category' : 'New Category'}</h2>
            </div>
            <div style={styles.modalBody}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div>
                  <label style={styles.label}>Name *</label>
                  <input
                    value={categoryForm.name}
                    onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                    style={styles.input}
                  />
                </div>
                <div>
                  <label style={styles.label}>Description *</label>
                  <textarea
                    value={categoryForm.description}
                    onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })}
                    style={styles.textarea}
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={styles.label}>Icon (emoji)</label>
                    <input
                      value={categoryForm.icon}
                      onChange={(e) => setCategoryForm({ ...categoryForm, icon: e.target.value })}
                      placeholder="e.g., 📚"
                      style={styles.input}
                    />
                  </div>
                  <div>
                    <label style={styles.label}>Order</label>
                    <input
                      type="number"
                      value={categoryForm.order}
                      onChange={(e) => setCategoryForm({ ...categoryForm, order: parseInt(e.target.value) || 0 })}
                      style={styles.input}
                    />
                  </div>
                </div>
              </div>
            </div>
            <div style={styles.modalFooter}>
              <button onClick={() => setShowCategoryModal(false)} style={{ ...styles.button, ...styles.outlineButton }}>
                Cancel
              </button>
              <button onClick={handleSaveCategory} style={{ ...styles.button, ...styles.primaryButton }}>
                <Save size={16} /> {editingCategory ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Topic Modal */}
      {showTopicModal && (
        <div style={styles.modal}>
          <div style={styles.modalContent}>
            <div style={styles.modalHeader}>
              <h2 style={styles.modalTitle}>{editingTopic ? 'Edit Topic' : 'New Topic'}</h2>
            </div>
            <div style={styles.modalBody}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div>
                  <label style={styles.label}>Name *</label>
                  <input
                    value={topicForm.name}
                    onChange={(e) => setTopicForm({ ...topicForm, name: e.target.value })}
                    style={styles.input}
                  />
                </div>
                <div>
                  <label style={styles.label}>Category *</label>
                  <select
                    value={topicForm.categoryId}
                    onChange={(e) => setTopicForm({ ...topicForm, categoryId: e.target.value })}
                    style={styles.select}
                  >
                    <option value="">Select category</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={styles.label}>Description *</label>
                  <textarea
                    value={topicForm.description}
                    onChange={(e) => setTopicForm({ ...topicForm, description: e.target.value })}
                    style={styles.textarea}
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={styles.label}>Difficulty</label>
                    <select
                      value={topicForm.difficulty}
                      onChange={(e) => setTopicForm({ ...topicForm, difficulty: e.target.value as QuizDifficulty })}
                      style={styles.select}
                    >
                      {Object.values(QuizDifficulty).map((diff) => (
                        <option key={diff} value={diff}>{diff}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={styles.label}>Est. Read Time (min)</label>
                    <input
                      type="number"
                      value={topicForm.estimatedReadTime}
                      onChange={(e) => setTopicForm({ ...topicForm, estimatedReadTime: parseInt(e.target.value) || 15 })}
                      style={styles.input}
                    />
                  </div>
                </div>
                <div>
                  <label style={styles.label}>Tags (comma-separated)</label>
                  <input
                    value={topicForm.tags}
                    onChange={(e) => setTopicForm({ ...topicForm, tags: e.target.value })}
                    placeholder="typescript, generics, advanced"
                    style={styles.input}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <input
                    type="checkbox"
                    id="topic-active"
                    checked={topicForm.isActive}
                    onChange={(e) => setTopicForm({ ...topicForm, isActive: e.target.checked })}
                    style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                  />
                  <label htmlFor="topic-active" style={{ color: '#cbd5e1', cursor: 'pointer' }}>
                    Active (available for article generation)
                  </label>
                </div>
              </div>
            </div>
            <div style={styles.modalFooter}>
              <button onClick={() => setShowTopicModal(false)} style={{ ...styles.button, ...styles.outlineButton }}>
                Cancel
              </button>
              <button onClick={handleSaveTopic} style={{ ...styles.button, ...styles.primaryButton }}>
                <Save size={16} /> {editingTopic ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Schedule Modal */}
      {showScheduleModal && (
        <div style={styles.modal}>
          <div style={{ ...styles.modalContent, maxWidth: '720px' }}>
            <div style={styles.modalHeader}>
              <h2 style={styles.modalTitle}>{editingSchedule ? 'Edit Schedule' : 'New Schedule'}</h2>
            </div>
            <div style={styles.modalBody}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div>
                  <label style={styles.label}>Schedule Name *</label>
                  <input
                    value={scheduleForm.name}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, name: e.target.value })}
                    placeholder="e.g., Daily TypeScript Articles"
                    style={styles.input}
                  />
                </div>
                <div>
                  <label style={styles.label}>Description</label>
                  <input
                    value={scheduleForm.description}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, description: e.target.value })}
                    placeholder="Optional description"
                    style={styles.input}
                  />
                </div>
                <div>
                  <label style={styles.label}>Categories (select topics from these categories)</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {categories.map((cat) => (
                      <button
                        key={cat.id}
                        onClick={() => {
                          const newCategoryIds = scheduleForm.categoryIds.includes(cat.id)
                            ? scheduleForm.categoryIds.filter(id => id !== cat.id)
                            : [...scheduleForm.categoryIds, cat.id];
                          setScheduleForm({ ...scheduleForm, categoryIds: newCategoryIds });
                        }}
                        style={{
                          ...styles.badge,
                          cursor: 'pointer',
                          padding: '8px 16px',
                          backgroundColor: scheduleForm.categoryIds.includes(cat.id)
                            ? 'rgba(168, 85, 247, 0.2)'
                            : 'transparent',
                          color: scheduleForm.categoryIds.includes(cat.id) ? '#c084fc' : '#94a3b8',
                          border: `1px solid ${scheduleForm.categoryIds.includes(cat.id) ? 'rgba(168, 85, 247, 0.3)' : 'rgba(255, 255, 255, 0.2)'}`,
                        }}
                      >
                        {cat.name}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={styles.label}>Frequency</label>
                    <select
                      value={scheduleForm.frequency}
                      onChange={(e) => setScheduleForm({ ...scheduleForm, frequency: e.target.value as ScheduleFrequency })}
                      style={styles.select}
                    >
                      {Object.values(ScheduleFrequency).map((freq) => (
                        <option key={freq} value={freq}>{freq}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={styles.label}>Articles per Run</label>
                    <input
                      type="number"
                      value={scheduleForm.numberOfArticles}
                      onChange={(e) => setScheduleForm({ ...scheduleForm, numberOfArticles: parseInt(e.target.value) || 1 })}
                      min={1}
                      max={5}
                      style={styles.input}
                    />
                  </div>
                  <div>
                    <label style={styles.label}>AI Provider</label>
                    <select
                      value={scheduleForm.aiProvider}
                      onChange={(e) => setScheduleForm({ ...scheduleForm, aiProvider: e.target.value as AIProvider })}
                      style={styles.select}
                    >
                      <option value={AIProvider.CLAUDE}>Claude</option>
                      <option value={AIProvider.CHATGPT}>ChatGPT</option>
                    </select>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={styles.label}>Language</label>
                    <select
                      value={scheduleForm.language}
                      onChange={(e) => setScheduleForm({ ...scheduleForm, language: e.target.value })}
                      style={styles.select}
                    >
                      <option value="ja">Japanese</option>
                      <option value="en">English</option>
                    </select>
                  </div>
                  <div>
                    <label style={styles.label}>Code Language</label>
                    <select
                      value={scheduleForm.codingLanguage}
                      onChange={(e) => setScheduleForm({ ...scheduleForm, codingLanguage: e.target.value })}
                      style={styles.select}
                    >
                      <option value="typescript">TypeScript</option>
                      <option value="javascript">JavaScript</option>
                      <option value="python">Python</option>
                      <option value="go">Go</option>
                      <option value="rust">Rust</option>
                      <option value="java">Java</option>
                      <option value="csharp">C#</option>
                      <option value="cpp">C++</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label style={styles.label}>Run Hours - Local Time (runs at the top of each selected hour)</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {scheduleForm.scheduledTimes.map((time, index) => {
                      const [hour] = time.split(':');
                      return (
                        <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <select
                            value={hour}
                            onChange={(e) => {
                              const newTimes = [...scheduleForm.scheduledTimes];
                              newTimes[index] = `${e.target.value}:00`;
                              setScheduleForm({ ...scheduleForm, scheduledTimes: newTimes });
                            }}
                            style={{ ...styles.select, flex: 1 }}
                          >
                            {Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0')).map((h) => (
                              <option key={h} value={h}>{h}:00</option>
                            ))}
                          </select>
                          {scheduleForm.scheduledTimes.length > 1 && (
                            <button
                              type="button"
                              onClick={() => {
                                const newTimes = scheduleForm.scheduledTimes.filter((_, i) => i !== index);
                                setScheduleForm({ ...scheduleForm, scheduledTimes: newTimes });
                              }}
                              style={{
                                background: 'rgba(239, 68, 68, 0.2)',
                                border: '1px solid rgba(239, 68, 68, 0.3)',
                                borderRadius: '6px',
                                color: '#ef4444',
                                padding: '8px 12px',
                                cursor: 'pointer',
                                fontSize: '14px',
                              }}
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      );
                    })}
                    {scheduleForm.scheduledTimes.length < 4 && (
                      <button
                        type="button"
                        onClick={() => {
                          setScheduleForm({
                            ...scheduleForm,
                            scheduledTimes: [...scheduleForm.scheduledTimes, '12:00'],
                          });
                        }}
                        style={{
                          background: 'rgba(34, 197, 94, 0.2)',
                          border: '1px solid rgba(34, 197, 94, 0.3)',
                          borderRadius: '6px',
                          color: '#22c55e',
                          padding: '8px 12px',
                          cursor: 'pointer',
                          fontSize: '14px',
                          alignSelf: 'flex-start',
                        }}
                      >
                        + Add Another Hour
                      </button>
                    )}
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={styles.label}>Topic Selection</label>
                    <select
                      value={scheduleForm.topicSelectionMode}
                      onChange={(e) => setScheduleForm({ ...scheduleForm, topicSelectionMode: e.target.value as 'sequential' | 'random' | 'ai_suggested' })}
                      style={styles.select}
                    >
                      <option value="ai_suggested">AI Suggested</option>
                      <option value="sequential">Sequential</option>
                      <option value="random">Random</option>
                    </select>
                  </div>
                  <div>
                    <label style={styles.label}>Suggestion Type</label>
                    <select
                      value={scheduleForm.suggestionType}
                      onChange={(e) => setScheduleForm({ ...scheduleForm, suggestionType: e.target.value as TopicSuggestionType })}
                      style={styles.select}
                    >
                      {Object.values(TopicSuggestionType).map((type) => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.1)', paddingTop: '20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                    <input
                      type="checkbox"
                      id="email-notify"
                      checked={scheduleForm.sendEmailNotification}
                      onChange={(e) => setScheduleForm({ ...scheduleForm, sendEmailNotification: e.target.checked })}
                      style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                    />
                    <label htmlFor="email-notify" style={{ color: '#cbd5e1', cursor: 'pointer' }}>
                      Send email notification when articles are generated
                    </label>
                  </div>
                  {scheduleForm.sendEmailNotification && (
                    <div>
                      <label style={styles.label}>Email Address</label>
                      <input
                        type="email"
                        value={scheduleForm.notificationEmail}
                        onChange={(e) => setScheduleForm({ ...scheduleForm, notificationEmail: e.target.value })}
                        placeholder="your@email.com"
                        style={styles.input}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div style={styles.modalFooter}>
              <button onClick={() => setShowScheduleModal(false)} style={{ ...styles.button, ...styles.outlineButton }} disabled={savingSchedule}>
                Cancel
              </button>
              <button onClick={handleSaveSchedule} style={{ ...styles.button, ...styles.primaryButton }} disabled={savingSchedule}>
                {savingSchedule ? (
                  <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Saving...</>
                ) : (
                  <><Save size={16} /> {editingSchedule ? 'Update' : 'Create'}</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Generate Article Modal */}
      {showGenerateModal && (
        <div style={styles.modal}>
          <div style={styles.modalContent}>
            <div style={styles.modalHeader}>
              <h2 style={styles.modalTitle}>Generate Article</h2>
            </div>
            <div style={styles.modalBody}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div>
                  <label style={styles.label}>Category *</label>
                  <select
                    value={generateForm.categoryId}
                    onChange={(e) => setGenerateForm({ ...generateForm, categoryId: e.target.value })}
                    style={styles.select}
                  >
                    <option value="">Select category</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={styles.label}>AI Provider</label>
                    <select
                      value={generateForm.aiProvider}
                      onChange={(e) => setGenerateForm({ ...generateForm, aiProvider: e.target.value as AIProvider })}
                      style={styles.select}
                    >
                      <option value={AIProvider.CHATGPT}>ChatGPT</option>
                      <option value={AIProvider.CLAUDE}>Claude</option>
                    </select>
                  </div>
                  <div>
                    <label style={styles.label}>Language</label>
                    <select
                      value={generateForm.language}
                      onChange={(e) => setGenerateForm({ ...generateForm, language: e.target.value })}
                      style={styles.select}
                    >
                      <option value="ja">日本語</option>
                      <option value="en">English</option>
                      <option value="es">Spanish</option>
                      <option value="zh">Chinese</option>
                      <option value="ko">Korean</option>
                    </select>
                  </div>
                  <div>
                    <label style={styles.label}>Code Language</label>
                    <select
                      value={generateForm.codingLanguage}
                      onChange={(e) => setGenerateForm({ ...generateForm, codingLanguage: e.target.value })}
                      style={styles.select}
                    >
                      <option value="typescript">TypeScript</option>
                      <option value="javascript">JavaScript</option>
                      <option value="python">Python</option>
                      <option value="java">Java</option>
                      <option value="go">Go</option>
                      <option value="rust">Rust</option>
                      <option value="csharp">C#</option>
                    </select>
                  </div>
                  <div>
                    <label style={styles.label}>Difficulty</label>
                    <select
                      value={generateForm.difficulty}
                      onChange={(e) => setGenerateForm({ ...generateForm, difficulty: e.target.value as QuizDifficulty | '' })}
                      style={styles.select}
                    >
                      <option value="">AI decides</option>
                      {Object.values(QuizDifficulty).map((diff) => (
                        <option key={diff} value={diff}>{diff}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <input
                    type="checkbox"
                    id="modal-include-quiz"
                    checked={generateForm.includeQuiz}
                    onChange={(e) => setGenerateForm({ ...generateForm, includeQuiz: e.target.checked })}
                    style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                  />
                  <label htmlFor="modal-include-quiz" style={{ color: '#cbd5e1', cursor: 'pointer' }}>
                    Include quiz questions
                  </label>
                  {generateForm.includeQuiz && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input
                        type="number"
                        value={generateForm.numberOfQuestions}
                        onChange={(e) => setGenerateForm({ ...generateForm, numberOfQuestions: parseInt(e.target.value) || 5 })}
                        min={1}
                        max={20}
                        style={{ ...styles.input, width: '80px' }}
                      />
                      <span style={{ color: '#94a3b8', fontSize: '14px' }}>questions</span>
                    </div>
                  )}
                </div>

                <div>
                  <label style={styles.label}>Custom Instructions (Optional)</label>
                  <textarea
                    value={generateForm.customPrompt}
                    onChange={(e) => setGenerateForm({ ...generateForm, customPrompt: e.target.value })}
                    placeholder="Add any specific topic or instructions for the AI to generate an article about..."
                    style={styles.textarea}
                  />
                </div>
              </div>
            </div>
            <div style={styles.modalFooter}>
              <button
                onClick={() => setShowGenerateModal(false)}
                style={{ ...styles.button, ...styles.outlineButton }}
              >
                Cancel
              </button>
              <button
                onClick={handleGenerateArticle}
                disabled={generating || !generateForm.categoryId}
                style={{
                  ...styles.button,
                  ...styles.primaryButton,
                  opacity: generating || !generateForm.categoryId ? 0.5 : 1,
                  cursor: generating || !generateForm.categoryId ? 'not-allowed' : 'pointer',
                }}
              >
                {generating ? (
                  <>
                    <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles size={16} /> Generate
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Article Edit Modal */}
      {showArticleModal && editingArticle && (
        <div style={styles.modal}>
          <div style={styles.modalContent}>
            <div style={styles.modalHeader}>
              <h2 style={styles.modalTitle}>Edit Article</h2>
            </div>
            <div style={styles.modalBody}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div>
                  <label style={styles.label}>Title</label>
                  <input
                    value={articleForm.title}
                    onChange={(e) => setArticleForm({ ...articleForm, title: e.target.value })}
                    style={styles.input}
                  />
                </div>
                <div>
                  <label style={styles.label}>Summary</label>
                  <textarea
                    value={articleForm.summary}
                    onChange={(e) => setArticleForm({ ...articleForm, summary: e.target.value })}
                    style={styles.textarea}
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={styles.label}>Status</label>
                    <select
                      value={articleForm.status}
                      onChange={(e) => setArticleForm({ ...articleForm, status: e.target.value as ArticleStatus })}
                      style={styles.select}
                    >
                      {Object.values(ArticleStatus).map((status) => (
                        <option key={status} value={status}>{status}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={styles.label}>Difficulty</label>
                    <select
                      value={articleForm.difficulty}
                      onChange={(e) => setArticleForm({ ...articleForm, difficulty: e.target.value as QuizDifficulty })}
                      style={styles.select}
                    >
                      {Object.values(QuizDifficulty).map((diff) => (
                        <option key={diff} value={diff}>{diff}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <input
                    type="checkbox"
                    id="article-public"
                    checked={articleForm.isPublic}
                    onChange={(e) => setArticleForm({ ...articleForm, isPublic: e.target.checked })}
                    style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                  />
                  <label htmlFor="article-public" style={{ color: '#cbd5e1', cursor: 'pointer' }}>
                    Public (visible to others)
                  </label>
                </div>
                <div style={{ padding: '16px', backgroundColor: 'rgba(15, 23, 42, 0.5)', borderRadius: '8px' }}>
                  <p style={{ color: '#64748b', fontSize: '12px', marginBottom: '8px' }}>Article Info</p>
                  <p style={{ color: '#94a3b8', fontSize: '14px' }}>
                    Category: {getCategoryName(editingArticle.categoryId)} •
                    AI: {editingArticle.aiProvider} ({editingArticle.aiModel}) •
                    Created: {new Date(editingArticle.createdAt).toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
            <div style={styles.modalFooter}>
              <button onClick={() => setShowArticleModal(false)} style={{ ...styles.button, ...styles.outlineButton }}>
                Cancel
              </button>
              <button
                onClick={handleSaveArticle}
                disabled={articleSaving}
                style={{
                  ...styles.button,
                  ...styles.primaryButton,
                  opacity: articleSaving ? 0.7 : 1,
                  cursor: articleSaving ? 'not-allowed' : 'pointer',
                }}
              >
                {articleSaving ? (
                  <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Saving...</>
                ) : (
                  <><Save size={16} /> Update</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div style={styles.modal}>
          <div style={{ ...styles.modalContent, maxWidth: '400px' }}>
            <div style={styles.modalHeader}>
              <h2 style={{ ...styles.modalTitle, color: '#f87171' }}>Confirm Delete</h2>
            </div>
            <div style={styles.modalBody}>
              <p style={{ color: '#94a3b8' }}>
                Are you sure you want to delete <strong style={{ color: '#ffffff' }}>{showDeleteConfirm.name}</strong>? This action cannot be undone.
              </p>
            </div>
            <div style={styles.modalFooter}>
              <button onClick={() => setShowDeleteConfirm(null)} style={{ ...styles.button, ...styles.outlineButton }} disabled={deletingSchedule && showDeleteConfirm.type === 'schedule'}>
                Cancel
              </button>
              <button
                onClick={() => {
                  if (showDeleteConfirm.type === 'category') {
                    handleDeleteCategory(showDeleteConfirm.id);
                  } else if (showDeleteConfirm.type === 'topic') {
                    handleDeleteTopic(showDeleteConfirm.id);
                  } else if (showDeleteConfirm.type === 'schedule') {
                    handleDeleteSchedule(showDeleteConfirm.id);
                  } else if (showDeleteConfirm.type === 'article') {
                    handleDeleteArticle(showDeleteConfirm.id);
                  }
                }}
                style={{ ...styles.button, ...styles.dangerButton }}
                disabled={deletingSchedule && showDeleteConfirm.type === 'schedule'}
              >
                {deletingSchedule && showDeleteConfirm.type === 'schedule' ? (
                  <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Deleting...</>
                ) : (
                  <><Trash2 size={16} /> Delete</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Delete Confirmation Modal */}
      {showBulkDeleteConfirm && (
        <div style={styles.modal}>
          <div style={{ ...styles.modalContent, maxWidth: '450px' }}>
            <div style={styles.modalHeader}>
              <h2 style={{ ...styles.modalTitle, color: '#f87171' }}>Delete Multiple Articles</h2>
            </div>
            <div style={styles.modalBody}>
              <p style={{ color: '#94a3b8', marginBottom: '16px' }}>
                Are you sure you want to delete <strong style={{ color: '#ffffff' }}>{selectedArticleIds.size} article(s)</strong>? This action cannot be undone.
              </p>
              <div style={{
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: '8px',
                padding: '12px',
                maxHeight: '150px',
                overflowY: 'auto',
              }}>
                <ul style={{ margin: 0, paddingLeft: '20px', color: '#f87171', fontSize: '14px' }}>
                  {articles
                    .filter(a => selectedArticleIds.has(a.id))
                    .map(a => (
                      <li key={a.id} style={{ marginBottom: '4px' }}>{a.title}</li>
                    ))}
                </ul>
              </div>
            </div>
            <div style={styles.modalFooter}>
              <button
                onClick={() => setShowBulkDeleteConfirm(false)}
                style={{ ...styles.button, ...styles.outlineButton }}
                disabled={deletingMultipleArticles}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteSelectedArticles}
                style={{ ...styles.button, ...styles.dangerButton }}
                disabled={deletingMultipleArticles}
              >
                {deletingMultipleArticles ? (
                  <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Deleting...</>
                ) : (
                  <><Trash2 size={16} /> Delete All ({selectedArticleIds.size})</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CSS for animations */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
