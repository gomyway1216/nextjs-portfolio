import { describe, expect, it } from 'vitest';

import {
  MAX_RECORDED_MOVES,
  SHOGI_GAME_RECORD_SCHEMA,
  buildGameRecord,
  findBookExitPly,
  formatKifuText,
  newGameId,
  outcomeForWinner,
  toEngineIdentity,
  toUsiMove,
  type RecordedMove,
} from '@/components/game/ShogiImproved/gameRecord';
import { computeDisambiguation } from '@/components/game/ShogiImproved/KifuNotationImproved';
import { parseKifuText } from '@/components/game/ShogiImproved/KifuImportImproved';
import { InitialPositionImproved } from '@/components/game/ShogiImproved/InitialPositionImproved';
import { GenerateMovesImproved } from '@/components/game/ShogiImproved/GenerateMovesImproved';
import { GOTE, SENTE, SFU, SKA, Te, makePosition } from '@/components/game/ShogiImproved/types';

const NO_FLAGS = {
  right: false, left: false, chokushin: false, up: false,
  pull: false, sideways: false, drop: false, noPromote: false,
};

function move(overrides: Partial<RecordedMove> = {}): RecordedMove {
  return {
    koma: SFU,
    from: makePosition(7, 7),
    to: makePosition(7, 6),
    promote: false,
    disambiguation: { ...NO_FLAGS },
    ...overrides,
  };
}

describe('toUsiMove', () => {
  it('writes a board move as from-square then to-square', () => {
    // 7七 → 7六 is ▲７六歩, "7g7f" to any engine.
    expect(toUsiMove(move())).toBe('7g7f');
  });

  it('marks a promotion with a trailing +', () => {
    expect(
      toUsiMove(move({ from: makePosition(2, 2), to: makePosition(8, 8), promote: true })),
    ).toBe('2b8h+');
  });

  it('writes a drop as PIECE*square', () => {
    expect(toUsiMove(move({ from: 0, to: makePosition(5, 5), koma: SKA }))).toBe('B*5e');
  });

  it('uses the same letter for either side, since USI has no side marker', () => {
    const sente = toUsiMove(move({ from: 0, to: makePosition(5, 5), koma: SFU }));
    const gote = toUsiMove(move({ from: 0, to: makePosition(5, 5), koma: GOTE + 1 }));
    expect(sente).toBe('P*5e');
    expect(gote).toBe('P*5e');
  });

  it('refuses a square that is off the board rather than inventing one', () => {
    // A best-effort string here would replay into the wrong position, which is
    // strictly worse than losing the record.
    expect(toUsiMove(move({ to: makePosition(10, 1) }))).toBeNull();
    expect(toUsiMove(move({ to: 0 }))).toBeNull();
    expect(toUsiMove(move({ from: makePosition(0, 4) }))).toBeNull();
  });

  it('refuses a drop of a piece that cannot be in hand', () => {
    // Kings are never dropped; a promoted piece reverts before it reaches the
    // hand, so neither has a USI drop letter.
    expect(toUsiMove(move({ from: 0, to: makePosition(5, 5), koma: SENTE + 8 }))).toBeNull();
  });
});

describe('formatKifuText', () => {
  it('round-trips through the game\'s own kifu importer', () => {
    // The saved kifu is only useful if it goes back in where it came out. Play
    // a real opening against the rules engine, format it, and re-parse it.
    const position = InitialPositionImproved.createInitialPosition();
    const usiSquares: Array<[number, number, number, number]> = [
      [7, 7, 7, 6], // ▲７六歩
      [3, 3, 3, 4], // △３四歩
      [8, 8, 2, 2], // ▲２二角成 (bishop takes)
    ];

    const moves: RecordedMove[] = [];
    for (const [fromSuji, fromDan, toSuji, toDan] of usiSquares) {
      const from = makePosition(fromSuji, fromDan);
      const to = makePosition(toSuji, toDan);
      const legal = GenerateMovesImproved.generateLegalMoves(position);
      const found = legal.find((m: Te) => m.from === from && m.to === to);
      expect(found, `no legal move ${fromSuji}${fromDan}->${toSuji}${toDan}`).toBeTruthy();
      const te = found as Te;
      moves.push({
        koma: te.koma, from: te.from, to: te.to, promote: te.promote,
        disambiguation: computeDisambiguation(position, te),
      });
      position.move(te);
      position.setTeban(position.teban === SENTE ? GOTE : SENTE);
    }

    const text = formatKifuText(moves);
    expect(text.split('\n')[0]).toBe('1. ▲７六歩');

    const reparsed = parseKifuText(text, InitialPositionImproved.createInitialPosition());
    expect(reparsed.error).toBeUndefined();
    expect(reparsed.steps).toHaveLength(moves.length);
    reparsed.steps.forEach((step, i) => {
      expect(step.move.from).toBe(moves[i].from);
      expect(step.move.to).toBe(moves[i].to);
    });
  });

  it('numbers moves from 1 and writes 同 for a recapture on the same square', () => {
    const moves = [
      move({ to: makePosition(7, 6) }),
      move({ koma: GOTE + 1, to: makePosition(7, 6) }),
    ];
    const lines = formatKifuText(moves).split('\n');
    expect(lines[0].startsWith('1. ▲')).toBe(true);
    expect(lines[1]).toContain('同');
  });
});

