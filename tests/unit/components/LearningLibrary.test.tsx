import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, it, vi } from 'vitest';
import LearningLibrary from '@/components/study/LearningLibrary';
import LearningContent from '@/components/study/LearningContent';

const { auth, i18n } = vi.hoisted(() => ({ auth: vi.fn(), i18n: { language: 'ja' } }));
vi.mock('@/providers/AuthProvider', () => ({ useAuth: auth }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ i18n }) }));
vi.mock('@/components/common/MermaidDiagram', () => ({ default: ({ chart }: { chart: string }) => <div data-original-diagram>{chart}</div> }));

beforeEach(() => { i18n.language = 'ja'; auth.mockReturnValue({ currentUser: null, isAdmin: false, loading: false }); });

it('does not render private controls before owner authentication', () => {
  const html = renderToStaticMarkup(<LearningLibrary />);
  expect(html).toContain('管理者本人だけ');
  expect(html).not.toContain('学びを保存');
  auth.mockReturnValue({ currentUser: { uid: 'someone' }, isAdmin: false, loading: false });
  expect(renderToStaticMarkup(<LearningLibrary />)).not.toContain('学びを保存');
});

it('gives the owner one entry point to learning, engineering articles and memory', () => {
  auth.mockReturnValue({ currentUser: { uid: 'owner' }, isAdmin: true, loading: false });
  const html = renderToStaticMarkup(<LearningLibrary />);
  expect(html).toContain('学びのライブラリ');
  expect(html).toContain('エンジニア向けの記事を読む');
  expect(html).toContain('少し復習する');
  expect(html).toContain('/memory?view=private');
  expect(html).toContain('role="tabpanel"');
  expect(html).toContain('今日は、ここから。');
});

it('preserves original Mermaid without executing HTML or automatically loading remote figures', () => {
  const content = '```mermaid\nflowchart LR\nA --> B\n```\n\n<script>alert(1)</script>\n\n![Original](https://example.com/figure.png)\n\n[Bad](javascript:alert(1))';
  const html = renderToStaticMarkup(<LearningContent content={content} />);
  expect(html).toContain('data-original-diagram');
  expect(html).toContain('flowchart LR');
  expect(html).not.toContain('<script');
  expect(html).not.toContain('<img');
  expect(html).not.toContain('href="javascript:');
  expect(html).toContain('<span>Bad</span>');
  expect(html).toContain('href="https://example.com/figure.png"');
});

it.each(['ja', 'en'])('keeps all three learning tabs in shrinkable mobile columns (%s)', language => {
  i18n.language = language;
  auth.mockReturnValue({ currentUser: { uid: 'owner' }, isAdmin: true, loading: false });
  const html = renderToStaticMarkup(<LearningLibrary />);
  expect(html.match(/<div[^>]*role="tablist"[^>]*>/)?.[0]).toContain('grid-cols-3');
  const tabs = html.match(/<button[^>]*role="tab"[^>]*>/g) ?? [];
  expect(tabs).toHaveLength(3);
  for (const tab of tabs) {
    expect(tab).toContain('min-w-0');
    expect(tab).toContain('whitespace-normal');
    expect(tab).toContain('min-h-11');
    expect(tab).not.toContain('whitespace-nowrap');
  }
});
