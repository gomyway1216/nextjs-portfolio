import type { Difficulty } from '../src/components/game/common/types';
import fs from 'node:fs';
import path from 'node:path';
import { deflateSync } from 'node:zlib';
import { GenerateMovesImproved } from '../src/components/game/ShogiImproved/GenerateMovesImproved';
import { InitialPositionImproved } from '../src/components/game/ShogiImproved/InitialPositionImproved';
import type { KyokumenImproved } from '../src/components/game/ShogiImproved/KyokumenImproved';
import { ShogiAIImproved } from '../src/components/game/ShogiImproved/ShogiAIImproved';
import { ShogiAIImprovedV3 } from '../src/components/game/ShogiImproved/ShogiAIImprovedV3';
import { ShogiAIImprovedV4 } from '../src/components/game/ShogiImproved/ShogiAIImprovedV4';
import { ShogiAIImprovedV5 } from '../src/components/game/ShogiImproved/ShogiAIImprovedV5';
import { ShogiAIImprovedV6 } from '../src/components/game/ShogiImproved/ShogiAIImprovedV6';
import { ShogiAIImprovedV7 } from '../src/components/game/ShogiImproved/ShogiAIImprovedV7';
import { ShogiAIImprovedV8 } from '../src/components/game/ShogiImproved/ShogiAIImprovedV8';
import { ShogiAIImprovedV9 } from '../src/components/game/ShogiImproved/ShogiAIImprovedV9';
import { ShogiAIImprovedV10 } from '../src/components/game/ShogiImproved/ShogiAIImprovedV10';
import { ShogiAIImprovedV11 } from '../src/components/game/ShogiImproved/ShogiAIImprovedV11';
import { ShogiAIImprovedV12 } from '../src/components/game/ShogiImproved/ShogiAIImprovedV12';
import { ShogiAIImprovedV13 } from '../src/components/game/ShogiImproved/ShogiAIImprovedV13';
import { ShogiAIImprovedV14 } from '../src/components/game/ShogiImproved/ShogiAIImprovedV14';
import { ShogiAIImprovedV15 } from '../src/components/game/ShogiImproved/ShogiAIImprovedV15';
import { ShogiAIImprovedV16 } from '../src/components/game/ShogiImproved/ShogiAIImprovedV16';
import { ShogiAIImprovedV17 } from '../src/components/game/ShogiImproved/ShogiAIImprovedV17';
import { ShogiAIImprovedV18 } from '../src/components/game/ShogiImproved/ShogiAIImprovedV18';
import { ShogiAIImprovedV19 } from '../src/components/game/ShogiImproved/ShogiAIImprovedV19';
import { ShogiAIImprovedV20 } from '../src/components/game/ShogiImproved/ShogiAIImprovedV20';
import { ShogiAIImprovedV20Base } from '../src/components/game/ShogiImproved/ShogiAIImprovedV20Base';
import { EMPTY, FU, GOTE, OU, SENTE, Te, getKomashu } from '../src/components/game/ShogiImproved/types';

type EvalMode = 'v1' | 'v2' | 'v3';
type EngineName =
  | 'v2'
  | 'v3'
  | 'v4'
  | 'v5'
  | 'v6'
  | 'v7'
  | 'v8'
  | 'v9'
  | 'v10'
  | 'v11'
  | 'v12'
  | 'v13'
  | 'v14'
  | 'v15'
  | 'v16'
  | 'v17'
  | 'v18'
  | 'v19'
  | 'v20'
  // Frozen pre-mate-solver copy of V20; baseline for A/B testing the mate-solver integration.
  | 'v20base';
type OpeningMode = 'none' | 'random' | 'quiet' | 'curated';

type EngineInstance = {
  getNextTe: (...args: Parameters<ShogiAIImproved['getNextTe']>) => ReturnType<ShogiAIImproved['getNextTe']>;
};

