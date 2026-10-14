/**
 * The packer as it was when format 2 was the newest: `pack.ts` word for word
 * as it stood on main at 08f27a03, the day before format 3, with nothing
 * changed but this heading, the names of its two functions, and the number of
 * its format, which it no longer exports. Copies it wrote are on players'
 * accounts and have to be read for good, so it is kept here to write such
 * copies in the tests, and to say what its own reader makes of a copy. It is
 * not used by the game. Do not bring it up to date: what it is for is to stay
 * as it was.
 */

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/** The way `pack` writes now. */
const PACK_FORMAT = 2;
/** The way it wrote before columns could be a few values or whole numbers in bits. Still read, never written. */
const FIRST_FORMAT = 1;

/** The field that marks a packed table, or an object that had a field of that name itself. */
const MARK = '$';
/** A list has to be at least this long to be worth writing as a table. */
const WORTH = 2;
/** The most sets of fields a list may have and still be written as tables, one for each set. */
const MOST_SHAPES = 8;
/** How a column written as a string begins: the bytes of numbers, or one character for each yes or no. */
const BYTES = 'f';
const BITS = 'b';
/** The most cells a column written in bits may have. Far more than a list in a save has; it is here so that a copy cannot claim any number it likes. */
const MOST_CELLS = 1 << 16;
/**
 * The most characters that columns written in bits may unfold to in one save.
 *
 * Written the earlier ways, every cell of a save is there in the packed text,
 * so a packed save cannot unfold to much more than it is. A column that says
 * "this value, in every one of six hundred cells" is not held so, and a
 * damaged copy could say six hundred million. What such columns unfold to is
 * therefore counted, and past this much the copy is not one `pack` wrote:
 * `pack` counts the same, and writes a column another way before it would
 * pass it. A machine filled to its bounds unfolds to a quarter of a million
 * characters in all, and no save longer than a million is read.
 *
 * This one is in characters as a string's `length` counts them, and not in
 * bytes: it bounds the text that is built in memory here, which is what
 * `restore` measures the same way before it reads a save (`LIMITS.length`),
 * and has nothing to do with what is sent.
 */
const MOST_UNFOLDED = 4_000_000;

const isObject = (value: Json | undefined): value is { [key: string]: Json } => typeof value === 'object' && value !== null && !Array.isArray(value);

/** Sets a field as the object's own whatever its name is, as JSON.parse would: `__proto__` is a field like any other in a save. */
const put = (object: { [key: string]: Json }, field: string, value: Json): void => {
  Object.defineProperty(object, field, { value, enumerable: true, writable: true, configurable: true });
};

/** Thrown inside `unpacked` for anything `packed` could not have written. */
const NOT_PACKED = new Error('not a packed save');

// ── Bytes and bits ──────────────────────────────────────────────────────────

/** Bytes as base64. */
function base64(bytes: Uint8Array): string {
  let binary = '';
  // A few thousand bytes at a time: one call for them all would pass too many arguments.
  for (let start = 0; start < bytes.length; start += 0x2000) binary += String.fromCharCode(...bytes.subarray(start, start + 0x2000));
  return btoa(binary);
}

/** The bytes of a list of numbers, eight to a number with the low byte first, as base64. */
function bytesOf(numbers: readonly number[]): string {
  const view = new DataView(new ArrayBuffer(numbers.length * 8));
  numbers.forEach((value, index) => view.setFloat64(index * 8, value, true));
  return base64(new Uint8Array(view.buffer));
}

/** The numbers such a string holds, or null if it holds none: not base64, or not a whole number of eights. */
function numbersOf(text: string): number[] | null {
  let binary: string;
  try {
    binary = atob(text);
  } catch {
    return null;
  }
  if (binary.length % 8 !== 0) return null;
  const view = new DataView(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index++) view.setUint8(index, binary.charCodeAt(index));
  const numbers: number[] = [];
  for (let offset = 0; offset < binary.length; offset += 8) {
    const value = view.getFloat64(offset, true);
    // JSON has no way to write these, so no save has them.
    if (!Number.isFinite(value)) return null;
    numbers.push(value);
  }
  return numbers;
}

/** How many bits it takes to write any whole number from 0 to `most`. None for 0 alone. */
function bitsFor(most: number): number {
  let width = 0;
  while (2 ** width <= most) width += 1;
  return width;
}

/** Whole numbers from 0 up, each written in `width` bits with the high bit first, one after another; the bytes as base64. */
function bitsOf(values: readonly number[], width: number): string {
  const bytes = new Uint8Array(Math.ceil((values.length * width) / 8));
  let at = 0;
  for (const value of values) {
    for (let bit = width - 1; bit >= 0; bit--, at++) if ((value >>> bit) & 1) bytes[at >> 3] |= 0x80 >> (at & 7);
  }
  return base64(bytes);
}

