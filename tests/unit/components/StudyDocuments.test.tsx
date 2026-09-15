import {renderToStaticMarkup} from 'react-dom/server';
import {readFileSync} from 'node:fs';
import {expect, it, vi} from 'vitest';
const {auth} = vi.hoisted(() => ({auth: vi.fn()}));
vi.mock('@/providers/AuthProvider', () => ({useAuth: auth}));
import StudyDocuments, {DocumentSearchCard, DocumentSearchExplanation} from '@/components/study/StudyDocuments';
import styles from '@/components/study/StudyDocuments.module.css';
import {documentLearningPrompt, documentQueryExpansion, safeDocumentAsset} from '@/lib/studyDocuments';
it('shows no private controls until owner auth has finished', () => {
  auth.mockReturnValue({loading: true});
  expect(renderToStaticMarkup(<StudyDocuments/>)).toContain('認証を確認');
  auth.mockReturnValue({currentUser: null, loading: false, isAdmin: false});
  const denied = renderToStaticMarkup(<StudyDocuments/>);
  expect(denied).toContain('管理者本人だけ'); expect(denied).not.toContain('資料を検索');
  auth.mockReturnValue({currentUser: {uid: 'owner'}, loading: false, isAdmin: true});
  const owner = renderToStaticMarkup(<StudyDocuments/>);
  expect(owner).toContain('授業のノートを'); expect(owner).toContain('資料を読み込んでいます');
  expect(owner).toContain('日本語の主要用語／英語キーワード');
  expect(owner).toContain('aria-describedby="document-search-guidance"');
  expect(owner).toContain(styles.searchField);
  expect(owner).not.toContain('資料はまだ取り込まれていません');
});
it('isolates the search label and native result button from Bootstrap resets', () => {
  const css = readFileSync('src/components/study/StudyDocuments.module.css', 'utf8');
  expect(css).toMatch(/\.searchField\s*\{\s*display:\s*flex;/u);
  expect(css).toMatch(/\.documentCard\s*\{\s*border-radius:\s*var\(--radius-2xl,\s*1rem\);/u);
  expect(css).not.toMatch(/@layer|!important|:global/u); // Unlayered scoped classes beat unlayered element resets.
  const onOpen = vi.fn();
  const markup = renderToStaticMarkup(<DocumentSearchCard onOpen={onOpen} item={{id: 'doc-fixture', version: 'sha', title: 'Index notes', course: 'CS 564', relativePath: 'CS 564/long-file-name.pdf', page: 4, pageCount: 10, sourceUrl: '/study/documents', snippet: 'Read this page'}}/>);
  expect(markup).toContain(styles.documentCard);
  expect(markup).toContain('rounded-2xl'); expect(markup).toContain('break-all');
  expect(markup).toContain('p. 4'); expect(markup).toContain('Index notes');
  expect(onOpen).not.toHaveBeenCalled();
});
it('shows the actual server-provided English expansion without promising semantic search', () => {
  const expansion = {method: 'japanese-concept-aliases-v1' as const, expandedQuery: 'index OR transaction', concepts: ['index', 'transaction']};
  const markup = renderToStaticMarkup(<DocumentSearchExplanation query="索引 OR トランザクション" expansion={expansion}/>);
  expect(markup).toContain('英語でも検索しました');
  expect(markup).toContain('<details');
  expect(markup).toContain('index OR transaction');
  expect(markup).toContain('index、transaction');
  expect(markup).toContain('意味の近さで探す検索ではありません');
  expect(markup).toContain('break-all');
});
it('keeps unsupported/legacy searches honest and never invents a translation', () => {
  for (const expansion of [undefined, null]) {
    const markup = renderToStaticMarkup(<DocumentSearchExplanation query="よくわからない用語" expansion={expansion}/>);
    expect(markup).toContain('英語の短いキーワード');
    expect(markup).not.toContain('英語でも検索しました');
    expect(markup).not.toContain('<details');
  }
  expect(renderToStaticMarkup(<DocumentSearchExplanation query="  "/>)).toBe('');
});
it('omits malformed expansion metadata and renders search text without interpreting HTML', () => {
  for (const value of [null, 'index', {}, {method: 'different', expandedQuery: 'index', concepts: ['index']},
    {method: 'japanese-concept-aliases-v1', expandedQuery: 'index', concepts: [{}]},
    {method: 'japanese-concept-aliases-v1', expandedQuery: 'x'.repeat(1201), concepts: ['index']}]) {
    expect(documentQueryExpansion(value)).toBeUndefined();
  }
  const expansion = {method: 'japanese-concept-aliases-v1' as const, expandedQuery: '<script>alert(1)</script>', concepts: ['<img src=x>']};
  const markup = renderToStaticMarkup(<DocumentSearchExplanation query="索引" expansion={expansion}/>);
  expect(markup).not.toContain('<script>'); expect(markup).not.toContain('<img');
  expect(markup).toContain('&lt;script&gt;');
});
it('keeps immutable page identity in the AI handoff, not expiring asset URLs', () => {
  const prompt = documentLearningPrompt({id: 'doc-id', version: 'sha', page: 4, pageCount: 7, title: 'Notebook', course: 'CS 564', relativePath: 'CS 564/Notebook.pdf', sourceUrl: 'https://www.meetyudai.com/study/documents?id=doc-id&version=sha&page=4'}, 'この図は？');
  expect(prompt).toContain('read_study_document'); expect(prompt).toContain('"page":4');
  expect(prompt).toContain('"version":"sha"'); expect(prompt).toContain('この図は？');
  expect(prompt).toContain('元ページ画像'); expect(prompt).not.toContain('X-Goog-Signature');
});
it('only accepts HTTPS Google Storage asset URLs without credentials', () => {
  expect(safeDocumentAsset('https://storage.googleapis.com/bucket/object?X-Goog-Signature=x')).toBeTruthy();
  for (const url of ['javascript:alert(1)', 'http://storage.googleapis.com/x', 'https://storage.googleapis.com.evil.test/x', 'https://user:secret@storage.googleapis.com/x']) expect(safeDocumentAsset(url)).toBeUndefined();
});
it('omits unsafe source URLs from the AI handoff while retaining page identity', () => {
  for (const sourceUrl of ['javascript:alert(1)', 'http://example.com/unsafe', 'https://user:secret@example.com/unsafe']) {
    const prompt = documentLearningPrompt({id: 'doc-id', version: 'sha', page: 4, pageCount: 7, title: 'Notebook', course: 'CS 564', relativePath: 'CS 564/Notebook.pdf', sourceUrl}, 'この図は？');
    expect(prompt).not.toContain(sourceUrl);
    expect(prompt).toContain('有効な出典URLを取得できません');
    expect(prompt).toContain('"page":4');
  }
});
