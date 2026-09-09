'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/providers/AuthProvider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { BookOpen, Plus, Search, RotateCcw, LockKeyhole } from 'lucide-react';
import MermaidDiagram from '@/components/common/MermaidDiagram';
import LearningContent from './LearningContent';
import LearningToday from './LearningToday';
import LearningConversation from './LearningConversation';
import { LEARNING_DOMAINS, LEARNING_KINDS, LearningDomain, LearningKind, LearningItem, LearningAssessment, SaveLearningInput, learningLabels, safeLearningUrl } from '@/lib/learningLibrary';

function OwnerLearningLibrary() {
  const { currentUser, isAdmin } = useAuth();
  const { i18n } = useTranslation();
  const ja = i18n.language.startsWith('ja');
  const labels = learningLabels[ja ? 'ja' : 'en'];
  const say = (j: string, e: string) => ja ? j : e;
  const [items, setItems] = useState<LearningItem[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [query, setQuery] = useState('');
  const [domain, setDomain] = useState('all');
  const [kind, setKind] = useState('all');
  const [view, setView] = useState('today');
  const [focusId, setFocusId] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [draft, setDraft] = useState<SaveLearningInput | null>(null);
  const [sourceUrl, setSourceUrl] = useState('');
  const [diagram, setDiagram] = useState('');
  const [organizing, setOrganizing] = useState<LearningItem | null>(null);
  const requestNumber = useRef(0);
  const getToken = useCallback(() => {
    if (!currentUser) return Promise.reject(new Error('Sign in first'));
    return currentUser.getIdToken();
  }, [currentUser]);

  function browse(selectedDomain?: LearningDomain) {
    setBusy(true);
    setFocusId(null); setExpanded(null); setQuery(''); setKind('all'); setDomain(selectedDomain || 'all'); setOffset(0); setView('all');
  }
  function openItem(item: LearningItem) {
    setBusy(true);
    setFocusId(item.id); setExpanded(item.id); setQuery(''); setKind('all'); setDomain('all'); setOffset(0); setView('all');
  }

  const call = useCallback(async (action: string, input: unknown) => {
    if (!currentUser) throw new Error('Sign in first');
    const response = await fetch('/api/study/library', {
      method: 'POST', cache: 'no-store',
      headers: { Authorization: `Bearer ${await currentUser.getIdToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, input }),
    });
    const result = await response.json();
    if (!response.ok || result.success !== true) throw new Error(result.error || 'Unable to load Learning Library');
    return result;
  }, [currentUser]);

  const load = useCallback(async () => {
    if (!currentUser || !isAdmin) { setItems([]); return; }
    if (view === 'today') return;
    const serial = ++requestNumber.current;
    setBusy(true); setError('');
    try {
      const result = await call('search', focusId ? { id: focusId } : { query, view, offset, limit: 20, ...(domain !== 'all' ? { domain } : {}), ...(kind !== 'all' ? { kind } : {}) });
      if (serial !== requestNumber.current) return;
      setItems(focusId ? [result.item] : result.items); setTotal(focusId ? 1 : result.total); setHasMore(focusId ? false : result.hasMore);
    } catch (failure) { if (serial === requestNumber.current) setError(failure instanceof Error ? failure.message : 'Unable to load'); }
    finally { if (serial === requestNumber.current) setBusy(false); }
  }, [call, currentUser, isAdmin, query, domain, kind, view, offset, focusId]);

  useEffect(() => {
    const pending = requestNumber;
    const timer = setTimeout(() => { void load(); }, 250);
    return () => { clearTimeout(timer); ++pending.current; };
  }, [load]);

  function newNote(relatedId?: string) {
    setDraft({ sourceKey: `web-${crypto.randomUUID()}`, title: '', content: '', domains: [domain === 'all' ? 'other' : domain as LearningDomain], kind: 'concept', language: ja ? 'ja' : 'en', ...(relatedId ? { relatedIds: [relatedId] } : {}) });
    setSourceUrl(''); setDiagram(''); setError(''); setShowNew(true);
  }

  async function save(event: FormEvent) {
    event.preventDefault(); if (!draft || saving) return;
    setSaving(true); setError('');
    try {
      const result = await call('save', { ...draft, ...(sourceUrl ? { sources: [{ label: say('出典', 'Source'), url: sourceUrl }] } : {}), ...(diagram.trim() ? { diagrams: [{ title: draft.title, mermaid: diagram }] } : {}) });
      setShowNew(false); setDraft(null); setNotice(say('非公開で保存しました。復習の予定はまだ設定していません。', 'Saved privately. No review reminder has been scheduled.'));
      setExpanded(result.item.id);
      // A successful save must remain visible even when a review/search filter was active.
      if (query || domain !== 'all' || kind !== 'all' || view !== 'all' || offset || focusId) {
        setBusy(true); setFocusId(null); setQuery(''); setDomain('all'); setKind('all'); setView('all'); setOffset(0);
      } else { await load(); }
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to save'); }
    finally { setSaving(false); }
  }

  async function assess(item: LearningItem, assessment: LearningAssessment) {
    if (saving) return;
    setSaving(true); setError('');
    try {
      await call('review', { id: item.id, expectedRevision: item.revision, eventId: crypto.randomUUID(), assessment, selfReported: true });
      setNotice(say('自己評価を保存しました。', 'Your self-assessment was saved.')); await load();
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to save'); }
    finally { setSaving(false); }
  }

  async function openRelated(id: string) {
    setError(''); setFocusId(id); setExpanded(id);
  }

  async function organize() {
    if (!organizing || saving) return;
    setSaving(true); setError('');
    try {
      await call('organize', { id: organizing.id, expectedRevision: organizing.revision, domains: organizing.domains, kind: organizing.kind });
      setOrganizing(null); setNotice(say('内容を変えずに分類を保存しました。', 'Grouping saved without changing the content.')); await load();
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to save'); }
    finally { setSaving(false); }
  }

  return <main className="mx-auto max-w-6xl space-y-7 px-4 py-8 sm:px-8 sm:py-12">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="mb-2 flex items-center gap-2 text-sm text-muted-foreground"><LockKeyhole size={16} />{say('本人限定', 'Private to you')}</p><h1 className="text-3xl font-semibold tracking-tight">{say('学びのライブラリ', 'Learning Library')}</h1><p className="mt-2 text-base text-muted-foreground">{say('覚えておきたいことを、図や出典と一緒に。', 'Keep useful knowledge with the diagrams and sources that made it click.')}</p></div>
      <Button onClick={() => newNote()}><Plus size={18} />{say('学びを保存', 'Save a learning')}</Button>
    </header>
    <nav className="flex flex-wrap gap-x-5 gap-y-2 text-sm"><Link href="/study" className="flex items-center gap-2 underline"><BookOpen size={16} />{say('エンジニア向けの記事を読む', 'Read engineering articles')}</Link><Link href="/memory?view=private" className="underline">Personal Memory</Link><Link href="/study/learning/dictionary" className="underline">{say('既存の辞書', 'Existing dictionary')}</Link></nav>
    <Tabs value={view} onValueChange={(value) => { setFocusId(null); setExpanded(null); setQuery(''); setDomain('all'); setKind('all'); setView(value); setOffset(0); setNotice(''); setError(''); }}><TabsList className="h-auto w-full justify-start gap-1 p-1 sm:w-auto"><TabsTrigger value="today" className="min-h-11 flex-1 px-5">{say('今日', 'Today')}</TabsTrigger><TabsTrigger value="all" className="min-h-11 flex-1 px-5">{say('本棚', 'Library')}</TabsTrigger><TabsTrigger value="review" className="min-h-11 flex-1 px-5">{say('少し復習する', 'A little review')}</TabsTrigger></TabsList></Tabs>
    {view === 'today' ? <LearningToday getToken={getToken} onOpen={openItem} onBrowse={browse} /> : <>
    <section className="space-y-4 rounded-xl border bg-card p-4">
      {focusId && <Button variant="link" onClick={() => browse()}>{say('← 本棚の一覧に戻る', '← Back to your shelf')}</Button>}
      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-48 flex-1"><Search size={18} className="absolute left-3 top-3 text-muted-foreground" /><Input aria-label={say('学びを検索', 'Search learnings')} className="pl-10" maxLength={240} placeholder={say('単語・コンセプト・メモから検索', 'Search words, concepts and notes')} value={query} onChange={(e) => { setFocusId(null); setQuery(e.target.value); setOffset(0); }} /></div>
        <Select value={domain} onValueChange={(v) => { setFocusId(null); setDomain(v); setOffset(0); }}><SelectTrigger className="w-full sm:w-52" aria-label={say('分野', 'Domain')}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{say('すべての分野', 'All domains')}</SelectItem>{LEARNING_DOMAINS.map((d) => <SelectItem key={d} value={d}>{labels.domains[d]}</SelectItem>)}</SelectContent></Select>
        <Select value={kind} onValueChange={(v) => { setFocusId(null); setKind(v); setOffset(0); }}><SelectTrigger className="w-full sm:w-44" aria-label={say('種類', 'Kind')}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{say('すべての種類', 'All kinds')}</SelectItem>{LEARNING_KINDS.map((k) => <SelectItem key={k} value={k}>{labels.kinds[k]}</SelectItem>)}</SelectContent></Select>
      </div>
      {view === 'review' && <p className="text-sm text-muted-foreground">{say('復習を始めたものだけが並びます。今日は一つでも十分です。', 'Only items you chose to review appear here. One is enough for today.')}</p>}
    </section>
    {error && !showNew && <div role="alert" className="rounded-lg border border-red-500 p-4"><p>{error}</p><Button variant="outline" className="mt-2" onClick={() => void load()}>{say('再読み込み', 'Reload')}</Button></div>}
    {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
    {busy ? <p role="status">{say('読み込み中…', 'Loading…')}</p> : !error && <>
      <p className="text-sm text-muted-foreground">{total} {say('件', 'items')}</p>
      {!items.length && <section className="rounded-xl border border-dashed p-8"><h2 className="text-xl font-medium">{say(view === 'review' ? '今は復習の予定がありません' : '該当する学びがありません', view === 'review' ? 'No reviews due' : 'No matching learnings')}</h2><p className="mt-3 text-muted-foreground">{say('相談で役立った説明や表現を保存できます。既存の未分類ノートは「その他・未分類」にあります。', 'Save a useful explanation or expression from a conversation. Existing ungrouped notes appear under Other / ungrouped.')}</p></section>}
      <div className="space-y-4">{items.map((item) => <article key={item.id} className="overflow-hidden rounded-xl border bg-card">
        <div className="p-5"><div className="mb-3 flex flex-wrap gap-2 text-sm text-muted-foreground">{item.domains.map((d) => <span key={d} className="rounded-full bg-muted px-3 py-1">{labels.domains[d]}</span>)}<span className="py-1">{labels.kinds[item.kind]} · {labels.states[item.state]}</span></div>
          <h2 className="text-xl font-semibold"><button className="text-left hover:underline" aria-expanded={expanded === item.id} onClick={() => setExpanded(expanded === item.id ? null : item.id)}>{item.title}</button></h2>
          {item.summary && (view !== 'review' || expanded === item.id) && <p className="mt-3 text-muted-foreground">{item.summary}</p>}
          {item.nextReviewAt && <p className="mt-2 text-sm text-muted-foreground">{say('次の復習：', 'Next review: ')}{new Date(item.nextReviewAt).toLocaleDateString(ja ? 'ja-JP' : 'en-US')}</p>}
          {expanded !== item.id && <Button variant="outline" className="mt-4" onClick={() => setExpanded(item.id)}>{say(view === 'review' ? '思い出してから説明を見る' : '説明・図・出典を見る', view === 'review' ? 'Recall first, then reveal' : 'Open explanation, diagrams and sources')}</Button>}
        </div>
        {expanded === item.id && <div className="space-y-6 border-t p-5">
          <LearningConversation material={{ title: item.title, content: item.content, itemId: item.id, revision: item.revision, sources: item.sources, diagrams: item.diagrams, figures: item.figures }} />
          <LearningContent content={item.content} />
          {item.pronunciation && <p>{item.pronunciation}</p>}
          {item.examples?.map((example, i) => <blockquote key={i} className="space-y-2 border-l-2 pl-4"><p>{example.sentence || example.context}</p>{example.codeExample && <pre className="overflow-x-auto rounded bg-muted p-3"><code>{example.codeExample}</code></pre>}<p className="text-sm text-muted-foreground">{example.explanation}</p></blockquote>)}
          {item.diagrams.map((d, i) => <section key={i}><h3 className="font-medium">{d.title}</h3><MermaidDiagram chart={d.mermaid} /></section>)}
          {item.figures.map((f, i) => {
            const url = safeLearningUrl(f.url);
            return <p key={i}>{url ? <a href={url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" className="underline">{say('元の図を開く：', 'Open original figure: ')}{f.title}</a> : <span>{f.title} — {say('参照リンクが無効です', 'Reference unavailable')}</span>}</p>;
          })}
          {!!item.sources.length && <section><h3 className="mb-2 font-medium">{say('出典・元の説明', 'Sources and original explanations')}</h3><ul className="space-y-2">{item.sources.map((s, i) => {
            const url = safeLearningUrl(s.url);
            return <li key={i}>{url ? <a href={url} className="underline" target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{s.label}</a> : s.label}{s.locator && <p className="break-words text-sm text-muted-foreground">{s.locator}</p>}</li>;
          })}</ul></section>}
          {item.linkedArticleIds.map((id) => <Link key={id} className="block underline" href={`/study/articles/${encodeURIComponent(id)}`}>{say('元の記事を読む', 'Read source article')}</Link>)}
          {item.relatedIds.map((id) => <Button key={id} variant="link" onClick={() => void openRelated(id)}>{say('関連する元の学びを開く', 'Open linked original learning')}</Button>)}
          <section className="rounded-lg bg-muted p-4"><h3 className="flex items-center gap-2 font-medium"><RotateCcw size={18} />{say('自分の言葉で説明できそう？', 'Could you explain it in your own words?')}</h3><div className="mt-3 flex flex-wrap gap-2">{(['again', 'remembered', 'understood', 'pause'] as const).map((a) => <Button key={a} variant="outline" disabled={saving} onClick={() => void assess(item, a)}>{labels.assessments[a]}</Button>)}</div><p className="mt-3 text-sm text-muted-foreground">{say('読むだけでは理解済みになりません。自己評価したものだけ復習を予定します。', 'Reading does not mark this as understood. Only your self-assessment schedules a review.')}</p></section>
          <div className="flex flex-wrap gap-3"><Button variant="outline" onClick={() => newNote(item.id)}>{say('関連する学びを追加', 'Add a linked follow-up')}</Button><Button variant="outline" onClick={() => { setError(''); setOrganizing(item); }}>{say('分類を変更', 'Change grouping')}</Button></div>
          <details className="text-sm text-muted-foreground"><summary className="cursor-pointer">{say('保存情報を確認', 'Verify saved record')}</summary><dl className="mt-3 space-y-2 break-all"><div><dt>Item ID</dt><dd>{item.id}</dd></div><div><dt>Revision</dt><dd>{item.revision}</dd></div><div><dt>{say('最終更新（保存先の時刻）', 'Last updated (stored timestamp)')}</dt><dd>{item.updatedAt || item.createdAt || '—'}</dd></div><div><dt>{say('公開範囲', 'Visibility')}</dt><dd>private</dd></div></dl></details>
        </div>}
      </article>)}</div>
      <div className="flex justify-between"><Button variant="outline" disabled={!offset} onClick={() => setOffset(Math.max(0, offset - 20))}>{say('前へ', 'Previous')}</Button><Button variant="outline" disabled={!hasMore} onClick={() => setOffset(offset + 20)}>{say('次へ', 'Next')}</Button></div>
    </>}
    </>}
    <Dialog open={Boolean(organizing)} onOpenChange={(open) => { if (!open && !saving) setOrganizing(null); }}><DialogContent><DialogHeader><DialogTitle>{say('分野と種類を変更', 'Change domains and kind')}</DialogTitle><DialogDescription>{say('元の説明・図・自己評価は変更しません。', 'Your original explanation, diagrams and self-assessment stay unchanged.')}</DialogDescription></DialogHeader>{organizing && <>
      {error && <p role="alert">{error}</p>}
      <fieldset className="space-y-3"><legend>{organizing.title}</legend>{LEARNING_DOMAINS.map((d) => <label key={d} className="flex items-center gap-2"><Checkbox checked={organizing.domains.includes(d)} onCheckedChange={(checked) => setOrganizing({ ...organizing, domains: checked ? [...organizing.domains, d] : organizing.domains.filter((v) => v !== d) })} />{labels.domains[d]}</label>)}</fieldset>
      <Select value={organizing.kind} onValueChange={(k) => setOrganizing({ ...organizing, kind: k as LearningKind })}><SelectTrigger aria-label={say('種類', 'Kind')}><SelectValue /></SelectTrigger><SelectContent>{LEARNING_KINDS.map((k) => <SelectItem key={k} value={k}>{labels.kinds[k]}</SelectItem>)}</SelectContent></Select>
      <Button disabled={saving || !organizing.domains.length} onClick={() => void organize()}>{say('分類を保存', 'Save grouping')}</Button>
    </>}</DialogContent></Dialog>
    <Dialog open={showNew} onOpenChange={(open) => { if (!saving) setShowNew(open); }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{say('学びを非公開で保存', 'Save a private learning')}</DialogTitle><DialogDescription>{say('説明や元の図を残せます。保存しても理解済みにはせず、AI生成も実行しません。', 'Keep an explanation and its original diagram. Saving does not imply understanding or run AI generation.')}</DialogDescription></DialogHeader>
      {draft && <form className="space-y-4" onSubmit={(e) => void save(e)}>
        {error && <p role="alert" className="text-red-600">{error}</p>}
        <label className="block space-y-2"><span>{say('タイトル', 'Title')}</span><Input required maxLength={240} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></label>
        <fieldset><legend className="mb-2">{say('分野（複数選択可）', 'Domains (choose one or more)')}</legend><div className="flex flex-wrap gap-3">{LEARNING_DOMAINS.map((d) => <label key={d} className="flex items-center gap-2 text-sm"><Checkbox checked={draft.domains.includes(d)} onCheckedChange={(checked) => setDraft({ ...draft, domains: checked ? [...draft.domains, d] : draft.domains.filter((v) => v !== d) })} />{labels.domains[d]}</label>)}</div></fieldset>
        <Select value={draft.kind} onValueChange={(k) => setDraft({ ...draft, kind: k as LearningKind })}><SelectTrigger aria-label={say('学びの種類', 'Learning kind')}><SelectValue /></SelectTrigger><SelectContent>{LEARNING_KINDS.map((k) => <SelectItem key={k} value={k}>{labels.kinds[k]}</SelectItem>)}</SelectContent></Select>
        <label className="block space-y-2"><span>{say('説明・例・自分のメモ', 'Explanation, example and notes')}</span><Textarea required rows={8} maxLength={30000} value={draft.content} onChange={(e) => setDraft({ ...draft, content: e.target.value })} /></label>
        <label className="block space-y-2"><span>{say('出典のHTTPSリンク（任意）', 'Source HTTPS link (optional)')}</span><Input type="url" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} /></label>
        <label className="block space-y-2"><span>{say('元のMermaid図（任意）', 'Original Mermaid diagram (optional)')}</span><Textarea rows={4} value={diagram} onChange={(e) => setDiagram(e.target.value)} /></label>
        <p className="text-sm text-muted-foreground">{say('パスワード・APIキー・復旧コードなどは保存しないでください。', 'Do not save passwords, API keys or recovery codes.')}</p>
        <Button type="submit" disabled={saving || !draft.domains.length}>{say(saving ? '保存中…' : '非公開で保存', saving ? 'Saving…' : 'Save privately')}</Button>
      </form>}
    </DialogContent></Dialog>
  </main>;
}

export default function LearningLibrary() {
  const { currentUser, isAdmin, loading } = useAuth();
  const { i18n } = useTranslation();
  const ja = i18n.language.startsWith('ja');
  if (loading) return <main className="mx-auto max-w-6xl p-6" role="status">{ja ? '認証を確認しています…' : 'Checking access…'}</main>;
  if (!currentUser || !isAdmin) return <main className="mx-auto max-w-3xl px-5 py-16"><h1 className="text-2xl font-semibold">Learning Library</h1><p className="my-5">{ja ? 'この学習ライブラリは管理者本人だけが利用できます。' : 'This learning library is private to its owner.'}</p><Link className="underline" href="/admin">{ja ? '管理者としてログイン' : 'Admin sign in'}</Link></main>;
  // Drop fetched private data and unsaved drafts on sign-out or account switch.
  return <OwnerLearningLibrary key={currentUser.uid} />;
}
