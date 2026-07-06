/**
 * Othello Game Component
 * Based on Thell 3.0.3 implementation
 * Supports both single-player (vs AI) and multiplayer modes
 */

'use client';

import { useFeatureLifecycle } from '@/hooks/useActivityTracker';
import { CircleHelp,Cpu,Loader2,Play,RotateCcw } from 'lucide-react';
import React,{ useCallback,useEffect,useRef,useState } from 'react';
import { Difficulty,GameStats,GameTopBar,InfoModal } from '../common';
import { OthelloAI } from './AI';
import { Board } from './Board';
import { initMobilityTables } from './MobilityTable';
import { OthelloMultiplayerLobby } from './OthelloMultiplayerLobby';
import type { MoveHistoryEntry } from './multiplayerTypes';
import {
BLACK,
BOARD_SIZE,
Color,
EMPTY,
Point,
pointToString,
WHITE,
} from './types';
import { useOthelloMultiplayer } from './useOthelloMultiplayer';

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
  moveHistory: MoveHistoryEntry[];
}

type GameMode = 'menu' | 'ai' | 'multiplayer';

const Othello = () => {
  const _lifecycle = useFeatureLifecycle('game.othello');
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
      moveHistory: [],
    };
  });

  // Ref to track the last processed network state update
  const lastProcessedUpdate = useRef<number>(0);

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
      moveHistory: [],
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

  // Handle player move (works for both AI and multiplayer modes)
  const handleCellClick = useCallback((x: number, y: number) => {
    if (gameState.gameOver || gameState.isAIThinking) return;

    // In AI mode, check if it's player's turn
    if (gameMode === 'ai' && gameState.board.getCurrentColor() !== playerColor) return;

    // In multiplayer mode, check if it's my turn
    if (gameMode === 'multiplayer' && gameState.board.getCurrentColor() !== multiplayer.myColor) return;

    const point: Point = { x, y };
    const currentColor = gameState.board.getCurrentColor();

    const isValid = gameState.validMoves.some(m => m.x === x && m.y === y);
    if (!isValid) return;

    const newBoard = gameState.board.clone();
    if (!newBoard.move(point)) return;

    // Create move history entry
    const newMoveEntry: MoveHistoryEntry = {
      moveNumber: gameState.moveHistory.length + 1,
      color: currentColor,
      move: point,
      timestamp: Date.now(),
    };
    const newMoveHistory = [...gameState.moveHistory, newMoveEntry];

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
        moveHistory: newMoveHistory,
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
        // Tell the CF about the winning move; it broadcasts the
        // gameOver / winner fields. We don't write `gameState` from the
        // client any more — the dispatcher is the single writer.
        void multiplayer.makeMove(point);
      }
      return;
    }

    // In multiplayer, the CF flips discs and broadcasts the new state.
    // The optimistic local update above keeps the UI snappy until the
    // RTDB subscription overwrites it with the authoritative result.
    if (gameMode === 'multiplayer') {
      void multiplayer.makeMove(point);
    }

    setGameState(prev => ({
      ...prev,
      board: newBoard,
      validMoves: newBoard.getMovablePos(),
      message,
      lastMove: point,
      moveHistory: newMoveHistory,
      isAIThinking: gameMode === 'ai', // Only AI thinking in AI mode
    }));
  }, [gameState, checkGameState, playerColor, aiColor, gameMode, multiplayer]);

  // Effect to sync game state from Firebase (handles opponent moves and passes)
  useEffect(() => {
    if (gameMode !== 'multiplayer') return;
    if (!multiplayer.gameState) return;

    const networkState = multiplayer.gameState;

    // Check if this is a newer state than what we've already processed
    // Use lastUpdate timestamp to detect new updates (including passes)
    if (networkState.lastUpdate <= lastProcessedUpdate.current) {
      return;
    }

    // Mark this update as processed
    lastProcessedUpdate.current = networkState.lastUpdate;

    console.log('[Othello] Syncing from network state:', {
      currentTurn: networkState.currentTurn === BLACK ? 'Black' : 'White',
      turnNumber: networkState.turnNumber,
      moveHistoryLength: networkState.moveHistory?.length || 0,
      lastUpdate: networkState.lastUpdate,
    });

    // Reconstruct the board from network state
    const newBoard = new Board();
    // Apply the network board state
    for (let y = 1; y <= 8; y++) {
      for (let x = 1; x <= 8; x++) {
        const index = (y - 1) * 8 + (x - 1);
        const color = networkState.board[index];
        newBoard.setColor(x, y, color as Color);
      }
    }
    // Set the current turn and recalculate indices
    newBoard.setCurrentColor(networkState.currentTurn);
    newBoard.setTurns(networkState.turnNumber);
    newBoard.recalcIndices();

    const currentTurnColor = networkState.currentTurn === BLACK ? 'Black' : 'White';
    let message = `${currentTurnColor} to play`;

    if (networkState.gameOver) {
      if (networkState.winner === BLACK) {
        message = `Black wins ${networkState.blackCount}-${networkState.whiteCount}!`;
      } else if (networkState.winner === WHITE) {
        message = `White wins ${networkState.whiteCount}-${networkState.blackCount}!`;
      } else {
        message = `Draw ${networkState.blackCount}-${networkState.whiteCount}!`;
      }

      setGameState(prev => ({
        ...prev,
        board: newBoard,
        validMoves: [],
        gameOver: true,
        winner: networkState.winner,
        message,
        lastMove: networkState.lastMove,
        moveHistory: networkState.moveHistory || prev.moveHistory,
      }));

      // Update stats if game just ended
      if (!gameState.gameOver) {
        if (networkState.winner === multiplayer.myColor) {
          setStats(prev => ({ ...prev, wins: prev.wins + 1 }));
        } else if (networkState.winner === multiplayer.opponentColor) {
          setStats(prev => ({ ...prev, losses: prev.losses + 1 }));
        } else {
          setStats(prev => ({ ...prev, draws: prev.draws + 1 }));
        }
      }
      return;
    }

    // Check if current player must pass
    const validMoves = newBoard.getMovablePos();
    if (validMoves.length === 0) {
      message = `${currentTurnColor} must pass`;
    }

    setGameState(prev => ({
      ...prev,
      board: newBoard,
      validMoves: validMoves,
      message,
      lastMove: networkState.lastMove,
      moveHistory: networkState.moveHistory || prev.moveHistory,
      gameOver: false,
    }));
  }, [gameMode, multiplayer.gameState, multiplayer.myColor, multiplayer.opponentColor, gameState.gameOver]);

  // Auto-pass effect for multiplayer mode when current player has no valid moves
  useEffect(() => {
    if (gameMode !== 'multiplayer') return;
    if (gameState.gameOver) return;

    const currentColor = gameState.board.getCurrentColor();
    const validMoves = gameState.board.getMovablePos();

    // Only auto-pass if it's my turn and I have no valid moves
    if (currentColor !== multiplayer.myColor) return;
    if (validMoves.length > 0) return;

    // Check if game is over (neither player can move)
    const newBoard = gameState.board.clone();
    newBoard.pass();
    const opponentMoves = newBoard.getMovablePos();

    if (opponentMoves.length === 0) {
      // Game over - neither player can move
      const { winner, message } = checkGameState(gameState.board);
      setGameState(prev => ({
        ...prev,
        gameOver: true,
        winner,
        message,
        validMoves: [],
      }));

      // Update stats and notify
      if (winner === multiplayer.myColor) {
        setStats(prev => ({ ...prev, wins: prev.wins + 1 }));
      } else if (winner === multiplayer.opponentColor) {
        setStats(prev => ({ ...prev, losses: prev.losses + 1 }));
      } else {
        setStats(prev => ({ ...prev, draws: prev.draws + 1 }));
      }

      // CF is the writer; gameOver/winner come back via the subscription.
      return;
    }

    // Auto-pass after a short delay so user can see the message
    const timeoutId = setTimeout(() => {
      const passedBoard = gameState.board.clone();
      passedBoard.pass();

      const colorName = currentColor === BLACK ? 'Black' : 'White';
      const nextColorName = currentColor === BLACK ? 'White' : 'Black';

      // Add pass to move history
      const passEntry: MoveHistoryEntry = {
        moveNumber: gameState.moveHistory.length + 1,
        color: currentColor,
        move: null, // null indicates pass
        timestamp: Date.now(),
      };
      const newMoveHistory = [...gameState.moveHistory, passEntry];

      setGameState(prev => ({
        ...prev,
        board: passedBoard,
        validMoves: passedBoard.getMovablePos(),
        message: `${colorName} passed. ${nextColorName} to play`,
        lastMove: null,
        moveHistory: newMoveHistory,
      }));

      // In the CF model the server already advanced past any forced
      // pass when resolving the previous move, so we shouldn't normally
      // reach this branch. Local UI state is still updated above for
      // resilience against transient sync gaps.
    }, 1500); // 1.5 second delay to show "must pass" message

    return () => clearTimeout(timeoutId);
  }, [gameMode, gameState.board, gameState.gameOver, gameState.validMoves, gameState.moveHistory, multiplayer.myColor, multiplayer, checkGameState]);

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
    const initialMoveHistory: MoveHistoryEntry[] = [];

    // Reset the last processed update timestamp for new game
    lastProcessedUpdate.current = 0;

    setGameState({
      board,
      validMoves: board.getMovablePos(),
      gameOver: false,
      winner: null,
      isAIThinking: false,
      message: 'Black to play',
      lastMove: null,
      moveHistory: initialMoveHistory,
    });
    setPlayerColor(multiplayer.myColor);
    setShowDifficultySelect(false);
    setGameMode('multiplayer');

    // If host, tell the CF to build + write the initial game state.
    // The CF is the single writer; this call returns once the state is
    // live in RTDB and our subscription will pick it up.
    if (multiplayer.context.isHost) {
      await multiplayer.startGame();
    }
  }, [multiplayer]);

  // Legacy startGame for backwards compatibility
  const _startGame = startAIGame;

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
    display: 'grid',
    gap: '0.65rem',
  };

  const colorOptionStyle = (isSelected: boolean): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '0.85rem',
    backgroundColor: isSelected ? 'rgba(34, 197, 94, 0.22)' : 'rgba(31, 41, 55, 0.58)',
    border: isSelected ? '1px solid #22c55e' : '1px solid rgba(75, 85, 99, 0.75)',
    borderRadius: '8px',
    color: '#ffffff',
    cursor: 'pointer',
    transition: 'all 0.2s',
    width: '100%',
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

  // Color selector render helper.
  const renderColorSelector = () => (
    <div style={colorSelectorStyle}>
      <div style={{ color: '#d1d5db', fontSize: '0.85rem', fontWeight: 700 }}>
        Choose your color
      </div>
      <div style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        <button
          type="button"
          style={colorOptionStyle(selectedPlayerColor === BLACK)}
          aria-pressed={selectedPlayerColor === BLACK}
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
        </button>
        <button
          type="button"
          style={colorOptionStyle(selectedPlayerColor === WHITE)}
          aria-pressed={selectedPlayerColor === WHITE}
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
        </button>
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

    const selectedDifficultyOption = DIFFICULTY_OPTIONS.find(option => option.value === selectedDifficulty) ?? DIFFICULTY_OPTIONS[1];

    return (
      <div style={{ ...containerStyle, justifyContent: 'center' }}>
        <div style={{
          width: 'min(94vw, 560px)',
          maxWidth: 'calc(100vw - 1rem)',
          boxSizing: 'border-box',
          background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.98), rgba(3, 7, 18, 0.98))',
          border: '1px solid rgba(34, 197, 94, 0.42)',
          borderRadius: '8px',
          padding: 'clamp(1rem, 4vw, 1.5rem)',
          boxShadow: '0 22px 60px rgba(34, 197, 94, 0.14)',
          color: '#ffffff',
          display: 'grid',
          gap: '1rem',
        }}>
          <div style={{ display: 'grid', gap: '0.35rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem' }}>
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '3rem',
                height: '3rem',
                borderRadius: '8px',
                border: '1px solid rgba(34, 197, 94, 0.42)',
                background: 'rgba(34, 197, 94, 0.12)',
              }}>
                <span style={{ width: '1.1rem', height: '1.1rem', borderRadius: '999px', background: '#111827', border: '2px solid #64748b' }} />
                <span style={{ width: '1.1rem', height: '1.1rem', borderRadius: '999px', background: '#fff', border: '2px solid #d1d5db', marginLeft: '-0.28rem' }} />
              </span>
              <div>
                <h1 style={{ margin: 0, color: '#f8fafc', fontSize: 'clamp(1.6rem, 6vw, 2.25rem)', lineHeight: 1.05, letterSpacing: 0 }}>Othello</h1>
                <p style={{ margin: '0.3rem 0 0', color: '#9ca3af', lineHeight: 1.45 }}>
                  Pick a match type, color, and AI depth before the board opens.
                </p>
              </div>
            </div>
          </div>

          {/* Show multiplayer lobby */}
          <OthelloMultiplayerLobby
            multiplayer={multiplayer}
            onGameStart={startMultiplayerGame}
          />

          {/* AI Difficulty selector - shown when not in multiplayer lobby */}
          {!isInMultiplayerLobby && (
            <div style={{
              display: 'grid',
              gap: '1rem',
              paddingTop: '1rem',
              borderTop: '1px solid rgba(75, 85, 99, 0.72)',
            }}>
              <div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', color: '#4ade80', fontSize: '0.75rem', fontWeight: 760, textTransform: 'uppercase' }}>
                  <Cpu size={14} /> AI match
                </div>
                <h2 style={{ margin: '0.25rem 0 0', color: '#f8fafc', fontSize: '1.15rem', lineHeight: 1.2 }}>Set up single player</h2>
              </div>

              {/* Difficulty options */}
              <div style={{ display: 'grid', gap: '0.65rem', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))' }}>
                {DIFFICULTY_OPTIONS.map(option => (
                  <button
                    type="button"
                    key={option.value}
                    onClick={() => setSelectedDifficulty(option.value)}
                    style={{
                      padding: '0.85rem',
                      borderRadius: '8px',
                      border: selectedDifficulty === option.value ? '1px solid #22c55e' : '1px solid rgba(75, 85, 99, 0.75)',
                      backgroundColor: selectedDifficulty === option.value ? 'rgba(34, 197, 94, 0.22)' : 'rgba(31, 41, 55, 0.58)',
                      color: selectedDifficulty === option.value ? '#86efac' : '#d1d5db',
                      cursor: 'pointer',
                      fontSize: '0.9rem',
                      fontWeight: 700,
                      textAlign: 'left',
                    }}
                    aria-pressed={selectedDifficulty === option.value}
                  >
                    <span style={{ display: 'block' }}>{option.label}</span>
                    <span style={{ display: 'block', marginTop: '0.28rem', color: '#9ca3af', fontSize: '0.74rem', lineHeight: 1.35 }}>
                      {option.description}
                    </span>
                  </button>
                ))}
              </div>

              {renderColorSelector()}

              <button
                type="button"
                onClick={startAIGame}
                style={{
                  width: '100%',
                  minHeight: '3.1rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  padding: '0.85rem',
                  backgroundColor: '#16a34a',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                }}
              >
                <Play size={17} />
                Start vs AI ({selectedDifficultyOption.label}, {selectedPlayerColor === BLACK ? 'Black' : 'White'})
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => setShowInfoModal(true)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.45rem',
              background: 'rgba(31, 41, 55, 0.48)',
              border: '1px solid rgba(75, 85, 99, 0.75)',
              borderRadius: '8px',
              color: '#d1d5db',
              fontSize: '0.875rem',
              fontWeight: 650,
              minHeight: '2.75rem',
              padding: '0.65rem 1rem',
              cursor: 'pointer',
              width: '100%',
            }}
          >
            <CircleHelp size={16} />
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

  const _isPlayerTurn = gameState.board.getCurrentColor() === playerColor && !gameState.gameOver;
  const _isAITurn = gameState.board.getCurrentColor() === aiColor && !gameState.gameOver;

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

        {/* Move History */}
        <div style={{
          marginTop: '1rem',
          padding: '0.75rem',
          background: 'rgba(255,255,255,0.1)',
          borderRadius: '0.5rem',
          maxHeight: '200px',
          overflowY: 'auto',
        }}>
          <h3 style={{ marginBottom: '0.5rem', fontSize: '0.875rem', color: '#9ca3af' }}>Move History</h3>
          {gameState.moveHistory.length === 0 ? (
            <p style={{ color: '#6b7280', fontSize: '0.75rem' }}>No moves yet</p>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
              {gameState.moveHistory.map((entry, i) => {
                const colorLabel = entry.color === BLACK ? '●' : '○';
                const moveLabel = entry.move
                  ? `${String.fromCharCode(96 + entry.move.x)}${entry.move.y}`
                  : 'Pass';
                const isLast = i === gameState.moveHistory.length - 1;
                return (
                  <span
                    key={i}
                    style={{
                      padding: '0.125rem 0.375rem',
                      background: isLast ? 'rgba(250, 204, 21, 0.3)' : 'rgba(0,0,0,0.3)',
                      borderRadius: '0.25rem',
                      fontSize: '0.75rem',
                      color: entry.move ? '#d1d5db' : '#facc15',
                    }}
                  >
                    {entry.moveNumber}. {colorLabel}{moveLabel}
                  </span>
                );
              })}
            </div>
          )}
        </div>
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
