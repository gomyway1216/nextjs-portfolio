/**
 * Deterministic strong-game sibling-label generator.
 *
 * A MultiPV search proposes candidates and the played move is added if needed.
 * Every candidate is then searched independently after a full search-state reset with
 * MultiPV=1 and exactly one `searchmoves` move. Independent scores are ranked
 * by cp descending with a bytewise move tie-break.
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { GenerateMovesImproved } from '../src/components/game/ShogiImproved/GenerateMovesImproved';
import {
  SIBLING_MANIFEST_SCHEMA,
  buildSiblingGroup,
  positionKeyFromSfen,
  splitSiblingDataset,
  validateParentGroups,
  type SiblingRecord,
} from './sibling-data';
import { childSfenAfterUsi, positionFromSfen, teToUsi } from './shogi-sfen';
import {
  verifyPipelineOutputPaths,
  verifyPipelineRevision,
  type PipelineProvenance,
} from './pipeline-revision';
import { USI_TEACHER_ENGINE_CONTRACT, UsiTeacherEngine } from './usi-engine';
import {
  MAX_NON_MATE_CP,
  mateToCp,
  type UsiMultiPvResult,
  type UsiSearchLimit,
} from './usi-multipv';

export const SIBLING_TEACHER_MANIFEST_SCHEMA = 'shogi-sibling-teacher-manifest-v2' as const;
export const SIBLING_TEACHER_WORK_SCHEMA = 'shogi-sibling-teacher-work-v2' as const;
export const TEACHER_ENGINE_RECEIPT_SCHEMA = 'shogi-teacher-engine-receipt-v1' as const;
export const SIBLING_TEACHER_LABEL_POLICY =
  'initial-multipv-plus-played-independent-single-move-rescore-final-mate-v6' as const;
export const INDEPENDENT_EXACT_RESCORE_MODE = 'independent-single-move' as const;
export const SIBLING_TEACHER_RUNTIME_SNAPSHOT_CONTRACT = {
  engine_binary: true,
  engine_argument_files: 'snapshotted-and-substituted',
  eval_tree: 'snapshotted',
  eval_options_file: 'rejected',
  private_working_directory: true,
} as const;

interface RawParentOccurrence {
  schema_version: 1;
  game_id: string;
  parent_id: string;
  position_id: string;
  parent_sfen: string;
  ply: number;
  played_move: string;
}

export interface GenerateSiblingTeacherOptions {
  raw: string;
  engineBin: string;
  pipelineRevision: string;
  engineArgs?: readonly string[];
  engineReceipt: string;
  evalDir?: string;
  multipv?: number;
  nodes?: number;
  depth?: number;
  engines?: number;
  seed?: string | number;
  valRatio?: number;
  outTrain: string;
  outVal: string;
  manifest: string;
  work: string;
  maxParents?: number;
  fvScale?: number;
  hashMb?: number;
  timeoutMs?: number;
}

interface NormalizedOptions {
  raw: string;
  engineBin: string;
  pipelineRevision: string;
  engineArgs: readonly string[];
  engineReceipt: string;
  evalDir?: string;
  multipv: number;
  limit: UsiSearchLimit;
  engines: number;
  seed: string;
  valRatio: number;
  outTrain: string;
  outVal: string;
  manifest: string;
  work: string;
  maxParents?: number;
  fvScale: number;
  hashMb: number;
  timeoutMs: number;
}

interface FileDigest {
  path: string;
  bytes: number;
  sha256: string;
}

interface SearchScoreMetadata {
  move: string;
  cp: number;
  score_kind: 'cp' | 'mate';
  mate?: number;
  mate_sign?: 1 | -1;
}

interface SearchMetadata {
  requested_multipv: number;
  requested_limit: { nodes: number } | { depth: number };
  depth: number;
  observed_nodes: number;
  bestmove: string;
  moves: string[];
  scores: SearchScoreMetadata[];
}

interface IndependentExactSearchMetadata {
  mode: typeof INDEPENDENT_EXACT_RESCORE_MODE;
  candidate_count: number;
  synthesized_rank1_move: string;
  /** Ranked by cp descending, then UTF-8 bytes ascending. */
  moves: string[];
  scores: SearchScoreMetadata[];
  /** One MultiPV=1 search per candidate in canonical bytewise order. */
  searches: SearchMetadata[];
  total_observed_nodes: number;
}

interface WorkHeader {
  schema: typeof SIBLING_TEACHER_WORK_SCHEMA;
  kind: 'header';
  run_fingerprint: string;
  source_raw_sha256: string;
  selected_parent_ids_sha256: string;
  label_policy: typeof SIBLING_TEACHER_LABEL_POLICY;
  pipeline: PipelineProvenance;
}

interface CompletedWorkEntry {
  schema: typeof SIBLING_TEACHER_WORK_SCHEMA;
  kind: 'parent';
  run_fingerprint: string;
  payload_sha256: string;
  parent_id: string;
  candidate_set_sha256: string;
  candidate_moves: string[];
  initial_search: SearchMetadata;
  exact_search: IndependentExactSearchMetadata;
  records: SiblingRecord[];
}

interface SkippedWorkEntry {
  schema: typeof SIBLING_TEACHER_WORK_SCHEMA;
  kind: 'skip';
  run_fingerprint: string;
  payload_sha256: string;
  parent_id: string;
  reason: 'fewer-than-two-legal-moves';
  legal_moves: number;
}

type WorkEntry = CompletedWorkEntry | SkippedWorkEntry;

export interface SiblingTeacherManifest {
  schema: typeof SIBLING_TEACHER_MANIFEST_SCHEMA;
  record_manifest_schema: typeof SIBLING_MANIFEST_SCHEMA;
  pipeline: PipelineProvenance;
  source: {
    raw_sha256: string;
    raw_records: number;
    selected_parents: number;
    selected_parent_ids_sha256: string;
  };
  teacher: {
    engine_bin_sha256: string;
    engine_bin_bytes: number;
    engine_args: string[];
    engine_arg_files: FileDigest[];
    engine_receipt: {
      file: FileDigest;
      content: Record<string, unknown>;
    };
    eval_sha256: string | null;
    eval_files: FileDigest[];
    runtime_snapshot: typeof SIBLING_TEACHER_RUNTIME_SNAPSHOT_CONTRACT & {
      engine_argument_file_count: number;
      eval_tree_present: boolean;
    };
  };
  search: {
    multipv: number;
    limit: { nodes: number } | { depth: number };
    parallel_engines: number;
    fv_scale: number;
    hash_mb_per_engine: number;
    timeout_ms: number;
    exact_rescore_mode: typeof INDEPENDENT_EXACT_RESCORE_MODE;
    label_policy: typeof SIBLING_TEACHER_LABEL_POLICY;
    tt_reset_before_proposal: true;
    tt_reset_before_each_candidate: true;
    search_state_reset_before_proposal: 'isready';
    search_state_reset_before_each_candidate: 'isready';
    candidate_execution_order: 'utf8-bytewise-ascending';
    synthesized_rank_order: 'cp-descending-then-utf8-bytewise-move';
    engine_options: typeof USI_TEACHER_ENGINE_CONTRACT;
  };
  candidate_sets: {
    sha256: string;
    parents: number;
    candidates: number;
    min_candidates: number;
    max_candidates: number;
    skipped_parents: number;
  };
  progress_checkpoint: {
    schema: typeof SIBLING_TEACHER_WORK_SCHEMA;
    run_fingerprint: string;
    entries: number;
    completed_parents: number;
    skipped_parents: number;
    sha256: string;
  };
  split: ReturnType<typeof splitSiblingDataset>['manifest'];
  outputs: {
    train_sha256: string;
    val_sha256: string;
    train_bytes: number;
    val_bytes: number;
  };
}

