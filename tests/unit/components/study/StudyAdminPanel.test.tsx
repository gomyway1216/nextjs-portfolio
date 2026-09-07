import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
});
