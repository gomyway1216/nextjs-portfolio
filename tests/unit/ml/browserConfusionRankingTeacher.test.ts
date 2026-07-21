import { describe, expect, it } from 'vitest';

import {
  BROWSER_CONFUSION_PARENT_SCHEMA,
  buildCoreFromRows,
  labelAllLegalMoves,
  parseSourceTeacherRow,
  selectConfusionParent,
  validateAuditedSourceManifestValue,
  type BrowserProbe,
  type FixedMoveTeacher,
  type SelectedConfusionParent,
} from '../../../ml/build-browser-confusion-ranking-teacher';
import { childSfenAfterUsi, positionFromSfen, rulesCompleteLegalMoves } from '../../../ml/shogi-sfen';
import { positionKeyFromSfen } from '../../../ml/sibling-data';
import type { UsiMultiPvResult } from '../../../ml/usi-multipv';

const START = 'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1';
const SOURCE_SHA = 'a'.repeat(64);

function source(bestmove = '7g7f') {
  return { sfen: START, cp: 21, ply: 0, bestmove, depth: 12 };
}

function fakeBrowser(bestmove: string): BrowserProbe {
  return {
    search: () => ({
      bestmove,
      score: 7,
      completed_depth: 4,
      nodes: 99,
      leaves: 55,
    }),
  };
}

function parent(): SelectedConfusionParent {
  const selected = selectConfusionParent(source(), 17, SOURCE_SHA, fakeBrowser('2g2f'));
  if (!selected) throw new Error('fixture did not select');
  return selected;
}

function fakeTeacher(score: (move: string) => number) {
  const searches: string[] = [];
  let resets = 0;
  const teacher: FixedMoveTeacher = {
    async resetForParent() {
      resets += 1;
    },
    async search(sfen, multipv, limit, searchmoves): Promise<UsiMultiPvResult> {
      expect(multipv).toBe(1);
      expect(limit).toEqual({ depth: 3 });
      expect(searchmoves).toEqual([]);
      const rootMove = rulesCompleteLegalMoves(positionFromSfen(START).position)
        .map((entry) => entry.usi)
        .find((move) => childSfenAfterUsi(START, move) === sfen);
      if (!rootMove) throw new Error('fake teacher received an unknown child');
      const move = rulesCompleteLegalMoves(positionFromSfen(sfen).position)[0].usi;
      searches.push(rootMove);
      return {
        depth: 3,
        bestmove: move,
        observedNodes: 100 + searches.length,
        lines: [
          {
            depth: 3,
            multipv: 1,
            cp: -score(rootMove),
            nodes: 100 + searches.length,
            move,
            pv: [move],
            scoreKind: 'cp',
          },
        ],
      };
    },
  };
  return { teacher, searches, resets: () => resets };
}

