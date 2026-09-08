import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useStudyArticles: vi.fn(),
}));

vi.mock('@/components/ui/select', () => ({
  Select: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children, value }: { children: React.ReactNode; value: string }) => (
    <span data-value={value}>{children}</span>
  ),
  SelectTrigger: ({ children, ...props }: React.HTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
  SelectValue: () => null,
}));

vi.mock('@/hooks/useStudy', () => ({
  useArticleCounts: () => ({ counts: { total: 0, read: 0, unread: 0 } }),
  useStudyArticles: mocks.useStudyArticles,
  useStudyCategories: () => ({ categories: [], loading: false }),
  useStudyProgress: () => ({ progress: null }),
}));

vi.mock('@/providers/AuthProvider', () => ({
  useAuth: () => ({ currentUser: null }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import StudyListPage from '@/app/study/page';

describe('StudyListPage sorting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useStudyArticles.mockReturnValue({
      articles: [],
      loading: false,
      hasMore: false,
      loadMore: vi.fn(),
      isArticleRead: vi.fn(() => false),
    });
  });

  it('shows creation-date sort controls and requests newest articles first by default', () => {
    const markup = renderToStaticMarkup(<StudyListPage />);

    expect(markup).toContain('study.hub.sort.label');
    expect(markup).toContain('study.hub.sort.newestFirst');
    expect(markup).toContain('study.hub.sort.oldestFirst');
    expect(mocks.useStudyArticles).toHaveBeenCalledWith(expect.objectContaining({
      orderBy: 'createdAt',
      orderDir: 'desc',
    }));
  });
});
