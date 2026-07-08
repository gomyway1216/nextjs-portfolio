/**
 * TicTacToe game component.
 */

'use client';

import { useFeatureLifecycle } from '@/hooks/useActivityTracker';
import { RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Difficulty,
  DifficultyOption,
  DifficultySelector,
  GameStats,
  GameStatus,
  GameTopBar,
  InfoModal
} from '../common';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { checkWinner, getBestMove, isBoardFull } from './TicTacToeAI';
import { getTicTacToeCopy } from './i18n';
import { AI, Player, PLAYER } from './types';
import styles from './TicTacToe.module.css';

const DIFFICULTY_ORDER: Difficulty[] = ['easy', 'medium', 'hard', 'expert', 'master'];

const emptyBoard = (): Player[] => Array(9).fill(null);

const TicTacToe = () => {
  const _lifecycle = useFeatureLifecycle('game.tic-tac-toe');
  const { language } = useGameLanguage();
  const copy = useMemo(() => getTicTacToeCopy(language), [language]);

  const [board, setBoard] = useState<Player[]>(emptyBoard);
  const [isPlayerTurn, setIsPlayerTurn] = useState(true);
  const [gameStatus, setGameStatus] = useState<GameStatus>('playing');
  const [difficulty, setDifficulty] = useState<Difficulty>('hard');
  const [playerFirst, setPlayerFirst] = useState(true);
  const [showDifficultySelect, setShowDifficultySelect] = useState(true);
  const [showInfo, setShowInfo] = useState(false);
  const [stats, setStats] = useState<GameStats>({ wins: 0, losses: 0, draws: 0 });
  const [winningLine, setWinningLine] = useState<number[] | null>(null);
  const [lastMove, setLastMove] = useState<number | null>(null);

  const difficultyOptions: DifficultyOption[] = useMemo(
    () =>
      DIFFICULTY_ORDER.map(value => ({
        value,
        label: copy.difficulties[value].label,
        description: copy.difficulties[value].description
      })),
    [copy]
  );

  const settle = useCallback((newBoard: Player[], mover: Player): boolean => {
    const { winner, line } = checkWinner(newBoard);
    if (winner === PLAYER) {
      setGameStatus('win');
      setWinningLine(line);
      setStats(prev => ({ ...prev, wins: prev.wins + 1 }));
      return true;
    }
    if (winner === AI) {
      setGameStatus('lose');
      setWinningLine(line);
      setStats(prev => ({ ...prev, losses: prev.losses + 1 }));
      return true;
    }
    if (isBoardFull(newBoard)) {
      setGameStatus('draw');
      setStats(prev => ({ ...prev, draws: prev.draws + 1 }));
      return true;
    }
    setIsPlayerTurn(mover === AI);
    return false;
  }, []);

  const handleCellClick = (index: number) => {
    if (!isPlayerTurn || board[index] !== null || gameStatus !== 'playing') return;
    const newBoard = [...board];
    newBoard[index] = PLAYER;
    setBoard(newBoard);
    setLastMove(index);
    settle(newBoard, PLAYER);
  };

  // AI move
  useEffect(() => {
    if (isPlayerTurn || gameStatus !== 'playing') return;
    const timer = setTimeout(() => {
      const move = getBestMove([...board], difficulty);
      if (move === -1) return;
      const newBoard = [...board];
      newBoard[move] = AI;
      setBoard(newBoard);
      setLastMove(move);
      settle(newBoard, AI);
    }, 450);
    return () => clearTimeout(timer);
  }, [isPlayerTurn, gameStatus, board, difficulty, settle]);

  const resetGame = useCallback(() => {
    setBoard(emptyBoard());
    setGameStatus('playing');
    setWinningLine(null);
    setLastMove(null);
    setIsPlayerTurn(playerFirst);
  }, [playerFirst]);

  const startGame = () => {
    setShowDifficultySelect(false);
    resetGame();
  };

  const backToMenu = () => {
    setShowDifficultySelect(true);
    resetGame();
  };

  const statusText = () => {
    switch (gameStatus) {
      case 'win':
        return { cls: styles.turnWin, title: copy.youWin, sub: copy.youWinSub };
      case 'lose':
        return { cls: styles.turnLose, title: copy.aiWins, sub: copy.aiWinsSub };
      case 'draw':
        return { cls: styles.turnDraw, title: copy.draw, sub: copy.drawSub };
      default:
        return {
          cls: styles.turnPlaying,
          title: isPlayerTurn ? copy.yourTurn : copy.aiThinking,
          sub: `${copy.youAre} · ${copy.aiIs}`
        };
    }
  };

  const status = statusText();

  const firstMoveToggle = (
    <div className={styles.firstMove}>
      <span className={styles.firstMoveLabel}>{copy.firstMove}</span>
      <div className={styles.toggleRow} role="group" aria-label={copy.firstMove}>
        <button
          type="button"
          className={styles.toggle}
          data-active={playerFirst ? 'true' : 'false'}
          aria-pressed={playerFirst}
          onClick={() => setPlayerFirst(true)}
        >
          {copy.youFirst}
        </button>
        <button
          type="button"
          className={styles.toggle}
          data-active={!playerFirst ? 'true' : 'false'}
          aria-pressed={!playerFirst}
          onClick={() => setPlayerFirst(false)}
        >
          {copy.aiFirst}
        </button>
      </div>
    </div>
  );

  return (
    <div className={styles.page}>
      <GameTopBar stats={stats} onInfoClick={() => setShowInfo(true)} />

      {showDifficultySelect ? (
        <DifficultySelector
          title={copy.title}
          subtitle={copy.subtitle}
          icon={
            <>
              <span aria-hidden style={{ fontSize: '3rem' }}>⭕</span>
              <span aria-hidden style={{ fontSize: '3rem' }}>❌</span>
            </>
          }
          selectedDifficulty={difficulty}
          onSelectDifficulty={setDifficulty}
          options={difficultyOptions}
          onStart={startGame}
          difficultyTitle={copy.selectDifficulty}
          startLabel={copy.start}
          extraContent={firstMoveToggle}
        />
      ) : (
        <div className={styles.panel}>
          <div className={styles.status} aria-live="polite">
            <p className={`${styles.statusTitle} ${status.cls}`}>
              {gameStatus === 'playing' && (
                <span className={styles.turnDot} style={{ background: 'currentColor' }} aria-hidden />
              )}
              {status.title}
            </p>
            <p className={styles.statusSub}>{status.sub}</p>
          </div>

          <div className={styles.board} role="grid" aria-label={copy.title}>
            {board.map((cell, index) => {
              const isWin = winningLine?.includes(index);
              const playable = isPlayerTurn && cell === null && gameStatus === 'playing';
              const label =
                cell === 'X' ? copy.youAre : cell === 'O' ? copy.aiIs : `${copy.yourTurn} ${index + 1}`;
              return (
                <button
                  key={index}
                  type="button"
                  role="gridcell"
                  onClick={() => handleCellClick(index)}
                  disabled={!playable}
                  aria-label={label}
                  className={[
                    styles.cell,
                    playable ? styles.playable : '',
                    isWin ? styles.win : ''
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  {cell && (
                    <span
                      className={`${cell === 'X' ? styles.markX : styles.markO} ${
                        isWin ? styles.winMark : index === lastMove ? styles.mark : ''
                      }`}
                    >
                      {cell === 'X' ? '✕' : '○'}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className={styles.actions}>
            <button type="button" onClick={resetGame} className={`${styles.btn} ${styles.btnPrimary}`}>
              <RotateCcw className={styles.icon} aria-hidden />
              {copy.playAgain}
            </button>
            <button type="button" onClick={backToMenu} className={`${styles.btn} ${styles.btnSecondary}`}>
              {copy.changeDifficulty}
            </button>
          </div>
        </div>
      )}

      <InfoModal isOpen={showInfo} onClose={() => setShowInfo(false)} title={copy.howToPlay}>
        <div className={styles.infoCards}>
          <div className={styles.infoCard}>
            <h3 className={styles.infoHeading}>🎯 {copy.objectiveTitle}</h3>
            <p className={styles.infoBody}>{copy.objectiveBody}</p>
          </div>
          <div className={styles.infoCard}>
            <h3 className={styles.infoHeading}>💡 {copy.tipsTitle}</h3>
            <ul className={styles.infoList}>
              {copy.tips.map((tip, i) => (
                <li key={i}>{tip}</li>
              ))}
            </ul>
          </div>
        </div>
      </InfoModal>
    </div>
  );
};

export default TicTacToe;