export interface GenerateSiblingTeacherDependencies {
  verifyRevision?: (revision: string) => Promise<PipelineProvenance>;
  verifyOutputPaths?: (
    outputPaths: readonly string[],
    inputPaths: readonly string[]
  ) => Promise<void>;
}

function sha256(input: string | Uint8Array): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

async function sha256File(filePath: string): Promise<{ bytes: number; sha256: string }> {
  const hash = crypto.createHash('sha256');
  let bytes = 0;
  for await (const chunk of fs.createReadStream(filePath)) {
    const data = chunk as Buffer;
    bytes += data.byteLength;
    hash.update(data);
  }
  return { bytes, sha256: hash.digest('hex') };
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('cannot canonicalize a non-finite number');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
      .join(',')}}`;
  }
  throw new Error(`cannot canonicalize ${typeof value}`);
}

function workEntryPayloadSha256(entry: WorkEntry): string {
  const payload = { ...entry } as Record<string, unknown>;
  delete payload.payload_sha256;
  return sha256(canonicalJson(payload));
}

function sealWorkEntry(value: Record<string, unknown>): WorkEntry {
  const entry = { ...value, payload_sha256: '' } as WorkEntry;
  entry.payload_sha256 = workEntryPayloadSha256(entry);
  return entry;
}

function requiredText(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${name} must not be empty`);
  return value.trim();
}

