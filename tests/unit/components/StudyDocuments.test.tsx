import {renderToStaticMarkup} from 'react-dom/server';
import {expect, it, vi} from 'vitest';
const {auth} = vi.hoisted(() => ({auth: vi.fn()}));
vi.mock('@/providers/AuthProvider', () => ({useAuth: auth}));
import StudyDocuments from '@/components/study/StudyDocuments';
import {documentLearningPrompt, safeDocumentAsset} from '@/lib/studyDocuments';
it('shows no private controls until owner auth has finished', () => {
  auth.mockReturnValue({loading: true});
  expect(renderToStaticMarkup(<StudyDocuments/>)).toContain('認証を確認');
  auth.mockReturnValue({currentUser: null, loading: false, isAdmin: false});
  const denied = renderToStaticMarkup(<StudyDocuments/>);
  expect(denied).toContain('管理者本人だけ'); expect(denied).not.toContain('資料を検索');
  auth.mockReturnValue({currentUser: {uid: 'owner'}, loading: false, isAdmin: true});
  const owner = renderToStaticMarkup(<StudyDocuments/>);
  expect(owner).toContain('授業のノートを'); expect(owner).toContain('資料を読み込んでいます');
  expect(owner).not.toContain('資料はまだ取り込まれていません');
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
