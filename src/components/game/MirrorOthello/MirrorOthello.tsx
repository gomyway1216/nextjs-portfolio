'use client';

import { RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useFeatureLifecycle } from '@/hooks/useActivityTracker';
import {
  Difficulty,
  DifficultySelector,
  GameStats,
  GameTopBar,
  InfoModal,
} from '../common';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { chooseAIMove } from './ai';
import {
  advance,
  AI,
  Cell,
  cellLabel,
  countDiscs,
  createInitialBoard,
  EMPTY,
  getValidMoves,
  PLAYER,
  pliesUntilMirror,
  Point,
  type GameResult,
} from './engine';
import { getMirrorOthelloStrings } from './i18n';
import styles from './MirrorOthello.module.css';

type Phase = 'menu' | 'playing' | 'gameover';

interface GameState {
  board: Cell[][];
  currentColor: Cell;
  validMoves: Point[];
  turnCount: number;
  lastMove: Point | null;
  result: GameResult | null;
}

const freshGame = (): GameState => {
  const board = createInitialBoard();
  return {
    board,
    currentColor: PLAYER,
    validMoves: getValidMoves(board, PLAYER),
    turnCount: 0,
    lastMove: null,
    result: null,
  };
};

const AI_DELAY_MS = 480;
const FLIP_ANIM_MS = 500;

