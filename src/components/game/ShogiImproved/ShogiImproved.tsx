/**
 * Shogi Improved Game Component - Using Chapter 11 Java-converted logic
 */

'use client';

import { useFeatureLifecycle } from '@/hooks/useActivityTracker';
import { RotateCcw } from 'lucide-react';
import React,{ useCallback,useEffect,useRef,useState } from 'react';
import { Difficulty,DifficultySelector,GameStats,GameTopBar,InfoModal } from '../common';
import { GenerateMovesImproved } from './GenerateMovesImproved';
import { InitialPositionImproved } from './InitialPositionImproved';
import { KyokumenImproved } from './KyokumenImproved';
import { getOpeningMoveImproved } from './OpeningBookImproved';
import { getBestMoveV18 } from './ShogiAIImprovedV18';
import type { SerializedKyokumenImproved,SerializedTeImproved,ShogiAiWorkerClient } from './shogiAiWorkerClient';
import { createShogiAiWorkerClient } from './shogiAiWorkerClient';
import { EMPTY,GOTE,isSente,Position,SENTE,Te,toString } from './types';

const DIFFICULTY_OPTIONS = [
  { label: 'Level 1 (Easy)', value: 'easy' as Difficulty, description: 'Fast (~250ms), depth ≤4' },
  { label: 'Level 2 (Medium)', value: 'medium' as Difficulty, description: 'Balanced (~800ms), depth ≤6' },
  { label: 'Level 3 (Hard)', value: 'hard' as Difficulty, description: 'Strong (~2s), depth ≤8' },
  { label: 'Level 4 (Expert)', value: 'expert' as Difficulty, description: 'Very strong (~5s, Worker), depth ≤10' },
  { label: 'Level 5 (Master)', value: 'master' as Difficulty, description: 'Strongest (~10s, Worker), depth ≤12' },
];

const isWorkerDifficulty = (difficulty: Difficulty): boolean =>
  difficulty === 'expert' || difficulty === 'master';

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
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [showDifficultySelect, setShowDifficultySelect] = useState<boolean>(true);
  const [showInfoModal, setShowInfoModal] = useState<boolean>(false);
  const [stats, setStats] = useState<GameStats>({ wins: 0, losses: 0, draws: 0 });
  const [showPromotionDialog, setShowPromotionDialog] = useState<boolean>(false);
  const [pendingMove, setPendingMove] = useState<Te | null>(null);

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
		          const aiMove = getBestMoveV18(gameState.kyokumen, GOTE, difficulty, gameState.ply);
		
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
            setGameState(prev => ({ ...prev, isAIThinking: false }));
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
