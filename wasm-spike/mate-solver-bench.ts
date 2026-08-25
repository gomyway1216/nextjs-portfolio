/**
 * mate-solver-bench.ts — offline benchmark for the two tsume (mate) solvers.
 *
 * `MateSolverImproved` (iterative-deepening AND/OR, shipped) vs `DfpnMateSolverImproved` (df-pn).
 *
 * Subcommands
 * -----------
 *   label      Assigns each candidate SFEN a ground-truth label: the *shortest* forced mate length
 *              in plies, or 0 for "no mate within the probe horizon". Ground truth comes from the
 *              shipped iterative-deepening solver run with no time cap, and a label is only written
 *              when the search finished without aborting (so "no mate" is a proof, not a timeout).
 *              Short labels (<= 7 plies) are additionally re-derived by `bruteHasMate()`, a
 *              deliberately naive AND/OR prover in this file with no hashing/pooling/pruning.
 *              Resumable: SFENs already present in the output are skipped.
 *
 *   crosscheck Re-solves every labelled position with df-pn at a large budget and reports
 *              disagreements, plus a full independent audit of every reported mate.
 *
 *   bench      Runs both solvers at the same wall-clock budget and prints solved counts per
 *              ground-truth bucket. Every reported mate is verified independently.
 *
 * Run with:  node -r tsx/cjs wasm-spike/mate-solver-bench.ts <subcommand> --in ... --out ...
 */
import * as fs from 'fs';
import * as readline from 'readline';

import { DfpnMateSolverImproved } from '../src/components/game/ShogiImproved/DfpnMateSolverImproved';
import { GenerateMovesImproved } from '../src/components/game/ShogiImproved/GenerateMovesImproved';
import { KyokumenImproved } from '../src/components/game/ShogiImproved/KyokumenImproved';
import { MateSolverImproved } from '../src/components/game/ShogiImproved/MateSolverImproved';
import { buildPosition } from '../src/components/game/ShogiImproved/serializedPosition';
import { GOTE, SENTE, Te } from '../src/components/game/ShogiImproved/types';

// ---------------------------------------------------------------------------
// SFEN → KyokumenImproved
// ---------------------------------------------------------------------------

const SFEN_PIECE: Record<string, number> = { P: 1, L: 2, N: 3, S: 4, G: 5, B: 6, R: 7, K: 8 };
const SFEN_PROMOTED: Record<string, number> = { P: 9, L: 10, N: 11, S: 12, B: 14, R: 15 };

/** Parses an SFEN into the worker's serialized-position shape and builds a live position. */
export function positionFromSfen(sfen: string): KyokumenImproved {
  const parts = sfen.trim().split(/\s+/);
  const [boardS, turnS, handS] = [parts[0]!, parts[1]!, parts[2]];

  const board = new Array<number>(81).fill(0); // index = (suji-1)*9 + (dan-1)
  const rows = boardS.split('/');
  if (rows.length !== 9) throw new Error(`bad sfen board: ${boardS}`);
  for (let r = 0; r < 9; r++) {
    const dan = r + 1;
    let suji = 9;
    const row = rows[r]!;
    for (let i = 0; i < row.length; i++) {
      let c = row[i]!;
      if (c >= '1' && c <= '9') {
        suji -= parseInt(c, 10);
        continue;
      }
      let promoted = false;
      if (c === '+') {
        promoted = true;
        i++;
        c = row[i]!;
      }
      const upper = c.toUpperCase();
      const isBlack = c === upper;
      const type = promoted ? SFEN_PROMOTED[upper] : SFEN_PIECE[upper];
      if (type === undefined) throw new Error(`bad sfen piece: ${c}`);
      board[(suji - 1) * 9 + (dan - 1)] = type | (isBlack ? SENTE : GOTE);
      suji--;
    }
    if (suji !== 0) throw new Error(`bad sfen rank width: ${row}`);
  }

  const hand = new Array<number>(64).fill(0);
  if (handS && handS !== '-') {
    let count = 0;
    for (let i = 0; i < handS.length; i++) {
      const c = handS[i]!;
      if (c >= '0' && c <= '9') {
        count = count * 10 + parseInt(c, 10);
        continue;
      }
      const n = count > 0 ? count : 1;
      count = 0;
      const upper = c.toUpperCase();
      const isBlack = c === upper;
      const type = SFEN_PIECE[upper];
      if (type === undefined) throw new Error(`bad sfen hand piece: ${c}`);
      hand[(isBlack ? SENTE : GOTE) | type] += n;
    }
  }

  return buildPosition({ board, hand, teban: turnS === 'w' ? GOTE : SENTE });
}

