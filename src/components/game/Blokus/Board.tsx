/**
 * The Blokus board: one SVG in board units (a cell is 1×1).
 *
 * The placed squares are memoised apart from the ghost, because the ghost moves
 * with the pointer and the board has up to 400 cells. Pointer positions are read
 * off the SVG's box rather than from an element per cell.
 */

'use client';

import type { KeyboardEvent, PointerEvent } from 'react';
import { memo, useRef } from 'react';
import type { GameState, Rules } from './engine';
import type { BlokusStrings } from './i18n';
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
  onClick: () => void;
  onKeyDown: (event: KeyboardEvent<SVGSVGElement>) => void;
}

const Marks = ({ size }: { size: number }) => {
  const marks = [];
  for (let line = 0; line <= size; line++) {
    marks.push(`M0 ${line}H${size}M${line} 0V${size}`);
  }
  return <path className={styles.gridLines} d={marks.join('')} />;
};

const Mark = ({ color, row, col }: { color: number; row: number; col: number }) => {
  const x = col + 0.5;
  const y = row + 0.5;
  // A shape per colour, so colours can be told apart without their hue.
  if (color === 0) return <circle className={styles.mark} cx={x} cy={y} r={0.17} />;
  if (color === 1) return <path className={styles.mark} d={`M${x} ${y - 0.22}L${x + 0.22} ${y}L${x} ${y + 0.22}L${x - 0.22} ${y}Z`} />;
  if (color === 2) return <rect className={styles.mark} x={x - 0.16} y={y - 0.16} width={0.32} height={0.32} />;
  return <path className={styles.mark} d={`M${x} ${y - 0.2}L${x + 0.21} ${y + 0.16}H${x - 0.21}Z`} />;
};

const Square = ({ color, row, col }: { color: number; row: number; col: number }) => (
  <g className={styles[`color${color}`]}>
    <rect className={styles.square} x={col + 0.04} y={row + 0.04} width={0.92} height={0.92} rx={0.12} />
    <Mark color={color} row={row} col={col} />
  </g>
);

const Placed = memo(function Placed({ board, rules }: { board: Int8Array; rules: Rules }) {
  const { size } = rules;
  const squares = [];
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const color = board[row * size + col];
      if (color >= 0) squares.push(<Square key={`${row}-${col}`} color={color} row={row} col={col} />);
    }
  }
  return <g>{squares}</g>;
});

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

export const Board = ({ game, latest, corners, ghost, color, holding, label, onCursor, onLeave, onTouchDone, onClick, onKeyDown }: BoardProps) => {
  const { size, starts } = game.rules;
  const svgRef = useRef<SVGSVGElement>(null);
  const touching = useRef(false);

  const cellOf = (event: PointerEvent<SVGSVGElement>): [number, number] | null => {
    const box = svgRef.current?.getBoundingClientRect();
    if (!box || box.width === 0 || box.height === 0) return null;
    const col = Math.floor(((event.clientX - box.left) / box.width) * size);
    const row = Math.floor(((event.clientY - box.top) / box.height) * size);
    return [Math.max(0, Math.min(size - 1, row)), Math.max(0, Math.min(size - 1, col))];
  };

  const handleDown = (event: PointerEvent<SVGSVGElement>) => {
    if (event.pointerType === 'mouse' || !holding) return;
    touching.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    const cell = cellOf(event);
    if (cell) onCursor(cell[0], cell[1]);
  };

  const handleMove = (event: PointerEvent<SVGSVGElement>) => {
    const cell = cellOf(event);
    if (!cell) return;
    if (event.pointerType === 'mouse' || touching.current) onCursor(cell[0], cell[1]);
  };

  const handleUp = (event: PointerEvent<SVGSVGElement>) => {
    if (event.pointerType === 'mouse' || !touching.current) return;
    touching.current = false;
    onTouchDone();
  };

  return (
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
      onClick={onClick}
      onKeyDown={onKeyDown}
    >
      <rect className={styles.boardBase} width={size} height={size} />
      <Marks size={size} />
      {starts.map(([row, col], index) =>
        game.placed[index] === 0 ? (
          <g key={index} className={styles[`color${index}`]}>
            <circle className={styles.startMark} cx={col + 0.5} cy={row + 0.5} r={0.32} />
          </g>
        ) : null,
      )}
      <Placed board={game.board} rules={game.rules} />
      {latest.map((cells, index) => (
        <g key={index} className={styles.latest}>
          {cells.map(([row, col]) => (
            <rect key={`${row}-${col}`} x={col + 0.12} y={row + 0.12} width={0.76} height={0.76} rx={0.08} />
          ))}
        </g>
      ))}
      <g className={styles[`color${color}`]}>
        {corners.map(({ row, col, usable }) => (
          <circle key={`${row}-${col}`} className={usable ? styles.cornerUsable : styles.corner} cx={col + 0.5} cy={row + 0.5} r={usable ? 0.2 : 0.11} />
        ))}
      </g>
      {ghost && (
        <g className={`${styles[`color${color}`]} ${ghost.legal ? styles.ghostLegal : styles.ghostIllegal}`} data-testid="blokus-ghost" data-legal={ghost.legal}>
          {ghost.cells.map(([row, col]) => (
            <rect key={`${row}-${col}`} className={styles.ghostSquare} x={col + 0.06} y={row + 0.06} width={0.88} height={0.88} rx={0.12} />
          ))}
        </g>
      )}
    </svg>
  );
};
