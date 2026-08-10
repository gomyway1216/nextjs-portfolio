import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { buildSpatialSelection } from '../../../ml/build_kingpair_aoba_spatial_selection_shards';
import { parseSelectionShard } from '../../../ml/generate_kingpair_aoba_teacher_shards';
import { positionFromSfen, rulesCompleteLegalMoves } from '../../../ml/shogi-sfen';
import { encodeRootPolicyStudentBoard } from '../../../src/components/game/ShogiImproved/rootPolicyStudentRuntime';

const PAYLOAD = 'a'.repeat(64);
const START = 'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1';
const AFTER_PAWN = 'lnsgkgsnl/1r5b1/ppppppppp/9/9/2P6/PP1PPPPPP/1B5R1/LNSGKGSNL w - 2';
const temporaries: string[] = [];

function fixture(options: { fault?: number; gameIndex?: number } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'kingpair-aoba-spatial-'));
  temporaries.push(root);
  const games = join(root, 'games');
  mkdirSync(games);
  const rows = [START, AFTER_PAWN].map((sfen, ply) => {
    const { position } = positionFromSfen(sfen);
    return {
      schema: 'shogi-spatial-policy-value-selfplay-position-v1',
      game_id: 'spatial-puct-100000',
      ply,
      side: position.teban,
      planes: Array.from(encodeRootPolicyStudentBoard(position, ply)),
      moves: rulesCompleteLegalMoves(position).slice(0, 4).map((move) => move.usi),
    };
  });
  const footer = {
    schema: 'shogi-spatial-policy-value-selfplay-game-v1',
    game_id: 'spatial-puct-100000',
    game_index: options.gameIndex ?? 100000,
    positions: rows.length,
    model_payload_sha256: PAYLOAD,
    technical_faults: options.fault ?? 0,
  };
  writeFileSync(join(games, 'game-100000.jsonl'), `${[...rows, footer].map((row) => JSON.stringify(row)).join('\n')}\n`);
  const duplicate = { ...rows[0], game_id: 'spatial-puct-100001' };
  const duplicateFooter = { ...footer, game_id: duplicate.game_id, game_index: 100001, positions: 1 };
  writeFileSync(
    join(games, 'game-100001.jsonl'),
    `${[duplicate, duplicateFooter].map((row) => JSON.stringify(row)).join('\n')}\n`,
  );
  const protocol = join(root, 'protocol.json');
  writeFileSync(protocol, '{}\n');
  return { root, games, protocol };
}

afterEach(() => {
  for (const root of temporaries.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('KingPair Aoba spatial selection shards', () => {
  it('writes generator-compatible, semantic-unique selection rows', () => {
    const value = fixture();
    const output = join(value.root, 'selection');
    expect(buildSpatialSelection({
      gameRoots: [{ path: value.games, modelPayloadSha256: PAYLOAD }],
      outputRoot: output,
      targetParents: 2,
      protocolPath: value.protocol,
    })).toEqual({ selected: 2, shards: 1 });
    const parsed = parseSelectionShard(readFileSync(join(output, 'selection-00000-of-00001.jsonl'), 'utf8'));
    expect(parsed.rows.map((row) => row.global_index)).toEqual([0, 1]);
    expect(new Set(parsed.rows.map((row) => row.position_id)).size).toBe(2);
    expect(parsed.rows.every((row) => row.domain === 'fresh-selfplay' && row.legal_moves >= 4)).toBe(true);
    expect(() => buildSpatialSelection({
      gameRoots: [{ path: value.games, modelPayloadSha256: PAYLOAD }],
      outputRoot: output,
      targetParents: 1,
      protocolPath: value.protocol,
    })).toThrow('already exists');
  });

  it('fails closed on payload, fault, index, and insufficient-parent drift', () => {
    for (const [fixtureOptions, payload, target, message] of [
      [{}, 'b'.repeat(64), 1, 'footer/index/payload'],
      [{ fault: 1 }, PAYLOAD, 1, 'footer/index/payload'],
      [{ gameIndex: 1 }, PAYLOAD, 1, 'footer/index/payload'],
      [{}, PAYLOAD, 3, 'only 2 legal unique parents'],
    ] as const) {
      const value = fixture(fixtureOptions);
      expect(() => buildSpatialSelection({
        gameRoots: [{ path: value.games, modelPayloadSha256: payload }],
        outputRoot: join(value.root, 'selection'),
        targetParents: target,
        protocolPath: value.protocol,
      })).toThrow(message);
    }
  });
});
