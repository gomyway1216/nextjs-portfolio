/**
 * Build all-legal sibling-ranking labels for positions where the shipped
 * browser NNUE search disagrees with the existing strong fixed-depth label.
 *
 * This is a research-data builder only. It never writes or replaces live
 * weights. The output JSONL uses the existing `shogi-sibling-v1` schema so a
 * later trainer can consume it without a bespoke projection. Every legal root
 * move is applied, then its child position is independently searched with
 * MultiPV=1 and a fresh search-state reset. Searching the child rather than
 * using root `searchmoves` preserves rules-complete optional non-promotions
 * that some optimized USI root generators omit. The receipt binds every
 * executable/data input and the exact output bytes.
 *
 * Example (small smoke):
 *   node -r tsx/cjs ml/build-browser-confusion-ranking-teacher.ts \
 *     --input ~/.codex/shogi-runs/large-scratch-806k-v1/wdl/train.teacher.wdl.jsonl \
 *     --out-dir ~/.codex/shogi-runs/browser-confusion-ranking-smoke \
 *     --source-manifest ~/.codex/shogi-runs/large-scratch-806k-v1/wdl/train.teacher.wdl.manifest.json \
 *     --engine ~/.codex/shogi-data/floodgate-teacher-assets-v1/bin/yaneuraou \
 *     --eval-dir ~/.codex/shogi-data/floodgate-teacher-assets-v1/eval/eval \
 *     --parents 1 --scan-rows 200 --browser-depth 2 --teacher-depth 2
 */

import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline';

import {
  SIBLING_SCHEMA,
  buildSiblingGroup,
  compareBytewise,
  positionKeyFromSfen,
  validateParentGroups,
  type SiblingCandidateInput,
  type SiblingRecord,
} from './sibling-data';
import {
  childSfenAfterUsi,
  positionFromSfen,
  rulesCompleteLegalMoves,
  teToUsi,
} from './shogi-sfen';
import { UsiTeacherEngine, USI_TEACHER_ENGINE_CONTRACT } from './usi-engine';
import {
  UsiFixedDepthRanksIncompleteError,
  type ParsedUsiPv,
  type UsiMultiPvResult,
} from './usi-multipv';
import {
  loadShogiWasm,
  syncWasm,
  teFromWasmKey,
  type ShogiSearchWasm,
} from '../wasm-spike/search-driver';
import { bucketsForByteLength } from '../wasm-spike/nnue-ref';

export const BROWSER_CONFUSION_RECEIPT_SCHEMA =
  'shogi-browser-confusion-ranking-teacher-receipt-v2' as const;
export const BROWSER_CONFUSION_PARENT_SCHEMA =
  'shogi-browser-confusion-ranking-parent-v1' as const;
export const BROWSER_CONFUSION_SELECTION_POLICY =
  'shipped-nnue-fixed-depth-bestmove-disagrees-with-source-teacher-v2' as const;
export const ALL_LEGAL_RESCORE_POLICY =
  'all-rules-complete-legal-child-positions-independent-fixed-depth-v1' as const;
export const INCOMPLETE_PARENT_POLICY =
  'discard-whole-parent-only-on-typed-fixed-depth-incomplete-v1' as const;

const SHA256_RE = /^[0-9a-f]{64}$/;

export interface FileIdentity {
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
}

export interface SourceTeacherRow {
  readonly sfen: string;
  readonly cp: number;
  readonly ply: number;
  readonly bestmove: string;
  readonly depth: number;
  /** Preserved when the audited source exposes real game isolation. */
  readonly game_id?: string;
  readonly position_id?: string;
}

export interface BrowserSearchResult {
  readonly bestmove: string;
  readonly score: number;
  readonly completed_depth: number;
  readonly nodes: number;
  readonly leaves: number;
}

/**
 * A typed, position-local browser search failure. Accepted browser evidence
 * still has to reach the requested depth exactly; callers may only quarantine
 * the entire source parent when this specific shortfall occurs.
 */
export class BrowserFixedDepthIncompleteError extends Error {
  readonly completedDepth: number;
  readonly requiredDepth: number;

