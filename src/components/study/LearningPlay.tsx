'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Check, FlaskConical, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { LearningPlay as Play } from '@/lib/learningPlay';

/** All feedback and scene transitions were authored with the article. No AI/network or progress writes. */
export default function LearningPlay({ play }: { play: Play }) {
  const { i18n } = useTranslation();
  const ja = i18n.language.startsWith('ja');
  const say = (j: string, e: string) => ja ? j : e;
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [scenes, setScenes] = useState<Record<string, string>>({});
  const [paused, setPaused] = useState(false);
  const currentIndex = index >= 0 && index < play.activities.length ? index : 0;
  const activity = play.activities[currentIndex];
  const choice = activity.type === 'quiz' ? activity.choices.find(c => c.id === answers[activity.id]) : undefined;
  const scene = activity.type === 'experiment'
    ? activity.states.find(s => s.id === scenes[activity.id])
      ?? activity.states.find(s => s.id === activity.initialStateId)
    : undefined;
  return <section aria-label={say('触って学ぶ', 'Learn by trying')} className="my-6 overflow-hidden rounded-2xl border border-blue-300 bg-white text-slate-900 shadow-sm dark:border-blue-800 dark:bg-slate-950 dark:text-slate-100">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-blue-100 bg-blue-50 px-5 py-4 dark:border-blue-900 dark:bg-blue-950">
      <h2 className="flex items-center gap-2 font-semibold"><FlaskConical size={20} />{say('触って学ぶ', 'Learn by trying')}</h2>
      <span className="text-sm">{say('この画面で完結・AI通信なし', 'On this page · no AI calls')}</span>
    </div>
    {paused ? <div className="space-y-4 p-5 sm:p-7">
      <h3 className="text-xl font-semibold">{say('ここでひと区切り。', 'A good place to stop.')}</h3>
      <p>{say('正解数で理解済みにはしません。気になるところから、また試せます。', 'Answers do not mark mastery. You can keep exploring when you want.')}</p>
      <Button onClick={() => setPaused(false)}>{say('続きへ戻る', 'Resume')}</Button>
      <a className="ml-4 inline-block underline underline-offset-4" href="#introduction">{say('詳しい本文へ', 'Read the full article')}</a>
    </div> : <>
      <nav aria-label={say('学習の順番', 'Learning activities')} className="flex flex-wrap gap-2 px-5 pt-5">
        {play.activities.map((a, n) => <button key={a.id} type="button" aria-current={n === currentIndex ? 'step' : undefined} onClick={() => setIndex(n)} className={`min-h-11 rounded-lg border px-3 py-2 text-sm ${n === currentIndex ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800'}`}>{n + 1}. {a.title}</button>)}
      </nav>
      <div className="space-y-5 p-5 sm:p-7">
        <div aria-live="polite">
          <p className="mb-2 text-sm text-blue-700 dark:text-blue-300">{currentIndex + 1} / {play.activities.length} · {activity.type === 'quiz' ? say('予想してみる', 'Make a prediction') : say('条件を変えて確かめる', 'Change a condition')}</p>
          <h3 className="text-xl font-semibold leading-relaxed sm:text-2xl">{activity.prompt}</h3>
        </div>
        {activity.type === 'quiz' && <>
          <div role="group" aria-label={say('答えを選ぶ', 'Choose an answer')} className="grid gap-3">
            {activity.choices.map((c, n) => <button type="button" key={c.id} aria-pressed={choice?.id === c.id} onClick={() => setAnswers({ ...answers, [activity.id]: c.id })} className={`flex min-h-14 items-center gap-3 rounded-xl border-2 p-4 text-left text-base leading-relaxed transition-colors ${choice?.id === c.id ? 'border-blue-600 bg-blue-50 dark:bg-blue-950' : 'border-slate-200 hover:border-blue-400 dark:border-slate-700'}`}><span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-100">{String.fromCharCode(65 + n)}</span>{c.label}{choice?.id === c.id && <Check className="ml-auto shrink-0" size={18} />}</button>)}
          </div>
          <div key={activity.id}>
            <details className="rounded-lg bg-slate-50 p-4 dark:bg-slate-900"><summary className="cursor-pointer">{say('分からない・ヒントを見る', 'Not sure · show a hint')}</summary><p className="mt-3 leading-7">{activity.hint}</p></details>
          </div>
          {choice && <div role="status" className="rounded-xl border-l-4 border-blue-500 bg-blue-50 p-5 dark:bg-blue-950">
            <p className="mb-2 font-semibold">{choice.correct ? say('その予想で合っています。', 'That prediction fits.') : say('ここが分かれ目です。', 'Here is the key distinction.')}</p>
            <p className="whitespace-pre-line leading-7">{choice.feedback}</p>
          </div>}
          <div key={`explanation-${activity.id}`}>
            <details className="rounded-lg border p-4"><summary className="cursor-pointer">{say('答えと理由を見る（回答なしでもOK）', 'See the answer and why (no answer required)')}</summary><p className="mt-3 font-semibold">{activity.choices.find(c => c.correct)?.label}</p><p className="mt-2 whitespace-pre-line leading-7">{activity.explanation}</p></details>
          </div>
        </>}
        {activity.type === 'experiment' && scene && <>
          <p className="text-sm text-muted-foreground">{say('教材内のモデルです。本物のCookieやログイン状態は変更しません。', 'A teaching model. It never changes real cookies or sign-in state.')}</p>
          <div aria-live="polite" aria-atomic="true" className="space-y-4 rounded-xl border bg-slate-50 p-4 sm:p-5 dark:bg-slate-900">
            <h4 className="font-semibold">{scene.label}</h4>
            <div className="flex flex-col items-stretch gap-3 md:flex-row">
              {scene.panels.map((p, n) => <div key={n} className="flex min-w-0 flex-1 items-center gap-3">
                {n > 0 && <ArrowRight aria-hidden="true" className="hidden shrink-0 text-blue-500 md:block" size={20} />}
                <div className="min-w-0 flex-1 rounded-xl border border-blue-200 bg-white p-4 dark:border-blue-800 dark:bg-slate-950"><p className="mb-3 text-sm text-muted-foreground">{p.label}</p><p className="whitespace-pre-line break-words text-lg font-semibold leading-relaxed">{p.value}</p></div>
              </div>)}
            </div>
            <p className="whitespace-pre-line leading-7">{scene.explanation}</p>
          </div>
          <div role="group" aria-label={say('実験の操作', 'Experiment controls')} className="flex flex-wrap gap-3">
            {scene.actions.map((a, n) => <Button key={n} variant="outline" className="h-auto min-h-11 whitespace-normal py-3 text-left" onClick={() => setScenes({ ...scenes, [activity.id]: a.target })}>{a.label}</Button>)}
            <Button variant="ghost" onClick={() => setScenes({ ...scenes, [activity.id]: activity.initialStateId })}><RotateCcw size={16} />{say('最初の状態へ', 'Reset experiment')}</Button>
          </div>
        </>}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-5">
          <Button variant="ghost" onClick={() => setPaused(true)}>{say('今日はここまで', 'Stop here')}</Button>
          {currentIndex < play.activities.length - 1 ? <Button onClick={() => setIndex(currentIndex + 1)}>{say('次へ（回答は任意）', 'Next (answer optional)')}<ArrowRight size={16} /></Button> : <a className="rounded-lg bg-blue-600 px-4 py-3 text-white" href="#introduction">{say('実システムとコードを見る', 'Explore the real system and code')}</a>}
        </div>
      </div>
    </>}
  </section>;
}
