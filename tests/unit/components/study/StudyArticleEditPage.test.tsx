import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), article: vi.fn() }));
vi.mock('next/navigation', () => ({ useParams: () => ({ id: 'external-old-article' }) }));
vi.mock('@/providers/AuthProvider', () => ({ useAuth: mocks.auth }));
vi.mock('@/hooks/useStudy', () => ({ useStudyArticle: mocks.article }));
vi.mock('next/dynamic', () => ({
  default: () => ({ initialArticle }: { initialArticle: { id: string } }) => <div data-editor={initialArticle.id} />,
}));
import StudyArticleEditPage from '@/app/study/articles/[id]/edit/page';

describe('article edit route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockReturnValue({ currentUser: { uid: 'owner' }, isAdmin: true, loading: false });
    mocks.article.mockReturnValue({ article: { id: 'external-old-article' }, loading: false, error: null, fetchArticle: vi.fn() });
  });
  it.each([
    { currentUser: null, isAdmin: false, loading: true },
    { currentUser: null, isAdmin: false, loading: false },
    { currentUser: { uid: 'visitor' }, isAdmin: false, loading: false },
  ])('does not load or expose an editor before owner authentication: %j', auth => {
    mocks.auth.mockReturnValue(auth);
    const html = renderToStaticMarkup(<StudyArticleEditPage />);
    expect(mocks.article).toHaveBeenCalledWith('external-old-article', { ready: false, userId: null, isAdmin: false, forEdit: true });
    expect(html).not.toContain('data-editor');
  });
  it('loads the exact article and reuses the existing editor', () => {
    const html = renderToStaticMarkup(<StudyArticleEditPage />);
    expect(mocks.article).toHaveBeenCalledWith('external-old-article', { ready: true, userId: 'owner', isAdmin: true, forEdit: true });
    expect(html).toContain('data-editor="external-old-article"');
    expect(html).toContain('本文・図・クイズはこの画面では変更しません');
    expect(html).toContain('href="/study/articles/external-old-article"');
  });
  it('keeps the editor hidden on a read failure', () => {
    mocks.article.mockReturnValue({ article: null, loading: false, error: new Error('Network'), fetchArticle: vi.fn() });
    const html = renderToStaticMarkup(<StudyArticleEditPage />);
    expect(html).toContain('再試行');
    expect(html).not.toContain('data-editor');
  });
});
