import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AIProvider, ArticleStatus, QuizDifficulty, type StudyArticle } from '@/types/study';

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  useStudyArticle: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'external-private-article' }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/providers/AuthProvider', () => ({
  useAuth: mocks.useAuth,
}));

vi.mock('@/hooks/useStudy', () => ({
  useStudyArticle: mocks.useStudyArticle,
  useArticleNotes: () => ({
    notes: [],
    createNote: vi.fn(),
    updateNote: vi.fn(),
    deleteNote: vi.fn(),
    loading: false,
  }),
  useArticleChat: () => ({
    chat: null,
    sendMessage: vi.fn(),
    generateSummary: vi.fn(),
    loading: false,
  }),
  useStudyCategories: () => ({ categories: [] }),
  useStudyTopics: () => ({ topics: [] }),
  useStudyQuizzes: () => ({ quizzes: [] }),
  useArticleReadHistory: () => ({
    isRead: vi.fn(() => false),
    markAsRead: vi.fn(),
    unmarkAsRead: vi.fn(),
  }),
}));

vi.mock('@/services/studyService', () => ({
  markArticleAsRead: vi.fn(),
}));

vi.mock('@/components/study/SaveArticleLearning', () => ({
  default: () => null,
}));

vi.mock('@/components/study/ArticleFeedback', () => ({
  default: () => null,
}));

vi.mock('@/components/study/AudioPlayer', () => ({
  default: () => null,
}));

import StudyArticlePage from '@/app/study/articles/[id]/page';

describe('StudyArticlePage private article loading', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useStudyArticle.mockReturnValue({
      article: null,
      loading: true,
      error: null,
      fetchArticle: vi.fn(),
    });
  });

  it('waits for auth and keys the article request to the resolved admin viewer', () => {
    mocks.useAuth.mockReturnValue({
      currentUser: { uid: 'admin-1' },
      isAdmin: true,
      loading: false,
    });

    renderToStaticMarkup(<StudyArticlePage />);

    expect(mocks.useStudyArticle).toHaveBeenCalledWith(
      'external-private-article',
      { ready: true, userId: 'admin-1', isAdmin: true },
    );
  });

  it('does not start the private article request while auth is unresolved', () => {
    mocks.useAuth.mockReturnValue({
      currentUser: null,
      isAdmin: false,
      loading: true,
    });

    renderToStaticMarkup(<StudyArticlePage />);

    expect(mocks.useStudyArticle).toHaveBeenCalledWith(
      'external-private-article',
      { ready: false, userId: null, isAdmin: false },
    );
  });

  it('shows the creation date and safe source label for a private Personal Memory article', () => {
    const article: StudyArticle = {
      id: 'external-private-article',
      topicId: 'topic-1',
      categoryId: 'category-1',
      title: 'Event loops',
      slug: 'event-loops',
      summary: 'How the event loop works.',
      introduction: 'Introduction',
      sections: [],
      conclusion: 'Conclusion',
      keyTakeaways: ['Promises use the microtask queue.'],
      status: ArticleStatus.DRAFT,
      aiProvider: AIProvider.CHATGPT,
      aiModel: 'personal-memory-mcp:memory_internal-client-id',
      difficulty: QuizDifficulty.INTERMEDIATE,
      tags: ['javascript'],
      readingTimeMinutes: 5,
      viewCount: 0,
      isPublic: false,
      quizIds: [],
      createdAt: { _seconds: Date.parse('2026-09-07T15:02:00.000Z') / 1000 } as unknown as string,
      updatedAt: '2026-09-07T15:02:00.000Z',
    };

    mocks.useAuth.mockReturnValue({
      currentUser: { uid: 'admin-1' },
      isAdmin: true,
      loading: false,
    });
    mocks.useStudyArticle.mockReturnValue({
      article,
      loading: false,
      error: null,
      fetchArticle: vi.fn(),
    });

    const markup = renderToStaticMarkup(<StudyArticlePage />);

    expect(markup).toContain('AI Provider');
    expect(markup).toContain('ChatGPT');
    expect(markup).toContain('Source');
    expect(markup).toContain('Personal Memory MCP');
    expect(markup).toContain('Created');
    expect(markup).toContain('Sep 7, 2026, 08:02 AM');
    expect(markup).toContain('Not published');
    expect(markup).toContain('—');
    expect(markup).not.toContain('memory_internal-client-id');
  });
});
