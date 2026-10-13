/**
 * The packer as it was when format 1 was the only one: `pack.ts` word for word
 * as it stood on main at fbe64572, the day before format 2, with nothing
 * changed but this heading and the names of its two exports. Copies it wrote
 * are on players' accounts and have to be read for good, so it is kept here
 * to write such copies in the tests, and to say what its own reader makes of
 * a copy. It is not used by the game. Do not bring it up to date: what it is
 * for is to stay as it was.
 */

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/** The field that marks a packed table, or an object that had a field of that name itself. */
const MARK = '$';
/** A list has to be at least this long to be worth writing as a table. */
const WORTH = 2;
/** The most sets of fields a list may have and still be written as tables, one for each set. */
const MOST_SHAPES = 8;
/** How a column written as a string begins: the bytes of numbers, or one character for each yes or no. */
const BYTES = 'f';
const BITS = 'b';

const isObject = (value: Json | undefined): value is { [key: string]: Json } => typeof value === 'object' && value !== null && !Array.isArray(value);

/** Sets a field as the object's own whatever its name is, as JSON.parse would: `__proto__` is a field like any other in a save. */
const put = (object: { [key: string]: Json }, field: string, value: Json): void => {
  Object.defineProperty(object, field, { value, enumerable: true, writable: true, configurable: true });
};

/** The bytes of a list of numbers, eight to a number with the low byte first, as base64. */
function bytesOf(numbers: readonly number[]): string {
  const view = new DataView(new ArrayBuffer(numbers.length * 8));
  numbers.forEach((value, index) => view.setFloat64(index * 8, value, true));
  const bytes = new Uint8Array(view.buffer);
  let binary = '';
  // A few thousand bytes at a time: one call for them all would pass too many arguments.
  for (let start = 0; start < bytes.length; start += 0x2000) binary += String.fromCharCode(...bytes.subarray(start, start + 0x2000));
  return btoa(binary);
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

/** One column of a table: as bytes or as bits where the whole column allows it and it is shorter, and as a list otherwise. */
function column(cells: Json[]): Json {
  if (cells.every((cell) => typeof cell === 'boolean')) return BITS + cells.map((cell) => (cell ? '1' : '0')).join('');
  // A number written here comes back as the same number, but −0 would come back as −0 where JSON writes it as 0.
  if (cells.every((cell) => typeof cell === 'number' && Number.isFinite(cell) && !Object.is(cell, -0))) {
    const bytes = BYTES + bytesOf(cells as number[]);
    if (bytes.length < JSON.stringify(cells).length) return bytes;
  }
  return cells.map(packed);
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

/** Thrown inside `unpacked` for anything `packed` could not have written. */
const NOT_PACKED = new Error('not a packed save');

/** The cells of one column, whichever way it was written. */
function cellsOf(written: Json | undefined): Json[] {
  if (Array.isArray(written)) return written.map(unpacked);
  if (typeof written !== 'string') throw NOT_PACKED;
  const body = written.slice(1);
  if (written[0] === BITS && /^[01]*$/.test(body)) return [...body].map((bit) => bit === '1');
  const numbers = written[0] === BYTES ? numbersOf(body) : null;
  if (!numbers) throw NOT_PACKED;
  return numbers;
}

/** The rows of a table written as its fields and a column for each. */
function rowsOf(fields: Json | undefined, columns: Json | undefined): Json[] {
  if (!Array.isArray(fields) || !Array.isArray(columns) || fields.length === 0 || fields.length !== columns.length) throw NOT_PACKED;
  if (!fields.every((field): field is string => typeof field === 'string')) throw NOT_PACKED;
  const cells = columns.map(cellsOf);
  if (cells.some((cell) => cell.length !== cells[0].length)) throw NOT_PACKED;
  return cells[0].map((_, row) => {
    const object: { [key: string]: Json } = {};
    fields.forEach((field, index) => put(object, field, cells[index][row]));
    return object;
  });
}

/** The rows of a list written as a table for each set of fields, in the order its runs say they came in. */
function rowsInOrder(runs: Json | undefined, tables: Json | undefined): Json[] {
  if (!Array.isArray(runs) || !Array.isArray(tables) || tables.length < 2 || runs.length % 2 !== 0) throw NOT_PACKED;
  const rows = tables.map((table) => {
    if (!isObject(table)) throw NOT_PACKED;
    return rowsOf(table.k, table.c);
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
function unpacked(value: Json): Json {
  if (Array.isArray(value)) return value.map(unpacked);
  if (!isObject(value)) return value;
  const kind = Object.prototype.hasOwnProperty.call(value, MARK) ? value[MARK] : undefined;
  if (kind === 't') return rowsOf(value.k, value.c);
  if (kind === 'g') return rowsInOrder(value.r, value.t);
  const source = kind === 'o' ? value.v : kind === undefined ? value : undefined;
  if (!isObject(source)) throw NOT_PACKED;
  const object: { [key: string]: Json } = {};
  for (const [field, inner] of Object.entries(source)) put(object, field, unpacked(inner));
  return object;
}

/** A save's text, packed as format 1 packed it. */
export function packFormat1(text: string): string | null {
  try {
    return JSON.stringify(packed(JSON.parse(text) as Json));
  } catch {
    return null;
  }
}

/** What format 1's own reader makes of a packed save: the text, or null. */
export function unpackFormat1(text: unknown): string | null {
  if (typeof text !== 'string') return null;
  try {
    return JSON.stringify(unpacked(JSON.parse(text) as Json));
  } catch {
    return null;
  }
}
