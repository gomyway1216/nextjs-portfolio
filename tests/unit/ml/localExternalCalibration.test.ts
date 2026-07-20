import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import {
  LOCAL_EXTERNAL_CALIBRATION_ADJUDICATION,
  LOCAL_EXTERNAL_CALIBRATION_PLAYER_SCHEMA,
  LOCAL_EXTERNAL_CALIBRATION_REQUEST_SCHEMA,
  LOCAL_EXTERNAL_CALIBRATION_TIME_CONTROL,
  LocalExternalCalibrationError,
  PINNED_LOCAL_EXTERNAL_CALIBRATION_TIME_CONTROL,
  choosePinnedReferenceMoveCoreForTests,
  localExternalCalibrationOpeningId,
  runLocalExternalCalibrationCoreForTests,
  validatePinnedLocalExternalCalibrationRequestCoreForTests,
  type LocalExternalCalibrationCoreDependencies,
  type LocalExternalCalibrationMoveInput,
  type LocalExternalCalibrationPlayer,
  type LocalExternalCalibrationRequest,
  type LocalExternalCalibrationRole,
} from "../../../ml/local-external-calibration";
import { UsiTeacherEngine } from "../../../ml/usi-engine";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FAKE_USI_ENGINE = path.resolve(
  HERE,
  "../../fixtures/ml/fake-usi-engine.mjs",
);
const START_SFEN =
  "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1";
const KING_CYCLE_SFEN = "4k4/9/9/9/9/9/9/9/4K4 b - 1";
const temporaryRoots: string[] = [];

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function request(
  overrides: Partial<LocalExternalCalibrationRequest> = {},
): LocalExternalCalibrationRequest {
  return {
    schema: LOCAL_EXTERNAL_CALIBRATION_REQUEST_SCHEMA,
    run_id: `sha256:${"1".repeat(64)}`,
    openings: [
      {
        opening_id: localExternalCalibrationOpeningId(START_SFEN),
        sfen: START_SFEN,
      },
    ],
    time_control: {
      mode: LOCAL_EXTERNAL_CALIBRATION_TIME_CONTROL,
      stable_depth: 8,
      reference_depth: 8,
      stable_timeout_ms: 5_000,
      reference_timeout_ms: 5_000,
    },
    adjudication: LOCAL_EXTERNAL_CALIBRATION_ADJUDICATION,
    max_plies: 4,
    game_concurrency: 1,
    ...overrides,
  };
}

interface PlayerCounters {
  readonly inputs: LocalExternalCalibrationMoveInput[];
  aborts: number;
  closes: number;
}

function deterministicPlayer(
  role: LocalExternalCalibrationRole,
  counters: PlayerCounters,
  choose: (
    input: Readonly<LocalExternalCalibrationMoveInput>,
  ) => string | Promise<string> = (input) => input.legal_moves[0],
): LocalExternalCalibrationPlayer {
  return Object.freeze({
    binding: Object.freeze({
      schema: LOCAL_EXTERNAL_CALIBRATION_PLAYER_SCHEMA,
      role,
      player_id: `synthetic-${role}`,
      engine_contract: `synthetic-${role}-engine-v1`,
      runtime_receipt_sha256:
        role === "stable" ? "2".repeat(64) : "3".repeat(64),
      fixed_depth: 8,
      per_move_timeout_ms: 5_000,
      reset_before_every_move: true,
      book: false,
      network: false,
    }),
    chooseMove: async (input: Readonly<LocalExternalCalibrationMoveInput>) => {
      counters.inputs.push(input);
      const usi = await choose(input);
      return Object.freeze({
        usi,
        search_receipt_sha256: sha256(
          `${role}\0${input.game_id}\0${input.ply}\0${usi}`,
        ),
      });
    },
    abortAndReap: async () => {
      counters.aborts += 1;
    },
    close: async () => {
      counters.closes += 1;
    },
  });
}

