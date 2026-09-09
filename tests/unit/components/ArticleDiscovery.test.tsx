import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import ArticleDiscovery from '@/components/study/ArticleDiscovery';
import LearningRediscovery, { learningAngles } from '@/components/study/LearningRediscovery';
import { learningExperience } from '@/lib/learningExperience';
import type { LearningItem } from '@/lib/learningLibrary';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ i18n: { language: 'ja' } }) }));
vi.mock('@/components/study/LearningContent', () => ({ default: ({ content }: { content: string }) => <p>{content}</p> }));
vi.mock('@/components/study/LearningConversation', () => ({ default: ({ label, initialQuestion }: { label: string; initialQuestion: string }) => <button data-question={initialQuestion}>{label}</button> }));
const experience = { question: 'Why does more concurrency slow it down?', whyItMatters: 'Choose a useful limit.', quickInsight: 'Work waits behind a bottleneck.', prediction: { prompt: 'What if arrivals double?', outcome: 'The queue grows.' }, experiment: { steps: 'Draw two workers.', observation: 'Requests wait.' }, nextQuestions: ['Where does the queue live?'] };
it('renders optional discoveries without a forced answer gate, network call or progress mutation', () => {
  const html = renderToStaticMarkup(<ArticleDiscovery article={{ title: 'Title', summary: 'Summary', learningExperience: experience }} />);
  expect(html).toContain(experience.question);
  expect(html).toContain(experience.quickInsight);
  expect(html).toContain(experience.experiment.observation);
  expect(html).toContain('ここで終わってもOK');
  expect(html).toContain('<details');
  expect(html).not.toContain('<details open');
  expect(html).not.toContain('disabled');
});
it('keeps legacy and malformed articles usable without inventing questions', () => {
  expect(renderToStaticMarkup(<ArticleDiscovery article={{ title: 'Old', summary: 'Old summary' }} />)).toBe('');
  expect(learningExperience({ question: 'Only a question' })).toBeUndefined();
  expect(learningExperience({ ...experience, prediction: null })?.prediction).toBeUndefined();
});
it('links real sections and carries the article ID into optional follow-up questions', () => {
  const html = renderToStaticMarkup(<ArticleDiscovery article={{ id: 'article-1', title: 'Title', summary: 'Summary', sections: [{ id: 'a/b', title: 'Real implementation', content: '', order: 0 }], learningExperience: experience }} />);
  expect(html).toContain('#section-a%2Fb');
  expect(html).toContain('data-question="Where does the queue live?"');
  const compact = renderToStaticMarkup(<ArticleDiscovery article={{ title: 'Title', summary: 'Summary', learningExperience: experience }} compact />);
  expect(compact).not.toContain('自分で確かめる');
  expect(compact).not.toContain('data-question');
});
it('offers domain-appropriate choice on existing notes, without requiring engineering examples', () => {
  const item = { id: 'entry:a1', title: 'Could you clarify?', content: 'Original explanation', domains: ['english'], revision: 1 } as LearningItem;
  const html = renderToStaticMarkup(<LearningRediscovery item={item} />);
  expect(html).toContain('どんな会話で自然に使う');
  expect(html).toContain('送信・保存・復習設定はしません');
  expect(learningAngles({ domains: ['finance'] }, true)[0]).toContain('身近な出来事');
  expect(learningAngles({ domains: ['society'] }, false)[1]).toContain('who is affected');
  expect(learningAngles({ domains: ['engineering'] }, true)[1]).toContain('条件を一つ');
});