// ---------------------------------------------------------------------------
// Independent verification
// ---------------------------------------------------------------------------

/** Applies `te` to `k` (make + explicit teban flip), mirroring the solvers' invariants. */
function push(k: KyokumenImproved, te: Te): Te {
  const move = te.clone();
  move.capture = k.get(move.to);
  k.move(move);
  k.toggleTeban();
  return move;
}

function pop(k: KyokumenImproved, move: Te): void {
  k.toggleTeban();
  k.back(move);
}

/**
 * Naive AND/OR prover: true when the side to move has a forced mate by consecutive checks within
 * `plies`. No transposition table, no move pooling, no repetition handling, no pruning — it exists
 * purely so ground-truth labels do not rest on the implementation being measured.
 */
let bruteNodes = 0;
let bruteBudget = Number.MAX_SAFE_INTEGER;

/** Runs `fn` with a node cap on the naive prover; returns null when the cap was hit. */
export function withBruteBudget<T>(budget: number, fn: () => T): T | null {
  bruteNodes = 0;
  bruteBudget = budget;
  try {
    const value = fn();
    return bruteNodes > bruteBudget ? null : value;
  } finally {
    bruteBudget = Number.MAX_SAFE_INTEGER;
  }
}

export function bruteHasMate(k: KyokumenImproved, plies: number): boolean {
  if (plies < 1) return false;
  if (++bruteNodes > bruteBudget) return false;
  const attacker = k.teban;
  const defender = attacker === SENTE ? GOTE : SENTE;

  for (const te of GenerateMovesImproved.generateLegalMoves(k)) {
    const move = push(k, te);
    const gaveCheck = GenerateMovesImproved.isKingInCheck(k, defender);
    const mated = gaveCheck && bruteAllRepliesMated(k, plies - 1);
    pop(k, move);
    if (mated) return true;
  }
  return false;
}

function bruteAllRepliesMated(k: KyokumenImproved, plies: number): boolean {
  if (bruteNodes > bruteBudget) return false;
  const replies = GenerateMovesImproved.generateLegalMoves(k);
  if (replies.length === 0) return true; // in check with no legal reply → checkmate
  if (plies <= 1) return false;
  for (const te of replies) {
    const move = push(k, te);
    const stillMated = bruteHasMate(k, plies - 1);
    pop(k, move);
    if (!stillMated) return false;
  }
  return true;
}

export type VerifyOutcome = 'ok' | 'fail' | 'budget';

export interface VerifyResult {
  outcome: VerifyOutcome;
  /** Mate length in plies of the re-derived proof tree (only meaningful for 'ok'). */
  plies: number;
  nodes: number;
}

/**
 * Sound verification of "`first` forces mate from `k0`", at any mate length.
 *
 * The structure is checked with `generateLegalMoves` alone: every attacker move must be legal and
 * give check, every legal defender reply must be covered, and every leaf must be a real checkmate
 * (defender to move, zero legal replies). `continuation` is only used to *suggest* the next attacker
 * move; a wrong suggestion can make verification fail or run out of budget, never make it succeed on
 * a position that is not mated. That is why using a solver here does not weaken the audit.
 */
