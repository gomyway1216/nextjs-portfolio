'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { drawingInput, emptyDrawing } from '@/lib/ogiri/drawing-data';
import { loadDraft, saveDraft } from '@/lib/ogiri/drafts';
import { SHIRITORI_WORD_MAX, shiritoriProblem, shiritoriWord } from '@/lib/ogiri/shiritori';
import { normalizePlayerText } from '@/lib/ogiri/text';
import { GAME_TITLES, type Action, type DrawingData, type DrawingGameView, type RoomView } from '@/lib/ogiri/types';
import { DrawingCanvas } from './DrawingCanvas';
import { DrawingImage, loadDrawing } from './DrawingPicture';
import { Character } from './Character';
import { AnimatedScore } from './AnimatedScore';
import common from './Ogiri.module.css';
import styles from './DrawingGamePanel.module.css';

function ShiritoriPrompt({ code, assignment }: { code: string; assignment: NonNullable<DrawingGameView['assignment']> }) {
  if (assignment.inputDrawingId) return <>
    <h2>この絵、なんの絵？</h2>
    <DrawingImage code={code} id={assignment.inputDrawingId} label="前の人から届いた絵" />
    <p>読みの最後の音から始まる言葉を考えて、絵に描いてね。</p>
  </>;
  return <>
    <h2>{assignment.prompt ? `はじまりの言葉は「${assignment.prompt}」` : '前の絵はパス！'}</h2>
    <p>「{assignment.sound}」から始まる言葉を考えて、絵に描いてね。</p>
  </>;
}

function DrawingAnswer({ view, disabled, offline, send }: { view: RoomView; disabled: boolean; offline: boolean; send: (action: Action) => Promise<boolean> }) {
  const assignment = view.drawingGame!.assignment!;
  const shiritori = view.gameType === 'shiritori';
  const ready = Boolean(view.players.find(player => player.id === view.me)?.answerReady);
  const key = `ogiri:drawing-draft:${view.code}:${assignment.key}`;
  const [data, setData] = useState<DrawingData>(emptyDrawing), [base, setBase] = useState('');
  const [text, setText] = useState(assignment.answer);
  const [loading, setLoading] = useState(true), [saving, setSaving] = useState(false), [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    async function restore() {
      setLoading(true);
      try {
        const draft = loadDraft(key);
        if (assignment.kind === 'draw') {
          const saved = assignment.savedDrawingId ? await loadDrawing(view.code, assignment.savedDrawingId) : emptyDrawing();
          let value = saved;
          if (draft) { try { value = drawingInput(JSON.parse(draft), true); } catch { /* Use the saved picture. */ } }
          if (active) { setData(value); setBase(JSON.stringify(saved)); }
        } else if (active) setText(draft ?? assignment.answer);
      } catch { if (active) setError('保存した絵を読み込めませんでした。ページを更新して、もう一度お試しください。'); }
      finally { if (active) setLoading(false); }
    }
    void restore();
    return () => { active = false; };
  }, [key, view.code, assignment.kind, assignment.savedDrawingId, assignment.answer]);
  const normalized = shiritori ? shiritoriWord(text) : normalizePlayerText(text);
  const problem = shiritori ? shiritoriProblem(normalized, assignment.sound) : null;
  const dirty = assignment.kind === 'draw' ? JSON.stringify(data) !== base || (shiritori && normalized !== assignment.answer) : normalized !== assignment.answer;
  const invalid = assignment.kind === 'draw' ? !data.strokes.length || Boolean(problem) : !normalized || [...normalized].length > 80;
  const updateLabel = shiritori ? '絵を更新' : '伝言を更新';
  const locked = disabled || saving || loading || ready;
  const persist = (value: string, target = key) => saveDraft(target, value);
  return <div className={styles.answer}>
    {assignment.kind === 'draw' ? <>
      {shiritori ? <ShiritoriPrompt code={view.code} assignment={assignment} /> : <>
        <h2>{assignment.prompt ?? '前の伝言はパス！ 想像でつないでみよう。'}</h2>
        <p>この言葉を、絵だけで伝えてね。文字を書くのはお休み。</p>
      </>}
      <DrawingCanvas value={data} disabled={locked} onChange={next => { setData(next); persist(JSON.stringify(next)); }} />
      {shiritori && <>
        <label>描いた言葉の読み（ひらがな）
          <input aria-label="描いた言葉の読み" type="text" lang="ja" autoComplete="off" enterKeyHint="done"
            maxLength={SHIRITORI_WORD_MAX * 2} disabled={locked} value={text}
            onChange={event => { setText(event.target.value); persist(event.target.value, `${key}:word`); }} />
        </label>
        <small>読みは答え合わせまで、ほかの人には見えません。絵に文字を書くのはお休み。</small>
        {text && problem && <p role="status">{problem}</p>}
      </>}
    </> : <>
      <h2>この絵、ひとことで言うと？</h2>
      {assignment.inputDrawingId ? <DrawingImage code={view.code} id={assignment.inputDrawingId} label="前の人から届いた絵" /> : <p>前の絵はパス！ 想像で続きを伝えてね。</p>}
      <label>絵を言葉にする
        <textarea aria-label="絵を言葉にする" rows={2} maxLength={160} disabled={locked} value={text}
          onChange={event => { setText(event.target.value); persist(event.target.value); }} />
      </label>
      <small>{[...normalized].length} / 80文字</small>
    </>}
    {error && <p role="alert">{error}</p>}
    <div className={styles.answerButtons}>
      <button type="button" className={common.primary} disabled={locked || offline || invalid || (!dirty && assignment.saved)} onClick={async () => {
        setSaving(true);
        const ok = await send(assignment.kind === 'draw' ? { type: 'drawingSubmit', drawing: data, ...(shiritori ? { word: text } : {}) } : { type: 'drawingGuess', text });
        if (ok && assignment.kind === 'draw') setBase(JSON.stringify(data));
        setSaving(false);
      }}>{saving ? '送信中…' : assignment.saved && !dirty ? '送信済み ✓' : assignment.saved ? updateLabel : assignment.kind === 'draw' ? 'この絵を送る' : 'この言葉を送る'}</button>
      {ready ? <button type="button" className={common.secondary} disabled={disabled || offline || saving || loading}
        onClick={() => void send({ type: 'answerReady', ready: false })}>{shiritori ? '絵を直す' : '伝言を直す'}</button>
        : <button type="button" className={common.primary} disabled={disabled || offline || saving || loading || !assignment.saved || dirty}
          onClick={() => void send({ type: 'answerReady', ready: true })}>これでOK！</button>}
    </div>
    <small>送ったあとも「これでOK！」までは直せます。下書きはこの端末に保存します。</small>
    {dirty && assignment.saved && <p>未送信の変更があります。先に「{updateLabel}」を押してね。</p>}
  </div>;
}

