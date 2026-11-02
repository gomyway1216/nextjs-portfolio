/**
 * The Blokus board: one SVG in board units (a cell is 1×1).
 *
 * The placed squares are memoised apart from the ghost, because the ghost moves
 * with the pointer and the board has up to 400 cells. Pointer positions are read
 * off the SVG's box rather than from an element per cell.
 */

'use client';

import type { CSSProperties, KeyboardEvent, PointerEvent } from 'react';
import { memo, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { GameState, Rules } from './engine';
import type { BlokusStrings } from './i18n';
import { crossPath, outlinePath, platePath, startWellPath, wellLipsPath, wellsPath } from './pieceArt';
import { Plastic, PlasticDefs } from './Plastic';
import type { PieceDrag } from './usePieceDrag';
import styles from './Blokus.module.css';

export interface Ghost {
  cells: ReadonlyArray<readonly [number, number]>;
  legal: boolean;
}

interface BoardProps {
  game: GameState;
  /** The cells of each colour's latest piece. */
  latest: ReadonlyArray<ReadonlyArray<readonly [number, number]>>;
  /** Open corners for the human, split by whether the picked piece can use them. */
  corners: ReadonlyArray<{ row: number; col: number; usable: boolean }>;
  ghost: Ghost | null;
  /** The ghost's colour. */
  color: number;
  /** True while a piece is in hand, when a drag on the board moves it instead of scrolling the page. */
  holding: boolean;
  label: string;
  onCursor: (row: number, col: number) => void;
  onLeave: () => void;
  onTouchDone: () => void;
  /** The cell under the click, which a quick click can reach before the last move has rendered. */
  onClick: (cell: readonly [number, number] | null) => void;
  onKeyDown: (event: KeyboardEvent<SVGSVGElement>) => void;
  drag?: PieceDrag;
}

/** A finger on the board that travels this far is moving the piece. Less is a tap on a cell. */
const AIM_START_PX = 8;
/** Cells smaller than this go under a fingertip, so a drag brings up the loupe. */
const LOUPE_BELOW_CELL_PX = 30;
/** The loupe shows the ghost and this many cells around it. */
const LOUPE_MARGIN_CELLS = 1;
const LOUPE_MIN_CELLS = 5;
/** How long the board has to itself at the end before the page moves to the scores. */
const RESULT_SCROLL_MS = 1100;

const cellKey = (row: number, col: number) => `${row}-${col}`;

/** The moulded board: raised ridges with a recessed well for each cell. It never changes, so it is drawn once. */
const Wells = memo(function Wells({ size, starts, prefix }: { size: number; starts: Rules['starts']; prefix: string }) {
  const wells = useMemo(() => wellsPath(size), [size]);
  const lips = useMemo(() => wellLipsPath(size), [size]);
  return (
    <g>
      <rect className={styles.boardBase} width={size} height={size} />
      <path d={wells} fill={`url(#${prefix}-well)`} />
      <path className={styles.wellLip} d={lips} />
      {starts.map(([row, col], index) => (
        <g key={index} className={styles[`color${index}`]}>
          <path className={styles.startWell} d={startWellPath(row, col)} />
          <circle className={styles.startMark} cx={col + 0.5} cy={row + 0.5} r={0.26} />
        </g>
      ))}
    </g>
  );
});

const Placed = memo(function Placed({ board, rules, skip, prefix }: { board: Int8Array; rules: Rules; skip: ReadonlySet<string>; prefix: string }) {
  const { size, colors } = rules;
  const byColor: Array<Array<[number, number]>> = Array.from({ length: colors }, () => []);
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const color = board[row * size + col];
      if (color >= 0 && !skip.has(cellKey(row, col))) byColor[color].push([row, col]);
    }
  }
  return (
    <g>
      {/* The shadows go down first, so one piece's never falls across another's top. */}
      <path className={styles.pieceShadow} d={byColor.map(platePath).join('')} />
      {byColor.map((cells, color) => (cells.length > 0 ? <Plastic key={color} prefix={prefix} cells={cells} color={color} /> : null))}
    </g>
  );
});

interface LatestProps {
  board: Int8Array;
  latest: BoardProps['latest'];
  rules: Rules;
  toMove: number;
  prefix: string;
}