  constructor(completedDepth: number, requiredDepth: number) {
    super(`browser fixed-depth search completed depth ${completedDepth}/${requiredDepth}`);
    this.name = 'BrowserFixedDepthIncompleteError';
    this.completedDepth = completedDepth;
    this.requiredDepth = requiredDepth;
  }
}

export interface SelectedConfusionParent {
  readonly schema: typeof BROWSER_CONFUSION_PARENT_SCHEMA;
  readonly source_line: number;
  readonly game_id: string;
  readonly parent_id: string;
  readonly position_id: string;
  readonly parent_sfen: string;
  readonly parent_ply: number;
  readonly source_teacher: Readonly<{
    cp: number;
    bestmove: string;
    depth: number;
  }>;
  readonly browser: BrowserSearchResult;
  readonly legal_moves: readonly string[];
}

export interface CandidateSearchEvidence {
  readonly move: string;
  readonly child_sfen: string;
  readonly teacher_child_cp: number;
  readonly teacher_parent_cp: number;
  readonly teacher_rank: number;
  readonly score_kind: 'cp' | 'mate';
  readonly mate?: number;
  readonly mate_sign?: 1 | -1;
  readonly completed_depth: number;
  readonly termination: 'requested-depth-complete' | 'terminal-mate-before-requested-depth';
  readonly observed_nodes: number;
  readonly pv: readonly string[];
}

export interface LabeledConfusionParent {
  readonly parent: SelectedConfusionParent;
  readonly candidates: readonly CandidateSearchEvidence[];
  readonly records: readonly SiblingRecord[];
}

export interface BrowserProbe {
  search(sfen: string, ply: number): BrowserSearchResult;
}

export interface FixedMoveTeacher {
  resetForParent(): Promise<void>;
  search(
    sfen: string,
    multipv: number,
    limit: Readonly<{ depth: number }>,
    searchmoves: readonly string[]
  ): Promise<UsiMultiPvResult>;
}

export interface BuildCoreOptions {
  readonly sourceSha256: string;
  readonly targetParents: number;
  readonly maxScanRows: number;
  readonly teacherDepth: number;
  readonly browser: BrowserProbe;
  readonly teacher: FixedMoveTeacher;
  readonly shard?: Readonly<{ index: number; total: number }>;
}

export interface BuildCoreResult {
  readonly scannedRows: number;
  readonly shardEligibleRows: number;
  readonly rejectedInvalidRows: number;
  readonly rejectedForcedRows: number;
  readonly rejectedBrowserIncompleteRows: number;
  readonly rejectedTeacherIncompleteParents: number;
  readonly browserAgreements: number;
  readonly selected: readonly LabeledConfusionParent[];
  readonly records: readonly SiblingRecord[];
}

export interface BuildReceipt {
  readonly schema: typeof BROWSER_CONFUSION_RECEIPT_SCHEMA;
  readonly status: 'research-data-only-not-deployment-authorization';
  readonly selection_policy: typeof BROWSER_CONFUSION_SELECTION_POLICY;
  readonly label_policy: typeof ALL_LEGAL_RESCORE_POLICY;
  readonly incomplete_parent_policy: typeof INCOMPLETE_PARENT_POLICY;
  readonly source: FileIdentity & {
    readonly audit_manifest: FileIdentity & {
      readonly schema: string;
      readonly declared_rows: number;
    };
    readonly scanned_rows: number;
    readonly shard_eligible_rows: number;
    readonly rejected_invalid_rows: number;
    readonly rejected_forced_rows: number;
    readonly rejected_browser_incomplete_rows: number;
    readonly rejected_teacher_incomplete_parents: number;
    readonly browser_agreements: number;
  };
  readonly browser: Readonly<{
    wasm: FileIdentity;
    weights: FileIdentity;
    scale_k: number;
    output_scale: readonly [number, number];
    fixed_depth: number;
    quiescence_depth: number;
    max_time_ms: 0;
  }>;
  readonly selection_shard: Readonly<{ index: number; total: number }>;
  readonly teacher: Readonly<{
    engine: FileIdentity;
    eval_tree: Readonly<{
      files: number;
      bytes: number;
      sha256: string;
    }>;
    fixed_depth: number;
    multipv: 1;
    search_mode: 'unrestricted-search-from-each-legal-child-position';
    reset_before_each_candidate: true;
    terminal_mate_before_requested_depth: 'accepted-by-pinned-usi-accumulator';
    candidate_order: 'utf8-bytewise-ascending';
    rank_order: 'parent-cp-descending-then-utf8-bytewise-move';
    engine_contract: typeof USI_TEACHER_ENGINE_CONTRACT;
  }>;
  readonly output: Readonly<{
    dataset: FileIdentity & {
      schema: typeof SIBLING_SCHEMA;
      parents: number;
      games: number;
      records: number;
      min_candidates: number;
      max_candidates: number;
    };
    parent_evidence: FileIdentity & {
      schema: typeof BROWSER_CONFUSION_PARENT_SCHEMA;
      records: number;
    };
  }>;
}

