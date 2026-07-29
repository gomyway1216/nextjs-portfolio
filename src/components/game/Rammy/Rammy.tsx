'use client';

/**
 * Rammy the Adventurer (homage) — a Godot HTML5 build embedded from
 * `public/games/rammy/`.
 *
 * Source repo: ~/Desktop/projects/rammy-godot
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
 * The game calls `window.rammyCloudSave(...)`, and inside an iframe `window` is
 * the iframe's own window — not this one. Since the build is served from the
 * same origin we can reach in and define the two functions there. Doing it in
 * `onLoad` is deliberate: the document has to exist before it can be given
 * anything, and Godot only starts booting after that.
 *
 * ## Why the save is fetched before the iframe mounts
 *
 * Godot reads `window.rammyCloudLoaded` synchronously at startup, because
 * `JavaScriptBridge.eval` cannot await a fetch. So the value has to be in hand
 * before the game runs. If the request fails we mount anyway with '' — the game
 * still has its local save, and refusing to start would be a worse outcome than
 * losing the cross-device handoff.
 */

import { useCallback, useRef, useState } from 'react';
import { loadRammySave, saveRammySave } from '@/services/rammySaveClient';

const GAME_URL = '/games/rammy/index.html';

/** Writes are coalesced: the game only mirrors on floor changes and suspend,
 *  but a fast descent can still fire a couple in quick succession. */
const WRITE_DELAY_MS = 1500;

interface RammyWindow extends Window {
  rammyCloudLoaded?: string;
  rammyCloudSave?: (json: string) => void;
}

export function Rammy() {
  const [phase, setPhase] = useState<'idle' | 'preparing' | 'playing'>('idle');
  const cloudSave = useRef('');
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef('');

  const start = useCallback(async () => {
    setPhase('preparing');
    cloudSave.current = await loadRammySave();
    setPhase('playing');
  }, []);

  /** Hand the game its two entry points, now that the iframe has a document. */
  const attachBridge = useCallback((frame: HTMLIFrameElement | null) => {
    const target = frame?.contentWindow as RammyWindow | null | undefined;
    if (!target) {
      // Cross-origin or not ready. The game falls back to its local save.
      console.warn('[rammy] could not reach the game frame; cloud save is off');
      return;
    }

    target.rammyCloudLoaded = cloudSave.current;

    target.rammyCloudSave = (json: string) => {
      latest.current = json;
      if (pending.current) clearTimeout(pending.current);
      // An empty string means the run ended, which should not sit in a timer -
      // the player may close the tab immediately after dying.
      if (json === '') {
        pending.current = null;
        void saveRammySave('');
        return;
      }
      pending.current = setTimeout(() => {
        pending.current = null;
        void saveRammySave(latest.current);
      }, WRITE_DELAY_MS);
    };
  }, []);

  if (phase !== 'playing') {
    return (
      <button
        type="button"
        onClick={start}
        disabled={phase === 'preparing'}
        aria-label="ラミィの大冒険(オマージュ)を開始"
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
        {phase === 'preparing' ? '読み込み中…' : '▶ ラミィの大冒険(オマージュ)'}
      </button>
    );
  }

  return (
    <div>
      <iframe
        ref={attachBridge}
        src={GAME_URL}
        title="ラミィの大冒険(オマージュ)"
        allow="autoplay"
        style={{
          display: 'block',
          width: '100%',
          aspectRatio: '16 / 9',
          border: 0,
          borderRadius: 8,
        }}
      />
      <p style={{ fontSize: '0.85rem', opacity: 0.7, marginTop: '0.5rem' }}>
        キーボード操作です。移動: 矢印キー / WASD、攻撃: スペース、持ち物: I、中断: ESC 2回。
        進行は自動保存され、ログインしていれば別の端末でも続きから遊べます。
      </p>
    </div>
  );
}
