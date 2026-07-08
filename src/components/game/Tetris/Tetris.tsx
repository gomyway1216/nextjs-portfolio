/**
 * Tetris game component — modern guideline mechanics:
 * SRS rotation + wall kicks, 7-bag randomizer, hold, 5-piece next queue,
 * ghost piece, soft/hard drop, lock delay, line-clear animation.
 */

'use client';

import { useFeatureLifecycle } from '@/hooks/useActivityTracker';
import { useHighScore } from '@/hooks/useHighScore';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ChevronsDown,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Square,
  Trophy,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Difficulty, DifficultySelector, GameStats, GameTopBar, InfoModal } from '../common';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import {
  calculateScore,
  clearLines,
  createEmptyBoard,
  createTetromino,
  getDropInterval,
  getFullRows,
  getGhostPiecePosition,
  getLevel,
  getDropDistance,
  isValidPosition,
  mergePieceToBoard,
  refillQueue,
  tryRotate,
} from './gameLogic';
import {
  Board,
  BOARD_WIDTH,
  COLORS,
  GAME_CONSTANTS,
  HIDDEN_ROWS,
  SHAPES,
  TetrominoType,
  Tetromino,
  TOTAL_HEIGHT,
} from './types';
import { getTetrisStrings } from './i18n';
import styles from './Tetris.module.css';

const { LOCK_DELAY, MAX_LOCK_RESETS, NEXT_QUEUE_SIZE } = GAME_CONSTANTS;

interface RunningState {
  board: Board;
  current: Tetromino;
  queue: TetrominoType[];
  hold: TetrominoType | null;
  canHold: boolean;
  score: number;
  lines: number;
  level: number;
  gameOver: boolean;
}

