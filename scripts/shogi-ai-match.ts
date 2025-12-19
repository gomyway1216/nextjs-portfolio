import type { Difficulty } from '../src/components/game/common/types';
import fs from 'node:fs';
import path from 'node:path';
import { GenerateMovesImproved } from '../src/components/game/ShogiImproved/GenerateMovesImproved';
import { InitialPositionImproved } from '../src/components/game/ShogiImproved/InitialPositionImproved';
import type { KyokumenImproved } from '../src/components/game/ShogiImproved/KyokumenImproved';
import { ShogiAIImproved } from '../src/components/game/ShogiImproved/ShogiAIImproved';
import { ShogiAIImprovedV3 } from '../src/components/game/ShogiImproved/ShogiAIImprovedV3';
import { ShogiAIImprovedV4 } from '../src/components/game/ShogiImproved/ShogiAIImprovedV4';
import { ShogiAIImprovedV5 } from '../src/components/game/ShogiImproved/ShogiAIImprovedV5';
import { ShogiAIImprovedV6 } from '../src/components/game/ShogiImproved/ShogiAIImprovedV6';
import { ShogiAIImprovedV7 } from '../src/components/game/ShogiImproved/ShogiAIImprovedV7';
import { EMPTY, FU, GOTE, OU, SENTE, Te, getKomashu } from '../src/components/game/ShogiImproved/types';

type EvalMode = 'v1' | 'v2';
type EngineName = 'v2' | 'v3' | 'v4' | 'v5' | 'v6' | 'v7';
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
  quiescenceDepthMax: number;
  engineA: EngineName;
  engineB: EngineName;
  evalA: EvalMode; // "baseline" or "new"
  evalB: EvalMode;
  seed: number;
  openingPlies: number;
  openingMode: OpeningMode;
  graph: boolean;
  graphAll: boolean;
  graphOutDir: string;
  swapColors: boolean;
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
  if (value === 'v2' || value === 'v3' || value === 'v4' || value === 'v5' || value === 'v6' || value === 'v7') return value;
  return fallback;
}

function parseEvalArg(value: string | undefined, fallback: EvalMode): EvalMode {
  if (value === 'v1' || value === 'v2') return value;
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
    quiescenceDepthMax: parseIntArg(argMap.get('qDepth'), 6),
    engineA,
    engineB,
    evalA,
    evalB,
    seed,
    openingPlies,
    openingMode,
    graph,
    graphAll,
    graphOutDir,
    swapColors: argMap.get('swapColors') !== 'false',
    verbose,
  };
}

function otherSide(teban: number): number {
  return teban === SENTE ? GOTE : SENTE;
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
  aiSente: { ai: EngineInstance; evalMode: EvalMode },
  aiGote: { ai: EngineInstance; evalMode: EvalMode },
  config: Pick<
    MatchConfig,
    'difficulty' | 'maxDepth' | 'maxTimeMs' | 'quiescenceDepthMax' | 'maxPlies' | 'verbose'
  >
): GameResult {
  const k = InitialPositionImproved.createInitialPosition();
  k.setTeban(SENTE);

  const trace: GameTrace = { evalByPly: [k.evaluate()], moves: [] };

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
    trace.evalByPly.push(k.evaluate());
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
      maxTimeMs: config.maxTimeMs,
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
    trace.evalByPly.push(k.evaluate());
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
    default: {
      const exhaustive: never = name;
      throw new Error(`unknown engine: ${exhaustive}`);
    }
  }
}

function main(): void {
  const config = parseArgs(process.argv.slice(2));

  console.log('[shogi-ai-match] config:', config);

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

    const sente = swap ? { ai: aiB, evalMode: config.evalB } : { ai: aiA, evalMode: config.evalA };
    const gote = swap ? { ai: aiA, evalMode: config.evalA } : { ai: aiB, evalMode: config.evalB };

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

    if (result.outcome === 'win') {
      console.log(
        `game ${gameIndex + 1}/${config.games}: ${labelA} vs ${labelB} => WIN ${formatSide(result.winner)} (${result.reason}) plies=${result.plies}`
      );
    } else {
      console.log(
        `game ${gameIndex + 1}/${config.games}: ${labelA} vs ${labelB} => DRAW (${result.reason}) plies=${result.plies}`
      );
    }

    const shouldGraph = config.graph && (config.graphAll || gameIndex === 0);
    if (shouldGraph) {
      const base =
        `game-${String(gameIndex + 1).padStart(3, '0')}` +
        `-opening-${openingIndex}` +
        `-${sanitizeFileToken(labelA)}-vs-${sanitizeFileToken(labelB)}`;
      const csvPath = path.join(graphOutDir, `${base}.csv`);
      const svgPath = path.join(graphOutDir, `${base}.svg`);

      writeEvalCsv(csvPath, result.trace);
      writeEvalSvg(svgPath, result.trace, `${labelA} vs ${labelB}`);

      console.log(`[shogi-ai-match] graph: wrote ${path.relative(process.cwd(), svgPath)}`);
      console.log(`[shogi-ai-match] graph: wrote ${path.relative(process.cwd(), csvPath)}`);
    }
  }

  console.log('\n[shogi-ai-match] summary');
  console.log(`A (engine=${config.engineA}, eval=${config.evalA}) wins: ${aWins}`);
  console.log(`B (engine=${config.engineB}, eval=${config.evalB}) wins: ${bWins}`);
  console.log(`Draws: ${draws}`);
}

main();
