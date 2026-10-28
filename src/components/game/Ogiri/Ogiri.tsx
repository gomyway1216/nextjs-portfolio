'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import QRCode from 'qrcode';
import { AVATARS, CATEGORIES, type Action, type RoomView, type Settings } from '@/lib/ogiri/types';
import { isManualResult, startRoomPolling, type SyncStop } from '@/lib/ogiri/polling';
import { rememberHistory } from '@/lib/ogiri/history-local';
import { CHARACTERS, characterFor } from '@/lib/ogiri/characters';
import { createPartyAudio, phaseSound } from '@/lib/ogiri/sound';
import { Character } from './Character';
import { PartyResults } from './PartyResults';
import styles from './Ogiri.module.css';

const phaseName = {
  lobby: 'みんなを待っています',
  answering: 'ひらめきの時間',
  voting: '笑ったほうに、一票。',
  reveal: 'この一言の作者は…',
  ranking: 'ここまでの大喜利王',
  finished: '今夜の大喜利王！',
};
async function request(path: string, data?: unknown, signal?: AbortSignal): Promise<RoomView> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timeout = setTimeout(abort, 15000);
  if (signal?.aborted) abort();
  else signal?.addEventListener('abort', abort, { once: true });
  try {
    const res = await fetch(`/api/ogiri${path}`, {
      method: data ? 'POST' : 'GET',
      cache: 'no-store',
      credentials: 'same-origin',
      headers: data ? { 'Content-Type': 'application/json' } : {},
      body: data ? JSON.stringify(data) : undefined,
      signal: controller.signal,
    });
    const result = await res.json();
    if (!res.ok)
      throw Object.assign(new Error(result.error ?? '接続できませんでした。'), {
        status: res.status,
      });
    return result;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
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
  const [hostPlays, setHostPlays] = useState(false);
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
        ...(create ? { hostPlays } : {}),
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
          // HTML counts UTF-16 units; the server counts Unicode code points.
          maxLength={32}
          placeholder="呼んでほしい名前（16文字まで）"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <small>{[...name.normalize('NFKC')].length} / 16文字</small>
      </label>
      <fieldset>
        <legend>あなたのキャラクター · {characterFor(avatar).name}</legend>
        <div className={styles.avatars}>
          {CHARACTERS.map((character) => (
            <button
              type="button"
              key={character.id}
              aria-label={`キャラクター ${character.name}`}
              aria-pressed={character.avatar === avatar}
              onClick={() => setAvatar(character.avatar)}
            >
              <Character avatar={character.avatar} size="medium" decorative />
              <span>{character.name}</span>
            </button>
          ))}
        </div>
      </fieldset>
      {create && (
        <label>
          <span>
            <input
              type="checkbox"
              checked={hostPlays}
              onChange={(e) => setHostPlays(e.target.checked)}
            />{' '}
            主催者もこの端末で回答する
          </span>
          <small>
            通常は進行役専用です。テレビ・PCで主催する場合はオフにし、回答は各自のスマホから参加してください。
          </small>
        </label>
      )}
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      <button className={styles.primary} disabled={busy || [...name.normalize('NFKC')].length > 16}>
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
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLastRoom(localStorage.getItem('ogiri:lastRoom') ?? '');
  }, []);
  return (
    <main className={styles.app} lang="ja">
      <div className={styles.shell}>
        <nav className={styles.nav}>
          <Link href="/games">← Games</Link>
          <span>おもしろいは、みんなでつくる。</span>
          <Link href="/games/ogiri/history">過去のゲーム</Link>
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
            全員が同じWi-Fiにいる必要はありません。テレビは表示専用、主催者は通常は進行専用です。主催者も遊ぶ場合はスマホで参加してください。ゲーム中の新規参加は再戦までお待ちください。
          </p>
          <p>
            同点は同じ順位。自分の対戦は投票をお休み。未回答・非表示の回答は得点なし。回答は100文字までです。
            終了順位でパーティーポイント（10・7・5・3pt）を獲得し、同じルームの再戦でも通算します。
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
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
        // Allow 100 supplementary-plane emoji; the code-point counter gates submission.
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
  const [volume, setVolume] = useState(0.4);
  const [syncStop, setSyncStop] = useState<SyncStop>(null);
  const sync = useRef<ReturnType<typeof startRoomPolling> | null>(null);
  const historySignature = useRef('');
  const audio = useRef<ReturnType<typeof createPartyAudio> | null>(null),
    latest = useRef<RoomView | null>(null),
    lastBeat = useRef(0);
  const lastSoundView = useRef<RoomView | null>(null);
  const accept = useCallback((next: RoomView) => {
    if (latest.current && next.revision < latest.current.revision) return;
    const receivedAt = Date.now();
    latest.current = next;
    const signature = next.history?.map((h) => h.id).join(',') ?? '';
    if (signature !== historySignature.current) {
      rememberHistory(next.history ?? []);
      historySignature.current = signature;
    }
    setView(next);
    setClock(receivedAt);
    setOffset(next.serverTime - receivedAt);
    setConnected(true);
  }, []);
  useEffect(() => {
    const polling = startRoomPolling({
      document,
      window,
      online: () => navigator.onLine,
      view: () => latest.current,
      stopped: setSyncStop,
      error: (error) => {
        setConnected(false);
        setError((error as Error).message);
      },
      read: async (signal) => {
        const next = await request(`/${code}${tv ? '?view=tv' : ''}`, undefined, signal);
        if (!signal.aborted) {
          accept(next);
          setError('');
        }
        if (signal.aborted) return;
        if (!lastBeat.current) lastBeat.current = Date.now();
        if (!tv && next.me && Date.now() - lastBeat.current > 30000) {
          lastBeat.current = Date.now();
          try {
            await request(`/${code}`, { type: 'heartbeat' }, signal);
          } catch {
            // The room GET succeeded. Presence failure must not stop view updates.
            // Still await this request so hiding the page aborts all in-flight work.
          }
        }
      },
    });
    sync.current = polling;
    const interval = setInterval(() => setClock(Date.now()), 1000);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser preference after hydration
    setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    QRCode.toDataURL(`${window.location.origin}/games/ogiri/${code}`, {
      width: 240,
      margin: 2,
      color: { dark: '#251345', light: '#ffffff' },
    }).then(setQr);
    return () => {
      polling.stop();
      sync.current = null;
      clearInterval(interval);
    };
  }, [code, tv, accept]);
  useEffect(() => {
    if (!view) return;
    const previous = lastSoundView.current;
    lastSoundView.current = view;
    if (!sound || document.hidden) return;
    const cue = phaseSound(previous, view);
    if (cue) audio.current?.play(cue, volume);
  }, [view, sound, volume]);
  useEffect(() => {
    const silenceHidden = () => {
      if (document.hidden) audio.current?.stop();
    };
    document.addEventListener('visibilitychange', silenceHidden);
    return () => {
      document.removeEventListener('visibilitychange', silenceHidden);
      void audio.current?.close();
      audio.current = null;
    };
  }, []);
  async function send(action: Action) {
    if (tv || busy) return false;
    setBusy(true);
    setError('');
    try {
      const v = latest.current;
      const next = await request(`/${code}`, { ...action, turn: v?.turn });
      accept(next);
      if (sound && !document.hidden) {
        if (action.type === 'answer') audio.current?.play('submit', volume);
        if (action.type === 'vote') audio.current?.play('vote', volume);
      }
      sync.current?.resume();
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
  const manualResult = isManualResult(v);
  const gameWinners = v?.players.filter((p) => p.rank === 1 && p.playingThisGame !== false) ?? [];
  const tickKey = useRef('');
  useEffect(() => {
    if (
      !v ||
      !sound ||
      document.hidden ||
      v.paused ||
      manualResult ||
      !v.deadline ||
      remaining < 1 ||
      remaining > 5
    )
      return;
    if (!tv && !(v.isHost && !v.hostPlays)) return;
    const key = `${v.turn}:${remaining}`;
    if (tickKey.current === key) return;
    tickKey.current = key;
    audio.current?.play('tick', volume);
  }, [remaining, v, sound, volume, tv, manualResult]);
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
              onClick={async () => {
                if (sound) {
                  audio.current?.stop();
                  setSound(false);
                  return;
                }
                try {
                  audio.current ??= createPartyAudio(new AudioContext());
                  await audio.current.resume();
                  setSound(true);
                  audio.current.play('select', volume);
                } catch {
                  setError('音声を有効にできませんでした。もう一度音ボタンを押してください。');
                }
              }}
            >
              {sound ? '🔊' : '🔇'}
            </button>
            {sound && (
              <label className={styles.volumeControl}>
                音量
                <input
                  aria-label="効果音の音量"
                  type="range"
                  min="0"
                  max="100"
                  value={Math.round(volume * 100)}
                  onChange={(e) => {
                    const value = Number(e.target.value) / 100;
                    setVolume(value);
                    audio.current?.setVolume(value);
                  }}
                />
              </label>
            )}
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
        {!tv && v?.isHost && !v.hostPlays && (
          <p className={styles.historyRoomLink}>
            進行役の画面です。回答・投票は各自のスマホから参加してください。
          </p>
        )}
        {!tv && (
          <p className={styles.historyRoomLink}>
            <Link href="/games/ogiri/history" target="_blank" rel="noopener noreferrer">
              過去のゲーム ↗
            </Link>
            {v?.history?.at(-1) && (
              <Link
                prefetch={false}
                href={`/games/ogiri/history/${v.history.at(-1)!.id}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                直前の結果を見る ↗
              </Link>
            )}
          </p>
        )}
        {syncStop === 'idle' && (
          <p className={styles.pause} role="status">
            15分間変化がなかったため、自動更新を休止しました。続けて遊びますか？{' '}
            <button onClick={() => sync.current?.resume()}>再接続する</button>
          </p>
        )}
        {syncStop === 'expired' && (
          <p className={styles.pause} role="status">
            このルームへの自動更新を終了しました。<Link href="/games/ogiri">新しいルームへ</Link>
          </p>
        )}
        {!connected && !syncStop && (
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
            <div className={styles.stageCharacter}>
              <Character avatar="🐱" size="hero" />
            </div>
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
              {manualResult && !v.paused && (
                <p className={styles.manualWait} role="status">
                  結果を確認したら、主催者が「次へ進む」を押してください。
                </p>
              )}
              {v.deadline > 0 && !manualResult && !['finished', 'lobby'].includes(v.phase) && (
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
                <JoinForm
                  code={code}
                  onJoined={(next) => {
                    accept(next);
                    sync.current?.resume();
                  }}
                />
              </section>
            )}
            {v.phase === 'lobby' && (
              <div className={styles.lobby}>
                <section className={styles.lobbyPlayers}>
                  <div className={styles.row}>
                    <h2>ただいま {v.players.length} 人</h2>
                    <span>回答者3〜12人 / 4人以上推奨</span>
                  </div>
                  <div className={styles.playerGrid}>
                    {v.players.map((p) => (
                      <article key={p.id} className={styles.player}>
                        <Character avatar={p.avatar} size="large" />
                        <b>{p.name}</b>
                        <small>
                          {!p.active ? 'お休み中' : p.connected ? '参加中 ✓' : '接続を待っています'}
                        </small>
                        {Boolean(v.partyGames) && <small>{p.partyPoints ?? 0} パーティーpt</small>}
                      </article>
                    ))}
                  </div>
                  <p>
                    1つのお題に2人が回答し、それ以外の人が投票します。進行専用の主催者とテレビは人数に含みません。
                  </p>
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
              (tv || (v.isHost && !v.hostPlays) ? (
                <section className={styles.wait}>
                  <div className={styles.stageCharacter}>
                    <Character avatar={v.settings.halloween ? '🎃' : '🐱'} size="hero" />
                  </div>
                  <h2>あなたのスマホに、2つのお題。</h2>
                  <p>書き終えたら「この回答を送る」を押してね。</p>
                  <p>お題は全員共通ではありません。同じお題を2人ずつに配っています。</p>
                  <div className={styles.playerGrid}>
                    {v.players.map((p) => (
                      <article key={p.id} className={styles.player}>
                        <Character avatar={p.avatar} size="large" />
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
                            <p>
                              <Character
                                avatar={
                                  v.players.find((p) => p.name === result.authors[i])?.avatar ?? ''
                                }
                              />{' '}
                              {result.authors[i]}
                            </p>
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
                    ? `${v.match.votesReceived} / ${v.match.eligible} 人が投票済み${!tv && mine && !v.match.canVote ? ' · 自分の対戦は投票をお休み' : ''}`
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
                      <p className={styles.eyebrow}>このゲームの優勝</p>
                      <div className={styles.championCharacters}>
                        {gameWinners
                          .slice(0, 4)
                          .map((p) => (
                            <Character key={p.id} avatar={p.avatar} size="hero" crowned />
                          ))}
                      </div>
                      <h2>
                        {gameWinners.length > 1
                          ? `${gameWinners.length}人の大喜利王！`
                          : gameWinners.map((p) => p.name).join(' ＆ ')}
                      </h2>
                      <p>そのひらめきに、盛大な拍手を。</p>
                    </div>
                  </>
                )}
                <PartyResults key={`${v.game}:${v.phase}`} view={v} />
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
                <Character avatar={mine.avatar} /> {mine.name}
                <span>
                  {mine.rank}位 · <b>{mine.score} pt</b>
                </span>
              </div>
            )}
            {!tv && v.isHost && (
              <details className={styles.host} open={v.phase === 'lobby'}>
                <summary>👑 主催者の操作</summary>
                <div className={styles.hostBody}>
                  {v.phase === 'lobby' && (
                    <label>
                      <input
                        type="checkbox"
                        checked={Boolean(v.hostPlays)}
                        disabled={busy}
                        onChange={(e) =>
                          void send({ type: 'hostParticipation', participating: e.target.checked })
                        }
                      />{' '}
                      この端末でも回答に参加する
                    </label>
                  )}
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
                            <Character avatar={p.avatar} /> {p.name}
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