interface MatchConfig {
  games: number;
  maxPlies: number;
  difficulty: Difficulty;
  maxDepth: number;
  maxTimeMs: number;
  // Per-side budgets (A/B). Always populated by parseArgs — they default to `maxTimeMs`
  // when --maxTimeMsA/--maxTimeMsB are not given. Useful to compare
  // "new engine at a shorter budget" vs "old engine at its old budget".
  maxTimeMsA: number;
  maxTimeMsB: number;
  quiescenceDepthMax: number;
  engineA: EngineName;
  engineB: EngineName;
  evalA: EvalMode; // "baseline" or "new"
  evalB: EvalMode;
  traceEval: EvalMode;
  seed: number;
  openingPlies: number;
  openingMode: OpeningMode;
  graph: boolean;
  graphAll: boolean;
  graphOutDir: string;
  swapColors: boolean;
  quiet: boolean;
  verbose: boolean;
}

function parseIntArg(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function parseOpeningModeArg(value: string | undefined, fallback: OpeningMode): OpeningMode {
  if (value === 'none' || value === 'random' || value === 'quiet' || value === 'curated') return value;
  return fallback;
}

function parseEngineArg(value: string | undefined, fallback: EngineName): EngineName {
  if (
    value === 'v2' ||
    value === 'v3' ||
    value === 'v4' ||
    value === 'v5' ||
    value === 'v6' ||
    value === 'v7' ||
    value === 'v8' ||
    value === 'v9' ||
    value === 'v10' ||
    value === 'v11' ||
    value === 'v12' ||
    value === 'v13' ||
    value === 'v14' ||
    value === 'v15' ||
    value === 'v16' ||
    value === 'v17' ||
    value === 'v18' ||
    value === 'v19' ||
    value === 'v20' ||
    value === 'v20base'
  )
    return value;
  return fallback;
}

function parseEvalArg(value: string | undefined, fallback: EvalMode): EvalMode {
  if (value === 'v1' || value === 'v2' || value === 'v3') return value;
  return fallback;
}

class Xorshift32 {
  private state: number;

  constructor(seed: number) {
    // Avoid the 0 state (xorshift would get stuck).
    this.state = (seed | 0) || 1;
  }

  nextU32(): number {
    // xorshift32
    let x = this.state | 0;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.state = x | 0;
    return x >>> 0;
  }

  nextInt(maxExclusive: number): number {
    if (maxExclusive <= 0) return 0;
    return this.nextU32() % maxExclusive;
  }
}

function mixSeed(seed: number, salt: number): number {
  // Cheap deterministic mixing for per-game/pair RNG.
  const s = (seed | 0) ^ Math.imul((salt | 0) + 1, 0x9e3779b9);
  return s | 0;
}

function parseArgs(argv: string[]): MatchConfig {
  const argMap = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      argMap.set(key, next);
      i++;
    } else {
      argMap.set(key, 'true');
    }
  }

  const difficulty = (argMap.get('difficulty') as Difficulty) || 'medium';
  const engineA = parseEngineArg(argMap.get('engineA'), 'v2');
  const engineB = parseEngineArg(argMap.get('engineB'), 'v5');
  const evalA = parseEvalArg(argMap.get('evalA'), 'v2');
  const evalB = parseEvalArg(argMap.get('evalB'), 'v2');
  const traceEval = parseEvalArg(argMap.get('traceEval'), 'v3');
  const seed = parseIntArg(argMap.get('seed'), 1);
  const openingPlies = Math.max(0, parseIntArg(argMap.get('openingPlies'), 0));
  const openingMode =
    openingPlies <= 0
      ? 'none'
      : parseOpeningModeArg(argMap.get('openingMode'), 'curated');
  const graphValue = argMap.get('graph');
  const graphAll = graphValue === 'all';
  const graph =
    graphAll ||
    graphValue === 'true' ||
    graphValue === '1' ||
    graphValue === 'yes' ||
    graphValue === 'on';
  const graphOutDir = argMap.get('graphOutDir') || 'scripts/shogi-ai-match-output';
  const quietValue = argMap.get('quiet');
  const quiet =
    quietValue === 'true' ||
    quietValue === '1' ||
    quietValue === 'yes' ||
    quietValue === 'on';
  const verboseValue = argMap.get('verbose');
  const verbose =
    verboseValue === 'true' ||
    verboseValue === '1' ||
    verboseValue === 'yes' ||
    verboseValue === 'on';

  return {
    games: parseIntArg(argMap.get('games'), 4),
    maxPlies: parseIntArg(argMap.get('maxPlies'), 120),
    difficulty,
    maxDepth: parseIntArg(argMap.get('maxDepth'), difficulty === 'easy' ? 4 : difficulty === 'medium' ? 5 : 6),
    // Default to a small time limit so running the script doesn't take forever.
    maxTimeMs: parseIntArg(argMap.get('maxTimeMs'), 60),
    maxTimeMsA: parseIntArg(argMap.get('maxTimeMsA'), parseIntArg(argMap.get('maxTimeMs'), 60)),
    maxTimeMsB: parseIntArg(argMap.get('maxTimeMsB'), parseIntArg(argMap.get('maxTimeMs'), 60)),
    quiescenceDepthMax: parseIntArg(argMap.get('qDepth'), 6),
    engineA,
    engineB,
    evalA,
    evalB,
    traceEval,
    seed,
    openingPlies,
    openingMode,
    graph,
    graphAll,
    graphOutDir,
    swapColors: argMap.get('swapColors') !== 'false',
    quiet,
    verbose,
  };
}

