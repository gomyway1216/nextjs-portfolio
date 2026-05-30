/**
 * Tetris game component
 */

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Pause, Play, RotateCcw, Trophy } from 'lucide-react';
import { GameTopBar, DifficultySelector, InfoModal, Difficulty, GameStats } from '../common';
import { useHighScore } from '@/hooks/useHighScore';
import { useFeatureLifecycle } from '@/hooks/useActivityTracker';
import {
  Board,
  Tetromino,
  BOARD_WIDTH,
  BOARD_HEIGHT,
  CELL_SIZE,
  GAME_CONSTANTS,
  COLORS,
} from './types';
import {
  createEmptyBoard,
  createTetromino,
  isValidPosition,
  tryRotate,
  mergePieceToBoard,
  clearLines,
  calculateScore,
  getDropInterval,
  getGhostPiecePosition,
} from './gameLogic';

const DIFFICULTY_OPTIONS = [
  { value: 'easy' as Difficulty, label: 'Easy', description: 'Slower starting speed' },
  { value: 'medium' as Difficulty, label: 'Medium', description: 'Normal starting speed' },
  { value: 'hard' as Difficulty, label: 'Hard', description: 'Fast starting speed' }
];

const Tetris = () => {
  const lifecycle = useFeatureLifecycle('game.tetris');
  const [board, setBoard] = useState<Board>(createEmptyBoard());
  const [currentPiece, setCurrentPiece] = useState<Tetromino | null>(null);
  const [nextPiece, setNextPiece] = useState<Tetromino | null>(null);
  const [score, setScore] = useState(0);
  const [lines, setLines] = useState(0);
  const [level, setLevel] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [showDifficultySelect, setShowDifficultySelect] = useState(true);
  const [showInfo, setShowInfo] = useState(false);
  const [stats, setStats] = useState<GameStats>({ wins: 0, losses: 0, draws: 0 });
  const [highScore, updateHighScore] = useHighScore('tetris');

  const gameLoopRef = useRef<NodeJS.Timeout | null>(null);
  const lastDropTimeRef = useRef<number>(0);

  // Initialize game
  const initGame = useCallback(() => {
    setBoard(createEmptyBoard());
    setCurrentPiece(createTetromino());
    setNextPiece(createTetromino());
    setScore(0);
    setLines(0);
    setLevel(0);
    setGameOver(false);
    setIsPaused(false);
    lastDropTimeRef.current = Date.now();
  }, []);

  // Move piece
  const movePiece = useCallback((dx: number, dy: number) => {
    if (!currentPiece || gameOver || isPaused) return false;

    const newPiece = {
      ...currentPiece,
      position: {
        x: currentPiece.position.x + dx,
        y: currentPiece.position.y + dy,
      },
    };

    if (isValidPosition(board, newPiece)) {
      setCurrentPiece(newPiece);
      return true;
    }

    return false;
  }, [currentPiece, board, gameOver, isPaused]);

  // Rotate piece
  const rotatePiece = useCallback(() => {
    if (!currentPiece || gameOver || isPaused) return;

    const rotated = tryRotate(board, currentPiece);
    if (rotated) {
      setCurrentPiece(rotated);
    }
  }, [currentPiece, board, gameOver, isPaused]);

  // Hard drop
  const hardDrop = useCallback(() => {
    if (!currentPiece || gameOver || isPaused) return;

    let newPiece = { ...currentPiece };
    while (isValidPosition(board, { ...newPiece, position: { ...newPiece.position, y: newPiece.position.y + 1 } })) {
      newPiece = { ...newPiece, position: { ...newPiece.position, y: newPiece.position.y + 1 } };
    }

    setCurrentPiece(newPiece);
    // Trigger immediate lock
    lockPiece(newPiece);
  }, [currentPiece, board, gameOver, isPaused]);

  // Lock piece and spawn new one
  const lockPiece = useCallback((piece: Tetromino) => {
    const newBoard = mergePieceToBoard(board, piece);
    const { newBoard: clearedBoard, linesCleared } = clearLines(newBoard);

    setBoard(clearedBoard);

    if (linesCleared > 0) {
      const points = calculateScore(linesCleared, level);
      setScore(prev => {
        const newScore = prev + points;
        updateHighScore(newScore);
        return newScore;
      });
      setLines(prev => {
        const newLines = prev + linesCleared;
        const newLevel = Math.floor(newLines / GAME_CONSTANTS.LINES_PER_LEVEL);
        setLevel(newLevel);
        return newLines;
      });
    }

    // Spawn next piece
    setCurrentPiece(nextPiece);
    setNextPiece(createTetromino());

    // Check game over
    if (nextPiece && !isValidPosition(clearedBoard, nextPiece)) {
      setGameOver(true);
      setStats(prev => ({ ...prev, losses: prev.losses + 1 }));
    }

    lastDropTimeRef.current = Date.now();
  }, [board, nextPiece, level]);

  // Drop piece one row
  const dropPiece = useCallback(() => {
    if (!currentPiece || gameOver || isPaused) return;

    const canMoveDown = movePiece(0, 1);
    if (!canMoveDown) {
      lockPiece(currentPiece);
    }
  }, [currentPiece, gameOver, isPaused, movePiece, lockPiece]);

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (gameOver || !currentPiece) return;

      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          movePiece(-1, 0);
          break;
        case 'ArrowRight':
          e.preventDefault();
          movePiece(1, 0);
          break;
        case 'ArrowDown':
          e.preventDefault();
          dropPiece();
          lastDropTimeRef.current = Date.now();
          break;
        case 'ArrowUp':
        case ' ':
          e.preventDefault();
          if (e.key === ' ') {
            hardDrop();
          } else {
            rotatePiece();
          }
          break;
        case 'p':
        case 'P':
          e.preventDefault();
          setIsPaused(prev => !prev);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentPiece, gameOver, movePiece, rotatePiece, dropPiece, hardDrop]);

  // Game loop
  useEffect(() => {
    if (gameOver || isPaused || !currentPiece) return;

    const dropInterval = getDropInterval(difficulty, level);

    const loop = setInterval(() => {
      const now = Date.now();
      if (now - lastDropTimeRef.current >= dropInterval) {
        dropPiece();
        lastDropTimeRef.current = now;
      }
    }, 50);

    gameLoopRef.current = loop;
    return () => clearInterval(loop);
  }, [currentPiece, gameOver, isPaused, difficulty, level, dropPiece]);

  const startGame = () => {
    setShowDifficultySelect(false);
    initGame();
  };

  const resetGame = () => {
    initGame();
  };

  const backToMenu = () => {
    setShowDifficultySelect(true);
    setGameOver(false);
  };

  // Render cell
  const renderCell = (cell: string | null, isGhost: boolean = false) => {
    const style: React.CSSProperties = {
      width: `${CELL_SIZE}px`,
      height: `${CELL_SIZE}px`,
      border: '1px solid rgba(255, 255, 255, 0.1)',
      backgroundColor: cell
        ? isGhost
          ? 'rgba(255, 255, 255, 0.1)'
          : cell
        : 'rgba(0, 0, 0, 0.5)',
      boxShadow: cell && !isGhost ? 'inset 0 0 5px rgba(0, 0, 0, 0.5)' : 'none',
    };

    return <div style={style} />;
  };

  // Render board with current piece
  const renderBoard = () => {
    // Create display board with colors (string | 'ghost' | null)
    type DisplayCell = string | 'ghost' | null;
    const displayBoard: DisplayCell[][] = board.map(row =>
      row.map(cell => cell ? COLORS[cell] : null)
    );

    // Add ghost piece
    if (currentPiece && !gameOver) {
      const ghostY = getGhostPiecePosition(board, currentPiece);
      const ghostPiece = { ...currentPiece, position: { ...currentPiece.position, y: ghostY } };

      for (let y = 0; y < ghostPiece.shape.length; y++) {
        for (let x = 0; x < ghostPiece.shape[y].length; x++) {
          if (ghostPiece.shape[y][x]) {
            const boardY = ghostPiece.position.y + y;
            const boardX = ghostPiece.position.x + x;
            if (boardY >= 0 && boardY < BOARD_HEIGHT && boardX >= 0 && boardX < BOARD_WIDTH) {
              if (!displayBoard[boardY][boardX]) {
                displayBoard[boardY][boardX] = 'ghost';
              }
            }
          }
        }
      }
    }

    // Add current piece
    if (currentPiece && !gameOver) {
      for (let y = 0; y < currentPiece.shape.length; y++) {
        for (let x = 0; x < currentPiece.shape[y].length; x++) {
          if (currentPiece.shape[y][x]) {
            const boardY = currentPiece.position.y + y;
            const boardX = currentPiece.position.x + x;
            if (boardY >= 0 && boardY < BOARD_HEIGHT && boardX >= 0 && boardX < BOARD_WIDTH) {
              displayBoard[boardY][boardX] = currentPiece.color;
            }
          }
        }
      }
    }

    return displayBoard.map((row, y) => (
      <div key={y} style={{ display: 'flex' }}>
        {row.map((cell, x) => (
          <div key={x}>{renderCell(cell === 'ghost' ? null : cell, cell === 'ghost')}</div>
        ))}
      </div>
    ));
  };

  // Render next piece preview
  const renderNextPiece = () => {
    if (!nextPiece) return null;

    return nextPiece.shape.map((row, y) => (
      <div key={y} style={{ display: 'flex' }}>
        {row.map((cell, x) => (
          <div
            key={x}
            style={{
              width: '20px',
              height: '20px',
              backgroundColor: cell ? nextPiece.color : 'transparent',
              border: cell ? '1px solid rgba(255, 255, 255, 0.3)' : 'none',
            }}
          />
        ))}
      </div>
    ));
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'safe center',
      background: 'linear-gradient(to bottom, #111827, #000)',
      overflow: 'auto',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      padding: '5rem 1rem 1.5rem'
    }}>
      <GameTopBar
        stats={stats}
        onInfoClick={() => setShowInfo(true)}
        additionalContent={
          !showDifficultySelect && (
            <div style={{
              display: 'flex',
              gap: '1rem',
              alignItems: 'center'
            }}>
              <div style={{
                background: 'rgba(14, 165, 233, 0.1)',
                border: '1px solid rgba(14, 165, 233, 0.3)',
                borderRadius: '0.5rem',
                padding: '0.5rem 1rem',
                color: '#0ea5e9',
                fontSize: '0.875rem',
                fontWeight: '600'
              }}>
                Level {level}
              </div>
              <div style={{
                background: 'rgba(234, 179, 8, 0.1)',
                border: '1px solid rgba(234, 179, 8, 0.3)',
                borderRadius: '0.5rem',
                padding: '0.5rem 1rem',
                color: '#eab308',
                fontSize: '0.875rem',
                fontWeight: '600'
              }}>
                Lines {lines}
              </div>
            </div>
          )
        }
      />

      <div style={{ width: '100%', marginBottom: '2rem', display: 'flex', justifyContent: 'center' }}>
        {showDifficultySelect ? (
          <DifficultySelector
            title="Tetris"
            subtitle="Stack blocks and clear lines!"
            icon={<span style={{ fontSize: '3rem' }}>🟦</span>}
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
            padding: 'clamp(1rem, 4vw, 2rem)',
            boxShadow: '0 0 50px rgba(14, 165, 233, 0.3)',
            display: 'flex',
            gap: 'clamp(1rem, 4vw, 2rem)',
            alignItems: 'flex-start',
            justifyContent: 'center',
            flexWrap: 'wrap',
            maxWidth: '100%'
          }}>
            {/* Game Board */}
            <div>
              <div style={{
                border: '3px solid #0ea5e9',
                borderRadius: '0.5rem',
                overflow: 'hidden',
                boxShadow: '0 0 20px rgba(14, 165, 233, 0.5)',
                position: 'relative'
              }}>
                {renderBoard()}

                {/* Game Over Overlay */}
                {gameOver && (
                  <div style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'rgba(0, 0, 0, 0.8)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '1rem'
                  }}>
                    <div style={{ color: '#ef4444', fontSize: '2rem', fontWeight: 'bold' }}>
                      Game Over!
                    </div>
                    <div style={{ color: '#fff', fontSize: '1.5rem' }}>
                      Score: {score}
                    </div>
                  </div>
                )}

                {/* Pause Overlay */}
                {isPaused && !gameOver && (
                  <div style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'rgba(0, 0, 0, 0.7)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <div style={{ color: '#0ea5e9', fontSize: '2rem', fontWeight: 'bold' }}>
                      PAUSED
                    </div>
                  </div>
                )}
              </div>

              {/* Controls */}
              <div style={{
                marginTop: '1rem',
                display: 'flex',
                gap: '0.5rem',
                justifyContent: 'center'
              }}>
                <button
                  onClick={() => setIsPaused(prev => !prev)}
                  disabled={gameOver}
                  style={{
                    background: gameOver ? 'rgba(75, 85, 99, 0.5)' : '#0ea5e9',
                    border: 'none',
                    borderRadius: '0.5rem',
                    color: '#fff',
                    padding: '0.5rem 1rem',
                    cursor: gameOver ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => !gameOver && (e.currentTarget.style.background = '#0284c7')}
                  onMouseLeave={(e) => !gameOver && (e.currentTarget.style.background = '#0ea5e9')}
                >
                  {isPaused ? <Play size={16} /> : <Pause size={16} />}
                  {isPaused ? 'Resume' : 'Pause'}
                </button>

                <button
                  onClick={resetGame}
                  style={{
                    background: '#22c55e',
                    border: 'none',
                    borderRadius: '0.5rem',
                    color: '#fff',
                    padding: '0.5rem 1rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#16a34a'}
                  onMouseLeave={(e) => e.currentTarget.style.background = '#22c55e'}
                >
                  <RotateCcw size={16} />
                  New Game
                </button>

                <button
                  onClick={backToMenu}
                  style={{
                    background: 'rgba(75, 85, 99, 0.8)',
                    border: 'none',
                    borderRadius: '0.5rem',
                    color: '#fff',
                    padding: '0.5rem 1rem',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(107, 114, 128, 0.8)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(75, 85, 99, 0.8)'}
                >
                  Menu
                </button>
              </div>
            </div>

            {/* Side Panel */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '1.5rem',
              flex: '1 1 150px',
              maxWidth: '220px',
              minWidth: '150px'
            }}>
              {/* Score */}
              <div style={{
                background: 'rgba(14, 165, 233, 0.1)',
                border: '1px solid rgba(14, 165, 233, 0.3)',
                borderRadius: '0.5rem',
                padding: '1rem',
                textAlign: 'center'
              }}>
                <div style={{ color: '#94a3b8', fontSize: '0.75rem', marginBottom: '0.5rem' }}>
                  SCORE
                </div>
                <div style={{ color: '#0ea5e9', fontSize: '1.5rem', fontWeight: 'bold' }}>
                  {score}
                </div>
              </div>

              {/* High Score */}
              <div style={{
                background: 'rgba(234, 179, 8, 0.1)',
                border: '1px solid rgba(234, 179, 8, 0.3)',
                borderRadius: '0.5rem',
                padding: '1rem',
                textAlign: 'center'
              }}>
                <div style={{ color: '#94a3b8', fontSize: '0.75rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem' }}>
                  <Trophy size={12} />
                  HIGH SCORE
                </div>
                <div style={{ color: '#eab308', fontSize: '1.5rem', fontWeight: 'bold' }}>
                  {highScore}
                </div>
              </div>

              {/* Next Piece */}
              <div style={{
                background: 'rgba(168, 85, 247, 0.1)',
                border: '1px solid rgba(168, 85, 247, 0.3)',
                borderRadius: '0.5rem',
                padding: '1rem'
              }}>
                <div style={{ color: '#94a3b8', fontSize: '0.75rem', marginBottom: '0.5rem', textAlign: 'center' }}>
                  NEXT
                </div>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  {renderNextPiece()}
                </div>
              </div>

              {/* Controls Info */}
              <div style={{
                background: 'rgba(75, 85, 99, 0.3)',
                border: '1px solid rgba(107, 114, 128, 0.3)',
                borderRadius: '0.5rem',
                padding: '1rem'
              }}>
                <div style={{ color: '#94a3b8', fontSize: '0.75rem', marginBottom: '0.5rem' }}>
                  CONTROLS
                </div>
                <div style={{ color: '#d1d5db', fontSize: '0.625rem', lineHeight: '1.4' }}>
                  <div>← → Move</div>
                  <div>↑ Rotate</div>
                  <div>↓ Soft Drop</div>
                  <div>Space: Hard Drop</div>
                  <div>P: Pause</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <InfoModal isOpen={showInfo} onClose={() => setShowInfo(false)} title="How to Play Tetris">
        <div style={{ display: 'grid', gap: '1rem' }}>
          <div style={{
            background: 'rgba(14, 165, 233, 0.1)',
            border: '1px solid rgba(14, 165, 233, 0.3)',
            borderRadius: '0.5rem',
            padding: '1rem'
          }}>
            <div style={{ color: '#0ea5e9', fontSize: '2rem', marginBottom: '0.5rem' }}>🎯</div>
            <h3 style={{ color: '#fff', fontWeight: '600', marginBottom: '0.25rem' }}>Objective</h3>
            <p style={{ color: '#9ca3af', fontSize: '0.875rem' }}>
              Stack falling blocks (tetrominoes) to create complete horizontal lines. Complete lines disappear and earn points!
            </p>
          </div>

          <div style={{
            background: 'rgba(14, 165, 233, 0.1)',
            border: '1px solid rgba(14, 165, 233, 0.3)',
            borderRadius: '0.5rem',
            padding: '1rem'
          }}>
            <div style={{ color: '#0ea5e9', fontWeight: '600', marginBottom: '0.5rem' }}>💡 Scoring</div>
            <ul style={{ color: '#d1d5db', fontSize: '0.875rem', paddingLeft: '1.5rem', margin: 0 }}>
              <li>1 line: 100 × level</li>
              <li>2 lines: 300 × level</li>
              <li>3 lines: 500 × level</li>
              <li>4 lines (Tetris): 800 × level</li>
              <li>Level increases every 10 lines</li>
            </ul>
          </div>

          <div style={{
            background: 'rgba(14, 165, 233, 0.1)',
            border: '1px solid rgba(14, 165, 233, 0.3)',
            borderRadius: '0.5rem',
            padding: '1rem'
          }}>
            <div style={{ color: '#0ea5e9', fontWeight: '600', marginBottom: '0.5rem' }}>🎮 Pro Tips</div>
            <ul style={{ color: '#d1d5db', fontSize: '0.875rem', paddingLeft: '1.5rem', margin: 0 }}>
              <li>Stack flat - avoid gaps and overhangs</li>
              <li>Save I-pieces for Tetrises (4 lines)</li>
              <li>Use hard drop (Space) for speed</li>
              <li>Ghost piece shows where block will land</li>
              <li>Plan ahead using the next piece preview</li>
            </ul>
          </div>
        </div>
      </InfoModal>
    </div>
  );
};

export default Tetris;
