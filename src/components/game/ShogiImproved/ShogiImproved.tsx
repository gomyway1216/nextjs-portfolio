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
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { getShogiImprovedCopy } from './i18n';
import { ShogiPiece } from '../Shogi/ShogiPiece';
import { ShogiTypefaceSelector } from '../Shogi/ShogiTypefaceSelector';
import { GenerateMovesImproved } from './GenerateMovesImproved';
import { InitialPositionImproved } from './InitialPositionImproved';
import type { KifuImportStep } from './KifuImportImproved';
import { KifuImportPanel } from './KifuImportPanel';
import { computeDisambiguation } from './KifuNotationImproved';
import {
  KIFU_DAN,
  KIFU_SUJI,
  MIN_ABANDON_MOVES,
  buildGameRecord,
  formatKifuText,
  moveToKifu,
  newGameId,
  outcomeForWinner,
  type RecordedMove,
  type ShogiEndReason,
  type ShogiEngineIdentity,
  type ShogiOutcome,
} from './gameRecord';
import { KyokumenImproved } from './KyokumenImproved';
import { ensureExternalOpeningBookLoaded,getOpeningMoveImproved } from './OpeningBookImproved';
import { buildDeclinablePromotion } from './PromotionRulesImproved';
import { getBestMoveV20WithInfo } from './ShogiAIImprovedV20';
import type { SerializedKyokumenImproved,SerializedTeImproved,ShogiAiSearchPath,ShogiAiWorkerClient } from './shogiAiWorkerClient';
import { createShogiAiWorkerClient } from './shogiAiWorkerClient';
import { EMPTY,GOTE,isSente,Position,SENTE,Te,toString } from './types';
import { claimGameRecord,submitShogiGameRecord } from '@/services/shogiGameRecordService';
import { getSessionId } from '@/lib/sessionId';

const DIFFICULTY_ORDER: Difficulty[] = ['easy', 'medium', 'hard', 'expert', 'master'];


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

// `RecordedMove`, `moveToKifu` and the suji/dan tables now live in
// ./gameRecord so the on-screen kifu, the copy button and the saved game
// record are all produced by one formatter (see that file's header).

// --- Board coordinate labels (座標) ---
// Standard shogi notation orientation: suji (筋, files) 1-9 run right-to-left
// along the top edge; dan (段, ranks) 一-九 run top-to-bottom along the right
// edge. Both are read from the same KIFU_SUJI/KIFU_DAN tables the kifu text
// uses, so the on-board labels and the move list always agree.
const CELL_SIZE = 'clamp(34px, 10vw, 50px)';
const DAN_LABEL_SIZE = '1.1rem';
const SUJI_LABEL_SIZE = '1.3rem';
const coordLabelStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '0.75rem',
  fontWeight: 600,
  color: 'rgba(255,255,255,0.65)',
  userSelect: 'none',
};

// localStorage keys for display/sound preferences (best-effort; private
// browsing may throw, so every access is wrapped in try/catch).
const PREF_SOUND_KEY = 'shogi-improved-sound';
const PREF_EVAL_BAR_KEY = 'shogi-improved-eval-bar';

function readBoolPref(key: string): boolean {
  try {
    return typeof window !== 'undefined' && window.localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeBoolPref(key: string, value: boolean): void {
  try {
    window.localStorage.setItem(key, value ? '1' : '0');
  } catch {
    // Preference persistence is best-effort only.
  }
}

type EvalSearchPath = ShogiAiSearchPath | 'worker-pending' | 'main-thread-js' | 'engine-error';

/**
 * One snapshot of the current/latest AI request. Keeping the route and its
 * diagnostics together prevents an old WASM score from surviving a later
 * scoreless book, mate, or compatibility-mode answer.
 * `scoreCp` is always from SENTE's perspective.
 */
interface EvalInfo {
  searchPath: EvalSearchPath;
  scoreCp?: number;
  depth?: number;
  blockedMainThreadMs?: number;
}

/**
 * Map a sente-perspective centipawn score to Sente's win probability (0..1)
 * with the standard shogi sigmoid; 600 matches the NNUE's k_sigmoid, so the
 * bar reads "how won is this for Sente" rather than raw material.
 */
function cpToSenteWinRate(scoreCp: number): number {
  return 1 / (1 + Math.exp(-scoreCp / 600));
}

/** Style shared by the three display-toggle pills (盤反転 / 形勢バー / 駒音). */
function togglePillStyle(active: boolean): React.CSSProperties {
  return {
    padding: '5px 12px',
    borderRadius: '999px',
    border: active ? '1px solid rgba(66,153,225,0.9)' : '1px solid rgba(255,255,255,0.25)',
    background: active ? 'rgba(66,153,225,0.28)' : 'rgba(255,255,255,0.06)',
    color: active ? '#bfdcff' : 'rgba(255,255,255,0.75)',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  };
}

/** Style shared by the kifu-replay step buttons (⏮ ◀ 進む ▶ ⏭). */
function replayButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: '5px 10px',
    borderRadius: '6px',
    border: '1px solid rgba(255,255,255,0.25)',
    background: 'rgba(255,255,255,0.06)',
    color: disabled ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.85)',
    fontSize: '13px',
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
  };
}

