import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import SaveArticleLearning from '@/components/study/SaveArticleLearning';
import type { StudyArticle } from '@/types/study';
import type { LearningMaterial } from '@/lib/learningConversation';

vi.mock('@/providers/AuthProvider', () => ({ useAuth: () => ({ currentUser: { uid: 'owner' }, isAdmin: true }) }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ i18n: { language: 'ja' } }) }));
vi.mock('@/components/study/LearningConversation', () => ({ default: ({ material }: { material: LearningMaterial }) => <div data-article-id={material.article?.id} data-updated-at={material.article?.updatedAt}>{material.content}</div> }));

it('passes article retrieval identity to the handoff even when the selected part defaults to summary', () => {
  const article = { id: 'external-backpressure', title: 'Backpressure', summary: 'Wait for drain', keyTakeaways: ['Bound concurrency'], sections: [], updatedAt: '2026-09-09T00:00:00Z' } as unknown as StudyArticle;
  const html = renderToStaticMarkup(<SaveArticleLearning article={article} />);
  expect(html).toContain('data-article-id="external-backpressure"');
  expect(html).toContain('data-updated-at="2026-09-09T00:00:00Z"');
  expect(html).toContain('Wait for drain');
});