/** The latest piece of each colour, drawn apart from the rest so it can drop in and stay ringed. */
const Latest = memo(function Latest({ board, latest, rules, toMove, prefix }: LatestProps) {
  const { size, colors } = rules;
  return (
    <g>
      {latest.map((cells) => {
        const [row, col] = cells[0];
        const color = board[row * size + col];
        const outline = outlinePath(cells);
        return (
          <g key={`${color}:${cells.join(';')}`} data-age={(toMove - color - 1 + colors) % colors} className={styles.latestPiece}>
            <g className={styles.drop}>
              <path className={styles.pieceShadow} d={platePath(cells)} />
              <Plastic prefix={prefix} cells={cells} color={color} />
            </g>
            <path className={styles.latestHalo} d={outline} />
            <path className={styles.latestLine} d={outline} />
          </g>
        );
      })}
    </g>
  );
});

/** The piece in hand over the board. A shadow lifts it off the wells, and the outline says whether it fits. */
const GhostArt = ({ ghost, color, prefix, lifted }: { ghost: Ghost; color: number; prefix: string; lifted: boolean }) => {
  const outline = outlinePath(ghost.cells);
  return (
    <g className={ghost.legal ? styles.ghostLegal : styles.ghostIllegal} data-lifted={lifted}>
      <path className={styles.ghostShadow} d={platePath(ghost.cells)} />
      <g className={styles.ghostBody}>
        <Plastic prefix={prefix} cells={ghost.cells} color={color} />
        {!ghost.legal && <path className={styles.ghostCross} d={crossPath(ghost.cells)} />}
        <path className={styles.ghostHalo} d={outline} />
        <path className={styles.ghostLine} d={outline} />
      </g>
    </g>
  );
};

interface LoupeProps {
  layers: string;
  ghost: Ghost;
  color: number;
  prefix: string;
  size: number;
}

/**
 * A magnifier for the moment a finger hides what it is doing. It sits in the top
 * corner away from the ghost, and shows the same drawing by reference, so it adds a
 * <use> rather than a second board.
 */
const Loupe = ({ layers, ghost, color, prefix, size }: LoupeProps) => {
  const rows = ghost.cells.map(([row]) => row);
  const cols = ghost.cells.map(([, col]) => col);
  const [top, bottom] = [Math.min(...rows), Math.max(...rows) + 1];
  const [left, right] = [Math.min(...cols), Math.max(...cols) + 1];
  const span = Math.min(size, Math.max(LOUPE_MIN_CELLS, Math.max(bottom - top, right - left) + 2 * LOUPE_MARGIN_CELLS));
  const clampView = (start: number) => Math.max(0, Math.min(size - span, start));
  const viewX = clampView((left + right - span) / 2);
  const viewY = clampView((top + bottom - span) / 2);

  // The middle of the board could go either way, so the loupe stays put until the ghost really nears it.
  const [side, setSide] = useState<'left' | 'right'>('right');
  const middle = (left + right) / 2 / size;
  if (side === 'right' && middle > 0.6) setSide('left');
  else if (side === 'left' && middle < 0.4) setSide('right');

  return (
    <div className={styles.loupe} data-side={side} data-testid="blokus-loupe" aria-hidden="true">
      <svg viewBox={`${viewX} ${viewY} ${span} ${span}`}>
        <use href={`#${layers}`} />
        <GhostArt ghost={ghost} color={color} prefix={prefix} lifted={false} />
      </svg>
    </div>
  );
};

/** The piece on its way from the tray to the board. */
const FloatingPiece = ({ drag, prefix }: { drag: PieceDrag; prefix: string }) => {
  const { active, attachFloat } = drag;
  if (!active) return null;
  const rows = Math.max(...active.cells.map(([row]) => row)) + 1;
  const cols = Math.max(...active.cells.map(([, col]) => col)) + 1;
  const shape = { '--float-cols': cols, '--float-rows': rows } as CSSProperties;
  return (
    <div ref={attachFloat} className={styles.float} style={shape} data-over={active.over} data-testid="blokus-float" aria-hidden="true">
      <svg viewBox={`0 0 ${cols} ${rows}`}>
        <Plastic prefix={prefix} cells={active.cells} color={active.color} />
      </svg>
    </div>
  );
};

interface BoardTextProps {
  game: GameState;
  /** The colour being played, whose start square and corners are read out. */
  color: number;
  corners: BoardProps['corners'];
  /** Display name of each colour. */
  names: readonly string[];
  strings: BlokusStrings;
}

