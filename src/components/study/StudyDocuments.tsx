'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/providers/AuthProvider';
import { BookOpen, LockKeyhole, Search, ChevronLeft, ChevronRight, FileText, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { documentLearningPrompt, documentQueryExpansion, safeDocumentAsset, type StudyDocumentItem, type StudyDocumentPage, type StudyDocumentSearch } from '@/lib/studyDocuments';
import { safeLearningUrl } from '@/lib/learningLibrary';
import styles from './StudyDocuments.module.css';

export function DocumentSearchCard({item, onOpen}: {item: StudyDocumentItem; onOpen: () => void}) {
  return <button onClick={onOpen} className={`${styles.documentCard} group rounded-2xl border bg-card p-5 text-left transition hover:border-blue-500 hover:shadow-sm focus-visible:outline-2 focus-visible:outline-blue-500`}>
    <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground"><FileText size={16}/>{item.course} · {item.pageCount} ページ</div>
    <h2 className="break-words text-lg font-medium group-hover:text-blue-600">{item.title}</h2>
    <p className="mt-1 break-all text-xs text-muted-foreground">{item.relativePath}</p>
    {item.snippet && <p className="mt-3 line-clamp-3 text-sm text-muted-foreground">p. {item.page} · {item.snippet}</p>}
  </button>;
}

export function DocumentSearchExplanation({query, expansion}: {query: string; expansion?: StudyDocumentSearch['queryExpansion']}) {
  if (!query.trim()) return null;
  const resolved = documentQueryExpansion(expansion);
  return <aside className="min-w-0 space-y-2 rounded-xl bg-muted/50 p-4 text-sm" aria-label="検索方法">
    {resolved ? <>
      <p>対応する日本語の用語を、英語でも検索しました。</p>
      <details className="min-w-0 text-muted-foreground">
        <summary className="cursor-pointer">今回の検索語を見る</summary>
        <p className="mt-2">展開した検索語：<code className="break-all">{resolved.expandedQuery}</code></p>
        <p className="mt-2 break-words">対応した概念：{resolved.concepts.join('、')}</p>
        <p className="mt-2">登録済みの授業用語を置き換える検索です。自由な文章の翻訳や、意味の近さで探す検索ではありません。</p>
      </details>
    </> : <p>見つからない場合は、英語の短いキーワードでも試してください。例：index、transaction、virtual memory。</p>}
  </aside>;
}

function OwnerDocuments() {
  const { currentUser } = useAuth();
  const [query, setQuery] = useState('');
  const [course, setCourse] = useState('');
  const [offset, setOffset] = useState(0);
  const [selection, setSelection] = useState<{id: string; version?: string; page: number} | null>(null);
  const [catalog, setCatalog] = useState<StudyDocumentSearch | null>(null);
  const [page, setPage] = useState<StudyDocumentPage | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [question, setQuestion] = useState('');
  const [copied, setCopied] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id'); const version = params.get('version') || undefined;
    const n = Number(params.get('page') || 1);
    if (id && /^doc-[a-f0-9]{32}$/u.test(id) && (!version || /^[a-f0-9]{64}$/u.test(version)) && Number.isSafeInteger(n) && n > 0 && n <= 10000) setSelection({id, version, page: n});
    setReady(true);
  }, []);
  const request = useCallback(async (params: URLSearchParams, signal: AbortSignal) => {
    const token = await currentUser!.getIdToken();
    const response = await fetch(`/api/study/documents?${params}`, {cache: 'no-store', signal, headers: {Authorization: `Bearer ${token}`}});
    if (!response.ok) throw new Error('Unable to load documents');
    return response.json();
  }, [currentUser]);
  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setBusy(true); setError(false); setPage(null); setImageFailed(false); setCopied(false);
      try {
        const params = selection ? new URLSearchParams({id: selection.id, page: String(selection.page), ...(selection.version ? {version: selection.version} : {})}) : new URLSearchParams({query, course, offset: String(offset), limit: '20'});
        const data = await request(params, controller.signal);
        if (controller.signal.aborted) return;
        if (selection) {setPage(data); window.history.replaceState(null, '', `/study/documents?${new URLSearchParams({id: data.id, version: data.version, page: String(data.page)})}`);}
        else {setCatalog(data); window.history.replaceState(null, '', '/study/documents');}
      } catch {if (!controller.signal.aborted) setError(true);}
      finally {if (!controller.signal.aborted) setBusy(false);}
    }, selection ? 0 : 250);
    return () => {clearTimeout(timer); controller.abort();};
  }, [ready, request, selection, query, course, offset, refresh]);
  function open(value: typeof selection) {setBusy(true); setPage(null); setSelection(value); setQuestion('');}
  async function copyPrompt() {
    if (!page) return;
    try {await navigator.clipboard.writeText(documentLearningPrompt(page, question)); setCopied(true);} catch {setCopied(false);}
  }
  const image = safeDocumentAsset(page?.access?.imageUrl);
  const pdf = safeDocumentAsset(page?.access?.pdfUrl);
  const source = safeLearningUrl(page?.sourceUrl);
  return <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
    <nav className="flex flex-wrap gap-4 text-sm"><Link href="/study/learning" className="underline">← Learning Library</Link><Link href="/study" className="underline">記事を読む</Link></nav>
    <header className="space-y-3"><p className="flex items-center gap-2 text-sm text-muted-foreground"><LockKeyhole size={15}/>本人限定 · 元の資料をそのまま</p><h1 className="text-3xl font-semibold tracking-tight">授業のノートを、もう一度ひらく</h1><p className="max-w-2xl text-muted-foreground">科目から探す。気になる言葉でページを見つける。図や手書きを見ながら、AIと理解を深める。</p></header>
    {!selection && <>
      <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4 sm:flex-row">
        <label className={`${styles.searchField} flex min-w-0 flex-1 items-center gap-2`}><Search size={18} className="shrink-0"/><Input aria-label="資料を検索" aria-describedby="document-search-guidance" placeholder="日本語の主要用語／英語キーワード" value={query} onChange={e => {setBusy(true); setQuery(e.target.value); setOffset(0);}} /></label>
        <select className="min-h-10 max-w-full rounded-md border bg-background px-3" aria-label="科目" value={course} onChange={e => {setBusy(true); setCourse(e.target.value); setOffset(0);}}><option value="">すべての科目</option>{catalog?.courses.map(c => <option key={c.course} value={c.course}>{c.course} · {c.documents}</option>)}</select>
      </div>
      <p id="document-search-guidance" className="text-sm text-muted-foreground">例：索引、トランザクション、仮想メモリ / index、transaction。日本語は対応する授業用語から探せます。</p>
      {!busy && !error && catalog && <DocumentSearchExplanation query={query} expansion={catalog.queryExpansion}/>}
      {!busy && !error && <section className="grid gap-3 sm:grid-cols-2" aria-label="資料一覧">
        {catalog?.items.map(item => <DocumentSearchCard key={`${item.id}-${item.page}`} item={item} onOpen={() => open({id: item.id, version: item.version, page: item.page})}/>)}
        {catalog?.items.length === 0 && <p className="col-span-full rounded-2xl border border-dashed p-8 text-muted-foreground">{query ? '一致するページがありません。英語の別のキーワードでも試せます。' : '資料はまだ取り込まれていません。取り込み済みの科目がここに表示されます。'}</p>}
      </section>}
      {!busy && !error && <div className="flex gap-3"><Button variant="outline" disabled={offset === 0} onClick={() => {setBusy(true); setOffset(Math.max(0, offset - 20));}}>前へ</Button><Button variant="outline" disabled={!catalog?.hasMore} onClick={() => {setBusy(true); setOffset(offset + 20);}}>次へ</Button></div>}
    </>}
    {selection && <Button variant="outline" onClick={() => open(null)}><ChevronLeft size={16}/>資料一覧へ</Button>}
    {busy && <p role="status" className="rounded-2xl border p-8">資料を読み込んでいます…</p>}
    {error && <div role="alert" className="space-y-3 rounded-2xl border p-6"><p>資料を取得できませんでした。未設定・通信エラー・存在しないページの可能性があります。</p><Button onClick={() => setRefresh(n => n + 1)}>再試行</Button></div>}
    {!busy && !error && page && <article className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm text-muted-foreground">{page.course}</p><h2 className="break-words text-2xl font-semibold">{page.title}</h2></div><div className="flex items-center gap-2"><Button size="icon" variant="outline" aria-label="前のページ" disabled={page.page <= 1} onClick={() => open({id: page.id, version: page.version, page: page.page - 1})}><ChevronLeft/></Button><span className="text-sm tabular-nums">{page.page} / {page.pageCount}</span><Button size="icon" variant="outline" aria-label="次のページ" disabled={page.page >= page.pageCount} onClick={() => open({id: page.id, version: page.version, page: page.page + 1})}><ChevronRight/></Button></div></div>
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="min-w-0 overflow-hidden rounded-2xl border bg-white">
          {image && !imageFailed ? /* Never send private signed images through a public optimizer. */
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt={`${page.title}の元ページ ${page.page}（図・手書きを含む）`} className="h-auto w-full" referrerPolicy="no-referrer" onError={() => setImageFailed(true)}/> : <p className="p-6 text-black">ページ画像を取得できません。閲覧リンクを更新してください。</p>}
        </section>
        <aside className="space-y-4 rounded-2xl border bg-card p-5"><h3 className="flex items-center gap-2 font-medium"><MessageCircle size={18}/>ここから理解を深める</h3><p className="text-sm text-muted-foreground">質問とページIDをコピーして、Personal Memory接続済みのChatGPT・Claude・Codexへ。元ページをMCPから取得できます。</p><Input aria-label="このページへの質問" value={question} onChange={e => {setQuestion(e.target.value); setCopied(false);}} placeholder="この図は何を表している？"/><Button className="w-full" onClick={() => void copyPrompt()}>{copied ? 'コピーしました' : 'AIに聞く内容をコピー'}</Button><details className="text-xs"><summary className="cursor-pointer">コピーする内容を確認</summary><textarea readOnly aria-label="AIに渡す内容" className="mt-2 h-48 w-full rounded border bg-background p-2" value={documentLearningPrompt(page, question)}/></details>
          {pdf && <a className="flex items-center gap-2 text-sm underline" href={`${pdf}#page=${page.page}`} target="_blank" rel="noopener noreferrer"><BookOpen size={16}/>元のPDFを開く</a>}
          <Button variant="outline" className="w-full" onClick={() => setRefresh(n => n + 1)}>閲覧リンクを更新</Button><p className="text-xs text-muted-foreground">閲覧リンクは5分で失効します。保存する出典には下の固定リンクを使ってください。</p>
        </aside>
      </div>
      <details className="rounded-2xl border p-5"><summary className="cursor-pointer font-medium">検索用の抽出テキストを見る</summary><p className="my-3 text-sm text-amber-700 dark:text-amber-300">文字が取れたページでも、手書き・数式・図の欠落や誤読があります。必ず元ページと照合してください。{page.needsVisualReview && ' このページは文字が少ないため、画像での確認が特に必要です。'}</p><pre className="whitespace-pre-wrap break-words text-sm">{page.text || '抽出テキストなし'}</pre></details>
      <footer className="space-y-1 break-all text-xs text-muted-foreground">{source ? <a href={source} className="underline">この版・このページへの固定リンク</a> : <span>固定リンクを取得できませんでした</span>}<p>ID: {page.id} · Page: {page.page}</p><p>SHA256: {page.version}</p><p>取り込みは理解済みの記録ではありません。復習の予定は自動設定しません。</p></footer>
    </article>}
  </main>;
}
export default function StudyDocuments() {
  const { currentUser, isAdmin, loading } = useAuth();
  if (loading) return <main className="p-8" role="status">認証を確認しています…</main>;
  if (!currentUser || !isAdmin) return <main className="mx-auto max-w-3xl space-y-4 p-8"><h1 className="text-2xl">授業資料ライブラリ</h1><p>管理者本人だけが利用できます。</p><Link href="/admin" className="underline">管理者としてログイン</Link></main>;
  return <OwnerDocuments key={currentUser.uid}/>;
}