function sha256Bytes(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function requiredPositiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return value;
}

function requiredNonNegativeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
  return value;
}

function exactText(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() !== value || value.length === 0) {
    throw new Error(`${label} must be non-empty canonical text`);
  }
  return value;
}

export function parseSourceTeacherRow(value: unknown): SourceTeacherRow {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('source row must be an object');
  }
  const row = value as Record<string, unknown>;
  const sfen = exactText(row.sfen, 'sfen');
  const bestmove = exactText(row.bestmove, 'bestmove');
  if (!Number.isSafeInteger(row.cp)) throw new Error('cp must be a safe integer');
  const ply = requiredNonNegativeInteger(row.ply as number, 'ply');
  const depth = requiredPositiveInteger(row.depth as number, 'depth');
  const parsed = positionFromSfen(sfen);
  if (parsed.moveNumber !== ply + 1) throw new Error('SFEN move number does not match ply');
  const legalMoves = rulesCompleteLegalMoves(parsed.position).map((entry) => entry.usi);
  if (!legalMoves.includes(bestmove)) throw new Error('source bestmove is not legal');
  const gameId = row.game_id === undefined ? undefined : exactText(row.game_id, 'game_id');
  const positionId =
    row.position_id === undefined ? undefined : exactText(row.position_id, 'position_id');
  if (positionId !== undefined && positionId !== positionKeyFromSfen(sfen)) {
    throw new Error('source position_id does not match SFEN');
  }
  return {
    sfen,
    cp: row.cp as number,
    ply,
    bestmove,
    depth,
    ...(gameId === undefined ? {} : { game_id: gameId }),
    ...(positionId === undefined ? {} : { position_id: positionId }),
  };
}

function parentIdentity(sourceSha256: string, sourceLine: number, row: SourceTeacherRow) {
  if (!SHA256_RE.test(sourceSha256)) throw new Error('sourceSha256 must be lowercase SHA-256');
  const positionId = positionKeyFromSfen(row.sfen);
  const digest = sha256Bytes(
    `browser-confusion-parent-v1\0${sourceSha256}\0${sourceLine}\0${positionId}`
  );
  return {
    game_id: row.game_id ?? `source-row:${digest}`,
    parent_id: `sha256:${digest}`,
    position_id: positionId,
  };
}

/** Select only a legal, non-forced row on which browser and source teacher disagree. */
export function selectConfusionParent(
  row: SourceTeacherRow,
  sourceLine: number,
  sourceSha256: string,
  browser: BrowserProbe
): SelectedConfusionParent | null {
  requiredPositiveInteger(sourceLine, 'sourceLine');
  const legalMoves = rulesCompleteLegalMoves(positionFromSfen(row.sfen).position).map(
    (entry) => entry.usi
  );
  if (legalMoves.length < 2) return null;
  const browserResult = browser.search(row.sfen, row.ply);
  if (!legalMoves.includes(browserResult.bestmove)) {
    throw new Error(`browser returned illegal move ${browserResult.bestmove}`);
  }
  if (browserResult.bestmove === row.bestmove) return null;
  return {
    schema: BROWSER_CONFUSION_PARENT_SCHEMA,
    source_line: sourceLine,
    ...parentIdentity(sourceSha256, sourceLine, row),
    parent_sfen: row.sfen,
    parent_ply: row.ply,
    source_teacher: { cp: row.cp, bestmove: row.bestmove, depth: row.depth },
    browser: browserResult,
    legal_moves: legalMoves,
  };
}

