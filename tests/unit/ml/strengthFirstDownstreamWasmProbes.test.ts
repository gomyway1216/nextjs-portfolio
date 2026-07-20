import { describe, expect, it } from "vitest";

import {
  REQUEST_SCHEMA,
  RESULT_SCHEMA,
  runProbeCoreForTests,
  validateRegressionFixtureForTests,
} from "../../../ml/run-strength-first-downstream-wasm-probes";
import {
  childSfenAfterUsi,
  positionFromSfen,
  rulesCompleteLegalMoves,
  teToUsi,
} from "../../../ml/shogi-sfen";
import { GenerateMovesImproved } from "../../../src/components/game/ShogiImproved/GenerateMovesImproved";

type Authenticated = Parameters<typeof runProbeCoreForTests>[0];

const INITIAL_SFEN =
  "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1";
const ROOK_PAWN_LOOP_PREFIX = [
  "2g2f",
  "8c8d",
  "2f2e",
  "8d8e",
  "6i7h",
  "4a3b",
  "2e2d",
  "2c2d",
  "2h2d",
  "P*2c",
  "2d2h",
  "8e8f",
  "8g8f",
  "8b8f",
  "P*8g",
  "8f8d",
  "3i3h",
  "3c3d",
  "5i6h",
  "P*8f",
  "8g8f",
  "8d8f",
  "P*8g",
  "8f8d",
  "3h2g",
  "P*8f",
  "8g8f",
  "8d8f",
  "P*8g",
  "8f8e",
  "2g2f",
] as const;

function exactKnownFixture() {
  const parentSfen = ROOK_PAWN_LOOP_PREFIX.reduce(
    (sfen, move) => childSfenAfterUsi(sfen, move),
    INITIAL_SFEN,
  );
  const candidates = rulesCompleteLegalMoves(
    positionFromSfen(parentSfen).position,
  ).map(({ usi }) => ({
    move: usi,
    child_sfen: childSfenAfterUsi(parentSfen, usi),
  }));
  return {
    schema: "shogi-floodgate-strength-first-known-regression-fixture-v1",
    bad_move: "P*8f",
    stable_good_move: "3a4b",
    parent_sfen: parentSfen,
    parent_ply: ROOK_PAWN_LOOP_PREFIX.length,
    candidates,
  };
}

function authenticated(budgets: number[] = [800, 2_000, 4_000]): Authenticated {
  const identity = (path: string, character: string, schema: string) => ({
    path,
    bytes: 100,
    sha256: character.repeat(64),
    schema,
  });
  return {
    request: {
      schema: REQUEST_SCHEMA,
      candidate_weights: identity("candidate.bin", "1", "weights-v1"),
      known_regression_fixture: identity("fixture.json", "2", "fixture-v1"),
      production_wasm: identity("engine.wasm", "4", "wasm-v1"),
      search_time_budgets_ms: budgets,
    },
    fixture: {
      schema: "shogi-floodgate-strength-first-known-regression-fixture-v1",
      bad_move: "P*8f",
      stable_good_move: "3a4b",
      parent_sfen:
        "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1",
      parent_ply: 0,
      candidates: [
        { move: "3a4b", child_sfen: "good-child" },
        { move: "P*8f", child_sfen: "bad-child" },
      ],
    },
    weights: Buffer.alloc(1),
  } as Authenticated;
}