/** The board in words for a screen reader, since the SVG is geometry with no cells to label. */
export const BoardText = memo(function BoardText({ game, color, corners, names, strings }: BoardTextProps) {
  const { size, starts } = game.rules;
  const rows = [];
  for (let row = 0; row < size; row++) {
    const entries = names.map((name, color) => {
      const cols = [];
      for (let col = 0; col < size; col++) {
        if (game.board[row * size + col] === color) cols.push(col + 1);
      }
      return { name, cols };
    });
    const filled = entries.filter(({ cols }) => cols.length > 0);
    if (filled.length > 0) rows.push(<li key={row}>{strings.boardRow(row + 1, filled)}</li>);
  }
  const [startRow, startCol] = starts[color];
  return (
    <div className={styles.visuallyHidden} data-testid="blokus-board-text">
      <h2>{strings.boardTextTitle}</h2>
      {game.placed[color] === 0 && <p>{strings.startSquare(strings.cell(startRow + 1, startCol + 1))}</p>}
      {corners.length > 0 && <p>{strings.openCorners(corners.map(({ row, col }) => strings.cell(row + 1, col + 1)))}</p>}
      {rows.length > 0 ? <ul>{rows}</ul> : <p>{strings.boardEmpty}</p>}
    </div>
  );
});

export const Board = ({ game, latest, corners, ghost, color, holding, label, onCursor, onLeave, onTouchDone, onClick, onKeyDown, drag }: BoardProps) => {
  const { size, starts, colors } = game.rules;
  const prefix = useId();
  const layers = `${prefix}-layers`;
  const palette = useMemo(() => Array.from({ length: colors }, (_, index) => index), [colors]);
  const svgRef = useRef<SVGSVGElement>(null);
  const aim = useRef<{ pointer: number; x: number; y: number; row: number; col: number; moved: boolean; lastRow: number; lastCol: number } | null>(null);
  const [aiming, setAiming] = useState(false);
  const [smallCells, setSmallCells] = useState(false);
  const skip = useMemo(() => new Set(latest.flatMap((cells) => cells.map(([row, col]) => cellKey(row, col)))), [latest]);

  // The drag's way onto the board. A layout effect, so a drag never holds last render's handlers.
  const connect = drag?.connect;
  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!connect || !svg) return;
    return connect({ svg, size, onCursor, onLeave, onTouchDone });
  }, [connect, size, onCursor, onLeave, onTouchDone]);

  const dragging = drag?.active != null;
  const over = drag?.active?.over === true;
  useLayoutEffect(() => {
    if (!dragging && !aiming) return;
    const box = svgRef.current?.getBoundingClientRect();
    if (box) setSmallCells(box.width / size < LOUPE_BELOW_CELL_PX);
  }, [dragging, aiming, size]);

  // On a phone the scores are below the board: give the finish its moment, then go to them.
  useEffect(() => {
    if (!game.over) return;
    const timer = setTimeout(() => {
      const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      document.querySelector('[data-testid="blokus-result"]')?.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'nearest' });
    }, RESULT_SCROLL_MS);
    return () => clearTimeout(timer);
  }, [game.over]);

  const cellOf = (event: { clientX: number; clientY: number }): [number, number] | null => {
    const box = svgRef.current?.getBoundingClientRect();
    if (!box || box.width === 0 || box.height === 0) return null;
    const col = Math.floor(((event.clientX - box.left) / box.width) * size);
    const row = Math.floor(((event.clientY - box.top) / box.height) * size);
    return [Math.max(0, Math.min(size - 1, row)), Math.max(0, Math.min(size - 1, col))];
  };

  // A finger moves the piece from where it is, by as much as the finger moves, wherever on the board it came
  // down. So the piece is never under the finger, and a one-cell correction is a one-cell slide.
  const handleDown = (event: PointerEvent<SVGSVGElement>) => {
    if (event.pointerType === 'mouse' || !holding) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    let from = cellOf(event);
    if (ghost) {
      const rows = ghost.cells.map(([row]) => row);
      const cols = ghost.cells.map(([, col]) => col);
      const [top, left] = [Math.min(...rows), Math.min(...cols)];
      from = [top + Math.floor((Math.max(...rows) - top + 1) / 2), left + Math.floor((Math.max(...cols) - left + 1) / 2)];
    }
    if (!from) return;
    aim.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY, row: from[0], col: from[1], moved: false, lastRow: from[0], lastCol: from[1] };
  };

  const handleMove = (event: PointerEvent<SVGSVGElement>) => {
    if (event.pointerType === 'mouse') {
      const cell = cellOf(event);
      if (cell) onCursor(cell[0], cell[1]);
      return;
    }
    const held = aim.current;
    const box = svgRef.current?.getBoundingClientRect();
    if (!held || held.pointer !== event.pointerId || !box) return;
    const dx = event.clientX - held.x;
    const dy = event.clientY - held.y;
    if (!held.moved) {
      if (Math.hypot(dx, dy) < AIM_START_PX) return;
      held.moved = true;
      setAiming(true);
    }
    const unit = box.width / size;
    const row = Math.max(0, Math.min(size - 1, held.row + Math.round(dy / unit)));
    const col = Math.max(0, Math.min(size - 1, held.col + Math.round(dx / unit)));
    if (row === held.lastRow && col === held.lastCol) return;
    held.lastRow = row;
    held.lastCol = col;
    onCursor(row, col);
    onTouchDone();
  };

  const handleUp = (event: PointerEvent<SVGSVGElement>) => {
    const held = aim.current;
    if (event.pointerType === 'mouse' || !held || held.pointer !== event.pointerId) return;
    aim.current = null;
    setAiming(false);
    // A tap goes to the cell it touched. It only moves the piece: Place plays it.
    if (!held.moved && event.type === 'pointerup') {
      const cell = cellOf(event);
      if (cell) onCursor(cell[0], cell[1]);
    }
    onTouchDone();
  };

  return (
    <>
      <svg
        ref={svgRef}
        className={styles.board}
        data-testid="blokus-board"
        data-holding={holding}
        viewBox={`0 0 ${size} ${size}`}
        role="application"
        aria-label={label}
        tabIndex={0}
        style={{ touchAction: holding ? 'none' : 'auto' }}
        onPointerDown={handleDown}
        onPointerMove={handleMove}
        onPointerUp={handleUp}
        onPointerCancel={handleUp}
        onPointerLeave={(event) => {
          if (event.pointerType === 'mouse') onLeave();
        }}
        // A click from the keyboard or a screen reader has no pointer position: it means wherever the piece already is.
        onClick={(event) => onClick(event.detail === 0 ? null : cellOf(event))}
        onKeyDown={onKeyDown}
      >
        <PlasticDefs prefix={prefix} colors={palette} />
        <defs>
          <linearGradient id={`${prefix}-well`} gradientUnits="userSpaceOnUse" x1={0} y1={0} x2={0} y2={1} spreadMethod="repeat">
            <stop className={styles.wellTop} offset={0.1} />
            <stop className={styles.wellBottom} offset={0.55} />
          </linearGradient>
        </defs>
        <g id={layers}>
          <Wells size={size} starts={starts} prefix={prefix} />
          <Placed board={game.board} rules={game.rules} skip={skip} prefix={prefix} />
          <Latest board={game.board} latest={latest} rules={game.rules} toMove={game.toMove} prefix={prefix} />
          <g className={styles[`color${color}`]}>
            {corners.map(({ row, col, usable }) => (
              <circle key={cellKey(row, col)} className={usable ? styles.cornerUsable : styles.corner} cx={col + 0.5} cy={row + 0.5} r={usable ? 0.2 : 0.11} />
            ))}
          </g>
        </g>
        {ghost && (
          <g className={styles[`color${color}`]} data-testid="blokus-ghost" data-legal={ghost.legal}>
            <GhostArt ghost={ghost} color={color} prefix={prefix} lifted={aiming || over} />
          </g>
        )}
        {/* The board's own SVG lets a lifted piece over the rim. A nested one keeps the light on the board. */}
        {game.over && (
          <svg width={size} height={size}>
            <path className={styles.finishSweep} d={`M0 ${size}L${size * 0.45} 0H${size * 0.75}L${size * 0.3} ${size}z`} />
          </svg>
        )}
      </svg>
      {ghost && smallCells && (aiming || over) && <Loupe layers={layers} ghost={ghost} color={color} prefix={prefix} size={size} />}
      {drag && <FloatingPiece drag={drag} prefix={prefix} />}
    </>
  );
};