function validateSingleMoveResult(
  result: UsiMultiPvResult,
  rootMove: string,
  teacherDepth: number
): ParsedUsiPv {
  const line = result.lines[0];
  const exactDepth = result.depth === teacherDepth && line?.depth === teacherDepth;
  const terminalMate =
    line?.scoreKind === 'mate' &&
    result.depth === line.depth &&
    result.depth > 0 &&
    result.depth < teacherDepth;
  if (
    (!exactDepth && !terminalMate) ||
    result.lines.length !== 1 ||
    line.multipv !== 1 ||
    result.bestmove !== line.move
  ) {
    throw new Error(
      `fixed-child teacher result violated exact contract for ${rootMove}: ` +
        JSON.stringify({
          result_depth: result.depth,
          bestmove: result.bestmove,
          lines: result.lines.map((value) => ({
            depth: value.depth,
            multipv: value.multipv,
            move: value.move,
            score_kind: value.scoreKind,
            mate: value.mate,
          })),
        })
    );
  }
  return line;
}

/** Independently re-score every legal root move and emit one full sibling group. */
export async function labelAllLegalMoves(
  parent: SelectedConfusionParent,
  teacher: FixedMoveTeacher,
  teacherDepth: number
): Promise<LabeledConfusionParent> {
  requiredPositiveInteger(teacherDepth, 'teacherDepth');
  const canonicalLegal = [...parent.legal_moves].sort(compareBytewise);
  if (
    canonicalLegal.length < 2 ||
    new Set(canonicalLegal).size !== canonicalLegal.length ||
    canonicalLegal.some((move, index) => move !== parent.legal_moves[index])
  ) {
    throw new Error('parent legal moves must be unique canonical bytewise order');
  }

  const raw: Array<Omit<CandidateSearchEvidence, 'teacher_rank'>> = [];
  for (const move of canonicalLegal) {
    const childSfen = childSfenAfterUsi(parent.parent_sfen, move);
    await teacher.resetForParent();
    const result = await teacher.search(childSfen, 1, { depth: teacherDepth }, []);
    const line = validateSingleMoveResult(result, move, teacherDepth);
    const parentCp = line.cp === 0 ? 0 : -line.cp;
    raw.push({
      move,
      child_sfen: childSfen,
      teacher_child_cp: line.cp,
      teacher_parent_cp: parentCp,
      score_kind: line.scoreKind,
      ...(line.scoreKind === 'mate'
        ? {
            mate: -(line.mate as number),
            mate_sign: (line.mateSign === 1 ? -1 : 1) as 1 | -1,
          }
        : {}),
      completed_depth: line.depth,
      termination:
        line.depth === teacherDepth
          ? 'requested-depth-complete'
          : 'terminal-mate-before-requested-depth',
      observed_nodes: result.observedNodes,
      pv: [...line.pv],
    });
  }

  const ranked = raw.sort(
    (left, right) =>
      right.teacher_parent_cp - left.teacher_parent_cp || compareBytewise(left.move, right.move)
  );
  const candidates: CandidateSearchEvidence[] = ranked.map((candidate, index) => ({
    ...candidate,
    teacher_rank: index + 1,
  }));
  const siblingInputs: SiblingCandidateInput[] = candidates.map((candidate) => ({
    move: candidate.move,
    child_sfen: candidate.child_sfen,
    sources: ['all-legal-fixed-depth-teacher'],
    teacher_parent_cp: candidate.teacher_parent_cp,
    teacher_rank: candidate.teacher_rank,
    teacher_score_kind: candidate.score_kind,
    teacher_mate: candidate.mate,
    teacher_mate_sign: candidate.mate_sign,
  }));
  const records = buildSiblingGroup(
    {
      game_id: parent.game_id,
      parent_id: parent.parent_id,
      position_id: parent.position_id,
      parent_sfen: parent.parent_sfen,
      parent_ply: parent.parent_ply,
    },
    siblingInputs
  );
  if (
    records.length !== canonicalLegal.length ||
    new Set(records.map((record) => record.move)).size !== canonicalLegal.length
  ) {
    throw new Error('output sibling group does not cover every legal move exactly once');
  }
  validateParentGroups(records);
  return { parent, candidates, records };
}

