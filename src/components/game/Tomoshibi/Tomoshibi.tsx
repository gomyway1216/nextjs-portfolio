'use client';

/**
 * Tomoshibi — Ruins of the Lantern — a Godot HTML5 build embedded from
 * `public/games/tomoshibi/`.
 *
 * Source repo: ~/Desktop/projects/tomoshibi
 * The contract with the game is documented there in `docs/CLOUD_SAVE.md`.
 *
 * ## Click-to-play
 *
 * The WebAssembly build is around 48MB. Loading it with the page would slow
 * every visit to the games list, so nothing is fetched until the button is
 * pressed.
 *
 * ## Why the bridge goes on `contentWindow`
 *
 * The game calls `window.tomoshibiCloudSave(...)`, and inside an iframe `window` is
 * the iframe's own window — not this one. Since the build is served from the
 * same origin we can reach in and define the two functions there. Doing it in
 * `onLoad` is deliberate: the document has to exist before it can be given
 * anything, and Godot only starts booting after that.
 *
 * **It has to be `onLoad`, not a `ref` callback.** A ref fires when the element
 * is mounted, while `contentWindow` is still the initial `about:blank`;
 * navigating to the build then replaces that window and takes the two functions
 * with it, so the game would find nothing and the cloud save would be dead
 * without ever erroring. This was written as a ref and caught in review.
 *
 * The cloud copy goes through the site's existing per-user save slots
 * (`/api/game/saves`), not an endpoint of its own — see tomoshibiSaveClient.
 *
 * ## Why the save is fetched before the iframe mounts
 *
 * Godot reads `window.tomoshibiCloudLoaded` synchronously at startup, because
 * `JavaScriptBridge.eval` cannot await a fetch. So the value has to be in hand
 * before the game runs. If the request fails we mount anyway with '' — the game
 * still has its local save, and refusing to start would be a worse outcome than
 * losing the cross-device handoff.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  isTomoshibiAccountSignedIn,
  loadTomoshibiSave,
  saveTomoshibiSave,
} from '@/services/tomoshibiSaveClient';

const GAME_URL = '/games/tomoshibi/index.html';

/**
 * Whether this browser can run the build at all.
 *
 * Godot's web export needs WebGL2, and without it the engine boots far enough
 * to show its own splash and then a raw "The following features required to run
 * Godot projects on the Web are missing: WebGL2" over it — which tells a player
 * nothing they can act on. Checked here instead so the page can say what to try.
 *
 * It is usually not the machine: hardware acceleration turned off in the
 * browser, or an anti-fingerprinting extension that disables WebGL, will both
 * land here on hardware that is perfectly capable.
 */
function hasWebGL2(): boolean {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
}

/** Writes are coalesced: the game only mirrors on floor changes and suspend,
 *  but a fast descent can still fire a couple in quick succession. */
const WRITE_DELAY_MS = 1500;

interface TomoshibiWindow extends Window {
  tomoshibiCloudLoaded?: string;
  tomoshibiCloudSave?: (json: string) => void;
}

