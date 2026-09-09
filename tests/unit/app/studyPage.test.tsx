import type { AnchorHTMLAttributes, HTMLAttributes, MouseEvent, ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  useStudyArticles: vi.fn(),
  getArticle: vi.fn().mockResolvedValue({ id: 'one' }),
  articleLink: null as AnchorHTMLAttributes<HTMLAnchorElement> | null,
}));

vi.mock('@/services/studyService', () => ({ getArticle: mocks.getArticle }));
vi.mock('next/link', () => ({
  default: (props: AnchorHTMLAttributes<HTMLAnchorElement>) => {
    if (props.href?.startsWith('/study/articles/')) mocks.articleLink = props;
    return <a {...props} />;
  },
}));

vi.mock('@/components/ui/select', () => ({
  Select: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children, value }: { children: ReactNode; value: string }) => (
    <span data-value={value}>{children}</span>
  ),
  SelectTrigger: ({ children, ...props }: HTMLAttributes<HTMLButtonElement>) => (
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
  useAuth: mocks.useAuth,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import StudyListPage from '@/app/study/page';

describe('StudyListPage sorting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useAuth.mockReturnValue({ currentUser: null, loading: false, resolving: false });
    mocks.articleLink = null;
    mocks.useStudyArticles.mockReturnValue({
      articles: [],
      error: null,
      loading: false,
      hasMore: false,
      loadMore: vi.fn(),
      isArticleRead: vi.fn(() => false),
    });
  });

  it.each([true, false])('keeps session restoration in loading even when legacy loading is %s', loading => {
    mocks.useAuth.mockReturnValue({ currentUser: null, loading, resolving: true });
    const markup = renderToStaticMarkup(<StudyListPage />);
    expect(mocks.useStudyArticles).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
    expect(markup).toContain('role="status"');
    expect(markup).not.toContain('study.hub.emptyState.noArticlesFound');
  });

  it('enables the first list request with the restored viewer', () => {
    mocks.useAuth.mockReturnValue({ currentUser: { uid: 'owner' }, loading: false, resolving: false });
    renderToStaticMarkup(<StudyListPage />);
    expect(mocks.useStudyArticles).toHaveBeenCalledWith(expect.objectContaining({
      enabled: true, userId: 'owner', readStatus: 'all',
    }));
  });

  it('shows a retryable error, not an empty list, after a failed request', () => {
    mocks.useStudyArticles.mockReturnValue({ articles: [], loading: false, error: new Error('Authentication changed during the request') });
    const markup = renderToStaticMarkup(<StudyListPage />);
    expect(markup).toContain('role="alert"');
    expect(markup).toContain('study.hub.retryArticles');
    expect(markup).not.toContain('study.hub.emptyState.noArticlesFound');
    expect(markup).not.toContain('Authentication changed');
  });

  it('shows the empty state only for a settled successful zero-result list', () => {
    const markup = renderToStaticMarkup(<StudyListPage />);
    expect(markup).toContain('study.hub.emptyState.noArticlesFound');
    expect(markup).not.toContain('role="status"');
    expect(markup).not.toContain('role="alert"');
  });

  it('starts the article body request on navigation, without fetching on render or hover', () => {
    mocks.useStudyArticles.mockReturnValue({
      articles: [{ id: 'one', title: 'Article', summary: 'Summary', tags: [], difficulty: 'beginner' }],
      loading: false,
      hasMore: false,
      isArticleRead: () => false,
    });
    renderToStaticMarkup(<StudyListPage />);
    expect(mocks.getArticle).not.toHaveBeenCalled();
    mocks.articleLink!.onClick!({ button: 0 } as MouseEvent<HTMLAnchorElement>);
    expect(mocks.getArticle).toHaveBeenCalledWith('one');
  });

  it.each([{ button: 1 }, { button: 0, metaKey: true }, { button: 0, ctrlKey: true }, { button: 0, defaultPrevented: true }])(
    'does not fetch a body in the current tab for a modified or cancelled click (%j)',
    event => {
      mocks.useStudyArticles.mockReturnValue({
        articles: [{ id: 'one', title: 'Article', tags: [], difficulty: 'beginner' }],
        loading: false,
        hasMore: false,
        isArticleRead: () => false,
      });
      renderToStaticMarkup(<StudyListPage />);
      mocks.articleLink!.onClick!(event as unknown as MouseEvent<HTMLAnchorElement>);
      expect(mocks.getArticle).not.toHaveBeenCalled();
    },
  );

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
