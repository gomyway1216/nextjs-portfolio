import { createHash } from 'node:crypto';

import { MAX_NON_MATE_CP, mateToCp } from './usi-multipv';

export const SIBLING_SCHEMA_VERSION = 1 as const;
export const SIBLING_SCHEMA = 'shogi-sibling-v1' as const;
export const SIBLING_MANIFEST_SCHEMA = 'shogi-sibling-manifest-v1' as const;

export type DatasetSplit = 'train' | 'val';

/** Locale-independent ordering used by every reproducible dataset artifact. */
export function compareBytewise(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));
}

export interface SiblingParent {
  game_id: string;
  parent_id: string;
  parent_sfen: string;
  position_id?: string;
  parent_ply: number;
}

export interface SiblingCandidateInput {
  move: string;
  child_sfen: string;
  sources: readonly string[];
  teacher_parent_cp?: number;
  teacher_rank?: number;
  teacher_score_kind?: 'cp' | 'mate';
  teacher_mate?: number;
  teacher_mate_sign?: 1 | -1;
}

export interface SiblingRecord {
  schema: typeof SIBLING_SCHEMA;
  schema_version: typeof SIBLING_SCHEMA_VERSION;
  game_id: string;
  parent_id: string;
  /** Semantic identity of the parent position (SFEN move number excluded). */
  position_id: string;
  parent_sfen: string;
  parent_ply: number;
  /** Child ply, retained for compatibility with existing teacher-data tools. */
  ply: number;
  move: string;
  sources: string[];
  /** Canonical training fields: child position and child-side-to-move cp. */
  sfen: string;
  /** Semantic identity of the model-input child position. */
  child_position_id: string;
  cp: number;
  /** Explicit aliases used by sibling-aware tooling and validation. */
  child_sfen: string;
  teacher_child_cp: number;
  teacher_parent_cp: number;
  teacher_rank: number;
  teacher_score_kind: 'cp' | 'mate';
  teacher_mate?: number;
  teacher_mate_sign?: 1 | -1;
  split?: DatasetSplit;
}

export interface SiblingManifestStats {
  input_records: number;
  output_records: number;
  input_parents: number;
  output_parents: number;
  input_games: number;
  train_records: number;
  val_records: number;
  train_parents: number;
  val_parents: number;
  train_games: number;
  val_games: number;
  val_position_priority_dropped_records: number;
  val_position_priority_dropped_parents: number;
  val_child_position_priority_dropped_records: number;
  val_child_position_priority_dropped_parents: number;
  game_overlap: number;
  position_overlap: number;
  child_position_overlap: number;
}

export interface SiblingManifest {
  schema: typeof SIBLING_MANIFEST_SCHEMA;
  record_schema: typeof SIBLING_SCHEMA;
  schema_version: typeof SIBLING_SCHEMA_VERSION;
  split_seed: string;
  val_ratio: number;
  train_game_ids_sha256: string;
  val_game_ids_sha256: string;
  stats: SiblingManifestStats;
}

export interface SplitSiblingDatasetOptions {
  seed?: string | number;
  valRatio?: number;
}

export interface SplitSiblingDatasetResult {
  train: SiblingRecord[];
  val: SiblingRecord[];
  manifest: SiblingManifest;
}