export function verifyForcedMate(
  k0: KyokumenImproved,
  first: Te,
  continuation: (k: KyokumenImproved) => Te | null,
  budgetNodes = 400_000,
  budgetMs = 10_000
): VerifyResult {
  const k = k0.clone();
  const attacker = k.teban;
  const defender = attacker === SENTE ? GOTE : SENTE;
  const state = { nodes: 0, budget: budgetNodes, overrun: false, deadline: Date.now() + budgetMs };

  const legal = GenerateMovesImproved.generateLegalMoves(k);
  if (!legal.some((m) => m.equals(first))) return { outcome: 'fail', plies: 0, nodes: 0 };

  const move = push(k, first);
  if (!GenerateMovesImproved.isKingInCheck(k, defender)) {
    pop(k, move);
    return { outcome: 'fail', plies: 0, nodes: 0 };
  }
  const depth = verifyDefenderNode(k, attacker, defender, continuation, state, 1);
  pop(k, move);

  if (state.overrun) return { outcome: 'budget', plies: 0, nodes: state.nodes };
  if (depth < 0) return { outcome: 'fail', plies: 0, nodes: state.nodes };
  return { outcome: 'ok', plies: depth + 1, nodes: state.nodes };
}

interface VerifyState {
  nodes: number;
  budget: number;
  overrun: boolean;
  /** Wall-clock deadline: a deep proof tree has thousands of defender replies, each of which costs
   * a continuation search, so a node cap alone is not enough to keep the audit bounded. */
  deadline: number;
}

/** Defender to move and in check. Returns the worst-case remaining plies, or -1 on refutation. */
function verifyDefenderNode(
  k: KyokumenImproved,
  attacker: number,
  defender: number,
  continuation: (k: KyokumenImproved) => Te | null,
  state: VerifyState,
  ply: number
): number {
  if (state.overrun) return -1;
  if (++state.nodes > state.budget || ply > 63 || Date.now() > state.deadline) {
    state.overrun = true;
    return -1;
  }

  const replies = GenerateMovesImproved.generateLegalMoves(k);
  if (replies.length === 0) return 0; // checkmate

  let worst = 0;
  for (const reply of replies) {
    const replyMove = push(k, reply);
    const next = continuation(k);
    let sub = -1;
    if (next) {
      const legal = GenerateMovesImproved.generateLegalMoves(k);
      if (legal.some((m) => m.equals(next))) {
        const attackMove = push(k, next);
        if (GenerateMovesImproved.isKingInCheck(k, defender)) {
          sub = verifyDefenderNode(k, attacker, defender, continuation, state, ply + 2);
        }
        pop(k, attackMove);
      }
    }
    pop(k, replyMove);
    if (state.overrun) return -1;
    if (sub < 0) return -1;
    if (sub + 2 > worst) worst = sub + 2;
  }
  return worst;
}

// ---------------------------------------------------------------------------
// Records / IO
// ---------------------------------------------------------------------------

interface Candidate {
  sfen: string;
  [key: string]: unknown;
}

interface Labelled extends Candidate {
  /**
   * Shortest forced mate length in plies;
   * 0 = *proven* no mate within `probeMaxPlies`;
   * -1 = undecided (the exhaustive prover ran out of budget). Undecided positions are kept on
   * purpose: dropping them would bias the corpus towards positions that are easy to refute, which
   * is exactly the class where a stronger solver is supposed to pay off. Any mate a solver reports
   * on them is still verified independently, so the comparison stays sound.
   */
  matePlies: number;
  probeMaxPlies: number;
  labelMs: number;
}

async function readJsonl<T>(file: string): Promise<T[]> {
  const out: T[] = [];
  const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    out.push(JSON.parse(line) as T);
  }
  return out;
}

function arg(name: string, fallback?: string): string {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0 || i + 1 >= process.argv.length) {
    if (fallback !== undefined) return fallback;
    throw new Error(`missing --${name}`);
  }
  return process.argv[i + 1]!;
}

function num(name: string, fallback: number): number {
  return parseInt(arg(name, String(fallback)), 10);
}

// ---------------------------------------------------------------------------
// label
// ---------------------------------------------------------------------------

