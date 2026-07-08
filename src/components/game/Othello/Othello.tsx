/**
 * Othello Game Component
 * Based on Thell 3.0.3 engine (see AI.ts / Board.ts / Evaluator.ts).
 * Supports single-player (vs AI) and the existing Firebase multiplayer lobby.
 *
 * This file owns presentation only; all game rules live in the engine classes.
 * UI is theme-aware, bilingual (ja/en) and fully responsive — see
 * Othello.module.css and i18n.ts.
 */

'use client';

import { useFeatureLifecycle } from '@/hooks/useActivityTracker';
import { CircleHelp, Cpu, Loader2, Play, RotateCcw } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Difficulty, GameStats, GameTopBar, InfoModal } from '../common';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { OthelloAI } from './AI';
import { Board } from './Board';
import { getOthelloStrings } from './i18n';
import { initMobilityTables } from './MobilityTable';
import { OthelloMultiplayerLobby } from './OthelloMultiplayerLobby';
import styles from './Othello.module.css';
import type { MoveHistoryEntry } from './multiplayerTypes';
import { BLACK, BOARD_SIZE, Color, EMPTY, Point, pointToString, WHITE } from './types';
import { useOthelloMultiplayer } from './useOthelloMultiplayer';

const DIFFICULTY_ORDER: Difficulty[] = ['easy', 'medium', 'hard', 'expert', 'master'];

/**
 * A structured (language-independent) description of the current status, so
 * the visible string can be recomputed on a language switch without replaying
 * the game. `payload` carries whatever the phrasing needs.
 */
type StatusKind =
  | { kind: 'toPlay'; color: Color }
  | { kind: 'mustPass'; color: Color }
  | { kind: 'passed'; passer: Color }
  | { kind: 'aiPlayed'; move: string; next: Color }
  | { kind: 'blackWin'; a: number; b: number }
  | { kind: 'whiteWin'; a: number; b: number }
  | { kind: 'draw'; a: number; b: number };

interface OthelloState {
  board: Board;
  validMoves: Point[];
  gameOver: boolean;
  winner: Color | null;
  isAIThinking: boolean;
  status: StatusKind;
  lastMove: Point | null;
  moveHistory: MoveHistoryEntry[];
}

type GameMode = 'menu' | 'ai' | 'multiplayer';

