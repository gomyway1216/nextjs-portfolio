'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import QRCode from 'qrcode';
import { AVATARS, CATEGORIES, GAME_TITLES, type Action, type GameType, type RoomView, type Settings } from '@/lib/ogiri/types';
import { isManualResult, startRoomPolling, type SyncStop } from '@/lib/ogiri/polling';
import { normalizePlayerText } from '@/lib/ogiri/text';
import { hintAt, shouldNudgeHint } from '@/lib/ogiri/hints';
import { RoundPlan } from './RoundPlan';
import { roundMultiplier, SHUTOUT_BONUS } from '@/lib/ogiri/plan';
import { GAME_RULES, PartyGamePanel, PartyGamePicker } from './PartyGamePanel';
import { rememberHistory } from '@/lib/ogiri/history-local';
import { CHARACTERS, characterFor } from '@/lib/ogiri/characters';
import { createPartyAudio, DEFAULT_PARTY_VOLUME, phaseSound, type SoundCue } from '@/lib/ogiri/sound';
import { DEFAULT_PARTY_MUSIC_ENABLED, shouldPlayPartyMusic } from '@/lib/ogiri/music';
import { Character } from './Character';
import { MysteryCharacter } from './MysteryCharacter';
import { PartyResults } from './PartyResults';
import { AnimatedScore } from './AnimatedScore';
import { DrawingGamePanel } from './DrawingGamePanel';
import { ParticipantAccess } from './ParticipantAccess';
import { NextGameChoices } from './NextGameChoices';
import { rememberRecovery } from '@/lib/ogiri/recovery-local';
import styles from './Ogiri.module.css';

