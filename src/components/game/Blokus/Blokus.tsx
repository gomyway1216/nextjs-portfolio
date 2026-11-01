/**
 * Blokus against the AI: classic four-colour on 20×20, or Duo on 14×14.
 * The human is always the first colour.
 */

'use client';

import { useFeatureLifecycle } from '@/hooks/useActivityTracker';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, FlipHorizontal2, RotateCcw, RotateCw, SlidersHorizontal } from 'lucide-react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Difficulty, DifficultySelector, GameStats, GameTopBar, InfoModal } from '../common';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { createBlokusAiClient, type BlokusAiClient } from './blokusAiWorkerClient';
import { Board, BoardText, type Ghost } from './Board';
import {
  ALL_PLACED_BONUS,
  ORIENTATIONS,
  PIECES,
  TOTAL_SQUARES,
  applyMove,
  cloneState,
  encodeMove,
  flipCells,
  legalMoves,
  moveCells,
  moveCol,
  moveOrientation,
  movePiece,
  moveRow,
  newGame,
  orientationOf,
  passTurn,
  rotateCells,
  scores,
  winners,
  type GameState,
  type Mode,
  type Orientation,
} from './engine';
import { getBlokusStrings, type BlokusStrings } from './i18n';
import { Tray } from './Tray';
import { usePieceDrag } from './usePieceDrag';
import styles from './Blokus.module.css';

const HUMAN = 0;
const DIFFICULTY_VALUES: Difficulty[] = ['easy', 'medium', 'hard', 'expert', 'master'];
const MODE_VALUES: Mode[] = ['classic', 'duo'];
/** An AI move shows for at least this long, so a quick level still reads as a turn. */
const MIN_AI_TURN_MS = 450;
/** When the human is out, the others play on at this pace. */
const WATCHING_TURN_MS = 160;
const PASS_NOTICE_MS = 1000;
/** A touch this close to a legal placement lands on it: a cell is about 17px on a phone. */
const SNAP_CELLS = 2;

interface Held {
  piece: number;
  orientation: Orientation;
  /** Top-left of the ghost, or null until it has been put on the board. */
  at: { row: number; col: number } | null;
}

const clampAt = (orientation: Orientation, size: number, row: number, col: number) => ({
  row: Math.max(0, Math.min(size - orientation.height, row)),
  col: Math.max(0, Math.min(size - orientation.width, col)),
});

/** The closest legal spot for this orientation, within `reach` cells of (row, col). */
const nearestLegal = (moves: readonly number[], orientation: Orientation, row: number, col: number, reach: number) => {
  let best: { row: number; col: number } | null = null;
  let bestDistance = reach + 1;
  for (const move of moves) {
    if (moveOrientation(move).index !== orientation.index) continue;
    const distance = Math.abs(moveRow(move) - row) + Math.abs(moveCol(move) - col);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = { row: moveRow(move), col: moveCol(move) };
    }
  }
  return best;
};

const playerName = (t: BlokusStrings, mode: Mode, color: number): string =>
  color === HUMAN ? t.you : t.ai(t.colors[mode][color]);

const statsAfter = (stats: GameStats, game: GameState): GameStats => {
  const top = winners(game);
  if (!top.includes(HUMAN)) return { ...stats, losses: stats.losses + 1 };
  return top.length === 1 ? { ...stats, wins: stats.wins + 1 } : { ...stats, draws: stats.draws + 1 };
};

