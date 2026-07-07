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
import startShellStyles from '../common/GameStartShell.module.css';
import { ShogiPiece } from '../Shogi/ShogiPiece';
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

// Handicap games (駒落ち). The AI is the 上手 (handicap giver) on the Gote side,
// so its pieces are the ones removed. Per shogi rules the 上手 always moves first,
// so every handicap starts with teban = GOTE (the AI plays the opening move).
type Handicap = 'none' | 'lance' | 'bishop' | 'rook' | 'two-piece';

const HANDICAP_OPTIONS: { value: Handicap; label: string }[] = [
  { value: 'none', label: '平手' },
  { value: 'lance', label: '香落ち' },
  { value: 'bishop', label: '角落ち' },
  { value: 'rook', label: '飛車落ち' },
  { value: 'two-piece', label: '二枚落ち' },
];

const VALID_HANDICAPS: Handicap[] = HANDICAP_OPTIONS.map((o) => o.value);

// Build the starting position for a handicap. Hirate keeps the normal teban
// (SENTE first); every handicap flips the first move to the 上手 (GOTE / AI).
function buildInitialKyokumen(handicap: Handicap): KyokumenImproved {
  if (handicap === 'none') return InitialPositionImproved.createInitialPosition();
  const k = new KyokumenImproved();
  switch (handicap) {
    case 'lance': InitialPositionImproved.setupLanceHandicap(k); break;
    case 'bishop': InitialPositionImproved.setupBishopHandicap(k); break;
    case 'rook': InitialPositionImproved.setupRookHandicap(k); break;
    case 'two-piece': InitialPositionImproved.setupTwoPieceHandicap(k); break;
  }
  k.setTeban(GOTE); // 上手（AI）から指す
  return k;
}

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
  handicap?: Handicap; // absent on saves from before handicaps existed → treated as 'none'
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
    VALID_DIFFICULTIES.includes(save.difficulty as Difficulty) &&
    (save.handicap === undefined || VALID_HANDICAPS.includes(save.handicap as Handicap))
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