function validateEngineReceipt(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('engine receipt must contain a JSON object');
  }
  const receipt = value as Record<string, unknown>;
  if (receipt.schema !== TEACHER_ENGINE_RECEIPT_SCHEMA) {
    throw new Error(`engine receipt schema must be ${TEACHER_ENGINE_RECEIPT_SCHEMA}`);
  }
  for (const field of [
    'source_repository',
    'source_commit_date',
    'build_directory',
    'build_command',
    'compiler',
    'compiler_target',
    'engine_id',
  ]) {
    requiredText(receipt[field], `engine receipt ${field}`);
  }
  const repository = receipt.source_repository as string;
  try {
    const url = new URL(repository);
    if (url.protocol !== 'https:' || !url.hostname) throw new Error('not HTTPS');
  } catch {
    throw new Error('engine receipt source_repository must be an absolute HTTPS URL');
  }
  if (typeof receipt.source_commit !== 'string' || !/^[0-9a-f]{40}$/.test(receipt.source_commit)) {
    throw new Error('engine receipt source_commit must be a lowercase 40-digit Git commit');
  }
  if (
    typeof receipt.source_commit_date !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(receipt.source_commit_date) ||
    !Number.isFinite(Date.parse(receipt.source_commit_date))
  ) {
    throw new Error('engine receipt source_commit_date must be an ISO-8601 timestamp with timezone');
  }
  if (!Number.isSafeInteger(receipt.binary_bytes) || (receipt.binary_bytes as number) <= 0) {
    throw new Error('engine receipt binary_bytes must be a positive safe integer');
  }
  if (typeof receipt.binary_sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(receipt.binary_sha256)) {
    throw new Error('engine receipt binary_sha256 must be a lowercase SHA-256 digest');
  }
  return receipt;
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive safe integer (got ${value})`);
  }
  return value;
}

function normalizeOptions(options: GenerateSiblingTeacherOptions): NormalizedOptions {
  const hasNodes = options.nodes !== undefined;
  const hasDepth = options.depth !== undefined;
  if (hasNodes === hasDepth) throw new Error('exactly one of nodes or depth must be specified');
  const valRatio = options.valRatio ?? 0.1;
  if (!(valRatio > 0 && valRatio < 1)) {
    throw new Error(`valRatio must be between 0 and 1 (got ${valRatio})`);
  }
  if (options.maxParents !== undefined) positiveInteger(options.maxParents, 'maxParents');
  const normalized: NormalizedOptions = {
    raw: path.resolve(requiredText(options.raw, 'raw')),
    engineBin: path.resolve(requiredText(options.engineBin, 'engineBin')),
    pipelineRevision: requiredText(options.pipelineRevision, 'pipelineRevision'),
    engineArgs: [...(options.engineArgs ?? [])],
    engineReceipt: path.resolve(requiredText(options.engineReceipt, 'engineReceipt')),
    multipv: positiveInteger(options.multipv ?? 12, 'multipv'),
    limit: hasNodes
      ? { nodes: positiveInteger(options.nodes as number, 'nodes') }
      : { depth: positiveInteger(options.depth as number, 'depth') },
    engines: positiveInteger(options.engines ?? 1, 'engines'),
    seed: String(options.seed ?? '42'),
    valRatio,
    outTrain: path.resolve(requiredText(options.outTrain, 'outTrain')),
    outVal: path.resolve(requiredText(options.outVal, 'outVal')),
    manifest: path.resolve(requiredText(options.manifest, 'manifest')),
    work: path.resolve(requiredText(options.work, 'work')),
    fvScale: positiveInteger(options.fvScale ?? 20, 'fvScale'),
    hashMb: positiveInteger(options.hashMb ?? 128, 'hashMb'),
    timeoutMs: positiveInteger(options.timeoutMs ?? 120_000, 'timeoutMs'),
  };
  if (options.evalDir) normalized.evalDir = path.resolve(options.evalDir);
  if (options.maxParents !== undefined) normalized.maxParents = options.maxParents;
  if (!/^[0-9a-f]{40}$/.test(normalized.pipelineRevision)) {
    throw new Error('pipelineRevision must be a lowercase 40-digit Git commit');
  }

  const outputPaths = [
    normalized.outTrain,
    normalized.outVal,
    normalized.manifest,
    normalized.work,
  ];
  if (new Set(outputPaths).size !== outputPaths.length) {
    throw new Error('train, val, manifest, and work output paths must all be different');
  }
  const inputPaths = [normalized.raw, normalized.engineBin, normalized.engineReceipt];
  if (outputPaths.some((output) => inputPaths.includes(output))) {
    throw new Error('output paths must not overwrite raw, engineBin, or engineReceipt inputs');
  }
  return normalized;
}

function validateRawParent(value: unknown, line: number): RawParentOccurrence {
  if (!value || typeof value !== 'object') throw new Error(`raw line ${line} must be an object`);
  const row = value as Partial<RawParentOccurrence>;
  if (row.schema_version !== 1) throw new Error(`raw line ${line} has unsupported schema_version`);
  const gameId = requiredText(row.game_id, `raw line ${line} game_id`);
  const parentId = requiredText(row.parent_id, `raw line ${line} parent_id`);
  const parentSfen = requiredText(row.parent_sfen, `raw line ${line} parent_sfen`)
    .split(/\s+/)
    .join(' ');
  const positionId = requiredText(row.position_id, `raw line ${line} position_id`);
  if (positionId !== positionKeyFromSfen(parentSfen)) {
    throw new Error(`raw line ${line} position_id does not match parent_sfen`);
  }
  if (!Number.isSafeInteger(row.ply) || (row.ply as number) < 0) {
    throw new Error(`raw line ${line} ply must be a non-negative safe integer`);
  }
  return {
    schema_version: 1,
    game_id: gameId,
    parent_id: parentId,
    position_id: positionId,
    parent_sfen: parentSfen,
    ply: row.ply as number,
    played_move: requiredText(row.played_move, `raw line ${line} played_move`),
  };
}

function parseRawParents(text: string): RawParentOccurrence[] {
  const parents: RawParentOccurrence[] = [];
  const ids = new Set<string>();
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  for (let index = 0; index < lines.length; index++) {
    if (!lines[index].trim()) continue;
    let value: unknown;
    try {
      value = JSON.parse(lines[index]);
    } catch {
      throw new Error(`invalid raw parent JSON on line ${index + 1}`);
    }
    const parent = validateRawParent(value, index + 1);
    if (ids.has(parent.parent_id)) throw new Error(`duplicate raw parent_id: ${parent.parent_id}`);
    ids.add(parent.parent_id);
    parents.push(parent);
  }
  parents.sort((a, b) => compareBytewise(a.parent_id, b.parent_id));
  if (parents.length === 0) throw new Error('raw parent dataset is empty');
  return parents;
}

async function collectDirectoryDigests(root: string): Promise<FileDigest[]> {
  const rootStat = await fs.promises.stat(root);
  if (!rootStat.isDirectory()) throw new Error(`evalDir is not a directory: ${root}`);
  const files: FileDigest[] = [];
  const visit = async (directory: string, prefix: string): Promise<void> => {
    const entries = await fs.promises.readdir(directory, { withFileTypes: true });
    entries.sort((a, b) => compareBytewise(a.name, b.name));
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) throw new Error(`evalDir contains a symbolic link: ${relative}`);
      if (entry.isDirectory()) await visit(absolute, relative);
      else if (entry.isFile()) {
        const digest = await sha256File(absolute);
        files.push({ path: relative, ...digest });
      } else {
        throw new Error(`evalDir contains an unsupported entry: ${relative}`);
      }
    }
  };
  await visit(root, '');
  if (files.length === 0) throw new Error(`evalDir contains no files: ${root}`);
  return files;
}

async function collectArgumentFileDigests(args: readonly string[]): Promise<FileDigest[]> {
  const files: FileDigest[] = [];
  for (const argument of args) {
    const absolute = path.resolve(argument);
    try {
      const stat = await fs.promises.stat(absolute);
      if (!stat.isFile()) continue;
      const digest = await sha256File(absolute);
      files.push({ path: argument, ...digest });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  return files;
}

interface RuntimeSnapshot {
  root: string;
  engineBin: string;
  engineArgs: string[];
  cwd: string;
  evalDir?: string;
}

async function copyVerifiedFile(
  source: string,
  destination: string,
  expected: { bytes: number; sha256: string }
): Promise<void> {
  await fs.promises.mkdir(path.dirname(destination), { recursive: true });
  await fs.promises.copyFile(source, destination, fs.constants.COPYFILE_FICLONE);
  const copied = await sha256File(destination);
  if (copied.bytes !== expected.bytes || copied.sha256 !== expected.sha256) {
    throw new Error(`runtime snapshot changed while copying ${source}`);
  }
  const sourceMode = (await fs.promises.stat(source)).mode & 0o777;
  await fs.promises.chmod(destination, (sourceMode & 0o555) || 0o400);
}

async function createRuntimeSnapshot(
  options: NormalizedOptions,
  engineDigest: { bytes: number; sha256: string },
  engineArgFiles: readonly FileDigest[],
  evalFiles: readonly FileDigest[]
): Promise<RuntimeSnapshot> {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'shogi-teacher-runtime-'));
  try {
    const engineBin = path.join(root, 'engine', path.basename(options.engineBin));
    await copyVerifiedFile(options.engineBin, engineBin, engineDigest);
    const cwd = path.join(root, 'cwd');
    await fs.promises.mkdir(cwd, { mode: 0o700 });

    const argumentDigests = new Map(
      engineArgFiles.map((file) => [path.resolve(file.path), file] as const)
    );
    const engineArgs = [...options.engineArgs];
    for (let index = 0; index < engineArgs.length; index++) {
      const absolute = path.resolve(engineArgs[index]);
      const digest = argumentDigests.get(absolute);
      if (!digest) continue;
      const destination = path.join(root, 'args', `${index}-${path.basename(absolute)}`);
      await copyVerifiedFile(absolute, destination, digest);
      engineArgs[index] = destination;
    }

    let evalDir: string | undefined;
    if (options.evalDir) {
      evalDir = path.join(root, 'eval');
      for (const file of evalFiles) {
        await copyVerifiedFile(
          path.join(options.evalDir, file.path),
          path.join(evalDir, ...file.path.split('/')),
          file
        );
      }
    }
    return { root, engineBin, engineArgs, cwd, ...(evalDir ? { evalDir } : {}) };
  } catch (error) {
    await fs.promises.rm(root, { recursive: true, force: true });
    throw error;
  }
}

function serializeJsonl(records: readonly SiblingRecord[]): string {
  return records.length === 0 ? '' : `${records.map((record) => JSON.stringify(record)).join('\n')}\n`;
}

async function atomicWrite(filePath: string, contents: string): Promise<void> {
  const directory = path.dirname(filePath);
  await fs.promises.mkdir(directory, { recursive: true });
  const temporary = path.join(
    directory,
    `.${path.basename(filePath)}.${process.pid}.${crypto.randomBytes(8).toString('hex')}.tmp`
  );
  try {
    await fs.promises.writeFile(temporary, contents, { flag: 'wx' });
    await fs.promises.rename(temporary, filePath);
  } finally {
    await fs.promises.rm(temporary, { force: true });
  }
}

function compareBytewise(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));
}

function canonicalSortedMoves(moves: Iterable<string>): string[] {
  return [...moves].sort(compareBytewise);
}

function candidateSetSha256(moves: readonly string[]): string {
  return sha256(`candidate-set-v1\0${canonicalSortedMoves(moves).join('\n')}`);
}

function normalizedSearchLimit(limit: UsiSearchLimit): { nodes: number } | { depth: number } {
  return limit.nodes !== undefined
    ? { nodes: limit.nodes }
    : { depth: limit.depth as number };
}

function searchMetadata(result: UsiMultiPvResult, limit: UsiSearchLimit): SearchMetadata {
  return {
    requested_multipv: result.lines.length,
    requested_limit: normalizedSearchLimit(limit),
    depth: result.depth,
    observed_nodes: result.observedNodes,
    bestmove: result.bestmove,
    moves: result.lines.map((line) => line.move),
    scores: result.lines.map((line) => ({
      move: line.move,
      cp: line.cp,
      score_kind: line.scoreKind,
      ...(line.scoreKind === 'mate'
        ? { mate: line.mate as number, mate_sign: line.mateSign as 1 | -1 }
        : {}),
    })),
  };
}

function compareRankedScores(left: SearchScoreMetadata, right: SearchScoreMetadata): number {
  return right.cp - left.cp || compareBytewise(left.move, right.move);
}

function sumObservedNodes(searches: readonly SearchMetadata[], label: string): number {
  const total = searches.reduce((sum, search) => sum + search.observed_nodes, 0);
  if (!Number.isSafeInteger(total) || total < 0) {
    throw new Error(`${label} total_observed_nodes exceeds the safe integer range`);
  }
  return total;
}

function validateSearchScore(value: unknown, label: string): SearchScoreMetadata {
  if (!value || typeof value !== 'object') throw new Error(`${label} score metadata is missing`);
  const row = value as Partial<SearchScoreMetadata>;
  const move = requiredText(row.move, `${label} score move`);
  if (!Number.isSafeInteger(row.cp)) throw new Error(`${label} score cp must be an integer`);
  if (row.score_kind === 'mate') {
    if (!Number.isSafeInteger(row.mate) || (row.mate_sign !== 1 && row.mate_sign !== -1)) {
      throw new Error(`${label} has incomplete mate metadata`);
    }
    if (
      ((row.mate as number) > 0 && row.mate_sign !== 1) ||
      ((row.mate as number) < 0 && row.mate_sign !== -1)
    ) {
      throw new Error(`${label} has contradictory mate sign`);
    }
    if (row.cp !== mateToCp(row.mate as number, row.mate_sign)) {
      throw new Error(`${label} mate metadata does not match mapped cp`);
    }
  } else if (row.score_kind === 'cp') {
    if (Math.abs(row.cp as number) > MAX_NON_MATE_CP) {
      throw new Error(`${label} cp score enters the reserved mate band`);
    }
    if (row.mate !== undefined || row.mate_sign !== undefined) {
      throw new Error(`${label} cp score has mate metadata`);
    }
  } else {
    throw new Error(`${label} has invalid score kind`);
  }
  return {
    move,
    cp: row.cp as number,
    score_kind: row.score_kind,
    ...(row.score_kind === 'mate'
      ? { mate: row.mate as number, mate_sign: row.mate_sign as 1 | -1 }
      : {}),
  };
}

function validateSearchMetadata(
  value: unknown,
  label: string,
  allowTerminalMateBeforeRequestedDepth = false
): SearchMetadata {
  if (!value || typeof value !== 'object') throw new Error(`${label} metadata is missing`);
  const row = value as Partial<SearchMetadata>;
  if (
    !Number.isSafeInteger(row.requested_multipv) ||
    (row.requested_multipv as number) <= 0 ||
    !Number.isSafeInteger(row.depth) ||
    (row.depth as number) <= 0 ||
    !Number.isSafeInteger(row.observed_nodes) ||
    (row.observed_nodes as number) < 0 ||
    !Array.isArray(row.moves) ||
    !Array.isArray(row.scores)
  ) {
    throw new Error(`${label} metadata has invalid numeric fields`);
  }
  const moves = row.moves.map((move) => requiredText(move, `${label} move`));
  if (moves.length !== row.requested_multipv || new Set(moves).size !== moves.length) {
    throw new Error(`${label} metadata has inconsistent MultiPV moves`);
  }
  const bestmove = requiredText(row.bestmove, `${label} bestmove`);
  if (bestmove !== moves[0]) throw new Error(`${label} bestmove does not match PV1`);
  const scores = row.scores.map((score, index) => validateSearchScore(score, `${label} rank ${index + 1}`));
  if (
    scores.length !== moves.length ||
    scores.some((score, index) => score.move !== moves[index])
  ) {
    throw new Error(`${label} scores do not match MultiPV moves`);
  }
  if (!row.requested_limit || typeof row.requested_limit !== 'object') {
    throw new Error(`${label} requested_limit is missing`);
  }
  const requestedLimit = row.requested_limit as UsiSearchLimit;
  const hasNodes = requestedLimit.nodes !== undefined;
  const hasDepth = requestedLimit.depth !== undefined;
  if (hasNodes === hasDepth) throw new Error(`${label} requested_limit must have one mode`);
  const requestedValue = hasNodes ? requestedLimit.nodes : requestedLimit.depth;
  if (!Number.isSafeInteger(requestedValue) || (requestedValue as number) <= 0) {
    throw new Error(`${label} requested_limit must be a positive safe integer`);
  }
  if (hasDepth) {
    if ((row.depth as number) > (requestedLimit.depth as number)) {
      throw new Error(`${label} completed beyond its requested depth`);
    }
    if ((row.depth as number) < (requestedLimit.depth as number)) {
      if (
        !allowTerminalMateBeforeRequestedDepth ||
        row.requested_multipv !== 1 ||
        scores.some((score) => score.score_kind !== 'mate')
      ) {
        throw new Error(`${label} ended before requested depth without a terminal mate`);
      }
    }
  }
  return {
    requested_multipv: row.requested_multipv as number,
    requested_limit: normalizedSearchLimit(requestedLimit),
    depth: row.depth as number,
    observed_nodes: row.observed_nodes as number,
    bestmove,
    moves,
    scores,
  };
}

function validateIndependentExactSearch(
  value: unknown,
  candidates: readonly string[],
  expectedLimit: { nodes: number } | { depth: number },
  label: string
): IndependentExactSearchMetadata {
  if (!value || typeof value !== 'object') throw new Error(`${label} metadata is missing`);
  const row = value as Partial<IndependentExactSearchMetadata>;
  if (row.mode !== INDEPENDENT_EXACT_RESCORE_MODE) {
    throw new Error(`${label} mode must be ${INDEPENDENT_EXACT_RESCORE_MODE}`);
  }
  if (!Number.isSafeInteger(row.candidate_count) || row.candidate_count !== candidates.length) {
    throw new Error(`${label} candidate_count does not match candidate_moves`);
  }
  if (!Array.isArray(row.moves) || !Array.isArray(row.scores) || !Array.isArray(row.searches)) {
    throw new Error(`${label} is missing ranked moves, scores, or searches`);
  }
  const moves = row.moves.map((move, index) => requiredText(move, `${label} move ${index + 1}`));
  const scores = row.scores.map((score, index) =>
    validateSearchScore(score, `${label} ranked score ${index + 1}`)
  );
  if (
    moves.length !== candidates.length ||
    new Set(moves).size !== moves.length ||
    scores.length !== moves.length ||
    scores.some((score, index) => score.move !== moves[index]) ||
    canonicalSortedMoves(moves).some((move, index) => move !== candidates[index])
  ) {
    throw new Error(`${label} ranked moves or scores do not match candidate_moves`);
  }
  const expectedRanked = [...scores].sort(compareRankedScores);
  if (expectedRanked.some((score, index) => score.move !== moves[index])) {
    throw new Error(`${label} rank order is not cp-descending with bytewise move tie-break`);
  }
  const synthesizedRank1Move = requiredText(
    row.synthesized_rank1_move,
    `${label} synthesized_rank1_move`
  );
  if (synthesizedRank1Move !== moves[0]) {
    throw new Error(`${label} synthesized_rank1_move does not match synthesized rank 1`);
  }

  const searches = row.searches.map((search, index) =>
    validateSearchMetadata(search, `${label} single search ${index + 1}`, true)
  );
  if (searches.length !== candidates.length) {
    throw new Error(`${label} searches length does not match candidate_count`);
  }
  for (let index = 0; index < searches.length; index++) {
    const search = searches[index];
    const candidate = candidates[index];
    if (
      search.requested_multipv !== 1 ||
      search.moves.length !== 1 ||
      search.scores.length !== 1 ||
      search.bestmove !== candidate ||
      search.moves[0] !== candidate ||
      search.scores[0].move !== candidate
    ) {
      throw new Error(`${label} single searches are not in canonical candidate order`);
    }
    if (canonicalJson(search.requested_limit) !== canonicalJson(expectedLimit)) {
      throw new Error(`${label} single search requested_limit differs from the proposal/run limit`);
    }
  }
  const totalObservedNodes = sumObservedNodes(searches, label);
  if (row.total_observed_nodes !== totalObservedNodes) {
    throw new Error(`${label} total_observed_nodes does not equal the single-search sum`);
  }
  const scoresByMove = new Map(searches.map((search) => [search.scores[0].move, search.scores[0]]));
  for (const score of scores) {
    const single = scoresByMove.get(score.move);
    if (
      !single ||
      score.cp !== single.cp ||
      score.score_kind !== single.score_kind ||
      score.mate !== single.mate ||
      score.mate_sign !== single.mate_sign
    ) {
      throw new Error(`${label} ranked score ${score.move} disagrees with its single search`);
    }
  }
  return {
    mode: INDEPENDENT_EXACT_RESCORE_MODE,
    candidate_count: candidates.length,
    synthesized_rank1_move: synthesizedRank1Move,
    moves,
    scores,
    searches,
    total_observed_nodes: totalObservedNodes,
  };
}

function legalMovesForParent(parent: RawParentOccurrence): string[] {
  const { position } = positionFromSfen(parent.parent_sfen);
  const moves = GenerateMovesImproved.generateLegalMoves(position).map(teToUsi);
  if (new Set(moves).size !== moves.length) {
    throw new Error(`legal move generator returned duplicates for parent ${parent.parent_id}`);
  }
  if (!moves.includes(parent.played_move)) {
    throw new Error(`played_move ${parent.played_move} is illegal for parent ${parent.parent_id}`);
  }
  return moves;
}

/** Label one parent with a proposal search and independent single-move re-searches. */
export async function labelSiblingParent(
  engine: UsiTeacherEngine,
  parent: RawParentOccurrence,
  multipv: number,
  limit: UsiSearchLimit,
  legalMoves = legalMovesForParent(parent)
): Promise<CompletedWorkEntry> {
  if (legalMoves.length < 2) {
    throw new Error(`parent ${parent.parent_id} has fewer than two legal moves`);
  }
  // Rebuild all pinned-engine search state before the proposal so results are
  // independent of worker assignment and resume history.
  await engine.resetForParent();
  const initialMultiPv = Math.min(multipv, legalMoves.length);
  const initial = await engine.search(parent.parent_sfen, initialMultiPv, limit);
  const initialMoves = initial.lines.map((line) => line.move);
  const legalMoveSet = new Set(legalMoves);
  for (const move of initialMoves) {
    if (!legalMoveSet.has(move)) {
      throw new Error(`teacher returned illegal initial move ${move} for parent ${parent.parent_id}`);
    }
  }

  const candidateSet = new Set(initialMoves);
  candidateSet.add(parent.played_move);
  if (candidateSet.size !== initialMoves.length + (initialMoves.includes(parent.played_move) ? 0 : 1)) {
    throw new Error(`candidate union contains duplicate moves for parent ${parent.parent_id}`);
  }
  const candidateMoves = canonicalSortedMoves(candidateSet);

  // Every candidate gets freshly rebuilt engine search state and a one-move
  // context. Canonical order makes output independent of proposal/PV ordering.
  const searches: SearchMetadata[] = [];
  for (const move of candidateMoves) {
    await engine.resetForParent();
    const result = await engine.search(parent.parent_sfen, 1, limit, [move]);
    if (
      result.lines.length !== 1 ||
      result.bestmove !== move ||
      result.lines[0].multipv !== 1 ||
      result.lines[0].move !== move
    ) {
      throw new Error(`single-move re-search did not return exactly ${move} for ${parent.parent_id}`);
    }
    searches.push(
      validateSearchMetadata(
        searchMetadata(result, limit),
        `parent ${parent.parent_id} single search ${move}`,
        true
      )
    );
  }

  const initialSet = new Set(initialMoves);
  const rankedScores = searches
    .map((search) => search.scores[0])
    .sort(compareRankedScores);
  const records = buildSiblingGroup(
    {
      game_id: parent.game_id,
      parent_id: parent.parent_id,
      position_id: parent.position_id,
      parent_sfen: parent.parent_sfen,
      parent_ply: parent.ply,
    },
    rankedScores.map((score, index) => ({
      move: score.move,
      child_sfen: childSfenAfterUsi(parent.parent_sfen, score.move),
      sources: [
        ...(score.move === parent.played_move ? ['played'] : []),
        ...(initialSet.has(score.move) ? ['teacher'] : []),
      ],
      teacher_parent_cp: score.cp,
      teacher_rank: index + 1,
      teacher_score_kind: score.score_kind,
      teacher_mate: score.mate,
      teacher_mate_sign: score.mate_sign,
    }))
  );

  const exactSearch: IndependentExactSearchMetadata = {
    mode: INDEPENDENT_EXACT_RESCORE_MODE,
    candidate_count: candidateMoves.length,
    synthesized_rank1_move: rankedScores[0].move,
    moves: rankedScores.map((score) => score.move),
    scores: rankedScores,
    searches,
    total_observed_nodes: sumObservedNodes(searches, `parent ${parent.parent_id} exact search`),
  };

  return {
    schema: SIBLING_TEACHER_WORK_SCHEMA,
    kind: 'parent',
    run_fingerprint: '',
    payload_sha256: '',
    parent_id: parent.parent_id,
    candidate_set_sha256: candidateSetSha256(candidateMoves),
    candidate_moves: candidateMoves,
    initial_search: searchMetadata(initial, limit),
    exact_search: exactSearch,
    records,
  };
}

function validateWorkEntry(
  value: unknown,
  fingerprint: string,
  parents: ReadonlyMap<string, RawParentOccurrence>,
  line: number
): WorkEntry {
  if (!value || typeof value !== 'object') throw new Error(`work line ${line} must be an object`);
  const row = value as Partial<WorkEntry>;
  if (row.schema !== SIBLING_TEACHER_WORK_SCHEMA || row.run_fingerprint !== fingerprint) {
    throw new Error(`work line ${line} belongs to a different generator run`);
  }
  const parentId = requiredText(row.parent_id, `work line ${line} parent_id`);
  const parent = parents.get(parentId);
  if (!parent) throw new Error(`work line ${line} references an unselected parent: ${parentId}`);

  if (row.kind === 'skip') {
    if (
      row.reason !== 'fewer-than-two-legal-moves' ||
      !Number.isSafeInteger(row.legal_moves) ||
      (row.legal_moves as number) < 0 ||
      (row.legal_moves as number) >= 2
    ) {
      throw new Error(`work line ${line} has invalid skip metadata`);
    }
    const entry = row as SkippedWorkEntry;
    if (entry.payload_sha256 !== workEntryPayloadSha256(entry)) {
      throw new Error(`work line ${line} payload checksum mismatch`);
    }
    const actualLegalMoves = legalMovesForParent(parent).length;
    if (entry.legal_moves !== actualLegalMoves) {
      throw new Error(`work line ${line} skip legal_moves does not match its raw parent`);
    }
    return entry;
  }
  if (row.kind !== 'parent' || !Array.isArray(row.records) || !Array.isArray(row.candidate_moves)) {
    throw new Error(`work line ${line} has an unsupported kind or missing records`);
  }
  const entry = row as CompletedWorkEntry;
  if (entry.payload_sha256 !== workEntryPayloadSha256(entry)) {
    throw new Error(`work line ${line} payload checksum mismatch`);
  }
  validateParentGroups(entry.records);
  if (entry.records.some((record) => record.parent_id !== parentId)) {
    throw new Error(`work line ${line} contains records for another parent`);
  }
  const first = entry.records[0];
  if (
    first.game_id !== parent.game_id ||
    first.parent_sfen !== parent.parent_sfen ||
    first.position_id !== parent.position_id ||
    first.parent_ply !== parent.ply
  ) {
    throw new Error(`work line ${line} does not match its raw parent`);
  }
  const moves = canonicalSortedMoves(entry.records.map((record) => record.move));
  const candidates = entry.candidate_moves.map((move) => requiredText(move, 'candidate move'));
  const initialSearch = validateSearchMetadata(entry.initial_search, `work line ${line} initial search`);
  const canonicalCandidates = canonicalSortedMoves(candidates);
  if (
    new Set(candidates).size !== candidates.length ||
    candidates.some((move, index) => move !== canonicalCandidates[index]) ||
    moves.length !== candidates.length ||
    moves.some((move, index) => move !== candidates[index]) ||
    initialSearch.moves.some((move) => !candidates.includes(move)) ||
    entry.candidate_set_sha256 !== candidateSetSha256(candidates)
  ) {
    throw new Error(`work line ${line} has inconsistent candidate metadata`);
  }
  const exactSearch = validateIndependentExactSearch(
    entry.exact_search,
    candidates,
    initialSearch.requested_limit,
    `work line ${line} exact search`
  );
  const rankedMoves = entry.records.map((record) => record.move);
  if (
    exactSearch.candidate_count !== rankedMoves.length ||
    exactSearch.moves.some((move, index) => move !== rankedMoves[index]) ||
    exactSearch.scores.length !== rankedMoves.length
  ) {
    throw new Error(`work line ${line} records do not match synthesized exact ranks`);
  }
  const playedRecords = entry.records.filter((record) => record.sources.includes('played'));
  if (playedRecords.length !== 1 || playedRecords[0].move !== parent.played_move) {
    throw new Error(`work line ${line} does not preserve exactly one played move`);
  }
  const initialMoves = new Set(initialSearch.moves);
  for (let index = 0; index < entry.records.length; index++) {
    const record = entry.records[index];
    const expectedChild = childSfenAfterUsi(parent.parent_sfen, record.move);
    if (record.child_sfen !== expectedChild || record.sfen !== expectedChild) {
      throw new Error(`work line ${line} move ${record.move} has a non-derived child SFEN`);
    }
    const expectedSources = [
      ...(record.move === parent.played_move ? ['played'] : []),
      ...(initialMoves.has(record.move) ? ['teacher'] : []),
    ];
    if (
      record.sources.length !== expectedSources.length ||
      record.sources.some((source, sourceIndex) => source !== expectedSources[sourceIndex])
    ) {
      throw new Error(`work line ${line} move ${record.move} has inconsistent sources`);
    }
    const score = exactSearch.scores[index];
    if (
      record.teacher_rank !== index + 1 ||
      record.teacher_parent_cp !== score.cp ||
      record.teacher_score_kind !== score.score_kind ||
      record.teacher_mate !== score.mate ||
      record.teacher_mate_sign !== score.mate_sign
    ) {
      throw new Error(`work line ${line} move ${record.move} disagrees with exact score metadata`);
    }
  }
  return entry;
}

function serializeWork(header: WorkHeader, entries: Iterable<WorkEntry>): string {
  const sorted = [...entries].sort((a, b) => compareBytewise(a.parent_id, b.parent_id));
  return `${[header, ...sorted].map((row) => JSON.stringify(row)).join('\n')}\n`;
}

async function loadWork(
  workPath: string,
  header: WorkHeader,
  parents: ReadonlyMap<string, RawParentOccurrence>
): Promise<Map<string, WorkEntry>> {
  let text = '';
  try {
    text = await fs.promises.readFile(workPath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const entries = new Map<string, WorkEntry>();
  if (text.trim() !== '') {
    const hadTrailingNewline = text.endsWith('\n');
    const lines = text.split('\n');
    if (lines.at(-1) === '') lines.pop();
    let parsedHeader = false;
    for (let index = 0; index < lines.length; index++) {
      let value: unknown;
      try {
        value = JSON.parse(lines[index]);
      } catch {
        if (!hadTrailingNewline && index === lines.length - 1) {
          process.stderr.write(`Discarding incomplete trailing work checkpoint line ${index + 1}.\n`);
          break;
        }
        throw new Error(`invalid work checkpoint JSON on line ${index + 1}`);
      }
      if (!parsedHeader) {
        const candidate = value as Partial<WorkHeader>;
        if (
          candidate.schema !== header.schema ||
          candidate.kind !== 'header' ||
          candidate.run_fingerprint !== header.run_fingerprint ||
          candidate.source_raw_sha256 !== header.source_raw_sha256 ||
          candidate.selected_parent_ids_sha256 !== header.selected_parent_ids_sha256 ||
          candidate.label_policy !== header.label_policy ||
          canonicalJson(candidate.pipeline) !== canonicalJson(header.pipeline)
        ) {
          throw new Error('work checkpoint header does not match this generator run');
        }
        parsedHeader = true;
        continue;
      }
      const entry = validateWorkEntry(value, header.run_fingerprint, parents, index + 1);
      if (entries.has(entry.parent_id)) {
        throw new Error(`duplicate parent in work checkpoint: ${entry.parent_id}`);
      }
      entries.set(entry.parent_id, entry);
    }
    if (!parsedHeader) throw new Error('work checkpoint has no valid header');
  }
  await atomicWrite(workPath, serializeWork(header, entries.values()));
  return entries;
}

async function appendWorkEntry(handle: fs.promises.FileHandle, entry: WorkEntry): Promise<void> {
  await handle.appendFile(`${JSON.stringify(entry)}\n`, 'utf8');
  await handle.datasync();
}

function firstError(error: unknown, parentId: string): Error {
  const message = error instanceof Error ? error.message : String(error);
  return new Error(`teacher labeling failed for parent ${parentId}: ${message}`);
}

/** Generate, resume, split, and atomically publish a sibling teacher dataset. */
export async function generateSiblingTeacherDataset(
  rawOptions: GenerateSiblingTeacherOptions,
  dependencies: GenerateSiblingTeacherDependencies = {}
): Promise<SiblingTeacherManifest> {
  const options = normalizeOptions(rawOptions);
  const repositoryDirectory = path.resolve(__dirname, '..');
  const revisionVerifier = dependencies.verifyRevision ?? ((revision: string) =>
    verifyPipelineRevision(revision, { repositoryDirectory }));
  const outputVerifier = dependencies.verifyOutputPaths ?? (
    (outputs: readonly string[], inputs: readonly string[]) =>
      verifyPipelineOutputPaths(outputs, { repositoryDirectory, inputPaths: inputs })
  );
  const pipeline = await revisionVerifier(options.pipelineRevision);
  const rawBytes = await fs.promises.readFile(options.raw);
  const allParents = parseRawParents(rawBytes.toString('utf8'));
  const selected = options.maxParents === undefined
    ? allParents
    : allParents.slice(0, options.maxParents);
  const selectedParentIdsSha256 = sha256(selected.map((parent) => parent.parent_id).join('\n'));
  const parentMap = new Map(selected.map((parent) => [parent.parent_id, parent]));

  const engineStat = await fs.promises.stat(options.engineBin);
  if (!engineStat.isFile()) throw new Error(`engineBin is not a regular file: ${options.engineBin}`);
  const engineDigest = await sha256File(options.engineBin);
  const receiptBytes = await fs.promises.readFile(options.engineReceipt);
  let receiptValue: unknown;
  try {
    receiptValue = JSON.parse(receiptBytes.toString('utf8'));
  } catch {
    throw new Error(`engine receipt is not valid JSON: ${options.engineReceipt}`);
  }
  const receipt = validateEngineReceipt(receiptValue);
  if (receipt.binary_sha256 !== engineDigest.sha256 || receipt.binary_bytes !== engineDigest.bytes) {
    throw new Error('engine receipt binary hash/size does not match --engine-bin');
  }
  const engineReceipt: SiblingTeacherManifest['teacher']['engine_receipt'] = {
    file: {
      path: path.basename(options.engineReceipt),
      bytes: receiptBytes.byteLength,
      sha256: sha256(receiptBytes),
    },
    content: receipt,
  };
  const engineArgFiles = await collectArgumentFileDigests(options.engineArgs);
  const evalFiles = options.evalDir ? await collectDirectoryDigests(options.evalDir) : [];
  if (evalFiles.some((file) => path.basename(file.path).toLowerCase() === 'eval_options.txt')) {
    throw new Error('evalDir must not contain eval_options.txt because it can override fixed options');
  }
  const evalSha256 = options.evalDir
    ? sha256(`eval-tree-v1\0${evalFiles.map((file) => canonicalJson(file)).join('\n')}`)
    : null;
  const sourceRawSha256 = sha256(rawBytes);
  const protectedInputPaths = [
    options.raw,
    options.engineBin,
    options.engineReceipt,
    ...engineArgFiles.map((file) => path.resolve(file.path)),
    ...(options.evalDir
      ? evalFiles.map((file) => path.join(options.evalDir as string, file.path))
      : []),
  ];
  const outputPaths = [options.outTrain, options.outVal, options.manifest, options.work];
  await outputVerifier(
    outputPaths,
    protectedInputPaths
  );
  const runFingerprint = sha256(canonicalJson({
    schema: SIBLING_TEACHER_WORK_SCHEMA,
    source_raw_sha256: sourceRawSha256,
    selected_parent_ids_sha256: selectedParentIdsSha256,
    label_policy: SIBLING_TEACHER_LABEL_POLICY,
    pipeline,
    engine_bin_sha256: engineDigest.sha256,
    engine_args: options.engineArgs,
    engine_arg_files: engineArgFiles,
    engine_receipt_sha256: engineReceipt.file.sha256,
    engine_receipt: engineReceipt.content,
    eval_sha256: evalSha256,
    multipv: options.multipv,
    limit: options.limit,
    exact_rescore_mode: INDEPENDENT_EXACT_RESCORE_MODE,
    candidate_execution_order: 'utf8-bytewise-ascending',
    synthesized_rank_order: 'cp-descending-then-utf8-bytewise-move',
    search_state_reset: 'isready',
    runtime_snapshot: SIBLING_TEACHER_RUNTIME_SNAPSHOT_CONTRACT,
    fv_scale: options.fvScale,
    hash_mb_per_engine: options.hashMb,
    engine_options: USI_TEACHER_ENGINE_CONTRACT,
  }));
  const header: WorkHeader = {
    schema: SIBLING_TEACHER_WORK_SCHEMA,
    kind: 'header',
    run_fingerprint: runFingerprint,
    source_raw_sha256: sourceRawSha256,
    selected_parent_ids_sha256: selectedParentIdsSha256,
    label_policy: SIBLING_TEACHER_LABEL_POLICY,
    pipeline,
  };
  const workEntries = await loadWork(options.work, header, parentMap);
  const runtimeSnapshot = await createRuntimeSnapshot(
    options,
    engineDigest,
    engineArgFiles,
    evalFiles
  );
  let workHandle: fs.promises.FileHandle;
  try {
    workHandle = await fs.promises.open(options.work, 'a');
  } catch (error) {
    await fs.promises.rm(runtimeSnapshot.root, { recursive: true, force: true });
    throw error;
  }
  let appendTail: Promise<void> = Promise.resolve();
  let checkpointFailure: Error | null = null;
  const persist = async (entry: WorkEntry): Promise<void> => {
    const operation = appendTail.then(async () => {
      if (checkpointFailure) throw checkpointFailure;
      try {
        await appendWorkEntry(workHandle, entry);
      } catch (error) {
        checkpointFailure = error instanceof Error ? error : new Error(String(error));
        throw checkpointFailure;
      }
    });
    appendTail = operation.catch(() => undefined);
    await operation;
    workEntries.set(entry.parent_id, entry);
  };

  let failure: Error | null = null;
  const pending: Array<{ parent: RawParentOccurrence; legalMoves: string[] }> = [];
  try {
    for (const parent of selected) {
      if (workEntries.has(parent.parent_id)) continue;
      const legalMoves = legalMovesForParent(parent);
      if (legalMoves.length < 2) {
        await persist(sealWorkEntry({
          schema: SIBLING_TEACHER_WORK_SCHEMA,
          kind: 'skip',
          run_fingerprint: runFingerprint,
          parent_id: parent.parent_id,
          reason: 'fewer-than-two-legal-moves',
          legal_moves: legalMoves.length,
        }));
      } else {
        pending.push({ parent, legalMoves });
      }
    }

    let next = 0;
    const workerCount = Math.min(options.engines, pending.length);
    const workers = Array.from({ length: workerCount }, async (_, workerIndex) => {
      const workerCwd = path.join(runtimeSnapshot.cwd, `worker-${workerIndex}`);
      await fs.promises.mkdir(workerCwd, { mode: 0o700 });
      const engine = new UsiTeacherEngine({
        engineBin: runtimeSnapshot.engineBin,
        engineArgs: runtimeSnapshot.engineArgs,
        evalDir: runtimeSnapshot.evalDir,
        cwd: workerCwd,
        fvScale: options.fvScale,
        hashMb: options.hashMb,
        timeoutMs: options.timeoutMs,
      });
      try {
        await engine.init();
        while (!failure) {
          const index = next++;
          const job = pending[index];
          if (!job) break;
          try {
            const result = await labelSiblingParent(
              engine,
              job.parent,
              options.multipv,
              options.limit,
              job.legalMoves
            );
            result.run_fingerprint = runFingerprint;
            const sealed = sealWorkEntry(result as unknown as Record<string, unknown>);
            const validated = validateWorkEntry(sealed, runFingerprint, parentMap, 0);
            await persist(validated);
          } catch (error) {
            failure ??= firstError(error, job.parent.parent_id);
          }
        }
      } catch (error) {
        failure ??= new Error(`USI worker initialization failed: ${error instanceof Error ? error.message : error}`);
      } finally {
        await engine.quit();
      }
    });
    await Promise.all(workers);
    await appendTail;
  } finally {
    await appendTail.catch(() => undefined);
    try {
      await workHandle.close();
    } finally {
      await fs.promises.rm(runtimeSnapshot.root, { recursive: true, force: true });
    }
  }
  if (failure) throw failure;

  const canonicalWork = serializeWork(header, workEntries.values());
  await atomicWrite(options.work, canonicalWork);
  const completed = [...workEntries.values()]
    .filter((entry): entry is CompletedWorkEntry => entry.kind === 'parent')
    .sort((a, b) => compareBytewise(a.parent_id, b.parent_id));
  const skipped = [...workEntries.values()].filter((entry) => entry.kind === 'skip');
  if (completed.length === 0) throw new Error('no parent produced a sibling group');
  if (workEntries.size !== selected.length) {
    throw new Error(`work checkpoint is incomplete (${workEntries.size}/${selected.length} parents)`);
  }

  const records = completed.flatMap((entry) => entry.records);
  validateParentGroups(records);
  const split = splitSiblingDataset(records, { seed: options.seed, valRatio: options.valRatio });
  const trainJsonl = serializeJsonl(split.train);
  const valJsonl = serializeJsonl(split.val);
  const candidateCounts = completed.map((entry) => entry.candidate_moves.length);
  const candidateLock = completed
    .map((entry) => `${entry.parent_id}\0${entry.candidate_set_sha256}\0${entry.candidate_moves.length}`)
    .join('\n');

  const manifest: SiblingTeacherManifest = {
    schema: SIBLING_TEACHER_MANIFEST_SCHEMA,
    record_manifest_schema: SIBLING_MANIFEST_SCHEMA,
    pipeline,
    source: {
      raw_sha256: sourceRawSha256,
      raw_records: allParents.length,
      selected_parents: selected.length,
      selected_parent_ids_sha256: selectedParentIdsSha256,
    },
    teacher: {
      engine_bin_sha256: engineDigest.sha256,
      engine_bin_bytes: engineDigest.bytes,
      engine_args: [...options.engineArgs],
      engine_arg_files: engineArgFiles,
      engine_receipt: engineReceipt,
      eval_sha256: evalSha256,
      eval_files: evalFiles,
      runtime_snapshot: {
        ...SIBLING_TEACHER_RUNTIME_SNAPSHOT_CONTRACT,
        engine_argument_file_count: engineArgFiles.length,
        eval_tree_present: options.evalDir !== undefined,
      },
    },
    search: {
      multipv: options.multipv,
      limit: 'nodes' in options.limit
        ? { nodes: options.limit.nodes as number }
        : { depth: options.limit.depth as number },
      parallel_engines: options.engines,
      fv_scale: options.fvScale,
      hash_mb_per_engine: options.hashMb,
      timeout_ms: options.timeoutMs,
      exact_rescore_mode: INDEPENDENT_EXACT_RESCORE_MODE,
      label_policy: SIBLING_TEACHER_LABEL_POLICY,
      tt_reset_before_proposal: true,
      tt_reset_before_each_candidate: true,
      search_state_reset_before_proposal: 'isready',
      search_state_reset_before_each_candidate: 'isready',
      candidate_execution_order: 'utf8-bytewise-ascending',
      synthesized_rank_order: 'cp-descending-then-utf8-bytewise-move',
      engine_options: USI_TEACHER_ENGINE_CONTRACT,
    },
    candidate_sets: {
      sha256: sha256(`candidate-sets-v1\0${candidateLock}`),
      parents: completed.length,
      candidates: candidateCounts.reduce((sum, count) => sum + count, 0),
      min_candidates: Math.min(...candidateCounts),
      max_candidates: Math.max(...candidateCounts),
      skipped_parents: skipped.length,
    },
    progress_checkpoint: {
      schema: SIBLING_TEACHER_WORK_SCHEMA,
      run_fingerprint: runFingerprint,
      entries: workEntries.size,
      completed_parents: completed.length,
      skipped_parents: skipped.length,
      sha256: sha256(canonicalWork),
    },
    split: split.manifest,
    outputs: {
      train_sha256: sha256(trainJsonl),
      val_sha256: sha256(valJsonl),
      train_bytes: Buffer.byteLength(trainJsonl),
      val_bytes: Buffer.byteLength(valJsonl),
    },
  };

  // Re-check immediately before the manifest-committed publication boundary.
  const finalPipeline = await revisionVerifier(options.pipelineRevision);
  if (canonicalJson(finalPipeline) !== canonicalJson(pipeline)) {
    throw new Error('pipeline provenance changed during teacher generation');
  }
  await outputVerifier(outputPaths, protectedInputPaths);
  // No final file is touched until every label, resume check, and split check succeeds.
  await atomicWrite(options.outTrain, trainJsonl);
  await atomicWrite(options.outVal, valJsonl);
  await atomicWrite(options.manifest, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

interface CliArgs extends GenerateSiblingTeacherOptions {
  help: boolean;
}

function parseCliArgs(argv: readonly string[]): CliArgs {
  if (argv.includes('--help') || argv.includes('-h')) {
    return {
      help: true,
      raw: '',
      engineBin: '',
      pipelineRevision: '',
      engineReceipt: '',
      outTrain: '',
      outVal: '',
      manifest: '',
      work: '',
    };
  }
  const values = new Map<string, string>();
  const engineArgs: string[] = [];
  const flags = new Set([
    'raw',
    'engine-bin',
    'pipeline-revision',
    'engine-receipt',
    'eval-dir',
    'multipv',
    'nodes',
    'depth',
    'engines',
    'seed',
    'val-ratio',
    'out-train',
    'out-val',
    'manifest',
    'work',
    'max-parents',
    'fv-scale',
    'hash-mb',
    'timeout-ms',
  ]);
  for (let index = 0; index < argv.length; index++) {
    const token = argv[index];
    if (!token.startsWith('--')) throw new Error(`unexpected argument: ${token}`);
    const name = token.slice(2);
    if (name === 'engine-arg') {
      if (index + 1 >= argv.length) throw new Error('--engine-arg requires a value');
      engineArgs.push(argv[++index]);
      continue;
    }
    if (!flags.has(name)) throw new Error(`unknown option: --${name}`);
    if (values.has(name)) throw new Error(`duplicate option: --${name}`);
    const value = argv[++index];
    if (!value || value.startsWith('--')) throw new Error(`--${name} requires a value`);
    values.set(name, value);
  }
  const required = (name: string): string => {
    const value = values.get(name);
    if (!value) throw new Error(`--${name} is required`);
    return value;
  };
  const number = (name: string): number | undefined => {
    const value = values.get(name);
    return value === undefined ? undefined : Number(value);
  };
  return {
    help: false,
    raw: required('raw'),
    engineBin: required('engine-bin'),
    pipelineRevision: required('pipeline-revision'),
    engineArgs,
    engineReceipt: required('engine-receipt'),
    evalDir: values.get('eval-dir'),
    multipv: number('multipv'),
    nodes: number('nodes'),
    depth: number('depth'),
    engines: number('engines'),
    seed: values.get('seed'),
    valRatio: number('val-ratio'),
    outTrain: required('out-train'),
    outVal: required('out-val'),
    manifest: required('manifest'),
    work: required('work'),
    maxParents: number('max-parents'),
    fvScale: number('fv-scale'),
    hashMb: number('hash-mb'),
    timeoutMs: number('timeout-ms'),
  };
}

const USAGE = `Usage:
  node -r tsx/cjs ml/generate-sibling-teacher.ts \\
    --raw <parents.raw.jsonl> \\
    --pipeline-revision <git-commit> \\
    --engine-bin <yaneuraou> --engine-receipt <build-receipt.json> \\
    --eval-dir <eval-directory> \\
    --depth 12 --multipv 12 --engines 12 \\
    --out-train <train.jsonl> --out-val <val.jsonl> \\
    --manifest <manifest.json> --work <progress.jsonl>