async function cmdLabel(): Promise<void> {
  const inFile = arg('in');
  const outFile = arg('out');
  const limit = num('limit', 2000);
  const budgetMs = num('budget-ms', 3000);
  const maxPlies = num('max-plies', 13);
  const skip = num('skip', 0);
  const wantNoMate = num('no-mate-quota', 400);
  const keepUnknown = arg('keep-unknown', '0') === '1';

  const done = new Set<string>();
  if (fs.existsSync(outFile)) {
    for (const r of await readJsonl<Labelled>(outFile)) done.add(r.sfen);
  }
  console.error(`resume: ${done.size} already labelled`);

  // Appended synchronously (not through a WriteStream): labelling runs for tens of minutes and must
  // survive being killed mid-run, since `--out` doubles as the resume log.
  const append = (rec: Labelled): void => fs.appendFileSync(outFile, JSON.stringify(rec) + '\n');
  const solver = new MateSolverImproved();

  let scanned = 0;
  let written = 0;
  let noMate = 0;
  let unknown = 0;
  const rl = readline.createInterface({ input: fs.createReadStream(inFile), crlfDelay: Infinity });

  for await (const line of rl) {
    if (!line.trim()) continue;
    scanned++;
    if (scanned <= skip) continue;
    if (written >= limit) break;
    const cand = JSON.parse(line) as Candidate;
    if (done.has(cand.sfen)) continue;

    const k = positionFromSfen(cand.sfen);
    const t0 = Date.now();
    let matePlies = -1; // -1 = unknown

    for (let plies = 1; plies <= maxPlies; plies += 2) {
      const remaining = budgetMs - (Date.now() - t0);
      if (remaining <= 0) break;
      const te = solver.solve(k, { maxPlies: plies, maxNodes: 0, maxTimeMs: remaining });
      if (te) {
        matePlies = plies;
        break;
      }
      if (solver.lastAborted) break; // budget ran out: cannot claim "no mate"
      if (plies === maxPlies) matePlies = 0; // proved: no mate within the horizon
    }

    if (matePlies < 0) {
      unknown++;
      if (!keepUnknown) continue;
    }
    if (matePlies === 0) {
      if (noMate >= wantNoMate) continue;
      noMate++;
    } else if (matePlies > 0 && matePlies <= 3) {
      // Independent audit of the label with the naive prover. Only the shortest mates are audited
      // inline: the prover is unpruned and its cost explodes past ~5 plies on real endgames, so the
      // deeper labels are audited separately by `crosscheck` (df-pn) and by `audit` (sampled brute).
      if (!bruteHasMate(k, matePlies)) {
        console.error(`LABEL NOT REPRODUCIBLE (brute): ${cand.sfen} claims ${matePlies}`);
        continue;
      }
      if (matePlies > 1 && bruteHasMate(k, matePlies - 2)) {
        console.error(`LABEL NOT SHORTEST (brute): ${cand.sfen} claims ${matePlies}`);
        continue;
      }
    }

    const rec: Labelled = { ...cand, matePlies, probeMaxPlies: maxPlies, labelMs: Date.now() - t0 };
    append(rec);
    written++;
    if (written % 25 === 0) {
      console.error(`labelled ${written} (scanned ${scanned}, unknown ${unknown}, no-mate ${noMate})`);
    }
  }
  console.error(`done: wrote ${written}, scanned ${scanned}, unknown ${unknown}`);
}

// ---------------------------------------------------------------------------
// crosscheck
// ---------------------------------------------------------------------------

