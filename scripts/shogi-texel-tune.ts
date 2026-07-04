import fs from 'node:fs';
import { GenerateMovesImproved } from '../src/components/game/ShogiImproved/GenerateMovesImproved';
import { InitialPositionImproved } from '../src/components/game/ShogiImproved/InitialPositionImproved';
import { KyokumenImproved } from '../src/components/game/ShogiImproved/KyokumenImproved';
import { ShogiAIImprovedV20 } from '../src/components/game/ShogiImproved/ShogiAIImprovedV20';
import { EMPTY, FU, GOTE, OU, SENTE, Te, getKomashu } from '../src/components/game/ShogiImproved/types';

/**
 * Texel-style tuner for the phase-indexed `evaluateV3()` weights in KyokumenImproved.
 *
 * Pipeline:
 * 1. Self-play data generation: v20 vs v20 (both eval=v3) with curated random openings.
 *    For every sampled position (ply >= minPly, side to move not in check) we extract the
 *    weight-independent evaluation components + the game result (1 / 0.5 / 0 from SENTE's view).
 * 2. Fit the sigmoid scale K in `P(win) = 1 / (1 + 10^(-eval/K))` against the dataset
 *    using the current (baseline) weights.
 * 3. Local search (coordinate descent) over the 16 weights (4 arrays x 4 phase buckets):
 *    for each parameter try +/-8 and +/-16 and keep the best change if it lowers the MSE.
 *
 * Because `evaluateV3()` is linear in each weighted term, we cache the raw term values per
 * position once and re-evaluate candidate weight vectors with cheap integer arithmetic —
 * the optimizer never re-runs the engine.
 *
 * Usage (npx tsx is unavailable; use tsx/cjs):
 *   node -r tsx/cjs scripts/shogi-texel-tune.ts --games 40 --maxTimeMs 70 --passes 2 --seed 1
 */

interface TuneConfig {
  games: number;
  maxPlies: number;
  maxTimeMs: number;
  maxDepth: number;
  quiescenceDepthMax: number;
  openingPlies: number;
  minPly: number;
  sampleEvery: number;
  passes: number;
  seed: number;
  evalClamp: number;
  quiet: boolean;
  /** Write the generated dataset (samples JSON) here, so tuning can be re-run without self-play. */
  dumpSamples: string;
  /** Load a previously dumped dataset instead of generating games. */
  fromSamples: string;
}

/** Weight-independent snapshot of one position's evaluation terms. */
interface Sample {
  /** Terms that are not scaled by tunable weights: material + hand bonus + king safety + activity. */
  base: number;
  /** Phase bucket (0=endgame ... 3=opening) — selects the weight column. */
  bucket: number;
  psqt: number;
  castle: number;
  /** File defense + climbing-silver pressure (v3 scales them together). */
  fileDefense: number;
  promoThreat: number;
  /** Game result from SENTE's perspective: 1 / 0.5 / 0. */
  result: number;
}

/** 16-parameter weight vector: [psqt x4, castle x4, fileDefense x4, promoThreat x4]. */
type WeightVector = number[];

const GROUP_NAMES = ['psqt', 'castle', 'fileDefense', 'promoThreat'] as const;

const EVAL_V3_SHIFT = 7;
const EVAL_V3_HALF = 1 << (EVAL_V3_SHIFT - 1);

/** Must mirror KyokumenImproved.scaleEvalV3 exactly (fixed point, symmetric rounding). */
function scaleEvalV3(value: number, weight: number): number {
  const product = Math.imul(value | 0, weight | 0);
  return product >= 0 ? (product + EVAL_V3_HALF) >> EVAL_V3_SHIFT : (product - EVAL_V3_HALF) >> EVAL_V3_SHIFT;
}