describe('browser-confusion all-legal ranking teacher', () => {
  it('requires canonical source rows with a legal strong-teacher move', () => {
    expect(parseSourceTeacherRow(source())).toEqual(source());
    expect(
      parseSourceTeacherRow({
        ...source(),
        game_id: 'audited-game-a',
        position_id: positionKeyFromSfen(START),
      })
    ).toMatchObject({ game_id: 'audited-game-a', position_id: positionKeyFromSfen(START) });
    expect(() =>
      parseSourceTeacherRow({ ...source(), position_id: `sha256:${'0'.repeat(64)}` })
    ).toThrow(/position_id/);
    expect(() => parseSourceTeacherRow({ ...source(), ply: 2 })).toThrow(/move number/);
    expect(() => parseSourceTeacherRow({ ...source(), bestmove: '9z9z' })).toThrow(/not legal/);
  });

  it('binds the audited source manifest to exact input bytes', () => {
    const input = { path: '/data/train.jsonl', bytes: 123, sha256: SOURCE_SHA };
    expect(
      validateAuditedSourceManifestValue(
        {
          schema: 'audit-v1',
          output: { bytes: 123, sha256: SOURCE_SHA, rows: 800_000 },
        },
        input
      )
    ).toEqual({ schema: 'audit-v1', declared_rows: 800_000 });
    expect(() =>
      validateAuditedSourceManifestValue(
        { schema: 'audit-v1', output: { bytes: 124, sha256: SOURCE_SHA, rows: 800_000 } },
        input
      )
    ).toThrow(/does not match/);
  });

  it('selects disagreement only and rejects an illegal browser result', () => {
    expect(selectConfusionParent(source(), 1, SOURCE_SHA, fakeBrowser('7g7f'))).toBeNull();
    const selected = selectConfusionParent(source(), 1, SOURCE_SHA, fakeBrowser('2g2f'));
    expect(selected).toMatchObject({
      schema: BROWSER_CONFUSION_PARENT_SCHEMA,
      source_line: 1,
      parent_sfen: START,
      source_teacher: { bestmove: '7g7f' },
      browser: { bestmove: '2g2f' },
    });
    expect(() => selectConfusionParent(source(), 1, SOURCE_SHA, fakeBrowser('9z9z'))).toThrow(
      /illegal/
    );
  });

  it('searches every legal move once in byte order and emits exact legal children', async () => {
    const fixture = parent();
    const legal = rulesCompleteLegalMoves(positionFromSfen(START).position).map((entry) => entry.usi);
    const fake = fakeTeacher((move) => (move === '7g7f' ? 500 : move.charCodeAt(0)));
    const first = await labelAllLegalMoves(fixture, fake.teacher, 3);

    expect(fake.searches).toEqual(legal);
    expect(fake.resets()).toBe(legal.length);
    expect(first.records).toHaveLength(legal.length);
    expect(new Set(first.records.map((row) => row.move))).toEqual(new Set(legal));
    expect(first.records[0]).toMatchObject({ move: '7g7f', teacher_rank: 1, teacher_parent_cp: 500 });
    for (const row of first.records) {
      expect(row.child_sfen).toBe(childSfenAfterUsi(START, row.move));
      expect(row.sfen).toBe(row.child_sfen);
      expect(row.teacher_child_cp).toBe(-row.teacher_parent_cp);
    }

    const againFake = fakeTeacher((move) => (move === '7g7f' ? 500 : move.charCodeAt(0)));
    const again = await labelAllLegalMoves(fixture, againFake.teacher, 3);
    expect(again).toEqual(first);
  });

  it('streams past browser agreements and preserves deterministic source identities', async () => {
    let searches = 0;
    const browser: BrowserProbe = {
      search: () => ({
        bestmove: ++searches === 1 ? '7g7f' : '2g2f',
        score: 0,
        completed_depth: 4,
        nodes: 1,
        leaves: 1,
      }),
    };
    const fake = fakeTeacher((move) => move.charCodeAt(0));
    async function* rows() {
      yield { line: 1, value: source() };
      yield { line: 2, value: source() };
    }
    const result = await buildCoreFromRows(rows(), {
      sourceSha256: SOURCE_SHA,
      targetParents: 1,
      maxScanRows: 2,
      teacherDepth: 3,
      browser,
      teacher: fake.teacher,
    });
    expect(result.scannedRows).toBe(2);
    expect(result.shardEligibleRows).toBe(2);
    expect(result.browserAgreements).toBe(1);
    expect(result.selected).toHaveLength(1);
    expect(result.selected[0].parent.source_line).toBe(2);
    expect(result.records).toHaveLength(
      rulesCompleteLegalMoves(positionFromSfen(START).position).length
    );
  });

  it('partitions source lines into deterministic disjoint process shards', async () => {
    const fake = fakeTeacher((move) => move.charCodeAt(0));
    async function* rows() {
      yield { line: 1, value: source() };
      yield { line: 2, value: source() };
    }
    const result = await buildCoreFromRows(rows(), {
      sourceSha256: SOURCE_SHA,
      targetParents: 1,
      maxScanRows: 2,
      teacherDepth: 3,
      browser: fakeBrowser('2g2f'),
      teacher: fake.teacher,
      shard: { index: 1, total: 2 },
    });
    expect(result.scannedRows).toBe(2);
    expect(result.shardEligibleRows).toBe(1);
    expect(result.selected[0].parent.source_line).toBe(2);
  });
});