function DrawingGallery({ view, tv, disabled, reduced, send }: {
  view: RoomView; tv: boolean; disabled: boolean; reduced: boolean; send: (action: Action) => Promise<boolean>;
}) {
  const game = view.drawingGame!;
  const [zoom, setZoom] = useState<DrawingGameView['gallery'][number] | null>(null);
  const dialog = useRef<HTMLDialogElement | null>(null);
  useEffect(() => {
    if (zoom) dialog.current?.showModal();
    else dialog.current?.close();
  }, [zoom]);
  return <>
    <h2>{game.results ? 'この絵に、一票入りました。' : '好きな絵、ひとつ選んでね。'}</h2>
    <p>{game.results ? '1票につき100点。描いた人に加算します。' : game.voted ? '投票済み。みんなの一票を待ってね。' : '絵を押すと大きく見られます。自分が描いた絵には投票できません。'}</p>
    <div className={`${styles.gallery} ${game.gallery.length > 24 ? styles.crowded : ''}`}>
      {game.gallery.map((work, i) => <button type="button" key={work.id} className={styles.work}
        aria-label={`絵${i + 1}を大きく見る`} onClick={() => setZoom(work)}>
        <DrawingImage code={view.code} id={work.id} label={`絵${i + 1}`} />
        <span><Character avatar={work.avatar} /><span className={styles.workName}>{work.name}{work.author === view.me && '（あなた）'}</span></span>
        {game.results && <b>{work.votes}票 · +<AnimatedScore value={work.points} animate={!reduced} /> 点</b>}
      </button>)}
    </div>
    {view.phase === 'voting' && <p className={styles.voteStatus}>{game.votesReceived} / {game.eligible} 人が投票済み</p>}
    <dialog ref={dialog} className={styles.zoom} aria-label="絵を大きく見る" onCancel={() => setZoom(null)} onClose={() => setZoom(null)}
      onClick={event => { if (event.target === event.currentTarget) { const r = event.currentTarget.getBoundingClientRect();
        if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) setZoom(null); } }}>
      <button type="button" className={common.secondary} onClick={() => setZoom(null)}>閉じる ×</button>
      {zoom && <>
        <DrawingImage code={view.code} id={zoom.id} label="選んだ絵" />
        <p><Character avatar={zoom.avatar} /> {zoom.name}の絵</p>
        {!tv && game.canVote && !game.voted && <button type="button" className={common.primary}
          disabled={disabled || zoom.author === view.me} onClick={async () => {
            if (await send({ type: 'drawingVote', choice: zoom.id })) setZoom(null);
          }}>{zoom.author === view.me ? '自分の絵には投票できません' : 'この絵に1票！'}</button>}
      </>}
    </dialog>
  </>;
}