export const MirrorOthello = () => {
  useFeatureLifecycle('game.mirror-othello');
  const { language } = useGameLanguage();
  const t = useMemo(() => getMirrorOthelloStrings(language), [language]);

  const [phase, setPhase] = useState<Phase>('menu');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [game, setGame] = useState<GameState>(freshGame);
  const [message, setMessage] = useState<string>('');
  const [showInfo, setShowInfo] = useState(false);
  const [flipping, setFlipping] = useState(false);
  const [stats, setStats] = useState<GameStats>({ wins: 0, losses: 0, draws: 0 });

  const flipTimer = useRef<number | null>(null);
  const aiTimer = useRef<number | null>(null);

  const clearTimers = useCallback(() => {
    if (flipTimer.current) window.clearTimeout(flipTimer.current);
    if (aiTimer.current) window.clearTimeout(aiTimer.current);
    flipTimer.current = null;
    aiTimer.current = null;
  }, []);

  useEffect(() => () => clearTimers(), [clearTimers]);

  const start = useCallback(() => {
    clearTimers();
    setGame(freshGame());
    setMessage(t.yourTurn);
    setFlipping(false);
    setPhase('playing');
  }, [clearTimers, t.yourTurn]);

  const triggerFlipAnim = useCallback(() => {
    if (flipTimer.current) window.clearTimeout(flipTimer.current);
    setFlipping(true);
    flipTimer.current = window.setTimeout(() => setFlipping(false), FLIP_ANIM_MS);
  }, []);

  /**
   * Apply a single ply and derive the next UI state + messages. This is a
   * plain callback (not a `setGame` updater) so it can call state setters
   * directly — React updater functions must stay pure/side-effect-free.
   */
  const commitMove = useCallback(
    (point: Point, color: Cell) => {
      const step = advance(game.board, point, color, game.turnCount);
      if (!step) return;

      const who = color === PLAYER ? t.you : t.ai;
      let msg = t.played(who, cellLabel(point.x, point.y));
      if (step.mirrored) {
        msg += ` ${t.mirrored}`;
        triggerFlipAnim();
      }
      if (step.passed) {
        // `passed` means the mover's OPPONENT had no move, so nextColor is back
        // to the mover: nextColor === PLAYER implies the AI is the one passing.
        msg += ` ${step.nextColor === PLAYER ? t.aiPass : t.youPass}`;
      }

      if (step.gameOver) {
        const counts = countDiscs(step.board);
        const result: GameResult =
          counts.player > counts.ai
            ? 'player'
            : counts.ai > counts.player
              ? 'ai'
              : 'draw';
        setStats((s) => ({
          wins: s.wins + (result === 'player' ? 1 : 0),
          losses: s.losses + (result === 'ai' ? 1 : 0),
          draws: s.draws + (result === 'draw' ? 1 : 0),
        }));
        setMessage(t.gameOver(counts.player, counts.ai));
        setPhase('gameover');
        setGame({
          board: step.board,
          currentColor: EMPTY,
          validMoves: [],
          turnCount: step.turnCount,
          lastMove: point,
          result,
        });
        return;
      }

      if (!step.mirrored && !step.passed) {
        setMessage(step.nextColor === PLAYER ? t.yourTurn : t.aiThinking);
      } else {
        setMessage(msg);
      }

      setGame({
        board: step.board,
        currentColor: step.nextColor,
        validMoves: step.nextMoves,
        turnCount: step.turnCount,
        lastMove: point,
        result: null,
      });
    },
    [game, t, triggerFlipAnim],
  );

  // AI turn driver.
  useEffect(() => {
    if (phase !== 'playing' || game.currentColor !== AI) return;
    if (game.validMoves.length === 0) return;

    aiTimer.current = window.setTimeout(() => {
      const move = chooseAIMove(game.board, difficulty, game.turnCount);
      if (!move) return;
      commitMove(move, AI);
    }, AI_DELAY_MS);

    return () => {
      if (aiTimer.current) window.clearTimeout(aiTimer.current);
      aiTimer.current = null;
    };
  }, [
    phase,
    game.currentColor,
    game.validMoves,
    game.board,
    game.turnCount,
    difficulty,
    commitMove,
  ]);

  const onCellClick = useCallback(
    (x: number, y: number) => {
      if (phase !== 'playing') return;
      if (game.currentColor !== PLAYER) return;
      if (!game.validMoves.some((m) => m.x === x && m.y === y)) return;
      commitMove({ x, y }, PLAYER);
    },
    [phase, game, commitMove],
  );

  const counts = useMemo(() => countDiscs(game.board), [game.board]);
  const untilMirror = pliesUntilMirror(game.turnCount);
  const isPlayerTurn = phase === 'playing' && game.currentColor === PLAYER;

  const validSet = useMemo(() => {
    const set = new Set<string>();
    if (isPlayerTurn) {
      for (const m of game.validMoves) set.add(`${m.x},${m.y}`);
    }
    return set;
  }, [game.validMoves, isPlayerTurn]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        overflow: 'auto',
        background: 'var(--games-route-bg, #050505)',
        color: 'var(--games-route-fg, #f5f5f7)',
      }}
    >
      <GameTopBar stats={stats} onInfoClick={() => setShowInfo(true)} />

      <div className={styles.page} style={{ marginTop: '4.5rem' }}>
        {phase === 'menu' ? (
          <DifficultySelector
            title={t.title}
            subtitle={t.subtitle}
            icon={<span style={{ fontSize: '2.75rem' }}>🔄</span>}
            selectedDifficulty={difficulty}
            onSelectDifficulty={setDifficulty}
            options={t.difficultyOptions}
            onStart={start}
            difficultyTitle={t.selectDifficulty}
            startLabel={t.start}
            kickerLabel={t.gameSetup}
          />
        ) : (
          <>
            <header className={styles.header}>
              <h1 className={styles.title}>{t.title}</h1>
              <p className={styles.subtitle}>{t.subtitle}</p>
            </header>

            <div className={styles.statusBar}>
              <span className={styles.scorePill} data-active={isPlayerTurn}>
                <span className={`${styles.disc} ${styles.discDark}`} aria-hidden />
                {t.you}: {counts.player}
              </span>
              <span
                className={styles.scorePill}
                data-active={phase === 'playing' && game.currentColor === AI}
              >
                <span className={`${styles.disc} ${styles.discLight}`} aria-hidden />
                {t.ai}: {counts.ai}
              </span>
              {phase === 'playing' && (
                <span
                  className={styles.mirrorPill}
                  data-imminent={untilMirror === 1}
                  aria-live="polite"
                >
                  🔄 {t.untilMirror(untilMirror)}
                </span>
              )}
            </div>

            <div className={styles.message} role="status" aria-live="polite">
              {message}
            </div>

            <div className={styles.boardWrap}>
              <div
                className={styles.board}
                data-flipping={flipping}
                role="grid"
                aria-label={t.title}
              >
                {game.board.flatMap((row, y) =>
                  row.map((cell, x) => {
                    const playable = validSet.has(`${x},${y}`);
                    const isLast =
                      game.lastMove?.x === x && game.lastMove?.y === y;
                    return (
                      <button
                        key={`${x}-${y}`}
                        type="button"
                        className={styles.cell}
                        data-playable={playable}
                        data-last={isLast}
                        onClick={() => onCellClick(x, y)}
                        disabled={!playable}
                        aria-label={
                          cellLabel(x, y) +
                          (cell === PLAYER
                            ? ` — ${t.you}`
                            : cell === AI
                              ? ` — ${t.ai}`
                              : playable
                                ? ` — ${t.legalHint}`
                                : '')
                        }
                      >
                        {cell !== EMPTY && (
                          <span
                            className={`${styles.stone} ${
                              cell === PLAYER ? styles.stoneDark : styles.stoneLight
                            }`}
                          />
                        )}
                        {cell === EMPTY && playable && (
                          <span className={styles.hint} aria-hidden />
                        )}
                      </button>
                    );
                  }),
                )}
              </div>
            </div>

            <div className={styles.controls}>
              <button
                type="button"
                className={styles.restartButton}
                onClick={start}
              >
                <RotateCcw size={18} aria-hidden />
                {phase === 'gameover' ? t.playAgain : t.restart}
              </button>
              {phase === 'gameover' && game.result && (
                <div
                  className={`${styles.result} ${
                    game.result === 'player'
                      ? styles.resultWin
                      : game.result === 'ai'
                        ? styles.resultLose
                        : styles.resultDraw
                  }`}
                >
                  {game.result === 'player'
                    ? t.youWin
                    : game.result === 'ai'
                      ? t.aiWins
                      : t.draw}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <InfoModal
        isOpen={showInfo}
        onClose={() => setShowInfo(false)}
        title={t.infoTitle}
      >
        <ul className={styles.infoList}>
          {t.howToPlay.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      </InfoModal>
    </div>
  );
};

export default MirrorOthello;