const Result = ({ game, mode, t, onNewGame, onMenu }: { game: GameState; mode: Mode; t: BlokusStrings; onNewGame: () => void; onMenu: () => void }) => {
  const all = scores(game);
  const top = winners(game);
  const order = all.map((score, color) => ({ score, color })).sort((a, b) => b.score - a.score);
  const headline = !top.includes(HUMAN) ? t.lose : top.length === 1 ? t.win : t.tie;
  return (
    <section className={styles.result} data-testid="blokus-result" aria-label={t.finalScores}>
      <h2 className={styles.resultTitle}>{headline}</h2>
      <ol className={styles.resultList}>
        {order.map(({ score, color }) => {
          const placedAll = game.hands[color] === 0;
          return (
            <li key={color} className={`${styles.resultRow} ${styles[`color${color}`]}`}>
              <span className={styles.resultRank}>{t.rank(1 + all.filter((other) => other > score).length)}</span>
              <span className={styles.swatch} aria-hidden="true" />
              <span className={styles.resultName}>{playerName(t, mode, color)}</span>
              {placedAll && <span className={styles.resultBonus}>{score > ALL_PLACED_BONUS ? t.bonusSingle : t.bonusAll}</span>}
              <span className={styles.resultScore}>{t.points(score)}</span>
            </li>
          );
        })}
      </ol>
      <div className={styles.actions}>
        <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={onNewGame}>
          <RotateCcw className={styles.btnIcon} aria-hidden="true" />
          {t.newGame}
        </button>
        <button type="button" className={`${styles.btn} ${styles.btnSecondary}`} onClick={onMenu}>
          <SlidersHorizontal className={styles.btnIcon} aria-hidden="true" />
          {t.changeDifficulty}
        </button>
      </div>
    </section>
  );
};

