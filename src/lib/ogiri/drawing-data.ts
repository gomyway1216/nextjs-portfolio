import { GameError } from './errors';
import type { DrawingData } from './types';

export const DRAWING_WIDTH = 512;
export const DRAWING_HEIGHT = 384;
export const DRAWING_COLORS = ['#201a32', '#f14d74', '#007bbb', '#17a67a', '#ffbd36', '#ffffff'];
export const DRAWING_WIDTHS = [3, 7, 14];
/** The byte limit is what keeps a room small; the point and stroke caps only stop absurd input. */
export const DRAWING_MAX_POINTS = 1000;
export const DRAWING_MAX_STROKES = 200;
export const DRAWING_MAX_BYTES = 8000;
export const DRAWING_ROOM_BUDGET = 400000;
export const emptyDrawing = (): DrawingData => ({ v: 1, strokes: [] });
const drawingBytes = (drawing: DrawingData) => new TextEncoder().encode(JSON.stringify(drawing)).length;
/** How full the picture is, from 0 to 1, by whichever limit is closest. */
export function drawingUsage(drawing: DrawingData) {
  const points = drawing.strokes.reduce((sum, stroke) => sum + stroke.p.length / 2, 0);
  return Math.min(1, Math.max(drawingBytes(drawing) / DRAWING_MAX_BYTES, points / DRAWING_MAX_POINTS,
    drawing.strokes.length / DRAWING_MAX_STROKES));
}
/** Keep the points a line bends at (Douglas-Peucker): a smooth circle needs a dozen, not sixty. */
export function simplifyStroke(p: number[], tolerance = 1.5): number[] {
  const count = p.length / 2;
  if (count <= 2) return p;
  const keep = new Uint8Array(count);
  keep[0] = keep[count - 1] = 1;
  const spans: [number, number][] = [[0, count - 1]];
  while (spans.length) {
    const [a, b] = spans.pop()!;
    const ax = p[2 * a], ay = p[2 * a + 1], dx = p[2 * b] - ax, dy = p[2 * b + 1] - ay, squared = dx * dx + dy * dy;
    let worst = 0, index = -1;
    for (let i = a + 1; i < b; i++) {
      const x = p[2 * i] - ax, y = p[2 * i + 1] - ay;
      // Distance to the segment, not the endless line: a stroke that doubles back keeps its far end.
      const t = squared ? Math.max(0, Math.min(1, (x * dx + y * dy) / squared)) : 0;
      const distance = Math.hypot(x - t * dx, y - t * dy);
      if (distance > worst) { worst = distance; index = i; }
    }
    if (worst > tolerance) { keep[index] = 1; spans.push([a, index], [index, b]); }
  }
  return p.filter((_, i) => keep[i >> 1]);
}
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
  if (drawingBytes(drawing) > DRAWING_MAX_BYTES) return fail();
  return drawing;
}
export function drawingSvg(value: unknown): string {
  const drawing = drawingInput(value, true);
  const lines = drawing.strokes.map(stroke => stroke.p.length === 2
    ? `<circle cx="${stroke.p[0]}" cy="${stroke.p[1]}" r="${stroke.w / 2}" fill="${stroke.c}"/>`
    : `<polyline points="${stroke.p.map((n, i) => `${n}${i % 2 ? ' ' : ','}`).join('').trim()}" fill="none" stroke="${stroke.c}" stroke-width="${stroke.w}" stroke-linecap="round" stroke-linejoin="round"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${DRAWING_WIDTH} ${DRAWING_HEIGHT}" role="img" aria-label="伝言の絵"><rect width="512" height="384" fill="#ffffff"/>${lines}</svg>`;
}