export function DrawingGamePanel({ view, tv, busy, connected, reduced, send }: {
  view: RoomView; tv: boolean; busy: boolean; connected: boolean; reduced: boolean; send: (action: Action) => Promise<boolean>;
}) {
  const game = view.drawingGame;
  if (!game || !['answering', 'voting', 'reveal'].includes(view.phase)) return null;
  const held = busy || view.paused;
  const disabled = held || !connected;
  const shiritori = view.gameType === 'shiritori';
  const unit = shiritori ? 'しりとり' : '伝言';
  const drawingTurn = shiritori || game.stage % 2 === 1;
  return <section className={`${styles.panel} ${tv ? styles.tv : ''}`} aria-label={GAME_TITLES[shiritori ? 'shiritori' : 'drawing']}>
    {view.phase === 'answering' ? <>
      <p className={styles.eyebrow}>{unit} {game.stage} / {game.stages} · {shiritori ? '絵でつなぐ番' : drawingTurn ? '絵で伝える番' : '言葉で伝える番'}</p>
      {!tv && game.assignment ? <DrawingAnswer key={game.assignment.key} view={view} disabled={held} offline={!connected} send={send} /> : <>
        <h2>どんな{unit}になってるかな。</h2>
        <p>スマホで{drawingTurn ? '絵を描いて' : '絵を言葉にして'}、送ったら「これでOK！」。</p>
        <div className={common.playerGrid}>{view.players.filter(player => player.answeringThisRound).map(player =>
          <article className={common.player} key={player.id}><Character avatar={player.avatar} size="large" /><b>{player.name}</b>
            <small>{!player.active ? 'お休み中' : player.answerReady ? 'OK！ ✓' : drawingTurn ? 'おえかき中…' : '考え中…'}</small></article>)}</div>
      </>}
      <div className={common.readyBar} aria-label={`${unit}の確定状況`}>
        <p role="status"><b>{game.readyCount} / {game.answererCount}人がOK！</b> 全員の{shiritori ? '絵' : '伝言'}を待っています。</p>
        <small>目安時間を過ぎても描けます。{view.settings.autoAdvance ? '全員OKで次の人へ。' : '全員OKのあと、主催者が進めます。'}</small>
        {!tv && view.isHost && !view.settings.autoAdvance && game.readyCount === game.answererCount &&
          <button type="button" className={common.primary} disabled={disabled} onClick={() => void send({ type: 'next' })}>次の{shiritori ? '手' : '伝言'}へ →</button>}
      </div>
    </> : game.chain ? <>
      <p className={styles.eyebrow}>{unit}の答え合わせ · {game.chain.index} / {game.chain.total}</p>
      <h2>{shiritori ? 'はじまりの言葉' : '最初のお題'}「{game.chain.prompt}」</h2>
      <div className={`${styles.chainGrid} ${game.chain.steps.length === 3 ? styles.threeSteps : ''} ${shiritori && !reduced ? styles.sequence : ''}`}>{game.chain.steps.map((step, i) => <article className={styles.chainStep}
        key={`${game.chain!.index}:${i}`} style={{ '--step': i } as CSSProperties}>
        {shiritori ? <b className={styles.word}>{step.text ?? 'パス'}</b> : <b>{i + 1}. {step.kind === 'draw' ? '絵にしたら' : '言葉にしたら'}</b>}
        {step.drawingId ? <DrawingImage code={view.code} id={step.drawingId} label={`${unit}${i + 1}の絵`} /> : <p className={styles.guess}>{step.text ?? '今回はパス！'}</p>}
        {step.link !== null && <p className={`${styles.link} ${step.link ? styles.linked : ''}`}>{step.link ? 'つながった！ 2人に+100点' : '切れた…'}</p>}
        <p><Character avatar={step.avatar} /> {step.name}</p>
      </article>)}</div>
      <p className={styles.caption}>{shiritori ? 'こうして、つながりました。' : 'こうして、伝わりました。'}</p>
    </> : <DrawingGallery key={view.turn} view={view} tv={tv} disabled={disabled} reduced={reduced} send={send} />}
  </section>;
}