interface RecordedMove { koma: number; from: number; to: number; promote: boolean; }
const KIFU_SUJI = '１２３４５６７８９';
const KIFU_DAN = '一二三四五六七八九';
// Japanese move notation, e.g. "▲２六歩", "△同飛成", "▲５五角打".
function moveToKifu(m: RecordedMove, prev: RecordedMove | undefined): string {
  const side = isSente(m.koma) ? '▲' : '△';
  const square = prev && prev.to === m.to ? '同' : `${KIFU_SUJI[(m.to >> 4) - 1]}${KIFU_DAN[(m.to & 15) - 1]}`;
  return `${side}${square}${toString(m.koma)}${m.promote ? '成' : ''}${m.from === 0 ? '打' : ''}`;
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
  // Move list (kifu): every applied move, for on-screen display and copy.
  const [moveList, setMoveList] = useState<RecordedMove[]>([]);
  const [kifuCopied, setKifuCopied] = useState(false);
  // Mid-game save slot (signed-in users only).
  const [savedGame, setSavedGame] = useState<SavedShogiGame | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [handicap, setHandicap] = useState<Handicap>('none');
  // Snapshots of state *before* each of the player's moves, newest last. 待った
  // (takeback) restores the latest one, undoing the player's last move together
  // with the AI's reply and returning to the player's previous turn. Only the
  // player's turns are recorded because that is the only state a takeback
  // returns to. moveListLen is the kifu length at that point, so restoring also
  // trims moveList back to match the board (dropping the player move + AI reply).
  const [history, setHistory] = useState<{ kyokumen: KyokumenImproved; ply: number; moveListLen: number }[]>([]);

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
	  const initGame = useCallback((selectedHandicap: Handicap) => {
    // Invalidate any in-flight worker request.
    aiRequestIdRef.current++;
    workerRef.current?.clearTT();

	    setGameState({
	      kyokumen: buildInitialKyokumen(selectedHandicap),
	      selectedPosition: null,
	      selectedCapturedIndex: -1,
	      validMoves: [],
	      gameOver: false,
	      winner: null,
	      isAIThinking: false,
	      ply: 0,
	    });
    setMoveList([]);
    setHistory([]);
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

  const recordMove = useCallback((te: Te) => {
    setMoveList(prev => [...prev, { koma: te.koma, from: te.from, to: te.to, promote: te.promote }]);
  }, []);

  const handleCopyKifu = useCallback(() => {
    const text = moveList.map((m, i) => `${i + 1}. ${moveToKifu(m, moveList[i - 1])}`).join('\n');
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => setKifuCopied(true)).catch(() => {});
    }
  }, [moveList]);

  // Clear the "copied" flash, cleaning up the timer on unmount.
  useEffect(() => {
    if (!kifuCopied) return;
    const t = setTimeout(() => setKifuCopied(false), 1500);
    return () => clearTimeout(t);
  }, [kifuCopied]);

  // Execute move
	  const executeMove = (te: Te, promote: boolean) => {
	    // Record the pre-move snapshot so 待った can return here. gameState.kyokumen
	    // is never mutated (we clone before moving), so it is a safe immutable
	    // snapshot; moveList.length is the kifu length before this move is added.
	    const prevKyokumen = gameState.kyokumen;
	    const prevPly = gameState.ply;
	    const prevMoveListLen = moveList.length;
	    const newKyokumen = prevKyokumen.clone();
	    te.promote = promote;
	    recordMove(te); newKyokumen.move(te);
	    newKyokumen.setTeban(GOTE);

    const { isOver, winner } = checkGameOver(newKyokumen);

    setHistory(h => [...h, { kyokumen: prevKyokumen, ply: prevPly, moveListLen: prevMoveListLen }]);

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

	        // The opening book is keyed on hirate positions; skip it in handicap
	        // games so the AI searches its own (out-of-book) moves instead.
	        const bookMove = handicap === 'none'
	          ? getOpeningMoveImproved(gameState.kyokumen.clone(), difficulty)
	          : null;
	        if (bookMove) {
	          const newKyokumen = gameState.kyokumen.clone();
	          recordMove(bookMove); newKyokumen.move(bookMove);
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
		            recordMove(aiMove); newKyokumen.move(aiMove);
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
	            recordMove(aiMove); newKyokumen.move(aiMove);
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
            recordMove(aiMove); newKyokumen.move(aiMove);
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
  }, [gameState.kyokumen.teban, gameState.gameOver, gameState.isAIThinking, difficulty, handicap]);

  const startGame = () => {
    setShowDifficultySelect(false);
    initGame(handicap);
  };

  const resetGame = () => {
    initGame(handicap);
  };

  // 待った (takeback): undo the player's last move and the AI's reply, returning
  // to the player's previous turn. Available only when it is cleanly the
  // player's move (never mid-AI-search or after game over). Restoring also trims
  // moveList back to the snapshot's length so the kifu stays in sync with the
  // board (both the player move and the AI reply are removed).
  const canUndo =
    !showDifficultySelect &&
    !gameState.gameOver &&
    !gameState.isAIThinking &&
    gameState.kyokumen.teban === SENTE &&
    history.length >= 1;

  const handleUndo = useCallback(() => {
    if (
      history.length < 1 ||
      gameState.gameOver ||
      gameState.isAIThinking ||
      gameState.kyokumen.teban !== SENTE
    ) {
      return;
    }
    // Invalidate any in-flight worker request so a late AI reply can't land.
    aiRequestIdRef.current++;
    workerRef.current?.clearTT();

    const last = history[history.length - 1];
    const restored = last.kyokumen.clone();
    setGameState(prev => ({
      ...prev,
      kyokumen: restored,
      selectedPosition: null,
      selectedCapturedIndex: -1,
      validMoves: [],
      gameOver: false,
      winner: null,
      isAIThinking: false,
      ply: last.ply,
    }));
    setMoveList(prev => prev.slice(0, last.moveListLen));
    setHistory(h => h.slice(0, -1));
    setShowPromotionDialog(false);
    setPendingMove(null);
  }, [history, gameState.gameOver, gameState.isAIThinking, gameState.kyokumen]);

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
    setHandicap(savedGame.handicap ?? 'none');
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
    setMoveList([]);
    setHistory([]);
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
      const save: SavedShogiGame = { ...snapshot, ply: gameState.ply, difficulty, handicap };
      await gameSaveApi.saveGameSave(GAME_SAVE_KEY, save);
      setSavedGame(save);
      setSaveStatus('saved');
    } catch (error) {
      console.error('[shogi] failed to save game:', error);
      setSaveStatus('error');
    }
  }, [currentUser, gameState, difficulty, handicap]);

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
      <ShogiPiece
        label={pieceText}
        isSente={isSente(koma)}
        rotated={isGote}
        selected={Boolean(isSelected)}
      />
    );
  };

  if (showDifficultySelect) {
    return (
      <div className={startShellStyles.shell}>
        <DifficultySelector
          title="Shogi Improved"
          subtitle="Fast-engine Japanese chess with worker search, saved games, and stronger opening play."
          icon="☗"
          selectedDifficulty={difficulty}
          onSelectDifficulty={setDifficulty}
          options={DIFFICULTY_OPTIONS}
          difficultyTitle="Choose engine strength"
          startLabel="Start Game"
          onStart={startGame}
          extraContent={
            <>
              <div style={{ width: '100%' }}>
                <div style={{ marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 700, opacity: 0.85 }}>
                  手合割 (Handicap)
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {HANDICAP_OPTIONS.map((opt) => {
                    const active = handicap === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setHandicap(opt.value)}
                        style={{
                          padding: '0.5rem 0.85rem',
                          borderRadius: '8px',
                          border: active ? '2px solid #4299e1' : '1px solid rgba(255,255,255,0.25)',
                          background: active ? 'rgba(66,153,225,0.3)' : 'rgba(255,255,255,0.08)',
                          color: '#fff',
                          fontSize: '0.9rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
                <p style={{ marginTop: '0.6rem', fontSize: '0.78rem', lineHeight: 1.5, opacity: 0.7 }}>
                  駒落ちではAI（上手）が先に指します。AIの評価関数(NNUE)は平手で学習しているため、
                  駒落ちでは合法手を指せますが強さは保証されません。
                </p>
              </div>
              {currentUser && savedGame ? (
                <button
                  type="button"
                  onClick={resumeSavedGame}
                  style={{
                    width: '100%',
                    minHeight: '2.9rem',
                    padding: '0.75rem 1rem',
                    borderRadius: '8px',
                    border: '1px solid rgba(34, 197, 94, 0.5)',
                    background: 'rgba(34, 197, 94, 0.15)',
                    color: '#4ade80',
                    fontSize: '0.92rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Resume saved game (move {savedGame.ply}, {savedGame.difficulty}
                  {savedGame.handicap && savedGame.handicap !== 'none'
                    ? `, ${HANDICAP_OPTIONS.find((o) => o.value === savedGame.handicap)?.label}`
                    : ''}
                  )
                </button>
              ) : null}
            </>
          }
        />
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
            <button
              onClick={handleUndo}
              disabled={!canUndo}
              title={canUndo ? '待った（自分の1手＋AIの応手を戻す）' : '自分の手番でのみ使えます'}
              style={{
                padding: '6px 14px',
                borderRadius: '6px',
                border: '1px solid rgba(251, 191, 36, 0.5)',
                background: 'rgba(251, 191, 36, 0.12)',
                color: '#fbbf24',
                fontSize: '13px',
                fontWeight: 600,
                cursor: canUndo ? 'pointer' : 'not-allowed',
                opacity: canUndo ? 1 : 0.45,
              }}
            >
              待った
            </button>
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
                  alignItems: 'center',
                  background: 'rgba(255,255,255,0.05)',
                  borderRadius: '4px',
                  display: 'flex',
                  justifyContent: 'center',
                  minHeight: '3.1rem',
                  padding: '4px',
                }}
              >
                <ShogiPiece
                  label={toString(koma)}
                  isSente={isSente(koma)}
                  rotated
                  inHand
                />
              </div>
            ))}
          </div>
        </div>

        {/* Board */}
        <div style={{ flex: '0 1 auto', maxWidth: '100%', overflowX: 'auto' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(9, clamp(34px, 10vw, 50px))',
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
                      width: 'clamp(34px, 10vw, 50px)',
                      height: 'clamp(34px, 10vw, 50px)',
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
                  alignItems: 'center',
                  background:
                    gameState.selectedCapturedIndex === i
                      ? 'rgba(66,153,225,0.24)'
                      : 'rgba(255,255,255,0.05)',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'center',
                  minHeight: '3.1rem',
                  padding: '4px',
                  border: gameState.selectedCapturedIndex === i ? '2px solid #4299e1' : '2px solid transparent',
                }}
              >
                <ShogiPiece
                  label={toString(koma)}
                  isSente={isSente(koma)}
                  selected={gameState.selectedCapturedIndex === i}
                  inHand
                  interactive
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Kifu (move list) */}
      {moveList.length > 0 && (
        <div style={{ maxWidth: '1200px', margin: '28px auto 0', display: 'flex', justifyContent: 'center' }}>
          <div style={{ width: 'min(680px, 100%)', background: 'rgba(255,255,255,0.06)', borderRadius: '8px', padding: '12px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <h3 style={{ margin: 0, fontSize: '1rem' }}>棋譜 ({moveList.length})</h3>
              <button
                type="button"
                onClick={handleCopyKifu}
                style={{
                  padding: '6px 14px',
                  borderRadius: '6px',
                  border: '1px solid rgba(66,153,225,0.6)',
                  background: kifuCopied ? 'rgba(66,153,225,0.35)' : 'rgba(66,153,225,0.12)',
                  color: '#8ec5ff',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {kifuCopied ? 'コピーしました ✓' : '棋譜をコピー'}
              </button>
            </div>
            <div style={{ maxHeight: '170px', overflowY: 'auto', display: 'flex', flexWrap: 'wrap', gap: '2px 14px', fontSize: '14px', lineHeight: 1.7 }}>
              {moveList.map((m, i) => (
                <span key={i} style={{ minWidth: '5.5em', color: '#e6e6e6', fontVariantNumeric: 'tabular-nums' }}>
                  {i + 1}. {moveToKifu(m, moveList[i - 1])}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

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