/** Stream rows, select browser disagreements, and label only the requested prefix. */
export async function buildCoreFromRows(
  rows: AsyncIterable<{ line: number; value: unknown }>,
  options: BuildCoreOptions
): Promise<BuildCoreResult> {
  requiredPositiveInteger(options.targetParents, 'targetParents');
  requiredPositiveInteger(options.maxScanRows, 'maxScanRows');
  requiredPositiveInteger(options.teacherDepth, 'teacherDepth');
  if (!SHA256_RE.test(options.sourceSha256)) throw new Error('sourceSha256 must be lowercase SHA-256');
  const shard = options.shard ?? { index: 0, total: 1 };
  if (
    !Number.isSafeInteger(shard.index) ||
    !Number.isSafeInteger(shard.total) ||
    shard.total <= 0 ||
    shard.index < 0 ||
    shard.index >= shard.total
  ) {
    throw new Error('shard must satisfy 0 <= index < total');
  }

  let scannedRows = 0;
  let shardEligibleRows = 0;
  let rejectedInvalidRows = 0;
  let rejectedForcedRows = 0;
  let rejectedBrowserIncompleteRows = 0;
  let rejectedTeacherIncompleteParents = 0;
  let browserAgreements = 0;
  const selected: LabeledConfusionParent[] = [];
  for await (const input of rows) {
    if (scannedRows >= options.maxScanRows || selected.length >= options.targetParents) break;
    scannedRows += 1;
    if ((input.line - 1) % shard.total !== shard.index) continue;
    shardEligibleRows += 1;
    let row: SourceTeacherRow;
    try {
      row = parseSourceTeacherRow(input.value);
    } catch {
      rejectedInvalidRows += 1;
      continue;
    }
    const legalCount = rulesCompleteLegalMoves(positionFromSfen(row.sfen).position).length;
    if (legalCount < 2) {
      rejectedForcedRows += 1;
      continue;
    }
    let parent: SelectedConfusionParent | null;
    try {
      parent = selectConfusionParent(
        row,
        input.line,
        options.sourceSha256,
        options.browser
      );
    } catch (error) {
      if (error instanceof BrowserFixedDepthIncompleteError) {
        rejectedBrowserIncompleteRows += 1;
        continue;
      }
      throw error;
    }
    if (parent === null) {
      browserAgreements += 1;
      continue;
    }
    try {
      selected.push(await labelAllLegalMoves(parent, options.teacher, options.teacherDepth));
    } catch (error) {
      if (error instanceof UsiFixedDepthRanksIncompleteError) {
        rejectedTeacherIncompleteParents += 1;
        continue;
      }
      throw error;
    }
  }
  if (selected.length !== options.targetParents) {
    throw new Error(
      `only selected ${selected.length}/${options.targetParents} confusion parents after ${scannedRows} rows`
    );
  }
  const records = selected.flatMap((parent) => [...parent.records]);
  validateParentGroups(records);
  return {
    scannedRows,
    shardEligibleRows,
    rejectedInvalidRows,
    rejectedForcedRows,
    rejectedBrowserIncompleteRows,
    rejectedTeacherIncompleteParents,
    browserAgreements,
    selected,
    records,
  };
}

interface NnueSearchWasm extends ShogiSearchWasm {
  readonly memory: WebAssembly.Memory;
  getNnueWeightsPtr(): number;
  getNnueWeightsSize(): number;
  setNnueBuckets(buckets: number): void;
  getNnueBuckets(): number;
  setNnueScaleK(k: number): void;
  setNnueOutputScale(numerator: number, denominator: number): void;
  setNnueEnabled(flag: number): void;
  getSearchScore(): number;
  getSearchDepth(): number;
  getSearchNodes(): number;
  getSearchLeaves(): number;
}

export interface ShippedBrowserProbeOptions {
  readonly wasmPath: string;
  readonly weightsPath: string;
  readonly scaleK: number;
  readonly scaleNumerator?: number;
  readonly scaleDenominator?: number;
  readonly depth: number;
  readonly quiescenceDepth: number;
}