/**
 * The `count` numbers such a string holds, or null if it is not one that
 * `bitsOf` wrote for that many numbers of that width: not base64 as `btoa`
 * writes it, too long or too short, or with something in the bits left over.
 */
function valuesOf(text: string, width: number, count: number): number[] | null {
  let binary: string;
  try {
    binary = atob(text);
    if (btoa(binary) !== text) return null;
  } catch {
    return null;
  }
  if (binary.length !== Math.ceil((count * width) / 8)) return null;
  const bitAt = (at: number): number => (binary.charCodeAt(at >> 3) >> (7 - (at & 7))) & 1;
  const values: number[] = [];
  let at = 0;
  for (let index = 0; index < count; index++) {
    let value = 0;
    for (let bit = 0; bit < width; bit++, at++) value = value * 2 + bitAt(at);
    values.push(value);
  }
  for (; at < binary.length * 8; at++) if (bitAt(at)) return null;
  return values;
}

// ── Packing ─────────────────────────────────────────────────────────────────

/** How many characters (as `length` counts them) the columns written in bits unfold to so far, in the save being packed or unpacked. Both are done in one go, so one count serves. */
let unfolded = 0;

/**
 * The sets of fields a list's objects have, each in its order, and which of
 * them each row has. Null if the list is not worth writing by column: it is
 * too short, something in it is not an object or has no fields, or it has too
 * many sets for its length, so that the tables would hold a row or two each.
 */
function shapesOf(list: Json[]): { shapes: string[][]; of: number[] } | null {
  if (list.length < WORTH) return null;
  const shapes: string[][] = [];
  const known = new Map<string, number>();
  const of: number[] = [];
  for (const row of list) {
    if (!isObject(row)) return null;
    const fields = Object.keys(row);
    if (fields.length === 0) return null;
    const name = JSON.stringify(fields);
    let shape = known.get(name);
    if (shape === undefined) {
      shape = shapes.length;
      if (shape === MOST_SHAPES) return null;
      known.set(name, shape);
      shapes.push(fields);
    }
    of.push(shape);
  }
  return shapes.length * 2 <= list.length || shapes.length === 1 ? { shapes, of } : null;
}

/**
 * The ways of writing a column that came with format 2, for these cells: none,
 * one or both. `written` is what JSON writes each cell as: two cells are the
 * same value when, and only when, that is the same.
 */
function inBits(cells: Json[], written: string[]): Json[] {
  const ways: Json[] = [];
  if (cells.length < WORTH || cells.length > MOST_CELLS) return ways;

  // A few values, and which of them each cell is.
  const places = new Map<string, number>();
  const values: Json[] = [];
  const which = written.map((text, index) => {
    let place = places.get(text);
    if (place === undefined) {
      place = values.length;
      places.set(text, place);
      values.push(cells[index]);
    }
    return place;
  });
  if (values.length < cells.length) {
    const width = bitsFor(values.length - 1);
    const few: { [key: string]: Json } = { d: column(values), n: cells.length };
    if (width > 0) few.i = bitsOf(which, width);
    ways.push(few);
  }

  // Whole numbers, as the smallest and how far above it each one is.
  if (cells.every((cell): cell is number => typeof cell === 'number' && Number.isSafeInteger(cell))) {
    const least = cells.reduce((low, cell) => Math.min(low, cell), cells[0]);
    const span = cells.reduce((high, cell) => Math.max(high, cell), cells[0]) - least;
    if (span > 0 && span <= 0xffffffff) {
      const width = bitsFor(span);
      ways.push({ m: least, n: cells.length, w: width, i: bitsOf(cells.map((cell) => cell - least), width) });
    }
  }
  return ways;
}

const utf8 = new TextEncoder();

/**
 * What something comes to on its way, in bytes, which is what the route
 * counts (account.ts, `sizeOf`). The packed save travels as a string inside
 * the copy, so this is the bytes of the thing's JSON as it stands inside
 * that string: a quote or a backslash in it has a backslash put before it,
 * and a letter outside ASCII is two, three or four bytes in UTF-8 where it is
 * one or two in the text. The two quotes round the string are in every
 * weight alike. Not the number of characters: by that, three cells of one
 * emoji look lighter written out than written once, and are not.
 */
function weight(value: Json): number {
  return utf8.encode(JSON.stringify(JSON.stringify(value))).length;
}