const Tetris = () => {
  const _lifecycle = useFeatureLifecycle('game.tetris');
  const { language } = useGameLanguage();
  const t = useMemo(() => getTetrisStrings(language), [language]);

  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [showDifficultySelect, setShowDifficultySelect] = useState(true);
  const [showInfo, setShowInfo] = useState(false);
  const [stats, setStats] = useState<GameStats>({ wins: 0, losses: 0, draws: 0 });
  const [highScore, updateHighScore] = useHighScore('tetris');

  // React-rendered view of the game (updated on every meaningful change).
  const [view, setView] = useState<RunningState | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [clearingRows, setClearingRows] = useState<number[]>([]);

  // Mutable game state used by the animation-frame loop (avoids stale closures).
  const stateRef = useRef<RunningState | null>(null);
  const rafRef = useRef<number | null>(null);
  const dropAccRef = useRef(0);
  const lastTsRef = useRef(0);
  const lockTimerRef = useRef(0);
  const lockResetsRef = useRef(0);
  const softDropRef = useRef(false);
  const pausedRef = useRef(false);
  const difficultyRef = useRef<Difficulty>('medium');
  const animatingRef = useRef(false);

  const DIFFICULTY_OPTIONS = useMemo(
    () => [
      { value: 'easy' as Difficulty, label: t.easy, description: t.easyDesc },
      { value: 'medium' as Difficulty, label: t.medium, description: t.mediumDesc },
      { value: 'hard' as Difficulty, label: t.hard, description: t.hardDesc },
    ],
    [t]
  );

  const sync = useCallback(() => {
    if (stateRef.current) setView({ ...stateRef.current });
  }, []);

  // Spawn the next piece from the queue; returns false on game over (block-out).
  const spawnFromQueue = useCallback((s: RunningState): boolean => {
    const queue = refillQueue(s.queue, NEXT_QUEUE_SIZE);
    const type = queue.shift()!;
    const piece = createTetromino(type);
    s.queue = queue;
    s.current = piece;
    s.canHold = true;
    lockTimerRef.current = 0;
    lockResetsRef.current = 0;
    if (!isValidPosition(s.board, piece)) {
      s.gameOver = true;
      return false;
    }
    return true;
  }, []);

  const commitLock = useCallback(() => {
    const s = stateRef.current;
    if (!s || s.gameOver) return;

    const merged = mergePieceToBoard(s.board, s.current);
    const full = getFullRows(merged);

    const finalize = (boardAfter: Board, cleared: number) => {
      if (cleared > 0) {
        s.lines += cleared;
        s.level = getLevel(s.lines);
        s.score += calculateScore(cleared, s.level);
        updateHighScore(s.score);
      }
      s.board = boardAfter;
      const alive = spawnFromQueue(s);
      sync();
      if (!alive) {
        setStats(prev => ({ ...prev, losses: prev.losses + 1 }));
      }
    };

    if (full.length > 0) {
      // Animate the clear: freeze gravity briefly, then collapse.
      s.board = merged;
      animatingRef.current = true;
      setClearingRows(full);
      sync();
      window.setTimeout(() => {
        const { newBoard } = clearLines(merged);
        setClearingRows([]);
        animatingRef.current = false;
        finalize(newBoard, full.length);
      }, 260);
    } else {
      finalize(merged, 0);
    }
  }, [spawnFromQueue, sync, updateHighScore]);

  // --- Player actions -------------------------------------------------------
  const isBusy = () => {
    const s = stateRef.current;
    return !s || s.gameOver || pausedRef.current || animatingRef.current;
  };

  const resetLockIfGrounded = (s: RunningState) => {
    const grounded = !isValidPosition(s.board, {
      ...s.current,
      position: { ...s.current.position, y: s.current.position.y + 1 },
    });
    if (grounded && lockResetsRef.current < MAX_LOCK_RESETS) {
      lockTimerRef.current = 0;
      lockResetsRef.current += 1;
    }
  };

  const move = useCallback(
    (dx: number) => {
      if (isBusy()) return;
      const s = stateRef.current!;
      const moved = { ...s.current, position: { x: s.current.position.x + dx, y: s.current.position.y } };
      if (isValidPosition(s.board, moved)) {
        s.current = moved;
        resetLockIfGrounded(s);
        sync();
      }
    },
    [sync]
  );

  const rotate = useCallback(
    (dir: 1 | -1) => {
      if (isBusy()) return;
      const s = stateRef.current!;
      const r = tryRotate(s.board, s.current, dir);
      if (r) {
        s.current = r;
        resetLockIfGrounded(s);
        sync();
      }
    },
    [sync]
  );

  const softDropStep = useCallback(() => {
    if (isBusy()) return;
    const s = stateRef.current!;
    const down = { ...s.current, position: { ...s.current.position, y: s.current.position.y + 1 } };
    if (isValidPosition(s.board, down)) {
      s.current = down;
      s.score += GAME_CONSTANTS.SOFT_DROP_POINTS;
      sync();
    }
  }, [sync]);

  const hardDrop = useCallback(() => {
    if (isBusy()) return;
    const s = stateRef.current!;
    const dist = getDropDistance(s.board, s.current);
    s.current = { ...s.current, position: { ...s.current.position, y: s.current.position.y + dist } };
    s.score += dist * GAME_CONSTANTS.HARD_DROP_POINTS;
    commitLock();
  }, [commitLock]);

  const holdPiece = useCallback(() => {
    if (isBusy()) return;
    const s = stateRef.current!;
    if (!s.canHold) return;
    const currentType = s.current.type;
    if (s.hold === null) {
      s.hold = currentType;
      spawnFromQueue(s);
    } else {
      const swap = s.hold;
      s.hold = currentType;
      s.current = createTetromino(swap);
    }
    s.canHold = false;
    lockTimerRef.current = 0;
    lockResetsRef.current = 0;
    sync();
  }, [spawnFromQueue, sync]);

  // Stable pointer-down handlers for the on-screen touch controls.
  const touchLeft = useCallback((e: React.PointerEvent) => { e.preventDefault(); move(-1); }, [move]);
  const touchRight = useCallback((e: React.PointerEvent) => { e.preventDefault(); move(1); }, [move]);
  const touchRotateCw = useCallback((e: React.PointerEvent) => { e.preventDefault(); rotate(1); }, [rotate]);
  const touchRotateCcw = useCallback((e: React.PointerEvent) => { e.preventDefault(); rotate(-1); }, [rotate]);
  const touchSoft = useCallback((e: React.PointerEvent) => { e.preventDefault(); softDropStep(); }, [softDropStep]);
  const touchHard = useCallback((e: React.PointerEvent) => { e.preventDefault(); hardDrop(); }, [hardDrop]);
  const touchHold = useCallback((e: React.PointerEvent) => { e.preventDefault(); holdPiece(); }, [holdPiece]);

  // --- Game loop ------------------------------------------------------------
  // Keep the latest tick logic in a ref so the RAF callback never goes stale
  // and never has to reference itself (avoids TDZ / immutability lint issues).
  // The per-frame logic. Stored in a ref so the self-scheduling RAF loop
  // always runs the latest closure without recreating the loop (which would
  // otherwise reference itself and trip the compiler's TDZ checks).
  const tickRef = useRef<(ts: number) => void>(() => {});

  const tick = useCallback(
    (ts: number) => {
      const s = stateRef.current;
      if (!s || s.gameOver) return;

      if (!pausedRef.current && !animatingRef.current) {
        const dt = lastTsRef.current ? ts - lastTsRef.current : 0;
        const baseInterval = getDropInterval(difficultyRef.current, s.level);
        const interval = softDropRef.current ? Math.min(baseInterval, 45) : baseInterval;
        dropAccRef.current += dt;

        const grounded = !isValidPosition(s.board, {
          ...s.current,
          position: { ...s.current.position, y: s.current.position.y + 1 },
        });

        if (grounded) {
          lockTimerRef.current += dt;
          if (lockTimerRef.current >= LOCK_DELAY) {
            dropAccRef.current = 0;
            commitLock();
          }
        } else if (dropAccRef.current >= interval) {
          dropAccRef.current = 0;
          s.current = { ...s.current, position: { ...s.current.position, y: s.current.position.y + 1 } };
          if (softDropRef.current) s.score += GAME_CONSTANTS.SOFT_DROP_POINTS;
          lockTimerRef.current = 0;
          sync();
        }
      }

      lastTsRef.current = ts;
    },
    [commitLock, sync]
  );

  useEffect(() => {
    tickRef.current = tick;
  }, [tick]);

  const startLoop = useCallback(() => {
    lastTsRef.current = 0;
    dropAccRef.current = 0;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const step = (ts: number) => {
      tickRef.current(ts);
      if (stateRef.current && !stateRef.current.gameOver) {
        rafRef.current = requestAnimationFrame(step);
      }
    };
    rafRef.current = requestAnimationFrame(step);
  }, []);

  const initGame = useCallback(() => {
    const queue = refillQueue([], NEXT_QUEUE_SIZE);
    const first = queue.shift()!;
    const s: RunningState = {
      board: createEmptyBoard(),
      current: createTetromino(first),
      queue,
      hold: null,
      canHold: true,
      score: 0,
      lines: 0,
      level: 1,
      gameOver: false,
    };
    stateRef.current = s;
    lockTimerRef.current = 0;
    lockResetsRef.current = 0;
    softDropRef.current = false;
    animatingRef.current = false;
    setClearingRows([]);
    pausedRef.current = false;
    setIsPaused(false);
    setView({ ...s });
    startLoop();
  }, [startLoop]);

  const togglePause = useCallback(() => {
    const s = stateRef.current;
    if (!s || s.gameOver) return;
    pausedRef.current = !pausedRef.current;
    setIsPaused(pausedRef.current);
    if (!pausedRef.current) {
      lastTsRef.current = 0; // avoid a big dt jump after resuming
    }
  }, []);

  // Keyboard controls
  useEffect(() => {
    if (showDifficultySelect) return;
    const held = new Set<string>();
    const onKeyDown = (e: KeyboardEvent) => {
      const s = stateRef.current;
      if (!s) return;
      // Allow pause/restart even when grounded/animating.
      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          move(-1);
          return;
        case 'ArrowRight':
          e.preventDefault();
          move(1);
          return;
        case 'ArrowDown':
          e.preventDefault();
          softDropRef.current = true;
          if (!held.has(e.key)) softDropStep();
          held.add(e.key);
          return;
        case 'ArrowUp':
        case 'x':
        case 'X':
          e.preventDefault();
          rotate(1);
          return;
        case 'z':
        case 'Z':
        case 'Control':
          e.preventDefault();
          rotate(-1);
          return;
        case ' ':
          e.preventDefault();
          if (!held.has(e.key)) hardDrop();
          held.add(e.key);
          return;
        case 'Shift':
        case 'c':
        case 'C':
          e.preventDefault();
          holdPiece();
          return;
        case 'p':
        case 'P':
        case 'Escape':
          e.preventDefault();
          togglePause();
          return;
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      held.delete(e.key);
      if (e.key === 'ArrowDown') softDropRef.current = false;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showDifficultySelect, move, rotate, softDropStep, hardDrop, holdPiece]);

  // Keep difficulty ref in sync.
  useEffect(() => {
    difficultyRef.current = difficulty;
  }, [difficulty]);

  // Cleanup RAF on unmount.
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const startGame = () => {
    setShowDifficultySelect(false);
    initGame();
  };

  const resetGame = () => initGame();

  const backToMenu = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    stateRef.current = null;
    setView(null);
    setShowDifficultySelect(true);
  };

  // --- Rendering ------------------------------------------------------------
  const cellPx = 'clamp(16px, 4.4vw, 30px)';

  const renderBoard = () => {
    if (!view) return null;
    type Disp = { color: string | null; ghost: boolean; clearing: boolean };
    const disp: Disp[][] = view.board.map((row, y) =>
      row.map(cell => ({
        color: cell ? COLORS[cell] : null,
        ghost: false,
        clearing: clearingRows.includes(y),
      }))
    );

    if (!view.gameOver && clearingRows.length === 0) {
      const piece = view.current;
      const ghostY = getGhostPiecePosition(view.board, piece);
      for (let y = 0; y < piece.shape.length; y++) {
        for (let x = 0; x < piece.shape[y].length; x++) {
          if (!piece.shape[y][x]) continue;
          const by = ghostY + y;
          const bx = piece.position.x + x;
          if (by >= 0 && by < TOTAL_HEIGHT && bx >= 0 && bx < BOARD_WIDTH && !disp[by][bx].color) {
            disp[by][bx].ghost = true;
          }
        }
      }
      for (let y = 0; y < piece.shape.length; y++) {
        for (let x = 0; x < piece.shape[y].length; x++) {
          if (!piece.shape[y][x]) continue;
          const by = piece.position.y + y;
          const bx = piece.position.x + x;
          if (by >= 0 && by < TOTAL_HEIGHT && bx >= 0 && bx < BOARD_WIDTH) {
            disp[by][bx] = { color: piece.color, ghost: false, clearing: false };
          }
        }
      }
    }

    // Only render the visible rows (skip the hidden spawn buffer).
    const visible = disp.slice(HIDDEN_ROWS);

    return (
      <div
        className={styles.board}
        style={{
          gridTemplateColumns: `repeat(${BOARD_WIDTH}, var(--cell))`,
          ['--cell' as string]: cellPx,
        }}
        role="img"
        aria-label={`${t.title} board`}
      >
        {visible.flatMap((row, y) =>
          row.map((c, x) => {
            const cls = [styles.cell];
            if (c.color && !c.ghost) cls.push(styles.cellFilled);
            if (c.ghost) cls.push(styles.cellGhost);
            if (c.clearing) cls.push(styles.cellClearing);
            const style: React.CSSProperties = {};
            if (c.ghost) {
              style.borderColor = c.color ?? view.current.color;
            } else if (c.color) {
              style.background = c.color;
            }
            return <div key={`${y}-${x}`} className={cls.join(' ')} style={style} />;
          })
        )}
      </div>
    );
  };

  const renderMini = (type: TetrominoType | null, key?: string) => {
    if (!type) return <div className={styles.holdEmpty}>—</div>;
    // Trim empty rows/cols for a compact preview.
    const shape = SHAPES[type];
    const rows = shape.filter(r => r.some(Boolean));
    const colCount = shape[0].length;
    const cols: number[] = [];
    for (let c = 0; c < colCount; c++) {
      if (rows.some(r => r[c])) cols.push(c);
    }
    return (
      <div
        key={key}
        className={styles.previewGrid}
        style={{ gridTemplateColumns: `repeat(${cols.length}, 16px)` }}
      >
        {rows.flatMap((r, y) =>
          cols.map(c => (
            <div
              key={`${y}-${c}`}
              className={styles.previewCell}
              style={{ background: r[c] ? COLORS[type] : 'transparent' }}
            />
          ))
        )}
      </div>
    );
  };

  const nextTypes = view ? view.queue.slice(0, NEXT_QUEUE_SIZE) : [];

  return (
    <div className={styles.root}>
      <GameTopBar
        stats={stats}
        onInfoClick={() => setShowInfo(true)}
        additionalContent={
          view &&
          !showDifficultySelect && (
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.8rem', fontWeight: 600 }}>
              <span style={{ color: '#38bdf8' }}>
                {t.level} {view.level}
              </span>
              <span style={{ color: '#fbbf24' }}>
                {t.lines} {view.lines}
              </span>
            </div>
          )
        }
      />

      <div className={styles.stage}>
        {showDifficultySelect ? (
          <DifficultySelector
            title={t.title}
            subtitle={t.subtitle}
            icon={<span style={{ fontSize: '3rem' }}>🟦</span>}
            selectedDifficulty={difficulty}
            onSelectDifficulty={setDifficulty}
            options={DIFFICULTY_OPTIONS}
            onStart={startGame}
            difficultyTitle={t.selectDifficulty}
            startLabel={t.start}
          />
        ) : (
          <div className={styles.game}>
            {/* Board column */}
            <div className={styles.boardCol}>
              <div className={styles.boardWrap}>
                {renderBoard()}

                {view?.gameOver && (
                  <div className={styles.overlay}>
                    <div className={`${styles.overlayTitle} ${styles.gameOverTitle}`}>{t.gameOver}</div>
                    <div className={styles.overlayScore}>
                      {t.score}: <strong>{view.score}</strong>
                    </div>
                    <button type="button" className={styles.primaryBtn} onClick={resetGame}>
                      <RotateCcw size={18} /> {t.playAgain}
                    </button>
                  </div>
                )}

                {isPaused && !view?.gameOver && (
                  <div className={styles.overlay}>
                    <div className={`${styles.overlayTitle} ${styles.pausedTitle}`}>{t.paused}</div>
                    <button type="button" className={styles.primaryBtn} onClick={togglePause}>
                      <Play size={18} /> {t.resume}
                    </button>
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div className={styles.actionRow}>
                <button
                  type="button"
                  className={styles.actionBtn}
                  onClick={togglePause}
                  disabled={view?.gameOver}
                  aria-label={isPaused ? t.resume : t.pause}
                >
                  {isPaused ? <Play size={15} /> : <Pause size={15} />}
                  {isPaused ? t.resume : t.pause}
                </button>
                <button type="button" className={styles.actionBtn} onClick={resetGame} aria-label={t.newGame}>
                  <RotateCcw size={15} /> {t.newGame}
                </button>
                <button type="button" className={styles.actionBtn} onClick={backToMenu} aria-label={t.menu}>
                  {t.menu}
                </button>
              </div>

              {/* Touch controls (mobile only) */}
              <div className={styles.touch} role="group" aria-label={t.controls}>
                <button type="button" className={styles.touchBtn} onPointerDown={touchLeft} aria-label={t.move}>
                  <ArrowLeft size={22} />
                </button>
                <button type="button" className={styles.touchBtn} onPointerDown={touchRotateCcw} aria-label={t.rotateCcw}>
                  <RotateCcw size={22} />
                </button>
                <button type="button" className={styles.touchBtn} onPointerDown={touchRotateCw} aria-label={t.rotate}>
                  <RotateCw size={22} />
                </button>
                <button type="button" className={styles.touchBtn} onPointerDown={touchRight} aria-label={t.move}>
                  <ArrowRight size={22} />
                </button>
                <button type="button" className={styles.touchBtn} onPointerDown={touchHold} aria-label={t.hold}>
                  <Square size={20} />
                </button>
                <button type="button" className={styles.touchBtn} onPointerDown={touchSoft} aria-label={t.softDrop}>
                  <ArrowDown size={22} />
                </button>
                <button
                  type="button"
                  className={`${styles.touchBtn} ${styles.touchWide}`}
                  onPointerDown={touchHard}
                  aria-label={t.hardDrop}
                >
                  <ChevronsDown size={22} />
                </button>
              </div>
            </div>

            {/* Side panel */}
            <div className={styles.side}>
              <div className={styles.panel}>
                <div className={styles.panelLabel}>{t.score}</div>
                <div className={`${styles.statValue} ${styles.scoreValue}`}>{view?.score ?? 0}</div>
              </div>

              <div className={styles.panel}>
                <div className={styles.panelLabel}>
                  <Trophy size={12} /> {t.highScore}
                </div>
                <div className={`${styles.statValue} ${styles.highValue}`}>{highScore}</div>
              </div>

              <div className={styles.statGrid}>
                <div className={styles.miniStat}>
                  <div className={styles.panelLabel}>{t.level}</div>
                  <div className={styles.miniValue}>{view?.level ?? 1}</div>
                </div>
                <div className={styles.miniStat}>
                  <div className={styles.panelLabel}>{t.lines}</div>
                  <div className={styles.miniValue}>{view?.lines ?? 0}</div>
                </div>
              </div>

              <div className={styles.panel}>
                <div className={styles.panelLabel}>{t.hold}</div>
                <div style={{ display: 'flex', justifyContent: 'center', minHeight: 40, alignItems: 'center' }}>
                  {renderMini(view?.hold ?? null)}
                </div>
              </div>

              <div className={styles.panel}>
                <div className={styles.panelLabel}>{t.next}</div>
                <div className={styles.nextList}>
                  {nextTypes.map((type, i) => renderMini(type, `${type}-${i}`))}
                </div>
              </div>

              <div className={`${styles.panel} ${styles.controlsPanel}`}>
                <div className={styles.panelLabel}>{t.controls}</div>
                <div className={styles.controlsList}>
                  <div><span>← →</span> {t.move}</div>
                  <div><span>↑ / X</span> {t.rotate}</div>
                  <div><span>Z</span> {t.rotateCcw}</div>
                  <div><span>↓</span> {t.softDrop}</div>
                  <div><span>Space</span> {t.hardDrop}</div>
                  <div><span>C / Shift</span> {t.holdKey}</div>
                  <div><span>P</span> {t.pauseKey}</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <InfoModal isOpen={showInfo} onClose={() => setShowInfo(false)} title={t.howToPlay}>
        <div className={styles.modalGrid}>
          <div className={styles.modalCard}>
            <div className={styles.modalCardTitle}>🎯 {t.objective}</div>
            <p>{t.objectiveBody}</p>
          </div>
          <div className={styles.modalCard}>
            <div className={styles.modalCardTitle}>💯 {t.scoring}</div>
            <ul>
              <li>{t.scoringSingle}</li>
              <li>{t.scoringDouble}</li>
              <li>{t.scoringTriple}</li>
              <li>{t.scoringTetris}</li>
              <li>{t.scoringDrops}</li>
              <li>{t.scoringLevel}</li>
            </ul>
          </div>
          <div className={styles.modalCard}>
            <div className={styles.modalCardTitle}>🎮 {t.tips}</div>
            <ul>
              <li>{t.tip1}</li>
              <li>{t.tip2}</li>
              <li>{t.tip3}</li>
              <li>{t.tip4}</li>
            </ul>
          </div>
        </div>
      </InfoModal>
    </div>
  );
};

export default Tetris;
