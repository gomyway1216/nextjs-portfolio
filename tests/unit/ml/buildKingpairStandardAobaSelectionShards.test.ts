import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  STANDARD_AOBA_SELECTION_SHARD_ROWS,
  buildStandardAobaSelection,
  parseStandardSourceRow,
} from '../../../ml/build_kingpair_standard_aoba_selection_shards';
import {
  SELECTION_HEADER_SCHEMA,
  SELECTION_ROW_SCHEMA,
  type SelectionHeader,
  type SelectionRow,
} from '../../../ml/generate_kingpair_aoba_teacher_shards';
import { positionKeyFromSfen } from '../../../ml/sibling-data';
import { childSfenAfterUsi, positionFromSfen, rulesCompleteLegalMoves } from '../../../ml/shogi-sfen';

const START = 'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1';
const CHECKMATED = '4k4/4+R4/5G3/9/9/9/9/9/4K4 w - 1';
const roots: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'standard-aoba-selection-'));
  roots.push(root);
  return root;
}

function parentPly(sfen: string): number {
  return positionFromSfen(sfen).moveNumber - 1;
}

function fixturePositions(count: number): string[] {
  const queue = [START];
  const positions: string[] = [];
  const seen = new Set<string>();
  while (queue.length > 0 && positions.length < count) {
    const sfen = queue.shift() as string;
    const positionId = positionKeyFromSfen(sfen);
    if (seen.has(positionId)) continue;
    seen.add(positionId);
    const legal = rulesCompleteLegalMoves(positionFromSfen(sfen).position);
    if (legal.length >= 4) positions.push(sfen);
    for (const move of legal) {
      const child = childSfenAfterUsi(sfen, move.usi);
      if (!seen.has(positionKeyFromSfen(child))) queue.push(child);
      if (queue.length > count * 4) break;
    }
  }
  if (positions.length !== count) throw new Error(`could only construct ${positions.length} positions`);
  return positions;
}