function otherSide(teban: number): number {
  return teban === SENTE ? GOTE : SENTE;
}

function evaluateSente(k: KyokumenImproved, mode: EvalMode): number {
  switch (mode) {
    case 'v1':
      return k.evaluateV1();
    case 'v2':
      return k.evaluate();
    case 'v3':
      return k.evaluateV3();
    default: {
      const exhaustive: never = mode;
      return exhaustive;
    }
  }
}

type GameResult =
  (
    | { outcome: 'win'; winner: number; plies: number; reason: 'checkmate' | 'timeout' }
    | { outcome: 'draw'; plies: number; reason: 'repetition' | 'maxPlies' | 'stalemate' }
  ) & { trace: GameTrace };

interface GameTrace {
  // Evaluation history from SENTE's perspective.
  // - 0: even
  // - positive: SENTE is better
  // - negative: GOTE is better
  evalByPly: number[];
  moves: string[];
}

function pickRandom<T>(items: T[], rng: Xorshift32): T {
  return items[rng.nextInt(items.length)];
}

function pickOpeningMove(k: KyokumenImproved, moves: Te[], mode: OpeningMode, rng: Xorshift32): Te {
  if (mode === 'none') return moves[0];

  const quiet = moves.filter((m) => m.from !== 0 && m.capture === EMPTY && !m.promote);
  if (mode === 'quiet') return pickRandom(quiet.length > 0 ? quiet : moves, rng);

  if (mode === 'curated') {
    // Prefer "opening-like" moves to create realistic and diverse starting positions.
    // This is intentionally simple and deterministic across engines (only based on legal moves).
    const pawnStartDan = k.teban === SENTE ? 7 : 3;
    const pawnNextDan = k.teban === SENTE ? 6 : 4;

    // 1) One-step pawn pushes from the starting rank (most common openings).
    const pawnPush = quiet.filter(
      (m) =>
        getKomashu(m.koma) === FU &&
        (m.from & 0x0f) === pawnStartDan &&
        (m.to & 0x0f) === pawnNextDan
    );
    if (pawnPush.length > 0) return pickRandom(pawnPush, rng);

    // 2) Quiet development that isn't moving the king.
    const develop = quiet.filter((m) => getKomashu(m.koma) !== OU);
    if (develop.length > 0) return pickRandom(develop, rng);

    // 3) Any quiet move.
    if (quiet.length > 0) return pickRandom(quiet, rng);

    // 4) Fallback: any legal move.
    return pickRandom(moves, rng);
  }

  // mode === 'random'
  return pickRandom(moves, rng);
}

function buildOpeningLine(
  config: Pick<MatchConfig, 'seed' | 'openingPlies' | 'openingMode' | 'verbose'>,
  openingIndex: number
): Te[] {
  const k = InitialPositionImproved.createInitialPosition();
  k.setTeban(SENTE);

  const openingMoves: Te[] = [];
  if (config.openingMode === 'none' || config.openingPlies <= 0) {
    return openingMoves;
  }

  const rng = new Xorshift32(mixSeed(config.seed, openingIndex));

  for (let ply = 0; ply < config.openingPlies; ply++) {
    const moves = GenerateMovesImproved.generateLegalMoves(k);
    if (moves.length === 0) break;

    const selected = pickOpeningMove(k, moves, config.openingMode, rng);
    // IMPORTANT: keep `capture` for undo correctness; we may replay this move sequence later.
    selected.capture = k.get(selected.to);
    openingMoves.push(selected.clone());

    if (config.verbose) {
      console.log(`  OPN ${String(ply + 1).padStart(3, ' ')} ${formatSide(k.teban)}: ${selected.toString()}`);
    }

    k.move(selected);
    k.toggleTeban();
  }

  return openingMoves;
}

