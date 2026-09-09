'use client';

import { useTranslation } from 'react-i18next';
import { learningExperience } from '@/lib/learningExperience';
import type { StudyArticle } from '@/types/study';
import LearningContent from './LearningContent';
import LearningConversation from './LearningConversation';

/** Immediate, optional discovery on the page itself. No AI call or progress writes. */
export default function ArticleDiscovery({ article, compact = false }: {
  article: Pick<StudyArticle, 'title' | 'summary' | 'learningExperience'> & Partial<Pick<StudyArticle, 'id' | 'sections' | 'updatedAt'>>; compact?: boolean;
}) {
  const { i18n } = useTranslation();
  const ja = i18n.language.startsWith('ja');
  const say = (j: string, e: string) => ja ? j : e;
  const experience = learningExperience(article.learningExperience);
  if (!experience) return null;
  return <section className="my-6 space-y-5 rounded-2xl border border-emerald-500/30 bg-emerald-50/60 p-5 text-slate-900 sm:p-7 dark:bg-emerald-950/30 dark:text-slate-100" aria-label={say('問いから読む', 'Start with a question')}>
    <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">{say('気になるところだけで、いい。', 'Follow what makes you curious.')}</p>
    {!compact && <h2 className="text-2xl font-semibold leading-relaxed">{experience.question}</h2>}
    <p className="leading-7">{experience.whyItMatters}</p>
    {experience.prediction && <details className="rounded-xl border bg-white/60 p-4 dark:bg-slate-900/40">
      <summary className="cursor-pointer font-medium">{say('ちょっと予想する（任意）：', 'An optional prediction: ')}{experience.prediction.prompt}</summary>
      <div className="mt-4"><LearningContent content={experience.prediction.outcome} /></div>
    </details>}
    <details className="rounded-xl border bg-white/60 p-4 dark:bg-slate-900/40">
      <summary className="cursor-pointer font-medium">{say('まず一つ、なるほどを読む', 'Reveal the first insight')}</summary>
      <div className="mt-4"><LearningContent content={experience.quickInsight} /></div>
      <p className="mt-4 text-sm text-muted-foreground">{say('ここで終わってもOK。仕組みが気になったら本文へ。', 'You can stop here. Continue to the article if you want to see how it works.')}</p>
    </details>
    {!compact && experience.experiment && <details className="rounded-xl border bg-white/60 p-4 dark:bg-slate-900/40">
      <summary className="cursor-pointer font-medium">{say('自分で確かめる（任意）', 'Try it yourself (optional)')}</summary>
      <div className="mt-4"><LearningContent content={experience.experiment.steps} /></div>
      <details className="mt-4"><summary className="cursor-pointer">{say('何を観察する？', 'What should I observe?')}</summary><LearningContent content={experience.experiment.observation} /></details>
    </details>}
    {!compact && !!article.sections?.length && <nav aria-label={say('本文の道順', 'Explore the article')} className="space-y-2"><h3 className="font-medium">{say('仕組みをたどる', 'Follow how it works')}</h3>{article.sections?.map((s) => <a key={s.id} className="block text-sm underline underline-offset-4" href={`#section-${encodeURIComponent(s.id)}`}>{s.title}</a>)}</nav>}
    {!compact && experience.nextQuestions.length > 0 && <div className="space-y-3"><h3 className="font-medium">{say('この先が気になったら', 'Questions to follow next')}</h3>{experience.nextQuestions.map((q) => article.id ? <LearningConversation key={q} label={q} initialMode="explore" initialQuestion={q} material={{ title: article.title, content: experience.quickInsight, article: { id: article.id, updatedAt: article.updatedAt }, sources: [{ label: article.title, url: `https://www.meetyudai.com/study/articles/${encodeURIComponent(article.id)}` }] }} /> : <p key={q}>{q}</p>)}<p className="text-xs text-muted-foreground">{say('問いと記事IDをコピーして、普段のAIへ。自動送信はしません。', 'Copy a question and article ID to your AI. Nothing is sent automatically.')}</p></div>}
  </section>;
}
