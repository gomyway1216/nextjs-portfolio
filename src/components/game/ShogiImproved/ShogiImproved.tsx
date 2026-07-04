/**
 * Shogi Improved Game Component - Using Chapter 11 Java-converted logic
 */

'use client';

import { useFeatureLifecycle } from '@/hooks/useActivityTracker';
import { useAuth } from '@/providers/AuthProvider';
import * as gameSaveApi from '@/services/gameSaveService';
import { RotateCcw } from 'lucide-react';
import React,{ useCallback,useEffect,useRef,useState } from 'react';
import { Difficulty,DifficultySelector,GameStats,GameTopBar,InfoModal } from '../common';
import { GenerateMovesImproved } from './GenerateMovesImproved';
import { InitialPositionImproved } from './InitialPositionImproved';
import { KyokumenImproved } from './KyokumenImproved';
import { getOpeningMoveImproved } from './OpeningBookImproved';
import { getBestMoveV20 } from './ShogiAIImprovedV20';
import type { SerializedKyokumenImproved,SerializedTeImproved,ShogiAiWorkerClient } from './shogiAiWorkerClient';
import { createShogiAiWorkerClient } from './shogiAiWorkerClient';
import { EMPTY,GOTE,isSente,Position,SENTE,Te,toString } from './types';

const DIFFICULTY_OPTIONS = [
  { label: 'Level 1 (Easy)', value: 'easy' as Difficulty, description: 'Fast (~250ms)' },
  { label: 'Level 2 (Medium)', value: 'medium' as Difficulty, description: 'Balanced (~1s)' },
  { label: 'Level 3 (Hard)', value: 'hard' as Difficulty, description: 'Strong (~2s)' },
  { label: 'Level 4 (Expert)', value: 'expert' as Difficulty, description: 'Very strong (~4s)' },
  { label: 'Level 5 (Master)', value: 'master' as Difficulty, description: 'Strongest (~5s)' },
];

// All difficulties run in the Worker: the WASM search engine lives there
// (with the JS book/mate-solver/V20 fallback), and even easy's ~250ms search
// benefits from staying off the main thread. The main-thread path below is
// kept only as a fallback for when the worker itself fails to load/respond.
const isWorkerDifficulty = (_difficulty: Difficulty): boolean => true;

function serializeForWorker(k: KyokumenImproved): SerializedKyokumenImproved {
  const board: number[] = new Array(81);
  let idx = 0;
  for (let suji = 1; suji <= 9; suji++) {
    for (let dan = 1; dan <= 9; dan++) {
      board[idx++] = k.ban[(suji << 4) + dan];
    }
  }

  return { board, hand: [...k.hand], teban: k.teban };
}

function convertWorkerMoveToImprovedTe(move: SerializedTeImproved): Te {
  return new Te(move.koma, move.from, move.to, move.promote, 0);
}

// Inverse of serializeForWorker — mirrors the worker's buildPosition()
// so a restored position gets its incremental state (eval / king
// positions / hash) recomputed via initAll().
function deserializeKyokumen(saved: { board: number[]; hand: number[]; teban: number }): KyokumenImproved {
  const k = new KyokumenImproved();
  let idx = 0;
  for (let suji = 1; suji <= 9; suji++) {
    for (let dan = 1; dan <= 9; dan++) {
      k.ban[(suji << 4) + dan] = saved.board[idx++] ?? 0;
    }
  }
  const limit = Math.min(k.hand.length, saved.hand.length);
  for (let i = 0; i < limit; i++) {
    k.hand[i] = saved.hand[i] | 0;
  }
  k.teban = saved.teban;
  k.initAll();
  return k;
}

const GAME_SAVE_KEY = 'shogi-improved';

interface SavedShogiGame {
  board: number[];
  hand: number[];
  teban: number;
  ply: number;
  difficulty: Difficulty;
}

const VALID_DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard', 'expert', 'master'];

