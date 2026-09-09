import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { LearningTodayView } from '@/components/study/LearningToday';
import type { LearningTodayData } from '@/lib/learningToday';
import type { LearningItem } from '@/lib/learningLibrary';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ i18n: { language: 'ja' } }) }));
const empty: LearningTodayData = { recent: [], articleReason: 'unknown', errors: [] };
const render = (data: LearningTodayData) => renderToStaticMarkup(<LearningTodayView data={data} busy={false} onReload={vi.fn()} onOpen={vi.fn()} onBrowse={vi.fn()} />);

it('does not reveal the answer before recall or manufacture progress scores', () => {
  const html = render({ ...empty, dueTotal: 1, due: { id: 'entry:old', title: 'Original title', summary: 'SECRET ANSWER', content: 'FULL ANSWER' } as LearningItem });
  expect(html).toContain('Original title');
  expect(html).not.toContain('SECRET ANSWER');
  expect(html).not.toContain('FULL ANSWER');
  expect(html).toContain('思い出したら説明を見る');
  expect(html).not.toContain('理解度スコア');
});
it('clearly distinguishes unknown state from no work due and covers all five domains', () => {
  const html = render({ ...empty, errors: ['review', 'library', 'articles'] });
  expect(html).toContain('復習の予定は未確認');
  expect(html).not.toContain('今日は復習の予定なし');
  expect(html).toContain('全会話の自動取り込み状況を示すものではありません');
  for (const label of ['エンジニアリング', '英語', '金融・お金', '社会の仕組み', 'その他・未分類']) expect(html).toContain(label);
});
it('links to the real stored article with an honest selection reason', () => {
  const html = render({ ...empty, article: { id: 'external-abc', title: 'Article', summary: 'Real summary', createdAt: '', tags: [] }, articleReason: 'unread' });
  expect(html).toContain('/study/articles/external-abc');
  expect(html).toContain('最近20件のうち、最新の未読記事');
  expect(html).toContain('Real summary');
});