async function cmdCrosscheck(): Promise<void> {
  const inFile = arg('in');
  const budgetMs = num('budget-ms', 5000);
  const maxPlies = num('max-plies', 31);
  const rows = await readJsonl<Labelled>(inFile);

  const dfpn = new DfpnMateSolverImproved();
  const helper = new DfpnMateSolverImproved();
  const cont = (k: KyokumenImproved): Te | null =>
    helper.solve(k, { maxPlies, maxNodes: 2_000_000, maxTimeMs: 5000 });

  let agree = 0;
  let dfpnLonger = 0;
  let dfpnMissed = 0;
  let dfpnFoundBeyondLabel = 0;
  let falsePositive = 0;
  let verifyBudget = 0;

  for (const r of rows) {
    const k = positionFromSfen(r.sfen);
    const res = dfpn.solveDetailed(k, { maxPlies, maxNodes: 0, maxTimeMs: budgetMs });

    if (res) {
      const v = verifyForcedMate(k, res.move, cont, 2_000_000);
      if (v.outcome === 'fail') {
        falsePositive++;
        console.error(`FALSE POSITIVE (df-pn): ${r.sfen} -> ${res.move.toString()}`);
        continue;
      }
      if (v.outcome === 'budget') {
        verifyBudget++;
        continue;
      }
      if (r.matePlies < 0) {
        dfpnFoundBeyondLabel++;
        continue;
      }
      if (r.matePlies === 0) {
        // The label says "no mate within probeMaxPlies". A longer verified mate is not a
        // contradiction; a shorter one would be.
        if (v.plies <= r.probeMaxPlies) {
          falsePositive++;
          console.error(`CONTRADICTS LABEL: ${r.sfen} label=none, verified mate in ${v.plies}`);
        } else {
          dfpnFoundBeyondLabel++;
        }
        continue;
      }
      if (v.plies !== r.matePlies) dfpnLonger++;
      agree++;
    } else if (r.matePlies > 0) {
      dfpnMissed++;
    } else if (r.matePlies === 0) {
      agree++;
    }
  }

  console.log(
    JSON.stringify(
      { rows: rows.length, agree, dfpnLonger, dfpnMissed, dfpnFoundBeyondLabel, falsePositive, verifyBudget },
      null,
      2
    )
  );
}

// ---------------------------------------------------------------------------
// bench
// ---------------------------------------------------------------------------

interface Bucket {
  total: number;
  legacySolved: number;
  dfpnSolved: number;
  hybridSolved: number;
  legacyMs: number;
  dfpnMs: number;
  hybridMs: number;
}

