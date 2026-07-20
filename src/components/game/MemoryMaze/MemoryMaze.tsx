'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Brain } from 'lucide-react';

import { useFeatureLifecycle } from '@/hooks/useActivityTracker';
import {
  DifficultySelector,
  GameStats,
  GameTopBar,
  InfoModal,
  type Difficulty,
  type DifficultyOption,
} from '../common';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import {
  DIFFICULTY_ORDER,
  buildMaze,
  computeStageScore,
  getStageConfig,
  type Maze,
  type Position,
} from './engine';
import { getStrings } from './i18n';
import styles from './MemoryMaze.module.css';

type Phase = 'menu' | 'preview' | 'playing' | 'won' | 'lost';

interface RunState {
  /** Unique id per stage instance so outcome recording can dedupe. */
  runId: number;
  phase: Phase;
  difficulty: Difficulty;
  stage: number;
  maze: Maze;
  player: Position;
  visited: boolean[][];
  moves: number;
  lives: number;
  peekMs: number;
  peekTotalMs: number;
  timeSec: number;
  timeTotalSec: number;
  score: number;
  lastGained: number;
  message: string;
  tone: 'neutral' | 'good' | 'bad';
  bump: Position | null;
  lossReason: 'time' | 'lives' | null;
}

const makeVisited = (size: number): boolean[][] => {
  const visited = Array.from({ length: size }, () => Array<boolean>(size).fill(false));
  visited[0][0] = true;
  return visited;
};

interface Messages {
  recall: string;
  timeUp: string;
  wall: string;
  outOfLives: string;
  stageClear: string;
  keepGoing: string;
}

/** Pure: advance the recall clock by one second. */
const tickTimer = (prev: RunState, msg: Messages): RunState => {
  if (prev.phase !== 'playing') return prev;
  const nextTime = prev.timeSec - 1;
  if (nextTime <= 0) {
    return { ...prev, timeSec: 0, phase: 'lost', lossReason: 'time', message: msg.timeUp, tone: 'bad' };
  }
  return { ...prev, timeSec: nextTime };
};

/** Pure: apply a directional move, producing the next run state. */
const applyMove = (prev: RunState, dx: number, dy: number, msg: Messages): RunState => {
  if (prev.phase !== 'playing') return prev;
  const nx = prev.player.x + dx;
  const ny = prev.player.y + dy;
  if (nx < 0 || ny < 0 || nx >= prev.maze.size || ny >= prev.maze.size) return prev;

  // Hit a wall -> lose a life.
  if (prev.maze.grid[ny][nx] === 1) {
    const lives = prev.lives - 1;
    if (lives <= 0) {
      return { ...prev, lives: 0, phase: 'lost', lossReason: 'lives', message: msg.outOfLives, tone: 'bad', bump: { x: nx, y: ny } };
    }
    return { ...prev, lives, message: msg.wall, tone: 'bad', bump: { x: nx, y: ny } };
  }

  const visited = prev.visited.map((row) => [...row]);
  visited[ny][nx] = true;
  const moves = prev.moves + 1;

  // Reached the goal.
  if (nx === prev.maze.goal.x && ny === prev.maze.goal.y) {
    const gained = computeStageScore({
      difficulty: prev.difficulty,
      stage: prev.stage,
      optimalLength: prev.maze.solution.length,
      moves,
      timeLeftSec: prev.timeSec,
      livesLeft: prev.lives,
    });
    return {
      ...prev,
      player: { x: nx, y: ny },
      visited,
      moves,
      phase: 'won',
      score: prev.score + gained,
      lastGained: gained,
      message: msg.stageClear,
      tone: 'good',
      bump: null,
    };
  }

  return {
    ...prev,
    player: { x: nx, y: ny },
    visited,
    moves,
    message: msg.keepGoing,
    tone: 'neutral',
    bump: null,
  };
};

