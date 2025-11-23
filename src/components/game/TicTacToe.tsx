'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Info, X as XIcon, Circle, RotateCcw, Trophy } from 'lucide-react';

type Player = 'X' | 'O' | null;
type Difficulty = 'easy' | 'medium' | 'hard';
type GameStatus = 'playing' | 'win' | 'lose' | 'draw';

interface GameStats {
  wins: number;
  losses: number;
  draws: number;
}

const TicTacToe = () => {
  const [board, setBoard] = useState<Player[]>(Array(9).fill(null));
  const [isPlayerTurn, setIsPlayerTurn] = useState(true);
  const [gameStatus, setGameStatus] = useState<GameStatus>('playing');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [showDifficultySelect, setShowDifficultySelect] = useState(true);
  const [showInfo, setShowInfo] = useState(false);
  const [stats, setStats] = useState<GameStats>({ wins: 0, losses: 0, draws: 0 });
  const [winningLine, setWinningLine] = useState<number[] | null>(null);

  const PLAYER = 'X';
  const AI = 'O';

  // Check for winner
  const checkWinner = (board: Player[]): { winner: Player; line: number[] | null } => {
    const lines = [
      [0, 1, 2], [3, 4, 5], [6, 7, 8], // Rows
      [0, 3, 6], [1, 4, 7], [2, 5, 8], // Columns
      [0, 4, 8], [2, 4, 6] // Diagonals
    ];

    for (const line of lines) {
      const [a, b, c] = line;
      if (board[a] && board[a] === board[b] && board[a] === board[c]) {
        return { winner: board[a], line };
      }
    }

    return { winner: null, line: null };
  };

  // Check if board is full
  const isBoardFull = (board: Player[]): boolean => {
    return board.every(cell => cell !== null);
  };

  // Minimax algorithm for hard AI
  const minimax = (board: Player[], isMaximizing: boolean, depth: number): number => {
    const { winner } = checkWinner(board);

    if (winner === AI) return 10 - depth;
    if (winner === PLAYER) return depth - 10;
    if (isBoardFull(board)) return 0;

    if (isMaximizing) {
      let bestScore = -Infinity;
      for (let i = 0; i < 9; i++) {
        if (board[i] === null) {
          board[i] = AI;
          const score = minimax(board, false, depth + 1);
          board[i] = null;
          bestScore = Math.max(score, bestScore);
        }
      }
      return bestScore;
    } else {
      let bestScore = Infinity;
      for (let i = 0; i < 9; i++) {
        if (board[i] === null) {
          board[i] = PLAYER;
          const score = minimax(board, true, depth + 1);
          board[i] = null;
          bestScore = Math.min(score, bestScore);
        }
      }
      return bestScore;
    }
  };

  // Get best move for AI
  const getBestMove = (board: Player[], difficulty: Difficulty): number => {
    const emptyCells = board.map((cell, i) => cell === null ? i : null).filter(i => i !== null) as number[];

    if (emptyCells.length === 0) return -1;

    // Easy: Random move
    if (difficulty === 'easy') {
      return emptyCells[Math.floor(Math.random() * emptyCells.length)];
    }

    // Medium: 50% best move, 50% random
    if (difficulty === 'medium') {
      if (Math.random() < 0.5) {
        return emptyCells[Math.floor(Math.random() * emptyCells.length)];
      }
    }

    // Hard or Medium (50% of the time): Use minimax
    let bestScore = -Infinity;
    let bestMove = emptyCells[0];

    for (const i of emptyCells) {
      board[i] = AI;
      const score = minimax(board, false, 0);
      board[i] = null;
      if (score > bestScore) {
        bestScore = score;
        bestMove = i;
      }
    }

    return bestMove;
  };

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
      }, 500); // AI thinks for 500ms

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

  const getDifficultyColor = (diff: Difficulty) => {
    switch (diff) {
      case 'easy':
        return { bg: 'rgba(34, 197, 94, 0.2)', border: '#22c55e', text: '#22c55e' };
      case 'medium':
        return { bg: 'rgba(234, 179, 8, 0.2)', border: '#eab308', text: '#eab308' };
      case 'hard':
        return { bg: 'rgba(239, 68, 68, 0.2)', border: '#ef4444', text: '#ef4444' };
    }
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
      {/* Top Bar */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '1rem',
        background: 'rgba(0, 0, 0, 0.8)',
        backdropFilter: 'blur(10px)',
        borderBottom: '1px solid rgba(14, 165, 233, 0.3)',
        zIndex: 10
      }}>
        <Link
          href="/games"
          style={{
            color: '#94a3b8',
            textDecoration: 'none',
            fontSize: '0.875rem',
            fontWeight: '500',
            transition: 'color 0.2s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.color = '#0ea5e9'}
          onMouseLeave={(e) => e.currentTarget.style.color = '#94a3b8'}
        >
          ← Back to Games
        </Link>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {/* Stats */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            background: 'rgba(14, 165, 233, 0.1)',
            border: '1px solid rgba(14, 165, 233, 0.3)',
            borderRadius: '0.5rem',
            padding: '0.5rem 1rem'
          }}>
            <Trophy style={{ width: '1.25rem', height: '1.25rem', color: '#0ea5e9' }} />
            <div>
              <div style={{ fontSize: '0.625rem', color: '#94a3b8', textTransform: 'uppercase' }}>Record</div>
              <div style={{ fontSize: '1rem', fontWeight: 'bold', color: '#0ea5e9' }}>
                {stats.wins}W - {stats.losses}L - {stats.draws}D
              </div>
            </div>
          </div>
        </div>

        <button
          onClick={() => setShowInfo(!showInfo)}
          style={{
            background: 'rgba(14, 165, 233, 0.2)',
            border: '1px solid rgba(14, 165, 233, 0.5)',
            borderRadius: '0.5rem',
            color: '#0ea5e9',
            padding: '0.5rem 1rem',
            fontSize: '0.875rem',
            fontWeight: '500',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(14, 165, 233, 0.3)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(14, 165, 233, 0.2)'}
        >
          <Info style={{ width: '1rem', height: '1rem' }} />
          How to Play
        </button>
      </div>

      {/* Game Board */}
      <div style={{ position: 'relative' }}>
        {/* Difficulty Selection */}
        {showDifficultySelect ? (
          <div style={{
            background: 'rgba(0, 0, 0, 0.95)',
            border: '3px solid #0ea5e9',
            borderRadius: '1rem',
            padding: '3rem',
            boxShadow: '0 0 50px rgba(14, 165, 233, 0.3)',
            minWidth: '500px'
          }}>
            <h1 style={{
              color: '#fff',
              fontSize: '2.5rem',
              fontWeight: 'bold',
              marginBottom: '1rem',
              textAlign: 'center',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '1rem'
            }}>
              <span style={{ fontSize: '3rem' }}>⭕</span>
              Tic Tac Toe
              <span style={{ fontSize: '3rem' }}>❌</span>
            </h1>

            <p style={{
              color: '#9ca3af',
              textAlign: 'center',
              marginBottom: '2rem'
            }}>
              Challenge the AI and test your strategy!
            </p>

            <h2 style={{
              color: '#fff',
              fontSize: '1.5rem',
              fontWeight: 'bold',
              marginBottom: '1rem',
              textAlign: 'center'
            }}>
              Select Difficulty
            </h2>

            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
              marginBottom: '2rem'
            }}>
              {(['easy', 'medium', 'hard'] as Difficulty[]).map((diff) => {
                const colors = getDifficultyColor(diff);
                const isSelected = difficulty === diff;

                return (
                  <button
                    key={diff}
                    onClick={() => setDifficulty(diff)}
                    style={{
                      background: isSelected ? colors.bg : 'rgba(31, 41, 55, 0.5)',
                      border: `2px solid ${isSelected ? colors.border : 'rgba(75, 85, 99, 1)'}`,
                      borderRadius: '0.5rem',
                      color: isSelected ? colors.text : '#9ca3af',
                      padding: '1rem',
                      fontSize: '1.125rem',
                      fontWeight: '600',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      textTransform: 'uppercase'
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.background = 'rgba(55, 65, 81, 0.7)';
                        e.currentTarget.style.borderColor = colors.border;
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.background = 'rgba(31, 41, 55, 0.5)';
                        e.currentTarget.style.borderColor = 'rgba(75, 85, 99, 1)';
                      }
                    }}
                  >
                    {diff}
                    <div style={{ fontSize: '0.75rem', marginTop: '0.25rem', opacity: 0.8 }}>
                      {diff === 'easy' && 'AI makes random moves'}
                      {diff === 'medium' && 'AI plays strategically sometimes'}
                      {diff === 'hard' && 'Unbeatable AI - good luck!'}
                    </div>
                  </button>
                );
              })}
            </div>

            <button
              onClick={startGame}
              style={{
                background: '#0ea5e9',
                border: 'none',
                borderRadius: '0.5rem',
                color: '#fff',
                fontSize: '1.5rem',
                fontWeight: 'bold',
                padding: '1.5rem 3rem',
                cursor: 'pointer',
                transition: 'all 0.2s',
                boxShadow: '0 10px 40px rgba(14, 165, 233, 0.5)',
                width: '100%'
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
              Start Game
            </button>
          </div>
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
                    {isPlayerTurn ? "Your Turn" : "AI Thinking..."}
                  </div>
                  <div style={{ color: '#9ca3af', fontSize: '0.875rem' }}>
                    You are X · AI is O
                  </div>
                </div>
              )}
              {gameStatus === 'win' && (
                <div>
                  <div style={{
                    color: '#22c55e',
                    fontSize: '2rem',
                    fontWeight: 'bold',
                    marginBottom: '0.5rem'
                  }}>
                    🎉 You Win!
                  </div>
                  <div style={{ color: '#9ca3af', fontSize: '0.875rem' }}>
                    Great strategy!
                  </div>
                </div>
              )}
              {gameStatus === 'lose' && (
                <div>
                  <div style={{
                    color: '#ef4444',
                    fontSize: '2rem',
                    fontWeight: 'bold',
                    marginBottom: '0.5rem'
                  }}>
                    AI Wins
                  </div>
                  <div style={{ color: '#9ca3af', fontSize: '0.875rem' }}>
                    Try again!
                  </div>
                </div>
              )}
              {gameStatus === 'draw' && (
                <div>
                  <div style={{
                    color: '#eab308',
                    fontSize: '2rem',
                    fontWeight: 'bold',
                    marginBottom: '0.5rem'
                  }}>
                    It's a Draw!
                  </div>
                  <div style={{ color: '#9ca3af', fontSize: '0.875rem' }}>
                    Well played!
                  </div>
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
                      background: isWinningCell
                        ? 'rgba(14, 165, 233, 0.3)'
                        : 'rgba(31, 41, 55, 0.8)',
                      border: isWinningCell
                        ? '3px solid #0ea5e9'
                        : '2px solid rgba(75, 85, 99, 1)',
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

      {/* Info Modal */}
      {showInfo && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.8)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
            padding: '1rem'
          }}
          onClick={() => setShowInfo(false)}
        >
          <div
            style={{
              background: '#1f2937',
              border: '1px solid rgba(14, 165, 233, 0.3)',
              borderRadius: '1rem',
              padding: '2rem',
              maxWidth: '600px',
              maxHeight: '90vh',
              width: '100%',
              position: 'relative',
              overflowY: 'auto'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowInfo(false)}
              style={{
                position: 'absolute',
                top: '1rem',
                right: '1rem',
                background: 'rgba(255, 255, 255, 0.1)',
                border: 'none',
                borderRadius: '0.375rem',
                color: '#fff',
                cursor: 'pointer',
                padding: '0.5rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'background 0.2s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'}
            >
              <XIcon style={{ width: '1.25rem', height: '1.25rem' }} />
            </button>

            <h2 style={{
              color: '#fff',
              fontSize: '1.875rem',
              fontWeight: 'bold',
              marginBottom: '1.5rem',
              textAlign: 'center'
            }}>
              How to Play
            </h2>

            <div style={{
              display: 'grid',
              gap: '1rem',
              marginBottom: '1.5rem'
            }}>
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
                <div style={{ color: '#0ea5e9', fontSize: '2rem', marginBottom: '0.5rem' }}>🖱️</div>
                <h3 style={{ color: '#fff', fontWeight: '600', marginBottom: '0.25rem' }}>How to Play</h3>
                <p style={{ color: '#9ca3af', fontSize: '0.875rem' }}>
                  Click on any empty cell to place your X. The AI will automatically make its move with O. Take turns until someone wins or the board is full.
                </p>
              </div>

              <div style={{
                background: 'rgba(34, 197, 94, 0.1)',
                border: '1px solid rgba(34, 197, 94, 0.3)',
                borderRadius: '0.5rem',
                padding: '1rem'
              }}>
                <div style={{ color: '#22c55e', fontSize: '2rem', marginBottom: '0.5rem' }}>😊</div>
                <h3 style={{ color: '#fff', fontWeight: '600', marginBottom: '0.25rem' }}>Easy Mode</h3>
                <p style={{ color: '#9ca3af', fontSize: '0.875rem' }}>
                  AI makes completely random moves. Great for beginners!
                </p>
              </div>

              <div style={{
                background: 'rgba(234, 179, 8, 0.1)',
                border: '1px solid rgba(234, 179, 8, 0.3)',
                borderRadius: '0.5rem',
                padding: '1rem'
              }}>
                <div style={{ color: '#eab308', fontSize: '2rem', marginBottom: '0.5rem' }}>🤔</div>
                <h3 style={{ color: '#fff', fontWeight: '600', marginBottom: '0.25rem' }}>Medium Mode</h3>
                <p style={{ color: '#9ca3af', fontSize: '0.875rem' }}>
                  AI plays smart 50% of the time and randomly 50% of the time. A balanced challenge!
                </p>
              </div>

              <div style={{
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: '0.5rem',
                padding: '1rem'
              }}>
                <div style={{ color: '#ef4444', fontSize: '2rem', marginBottom: '0.5rem' }}>🧠</div>
                <h3 style={{ color: '#fff', fontWeight: '600', marginBottom: '0.25rem' }}>Hard Mode</h3>
                <p style={{ color: '#9ca3af', fontSize: '0.875rem' }}>
                  AI uses the minimax algorithm and plays perfectly. It's unbeatable - the best you can do is draw!
                </p>
              </div>
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
                <li>Create "forks" - positions where you can win in two ways</li>
                <li>On Hard mode, the AI never makes mistakes - focus on forcing draws!</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TicTacToe;