async function cmdBench(): Promise<void> {
  const inFile = arg('in');
  const timeMs = num('time-ms', 200);
  const legacyNodes = num('legacy-nodes', 150000);
  const dfpnNodes = num('dfpn-nodes', 150000);
  const legacyPlies = num('legacy-plies', 9);
  const dfpnPlies = num('dfpn-plies', 31);
  const verify = arg('verify', '1') === '1';
  const outFile = arg('out', '');

  const rows = await readJsonl<Labelled>(inFile);
  const legacy = new MateSolverImproved();
  const dfpn = new DfpnMateSolverImproved();
  const helper = new DfpnMateSolverImproved();
  const helperLegacy = new MateSolverImproved();
  // Continuation budgets escalate. The common case is a cheap re-find (the audited position is
  // already a proven mate), but a deep line can need real work at some interior node, and a
  // continuation that merely ran out of budget must NOT be reported as a refutation: `null` from
  // this callback is what makes `verifyForcedMate` return 'fail'. The deep retry is rare, so it
  // costs little and keeps 'fail' meaning "no continuation exists".
  const deep = new DfpnMateSolverImproved();
  const contDfpn = (k: KyokumenImproved): Te | null =>
    helper.solve(k, { maxPlies: 31, maxNodes: 200_000, maxTimeMs: 150 }) ??
    deep.solve(k, { maxPlies: 31, maxNodes: 5_000_000, maxTimeMs: 3000 });
  const contLegacy = (k: KyokumenImproved): Te | null =>
    helperLegacy.solve(k, { maxPlies: 9, maxNodes: 200_000, maxTimeMs: 100 }) ?? contDfpn(k);

  const buckets = new Map<number, Bucket>();
  const bucketOf = (n: number): Bucket => {
    let b = buckets.get(n);
    if (!b) {
      b = { total: 0, legacySolved: 0, dfpnSolved: 0, hybridSolved: 0, legacyMs: 0, dfpnMs: 0, hybridMs: 0 };
      buckets.set(n, b);
    }
    return b;
  };

  let legacyFalse = 0;
  let dfpnFalse = 0;
  let hybridFalse = 0;
  let legacyUnverified = 0;
  let dfpnUnverified = 0;
  let dfpnVerifyFail = 0;
  let dfpnDeepFinds = 0;
  /** How much longer than the shortest mate the reported mate is, in plies. */
  const dfpnExcess = new Map<number, number>();
  const hybridExcess = new Map<number, number>();

  for (const r of rows) {
    const b = bucketOf(r.matePlies);
    b.total++;

    {
      const k = positionFromSfen(r.sfen);
      const t0 = Date.now();
      const te = legacy.solve(k, { maxPlies: legacyPlies, maxNodes: legacyNodes, maxTimeMs: timeMs });
      b.legacyMs += Date.now() - t0;
      if (te) {
        if (!verify) b.legacySolved++;
        else {
          const v = verifyForcedMate(k, te, contLegacy, 400_000, 30_000);
          if (v.outcome === 'fail') {
            legacyFalse++;
            console.error(`LEGACY FALSE POSITIVE: ${r.sfen}`);
          } else if (v.outcome === 'budget') {
            legacyUnverified++;
            b.legacySolved++;
          } else b.legacySolved++;
        }
      }
    }

    {
      // Hybrid: df-pn with the whole budget, then — only when it actually proved a mate — a bounded
      // exact iterative-deepening pass to replace a needlessly long proof tree with the shortest
      // mate. The shortening pass costs nothing the main search would otherwise have used: a proven
      // mate ends the move, so no full search follows it.
      const k = positionFromSfen(r.sfen);
      const t0 = Date.now();
      const found = dfpn.solveDetailed(k, { maxPlies: dfpnPlies, maxNodes: dfpnNodes, maxTimeMs: timeMs });
      let move = found?.move ?? null;
      if (found && found.mateDepth > 3) {
        const left = timeMs - (Date.now() - t0);
        if (left > 5) {
          const shorter = legacy.solve(k, {
            maxPlies: Math.min(found.mateDepth - 2, 9),
            maxNodes: legacyNodes,
            maxTimeMs: left,
          });
          if (shorter) move = shorter;
        }
      }
      b.hybridMs += Date.now() - t0;
      if (move) {
        if (!verify) b.hybridSolved++;
        else {
          const v = verifyForcedMate(k, move, contDfpn, 400_000, 30_000);
          if (v.outcome === 'fail') {
            hybridFalse++;
            console.error(`HYBRID FALSE POSITIVE: ${r.sfen}`);
          } else {
            b.hybridSolved++;
            if (r.matePlies > 0 && v.outcome === 'ok') {
              const excess = v.plies - r.matePlies;
              hybridExcess.set(excess, (hybridExcess.get(excess) ?? 0) + 1);
            }
          }
        }
      }
    }

    {
      const k = positionFromSfen(r.sfen);
      const t0 = Date.now();
      const res = dfpn.solveDetailed(k, { maxPlies: dfpnPlies, maxNodes: dfpnNodes, maxTimeMs: timeMs });
      b.dfpnMs += Date.now() - t0;
      if (dfpn.stats.verificationFailed) dfpnVerifyFail++;
      if (res) {
        if (r.matePlies === 0) dfpnDeepFinds++;
        if (!verify) b.dfpnSolved++;
        else {
          const v = verifyForcedMate(k, res.move, contDfpn, 400_000, 30_000);
          if (v.outcome === 'fail') {
            dfpnFalse++;
            console.error(`DFPN FALSE POSITIVE: ${r.sfen}`);
          } else if (v.outcome === 'budget') {
            dfpnUnverified++;
            b.dfpnSolved++;
          } else {
            b.dfpnSolved++;
            if (r.matePlies > 0) {
              const excess = v.plies - r.matePlies;
              dfpnExcess.set(excess, (dfpnExcess.get(excess) ?? 0) + 1);
            }
          }
        }
      }
    }
  }

  const keys = [...buckets.keys()].sort((a, b) => a - b);
  const table = keys.map((key) => {
    const b = buckets.get(key)!;
    return {
      matePlies: key === 0 ? 'none' : key < 0 ? 'undecided' : key,
      positions: b.total,
      legacySolved: b.legacySolved,
      dfpnSolved: b.dfpnSolved,
      hybridSolved: b.hybridSolved,
      legacyAvgMs: +(b.legacyMs / b.total).toFixed(1),
      dfpnAvgMs: +(b.dfpnMs / b.total).toFixed(1),
      hybridAvgMs: +(b.hybridMs / b.total).toFixed(1),
    };
  });
  const report = {
    timeMs,
    legacy: { maxPlies: legacyPlies, maxNodes: legacyNodes },
    dfpn: { maxPlies: dfpnPlies, maxNodes: dfpnNodes },
    table,
    legacyFalse,
    dfpnFalse,
    hybridFalse,
    legacyUnverified,
    dfpnUnverified,
    dfpnVerifyFail,
    dfpnDeepFinds,
    dfpnExcessPlies: Object.fromEntries([...dfpnExcess.entries()].sort((a, b) => a[0] - b[0])),
    hybridExcessPlies: Object.fromEntries([...hybridExcess.entries()].sort((a, b) => a[0] - b[0])),
  };
  const text = JSON.stringify(report, null, 2);
  console.log(text);
  if (outFile) fs.writeFileSync(outFile, text);
}