function evalSample(s: Sample, w: WeightVector): number {
  return (
    s.base +
    scaleEvalV3(s.psqt, w[s.bucket]) +
    scaleEvalV3(s.castle, w[4 + s.bucket]) +
    scaleEvalV3(s.fileDefense, w[8 + s.bucket]) +
    scaleEvalV3(s.promoThreat, w[12 + s.bucket])
  );
}

function meanSquaredError(samples: Sample[], w: WeightVector, k: number): number {
  let total = 0;
  for (const s of samples) {
    const predicted = 1 / (1 + Math.pow(10, -evalSample(s, w) / k));
    const diff = s.result - predicted;
    total += diff * diff;
  }
  return total / samples.length;
}

// ---------------------------------------------------------------------------
// Self-play data generation (mirrors scripts/shogi-ai-match.ts opening logic)
// ---------------------------------------------------------------------------

class Xorshift32 {
  private state: number;

  constructor(seed: number) {
    this.state = (seed | 0) || 1;
  }

  nextU32(): number {
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
  return ((seed | 0) ^ Math.imul((salt | 0) + 1, 0x9e3779b9)) | 0;
}

function pickRandom<T>(items: T[], rng: Xorshift32): T {
  return items[rng.nextInt(items.length)];
}

/** Curated opening move selection (same policy as shogi-ai-match.ts --openingMode curated). */
function pickCuratedOpeningMove(k: KyokumenImproved, moves: Te[], rng: Xorshift32): Te {
  const quiet = moves.filter((m) => m.from !== 0 && m.capture === EMPTY && !m.promote);

  const pawnStartDan = k.teban === SENTE ? 7 : 3;
  const pawnNextDan = k.teban === SENTE ? 6 : 4;
  const pawnPush = quiet.filter(
    (m) =>
      getKomashu(m.koma) === FU && (m.from & 0x0f) === pawnStartDan && (m.to & 0x0f) === pawnNextDan
  );
  if (pawnPush.length > 0) return pickRandom(pawnPush, rng);

  const develop = quiet.filter((m) => getKomashu(m.koma) !== OU);
  if (develop.length > 0) return pickRandom(develop, rng);
  if (quiet.length > 0) return pickRandom(quiet, rng);
  return pickRandom(moves, rng);
}

/**
 * Access to weight-independent private evaluation terms.
 * The cast is confined to this offline tool; the production class keeps them private.
 */
interface EvalInternals {
  eval: number;
  psqtEval: number;
  totalHandPieces(): number;
  openingPhaseFactorFromHand(hand: number): number;
  evaluateHandBonus(): number;
  evaluateKingSafetyV2WithPhase(phase: number): number;
  evaluateCastleShapes(): number;
  evaluateMajorPieceActivity(): number;
  evaluateFileDefense(): number;
  evaluateClimbingSilverPressure(): number;
  evaluatePromotionThreats(): number;
}

function extractSample(k: KyokumenImproved): Omit<Sample, 'result'> {
  const internals = k as unknown as EvalInternals;
  const handTotal = internals.totalHandPieces();
  const bucket = handTotal <= 2 ? 3 : handTotal <= 6 ? 2 : handTotal <= 10 ? 1 : 0;
  const phase = internals.openingPhaseFactorFromHand(handTotal);

  const base =
    (internals.eval | 0) +
    (internals.evaluateHandBonus() | 0) +
    (internals.evaluateKingSafetyV2WithPhase(phase) | 0) +
    (internals.evaluateMajorPieceActivity() | 0);

  return {
    base,
    bucket,
    psqt: internals.psqtEval | 0,
    castle: internals.evaluateCastleShapes() | 0,
    fileDefense: (internals.evaluateFileDefense() + internals.evaluateClimbingSilverPressure()) | 0,
    promoThreat: internals.evaluatePromotionThreats() | 0,
  };
}

interface GameOutcome {
  /** 1 = SENTE win, 0 = GOTE win, 0.5 = draw. */
  resultForSente: number;
  reason: string;
  plies: number;
  samples: Omit<Sample, 'result'>[];
}

function playSelfPlayGame(config: TuneConfig, gameIndex: number, baselineWeights: WeightVector): GameOutcome {
  const k = InitialPositionImproved.createInitialPosition();
  k.setTeban(SENTE);

  const rng = new Xorshift32(mixSeed(config.seed, gameIndex));
  const samples: Omit<Sample, 'result'>[] = [];

  // Fixed curated opening line for diversity (both sides share the same policy).
  for (let ply = 0; ply < config.openingPlies; ply++) {
    const moves = GenerateMovesImproved.generateLegalMoves(k);
    if (moves.length === 0) break;
    const selected = pickCuratedOpeningMove(k, moves, rng);
    selected.capture = k.get(selected.to);
    k.move(selected);
    k.toggleTeban();
  }

  const aiSente = new ShogiAIImprovedV20();
  const aiGote = new ShogiAIImprovedV20();
  const repetitionCount = new Map<number, number>();

  const finish = (resultForSente: number, reason: string, plies: number): GameOutcome => ({
    resultForSente,
    reason,
    plies,
    samples,
  });

  for (let ply = config.openingPlies; ply < config.maxPlies; ply++) {
    repetitionCount.set(k.HashVal, (repetitionCount.get(k.HashVal) ?? 0) + 1);
    if ((repetitionCount.get(k.HashVal) ?? 0) >= 4) return finish(0.5, 'repetition', ply);

    const side = k.teban;
    const ai = side === SENTE ? aiSente : aiGote;

    const move = ai.getNextTe(k, ply, {
      difficulty: 'medium',
      maxDepth: config.maxDepth,
      maxTimeMs: config.maxTimeMs,
      quiescenceDepthMax: config.quiescenceDepthMax,
      evaluationMode: 'v3',
    });

    if (!move) {
      const legalMoves = GenerateMovesImproved.generateLegalMoves(k);
      if (legalMoves.length > 0) return finish(side === SENTE ? 0 : 1, 'timeout', ply);
      const inCheck = GenerateMovesImproved.isKingInCheck(k, side);
      if (inCheck) return finish(side === SENTE ? 0 : 1, 'checkmate', ply);
      return finish(0.5, 'stalemate', ply);
    }

    k.move(move);
    k.toggleTeban();

    // Sample quiet-ish positions: past the fixed opening, not in check, not mate-blowout.
    const plyAfterMove = ply + 1;
    if (plyAfterMove >= config.minPly && plyAfterMove % config.sampleEvery === 0) {
      if (!GenerateMovesImproved.isKingInCheck(k, k.teban)) {
        const sample = extractSample(k);
        // Sanity: the reconstruction must match evaluateV3() with the active weights.
        const reconstructed = evalSample({ ...sample, result: 0 }, baselineWeights);
        const direct = k.evaluateV3();
        if (reconstructed !== direct) {
          throw new Error(
            `evaluateV3 reconstruction mismatch at game ${gameIndex} ply ${plyAfterMove}: ${reconstructed} !== ${direct}`
          );
        }
        if (Math.abs(reconstructed) <= config.evalClamp) samples.push(sample);
      }
    }
  }

  return finish(0.5, 'maxPlies', config.maxPlies);
}

// ---------------------------------------------------------------------------
// Optimization
// ---------------------------------------------------------------------------

function fitSigmoidK(samples: Sample[], w: WeightVector): number {
  let bestK = 400;
  let bestErr = Number.POSITIVE_INFINITY;
  // Coarse scan, then refine around the best K.
  // The scan is intentionally capped: as K -> infinity the sigmoid flattens to "always predict 0.5",
  // which can have a (slightly) lower MSE than any finite K when the eval->result signal is weak.
  // An uncapped fit would then run off to a huge K and destroy the tuning gradient.
  for (let k = 50; k <= 2000; k += 25) {
    const err = meanSquaredError(samples, w, k);
    if (err < bestErr) {
      bestErr = err;
      bestK = k;
    }
  }
  // NOTE: freeze the refinement bounds up front — the loop updates `bestK`, and using it in the
  // loop condition would turn this into an unbounded hill-climb past the cap above.
  const lo = Math.max(10, bestK - 24);
  const hi = bestK + 24;
  for (let k = lo; k <= hi; k += 1) {
    const err = meanSquaredError(samples, w, k);
    if (err < bestErr) {
      bestErr = err;
      bestK = k;
    }
  }
  return bestK;
}

function coordinateDescent(
  samples: Sample[],
  initial: WeightVector,
  k: number,
  passes: number,
  quiet: boolean
): { weights: WeightVector; error: number } {
  const weights = initial.slice();
  const deltas = [8, -8, 16, -16];
  const minWeight = 0;
  const maxWeight = 384; // 3.0 in fixed point; generous but keeps Int16 semantics sane.

  let currentError = meanSquaredError(samples, weights, k);

  for (let pass = 1; pass <= passes; pass++) {
    let improvedInPass = false;

    for (let i = 0; i < weights.length; i++) {
      const original = weights[i];
      let bestValue = original;
      let bestError = currentError;

      for (const delta of deltas) {
        const candidate = Math.min(maxWeight, Math.max(minWeight, original + delta));
        if (candidate === original) continue;
        weights[i] = candidate;
        const err = meanSquaredError(samples, weights, k);
        if (err < bestError - 1e-12) {
          bestError = err;
          bestValue = candidate;
        }
      }

      weights[i] = bestValue;
      if (bestValue !== original) {
        currentError = bestError;
        improvedInPass = true;
        if (!quiet) {
          const group = GROUP_NAMES[Math.floor(i / 4)];
          console.log(
            `  pass ${pass}: ${group}[${i % 4}] ${original} -> ${bestValue} (mse=${currentError.toFixed(6)})`
          );
        }
      }
    }

    if (!quiet) console.log(`[tune] pass ${pass} done: mse=${currentError.toFixed(6)}`);
    if (!improvedInPass) break;
  }

  return { weights, error: currentError };
}

function weightsToVector(w: ReturnType<typeof KyokumenImproved.getEvalV3Weights>): WeightVector {
  return [...w.psqt, ...w.castle, ...w.fileDefense, ...w.promoThreat];
}

function vectorToGroups(w: WeightVector): Record<(typeof GROUP_NAMES)[number], number[]> {
  return {
    psqt: w.slice(0, 4),
    castle: w.slice(4, 8),
    fileDefense: w.slice(8, 12),
    promoThreat: w.slice(12, 16),
  };
}

function formatEnvVar(w: WeightVector): string {
  const g = vectorToGroups(w);
  return `psqt=${g.psqt.join(',')};castle=${g.castle.join(',')};fileDefense=${g.fileDefense.join(',')};promoThreat=${g.promoThreat.join(',')}`;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseIntArg(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function parseArgs(argv: string[]): TuneConfig {
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

  return {
    games: parseIntArg(argMap.get('games'), 40),
    maxPlies: parseIntArg(argMap.get('maxPlies'), 160),
    maxTimeMs: parseIntArg(argMap.get('maxTimeMs'), 70),
    maxDepth: parseIntArg(argMap.get('maxDepth'), 5),
    quiescenceDepthMax: parseIntArg(argMap.get('qDepth'), 6),
    openingPlies: parseIntArg(argMap.get('openingPlies'), 8),
    minPly: parseIntArg(argMap.get('minPly'), 6),
    sampleEvery: Math.max(1, parseIntArg(argMap.get('sampleEvery'), 2)),
    passes: parseIntArg(argMap.get('passes'), 2),
    seed: parseIntArg(argMap.get('seed'), 1),
    evalClamp: parseIntArg(argMap.get('evalClamp'), 6000),
    quiet: argMap.get('quiet') === 'true',
    dumpSamples: argMap.get('dumpSamples') ?? '',
    fromSamples: argMap.get('fromSamples') ?? '',
  };
}

function main(): void {
  const config = parseArgs(process.argv.slice(2));
  console.log('[shogi-texel-tune] config:', config);

  const baseline = weightsToVector(KyokumenImproved.getEvalV3Weights());
  console.log('[shogi-texel-tune] baseline weights:', vectorToGroups(baseline));

  // 1) Data generation via self-play (or reload of a previously dumped dataset).
  let samples: Sample[] = [];
  if (config.fromSamples) {
    samples = JSON.parse(fs.readFileSync(config.fromSamples, 'utf8')) as Sample[];
    console.log(`[shogi-texel-tune] loaded ${samples.length} positions from ${config.fromSamples}`);
  } else {
    let decisive = 0;
    const startedAt = Date.now();

    for (let gameIndex = 0; gameIndex < config.games; gameIndex++) {
      const outcome = playSelfPlayGame(config, gameIndex, baseline);
      if (outcome.resultForSente !== 0.5) decisive++;
      for (const s of outcome.samples) samples.push({ ...s, result: outcome.resultForSente });
      if (!config.quiet) {
        console.log(
          `[game ${gameIndex + 1}/${config.games}] result=${outcome.resultForSente} (${outcome.reason}) ` +
            `plies=${outcome.plies} samples=${outcome.samples.length} total=${samples.length} ` +
            `elapsed=${((Date.now() - startedAt) / 1000).toFixed(0)}s`
        );
      }
    }

    console.log(
      `[shogi-texel-tune] dataset: ${samples.length} positions from ${config.games} games ` +
        `(${decisive} decisive, ${config.games - decisive} draws)`
    );
    if (samples.length < 200 || decisive === 0) {
      console.error('[shogi-texel-tune] not enough data to tune (need decisive games); aborting.');
      process.exitCode = 1;
      return;
    }

    if (config.dumpSamples) {
      fs.writeFileSync(config.dumpSamples, JSON.stringify(samples));
      console.log(`[shogi-texel-tune] dumped dataset to ${config.dumpSamples}`);
    }
  }

  // 2) Fit sigmoid scale K on the baseline weights.
  const k = fitSigmoidK(samples, baseline);
  const baselineError = meanSquaredError(samples, baseline, k);
  // Reference: a constant "predict 0.5" model. If the baseline mse is not meaningfully below this,
  // the eval carries little outcome signal in this dataset and tuning deltas are mostly noise.
  let flatError = 0;
  for (const s of samples) flatError += (s.result - 0.5) * (s.result - 0.5);
  flatError /= samples.length;
  console.log(
    `[shogi-texel-tune] fitted K=${k} baseline mse=${baselineError.toFixed(6)} ` +
      `(constant-0.5 reference mse=${flatError.toFixed(6)})`
  );

  // 3) Coordinate descent over the 16 weights.
  const { weights: tuned, error: tunedError } = coordinateDescent(
    samples,
    baseline,
    k,
    config.passes,
    config.quiet
  );

  console.log('\n[shogi-texel-tune] === results ===');
  console.log('K:', k);
  console.log('baseline mse:', baselineError.toFixed(6));
  console.log('tuned    mse:', tunedError.toFixed(6));
  console.log('baseline weights:', vectorToGroups(baseline));
  console.log('tuned    weights:', vectorToGroups(tuned));
  console.log('\nValidate with a direct tuned-vs-current match (tuned weights injected via env var):');
  console.log(`  SHOGI_EVAL_V3T_WEIGHTS="${formatEnvVar(tuned)}" \\`);
  console.log(
    '  npm run shogi:match -- --engineA v20 --engineB v20 --evalA v3t --evalB v3 --difficulty medium ' +
      '--games 12 --maxDepth 16 --maxTimeMs 150 --openingPlies 4 --openingMode curated --seed 45'
  );
}

main();
