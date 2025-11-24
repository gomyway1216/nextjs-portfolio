/**
 * Gomoku game component - refactored with common components
 */

'use client';

import { useState, useEffect, useRef } from 'react';
import { RotateCcw } from 'lucide-react';
import { GameTopBar, DifficultySelector, InfoModal, Difficulty, GameStatus, GameStats } from '../common';
import { Player, Position, BOARD_SIZE, PLAYER, AI } from './types';
import { checkWinFromPosition, isBoardFull, getBestMove } from './GomokuAI';

const DIFFICULTY_OPTIONS = [
  { value: 'easy' as Difficulty, label: 'Easy', description: 'AI searches 2 moves ahead' },
  { value: 'medium' as Difficulty, label: 'Medium', description: 'AI searches 3 moves ahead - good challenge!' },
  { value: 'hard' as Difficulty, label: 'Hard', description: 'AI searches 4 moves ahead - expert level!' }
];

const Gomoku = () => {
  const [board, setBoard] = useState<Player[][]>(
    Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null))
  );
  const [isPlayerTurn, setIsPlayerTurn] = useState(true);
  const [gameStatus, setGameStatus] = useState<GameStatus>('playing');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [showDifficultySelect, setShowDifficultySelect] = useState(true);
  const [showInfo, setShowInfo] = useState(false);
  const [stats, setStats] = useState<GameStats>({ wins: 0, losses: 0, draws: 0 });
  const [winningLine, setWinningLine] = useState<Position[] | null>(null);
  const [lastMove, setLastMove] = useState<Position | null>(null);
  const [isAIThinking, setIsAIThinking] = useState(false);
  const aiWorkerRef = useRef<boolean>(false);

  // Handle player move
  const handleCellClick = (row: number, col: number) => {
    if (!isPlayerTurn || board[row][col] !== null || gameStatus !== 'playing' || isAIThinking) {
      return;
    }

    const newBoard = board.map(r => [...r]);
    newBoard[row][col] = PLAYER;
    setBoard(newBoard);
    setLastMove({ row, col });

    const winLine = checkWinFromPosition(newBoard, row, col, PLAYER);
    if (winLine) {
      setGameStatus('win');
      setWinningLine(winLine);
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
    if (!isPlayerTurn && gameStatus === 'playing' && !aiWorkerRef.current) {
      aiWorkerRef.current = true;
      setIsAIThinking(true);

      setTimeout(() => {
        const boardCopy = board.map(r => [...r]);
        const move = getBestMove(boardCopy, difficulty);

        if (move) {
          const newBoard = board.map(r => [...r]);
          newBoard[move.row][move.col] = AI;
          setBoard(newBoard);
          setLastMove(move);

          const winLine = checkWinFromPosition(newBoard, move.row, move.col, AI);
          if (winLine) {
            setGameStatus('lose');
            setWinningLine(winLine);
            setStats(prev => ({ ...prev, losses: prev.losses + 1 }));
          } else if (isBoardFull(newBoard)) {
            setGameStatus('draw');
            setStats(prev => ({ ...prev, draws: prev.draws + 1 }));
          } else {
            setIsPlayerTurn(true);
          }
        }

        setIsAIThinking(false);
        aiWorkerRef.current = false;
      }, 300);
    }
  }, [isPlayerTurn, gameStatus, board, difficulty]);

  const resetGame = () => {
    setBoard(Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null)));
    setIsPlayerTurn(true);
    setGameStatus('playing');
    setWinningLine(null);
    setLastMove(null);
    setIsAIThinking(false);
    aiWorkerRef.current = false;
  };

  const startGame = () => {
    setShowDifficultySelect(false);
    resetGame();
  };

  const backToMenu = () => {
    setShowDifficultySelect(true);
    resetGame();
  };

  const isWinningCell = (row: number, col: number): boolean => {
    return winningLine?.some(pos => pos.row === row && pos.col === col) ?? false;
  };

  const isLastMoveCell = (row: number, col: number): boolean => {
    return lastMove?.row === row && lastMove?.col === col;
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
      overflow: 'auto',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      padding: '1rem'
    }}>
      <GameTopBar stats={stats} onInfoClick={() => setShowInfo(true)} />

      <div style={{ marginTop: '5rem', marginBottom: '2rem' }}>
        {showDifficultySelect ? (
          <DifficultySelector
            title="Gomoku"
            subtitle="Five in a Row - Challenge the AI!"
            icon={<><span style={{ fontSize: '3rem' }}>⚫</span><span style={{ fontSize: '3rem' }}>⚪</span></>}
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
            <div style={{
              textAlign: 'center',
              marginBottom: '1.5rem',
              minHeight: '4rem'
            }}>
              {gameStatus === 'playing' && (
                <div>
                  <div style={{
                    color: '#0ea5e9',
                    fontSize: '1.5rem',
                    fontWeight: 'bold',
                    marginBottom: '0.5rem'
                  }}>
                    {isAIThinking ? "AI Thinking..." : isPlayerTurn ? "Your Turn" : "AI's Turn"}
                  </div>
                  <div style={{ color: '#9ca3af', fontSize: '0.875rem' }}>
                    You are Black ⚫ · AI is White ⚪
                  </div>
                </div>
              )}
              {gameStatus === 'win' && (
                <div>
                  <div style={{ color: '#22c55e', fontSize: '2rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
                    🎉 You Win!
                  </div>
                  <div style={{ color: '#9ca3af', fontSize: '0.875rem' }}>
                    Excellent strategy!
                  </div>
                </div>
              )}
              {gameStatus === 'lose' && (
                <div>
                  <div style={{ color: '#ef4444', fontSize: '2rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
                    AI Wins
                  </div>
                  <div style={{ color: '#9ca3af', fontSize: '0.875rem' }}>
                    Good game! Try again?
                  </div>
                </div>
              )}
              {gameStatus === 'draw' && (
                <div>
                  <div style={{ color: '#eab308', fontSize: '2rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
                    It's a Draw!
                  </div>
                  <div style={{ color: '#9ca3af', fontSize: '0.875rem' }}>
                    The board is full!
                  </div>
                </div>
              )}
            </div>

            {/* Board */}
            <div style={{
              display: 'inline-block',
              background: '#d4a574',
              padding: '2rem',
              borderRadius: '0.5rem',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
              position: 'relative'
            }}>
              <div style={{
                position: 'relative',
                width: `${(BOARD_SIZE - 1) * 30}px`,
                height: `${(BOARD_SIZE - 1) * 30}px`
              }}>
                {/* Grid lines */}
                <svg
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    pointerEvents: 'none'
                  }}
                  width={(BOARD_SIZE - 1) * 30}
                  height={(BOARD_SIZE - 1) * 30}
                >
                  {/* Horizontal lines */}
                  {Array.from({ length: BOARD_SIZE }).map((_, i) => (
                    <line
                      key={`h-${i}`}
                      x1={0}
                      y1={i * 30}
                      x2={(BOARD_SIZE - 1) * 30}
                      y2={i * 30}
                      stroke="#8B4513"
                      strokeWidth="1.5"
                    />
                  ))}
                  {/* Vertical lines */}
                  {Array.from({ length: BOARD_SIZE }).map((_, i) => (
                    <line
                      key={`v-${i}`}
                      x1={i * 30}
                      y1={0}
                      x2={i * 30}
                      y2={(BOARD_SIZE - 1) * 30}
                      stroke="#8B4513"
                      strokeWidth="1.5"
                    />
                  ))}
                  {/* Star points */}
                  {[3, 7, 11].map(row =>
                    [3, 7, 11].map(col => (
                      <circle
                        key={`star-${row}-${col}`}
                        cx={col * 30}
                        cy={row * 30}
                        r="3"
                        fill="#8B4513"
                      />
                    ))
                  )}
                </svg>

                {/* Intersection points */}
                {board.map((row, rowIndex) =>
                  row.map((cell, colIndex) => (
                    <button
                      key={`${rowIndex}-${colIndex}`}
                      onClick={() => handleCellClick(rowIndex, colIndex)}
                      disabled={!isPlayerTurn || cell !== null || gameStatus !== 'playing' || isAIThinking}
                      style={{
                        position: 'absolute',
                        left: `${colIndex * 30 - 15}px`,
                        top: `${rowIndex * 30 - 15}px`,
                        width: '30px',
                        height: '30px',
                        background: 'transparent',
                        border: 'none',
                        cursor: (isPlayerTurn && cell === null && gameStatus === 'playing' && !isAIThinking) ? 'pointer' : 'default',
                        padding: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: cell ? 2 : 1
                      }}
                      onMouseEnter={(e) => {
                        if (isPlayerTurn && cell === null && gameStatus === 'playing' && !isAIThinking) {
                          e.currentTarget.style.background = 'rgba(14, 165, 233, 0.3)';
                          e.currentTarget.style.borderRadius = '50%';
                        }
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      {cell === 'black' && (
                        <div style={{
                          width: '24px',
                          height: '24px',
                          borderRadius: '50%',
                          background: 'radial-gradient(circle at 30% 30%, #333, #000)',
                          boxShadow: isLastMoveCell(rowIndex, colIndex)
                            ? '0 0 0 3px #0ea5e9'
                            : isWinningCell(rowIndex, colIndex)
                            ? '0 0 0 3px #22c55e'
                            : '0 2px 4px rgba(0,0,0,0.5)',
                          pointerEvents: 'none'
                        }} />
                      )}
                      {cell === 'white' && (
                        <div style={{
                          width: '24px',
                          height: '24px',
                          borderRadius: '50%',
                          background: 'radial-gradient(circle at 30% 30%, #fff, #ddd)',
                          boxShadow: isLastMoveCell(rowIndex, colIndex)
                            ? '0 0 0 3px #0ea5e9'
                            : isWinningCell(rowIndex, colIndex)
                            ? '0 0 0 3px #22c55e'
                            : '0 2px 4px rgba(0,0,0,0.5)',
                          pointerEvents: 'none'
                        }} />
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* Buttons */}
            <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
              <button
                onClick={resetGame}
                disabled={isAIThinking}
                style={{
                  flex: 1,
                  background: isAIThinking ? 'rgba(75, 85, 99, 0.5)' : '#0ea5e9',
                  border: 'none',
                  borderRadius: '0.5rem',
                  color: '#fff',
                  fontSize: '1rem',
                  fontWeight: '600',
                  padding: '0.75rem 2rem',
                  cursor: isAIThinking ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  opacity: isAIThinking ? 0.5 : 1
                }}
                onMouseEnter={(e) => {
                  if (!isAIThinking) {
                    e.currentTarget.style.background = '#0284c7';
                    e.currentTarget.style.transform = 'scale(1.05)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isAIThinking) {
                    e.currentTarget.style.background = '#0ea5e9';
                    e.currentTarget.style.transform = 'scale(1)';
                  }
                }}
              >
                <RotateCcw style={{ width: '1.25rem', height: '1.25rem' }} />
                New Game
              </button>

              <button
                onClick={backToMenu}
                disabled={isAIThinking}
                style={{
                  flex: 1,
                  background: isAIThinking ? 'rgba(55, 65, 81, 0.5)' : 'rgba(75, 85, 99, 0.8)',
                  border: '1px solid rgba(107, 114, 128, 1)',
                  borderRadius: '0.5rem',
                  color: '#fff',
                  fontSize: '1rem',
                  fontWeight: '600',
                  padding: '0.75rem 2rem',
                  cursor: isAIThinking ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s',
                  opacity: isAIThinking ? 0.5 : 1
                }}
                onMouseEnter={(e) => {
                  if (!isAIThinking) {
                    e.currentTarget.style.background = 'rgba(107, 114, 128, 0.8)';
                    e.currentTarget.style.transform = 'scale(1.05)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isAIThinking) {
                    e.currentTarget.style.background = 'rgba(75, 85, 99, 0.8)';
                    e.currentTarget.style.transform = 'scale(1)';
                  }
                }}
              >
                Change Difficulty
              </button>
            </div>
          </div>
        )}
      </div>

      <InfoModal
        isOpen={showInfo}
        onClose={() => setShowInfo(false)}
        title="How to Play Gomoku"
      >
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
              Get exactly five of your stones (black) in a row - horizontally, vertically, or diagonally - before the AI does!
            </p>
          </div>

          <div style={{
            background: 'rgba(14, 165, 233, 0.1)',
            border: '1px solid rgba(14, 165, 233, 0.3)',
            borderRadius: '0.5rem',
            padding: '1rem'
          }}>
            <div style={{ color: '#0ea5e9', fontSize: '2rem', marginBottom: '0.5rem' }}>🖱️</div>
            <h3 style={{ color: '#fff', fontWeight: '600', marginBottom: '0.25rem' }}>How to Play</h3>
            <p style={{ color: '#9ca3af', fontSize: '0.875rem' }}>
              Click on any intersection to place your black stone. The AI will automatically place its white stone. The last placed stone is highlighted with a blue ring.
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
              <li>Opening in the center gives you more options</li>
              <li>Create "threats" - positions where you have multiple ways to win</li>
              <li>Always block opponent's four in a row!</li>
              <li>Try to create open threes (three in a row with open ends)</li>
              <li>Control the center of the board for better positioning</li>
            </ul>
          </div>
        </div>
      </InfoModal>
    </div>
  );
};

export default Gomoku;