const phaseName = {
  lobby: 'メンバー、募集中。',
  answering: 'ネタ、仕込み中。',
  voting: 'どっちで笑った？',
  reveal: 'これ書いたの、だれ？',
  ranking: 'いま、こうなってます。',
  finished: '結果、出ました。',
};
const partyPhaseName = {
  majority: { ...phaseName, voting: '多数派に、まざれ。', reveal: 'そっちが多かったか。' },
  identity: { ...phaseName, answering: 'ひとこと、仕込み中。', voting: 'これ、だれが書いた？', reveal: '正体、こちら。' },
  drawing: { ...phaseName, answering: '絵とことばで、伝言中。', voting: '好きな絵に、一票。', reveal: 'その絵、そう来たか。' },
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
  initialGameType = 'ogiri',
}: {
  code?: string;
  create?: boolean;
  onJoined?: (view: RoomView) => void;
  initialGameType?: GameType;
}) {
  const router = useRouter();
  const [hostPlays, setHostPlays] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [recoveryMethod, setRecoveryMethod] = useState<'code' | 'passphrase'>('code');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [gameType, setGameType] = useState<GameType>(initialGameType);
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
        type: recovering ? recoveryMethod === 'passphrase' ? 'recoverPassphrase' : 'recover' : 'join',
        ...(recovering ? recoveryMethod === 'passphrase' ? { passphrase } : { recoveryCode } : {}),
        name,
        avatar,
        ...(create ? { hostPlays, gameType } : {}),
      });
      rememberRecovery(view);
      try { localStorage.setItem('ogiri:lastRoom', view.code); } catch { /* Optional recent room. */ }
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
      {create && <PartyGamePicker value={gameType} onChange={setGameType} />}
      {!create && <div className={styles.tabs}>
        <button type="button" aria-pressed={!recovering} onClick={() => setRecovering(false)}>新しく参加する</button>
        <button type="button" aria-pressed={recovering} onClick={() => setRecovering(true)}>同じ参加者で戻る</button>
      </div>}
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
      {recovering && <div className={styles.recoveryMethods} role="radiogroup" aria-label="復帰方法">
        <label><input type="radio" name="recoveryMethod" checked={recoveryMethod === 'code'}
          onChange={() => setRecoveryMethod('code')} />復帰コード</label>
        <label><input type="radio" name="recoveryMethod" checked={recoveryMethod === 'passphrase'}
          onChange={() => setRecoveryMethod('passphrase')} />合言葉</label>
      </div>}
      {recovering ? recoveryMethod === 'passphrase' ? <>
        <label>ニックネーム
          <input aria-label="ニックネーム" autoComplete="username" required maxLength={32}
            value={name} onChange={event => setName(event.target.value)} />
        </label>
        <label>合言葉
          <input aria-label="合言葉" type="password" autoComplete="current-password" required maxLength={128}
            value={passphrase} onChange={event => setPassphrase(event.target.value)} />
          <small>元の端末で設定した合言葉。名前・キャラ・得点・通算を引き継ぎます。</small>
        </label>
      </> : <label>
        復帰コード
        <input aria-label="復帰コード" autoComplete="off" autoCapitalize="characters" spellCheck={false}
          placeholder="ABCD-EF23" maxLength={9} required value={recoveryCode}
          onChange={e => setRecoveryCode(e.target.value.toUpperCase().replace(/[^A-Z2-9-]/g, ''))} />
        <small>参加時に控えた8文字。名前・キャラ・得点・通算を引き継ぎます。</small>
      </label> : <><label>
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
      </>}
      {create && (
        <label>
          <span>
            <input
              type="checkbox"
              checked={hostPlays}
              onChange={(e) => setHostPlays(e.target.checked)}
            />{' '}
            {gameType === 'ogiri' ? '主催者もこの端末で回答する' : '主催者もこの端末で遊ぶ'}
          </span>
          <small>
            通常は進行役専用です。テレビ・PCで主催する場合はオフにし、各自のスマホから参加してください。
          </small>
        </label>
      )}
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      <button className={styles.primary} disabled={busy || (!recovering && [...name.normalize('NFKC')].length > 16)}>
        {busy ? '接続中…' : create ? 'ルームを作成 →' : recovering ? '同じ参加者で復帰 →' : 'ルームに参加 →'}
      </button>
      <small>登録不要・無料。同じブラウザはCookie、別端末は設定した合言葉か復帰コードで同じ部屋に戻れます。部屋は最後のゲーム操作から8時間有効です。</small>
    </form>
  );
}
export function OgiriLanding() {
  const [create, setCreate] = useState(false),
    [lastRoom, setLastRoom] = useState(''),
    [selectedGameType, setSelectedGameType] = useState<GameType>('ogiri');
  // Restoring browser-only storage after hydration is intentional.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLastRoom(localStorage.getItem('ogiri:lastRoom') ?? '');
    const game = new URLSearchParams(window.location.search).get('game');
    if (game && Object.hasOwn(GAME_TITLES, game)) {
      setSelectedGameType(game as GameType);
      setCreate(true);
    }
  }, []);
  return (
    <main className={styles.app} lang="ja">
      <div className={styles.shell}>
        <nav className={styles.nav}>
          <Link href="/games">← Games</Link>
          <span>その答え、ずるい。</span>
          <Link href="/games/ogiri/history">過去のゲーム</Link>
        </nav>
        <div className={styles.hero}>
          <section>
            <p className={styles.eyebrow}>スマホが回答席。テレビが舞台。</p>
            <h1 className={`${styles.title} ${styles.partyTitle}`}>
              <span>みんなの</span>パーティー
              <span className={styles.lime}>
                <span aria-hidden="true">✳</span>
              </span>
            </h1>
            <p className={styles.intro}>
              書く。描く。選ぶ。
              <br />
              「お前か！」ってなる。
            </p>
            <p>
              大喜利・多数決・作者当て・絵の伝言。
              <br />
              次のゲームも、同じ部屋で。
            </p>
            <div className={styles.facts}>
              <span>📱 インストール不要</span>
              <span>⏱ 時間はゆっくり、調整OK</span>
              <span>🎃 ハロウィンにも</span>
            </div>
            <div className={styles.modeTeasers} aria-label="遊べる4つのゲーム">
              {(['ogiri', 'majority', 'identity', 'drawing'] as const).map(type => <button key={type} type="button" onClick={() => {
                setSelectedGameType(type);
                setCreate(true);
                requestAnimationFrame(() => document.getElementById('party-entry')?.scrollIntoView({
                  behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start',
                }));
              }}>
                {type === 'identity' ? <MysteryCharacter size="medium" /> : <Character avatar={type === 'ogiri' ? '🐱' : type === 'drawing' ? 'alien' : '🐸'} size="medium" />}
                <b>{GAME_TITLES[type]}</b>
                <span>{type === 'ogiri' ? '二人のボケに一票。' : type === 'majority' ? 'みんな、そっち派？' : type === 'drawing' ? 'その絵、そう伝わる？' : 'これ書いたの、お前か。'}</span>
                <small>このゲームで部屋を作る →</small>
              </button>)}
            </div>
          </section>
          <section id="party-entry" className={styles.joinCard} aria-label="ゲームをはじめる">
            <div className={styles.tabs}>
              <button aria-pressed={!create} onClick={() => setCreate(false)}>
                ルームに参加
              </button>
              <button aria-pressed={create} onClick={() => setCreate(true)}>
                主催する
              </button>
            </div>
            <h2>{create ? 'まずは部屋をひとつ。' : '名前をどうぞ。出番はあとで。'}</h2>
            <JoinForm key={`${create}:${selectedGameType}`} create={create} initialGameType={selectedGameType} />
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
            ['02', 'こっそり仕込む', '書く・描く・選ぶ。自分の番が来たら、スマホから参加。'],
            ['03', '一票で決める', '笑った回答、お気に入りの絵、多数派。遊ぶゲームで得点ルールが変わります。'],
          ].map(([n, title, text]) => (
            <article key={n}>
              <b>{n}</b>
              <h2>{title}</h2>
              <p>{text}</p>
            </article>
          ))}
        </section>
        <section className={styles.guide}>
          <h2>テレビ、空いてる？</h2>
          <p>
            PCをHDMIでテレビへつなぐか、Chromeのメニューから「キャスト」を選択。テレビのブラウザで表示用URLを開く方法も使えます。主催者のスマホから「テレビ画面を開く」でURLを確認できます。
          </p>
          <p>
            全員が同じWi-Fiにいる必要はありません。テレビは表示専用、主催者は通常は進行専用です。主催者も遊ぶ場合はスマホで参加してください。ゲーム中の新規参加は再戦までお待ちください。
          </p>
          <p>
            同点は同じ順位。大喜利は自分の対戦、絵の伝言は自分の絵への投票をお休み。大喜利・作者当ては100文字、絵の伝言の言葉は80文字までです。
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
  remaining,
  answerSeconds,
}: {
  assignment: RoomView['assignments'][number];
  code: string;
  disabled: boolean;
  send: (a: Action) => Promise<boolean>;
  remaining: number;
  answerSeconds: number;
}) {
  const key = `ogiri:draft:${code}:${assignment.id}`;
  const [text, setText] = useState(assignment.answer),
    [busy, setBusy] = useState(false),
    // Seeded on the first tap so each player and prompt gets its own order without a hydration mismatch.
    [hintState, setHintState] = useState<{ seed: number; tap: number } | null>(null);
  const hint = hintState && hintAt(assignment.text, hintState.seed, hintState.tap);
  const saved = assignment.answer;
  const characterCount = [...normalizePlayerText(text)].length;
  // This also restores the unsent Japanese draft after a full reload.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setText(localStorage.getItem(key) ?? assignment.answer);
  }, [key, assignment.answer]);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    if (await send({ type: 'answer', matchId: assignment.id, text })) {
      const stored = normalizePlayerText(text);
      setText(stored);
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
        disabled={disabled || busy}
      />
      <div className={styles.hintRow}>
        <button
          type="button"
          className={`${styles.hintButton} ${!hint && !disabled && shouldNudgeHint(remaining, answerSeconds, text) ? styles.hintNudge : ''}`}
          onClick={() => setHintState((h) => h ? { ...h, tap: h.tap + 1 } : { seed: Math.floor(Math.random() * 0xffffffff), tap: 0 })}
        >
          💡 {hint ? '別の型' : '答えの型ヒント'}
        </button>
        {hint && <p aria-live="polite" data-testid="answer-hint">型：「{hint.ja}」</p>}
      </div>
      <div className={styles.row}>
        <small>{characterCount} / 100文字</small>
        <button
          className={styles.primary}
          disabled={disabled || busy || characterCount === 0 || characterCount > 100}
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
        {saved ? '送信済み。「これでOK！」で確定するまで修正できます。' : '下書きはこの端末に自動保存されます。'}
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
      <PartyGamePicker value={s.gameType ?? 'ogiri'} onChange={gameType => {
        set({ ...s, gameType, rounds: gameType === 'drawing' ? 1 : s.rounds });
        setSaved(false);
      }} />
      <div className={styles.settingGrid}>
        {(
          [
            ['rounds', 'ラウンド数', [1, 2, 3, 4, 5]],
            ['answerSeconds', '回答時間（秒）', [30, 60, 90, 120, 180, 300, 600]],
            ['voteSeconds', '投票時間（秒）', [10, 15, 20, 30, 45, 60, 90, 120]],
          ] as const
        ).filter(([key]) => (key !== 'answerSeconds' || s.gameType !== 'majority') && (key !== 'rounds' || s.gameType !== 'drawing')).map(([key, label, values]) => (
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
      {s.gameType !== 'majority' && <small>回答時間は目安です。時間が来ても全員の「これでOK！」を待ちます。</small>}
      <label className={styles.check}>
        <input
          type="checkbox"
          checked={s.autoAdvance}
          onChange={(e) => set({ ...s, autoAdvance: e.target.checked })}
        />
        {s.gameType === 'majority' ? '全員投票後・結果発表後に自動で進行' : '全員の回答確定後・全員投票後・結果発表後に自動で進行'}
      </label>
      {(!s.gameType || s.gameType === 'ogiri') && <><label className={styles.check}>
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
      </>}
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
    [audioBlocked, setAudioBlocked] = useState(false),
    [audioBusy, setAudioBusy] = useState(false),
    [previewCue, setPreviewCue] = useState<SoundCue>('count'),
    [reduced, setReduced] = useState(false),
    [busy, setBusy] = useState(false);
  const [volume, setVolume] = useState(DEFAULT_PARTY_VOLUME);
  const [musicEnabled, setMusicEnabled] = useState(DEFAULT_PARTY_MUSIC_ENABLED);
  const [musicFailed, setMusicFailed] = useState(false);
  const [soundOpen, setSoundOpen] = useState(false);
  const soundMenu = useRef<HTMLDivElement | null>(null);
  const soundTrigger = useRef<HTMLButtonElement | null>(null);
  const soundDialog = useRef<HTMLElement | null>(null);
  const [syncStop, setSyncStop] = useState<SyncStop>(null);
  const sync = useRef<ReturnType<typeof startRoomPolling> | null>(null);
  const historySignature = useRef('');
  const audio = useRef<ReturnType<typeof createPartyAudio> | null>(null),
    latest = useRef<RoomView | null>(null),
    lastBeat = useRef(0);
  const lastSoundView = useRef<RoomView | null>(null);
  const accept = useCallback((next: RoomView) => {
    if (latest.current && next.revision < latest.current.revision) return;
    rememberRecovery(next);
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
      stopped: reason => {
        setSyncStop(reason);
        if (reason) setConnected(false); // Resume audio only after a fresh successful room read.
      },
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
  useLayoutEffect(() => {
    if (!view) return;
    const previous = lastSoundView.current;
    lastSoundView.current = view;
    if (!sound || document.hidden) return;
    if ((view.paused && !previous?.paused) || (previous && previous.turn !== view.turn)) audio.current?.stop();
    const cue = phaseSound(previous, view);
    if (cue) audio.current?.play(cue, volume);
  }, [view, sound, volume]);
  useLayoutEffect(() => {
    const music = audio.current?.music;
    if (!music) return;
    let active = true;
    const update = () => {
      if (shouldPlayPartyMusic(view, {
        music: musicEnabled, sound, blocked: audioBlocked, hidden: document.hidden, volume,
        connected, stopped: !!syncStop,
      })) void music.start().then(() => { if (active) setMusicFailed(music.failed()); });
      else music.stop();
    };
    update();
    document.addEventListener('visibilitychange', update);
    return () => { active = false; document.removeEventListener('visibilitychange', update); };
  }, [view, sound, musicEnabled, audioBlocked, volume, connected, syncStop]);
  useEffect(() => {
    try {
      const saved = localStorage.getItem('ogiri:volume');
      if (saved !== null && Number.isFinite(Number(saved))) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- restore this device's volume after hydration
        setVolume(Math.min(1, Math.max(0, Number(saved))));
      }
      if (localStorage.getItem('ogiri:music') === 'off') {
        setMusicEnabled(false);
      }
    } catch { /* Audio still works when browser storage is unavailable. */ }
  }, []);
  useEffect(() => {
    if (!soundOpen) return;
    soundDialog.current?.focus();
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Element && event.target.closest('[data-audio-volume]')) return;
      if (event.target instanceof Node && !soundMenu.current?.contains(event.target)) setSoundOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setSoundOpen(false);
      soundTrigger.current?.focus();
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [soundOpen]);
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
  async function enableAudio(cue: SoundCue = 'select') {
    if (audioBusy) return;
    setAudioBusy(true);
    try {
      if (!audio.current || audio.current.state() === 'closed') {
        const context = new AudioContext();
        context.onstatechange = () => setAudioBlocked(context.state !== 'running');
        audio.current = createPartyAudio(context);
      }
      await audio.current.resume();
      await audio.current.prepare();
      setAudioBlocked(false);
      setSound(true);
      audio.current.stop();
      audio.current.play(cue, volume);
    } catch {
      setAudioBlocked(true);
      setSound(false);
    } finally {
      setAudioBusy(false);
    }
  }
  async function send(action: Action) {
    if (tv || busy) return false;
    setBusy(true);
    setError('');
    try {
      const v = latest.current;
      const next = await request(`/${code}${action.type === 'drawingSubmit' ? '/drawing' : ''}`, { ...action, turn: v?.turn });
      accept(next);
      if (sound && !document.hidden) {
        if (['answer', 'partyAnswer', 'drawingSubmit', 'drawingGuess'].includes(action.type)) audio.current?.play('submit', volume);
        if (['vote', 'partyVote', 'drawingVote'].includes(action.type)) audio.current?.play('vote', volume);
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
  async function regenerateRecovery() {
    if (tv || busy) return;
    setBusy(true);
    setError('');
    try { accept(await request(`/${code}`, { type: 'recoveryCode' })); }
    catch (error) { setError((error as Error).message); }
    finally { setBusy(false); }
  }
  async function savePassphrase(passphrase: string) {
    if (tv || busy) return false;
    setBusy(true);
    setError('');
    try {
      accept(await request(`/${code}`, { type: 'setPassphrase', passphrase }));
      return true;
    } catch (error) {
      setError((error as Error).message);
      return false;
    } finally { setBusy(false); }
  }
  const v = view,
    mine = v?.players.find((p) => p.id === v.me);
  const gameType = v?.gameType ?? v?.settings.gameType ?? 'ogiri';
  const remaining = v
    ? Math.max(0, Math.ceil((v.deadline - (v.paused ? v.serverTime : clock + offset)) / 1000))
    : 0;
  const manualResult = isManualResult(v);
  const multiplier = v ? v.match?.multiplier ?? roundMultiplier(v.round, v.settings.rounds) : 1;
  const waitingForAnswers = v?.phase === 'answering' && remaining === 0;
  const answerers = v?.players.filter((p) => p.answeringThisRound && p.active) ?? [];
  const readyCount = answerers.filter((p) => p.answerReady).length;
  const everyoneReady = answerers.length > 0 && readyCount === answerers.length;
  const hasUnsentChanges = typeof window !== 'undefined' && v?.phase === 'answering' && v.assignments.some((a) => {
    const draft = localStorage.getItem(`ogiri:draft:${code}:${a.id}`);
    return draft !== null && draft !== a.answer;
  });
  async function confirmAnswers() {
    if (v?.assignments.some((a) => {
      const draft = localStorage.getItem(`ogiri:draft:${code}:${a.id}`);
      return draft !== null && draft !== a.answer;
    })) {
      setError('未送信の変更があります。「回答を更新」で送信してから確定してください。');
      return;
    }
    await send({ type: 'answerReady', ready: true });
  }
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
          <Link href="/games/ogiri">✳ {GAME_TITLES[gameType]}</Link>
          <span className={styles.code}>
            ROOM <b>{code}</b>
          </span>
          <div className={styles.tools}>
            <button
              className={styles.soundToggle}
              aria-label={audioBlocked ? '音声を再開' : sound ? 'ミュート' : '効果音をオン'}
              aria-pressed={sound && !audioBlocked}
              disabled={audioBusy}
              onClick={() => {
                if (sound && !audioBlocked) {
                  audio.current?.stop();
                  audio.current?.music.stop();
                  setSound(false);
                  return;
                }
                void enableAudio();
              }}
            >
              {audioBlocked ? '音を再開' : sound ? '音ON' : '音OFF'}
            </button>
            {sound && (
              <label className={styles.volumeControl} data-audio-volume>
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
                    try { localStorage.setItem('ogiri:volume', String(value)); } catch { /* Optional preference. */ }
                  }}
                />
              </label>
            )}
            <div className={styles.soundMenu} ref={soundMenu}>
              <button type="button" ref={soundTrigger} aria-expanded={soundOpen} onClick={() => setSoundOpen(!soundOpen)}>音設定</button>
              {soundOpen && <section role="dialog" tabIndex={-1} aria-label="効果音の設定" ref={soundDialog}>
                <button type="button" className={styles.soundClose} aria-label="音設定を閉じる" onClick={() => {
                  setSoundOpen(false);
                  soundTrigger.current?.focus();
                }}>閉じる ×</button>
                <b>{audioBlocked ? '音が一時停止しています' : sound ? 'この画面から音が出ます' : 'いまは音OFFです'}</b>
                <p>このPC・スマホ本体から再生します。音量はこの端末に保存されます。</p>
                <label>
                  <input type="checkbox" checked={musicEnabled} onChange={event => {
                    const enabled = event.target.checked;
                    setMusicEnabled(enabled);
                    if (!enabled) audio.current?.music.stop();
                    else { audio.current?.music.retry(); setMusicFailed(false); }
                    try { localStorage.setItem('ogiri:music', enabled ? 'on' : 'off'); } catch { /* Optional preference. */ }
                  }} />
                  回答・投票中にBGM
                </label>
                {musicEnabled && musicFailed && <p role="status">
                  BGMを読み込めませんでした。効果音はそのまま使えます。
                  <button type="button" onClick={() => {
                    const music = audio.current?.music;
                    if (!music) return;
                    music.retry();
                    setMusicFailed(false);
                    if (shouldPlayPartyMusic(view, { music: musicEnabled, sound, blocked: audioBlocked,
                      hidden: document.hidden, volume, connected, stopped: !!syncStop }))
                      void music.start().then(() => { if (audio.current?.music === music) setMusicFailed(music.failed()); });
                  }}>BGMを再読み込み</button>
                </p>}
                {audioBlocked && <p>「音声を再開」を押してください。端末の音量や消音設定も確認できます。</p>}
                {volume === 0 && <p>音量が0です。スライダーで音量を上げてね。</p>}
                <label>
                  試聴する効果音
                  <select aria-label="試聴する効果音" value={previewCue} onChange={e => setPreviewCue(e.target.value as SoundCue)}>
                    {([
                      ['select', '選択'], ['join', '参加'], ['start', '開始'], ['submit', '回答送信'],
                      ['vote', '投票'], ['ranking', '順位発表'], ['tick', '秒読み'],
                      ['bounce', 'ポップ（回答登場）'], ['count', 'イェーイ！（得点）'], ['cheer', '歓声（優勝）'],
                    ] as const).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
                <button type="button" disabled={audioBusy} onClick={() => void enableAudio(previewCue)}>音を試す</button>
              </section>}
            </div>
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
                  {gameType === 'ogiri' ? v.settings.halloween ? '🎃 HALLOWEEN PARTY' : 'ことばであそぼう。' : GAME_TITLES[gameType]}{' '}
                  {v.round > 0 && `ROUND ${v.round} / ${v.settings.rounds}`}
                </p>
                <h1>{(gameType === 'ogiri' ? phaseName : partyPhaseName[gameType])[v.phase]}</h1>
              </div>
              {manualResult && !v.paused && (
                <p className={styles.manualWait} role="status">
                  結果を確認したら、主催者が「次へ進む」を押してください。
                </p>
              )}
              {v.deadline > 0 && !manualResult && !['finished', 'lobby'].includes(v.phase) && (
                <div
                  className={`${styles.timer} ${remaining <= 10 && !waitingForAnswers ? styles.urgent : ''}`}
                  role="timer"
                  aria-label={v.phase === 'answering' ? '回答時間の目安' : '残り時間'}
                >
                  {v.paused ? '休憩' : waitingForAnswers ? '待機' : remaining}
                  <small>{v.paused ? '再開まで待ってね' : waitingForAnswers ? 'まだ回答できるよ' : v.phase === 'answering' ? '秒・目安' : '秒'}</small>
                </div>
              )}
            </header>
            {gameType === 'ogiri' && ['answering', 'voting', 'reveal'].includes(v.phase) && multiplier > 1 && (
              <p className={styles.finalRound} role="status" data-testid="final-round">
                <b>FINAL ROUND</b> 最終ラウンドは得点{multiplier}倍！ 票・勝利・全票ボーナスすべてが倍になります。
              </p>
            )}
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
                    <span>{gameType === 'ogiri' ? '回答者3〜12人 / 4人以上推奨' : '参加者3〜12人'}</span>
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
                    {gameType === 'ogiri' ? '1つのお題に2人が回答し、それ以外の人が投票します。' : GAME_RULES[gameType]}進行専用の主催者とテレビは人数に含みません。
                  </p>
                  {gameType === 'ogiri' ? <RoundPlan players={v.players.filter((p) => p.active).length} rounds={v.settings.rounds} /> : (
                    <section className={styles.roundPlan} aria-label="このゲームの遊び方と配点">
                      <h3>{GAME_TITLES[gameType]}</h3>
                      <p>{gameType === 'drawing' ? '1ゲーム1回の伝言。3人なら3手、4〜12人なら4手。全員の伝言がそろってから進みます。' : gameType === 'majority' ? `全${v.settings.rounds}お題。全員が1お題につき1票ずつ投票します。` : `全${v.settings.rounds}ラウンド。1人1回答、作者以外のみんなで順番に当てます。`}</p>
                      <p>同じルームでゲームを替えても、終了順位のパーティーポイントを通算します。</p>
                      <p>1位10pt・2位7pt・3位5pt・ほか3pt。同順位は同じpt。</p>
                    </section>
                  )}
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
                  {(tv || v.isHost) && (
                    <div className={styles.soundCheck}>
                      <p>{sound && !audioBlocked ? 'この画面の音はONです' : tv ? 'テレビの音、鳴らしてみる？' : 'この端末の音、試してみる？'}</p>
                      {!tv && <small>テレビではTV画面側の音をオンにしてね。</small>}
                      <button type="button" disabled={audioBusy} onClick={() => void enableAudio('start')}>
                        {sound && !audioBlocked ? '音をもう一度試す' : '音を出して試す'}
                      </button>
                    </div>
                  )}
                </aside>
              </div>
            )}
            {gameType === 'ogiri' && v.phase === 'answering' &&
              (tv || (v.isHost && !v.hostPlays) ? (
                <section className={styles.wait}>
                  <div className={styles.stageCharacter}>
                    <Character avatar={v.settings.halloween ? '🎃' : '🐱'} size="hero" />
                  </div>
                  <h2>スマホのほう、見てね。</h2>
                  <p>2問とも送信したら「これでOK！」で確定してね。</p>
                  <p>お題は全員共通ではありません。同じお題を2人ずつに配っています。</p>
                  <div className={styles.playerGrid}>
                    {v.players.filter((p) => p.answeringThisRound).map((p) => (
                      <article key={p.id} className={`${styles.player} ${p.answerReady ? styles.playerReady : ''}`}>
                        <Character avatar={p.avatar} size="large" />
                        <b>{p.name}</b>
                        <small>
                          {!p.active ? 'お休み中' : p.answerReady ? 'OK！ ✓' : `${p.answered}/2 回答済み`}
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
                      disabled={v.paused || !connected || Boolean(mine?.answerReady)}
                      send={send}
                      remaining={remaining}
                      answerSeconds={v.settings.answerSeconds}
                    />
                  ))}
                </div>
              ))}
            {gameType === 'ogiri' && v.phase === 'answering' && (
              <section className={styles.readyBar} aria-label="回答の確定状況">
                <p role="status"><b>{readyCount} / {answerers.length}人がOK！</b> {everyoneReady ? '全員そろいました。' : '全員の回答確定を待っています。'}</p>
                <small>{v.settings.autoAdvance
                  ? '全員が「これでOK！」を押すと投票へ。目安時間を過ぎても回答できます。'
                  : '全員OK後は主催者が投票へ進めます。目安時間を過ぎても回答できます。'}</small>
                {hasUnsentChanges && v.assignments.every((a) => a.answer) && <small>未送信の変更があります。先に「回答を更新」を押してね。</small>}
                {!tv && mine?.answeringThisRound && mine.active && (
                  mine.answerReady ? <button className={styles.secondary} disabled={busy || v.paused || !connected}
                    onClick={() => void send({ type: 'answerReady', ready: false })}>回答を直す</button>
                    : <button className={styles.primary} disabled={busy || v.paused || !connected || hasUnsentChanges || v.assignments.length !== 2 || v.assignments.some((a) => !a.answer)}
                      onClick={() => void confirmAnswers()}>これでOK！</button>
                )}
                {!tv && v.isHost && everyoneReady && !v.settings.autoAdvance && (
                  <button className={styles.primary} disabled={busy || v.paused || !connected}
                    onClick={() => void send({ type: 'next' })}>投票へ進む →</button>
                )}
              </section>
            )}
            {gameType === 'drawing' ? <DrawingGamePanel view={v} tv={tv} busy={busy} connected={connected} reduced={reduced} send={send} />
              : gameType !== 'ogiri' && <PartyGamePanel view={v} tv={tv} busy={busy} connected={connected} reduced={reduced} remaining={remaining} send={send} />}
            {gameType === 'ogiri' && v.match && (
              <section className={styles.battle} key={v.match.id}>
                <p className={styles.eyebrow}>
                  お題 {v.match.index} / {v.match.total}
                </p>
                <h2 className={styles.prompt}>{v.match.text}</h2>
                {v.phase === 'voting' && (
                  <p className={styles.voteRole} role="status">{v.match.isAuthor
                    ? 'あなたの回答があるお題です。今回は投票をお休みして、みんなの票を待とう。'
                    : `作者2人は投票しません。作者以外の${v.match.eligible}人で選びます。`}</p>
                )}
                <div className={styles.answers}>
                  {v.match.answers.map((answer, i) => {
                    const m = v.match!,
                      result = m.result,
                      count = result?.counts[i] ?? 0,
                      total = result?.counts.reduce((a, b) => a + b, 0) ?? 0;
                    return (
                      <article
                        className={`${styles.answerCard} ${result ? styles.answerRevealed : ''} ${answer && [...answer].length > 60 ? styles.longAnswer : ''} ${result && count > result.counts[1 - i] ? styles.winner : ''}`}
                        key={i}
                      >
                        <span className={styles.letter}>{i ? 'B' : 'A'}</span>
                        {result?.shutout === i && <span className={styles.shutoutStamp} data-testid="shutout-stamp" aria-hidden="true">全票！</span>}
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
                            <strong>+<AnimatedScore value={result.points[i]} animate={!reduced} /> 点{m.multiplier > 1 && result.points[i] > 0 && <small> ×{m.multiplier}</small>}</strong>
                            {result.shutout === i && (
                              <small className={styles.shutoutNote}>全票獲得！ 全票ボーナス +{SHUTOUT_BONUS * m.multiplier}点</small>
                            )}
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
                        <div className={`${styles.answerSpeaker} ${result ? styles.speakerRevealed : ''}`}
                          key={result ? result.authors[i] : 'mystery'} data-testid="answer-speaker">
                          {result ? <Character avatar={v.players.find(p => p.name === result.authors[i])?.avatar ?? ''} size="large" />
                            : <MysteryCharacter />}
                          <b>{result ? result.authors[i] : '？？？'}</b>
                        </div>
                      </article>
                    );
                  })}
                </div>
                <p className={styles.voteStatus} aria-live="polite">
                  {v.phase === 'voting'
                    ? `${v.match.votesReceived} / ${v.match.eligible} 人が投票済み${!tv && mine && !v.match.canVote ? ' · 自分の対戦は投票をお休み' : ''}`
                    : 'はい、次の無茶ぶりへ。'}
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
                      <p className={styles.eyebrow}>今回の1位</p>
                      <div className={styles.championCharacters}>
                        {gameWinners
                          .slice(0, 4)
                          .map((p) => (
                            <Character key={p.id} avatar={p.avatar} size="hero" crowned />
                          ))}
                      </div>
                      <h2>
                        {gameWinners.length > 1
                          ? `同率1位 × ${gameWinners.length}`
                          : gameWinners[0]?.name ?? '今回はここまで。'}
                      </h2>
                      <p>{gameWinners.length > 1 ? 'トロフィーは交代でどうぞ。' : gameWinners.length ? '異議は、次のゲームでどうぞ。' : 'ネタはまた今度。'}</p>
                    </div>
                  </>
                )}
                <PartyResults key={`${v.game}:${v.phase}`} view={v} reduced={reduced} />
                {!tv && v.isHost && v.phase === 'finished' && (
                  <NextGameChoices currentGame={gameType} disabled={busy || !connected}
                    choose={gameType => void send({ type: 'rematch', gameType })} />
                )}
              </section>
            )}
            {!tv && v.me && <ParticipantAccess view={v} busy={busy} connected={connected} send={send} regenerate={regenerateRecovery} savePassphrase={savePassphrase} />}
            {!tv && mine && (
              <div className={styles.myScore}>
                <Character avatar={mine.avatar} /> {mine.name}
                <span>
                  {mine.rank}位 · <b>{mine.score} 点</b>
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
                      {gameType === 'ogiri' ? 'この端末でも回答に参加する' : 'この端末でもゲームに参加する'}
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
                          {!manualResult && (
                            <button
                              className={styles.secondary}
                              disabled={busy || !connected}
                              onClick={() => void send({ type: 'extend' })}
                            >
                              {v.phase === 'answering' ? '回答時間を＋60秒' : v.phase === 'voting' ? '投票時間を＋30秒' : '表示時間を＋30秒'}
                            </button>
                          )}
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
                                !window.confirm(v.phase === 'answering' ? gameType === 'drawing' ? 'まだ伝言中の人がいても、この手の伝言を締め切って次へ進みますか？' : 'まだ回答中の人がいても、回答を締め切って投票へ進みますか？' : '投票を締め切って結果を表示しますか？')
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
