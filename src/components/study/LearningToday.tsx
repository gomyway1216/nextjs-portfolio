'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight, BookOpen, Code2, Languages, Landmark, Globe2, Library, RefreshCw, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LEARNING_DOMAINS, learningLabels, type LearningDomain, type LearningItem } from '@/lib/learningLibrary';
import { loadLearningToday, type LearningTodayData } from '@/lib/learningToday';

const domainIcons = { engineering: Code2, english: Languages, finance: Landmark, society: Globe2, other: Library };
const domainColor = { engineering: 'text-blue-600', english: 'text-violet-600', finance: 'text-emerald-600', society: 'text-amber-600', other: 'text-muted-foreground' };

export function LearningTodayView({ data, busy, onReload, onOpen, onBrowse }: {
  data: LearningTodayData; busy: boolean; onReload: () => void;
  onOpen: (item: LearningItem) => void; onBrowse: (domain?: LearningDomain) => void;
}) {
  const { i18n } = useTranslation();
  const ja = i18n.language.startsWith('ja');
  const say = (j: string, e: string) => ja ? j : e;
  const labels = learningLabels[ja ? 'ja' : 'en'];
  return <div className="space-y-8">
    <div className="flex items-center justify-between gap-3"><div><h2 className="text-2xl font-semibold tracking-tight">{say('今日は、ここから。', 'A little learning, from here.')}</h2><p className="mt-2 text-muted-foreground">{say('一つ読んでも、一つ思い出しても。それだけで十分。', 'Read one thing or recall one idea. That is enough.')}</p></div><Button size="icon" variant="ghost" disabled={busy} onClick={onReload} aria-label={say('最新の保存状態を確認', 'Refresh saved activity')}><RefreshCw size={18} className={busy ? 'animate-spin' : ''} /></Button></div>
    {busy && <p role="status" className="text-sm text-muted-foreground">{say('記事と保存済みの学びを確認中…', 'Checking articles and saved learnings…')}</p>}
    {!!data.errors.length && <p role="alert" className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm">{say('一部の情報を取得できませんでした。表示できた内容は利用できます。再読み込みで確認してください。', 'Some information could not be loaded. Available items still work; refresh to retry.')}</p>}
    <div className="grid gap-5 lg:grid-cols-[1.45fr_1fr]">
      <section className="flex flex-col rounded-2xl border border-primary/20 bg-primary/5 p-6 sm:p-8" aria-labelledby="today-article">
        <p className="mb-5 flex items-center gap-2 text-sm font-medium text-primary"><BookOpen size={18} />{say('新しい視点を読む · Engineering', 'Read a new perspective · Engineering')}</p>
        {data.article ? <>
          <p className="mb-2 text-sm text-muted-foreground">{say(data.articleReason === 'unread' ? '最近20件のうち、最新の未読記事' : data.articleReason === 'latest' ? '最近20件は読了済み · 最新を読み返す' : '最新の記事 · 読了状態は未確認', data.articleReason === 'unread' ? 'Newest unread among the latest 20 articles' : data.articleReason === 'latest' ? 'Latest 20 read · revisit the newest' : 'Latest article · read status unavailable')}</p>
          <h3 id="today-article" className="text-2xl font-semibold leading-relaxed tracking-tight">{data.article.title}</h3>
          <p className="mb-6 mt-4 leading-7 text-muted-foreground">{data.article.summary}</p>
          <div className="mt-auto flex flex-wrap items-center gap-4"><Button asChild><Link href={`/study/articles/${encodeURIComponent(data.article.id)}`}>{say('記事を開く', 'Open article')}<ArrowRight size={18} /></Link></Button><Link href="/study" className="text-sm underline underline-offset-4">{say('すべての記事', 'All articles')}</Link></div>
          <p className="mt-4 text-sm text-muted-foreground">{say('読んだ後の「ためになった／ならなかった」が、次の題材選びに使われます。', 'Your useful / not useful feedback helps choose the next topic.')}</p>
        </> : <><h3 id="today-article" className="text-xl font-semibold">{say(busy ? '記事を確認中' : data.errors.includes('articles') ? '記事は取得できていません' : 'まだ記事がありません', busy ? 'Checking articles' : data.errors.includes('articles') ? 'Articles unavailable' : 'No articles yet')}</h3><Link href="/study" className="mt-4 underline">{say('記事ライブラリを開く', 'Open article library')}</Link></>}
      </section>
      <section className="flex flex-col rounded-2xl border bg-card p-6 sm:p-8" aria-labelledby="today-review">
        <p className="mb-5 flex items-center gap-2 text-sm font-medium text-muted-foreground"><RotateCcw size={18} />{say('少し思い出す', 'Recall one idea')}</p>
        {data.due ? <>
          <p className="mb-2 text-sm text-muted-foreground">{say('自分で復習を始めた学びから', 'From the learnings you chose to review')}</p>
          <h3 id="today-review" className="text-xl font-semibold leading-relaxed">{data.due.title}</h3>
          <p className="mb-6 mt-4 leading-7 text-muted-foreground">{say('どういう意味で、どんな場面に使える？まず自分の言葉で思い出してみよう。', 'What does it mean, and when would you use it? Try recalling it in your own words first.')}</p>
          <Button variant="outline" className="mt-auto self-start" onClick={() => onOpen(data.due!)}>{say('思い出したら説明を見る', 'Reveal the explanation')}</Button>
          <p className="mt-4 text-sm text-muted-foreground">{data.dueTotal} {say('件が復習時期。一度に全部やる必要はありません。', 'due. No need to finish them all today.')}</p>
        </> : <><h3 id="today-review" className="text-xl font-semibold">{say(busy ? '復習の予定を確認中' : data.errors.includes('review') ? '復習の予定は未確認です' : '今日は復習の予定なし', busy ? 'Checking reviews' : data.errors.includes('review') ? 'Review schedule unavailable' : 'No reviews due today')}</h3><p className="mt-4 leading-7 text-muted-foreground">{say('保存しただけでは課題を増やしません。気になる学びを開き、自分で復習を始められます。', 'Saving does not create homework. Open a learning whenever you want to start reviewing it.')}</p><Button variant="outline" className="mt-6 self-start" onClick={() => onBrowse()}>{say('本棚を眺める', 'Browse your shelf')}</Button></>}
      </section>
    </div>
    <section aria-labelledby="learning-shelves"><div className="mb-4 flex items-center justify-between gap-3"><h2 id="learning-shelves" className="text-xl font-semibold">{say('分野から、続きを見つける', 'Find your next thread')}</h2><span className="text-sm text-muted-foreground">{data.total === undefined ? '—' : data.total} {say('件の学び', 'learnings')}</span></div><div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">{LEARNING_DOMAINS.map((domain) => {
      const Icon = domainIcons[domain];
      return <button key={domain} className="group flex min-h-28 flex-col items-start justify-between gap-4 rounded-xl border bg-card p-4 text-left transition-colors hover:border-primary/50 hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-primary" onClick={() => onBrowse(domain)}><Icon size={22} className={domainColor[domain]} /><span className="flex w-full items-center justify-between gap-2 text-sm font-medium">{labels.domains[domain]}<ArrowRight size={16} className="shrink-0 text-muted-foreground" /></span></button>;
    })}</div></section>
    <section aria-labelledby="recent-learnings"><div className="mb-4 flex items-center justify-between gap-3"><h2 id="recent-learnings" className="text-xl font-semibold">{say('最近保存・更新した学び', 'Recently saved or updated')}</h2><Button variant="link" onClick={() => onBrowse()}>{say('本棚へ', 'Open shelf')}<ArrowRight size={16} /></Button></div>
      <p className="mb-4 text-sm text-muted-foreground">{say('AIとの会話で保存された学びも、ここで確認できます。全会話の自動取り込み状況を示すものではありません。', 'Learnings saved from AI conversations appear here too. This is not a status monitor for every conversation.')}</p>
      <div className="divide-y rounded-xl border bg-card">{data.recent.map((item) => <button key={item.id} onClick={() => onOpen(item)} className="flex w-full items-center justify-between gap-4 p-5 text-left hover:bg-muted/50"><div className="min-w-0"><p className="mb-1 text-sm text-muted-foreground">{item.domains.map((d) => labels.domains[d]).join(' · ')} · {labels.states[item.state]}</p><h3 className="font-medium leading-relaxed">{item.title}</h3></div><ArrowRight size={18} className="shrink-0 text-muted-foreground" /></button>)}</div>
      {!busy && !data.recent.length && <p className="rounded-xl border border-dashed p-6 text-muted-foreground">{say(data.errors.includes('library') ? '保存済みの学びは取得できていません。' : '会話で分かったことを一つ保存すると、ここから再び開けます。', data.errors.includes('library') ? 'Saved learnings could not be loaded.' : 'Save one useful explanation from a conversation and revisit it here.')}</p>}
    </section>
  </div>;
}

export default function LearningToday({ getToken, onOpen, onBrowse }: {
  getToken: () => Promise<string>; onOpen: (item: LearningItem) => void; onBrowse: (domain?: LearningDomain) => void;
}) {
  const [data, setData] = useState<LearningTodayData>({ recent: [], articleReason: 'unknown', errors: [] });
  const [busy, setBusy] = useState(true);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    void loadLearningToday(async (path, body) => {
      const response = await fetch(path, { method: body ? 'POST' : 'GET', cache: 'no-store', headers: { Authorization: `Bearer ${await getToken()}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
      const result = await response.json();
      if (!response.ok || result.success !== true) throw new Error('Unable to load');
      return result;
    }).then((result) => { if (active) { setData(result); setBusy(false); } });
    return () => { active = false; };
  }, [getToken, refresh]);
  return <LearningTodayView data={data} busy={busy} onReload={() => { setBusy(true); setRefresh((value) => value + 1); }} onOpen={onOpen} onBrowse={onBrowse} />;
}
