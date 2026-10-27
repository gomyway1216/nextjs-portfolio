'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import QRCode from 'qrcode';
import { AVATARS, CATEGORIES, type Action, type RoomView, type Settings } from '@/lib/ogiri/types';
import styles from './Ogiri.module.css';

const phaseName = {
  lobby: 'みんなを待っています',
  answering: 'ひらめきの時間',
  voting: '笑ったほうに、一票。',
  reveal: 'この一言の作者は…',
  ranking: 'ここまでの大喜利王',
  finished: '今夜の大喜利王！',
};
async function request(path: string, data?: unknown): Promise<RoomView> {
  const res = await fetch(`/api/ogiri${path}`, {
    method: data ? 'POST' : 'GET',
    cache: 'no-store',
    credentials: 'same-origin',
    headers: data ? { 'Content-Type': 'application/json' } : {},
    body: data ? JSON.stringify(data) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  const result = await res.json();
  if (!res.ok) throw new Error(result.error ?? '接続できませんでした。');
  return result;
}
function JoinForm({
  code,
  create = false,
  onJoined,
}: {
  code?: string;
  create?: boolean;
  onJoined?: (view: RoomView) => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(''),
    [avatar, setAvatar] = useState(AVATARS[0]);
  const [room, setRoom] = useState(code ?? ''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const view = await request(create ? '' : `/${room.trim().toUpperCase()}`, {
        type: 'join',
        name,
        avatar,
      });
      localStorage.setItem('ogiri:lastRoom', view.code);
      if (onJoined) onJoined(view);
      else router.push(`/games/ogiri/${view.code}`);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className={styles.form}>
      {!create && !code && (
        <label>
          ルームコード
          <input
            aria-label="ルームコード"
            autoCapitalize="characters"
            autoComplete="off"
            maxLength={6}
            placeholder="ABC234"
            value={room}
            onChange={(e) => setRoom(e.target.value.toUpperCase().replace(/[^A-Z2-9]/g, ''))}
            required
          />
        </label>
      )}
      <label>
        ニックネーム
        <input
          aria-label="ニックネーム"
          autoComplete="nickname"
          maxLength={32}
          placeholder="呼んでほしい名前（16文字まで）"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </label>
      <fieldset>
        <legend>あなたのアバター</legend>
        <div className={styles.avatars}>
          {AVATARS.map((a) => (
            <button
              type="button"
              key={a}
              aria-label={`アバター ${a}`}
              aria-pressed={a === avatar}
              onClick={() => setAvatar(a)}
            >
              {a}
            </button>
          ))}
        </div>
      </fieldset>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      <button className={styles.primary} disabled={busy}>
        {busy ? '接続中…' : create ? 'ルームを作成 →' : 'ルームに参加 →'}
      </button>
      <small>登録不要・無料。同じブラウザなら、更新しても戻れます。</small>
    </form>
  );
}
export function OgiriLanding() {
  const [create, setCreate] = useState(false),
    [lastRoom, setLastRoom] = useState('');
  // Restoring browser-only storage after hydration is intentional.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    setLastRoom(localStorage.getItem('ogiri:lastRoom') ?? '');
  }, []);
  return (
    <main className={styles.app} lang="ja">
      <div className={styles.shell}>
        <nav className={styles.nav}>
          <Link href="/games">← Games</Link>
          <span>おもしろいは、みんなでつくる。</span>
          <span className={styles.badge}>3〜12人</span>
        </nav>
        <div className={styles.hero}>
          <section>
            <p className={styles.eyebrow}>スマホが回答席。テレビが舞台。</p>
            <h1 className={styles.title}>
              <span>みんなの</span>大喜利
              <span className={styles.lime}>
                王<span aria-hidden="true">✳</span>
              </span>
            </h1>
            <p className={styles.intro}>
              正解はない。
              <br />
              あなたの一言が、今夜をさらう。
            </p>
            <p>
              お題にこっそり回答して、笑ったほうに投票。
              <br />
              友だちと、家族と、初めましての人と。
            </p>
            <div className={styles.facts}>
              <span>📱 インストール不要</span>
              <span>⏱ 目安15〜25分</span>
              <span>🎃 ハロウィンにも</span>
            </div>
          </section>
          <section className={styles.joinCard} aria-label="ゲームをはじめる">
            <div className={styles.tabs}>
              <button aria-pressed={!create} onClick={() => setCreate(false)}>
                ルームに参加
              </button>
              <button aria-pressed={create} onClick={() => setCreate(true)}>
                主催する
              </button>
            </div>
            <h2>{create ? 'みんなの舞台をつくろう。' : 'その一言、お待ちしてます。'}</h2>
            <JoinForm key={String(create)} create={create} />
            {lastRoom && (
              <Link className={styles.back} href={`/games/ogiri/${lastRoom}`}>
                前のルーム（{lastRoom}）に戻る →
              </Link>
            )}
          </section>
        </div>
        <div className={styles.sample}>
          <span className={styles.badge}>たとえば、こんなお題。</span>
          <p>
            洗濯物をたたむ競技が世界大会に。
            <br />
            実況が一番盛り上がる瞬間は？
          </p>
          <span aria-hidden="true">💬 ✦ 💬</span>
        </div>
        <section className={styles.steps} aria-label="遊び方">
          {[
            ['01', '集まる', '主催者がルームを作成。テレビ画面のQRをスマホで読み取ろう。'],
            ['02', 'ひらめく', '1人2問、90秒。同じお題に答える相手は、まだ秘密。'],
            ['03', '笑って選ぶ', '2つの回答から投票。1票100点、勝利ボーナス200点！'],
          ].map(([n, title, text]) => (
            <article key={n}>
              <b>{n}</b>
              <h2>{title}</h2>
              <p>{text}</p>
            </article>
          ))}
        </section>
        <section className={styles.guide}>
          <h2>リビングが、会場になる。</h2>
          <p>
            PCをHDMIでテレビへつなぐか、Chromeのメニューから「キャスト」を選択。テレビのブラウザで表示用URLを開く方法も使えます。主催者のスマホから「テレビ画面を開く」でURLを確認できます。
          </p>
          <p>
            全員が同じWi-Fiにいる必要はありません。主催者もスマホから回答できます。ゲーム中の新規参加は再戦までお待ちください。
          </p>
          <p>
            同点は同じ順位。自分の対戦は投票をお休み。未回答・非表示の回答は得点なし。回答は100文字までです。
          </p>
        </section>
      </div>
    </main>
  );
}
function AnswerForm({
  assignment,
  code,
  disabled,
  send,
}: {
  assignment: RoomView['assignments'][number];
  code: string;
  disabled: boolean;
  send: (a: Action) => Promise<boolean>;
}) {
  const key = `ogiri:draft:${code}:${assignment.id}`;
  const [text, setText] = useState(assignment.answer),
    [busy, setBusy] = useState(false),
    [saved, setSaved] = useState(assignment.answer);
  // This also restores the unsent Japanese draft after a full reload.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    setText(localStorage.getItem(key) ?? assignment.answer);
  }, [key, assignment.answer]);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    if (await send({ type: 'answer', matchId: assignment.id, text })) {
      setSaved(text);
      localStorage.removeItem(key);
    }
    setBusy(false);
  }
  return (
    <form className={styles.answerForm} onSubmit={submit} data-testid="answer-form">
      <h2>{assignment.text}</h2>
      <textarea
        aria-label="回答"
        rows={3}
        maxLength={200}
        placeholder="あなたのひらめきを、ここに。"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          localStorage.setItem(key, e.target.value);
        }}
        disabled={disabled}
      />
      <div className={styles.row}>
        <small>{[...text].length} / 100文字</small>
        <button
          className={styles.primary}
          disabled={disabled || busy || !text.trim() || [...text].length > 100}
        >
          {busy
            ? '送信中…'
            : saved === text && saved
              ? '送信済み ✓'
              : saved
                ? '回答を更新'
                : 'この回答を送る'}
        </button>
      </div>
      <small aria-live="polite">
        {saved ? '送信済み。締め切りまでは修正できます。' : '下書きはこの端末に自動保存されます。'}
      </small>
    </form>
  );
}
function SettingsForm({
  settings,
  send,
}: {
  settings: Settings;
  send: (a: Action) => Promise<boolean>;
}) {
  const [s, set] = useState(settings),
    [saved, setSaved] = useState(false);
  return (
    <form
      className={styles.form}
      onSubmit={async (e) => {
        e.preventDefault();
        setSaved(await send({ type: 'settings', settings: s }));
      }}
      onChange={() => setSaved(false)}
    >
      <div className={styles.settingGrid}>
        {(
          [
            ['rounds', 'ラウンド数', [1, 2, 3, 4, 5]],
            ['answerSeconds', '回答時間（秒）', [30, 60, 90, 120, 180]],
            ['voteSeconds', '投票時間（秒）', [10, 15, 20, 30, 45]],
          ] as const
        ).map(([key, label, values]) => (
          <label key={key}>
            {label}
            <select
              aria-label={label}
              value={s[key]}
              onChange={(e) => set({ ...s, [key]: Number(e.target.value) })}
            >
              {values.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <label className={styles.check}>
        <input
          type="checkbox"
          checked={s.autoAdvance}
          onChange={(e) => set({ ...s, autoAdvance: e.target.checked })}
        />
        全員投票後・結果発表後に自動で進行
      </label>
      <label className={styles.check}>
        <input
          type="checkbox"
          checked={s.halloween}
          onChange={(e) => set({ ...s, halloween: e.target.checked })}
        />
        🎃 ハロウィンモード（専用のお題とテーマ）
      </label>
      <fieldset disabled={s.halloween}>
        <legend>ジャンル（選択なしで全部）</legend>
        <div className={styles.genres}>
          {Object.entries(CATEGORIES).map(([id, label]) => (
            <label className={styles.check} key={id}>
              <input
                type="checkbox"
                checked={s.categories.includes(id as keyof typeof CATEGORIES)}
                onChange={(e) =>
                  set({
                    ...s,
                    categories: e.target.checked
                      ? [...s.categories, id as keyof typeof CATEGORIES]
                      : s.categories.filter((c) => c !== id),
                  })
                }
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <button className={styles.secondary}>設定を保存</button>
      {saved && <small role="status">設定を保存しました。</small>}
    </form>
  );
}
export function OgiriRoom({ code, tv = false }: { code: string; tv?: boolean }) {
  const [view, setView] = useState<RoomView | null>(null),
    [error, setError] = useState(''),
    [connected, setConnected] = useState(true);
  const [qr, setQr] = useState(''),
    [clock, setClock] = useState(0),
    [offset, setOffset] = useState(0);
  const [sound, setSound] = useState(false),
    [reduced, setReduced] = useState(false),
    [busy, setBusy] = useState(false);
  const audio = useRef<AudioContext | null>(null),
    latest = useRef<RoomView | null>(null),
    lastBeat = useRef(0);
  const accept = useCallback((next: RoomView) => {
    if (latest.current && next.revision < latest.current.revision) return;
    const receivedAt = Date.now();
    latest.current = next;
    setView(next);
    setClock(receivedAt);
    setOffset(next.serverTime - receivedAt);
    setConnected(true);
  }, []);
  useEffect(() => {
    let stopped = false,
      timeout: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const next = await request(`/${code}${tv ? '?view=tv' : ''}`);
        if (!stopped) {
          accept(next);
          setError('');
        }
        if (!lastBeat.current) lastBeat.current = Date.now();
        if (!tv && next.me && Date.now() - lastBeat.current > 30000) {
          lastBeat.current = Date.now();
          await request(`/${code}`, { type: 'heartbeat' });
        }
      } catch (error) {
        if (!stopped) {
          setConnected(false);
          setError((error as Error).message);
        }
      }
      if (!stopped) timeout = setTimeout(poll, document.hidden ? 5000 : 1500);
    }
    void poll();
    const interval = setInterval(() => setClock(Date.now()), 250);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser preference after hydration
    setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    QRCode.toDataURL(`${window.location.origin}/games/ogiri/${code}`, {
      width: 240,
      margin: 2,
      color: { dark: '#251345', light: '#ffffff' },
    }).then(setQr);
    return () => {
      stopped = true;
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [code, tv, accept]);
  const soundPhase = view?.phase,
    soundMatch = view?.match?.id;
  useEffect(() => {
    if (!sound || !audio.current || !soundPhase || !['reveal', 'finished'].includes(soundPhase))
      return;
    const ctx = audio.current;
    [523.25, 659.25, 783.99, ...(soundPhase === 'finished' ? [1046.5] : [])].forEach(
      (frequency, i) => {
        const osc = ctx.createOscillator(),
          gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = frequency;
        const start = ctx.currentTime + i * 0.12;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.12, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.4);
        osc.start(start);
        osc.stop(start + 0.42);
      },
    );
  }, [sound, soundPhase, soundMatch]); // A short original synthesised cue; no downloaded audio.
  async function send(action: Action) {
    if (tv || busy) return false;
    setBusy(true);
    setError('');
    try {
      const v = latest.current;
      const next = await request(`/${code}`, { ...action, turn: v?.turn });
      accept(next);
      return true;
    } catch (error) {
      setError((error as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  const v = view,
    mine = v?.players.find((p) => p.id === v.me);
  const remaining = v
    ? Math.max(0, Math.ceil((v.deadline - (v.paused ? v.serverTime : clock + offset)) / 1000))
    : 0;
  return (
    <main
      lang="ja"
      className={`${styles.app} ${tv ? styles.tv : ''} ${v?.settings.halloween ? styles.halloween : ''} ${reduced ? styles.reduced : ''}`}
    >
      <div className={styles.roomShell}>
        <nav className={styles.nav}>
          <Link href="/games/ogiri">✳ みんなの大喜利王</Link>
          <span className={styles.code}>
            ROOM <b>{code}</b>
          </span>
          <div className={styles.tools}>
            <button
              aria-label={sound ? 'ミュート' : '効果音をオン'}
              aria-pressed={sound}
              onClick={() => {
                if (!audio.current) audio.current = new AudioContext();
                void audio.current.resume();
                setSound(!sound);
              }}
            >
              {sound ? '🔊' : '🔇'}
            </button>
            <button aria-pressed={reduced} onClick={() => setReduced(!reduced)}>
              動き{reduced ? '少' : '多'}
            </button>
            {tv && (
              <button
                onClick={() => {
                  void document.documentElement.requestFullscreen?.();
                }}
              >
                全画面
              </button>
            )}
          </div>
        </nav>
        {!connected && (
          <p className={styles.error} role="status">
            接続を確認しています。自動で再接続します。回答の下書きは保存されています。
          </p>
        )}
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
        {!v ? (
          <section className={styles.wait}>
            <span className={styles.bigEmoji}>💬</span>
            <h1>ルームに接続しています…</h1>
            <Link href="/games/ogiri">スタートページに戻る</Link>
          </section>
        ) : (
          <>
            <header className={styles.roundHeader}>
              <div>
                <p className={styles.eyebrow}>
                  {v.settings.halloween ? '🎃 HALLOWEEN PARTY' : 'ことばであそぼう。'}{' '}
                  {v.round > 0 && `ROUND ${v.round} / ${v.settings.rounds}`}
                </p>
                <h1>{phaseName[v.phase]}</h1>
              </div>
              {v.deadline > 0 && !['finished', 'lobby'].includes(v.phase) && (
                <div
                  className={`${styles.timer} ${remaining <= 10 ? styles.urgent : ''}`}
                  role="timer"
                  aria-label="残り時間"
                >
                  {v.paused ? '休憩' : remaining}
                  <small>{v.paused ? '再開まで待ってね' : '秒'}</small>
                </div>
              )}
            </header>
            {v.paused && (
              <p className={styles.pause} role="status">
                ☕ 一時停止中です。主催者の再開をお待ちください。
              </p>
            )}
            {!tv && !v.me && (
              <section className={styles.joinCard}>
                <h2>ルーム {code} に参加</h2>
                <JoinForm code={code} onJoined={accept} />
              </section>
            )}
            {v.phase === 'lobby' && (
              <div className={styles.lobby}>
                <section className={styles.lobbyPlayers}>
                  <div className={styles.row}>
                    <h2>ただいま {v.players.length} 人</h2>
                    <span>3人からスタート / 最大12人</span>
                  </div>
                  <div className={styles.playerGrid}>
                    {v.players.map((p) => (
                      <article key={p.id} className={styles.player}>
                        <span>{p.avatar}</span>
                        <b>{p.name}</b>
                        <small>
                          {!p.active ? 'お休み中' : p.connected ? '参加中 ✓' : '接続を待っています'}
                        </small>
                      </article>
                    ))}
                  </div>
                  <p>短い一言でOK。すべっても、みんなで笑おう。</p>
                </section>
                <aside className={styles.qrCard}>
                  {qr && (
                    <Image
                      unoptimized
                      src={qr}
                      alt="スマートフォンで読み取ってルームに参加"
                      width={240}
                      height={240}
                    />
                  )}
                  <h2>スマホで、ここから参加。</h2>
                  <p>meetyudai.com/games/ogiri</p>
                  <strong>{code}</strong>
                </aside>
              </div>
            )}
            {v.phase === 'answering' &&
              (tv ? (
                <section className={styles.wait}>
                  <span className={styles.bigEmoji}>{v.settings.halloween ? '🎃' : '💡'}</span>
                  <h2>あなたのスマホに、2つのお題。</h2>
                  <p>書き終えたら「この回答を送る」を押してね。</p>
                  <div className={styles.playerGrid}>
                    {v.players.map((p) => (
                      <article key={p.id} className={styles.player}>
                        <span>{p.avatar}</span>
                        <b>{p.name}</b>
                        <small>
                          {p.answered}/2 回答済み {p.answered === 2 && '✨'}
                        </small>
                      </article>
                    ))}
                  </div>
                </section>
              ) : (
                <div className={styles.assignments}>
                  {v.assignments.map((a) => (
                    <AnswerForm
                      key={a.id}
                      assignment={a}
                      code={code}
                      disabled={v.paused || !connected || remaining === 0}
                      send={send}
                    />
                  ))}
                </div>
              ))}
            {v.match && (
              <section className={styles.battle} key={v.match.id}>
                <p className={styles.eyebrow}>
                  お題 {v.match.index} / {v.match.total}
                </p>
                <h2 className={styles.prompt}>{v.match.text}</h2>
                <div className={styles.answers}>
                  {v.match.answers.map((answer, i) => {
                    const m = v.match!,
                      result = m.result,
                      count = result?.counts[i] ?? 0,
                      total = result?.counts.reduce((a, b) => a + b, 0) ?? 0;
                    return (
                      <article
                        className={`${styles.answerCard} ${answer && [...answer].length > 60 ? styles.longAnswer : ''} ${result && count > result.counts[1 - i] ? styles.winner : ''}`}
                        key={i}
                      >
                        <span className={styles.letter}>{i ? 'B' : 'A'}</span>
                        <p>{answer ?? '今回はパス！'}</p>
                        {!tv && v.phase === 'voting' && m.canVote && (
                          <button
                            className={styles.primary}
                            disabled={busy || m.voted || !answer || v.paused || remaining === 0}
                            onClick={() => void send({ type: 'vote', matchId: m.id, choice: i })}
                          >
                            {m.voted ? '投票済み ✓' : `${i ? 'B' : 'A'} に投票`}
                          </button>
                        )}
                        {result && (
                          <div className={styles.result}>
                            <b>
                              {count}票{' '}
                              <small>({total ? Math.round((count / total) * 100) : 0}%)</small>
                            </b>
                            <div className={styles.voteBar}>
                              <span style={{ width: `${total ? (count / total) * 100 : 0}%` }} />
                            </div>
                            <p>{result.authors[i]}</p>
                            <strong>+{result.points[i]} pt</strong>
                            {result.counts[0] === result.counts[1] ? (
                              <small>引き分け！</small>
                            ) : (
                              count > result.counts[1 - i] && <small>この対戦の勝者 👑</small>
                            )}
                          </div>
                        )}
                        {v.isHost && !tv && ['voting', 'reveal'].includes(v.phase) && answer && (
                          <button
                            className={styles.textButton}
                            onClick={() => {
                              if (
                                window.confirm('この回答を非表示にします。得票も取り消されます。')
                              )
                                void send({ type: 'hide', matchId: m.id, choice: i });
                            }}
                          >
                            この回答を非表示
                          </button>
                        )}
                      </article>
                    );
                  })}
                </div>
                <p className={styles.voteStatus} aria-live="polite">
                  {v.phase === 'voting'
                    ? `${v.match.votesReceived} / ${v.match.eligible} 人が投票済み${!tv && v.me && !v.match.canVote ? ' · 自分の対戦は投票をお休み' : ''}`
                    : '拍手！ 次のお題もお楽しみに。'}
                </p>
              </section>
            )}
            {['ranking', 'finished'].includes(v.phase) && (
              <section className={styles.ranking}>
                {v.phase === 'finished' && (
                  <>
                    <div className={styles.confetti} aria-hidden="true">
                      {Array.from({ length: 36 }, (_, i) => (
                        <i
                          key={i}
                          style={{
                            left: `${i * 2.8}%`,
                            animationDelay: `${(i % 7) * 0.18}s`,
                            background: ['#d8fc70', '#ff8dbb', '#a8c5ff'][i % 3],
                          }}
                        />
                      ))}
                    </div>
                    <div className={styles.champion}>
                      <span>👑</span>
                      <h2>
                        {v.players.filter((p) => p.rank === 1).length > 2
                          ? `${v.players.filter((p) => p.rank === 1).length}人の大喜利王！`
                          : v.players
                              .filter((p) => p.rank === 1)
                              .map((p) => `${p.avatar} ${p.name}`)
                              .join(' ＆ ')}
                      </h2>
                      <p>そのひらめきに、盛大な拍手を。</p>
                    </div>
                  </>
                )}
                <div className={styles.rankGrid}>
                  {v.players.map((p) => (
                    <article
                      className={`${styles.rankRow} ${p.rank <= 3 ? styles.topRank : ''}`}
                      key={p.id}
                    >
                      <b>{p.rank <= 3 ? ['🥇', '🥈', '🥉'][p.rank - 1] : p.rank}</b>
                      <span className={styles.rankName}>
                        {p.avatar} {p.name}
                        <small>
                          {p.previousRank > p.rank
                            ? `↑${p.previousRank - p.rank}`
                            : p.previousRank < p.rank
                              ? `↓${p.rank - p.previousRank}`
                              : '→'}{' '}
                          今回 +{p.roundScore}
                        </small>
                      </span>
                      <strong>
                        {p.score}
                        <small>pt</small>
                      </strong>
                    </article>
                  ))}
                </div>
                {!tv && v.isHost && v.phase === 'finished' && (
                  <button
                    className={styles.primary}
                    onClick={() => void send({ type: 'rematch' })}
                    disabled={busy}
                  >
                    同じメンバーで再戦 →
                  </button>
                )}
              </section>
            )}
            {!tv && mine && (
              <div className={styles.myScore}>
                {mine.avatar} {mine.name}
                <span>
                  {mine.rank}位 · <b>{mine.score} pt</b>
                </span>
              </div>
            )}
            {!tv && v.isHost && (
              <details className={styles.host} open={v.phase === 'lobby'}>
                <summary>👑 主催者の操作</summary>
                <div className={styles.hostBody}>
                  <a
                    href={`/games/ogiri/${code}/tv`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.secondary}
                  >
                    テレビ画面を開く ↗
                  </a>
                  <p className={styles.tvUrl}>
                    テレビ用URL:{' '}
                    <span>
                      {typeof window !== 'undefined'
                        ? window.location.origin
                        : 'https://meetyudai.com'}
                      /games/ogiri/{code}/tv
                    </span>
                  </p>
                  {['lobby', 'finished'].includes(v.phase) && (
                    <SettingsForm key={`${v.game}:${v.phase}`} settings={v.settings} send={send} />
                  )}
                  <div className={styles.controls}>
                    {v.phase === 'lobby' ? (
                      <button
                        className={styles.primary}
                        disabled={busy || v.players.filter((p) => p.active).length < 3}
                        onClick={() => void send({ type: 'start' })}
                      >
                        ゲーム開始 →
                      </button>
                    ) : (
                      v.phase !== 'finished' && (
                        <>
                          <button
                            className={styles.secondary}
                            disabled={busy}
                            onClick={() => void send({ type: v.paused ? 'resume' : 'pause' })}
                          >
                            {v.paused ? '再開' : '一時停止'}
                          </button>
                          <button
                            className={styles.secondary}
                            disabled={busy || v.paused}
                            onClick={() => {
                              if (
                                ['answering', 'voting'].includes(v.phase) &&
                                !window.confirm('制限時間を待たずに締め切りますか？')
                              )
                                return;
                              void send({ type: 'next' });
                            }}
                          >
                            次へ進む
                          </button>
                          <button
                            className={styles.textButton}
                            onClick={() => {
                              if (window.confirm('ゲームを終了して結果を表示しますか？'))
                                void send({ type: 'finish' });
                            }}
                          >
                            ゲーム終了
                          </button>
                        </>
                      )
                    )}
                  </div>
                  <details>
                    <summary>参加者の管理</summary>
                    {v.players
                      .filter((p) => p.id !== v.me)
                      .map((p) => (
                        <div className={styles.row} key={p.id}>
                          <span>
                            {p.avatar} {p.name}
                          </span>
                          <button
                            className={styles.textButton}
                            onClick={() => {
                              if (window.confirm(`${p.name}さんを退出させますか？`))
                                void send({ type: 'kick', playerId: p.id });
                            }}
                          >
                            退出させる
                          </button>
                        </div>
                      ))}
                  </details>
                </div>
              </details>
            )}
          </>
        )}
      </div>
    </main>
  );
}