function counters(): PlayerCounters {
  return { inputs: [], aborts: 0, closes: 0 };
}

function dependencies(
  stableCounters: PlayerCounters,
  referenceCounters: PlayerCounters,
  stableChoose?: (
    input: Readonly<LocalExternalCalibrationMoveInput>,
  ) => string | Promise<string>,
  referenceChoose?: (
    input: Readonly<LocalExternalCalibrationMoveInput>,
  ) => string | Promise<string>,
): LocalExternalCalibrationCoreDependencies {
  return Object.freeze({
    createStablePlayer: async () =>
      deterministicPlayer("stable", stableCounters, stableChoose),
    createReferencePlayer: async () =>
      deterministicPlayer("reference", referenceCounters, referenceChoose),
  });
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => fs.promises.rm(root, { recursive: true, force: true })),
  );
});

describe("local external calibration paired harness", () => {
  it("derives the same-opening color swap and deterministic complete receipt", async () => {
    const firstStable = counters();
    const firstReference = counters();
    const first = await runLocalExternalCalibrationCoreForTests(
      request({ game_concurrency: 2 }),
      dependencies(firstStable, firstReference),
    );
    const second = await runLocalExternalCalibrationCoreForTests(
      request({ game_concurrency: 2 }),
      dependencies(counters(), counters()),
    );

    expect(first).toEqual(second);
    expect(first.receipt_sha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(first.schedule).toEqual({
      pairs: 1,
      games: 2,
      games_per_pair: 2,
      same_opening_per_pair: true,
      stable_colors: ["sente", "gote"],
    });
    expect(first.games.map((game) => game.stable_color)).toEqual([
      "sente",
      "gote",
    ]);
    expect(new Set(first.games.map((game) => game.opening_id))).toEqual(
      new Set([localExternalCalibrationOpeningId(START_SFEN)]),
    );
    expect(first.games.every((game) => game.termination === "max-plies")).toBe(
      true,
    );
    expect(first.completeness).toEqual({
      games_required: 2,
      games_completed: 2,
      technical_faults: 0,
      partial_result_publishable: false,
      cleanup_completed: true,
    });
    expect(first.nonclaims).toEqual({
      human_rank: false,
      high_dan: false,
      formal_ab: false,
      holdout: false,
      promotion: false,
      live_weight_change: false,
    });
    expect(firstStable.aborts).toBe(0);
    expect(firstReference.aborts).toBe(0);
    expect(firstStable.closes).toBe(1);
    expect(firstReference.closes).toBe(1);
  });

  it("rejects malformed openings, aliases, types, and time-control drift before players start", async () => {
    const base = request();
    const invalidOpeningSfens = [
      "9/9/9/9/9/9/9/9/4K4 b R 1",
      "4k4/9/9/9/9/9/9/4K4/4K4 b - 1",
      "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b P 1",
      "9/9/9/9/4k4/4K4/9/9/9 b - 1",
      "4k4/9/4P4/4P4/9/9/9/9/4K4 b - 1",
      "k3P4/9/9/9/9/9/9/9/4K4 b - 1",
      "4k4/9/9/9/9/9/9/9/K3p4 w - 1",
      "k3N4/9/9/9/9/9/9/9/4K4 b - 1",
      "4k4/9/9/9/9/9/9/9/K3l4 w - 1",
    ] as const;
    const symbolRequest = { ...base } as LocalExternalCalibrationRequest & {
      [key: symbol]: unknown;
    };
    symbolRequest[Symbol("hidden")] = true;
    const accessorTimeControl = { ...base.time_control };
    Object.defineProperty(accessorTimeControl, "stable_depth", {
      enumerable: true,
      get: () => 8,
    });
    const extraOpeningArray = [...base.openings] as Array<
      (typeof base.openings)[number]
    > & { extra?: boolean };
    extraOpeningArray.extra = true;
    const probes: unknown[] = [
      { ...base, game_concurrency: true },
      {
        ...base,
        openings: [
          { ...base.openings[0], opening_id: `sha256:${"0".repeat(64)}` },
        ],
      },
      { ...base, openings: [...base.openings, base.openings[0]] },
      {
        ...base,
        openings: [{ ...base.openings[0], sfen: ` ${START_SFEN}` }],
      },
      ...invalidOpeningSfens.map((sfen) => ({
        ...base,
        openings: [{ opening_id: `sha256:${"0".repeat(64)}`, sfen }],
      })),
      {
        ...base,
        time_control: { ...base.time_control, stable_depth: 0 },
      },
      { ...base, time_control: accessorTimeControl },
      { ...base, openings: extraOpeningArray },
      symbolRequest,
      { ...base, unexpected: true },
    ];

    for (const probe of probes) {
      const stable = counters();
      const reference = counters();
      await expect(
        runLocalExternalCalibrationCoreForTests(
          probe as LocalExternalCalibrationRequest,
          dependencies(stable, reference),
        ),
      ).rejects.toMatchObject({
        phase: "capture",
        receipt_issued: false,
        partial_result_publishable: false,
      });
      expect(stable.closes).toBe(0);
      expect(reference.closes).toBe(0);
    }
    for (const sfen of invalidOpeningSfens) {
      expect(() => localExternalCalibrationOpeningId(sfen)).toThrow();
    }
  });

  it("discards completed games and issues no partial receipt after an illegal move", async () => {
    const stable = counters();
    const reference = counters();
    let caught: unknown;
    try {
      await runLocalExternalCalibrationCoreForTests(
        request({ max_plies: 1 }),
        dependencies(stable, reference, undefined, (input) =>
          input.stable_color === "gote" ? "9z9z" : input.legal_moves[0],
        ),
      );
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(LocalExternalCalibrationError);
    expect(caught).toMatchObject({
      phase: "game",
      receipt_issued: false,
      partial_result_publishable: false,
      completed_games_discarded: 1,
    });
    expect(stable.aborts).toBe(1);
    expect(reference.aborts).toBe(1);
    expect(stable.closes).toBe(1);
    expect(reference.closes).toBe(1);
  });

  it("times out, aborts both players, and returns no result vector", async () => {
    const stable = counters();
    const reference = counters();
    const short = request({
      time_control: {
        ...request().time_control,
        stable_timeout_ms: 10,
      },
    });
    const hangingStable = deterministicPlayer(
      "stable",
      stable,
      () => new Promise<string>(() => undefined),
    );
    const adjustedStable = Object.freeze({
      ...hangingStable,
      binding: Object.freeze({
        ...hangingStable.binding,
        per_move_timeout_ms: 10,
      }),
    });

    await expect(
      runLocalExternalCalibrationCoreForTests(
        short,
        Object.freeze({
          createStablePlayer: async () => adjustedStable,
          createReferencePlayer: async () =>
            deterministicPlayer("reference", reference),
        }),
      ),
    ).rejects.toMatchObject({
      phase: "timeout",
      receipt_issued: false,
      partial_result_publishable: false,
    });
    expect(stable.aborts).toBe(1);
    expect(reference.aborts).toBe(1);
    expect(stable.closes).toBe(1);
    expect(reference.closes).toBe(1);
  });

  it("adjudicates a legal fourfold position repetition as a draw", async () => {
    const cycle = ["5i6i", "5a6a", "6i5i", "6a5a"] as const;
    const cycleRequest = request({
      openings: [
        {
          opening_id: localExternalCalibrationOpeningId(KING_CYCLE_SFEN),
          sfen: KING_CYCLE_SFEN,
        },
      ],
      max_plies: 20,
    });
    const chooseCycle = (input: Readonly<LocalExternalCalibrationMoveInput>) =>
      cycle[input.ply % cycle.length];
    const receipt = await runLocalExternalCalibrationCoreForTests(
      cycleRequest,
      dependencies(counters(), counters(), chooseCycle, chooseCycle),
    );

    expect(receipt.games).toHaveLength(2);
    expect(
      receipt.games.every(
        (game) =>
          game.termination === "fourfold-repetition" &&
          game.result_for_stable === "draw" &&
          game.plies === 12,
      ),
    ).toBe(true);
  });

  it("makes the continuous checker lose on fourfold repetition", async () => {
    const opening = "4k4/4R4/9/9/9/9/9/9/K8 w - 1";
    const cycle = ["5a4a", "5b4b", "4a5a", "4b5b"] as const;
    const receipt = await runLocalExternalCalibrationCoreForTests(
      request({
        openings: [
          {
            opening_id: localExternalCalibrationOpeningId(opening),
            sfen: opening,
          },
        ],
        max_plies: 20,
      }),
      dependencies(
        counters(),
        counters(),
        (input) => cycle[input.ply % cycle.length],
        (input) => cycle[input.ply % cycle.length],
      ),
    );

    expect(
      receipt.games.map((game) => ({
        stable_color: game.stable_color,
        termination: game.termination,
        result_for_stable: game.result_for_stable,
        plies: game.plies,
      })),
    ).toEqual([
      {
        stable_color: "sente",
        termination: "perpetual-check",
        result_for_stable: "loss",
        plies: 12,
      },
      {
        stable_color: "gote",
        termination: "perpetual-check",
        result_for_stable: "win",
        plies: 12,
      },
    ]);
  });

  it("awards a win when a legal move leaves the opponent no legal reply", async () => {
    const opening = "4k4/3R5/5G3/9/9/9/9/9/4K4 b - 16";
    const receipt = await runLocalExternalCalibrationCoreForTests(
      request({
        openings: [
          {
            opening_id: localExternalCalibrationOpeningId(opening),
            sfen: opening,
          },
        ],
        max_plies: 4,
      }),
      dependencies(
        counters(),
        counters(),
        () => "6b5b+",
        () => "6b5b+",
      ),
    );

    expect(
      receipt.games.map((game) => ({
        stable_color: game.stable_color,
        termination: game.termination,
        result_for_stable: game.result_for_stable,
        plies: game.plies,
      })),
    ).toEqual([
      {
        stable_color: "sente",
        termination: "no-legal-moves",
        result_for_stable: "win",
        plies: 1,
      },
      {
        stable_color: "gote",
        termination: "no-legal-moves",
        result_for_stable: "loss",
        plies: 1,
      },
    ]);
  });

  it("rejects player authority expansion and closes both initialized players", async () => {
    const stableCounters = counters();
    const referenceCounters = counters();
    const stable = deterministicPlayer("stable", stableCounters);
    const reference = deterministicPlayer("reference", referenceCounters);
    const expanded = Object.freeze({
      ...reference,
      binding: Object.freeze({
        ...reference.binding,
        network: true,
      }),
    });

    await expect(
      runLocalExternalCalibrationCoreForTests(
        request(),
        Object.freeze({
          createStablePlayer: async () => stable,
          createReferencePlayer: async () => expanded,
        }),
      ),
    ).rejects.toMatchObject({
      phase: "initialization",
      receipt_issued: false,
    });
    expect(stableCounters.closes).toBe(1);
    expect(referenceCounters.closes).toBe(1);
  });

  it("rejects extra move-decision authority and returns no receipt", async () => {
    const stableCounters = counters();
    const referenceCounters = counters();
    const stable = deterministicPlayer("stable", stableCounters);
    const expandedStable = Object.freeze({
      ...stable,
      chooseMove: async (
        input: Readonly<LocalExternalCalibrationMoveInput>,
      ) => ({
        usi: input.legal_moves[0],
        search_receipt_sha256: "5".repeat(64),
        result_writer: true,
      }),
    });

    await expect(
      runLocalExternalCalibrationCoreForTests(
        request(),
        Object.freeze({
          createStablePlayer: async () => expandedStable,
          createReferencePlayer: async () =>
            deterministicPlayer("reference", referenceCounters),
        }),
      ),
    ).rejects.toMatchObject({
      phase: "game",
      receipt_issued: false,
      partial_result_publishable: false,
    });
    expect(stableCounters.aborts).toBe(1);
    expect(referenceCounters.aborts).toBe(1);
  });

  it("retains an operation failure together with secondary close failures", async () => {
    const stableCounters = counters();
    const referenceCounters = counters();
    const failingClose = (
      role: LocalExternalCalibrationRole,
      playerCounters: PlayerCounters,
      choose?: (
        input: Readonly<LocalExternalCalibrationMoveInput>,
      ) => string | Promise<string>,
    ): LocalExternalCalibrationPlayer => {
      const player = deterministicPlayer(role, playerCounters, choose);
      return Object.freeze({
        ...player,
        close: async () => {
          playerCounters.closes += 1;
          throw new Error(`${role} close failed`);
        },
      });
    };
    let caught: unknown;
    try {
      await runLocalExternalCalibrationCoreForTests(
        request(),
        Object.freeze({
          createStablePlayer: async () =>
            failingClose("stable", stableCounters, () => "9z9z"),
          createReferencePlayer: async () =>
            failingClose("reference", referenceCounters),
        }),
      );
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(LocalExternalCalibrationError);
    expect(caught).toMatchObject({
      phase: "game",
      receipt_issued: false,
      partial_result_publishable: false,
    });
    const combined = (caught as LocalExternalCalibrationError).primary;
    expect(combined).toBeInstanceOf(AggregateError);
    const failures = (combined as AggregateError).errors;
    expect(failures[0]).toBeInstanceOf(LocalExternalCalibrationError);
    expect(failures[1]).toBeInstanceOf(AggregateError);
    expect((failures[1] as AggregateError).errors).toHaveLength(2);
    expect(stableCounters.closes).toBe(1);
    expect(referenceCounters.closes).toBe(1);
  });

  it("retains initialization and cleanup failures without starting games", async () => {
    const stableCounters = counters();
    const stable = deterministicPlayer("stable", stableCounters);
    const stableWithFailingClose = Object.freeze({
      ...stable,
      close: async () => {
        stableCounters.closes += 1;
        throw new Error("stable initialization cleanup failed");
      },
    });
    let caught: unknown;
    try {
      await runLocalExternalCalibrationCoreForTests(
        request(),
        Object.freeze({
          createStablePlayer: async () => stableWithFailingClose,
          createReferencePlayer: async () => {
            throw new Error("reference initialization failed");
          },
        }),
      );
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(LocalExternalCalibrationError);
    expect(caught).toMatchObject({
      phase: "initialization",
      receipt_issued: false,
      completed_games_discarded: 0,
    });
    const combined = (caught as LocalExternalCalibrationError).primary;
    expect(combined).toBeInstanceOf(AggregateError);
    expect((combined as AggregateError).errors).toHaveLength(2);
    expect(stableCounters.inputs).toHaveLength(0);
    expect(stableCounters.closes).toBe(1);
  });

  it("runs a small subprocess fake-USI E2E with reset before every search", async () => {
    const root = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "local-external-calibration-"),
    );
    temporaryRoots.push(root);
    const trace = path.join(root, "usi-trace.jsonl");
    const stable = counters();
    let engine: UsiTeacherEngine | undefined;
    const receipt = await runLocalExternalCalibrationCoreForTests(
      request({ max_plies: 4 }),
      Object.freeze({
        createStablePlayer: async () => deterministicPlayer("stable", stable),
        createReferencePlayer: async () => {
          engine = new UsiTeacherEngine({
            engineBin: process.execPath,
            engineArgs: [FAKE_USI_ENGINE, "--trace", trace],
            timeoutMs: 5_000,
          });
          await engine.init();
          return Object.freeze({
            binding: Object.freeze({
              schema: LOCAL_EXTERNAL_CALIBRATION_PLAYER_SCHEMA,
              role: "reference" as const,
              player_id: "fake-usi-subprocess",
              engine_contract: "usi-teacher-engine-fake-e2e-v1",
              runtime_receipt_sha256: "4".repeat(64),
              fixed_depth: 8,
              per_move_timeout_ms: 5_000,
              reset_before_every_move: true as const,
              book: false as const,
              network: false as const,
            }),
            chooseMove: async (
              input: Readonly<LocalExternalCalibrationMoveInput>,
            ) => {
              if (engine === undefined) throw new Error("engine missing");
              await engine.resetForParent();
              const result = await engine.search(
                input.sfen,
                1,
                { depth: 8 },
                input.legal_moves,
              );
              return Object.freeze({
                usi: result.bestmove,
                search_receipt_sha256: sha256(JSON.stringify(result)),
              });
            },
            abortAndReap: async () => engine?.quit(),
            close: async () => engine?.quit(),
          });
        },
      }),
    );

    expect(receipt.games).toHaveLength(2);
    expect(receipt.completeness.games_completed).toBe(2);
    const events = (await fs.promises.readFile(trace, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    const searches = events.filter((event) => event.event === "search");
    const ready = events.filter((event) => event.event === "ready");
    expect(searches).toHaveLength(4);
    expect(ready).toHaveLength(5);
    expect(searches.every((event) => event.depth === 8)).toBe(true);
    expect(
      searches.every(
        (event) =>
          Array.isArray(event.searchmoves) && event.searchmoves.length > 0,
      ),
    ).toBe(true);
  });

  it("uses a fixed-depth forced rescore when the reference has one legal move", async () => {
    let proposalCalls = 0;
    let rescoreCalls = 0;
    const input = Object.freeze({
      game_id: `sha256:${"6".repeat(64)}`,
      opening_id: localExternalCalibrationOpeningId(START_SFEN),
      stable_color: "sente" as const,
      ply: 20,
      sfen: START_SFEN,
      legal_moves: Object.freeze(["7g7f"]),
    });

    const decision = await choosePinnedReferenceMoveCoreForTests(
      input,
      Object.freeze({
        propose: async () => {
          proposalCalls += 1;
          throw new Error("proposal must not run for a forced move");
        },
        rescore: async (sfen: string, move: string) => {
          rescoreCalls += 1;
          expect(sfen).toBe(START_SFEN);
          expect(move).toBe("7g7f");
          return Object.freeze({
            bestmove: move,
            requested_multipv: 1,
            searchmoves: Object.freeze([move]),
            depth: 16,
          });
        },
      }),
    );

    expect(proposalCalls).toBe(0);
    expect(rescoreCalls).toBe(1);
    expect(decision.usi).toBe("7g7f");
    expect(decision.search_receipt_sha256).toMatch(/^[0-9a-f]{64}$/u);
  });

  it("preflights the explicit pinned depth/timeout contract without a runtime", () => {
    expect(PINNED_LOCAL_EXTERNAL_CALIBRATION_TIME_CONTROL).toEqual({
      mode: "fixed-depth-no-game-clock-v1",
      stable_depth: 11,
      reference_depth: 16,
      stable_timeout_ms: 600_000,
      reference_timeout_ms: 600_000,
    });
    const pinned = request({
      time_control: PINNED_LOCAL_EXTERNAL_CALIBRATION_TIME_CONTROL,
    });
    expect(() =>
      validatePinnedLocalExternalCalibrationRequestCoreForTests(pinned),
    ).not.toThrow();
    expect(() =>
      validatePinnedLocalExternalCalibrationRequestCoreForTests({
        ...pinned,
        time_control: {
          ...pinned.time_control,
          reference_depth: 15,
        },
      }),
    ).toThrow(/differs from the exact production contract/);
  });
});