export interface ParentGroupSummary {
  parent_id: string;
  game_id: string;
  position_id: string;
  records: number;
  split?: DatasetSplit;
}

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function requiredText(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${name} must not be empty`);
  return normalized;
}

/** Position identity intentionally excludes SFEN's move number. */
export function canonicalPositionSfen(sfen: string): string {
  const parts = sfen.trim().split(/\s+/);
  if (parts.length < 3) throw new Error(`invalid SFEN: ${sfen}`);
  return parts.slice(0, 3).join(' ');
}

function normalizedSfen(sfen: string): string {
  const parts = sfen.trim().split(/\s+/);
  if (parts.length < 3) throw new Error(`invalid SFEN: ${sfen}`);
  return parts.join(' ');
}

export function positionKeyFromSfen(sfen: string): string {
  // Keep this ID byte-for-byte compatible with the CSA parent importer.
  return `sha256:${sha256(`sfen-v1\0${canonicalPositionSfen(sfen)}`)}`;
}

/** A child position is evaluated from the opponent's side to move. */
export function parentCpToChildCp(parentCp: number): number {
  if (!Number.isFinite(parentCp)) throw new Error(`teacher cp must be finite (got ${parentCp})`);
  return parentCp === 0 ? 0 : -parentCp;
}

function sortedSources(sources: Iterable<string>): string[] {
  const priority = new Map<string, number>([
    ['played', 0],
    ['teacher', 1],
  ]);
  return [...new Set([...sources].map((source) => requiredText(source, 'source')))].sort((a, b) => {
    const pa = priority.get(a) ?? 100;
    const pb = priority.get(b) ?? 100;
    return pa - pb || (a < b ? -1 : a > b ? 1 : 0);
  });
}

interface MutableCandidate {
  move: string;
  child_sfen: string;
  sources: Set<string>;
  teacher_parent_cp?: number;
  teacher_rank?: number;
  teacher_score_kind?: 'cp' | 'mate';
  teacher_mate?: number;
  teacher_mate_sign?: 1 | -1;
}

/**
 * Merge candidate provenance by move. A played move that also appears in the
 * teacher MultiPV becomes one sibling with sources [played, teacher].
 */
export function buildSiblingGroup(
  parent: SiblingParent,
  candidates: readonly SiblingCandidateInput[]
): SiblingRecord[] {
  const gameId = requiredText(parent.game_id, 'game_id');
  const parentId = requiredText(parent.parent_id, 'parent_id');
  const parentSfen = normalizedSfen(parent.parent_sfen);
  if (!Number.isInteger(parent.parent_ply) || parent.parent_ply < 0) {
    throw new Error(`parent_ply must be a non-negative integer (got ${parent.parent_ply})`);
  }
  const computedPositionKey = positionKeyFromSfen(parentSfen);
  const positionKey = requiredText(
    parent.position_id ?? computedPositionKey,
    'position_id'
  );
  if (positionKey !== computedPositionKey) {
    throw new Error(`parent ${parentId} has a position_id that does not match parent_sfen`);
  }

  const merged = new Map<string, MutableCandidate>();
  for (const candidate of candidates) {
    const move = requiredText(candidate.move, 'move');
    const childSfen = normalizedSfen(candidate.child_sfen);
    const current = merged.get(move);
    if (!current) {
      merged.set(move, {
        move,
        child_sfen: childSfen,
        sources: new Set(sortedSources(candidate.sources)),
        teacher_parent_cp: candidate.teacher_parent_cp,
        teacher_rank: candidate.teacher_rank,
        teacher_score_kind: candidate.teacher_score_kind ?? 'cp',
        teacher_mate: candidate.teacher_mate,
        teacher_mate_sign: candidate.teacher_mate_sign,
      });
      continue;
    }

    if (current.child_sfen !== childSfen) {
      throw new Error(`candidate ${move} has conflicting child_sfen values`);
    }
    for (const source of candidate.sources) current.sources.add(requiredText(source, 'source'));
    if (candidate.teacher_parent_cp !== undefined) {
      if (
        current.teacher_parent_cp !== undefined &&
        current.teacher_parent_cp !== candidate.teacher_parent_cp
      ) {
        throw new Error(`candidate ${move} has conflicting teacher_parent_cp values`);
      }
      current.teacher_parent_cp = candidate.teacher_parent_cp;
    }
    if (candidate.teacher_rank !== undefined) {
      if (current.teacher_rank !== undefined && current.teacher_rank !== candidate.teacher_rank) {
        throw new Error(`candidate ${move} has conflicting teacher_rank values`);
      }
      current.teacher_rank = candidate.teacher_rank;
    }
    const scoreKind = candidate.teacher_score_kind ?? 'cp';
    if (current.teacher_score_kind !== scoreKind) {
      throw new Error(`candidate ${move} has conflicting teacher_score_kind values`);
    }
    if (candidate.teacher_mate !== undefined) {
      if (current.teacher_mate !== undefined && !Object.is(current.teacher_mate, candidate.teacher_mate)) {
        throw new Error(`candidate ${move} has conflicting teacher_mate values`);
      }
      current.teacher_mate = candidate.teacher_mate;
    }
    if (candidate.teacher_mate_sign !== undefined) {
      if (
        current.teacher_mate_sign !== undefined &&
        current.teacher_mate_sign !== candidate.teacher_mate_sign
      ) {
        throw new Error(`candidate ${move} has conflicting teacher_mate_sign values`);
      }
      current.teacher_mate_sign = candidate.teacher_mate_sign;
    }
  }

  const records = [...merged.values()].map((candidate): SiblingRecord => {
    if (
      candidate.teacher_parent_cp === undefined ||
      !Number.isInteger(candidate.teacher_parent_cp)
    ) {
      throw new Error(`candidate ${candidate.move} is missing an integer teacher_parent_cp`);
    }
    if (!Number.isInteger(candidate.teacher_rank) || (candidate.teacher_rank as number) <= 0) {
      throw new Error(`candidate ${candidate.move} is missing a positive teacher_rank`);
    }
    const sources = sortedSources(candidate.sources);
    if (sources.length === 0) throw new Error(`candidate ${candidate.move} has no sources`);
    const childCp = parentCpToChildCp(candidate.teacher_parent_cp);
    const scoreKind = candidate.teacher_score_kind ?? 'cp';
    if (scoreKind === 'mate') {
      if (!Number.isInteger(candidate.teacher_mate) || ![-1, 1].includes(candidate.teacher_mate_sign as number)) {
        throw new Error(`candidate ${candidate.move} has incomplete mate metadata`);
      }
    } else if (candidate.teacher_mate !== undefined || candidate.teacher_mate_sign !== undefined) {
      throw new Error(`candidate ${candidate.move} has mate metadata for a cp score`);
    }
    return {
      schema: SIBLING_SCHEMA,
      schema_version: SIBLING_SCHEMA_VERSION,
      game_id: gameId,
      parent_id: parentId,
      position_id: positionKey,
      parent_sfen: parentSfen,
      parent_ply: parent.parent_ply,
      ply: parent.parent_ply + 1,
      move: candidate.move,
      sources,
      sfen: candidate.child_sfen,
      child_position_id: positionKeyFromSfen(candidate.child_sfen),
      cp: childCp,
      child_sfen: candidate.child_sfen,
      teacher_child_cp: childCp,
      teacher_parent_cp: candidate.teacher_parent_cp,
      teacher_rank: candidate.teacher_rank as number,
      teacher_score_kind: scoreKind,
      ...(scoreKind === 'mate'
        ? {
            teacher_mate: candidate.teacher_mate as number,
            teacher_mate_sign: candidate.teacher_mate_sign as 1 | -1,
          }
        : {}),
    };
  });

  records.sort((a, b) => a.teacher_rank - b.teacher_rank || compareBytewise(a.move, b.move));
  if (records.length < 2) throw new Error(`parent ${parentId} has fewer than two siblings`);
  validateParentGroups(records);
  return records;
}

function groupByParent(records: readonly SiblingRecord[]): Map<string, SiblingRecord[]> {
  const groups = new Map<string, SiblingRecord[]>();
  for (const record of records) {
    const group = groups.get(record.parent_id) ?? [];
    group.push(record);
    groups.set(record.parent_id, group);
  }
  return groups;
}

/** Validate the invariants needed by parent-local ranking and policy losses. */
export function validateParentGroups(records: readonly SiblingRecord[]): ParentGroupSummary[] {
  const groups = groupByParent(records);
  const summaries: ParentGroupSummary[] = [];

  for (const [parentId, group] of groups) {
    if (group.length < 2) throw new Error(`parent ${parentId} has fewer than two siblings`);
    const first = group[0];
    requiredText(parentId, 'parent_id');
    requiredText(first.game_id, 'game_id');
    requiredText(first.parent_sfen, 'parent_sfen');
    requiredText(first.position_id, 'position_id');
    if (first.position_id !== positionKeyFromSfen(first.parent_sfen)) {
      throw new Error(`parent ${parentId} position key does not match parent_sfen`);
    }
    const moves = new Set<string>();
    const ranks = new Set<number>();

    for (const record of group) {
      if (record.schema !== SIBLING_SCHEMA) {
        throw new Error(`parent ${parentId} has unsupported schema ${String(record.schema)}`);
      }
      if (record.schema_version !== SIBLING_SCHEMA_VERSION) {
        throw new Error(`parent ${parentId} has unsupported schema_version ${record.schema_version}`);
      }
      if (
        record.game_id !== first.game_id ||
        record.parent_sfen !== first.parent_sfen ||
        record.position_id !== first.position_id ||
        record.parent_ply !== first.parent_ply ||
        record.ply !== first.ply
      ) {
        throw new Error(`parent ${parentId} has inconsistent group metadata`);
      }
      if (record.split !== first.split) {
        throw new Error(`parent ${parentId} is split across datasets`);
      }
      if (record.split !== undefined && record.split !== 'train' && record.split !== 'val') {
        throw new Error(`parent ${parentId} has invalid split ${String(record.split)}`);
      }
      requiredText(record.move, 'move');
      normalizedSfen(record.sfen);
      normalizedSfen(record.child_sfen);
      if (record.sfen !== record.child_sfen) {
        throw new Error(`parent ${parentId} move ${record.move} has inconsistent child SFEN aliases`);
      }
      if (record.child_position_id !== positionKeyFromSfen(record.child_sfen)) {
        throw new Error(`parent ${parentId} move ${record.move} has an invalid child position key`);
      }
      if (
        !Number.isInteger(record.parent_ply) ||
        record.parent_ply < 0 ||
        !Number.isInteger(record.ply) ||
        record.ply !== record.parent_ply + 1
      ) {
        throw new Error(`parent ${parentId} move ${record.move} has inconsistent parent/child ply`);
      }
      if (moves.has(record.move)) throw new Error(`parent ${parentId} has duplicate move ${record.move}`);
      moves.add(record.move);
      if (!Number.isInteger(record.teacher_rank) || record.teacher_rank <= 0) {
        throw new Error(`parent ${parentId} has invalid teacher_rank ${record.teacher_rank}`);
      }
      if (ranks.has(record.teacher_rank)) {
        throw new Error(`parent ${parentId} has duplicate teacher_rank ${record.teacher_rank}`);
      }
      ranks.add(record.teacher_rank);
      if (!Number.isInteger(record.teacher_parent_cp)) {
        throw new Error(`parent ${parentId} has non-integer teacher_parent_cp`);
      }
      if (record.teacher_score_kind === 'mate') {
        if (!Number.isInteger(record.teacher_mate) || ![-1, 1].includes(record.teacher_mate_sign as number)) {
          throw new Error(`parent ${parentId} move ${record.move} has incomplete mate metadata`);
        }
        if (
          ((record.teacher_mate as number) > 0 && record.teacher_mate_sign !== 1) ||
          ((record.teacher_mate as number) < 0 && record.teacher_mate_sign !== -1)
        ) {
          throw new Error(`parent ${parentId} move ${record.move} has contradictory mate sign`);
        }
        if (
          record.teacher_parent_cp !==
          mateToCp(record.teacher_mate as number, record.teacher_mate_sign as 1 | -1)
        ) {
          throw new Error(`parent ${parentId} move ${record.move} has inconsistent mate cp`);
        }
      } else if (record.teacher_score_kind !== 'cp') {
        throw new Error(`parent ${parentId} move ${record.move} has invalid teacher score kind`);
      } else if (record.teacher_mate !== undefined || record.teacher_mate_sign !== undefined) {
        throw new Error(`parent ${parentId} move ${record.move} has mate metadata for a cp score`);
      } else if (Math.abs(record.teacher_parent_cp) > MAX_NON_MATE_CP) {
        throw new Error(`parent ${parentId} move ${record.move} has cp in the reserved mate band`);
      }
      const expectedChildCp = parentCpToChildCp(record.teacher_parent_cp);
      if (
        record.cp !== expectedChildCp ||
        record.teacher_child_cp !== expectedChildCp
      ) {
        throw new Error(`parent ${parentId} move ${record.move} has inconsistent child cp`);
      }
      if (record.sources.length === 0 || new Set(record.sources).size !== record.sources.length) {
        throw new Error(`parent ${parentId} move ${record.move} has invalid sources`);
      }
      for (const source of record.sources) requiredText(source, 'source');
    }

    const sortedRanks = [...ranks].sort((a, b) => a - b);
    for (let i = 0; i < sortedRanks.length; i++) {
      if (sortedRanks[i] !== i + 1) {
        throw new Error(`parent ${parentId} teacher ranks must be contiguous from 1`);
      }
    }
    const ranked = [...group].sort((a, b) => a.teacher_rank - b.teacher_rank);
    for (let index = 1; index < ranked.length; index++) {
      if (ranked[index - 1].teacher_parent_cp < ranked[index].teacher_parent_cp) {
        throw new Error(
          `parent ${parentId} teacher cp contradicts ranks ${ranked[index - 1].teacher_rank}/${ranked[index].teacher_rank}`
        );
      }
    }
    summaries.push({
      parent_id: parentId,
      game_id: first.game_id,
      position_id: first.position_id,
      records: group.length,
      split: first.split,
    });
  }

  return summaries.sort((a, b) => compareBytewise(a.parent_id, b.parent_id));
}

/** Stable append-safe game assignment based only on seed and game_id. */
export function assignGameSplit(
  gameId: string,
  options: SplitSiblingDatasetOptions = {}
): DatasetSplit {
  const id = requiredText(gameId, 'game_id');
  const seed = String(options.seed ?? '42');
  const valRatio = options.valRatio ?? 0.1;
  if (!(valRatio > 0 && valRatio < 1)) {
    throw new Error(`valRatio must be between 0 and 1 (got ${valRatio})`);
  }
  const digest = createHash('sha256').update(`${seed}\0${id}`, 'utf8').digest();
  // Six bytes fit exactly within JavaScript's safe integer range.
  const fraction = digest.readUIntBE(0, 6) / 2 ** 48;
  return fraction < valRatio ? 'val' : 'train';
}

function sortedRecords(records: readonly SiblingRecord[]): SiblingRecord[] {
  return [...records].sort((a, b) =>
    compareBytewise(a.parent_id, b.parent_id) ||
    a.teacher_rank - b.teacher_rank ||
    compareBytewise(a.move, b.move)
  );
}

function idDigest(ids: ReadonlySet<string>): string {
  return sha256([...ids].sort(compareBytewise).join('\n'));
}

export function assertSplitIsolation(
  train: readonly SiblingRecord[],
  val: readonly SiblingRecord[]
): void {
  if (train.some((record) => record.split !== 'train')) {
    throw new Error('train collection contains a record without split=train');
  }
  if (val.some((record) => record.split !== 'val')) {
    throw new Error('val collection contains a record without split=val');
  }
  const trainGames = new Set(train.map((record) => record.game_id));
  const valGames = new Set(val.map((record) => record.game_id));
  const gameOverlap = [...trainGames].filter((id) => valGames.has(id));
  if (gameOverlap.length > 0) {
    throw new Error(`game leakage across train/val: ${gameOverlap.sort().join(', ')}`);
  }

  const trainParents = new Set(train.map((record) => record.parent_id));
  const valParents = new Set(val.map((record) => record.parent_id));
  const parentOverlap = [...trainParents].filter((id) => valParents.has(id));
  if (parentOverlap.length > 0) {
    throw new Error(`parent leakage across train/val: ${parentOverlap.sort().join(', ')}`);
  }

  const trainPositions = new Set(train.map((record) => record.position_id));
  const valPositions = new Set(val.map((record) => record.position_id));
  const positionOverlap = [...trainPositions].filter((id) => valPositions.has(id));
  if (positionOverlap.length > 0) {
    throw new Error(`position leakage across train/val: ${positionOverlap.sort().join(', ')}`);
  }

  const trainChildPositions = new Set(train.map((record) => record.child_position_id));
  const valChildPositions = new Set(val.map((record) => record.child_position_id));
  const childPositionOverlap = [...trainChildPositions].filter((id) => valChildPositions.has(id));
  if (childPositionOverlap.length > 0) {
    throw new Error(
      `child position leakage across train/val: ${childPositionOverlap.sort().join(', ')}`
    );
  }
}

/**
 * Split whole games, then remove any train parent whose position also appears
 * in validation. Validation wins so the holdout remains stable and uncontaminated.
 */
export function splitSiblingDataset(
  records: readonly SiblingRecord[],
  options: SplitSiblingDatasetOptions = {}
): SplitSiblingDatasetResult {
  const seed = String(options.seed ?? '42');
  const valRatio = options.valRatio ?? 0.1;
  const inputGroups = validateParentGroups(records);
  const grouped = groupByParent(records);
  const assignedGroups = inputGroups.map((summary) => ({
    summary,
    split: assignGameSplit(summary.game_id, { seed, valRatio }),
    records: grouped.get(summary.parent_id) as SiblingRecord[],
  }));

  const valPositionKeys = new Set(
    assignedGroups
      .filter((group) => group.split === 'val')
      .map((group) => group.summary.position_id)
  );
  const valChildPositionKeys = new Set(
    assignedGroups
      .filter((group) => group.split === 'val')
      .flatMap((group) => group.records.map((record) => record.child_position_id))
  );

  let droppedRecords = 0;
  let droppedParents = 0;
  let childDroppedRecords = 0;
  let childDroppedParents = 0;
  const train: SiblingRecord[] = [];
  const val: SiblingRecord[] = [];
  for (const group of assignedGroups) {
    if (group.split === 'train' && valPositionKeys.has(group.summary.position_id)) {
      droppedParents++;
      droppedRecords += group.records.length;
      continue;
    }
    if (
      group.split === 'train' &&
      group.records.some((record) => valChildPositionKeys.has(record.child_position_id))
    ) {
      childDroppedParents++;
      childDroppedRecords += group.records.length;
      continue;
    }
    const target = group.split === 'val' ? val : train;
    for (const record of group.records) target.push({ ...record, split: group.split });
  }

  const sortedTrain = sortedRecords(train);
  const sortedVal = sortedRecords(val);
  validateParentGroups(sortedTrain);
  validateParentGroups(sortedVal);
  assertSplitIsolation(sortedTrain, sortedVal);

  const inputGames = new Set(records.map((record) => record.game_id));
  const trainGames = new Set(sortedTrain.map((record) => record.game_id));
  const valGames = new Set(sortedVal.map((record) => record.game_id));
  const trainParents = new Set(sortedTrain.map((record) => record.parent_id));
  const valParents = new Set(sortedVal.map((record) => record.parent_id));
  const trainPositions = new Set(sortedTrain.map((record) => record.position_id));
  const valPositions = new Set(sortedVal.map((record) => record.position_id));
  const trainChildPositions = new Set(sortedTrain.map((record) => record.child_position_id));
  const valChildPositions = new Set(sortedVal.map((record) => record.child_position_id));

  const manifest: SiblingManifest = {
    schema: SIBLING_MANIFEST_SCHEMA,
    record_schema: SIBLING_SCHEMA,
    schema_version: SIBLING_SCHEMA_VERSION,
    split_seed: seed,
    val_ratio: valRatio,
    train_game_ids_sha256: idDigest(trainGames),
    val_game_ids_sha256: idDigest(valGames),
    stats: {
      input_records: records.length,
      output_records: sortedTrain.length + sortedVal.length,
      input_parents: inputGroups.length,
      output_parents: trainParents.size + valParents.size,
      input_games: inputGames.size,
      train_records: sortedTrain.length,
      val_records: sortedVal.length,
      train_parents: trainParents.size,
      val_parents: valParents.size,
      train_games: trainGames.size,
      val_games: valGames.size,
      val_position_priority_dropped_records: droppedRecords,
      val_position_priority_dropped_parents: droppedParents,
      val_child_position_priority_dropped_records: childDroppedRecords,
      val_child_position_priority_dropped_parents: childDroppedParents,
      game_overlap: [...trainGames].filter((id) => valGames.has(id)).length,
      position_overlap: [...trainPositions].filter((id) => valPositions.has(id)).length,
      child_position_overlap: [...trainChildPositions].filter((id) => valChildPositions.has(id)).length,
    },
  };

  return { train: sortedTrain, val: sortedVal, manifest };
}