/** Exact local reproduction of the shipped single-worker NNUE WASM search. */
export function createShippedBrowserProbe(options: ShippedBrowserProbeOptions): BrowserProbe {
  const depth = requiredPositiveInteger(options.depth, 'browser depth');
  const quiescence = requiredPositiveInteger(options.quiescenceDepth, 'quiescence depth');
  const scaleK = requiredPositiveInteger(options.scaleK, 'scaleK');
  const scaleNumerator = requiredPositiveInteger(options.scaleNumerator ?? 1, 'scale numerator');
  const scaleDenominator = requiredPositiveInteger(options.scaleDenominator ?? 1, 'scale denominator');
  const wasm = loadShogiWasm(path.resolve(options.wasmPath)) as NnueSearchWasm;
  const weights = fs.readFileSync(path.resolve(options.weightsPath));
  const buckets = bucketsForByteLength(weights.byteLength);
  wasm.setNnueBuckets(buckets);
  if (wasm.getNnueBuckets() !== buckets || wasm.getNnueWeightsSize() !== weights.byteLength) {
    throw new Error('WASM runtime and NNUE weight layout are incompatible');
  }
  new Uint8Array(wasm.memory.buffer, wasm.getNnueWeightsPtr(), weights.byteLength).set(weights);
  wasm.setNnueScaleK(scaleK);
  wasm.setNnueOutputScale(scaleNumerator, scaleDenominator);
  wasm.setNnueEnabled(1);
  return {
    search(sfen: string, ply: number): BrowserSearchResult {
      const parsed = positionFromSfen(sfen);
      wasm.clearTT();
      syncWasm(wasm, parsed.position);
      wasm.setRootTesu(ply);
      const key = wasm.searchBestMove(0, depth, quiescence);
      if (key === 0) throw new Error('browser search returned no move');
      const bestmove = teToUsi(teFromWasmKey(key, parsed.position));
      const completedDepth = wasm.getSearchDepth();
      if (completedDepth !== depth) {
        throw new BrowserFixedDepthIncompleteError(completedDepth, depth);
      }
      return {
        bestmove,
        score: wasm.getSearchScore(),
        completed_depth: completedDepth,
        nodes: wasm.getSearchNodes(),
        leaves: wasm.getSearchLeaves(),
      };
    },
  };
}

async function fileIdentity(file: string): Promise<FileIdentity> {
  const absolute = path.resolve(file);
  const hash = createHash('sha256');
  let bytes = 0;
  for await (const chunk of fs.createReadStream(absolute)) {
    hash.update(chunk as Buffer);
    bytes += (chunk as Buffer).byteLength;
  }
  return { path: absolute, bytes, sha256: hash.digest('hex') };
}

async function treeIdentity(root: string) {
  const absolute = path.resolve(root);
  const files: string[] = [];
  const visit = async (directory: string): Promise<void> => {
    const entries = await fs.promises.readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => compareBytewise(left.name, right.name));
    for (const entry of entries) {
      const child = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`eval tree contains symlink: ${child}`);
      if (entry.isDirectory()) await visit(child);
      else if (entry.isFile()) files.push(child);
      else throw new Error(`eval tree contains unsupported entry: ${child}`);
    }
  };
  await visit(absolute);
  const hash = createHash('sha256').update('browser-confusion-eval-tree-v1\0');
  let bytes = 0;
  for (const file of files) {
    const identity = await fileIdentity(file);
    const relative = path.relative(absolute, file).split(path.sep).join('/');
    hash.update(`${relative}\0${identity.bytes}\0${identity.sha256}\n`);
    bytes += identity.bytes;
  }
  return { files: files.length, bytes, sha256: hash.digest('hex') };
}

export function validateAuditedSourceManifestValue(
  value: unknown,
  source: FileIdentity
): { schema: string; declared_rows: number } {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('source manifest must be an object');
  }
  const manifest = value as Record<string, unknown>;
  const schema = exactText(manifest.schema, 'source manifest schema');
  const output = manifest.output;
  if (output === null || typeof output !== 'object' || Array.isArray(output)) {
    throw new Error('source manifest output must be an object');
  }
  const binding = output as Record<string, unknown>;
  const rows = requiredPositiveInteger(binding.rows as number, 'source manifest output.rows');
  if (binding.bytes !== source.bytes || binding.sha256 !== source.sha256) {
    throw new Error('source manifest output identity does not match --input');
  }
  return { schema, declared_rows: rows };
}