function isValidSavedGame(value: unknown): value is SavedShogiGame {
  if (!value || typeof value !== 'object') return false;
  const save = value as Partial<SavedShogiGame>;
  return (
    Array.isArray(save.board) &&
    save.board.length === 81 &&
    Array.isArray(save.hand) &&
    typeof save.teban === 'number' &&
    typeof save.ply === 'number' &&
    VALID_DIFFICULTIES.includes(save.difficulty as Difficulty)
  );
}

interface GameState {
  kyokumen: KyokumenImproved;
  selectedPosition: Position | null;
  selectedCapturedIndex: number;
  validMoves: Te[];
  gameOver: boolean;
  winner: number | null;
  isAIThinking: boolean;
  ply: number; // 0-based ply count from game start
}

const ShogiImproved = () => {
  const _lifecycle = useFeatureLifecycle('game.shogi-improved');
  const { currentUser } = useAuth();
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [showDifficultySelect, setShowDifficultySelect] = useState<boolean>(true);
  const [showInfoModal, setShowInfoModal] = useState<boolean>(false);
  const [stats, setStats] = useState<GameStats>({ wins: 0, losses: 0, draws: 0 });
  const [showPromotionDialog, setShowPromotionDialog] = useState<boolean>(false);
  const [pendingMove, setPendingMove] = useState<Te | null>(null);
  // Mid-game save slot (signed-in users only).
  const [savedGame, setSavedGame] = useState<SavedShogiGame | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const workerRef = useRef<ShogiAiWorkerClient | null>(null);
  const aiRequestIdRef = useRef(0);
  const getWorker = useCallback((): ShogiAiWorkerClient => {
    if (!workerRef.current) workerRef.current = createShogiAiWorkerClient();
    return workerRef.current;
  }, []);
  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

	  const [gameState, setGameState] = useState<GameState>({
	    kyokumen: InitialPositionImproved.createInitialPosition(),
	    selectedPosition: null,
	    selectedCapturedIndex: -1,
	    validMoves: [],
	    gameOver: false,
	    winner: null,
	    isAIThinking: false,
	    ply: 0,
	  });

  // Convert hand counts to arrays for UI compatibility
  const capturedPieces = React.useMemo(() => {
    return gameState.kyokumen.toHandArrays();
  }, [gameState.kyokumen]);

  // Initialize game
	  const initGame = useCallback(() => {
    // Invalidate any in-flight worker request.
    aiRequestIdRef.current++;
    workerRef.current?.clearTT();

	    setGameState({
	      kyokumen: InitialPositionImproved.createInitialPosition(),
	      selectedPosition: null,
	      selectedCapturedIndex: -1,
	      validMoves: [],
	      gameOver: false,
	      winner: null,
	      isAIThinking: false,
	      ply: 0,
	    });
    setShowPromotionDialog(false);
    setPendingMove(null);
  }, []);

  // Check for game over
  const checkGameOver = (k: KyokumenImproved): { isOver: boolean; winner: number | null } => {
    const moves = GenerateMovesImproved.generateLegalMoves(k);
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
	    newKyokumen.setTeban(GOTE);

    const { isOver, winner } = checkGameOver(newKyokumen);

	    setGameState(prev => ({
	      ...prev,
	      kyokumen: newKyokumen,
	      selectedPosition: null,
	      selectedCapturedIndex: -1,
	      validMoves: [],
	      gameOver: isOver,
	      winner,
	      ply: prev.ply + 1,
	    }));

    if (isOver && winner === SENTE) {
      setStats(prev => ({ ...prev, wins: prev.wins + 1 }));
    }

    setShowPromotionDialog(false);
    setPendingMove(null);
  };

  // Handle board cell click
  const handleCellClick = (suji: number, dan: number) => {
    if (gameState.gameOver || gameState.kyokumen.teban !== SENTE || gameState.isAIThinking) {
      return;
    }

    const clickedPos = new Position(suji, dan);
    const clickedPosInt = clickedPos.toInt();
    const clickedPiece = gameState.kyokumen.get(clickedPosInt);

    // If captured piece is selected, try to drop it
    if (gameState.selectedCapturedIndex >= 0) {
      const handPiece = capturedPieces[0][gameState.selectedCapturedIndex];
      const dropMove = gameState.validMoves.find(
        m => m.from === 0 && m.to === clickedPosInt && m.koma === handPiece
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
      const selectedPosInt = gameState.selectedPosition.toInt();

      // Check if this is a valid move
      const move = gameState.validMoves.find(
        m => m.to === clickedPosInt && m.from === selectedPosInt
      );

      if (move) {
        const promoteMove = gameState.validMoves.find(
          m => m.to === clickedPosInt && m.from === selectedPosInt && m.promote
        );
        const nonPromoteMove = gameState.validMoves.find(
          m => m.to === clickedPosInt && m.from === selectedPosInt && !m.promote
        );

        // Show dialog only when the player actually has a choice.
        if (promoteMove && nonPromoteMove) {
          setPendingMove(nonPromoteMove);
          setShowPromotionDialog(true);
        } else if (promoteMove) {
          // Forced promotion (e.g., pawn/lance/knight reaching last ranks) or always-promote heuristics.
          executeMove(promoteMove, true);
        } else if (nonPromoteMove) {
          executeMove(nonPromoteMove, false);
        }
      } else if (clickedPiece !== EMPTY && isSente(clickedPiece)) {
        // Select different piece
        const allMoves = GenerateMovesImproved.generateLegalMoves(gameState.kyokumen);
        const pieceMoves = allMoves.filter(m => m.from === clickedPosInt);
        setGameState(prev => ({
          ...prev,
          selectedPosition: clickedPos,
          validMoves: pieceMoves,
        }));
      } else {
        // Deselect
        setGameState(prev => ({ ...prev, selectedPosition: null, validMoves: [] }));
      }
    } else if (clickedPiece !== EMPTY && isSente(clickedPiece)) {
      // Select piece
      const allMoves = GenerateMovesImproved.generateLegalMoves(gameState.kyokumen);
      const pieceMoves = allMoves.filter(m => m.from === clickedPosInt);
      setGameState(prev => ({
        ...prev,
        selectedPosition: clickedPos,
        validMoves: pieceMoves,
      }));
    }
  };

  // Handle captured piece click
  const handleCapturedClick = (index: number) => {
    if (gameState.gameOver || gameState.kyokumen.teban !== SENTE || gameState.isAIThinking) {
      return;
    }

    const handPiece = capturedPieces[0][index];
    const allMoves = GenerateMovesImproved.generateLegalMoves(gameState.kyokumen);
    const dropMoves = allMoves.filter(m => m.from === 0 && m.koma === handPiece);

    setGameState(prev => ({
      ...prev,
      selectedPosition: null,
      selectedCapturedIndex: index,
      validMoves: dropMoves,
    }));
  };

  // AI move
  useEffect(() => {
    if (
      gameState.kyokumen.teban === GOTE &&
      !gameState.gameOver &&
      !gameState.isAIThinking
    ) {
      const requestId = ++aiRequestIdRef.current;
      setGameState(prev => ({ ...prev, isAIThinking: true }));

      setTimeout(() => {
        if (aiRequestIdRef.current !== requestId) return;

        // Check if AI has any legal moves first
        const legalMoves = GenerateMovesImproved.generateLegalMoves(gameState.kyokumen);

	        if (legalMoves.length === 0) {
	          // AI is in checkmate
	          setGameState(prev => ({
	            ...prev,
            isAIThinking: false,
            gameOver: true,
            winner: SENTE,
          }));
          setStats(prev => ({ ...prev, wins: prev.wins + 1 }));
	          return;
	        }

	        const bookMove = getOpeningMoveImproved(gameState.kyokumen.clone(), difficulty);
	        if (bookMove) {
	          const newKyokumen = gameState.kyokumen.clone();
	          newKyokumen.move(bookMove);
	          newKyokumen.setTeban(SENTE);

	          const { isOver, winner } = checkGameOver(newKyokumen);

	          setGameState(prev => ({
	            ...prev,
	            kyokumen: newKyokumen,
	            isAIThinking: false,
	            gameOver: isOver,
	            winner,
	          }));

	          if (isOver && winner === GOTE) {
	            setStats(prev => ({ ...prev, losses: prev.losses + 1 }));
	          }
	          return;
	        }

		        if (!isWorkerDifficulty(difficulty)) {
		          const aiMove = getBestMoveV20(gameState.kyokumen, GOTE, difficulty, gameState.ply);
		
		          if (aiMove) {
		            const newKyokumen = gameState.kyokumen.clone();
		            newKyokumen.move(aiMove);
	            newKyokumen.setTeban(SENTE);

            const { isOver, winner } = checkGameOver(newKyokumen);

	            setGameState(prev => ({
	              ...prev,
	              kyokumen: newKyokumen,
	              isAIThinking: false,
	              gameOver: isOver,
	              winner,
	              ply: prev.ply + 1,
	            }));

            if (isOver && winner === GOTE) {
              setStats(prev => ({ ...prev, losses: prev.losses + 1 }));
            }
          } else {
            // AI couldn't find a move (shouldn't happen if legalMoves > 0)
            setGameState(prev => ({
              ...prev,
              isAIThinking: false,
              gameOver: true,
              winner: SENTE,
            }));
            setStats(prev => ({ ...prev, wins: prev.wins + 1 }));
          }
          return;
        }

		        const worker = getWorker();
		        const position = serializeForWorker(gameState.kyokumen);
		        worker
		          .requestBestMove(position, difficulty, gameState.ply)
		          .then((move) => {
            if (aiRequestIdRef.current !== requestId) return;

            const aiMove = move ? convertWorkerMoveToImprovedTe(move) : null;
            if (!aiMove) {
              setGameState(prev => ({
                ...prev,
                isAIThinking: false,
                gameOver: true,
                winner: SENTE,
              }));
              setStats(prev => ({ ...prev, wins: prev.wins + 1 }));
              return;
            }

	            const newKyokumen = gameState.kyokumen.clone();
	            newKyokumen.move(aiMove);
	            newKyokumen.setTeban(SENTE);

            const { isOver, winner } = checkGameOver(newKyokumen);

	            setGameState(prev => ({
	              ...prev,
	              kyokumen: newKyokumen,
	              isAIThinking: false,
	              gameOver: isOver,
	              winner,
	              ply: prev.ply + 1,
	            }));

            if (isOver && winner === GOTE) {
              setStats(prev => ({ ...prev, losses: prev.losses + 1 }));
            }
          })
          .catch(() => {
            if (aiRequestIdRef.current !== requestId) return;

            // Worker failed (e.g. it could not load): last-resort main-thread search.
            const aiMove = getBestMoveV20(gameState.kyokumen, GOTE, difficulty, gameState.ply);
            if (!aiMove) {
              setGameState(prev => ({ ...prev, isAIThinking: false }));
              return;
            }

            const newKyokumen = gameState.kyokumen.clone();
            newKyokumen.move(aiMove);
            newKyokumen.setTeban(SENTE);

            const { isOver, winner } = checkGameOver(newKyokumen);

            setGameState(prev => ({
              ...prev,
              kyokumen: newKyokumen,
              isAIThinking: false,
              gameOver: isOver,
              winner,
              ply: prev.ply + 1,
            }));

            if (isOver && winner === GOTE) {
              setStats(prev => ({ ...prev, losses: prev.losses + 1 }));
            }
          });
        return;

      }, 500);
    }
  }, [gameState.kyokumen.teban, gameState.gameOver, gameState.isAIThinking, difficulty]);

  const startGame = () => {
    setShowDifficultySelect(false);
    initGame();
  };

  const resetGame = () => {
    initGame();
  };

  // --- Mid-game save/resume (signed-in users only) ---

  // Load the save slot once auth settles; clear it on sign-out.
  useEffect(() => {
    if (!currentUser) {
      setSavedGame(null);
      return;
    }
    let cancelled = false;
    gameSaveApi
      .getGameSave<SavedShogiGame>(GAME_SAVE_KEY)
      .then((save) => {
        if (!cancelled && save && isValidSavedGame(save.state)) {
          setSavedGame(save.state);
        }
      })
      .catch(() => {
        // Save slot is a convenience — never block the game on it.
      });
    return () => {
      cancelled = true;
    };
  }, [currentUser]);

  const resumeSavedGame = useCallback(() => {
    if (!savedGame) return;
    aiRequestIdRef.current++;
    workerRef.current?.clearTT();

    setDifficulty(savedGame.difficulty);
    setGameState({
      kyokumen: deserializeKyokumen(savedGame),
      selectedPosition: null,
      selectedCapturedIndex: -1,
      validMoves: [],
      gameOver: false,
      winner: null,
      isAIThinking: false,
      ply: savedGame.ply,
    });
    setShowPromotionDialog(false);
    setPendingMove(null);
    setShowDifficultySelect(false);
  }, [savedGame]);

  // Saving is only offered on the player's turn so a restore never lands
  // mid-AI-move; the saved teban is therefore always SENTE.
  const canSaveGame =
    !!currentUser &&
    !showDifficultySelect &&
    !gameState.gameOver &&
    !gameState.isAIThinking &&
    gameState.kyokumen.teban === SENTE &&
    gameState.ply > 0;

  const handleSaveGame = useCallback(async () => {
    if (!currentUser || gameState.gameOver || gameState.isAIThinking || gameState.kyokumen.teban !== SENTE) {
      return;
    }
    setSaveStatus('saving');
    try {
      const snapshot = serializeForWorker(gameState.kyokumen);
      const save: SavedShogiGame = { ...snapshot, ply: gameState.ply, difficulty };
      await gameSaveApi.saveGameSave(GAME_SAVE_KEY, save);
      setSavedGame(save);
      setSaveStatus('saved');
    } catch (error) {
      console.error('[shogi] failed to save game:', error);
      setSaveStatus('error');
    }
  }, [currentUser, gameState, difficulty]);

  // Auto-clear the transient save status, cleaning up the timer on
  // unmount so it never fires on a gone component.
  useEffect(() => {
    if (saveStatus !== 'saved' && saveStatus !== 'error') return;
    const timer = setTimeout(() => setSaveStatus('idle'), saveStatus === 'saved' ? 2000 : 3000);
    return () => clearTimeout(timer);
  }, [saveStatus]);

  // A finished game invalidates the save slot.
  useEffect(() => {
    if (gameState.gameOver && currentUser && savedGame) {
      setSavedGame(null);
      gameSaveApi.deleteGameSave(GAME_SAVE_KEY).catch(() => {});
    }
  }, [gameState.gameOver, currentUser, savedGame]);

  // Starting a fresh game (not resuming) abandons any old save, so clear
  // it — otherwise a mid-game refresh would offer to resume a game the
  // player already walked away from.
  useEffect(() => {
    if (!showDifficultySelect && gameState.ply === 0 && currentUser && savedGame) {
      setSavedGame(null);
      gameSaveApi.deleteGameSave(GAME_SAVE_KEY).catch(() => {});
    }
  }, [showDifficultySelect, gameState.ply, currentUser, savedGame]);

  // Render piece
  const renderPiece = (suji: number, dan: number) => {
    const pos = new Position(suji, dan);
    const koma = gameState.kyokumen.get(pos.toInt());
    if (koma === EMPTY) return null;

    const isSelected =
      gameState.selectedPosition &&
      gameState.selectedPosition.suji === suji &&
      gameState.selectedPosition.dan === dan;

    const pieceText = toString(koma);
    const isGote = !isSente(koma);

    return (
      <div
        style={{
          fontSize: '1.5rem',
          fontWeight: 'bold',
          color: isSente(koma) ? '#000' : '#c00',
          transform: isGote ? 'rotate(180deg)' : 'none',
          backgroundColor: isSelected ? 'rgba(66, 153, 225, 0.3)' : 'transparent',
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
      <DifficultySelector
        title="Shogi Improved"
        subtitle="Japanese Chess - Chapter 11"
        icon="☗"
        selectedDifficulty={difficulty}
        onSelectDifficulty={setDifficulty}
        options={DIFFICULTY_OPTIONS}
        onStart={startGame}
        extraContent={
          currentUser && savedGame ? (
            <button
              onClick={resumeSavedGame}
              style={{
                marginTop: '16px',
                padding: '12px 24px',
                borderRadius: '8px',
                border: '1px solid rgba(34, 197, 94, 0.5)',
                background: 'rgba(34, 197, 94, 0.15)',
                color: '#4ade80',
                fontSize: '15px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              ▶ Resume saved game (move {savedGame.ply}, {savedGame.difficulty})
            </button>
          ) : null
        }
      />
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
            {currentUser && (
              <button
                onClick={handleSaveGame}
                disabled={!canSaveGame || saveStatus === 'saving'}
                title={canSaveGame ? 'Save and continue later' : 'Saving is available on your turn'}
                style={{
                  padding: '6px 14px',
                  borderRadius: '6px',
                  border: '1px solid rgba(74, 222, 128, 0.5)',
                  background: saveStatus === 'saved' ? 'rgba(34, 197, 94, 0.35)' : 'rgba(34, 197, 94, 0.12)',
                  color: saveStatus === 'error' ? '#f87171' : '#4ade80',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: canSaveGame ? 'pointer' : 'not-allowed',
                  opacity: canSaveGame || saveStatus !== 'idle' ? 1 : 0.45,
                }}
              >
                {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? 'Saved ✓' : saveStatus === 'error' ? 'Save failed' : 'Save game'}
              </button>
            )}
          </div>
        }
      />

      <div style={{ maxWidth: '1200px', margin: '4rem auto 0', display: 'flex', gap: '40px', flexWrap: 'wrap', justifyContent: 'center' }}>
        {/* Gote Captured Pieces */}
        <div style={{ flex: '0 0 auto' }}>
          <h3 style={{ marginBottom: '10px' }}>AI Pieces (後手)</h3>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '5px',
              padding: '10px',
              background: 'rgba(255,255,255,0.1)',
              borderRadius: '8px',
              minHeight: '60px',
              width: '200px',
            }}
          >
            {capturedPieces[1].map((koma, i) => (
              <div
                key={i}
                style={{
                  padding: '5px 10px',
                  background: 'rgba(200,0,0,0.2)',
                  borderRadius: '4px',
                  fontSize: '1.2rem',
                }}
              >
                {toString(koma)}
              </div>
            ))}
          </div>
        </div>

        {/* Board */}
        <div style={{ flex: '0 0 auto' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(9, 50px)',
              gap: '1px',
              background: '#333',
              border: '2px solid #666',
              padding: '1px',
            }}
          >
            {Array.from({ length: 9 }, (_, dan) =>
              Array.from({ length: 9 }, (_, sujiIdx) => {
                const suji = 9 - sujiIdx; // Right to left (9→1)
                const actualDan = dan + 1;
                const pos = new Position(suji, actualDan);
                const isValidMove = gameState.validMoves.some(
                  m => m.to === pos.toInt()
                );

                return (
                  <div
                    key={`${suji}-${actualDan}`}
                    onClick={() => handleCellClick(suji, actualDan)}
                    style={{
                      width: '50px',
                      height: '50px',
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

        {/* Sente Captured Pieces */}
        <div style={{ flex: '0 0 auto' }}>
          <h3 style={{ marginBottom: '10px' }}>Your Pieces (先手)</h3>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '5px',
              padding: '10px',
              background: 'rgba(255,255,255,0.1)',
              borderRadius: '8px',
              minHeight: '60px',
              width: '200px',
            }}
          >
            {capturedPieces[0].map((koma, i) => (
              <div
                key={i}
                onClick={() => handleCapturedClick(i)}
                style={{
                  padding: '5px 10px',
                  background:
                    gameState.selectedCapturedIndex === i
                      ? 'rgba(66,153,225,0.5)'
                      : 'rgba(0,0,0,0.2)',
                  borderRadius: '4px',
                  fontSize: '1.2rem',
                  cursor: 'pointer',
                  border: gameState.selectedCapturedIndex === i ? '2px solid #4299e1' : 'none',
                }}
              >
                {toString(koma)}
              </div>
            ))}
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

export default ShogiImproved;