function playOneGame(
  openingMoves: Te[],
  aiSente: { ai: EngineInstance; evalMode: EvalMode; maxTimeMs?: number },
  aiGote: { ai: EngineInstance; evalMode: EvalMode; maxTimeMs?: number },
  config: Pick<
    MatchConfig,
    'difficulty' | 'maxDepth' | 'maxTimeMs' | 'quiescenceDepthMax' | 'maxPlies' | 'verbose' | 'traceEval'
  >
): GameResult {
  const k = InitialPositionImproved.createInitialPosition();
  k.setTeban(SENTE);

  const trace: GameTrace = { evalByPly: [evaluateSente(k, config.traceEval)], moves: [] };

  // Apply the fixed opening line first (same for both engines).
  for (const openingMove of openingMoves) {
    const te = openingMove.clone();
    te.capture = k.get(te.to);

    if (config.verbose) {
      console.log(`  OPN ${formatSide(k.teban)}: ${te.toString()}`);
    }

    trace.moves.push(te.toString());
    k.move(te);
    k.toggleTeban();
    trace.evalByPly.push(evaluateSente(k, config.traceEval));
  }

  const repetitionCount = new Map<number, number>();
  const openingPlies = openingMoves.length;

  for (let ply = openingPlies; ply < config.maxPlies; ply++) {
    // Repetition (sennichite): 4 occurrences of the same position+turn => draw.
    repetitionCount.set(k.HashVal, (repetitionCount.get(k.HashVal) ?? 0) + 1);
    if ((repetitionCount.get(k.HashVal) ?? 0) >= 4) {
      return { outcome: 'draw', plies: ply, reason: 'repetition', trace };
    }

    const side = k.teban;
    const current = side === SENTE ? aiSente : aiGote;

    const move = current.ai.getNextTe(k, ply, {
      difficulty: config.difficulty,
      maxDepth: config.maxDepth,
      maxTimeMs: current.maxTimeMs ?? config.maxTimeMs,
      quiescenceDepthMax: config.quiescenceDepthMax,
      evaluationMode: current.evalMode,
    });

    if (!move) {
      // If the engine fails to return a move but legal moves exist, treat it as a "timeout" loss.
      // (This happens when the time budget is very small and the search doesn't complete depth 1.)
      const legalMoves = GenerateMovesImproved.generateLegalMoves(k);
      if (legalMoves.length > 0) {
        return { outcome: 'win', winner: otherSide(side), plies: ply, reason: 'timeout', trace };
      }

      const inCheck = GenerateMovesImproved.isKingInCheck(k, side);
      if (inCheck) return { outcome: 'win', winner: otherSide(side), plies: ply, reason: 'checkmate', trace };
      return { outcome: 'draw', plies: ply, reason: 'stalemate', trace };
    }

    // Apply move to the main game position.
    if (config.verbose) {
      console.log(`${String(ply + 1).padStart(3, ' ')} ${formatSide(side)}: ${move.toString()}`);
    }
    trace.moves.push(move.toString());
    k.move(move);
    k.toggleTeban();
    trace.evalByPly.push(evaluateSente(k, config.traceEval));
  }

  return { outcome: 'draw', plies: config.maxPlies, reason: 'maxPlies', trace };
}

function formatSide(side: number): string {
  return side === SENTE ? 'SENTE' : 'GOTE';
}

function sanitizeFileToken(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+/, '')
    .replace(/_+$/, '');
}

