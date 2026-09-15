import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ArticleStatus, QuizDifficulty, type StudyArticle } from '@/types/study';

vi.mock('@/components/study/GenerateAudioButton', () => ({ default: () => null }));

const studyHooks = vi.hoisted(() => ({
  useStudyConfig: vi.fn(() => ({
    config: null,
    loading: false,
    updateConfig: vi.fn(),
  })),
  useStudySchedules: vi.fn(() => ({
    schedules: [],
    loading: false,
    createSchedule: vi.fn(),
    updateSchedule: vi.fn(),
    deleteSchedule: vi.fn(),
    runScheduleNow: vi.fn(),
  })),
}));

vi.mock('@/hooks/useStudy', () => ({
  useArticleGeneration: () => ({
    generating: false,
    generateArticle: vi.fn(),
    result: null,
  }),
  useStudyArticles: () => ({
    articles: [],
    loading: false,
    fetchArticles: vi.fn(),
    hasMore: false,
    loadMore: vi.fn(),
  }),
  useStudyCategories: () => ({
    categories: [],
    loading: false,
    createCategory: vi.fn(),
    updateCategory: vi.fn(),
    deleteCategory: vi.fn(),
    seedCategories: vi.fn(),
  }),
  useStudyConfig: studyHooks.useStudyConfig,
  useStudySchedules: studyHooks.useStudySchedules,
  useStudyTopics: () => ({
    topics: [],
    loading: false,
    createTopic: vi.fn(),
    updateTopic: vi.fn(),
    deleteTopic: vi.fn(),
  }),
  useTopicSuggestions: () => ({
    suggestions: [],
    loading: false,
    fetchSuggestions: vi.fn(),
  }),
}));

import StudyAdminPanel from '@/components/study/StudyAdminPanel';

describe('StudyAdminPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('opens the requested article even when it is outside the loaded list, preserving private draft values', () => {
    const article = {
      id: 'external-old-article', title: 'Original title', summary: 'Original summary',
      status: ArticleStatus.DRAFT, difficulty: QuizDifficulty.ADVANCED,
      isPublic: false, createdAt: '2026-09-15T00:00:00Z',
    } as StudyArticle;
    const markup = renderToStaticMarkup(<StudyAdminPanel initialArticle={article} />);
    expect(markup).toContain('Edit Article');
    expect(markup).toContain('value="Original title"');
    expect(markup).toContain('Original summary');
    expect(markup).toContain('value="draft" selected=""');
    expect(markup).toContain('value="advanced" selected=""');
    expect(markup).toMatch(/<input[^>]*id="article-public"[^>]*\/>/);
    expect(markup.match(/<input[^>]*id="article-public"[^>]*\/>/)?.[0]).not.toContain('checked');
  });

  it('keeps content management while retiring legacy generation controls', () => {
    const markup = renderToStaticMarkup(<StudyAdminPanel />);

    expect(markup).toContain('Categories');
    expect(markup).toContain('Topics');
    expect(markup).toContain('Articles');
    expect(markup).toContain('Daily learning');
    expect(markup).toContain('connected ChatGPT task');

    expect(markup).not.toContain('>Schedules<');
    expect(markup).not.toContain('>Generate<');
    expect(markup).not.toContain('>Settings<');
    expect(markup).not.toContain('Generate Article');
    expect(markup).not.toContain('Manage Schedules');
    expect(markup).not.toContain('Run Now');

    expect(studyHooks.useStudySchedules).toHaveBeenCalledWith({ autoFetch: false });
    expect(studyHooks.useStudyConfig).toHaveBeenCalledWith({ autoFetch: false });
  });

  it('renders Firebase timestamps and MCP provenance in the editor without exposing a client ID as the model', () => {
    const article = {
      id: 'external-mcp', title: 'Imported lesson', summary: 'Summary',
      status: ArticleStatus.DRAFT, difficulty: QuizDifficulty.INTERMEDIATE, isPublic: false,
      aiProvider: 'chatgpt', aiModel: 'personal-memory-mcp:client-id',
      createdAt: { _seconds: Date.parse('2026-09-15T04:00:00Z') / 1000 },
    } as unknown as StudyArticle;
    const markup = renderToStaticMarkup(<StudyAdminPanel initialArticle={article} />);
    expect(markup).toContain('Sep 14, 2026, 09:00 PM');
    expect(markup).toContain('Personal Memory MCP');
    expect(markup).not.toContain('Invalid Date');
    expect(markup).not.toContain('personal-memory-mcp:client-id');
  });
});
