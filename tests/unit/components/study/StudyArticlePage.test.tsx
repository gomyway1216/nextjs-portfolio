import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AIProvider, ArticleStatus, QuizDifficulty, type StudyArticle } from '@/types/study';

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  useStudyArticle: vi.fn(),
  useArticleNotes: vi.fn(),
  useArticleChat: vi.fn(),
  searchParams: new URLSearchParams(),
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'external-private-article' }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => mocks.searchParams,
}));

vi.mock('@/providers/AuthProvider', () => ({
  useAuth: mocks.useAuth,
}));

vi.mock('@/hooks/useStudy', () => ({
  useStudyArticle: mocks.useStudyArticle,
  useArticleNotes: mocks.useArticleNotes,
  useArticleChat: mocks.useArticleChat,
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
  default: () => <div data-article-follow-up>Save or discuss the original section</div>,
}));

vi.mock('@/components/study/ArticleFeedback', () => ({
  default: () => null,
}));

vi.mock('@/components/study/AudioPlayer', () => ({
  default: () => null,
}));

import StudyArticlePage from '@/app/study/articles/[id]/page';

function renderMarkdownArticle(content: string, location: 'introduction' | 'section' | 'conclusion' | 'chat') {
  const article: StudyArticle = {
    id: 'external-private-article', topicId: 'topic-1', categoryId: 'category-1',
    title: 'Hash table', slug: 'hash-table', summary: 'Hash collisions',
    introduction: location === 'introduction' ? content : '',
    sections: location === 'section' ? [{ id: 'section-1', title: 'Example', content, order: 0 }] : [],
    conclusion: location === 'conclusion' ? content : '', keyTakeaways: [],
    status: ArticleStatus.DRAFT, aiProvider: AIProvider.CHATGPT, aiModel: 'personal-memory-mcp',
    difficulty: QuizDifficulty.INTERMEDIATE, tags: [], readingTimeMinutes: 5,
    viewCount: 0, isPublic: false, quizIds: [],
    createdAt: '2026-10-24T15:00:00.000Z', updatedAt: '2026-10-24T15:00:00.000Z',
  };
  mocks.useAuth.mockReturnValue({ currentUser: { uid: 'admin-1' }, isAdmin: true, loading: false });
  mocks.useStudyArticle.mockReturnValue({ article, loading: false, error: null });
  if (location === 'chat') {
    mocks.searchParams = new URLSearchParams({ tab: 'chat' });
    mocks.useArticleChat.mockReturnValue({
      loading: false,
      chat: { messages: [{ id: 'message-1', role: 'assistant', content, timestamp: article.createdAt }] },
    });
  }
  return renderToStaticMarkup(<StudyArticlePage />);
}

describe('StudyArticlePage private article loading', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.searchParams = new URLSearchParams();
    mocks.useArticleNotes.mockReturnValue({ notes: [], loading: false });
    mocks.useArticleChat.mockReturnValue({ chat: null, loading: false });
    mocks.useStudyArticle.mockReturnValue({
      article: null,
      loading: true,
      error: null,
      fetchArticle: vi.fn(),
    });
  });

  it.each([
    ['', null, null],
    ['notes', 'external-private-article', null],
    ['chat', null, 'external-private-article'],
  ])('only loads the selected auxiliary tab (%s)', (tab, notesId, chatId) => {
    mocks.searchParams = new URLSearchParams({ tab });
    mocks.useAuth.mockReturnValue({ currentUser: { uid: 'admin-1' }, isAdmin: true, loading: false });
    renderToStaticMarkup(<StudyArticlePage />);
    expect(mocks.useArticleNotes).toHaveBeenCalledWith(notesId);
    expect(mocks.useArticleChat).toHaveBeenCalledWith(chatId);
  });

  it('does not request private auxiliary data while signed out', () => {
    mocks.searchParams = new URLSearchParams({ tab: 'chat' });
    mocks.useAuth.mockReturnValue({ currentUser: null, isAdmin: false, loading: false });
    renderToStaticMarkup(<StudyArticlePage />);
    expect(mocks.useArticleNotes).toHaveBeenCalledWith(null);
    expect(mocks.useArticleChat).toHaveBeenCalledWith(null);
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

  it.each(['introduction', 'section', 'conclusion', 'chat'] as const)(
    'renders the generated HTTP and hash examples as code in %s', (location) => {
      const http = 'POST /imports\nContent-Type: application/json\n\n{"transactionIds":[101,205,309,205]}';
      const calculation = '101 % 4 = 1\n205 % 4 = 1\n309 % 4 = 1';
      const markup = renderMarkdownArticle([
        '架空の決済ファイル取込サービスLedgerBoxへ、次のrequestが来たとします。',
        '~~~http', http, '~~~',
        '最後の205だけが重複です。',
        '~~~text', calculation, '~~~',
        '同じbucketであることと、同じkeyであることは別です。',
      ].join('\n'), location);

      const blocks = markup.match(/<pre\b[^>]*>[\s\S]*?<\/pre>/g) ?? [];
      expect(blocks).toHaveLength(2);
      expect(blocks[0]).toContain('<code class="language-http">POST /imports\nContent-Type: application/json\n\n');
      expect(blocks[0]).toContain('[101,205,309,205]');
      expect(blocks[1]).toContain(`<code class="language-text">${calculation}</code>`);
      expect(markup).not.toContain('~~~');
      expect(blocks.join('')).not.toContain('同じbucket');
      expect(markup).toContain('同じbucketであることと、同じkeyであることは別です。');
    },
  );

  it.each(['```', '~~~', '````', '~~~~'])(
    'preserves code and only closes a matching %s fence', (fence) => {
      const opposite = fence[0] === '`' ? '~~~' : '```';
      const code = ['  <script>alert(1)</script>', opposite, fence.slice(1), `${fence} not a closer`, '  **literal**'].join('\n');
      const markup = renderMarkdownArticle(`${fence}html example\n${code}\n${fence}${fence[0]}\nAfter code`, 'section');
      const blocks = markup.match(/<pre\b[^>]*>[\s\S]*?<\/pre>/g) ?? [];
      expect(blocks).toHaveLength(1);
      expect(blocks[0]).toContain('<code class="language-html">  &lt;script&gt;alert(1)&lt;/script&gt;');
      expect(blocks[0]).toContain(`\n${opposite}\n${fence.slice(1)}\n${fence} not a closer\n  **literal**</code>`);
      expect(blocks[0]).not.toContain('After code');
      expect(markup).not.toContain('<script>');
      expect(markup).toContain('After code');
    },
  );

  it('handles CRLF, optional indentation, and an unclosed fence at the end of an article', () => {
    const markup = renderMarkdownArticle('  ~~~typescript\r\n  const ids = [101, 205];\r\n    // indented\r\n\r\n  ids.length;', 'introduction');
    expect(markup).toContain('<code class="language-typescript">const ids = [101, 205];\n  // indented\n\nids.length;</code>');
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
    expect(markup.match(/data-article-follow-up/g)).toHaveLength(1);
    expect(markup.indexOf('data-article-follow-up')).toBeGreaterThan(markup.indexOf('<article'));
    expect(markup.indexOf('data-article-follow-up')).toBeLessThan(markup.indexOf('</article>'));
    expect(markup).toContain('href="/study/learning"');
  });
});
