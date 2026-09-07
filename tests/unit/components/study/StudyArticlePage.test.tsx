import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
});