/** One column of a table, written the way that is fewest bytes on the wire for its cells, and the earlier way of two that come to the same. */
function column(cells: Json[]): Json {
  let best: Json;
  if (cells.every((cell) => typeof cell === 'boolean')) {
    best = BITS + cells.map((cell) => (cell ? '1' : '0')).join('');
  } else {
    best = cells.map(packed);
    // A number written as bytes comes back as the same number, but −0 would come back as −0 where JSON writes it as 0.
    if (cells.every((cell) => typeof cell === 'number' && Number.isFinite(cell) && !Object.is(cell, -0))) {
      const bytes = BYTES + bytesOf(cells as number[]);
      if (weight(bytes) < weight(best)) best = bytes;
    }
  }
  let least = weight(best);
  const written = cells.map((cell) => JSON.stringify(cell));
  const ways = inBits(cells, written);
  // What the column unfolds to, in characters, were it written in bits. It is counted once the ways have been made,
  // since making them may have written columns in bits of their own; and a way that would take the count too far
  // is not taken.
  const size = written.reduce((sum, text) => sum + text.length, 0);
  let bits = false;
  for (const way of ways) {
    const heavy = weight(way);
    if (heavy < least && unfolded + size <= MOST_UNFOLDED) [best, least, bits] = [way, heavy, true];
  }
  if (bits) unfolded += size;
  return best;
}

/** The columns of a table: one for each field, of the rows that have those fields. */
const columnsOf = (fields: string[], rows: Json[]): Json[] => fields.map((field) => column(rows.map((row) => (row as { [key: string]: Json })[field])));

/** A value with its tables written by column. */
function packed(value: Json): Json {
  if (Array.isArray(value)) {
    const found = shapesOf(value);
    if (!found) return value.map(packed);
    const { shapes, of } = found;
    if (shapes.length === 1) return { [MARK]: 't', k: shapes[0], c: columnsOf(shapes[0], value) };
    // A table for each set of fields, and the order the rows came in: a set and how many rows in a row have it, by turns.
    const runs: number[] = [];
    of.forEach((shape, index) => {
      if (index > 0 && of[index - 1] === shape) runs[runs.length - 1] += 1;
      else runs.push(shape, 1);
    });
    return {
      [MARK]: 'g',
      r: runs,
      t: shapes.map((fields, shape) => ({ k: fields, c: columnsOf(fields, value.filter((_, index) => of[index] === shape)) })),
    };
  }
  if (!isObject(value)) return value;
  const fields: { [key: string]: Json } = {};
  for (const [field, inner] of Object.entries(value)) put(fields, field, packed(inner));
  // An object that has a field of the mark's own name is wrapped, so that it is not taken for a table on the way back.
  return MARK in value ? { [MARK]: 'o', v: fields } : fields;
}

// ── Unpacking ───────────────────────────────────────────────────────────────

/** Counts what a column written in bits unfolds to, in characters, and stops a copy that unfolds to more than `pack` would have written. */
function count(characters: number): void {
  unfolded += characters;
  if (unfolded > MOST_UNFOLDED) throw NOT_PACKED;
}

/** The cells of a column written in bits: a few values and which is which, or whole numbers above the smallest. */
function cellsInBits(written: { [key: string]: Json }, format: number): Json[] {
  const { d, m, n, w, i, ...more } = written;
  if (Object.keys(more).length > 0 || typeof n !== 'number' || !Number.isInteger(n) || n < WORTH || n > MOST_CELLS) throw NOT_PACKED;
  if (d !== undefined) {
    if (m !== undefined || w !== undefined) throw NOT_PACKED;
    const values = cellsOf(d, format);
    // Fewer values than cells, or it was not worth writing so.
    if (values.length >= n) throw NOT_PACKED;
    const width = bitsFor(values.length - 1);
    // No bits to a cell when there is one value for them all.
    const which = width === 0 ? (i === undefined ? new Array<number>(n).fill(0) : null) : typeof i === 'string' ? valuesOf(i, width, n) : null;
    // Every cell is one of the values: so there is at least one value, too.
    if (!which || which.some((place) => place >= values.length)) throw NOT_PACKED;
    const lengths = values.map((value) => JSON.stringify(value).length);
    count(which.reduce((sum, place) => sum + lengths[place], 0));
    return which.map((place) => values[place]);
  }
  if (typeof m !== 'number' || !Number.isSafeInteger(m) || typeof w !== 'number' || !Number.isInteger(w) || w < 1 || w > 32 || typeof i !== 'string') throw NOT_PACKED;
  const numbers = valuesOf(i, w, n)?.map((above) => m + above);
  // Past the whole numbers that are exact, the sum would not be the number that was written.
  if (!numbers || !numbers.every(Number.isSafeInteger)) throw NOT_PACKED;
  count(numbers.reduce((sum, number) => sum + String(number).length, 0));
  return numbers;
}