export const MemoryMaze = () => {
  useFeatureLifecycle('game.memory-maze');
  const { language } = useGameLanguage();
  const t = getStrings(language);

  const [difficulty, setDifficulty] = useState<Difficulty>('easy');
  const [showInfo, setShowInfo] = useState(false);
  const [best, setBest] = useState(0);
  const [totalStats, setTotalStats] = useState<GameStats>({ wins: 0, losses: 0, draws: 0 });
  const [run, setRun] = useState<RunState | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const runIdRef = useRef(0);
  const recordedRef = useRef<number | null>(null);
  // Mirror of `run` for reading current state inside event/timer callbacks
  // without making them depend on `run` (keeps handlers stable).
  const runRef = useRef<RunState | null>(null);
  useEffect(() => {
    runRef.current = run;
  }, [run]);

  const phase: Phase = run?.phase ?? 'menu';

  const messages: Messages = useMemo(
    () => ({
      recall: t.recall,
      timeUp: t.timeUp,
      wall: t.wall,
      outOfLives: t.outOfLives,
      stageClear: t.stageClear,
      keepGoing: t.keepGoing,
    }),
    [t.recall, t.timeUp, t.wall, t.outOfLives, t.stageClear, t.keepGoing],
  );

  // Commit a computed next state, recording the win/loss outcome exactly once
  // per stage (deduped via runId). Recording happens here in the event/timer
  // handler — not inside a setState updater (which must stay pure) and not in
  // an effect — so it can't double-count.
  const commitRun = useCallback((next: RunState | null) => {
    if (next && (next.phase === 'won' || next.phase === 'lost') && recordedRef.current !== next.runId) {
      recordedRef.current = next.runId;
      if (next.phase === 'won') {
        setBest((b) => Math.max(b, next.stage));
        setTotalStats((s) => ({ ...s, wins: s.wins + 1 }));
      } else {
        setTotalStats((s) => ({ ...s, losses: s.losses + 1 }));
      }
    }
    // Keep the mirror in sync immediately so back-to-back moves in the same
    // frame read fresh state (the effect-based sync would lag by a commit).
    runRef.current = next;
    setRun(next);
  }, []);

  const startStage = useCallback(
    (diff: Difficulty, stage: number, carryScore: number) => {
      const maze = buildMaze(diff, stage);
      const cfg = getStageConfig(diff, stage);
      runIdRef.current += 1;
      setRun({
        runId: runIdRef.current,
        phase: 'preview',
        difficulty: diff,
        stage,
        maze,
        player: { ...maze.start },
        visited: makeVisited(maze.size),
        moves: 0,
        lives: cfg.lives,
        peekMs: cfg.peekMs,
        peekTotalMs: cfg.peekMs,
        timeSec: cfg.timeSec,
        timeTotalSec: cfg.timeSec,
        score: carryScore,
        lastGained: 0,
        message: t.memorize,
        tone: 'neutral',
        bump: null,
        lossReason: null,
      });
    },
    [t.memorize],
  );

  const startNewGame = useCallback(() => {
    startStage(difficulty, 1, 0);
  }, [difficulty, startStage]);

  const nextStage = useCallback(() => {
    if (!run) return;
    startStage(run.difficulty, run.stage + 1, run.score);
  }, [run, startStage]);

  // Preview countdown -> transition to playing.
  useEffect(() => {
    if (phase !== 'preview') return;
    const id = window.setInterval(() => {
      setRun((prev) => {
        if (!prev || prev.phase !== 'preview') return prev;
        const nextMs = prev.peekMs - 100;
        if (nextMs <= 0) {
          return { ...prev, peekMs: 0, phase: 'playing', message: t.recall, tone: 'neutral' };
        }
        return { ...prev, peekMs: nextMs };
      });
    }, 100);
    return () => window.clearInterval(id);
  }, [phase, t.recall]);

  // Recall timer.
  useEffect(() => {
    if (phase !== 'playing') return;
    const id = window.setInterval(() => {
      const current = runRef.current;
      if (!current || current.phase !== 'playing') return;
      commitRun(tickTimer(current, messages));
    }, 1000);
    return () => window.clearInterval(id);
  }, [phase, messages, commitRun]);

  const move = useCallback(
    (dx: number, dy: number) => {
      const current = runRef.current;
      if (!current || current.phase !== 'playing') return;
      commitRun(applyMove(current, dx, dy, messages));
    },
    [messages, commitRun],
  );

  // Keyboard controls.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (phase !== 'playing') return;
      let dx = 0;
      let dy = 0;
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') dx = -1;
      else if (e.code === 'ArrowRight' || e.code === 'KeyD') dx = 1;
      else if (e.code === 'ArrowUp' || e.code === 'KeyW') dy = -1;
      else if (e.code === 'ArrowDown' || e.code === 'KeyS') dy = 1;
      else return;
      e.preventDefault();
      move(dx, dy);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, move]);

  // Touch swipe controls on the board.
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (!touch) return;
    touchStart.current = { x: touch.clientX, y: touch.clientY };
  }, []);

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!touchStart.current) return;
      const touch = e.changedTouches[0];
      if (!touch) return;
      const dx = touch.clientX - touchStart.current.x;
      const dy = touch.clientY - touchStart.current.y;
      touchStart.current = null;
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);
      if (Math.max(absX, absY) < 24) return; // ignore taps
      if (absX > absY) move(dx > 0 ? 1 : -1, 0);
      else move(0, dy > 0 ? 1 : -1);
    },
    [move],
  );

  const cellSize = useMemo(() => {
    const size = run?.maze.size ?? 0;
    if (size <= 7) return 42;
    if (size <= 9) return 36;
    if (size <= 11) return 30;
    if (size <= 13) return 26;
    if (size <= 15) return 22;
    return 19;
  }, [run?.maze.size]);

  const difficultyOptions: DifficultyOption[] = useMemo(
    () =>
      DIFFICULTY_ORDER.map((value) => ({
        value,
        label: t.difficulty[value].label,
        description: t.difficulty[value].description,
      })),
    [t.difficulty],
  );

  const stats: GameStats = totalStats;

  // ----- Rendering -----
  const renderBoard = (r: RunState) => {
    const revealAll = r.phase === 'preview' || r.phase === 'won' || r.phase === 'lost';
    const solutionSet = new Set(r.maze.solution.map((p) => `${p.x},${p.y}`));

    return (
      <div
        className={styles.boardWrap}
        ref={boardRef}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div
          className={`${styles.board} ${r.phase === 'preview' ? styles.boardReveal : ''}`}
          style={{ gridTemplateColumns: `repeat(${r.maze.size}, ${cellSize}px)` }}
          role="grid"
          aria-label={t.title}
        >
          {r.maze.grid.flatMap((row, y) =>
            row.map((cell, x) => {
              const isPlayer = r.player.x === x && r.player.y === y;
              const isGoal = r.maze.goal.x === x && r.maze.goal.y === y;
              const isVisited = r.visited[y]?.[x];
              const isBump = r.bump?.x === x && r.bump?.y === y;
              const dist = Math.abs(r.player.x - x) + Math.abs(r.player.y - y);
              const isWall = cell === 1;

              // During recall, only walls adjacent to the player are revealed.
              const wallVisible = revealAll || (r.phase === 'playing' && dist <= 1);
              const onSolution = solutionSet.has(`${x},${y}`);

              const classes = [styles.cell];
              if (isWall && wallVisible) classes.push(styles.cellWall);
              else if (isWall) classes.push(styles.cellHiddenWall);
              if (!isWall && r.phase === 'preview' && onSolution) classes.push(styles.cellPath);
              if (!isWall && isVisited && r.phase !== 'preview') classes.push(styles.cellVisited);
              if (isGoal) classes.push(styles.cellGoal);
              if (isPlayer) classes.push(styles.cellPlayer);
              if (isBump) classes.push(styles.cellBump);

              return (
                <div
                  key={`${x}-${y}`}
                  className={classes.join(' ')}
                  style={{ width: cellSize, height: cellSize }}
                  role="gridcell"
                  aria-label={
                    isPlayer
                      ? t.cellPlayer
                      : isGoal
                        ? t.cellGoal
                        : isWall && wallVisible
                          ? t.cellWall
                          : t.cellPath
                  }
                />
              );
            }),
          )}
        </div>

        {(r.phase === 'won' || r.phase === 'lost') && (
          <div className={styles.overlay}>
            <p className={styles.overlayTitle} data-tone={r.phase === 'won' ? 'win' : 'lose'}>
              {r.phase === 'won'
                ? t.stageClear
                : r.lossReason === 'time'
                  ? t.timeUp
                  : t.outOfLives}
            </p>
            <div className={styles.overlayStat}>
              {t.score}: <strong>{r.score}</strong>
              {r.phase === 'won' && r.lastGained > 0 ? ` (+${r.lastGained})` : ''}
            </div>
            <div className={styles.overlayStat}>
              {t.stage}: <strong>{r.stage}</strong> · {t.moves}: <strong>{r.moves}</strong>
            </div>
            <div className={styles.actions}>
              {r.phase === 'won' && (
                <button type="button" className={`${styles.btn} ${styles.btnNext}`} onClick={nextStage}>
                  {t.nextStage}
                </button>
              )}
              <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={startNewGame}>
                {t.playAgain}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={styles.page}>
      <GameTopBar stats={stats} onInfoClick={() => setShowInfo(true)} />

      <InfoModal isOpen={showInfo} onClose={() => setShowInfo(false)} title={t.howToTitle}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', lineHeight: 1.6 }}>
          {t.howToBody.map((line, i) => (
            <p key={i} style={{ margin: 0 }}>{line}</p>
          ))}
          <p style={{ margin: 0, fontWeight: 700 }}>{t.controls}</p>
          <p style={{ margin: 0 }}>{t.controlsDetail}</p>
        </div>
      </InfoModal>

      {phase === 'menu' || !run ? (
        <DifficultySelector
          title={t.title}
          subtitle={t.subtitle}
          icon={<Brain size={28} />}
          selectedDifficulty={difficulty}
          onSelectDifficulty={setDifficulty}
          options={difficultyOptions}
          onStart={startNewGame}
          difficultyTitle={t.selectDifficulty}
          startLabel={t.start}
          kickerLabel={t.gameSetup}
        />
      ) : (
        <div className={styles.shell}>
          <div className={styles.hud}>
            <div className={styles.hudItem}>
              <span className={styles.hudLabel}>{t.stage}</span>
              <span className={styles.hudValue}>{run.stage}</span>
            </div>
            <div className={styles.hudItem}>
              <span className={styles.hudLabel}>{t.time}</span>
              <span className={styles.hudValue} data-alert={run.phase === 'playing' && run.timeSec <= 5}>
                {run.phase === 'preview' ? Math.ceil(run.peekMs / 1000) : run.timeSec}s
              </span>
            </div>
            <div className={styles.hudItem}>
              <span className={styles.hudLabel}>{t.lives}</span>
              <span className={styles.hearts} aria-label={`${run.lives} ${t.lives}`}>
                {'♥'.repeat(run.lives) || '—'}
              </span>
            </div>
            <div className={styles.hudItem}>
              <span className={styles.hudLabel}>{t.moves}</span>
              <span className={styles.hudValue}>{run.moves}</span>
            </div>
            <div className={styles.hudItem}>
              <span className={styles.hudLabel}>{t.score}</span>
              <span className={styles.hudValue}>{run.score}</span>
            </div>
            <div className={styles.hudItem}>
              <span className={styles.hudLabel}>{t.best}</span>
              <span className={styles.hudValue}>{best}</span>
            </div>
          </div>

          <div
            className={styles.peekBarTrack}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={
              run.phase === 'preview'
                ? Math.round((run.peekMs / run.peekTotalMs) * 100)
                : Math.round((run.timeSec / run.timeTotalSec) * 100)
            }
          >
            <div
              className={`${styles.peekBarFill} ${run.phase !== 'preview' ? styles.timeBarFill : ''}`}
              data-alert={run.phase === 'playing' && run.timeSec <= 5}
              style={{
                width:
                  run.phase === 'preview'
                    ? `${(run.peekMs / run.peekTotalMs) * 100}%`
                    : `${(run.timeSec / run.timeTotalSec) * 100}%`,
              }}
            />
          </div>

          <div className={styles.message} data-tone={run.tone}>
            {run.message}
          </div>

          {renderBoard(run)}

          {run.phase === 'playing' && (
            <div className={styles.dpad} aria-label="direction pad">
              <button type="button" className={`${styles.dpadBtn} ${styles.dpadUp}`} onClick={() => move(0, -1)} aria-label="up">↑</button>
              <button type="button" className={`${styles.dpadBtn} ${styles.dpadLeft}`} onClick={() => move(-1, 0)} aria-label="left">←</button>
              <button type="button" className={`${styles.dpadBtn} ${styles.dpadRight}`} onClick={() => move(1, 0)} aria-label="right">→</button>
              <button type="button" className={`${styles.dpadBtn} ${styles.dpadDown}`} onClick={() => move(0, 1)} aria-label="down">↓</button>
            </div>
          )}

          <p className={styles.hint}>{t.controlsDetail}</p>

          <div className={styles.actions}>
            <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={() => setRun(null)}>
              {t.restart}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default MemoryMaze;
