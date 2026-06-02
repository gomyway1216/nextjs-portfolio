/**
 * Shogi Game Component - Using Java-converted logic
 */

'use client';

import { RotateCcw } from 'lucide-react';
import { useCallback,useEffect,useRef,useState } from 'react';
import { Difficulty,GameStats,GameTopBar,InfoModal } from '../common';
import type { SerializedKyokumenImproved,SerializedTeImproved,ShogiAiWorkerClient } from '../ShogiImproved/shogiAiWorkerClient';
import { createShogiAiWorkerClient } from '../ShogiImproved/shogiAiWorkerClient';
import { toFugo } from './FugoNotation';
import { generateLegalMoves } from './GenerateMoves';
import { createInitialPosition } from './InitialPosition';
import { Kyokumen } from './Kyokumen';
import { getOpeningMoveValidated } from './OpeningBookValidated';
import { getBestMove } from './ShogiAI';
import { EMPTY,GOTE,isSente,komaValue,Position,SENTE,Te,toString } from './types';

import { useFeatureLifecycle } from '@/hooks/useActivityTracker';
const DIFFICULTY_OPTIONS = [
  { label: 'Level 1 (Easy)', value: 'easy' as Difficulty, description: 'Fast (~250ms), depth ≤4' },
  { label: 'Level 2 (Medium)', value: 'medium' as Difficulty, description: 'Balanced (~800ms), depth ≤6' },
  { label: 'Level 3 (Hard)', value: 'hard' as Difficulty, description: 'Strong (~2s), depth ≤8' },
  { label: 'Level 4 (Expert)', value: 'expert' as Difficulty, description: 'Very strong (~5s, Worker), depth ≤10' },
  { label: 'Level 5 (Master)', value: 'master' as Difficulty, description: 'Strongest (~10s, Worker), depth ≤12' },
];

interface GameState {
  kyokumen: Kyokumen;
  selectedPosition: Position | null;
  selectedCapturedIndex: number;
  validMoves: Te[];
  gameOver: boolean;
  winner: number | null;
  isAIThinking: boolean;
  lastMove: Te | null;
  moveHistory: Te[];
}

const isWorkerDifficulty = (difficulty: Difficulty): boolean =>
  difficulty === 'expert' || difficulty === 'master';

function serializeForWorker(k: Kyokumen): SerializedKyokumenImproved {
  // Board: 81 squares, (suji-major, then dan) in 1..9 range.
  const board: number[] = new Array(81);
  let idx = 0;
  for (let suji = 1; suji <= 9; suji++) {
    for (let dan = 1; dan <= 9; dan++) {
      board[idx++] = k.ban[suji][dan];
    }
  }

  // Hands: count-based by piece code (we over-allocate to be safe; the worker only copies used indices).
  const hand = new Array(64).fill(0);
  for (const koma of k.hand[0]) hand[koma] = (hand[koma] | 0) + 1;
  for (const koma of k.hand[1]) hand[koma] = (hand[koma] | 0) + 1;

  return { board, hand, teban: k.teban };
}

function convertWorkerMoveToMainTe(move: SerializedTeImproved): Te {
  const from =
    move.from === 0 ? new Position(0, 0) : new Position(move.from >> 4, move.from & 0x0f);
  const to = new Position(move.to >> 4, move.to & 0x0f);
  return new Te(move.koma, from, to, move.promote);
}

