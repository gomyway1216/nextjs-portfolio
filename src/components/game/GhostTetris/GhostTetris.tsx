'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Info, Pause, Play } from 'lucide-react';

import { useFeatureLifecycle } from '@/hooks/useActivityTracker';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { InfoModal } from '../common';
import { getStrings } from './i18n';
import styles from './GhostTetris.module.css';
import {
  BOARD_H,
  BOARD_W,
  COLORS,
  type GameState,
  type Phase,
  SHAPES,
  createGame,
  dropIntervalMs,
  dropY,
  ghostOpacity,
  hardDrop,
  moveHorizontally,
  rotate,
  step,
} from './engine';

export const GhostTetris = () => {
  useFeatureLifecycle('game.ghost-tetris');
  const { language } = useGameLanguage();
  const t = getStrings(language);

  const [game, setGame] = useState<GameState>(createGame);
  const [now, setNow] = useState(() => Date.now());
  const [infoOpen, setInfoOpen] = useState(false);

  // Keep a ref to the latest phase so the keyboard listener avoids stale
  // closures without re-subscribing on every state change.
  const phaseRef = useRef<Phase>(game.phase);
  useEffect(() => {
    phaseRef.current = game.phase;
  }, [game.phase]);

  const start = useCallback(() => {
    setGame({ ...createGame(), phase: 'playing' });
  }, []);

  // Wall-clock time when the game was paused, so we can shift lockedAt
  // timestamps forward on resume and the ghosts don't jump ahead in their fade.
  const pauseStartRef = useRef(0);

  const togglePause = useCallback(() => {
    setGame((prev) => {
      const nowTime = Date.now();
      if (prev.phase === 'playing') {
        pauseStartRef.current = nowTime;
        return { ...prev, phase: 'paused' };
      }
      if (prev.phase === 'paused') {
        const pauseDuration = nowTime - pauseStartRef.current;
        const lockedAt = prev.lockedAt.map((row) =>
          row.map((time) => (time > 0 ? time + pauseDuration : 0)),
        );
        return { ...prev, phase: 'playing', lockedAt };
      }
      return prev;
    });
  }, []);

  // Clock for the ghost fade. A modest 90ms cadence keeps the fade smooth
  // without hammering React; it only drives cell opacity.
  useEffect(() => {
    if (game.phase !== 'playing') return;
    const timer = window.setInterval(() => setNow(Date.now()), 90);
    return () => window.clearInterval(timer);
  }, [game.phase]);

  // Gravity. Interval resets when the level (hence speed) changes.
  useEffect(() => {
    if (game.phase !== 'playing') return;
    const interval = dropIntervalMs(game.level);
    const timer = window.setInterval(() => {
      setGame((prev) => (prev.phase === 'playing' ? step(prev, Date.now()) : prev));
    }, interval);
    return () => window.clearInterval(timer);
  }, [game.phase, game.level]);

  // Keyboard controls. Registered once; uses functional updates + phaseRef so
  // it never goes stale and never needs to re-bind mid-game.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const phase = phaseRef.current;

      if (event.code === 'KeyP') {
        event.preventDefault();
        togglePause();
        return;
      }
      if (phase !== 'playing') return;

      switch (event.code) {
        case 'ArrowLeft':
          event.preventDefault();
          setGame((prev) => (prev.phase === 'playing' ? moveHorizontally(prev, -1) : prev));
          break;
        case 'ArrowRight':
          event.preventDefault();
          setGame((prev) => (prev.phase === 'playing' ? moveHorizontally(prev, 1) : prev));
          break;
        case 'ArrowDown':
          event.preventDefault();
          setGame((prev) => (prev.phase === 'playing' ? step(prev, Date.now(), 1) : prev));
          break;
        case 'ArrowUp':
        case 'KeyX':
          event.preventDefault();
          setGame((prev) => (prev.phase === 'playing' ? rotate(prev, 'cw') : prev));
          break;
        case 'KeyZ':
        case 'ControlLeft':
        case 'ControlRight':
          event.preventDefault();
          setGame((prev) => (prev.phase === 'playing' ? rotate(prev, 'ccw') : prev));
          break;
        case 'Space':
          event.preventDefault();
          setGame((prev) => (prev.phase === 'playing' ? hardDrop(prev, Date.now()) : prev));
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [togglePause]);

  // Touch control handlers
  const touch = {
    left: () => setGame((p) => (p.phase === 'playing' ? moveHorizontally(p, -1) : p)),
    right: () => setGame((p) => (p.phase === 'playing' ? moveHorizontally(p, 1) : p)),
    rotate: () => setGame((p) => (p.phase === 'playing' ? rotate(p, 'cw') : p)),
    drop: () => setGame((p) => (p.phase === 'playing' ? hardDrop(p, Date.now()) : p)),
  };

  // Compose the render board: locked cells + the active piece + its drop shadow.
  const activeCells = new Set<number>();
  const shadowCells = new Set<number>();
  let activeId = 0;
  if (game.phase === 'playing' || game.phase === 'paused') {
    const shadowY = dropY(game.board, game.current);
    const { shape, x, y, id } = game.current;
    activeId = id;
    for (let sy = 0; sy < shape.length; sy += 1) {
      for (let sx = 0; sx < shape[sy].length; sx += 1) {
        if (!shape[sy][sx]) continue;
        const px = x + sx;
        const shy = shadowY + sy;
        if (px >= 0 && px < BOARD_W && shy >= 0 && shy < BOARD_H) {
          shadowCells.add(shy * BOARD_W + px);
        }
        const py = y + sy;
        if (px >= 0 && px < BOARD_W && py >= 0 && py < BOARD_H) {
          activeCells.add(py * BOARD_W + px);
        }
      }
    }
  }

  const cells: React.ReactNode[] = [];
  for (let y = 0; y < BOARD_H; y += 1) {
    for (let x = 0; x < BOARD_W; x += 1) {
      const idx = y * BOARD_W + x;
      const locked = game.board[y][x];
      const isActive = activeCells.has(idx);
      const isShadow = !isActive && !locked && shadowCells.has(idx);
      const isClearing = game.clearing.includes(y);

      let cellId = 0;
      let opacity = 1;
      if (isActive) {
        cellId = activeId;
      } else if (locked) {
        cellId = locked;
        opacity = ghostOpacity(game.lockedAt[y][x], now);
      }

      const className = [
        styles.cell,
        cellId === 0 && !isShadow ? styles.empty : '',
        isShadow ? styles.ghostShadow : '',
        isClearing ? styles.clearing : '',
      ]
        .filter(Boolean)
        .join(' ');

      cells.push(
        <div
          key={idx}
          className={className}
          style={cellId !== 0 ? { background: COLORS[cellId], opacity } : undefined}
        />,
      );
    }
  }

  const speedPct = Math.round((1 - dropIntervalMs(game.level) / 800) * 100);
  const primaryLabel =
    game.phase === 'gameover' ? t.playAgain : game.phase === 'menu' ? t.start : t.restart;

  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div className={styles.titleBlock}>
            <h1 className={styles.title}>{t.title}</h1>
            <p className={styles.tagline}>{t.tagline}</p>
          </div>
          <button
            type="button"
            className={styles.infoBtn}
            onClick={() => setInfoOpen(true)}
            aria-label={t.howToPlay}
          >
            <Info size={16} aria-hidden />
            {t.howToPlay}
          </button>
        </header>

        <div className={styles.layout}>
          <div
            className={styles.boardWrap}
            role="grid"
            aria-label={t.title}
            aria-rowcount={BOARD_H}
            aria-colcount={BOARD_W}
          >
            <div className={styles.board}>{cells}</div>

            {game.phase === 'gameover' && (
              <div className={styles.overlay} role="alertdialog" aria-label={t.gameOver}>
                <p className={styles.overlayTitle}>{t.gameOver}</p>
                <p className={styles.overlayText}>{t.gameOverReason}</p>
                <p className={styles.overlayScore}>
                  {t.score}: {game.score} · {t.lines}: {game.lines}
                </p>
                <button type="button" className={styles.overlayBtn} onClick={start}>
                  {t.playAgain}
                </button>
              </div>
            )}

            {game.phase === 'paused' && (
              <div className={styles.overlay} role="dialog" aria-label={t.paused}>
                <p className={styles.overlayTitle}>{t.paused}</p>
                <button type="button" className={styles.overlayBtn} onClick={togglePause}>
                  {t.resume}
                </button>
              </div>
            )}

            {game.phase === 'menu' && (
              <div className={styles.overlay} role="dialog" aria-label={t.title}>
                <p className={styles.overlayTitle}>{t.title}</p>
                <p className={styles.overlayText}>{t.tagline}</p>
                <button type="button" className={styles.overlayBtn} onClick={start}>
                  {t.start}
                </button>
              </div>
            )}
          </div>

          <aside className={styles.sidebar}>
            <div className={styles.card}>
              <div className={styles.stats}>
                <div className={styles.stat}>
                  <span className={styles.statLabel}>{t.score}</span>
                  <span className={styles.statValue}>{game.score}</span>
                </div>
                <div className={styles.stat}>
                  <span className={styles.statLabel}>{t.level}</span>
                  <span className={styles.statValue}>{game.level + 1}</span>
                </div>
                <div className={styles.stat}>
                  <span className={styles.statLabel}>{t.lines}</span>
                  <span className={styles.statValue}>{game.lines}</span>
                </div>
                <div className={styles.stat}>
                  <span className={styles.statLabel}>{t.speed}</span>
                  <span className={styles.statValue}>{speedPct}%</span>
                </div>
              </div>
            </div>

            <div className={styles.card}>
              <p className={styles.nextTitle}>{t.next}</p>
              <NextPreview id={game.next.id} />
            </div>

            <div className={styles.buttons}>
              <button type="button" className={styles.primaryBtn} onClick={start}>
                {primaryLabel}
              </button>
              {(game.phase === 'playing' || game.phase === 'paused') && (
                <button type="button" className={styles.secondaryBtn} onClick={togglePause}>
                  {game.phase === 'paused' ? (
                    <>
                      <Play size={15} aria-hidden style={{ verticalAlign: '-2px' }} /> {t.resume}
                    </>
                  ) : (
                    <>
                      <Pause size={15} aria-hidden style={{ verticalAlign: '-2px' }} /> {t.pause}
                    </>
                  )}
                </button>
              )}
            </div>

            <div className={styles.card}>
              <div className={styles.keyList}>
                <div className={styles.keyRow}>
                  <span>{t.move}</span>
                  <span className={styles.kbd}>← →</span>
                </div>
                <div className={styles.keyRow}>
                  <span>{t.softDrop}</span>
                  <span className={styles.kbd}>↓</span>
                </div>
                <div className={styles.keyRow}>
                  <span>{t.rotate}</span>
                  <span className={styles.kbd}>↑ / Z</span>
                </div>
                <div className={styles.keyRow}>
                  <span>{t.hardDrop}</span>
                  <span className={styles.kbd}>Space</span>
                </div>
                <div className={styles.keyRow}>
                  <span>{t.pauseKey}</span>
                  <span className={styles.kbd}>P</span>
                </div>
              </div>
            </div>
          </aside>
        </div>

        <div className={styles.touchPad} aria-hidden={game.phase !== 'playing'}>
          <button
            type="button"
            className={styles.touchBtn}
            onClick={touch.left}
            aria-label={t.move}
          >
            ←
          </button>
          <button
            type="button"
            className={styles.touchBtn}
            onClick={touch.rotate}
            aria-label={t.rotate}
          >
            ⟳<span className={styles.touchLabel}>{t.touchRotate}</span>
          </button>
          <button
            type="button"
            className={styles.touchBtn}
            onClick={touch.drop}
            aria-label={t.hardDrop}
          >
            ⤓<span className={styles.touchLabel}>{t.touchDrop}</span>
          </button>
          <button
            type="button"
            className={styles.touchBtn}
            onClick={touch.right}
            aria-label={t.move}
          >
            →
          </button>
        </div>
      </div>

      <InfoModal isOpen={infoOpen} onClose={() => setInfoOpen(false)} title={t.title}>
        <div className={styles.infoModalBody}>
          <section>
            <h3>{t.ghostTitle}</h3>
            <p>{t.ghostBody}</p>
          </section>
          <section>
            <h3>{t.controlsTitle}</h3>
            <ul>
              <li>{t.move}: ← →</li>
              <li>{t.softDrop}: ↓</li>
              <li>{t.rotate}: ↑ / Z</li>
              <li>{t.hardDrop}: Space</li>
              <li>{t.pauseKey}: P</li>
            </ul>
          </section>
          <section>
            <h3>{t.scoringTitle}</h3>
            <ul>
              {t.scoringBody.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </section>
        </div>
      </InfoModal>
    </div>
  );
};

const NextPreview = ({ id }: { id: number }) => {
  const shape = SHAPES[id - 1];
  if (!shape || !shape[0]) return null;

  // Center the piece in a fixed 4x4 grid so the sidebar never shifts between
  // pieces of different widths, and guard against an invalid id.
  const h = shape.length;
  const w = shape[0].length;
  const grid = Array.from({ length: 4 }, () => Array<number>(4).fill(0));
  const rOffset = Math.floor((4 - h) / 2);
  const cOffset = Math.floor((4 - w) / 2);
  for (let r = 0; r < h; r += 1) {
    for (let c = 0; c < w; c += 1) {
      grid[r + rOffset][c + cOffset] = shape[r][c];
    }
  }

  return (
    <div
      className={styles.nextGrid}
      style={{ gridTemplateColumns: 'repeat(4, 20px)' }}
      aria-hidden
    >
      {grid.flatMap((row, y) =>
        row.map((cell, x) => (
          <div
            key={`${x}-${y}`}
            className={styles.nextCell}
            style={{
              background: cell ? COLORS[id] : 'transparent',
            }}
          />
        )),
      )}
    </div>
  );
};

export default GhostTetris;