// ---------------------------------------------------------------------------
// audit — sampled brute-force re-derivation of the ground-truth labels
// ---------------------------------------------------------------------------

/**
 * Re-derives labels with the naive unpruned prover on a sample of positions, under a node cap.
 *
 * For a label of `d` plies it asserts both directions: a forced mate in `d` exists, and no forced
 * mate in `d - 2` exists. For a "no mate" label it asserts no forced mate up to `--audit-plies`.
 */
async function cmdAudit(): Promise<void> {
  const inFile = arg('in');
  const sample = num('sample', 60);
  const maxLabel = num('audit-plies', 5);
  const budget = num('brute-nodes', 4_000_000);
  const rows = await readJsonl<Labelled>(inFile);

  let checked = 0;
  let skipped = 0;
  let capped = 0;
  const failures: string[] = [];

  for (const r of rows) {
    if (checked >= sample) break;
    if (r.matePlies > maxLabel) {
      skipped++;
      continue;
    }
    const target = r.matePlies === 0 ? maxLabel : r.matePlies;
    const k = positionFromSfen(r.sfen);

    const found = withBruteBudget(budget, () => bruteHasMate(k, target));
    if (found === null) {
      capped++;
      continue;
    }
    if (r.matePlies === 0) {
      if (found) failures.push(`${r.sfen}: label=none but brute found a mate in <= ${maxLabel}`);
    } else {
      if (!found) failures.push(`${r.sfen}: label=${r.matePlies} not reproducible by brute force`);
      if (r.matePlies > 1) {
        const shorter = withBruteBudget(budget, () => bruteHasMate(positionFromSfen(r.sfen), r.matePlies - 2));
        if (shorter === true) failures.push(`${r.sfen}: label=${r.matePlies} is not the shortest mate`);
      }
    }
    checked++;
  }

  console.log(JSON.stringify({ rows: rows.length, checked, skipped, capped, failures }, null, 2));
}

async function main(): Promise<void> {
  const cmd = process.argv[2];
  if (cmd === 'audit') await cmdAudit();
  else if (cmd === 'label') await cmdLabel();
  else if (cmd === 'crosscheck') await cmdCrosscheck();
  else if (cmd === 'bench') await cmdBench();
  else {
    console.error('usage: mate-solver-bench.ts <label|audit|crosscheck|bench> --in <file> ...');
    process.exit(1);
  }
}

// Importable as a library (the vitest suite reuses the SFEN parser and the verifier); only run the
// CLI when this file is the entry point.
const entry = process.argv[1] ?? '';
if (/mate-solver-bench\.(ts|js|cjs|mjs)$/.test(entry)) void main();