describe("strength-first downstream WASM probe schedule", () => {
  it("runs depths 11/12 and three searches at every registered budget", () => {
    const calls: { time: number; depth: number }[] = [];

    const result = runProbeCoreForTests(authenticated(), {
      search: (_fixture, maxTimeMs, maxDepth) => {
        calls.push({ time: maxTimeMs, depth: maxDepth });
        return {
          bestmove: "3a4b",
          legal: true,
        };
      },
      evaluateChildCp: (child) => (child === "good-child" ? 0 : 100),
    });

    expect(result.schema).toBe(RESULT_SCHEMA);
    expect(calls.slice(0, 2)).toEqual([
      { time: 0, depth: 11 },
      { time: 0, depth: 12 },
    ]);
    expect(calls.slice(2)).toEqual(
      [800, 2_000, 4_000].flatMap((time) =>
        [1, 2, 3].map(() => ({ time, depth: 32 })),
      ),
    );
    expect(result.fixed_depth_bestmoves).toEqual({
      "11": "3a4b",
      "12": "3a4b",
    });
    expect(result.static_ranks).toEqual({ "P*8f": 2, "3a4b": 1 });
    expect(result).not.toHaveProperty("production_parity");
    expect(JSON.stringify(result)).not.toMatch(/browser|worker/i);
  });

  it("gives tied static scores the same rank so a tie cannot pass", () => {
    const result = runProbeCoreForTests(authenticated([800]), {
      search: (_fixture, maxTimeMs) => ({
        bestmove: "3a4b",
        legal: true,
      }),
      evaluateChildCp: () => 5,
    });

    expect(result.static_ranks).toEqual({ "P*8f": 1, "3a4b": 1 });
    expect(
      (result.timed_bestmoves as { bestmove: string }[]).map(
        (entry) => entry.bestmove,
      ),
    ).toEqual(["3a4b", "3a4b", "3a4b"]);
  });

  it("rejects an illegal or malformed search result", () => {
    expect(() =>
      runProbeCoreForTests(authenticated([800]), {
        search: () => ({
          bestmove: "not-usi",
          legal: false,
        }),
        evaluateChildCp: (child) => (child === "good-child" ? 0 : 100),
      }),
    ).toThrow(/result is invalid/);
  });

  it("authenticates the exact rules-complete known-regression fixture", () => {
    const fixture = exactKnownFixture();
    const parent = positionFromSfen(fixture.parent_sfen).position;
    const searchOptimizedMoves = GenerateMovesImproved.generateLegalMoves(
      parent,
    )
      .map(teToUsi)
      .sort();
    const rulesCompleteMoves = rulesCompleteLegalMoves(parent).map(
      ({ usi }) => usi,
    );
    const validated = validateRegressionFixtureForTests(fixture);

    expect(searchOptimizedMoves).toHaveLength(46);
    expect(rulesCompleteMoves).toHaveLength(48);
    expect(
      rulesCompleteMoves.filter((move) => !searchOptimizedMoves.includes(move)),
    ).toEqual(["2b7g", "8e8g"]);
    expect(validated.candidates.map(({ move }) => move)).toEqual(
      rulesCompleteMoves,
    );
    expect(validated.candidates.map(({ move }) => move)).toContain("P*8f");
    expect(validated.candidates.map(({ move }) => move)).toContain("3a4b");
  });

  it.each([
    [
      "derived child",
      (fixture: ReturnType<typeof exactKnownFixture>) => {
        fixture.candidates[0] = {
          ...fixture.candidates[0],
          child_sfen: fixture.candidates[1].child_sfen,
        };
      },
    ],
    [
      "missing candidate",
      (fixture: ReturnType<typeof exactKnownFixture>) => {
        fixture.candidates.pop();
      },
    ],
    [
      "additional candidate",
      (fixture: ReturnType<typeof exactKnownFixture>) => {
        fixture.candidates.push(fixture.candidates[0]);
      },
    ],
    [
      "duplicate candidate",
      (fixture: ReturnType<typeof exactKnownFixture>) => {
        fixture.candidates[1] = fixture.candidates[0];
      },
    ],
    [
      "candidate order",
      (fixture: ReturnType<typeof exactKnownFixture>) => {
        fixture.candidates.reverse();
      },
    ],
    [
      "parent ply",
      (fixture: ReturnType<typeof exactKnownFixture>) => {
        fixture.parent_ply += 1;
      },
    ],
    [
      "illegal move",
      (fixture: ReturnType<typeof exactKnownFixture>) => {
        fixture.candidates[0] = {
          move: "1a1a",
          child_sfen: fixture.candidates[0].child_sfen,
        };
      },
    ],
  ])("rejects a fixture with a changed %s", (_label, mutate) => {
    const fixture = exactKnownFixture();
    mutate(fixture);

    expect(() => validateRegressionFixtureForTests(fixture)).toThrow();
  });
});
