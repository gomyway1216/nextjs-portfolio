import { GameError } from './errors';
import type { DrawingData } from './types';

export const DRAWING_WIDTH = 512;
export const DRAWING_HEIGHT = 384;
export const DRAWING_COLORS = ['#201a32', '#f14d74', '#007bbb', '#17a67a', '#ffbd36', '#ffffff'];
export const DRAWING_WIDTHS = [3, 7, 14];
export const DRAWING_MAX_POINTS = 720;
export const DRAWING_MAX_STROKES = 64;
export const DRAWING_MAX_BYTES = 8000;
export const DRAWING_ROOM_BUDGET = 400000;
export const emptyDrawing = (): DrawingData => ({ v: 1, strokes: [] });
const fail = () => { throw new GameError('絵のデータを確認してください。線を減らして、もう一度送ってね。'); };

/** Accept numbers and palette IDs only; no SVG, images, CSS, or executable markup. */
export function drawingInput(value: unknown, allowEmpty = false): DrawingData {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail();
  const raw = value as Record<string, unknown>;
  if (Object.keys(raw).length !== 2 || raw.v !== 1 || !Array.isArray(raw.strokes) ||
    raw.strokes.length > DRAWING_MAX_STROKES || (!allowEmpty && !raw.strokes.length)) return fail();
  let points = 0;
  const strokes = raw.strokes.map((value: unknown) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return fail();
    const stroke = value as Record<string, unknown>;
    if (Object.keys(stroke).length !== 3 || typeof stroke.c !== 'string' || !DRAWING_COLORS.includes(stroke.c) ||
      typeof stroke.w !== 'number' || !DRAWING_WIDTHS.includes(stroke.w) ||
      !Array.isArray(stroke.p) || stroke.p.length < 2 || stroke.p.length % 2) return fail();
    points += stroke.p.length / 2;
    if (points > DRAWING_MAX_POINTS) return fail();
    const p = stroke.p.map((n: unknown, i: number) => {
      if (typeof n !== 'number' || !Number.isSafeInteger(n) || n < 0 || n >= (i % 2 ? DRAWING_HEIGHT : DRAWING_WIDTH)) return fail();
      return n;
    });
    return { c: stroke.c, w: stroke.w, p };
  });
  const drawing: DrawingData = { v: 1, strokes };
  if (new TextEncoder().encode(JSON.stringify(drawing)).length > DRAWING_MAX_BYTES) return fail();
  return drawing;
}
export function drawingSvg(value: unknown): string {
  const drawing = drawingInput(value, true);
  const lines = drawing.strokes.map(stroke => stroke.p.length === 2
    ? `<circle cx="${stroke.p[0]}" cy="${stroke.p[1]}" r="${stroke.w / 2}" fill="${stroke.c}"/>`
    : `<polyline points="${stroke.p.map((n, i) => `${n}${i % 2 ? ' ' : ','}`).join('').trim()}" fill="none" stroke="${stroke.c}" stroke-width="${stroke.w}" stroke-linecap="round" stroke-linejoin="round"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${DRAWING_WIDTH} ${DRAWING_HEIGHT}" role="img" aria-label="伝言の絵"><rect width="512" height="384" fill="#ffffff"/>${lines}</svg>`;
}
