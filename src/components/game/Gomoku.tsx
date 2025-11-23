'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Info, X as XIcon, RotateCcw, Trophy } from 'lucide-react';

type Player = 'black' | 'white' | null;
type Difficulty = 'easy' | 'medium' | 'hard';
type GameStatus = 'playing' | 'win' | 'lose' | 'draw';

interface Position {
  row: number;
  col: number;
}

interface GameStats {
  wins: number;
  losses: number;
  draws: number;
}

const BOARD_SIZE = 15;
const WIN_LENGTH = 5;
const PLAYER: Player = 'black';
const AI: Player = 'white';

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

  // Check for winner starting from a position
  const checkWinFromPosition = (
    board: Player[][],
    row: number,
    col: number,
    player: Player
  ): Position[] | null => {
    if (!player) return null;

    const directions = [
      { dr: 0, dc: 1 },  // Horizontal
      { dr: 1, dc: 0 },  // Vertical
      { dr: 1, dc: 1 },  // Diagonal \
      { dr: 1, dc: -1 }, // Diagonal /
    ];

    for (const { dr, dc } of directions) {
      const line: Position[] = [{ row, col }];

      // Check forward direction
      for (let i = 1; i < WIN_LENGTH; i++) {
        const r = row + dr * i;
        const c = col + dc * i;
        if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE || board[r][c] !== player) {
          break;
        }
        line.push({ row: r, col: c });
      }

      // Check backward direction
      for (let i = 1; i < WIN_LENGTH; i++) {
        const r = row - dr * i;
        const c = col - dc * i;
        if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE || board[r][c] !== player) {
          break;
        }
        line.unshift({ row: r, col: c });
      }

      if (line.length >= WIN_LENGTH) {
        return line.slice(0, WIN_LENGTH);
      }
    }

    return null;
  };

  // Check if board is full
  const isBoardFull = (board: Player[][]): boolean => {
    return board.every(row => row.every(cell => cell !== null));
  };

  // Get all valid moves (only near existing stones for efficiency)
  const getValidMoves = (board: Player[][]): Position[] => {
    const moves: Position[] = [];
    const checked = new Set<string>();

    // If board is empty, return center
    const isEmpty = board.every(row => row.every(cell => cell === null));
    if (isEmpty) {
      return [{ row: Math.floor(BOARD_SIZE / 2), col: Math.floor(BOARD_SIZE / 2) }];
    }

    // Only consider moves within 2 squares of existing stones
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if (board[r][c] !== null) {
          // Check surrounding area
          for (let dr = -2; dr <= 2; dr++) {
            for (let dc = -2; dc <= 2; dc++) {
              const nr = r + dr;
              const nc = c + dc;
              const key = `${nr},${nc}`;

              if (
                nr >= 0 && nr < BOARD_SIZE &&
                nc >= 0 && nc < BOARD_SIZE &&
                board[nr][nc] === null &&
                !checked.has(key)
              ) {
                moves.push({ row: nr, col: nc });
                checked.add(key);
              }
            }
          }
        }
      }
    }

    return moves;
  };

  // Pattern evaluation - returns score for a line of stones
  const evaluateLine = (
    board: Player[][],
    row: number,
    col: number,
    dr: number,
    dc: number,
    player: Player
  ): number => {
    let count = 0;
    let openEnds = 0;
    let blockCount = 0;

    // Count consecutive stones
    let r = row;
    let c = col;
    while (
      r >= 0 && r < BOARD_SIZE &&
      c >= 0 && c < BOARD_SIZE &&
      board[r][c] === player
    ) {
      count++;
      r += dr;
      c += dc;
    }

    // Check if open end
    if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE && board[r][c] === null) {
      openEnds++;
    } else if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE) {
      blockCount++;
    }

    // Check other direction
    r = row - dr;
    c = col - dc;
    while (
      r >= 0 && r < BOARD_SIZE &&
      c >= 0 && c < BOARD_SIZE &&
      board[r][c] === player
    ) {
      count++;
      r -= dr;
      c -= dc;
    }

    // Check if open end
    if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE && board[r][c] === null) {
      openEnds++;
    } else if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE) {
      blockCount++;
    }

    // Score based on pattern
    if (count >= WIN_LENGTH) return 100000; // Win
    if (count === 4) {
      if (openEnds === 2) return 10000; // Open four
      if (openEnds === 1) return 1000;  // Half-open four
    }
    if (count === 3) {
      if (openEnds === 2) return 1000; // Open three
      if (openEnds === 1) return 100;  // Half-open three
    }
    if (count === 2) {
      if (openEnds === 2) return 100; // Open two
      if (openEnds === 1) return 10;  // Half-open two
    }

    return count;
  };

  // Evaluate board position
  const evaluateBoard = (board: Player[][], player: Player): number => {
    let score = 0;
    const opponent = player === AI ? PLAYER : AI;

    const directions = [
      { dr: 0, dc: 1 },  // Horizontal
      { dr: 1, dc: 0 },  // Vertical
      { dr: 1, dc: 1 },  // Diagonal \
      { dr: 1, dc: -1 }, // Diagonal /
    ];

    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if (board[r][c] === player) {
          for (const { dr, dc } of directions) {
            score += evaluateLine(board, r, c, dr, dc, player);
          }
        } else if (board[r][c] === opponent) {
          for (const { dr, dc } of directions) {
            score -= evaluateLine(board, r, c, dr, dc, opponent);
          }
        }
      }
    }

    return score;
  };

  // Minimax with alpha-beta pruning
  const minimax = (
    board: Player[][],
    depth: number,
    alpha: number,
    beta: number,
    isMaximizing: boolean
  ): number => {
    // Check terminal states
    const moves = getValidMoves(board);

    // Check if last move won
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if (board[r][c] === AI && checkWinFromPosition(board, r, c, AI)) {
          return 1000000 - depth; // Prefer faster wins
        }
        if (board[r][c] === PLAYER && checkWinFromPosition(board, r, c, PLAYER)) {
          return -1000000 + depth; // Prefer slower losses
        }
      }
    }

    if (depth === 0 || moves.length === 0) {
      return evaluateBoard(board, AI);
    }

    if (isMaximizing) {
      let maxEval = -Infinity;

      // Move ordering: evaluate center moves first
      const sortedMoves = moves.sort((a, b) => {
        const centerA = Math.abs(a.row - BOARD_SIZE/2) + Math.abs(a.col - BOARD_SIZE/2);
        const centerB = Math.abs(b.row - BOARD_SIZE/2) + Math.abs(b.col - BOARD_SIZE/2);
        return centerA - centerB;
      });

      for (const move of sortedMoves) {
        board[move.row][move.col] = AI;
        const evaluation = minimax(board, depth - 1, alpha, beta, false);
        board[move.row][move.col] = null;

        maxEval = Math.max(maxEval, evaluation);
        alpha = Math.max(alpha, evaluation);

        if (beta <= alpha) {
          break; // Beta cutoff
        }
      }

      return maxEval;
    } else {
      let minEval = Infinity;

      const sortedMoves = moves.sort((a, b) => {
        const centerA = Math.abs(a.row - BOARD_SIZE/2) + Math.abs(a.col - BOARD_SIZE/2);
        const centerB = Math.abs(b.row - BOARD_SIZE/2) + Math.abs(b.col - BOARD_SIZE/2);
        return centerA - centerB;
      });

      for (const move of sortedMoves) {
        board[move.row][move.col] = PLAYER;
        const evaluation = minimax(board, depth - 1, alpha, beta, true);
        board[move.row][move.col] = null;

        minEval = Math.min(minEval, evaluation);
        beta = Math.min(beta, evaluation);

        if (beta <= alpha) {
          break; // Alpha cutoff
        }
      }

      return minEval;
    }
  };

  // Get best move for AI
  const getBestMove = (board: Player[][], difficulty: Difficulty): Position | null => {
    const moves = getValidMoves(board);
    if (moves.length === 0) return null;

    const depthMap = {
      easy: 2,
      medium: 3,
      hard: 4,
    };

    const searchDepth = depthMap[difficulty];
    let bestMove: Position | null = null;
    let bestValue = -Infinity;

    // Check for immediate wins or blocks first
    for (const move of moves) {
      board[move.row][move.col] = AI;
      if (checkWinFromPosition(board, move.row, move.col, AI)) {
        board[move.row][move.col] = null;
        return move; // Winning move
      }
      board[move.row][move.col] = null;

      board[move.row][move.col] = PLAYER;
      if (checkWinFromPosition(board, move.row, move.col, PLAYER)) {
        board[move.row][move.col] = null;
        bestMove = move; // Must block
      }
      board[move.row][move.col] = null;
    }

    if (bestMove) return bestMove;

    // Sort moves by proximity to center for better move ordering
    const sortedMoves = moves.sort((a, b) => {
      const centerA = Math.abs(a.row - BOARD_SIZE/2) + Math.abs(a.col - BOARD_SIZE/2);
      const centerB = Math.abs(b.row - BOARD_SIZE/2) + Math.abs(b.col - BOARD_SIZE/2);
      return centerA - centerB;
    }).slice(0, Math.min(20, moves.length)); // Limit to top 20 moves for performance

    for (const move of sortedMoves) {
      board[move.row][move.col] = AI;
      const moveValue = minimax(board, searchDepth - 1, -Infinity, Infinity, false);
      board[move.row][move.col] = null;

      if (moveValue > bestValue) {
        bestValue = moveValue;
        bestMove = move;
      }
    }

    return bestMove;
  };

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

      // Use setTimeout to prevent blocking UI
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
      {/* Top Bar */}
      <div style={{
        position: 'fixed',
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

      {/* Game Container */}
      <div style={{ marginTop: '5rem', marginBottom: '2rem' }}>
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
              <span style={{ fontSize: '3rem' }}>⚫</span>
              Gomoku
              <span style={{ fontSize: '3rem' }}>⚪</span>
            </h1>

            <p style={{
              color: '#9ca3af',
              textAlign: 'center',
              marginBottom: '2rem'
            }}>
              Five in a Row - Challenge the AI!
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
                      {diff === 'easy' && 'AI searches 2 moves ahead'}
                      {diff === 'medium' && 'AI searches 3 moves ahead - good challenge!'}
                      {diff === 'hard' && 'AI searches 4 moves ahead - expert level!'}
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
                    {isAIThinking ? "AI Thinking..." : isPlayerTurn ? "Your Turn" : "AI's Turn"}
                  </div>
                  <div style={{ color: '#9ca3af', fontSize: '0.875rem' }}>
                    You are Black ⚫ · AI is White ⚪
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
                    Excellent strategy!
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
                    Good game! Try again?
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
              {/* Grid container with lines */}
              <div style={{
                position: 'relative',
                width: `${(BOARD_SIZE - 1) * 30}px`,
                height: `${(BOARD_SIZE - 1) * 30}px`
              }}>
                {/* Draw grid lines */}
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
                  {/* Star points (traditional markers on Go board) */}
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

                {/* Intersection points (clickable) */}
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
              How to Play Gomoku
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
                background: 'rgba(34, 197, 94, 0.1)',
                border: '1px solid rgba(34, 197, 94, 0.3)',
                borderRadius: '0.5rem',
                padding: '1rem'
              }}>
                <div style={{ color: '#22c55e', fontSize: '2rem', marginBottom: '0.5rem' }}>😊</div>
                <h3 style={{ color: '#fff', fontWeight: '600', marginBottom: '0.25rem' }}>Easy Mode</h3>
                <p style={{ color: '#9ca3af', fontSize: '0.875rem' }}>
                  AI searches 2 moves ahead. Good for learning the game and basic strategies.
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
                  AI searches 3 moves ahead. Provides a good challenge for intermediate players!
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
                  AI searches 4 moves ahead using minimax with alpha-beta pruning. Expert level challenge!
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
                <li>Opening in the center gives you more options</li>
                <li>Create "threats" - positions where you have multiple ways to win</li>
                <li>Always block opponent's four in a row!</li>
                <li>Try to create open threes (three in a row with open ends)</li>
                <li>Control the center of the board for better positioning</li>
                <li>Look for fork opportunities - create two threats at once</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Gomoku;
