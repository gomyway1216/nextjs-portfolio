/**
 * Othello Game Component
 * Based on Thell 3.0.3 implementation
 */

'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { RotateCcw, Loader2 } from 'lucide-react';
import { GameTopBar, DifficultySelector, InfoModal, Difficulty, GameStats } from '../common';
import { Board } from './Board';
import {
  BOARD_SIZE,
  BLACK,
  WHITE,
  EMPTY,
  Color,
  Point,
  pointToString,
} from './types';
import { OthelloAI } from './AI';
import { initMobilityTables } from './MobilityTable';

const DIFFICULTY_OPTIONS = [
  { label: 'Easy', value: 'easy' as Difficulty, description: 'Depth 2 search' },
  { label: 'Medium', value: 'medium' as Difficulty, description: 'Depth 4 search' },
  { label: 'Hard', value: 'hard' as Difficulty, description: 'Depth 6 search' },
];

interface OthelloState {
  board: Board;
  validMoves: Point[];
  gameOver: boolean;
  winner: Color | null;
  isAIThinking: boolean;
  message: string;
  lastMove: Point | null;
}

const Othello = () => {
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [selectedDifficulty, setSelectedDifficulty] = useState<Difficulty>('medium');
  const [playerColor, setPlayerColor] = useState<Color>(BLACK);
  const [selectedPlayerColor, setSelectedPlayerColor] = useState<Color>(BLACK);
  const [showDifficultySelect, setShowDifficultySelect] = useState<boolean>(true);
  const [showInfoModal, setShowInfoModal] = useState<boolean>(false);
  const [stats, setStats] = useState<GameStats>({ wins: 0, losses: 0, draws: 0 });

  const aiColor = playerColor === BLACK ? WHITE : BLACK;

  const [gameState, setGameState] = useState<OthelloState>(() => {
    const board = new Board();
    return {
      board,
      validMoves: board.getMovablePos(),
      gameOver: false,
      winner: null,
      isAIThinking: false,
      message: 'Black to play',
      lastMove: null,
    };
  });

  // Initialize mobility tables on mount
  useEffect(() => {
    initMobilityTables();
  }, []);

  // Initialize game
  const initGame = useCallback((newPlayerColor: Color) => {
    const board = new Board();
    const isPlayerTurn = newPlayerColor === BLACK;
    setGameState({
      board,
      validMoves: board.getMovablePos(),
      gameOver: false,
      winner: null,
      isAIThinking: !isPlayerTurn, // AI thinks first if player is white
      message: 'Black to play',
      lastMove: null,
    });
  }, []);

  // Check game state and update message
  const checkGameState = useCallback((board: Board): { isOver: boolean; winner: Color | null; message: string } => {
    if (board.isGameOver()) {
      const blackCount = board.countDisc(BLACK);
      const whiteCount = board.countDisc(WHITE);

      if (blackCount > whiteCount) {
        return { isOver: true, winner: BLACK, message: `Black wins ${blackCount}-${whiteCount}!` };
      } else if (whiteCount > blackCount) {
        return { isOver: true, winner: WHITE, message: `White wins ${whiteCount}-${blackCount}!` };
      } else {
        return { isOver: true, winner: null, message: `Draw ${blackCount}-${whiteCount}!` };
      }
    }

    const currentColor = board.getCurrentColor();
    const movables = board.getMovablePos();

    if (movables.length === 0) {
      return {
        isOver: false,
        winner: null,
        message: `${currentColor === BLACK ? 'Black' : 'White'} must pass`,
      };
    }

    return {
      isOver: false,
      winner: null,
      message: `${currentColor === BLACK ? 'Black' : 'White'} to play`,
    };
  }, []);

  // Handle player move
  const handleCellClick = useCallback((x: number, y: number) => {
    if (gameState.gameOver || gameState.isAIThinking) return;
    if (gameState.board.getCurrentColor() !== playerColor) return;

    const point: Point = { x, y };

    const isValid = gameState.validMoves.some(m => m.x === x && m.y === y);
    if (!isValid) return;

    const newBoard = gameState.board.clone();
    if (!newBoard.move(point)) return;

    const { isOver, winner, message } = checkGameState(newBoard);

    if (isOver) {
      setGameState(prev => ({
        ...prev,
        board: newBoard,
        validMoves: [],
        gameOver: true,
        winner,
        message,
        lastMove: point,
      }));

      if (winner === playerColor) {
        setStats(prev => ({ ...prev, wins: prev.wins + 1 }));
      } else if (winner === aiColor) {
        setStats(prev => ({ ...prev, losses: prev.losses + 1 }));
      } else {
        setStats(prev => ({ ...prev, draws: prev.draws + 1 }));
      }
      return;
    }

    setGameState(prev => ({
      ...prev,
      board: newBoard,
      validMoves: newBoard.getMovablePos(),
      message,
      lastMove: point,
      isAIThinking: true,
    }));
  }, [gameState, checkGameState, playerColor, aiColor]);

  // AI move effect
  useEffect(() => {
    if (!gameState.isAIThinking || gameState.gameOver) return;

    const currentBoard = gameState.board;
    if (currentBoard.getCurrentColor() !== aiColor) {
      setGameState(prev => ({ ...prev, isAIThinking: false }));
      return;
    }

    if (currentBoard.getMovablePos().length === 0) {
      const newBoard = currentBoard.clone();
      newBoard.pass();

      const { isOver, winner, message } = checkGameState(newBoard);
      const aiColorName = aiColor === BLACK ? 'Black' : 'White';
      const playerColorName = playerColor === BLACK ? 'Black' : 'White';

      setGameState(prev => ({
        ...prev,
        board: newBoard,
        validMoves: newBoard.getMovablePos(),
        gameOver: isOver,
        winner,
        message: isOver ? message : `${aiColorName} passed. ${playerColorName} to play`,
        isAIThinking: false,
      }));
      return;
    }

    const timeoutId = setTimeout(() => {
      const ai = new OthelloAI(difficulty);
      const bestMove = ai.getBestMove(currentBoard);

      const aiColorName = aiColor === BLACK ? 'Black' : 'White';
      const playerColorName = playerColor === BLACK ? 'Black' : 'White';

      if (!bestMove) {
        const newBoard = currentBoard.clone();
        newBoard.pass();

        const { isOver, winner, message } = checkGameState(newBoard);

        setGameState(prev => ({
          ...prev,
          board: newBoard,
          validMoves: newBoard.getMovablePos(),
          gameOver: isOver,
          winner,
          message: isOver ? message : `${aiColorName} passed. ${playerColorName} to play`,
          isAIThinking: false,
        }));
        return;
      }

      const newBoard = currentBoard.clone();
      newBoard.move(bestMove);

      const { isOver, winner, message } = checkGameState(newBoard);

      if (isOver) {
        setGameState(prev => ({
          ...prev,
          board: newBoard,
          validMoves: [],
          gameOver: true,
          winner,
          message,
          lastMove: bestMove,
          isAIThinking: false,
        }));

        if (winner === playerColor) {
          setStats(prev => ({ ...prev, wins: prev.wins + 1 }));
        } else if (winner === aiColor) {
          setStats(prev => ({ ...prev, losses: prev.losses + 1 }));
        } else {
          setStats(prev => ({ ...prev, draws: prev.draws + 1 }));
        }
        return;
      }

      const playerMovables = newBoard.getMovablePos();
      if (playerMovables.length === 0 && !newBoard.isGameOver()) {
        newBoard.pass();
        setGameState(prev => ({
          ...prev,
          board: newBoard,
          validMoves: newBoard.getMovablePos(),
          message: `${playerColorName} passed. ${aiColorName} to play`,
          lastMove: bestMove,
          isAIThinking: true,
        }));
        return;
      }

      setGameState(prev => ({
        ...prev,
        board: newBoard,
        validMoves: playerMovables,
        message: `${aiColorName} played ${pointToString(bestMove)}. ${playerColorName} to play`,
        lastMove: bestMove,
        isAIThinking: false,
      }));
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [gameState.isAIThinking, gameState.gameOver, gameState.board, difficulty, checkGameState, playerColor, aiColor]);

  // Start game with selected difficulty and color
  const startGame = useCallback(() => {
    setDifficulty(selectedDifficulty);
    setPlayerColor(selectedPlayerColor);
    setShowDifficultySelect(false);
    initGame(selectedPlayerColor);
  }, [initGame, selectedDifficulty, selectedPlayerColor]);

  // Styles
  const containerStyle: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(to bottom, #111827, #000)',
    overflow: 'auto',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    padding: '1rem',
  };

  const gameContainerStyle: React.CSSProperties = {
    width: '100%',
    maxWidth: '500px',
  };

  const scoreDisplayStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '1rem',
    padding: '0 0.5rem',
  };

  const scoreItemStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  };

  const discStyle = (isBlack: boolean): React.CSSProperties => ({
    width: '24px',
    height: '24px',
    borderRadius: '50%',
    backgroundColor: isBlack ? '#1a1a1a' : '#ffffff',
    border: isBlack ? '2px solid #374151' : '2px solid #d1d5db',
  });

  const messageContainerStyle: React.CSSProperties = {
    textAlign: 'center',
    marginBottom: '1rem',
    height: '2rem',
  };

  const boardContainerStyle: React.CSSProperties = {
    backgroundColor: '#166534',
    padding: '0.5rem',
    borderRadius: '0.5rem',
    boxShadow: '0 10px 25px rgba(0, 0, 0, 0.5)',
  };

  const labelsRowStyle: React.CSSProperties = {
    display: 'flex',
    marginLeft: '1.5rem',
    marginBottom: '0.25rem',
  };

  const labelStyle: React.CSSProperties = {
    width: '48px',
    textAlign: 'center',
    color: '#9ca3af',
    fontSize: '0.875rem',
  };

  const boardRowStyle: React.CSSProperties = {
    display: 'flex',
  };

  const rowLabelsStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-around',
    marginRight: '0.25rem',
  };

  const rowLabelStyle: React.CSSProperties = {
    height: '48px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#9ca3af',
    fontSize: '0.875rem',
    width: '20px',
  };

  const gridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(8, 48px)',
    gap: 0,
    border: '2px solid #14532d',
    borderRadius: '4px',
  };

  const getCellStyle = (isValidMove: boolean, canClick: boolean): React.CSSProperties => ({
    width: '48px',
    height: '48px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: isValidMove && !gameState.isAIThinking ? 'rgba(34, 197, 94, 0.5)' : '#16a34a',
    border: '1px solid #15803d',
    cursor: canClick ? 'pointer' : 'default',
  });

  const getDiscStyle = (color: Color, isLastMove: boolean): React.CSSProperties => ({
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    backgroundColor: color === BLACK ? '#1a1a1a' : '#ffffff',
    border: color === BLACK ? '2px solid #374151' : '2px solid #d1d5db',
    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.3)',
    outline: isLastMove ? '3px solid #facc15' : 'none',
    outlineOffset: '2px',
  });

  const hintDotStyle: React.CSSProperties = {
    width: '12px',
    height: '12px',
    borderRadius: '50%',
    backgroundColor: 'rgba(74, 222, 128, 0.6)',
  };

  const buttonStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.75rem 1.5rem',
    backgroundColor: '#16a34a',
    color: '#ffffff',
    border: 'none',
    borderRadius: '0.5rem',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  };

  const colorSelectorStyle: React.CSSProperties = {
    marginTop: '1.5rem',
    marginBottom: '1rem',
  };

  const colorOptionStyle = (isSelected: boolean): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '0.75rem 1.25rem',
    backgroundColor: isSelected ? 'rgba(34, 197, 94, 0.2)' : 'rgba(55, 65, 81, 0.5)',
    border: isSelected ? '2px solid #22c55e' : '2px solid transparent',
    borderRadius: '0.5rem',
    cursor: 'pointer',
    transition: 'all 0.2s',
  });

  // Render the board cells
  const renderBoard = () => {
    const cells = [];

    for (let y = 1; y <= BOARD_SIZE; y++) {
      for (let x = 1; x <= BOARD_SIZE; x++) {
        const color = gameState.board.getColor(x, y);
        const isValidMove = gameState.validMoves.some(m => m.x === x && m.y === y);
        const isLastMove = gameState.lastMove?.x === x && gameState.lastMove?.y === y;
        const canClick = isValidMove && !gameState.isAIThinking && !gameState.gameOver &&
          gameState.board.getCurrentColor() === playerColor;

        cells.push(
          <div
            key={`${x}-${y}`}
            style={getCellStyle(isValidMove, canClick)}
            onClick={() => handleCellClick(x, y)}
          >
            {color !== EMPTY && <div style={getDiscStyle(color, isLastMove)} />}
            {color === EMPTY && isValidMove && !gameState.isAIThinking && (
              <div style={hintDotStyle} />
            )}
          </div>
        );
      }
    }

    return cells;
  };

  // Info modal content
  const infoContent = (
    <div style={{ color: '#d1d5db' }}>
      <p style={{ marginBottom: '0.75rem' }}>
        <strong>Objective:</strong> Have more discs than your opponent when the game ends.
      </p>
      <p style={{ marginBottom: '0.5rem' }}><strong>Rules:</strong></p>
      <ul style={{ listStyle: 'disc', marginLeft: '1.5rem', marginBottom: '0.75rem' }}>
        <li>Black moves first</li>
        <li>Place a disc to flip opponent&apos;s discs</li>
        <li>You must flip at least one disc to make a move</li>
        <li>Flip discs in all 8 directions simultaneously</li>
        <li>If you can&apos;t move, you must pass</li>
        <li>Game ends when neither player can move</li>
      </ul>
      <p style={{ marginBottom: '0.5rem' }}><strong>Strategy:</strong></p>
      <ul style={{ listStyle: 'disc', marginLeft: '1.5rem' }}>
        <li>Corners are very valuable - they can never be flipped</li>
        <li>Avoid placing discs adjacent to corners (X-squares)</li>
        <li>Control the edges for stability</li>
        <li>Sometimes having fewer discs mid-game is better</li>
      </ul>
    </div>
  );

  // Color selector component
  const ColorSelector = () => (
    <div style={colorSelectorStyle}>
      <div style={{ color: '#9ca3af', fontSize: '0.875rem', marginBottom: '0.75rem', textAlign: 'center' }}>
        Choose your color:
      </div>
      <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
        <div
          style={colorOptionStyle(selectedPlayerColor === BLACK)}
          onClick={() => setSelectedPlayerColor(BLACK)}
        >
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            backgroundColor: '#1a1a1a',
            border: '2px solid #374151',
          }} />
          <div>
            <div style={{ color: '#ffffff', fontWeight: 600 }}>Black</div>
            <div style={{ color: '#9ca3af', fontSize: '0.75rem' }}>Move first</div>
          </div>
        </div>
        <div
          style={colorOptionStyle(selectedPlayerColor === WHITE)}
          onClick={() => setSelectedPlayerColor(WHITE)}
        >
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            backgroundColor: '#ffffff',
            border: '2px solid #d1d5db',
          }} />
          <div>
            <div style={{ color: '#ffffff', fontWeight: 600 }}>White</div>
            <div style={{ color: '#9ca3af', fontSize: '0.75rem' }}>Move second</div>
          </div>
        </div>
      </div>
    </div>
  );

  // Difficulty selector screen
  if (showDifficultySelect) {
    return (
      <div style={containerStyle}>
        <DifficultySelector
          title="Othello"
          subtitle="Classic disc-flipping strategy game"
          icon={<><span style={{ fontSize: '3rem' }}>⚫</span><span style={{ fontSize: '3rem' }}>⚪</span></>}
          options={DIFFICULTY_OPTIONS}
          selectedDifficulty={selectedDifficulty}
          onSelectDifficulty={setSelectedDifficulty}
          onStart={startGame}
          extraContent={<ColorSelector />}
        />

        <InfoModal
          isOpen={showInfoModal}
          title="How to Play Othello"
          onClose={() => setShowInfoModal(false)}
        >
          {infoContent}
        </InfoModal>
      </div>
    );
  }

  const isPlayerTurn = gameState.board.getCurrentColor() === playerColor && !gameState.gameOver;
  const isAITurn = gameState.board.getCurrentColor() === aiColor && !gameState.gameOver;

  return (
    <div style={containerStyle}>
      <div style={gameContainerStyle}>
        <GameTopBar
          stats={stats}
          onInfoClick={() => setShowInfoModal(true)}
        />

        {/* Score display */}
        <div style={scoreDisplayStyle}>
          <div style={scoreItemStyle}>
            <div style={discStyle(true)} />
            <span style={{ color: '#ffffff', fontWeight: 'bold', fontSize: '1.125rem' }}>
              {gameState.board.countDisc(BLACK)}
            </span>
            {gameState.board.getCurrentColor() === BLACK && !gameState.gameOver && (
              <span style={{ color: '#4ade80', fontSize: '0.875rem' }}>
                ({playerColor === BLACK ? 'Your turn' : 'AI turn'})
              </span>
            )}
          </div>
          <div style={scoreItemStyle}>
            {gameState.board.getCurrentColor() === WHITE && !gameState.gameOver && (
              <span style={{ color: '#4ade80', fontSize: '0.875rem' }}>
                ({playerColor === WHITE ? 'Your turn' : 'AI turn'})
              </span>
            )}
            <span style={{ color: '#ffffff', fontWeight: 'bold', fontSize: '1.125rem' }}>
              {gameState.board.countDisc(WHITE)}
            </span>
            <div style={discStyle(false)} />
          </div>
        </div>

        {/* Player indicator */}
        <div style={{ textAlign: 'center', marginBottom: '0.5rem' }}>
          <span style={{ color: '#6b7280', fontSize: '0.75rem' }}>
            You are playing as {playerColor === BLACK ? 'Black' : 'White'}
          </span>
        </div>

        {/* Message */}
        <div style={messageContainerStyle}>
          {gameState.isAIThinking ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', color: '#facc15' }}>
              <Loader2 style={{ width: '20px', height: '20px', animation: 'spin 1s linear infinite' }} />
              <span>AI is thinking...</span>
            </div>
          ) : (
            <span style={{
              fontSize: '1.125rem',
              color: gameState.gameOver ? '#facc15' : '#d1d5db',
              fontWeight: gameState.gameOver ? 'bold' : 'normal',
            }}>
              {gameState.message}
            </span>
          )}
        </div>

        {/* Board */}
        <div style={boardContainerStyle}>
          {/* Column labels */}
          <div style={labelsRowStyle}>
            {['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(letter => (
              <div key={letter} style={labelStyle}>
                {letter}
              </div>
            ))}
          </div>

          <div style={boardRowStyle}>
            {/* Row labels */}
            <div style={rowLabelsStyle}>
              {[1, 2, 3, 4, 5, 6, 7, 8].map(num => (
                <div key={num} style={rowLabelStyle}>
                  {num}
                </div>
              ))}
            </div>

            {/* Board grid */}
            <div style={gridStyle}>
              {renderBoard()}
            </div>
          </div>
        </div>

        {/* Game over actions */}
        {gameState.gameOver && (
          <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'center' }}>
            <button
              style={buttonStyle}
              onClick={() => initGame(playerColor)}
              onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#15803d'}
              onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#16a34a'}
            >
              <RotateCcw style={{ width: '20px', height: '20px' }} />
              Play Again
            </button>
          </div>
        )}
      </div>

      <InfoModal
        isOpen={showInfoModal}
        title="How to Play Othello"
        onClose={() => setShowInfoModal(false)}
      >
        {infoContent}
      </InfoModal>

      {/* CSS for spinner animation */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default Othello;
export { Othello };