async function writeJsonl(file: string, rows: readonly unknown[]): Promise<void> {
  await fs.writeFile(file, `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`);
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe('standard Aoba selection builder', () => {
  it('deduplicates all four inputs, applies exclusions, and emits create-only 256-row shards', async () => {
    const root = await temporaryDirectory();
    const positions = fixturePositions(259);
    const files = {
      large: path.join(root, 'train.parents.jsonl'),
      v9: path.join(root, 'v9-train.jsonl'),
      wcsc: path.join(root, 'parents.raw.jsonl'),
      browser: path.join(root, 'browser-train.jsonl'),
      exclusionPlain: path.join(root, 'sealed-ids.txt'),
      exclusionJsonl: path.join(root, 'runop-ids.jsonl'),
      contract: path.join(root, 'contract.json'),
      output: path.join(root, 'selection'),
    };
    await writeJsonl(files.large, positions.slice(0, 70).map((sfen, index) => ({
      schema: 'shogi-floodgate-scratch-warm-parent-v1',
      split: 'train',
      game_id: `large-${index}`,
      position_id: positionKeyFromSfen(sfen),
      // Exercise canonical extraction without changing the semantic position.
      sfen: index === 0 ? sfen.replaceAll(' ', '  ') : sfen,
      ply: parentPly(sfen),
    })));
    await writeJsonl(files.v9, positions.slice(70, 140).map((sfen, index) => ({
      schema: 'shogi-sibling-v1',
      split: 'train',
      game_id: `v9-${index}`,
      position_id: positionKeyFromSfen(sfen),
      sfen,
      ply: parentPly(sfen),
      parent_sfen: sfen,
      parent_ply: parentPly(sfen),
    })));
    await writeJsonl(files.wcsc, [
      ...positions.slice(140, 209).map((sfen, index) => ({
        schema_version: 1,
        source: 'wcsc',
        game_id: `wcsc-${index}`,
        position_id: positionKeyFromSfen(sfen),
        parent_sfen: sfen,
        ply: parentPly(sfen),
      })),
      {
        schema_version: 1,
        source: 'wcsc',
        game_id: 'wcsc-checkmated',
        position_id: positionKeyFromSfen(CHECKMATED),
        parent_sfen: CHECKMATED,
        ply: parentPly(CHECKMATED),
      },
    ]);
    await writeJsonl(files.browser, [
      ...positions.slice(209).map((sfen, index) => ({
        schema: 'shogi-sibling-v1',
        split: 'train',
        game_id: `browser-${index}`,
        position_id: positionKeyFromSfen(sfen),
        sfen,
        ply: parentPly(sfen),
        parent_sfen: sfen,
        parent_ply: parentPly(sfen),
      })),
      {
        schema: 'shogi-sibling-v1',
        split: 'train',
        game_id: 'browser-preferred-duplicate',
        position_id: positionKeyFromSfen(positions[0]),
        sfen: positions[0],
        ply: parentPly(positions[0]),
        parent_sfen: positions[0],
        parent_ply: parentPly(positions[0]),
      },
    ]);
    await fs.writeFile(files.exclusionPlain, `${positionKeyFromSfen(positions[257])}\n`);
    await writeJsonl(files.exclusionJsonl, [{ position_id: positionKeyFromSfen(positions[258]) }]);
    await fs.writeFile(files.contract, '{"fixture":true}\n');

    const options = {
      largeScratch: files.large,
      v9Train: files.v9,
      wcscParents: files.wcsc,
      browserTrain: files.browser,
      exclusionIds: [files.exclusionPlain, files.exclusionJsonl],
      selectionContract: files.contract,
      outputRoot: files.output,
      target: 257,
      sourceKinds: undefined,
    };
    const summary = await buildStandardAobaSelection(options);
    expect(summary).toMatchObject({
      status: 'complete',
      selected_unique_parents: 257,
      shard_count: 2,
      shard_rows: STANDARD_AOBA_SELECTION_SHARD_ROWS,
      excluded_occurrences: 2,
      duplicate_selected_occurrences: 1,
      rejected_fewer_than_four_legal_moves: 1,
    });

    const names = (await fs.readdir(files.output)).sort();
    expect(names).toEqual([
      'selected-position-ids.txt',
      'selection-00000-of-00002.jsonl',
      'selection-00001-of-00002.jsonl',
      'selection-summary.json',
    ]);
    const shardNames = names.filter((name) => name.startsWith('selection-0'));
    const decoded = await Promise.all(shardNames.map(async (name) =>
      (await fs.readFile(path.join(files.output, name), 'utf8'))
        .trimEnd()
        .split('\n')
        .map((line) => JSON.parse(line) as SelectionHeader | SelectionRow)
    ));
    expect(decoded[0][0]).toMatchObject({ schema: SELECTION_HEADER_SCHEMA, rows: 256 });
    expect(decoded[1][0]).toMatchObject({ schema: SELECTION_HEADER_SCHEMA, rows: 1 });
    const rows = decoded.flatMap((shard) => shard.slice(1) as SelectionRow[]);
    expect(rows).toHaveLength(257);
    expect(new Set(rows.map((row) => row.position_id))).toHaveLength(257);
    expect(rows.every((row) => row.schema === SELECTION_ROW_SCHEMA && row.legal_moves >= 4)).toBe(true);
    expect(rows.map((row) => row.global_index)).toEqual([...Array(257).keys()]);
    expect(rows.map((row) => row.priority_sha256)).toEqual(
      [...rows.map((row) => row.priority_sha256)].sort(),
    );
    const duplicate = rows.find((row) => row.position_id === positionKeyFromSfen(positions[0]));
    expect(duplicate).toMatchObject({
      domain: 'browser-confusion-train',
      game_id: 'browser-preferred-duplicate',
      parent_sfen: positions[0],
    });
    expect(rows.some((row) => row.position_id === positionKeyFromSfen(positions[257]))).toBe(false);
    expect(rows.some((row) => row.position_id === positionKeyFromSfen(positions[258]))).toBe(false);
    const selectedIds = (await fs.readFile(path.join(files.output, 'selected-position-ids.txt'), 'utf8'))
      .trimEnd().split('\n');
    expect(selectedIds).toEqual([...rows.map((row) => row.position_id)].sort());
    const summaryReceipt = JSON.parse(
      await fs.readFile(path.join(files.output, 'selection-summary.json'), 'utf8'),
    );
    expect(summaryReceipt).toMatchObject({
      selected_unique_parents: 257,
      selected_position_ids_sha256: summary.selected_position_ids_sha256,
    });
    await expect(buildStandardAobaSelection(options)).rejects.toThrow(/output root already exists/);
  }, 30_000);

  it('fails closed when a train-only input contains another split', () => {
    expect(() => parseStandardSourceRow('v9', {
      split: 'development',
      parent_sfen: START,
      parent_ply: 0,
      position_id: positionKeyFromSfen(START),
      game_id: 'fixture',
    })).toThrow(/split must be train/);
  });

  it('selects the labelled sibling child as the next teacher parent', () => {
    const move = rulesCompleteLegalMoves(positionFromSfen(START).position)[0];
    const child = childSfenAfterUsi(START, move.usi);
    const parsed = parseStandardSourceRow('browser-confusion', {
      schema: 'shogi-sibling-v1',
      split: 'train',
      game_id: 'browser-child-fixture',
      parent_sfen: START,
      parent_ply: 0,
      position_id: positionKeyFromSfen(child),
      sfen: child,
      ply: 1,
    });
    expect(parsed).toMatchObject({
      positionId: positionKeyFromSfen(child),
      parentSfen: child,
      ply: 1,
    });
  });

  it('can freeze one explicit source family for a domain quota', async () => {
    const root = await temporaryDirectory();
    const positions = fixturePositions(8);
    const empty = path.join(root, 'empty.jsonl');
    await fs.writeFile(empty, '');
    const browser = path.join(root, 'browser.jsonl');
    await writeJsonl(browser, positions.map((sfen, index) => ({
      schema: 'shogi-sibling-v1', split: 'train', game_id: `browser-${index}`,
      position_id: positionKeyFromSfen(sfen), sfen, ply: parentPly(sfen),
      parent_sfen: sfen, parent_ply: parentPly(sfen),
    })));
    const contract = path.join(root, 'contract.json');
    await fs.writeFile(contract, '{}\n');
    const output = path.join(root, 'browser-only');
    const summary = await buildStandardAobaSelection({
      largeScratch: empty, v9Train: empty, wcscParents: empty, browserTrain: browser,
      exclusionIds: [], selectionContract: contract, outputRoot: output, target: 7,
      sourceKinds: ['browser-confusion'],
    });
    expect(summary.selected_unique_parents).toBe(7);
    expect(summary.selected_by_domain).toEqual({ 'browser-confusion-train': 7 });
  });
});