const Othello = () => {
  const _lifecycle = useFeatureLifecycle('game.othello');
  const { language } = useGameLanguage();
  const t = useMemo(() => getOthelloStrings(language), [language]);

  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [selectedDifficulty, setSelectedDifficulty] = useState<Difficulty>('medium');
  const [playerColor, setPlayerColor] = useState<Color>(BLACK);
  const [selectedPlayerColor, setSelectedPlayerColor] = useState<Color>(BLACK);
  const [showDifficultySelect, setShowDifficultySelect] = useState<boolean>(true);
  const [showInfoModal, setShowInfoModal] = useState<boolean>(false);
  const [stats, setStats] = useState<GameStats>({ wins: 0, losses: 0, draws: 0 });
  const [gameMode, setGameMode] = useState<GameMode>('menu');

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
      status: { kind: 'toPlay', color: BLACK },
      lastMove: null,
      moveHistory: [],
    };
  });

  const lastProcessedUpdate = useRef<number>(0);

  useEffect(() => {
    initMobilityTables();
  }, []);

  // ---- Status phrasing (language-aware, computed from StatusKind) ----
  const statusText = useCallback(
    (s: StatusKind): string => {
      const name = (c: Color) => (c === BLACK ? t.black : t.white);
      switch (s.kind) {
        case 'toPlay':
          return s.color === BLACK ? t.blackToPlay : t.whiteToPlay;
        case 'mustPass':
          return s.color === BLACK ? t.blackMustPass : t.whiteMustPass;
        case 'passed':
          return t.passed(name(s.passer), name((-s.passer) as Color));
        case 'aiPlayed':
          return t.aiPlayed(s.move, name(s.next));
        case 'blackWin':
          return t.blackWins(s.a, s.b);
        case 'whiteWin':
          return t.whiteWins(s.a, s.b);
        case 'draw':
          return t.draw(s.a, s.b);
      }
    },
    [t]
  );

  const initGame = useCallback((newPlayerColor: Color) => {
    const board = new Board();
    const isPlayerTurn = newPlayerColor === BLACK;
    setGameState({
      board,
      validMoves: board.getMovablePos(),
      gameOver: false,
      winner: null,
      isAIThinking: !isPlayerTurn,
      status: { kind: 'toPlay', color: BLACK },
      lastMove: null,
      moveHistory: [],
    });
  }, []);

  // Terminal / turn evaluation returning a language-independent status.
  const checkGameState = useCallback(
    (board: Board): { isOver: boolean; winner: Color | null; status: StatusKind } => {
      if (board.isGameOver()) {
        const b = board.countDisc(BLACK);
        const w = board.countDisc(WHITE);
        if (b > w) return { isOver: true, winner: BLACK, status: { kind: 'blackWin', a: b, b: w } };
        if (w > b) return { isOver: true, winner: WHITE, status: { kind: 'whiteWin', a: w, b } };
        return { isOver: true, winner: null, status: { kind: 'draw', a: b, b: w } };
      }
      const currentColor = board.getCurrentColor();
      if (board.getMovablePos().length === 0) {
        return { isOver: false, winner: null, status: { kind: 'mustPass', color: currentColor } };
      }
      return { isOver: false, winner: null, status: { kind: 'toPlay', color: currentColor } };
    },
    []
  );

  const handleCellClick = useCallback(
    (x: number, y: number) => {
      if (gameState.gameOver || gameState.isAIThinking) return;
      if (gameMode === 'ai' && gameState.board.getCurrentColor() !== playerColor) return;
      if (gameMode === 'multiplayer' && gameState.board.getCurrentColor() !== multiplayer.myColor) return;

      const point: Point = { x, y };
      const currentColor = gameState.board.getCurrentColor();
      if (!gameState.validMoves.some((m) => m.x === x && m.y === y)) return;

      const newBoard = gameState.board.clone();
      if (!newBoard.move(point)) return;

      const newMoveEntry: MoveHistoryEntry = {
        moveNumber: gameState.moveHistory.length + 1,
        color: currentColor,
        move: point,
        timestamp: Date.now(),
      };
      const newMoveHistory = [...gameState.moveHistory, newMoveEntry];
      const { isOver, winner, status } = checkGameState(newBoard);

      if (isOver) {
        setGameState((prev) => ({
          ...prev,
          board: newBoard,
          validMoves: [],
          gameOver: true,
          winner,
          status,
          lastMove: point,
          moveHistory: newMoveHistory,
        }));

        if (gameMode === 'ai') {
          if (winner === playerColor) setStats((p) => ({ ...p, wins: p.wins + 1 }));
          else if (winner === aiColor) setStats((p) => ({ ...p, losses: p.losses + 1 }));
          else setStats((p) => ({ ...p, draws: p.draws + 1 }));
        } else if (gameMode === 'multiplayer') {
          if (winner === multiplayer.myColor) setStats((p) => ({ ...p, wins: p.wins + 1 }));
          else if (winner === multiplayer.opponentColor) setStats((p) => ({ ...p, losses: p.losses + 1 }));
          else setStats((p) => ({ ...p, draws: p.draws + 1 }));
          void multiplayer.makeMove(point);
        }
        return;
      }

      if (gameMode === 'multiplayer') {
        void multiplayer.makeMove(point);
      }

      setGameState((prev) => ({
        ...prev,
        board: newBoard,
        validMoves: newBoard.getMovablePos(),
        status,
        lastMove: point,
        moveHistory: newMoveHistory,
        isAIThinking: gameMode === 'ai',
      }));
    },
    [gameState, checkGameState, playerColor, aiColor, gameMode, multiplayer]
  );

  // ---- Multiplayer sync from Firebase (unchanged logic) ----
  useEffect(() => {
    if (gameMode !== 'multiplayer') return;
    if (!multiplayer.gameState) return;
    const networkState = multiplayer.gameState;
    if (networkState.lastUpdate <= lastProcessedUpdate.current) return;
    lastProcessedUpdate.current = networkState.lastUpdate;

    const newBoard = new Board();
    for (let y = 1; y <= 8; y++) {
      for (let x = 1; x <= 8; x++) {
        const index = (y - 1) * 8 + (x - 1);
        newBoard.setColor(x, y, networkState.board[index] as Color);
      }
    }
    newBoard.setCurrentColor(networkState.currentTurn);
    newBoard.setTurns(networkState.turnNumber);
    newBoard.recalcIndices();

    if (networkState.gameOver) {
      let status: StatusKind;
      if (networkState.winner === BLACK) {
        status = { kind: 'blackWin', a: networkState.blackCount, b: networkState.whiteCount };
      } else if (networkState.winner === WHITE) {
        status = { kind: 'whiteWin', a: networkState.whiteCount, b: networkState.blackCount };
      } else {
        status = { kind: 'draw', a: networkState.blackCount, b: networkState.whiteCount };
      }

      setGameState((prev) => ({
        ...prev,
        board: newBoard,
        validMoves: [],
        gameOver: true,
        winner: networkState.winner,
        status,
        lastMove: networkState.lastMove,
        moveHistory: networkState.moveHistory || prev.moveHistory,
      }));

      if (!gameState.gameOver) {
        if (networkState.winner === multiplayer.myColor) setStats((p) => ({ ...p, wins: p.wins + 1 }));
        else if (networkState.winner === multiplayer.opponentColor) setStats((p) => ({ ...p, losses: p.losses + 1 }));
        else setStats((p) => ({ ...p, draws: p.draws + 1 }));
      }
      return;
    }

    const validMoves = newBoard.getMovablePos();
    const status: StatusKind =
      validMoves.length === 0
        ? { kind: 'mustPass', color: networkState.currentTurn }
        : { kind: 'toPlay', color: networkState.currentTurn };

    setGameState((prev) => ({
      ...prev,
      board: newBoard,
      validMoves,
      status,
      lastMove: networkState.lastMove,
      moveHistory: networkState.moveHistory || prev.moveHistory,
      gameOver: false,
    }));
  }, [gameMode, multiplayer.gameState, multiplayer.myColor, multiplayer.opponentColor, gameState.gameOver]);

  // ---- Multiplayer auto-pass (unchanged logic) ----
  useEffect(() => {
    if (gameMode !== 'multiplayer') return;
    if (gameState.gameOver) return;
    const currentColor = gameState.board.getCurrentColor();
    const validMoves = gameState.board.getMovablePos();
    if (currentColor !== multiplayer.myColor) return;
    if (validMoves.length > 0) return;

    const probe = gameState.board.clone();
    probe.pass();
    if (probe.getMovablePos().length === 0) {
      const { winner, status } = checkGameState(gameState.board);
      setGameState((prev) => ({ ...prev, gameOver: true, winner, status, validMoves: [] }));
      if (winner === multiplayer.myColor) setStats((p) => ({ ...p, wins: p.wins + 1 }));
      else if (winner === multiplayer.opponentColor) setStats((p) => ({ ...p, losses: p.losses + 1 }));
      else setStats((p) => ({ ...p, draws: p.draws + 1 }));
      return;
    }

    const timeoutId = setTimeout(() => {
      const passedBoard = gameState.board.clone();
      passedBoard.pass();
      const passEntry: MoveHistoryEntry = {
        moveNumber: gameState.moveHistory.length + 1,
        color: currentColor,
        move: null,
        timestamp: Date.now(),
      };
      setGameState((prev) => ({
        ...prev,
        board: passedBoard,
        validMoves: passedBoard.getMovablePos(),
        status: { kind: 'passed', passer: currentColor },
        lastMove: null,
        moveHistory: [...prev.moveHistory, passEntry],
      }));
    }, 1500);

    return () => clearTimeout(timeoutId);
  }, [gameMode, gameState.board, gameState.gameOver, gameState.validMoves, gameState.moveHistory, multiplayer.myColor, multiplayer, checkGameState]);

  // ---- AI move (single-player) ----
  useEffect(() => {
    if (gameMode !== 'ai') return;
    if (!gameState.isAIThinking || gameState.gameOver) return;

    const currentBoard = gameState.board;
    if (currentBoard.getCurrentColor() !== aiColor) {
      setGameState((prev) => ({ ...prev, isAIThinking: false }));
      return;
    }

    if (currentBoard.getMovablePos().length === 0) {
      const newBoard = currentBoard.clone();
      newBoard.pass();
      const { isOver, winner, status } = checkGameState(newBoard);
      setGameState((prev) => ({
        ...prev,
        board: newBoard,
        validMoves: newBoard.getMovablePos(),
        gameOver: isOver,
        winner,
        status: isOver ? status : { kind: 'passed', passer: aiColor },
        isAIThinking: false,
      }));
      return;
    }

    const timeoutId = setTimeout(() => {
      const ai = new OthelloAI(difficulty);
      const bestMove = ai.getBestMove(currentBoard);

      if (!bestMove) {
        const newBoard = currentBoard.clone();
        newBoard.pass();
        const { isOver, winner, status } = checkGameState(newBoard);
        setGameState((prev) => ({
          ...prev,
          board: newBoard,
          validMoves: newBoard.getMovablePos(),
          gameOver: isOver,
          winner,
          status: isOver ? status : { kind: 'passed', passer: aiColor },
          isAIThinking: false,
        }));
        return;
      }

      const newBoard = currentBoard.clone();
      newBoard.move(bestMove);
      const { isOver, winner, status } = checkGameState(newBoard);

      if (isOver) {
        setGameState((prev) => ({
          ...prev,
          board: newBoard,
          validMoves: [],
          gameOver: true,
          winner,
          status,
          lastMove: bestMove,
          isAIThinking: false,
        }));
        if (winner === playerColor) setStats((p) => ({ ...p, wins: p.wins + 1 }));
        else if (winner === aiColor) setStats((p) => ({ ...p, losses: p.losses + 1 }));
        else setStats((p) => ({ ...p, draws: p.draws + 1 }));
        return;
      }

      const playerMovables = newBoard.getMovablePos();
      if (playerMovables.length === 0 && !newBoard.isGameOver()) {
        newBoard.pass();
        setGameState((prev) => ({
          ...prev,
          board: newBoard,
          validMoves: newBoard.getMovablePos(),
          status: { kind: 'passed', passer: playerColor },
          lastMove: bestMove,
          isAIThinking: true,
        }));
        return;
      }

      setGameState((prev) => ({
        ...prev,
        board: newBoard,
        validMoves: playerMovables,
        status: { kind: 'aiPlayed', move: pointToString(bestMove), next: playerColor },
        lastMove: bestMove,
        isAIThinking: false,
      }));
    }, 450);

    return () => clearTimeout(timeoutId);
  }, [gameMode, gameState.isAIThinking, gameState.gameOver, gameState.board, difficulty, checkGameState, playerColor, aiColor]);

  const startAIGame = useCallback(() => {
    setDifficulty(selectedDifficulty);
    setPlayerColor(selectedPlayerColor);
    setShowDifficultySelect(false);
    setGameMode('ai');
    initGame(selectedPlayerColor);
  }, [initGame, selectedDifficulty, selectedPlayerColor]);

  const startMultiplayerGame = useCallback(async () => {
    const board = new Board();
    lastProcessedUpdate.current = 0;
    setGameState({
      board,
      validMoves: board.getMovablePos(),
      gameOver: false,
      winner: null,
      isAIThinking: false,
      status: { kind: 'toPlay', color: BLACK },
      lastMove: null,
      moveHistory: [],
    });
    setPlayerColor(multiplayer.myColor);
    setShowDifficultySelect(false);
    setGameMode('multiplayer');
    if (multiplayer.context.isHost) {
      await multiplayer.startGame();
    }
  }, [multiplayer]);

  // When the lobby transitions to "playing", leave the setup screen and enter
  // the multiplayer game. Driven by an effect (not called during render) so it
  // can't trigger state updates mid-render or double-fire under Strict Mode.
  useEffect(() => {
    if (!showDifficultySelect) return;
    if (multiplayer.context.lobbyState !== 'playing') return;
    void startMultiplayerGame();
  }, [showDifficultySelect, multiplayer.context.lobbyState, startMultiplayerGame]);

  // ---- Info modal content ----
  const infoContent = (
    <div className={styles.infoBody}>
      <p>
        <strong>{t.objectiveTitle}:</strong> {t.objectiveBody}
      </p>
      <p>
        <strong>{t.rulesTitle}</strong>
      </p>
      <ul>
        {t.rules.map((r, i) => (
          <li key={i}>{r}</li>
        ))}
      </ul>
      <p>
        <strong>{t.strategyTitle}</strong>
      </p>
      <ul>
        {t.strategies.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ul>
    </div>
  );

  // ---- Board render ----
  const renderBoard = () => {
    const myTurnColor = gameMode === 'multiplayer' ? multiplayer.myColor : playerColor;
    const cells: React.ReactNode[] = [];

    for (let y = 1; y <= BOARD_SIZE; y++) {
      for (let x = 1; x <= BOARD_SIZE; x++) {
        const color = gameState.board.getColor(x, y);
        const isValidMove = gameState.validMoves.some((m) => m.x === x && m.y === y);
        const isLastMove = gameState.lastMove?.x === x && gameState.lastMove?.y === y;
        const showHint = isValidMove && !gameState.isAIThinking && !gameState.gameOver;
        const canClick = showHint && gameState.board.getCurrentColor() === myTurnColor;
        const coord = `${String.fromCharCode(96 + x)}${y}`;

        cells.push(
          <button
            key={`${x}-${y}`}
            type="button"
            className={`${styles.cell} ${canClick ? styles.playable : ''}`}
            onClick={() => handleCellClick(x, y)}
            // Keep every cell focusable so keyboard users can move across the
            // board and hear each square's coordinate/occupancy label. Illegal
            // moves are prevented via aria-disabled + the guard in
            // handleCellClick, not `disabled` (which would remove focus).
            aria-disabled={!canClick}
            aria-label={
              color === BLACK
                ? `${coord} ${t.black}`
                : color === WHITE
                  ? `${coord} ${t.white}`
                  : canClick
                    ? `${coord} — ${t.yourTurn}`
                    : coord
            }
          >
            {color !== EMPTY && (
              <span
                className={`${styles.disc} ${color === BLACK ? styles.showBlack : styles.showWhite} ${
                  isLastMove ? styles.placed : ''
                }`}
              >
                <span className={`${styles.discFace} ${styles.discBlack}`} />
                <span className={`${styles.discFace} ${styles.discWhite}`} />
                {isLastMove && <span className={styles.lastRing} />}
              </span>
            )}
            {color === EMPTY && showHint && <span className={styles.hint} />}
          </button>
        );
      }
    }
    return cells;
  };

  // ---- Setup / lobby screen ----
  if (showDifficultySelect) {
    const isInMultiplayerLobby =
      multiplayer.context.lobbyState !== 'idle' || multiplayer.context.roomId !== null;

    // The lobby -> game transition is handled by the effect above, not here.

    const selDiff = t.difficultyLabels[selectedDifficulty];

    return (
      <div className={styles.page} style={{ justifyContent: 'center' }}>
        <div className={styles.setupCard}>
          <div className={styles.setupHeader}>
            <span className={styles.setupBadge}>
              <span className={`${styles.badgeDisc} ${styles.black}`} />
              <span className={`${styles.badgeDisc} ${styles.white}`} />
            </span>
            <div>
              <h1 className={styles.setupTitle}>{t.title}</h1>
              <p className={styles.setupTagline}>{t.tagline}</p>
            </div>
          </div>

          <OthelloMultiplayerLobby multiplayer={multiplayer} onGameStart={startMultiplayerGame} />

          {!isInMultiplayerLobby && (
            <div className={styles.setupSection}>
              <div>
                <span className={styles.kicker}>
                  <Cpu size={14} /> {t.aiMatch}
                </span>
                <h2 className={styles.sectionHeading}>{t.setupSinglePlayer}</h2>
              </div>

              <div>
                <div className={styles.fieldLabel} style={{ marginBottom: '0.5rem' }}>
                  {t.difficulty}
                </div>
                <div className={styles.optionGrid}>
                  {DIFFICULTY_ORDER.map((value) => {
                    const d = t.difficultyLabels[value];
                    return (
                      <button
                        type="button"
                        key={value}
                        onClick={() => setSelectedDifficulty(value)}
                        className={styles.optionButton}
                        data-selected={selectedDifficulty === value ? 'true' : 'false'}
                        aria-pressed={selectedDifficulty === value}
                      >
                        <span className={styles.optionLabel}>{d.label}</span>
                        <span className={styles.optionDesc}>{d.description}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className={styles.fieldLabel} style={{ marginBottom: '0.5rem' }}>
                  {t.chooseColor}
                </div>
                <div className={styles.colorRow}>
                  <button
                    type="button"
                    className={styles.colorOption}
                    data-selected={selectedPlayerColor === BLACK ? 'true' : 'false'}
                    aria-pressed={selectedPlayerColor === BLACK}
                    onClick={() => setSelectedPlayerColor(BLACK)}
                  >
                    <span className={`${styles.colorSwatch} ${styles.black}`} />
                    <span>
                      <span className={styles.colorName}>{t.black}</span>
                      <span style={{ display: 'block' }} className={styles.colorSub}>
                        {t.moveFirst}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    className={styles.colorOption}
                    data-selected={selectedPlayerColor === WHITE ? 'true' : 'false'}
                    aria-pressed={selectedPlayerColor === WHITE}
                    onClick={() => setSelectedPlayerColor(WHITE)}
                  >
                    <span className={`${styles.colorSwatch} ${styles.white}`} />
                    <span>
                      <span className={styles.colorName}>{t.white}</span>
                      <span style={{ display: 'block' }} className={styles.colorSub}>
                        {t.moveSecond}
                      </span>
                    </span>
                  </button>
                </div>
              </div>

              <button type="button" onClick={startAIGame} className={styles.btnPrimary} style={{ width: '100%' }}>
                <Play size={17} />
                {t.startVsAi} · {selDiff.label} · {selectedPlayerColor === BLACK ? t.black : t.white}
              </button>
            </div>
          )}

          <button type="button" onClick={() => setShowInfoModal(true)} className={styles.btnGhost} style={{ width: '100%' }}>
            <CircleHelp size={16} />
            {t.howToPlay}
          </button>
        </div>

        <InfoModal isOpen={showInfoModal} title={t.howToPlay} onClose={() => setShowInfoModal(false)}>
          {infoContent}
        </InfoModal>
      </div>
    );
  }

  // ---- In-game screen ----
  const currentColor = gameState.board.getCurrentColor();
  const blackActive = currentColor === BLACK && !gameState.gameOver;
  const whiteActive = currentColor === WHITE && !gameState.gameOver;

  const roleFor = (side: Color): string => {
    if (gameState.gameOver) return '';
    if (currentColor !== side) return '';
    if (gameMode === 'multiplayer') {
      return multiplayer.myColor === side ? t.yourTurn : t.opponentTurn(multiplayer.otherPlayer?.name || '—');
    }
    return playerColor === side ? t.yourTurn : t.aiTurn;
  };

  const isWaitingForOpponent =
    gameMode === 'multiplayer' && currentColor !== multiplayer.myColor && !gameState.gameOver;

  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        <GameTopBar stats={stats} onInfoClick={() => setShowInfoModal(true)} />

        {/* Scoreboard */}
        <div className={styles.scoreboard}>
          <div className={`${styles.scoreSide} ${blackActive ? styles.active : ''}`}>
            <span className={`${styles.scoreDisc} ${styles.black}`} />
            <span className={styles.scoreMeta}>
              <span className={styles.scoreCount}>{gameState.board.countDisc(BLACK)}</span>
              <span className={styles.scoreRole}>{roleFor(BLACK)}</span>
            </span>
          </div>

          <span className={styles.scoreVs}>
            {gameMode === 'multiplayer'
              ? t.youAreVs(
                  multiplayer.myColor === BLACK ? t.black : t.white,
                  multiplayer.otherPlayer?.name || '—'
                )
              : t.youAre(playerColor === BLACK ? t.black : t.white)}
          </span>

          <div className={`${styles.scoreSide} ${styles.right} ${whiteActive ? styles.active : ''}`}>
            <span className={`${styles.scoreDisc} ${styles.white}`} />
            <span className={styles.scoreMeta} style={{ textAlign: 'right' }}>
              <span className={styles.scoreCount}>{gameState.board.countDisc(WHITE)}</span>
              <span className={styles.scoreRole}>{roleFor(WHITE)}</span>
            </span>
          </div>
        </div>

        {/* Status */}
        <div className={`${styles.status} ${gameState.gameOver ? styles.over : ''}`} role="status" aria-live="polite">
          {gameState.isAIThinking && gameMode === 'ai' ? (
            <>
              <Loader2 className={styles.spinner} />
              <span>{t.thinking}</span>
            </>
          ) : isWaitingForOpponent ? (
            <>
              <Loader2 className={styles.spinner} />
              <span>{t.waitingFor(multiplayer.otherPlayer?.name || '—')}</span>
            </>
          ) : (
            <span>{statusText(gameState.status)}</span>
          )}
        </div>

        {/* Board */}
        <div className={styles.boardFrame}>
          <div className={styles.coordsTop} aria-hidden="true">
            {['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((c) => (
              <span key={c} className={styles.coordLabel}>
                {c}
              </span>
            ))}
          </div>
          <div className={styles.boardBody}>
            <div className={styles.coordsLeft} aria-hidden="true">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                <span key={n} className={styles.coordRowLabel}>
                  {n}
                </span>
              ))}
            </div>
            <div className={styles.grid} role="grid" aria-label={t.title}>
              {renderBoard()}
            </div>
          </div>
        </div>

        {/* Game-over actions */}
        {gameState.gameOver && (
          <div className={styles.actions}>
            <button
              className={styles.btnPrimary}
              onClick={() => {
                if (gameMode === 'multiplayer') {
                  multiplayer.resetMultiplayer();
                  setShowDifficultySelect(true);
                  setGameMode('menu');
                } else {
                  initGame(playerColor);
                }
              }}
            >
              <RotateCcw size={18} />
              {gameMode === 'multiplayer' ? t.backToLobby : t.playAgain}
            </button>
            {gameMode === 'ai' && (
              <button
                className={styles.btnGhost}
                onClick={() => {
                  setShowDifficultySelect(true);
                  setGameMode('menu');
                }}
              >
                {t.newGame}
              </button>
            )}
          </div>
        )}

        {/* Move history */}
        <div className={styles.history}>
          <h3 className={styles.historyTitle}>{t.moveHistory}</h3>
          {gameState.moveHistory.length === 0 ? (
            <p className={styles.historyEmpty}>{t.noMoves}</p>
          ) : (
            <div className={styles.historyList}>
              {gameState.moveHistory.map((entry, i) => {
                const isLast = i === gameState.moveHistory.length - 1;
                const label = entry.move ? `${String.fromCharCode(96 + entry.move.x)}${entry.move.y}` : t.pass;
                return (
                  <span
                    key={i}
                    className={`${styles.historyChip} ${isLast ? styles.last : ''} ${
                      entry.move ? '' : styles.pass
                    }`}
                  >
                    <span className={`${styles.chipDisc} ${entry.color === BLACK ? styles.black : styles.white}`} />
                    {entry.moveNumber}. {label}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <InfoModal isOpen={showInfoModal} title={t.howToPlay} onClose={() => setShowInfoModal(false)}>
        {infoContent}
      </InfoModal>
    </div>
  );
};

export default Othello;
export { Othello };