const ShogiImproved = () => {
  const _lifecycle = useFeatureLifecycle('game.shogi-improved');
  const { currentUser } = useAuth();
  const { language } = useGameLanguage();
  const copy = getShogiImprovedCopy(language);
  const difficultyOptions = React.useMemo(() => DIFFICULTY_ORDER.map((value) => ({
    value,
    label: copy.difficulties[value].label,
    description: copy.difficulties[value].description,
  })), [copy]);
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [showDifficultySelect, setShowDifficultySelect] = useState<boolean>(true);
  const [showInfoModal, setShowInfoModal] = useState<boolean>(false);
  const [stats, setStats] = useState<GameStats>({ wins: 0, losses: 0, draws: 0 });
  const [showPromotionDialog, setShowPromotionDialog] = useState<boolean>(false);
  const [pendingMove, setPendingMove] = useState<Te | null>(null);
  // Move list (kifu): every applied move, for on-screen display and copy.
  const [moveList, setMoveList] = useState<RecordedMove[]>([]);
  const [kifuCopied, setKifuCopied] = useState(false);
  // Kifu import replay: set after a successful (possibly partial) "棋譜を読み込む".
  // `positions[0]` is the starting position, `positions[i]` is the position after
  // the i-th imported move; `viewPly` (0..positions.length-1) is which position is
  // currently shown on the board. Board clicks/AI are disabled while this is set
  // (pure playback) — "ここから指す" (play from here) exits replay mode and hands
  // control back to normal play from the currently viewed position.
  const [replay, setReplay] = useState<{ positions: KyokumenImproved[]; viewPly: number } | null>(null);
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
  // Display-only board flip (後手視点). Never touches move handling: cells keep
  // their real (suji, dan) identity; only the render order changes.
  const [boardFlipped, setBoardFlipped] = useState(false);
  // 駒音 (move sound). Default OFF; persisted.
  const [soundEnabled, setSoundEnabled] = useState(false);
  // 形勢バー (eval bar). Default hidden — seeing the engine's own evaluation is
  // a spoiler/aid, so the player must opt in. Persisted.
  const [showEvalBar, setShowEvalBar] = useState(false);
  // Current/latest AI request: route, optional score/depth, and any main-thread
  // blocking time. Replaced as a unit for every request to avoid stale values.
  const [evalInfo, setEvalInfo] = useState<EvalInfo | null>(null);
  // Elapsed ms of the current AI think, ticking while isAIThinking.
  const [thinkElapsedMs, setThinkElapsedMs] = useState(0);
  const aiPlayingBook = evalInfo?.searchPath === 'book';

  // Hydrate persisted preferences after mount (not in useState initializers:
  // SSR markup must match the client's first render).
  useEffect(() => {
    setSoundEnabled(readBoolPref(PREF_SOUND_KEY));
    setShowEvalBar(readBoolPref(PREF_EVAL_BAR_KEY));
  }, []);

  // Persist synchronously in the event handler (NOT inside the setState
  // updater — updaters must stay pure and may run deferred/twice).
  const toggleSound = useCallback(() => {
    const next = !soundEnabled;
    writeBoolPref(PREF_SOUND_KEY, next);
    setSoundEnabled(next);
  }, [soundEnabled]);

  const toggleEvalBar = useCallback(() => {
    const next = !showEvalBar;
    writeBoolPref(PREF_EVAL_BAR_KEY, next);
    setShowEvalBar(next);
  }, [showEvalBar]);

  // --- 駒音 (Web Audio click on every applied move) ---
  // A ref mirrors soundEnabled so playMoveSound (called from recordMove, which
  // several effects depend on) stays referentially stable.
  const soundEnabledRef = useRef(false);
  useEffect(() => { soundEnabledRef.current = soundEnabled; }, [soundEnabled]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  useEffect(() => {
    return () => {
      audioCtxRef.current?.close().catch(() => {});
      audioCtxRef.current = null;
    };
  }, []);

  const playMoveSound = useCallback(() => {
    if (!soundEnabledRef.current || typeof window === 'undefined') return;
    try {
      const AC = window.AudioContext ??
        (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      if (!audioCtxRef.current) audioCtxRef.current = new AC();
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') void ctx.resume();
      const t0 = ctx.currentTime;
      // Piece "pachi": a fast-decaying noise burst through a bandpass (the
      // click) plus a short sine thump (the board resonance). Quiet by design.
      const dur = 0.055;
      const buf = ctx.createBuffer(1, Math.max(1, Math.ceil(ctx.sampleRate * dur)), ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 3);
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buf;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 2500;
      bp.Q.value = 1.1;
      const noiseGain = ctx.createGain();
      noiseGain.gain.value = 0.22;
      noise.connect(bp);
      bp.connect(noiseGain);
      noiseGain.connect(ctx.destination);
      noise.start(t0);
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(170, t0);
      osc.frequency.exponentialRampToValueAtTime(75, t0 + 0.08);
      const oscGain = ctx.createGain();
      oscGain.gain.setValueAtTime(0.15, t0);
      oscGain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.09);
      osc.connect(oscGain);
      oscGain.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.1);
    } catch {
      // Audio is decorative — never let it break a move.
    }
  }, []);

  const workerRef = useRef<ShogiAiWorkerClient | null>(null);
  const aiRequestIdRef = useRef(0);
  const [engineFailed, setEngineFailed] = useState(false);
  const getWorker = useCallback((): ShogiAiWorkerClient => {
    if (!workerRef.current) workerRef.current = createShogiAiWorkerClient();
    return workerRef.current;
  }, []);
  useEffect(() => {
    const requestIds = aiRequestIdRef;
    const workers = workerRef;
    return () => {
      // Invalidate both the 250/500ms courtesy timer and any Promise rejection
      // caused by terminate() before either can start a fallback after unmount.
      requestIds.current++;
      workers.current?.terminate();
      workers.current = null;
    };
  }, []);

  // Large-scale opening book (static asset, ~0.9MB): fetched once, non-blocking. The
  // main-thread book probe above the worker path uses it; failures silently keep the
  // compiled-in curated book only.
  useEffect(() => {
    void ensureExternalOpeningBookLoaded();
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

  // While replaying an imported kifu, the board/hands show whichever position
  // is currently being stepped through instead of the live game state. Click
  // handling below still reads `gameState.kyokumen` for its guards, but those
  // guards all additionally check `!replay` so clicks are inert during replay.
  const displayKyokumen = replay ? replay.positions[replay.viewPly] : gameState.kyokumen;

  // Convert hand counts to arrays for UI compatibility
  const capturedPieces = React.useMemo(() => {
    return displayKyokumen.toHandArrays();
  }, [displayKyokumen]);

  // --- 対局記録 (anonymous game records) ---------------------------------
  //
  // The kifu of every game played here is saved so the engine's real-world
  // play can be studied — above all, where it runs out of opening book. See
  // ./gameRecord for the payload and src/services/shogiGameRecordService for
  // the transport. Nothing about the player is stored; the notice under the
  // board says so.

  /** Identity and eligibility of the game currently on the board. */
  const gameRecordRef = useRef<{ gameId: string; startedAt: Date; recordable: boolean }>({
    gameId: '',
    startedAt: new Date(0),
    recordable: false,
  });

  /**
   * Which engine build played, by content hash — left empty here on purpose.
   *
   * The worker can report it, but the client method that asks is the parity
   * gate's evidence channel, and shogiAiWorkerClient.test.ts asserts that this
   * file never calls it: evidence for that gate has to be asked for explicitly
   * by the parity harness, not collected as a side effect of someone playing a
   * game. `app_build_sha` still pins the record to a commit, which fixes both
   * the code and the versioned weights asset it shipped with; the field stays
   * in the schema so a deliberate decision to wire the hashes through later
   * does not need a schema bump.
   */
  const engineIdentityRef = useRef<ShogiEngineIdentity | null>(null);

  /**
   * The parts of the live game a record needs, mirrored into a ref.
   *
   * The abandonment paths (pagehide, tab hidden, unmount) fire from listeners
   * that were registered once and cannot see later renders' state. Re-binding
   * them on every move instead would mean adding and removing three listeners
   * per ply.
   */
  const recordContextRef = useRef<{
    moveList: RecordedMove[];
    difficulty: Difficulty;
    handicap: Handicap;
    engineFailed: boolean;
  } | null>(null);

  /**
   * Start recording a new game from the initial position.
   *
   * Only games that begin from the standard start (or a handicap start) are
   * eligible: a resumed save or an imported kifu has moves the board never
   * saw, so its `moveList` would not replay from the beginning and the record
   * would be a lie. Those callers mark the game unrecordable instead.
   */
  const beginGameRecord = useCallback((recordable: boolean) => {
    gameRecordRef.current = { gameId: newGameId(), startedAt: new Date(), recordable };
  }, []);

  const submitGameRecord = useCallback(
    (outcome: ShogiOutcome, endReason: ShogiEndReason, unloading: boolean) => {
      const meta = gameRecordRef.current;
      const context = recordContextRef.current;
      if (!meta.recordable || !context) return;

      // A handful of moves is someone trying the board out, not a game.
      // Finished games are always worth keeping, however short.
      if (outcome === 'abandoned' && context.moveList.length < MIN_ABANDON_MOVES) return;

      if (!claimGameRecord(meta.gameId, outcome === 'abandoned' ? 'abandoned' : 'final')) return;

      const payload = buildGameRecord({
        gameId: meta.gameId,
        sessionId: getSessionId(),
        moves: context.moveList,
        difficulty: context.difficulty,
        handicap: context.handicap,
        outcome,
        // A game the engine could not move in is the most interesting kind of
        // abandonment there is, so it keeps its own reason.
        endReason: outcome === 'abandoned' && context.engineFailed ? 'engine_error' : endReason,
        engine: engineIdentityRef.current,
        startedAt: meta.startedAt,
        endedAt: new Date(),
      });
      if (!payload) return;

      void submitShogiGameRecord(payload, { unloading });
    },
    [],
  );

  // Initialize game
	  const initGame = useCallback((selectedHandicap: Handicap) => {
    // Starting a new game over the top of an unfinished one is the player
    // walking away from it — save what was played before the board is wiped.
    submitGameRecord('abandoned', 'new_game', false);
    beginGameRecord(true);

    // Invalidate any in-flight worker request.
    aiRequestIdRef.current++;
    setEngineFailed(false);
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
    setEvalInfo(null);
    setShowPromotionDialog(false);
    setPendingMove(null);
    setReplay(null);
  }, [submitGameRecord, beginGameRecord]);

  // Check for game over
  const checkGameOver = (k: KyokumenImproved): { isOver: boolean; winner: number | null } => {
    const moves = GenerateMovesImproved.generateLegalMoves(k);
    if (moves.length === 0) {
      // No legal moves - checkmate
      return { isOver: true, winner: k.teban === SENTE ? GOTE : SENTE };
    }
    return { isOver: false, winner: null };
  };

  // Records the applied move in the kifu and plays the (opt-in) piece sound —
  // the single funnel every applied move goes through (human + all AI paths).
  // `beforeKyokumen` MUST be the position te is about to be played from (not yet
  // mutated) — disambiguation (右/左/上/引/寄/直/打/不成) is computed against its
  // legal-move list.
  // `searchPath` is the engine route for an AI move ('book', 'wasm', 'mate',
  // …) and is omitted for the player's own moves. It is stored on the move so
  // the saved game record can say where the AI left the opening book.
  const recordMove = useCallback((te: Te, beforeKyokumen: KyokumenImproved, searchPath?: string) => {
    const disambiguation = computeDisambiguation(beforeKyokumen, te);
    setMoveList(prev => [...prev, { koma: te.koma, from: te.from, to: te.to, promote: te.promote, disambiguation, searchPath: searchPath ?? null }]);
    playMoveSound();
  }, [playMoveSound]);

  // Tick the elapsed-time display while the AI is thinking. The status strip
  // reserves its space permanently, so this text never causes layout shift.
  // The counter starts each think at 0 because the previous cycle's cleanup
  // reset it (no synchronous setState in the effect body).
  useEffect(() => {
    if (!gameState.isAIThinking) return;
    const start = performance.now();
    setThinkElapsedMs(0);
    const timer = setInterval(() => setThinkElapsedMs(performance.now() - start), 100);
    return () => clearInterval(timer);
  }, [gameState.isAIThinking]);

  const handleCopyKifu = useCallback(() => {
    const text = formatKifuText(moveList);
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

  // A pasted kifu parsed (possibly partially — see KifuImportPanel's status
  // message for how far it got): rebuild the on-screen move list from it and
  // enter replay/playback mode, starting at the final parsed position. Any
  // in-flight AI search is invalidated since the current game is being replaced.
  const handleKifuImported = useCallback((steps: KifuImportStep[]) => {
    if (steps.length === 0) return;
    // The imported moves were never played on this board, so this game can no
    // longer produce an honest record. Whatever was played before the import
    // is saved first, then recording stops until a new game is started.
    submitGameRecord('abandoned', 'new_game', false);
    gameRecordRef.current = { ...gameRecordRef.current, recordable: false };
    aiRequestIdRef.current++;
    setEngineFailed(false);
    workerRef.current?.clearTT();

    const startPosition = gameState.kyokumen.clone();
    const positions = [startPosition, ...steps.map((s) => s.kyokumen)];
    const recorded: RecordedMove[] = steps.map((s, i) => ({
      koma: s.move.koma,
      from: s.move.from,
      to: s.move.to,
      promote: s.move.promote,
      disambiguation: computeDisambiguation(positions[i], s.move),
    }));

    setMoveList(recorded);
    setHistory([]);
    setEvalInfo(null);
    setShowPromotionDialog(false);
    setPendingMove(null);
    // Importing may happen mid-selection (a piece/captured-piece highlighted,
    // possibly mid-AI-think too — the invalidated request above means any
    // in-flight reply is discarded either way). Clear all of that so replay
    // never shows stale green valid-move squares or a stuck "thinking" spinner.
    setGameState(prev => ({
      ...prev,
      selectedPosition: null,
      selectedCapturedIndex: -1,
      validMoves: [],
      isAIThinking: false,
    }));
    setReplay({ positions, viewPly: positions.length - 1 });
  }, [gameState.kyokumen, submitGameRecord]);

  const replayStep = useCallback((delta: number) => {
    setReplay((r) => {
      if (!r) return r;
      const viewPly = Math.max(0, Math.min(r.positions.length - 1, r.viewPly + delta));
      return { ...r, viewPly };
    });
  }, []);

  // Exit replay mode and resume normal play from whichever position is
  // currently being viewed. moveList is trimmed to match (kifu display stays
  // consistent with the board), and the ply count is derived from viewPly.
  const handlePlayFromReplay = useCallback(() => {
    if (!replay) return;
    const { positions, viewPly } = replay;
    const kyokumen = positions[viewPly].clone();
    setEngineFailed(false);

    setGameState({
      kyokumen,
      selectedPosition: null,
      selectedCapturedIndex: -1,
      validMoves: [],
      gameOver: false,
      winner: null,
      isAIThinking: false,
      ply: viewPly,
    });
    setMoveList((prev) => prev.slice(0, viewPly));
    setHistory([]);
    setEvalInfo(null);
    setReplay(null);
  }, [replay]);

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
	    recordMove(te, prevKyokumen); newKyokumen.move(te);
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
    if (replay || gameState.gameOver || gameState.kyokumen.teban !== SENTE || gameState.isAIThinking) {
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
        // The engine's own move list only ever contains a non-promote variant
        // when the search generator (GenerateMovesImproved) chose to keep both
        // branches. For 角/飛 it deliberately prunes the non-promote branch as a
        // search optimization (promoting is always at least as good for the
        // engine) — that pruning is NOT a shogi rule, so a human player must
        // still be offered the choice. `buildDeclinablePromotion` reconstructs
        // that legal-but-pruned non-promote move when one isn't already present.
        const nonPromoteMove =
          gameState.validMoves.find(m => m.to === clickedPosInt && m.from === selectedPosInt && !m.promote) ??
          (promoteMove ? buildDeclinablePromotion(promoteMove, SENTE) : null);

        // Show dialog only when the player actually has a choice.
        if (promoteMove && nonPromoteMove) {
          setPendingMove(nonPromoteMove);
          setShowPromotionDialog(true);
        } else if (promoteMove) {
          // Forced promotion: pawn/lance to the last rank, or knight to the last two ranks.
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
    if (replay || gameState.gameOver || gameState.kyokumen.teban !== SENTE || gameState.isAIThinking) {
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
      !replay &&
      gameState.kyokumen.teban === GOTE &&
      !gameState.gameOver &&
      !gameState.isAIThinking &&
      !engineFailed
    ) {
      const requestId = ++aiRequestIdRef.current;
      // Resolve the book move up-front so the UI can tell an instant book reply
      // apart from a real search before the think even starts. This is the same
      // lookup the book branch used to do inside the delay (it may generate and
      // static-eval candidates to safety-filter them), just hoisted — not an
      // extra call.
      const bookMove = handicap === 'none'
        ? getOpeningMoveImproved(gameState.kyokumen.clone(), difficulty)
        : null;
      // Start every request with a fresh diagnostics snapshot. In particular,
      // do not leave the previous search's score/depth visible while a new
      // scoreless route is in flight.
      setEvalInfo({ searchPath: bookMove ? 'book' : 'worker-pending' });
      setGameState(prev => ({ ...prev, isAIThinking: true }));

      // Book replies are instant — a short courtesy pause reads as "played from
      // book" rather than a stuck 0.5s "thinking". Real searches keep the 500ms
      // lead-in before the (much longer) engine search.
      setTimeout(() => {
        if (aiRequestIdRef.current !== requestId) return;

        const stopWithEngineError = (blockedMainThreadMs?: number) => {
          if (aiRequestIdRef.current !== requestId) return;
          // Do not retry the same broken position every 500ms. A new game or
          // imported/replayed position explicitly clears this circuit breaker.
          setEngineFailed(true);
          setEvalInfo({ searchPath: 'engine-error', blockedMainThreadMs });
          setGameState(prev => ({ ...prev, isAIThinking: false }));
        };

        // Check if AI has any legal moves first
        const legalMoves = GenerateMovesImproved.generateLegalMoves(gameState.kyokumen);

	        if (legalMoves.length === 0) {
	          // AI is in checkmate
          setEvalInfo({ searchPath: 'unknown' });
	          setGameState(prev => ({
	            ...prev,
            isAIThinking: false,
            gameOver: true,
            winner: SENTE,
          }));
          setStats(prev => ({ ...prev, wins: prev.wins + 1 }));
	          return;
	        }

	        // `bookMove` was resolved up-front (see above); the opening book is
	        // keyed on hirate positions and skipped in handicap games.
	        if (bookMove) {
	          const newKyokumen = gameState.kyokumen.clone();
	          recordMove(bookMove, gameState.kyokumen, 'book'); newKyokumen.move(bookMove);
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
	          return;
	        }

        const runMainThreadFallback = () => {
          // This is deliberately the only blocking path. Measure it and always
          // leave isAIThinking, even if construction/search unexpectedly throws.
          setEvalInfo({ searchPath: 'main-thread-js' });
          const wallStartedAt = Date.now();
          const preciseStartedAt =
            typeof performance !== 'undefined' && typeof performance.now === 'function'
              ? performance.now()
              : null;
          const blockedMs = () => {
            if (preciseStartedAt !== null) {
              return performance.now() - preciseStartedAt;
            }
            return Date.now() - wallStartedAt;
          };

          try {
            const info = getBestMoveV20WithInfo(
              gameState.kyokumen,
              GOTE,
              difficulty,
              gameState.ply,
            );
            const blockedMainThreadMs = blockedMs();
            if (aiRequestIdRef.current !== requestId) return;

            setEvalInfo({
              searchPath: 'main-thread-js',
              scoreCp: info.scoreCp,
              depth: info.depth,
              blockedMainThreadMs,
            });

            const aiMove = info.move;
            if (!aiMove) {
              stopWithEngineError(blockedMainThreadMs);
              return;
            }

            const newKyokumen = gameState.kyokumen.clone();
            newKyokumen.move(aiMove);
            newKyokumen.setTeban(SENTE);

            const { isOver, winner } = checkGameOver(newKyokumen);
            recordMove(aiMove, gameState.kyokumen, 'main-thread-js');

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
          } catch {
            stopWithEngineError(blockedMs());
          }
        };

        if (!isWorkerDifficulty(difficulty)) {
          runMainThreadFallback();
          return;
        }

	        const position = serializeForWorker(gameState.kyokumen);
        let worker: ShogiAiWorkerClient;
        try {
          // Worker construction itself may throw synchronously (blocked script,
          // unsupported environment). Catch it before a Promise exists.
          worker = getWorker();
        } catch {
          runMainThreadFallback();
          return;
        }

        try {
          void worker
	          .requestBestMoveWithInfo(position, difficulty, gameState.ply)
	          .then((info) => {
            if (aiRequestIdRef.current !== requestId) return;

            // Replace all diagnostics together, including scoreless answers.
            setEvalInfo({
              searchPath: info.searchPath,
              scoreCp: info.scoreCp,
              depth: info.depth,
            });

            const aiMove = info.move ? convertWorkerMoveToImprovedTe(info.move) : null;
            if (!aiMove) {
              stopWithEngineError();
              return;
            }

	            const newKyokumen = gameState.kyokumen.clone();
	            newKyokumen.move(aiMove);
	            newKyokumen.setTeban(SENTE);

            const { isOver, winner } = checkGameOver(newKyokumen);
            recordMove(aiMove, gameState.kyokumen, info.searchPath);

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
          }, () => {
            // Only a rejected worker request takes the compatibility route.
            // Exceptions while applying a successful move must never trigger a
            // second search and a possible double move.
            if (aiRequestIdRef.current !== requestId) return;
            runMainThreadFallback();
          })
            .catch(() => {
              // A failure while applying an already successful worker result is
              // not a worker failure. Stop the spinner without replaying a move.
              if (aiRequestIdRef.current !== requestId) return;
              stopWithEngineError();
            });
        } catch {
          // A client implementation can also throw before returning its Promise.
          runMainThreadFallback();
        }
        return;

      }, bookMove ? 250 : 500);
    }
  }, [gameState.kyokumen.teban, gameState.gameOver, gameState.isAIThinking, difficulty, handicap, replay, engineFailed]);

  const startGame = () => {
    setShowDifficultySelect(false);
    initGame(handicap);
  };

  const resetGame = () => {
    if (engineFailed) {
      // A terminal failure can leave the cached client permanently disabled
      // (for example when a timeout is followed by a failed Worker respawn).
      // Retry starts a genuinely fresh game/engine instead of reusing that
      // poisoned client and falling straight back into the same failure.
      try {
        workerRef.current?.terminate();
      } catch {
        /* a broken Worker may also reject teardown; replacing the ref is enough */
      }
      workerRef.current = null;
    }
    initGame(handicap);
  };

  // 待った (takeback): undo the player's last move and the AI's reply, returning
  // to the player's previous turn. Available only when it is cleanly the
  // player's move (never mid-AI-search or after game over). Restoring also trims
  // moveList back to the snapshot's length so the kifu stays in sync with the
  // board (both the player move and the AI reply are removed).
  const canUndo =
    !replay &&
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
    // The last search's eval belongs to the undone position — drop it.
    setEvalInfo(null);
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
    // A resumed save restores the position but not the moves that produced
    // it, so its kifu would not replay from the start. Recording stays off
    // for the rest of this game rather than storing a partial one.
    beginGameRecord(false);
    aiRequestIdRef.current++;
    setEngineFailed(false);
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
    setEvalInfo(null);
    setShowPromotionDialog(false);
    setPendingMove(null);
    setReplay(null);
    setShowDifficultySelect(false);
  }, [savedGame, beginGameRecord]);

  // Saving is only offered on the player's turn so a restore never lands
  // mid-AI-move; the saved teban is therefore always SENTE.
  const canSaveGame =
    !replay &&
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

  // --- 対局記録: keeping the snapshot fresh and choosing when to send ------

  // Runs after every render so the unload-time listeners below always see the
  // move list as it stands. Declared before the effects that read it, because
  // effects fire in declaration order within a commit.
  useEffect(() => {
    recordContextRef.current = { moveList, difficulty, handicap, engineFailed };
  });

  // The game ended: save it. `winner === null` on a finished game means
  // neither side was mated, which the board only reaches as a draw.
  useEffect(() => {
    if (!gameState.gameOver) return;
    const outcome = outcomeForWinner(gameState.winner, SENTE, GOTE);
    submitGameRecord(outcome, outcome === 'draw' ? 'draw' : 'checkmate', false);
  }, [gameState.gameOver, gameState.winner, submitGameRecord]);

  // The player left mid-game. Three exits, one meaning:
  //   pagehide          — closing the tab or a full navigation. The only
  //                       moment a browser reliably gives us before unload,
  //                       and the reason the beacon transport exists.
  //   visibilitychange  — backgrounding the tab. On mobile this is often the
  //                       last event before the page is discarded outright.
  //   unmount           — client-side navigation away from /games/shogi,
  //                       which fires no page event at all.
  // A game recorded here and then finished later is re-sent with its result
  // and overwrites the partial record; see claimGameRecord.
  useEffect(() => {
    const saveOnLeave = () => submitGameRecord('abandoned', 'left_page', true);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') saveOnLeave();
    };

    window.addEventListener('pagehide', saveOnLeave);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('pagehide', saveOnLeave);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      // Unmount still has a live page, so this one can use a normal request.
      submitGameRecord('abandoned', 'unmount', false);
    };
  }, [submitGameRecord]);

  // The most recently applied move (any side / any path), for the last-move
  // highlight. Derived from the kifu so undo / reset stay in sync for free.
  // During replay, this instead reflects whichever ply is currently being
  // viewed (`replay.viewPly`), so stepping back also moves the highlight back.
  const lastMove = replay
    ? (replay.viewPly > 0 ? moveList[replay.viewPly - 1] : null)
    : (moveList.length > 0 ? moveList[moveList.length - 1] : null);

  // Render piece
  const renderPiece = (suji: number, dan: number) => {
    const pos = new Position(suji, dan);
    const posInt = pos.toInt();
    const koma = displayKyokumen.get(posInt);
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
        // Pieces point away from the viewer's side; flipping the board flips that too.
        rotated={isGote !== boardFlipped}
        selected={Boolean(isSelected)}
        highlight={lastMove && lastMove.to === posInt ? 'to' : undefined}
      />
    );
  };

  if (showDifficultySelect) {
    return (
      <div className={startShellStyles.shell}>
        <DifficultySelector
          title={copy.title}
          subtitle={copy.subtitle}
          icon="☗"
          selectedDifficulty={difficulty}
          onSelectDifficulty={setDifficulty}
          options={difficultyOptions}
          difficultyTitle={copy.chooseStrength}
          startLabel={copy.start}
          kickerLabel={copy.gameSetup}
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
                  {copy.resumeSavedGame(
                    savedGame.ply,
                    copy.difficulties[savedGame.difficulty]?.label ?? savedGame.difficulty,
                    savedGame.handicap && savedGame.handicap !== 'none'
                      ? HANDICAP_OPTIONS.find((o) => o.value === savedGame.handicap)?.label ?? ''
                      : ''
                  )}
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
            {/* The AI-thinking indicator lives in the fixed-height status strip
                above the board (NOT here): rendering it in the toolbar made the
                flex-wrap toolbar grow a line while thinking, pushing the whole
                board down on every AI move. */}
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
                title={canSaveGame ? copy.saveTitleEnabled : copy.saveTitleDisabled}
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
                  // Fixed width across all labels (Save game / Saving… / Saved ✓ /
                  // Save failed) so the toolbar never reflows mid-game.
                  minWidth: '104px',
                }}
              >
                {saveStatus === 'saving' ? copy.saving : saveStatus === 'saved' ? copy.saved : saveStatus === 'error' ? copy.saveFailed : copy.saveGame}
              </button>
            )}
          </div>
        }
      />

      {/* Status strip + eval bar.
          Layout-shift contract: this block is ALWAYS rendered with fixed row
          heights — thinking/idle and eval-bar shown/hidden are toggled with
          `visibility` (which keeps the box) so the board below never moves. */}
      <div style={{ maxWidth: '1200px', margin: '3rem auto 0' }}>
        <style>{'@keyframes shogiAiSpin { to { transform: rotate(360deg); } }'}</style>
        <div
          data-testid="shogi-engine-status"
          data-ply={gameState.ply}
          data-search-path={evalInfo?.searchPath ?? 'idle'}
          data-score-cp={evalInfo?.scoreCp ?? ''}
          data-search-depth={evalInfo?.depth ?? ''}
          data-main-thread-blocked-ms={Math.round(evalInfo?.blockedMainThreadMs ?? 0)}
          data-thinking={gameState.isAIThinking ? 'true' : 'false'}
          style={{
            height: '28px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            overflow: 'hidden',
            whiteSpace: 'nowrap',
          }}
          aria-live="polite"
        >
          <span
            aria-hidden="true"
            style={{
              width: '14px',
              height: '14px',
              flex: '0 0 auto',
              borderRadius: '50%',
              border: '2px solid rgba(255, 215, 0, 0.25)',
              borderTopColor: '#ffd700',
              animation: 'shogiAiSpin 0.8s linear infinite',
              visibility: gameState.isAIThinking ? 'visible' : 'hidden',
            }}
          />
          <span
            style={{
              fontSize: '14px',
              fontWeight: 600,
              fontVariantNumeric: 'tabular-nums',
              color: gameState.isAIThinking ? '#ffd700' : 'rgba(255,255,255,0.6)',
            }}
          >
            {gameState.isAIThinking
              ? (aiPlayingBook ? '定跡どおりに指しています' : 'AIが考えています…')
              : gameState.gameOver
                ? '対局終了'
                : evalInfo?.searchPath === 'main-thread-js'
                  ? 'あなたの番です（低速互換モード）'
                  : evalInfo?.searchPath === 'worker-js'
                    ? 'あなたの番です（互換モード）'
                    : evalInfo?.searchPath === 'engine-error'
                      ? 'AIを起動できませんでした。再対局してください'
                    : 'あなたの番です'}
          </span>
          <span
            data-testid="shogi-engine-timer"
            data-elapsed-ms={Math.round(thinkElapsedMs)}
            aria-hidden="true"
            style={{
              fontSize: '14px',
              fontWeight: 600,
              fontVariantNumeric: 'tabular-nums',
              color: '#ffd700',
              // Hidden for book replies (instant — the seconds would read as a
              // stuck 0.4s); only shown while the engine is actually searching.
              visibility: gameState.isAIThinking && !aiPlayingBook ? 'visible' : 'hidden',
              minWidth: '3.4em',
              textAlign: 'left',
            }}
          >
            {(thinkElapsedMs / 1000).toFixed(1)}秒
          </span>
        </div>
        <div style={{ height: '26px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div
            style={{
              width: 'min(480px, 92vw)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              visibility: showEvalBar ? 'visible' : 'hidden',
            }}
          >
            <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.85)', flex: '0 0 auto' }}>▲先手</span>
            <div
              style={{
                flex: '1 1 auto',
                height: '10px',
                borderRadius: '5px',
                overflow: 'hidden',
                background: '#e9e4d9',
                border: '1px solid rgba(255,255,255,0.35)',
              }}
              role="img"
              aria-label={
                evalInfo?.scoreCp !== undefined
                  ? `形勢: 先手勝率 ${Math.round(cpToSenteWinRate(evalInfo.scoreCp) * 100)}%`
                  : '形勢: 不明'
              }
            >
              <div
                style={{
                  width: `${(evalInfo?.scoreCp !== undefined ? cpToSenteWinRate(evalInfo.scoreCp) : 0.5) * 100}%`,
                  height: '100%',
                  background: '#1f1f1f',
                  transition: 'width 0.4s ease',
                }}
              />
            </div>
            <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.85)', flex: '0 0 auto' }}>後手△</span>
            <span
              data-testid="shogi-engine-eval"
              style={{
                fontSize: '12px',
                color: 'rgba(255,255,255,0.75)',
                fontVariantNumeric: 'tabular-nums',
                minWidth: '8.5em',
                flex: '0 0 auto',
              }}
            >
              {evalInfo?.scoreCp !== undefined
                ? Math.abs(evalInfo.scoreCp) >= 29000
                  ? evalInfo.scoreCp > 0
                    ? '先手勝勢（詰み）'
                    : '後手勝勢（詰み）'
                  : `評価値 ${evalInfo.scoreCp >= 0 ? '+' : ''}${evalInfo.scoreCp}${
                      evalInfo.depth ? `（深さ${evalInfo.depth}）` : ''
                    }`
                : aiPlayingBook && gameState.isAIThinking ? '定跡' : '評価値 —'}
            </span>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: '1200px', margin: '10px auto 0', display: 'flex', gap: '40px', flexWrap: 'wrap', justifyContent: 'center' }}>
        {/* Typeface selector row: always rendered at a fixed height so the
            board below never shifts (same layout contract as the status strip). */}
        <div style={{ flexBasis: '100%', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <ShogiTypefaceSelector />
        </div>
        {/* Gote Captured Pieces */}
        <div style={{ flex: '0 0 auto' }}>
          <h3 style={{ marginBottom: '10px' }}>{copy.aiPieces}</h3>
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

        {/* Board (with coordinate labels: suji 1-9 above, right-to-left; dan 一-九
            to the right, top-to-bottom — standard shogi notation orientation as
            seen from Sente. `boardFlipped` mirrors both label strips in lockstep
            with the board so labels always line up with their squares.
            The original 9x9 board grid (sizing/border/background/gap) is kept
            completely intact and nested unchanged inside a small label wrapper,
            so the board's own layout/position contract is untouched. */}
        <div style={{ flex: '0 1 auto', maxWidth: '100%', overflowX: 'auto' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(9, ${CELL_SIZE}) ${DAN_LABEL_SIZE}`,
              gridTemplateRows: `${SUJI_LABEL_SIZE} auto`,
              width: 'fit-content',
            }}
          >
            {/* Top-left corner spacer */}
            <div style={{ gridColumn: '1 / 10', gridRow: 1, display: 'grid', gridTemplateColumns: `repeat(9, ${CELL_SIZE})` }}>
              {/* Suji labels (筋): 1-9, right to left; reversed with the board flip. */}
              {Array.from({ length: 9 }, (_, col) => {
                const suji = boardFlipped ? col + 1 : 9 - col;
                return (
                  <div key={`suji-${suji}`} style={coordLabelStyle}>
                    {KIFU_SUJI[suji - 1]}
                  </div>
                );
              })}
            </div>

            <div
              style={{
                gridColumn: '1 / 10',
                gridRow: 2,
                display: 'grid',
                gridTemplateColumns: `repeat(9, ${CELL_SIZE})`,
                gap: '1px',
                background: '#333',
                border: '2px solid #666',
                padding: '1px',
              }}
            >
              {Array.from({ length: 9 }, (_, row) =>
                Array.from({ length: 9 }, (_, col) => {
                  // Display-only flip: cells keep their real (suji, dan) identity
                  // (clicks, moves, highlights are untouched); only the order the
                  // grid renders them in changes.
                  const suji = boardFlipped ? col + 1 : 9 - col; // normal: right to left (9→1)
                  const actualDan = boardFlipped ? 9 - row : row + 1;
                  const pos = new Position(suji, actualDan);
                  const posInt = pos.toInt();
                  const isValidMove = gameState.validMoves.some(
                    m => m.to === posInt
                  );
                  const isLastTo = lastMove !== null && lastMove.to === posInt;
                  // Drops (from === 0) have no origin square to mark.
                  const isLastFrom = lastMove !== null && lastMove.from !== 0 && lastMove.from === posInt;

                  return (
                    <div
                      key={`${suji}-${actualDan}`}
                      data-testid={`cell-${suji}-${actualDan}`}
                      onClick={() => handleCellClick(suji, actualDan)}
                      style={{
                        width: CELL_SIZE,
                        height: CELL_SIZE,
                        background: isValidMove
                          ? 'rgba(0, 255, 0, 0.2)'
                          : isLastTo
                            ? '#f5c96b' // last move: destination (strong amber)
                            : isLastFrom
                              ? '#f8dfa2' // last move: origin (soft amber)
                              : '#ffe8b8',
                        border: '1px solid #8b7355',
                        // Replay is a read-only playback state (clicks are
                        // ignored — see handleCellClick's `replay ||` guard);
                        // reflect that in the cursor instead of implying the
                        // board is interactive.
                        cursor: replay ? 'default' : 'pointer',
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

            {/* Dan labels (段): 一-九, top to bottom; reversed with the board flip.
                A separate grid matched to the board's own row count/sizing so each
                label lines up with its row despite the board's 2px border + 1px gaps. */}
            <div
              style={{
                gridColumn: 10,
                gridRow: 2,
                display: 'grid',
                gridTemplateRows: `repeat(9, ${CELL_SIZE})`,
                gap: '1px',
                padding: '1px',
                marginLeft: '2px',
              }}
            >
              {Array.from({ length: 9 }, (_, row) => {
                const actualDan = boardFlipped ? 9 - row : row + 1;
                return (
                  <div key={`dan-${actualDan}`} style={coordLabelStyle}>
                    {KIFU_DAN[actualDan - 1]}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Sente Captured Pieces */}
        <div style={{ flex: '0 0 auto' }}>
          <h3 style={{ marginBottom: '10px' }}>{copy.yourPieces}</h3>
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

      {/* Display controls (always rendered, constant content → no layout shift) */}
      <div
        style={{
          maxWidth: '1200px',
          margin: '18px auto 0',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: '10px',
          flexWrap: 'wrap',
        }}
      >
        <button
          type="button"
          onClick={() => setBoardFlipped(f => !f)}
          aria-pressed={boardFlipped}
          title="盤面の表示だけを180°回転します（操作はそのまま）"
          style={togglePillStyle(boardFlipped)}
        >
          盤反転（後手視点）
        </button>
        <button
          type="button"
          onClick={toggleEvalBar}
          aria-pressed={showEvalBar}
          title="AIの評価値による形勢バーを表示します（ネタバレ注意）"
          style={togglePillStyle(showEvalBar)}
        >
          形勢バー
        </button>
        <button
          type="button"
          onClick={toggleSound}
          aria-pressed={soundEnabled}
          title="着手時に駒音を鳴らします"
          style={togglePillStyle(soundEnabled)}
        >
          駒音
        </button>
      </div>

      {/* Kifu (move list) + replay controls when a pasted kifu is being stepped through. */}
      {moveList.length > 0 && (
        <div style={{ maxWidth: '1200px', margin: '28px auto 0', display: 'flex', justifyContent: 'center' }}>
          <div style={{ width: 'min(680px, 100%)', background: 'rgba(255,255,255,0.06)', borderRadius: '8px', padding: '12px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
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

            {replay && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => setReplay((r) => (r ? { ...r, viewPly: 0 } : r))}
                  disabled={replay.viewPly === 0}
                  style={replayButtonStyle(replay.viewPly === 0)}
                  title="最初の局面へ"
                >
                  ⏮
                </button>
                <button
                  type="button"
                  onClick={() => replayStep(-1)}
                  disabled={replay.viewPly === 0}
                  style={replayButtonStyle(replay.viewPly === 0)}
                  title="1手戻る"
                >
                  ◀ 戻る
                </button>
                <span style={{ fontSize: '13px', color: '#e6e6e6', fontVariantNumeric: 'tabular-nums', minWidth: '5em', textAlign: 'center' }}>
                  {replay.viewPly} / {replay.positions.length - 1} 手
                </span>
                <button
                  type="button"
                  onClick={() => replayStep(1)}
                  disabled={replay.viewPly >= replay.positions.length - 1}
                  style={replayButtonStyle(replay.viewPly >= replay.positions.length - 1)}
                  title="1手進む"
                >
                  進む ▶
                </button>
                <button
                  type="button"
                  onClick={() => setReplay((r) => (r ? { ...r, viewPly: r.positions.length - 1 } : r))}
                  disabled={replay.viewPly >= replay.positions.length - 1}
                  style={replayButtonStyle(replay.viewPly >= replay.positions.length - 1)}
                  title="最後の局面へ"
                >
                  ⏭
                </button>
                <button
                  type="button"
                  onClick={handlePlayFromReplay}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '6px',
                    border: '1px solid rgba(74,222,128,0.6)',
                    background: 'rgba(74,222,128,0.16)',
                    color: '#4ade80',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                  title="この局面から対局を再開します"
                >
                  ここから指す
                </button>
              </div>
            )}

            <div style={{ maxHeight: '170px', overflowY: 'auto', display: 'flex', flexWrap: 'wrap', gap: '2px 14px', fontSize: '14px', lineHeight: 1.7 }}>
              {moveList.map((m, i) =>
                replay ? (
                  // During replay each move is a real, keyboard-operable button
                  // (Tab/Enter/Space) that jumps the board to that ply — plain
                  // <span onClick> is neither focusable nor announced as
                  // interactive by assistive tech.
                  <button
                    key={i}
                    type="button"
                    onClick={() => setReplay((r) => (r ? { ...r, viewPly: i + 1 } : r))}
                    style={{
                      minWidth: '5.5em',
                      textAlign: 'left',
                      background: 'transparent',
                      border: 'none',
                      padding: 0,
                      color: replay.viewPly === i + 1 ? '#ffd700' : '#e6e6e6',
                      fontWeight: replay.viewPly === i + 1 ? 700 : 400,
                      fontVariantNumeric: 'tabular-nums',
                      fontSize: '14px',
                      fontFamily: 'inherit',
                      cursor: 'pointer',
                    }}
                  >
                    {i + 1}. {moveToKifu(m, moveList[i - 1])}
                  </button>
                ) : (
                  <span
                    key={i}
                    style={{
                      minWidth: '5.5em',
                      color: '#e6e6e6',
                      fontVariantNumeric: 'tabular-nums',
                      cursor: 'default',
                    }}
                  >
                    {i + 1}. {moveToKifu(m, moveList[i - 1])}
                  </span>
                )
              )}
            </div>
          </div>
        </div>
      )}

      {/* Kifu import ("棋譜を読み込む") */}
      <div style={{ maxWidth: '1200px', margin: '18px auto 0', display: 'flex', justifyContent: 'center' }}>
        <KifuImportPanel startingPosition={gameState.kyokumen} onImported={handleKifuImported} />
      </div>

      {/*
        Standing notice that games are recorded. Deliberately quiet — it is
        always visible while playing rather than being a dismissable banner,
        because a notice you can make go away is one most players never read.
      */}
      <p
        style={{
          maxWidth: 'min(680px, 92%)',
          margin: '14px auto 0',
          textAlign: 'center',
          fontSize: '12px',
          lineHeight: 1.6,
          color: 'rgba(255,255,255,0.45)',
        }}
      >
        {copy.recordNotice}
      </p>

      {/* Game Over / terminal engine failure */}
      {(gameState.gameOver || engineFailed) && (
        <div style={{ textAlign: 'center', marginTop: '30px' }}>
          <h2 style={{ fontSize: '2rem', marginBottom: '20px' }}>
            {engineFailed
              ? copy.engineUnavailable
              : gameState.winner === SENTE
                ? copy.youWin
                : copy.aiWins}
          </h2>
          <button
            data-testid={engineFailed ? 'shogi-engine-retry' : undefined}
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
            {engineFailed ? copy.retryGame : copy.playAgain}
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
            <h3 style={{ marginBottom: '20px', fontSize: '1.5rem' }}>{copy.promoteTitle}</h3>
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
                {copy.promote}
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
                {copy.keepOriginal}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Info Modal */}
      <InfoModal isOpen={showInfoModal} onClose={() => setShowInfoModal(false)} title={copy.howToPlayTitle}>
        <div style={{ lineHeight: '1.6' }}>
          <p>
            <strong>{copy.objectiveLabel}</strong> {copy.objectiveBody}
          </p>
          <p>
            <strong>{copy.basicRulesLabel}</strong>
          </p>
          <ul>
            {copy.basicRules.map((rule, i) => (
              <li key={i}>{rule}</li>
            ))}
          </ul>
          <p>
            <strong>{copy.controlsLabel}</strong>
          </p>
          <ul>
            {copy.controls.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
      </InfoModal>
    </div>
  );
};

export default ShogiImproved;