export function Tomoshibi() {
  const [phase, setPhase] = useState<'idle' | 'preparing' | 'playing' | 'no-webgl'>('idle');
  const cloudSave = useRef('');
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef('');
  // クラウド側の状態。**自動保存は見えないので、見えるようにする。**
  // 1手ごとに保存してはいるが、画面に何も出ないので
  // 「アカウントに残っているのか」が遊ぶ側から分からなかった。
  const [cloud, setCloud] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [onAccount, setOnAccount] = useState<boolean | null>(null);

  const start = useCallback(async () => {
    if (!hasWebGL2()) {
      setPhase('no-webgl');
      return;
    }
    setPhase('preparing');
    cloudSave.current = await loadTomoshibiSave();
    setOnAccount(await isTomoshibiAccountSignedIn());
    setPhase('playing');
  }, []);

  /**
   * 「今すぐ保存」。
   *
   * 自動保存があるので機能としては重複しているが、**重複していることが
   * 分からない**のが問題だった。押せば結果が返るので、アカウントに
   * 残っていることをその場で確かめられる。
   *
   * ゲームがまだ一度も状態を渡していなければ送るものが無い。
   */
  const saveNow = useCallback(async () => {
    if (!latest.current) return;
    if (pending.current) {
      clearTimeout(pending.current);
      pending.current = null;
    }
    setCloud('saving');
    const ok = await saveTomoshibiSave(latest.current);
    setCloud(ok ? 'saved' : 'error');
    if (ok) setSavedAt(new Date());
  }, []);

  // 離脱時に、待たせているセーブを捨てずに送る。
  //
  // 書き込みは 1.5 秒まとめているので、その間にページを離れると
  // タイマーごと消えて最後の数手が失われる。タイマーを止めて即送る。
  useEffect(() => () => {
    if (!pending.current) return;
    clearTimeout(pending.current);
    pending.current = null;
    void saveTomoshibiSave(latest.current);
  }, []);

  /** Hand the game its two entry points, now that the iframe has a document. */
  const attachBridge = useCallback((frame: HTMLIFrameElement | null) => {
    const target = frame?.contentWindow as TomoshibiWindow | null | undefined;
    if (!target) {
      // Cross-origin or not ready. The game falls back to its local save.
      console.warn('[tomoshibi] could not reach the game frame; cloud save is off');
      return;
    }

    target.tomoshibiCloudLoaded = cloudSave.current;

    target.tomoshibiCloudSave = (json: string) => {
      latest.current = json;
      if (pending.current) clearTimeout(pending.current);
      // An empty string means the run ended, which should not sit in a timer -
      // the player may close the tab immediately after dying.
      if (json === '') {
        pending.current = null;
        void saveTomoshibiSave('');
        return;
      }
      pending.current = setTimeout(() => {
        pending.current = null;
        setCloud('saving');
        void saveTomoshibiSave(latest.current).then((ok) => {
          setCloud(ok ? 'saved' : 'error');
          if (ok) setSavedAt(new Date());
        });
      }, WRITE_DELAY_MS);
    };
  }, []);

  if (phase === 'no-webgl') {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: '0.75rem',
          width: '100%',
          aspectRatio: '16 / 9',
          padding: '1.5rem',
          borderRadius: 8,
          background: '#1b1a22',
          color: '#f0d78c',
          fontSize: '0.95rem',
          lineHeight: 1.7,
        }}
      >
        <strong>このブラウザでは動かせません(WebGL2 が使えません)</strong>
        <span style={{ opacity: 0.85 }}>
          端末の性能の問題ではないことがほとんどです。次のどれかで直ります:
        </span>
        <ul style={{ margin: 0, paddingLeft: '1.2rem', opacity: 0.85 }}>
          <li>ブラウザの設定で「ハードウェア アクセラレーション」を有効にする</li>
          <li>拡張機能(とくに指紋対策・プライバシー系)を切って開き直す</li>
          <li>別のブラウザか、シークレットウィンドウで開く</li>
        </ul>
        <span style={{ opacity: 0.6, fontSize: '0.85rem' }}>
          Chrome なら chrome://gpu で WebGL2 の状態を確認できます。
        </span>
      </div>
    );
  }

  if (phase !== 'playing') {
    return (
      <button
        type="button"
        onClick={start}
        disabled={phase === 'preparing'}
        aria-label="ともしびの遺跡を開始"
        style={{
          display: 'block',
          width: '100%',
          aspectRatio: '16 / 9',
          border: 0,
          borderRadius: 8,
          cursor: phase === 'preparing' ? 'progress' : 'pointer',
          background: '#1b1a22',
          color: '#f0d78c',
          fontSize: '1.1rem',
        }}
      >
        {phase === 'preparing' ? '読み込み中…' : '▶ ともしびの遺跡'}
      </button>
    );
  }

  return (
    <div>
      <iframe
        onLoad={(event) => attachBridge(event.currentTarget)}
        src={GAME_URL}
        title="ともしびの遺跡"
        allow="autoplay"
        style={{
          display: 'block',
          width: '100%',
          aspectRatio: '16 / 9',
          border: 0,
          borderRadius: 8,
        }}
      />
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          flexWrap: 'wrap',
          marginTop: '0.5rem',
        }}
      >
        <span style={{ fontSize: '0.85rem', opacity: 0.75 }}>
          {cloud === 'saving' && 'アカウントに保存中…'}
          {cloud === 'error' && '⚠ アカウントに保存できませんでした(手元の保存は残っています)'}
          {cloud === 'saved' && savedAt &&
            `${onAccount ? 'アカウント' : 'この端末'}に保存済み ${savedAt.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}`}
          {cloud === 'idle' && (onAccount
            ? '1手ごとに自動保存されます(アカウントに紐づけ済み)'
            : 'ログインすると、別の端末でも続きから遊べます')}
        </span>
        <button
          type="button"
          onClick={saveNow}
          disabled={cloud === 'saving'}
          style={{
            padding: '0.35rem 0.9rem',
            borderRadius: 6,
            border: '1px solid rgba(127,127,127,0.4)',
            background: 'transparent',
            color: 'inherit',
            fontSize: '0.85rem',
            cursor: cloud === 'saving' ? 'progress' : 'pointer',
          }}
        >
          今すぐ保存
        </button>
      </div>
      <p style={{ fontSize: '0.85rem', opacity: 0.7, marginTop: '0.5rem' }}>
        キーボード操作です。移動: 矢印キー / WASD、攻撃: スペース、持ち物: I、中断: ESC 2回。
        進行は1手ごとに自動保存されます。
      </p>
    </div>
  );
}