Required:
  --raw <jsonl>          Raw parent occurrences from import-csa-games.ts.
  --pipeline-revision <commit>  Clean Git HEAD used to produce the labels.
  --engine-bin <file>    USI engine executable.
  --engine-receipt <json>  Build/source receipt; verified against the executable.
  --depth <n>            Fixed-depth search (recommended for exact MultiPV), or
  --nodes <n>            fixed-node search; exactly one search limit is required.
  --out-train <jsonl>    Atomically published training split.
  --out-val <jsonl>      Atomically published validation split.
  --manifest <json>      Checksums, search contract, split, and checkpoint report.
  --work <jsonl>         Durable per-parent resume checkpoint.

Options:
  --eval-dir <dir>       Evaluation files; the deterministic tree SHA is recorded.
  --engine-arg <value>   Repeatable USI process argument (values may start with --).
  --multipv <n>          Initial teacher candidate count (default: 12).
  --engines <n>          Parallel one-thread engine processes (default: 1).
  --seed <text>          Stable game split seed (default: 42).
  --val-ratio <0..1>     Validation game fraction, exclusive bounds (default: 0.1).
  --max-parents <n>      Label only the first n parent_ids after stable sorting.
  --fv-scale <n>         Engine FV_SCALE (default: 20).
  --hash-mb <n>          USI_Hash per engine in MiB (default: 128).
  --timeout-ms <n>       Timeout per USI search (default: 120000).
`;

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<void> {
  const args = parseCliArgs(argv);
  if (args.help) {
    process.stdout.write(USAGE);
    return;
  }
  const manifest = await generateSiblingTeacherDataset(args);
  process.stdout.write(
    `Labeled ${manifest.candidate_sets.parents} parent(s), ` +
    `${manifest.candidate_sets.candidates} sibling(s); ` +
    `train=${manifest.split.stats.train_records}, val=${manifest.split.stats.val_records}\n`
  );
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
