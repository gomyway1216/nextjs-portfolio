/**
 * Othello Game Component
 * Based on Thell 3.0.3 implementation
 * Supports both single-player (vs AI) and multiplayer modes
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
import { useOthelloMultiplayer } from './useOthelloMultiplayer';
import { OthelloMultiplayerLobby } from './OthelloMultiplayerLobby';
import { OthelloNetworkState, boardToNetwork } from './multiplayerTypes';

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

type GameMode = 'menu' | 'ai' | 'multiplayer';

const Othello = () => {
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [selectedDifficulty, setSelectedDifficulty] = useState<Difficulty>('medium');
  const [playerColor, setPlayerColor] = useState<Color>(BLACK);
  const [selectedPlayerColor, setSelectedPlayerColor] = useState<Color>(BLACK);
  const [showDifficultySelect, setShowDifficultySelect] = useState<boolean>(true);
  const [showInfoModal, setShowInfoModal] = useState<boolean>(false);
  const [stats, setStats] = useState<GameStats>({ wins: 0, losses: 0, draws: 0 });
  const [gameMode, setGameMode] = useState<GameMode>('menu');

  // Multiplayer hook
  const multiplayer = useOthelloMultiplayer();

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

  // Helper to create network state from board
  const createNetworkState = useCallback((board: Board, lastMove: Point | null, isGameOver: boolean, winner: Color | null): OthelloNetworkState => {
    return {
      board: boardToNetwork((x, y) => board.getColor(x, y)),
      currentTurn: board.getCurrentColor(),
      blackCount: board.countDisc(BLACK),
      whiteCount: board.countDisc(WHITE),
      lastMove,
      validMoves: board.getMovablePos(),
      gameOver: isGameOver,
      winner,
      turnNumber: board.getTurns(),
      lastUpdate: Date.now(),
    };
  }, []);

  // Handle player move (works for both AI and multiplayer modes)
  const handleCellClick = useCallback((x: number, y: number) => {
    if (gameState.gameOver || gameState.isAIThinking) return;

    // In AI mode, check if it's player's turn
    if (gameMode === 'ai' && gameState.board.getCurrentColor() !== playerColor) return;

    // In multiplayer mode, check if it's my turn
    if (gameMode === 'multiplayer' && gameState.board.getCurrentColor() !== multiplayer.myColor) return;

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

      // Update stats based on mode
      if (gameMode === 'ai') {
        if (winner === playerColor) {
          setStats(prev => ({ ...prev, wins: prev.wins + 1 }));
        } else if (winner === aiColor) {
          setStats(prev => ({ ...prev, losses: prev.losses + 1 }));
        } else {
          setStats(prev => ({ ...prev, draws: prev.draws + 1 }));
        }
      } else if (gameMode === 'multiplayer') {
        if (winner === multiplayer.myColor) {
          setStats(prev => ({ ...prev, wins: prev.wins + 1 }));
        } else if (winner === multiplayer.opponentColor) {
          setStats(prev => ({ ...prev, losses: prev.losses + 1 }));
        } else {
          setStats(prev => ({ ...prev, draws: prev.draws + 1 }));
        }
        // Send final state to Firebase
        const networkState = createNetworkState(newBoard, point, true, winner);
        multiplayer.updateGameState(networkState);
        multiplayer.endGame(winner === multiplayer.myColor ? multiplayer.context.playerId :
          winner === multiplayer.opponentColor ? multiplayer.otherPlayer?.id || null : null);
      }
      return;
    }

    // In multiplayer, send the move to Firebase
    if (gameMode === 'multiplayer') {
      multiplayer.makeMove(point);
      const networkState = createNetworkState(newBoard, point, false, null);
      multiplayer.updateGameState(networkState);
    }

    setGameState(prev => ({
      ...prev,
      board: newBoard,
      validMoves: newBoard.getMovablePos(),
      message,
      lastMove: point,
      isAIThinking: gameMode === 'ai', // Only AI thinking in AI mode
    }));
  }, [gameState, checkGameState, playerColor, aiColor, gameMode, multiplayer, createNetworkState]);

  // Effect to handle opponent's moves in multiplayer mode
  useEffect(() => {
    if (gameMode !== 'multiplayer') return;
    if (!multiplayer.pendingMove) return;
    if (multiplayer.pendingMove.playerId === multiplayer.context.playerId) return;

    const move = multiplayer.pendingMove.move;
    const newBoard = gameState.board.clone();

    if (!newBoard.move(move)) return;

    const { isOver, winner, message } = checkGameState(newBoard);

    if (isOver) {
      setGameState(prev => ({
        ...prev,
        board: newBoard,
        validMoves: [],
        gameOver: true,
        winner,
        message,
        lastMove: move,
      }));

      if (winner === multiplayer.myColor) {
        setStats(prev => ({ ...prev, wins: prev.wins + 1 }));
      } else if (winner === multiplayer.opponentColor) {
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
      lastMove: move,
    }));
  }, [multiplayer.pendingMove, gameMode, multiplayer.context.playerId, multiplayer.myColor, multiplayer.opponentColor, gameState.board, checkGameState]);

  // AI move effect (only runs in AI mode)
  useEffect(() => {
    if (gameMode !== 'ai') return;
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
  }, [gameMode, gameState.isAIThinking, gameState.gameOver, gameState.board, difficulty, checkGameState, playerColor, aiColor]);

  // Start AI game with selected difficulty and color
  const startAIGame = useCallback(() => {
    setDifficulty(selectedDifficulty);
    setPlayerColor(selectedPlayerColor);
    setShowDifficultySelect(false);
    setGameMode('ai');
    initGame(selectedPlayerColor);
  }, [initGame, selectedDifficulty, selectedPlayerColor]);

  // Start multiplayer game
  const startMultiplayerGame = useCallback(async () => {
    const board = new Board();
    setGameState({
      board,
      validMoves: board.getMovablePos(),
      gameOver: false,
      winner: null,
      isAIThinking: false,
      message: 'Black to play',
      lastMove: null,
    });
    setPlayerColor(multiplayer.myColor);
    setShowDifficultySelect(false);
    setGameMode('multiplayer');

    // If host, send initial game state to Firebase
    if (multiplayer.context.isHost) {
      const networkState = createNetworkState(board, null, false, null);
      await multiplayer.startGame(networkState);
    }
  }, [multiplayer, createNetworkState]);

  // Legacy startGame for backwards compatibility
  const startGame = startAIGame;

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

    // Determine if player can click based on game mode
    const myTurnColor = gameMode === 'multiplayer' ? multiplayer.myColor : playerColor;

    for (let y = 1; y <= BOARD_SIZE; y++) {
      for (let x = 1; x <= BOARD_SIZE; x++) {
        const color = gameState.board.getColor(x, y);
        const isValidMove = gameState.validMoves.some(m => m.x === x && m.y === y);
        const isLastMove = gameState.lastMove?.x === x && gameState.lastMove?.y === y;
        const canClick = isValidMove && !gameState.isAIThinking && !gameState.gameOver &&
          gameState.board.getCurrentColor() === myTurnColor;

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

  // Show multiplayer lobby or difficulty selector
  if (showDifficultySelect) {
    // Check if we're in multiplayer lobby mode
    const isInMultiplayerLobby = multiplayer.context.lobbyState !== 'idle' ||
      multiplayer.context.roomId !== null;

    // If multiplayer game is starting/playing, redirect to game
    if (multiplayer.context.lobbyState === 'playing') {
      startMultiplayerGame();
    }

    return (
      <div style={containerStyle}>
        <div style={{
          background: 'rgba(0, 0, 0, 0.95)',
          border: '3px solid #22c55e',
          borderRadius: '1rem',
          padding: '2rem',
          maxWidth: '500px',
          minWidth: '400px',
        }}>
          {/* Show multiplayer lobby */}
          <OthelloMultiplayerLobby
            multiplayer={multiplayer}
            onStartSinglePlayer={() => {
              // This is handled internally by the lobby component
            }}
            onGameStart={startMultiplayerGame}
          />

          {/* AI Difficulty selector - shown when not in multiplayer lobby */}
          {!isInMultiplayerLobby && (
            <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid #374151' }}>
              <h3 style={{ color: '#9ca3af', fontSize: '0.875rem', marginBottom: '1rem', textAlign: 'center' }}>
                Or play against AI:
              </h3>

              {/* Difficulty options */}
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', marginBottom: '1rem' }}>
                {DIFFICULTY_OPTIONS.map(option => (
                  <button
                    key={option.value}
                    onClick={() => setSelectedDifficulty(option.value)}
                    style={{
                      padding: '0.5rem 1rem',
                      borderRadius: '0.5rem',
                      border: selectedDifficulty === option.value ? '2px solid #22c55e' : '2px solid #374151',
                      backgroundColor: selectedDifficulty === option.value ? 'rgba(34, 197, 94, 0.2)' : 'transparent',
                      color: '#fff',
                      cursor: 'pointer',
                      fontSize: '0.875rem',
                    }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              <ColorSelector />

              <button
                onClick={startAIGame}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  backgroundColor: '#16a34a',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '0.5rem',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  marginTop: '1rem',
                }}
              >
                Start vs AI
              </button>
            </div>
          )}

          <button
            onClick={() => setShowInfoModal(true)}
            style={{
              background: 'transparent',
              border: '1px solid #4b5563',
              borderRadius: '0.5rem',
              color: '#9ca3af',
              fontSize: '0.875rem',
              padding: '0.5rem 1.5rem',
              cursor: 'pointer',
              marginTop: '1rem',
              width: '100%',
            }}
          >
            How to Play
          </button>
        </div>

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
                {gameMode === 'multiplayer'
                  ? (multiplayer.myColor === BLACK ? '(Your turn)' : `(${multiplayer.otherPlayer?.name || 'Opponent'}'s turn)`)
                  : (playerColor === BLACK ? '(Your turn)' : '(AI turn)')
                }
              </span>
            )}
          </div>
          <div style={scoreItemStyle}>
            {gameState.board.getCurrentColor() === WHITE && !gameState.gameOver && (
              <span style={{ color: '#4ade80', fontSize: '0.875rem' }}>
                {gameMode === 'multiplayer'
                  ? (multiplayer.myColor === WHITE ? '(Your turn)' : `(${multiplayer.otherPlayer?.name || 'Opponent'}'s turn)`)
                  : (playerColor === WHITE ? '(Your turn)' : '(AI turn)')
                }
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
            {gameMode === 'multiplayer'
              ? `You are ${multiplayer.myColor === BLACK ? 'Black' : 'White'} vs ${multiplayer.otherPlayer?.name || 'Opponent'}`
              : `You are playing as ${playerColor === BLACK ? 'Black' : 'White'}`
            }
          </span>
        </div>

        {/* Message */}
        <div style={messageContainerStyle}>
          {gameState.isAIThinking && gameMode === 'ai' ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', color: '#facc15' }}>
              <Loader2 style={{ width: '20px', height: '20px', animation: 'spin 1s linear infinite' }} />
              <span>AI is thinking...</span>
            </div>
          ) : gameMode === 'multiplayer' && gameState.board.getCurrentColor() !== multiplayer.myColor && !gameState.gameOver ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', color: '#facc15' }}>
              <Loader2 style={{ width: '20px', height: '20px', animation: 'spin 1s linear infinite' }} />
              <span>Waiting for {multiplayer.otherPlayer?.name || 'opponent'}...</span>
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
          <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'center', gap: '0.5rem' }}>
            <button
              style={buttonStyle}
              onClick={() => {
                if (gameMode === 'multiplayer') {
                  multiplayer.resetMultiplayer();
                  setShowDifficultySelect(true);
                  setGameMode('menu');
                } else {
                  initGame(playerColor);
                }
              }}
              onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#15803d'}
              onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#16a34a'}
            >
              <RotateCcw style={{ width: '20px', height: '20px' }} />
              {gameMode === 'multiplayer' ? 'Back to Lobby' : 'Play Again'}
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