describe('findBookExitPly', () => {
  it('reports the first AI ply that was not answered from the book', () => {
    // null = a ply the human played; those are skipped, but still counted, so
    // the number lines up with the kifu's own numbering.
    expect(findBookExitPly([null, 'book', null, 'book', null, 'wasm'])).toBe(6);
  });

  it('is null while the AI is still entirely in book', () => {
    expect(findBookExitPly([null, 'book', null, 'book'])).toBeNull();
  });

  it('is null when the AI has not moved at all', () => {
    expect(findBookExitPly([null, null])).toBeNull();
  });

  it('reports ply 1 when the AI never used the book (as in handicap games)', () => {
    expect(findBookExitPly(['wasm', null])).toBe(1);
  });
});

describe('outcomeForWinner', () => {
  it('reads the result from the human player\'s side, which is always Sente', () => {
    expect(outcomeForWinner(SENTE, SENTE, GOTE)).toBe('player_win');
    expect(outcomeForWinner(GOTE, SENTE, GOTE)).toBe('ai_win');
  });

  it('calls a finished game with no winner a draw', () => {
    // The board reaches gameOver with winner === null only when neither king
    // was mated.
    expect(outcomeForWinner(null, SENTE, GOTE)).toBe('draw');
  });

  it('stays player-relative in handicap games, where the AI moves first', () => {
    // Moving first does not make the AI Sente; the human keeps that side.
    expect(outcomeForWinner(SENTE, SENTE, GOTE)).toBe('player_win');
  });
});

describe('toEngineIdentity', () => {
  it('keeps the content hashes and drops everything else', () => {
    const identity = toEngineIdentity({
      schema: 'shogi-ai-engine-diagnostics-v1',
      nnue: {
        fetchStatus: 'loaded',
        fetchedWeights: { sha256: 'a'.repeat(64), bytes: 900 },
        loaded: true,
        enabled: true,
      },
      wasm: { ready: true, embedded: { sha256: 'b'.repeat(64), bytes: 700 } },
      lastSearch: { requestId: 3, searchPath: 'wasm', evaluationPath: 'nnue-wasm' },
    });

    expect(identity).toEqual({
      nnue_status: 'loaded',
      nnue: { sha256: 'a'.repeat(64), bytes: 900 },
      wasm: { sha256: 'b'.repeat(64), bytes: 700 },
    });
  });

  it('is null when the worker never reported', () => {
    expect(toEngineIdentity(null)).toBeNull();
  });

  it('still reports the wasm build when the weights failed to load', () => {
    const identity = toEngineIdentity({
      schema: 'shogi-ai-engine-diagnostics-v1',
      nnue: { fetchStatus: 'rejected', fetchedWeights: null, loaded: false, enabled: false },
      wasm: { ready: true, embedded: { sha256: 'c'.repeat(64), bytes: 700 } },
      lastSearch: null,
    });
    expect(identity?.nnue).toBeUndefined();
    expect(identity?.nnue_status).toBe('rejected');
    expect(identity?.wasm?.sha256).toBe('c'.repeat(64));
  });
});

describe('buildGameRecord', () => {
  const base = {
    gameId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
    sessionId: 'session-1',
    difficulty: 'medium' as const,
    handicap: 'none' as const,
    outcome: 'player_win' as const,
    endReason: 'checkmate' as const,
    engine: null,
    startedAt: new Date('2026-08-22T11:00:00.000Z'),
    endedAt: new Date('2026-08-22T11:20:00.000Z'),
  };

  it('produces both notations, the schema tag and the timestamps', () => {
    const record = buildGameRecord({
      ...base,
      moves: [move(), move({ koma: GOTE + 1, from: makePosition(3, 3), to: makePosition(3, 4) })],
    });

    expect(record).not.toBeNull();
    expect(record?.schema).toBe(SHOGI_GAME_RECORD_SCHEMA);
    expect(record?.move_count).toBe(2);
    expect(record?.moves_usi).toEqual(['7g7f', '3c3d']);
    expect(record?.kifu.split('\n')).toHaveLength(2);
    expect(record?.started_at).toBe('2026-08-22T11:00:00.000Z');
    expect(record?.ended_at).toBe('2026-08-22T11:20:00.000Z');
    expect(record?.session_id).toBe('session-1');
  });

  it('carries the book exit ply taken from the moves themselves', () => {
    const record = buildGameRecord({
      ...base,
      moves: [move(), move({ searchPath: 'book' }), move(), move({ searchPath: 'wasm' })],
    });
    expect(record?.book_exit_ply).toBe(4);
  });

  it('returns null for a game with no moves', () => {
    expect(buildGameRecord({ ...base, moves: [] })).toBeNull();
  });

  it('returns null past the move ceiling instead of sending a doomed request', () => {
    const tooMany = new Array(MAX_RECORDED_MOVES + 1).fill(null).map(() => move());
    expect(buildGameRecord({ ...base, moves: tooMany })).toBeNull();
    const atLimit = new Array(MAX_RECORDED_MOVES).fill(null).map(() => move());
    expect(buildGameRecord({ ...base, moves: atLimit })).not.toBeNull();
  });

  it('discards the whole game when one move will not convert', () => {
    const record = buildGameRecord({
      ...base,
      moves: [move(), move({ to: makePosition(10, 10) }), move()],
    });
    expect(record).toBeNull();
  });

  it('omits session_id rather than sending an empty one', () => {
    const record = buildGameRecord({ ...base, sessionId: null, moves: [move()] });
    expect(record).not.toBeNull();
    expect('session_id' in (record as object)).toBe(false);
  });
});

describe('newGameId', () => {
  it('is a lowercase UUID v4, which is what the server accepts', () => {
    for (let i = 0; i < 20; i++) {
      expect(newGameId()).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
    }
  });

  it('does not repeat itself', () => {
    const ids = new Set(Array.from({ length: 100 }, () => newGameId()));
    expect(ids.size).toBe(100);
  });
});
