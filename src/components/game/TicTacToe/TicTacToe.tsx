/**
 * TicTacToe game component - refactored with common components
 */

'use client';

import { useFeatureLifecycle } from '@/hooks/useActivityTracker';
import { RotateCcw } from 'lucide-react';
import { useEffect,useState } from 'react';
import { Difficulty,DifficultySelector,GameStats,GameStatus,GameTopBar,InfoModal } from '../common';
import { checkWinner,getBestMove,isBoardFull } from './TicTacToeAI';
import { AI,Player,PLAYER } from './types';

const DIFFICULTY_OPTIONS = [
  { value: 'easy' as Difficulty, label: 'Easy', description: 'AI makes random moves' },
  { value: 'medium' as Difficulty, label: 'Medium', description: 'AI plays strategically sometimes' },
  { value: 'hard' as Difficulty, label: 'Hard', description: 'Unbeatable AI - good luck!' }
];

const TicTacToe = () => {
  const _lifecycle = useFeatureLifecycle('game.tic-tac-toe');
  const [board, setBoard] = useState<Player[]>(Array(9).fill(null));
  const [isPlayerTurn, setIsPlayerTurn] = useState(true);
  const [gameStatus, setGameStatus] = useState<GameStatus>('playing');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [showDifficultySelect, setShowDifficultySelect] = useState(true);
  const [showInfo, setShowInfo] = useState(false);
  const [stats, setStats] = useState<GameStats>({ wins: 0, losses: 0, draws: 0 });
  const [winningLine, setWinningLine] = useState<number[] | null>(null);

  // Handle player move
  const handleCellClick = (index: number) => {
    if (!isPlayerTurn || board[index] !== null || gameStatus !== 'playing') {
      return;
    }

    const newBoard = [...board];
    newBoard[index] = PLAYER;
    setBoard(newBoard);

    const { winner, line } = checkWinner(newBoard);
    if (winner === PLAYER) {
      setGameStatus('win');
      setWinningLine(line);
      setStats(prev => ({ ...prev, wins: prev.wins + 1 }));
      return;
    }

    if (isBoardFull(newBoard)) {
      setGameStatus('draw');
      setStats(prev => ({ ...prev, draws: prev.draws + 1 }));
      return;
    }

    setIsPlayerTurn(false);
  };

  // AI move
  useEffect(() => {
    if (!isPlayerTurn && gameStatus === 'playing') {
      const timer = setTimeout(() => {
        const move = getBestMove([...board], difficulty);
        if (move !== -1) {
          const newBoard = [...board];
          newBoard[move] = AI;
          setBoard(newBoard);

          const { winner, line } = checkWinner(newBoard);
          if (winner === AI) {
            setGameStatus('lose');
            setWinningLine(line);
            setStats(prev => ({ ...prev, losses: prev.losses + 1 }));
            return;
          }

          if (isBoardFull(newBoard)) {
            setGameStatus('draw');
            setStats(prev => ({ ...prev, draws: prev.draws + 1 }));
            return;
          }

          setIsPlayerTurn(true);
        }
      }, 500);

      return () => clearTimeout(timer);
    }
  }, [isPlayerTurn, gameStatus, board, difficulty]);

  const resetGame = () => {
    setBoard(Array(9).fill(null));
    setIsPlayerTurn(true);
    setGameStatus('playing');
    setWinningLine(null);
  };

  const startGame = () => {
    setShowDifficultySelect(false);
    resetGame();
  };

  const backToMenu = () => {
    setShowDifficultySelect(true);
    resetGame();
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(to bottom, #111827, #000)',
      overflow: 'hidden',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      <GameTopBar stats={stats} onInfoClick={() => setShowInfo(true)} />

      <div style={{ position: 'relative' }}>
        {showDifficultySelect ? (
          <DifficultySelector
            title="Tic Tac Toe"
            subtitle="Challenge the AI and test your strategy!"
            icon={<><span style={{ fontSize: '3rem' }}>⭕</span><span style={{ fontSize: '3rem' }}>❌</span></>}
            selectedDifficulty={difficulty}
            onSelectDifficulty={setDifficulty}
            options={DIFFICULTY_OPTIONS}
            onStart={startGame}
          />
        ) : (
          <div style={{
            background: 'rgba(0, 0, 0, 0.95)',
            border: '3px solid #0ea5e9',
            borderRadius: '1rem',
            padding: '2rem',
            boxShadow: '0 0 50px rgba(14, 165, 233, 0.3)'
          }}>
            {/* Status */}
            <div style={{ textAlign: 'center', marginBottom: '1.5rem', minHeight: '4rem' }}>
              {gameStatus === 'playing' && (
                <div>
                  <div style={{ color: '#0ea5e9', fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
                    {isPlayerTurn ? "Your Turn" : "AI Thinking..."}
                  </div>
                  <div style={{ color: '#9ca3af', fontSize: '0.875rem' }}>
                    You are X · AI is O
                  </div>
                </div>
              )}
              {gameStatus === 'win' && (
                <div>
                  <div style={{ color: '#22c55e', fontSize: '2rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
                    🎉 You Win!
                  </div>
                  <div style={{ color: '#9ca3af', fontSize: '0.875rem' }}>Great strategy!</div>
                </div>
              )}
              {gameStatus === 'lose' && (
                <div>
                  <div style={{ color: '#ef4444', fontSize: '2rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
                    AI Wins
                  </div>
                  <div style={{ color: '#9ca3af', fontSize: '0.875rem' }}>Try again!</div>
                </div>
              )}
              {gameStatus === 'draw' && (
                <div>
                  <div style={{ color: '#eab308', fontSize: '2rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
                    It&apos;s a Draw!
                  </div>
                  <div style={{ color: '#9ca3af', fontSize: '0.875rem' }}>Well played!</div>
                </div>
              )}
            </div>

            {/* Board */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 120px)',
              gap: '0.5rem',
              marginBottom: '1.5rem'
            }}>
              {board.map((cell, index) => {
                const isWinningCell = winningLine?.includes(index);
                return (
                  <button
                    key={index}
                    onClick={() => handleCellClick(index)}
                    disabled={!isPlayerTurn || cell !== null || gameStatus !== 'playing'}
                    style={{
                      width: '120px',
                      height: '120px',
                      background: isWinningCell ? 'rgba(14, 165, 233, 0.3)' : 'rgba(31, 41, 55, 0.8)',
                      border: isWinningCell ? '3px solid #0ea5e9' : '2px solid rgba(75, 85, 99, 1)',
                      borderRadius: '0.5rem',
                      cursor: (isPlayerTurn && cell === null && gameStatus === 'playing') ? 'pointer' : 'default',
                      transition: 'all 0.2s',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '4rem',
                      fontWeight: 'bold'
                    }}
                    onMouseEnter={(e) => {
                      if (isPlayerTurn && cell === null && gameStatus === 'playing') {
                        e.currentTarget.style.background = 'rgba(14, 165, 233, 0.2)';
                        e.currentTarget.style.borderColor = '#0ea5e9';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isWinningCell) {
                        e.currentTarget.style.background = 'rgba(31, 41, 55, 0.8)';
                        e.currentTarget.style.borderColor = 'rgba(75, 85, 99, 1)';
                      }
                    }}
                  >
                    {cell === 'X' && <span style={{ color: '#0ea5e9' }}>✕</span>}
                    {cell === 'O' && <span style={{ color: '#ef4444' }}>○</span>}
                  </button>
                );
              })}
            </div>

            {/* Buttons */}
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button
                onClick={resetGame}
                style={{
                  flex: 1,
                  background: '#0ea5e9',
                  border: 'none',
                  borderRadius: '0.5rem',
                  color: '#fff',
                  fontSize: '1rem',
                  fontWeight: '600',
                  padding: '0.75rem 2rem',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#0284c7';
                  e.currentTarget.style.transform = 'scale(1.05)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#0ea5e9';
                  e.currentTarget.style.transform = 'scale(1)';
                }}
              >
                <RotateCcw style={{ width: '1.25rem', height: '1.25rem' }} />
                Play Again
              </button>

              <button
                onClick={backToMenu}
                style={{
                  flex: 1,
                  background: 'rgba(75, 85, 99, 0.8)',
                  border: '1px solid rgba(107, 114, 128, 1)',
                  borderRadius: '0.5rem',
                  color: '#fff',
                  fontSize: '1rem',
                  fontWeight: '600',
                  padding: '0.75rem 2rem',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(107, 114, 128, 0.8)';
                  e.currentTarget.style.transform = 'scale(1.05)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(75, 85, 99, 0.8)';
                  e.currentTarget.style.transform = 'scale(1)';
                }}
              >
                Change Difficulty
              </button>
            </div>
          </div>
        )}
      </div>

      <InfoModal isOpen={showInfo} onClose={() => setShowInfo(false)} title="How to Play">
        <div style={{ display: 'grid', gap: '1rem', marginBottom: '1.5rem' }}>
          <div style={{
            background: 'rgba(14, 165, 233, 0.1)',
            border: '1px solid rgba(14, 165, 233, 0.3)',
            borderRadius: '0.5rem',
            padding: '1rem'
          }}>
            <div style={{ color: '#0ea5e9', fontSize: '2rem', marginBottom: '0.5rem' }}>🎯</div>
            <h3 style={{ color: '#fff', fontWeight: '600', marginBottom: '0.25rem' }}>Objective</h3>
            <p style={{ color: '#9ca3af', fontSize: '0.875rem' }}>
              Get three of your marks (X) in a row - horizontally, vertically, or diagonally - before the AI does!
            </p>
          </div>

          <div style={{
            background: 'rgba(14, 165, 233, 0.1)',
            border: '1px solid rgba(14, 165, 233, 0.3)',
            borderRadius: '0.5rem',
            padding: '1rem'
          }}>
            <div style={{ color: '#0ea5e9', fontWeight: '600', marginBottom: '0.5rem' }}>💡 Pro Tips</div>
            <ul style={{ color: '#d1d5db', fontSize: '0.875rem', paddingLeft: '1.5rem', margin: 0 }}>
              <li>Start in the center or corners for best strategy</li>
              <li>Always block the opponent when they have two in a row</li>
              <li>Create &quot;forks&quot; - positions where you can win in two ways</li>
              <li>On Hard mode, the AI never makes mistakes!</li>
            </ul>
          </div>
        </div>
      </InfoModal>
    </div>
  );
};

export default TicTacToe;
