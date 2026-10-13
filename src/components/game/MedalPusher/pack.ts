/**
 * A save made small enough to travel. On this device a machine is kept as the
 * text `serialize` writes, about 40 KB of it and more on a crowded table. The
 * account's copy goes through a route that takes 64 KB at most, and the write
 * made as the page is left has to fit a browser's limit of the same size, so
 * the text is packed before it is sent and unpacked when it comes back.
 *
 * Nothing here knows what a machine is. It works on any JSON, which is why a
 * save of an older version travels as well as today's, and why a field added
 * to the machine later needs nothing done here:
 *
 * - A list of objects that all have the same fields, which is what the medals
 *   are, is written as one list of field names and a column for each field.
 * - A list of objects that have a few different sets of fields is written as
 *   such a table for each set, and the order the rows came in. That is what
 *   the medals are once one of them is a jewel: a jewel says that it is one,
 *   and a medal says nothing.
 * - A column of numbers is written as the bytes of the numbers themselves, in
 *   base64, where that is shorter than writing them out in digits. A position
 *   on the field takes 17 or 18 digits and 11 characters this way.
 * - A column of yes and no is written as a string of 1s and 0s.
 *
 * Every number comes back as the very same number, so the text that comes out
 * is the text that went in, and it is `restore` that decides, as for any save,
 * whether it is a machine. Nothing here is trusted on the way back either:
 * `unpack` gives null for anything it did not write, and never throws.
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

/**
 * A save's text, packed: shorter text that `unpack` turns back into it. Null
 * for text that is not JSON, which no save is.
 */
export function pack(text: string): string | null {
  try {
    return JSON.stringify(packed(JSON.parse(text) as Json));
  } catch {
    return null;
  }
}

/**
 * The text a packed save was made from, or null for anything `pack` did not
 * write. A save that was written by `serialize` comes back character for
 * character.
 */
export function unpack(text: unknown): string | null {
  if (typeof text !== 'string') return null;
  try {
    return JSON.stringify(unpacked(JSON.parse(text) as Json));
  } catch {
    return null;
  }
}
