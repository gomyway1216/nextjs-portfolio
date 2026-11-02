/**
 * The geometry of a plastic piece, as SVG path strings in board units (a cell is 1×1).
 *
 * A real piece is one moulding: a thin plate that runs from cell to cell, with a
 * raised square on each cell. Everything here is one path per layer, however many
 * cells there are, so a full 400-cell board is a few dozen elements rather than
 * thousands, and no cell needs a filter of its own.
 *
 * Plain strings and no CSS, so the cover script can draw from the same shapes.
 */

export type Cells = ReadonlyArray<readonly [number, number]>;

/** How far each layer stands in from the cell's edge. */
const PLATE_INSET = 0.04;
const PLATE_RADIUS = 0.13;
const FACE_INSET = 0.15;
const FACE_RADIUS = 0.08;
const WELL_INSET = 0.06;
const WELL_RADIUS = 0.07;

const num = (value: number) => +value.toFixed(3);

const roundedBox = (left: number, top: number, right: number, bottom: number, radius: number) => {
  const [l, t, r, b, c] = [left, top, right, bottom, radius].map(num);
  const across = num(r - l - 2 * c);
  const down = num(b - t - 2 * c);
  return `M${num(l + c)} ${t}h${across}a${c} ${c} 0 0 1 ${c} ${c}v${down}a${c} ${c} 0 0 1 -${c} ${c}h-${across}a${c} ${c} 0 0 1 -${c} -${c}v-${down}a${c} ${c} 0 0 1 ${c} -${c}z`;
};

const box = (left: number, top: number, right: number, bottom: number) =>
  `M${num(left)} ${num(top)}H${num(right)}V${num(bottom)}H${num(left)}z`;

const cellKey = (row: number, col: number) => row * 100 + col;

/** The plate: rounded squares, joined wherever two cells of a piece share an edge. */
export const platePath = (cells: Cells): string => {
  const set = new Set(cells.map(([row, col]) => cellKey(row, col)));
  const inner = 1 - PLATE_INSET;
  return cells
    .map(([row, col]) => {
      const right = set.has(cellKey(row, col + 1));
      const down = set.has(cellKey(row + 1, col));
      let path = roundedBox(col + PLATE_INSET, row + PLATE_INSET, col + inner, row + inner, PLATE_RADIUS);
      if (right) path += box(col + inner - PLATE_RADIUS, row + PLATE_INSET, col + 1 + PLATE_INSET + PLATE_RADIUS, row + inner);
      if (down) path += box(col + PLATE_INSET, row + inner - PLATE_RADIUS, col + inner, row + 1 + PLATE_INSET + PLATE_RADIUS);
      if (right && down && set.has(cellKey(row + 1, col + 1))) path += box(col + inner - PLATE_RADIUS, row + inner - PLATE_RADIUS, col + 1 + PLATE_INSET + PLATE_RADIUS, row + 1 + PLATE_INSET + PLATE_RADIUS);
      return path;
    })
    .join('');
};

/** The raised square on each cell. */
export const facePath = (cells: Cells): string =>
  cells.map(([row, col]) => roundedBox(col + FACE_INSET, row + FACE_INSET, col + 1 - FACE_INSET, row + 1 - FACE_INSET, FACE_RADIUS)).join('');

/** The top and left bevels of each raised square, which catch the light. */
export const litPath = (cells: Cells): string =>
  cells
    .map(([row, col]) => {
      const left = num(col + FACE_INSET);
      const top = num(row + FACE_INSET);
      const far = 1 - 2 * FACE_INSET - FACE_RADIUS;
      return `M${left} ${num(top + far)}V${num(top + FACE_RADIUS)}Q${left} ${top} ${num(left + FACE_RADIUS)} ${top}H${num(left + far)}`;
    })
    .join('');

/** The bottom and right bevels, in shade. */
export const shadePath = (cells: Cells): string =>
  cells
    .map(([row, col]) => {
      const right = num(col + 1 - FACE_INSET);
      const bottom = num(row + 1 - FACE_INSET);
      const far = 1 - 2 * FACE_INSET - FACE_RADIUS;
      return `M${right} ${num(bottom - far)}V${num(bottom - FACE_RADIUS)}Q${right} ${bottom} ${num(right - FACE_RADIUS)} ${bottom}H${num(right - far)}`;
    })
    .join('');

/** A shape per colour, so colours can be told apart without their hue. */
export const markPath = (cells: Cells, color: number): string =>
  cells
    .map(([row, col]) => {
      const x = col + 0.5;
      const y = row + 0.5;
      if (color === 0) return `M${num(x - 0.15)} ${num(y)}a0.15 0.15 0 1 0 0.3 0a0.15 0.15 0 1 0 -0.3 0z`;
      if (color === 1) return `M${num(x)} ${num(y - 0.19)}L${num(x + 0.19)} ${num(y)}L${num(x)} ${num(y + 0.19)}L${num(x - 0.19)} ${num(y)}z`;
      if (color === 2) return box(x - 0.13, y - 0.13, x + 0.13, y + 0.13);
      return `M${num(x)} ${num(y - 0.17)}L${num(x + 0.18)} ${num(y + 0.14)}H${num(x - 0.18)}z`;
    })
    .join('');

/** The outside edge of a piece: every side of a cell with no neighbour across it. */
export const outlinePath = (cells: Cells): string => {
  const set = new Set(cells.map(([row, col]) => cellKey(row, col)));
  return cells
    .map(([row, col]) => {
      let path = '';
      if (!set.has(cellKey(row - 1, col))) path += `M${col} ${row}h1`;
      if (!set.has(cellKey(row, col + 1))) path += `M${col + 1} ${row}v1`;
      if (!set.has(cellKey(row + 1, col))) path += `M${col} ${row + 1}h1`;
      if (!set.has(cellKey(row, col - 1))) path += `M${col} ${row}v1`;
      return path;
    })
    .join('');
};

/** A cross on each cell, so a spot that doesn't fit reads without its colour. */
export const crossPath = (cells: Cells): string =>
  cells
    .map(([row, col]) => {
      const x = col + 0.5;
      const y = row + 0.5;
      return `M${x - 0.2} ${y - 0.2}l0.4 0.4M${x + 0.2} ${y - 0.2}l-0.4 0.4`;
    })
    .join('');

/** Every well of a board. */
export const wellsPath = (size: number): string => {
  const wells: string[] = [];
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      wells.push(roundedBox(col + WELL_INSET, row + WELL_INSET, col + 1 - WELL_INSET, row + 1 - WELL_INSET, WELL_RADIUS));
    }
  }
  return wells.join('');
};

/** The lower lip of every well, where the far wall of the recess faces the light. */
export const wellLipsPath = (size: number): string => {
  const lips: string[] = [];
  const far = 1 - WELL_INSET;
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      lips.push(`M${num(col + WELL_INSET + WELL_RADIUS)} ${num(row + far)}H${num(col + far - WELL_RADIUS)}`);
      lips.push(`M${num(col + far)} ${num(row + WELL_INSET + WELL_RADIUS)}V${num(row + far - WELL_RADIUS)}`);
    }
  }
  return lips.join('');
};

/** The cell a tinted start well sits on, drawn a little larger than a plain well. */
export const startWellPath = (row: number, col: number): string =>
  roundedBox(col + WELL_INSET / 2, row + WELL_INSET / 2, col + 1 - WELL_INSET / 2, row + 1 - WELL_INSET / 2, WELL_RADIUS);