/** The cells of one column, whichever way it was written. */
function cellsOf(written: Json | undefined, format: number): Json[] {
  if (Array.isArray(written)) return written.map((cell) => unpacked(cell, format));
  if (isObject(written) && format >= PACK_FORMAT) return cellsInBits(written, format);
  if (typeof written !== 'string') throw NOT_PACKED;
  const body = written.slice(1);
  if (written[0] === BITS && /^[01]*$/.test(body)) return [...body].map((bit) => bit === '1');
  const numbers = written[0] === BYTES ? numbersOf(body) : null;
  if (!numbers) throw NOT_PACKED;
  return numbers;
}

/** The rows of a table written as its fields and a column for each. */
function rowsOf(fields: Json | undefined, columns: Json | undefined, format: number): Json[] {
  if (!Array.isArray(fields) || !Array.isArray(columns) || fields.length === 0 || fields.length !== columns.length) throw NOT_PACKED;
  if (!fields.every((field): field is string => typeof field === 'string')) throw NOT_PACKED;
  const cells = columns.map((written) => cellsOf(written, format));
  if (cells.some((cell) => cell.length !== cells[0].length)) throw NOT_PACKED;
  return cells[0].map((_, row) => {
    const object: { [key: string]: Json } = {};
    fields.forEach((field, index) => put(object, field, cells[index][row]));
    return object;
  });
}

/** The rows of a list written as a table for each set of fields, in the order its runs say they came in. */
function rowsInOrder(runs: Json | undefined, tables: Json | undefined, format: number): Json[] {
  if (!Array.isArray(runs) || !Array.isArray(tables) || tables.length < 2 || runs.length % 2 !== 0) throw NOT_PACKED;
  const rows = tables.map((table) => {
    if (!isObject(table)) throw NOT_PACKED;
    return rowsOf(table.k, table.c, format);
  });
  const taken = rows.map(() => 0);
  const list: Json[] = [];
  for (let index = 0; index < runs.length; index += 2) {
    const [shape, count] = [runs[index], runs[index + 1]];
    if (typeof shape !== 'number' || typeof count !== 'number' || !Number.isInteger(shape) || !Number.isInteger(count)) throw NOT_PACKED;
    if (shape < 0 || shape >= rows.length || count < 1 || taken[shape] + count > rows[shape].length) throw NOT_PACKED;
    for (let row = 0; row < count; row++) list.push(rows[shape][taken[shape] + row]);
    taken[shape] += count;
  }
  // Every row of every table has its place in the list, and a table with no rows was never written.
  if (rows.some((table, shape) => table.length === 0 || taken[shape] !== table.length)) throw NOT_PACKED;
  return list;
}

/** A value with its tables written out again as lists of objects. */
function unpacked(value: Json, format: number): Json {
  if (Array.isArray(value)) return value.map((inner) => unpacked(inner, format));
  if (!isObject(value)) return value;
  const kind = Object.prototype.hasOwnProperty.call(value, MARK) ? value[MARK] : undefined;
  if (kind === 't') return rowsOf(value.k, value.c, format);
  if (kind === 'g') return rowsInOrder(value.r, value.t, format);
  const source = kind === 'o' ? value.v : kind === undefined ? value : undefined;
  if (!isObject(source)) throw NOT_PACKED;
  const object: { [key: string]: Json } = {};
  for (const [field, inner] of Object.entries(source)) put(object, field, unpacked(inner, format));
  return object;
}

/**
 * A save's text, packed: shorter text that `unpack` turns back into it. Null
 * for text that is not JSON, which no save is. It is written in `PACK_FORMAT`.
 */
export function packFormat2(text: string): string | null {
  try {
    unfolded = 0;
    return JSON.stringify(packed(JSON.parse(text) as Json));
  } catch {
    return null;
  }
}

/**
 * The text a packed save was made from, or null for anything `pack` did not
 * write in that format: today's unless another is named. A save that was
 * written by `serialize` comes back character for character.
 */
export function unpackFormat2(text: unknown, format: number = PACK_FORMAT): string | null {
  if (typeof text !== 'string' || (format !== FIRST_FORMAT && format !== PACK_FORMAT)) return null;
  try {
    unfolded = 0;
    return JSON.stringify(unpacked(JSON.parse(text) as Json, format));
  } catch {
    return null;
  }
}