const Shogi = () => {
  useFeatureLifecycle('game.shogi');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [playerSide, setPlayerSide] = useState<number>(SENTE); // Player's side (SENTE or GOTE)
  const [showDifficultySelect, setShowDifficultySelect] = useState<boolean>(true);
  const [showInfoModal, setShowInfoModal] = useState<boolean>(false);
  const [stats, setStats] = useState<GameStats>({ wins: 0, losses: 0, draws: 0 });
  const [showPromotionDialog, setShowPromotionDialog] = useState<boolean>(false);
  const [pendingMove, setPendingMove] = useState<Te | null>(null);

  // Level 4/5 search runs in a Worker to avoid blocking the UI.
  const workerRef = useRef<ShogiAiWorkerClient | null>(null);
  const aiRequestIdRef = useRef(0);
  const getWorker = useCallback((): ShogiAiWorkerClient => {
    if (!workerRef.current) workerRef.current = createShogiAiWorkerClient();
    return workerRef.current;
  }, []);
  const invalidatePendingAi = useCallback(() => {
    aiRequestIdRef.current++;
  }, []);
  useEffect(() => {
    // Terminate worker on unmount.
    return () => {
      invalidatePendingAi();
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, [invalidatePendingAi]);

  const [gameState, setGameState] = useState<GameState>({
    kyokumen: createInitialPosition(),
    selectedPosition: null,
    selectedCapturedIndex: -1,
    validMoves: [],
    gameOver: false,
    winner: null,
    isAIThinking: false,
    lastMove: null,
    moveHistory: [],
  });

  // Helper: Check if a piece belongs to the player
  const isPlayerPiece = useCallback((koma: number): boolean => {
    if (koma === EMPTY) return false;
    return playerSide === SENTE ? isSente(koma) : !isSente(koma);
  }, [playerSide]);

  // Helper: Get AI side
  const getAISide = useCallback((): number => {
    return playerSide === SENTE ? GOTE : SENTE;
  }, [playerSide]);

  // Initialize game
  const initGame = useCallback(() => {
    // Invalidate any in-flight AI computation (timeouts/worker) from the previous game.
    aiRequestIdRef.current++;

    // New game: clear TT so Level 4/5 starts from a clean cache (optional but helps consistency).
    workerRef.current?.clearTT();

    const kyokumen = createInitialPosition();
    setGameState({
      kyokumen,
      selectedPosition: null,
      selectedCapturedIndex: -1,
      validMoves: [],
      gameOver: false,
      winner: null,
      isAIThinking: kyokumen.teban === getAISide(),
      lastMove: null,
      moveHistory: [],
    });
    setShowPromotionDialog(false);
    setPendingMove(null);
  }, [getAISide]);

  // Check for game over
  const checkGameOver = (k: Kyokumen): { isOver: boolean; winner: number | null } => {
    const moves = generateLegalMoves(k);
    if (moves.length === 0) {
      // No legal moves - checkmate
      return { isOver: true, winner: k.teban === SENTE ? GOTE : SENTE };
    }
    return { isOver: false, winner: null };
  };

  // Execute move
  const executeMove = (te: Te, promote: boolean) => {
    const newKyokumen = gameState.kyokumen.clone();
    te.promote = promote;
    newKyokumen.move(te);
    newKyokumen.teban = getAISide();

    const { isOver, winner } = checkGameOver(newKyokumen);

    setGameState(prev => ({
      ...prev,
      kyokumen: newKyokumen,
      selectedPosition: null,
      selectedCapturedIndex: -1,
      validMoves: [],
      gameOver: isOver,
      winner,
      isAIThinking: !isOver,
      lastMove: te,
      moveHistory: [...prev.moveHistory, te],
    }));

    if (isOver && winner === playerSide) {
      setStats(prev => ({ ...prev, wins: prev.wins + 1 }));
    }

    setShowPromotionDialog(false);
    setPendingMove(null);
  };

  // Handle board cell click
  const handleCellClick = (suji: number, dan: number) => {
    if (gameState.gameOver || gameState.kyokumen.teban !== playerSide || gameState.isAIThinking) {
      return;
    }

    const clickedPos = new Position(suji, dan);
    const clickedPiece = gameState.kyokumen.get(clickedPos);

    // If captured piece is selected, try to drop it
    if (gameState.selectedCapturedIndex >= 0) {
      const handIndex = playerSide === SENTE ? 0 : 1;
      const handPiece = gameState.kyokumen.hand[handIndex][gameState.selectedCapturedIndex];
      const dropMove = gameState.validMoves.find(
        m => m.from.suji === 0 && m.from.dan === 0 && m.to.suji === suji && m.to.dan === dan && m.koma === handPiece
      );

      if (dropMove) {
        executeMove(dropMove, false);
      } else {
        // Deselect
        setGameState(prev => ({ ...prev, selectedCapturedIndex: -1, validMoves: [] }));
      }
      return;
    }

    // If piece is selected
    if (gameState.selectedPosition) {
      // Check if this is a valid move
      const move = gameState.validMoves.find(
        m => m.to.suji === suji && m.to.dan === dan && m.from.equals(gameState.selectedPosition!)
      );

      if (move) {
        const promoteMove = gameState.validMoves.find(
          m => m.to.equals(clickedPos) && m.from.equals(gameState.selectedPosition!) && m.promote
        );
        const nonPromoteMove = gameState.validMoves.find(
          m => m.to.equals(clickedPos) && m.from.equals(gameState.selectedPosition!) && !m.promote
        );

        // Show dialog only when there are *both* options.
        if (promoteMove && nonPromoteMove) {
          setPendingMove(nonPromoteMove);
          setShowPromotionDialog(true);
        } else if (promoteMove) {
          // Forced promotion (e.g., pawn/lance/knight reaching last ranks).
          executeMove(promoteMove, true);
        } else if (nonPromoteMove) {
          executeMove(nonPromoteMove, false);
        }
      } else if (clickedPiece !== EMPTY && isPlayerPiece(clickedPiece)) {
        // Select different piece
        const allMoves = generateLegalMoves(gameState.kyokumen);
        const pieceMoves = allMoves.filter(m => m.from.equals(clickedPos));
        setGameState(prev => ({
          ...prev,
          selectedPosition: clickedPos,
          validMoves: pieceMoves,
        }));
      } else {
        // Deselect
        setGameState(prev => ({ ...prev, selectedPosition: null, validMoves: [] }));
      }
    } else if (clickedPiece !== EMPTY && isPlayerPiece(clickedPiece)) {
      // Select piece
      const allMoves = generateLegalMoves(gameState.kyokumen);
      const pieceMoves = allMoves.filter(m => m.from.equals(clickedPos));
      setGameState(prev => ({
        ...prev,
        selectedPosition: clickedPos,
        validMoves: pieceMoves,
      }));
    }
  };

  // Handle captured piece click
  const handleCapturedClick = (index: number) => {
    if (gameState.gameOver || gameState.kyokumen.teban !== playerSide || gameState.isAIThinking) {
      return;
    }

    const handIndex = playerSide === SENTE ? 0 : 1;
    const handPiece = gameState.kyokumen.hand[handIndex][index];
    const allMoves = generateLegalMoves(gameState.kyokumen);
    const dropMoves = allMoves.filter(m => m.from.suji === 0 && m.from.dan === 0 && m.koma === handPiece);

    setGameState(prev => ({
      ...prev,
      selectedPosition: null,
      selectedCapturedIndex: index,
      validMoves: dropMoves,
    }));
  };

  // AI move
  useEffect(() => {
    const aiSide = getAISide();
    if (
      gameState.kyokumen.teban === aiSide &&
      !gameState.gameOver &&
      gameState.isAIThinking
    ) {
      const requestId = ++aiRequestIdRef.current;

      const timeoutId = window.setTimeout(() => {
        if (aiRequestIdRef.current !== requestId) return;

        // Check if AI has any legal moves first
        const legalMoves = generateLegalMoves(gameState.kyokumen);

        if (legalMoves.length === 0) {
          // AI is in checkmate
          setGameState(prev => ({
            ...prev,
            isAIThinking: false,
            gameOver: true,
            winner: playerSide,
          }));
          setStats(prev => ({ ...prev, wins: prev.wins + 1 }));
          return;
        }

        const moveNumber = gameState.moveHistory.length + 1;

        // Opening book first (keeps variety and reduces early compute).
        if (moveNumber <= 12) {
          const opening = getOpeningMoveValidated(gameState.kyokumen, moveNumber, aiSide, gameState.moveHistory, { difficulty });
          if (opening) {
            const newKyokumen = gameState.kyokumen.clone();
            newKyokumen.move(opening);
            newKyokumen.teban = playerSide;

            const { isOver, winner } = checkGameOver(newKyokumen);

            setGameState(prev => ({
              ...prev,
              kyokumen: newKyokumen,
              isAIThinking: false,
              gameOver: isOver,
              winner,
              lastMove: opening,
              moveHistory: [...prev.moveHistory, opening],
            }));

            if (isOver && winner === aiSide) {
              setStats(prev => ({ ...prev, losses: prev.losses + 1 }));
            }
            return;
          }
        }

        // Levels 1-3: compute on main thread.
        // Levels 4-5: compute in a Worker with higher time budgets (combined strategy).
        if (!isWorkerDifficulty(difficulty)) {
          const aiMove = getBestMove(
            gameState.kyokumen,
            aiSide,
            difficulty,
            moveNumber,
            gameState.moveHistory
          );

          if (aiMove) {
            const newKyokumen = gameState.kyokumen.clone();
            newKyokumen.move(aiMove);
            newKyokumen.teban = playerSide;

            const { isOver, winner } = checkGameOver(newKyokumen);

            setGameState(prev => ({
              ...prev,
              kyokumen: newKyokumen,
              isAIThinking: false,
              gameOver: isOver,
              winner,
              lastMove: aiMove,
              moveHistory: [...prev.moveHistory, aiMove],
            }));

            if (isOver && winner === aiSide) {
              setStats(prev => ({ ...prev, losses: prev.losses + 1 }));
            }
          } else {
            // AI couldn't find a move (shouldn't happen if legalMoves > 0)
            setGameState(prev => ({
              ...prev,
              isAIThinking: false,
              gameOver: true,
              winner: playerSide,
            }));
            setStats(prev => ({ ...prev, wins: prev.wins + 1 }));
          }
          return;
        }

        const worker = getWorker();
        const position = serializeForWorker(gameState.kyokumen);
        worker
          .requestBestMove(position, difficulty, moveNumber - 1)
          .then((move) => {
            if (aiRequestIdRef.current !== requestId) return;

            const aiMove = move ? convertWorkerMoveToMainTe(move) : null;
            if (!aiMove) {
              setGameState(prev => ({
                ...prev,
                isAIThinking: false,
                gameOver: true,
                winner: playerSide,
              }));
              setStats(prev => ({ ...prev, wins: prev.wins + 1 }));
              return;
            }

            const newKyokumen = gameState.kyokumen.clone();
            newKyokumen.move(aiMove);
            newKyokumen.teban = playerSide;

            const { isOver, winner } = checkGameOver(newKyokumen);

            setGameState(prev => ({
              ...prev,
              kyokumen: newKyokumen,
              isAIThinking: false,
              gameOver: isOver,
              winner,
              lastMove: aiMove,
              moveHistory: [...prev.moveHistory, aiMove],
            }));

            if (isOver && winner === aiSide) {
              setStats(prev => ({ ...prev, losses: prev.losses + 1 }));
            }
          })
          .catch(() => {
            if (aiRequestIdRef.current !== requestId) return;
            setGameState(prev => ({ ...prev, isAIThinking: false }));
          });
        return;

      }, 500);

      return () => window.clearTimeout(timeoutId);
    }
  }, [
    gameState.kyokumen,
    gameState.kyokumen.teban,
    gameState.moveHistory,
    gameState.gameOver,
    gameState.isAIThinking,
    difficulty,
    playerSide,
    getAISide,
    getWorker,
  ]);

  const startGame = () => {
    setShowDifficultySelect(false);
    initGame();
  };

  const resetGame = () => {
    initGame();
  };

  // Render piece
  const renderPiece = (suji: number, dan: number) => {
    const koma = gameState.kyokumen.ban[suji][dan];
    if (koma === EMPTY) return null;

    const isSelected =
      gameState.selectedPosition &&
      gameState.selectedPosition.suji === suji &&
      gameState.selectedPosition.dan === dan;

    // Check if this is the last move (either from or to position)
    const isLastMoveFrom = gameState.lastMove &&
      gameState.lastMove.from.suji === suji &&
      gameState.lastMove.from.dan === dan;
    const isLastMoveTo = gameState.lastMove &&
      gameState.lastMove.to.suji === suji &&
      gameState.lastMove.to.dan === dan;

    const pieceText = toString(koma);
    const pieceIsSente = isSente(koma);

    // Determine if piece should be rotated based on player's side
    // When player is Sente: rotate Gote pieces
    // When player is Gote: rotate Sente pieces
    const shouldRotate = playerSide === SENTE ? !pieceIsSente : pieceIsSente;

    let backgroundColor = 'transparent';
    if (isSelected) {
      backgroundColor = 'rgba(66, 153, 225, 0.3)';
    } else if (isLastMoveTo) {
      backgroundColor = 'rgba(255, 215, 0, 0.4)'; // Gold highlight for destination
    } else if (isLastMoveFrom) {
      backgroundColor = 'rgba(255, 215, 0, 0.2)'; // Lighter gold for source
    }

    return (
      <div
        style={{
          fontSize: '1.5rem',
          fontWeight: 'bold',
          color: pieceIsSente ? '#000' : '#c00',
          transform: shouldRotate ? 'rotate(180deg)' : 'none',
          backgroundColor,
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '4px',
        }}
      >
        {pieceText}
      </div>
    );
  };

  if (showDifficultySelect) {
    return (
      <div style={{
        minHeight: '100vh',
        background: '#1a1a2e',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px'
      }}>
        <div style={{
          background: 'rgba(0, 0, 0, 0.95)',
          border: '3px solid #0ea5e9',
          borderRadius: '1rem',
          padding: 'clamp(1.25rem, 6vw, 3rem)',
          boxShadow: '0 0 50px rgba(14, 165, 233, 0.3)',
          width: 'min(500px, 100%)'
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
            ☗ Shogi
          </h1>
          <p style={{
            color: '#9ca3af',
            textAlign: 'center',
            marginBottom: '2rem'
          }}>
            Japanese Chess
          </p>

          {/* Side Selection */}
          <h2 style={{
            color: '#fff',
            fontSize: '1.5rem',
            fontWeight: 'bold',
            marginBottom: '1rem',
            textAlign: 'center'
          }}>
            Choose Your Side
          </h2>
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '1rem',
            marginBottom: '2rem'
          }}>
            <button
              onClick={() => setPlayerSide(SENTE)}
              style={{
                flex: 1,
                background: playerSide === SENTE ? 'rgba(59, 130, 246, 0.5)' : 'rgba(31, 41, 55, 0.5)',
                border: `2px solid ${playerSide === SENTE ? '#3b82f6' : 'rgba(75, 85, 99, 1)'}`,
                borderRadius: '0.5rem',
                color: playerSide === SENTE ? '#fff' : '#9ca3af',
                padding: '1rem',
                fontSize: '1.125rem',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              ☗ Sente (First)
              <div style={{ fontSize: '0.75rem', marginTop: '0.25rem', opacity: 0.8 }}>
                Black / You move first
              </div>
            </button>
            <button
              onClick={() => setPlayerSide(GOTE)}
              style={{
                flex: 1,
                background: playerSide === GOTE ? 'rgba(220, 38, 38, 0.5)' : 'rgba(31, 41, 55, 0.5)',
                border: `2px solid ${playerSide === GOTE ? '#dc2626' : 'rgba(75, 85, 99, 1)'}`,
                borderRadius: '0.5rem',
                color: playerSide === GOTE ? '#fff' : '#9ca3af',
                padding: '1rem',
                fontSize: '1.125rem',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              ☖ Gote (Second)
              <div style={{ fontSize: '0.75rem', marginTop: '0.25rem', opacity: 0.8 }}>
                White / AI moves first
              </div>
            </button>
          </div>

          {/* Difficulty Selection */}
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
            {DIFFICULTY_OPTIONS.map((option) => {
              const isSelected = difficulty === option.value;
              return (
                <button
                  key={option.value}
                  onClick={() => setDifficulty(option.value)}
                  style={{
                    background: isSelected ? 'rgba(16, 185, 129, 0.3)' : 'rgba(31, 41, 55, 0.5)',
                    border: `2px solid ${isSelected ? '#10b981' : 'rgba(75, 85, 99, 1)'}`,
                    borderRadius: '0.5rem',
                    color: isSelected ? '#10b981' : '#9ca3af',
                    padding: '1rem',
                    fontSize: '1.125rem',
                    fontWeight: '600',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    textTransform: 'uppercase'
                  }}
                >
                  {option.label}
                  <div style={{ fontSize: '0.75rem', marginTop: '0.25rem', opacity: 0.8 }}>
                    {option.description}
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
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#1a1a2e', color: '#fff', padding: '20px' }}>
      <GameTopBar
        stats={stats}
        onInfoClick={() => setShowInfoModal(true)}
        additionalContent={
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {gameState.isAIThinking && <span style={{ color: '#ffd700' }}>AI Thinking...</span>}
          </div>
        }
      />

      <div style={{ maxWidth: '1600px', margin: '4rem auto 0', display: 'flex', flexWrap: 'wrap', gap: '20px', justifyContent: 'center', alignItems: 'stretch' }}>
        {/* AI Captured Pieces - Left side */}
        <div style={{ flex: '1 1 100px', maxWidth: '160px', display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ marginBottom: '10px', fontSize: '0.9rem', textAlign: 'center' }}>
            {playerSide === SENTE ? 'AI (後手)' : 'AI (先手)'}
          </h3>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '5px',
              padding: '10px',
              background: 'rgba(255,255,255,0.1)',
              borderRadius: '8px',
              flex: 1,
              minHeight: 'min(500px, 60vh)',
            }}
          >
            {[...gameState.kyokumen.hand[playerSide === SENTE ? 1 : 0]]
              .sort((a, b) => Math.abs(komaValue[b]) - Math.abs(komaValue[a]))
              .map((koma, i) => (
                <div
                  key={i}
                  style={{
                    padding: '8px',
                    background: 'rgba(200,0,0,0.2)',
                    borderRadius: '4px',
                    fontSize: '1.4rem',
                    textAlign: 'center',
                    transform: 'rotate(180deg)',
                  }}
                >
                  {toString(koma)}
                </div>
              ))}
          </div>
        </div>

        {/* Board */}
        <div style={{ flex: '0 1 auto', maxWidth: '100%', overflowX: 'auto' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(9, clamp(32px, 7.2vw, 65px))',
              gap: '1px',
              background: '#333',
              border: '3px solid #666',
              padding: '1px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
            }}
          >
            {Array.from({ length: 9 }, (_, danIdx) =>
              Array.from({ length: 9 }, (_, sujiIdx) => {
                // Flip board if player is Gote
                const suji = playerSide === SENTE ? (9 - sujiIdx) : (sujiIdx + 1);
                const actualDan = playerSide === SENTE ? (danIdx + 1) : (9 - danIdx);

                const isValidMove = gameState.validMoves.some(
                  m => m.to.suji === suji && m.to.dan === actualDan
                );

                return (
                  <div
                    key={`${suji}-${actualDan}`}
                    onClick={() => handleCellClick(suji, actualDan)}
                    style={{
                      width: 'clamp(32px, 7.2vw, 65px)',
                      height: 'clamp(32px, 7.2vw, 65px)',
                      background: isValidMove ? 'rgba(0, 255, 0, 0.2)' : '#ffe8b8',
                      border: '1px solid #8b7355',
                      cursor: 'pointer',
                      position: 'relative',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {renderPiece(suji, actualDan)}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Human Captured Pieces - Right side */}
        <div style={{ flex: '1 1 100px', maxWidth: '160px', display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ marginBottom: '10px', fontSize: '0.9rem', textAlign: 'center' }}>
            {playerSide === SENTE ? 'You (先手)' : 'You (後手)'}
          </h3>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '5px',
              padding: '10px',
              background: 'rgba(255,255,255,0.1)',
              borderRadius: '8px',
              flex: 1,
              minHeight: 'min(500px, 60vh)',
            }}
          >
            {(() => {
              const handIndex = playerSide === SENTE ? 0 : 1;
              const sortedPieces = gameState.kyokumen.hand[handIndex]
                .map((koma, originalIndex) => ({ koma, originalIndex }))
                .sort((a, b) => Math.abs(komaValue[b.koma]) - Math.abs(komaValue[a.koma]));

              return sortedPieces.map(({ koma, originalIndex }, i) => (
                <div
                  key={i}
                  onClick={() => handleCapturedClick(originalIndex)}
                  style={{
                    padding: '8px',
                    background:
                      gameState.selectedCapturedIndex === originalIndex
                        ? 'rgba(66,153,225,0.5)'
                        : 'rgba(0,200,0,0.2)',
                    borderRadius: '4px',
                    fontSize: '1.4rem',
                    textAlign: 'center',
                    cursor: 'pointer',
                    border: gameState.selectedCapturedIndex === originalIndex ? '2px solid #4299e1' : '2px solid transparent',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    if (gameState.selectedCapturedIndex !== originalIndex) {
                      e.currentTarget.style.background = 'rgba(0,255,0,0.3)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (gameState.selectedCapturedIndex !== originalIndex) {
                      e.currentTarget.style.background = 'rgba(0,200,0,0.2)';
                    }
                  }}
                >
                  {toString(koma)}
                </div>
              ));
            })()}
          </div>
        </div>

        {/* Move History */}
        <div style={{ flex: '1 1 200px', maxWidth: '260px', display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ marginBottom: '10px', fontSize: '0.9rem' }}>Move History</h3>
          <div
            style={{
              padding: '10px',
              background: 'rgba(255,255,255,0.1)',
              borderRadius: '8px',
              flex: 1,
              minHeight: 'min(500px, 60vh)',
              maxHeight: '600px',
              overflowY: 'auto',
            }}
          >
            {gameState.moveHistory.length === 0 ? (
              <p style={{ color: '#888' }}>No moves yet</p>
            ) : (
              <div>
                {gameState.moveHistory.map((move, i) => (
                  <div
                    key={i}
                    style={{
                      padding: '5px',
                      marginBottom: '3px',
                      background: i === gameState.moveHistory.length - 1 ? 'rgba(255,215,0,0.2)' : 'rgba(0,0,0,0.2)',
                      borderRadius: '4px',
                      fontSize: '0.9rem',
                      display: 'flex',
                      gap: '8px',
                    }}
                  >
                    <span style={{ color: '#888', minWidth: '30px' }}>{i + 1}.</span>
                    <span>{toFugo(move)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Game Over */}
      {gameState.gameOver && (
        <div style={{ textAlign: 'center', marginTop: '30px' }}>
          <h2 style={{ fontSize: '2rem', marginBottom: '20px' }}>
            {gameState.winner === SENTE ? '🎉 You Win!' : '😔 AI Wins!'}
          </h2>
          <button
            onClick={resetGame}
            style={{
              padding: '12px 30px',
              fontSize: '1.1rem',
              background: '#4299e1',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <RotateCcw size={20} />
            Play Again
          </button>
        </div>
      )}

      {/* Promotion Dialog */}
      {showPromotionDialog && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: '#2d3748',
              padding: '30px',
              borderRadius: '12px',
              textAlign: 'center',
            }}
          >
            <h3 style={{ marginBottom: '20px', fontSize: '1.5rem' }}>Promote Piece?</h3>
            <div style={{ display: 'flex', gap: '20px' }}>
              <button
                onClick={() => pendingMove && executeMove(pendingMove, true)}
                style={{
                  padding: '12px 30px',
                  background: '#48bb78',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '1rem',
                }}
              >
                Promote
              </button>
              <button
                onClick={() => pendingMove && executeMove(pendingMove, false)}
                style={{
                  padding: '12px 30px',
                  background: '#cbd5e0',
                  color: '#000',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '1rem',
                }}
              >
                Keep Original
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Info Modal */}
      <InfoModal isOpen={showInfoModal} onClose={() => setShowInfoModal(false)} title="How to Play Shogi">
        <div style={{ lineHeight: '1.6' }}>
          <p>
            <strong>Objective:</strong> Capture the opponent&apos;s King (王/玉)
          </p>
          <p>
            <strong>Basic Rules:</strong>
          </p>
          <ul>
            <li>Each piece has unique movement patterns</li>
            <li>Pieces can be promoted when entering or within enemy territory (top 3 rows)</li>
            <li>Captured pieces can be dropped back on the board as your own</li>
            <li>Cannot drop pawns for checkmate or have two unpromoted pawns in same column</li>
          </ul>
          <p>
            <strong>Controls:</strong>
          </p>
          <ul>
            <li>Click a piece to select it</li>
            <li>Click a highlighted square to move</li>
            <li>Click captured pieces to drop them</li>
            <li>Choose to promote when entering promotion zone</li>
          </ul>
        </div>
      </InfoModal>
    </div>
  );
};

export default Shogi;