function writeEvalCsv(filePath: string, trace: GameTrace): void {
  const rows: string[] = ['ply,eval,move'];
  rows.push(`0,${trace.evalByPly[0]},`);
  for (let i = 1; i < trace.evalByPly.length; i++) {
    const move = trace.moves[i - 1] ?? '';
    rows.push(`${i},${trace.evalByPly[i]},${move}`);
  }
  fs.writeFileSync(filePath, rows.join('\n'));
}

function writeEvalSvg(filePath: string, trace: GameTrace, title: string): void {
  const width = 960;
  const height = 320;
  const pad = 48;
  const plotW = width - pad * 2;
  const plotH = height - pad * 2;

  const values = trace.evalByPly;
  const maxAbs = Math.max(1, ...values.map((v) => Math.abs(v)));
  const scaleY = plotH / (maxAbs * 2);

  const xFor = (i: number): number => (values.length <= 1 ? pad : pad + (i * plotW) / (values.length - 1));
  const yFor = (v: number): number => pad + (maxAbs - v) * scaleY;

  const points = values.map((v, i) => `${xFor(i).toFixed(2)},${yFor(v).toFixed(2)}`).join(' ');
  const zeroY = yFor(0);

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect x="0" y="0" width="${width}" height="${height}" fill="white"/>
  <text x="${pad}" y="${pad - 18}" font-family="ui-sans-serif, system-ui" font-size="14" fill="#111827">${title}</text>
  <text x="${pad}" y="${pad - 2}" font-family="ui-sans-serif, system-ui" font-size="12" fill="#6b7280">eval: +SENTE / -GOTE (0 is even)</text>
  <rect x="${pad}" y="${pad}" width="${plotW}" height="${plotH}" fill="none" stroke="#e5e7eb"/>
  <line x1="${pad}" y1="${zeroY}" x2="${pad + plotW}" y2="${zeroY}" stroke="#9ca3af" stroke-dasharray="4 4"/>
  <polyline points="${points}" fill="none" stroke="#2563eb" stroke-width="2"/>
  <text x="${pad + plotW - 4}" y="${pad + 12}" text-anchor="end" font-family="ui-sans-serif, system-ui" font-size="12" fill="#6b7280">+${maxAbs}</text>
  <text x="${pad + plotW - 4}" y="${pad + plotH - 4}" text-anchor="end" font-family="ui-sans-serif, system-ui" font-size="12" fill="#6b7280">-${maxAbs}</text>
  <text x="${pad + plotW - 4}" y="${zeroY - 6}" text-anchor="end" font-family="ui-sans-serif, system-ui" font-size="12" fill="#6b7280">0</text>
</svg>
`;

  fs.writeFileSync(filePath, svg);
}

function crc32(bytes: Buffer): number {
  // Standard CRC32 used by PNG chunks.
  // Implementation is small and dependency-free so this script can run anywhere.
  const table = crc32Table;
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = table[(crc ^ bytes[i]!) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const crc32Table: Uint32Array = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    t[n] = c >>> 0;
  }
  return t;
})();

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length >>> 0, 0);
  const crcBuf = Buffer.alloc(4);
  const crc = crc32(Buffer.concat([typeBuf, data]));
  crcBuf.writeUInt32BE(crc >>> 0, 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function writePng(filePath: string, width: number, height: number, rgba: Uint8Array): void {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width >>> 0, 0);
  ihdr.writeUInt32BE(height >>> 0, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const rowBytes = width * 4;
  const raw = Buffer.alloc((rowBytes + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (rowBytes + 1);
    raw[rowStart] = 0; // filter type 0: None
    raw.set(rgba.subarray(y * rowBytes, y * rowBytes + rowBytes), rowStart + 1);
  }

  const compressed = deflateSync(raw, { level: 9 });
  const png = Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
  fs.writeFileSync(filePath, png);
}

function writeEvalPng(filePath: string, trace: GameTrace): void {
  // Basic raster graph (no text labels) so the Codex CLI can preview it.
  // SVG is still written separately for high-quality viewing.
  const width = 960;
  const height = 320;
  const pad = 48;
  const plotW = width - pad * 2;
  const plotH = height - pad * 2;

  const values = trace.evalByPly;
  const maxAbs = Math.max(1, ...values.map((v) => Math.abs(v)));
  const scaleY = plotH / (maxAbs * 2);

  const xFor = (i: number): number => (values.length <= 1 ? pad : pad + (i * plotW) / (values.length - 1));
  const yFor = (v: number): number => pad + (maxAbs - v) * scaleY;

  const rgba = new Uint8Array(width * height * 4);
  const setPixel = (x: number, y: number, r: number, g: number, b: number, a: number = 255): void => {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const idx = (y * width + x) * 4;
    rgba[idx] = r;
    rgba[idx + 1] = g;
    rgba[idx + 2] = b;
    rgba[idx + 3] = a;
  };

  // Fill background white.
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = 255;
    rgba[i + 1] = 255;
    rgba[i + 2] = 255;
    rgba[i + 3] = 255;
  }

  const drawLine = (x0: number, y0: number, x1: number, y1: number, r: number, g: number, b: number): void => {
    // Bresenham line drawing (integer-only).
    let x = x0 | 0;
    let y = y0 | 0;
    const x2 = x1 | 0;
    const y2 = y1 | 0;
    const dx = Math.abs(x2 - x);
    const dy = Math.abs(y2 - y);
    const sx = x < x2 ? 1 : -1;
    const sy = y < y2 ? 1 : -1;
    let err = dx - dy;
    while (true) {
      setPixel(x, y, r, g, b);
      if (x === x2 && y === y2) break;
      const e2 = err * 2;
      if (e2 > -dy) {
        err -= dy;
        x += sx;
      }
      if (e2 < dx) {
        err += dx;
        y += sy;
      }
    }
  };

  // Plot border.
  const xL = pad;
  const xR = pad + plotW;
  const yT = pad;
  const yB = pad + plotH;
  drawLine(xL, yT, xR, yT, 229, 231, 235);
  drawLine(xL, yB, xR, yB, 229, 231, 235);
  drawLine(xL, yT, xL, yB, 229, 231, 235);
  drawLine(xR, yT, xR, yB, 229, 231, 235);

  // Zero line.
  const zeroY = Math.round(yFor(0));
  drawLine(xL, zeroY, xR, zeroY, 156, 163, 175);

  // Polyline.
  if (values.length >= 2) {
    let px = Math.round(xFor(0));
    let py = Math.round(yFor(values[0]!));
    for (let i = 1; i < values.length; i++) {
      const x = Math.round(xFor(i));
      const y = Math.round(yFor(values[i]!));
      drawLine(px, py, x, y, 37, 99, 235);
      px = x;
      py = y;
    }
  } else if (values.length === 1) {
    const x = Math.round(xFor(0));
    const y = Math.round(yFor(values[0]!));
    // Draw a small dot.
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) setPixel(x + dx, y + dy, 37, 99, 235);
    }
  }

  writePng(filePath, width, height, rgba);
}

function createEngine(name: EngineName): EngineInstance {
  switch (name) {
    case 'v2':
      return new ShogiAIImproved();
    case 'v3':
      return new ShogiAIImprovedV3();
    case 'v4':
      return new ShogiAIImprovedV4();
    case 'v5':
      return new ShogiAIImprovedV5();
    case 'v6':
      return new ShogiAIImprovedV6();
    case 'v7':
      return new ShogiAIImprovedV7();
    case 'v8':
      return new ShogiAIImprovedV8();
    case 'v9':
      return new ShogiAIImprovedV9();
    case 'v10':
      return new ShogiAIImprovedV10();
    case 'v11':
      return new ShogiAIImprovedV11();
    case 'v12':
      return new ShogiAIImprovedV12();
    case 'v13':
      return new ShogiAIImprovedV13();
    case 'v14':
      return new ShogiAIImprovedV14();
    case 'v15':
      return new ShogiAIImprovedV15();
    case 'v16':
      return new ShogiAIImprovedV16();
    case 'v17':
      return new ShogiAIImprovedV17();
    case 'v18':
      return new ShogiAIImprovedV18();
    case 'v19':
      return new ShogiAIImprovedV19();
    case 'v20':
      return new ShogiAIImprovedV20();
    case 'v20base':
      return new ShogiAIImprovedV20Base();
    default: {
      const exhaustive: never = name;
      throw new Error(`unknown engine: ${exhaustive}`);
    }
  }
}

function main(): void {
  const config = parseArgs(process.argv.slice(2));

  if (!config.quiet) console.log('[shogi-ai-match] config:', config);

  let aWins = 0;
  let bWins = 0;
  let draws = 0;

  const graphOutDir = path.resolve(config.graphOutDir);
  if (config.graph) fs.mkdirSync(graphOutDir, { recursive: true });

  const openingCache = new Map<number, Te[]>();

  for (let gameIndex = 0; gameIndex < config.games; gameIndex++) {
    const swap = config.swapColors && (gameIndex % 2 === 1);
    const openingIndex = config.swapColors ? Math.floor(gameIndex / 2) : gameIndex;

    let openingMoves = openingCache.get(openingIndex);
    if (!openingMoves) {
      openingMoves = buildOpeningLine(config, openingIndex);
      openingCache.set(openingIndex, openingMoves);
    }

    const aiA = createEngine(config.engineA);
    const aiB = createEngine(config.engineB);

    const sente = swap
      ? { ai: aiB, evalMode: config.evalB, maxTimeMs: config.maxTimeMsB }
      : { ai: aiA, evalMode: config.evalA, maxTimeMs: config.maxTimeMsA };
    const gote = swap
      ? { ai: aiA, evalMode: config.evalA, maxTimeMs: config.maxTimeMsA }
      : { ai: aiB, evalMode: config.evalB, maxTimeMs: config.maxTimeMsB };

    if (config.verbose && openingMoves.length > 0) {
      console.log(`\n[game ${gameIndex + 1}] openingIndex=${openingIndex} swapColors=${swap}`);
    }

    const result = playOneGame(openingMoves, sente, gote, config);

    const aIsSente = !swap;
    const winnerIsA =
      result.outcome === 'win' && (aIsSente ? result.winner === SENTE : result.winner === GOTE);
    const winnerIsB =
      result.outcome === 'win' && (aIsSente ? result.winner === GOTE : result.winner === SENTE);

    if (winnerIsA) aWins++;
    else if (winnerIsB) bWins++;
    else draws++;

    const labelA = `${config.engineA}/${config.evalA}${swap ? '(GOTE)' : '(SENTE)'}`;
    const labelB = `${config.engineB}/${config.evalB}${swap ? '(SENTE)' : '(GOTE)'}`;

    if (!config.quiet) {
      if (result.outcome === 'win') {
        console.log(
          `game ${gameIndex + 1}/${config.games}: ${labelA} vs ${labelB} => WIN ${formatSide(result.winner)} (${result.reason}) plies=${result.plies}`
        );
      } else {
        console.log(
          `game ${gameIndex + 1}/${config.games}: ${labelA} vs ${labelB} => DRAW (${result.reason}) plies=${result.plies}`
        );
      }
    }

    const shouldGraph = config.graph && (config.graphAll || gameIndex === 0);
	    if (shouldGraph) {
	      const base =
	        `game-${String(gameIndex + 1).padStart(3, '0')}` +
	        `-opening-${openingIndex}` +
	        `-${sanitizeFileToken(labelA)}-vs-${sanitizeFileToken(labelB)}`;
	      const csvPath = path.join(graphOutDir, `${base}.csv`);
	      const svgPath = path.join(graphOutDir, `${base}.svg`);
	      const pngPath = path.join(graphOutDir, `${base}.png`);
	
	      writeEvalCsv(csvPath, result.trace);
	      writeEvalSvg(svgPath, result.trace, `${labelA} vs ${labelB}`);
	      writeEvalPng(pngPath, result.trace);
	
	      console.log(`[shogi-ai-match] graph: wrote ${path.relative(process.cwd(), svgPath)}`);
	      console.log(`[shogi-ai-match] graph: wrote ${path.relative(process.cwd(), csvPath)}`);
	      console.log(`[shogi-ai-match] graph: wrote ${path.relative(process.cwd(), pngPath)}`);
	    }
	  }

  console.log('\n[shogi-ai-match] summary');
  console.log(`A (engine=${config.engineA}, eval=${config.evalA}) wins: ${aWins}`);
  console.log(`B (engine=${config.engineB}, eval=${config.evalB}) wins: ${bWins}`);
  console.log(`Draws: ${draws}`);
}

main();
