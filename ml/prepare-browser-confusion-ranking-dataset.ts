/**
 * Verify, combine, deduplicate, and split browser-confusion ranking shards.
 *
 * Every input shard is bound by the immutable receipt emitted by
 * build-browser-confusion-ranking-teacher.ts.  Validation wins every semantic
 * train/validation conflict, where a semantic set is the union of a parent
 * position and all of its child positions.  Outputs are published by one
 * directory rename only after every check has passed.
 */

import { createHash } from 'node:crypto';
import { TextDecoder } from 'node:util';
import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  BROWSER_CONFUSION_PARENT_SCHEMA,
  BROWSER_CONFUSION_RECEIPT_SCHEMA,
  BROWSER_CONFUSION_SELECTION_POLICY,
  ALL_LEGAL_RESCORE_POLICY,
  INCOMPLETE_PARENT_POLICY,
  parseSourceTeacherRow,
  validateAuditedSourceManifestValue,
  type SourceTeacherRow,
} from './build-browser-confusion-ranking-teacher';
import {
  assignGameSplit,
  assertSplitIsolation,
  compareBytewise,
  positionKeyFromSfen,
  validateParentGroups,
  type SiblingRecord,
} from './sibling-data';
import {
  childSfenAfterUsi,
  positionFromSfen,
  rulesCompleteLegalMoves,
} from './shogi-sfen';
import { USI_TEACHER_ENGINE_CONTRACT } from './usi-engine';
import {
  FLOODGATE_EXCLUSIVE_DIRECTORY_RENAME_CONTRACT,
  exclusiveRenameFloodgateDirectory,
  type FloodgateExclusiveDirectoryRenameReceipt,
  type FloodgateExclusiveDirectorySourceHandle,
} from './floodgate-exclusive-directory-rename';

export const BROWSER_CONFUSION_DATASET_MANIFEST_SCHEMA =
  'shogi-browser-confusion-ranking-dataset-manifest-v1' as const;
export const BROWSER_CONFUSION_DATASET_STATUS =
  'research-data-only-not-deployment-authorization' as const;
export const BROWSER_CONFUSION_DATASET_SPLIT_ALGORITHM =
  'sha256-game-assignment-validation-semantic-union-priority-v1' as const;
export const BROWSER_CONFUSION_DATASET_DEDUPE_POLICY =
  'position-id-identical-content-canonical-parent-id-v1' as const;
export const BROWSER_CONFUSION_PARITY_POLICY =
  'sha256-seed-position-id-first-64-validation-parents-v1' as const;

const EXPECTED_RECORD_SOURCE = 'all-legal-fixed-depth-teacher';
const SHA256_RE = /^[0-9a-f]{64}$/;
const POSITION_ID_RE = /^sha256:[0-9a-f]{64}$/;
const UTF8 = new TextDecoder('utf-8', { fatal: true });

export interface FileIdentity {
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
}

export interface PrepareBrowserConfusionDatasetOptions {
  readonly shardDirs: readonly string[];
  readonly evalDir: string;
  readonly expectedParentCounts: readonly number[];
  readonly splitSeed: string;
  readonly valRatio: number;
  readonly outDir: string;
  readonly browserDepth?: number;
  readonly teacherDepth?: number;
  readonly parityPositions?: number;
}

interface ParentEvidence {
  readonly schema: typeof BROWSER_CONFUSION_PARENT_SCHEMA;
  readonly source_line: number;
  readonly game_id: string;
  readonly parent_id: string;
  readonly position_id: string;
  readonly parent_sfen: string;
  readonly parent_ply: number;
  readonly legal_moves: readonly string[];
  readonly source_teacher: Readonly<{ cp: number; bestmove: string; depth: number }>;
  readonly records: readonly SiblingRecord[];
}

interface ParentGroup {
  readonly parentId: string;
  readonly gameId: string;
  readonly positionId: string;
  readonly parentSfen: string;
  readonly records: readonly SiblingRecord[];
  readonly evidence: ParentEvidence;
}

interface VerifiedShard {
  readonly index: number;
  readonly total: number;
  readonly directory: string;
  readonly receipt: FileIdentity;
  readonly dataset: FileIdentity & {
    readonly records: number;
    readonly parents: number;
    readonly games: number;
  };
  readonly parentEvidence: FileIdentity & { readonly records: number };
  readonly commonBinding: unknown;
  readonly sourceIdentity: FileIdentity;
  readonly declaredSourceRows: number;
  readonly sourceAccounting: Readonly<Record<string, number>>;
  readonly groups: readonly ParentGroup[];
}

function sha256(value: Uint8Array | string): string {
  return createHash('sha256').update(value).digest('hex');
}

function exactInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value)) throw new Error(`${label} must be a safe integer`);
  return value as number;
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort(compareBytewise)
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(',')}}`;
}

function exactObject(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exactText(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value) {
    throw new Error(`${label} must be non-empty canonical text`);
  }
  return value;
}

function safeInteger(value: unknown, label: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    throw new Error(`${label} must be a safe integer >= ${minimum}`);
  }
  return value as number;
}

function exactBoolean(value: unknown, expected: boolean, label: string): void {
  if (value !== expected) throw new Error(`${label} must be ${String(expected)}`);
}

function exactLiteral(value: unknown, expected: unknown, label: string): void {
  if (canonicalJson(value) !== canonicalJson(expected)) {
    throw new Error(`${label} does not match the required contract`);
  }
}

function strictSha(value: unknown, label: string): string {
  if (typeof value !== 'string' || !SHA256_RE.test(value)) {
    throw new Error(`${label} must be a lowercase SHA-256`);
  }
  return value;
}

const IDENTITY_CACHE = new Map<string, FileIdentity>();
const TREE_IDENTITY_CACHE = new Map<
  string,
  Readonly<{ files: number; bytes: number; sha256: string }>
>();

function fileIdentity(file: string): FileIdentity {
  const resolved = path.resolve(file);
  const cached = IDENTITY_CACHE.get(resolved);
  if (cached) return cached;
  const stat = fs.lstatSync(resolved);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new Error(`identity path must be a regular non-symlink file: ${resolved}`);
  }
  const hash = createHash('sha256');
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  const descriptor = fs.openSync(resolved, 'r');
  let bytes = 0;
  try {
    for (;;) {
      const count = fs.readSync(descriptor, buffer, 0, buffer.byteLength, null);
      if (count === 0) break;
      hash.update(buffer.subarray(0, count));
      bytes += count;
    }
  } finally {
    fs.closeSync(descriptor);
  }
  if (bytes !== stat.size) throw new Error(`file changed while hashing: ${resolved}`);
  const identity = { path: resolved, bytes, sha256: hash.digest('hex') };
  IDENTITY_CACHE.set(resolved, identity);
  return identity;
}

function validateRecordedIdentity(
  value: unknown,
  actualPath: string,
  label: string
): FileIdentity {
  const record = exactObject(value, label);
  const actual = fileIdentity(actualPath);
  if (path.resolve(exactText(record.path, `${label}.path`)) !== actual.path) {
    throw new Error(`${label}.path does not bind the expected file`);
  }
  if (safeInteger(record.bytes, `${label}.bytes`) !== actual.bytes) {
    throw new Error(`${label}.bytes does not match the file`);
  }
  if (strictSha(record.sha256, `${label}.sha256`) !== actual.sha256) {
    throw new Error(`${label}.sha256 does not match the file`);
  }
  return actual;
}

function validateExternalRecordedIdentity(value: unknown, label: string): FileIdentity {
  const record = exactObject(value, label);
  return validateRecordedIdentity(record, exactText(record.path, `${label}.path`), label);
}

function treeIdentity(rootValue: string): Readonly<{ files: number; bytes: number; sha256: string }> {
  const root = path.resolve(rootValue);
  const cached = TREE_IDENTITY_CACHE.get(root);
  if (cached) return cached;
  const rootStat = fs.lstatSync(root);
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
    throw new Error(`eval root must be a non-symlink directory: ${root}`);
  }
  const files: string[] = [];
  const visit = (directory: string): void => {
    const entries = fs.readdirSync(directory, { withFileTypes: true });
    entries.sort((left, right) => compareBytewise(left.name, right.name));
    for (const entry of entries) {
      const child = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`eval tree contains symlink: ${child}`);
      if (entry.isDirectory()) visit(child);
      else if (entry.isFile()) files.push(child);
      else throw new Error(`eval tree contains unsupported entry: ${child}`);
    }
  };
  visit(root);
  const hash = createHash('sha256').update('browser-confusion-eval-tree-v1\0');
  let bytes = 0;
  for (const file of files) {
    const identity = fileIdentity(file);
    const relative = path.relative(root, file).split(path.sep).join('/');
    hash.update(`${relative}\0${identity.bytes}\0${identity.sha256}\n`);
    bytes += identity.bytes;
  }
  const identity = { files: files.length, bytes, sha256: hash.digest('hex') };
  TREE_IDENTITY_CACHE.set(root, identity);
  return identity;
}

function strictCanonicalJsonFile(file: string, label: string): unknown {
  const payload = fs.readFileSync(file);
  let text: string;
  try {
    text = UTF8.decode(payload);
  } catch (error) {
    throw new Error(`${label} is not valid UTF-8: ${String(error)}`);
  }
  if (!text.endsWith('\n') || text.slice(0, -1).includes('\n')) {
    throw new Error(`${label} must contain exactly one LF-terminated JSON value`);
  }
  let value: unknown;
  try {
    value = JSON.parse(text.slice(0, -1));
  } catch (error) {
    throw new Error(`${label} is invalid JSON: ${String(error)}`);
  }
  if (`${canonicalJson(value)}\n` !== text) {
    throw new Error(`${label} is not canonical JSON`);
  }
  return value;
}

function strictCanonicalJsonl(file: string, label: string): unknown[] {
  const payload = fs.readFileSync(file);
  let text: string;
  try {
    text = UTF8.decode(payload);
  } catch (error) {
    throw new Error(`${label} is not valid UTF-8: ${String(error)}`);
  }
  if (!text.endsWith('\n') || text === '\n') {
    throw new Error(`${label} must be a non-empty LF-terminated JSONL file`);
  }
  const lines = text.slice(0, -1).split('\n');
  return lines.map((line, index) => {
    if (!line) throw new Error(`${label} line ${index + 1} is blank`);
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch (error) {
      throw new Error(`${label} line ${index + 1} is invalid JSON: ${String(error)}`);
    }
    if (canonicalJson(value) !== line) {
      throw new Error(`${label} line ${index + 1} is not canonical JSON`);
    }
    return value;
  });
}

function canonicalPositionSfen(sfen: string): string {
  const fields = sfen.split(' ');
  if (fields.length !== 4) throw new Error(`invalid four-field SFEN: ${sfen}`);
  return fields.slice(0, 3).join(' ');
}

function validateParentEvidence(
  value: unknown,
  label: string,
  browserDepth: number,
  teacherDepth: number
): ParentEvidence {
  const envelope = exactObject(value, label);
  const record = exactObject(envelope.parent, `${label}.parent`);
  if (record.schema !== BROWSER_CONFUSION_PARENT_SCHEMA) {
    throw new Error(`${label}.schema mismatch`);
  }
  const parentSfen = exactText(record.parent_sfen, `${label}.parent_sfen`);
  const positionId = exactText(record.position_id, `${label}.position_id`);
  if (!POSITION_ID_RE.test(positionId) || positionId !== positionKeyFromSfen(parentSfen)) {
    throw new Error(`${label}.position_id does not match parent_sfen`);
  }
  const legalMovesValue = record.legal_moves;
  if (!Array.isArray(legalMovesValue) || legalMovesValue.length < 2) {
    throw new Error(`${label}.legal_moves must contain at least two moves`);
  }
  const legalMoves = legalMovesValue.map((move, index) =>
    exactText(move, `${label}.legal_moves[${index}]`)
  );
  const sortedLegal = [...new Set(legalMoves)].sort(compareBytewise);
  if (canonicalJson(legalMoves) !== canonicalJson(sortedLegal)) {
    throw new Error(`${label}.legal_moves must be unique canonical byte order`);
  }
  const parsed = positionFromSfen(parentSfen);
  const parentPly = safeInteger(record.parent_ply, `${label}.parent_ply`);
  if (parentPly !== parsed.moveNumber - 1) {
    throw new Error(`${label}.parent_ply does not match parent_sfen`);
  }
  const actualLegalMoves = rulesCompleteLegalMoves(parsed.position)
    .map((entry) => entry.usi)
    .sort(compareBytewise);
  if (canonicalJson(legalMoves) !== canonicalJson(actualLegalMoves)) {
    throw new Error(`${label}.legal_moves is not the complete rules-derived legal set`);
  }
  const sourceTeacher = exactObject(record.source_teacher, `${label}.parent.source_teacher`);
  const browser = exactObject(record.browser, `${label}.parent.browser`);
  const sourceMove = exactText(sourceTeacher.bestmove, `${label}.parent.source_teacher.bestmove`);
  const browserMove = exactText(browser.bestmove, `${label}.parent.browser.bestmove`);
  if (!legalMoves.includes(sourceMove) || !legalMoves.includes(browserMove)) {
    throw new Error(`${label} contains an illegal source/browser best move`);
  }
  if (sourceMove === browserMove) throw new Error(`${label} is not a browser confusion parent`);
  exactInteger(sourceTeacher.cp, `${label}.parent.source_teacher.cp`);
  safeInteger(sourceTeacher.depth, `${label}.parent.source_teacher.depth`, 1);
  exactInteger(browser.score, `${label}.parent.browser.score`);
  if (
    safeInteger(browser.completed_depth, `${label}.parent.browser.completed_depth`, 1) !==
    browserDepth
  ) {
    throw new Error(`${label}.parent.browser.completed_depth is not ${browserDepth}`);
  }
  safeInteger(browser.nodes, `${label}.parent.browser.nodes`);
  safeInteger(browser.leaves, `${label}.parent.browser.leaves`);

  if (!Array.isArray(envelope.records) || !Array.isArray(envelope.candidates)) {
    throw new Error(`${label} must contain candidate and record arrays`);
  }
  const records = envelope.records as SiblingRecord[];
  const summaries = validateParentGroups(records);
  if (summaries.length !== 1 || records.some((row) => row.split !== undefined)) {
    throw new Error(`${label}.records must contain one unsplit parent group`);
  }
  const candidates = envelope.candidates.map((candidate, index) => {
    const entry = exactObject(candidate, `${label}.candidates[${index}]`);
    const move = exactText(entry.move, `${label}.candidates[${index}].move`);
    const childSfen = exactText(entry.child_sfen, `${label}.candidates[${index}].child_sfen`);
    if (!legalMoves.includes(move) || childSfen !== childSfenAfterUsi(parentSfen, move)) {
      throw new Error(`${label}.candidates[${index}] does not bind a legal child`);
    }
    const teacherParentCp = exactInteger(
      entry.teacher_parent_cp,
      `${label}.candidates[${index}].teacher_parent_cp`
    );
    const teacherChildCp = exactInteger(
      entry.teacher_child_cp,
      `${label}.candidates[${index}].teacher_child_cp`
    );
    if (teacherChildCp !== (teacherParentCp === 0 ? 0 : -teacherParentCp)) {
      throw new Error(`${label}.candidates[${index}] has inconsistent parent/child cp`);
    }
    const teacherRank = safeInteger(
      entry.teacher_rank,
      `${label}.candidates[${index}].teacher_rank`,
      1
    );
    if (teacherRank !== index + 1) {
      throw new Error(`${label}.candidates must be in contiguous teacher-rank order`);
    }
    const scoreKind = entry.score_kind;
    if (scoreKind !== 'cp' && scoreKind !== 'mate') {
      throw new Error(`${label}.candidates[${index}].score_kind is invalid`);
    }
    const completedDepth = safeInteger(
      entry.completed_depth,
      `${label}.candidates[${index}].completed_depth`,
      1
    );
    if (entry.termination === 'requested-depth-complete') {
      if (completedDepth !== teacherDepth) {
        throw new Error(`${label}.candidates[${index}] did not complete teacher depth`);
      }
    } else if (entry.termination === 'terminal-mate-before-requested-depth') {
      if (scoreKind !== 'mate' || completedDepth >= teacherDepth) {
        throw new Error(`${label}.candidates[${index}] has invalid terminal-mate evidence`);
      }
    } else {
      throw new Error(`${label}.candidates[${index}].termination is invalid`);
    }
    safeInteger(entry.observed_nodes, `${label}.candidates[${index}].observed_nodes`);
    if (!Array.isArray(entry.pv) || entry.pv.length < 1) {
      throw new Error(`${label}.candidates[${index}].pv must be non-empty`);
    }
    let pvSfen = childSfen;
    entry.pv.forEach((moveValue, pvIndex) => {
      const pvMove = exactText(moveValue, `${label}.candidates[${index}].pv[${pvIndex}]`);
      const legalPvMoves = rulesCompleteLegalMoves(positionFromSfen(pvSfen).position).map(
        (legal) => legal.usi
      );
      if (!legalPvMoves.includes(pvMove)) {
        throw new Error(`${label}.candidates[${index}].pv[${pvIndex}] is illegal`);
      }
      pvSfen = childSfenAfterUsi(pvSfen, pvMove);
    });
    if (scoreKind === 'mate') {
      const mate = exactInteger(entry.mate, `${label}.candidates[${index}].mate`);
      if (mate === 0 || (entry.mate_sign !== 1 && entry.mate_sign !== -1)) {
        throw new Error(`${label}.candidates[${index}] has invalid mate metadata`);
      }
      if ((mate > 0 ? 1 : -1) !== entry.mate_sign) {
        throw new Error(`${label}.candidates[${index}] has contradictory mate sign`);
      }
    } else if (entry.mate !== undefined || entry.mate_sign !== undefined) {
      throw new Error(`${label}.candidates[${index}] has mate metadata for a cp score`);
    }
    return {
      move,
      childSfen,
      teacherParentCp,
      teacherChildCp,
      teacherRank,
      scoreKind,
      mate: entry.mate,
      mateSign: entry.mate_sign,
    };
  });
  if (
    canonicalJson(candidates.map((candidate) => candidate.move).sort(compareBytewise)) !==
    canonicalJson(legalMoves)
  ) {
    throw new Error(`${label}.candidates does not cover every legal move exactly once`);
  }
  const recomputedRankOrder = [...candidates].sort(
    (left, right) =>
      right.teacherParentCp - left.teacherParentCp || compareBytewise(left.move, right.move)
  );
  recomputedRankOrder.forEach((candidate, index) => {
    if (candidate.teacherRank !== index + 1) {
      throw new Error(`${label} candidate ranks violate parent-cp/move byte order`);
    }
  });
  const rowByMove = new Map(records.map((row) => [row.move, row]));
  if (rowByMove.size !== candidates.length) {
    throw new Error(`${label}.records and candidates are not one-to-one`);
  }
  for (const candidate of candidates) {
    const row = rowByMove.get(candidate.move);
    if (
      !row ||
      row.child_sfen !== candidate.childSfen ||
      row.teacher_parent_cp !== candidate.teacherParentCp ||
      row.teacher_child_cp !== candidate.teacherChildCp ||
      row.teacher_rank !== candidate.teacherRank ||
      row.teacher_score_kind !== candidate.scoreKind ||
      row.teacher_mate !== candidate.mate ||
      row.teacher_mate_sign !== candidate.mateSign
    ) {
      throw new Error(`${label} candidate ${candidate.move} does not match its ranking record`);
    }
  }
  return {
    schema: BROWSER_CONFUSION_PARENT_SCHEMA,
    source_line: safeInteger(record.source_line, `${label}.source_line`, 1),
    game_id: exactText(record.game_id, `${label}.game_id`),
    parent_id: exactText(record.parent_id, `${label}.parent_id`),
    position_id: positionId,
    parent_sfen: parentSfen,
    parent_ply: parentPly,
    legal_moves: legalMoves,
    source_teacher: {
      cp: sourceTeacher.cp as number,
      bestmove: sourceMove,
      depth: sourceTeacher.depth as number,
    },
    records,
  };
}

function validateGroupContract(group: readonly SiblingRecord[], evidence: ParentEvidence): void {
  validateParentGroups(group);
  exactLiteral(group, evidence.records, `parent ${evidence.parent_id} ranking/evidence records`);
  const first = group[0];
  if (
    first.parent_id !== evidence.parent_id ||
    first.game_id !== evidence.game_id ||
    first.position_id !== evidence.position_id ||
    first.parent_sfen !== evidence.parent_sfen ||
    first.parent_ply !== evidence.parent_ply
  ) {
    throw new Error(`parent ${evidence.parent_id} does not match parent evidence`);
  }
  if (group.some((row) => row.split !== undefined)) {
    throw new Error(`parent ${evidence.parent_id} unexpectedly declares a split`);
  }
  if (
    group.some(
      (row) =>
        row.sources.length !== 1 || row.sources[0] !== EXPECTED_RECORD_SOURCE
    )
  ) {
    throw new Error(`parent ${evidence.parent_id} has an unexpected row source`);
  }
  const moves = group.map((row) => row.move).sort(compareBytewise);
  if (canonicalJson(moves) !== canonicalJson(evidence.legal_moves)) {
    throw new Error(`parent ${evidence.parent_id} does not cover its recorded legal moves`);
  }
  for (const row of group) {
    if (row.child_sfen !== childSfenAfterUsi(evidence.parent_sfen, row.move)) {
      throw new Error(`parent ${evidence.parent_id} move ${row.move} has an invalid child SFEN`);
    }
  }
}

function validateCommonReceiptContract(
  receipt: Record<string, unknown>,
  browserDepth: number,
  teacherDepth: number,
  evalIdentity: Readonly<{ files: number; bytes: number; sha256: string }>
): {
  readonly commonBinding: unknown;
  readonly sourceAccounting: Readonly<Record<string, number>>;
  readonly sourceIdentity: FileIdentity;
  readonly declaredSourceRows: number;
} {
  if (receipt.schema !== BROWSER_CONFUSION_RECEIPT_SCHEMA) {
    throw new Error('receipt schema mismatch');
  }
  if (receipt.status !== BROWSER_CONFUSION_DATASET_STATUS) {
    throw new Error('receipt status mismatch');
  }
  if (receipt.selection_policy !== BROWSER_CONFUSION_SELECTION_POLICY) {
    throw new Error('receipt selection policy mismatch');
  }
  if (receipt.label_policy !== ALL_LEGAL_RESCORE_POLICY) {
    throw new Error('receipt label policy mismatch');
  }
  if (receipt.incomplete_parent_policy !== INCOMPLETE_PARENT_POLICY) {
    throw new Error('receipt incomplete-parent policy mismatch');
  }
  const source = exactObject(receipt.source, 'receipt.source');
  const audit = exactObject(source.audit_manifest, 'receipt.source.audit_manifest');
  const browser = exactObject(receipt.browser, 'receipt.browser');
  const teacher = exactObject(receipt.teacher, 'receipt.teacher');
  const evalTree = exactObject(teacher.eval_tree, 'receipt.teacher.eval_tree');
  const sourceAccounting: Record<string, number> = {};
  for (const field of (
    [
      'scanned_rows',
      'shard_eligible_rows',
      'rejected_invalid_rows',
      'rejected_forced_rows',
      'rejected_browser_incomplete_rows',
      'rejected_teacher_incomplete_parents',
      'browser_agreements',
    ] as const
  )) {
    sourceAccounting[field] = safeInteger(source[field], `receipt.source.${field}`);
  }
  const declaredRows = safeInteger(
    audit.declared_rows,
    'receipt.source.audit_manifest.declared_rows',
    1
  );
  if (sourceAccounting.scanned_rows > declaredRows) {
    throw new Error('receipt.source.scanned_rows exceeds audited source rows');
  }
  exactText(audit.schema, 'receipt.source.audit_manifest.schema');
  if (safeInteger(browser.fixed_depth, 'receipt.browser.fixed_depth', 1) !== browserDepth) {
    throw new Error(`receipt browser depth is not ${browserDepth}`);
  }
  if (safeInteger(teacher.fixed_depth, 'receipt.teacher.fixed_depth', 1) !== teacherDepth) {
    throw new Error(`receipt teacher depth is not ${teacherDepth}`);
  }
  exactLiteral(browser.output_scale, [1, 1], 'receipt.browser.output_scale');
  safeInteger(browser.scale_k, 'receipt.browser.scale_k', 1);
  safeInteger(browser.quiescence_depth, 'receipt.browser.quiescence_depth', 1);
  if (browser.max_time_ms !== 0) throw new Error('receipt browser max_time_ms must be zero');
  if (teacher.multipv !== 1) throw new Error('receipt teacher multipv must be one');
  exactBoolean(teacher.reset_before_each_candidate, true, 'receipt.teacher.reset_before_each_candidate');
  exactLiteral(
    teacher.search_mode,
    'unrestricted-search-from-each-legal-child-position',
    'receipt.teacher.search_mode'
  );
  exactLiteral(
    teacher.terminal_mate_before_requested_depth,
    'accepted-by-pinned-usi-accumulator',
    'receipt.teacher.terminal_mate_before_requested_depth'
  );
  exactLiteral(
    teacher.candidate_order,
    'utf8-bytewise-ascending',
    'receipt.teacher.candidate_order'
  );
  exactLiteral(
    teacher.rank_order,
    'parent-cp-descending-then-utf8-bytewise-move',
    'receipt.teacher.rank_order'
  );
  exactLiteral(
    teacher.engine_contract,
    USI_TEACHER_ENGINE_CONTRACT,
    'receipt.teacher.engine_contract'
  );
  const sourceIdentity = validateExternalRecordedIdentity(source, 'receipt.source');
  const auditIdentity = validateExternalRecordedIdentity(
    audit,
    'receipt.source.audit_manifest'
  );
  let auditedManifestValue: unknown;
  try {
    auditedManifestValue = JSON.parse(fs.readFileSync(auditIdentity.path, 'utf8'));
  } catch (error) {
    throw new Error(`receipt.source.audit_manifest is invalid JSON: ${String(error)}`);
  }
  const derivedAudit = validateAuditedSourceManifestValue(
    auditedManifestValue,
    sourceIdentity
  );
  exactLiteral(
    { schema: audit.schema, declared_rows: audit.declared_rows },
    derivedAudit,
    'receipt.source.audit_manifest derived fields'
  );
  for (const identity of [
    ['browser.wasm', exactObject(browser.wasm, 'receipt.browser.wasm')],
    ['browser.weights', exactObject(browser.weights, 'receipt.browser.weights')],
    ['teacher.engine', exactObject(teacher.engine, 'receipt.teacher.engine')],
  ] as const) {
    exactText(identity[1].path, `receipt.${identity[0]}.path`);
    safeInteger(identity[1].bytes, `receipt.${identity[0]}.bytes`);
    strictSha(identity[1].sha256, `receipt.${identity[0]}.sha256`);
    validateExternalRecordedIdentity(identity[1], `receipt.${identity[0]}`);
  }
  safeInteger(evalTree.files, 'receipt.teacher.eval_tree.files', 1);
  safeInteger(evalTree.bytes, 'receipt.teacher.eval_tree.bytes');
  strictSha(evalTree.sha256, 'receipt.teacher.eval_tree.sha256');
  exactLiteral(evalTree, evalIdentity, 'receipt.teacher.eval_tree');
  return {
    sourceAccounting,
    sourceIdentity,
    declaredSourceRows: derivedAudit.declared_rows,
    commonBinding: {
      schema: receipt.schema,
      status: receipt.status,
      selection_policy: receipt.selection_policy,
      label_policy: receipt.label_policy,
      incomplete_parent_policy: receipt.incomplete_parent_policy,
      source: {
        path: source.path,
        bytes: source.bytes,
        sha256: source.sha256,
        audit_manifest: audit,
      },
      browser,
      teacher,
    },
  };
}

function verifyShard(
  directoryValue: string,
  expectedIndex: number,
  expectedTotal: number,
  expectedParentCount: number,
  browserDepth: number,
  teacherDepth: number,
  evalIdentity: Readonly<{ files: number; bytes: number; sha256: string }>
): VerifiedShard {
  const directory = path.resolve(directoryValue);
  const receiptPath = path.join(directory, 'receipt.json');
  const datasetPath = path.join(directory, 'ranking.jsonl');
  const parentsPath = path.join(directory, 'parents.jsonl');
  const receiptValue = exactObject(
    strictCanonicalJsonFile(receiptPath, `shard ${expectedIndex} receipt`),
    `shard ${expectedIndex} receipt`
  );
  const contract = validateCommonReceiptContract(
    receiptValue,
    browserDepth,
    teacherDepth,
    evalIdentity
  );
  const shard = exactObject(receiptValue.selection_shard, 'receipt.selection_shard');
  if (
    safeInteger(shard.index, 'receipt.selection_shard.index') !== expectedIndex ||
    safeInteger(shard.total, 'receipt.selection_shard.total', 1) !== expectedTotal
  ) {
    throw new Error(`shard ${expectedIndex} receipt does not bind ${expectedIndex}/${expectedTotal}`);
  }
  const output = exactObject(receiptValue.output, 'receipt.output');
  const recordedDataset = exactObject(output.dataset, 'receipt.output.dataset');
  const recordedParents = exactObject(output.parent_evidence, 'receipt.output.parent_evidence');
  if (recordedDataset.schema !== 'shogi-sibling-v1') {
    throw new Error(`shard ${expectedIndex} dataset schema mismatch`);
  }
  if (recordedParents.schema !== BROWSER_CONFUSION_PARENT_SCHEMA) {
    throw new Error(`shard ${expectedIndex} parent evidence schema mismatch`);
  }
  const datasetIdentity = validateRecordedIdentity(
    recordedDataset,
    datasetPath,
    `shard ${expectedIndex} dataset`
  );
  const parentIdentity = validateRecordedIdentity(
    recordedParents,
    parentsPath,
    `shard ${expectedIndex} parent evidence`
  );
  const datasetRows = strictCanonicalJsonl(datasetPath, `shard ${expectedIndex} dataset`) as SiblingRecord[];
  const parentRows = strictCanonicalJsonl(parentsPath, `shard ${expectedIndex} parents`).map(
    (value, index) =>
      validateParentEvidence(
        value,
        `shard ${expectedIndex} parent ${index}`,
        browserDepth,
        teacherDepth
      )
  );
  const summaries = validateParentGroups(datasetRows);
  const grouped = new Map<string, SiblingRecord[]>();
  for (const row of datasetRows) {
    const group = grouped.get(row.parent_id) ?? [];
    group.push(row);
    grouped.set(row.parent_id, group);
  }
  const evidenceByParent = new Map(parentRows.map((entry) => [entry.parent_id, entry]));
  if (evidenceByParent.size !== parentRows.length || summaries.length !== parentRows.length) {
    throw new Error(`shard ${expectedIndex} parent evidence is not one-to-one with groups`);
  }
  const groups = summaries.map((summary): ParentGroup => {
    const records = grouped.get(summary.parent_id) as SiblingRecord[];
    const evidence = evidenceByParent.get(summary.parent_id);
    if (!evidence) throw new Error(`shard ${expectedIndex} has no evidence for ${summary.parent_id}`);
    if ((evidence.source_line - 1) % expectedTotal !== expectedIndex) {
      throw new Error(`shard ${expectedIndex} parent ${summary.parent_id} has a foreign source line`);
    }
    if (evidence.source_line > contract.sourceAccounting.scanned_rows) {
      throw new Error(`shard ${expectedIndex} parent ${summary.parent_id} exceeds scanned rows`);
    }
    validateGroupContract(records, evidence);
    return {
      parentId: summary.parent_id,
      gameId: summary.game_id,
      positionId: summary.position_id,
      parentSfen: evidence.parent_sfen,
      records,
      evidence,
    };
  });
  const candidateCounts = groups.map((group) => group.records.length);
  const games = new Set(groups.map((group) => group.gameId)).size;
  const expectedRecords = safeInteger(recordedDataset.records, 'receipt.output.dataset.records');
  const expectedParents = safeInteger(recordedDataset.parents, 'receipt.output.dataset.parents', 1);
  if (expectedParents !== expectedParentCount) {
    throw new Error(
      `shard ${expectedIndex} parent count is ${expectedParents}, expected ${expectedParentCount}`
    );
  }
  const accountedEligibleRows =
    contract.sourceAccounting.rejected_invalid_rows +
    contract.sourceAccounting.rejected_forced_rows +
    contract.sourceAccounting.rejected_browser_incomplete_rows +
    contract.sourceAccounting.rejected_teacher_incomplete_parents +
    contract.sourceAccounting.browser_agreements +
    expectedParents;
  if (
    expectedRecords !== datasetRows.length ||
    expectedParents !== groups.length ||
    safeInteger(recordedDataset.games, 'receipt.output.dataset.games', 1) !== games ||
    safeInteger(recordedDataset.min_candidates, 'receipt.output.dataset.min_candidates', 2) !==
      Math.min(...candidateCounts) ||
    safeInteger(recordedDataset.max_candidates, 'receipt.output.dataset.max_candidates', 2) !==
      Math.max(...candidateCounts) ||
    safeInteger(recordedParents.records, 'receipt.output.parent_evidence.records', 1) !==
      parentRows.length
  ) {
    throw new Error(`shard ${expectedIndex} output accounting mismatch`);
  }
  if (
    contract.sourceAccounting.shard_eligible_rows !== accountedEligibleRows ||
    contract.sourceAccounting.shard_eligible_rows > contract.sourceAccounting.scanned_rows
  ) {
    throw new Error(`shard ${expectedIndex} source accounting mismatch`);
  }
  return {
    index: expectedIndex,
    total: expectedTotal,
    directory,
    receipt: fileIdentity(receiptPath),
    dataset: { ...datasetIdentity, records: datasetRows.length, parents: groups.length, games },
    parentEvidence: { ...parentIdentity, records: parentRows.length },
    commonBinding: contract.commonBinding,
    sourceIdentity: contract.sourceIdentity,
    declaredSourceRows: contract.declaredSourceRows,
    sourceAccounting: contract.sourceAccounting,
    groups,
  };
}

function selectedSourceRows(
  source: FileIdentity,
  selectedLines: ReadonlySet<number>
): Map<number, SourceTeacherRow> {
  const pendingLines = new Set(selectedLines);
  const rows = new Map<number, SourceTeacherRow>();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  const descriptor = fs.openSync(source.path, 'r');
  let pendingText = '';
  let lineNumber = 0;
  const consumeLine = (rawLine: string): void => {
    lineNumber += 1;
    if (!pendingLines.has(lineNumber)) return;
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch (error) {
      throw new Error(`selected source line ${lineNumber} is invalid JSON: ${String(error)}`);
    }
    rows.set(lineNumber, parseSourceTeacherRow(value));
    pendingLines.delete(lineNumber);
  };
  try {
    while (pendingLines.size > 0) {
      const count = fs.readSync(descriptor, buffer, 0, buffer.byteLength, null);
      if (count === 0) break;
      pendingText += decoder.decode(buffer.subarray(0, count), { stream: true });
      for (;;) {
        const newline = pendingText.indexOf('\n');
        if (newline < 0) break;
        consumeLine(pendingText.slice(0, newline));
        pendingText = pendingText.slice(newline + 1);
      }
    }
    if (pendingLines.size > 0) {
      pendingText += decoder.decode();
      if (pendingText.length > 0) consumeLine(pendingText);
    }
  } finally {
    fs.closeSync(descriptor);
  }
  if (pendingLines.size > 0) {
    throw new Error(`selected source line does not physically exist: ${Math.min(...pendingLines)}`);
  }
  return rows;
}

function validateSelectedSourceBindings(
  groups: readonly ParentGroup[],
  source: FileIdentity,
  declaredRows: number
): void {
  const byLine = new Map<number, ParentGroup>();
  for (const group of groups) {
    const sourceLine = group.evidence.source_line;
    if (sourceLine > declaredRows) {
      throw new Error(`selected source line ${sourceLine} exceeds audited rows ${declaredRows}`);
    }
    if (byLine.has(sourceLine)) {
      throw new Error(`selected source_line repeats across parents: ${sourceLine}`);
    }
    byLine.set(sourceLine, group);
  }
  const rows = selectedSourceRows(source, new Set(byLine.keys()));
  for (const [sourceLine, group] of byLine) {
    const row = rows.get(sourceLine) as SourceTeacherRow;
    const positionId = positionKeyFromSfen(row.sfen);
    const parentDigest = sha256(
      `browser-confusion-parent-v1\0${source.sha256}\0${sourceLine}\0${positionId}`
    );
    const gameId = row.game_id ?? `source-row:${parentDigest}`;
    if (
      group.parentSfen !== row.sfen ||
      group.evidence.parent_ply !== row.ply ||
      group.positionId !== positionId ||
      group.gameId !== gameId ||
      group.parentId !== `sha256:${parentDigest}`
    ) {
      throw new Error(`parent ${group.parentId} does not bind selected source line ${sourceLine}`);
    }
    exactLiteral(
      group.evidence.source_teacher,
      { cp: row.cp, bestmove: row.bestmove, depth: row.depth },
      `parent ${group.parentId} source_teacher`
    );
  }
}

function groupContentSignature(group: ParentGroup): string {
  return canonicalJson({
    position_id: group.positionId,
    parent_position: canonicalPositionSfen(group.parentSfen),
    legal_moves: group.evidence.legal_moves,
    records: [...group.records]
      .sort((left, right) => left.teacher_rank - right.teacher_rank || compareBytewise(left.move, right.move))
      .map((row) => ({
        move: row.move,
        child_position_id: row.child_position_id,
        child_position: canonicalPositionSfen(row.child_sfen),
        cp: row.cp,
        teacher_child_cp: row.teacher_child_cp,
        teacher_parent_cp: row.teacher_parent_cp,
        teacher_rank: row.teacher_rank,
        teacher_score_kind: row.teacher_score_kind,
        ...(row.teacher_mate === undefined ? {} : { teacher_mate: row.teacher_mate }),
        ...(row.teacher_mate_sign === undefined
          ? {}
          : { teacher_mate_sign: row.teacher_mate_sign }),
        sources: row.sources,
      })),
  });
}

function semanticIds(group: ParentGroup): Set<string> {
  return new Set([group.positionId, ...group.records.map((row) => row.child_position_id)]);
}

function sortedOutputRecords(groups: readonly ParentGroup[], split: 'train' | 'val'): SiblingRecord[] {
  return groups
    .flatMap((group) => group.records.map((record) => ({ ...record, split })))
    .sort(
      (left, right) =>
        compareBytewise(left.parent_id, right.parent_id) ||
        left.teacher_rank - right.teacher_rank ||
        compareBytewise(left.move, right.move)
    );
}

function outputIdentity(
  finalPath: string,
  tempPath: string,
  extra: Record<string, unknown>
): FileIdentity & Record<string, unknown> {
  const payload = fs.readFileSync(tempPath);
  return {
    path: path.resolve(finalPath),
    bytes: payload.byteLength,
    sha256: sha256(payload),
    ...extra,
  };
}

function writeExclusive(file: string, text: string): void {
  fs.writeFileSync(file, text, { encoding: 'utf8', flag: 'wx', mode: 0o444 });
}

type ExclusivePublisher = (
  source: string,
  destination: string,
  sourceHandle: FloodgateExclusiveDirectorySourceHandle
) => Promise<Readonly<FloodgateExclusiveDirectoryRenameReceipt>>;

async function prepareBrowserConfusionRankingDatasetCore(
  options: PrepareBrowserConfusionDatasetOptions,
  exclusivePublisher: ExclusivePublisher,
  publicationBoundary: string
): Promise<Record<string, unknown>> {
  // Cache only within this synchronous preparation run. A later invocation
  // must rehash inputs so an intervening file replacement cannot reuse trust.
  IDENTITY_CACHE.clear();
  TREE_IDENTITY_CACHE.clear();
  if (!Array.isArray(options.shardDirs) || options.shardDirs.length < 1) {
    throw new Error('shardDirs must contain at least one directory');
  }
  if (
    !Array.isArray(options.expectedParentCounts) ||
    options.expectedParentCounts.length !== options.shardDirs.length
  ) {
    throw new Error('expectedParentCounts must contain exactly one count per shard');
  }
  const expectedParentCounts = options.expectedParentCounts.map((count, index) =>
    safeInteger(count, `expectedParentCounts[${index}]`, 1)
  );
  const splitSeed = exactText(options.splitSeed, 'splitSeed');
  if (!(options.valRatio > 0 && options.valRatio < 1) || !Number.isFinite(options.valRatio)) {
    throw new Error('valRatio must be finite and between zero and one');
  }
  const browserDepth = options.browserDepth ?? 4;
  const teacherDepth = options.teacherDepth ?? 12;
  const parityPositions = options.parityPositions ?? 64;
  safeInteger(browserDepth, 'browserDepth', 1);
  safeInteger(teacherDepth, 'teacherDepth', 1);
  safeInteger(parityPositions, 'parityPositions', 1);
  const outDir = path.resolve(options.outDir);
  const evalDir = path.resolve(exactText(options.evalDir, 'evalDir'));
  const evalIdentity = treeIdentity(evalDir);

  const shards = options.shardDirs.map((directory, index) =>
    verifyShard(
      directory,
      index,
      options.shardDirs.length,
      expectedParentCounts[index],
      browserDepth,
      teacherDepth,
      evalIdentity
    )
  );
  const common = canonicalJson(shards[0].commonBinding);
  if (shards.some((shard) => canonicalJson(shard.commonBinding) !== common)) {
    throw new Error('shard source/runtime/depth identities differ');
  }
  const allGroups = shards.flatMap((shard) => shard.groups);
  validateSelectedSourceBindings(
    allGroups,
    shards[0].sourceIdentity,
    shards[0].declaredSourceRows
  );
  const parentIds = new Set<string>();
  for (const group of allGroups) {
    if (parentIds.has(group.parentId)) throw new Error(`parent_id repeats across shards: ${group.parentId}`);
    parentIds.add(group.parentId);
  }

  const byPosition = new Map<string, ParentGroup[]>();
  for (const group of allGroups) {
    const peers = byPosition.get(group.positionId) ?? [];
    peers.push(group);
    byPosition.set(group.positionId, peers);
  }
  const deduplicated: ParentGroup[] = [];
  let duplicateParents = 0;
  let duplicateRecords = 0;
  for (const [positionId, peers] of byPosition) {
    const signatures = new Set(peers.map(groupContentSignature));
    if (signatures.size !== 1) {
      throw new Error(`conflicting duplicate parent content for position_id ${positionId}`);
    }
    const valPeers = peers.filter(
      (peer) => assignGameSplit(peer.gameId, { seed: splitSeed, valRatio: options.valRatio }) === 'val'
    );
    const ordered = [...(valPeers.length > 0 ? valPeers : peers)].sort((left, right) =>
      compareBytewise(left.parentId, right.parentId)
    );
    deduplicated.push(ordered[0]);
    duplicateParents += peers.length - 1;
    duplicateRecords +=
      peers.reduce((sum, peer) => sum + peer.records.length, 0) - ordered[0].records.length;
  }
  deduplicated.sort((left, right) => compareBytewise(left.parentId, right.parentId));

  const assignedTrain: ParentGroup[] = [];
  const valGroups: ParentGroup[] = [];
  for (const group of deduplicated) {
    const role = assignGameSplit(group.gameId, { seed: splitSeed, valRatio: options.valRatio });
    (role === 'val' ? valGroups : assignedTrain).push(group);
  }
  if (valGroups.length < parityPositions) {
    throw new Error(`validation has ${valGroups.length} parents; parity requires ${parityPositions}`);
  }
  const valSemantic = new Set(valGroups.flatMap((group) => [...semanticIds(group)]));
  const trainGroups: ParentGroup[] = [];
  let semanticDroppedParents = 0;
  let semanticDroppedRecords = 0;
  for (const group of assignedTrain) {
    if ([...semanticIds(group)].some((identifier) => valSemantic.has(identifier))) {
      semanticDroppedParents += 1;
      semanticDroppedRecords += group.records.length;
    } else {
      trainGroups.push(group);
    }
  }
  if (trainGroups.length === 0 || valGroups.length === 0) {
    throw new Error('semantic isolation produced an empty train or validation role');
  }
  const trainRecords = sortedOutputRecords(trainGroups, 'train');
  const valRecords = sortedOutputRecords(valGroups, 'val');
  validateParentGroups(trainRecords);
  validateParentGroups(valRecords);
  assertSplitIsolation(trainRecords, valRecords);
  const trainSemantic = new Set(trainGroups.flatMap((group) => [...semanticIds(group)]));
  const semanticOverlap = [...trainSemantic].filter((identifier) => valSemantic.has(identifier));
  if (semanticOverlap.length > 0) {
    throw new Error(`semantic train/validation overlap remains: ${semanticOverlap[0]}`);
  }

  const parityGroups = [...valGroups]
    .sort((left, right) => {
      const leftHash = sha256(`${splitSeed}\0parity64\0${left.positionId}`);
      const rightHash = sha256(`${splitSeed}\0parity64\0${right.positionId}`);
      return compareBytewise(leftHash, rightHash) || compareBytewise(left.positionId, right.positionId);
    })
    .slice(0, parityPositions);
  const parityText = `${parityGroups.map((group) => group.parentSfen).join('\n')}\n`;
  const trainText = `${trainRecords.map(canonicalJson).join('\n')}\n`;
  const valText = `${valRecords.map(canonicalJson).join('\n')}\n`;
  const inputRecords = allGroups.reduce((sum, group) => sum + group.records.length, 0);
  const accountedRecords =
    duplicateRecords + semanticDroppedRecords + trainRecords.length + valRecords.length;
  if (inputRecords !== accountedRecords) {
    throw new Error(`record accounting mismatch: input ${inputRecords}, accounted ${accountedRecords}`);
  }

  const outputParent = path.dirname(outDir);
  fs.mkdirSync(outputParent, { recursive: true, mode: 0o700 });
  const tempDir = fs.mkdtempSync(path.join(outputParent, `.${path.basename(outDir)}.tmp-`));
  fs.chmodSync(tempDir, 0o700);
  try {
    const tempTrain = path.join(tempDir, 'train.jsonl');
    const tempVal = path.join(tempDir, 'val.jsonl');
    const tempParity = path.join(tempDir, 'parity64.sfens');
    writeExclusive(tempTrain, trainText);
    writeExclusive(tempVal, valText);
    writeExclusive(tempParity, parityText);
    const output = {
      train: outputIdentity(path.join(outDir, 'train.jsonl'), tempTrain, {
        records: trainRecords.length,
        parents: trainGroups.length,
        games: new Set(trainGroups.map((group) => group.gameId)).size,
      }),
      validation: outputIdentity(path.join(outDir, 'val.jsonl'), tempVal, {
        records: valRecords.length,
        parents: valGroups.length,
        games: new Set(valGroups.map((group) => group.gameId)).size,
      }),
      parity64: outputIdentity(path.join(outDir, 'parity64.sfens'), tempParity, {
        positions: parityGroups.length,
        unique_position_ids: new Set(parityGroups.map((group) => group.positionId)).size,
      }),
    };
    const manifest: Record<string, unknown> = {
      schema: BROWSER_CONFUSION_DATASET_MANIFEST_SCHEMA,
      status: BROWSER_CONFUSION_DATASET_STATUS,
      live_weight_write_authorized: false,
      policy: {
        shard_count: shards.length,
        expected_parent_counts: expectedParentCounts,
        browser_depth: browserDepth,
        teacher_depth: teacherDepth,
        deduplication: BROWSER_CONFUSION_DATASET_DEDUPE_POLICY,
        split_algorithm: BROWSER_CONFUSION_DATASET_SPLIT_ALGORITHM,
        split_seed: splitSeed,
        validation_ratio: options.valRatio,
        conflict_priority: 'validation-wins-drop-whole-training-parent-group',
        semantic_identity: 'position_id-union-child_position_id',
        parity_selection: BROWSER_CONFUSION_PARITY_POLICY,
        external_file_identity_verification: 'rehash-source-audit-wasm-weights-engine',
        eval_tree_identity_verification: 'explicit-eval-dir-rehashed-with-builder-v2-algorithm',
        publication: publicationBoundary,
        published_directory_mode: '0700-owner-only',
      },
      input: {
        common_binding: shards[0].commonBinding,
        verified_eval_tree: { path: evalDir, ...evalIdentity },
        shards: shards.map((shard) => ({
          index: shard.index,
          total: shard.total,
          directory: shard.directory,
          receipt: shard.receipt,
          dataset: shard.dataset,
          parent_evidence: shard.parentEvidence,
          source_accounting: shard.sourceAccounting,
        })),
      },
      accounting: {
        input_records: inputRecords,
        input_parents: allGroups.length,
        input_games: new Set(allGroups.map((group) => group.gameId)).size,
        duplicate_position_parents_removed: duplicateParents,
        duplicate_position_records_removed: duplicateRecords,
        deduplicated_parents: deduplicated.length,
        deduplicated_records: inputRecords - duplicateRecords,
        semantic_conflict_training_parents_removed: semanticDroppedParents,
        semantic_conflict_training_records_removed: semanticDroppedRecords,
        train_validation_game_overlap: 0,
        train_validation_parent_overlap: 0,
        train_validation_position_overlap: 0,
        train_validation_child_position_overlap: 0,
        train_validation_semantic_union_overlap: semanticOverlap.length,
      },
      output,
    };
    writeExclusive(path.join(tempDir, 'manifest.json'), `${canonicalJson(manifest)}\n`);
    const directoryFlag = fs.constants.O_DIRECTORY;
    const noFollow = fs.constants.O_NOFOLLOW;
    if (typeof directoryFlag !== 'number' || typeof noFollow !== 'number') {
      throw new Error('exclusive publication requires O_DIRECTORY and O_NOFOLLOW');
    }
    const tempHandle = await fs.promises.open(
      tempDir,
      fs.constants.O_RDONLY | directoryFlag | noFollow
    );
    try {
      await exclusivePublisher(tempDir, outDir, tempHandle);
    } finally {
      await tempHandle.close();
    }
    return manifest;
  } catch (error) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    throw error;
  }
}

export function prepareBrowserConfusionRankingDataset(
  options: PrepareBrowserConfusionDatasetOptions
): Promise<Record<string, unknown>> {
  return prepareBrowserConfusionRankingDatasetCore(
    options,
    exclusiveRenameFloodgateDirectory,
    FLOODGATE_EXCLUSIVE_DIRECTORY_RENAME_CONTRACT
  );
}

/** Focused-test seam; production callers cannot inject publication authority. */
export function prepareBrowserConfusionRankingDatasetCoreForTests(
  options: PrepareBrowserConfusionDatasetOptions,
  exclusivePublisher: ExclusivePublisher
): Promise<Record<string, unknown>> {
  return prepareBrowserConfusionRankingDatasetCore(
    options,
    exclusivePublisher,
    'test-only-injected-exclusive-directory-rename'
  );
}

function cliMap(argv: readonly string[]): Map<string, string> {
  const allowed = new Set([
    'shard-prefix',
    'shards',
    'split-seed',
    'val-ratio',
    'out-dir',
    'browser-depth',
    'teacher-depth',
    'eval-dir',
    'parents-per-shard',
  ]);
  const result = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const token = argv[index];
    const value = argv[index + 1];
    if (!token?.startsWith('--') || !value || value.startsWith('--')) {
      throw new Error('CLI arguments must be --name value pairs');
    }
    const name = token.slice(2);
    if (!allowed.has(name)) throw new Error(`unknown argument --${name}`);
    if (result.has(name)) throw new Error(`duplicate argument --${name}`);
    result.set(name, value);
  }
  return result;
}

function requiredCli(values: Map<string, string>, name: string): string {
  const value = values.get(name);
  if (value === undefined) throw new Error(`missing --${name}`);
  return value;
}

function cliInteger(values: Map<string, string>, name: string, fallback?: number): number {
  const raw = values.get(name);
  if (raw === undefined && fallback !== undefined) return fallback;
  return safeInteger(Number(raw), `--${name}`, 1);
}

export async function runCli(argv = process.argv.slice(2)): Promise<Record<string, unknown>> {
  const values = cliMap(argv);
  const prefix = path.resolve(requiredCli(values, 'shard-prefix'));
  const shardCount = cliInteger(values, 'shards');
  const parentsPerShard = cliInteger(values, 'parents-per-shard');
  const valRatio = Number(requiredCli(values, 'val-ratio'));
  return prepareBrowserConfusionRankingDataset({
    shardDirs: Array.from({ length: shardCount }, (_unused, index) => `${prefix}${index}`),
    evalDir: requiredCli(values, 'eval-dir'),
    expectedParentCounts: Array.from({ length: shardCount }, () => parentsPerShard),
    splitSeed: requiredCli(values, 'split-seed'),
    valRatio,
    outDir: requiredCli(values, 'out-dir'),
    browserDepth: cliInteger(values, 'browser-depth', 4),
    teacherDepth: cliInteger(values, 'teacher-depth', 12),
  });
}

if (require.main === module) {
  runCli()
    .then((manifest) => process.stdout.write(`${canonicalJson(manifest)}\n`))
    .catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
      process.exitCode = 1;
    });
}