const Blokus = () => {
  const _lifecycle = useFeatureLifecycle('game.blokus');
  const { language } = useGameLanguage();
  const t = useMemo(() => getBlokusStrings(language), [language]);

  const [mode, setMode] = useState<Mode>('classic');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [showSetup, setShowSetup] = useState(true);
  const [showInfo, setShowInfo] = useState(false);
  const [stats, setStats] = useState<GameStats>({ wins: 0, losses: 0, draws: 0 });
  const [game, setGame] = useState<GameState>(() => newGame('classic'));
  const [latest, setLatest] = useState<number[]>([]);
  const [held, setHeld] = useState<Held | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pointer, setPointer] = useState<'mouse' | 'touch'>('mouse');
  /** True once a piece has moved by key or button: a pointer shows where it is, and reading each step out would flood. */
  const [speakHeld, setSpeakHeld] = useState(false);
  const drag = usePieceDrag();
  const clientRef = useRef<BlokusAiClient | null>(null);
  const seedRef = useRef(1);

  const { size, colors } = game.rules;
  const humanMoves = useMemo(() => (game.over ? [] : legalMoves(game, HUMAN)), [game]);
  const legalSet = useMemo(() => new Set(humanMoves), [humanMoves]);
  const playable = useMemo(() => new Set(humanMoves.map(movePiece)), [humanMoves]);
  const myTurn = !showSetup && !game.over && game.toMove === HUMAN;
  const humanOut = !game.over && (game.out[HUMAN] === 1 || game.hands[HUMAN] === 0);

  useEffect(() => {
    const client = createBlokusAiClient();
    clientRef.current = client;
    return () => {
      client.terminate();
      clientRef.current = null;
    };
  }, []);

  const finish = useCallback((next: GameState) => {
    if (next.over) setStats((current) => statsAfter(current, next));
  }, []);

  const play = useCallback(
    (from: GameState, move: number) => {
      const next = cloneState(from);
      const color = from.toMove;
      applyMove(next, move);
      setGame(next);
      setLatest((current) => {
        const updated = current.length === from.rules.colors ? [...current] : Array.from({ length: from.rules.colors }, () => -1);
        updated[color] = move;
        return updated;
      });
      finish(next);
    },
    [finish],
  );

  const pass = useCallback(
    (from: GameState) => {
      const next = cloneState(from);
      passTurn(next);
      setGame(next);
      finish(next);
    },
    [finish],
  );

  // Whoever is to move: the AI thinks, and anyone with nothing to play goes out.
  useEffect(() => {
    if (showSetup || game.over) return;
    const color = game.toMove;
    const moves = color === HUMAN ? humanMoves : legalMoves(game);

    if (moves.length === 0) {
      const timer = setTimeout(() => pass(game), humanOut ? WATCHING_TURN_MS : PASS_NOTICE_MS);
      return () => clearTimeout(timer);
    }
    if (color === HUMAN) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const started = performance.now();
    seedRef.current += 1;
    const pace = humanOut ? WATCHING_TURN_MS : MIN_AI_TURN_MS;
    clientRef.current
      ?.requestMove({ state: game, level: difficulty, seed: seedRef.current })
      .then((move) => {
        if (cancelled) return;
        timer = setTimeout(() => play(game, move), Math.max(0, pace - (performance.now() - started)));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [game, showSetup, humanMoves, humanOut, difficulty, pass, play]);

  const resetTo = useCallback((nextMode: Mode) => {
    setGame(newGame(nextMode));
    setLatest([]);
    setHeld(null);
    setNotice(null);
    seedRef.current = Math.floor(Math.random() * 0x7fffffff);
  }, []);

  const startGame = useCallback(() => {
    resetTo(mode);
    setShowSetup(false);
  }, [mode, resetTo]);

  const backToMenu = useCallback(() => {
    resetTo(mode);
    setShowSetup(true);
  }, [mode, resetTo]);

  const ghost: Ghost | null = useMemo(() => {
    if (!held?.at) return null;
    const { row, col } = held.at;
    return {
      cells: held.orientation.cells.map(([r, c]) => [row + r, col + c] as const),
      legal: legalSet.has(encodeMove(held.orientation.index, row, col)),
    };
  }, [held, legalSet]);

  const placeHeld = useCallback(() => {
    if (!myTurn || !held?.at) return;
    const move = encodeMove(held.orientation.index, held.at.row, held.at.col);
    if (!legalSet.has(move)) {
      setNotice(t.noFit);
      return;
    }
    setNotice(null);
    setHeld(null);
    play(game, move);
  }, [myTurn, held, legalSet, t, play, game]);

  // Where a piece goes when it arrives by touch or key, with no pointer over the board to show it.
  const landing = useCallback(
    (orientation: Orientation, from: { row: number; col: number } | null) => {
      const [startRow, startCol] = game.rules.starts[HUMAN];
      const origin = from ?? { row: startRow, col: startCol };
      return nearestLegal(humanMoves, orientation, origin.row, origin.col, size * 2) ?? clampAt(orientation, size, origin.row, origin.col);
    },
    [game, humanMoves, size],
  );

  const selectPiece = useCallback(
    (piece: number) => {
      setNotice(null);
      setSpeakHeld(pointer !== 'mouse');
      setHeld((current) => {
        if (current?.piece === piece) return null;
        const orientation = ORIENTATIONS[PIECES[piece].orientations[0]];
        return { piece, orientation, at: pointer === 'mouse' ? null : landing(orientation, current?.at ?? null) };
      });
    },
    [landing, pointer],
  );

  const turnHeld = useCallback(
    (turn: (cells: Orientation['cells']) => Array<[number, number]>) => {
      setSpeakHeld(true);
      setHeld((current) => {
        if (!current) return current;
        const orientation = orientationOf(current.piece, turn(current.orientation.cells));
        if (!current.at) return { ...current, orientation };
        const row = current.at.row + Math.floor((current.orientation.height - orientation.height) / 2);
        const col = current.at.col + Math.floor((current.orientation.width - orientation.width) / 2);
        // A mouse is over the spot it wants. Without one, a turn lands on the closest spot this way up can go.
        const at = pointer === 'mouse' ? clampAt(orientation, size, row, col) : landing(orientation, { row, col });
        return { ...current, orientation, at };
      });
    },
    [landing, pointer, size],
  );

  const nudge = useCallback(
    (rows: number, cols: number) => {
      setNotice(null);
      setSpeakHeld(true);
      setHeld((current) => {
        if (!current) return current;
        const at = current.at ?? landing(current.orientation, null);
        return { ...current, at: clampAt(current.orientation, size, at.row + rows, at.col + cols) };
      });
    },
    [landing, size],
  );

  const handleCursor = useCallback(
    (row: number, col: number) => {
      setSpeakHeld(false);
      setHeld((current) => {
        if (!current) return current;
        const { orientation } = current;
        const at = clampAt(orientation, size, row - Math.floor(orientation.height / 2), col - Math.floor(orientation.width / 2));
        return current.at?.row === at.row && current.at?.col === at.col ? current : { ...current, at };
      });
    },
    [size],
  );

  // A touch is imprecise on a phone-sized board: when it lifts near a legal spot, take that spot.
  const handleTouchDone = useCallback(() => {
    setHeld((current) => {
      if (!current?.at) return current;
      const snapped = nearestLegal(humanMoves, current.orientation, current.at.row, current.at.col, SNAP_CELLS);
      return snapped ? { ...current, at: snapped } : current;
    });
  }, [humanMoves]);

  const handleLeave = useCallback(() => {
    setHeld((current) => (current?.at ? { ...current, at: null } : current));
  }, []);

  // A touch is placed with the Place button, so a stray tap never plays a piece.
  const handleBoardClick = useCallback(() => {
    if (pointer === 'mouse') placeHeld();
  }, [placeHeld, pointer]);

  const handleKey = useCallback(
    (key: string): boolean => {
      if (!held) return false;
      switch (key) {
        case 'r':
        case 'R':
          turnHeld(rotateCells);
          return true;
        case 'f':
        case 'F':
          turnHeld(flipCells);
          return true;
        case 'Escape':
          setHeld(null);
          return true;
        default:
          return false;
      }
    },
    [held, turnHeld],
  );

  const handleBoardKey = useCallback(
    (event: ReactKeyboardEvent<SVGSVGElement>) => {
      const steps: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
      const step = steps[event.key];
      if (step && held) {
        event.preventDefault();
        nudge(step[0], step[1]);
      } else if ((event.key === 'Enter' || event.key === ' ') && held) {
        event.preventDefault();
        placeHeld();
      }
    },
    [held, nudge, placeHeld],
  );

  // R, F and Esc work wherever the focus is, as the piece is held rather than on the board.
  useEffect(() => {
    if (showSetup || showInfo) return;
    const listener = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (handleKey(event.key)) event.preventDefault();
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [handleKey, showSetup, showInfo]);

  const corners = useMemo(() => {
    if (showSetup || game.over || game.hands[HUMAN] === 0 || game.out[HUMAN]) return [];
    const heldMoves = held ? humanMoves.filter((move) => movePiece(move) === held.piece) : [];
    const usable = new Set(heldMoves.flatMap((move) => moveCells(move).map(([row, col]) => row * size + col)));
    const open: Array<{ row: number; col: number; usable: boolean }> = [];
    const base = HUMAN * size;
    for (let row = 0; row < size; row++) {
      let cells = game.corners[base + row] & ~game.blocked[base + row];
      while (cells !== 0) {
        const col = 31 - Math.clz32(cells & -cells);
        cells &= cells - 1;
        open.push({ row, col, usable: usable.has(row * size + col) });
      }
    }
    return open;
  }, [game, held, humanMoves, showSetup, size]);

  const latestCells = useMemo(() => latest.filter((move) => move >= 0).map(moveCells), [latest]);

  const difficultyOptions = useMemo(
    () => DIFFICULTY_VALUES.map((value) => ({ value, label: t.difficulties[value].label, description: t.difficulties[value].description })),
    [t],
  );

  const status = (() => {
    if (game.over) return { main: t.finalScores, sub: '' };
    if (myTurn) {
      if (humanMoves.length === 0) return { main: t.youPass, sub: '' };
      return { main: t.yourTurn, sub: notice ?? (held ? '' : t.yourTurnHint) };
    }
    const name = playerName(t, game.rules.mode, game.toMove);
    return { main: humanOut ? t.youAreOut : t.thinking(name), sub: humanOut ? t.thinking(name) : '' };
  })();

  const canPlace = myTurn && ghost?.legal === true;
  const seats = Array.from({ length: colors }, (_, color) => color);
  const names = useMemo(() => Array.from({ length: colors }, (_, color) => playerName(t, game.rules.mode, color)), [colors, game.rules.mode, t]);
  const heldText =
    speakHeld && held && ghost
      ? t.heldAt(
          t.piece(PIECES[held.piece].name, PIECES[held.piece].size),
          held.orientation.width,
          held.orientation.height,
          ghost.cells.map(([row, col]) => t.cell(row + 1, col + 1)),
          ghost.legal,
        )
      : '';

  return (
    <div
      className={styles.root}
      // The tools change with the pointer and move the tray, so a mouse is noticed as it moves, never as it presses:
      // a press that moved the tray would come up on another piece.
      onPointerDownCapture={(event) => {
        if (event.pointerType !== 'mouse') setPointer('touch');
      }}
      onPointerMoveCapture={(event) => {
        if (event.pointerType === 'mouse') setPointer('mouse');
      }}
    >
      <GameTopBar stats={stats} onInfoClick={() => setShowInfo(true)} />

      {showSetup ? (
        <DifficultySelector
          title={t.title}
          subtitle={t.subtitle}
          icon={<span style={{ fontSize: '2.6rem' }}>🟦</span>}
          selectedDifficulty={difficulty}
          onSelectDifficulty={setDifficulty}
          options={difficultyOptions}
          onStart={startGame}
          difficultyTitle={t.selectDifficulty}
          startLabel={t.start}
          kickerLabel={t.gameSetup}
          setupContent={
            <fieldset className={styles.modePicker}>
              <legend className={styles.modeTitle}>{t.modeTitle}</legend>
              <div className={styles.modeOptions}>
                {MODE_VALUES.map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={styles.modeOption}
                    data-testid={`blokus-mode-${value}`}
                    aria-pressed={mode === value}
                    onClick={() => setMode(value)}
                  >
                    <span className={styles.modeLabel}>{t.modes[value].label}</span>
                    <span className={styles.modeDescription}>{t.modes[value].description}</span>
                  </button>
                ))}
              </div>
            </fieldset>
          }
        />
      ) : (
        <div className={styles.layout} data-mode={game.rules.mode}>
          <div className={styles.boardColumn}>
            <div className={styles.status} role="status" aria-live="polite" data-testid="blokus-status">
              <span className={styles.statusMain}>
                {!myTurn && !game.over && <span className={styles.spinner} aria-hidden="true" />}
                {status.main}
              </span>
              {status.sub && <span className={styles.statusSub}>{status.sub}</span>}
            </div>
            <div className={styles.boardFrame}>
              <Board
                game={game}
                latest={latestCells}
                corners={corners}
                ghost={ghost}
                color={HUMAN}
                holding={held !== null}
                label={t.boardLabel(size)}
                onCursor={handleCursor}
                onLeave={handleLeave}
                onTouchDone={handleTouchDone}
                onClick={handleBoardClick}
                onKeyDown={handleBoardKey}
                drag={drag}
              />
            </div>
            <div className={styles.visuallyHidden} role="status" aria-live="polite" data-testid="blokus-held-text">
              {heldText}
            </div>
            <BoardText game={game} corners={corners} names={names} strings={t} />
          </div>

          <div className={styles.sideColumn}>
            <ul className={styles.players}>
              {seats.map((color) => {
                const left = TOTAL_SQUARES - game.placed[color];
                const pieces = PIECES.filter((piece) => (game.hands[color] & (1 << piece.index)) !== 0).length;
                const out = game.out[color] === 1 || game.hands[color] === 0;
                return (
                  <li key={color} className={`${styles.player} ${styles[`color${color}`]}`} data-active={!game.over && game.toMove === color} data-testid={`blokus-player-${color}`}>
                    <span className={styles.swatch} aria-hidden="true" />
                    <span className={styles.playerName}>{playerName(t, game.rules.mode, color)}</span>
                    <span className={styles.playerLeft}>{out ? t.outOfMoves : t.squaresLeft(left)}</span>
                    <span className={styles.playerPieces}>{t.piecesLeft(pieces)}</span>
                  </li>
                );
              })}
            </ul>

            {game.over ? (
              <Result game={game} mode={game.rules.mode} t={t} onNewGame={startGame} onMenu={backToMenu} />
            ) : (
              <>
                <div className={styles.controls} data-touch={pointer === 'touch'}>
                  <div className={styles.turnButtons}>
                    <button type="button" className={styles.tool} aria-label={t.rotate} onClick={() => turnHeld(rotateCells)} disabled={!held} data-testid="blokus-rotate">
                      <RotateCw className={styles.btnIcon} aria-hidden="true" />
                      <span className={styles.toolLabel}>{t.rotate}</span>
                    </button>
                    <button type="button" className={styles.tool} aria-label={t.flip} onClick={() => turnHeld(flipCells)} disabled={!held} data-testid="blokus-flip">
                      <FlipHorizontal2 className={styles.btnIcon} aria-hidden="true" />
                      <span className={styles.toolLabel}>{t.flip}</span>
                    </button>
                  </div>
                  {pointer === 'touch' && (
                    <div className={styles.nudge}>
                      {(
                        [
                          ['left', ArrowLeft, 0, -1],
                          ['up', ArrowUp, -1, 0],
                          ['down', ArrowDown, 1, 0],
                          ['right', ArrowRight, 0, 1],
                        ] as const
                      ).map(([name, Icon, rows, cols]) => (
                        <button key={name} type="button" className={styles.nudgeButton} aria-label={t.moveGhost[name]} disabled={!held} onClick={() => nudge(rows, cols)}>
                          <Icon className={styles.btnIcon} aria-hidden="true" />
                        </button>
                      ))}
                    </div>
                  )}
                  {pointer === 'touch' && (
                    <button type="button" className={`${styles.btn} ${styles.btnPrimary} ${styles.placeButton}`} onClick={placeHeld} disabled={!canPlace} data-testid="blokus-place">
                      <Check className={styles.btnIcon} aria-hidden="true" />
                      {t.place}
                    </button>
                  )}
                </div>
                <Tray
                  game={game}
                  color={HUMAN}
                  playable={playable}
                  selected={held?.piece ?? null}
                  selectedCells={held?.orientation.cells ?? null}
                  strings={t}
                  onSelect={selectPiece}
                  drag={drag}
                />
                <div className={styles.actions}>
                  <button type="button" className={`${styles.btn} ${styles.btnSecondary}`} onClick={startGame}>
                    <RotateCcw className={styles.btnIcon} aria-hidden="true" />
                    {t.newGame}
                  </button>
                  <button type="button" className={`${styles.btn} ${styles.btnSecondary}`} onClick={backToMenu}>
                    <SlidersHorizontal className={styles.btnIcon} aria-hidden="true" />
                    {t.changeDifficulty}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <InfoModal isOpen={showInfo} onClose={() => setShowInfo(false)} title={t.infoTitle}>
        <div className={styles.infoGrid}>
          <div className={styles.infoCard}>
            <h3 className={styles.infoCardTitle}>🎯 {t.objectiveTitle}</h3>
            <p className={styles.infoCardBody}>{t.objectiveBody}</p>
          </div>
          <div className={styles.infoCard}>
            <h3 className={styles.infoCardTitle}>📐 {t.rulesTitle}</h3>
            <ul className={styles.tipList}>{t.rules.map((rule) => <li key={rule}>{rule}</li>)}</ul>
          </div>
          <div className={styles.infoCard}>
            <h3 className={styles.infoCardTitle}>🖱️ {t.controlsTitle}</h3>
            <ul className={styles.tipList}>{t.controls.map((control) => <li key={control}>{control}</li>)}</ul>
          </div>
          <div className={styles.infoCard}>
            <h3 className={styles.infoCardTitle}>🧮 {t.scoreTitle}</h3>
            <p className={styles.infoCardBody}>{t.scoreBody}</p>
          </div>
          <div className={styles.infoCard}>
            <h3 className={styles.infoCardTitle}>💡 {t.tipsTitle}</h3>
            <ul className={styles.tipList}>{t.tips.map((tip) => <li key={tip}>{tip}</li>)}</ul>
          </div>
        </div>
      </InfoModal>
    </div>
  );
};

export default Blokus;