async function auditedSourceManifest(
  file: string,
  source: FileIdentity
): Promise<FileIdentity & { schema: string; declared_rows: number }> {
  const identity = await fileIdentity(file);
  const value = JSON.parse(await fs.promises.readFile(identity.path, 'utf8')) as unknown;
  return { ...identity, ...validateAuditedSourceManifestValue(value, source) };
}

async function* jsonlRows(file: string): AsyncGenerator<{ line: number; value: unknown }> {
  const stream = fs.createReadStream(path.resolve(file), { encoding: 'utf8' });
  const lines = readline.createInterface({ input: stream, crlfDelay: Infinity });
  let line = 0;
  for await (const text of lines) {
    line += 1;
    if (text.length === 0) continue;
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      value = null;
    }
    yield { line, value };
  }
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort(compareBytewise)
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(',')}}`;
}

function cliValue(argv: readonly string[], flag: string, fallback?: string): string {
  const index = argv.indexOf(`--${flag}`);
  if (index < 0) {
    if (fallback !== undefined) return fallback;
    throw new Error(`missing --${flag}`);
  }
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`missing value for --${flag}`);
  return value;
}

function cliInteger(argv: readonly string[], flag: string, fallback: number): number {
  const value = Number(cliValue(argv, flag, String(fallback)));
  return requiredPositiveInteger(value, flag);
}

function cliShard(argv: readonly string[]): { index: number; total: number } {
  const value = cliValue(argv, 'shard', '0/1');
  const match = /^(\d+)\/(\d+)$/.exec(value);
  if (!match) throw new Error('--shard must be index/total');
  const index = Number(match[1]);
  const total = Number(match[2]);
  if (!Number.isSafeInteger(index) || !Number.isSafeInteger(total) || total <= 0 || index >= total) {
    throw new Error('--shard must satisfy 0 <= index < total');
  }
  return { index, total };
}

async function writeExclusive(file: string, text: string): Promise<FileIdentity> {
  await fs.promises.writeFile(file, text, { encoding: 'utf8', flag: 'wx', mode: 0o444 });
  return fileIdentity(file);
}

export async function runCli(argv = process.argv.slice(2)): Promise<BuildReceipt> {
  const input = path.resolve(cliValue(argv, 'input'));
  const sourceManifestPath = path.resolve(cliValue(argv, 'source-manifest'));
  const outDir = path.resolve(cliValue(argv, 'out-dir'));
  const enginePath = path.resolve(cliValue(argv, 'engine'));
  const evalDir = path.resolve(cliValue(argv, 'eval-dir'));
  const wasmPath = path.resolve(
    cliValue(
      argv,
      'wasm',
      path.join(__dirname, '..', 'src', 'components', 'game', 'ShogiImproved', 'wasm', 'shogi.wasm')
    )
  );
  const weightsPath = path.resolve(
    cliValue(argv, 'weights', path.join(__dirname, '..', 'public', 'shogi-nnue-weights.bin'))
  );
  const targetParents = cliInteger(argv, 'parents', 1);
  const maxScanRows = cliInteger(argv, 'scan-rows', 10_000);
  const browserDepth = cliInteger(argv, 'browser-depth', 4);
  const teacherDepth = cliInteger(argv, 'teacher-depth', 8);
  const quiescenceDepth = cliInteger(argv, 'quiescence-depth', 8);
  const scaleK = cliInteger(argv, 'scale-k', 600);
  const hashMb = cliInteger(argv, 'hash-mb', 128);
  const timeoutMs = cliInteger(argv, 'timeout-ms', 120_000);
  const shard = cliShard(argv);
  await fs.promises.mkdir(path.dirname(outDir), { recursive: true });
  await fs.promises.mkdir(outDir, { recursive: false, mode: 0o755 });

  const [sourceIdentity, wasmIdentity, weightsIdentity, engineIdentity, evalIdentity] =
    await Promise.all([
      fileIdentity(input),
      fileIdentity(wasmPath),
      fileIdentity(weightsPath),
      fileIdentity(enginePath),
      treeIdentity(evalDir),
    ]);
  const sourceManifest = await auditedSourceManifest(sourceManifestPath, sourceIdentity);
  const browser = createShippedBrowserProbe({
    wasmPath,
    weightsPath,
    scaleK,
    depth: browserDepth,
    quiescenceDepth,
  });
  const teacher = new UsiTeacherEngine({
    engineBin: enginePath,
    evalDir,
    hashMb,
    timeoutMs,
  });
  await teacher.init();
  let core: BuildCoreResult;
  try {
    core = await buildCoreFromRows(jsonlRows(input), {
      sourceSha256: sourceIdentity.sha256,
      targetParents,
      maxScanRows,
      teacherDepth,
      browser,
      teacher,
      shard,
    });
  } finally {
    await teacher.quit();
  }

  const datasetPath = path.join(outDir, 'ranking.jsonl');
  const parentEvidencePath = path.join(outDir, 'parents.jsonl');
  const dataset = await writeExclusive(
    datasetPath,
    `${core.records.map((record) => canonicalJson(record)).join('\n')}\n`
  );
  const parentEvidence = await writeExclusive(
    parentEvidencePath,
    `${core.selected.map((entry) => canonicalJson(entry)).join('\n')}\n`
  );
  const candidateCounts = core.selected.map((entry) => entry.records.length);
  const receipt: BuildReceipt = {
    schema: BROWSER_CONFUSION_RECEIPT_SCHEMA,
    status: 'research-data-only-not-deployment-authorization',
    selection_policy: BROWSER_CONFUSION_SELECTION_POLICY,
    label_policy: ALL_LEGAL_RESCORE_POLICY,
    incomplete_parent_policy: INCOMPLETE_PARENT_POLICY,
    source: {
      ...sourceIdentity,
      audit_manifest: sourceManifest,
      scanned_rows: core.scannedRows,
      shard_eligible_rows: core.shardEligibleRows,
      rejected_invalid_rows: core.rejectedInvalidRows,
      rejected_forced_rows: core.rejectedForcedRows,
      rejected_browser_incomplete_rows: core.rejectedBrowserIncompleteRows,
      rejected_teacher_incomplete_parents: core.rejectedTeacherIncompleteParents,
      browser_agreements: core.browserAgreements,
    },
    selection_shard: shard,
    browser: {
      wasm: wasmIdentity,
      weights: weightsIdentity,
      scale_k: scaleK,
      output_scale: [1, 1],
      fixed_depth: browserDepth,
      quiescence_depth: quiescenceDepth,
      max_time_ms: 0,
    },
    teacher: {
      engine: engineIdentity,
      eval_tree: evalIdentity,
      fixed_depth: teacherDepth,
      multipv: 1,
      search_mode: 'unrestricted-search-from-each-legal-child-position',
      reset_before_each_candidate: true,
      terminal_mate_before_requested_depth: 'accepted-by-pinned-usi-accumulator',
      candidate_order: 'utf8-bytewise-ascending',
      rank_order: 'parent-cp-descending-then-utf8-bytewise-move',
      engine_contract: USI_TEACHER_ENGINE_CONTRACT,
    },
    output: {
      dataset: {
        ...dataset,
        schema: SIBLING_SCHEMA,
        parents: core.selected.length,
        games: new Set(core.records.map((record) => record.game_id)).size,
        records: core.records.length,
        min_candidates: Math.min(...candidateCounts),
        max_candidates: Math.max(...candidateCounts),
      },
      parent_evidence: {
        ...parentEvidence,
        schema: BROWSER_CONFUSION_PARENT_SCHEMA,
        records: core.selected.length,
      },
    },
  };
  await writeExclusive(path.join(outDir, 'receipt.json'), `${canonicalJson(receipt)}\n`);
  return receipt;
}

if (require.main === module) {
  runCli()
    .then((receipt) => process.stdout.write(`${canonicalJson(receipt)}\n`))
    .catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
      process.exitCode = 1;
    });
}
