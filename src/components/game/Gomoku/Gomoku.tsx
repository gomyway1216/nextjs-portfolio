/**
 * Gomoku (Five in a Row) game component.
 */

'use client';

import { useFeatureLifecycle } from '@/hooks/useActivityTracker';
import { RotateCcw, SlidersHorizontal } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Difficulty,
  DifficultySelector,
  GameStats,
  GameStatus,
  GameTopBar,
  InfoModal,
} from '../common';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { checkWinFromPosition, getBestMove, isBoardFull } from './GomokuAI';
import { getGomokuStrings } from './i18n';
import styles from './Gomoku.module.css';
import { AI, BOARD_SIZE, PLAYER, Player, Position } from './types';

const DIFFICULTY_VALUES: Difficulty[] = ['easy', 'medium', 'hard', 'expert', 'master'];

const emptyBoard = (): Player[][] =>
  Array.from({ length: BOARD_SIZE }, () => Array<Player>(BOARD_SIZE).fill(null));

/** Convert a grid index (0..BOARD_SIZE-1) to a percentage coordinate. */
const pct = (i: number): number => (i / (BOARD_SIZE - 1)) * 100;

const Gomoku = () => {
  const _lifecycle = useFeatureLifecycle('game.gomoku');
  const { language } = useGameLanguage();
  const t = useMemo(() => getGomokuStrings(language), [language]);

  const [board, setBoard] = useState<Player[][]>(emptyBoard);
  const [isPlayerTurn, setIsPlayerTurn] = useState(true);
  const [gameStatus, setGameStatus] = useState<GameStatus>('playing');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [showDifficultySelect, setShowDifficultySelect] = useState(true);
  const [showInfo, setShowInfo] = useState(false);
  const [stats, setStats] = useState<GameStats>({ wins: 0, losses: 0, draws: 0 });
  const [winningLine, setWinningLine] = useState<Position[] | null>(null);
  const [lastMove, setLastMove] = useState<Position | null>(null);
  const [isAIThinking, setIsAIThinking] = useState(false);
  const aiBusyRef = useRef(false);

  const difficultyOptions = useMemo(
    () =>
      DIFFICULTY_VALUES.map((value) => ({
        value,
        label: t.difficulties[value].label,
        description: t.difficulties[value].description,
      })),
    [t]
  );

  const handleCellClick = useCallback(
    (row: number, col: number) => {
      if (
        !isPlayerTurn ||
        board[row][col] !== null ||
        gameStatus !== 'playing' ||
        isAIThinking
      ) {
        return;
      }

      const newBoard = board.map((r) => [...r]);
      newBoard[row][col] = PLAYER;
      setBoard(newBoard);
      setLastMove({ row, col });

      const winLine = checkWinFromPosition(newBoard, row, col, PLAYER);
      if (winLine) {
        setGameStatus('win');
        setWinningLine(winLine);
        setStats((prev) => ({ ...prev, wins: prev.wins + 1 }));
        return;
      }

      if (isBoardFull(newBoard)) {
        setGameStatus('draw');
        setStats((prev) => ({ ...prev, draws: prev.draws + 1 }));
        return;
      }

      setIsPlayerTurn(false);
    },
    [board, isPlayerTurn, gameStatus, isAIThinking]
  );

  // AI turn.
  useEffect(() => {
    if (isPlayerTurn || gameStatus !== 'playing' || aiBusyRef.current) return;

    aiBusyRef.current = true;
    setIsAIThinking(true);

    // Defer to a macrotask so React can paint the "thinking" state and the
    // (potentially heavy) search doesn't block the click handler.
    const timer = setTimeout(() => {
      const boardCopy = board.map((r) => [...r]);
      const move = getBestMove(boardCopy, difficulty);

      if (move) {
        const newBoard = board.map((r) => [...r]);
        newBoard[move.row][move.col] = AI;
        setBoard(newBoard);
        setLastMove(move);

        const winLine = checkWinFromPosition(newBoard, move.row, move.col, AI);
        if (winLine) {
          setGameStatus('lose');
          setWinningLine(winLine);
          setStats((prev) => ({ ...prev, losses: prev.losses + 1 }));
        } else if (isBoardFull(newBoard)) {
          setGameStatus('draw');
          setStats((prev) => ({ ...prev, draws: prev.draws + 1 }));
        } else {
          setIsPlayerTurn(true);
        }
      } else {
        setIsPlayerTurn(true);
      }

      setIsAIThinking(false);
      aiBusyRef.current = false;
    }, 220);

    return () => clearTimeout(timer);
  }, [isPlayerTurn, gameStatus, board, difficulty]);

  const resetGame = useCallback(() => {
    setBoard(emptyBoard());
    setIsPlayerTurn(true);
    setGameStatus('playing');
    setWinningLine(null);
    setLastMove(null);
    setIsAIThinking(false);
    aiBusyRef.current = false;
  }, []);

  const startGame = useCallback(() => {
    setShowDifficultySelect(false);
    resetGame();
  }, [resetGame]);

  const backToMenu = useCallback(() => {
    setShowDifficultySelect(true);
    resetGame();
  }, [resetGame]);

  const isWinningCell = useCallback(
    (row: number, col: number): boolean =>
      winningLine?.some((p) => p.row === row && p.col === col) ?? false,
    [winningLine]
  );

  const isLastMoveCell = (row: number, col: number): boolean =>
    lastMove?.row === row && lastMove?.col === col;

  const interactive =
    isPlayerTurn && gameStatus === 'playing' && !isAIThinking;

  type StatusDot = 'spinner' | 'black' | 'white' | null;
  const statusView = (): {
    main: string;
    sub: string;
    color: string;
    dot: StatusDot;
  } => {
    if (gameStatus === 'win') {
      return { main: t.youWin, sub: t.youWinSub, color: '#22c55e', dot: null };
    }
    if (gameStatus === 'lose') {
      return { main: t.aiWins, sub: t.aiWinsSub, color: '#ef4444', dot: null };
    }
    if (gameStatus === 'draw') {
      return { main: t.draw, sub: t.drawSub, color: '#eab308', dot: null };
    }
    if (isAIThinking) {
      return {
        main: t.aiThinking,
        sub: t.youAre,
        color: '#0ea5e9',
        dot: 'spinner',
      };
    }
    return {
      main: isPlayerTurn ? t.yourTurn : t.aiTurn,
      sub: t.youAre,
      color: '#0ea5e9',
      dot: isPlayerTurn ? 'black' : 'white',
    };
  };

  const s = statusView();

  return (
    <div className={styles.root}>
      <GameTopBar stats={stats} onInfoClick={() => setShowInfo(true)} />

      {showDifficultySelect ? (
        <DifficultySelector
          title={t.title}
          subtitle={t.subtitle}
          icon={
            <>
              <span style={{ fontSize: '2.6rem' }}>⚫</span>
              <span style={{ fontSize: '2.6rem' }}>⚪</span>
            </>
          }
          selectedDifficulty={difficulty}
          onSelectDifficulty={setDifficulty}
          options={difficultyOptions}
          onStart={startGame}
          difficultyTitle={t.selectDifficulty}
          startLabel={t.start}
        />
      ) : (
        <div className={styles.panel}>
          <div className={styles.status} role="status" aria-live="polite">
            <span className={styles.statusMain} style={{ color: s.color }}>
              {s.dot === 'spinner' && <span className={styles.spinner} aria-hidden />}
              {s.dot === 'black' && (
                <span className={`${styles.turnDot} ${styles.turnDotBlack}`} aria-hidden />
              )}
              {s.dot === 'white' && (
                <span className={`${styles.turnDot} ${styles.turnDotWhite}`} aria-hidden />
              )}
              {s.main}
            </span>
            <span className={styles.statusSub}>{s.sub}</span>
          </div>

          <div
            className={styles.boardWrap}
            role="grid"
            aria-label={t.boardLabel(BOARD_SIZE)}
          >
            <div className={styles.board}>
              <svg className={styles.grid} viewBox="0 0 100 100" preserveAspectRatio="none">
                {Array.from({ length: BOARD_SIZE }).map((_, i) => (
                  <line
                    key={`h-${i}`}
                    x1={0}
                    y1={pct(i)}
                    x2={100}
                    y2={pct(i)}
                    stroke="#8B4513"
                    strokeWidth={0.35}
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
                {Array.from({ length: BOARD_SIZE }).map((_, i) => (
                  <line
                    key={`v-${i}`}
                    x1={pct(i)}
                    y1={0}
                    x2={pct(i)}
                    y2={100}
                    stroke="#8B4513"
                    strokeWidth={0.35}
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
                {[3, 7, 11].map((r) =>
                  [3, 7, 11].map((c) => (
                    <circle
                      key={`star-${r}-${c}`}
                      cx={pct(c)}
                      cy={pct(r)}
                      r={0.8}
                      fill="#8B4513"
                    />
                  ))
                )}
                {winningLine && winningLine.length >= 2 && (
                  <line
                    className={styles.winLine}
                    x1={pct(winningLine[0].col)}
                    y1={pct(winningLine[0].row)}
                    x2={pct(winningLine[winningLine.length - 1].col)}
                    y2={pct(winningLine[winningLine.length - 1].row)}
                    vectorEffect="non-scaling-stroke"
                  />
                )}
              </svg>

              {board.map((rowArr, row) =>
                rowArr.map((cell, col) => {
                  const last = isLastMoveCell(row, col);
                  const win = isWinningCell(row, col);
                  const stone = cell ? (cell === PLAYER ? t.black : t.white) : null;
                  const label = t.cellLabel(row + 1, col + 1, stone);
                  return (
                    <button
                      key={`${row}-${col}`}
                      type="button"
                      role="gridcell"
                      className={styles.point}
                      style={{ left: `${pct(col)}%`, top: `${pct(row)}%` }}
                      onClick={() => handleCellClick(row, col)}
                      disabled={!interactive || cell !== null}
                      aria-label={label}
                    >
                      {cell === null && interactive && (
                        <span className={`${styles.ghost} ${styles.ghostBlack}`} aria-hidden />
                      )}
                      {cell === PLAYER && (
                        <span
                          className={`${styles.stone} ${styles.stoneBlack} ${
                            win ? styles.winStone : last ? styles.lastBlack : ''
                          }`}
                          aria-hidden
                        />
                      )}
                      {cell === AI && (
                        <span
                          className={`${styles.stone} ${styles.stoneWhite} ${
                            win ? styles.winStone : last ? styles.lastWhite : ''
                          }`}
                          aria-hidden
                        />
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className={styles.actions}>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnPrimary}`}
              onClick={resetGame}
              disabled={isAIThinking}
            >
              <RotateCcw className={styles.btnIcon} />
              {t.newGame}
            </button>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnSecondary}`}
              onClick={backToMenu}
              disabled={isAIThinking}
            >
              <SlidersHorizontal className={styles.btnIcon} />
              {t.changeDifficulty}
            </button>
          </div>
        </div>
      )}

      <InfoModal
        isOpen={showInfo}
        onClose={() => setShowInfo(false)}
        title={t.infoTitle}
      >
        <div className={styles.infoGrid}>
          <div className={styles.infoCard}>
            <div style={{ fontSize: '1.6rem', marginBottom: '0.4rem' }}>🎯</div>
            <h3 className={styles.infoCardTitle}>{t.objectiveTitle}</h3>
            <p className={styles.infoCardBody}>{t.objectiveBody}</p>
          </div>
          <div className={styles.infoCard}>
            <div style={{ fontSize: '1.6rem', marginBottom: '0.4rem' }}>🖱️</div>
            <h3 className={styles.infoCardTitle}>{t.howToTitle}</h3>
            <p className={styles.infoCardBody}>{t.howToBody}</p>
          </div>
          <div className={styles.infoCard}>
            <h3 className={styles.infoCardTitle}>💡 {t.tipsTitle}</h3>
            <ul className={styles.tipList}>
              {t.tips.map((tip, i) => (
                <li key={i}>{tip}</li>
              ))}
            </ul>
          </div>
        </div>
      </InfoModal>
    </div>
  );
};

export default Gomoku;
