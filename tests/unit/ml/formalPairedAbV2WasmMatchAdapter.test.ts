import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import { createRequire } from "node:module";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  FORMAL_PAIRED_AB_V2_GAME_COUNT,
  FORMAL_PAIRED_AB_V2_NNUE_BYTES,
  FORMAL_PAIRED_AB_V2_PAIR_COUNT,
  FORMAL_PAIRED_AB_V2_SEARCH_DEPTH,
  FORMAL_PAIRED_AB_V2_QUIESCENCE_DEPTH,
  FORMAL_PAIRED_AB_V2_WASM_PAIR_REQUEST_SCHEMA,
  FORMAL_PAIRED_AB_V2_WASM_PLAYER_SCHEMA,
  FormalPairedAbV2WasmMatchError,
  authenticateFormalPairedAbV2WasmPair,
  runAuthenticatedFormalPairedAbV2WasmPair,
  runFormalPairedAbV2WasmPairCoreForTests,
  validateFormalPairedAbV2ExactAccounting,
  type FormalPairedAbV2ArtifactIdentity,
  type FormalPairedAbV2CoreDependencies,
  type FormalPairedAbV2MoveInput,
  type FormalPairedAbV2PairRequest,
  type FormalPairedAbV2Player,
  type FormalPairedAbV2Role,
} from "../../../ml/formal-paired-ab-v2-wasm-match-adapter";
import { childSfenAfterUsi } from "../../../ml/shogi-sfen";

const MATE_IN_ONE_SFEN = "4k4/3R5/5G3/9/9/9/9/9/4K4 b - 16";
const KING_CYCLE_SFEN = "4k4/9/9/9/9/9/9/9/4K4 b - 1";
const START_SFEN =
  "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1";
const temporaryRoots: string[] = [];

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

function semanticId(domain: string, value: unknown): string {
  return `sha256:${sha256(`${domain}\0${canonicalJson(value)}`)}`;
}

const CANDIDATE: FormalPairedAbV2ArtifactIdentity = Object.freeze({
  path: "artifacts/candidate.bin",
  bytes: FORMAL_PAIRED_AB_V2_NNUE_BYTES,
  sha256: "1".repeat(64),
});
const STABLE: FormalPairedAbV2ArtifactIdentity = Object.freeze({
  path: "artifacts/stable.bin",
  bytes: FORMAL_PAIRED_AB_V2_NNUE_BYTES,
  sha256: "2".repeat(64),
});

function request(
  sfen = MATE_IN_ONE_SFEN,
  usiMoves: readonly string[] = [],
  overrides: Partial<FormalPairedAbV2PairRequest> = {},
): FormalPairedAbV2PairRequest {
  const opening = Object.freeze({
    sfen,
    usi_moves: Object.freeze([...usiMoves]),
  });
  const openingId = semanticId("shogi-formal-ab-v2-opening-v1", opening);
  const pairIndex = overrides.pair_index ?? 0;
  return {
    schema: FORMAL_PAIRED_AB_V2_WASM_PAIR_REQUEST_SCHEMA,
    pair_index: pairIndex,
    opening_id: openingId,
    opening,
    seed: 99_001,
    games: [
      {
        game_index: 0,
        game_id: semanticId("shogi-formal-ab-v2-game-v1", {
          candidate_color: "sente",
          game_index: 0,
          opening_id: openingId,
          pair_index: pairIndex,
        }),
        candidate_color: "sente",
      },
      {
        game_index: 1,
        game_id: semanticId("shogi-formal-ab-v2-game-v1", {
          candidate_color: "gote",
          game_index: 1,
          opening_id: openingId,
          pair_index: pairIndex,
        }),
        candidate_color: "gote",
      },
    ],
    candidate_weights: CANDIDATE,
    stable_weights: STABLE,
    match_binding_sha256: "3".repeat(64),
    ...overrides,
  };
}

interface Counters {
  readonly inputs: FormalPairedAbV2MoveInput[];
  aborts: number;
  closes: number;
}

function counters(): Counters {
  return { inputs: [], aborts: 0, closes: 0 };
}

function fakePlayer(
  role: FormalPairedAbV2Role,
  identity: Readonly<FormalPairedAbV2ArtifactIdentity>,
  state: Counters,
  choose: (
    input: Readonly<FormalPairedAbV2MoveInput>,
  ) => string | Promise<string> = (input) => input.legal_moves[0],
): FormalPairedAbV2Player {
  return Object.freeze({
    binding: Object.freeze({
      schema: FORMAL_PAIRED_AB_V2_WASM_PLAYER_SCHEMA,
      role,
      weights_sha256: identity.sha256,
      isolated_process: true,
      fixed_depth: FORMAL_PAIRED_AB_V2_SEARCH_DEPTH,
      quiescence_depth: FORMAL_PAIRED_AB_V2_QUIESCENCE_DEPTH,
      reset_before_every_move: true,
      book: false,
      network: false,
    }),
    chooseMove: async (input) => {
      state.inputs.push(input);
      const usi = await choose(input);
      return Object.freeze({
        usi,
        search_receipt_sha256: sha256(
          `${role}\0${input.game_id}\0${input.ply}\0${usi}`,
        ),
      });
    },
    abortAndReap: async () => {
      state.aborts += 1;
    },
    close: async () => {
      state.closes += 1;
    },
  });
}

function dependencies(
  candidateState: Counters,
  stableState: Counters,
  candidateChoose?: (
    input: Readonly<FormalPairedAbV2MoveInput>,
  ) => string | Promise<string>,
  stableChoose?: (
    input: Readonly<FormalPairedAbV2MoveInput>,
  ) => string | Promise<string>,
  overrides: Partial<FormalPairedAbV2CoreDependencies> = {},
): FormalPairedAbV2CoreDependencies {
  return Object.freeze({
    createPlayer: async (role, identity) =>
      fakePlayer(
        role,
        identity,
        role === "candidate" ? candidateState : stableState,
        role === "candidate"
          ? (candidateChoose ?? ((input) => input.legal_moves[0]))
          : (stableChoose ?? ((input) => input.legal_moves[0])),
      ),
    ...overrides,
  });
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => fs.promises.rm(root, { recursive: true, force: true })),
  );
});

describe("formal paired A/B v2 executable WASM match adapter", () => {
  it("loads distinct candidate/stable identities and swaps candidate color on one opening", async () => {
    const candidateState = counters();
    const stableState = counters();
    const loaded: Array<readonly [FormalPairedAbV2Role, string]> = [];
    const receipt = await runFormalPairedAbV2WasmPairCoreForTests(request(), {
      ...dependencies(
        candidateState,
        stableState,
        () => "6b5b+",
        () => "6b5b+",
      ),
      createPlayer: async (role, identity) => {
        loaded.push([role, identity.sha256]);
        return fakePlayer(
          role,
          identity,
          role === "candidate" ? candidateState : stableState,
          () => "6b5b+",
        );
      },
    });

    expect(loaded).toEqual([
      ["candidate", CANDIDATE.sha256],
      ["stable", STABLE.sha256],
    ]);
    expect(receipt.schedule).toEqual({
      pairs: 1,
      games: 2,
      games_per_pair: 2,
      candidate_colors: ["sente", "gote"],
    });
    expect(
      receipt.games.map((game) => ({
        color: game.candidate_color,
        result: game.result,
        termination: game.termination,
      })),
    ).toEqual([
      { color: "sente", result: "win", termination: "no-legal-moves" },
      { color: "gote", result: "loss", termination: "no-legal-moves" },
    ]);
    expect(receipt.summary).toEqual({
      candidate_wins: 1,
      draws: 0,
      candidate_losses: 1,
      games: 2,
    });
    expect(
      receipt.games.every(
        (game) =>
          game.transcript_sha256.length === 64 &&
          game.launcher_receipt.result === game.result &&
          game.launcher_receipt.technical_fault === false,
      ),
    ).toBe(true);
    expect(receipt.cleanup).toMatchObject({
      candidate_closed_and_reaped: true,
      stable_closed_and_reaped: true,
      assets_revalidated_after_games: true,
    });
    expect(receipt.cleanup.cleanup_receipt_sha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(receipt.receipt_sha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(candidateState.closes).toBe(1);
    expect(stableState.closes).toBe(1);
    expect(candidateState.aborts).toBe(0);
    expect(stableState.aborts).toBe(0);
  });

  it("adjudicates fourfold repetition from the browser rules engine", async () => {
    const cycle = ["5i6i", "5a6a", "6i5i", "6a5a"] as const;
    const choose = (input: Readonly<FormalPairedAbV2MoveInput>) =>
      cycle[input.ply % cycle.length];
    const receipt = await runFormalPairedAbV2WasmPairCoreForTests(
      request(KING_CYCLE_SFEN),
      dependencies(counters(), counters(), choose, choose),
    );

    expect(
      receipt.games.every(
        (game) =>
          game.termination === "fourfold-repetition" &&
          game.result === "draw" &&
          game.plies === 12,
      ),
    ).toBe(true);
    expect(receipt.summary).toEqual({
      candidate_wins: 0,
      draws: 2,
      candidate_losses: 0,
      games: 2,
    });
  });

  it("aborts and reaps both isolated players after a crash without a partial receipt", async () => {
    const candidateState = counters();
    const stableState = counters();
    await expect(
      runFormalPairedAbV2WasmPairCoreForTests(
        request(START_SFEN),
        dependencies(candidateState, stableState, () => {
          throw new Error("candidate child crashed");
        }),
      ),
    ).rejects.toMatchObject({
      phase: "game",
      receipt_issued: false,
      partial_result_publishable: false,
    });
    expect(candidateState.aborts).toBe(1);
    expect(stableState.aborts).toBe(1);
    expect(candidateState.closes).toBe(0);
    expect(stableState.closes).toBe(0);
  });

  it("withholds the pair receipt when post-game artifact revalidation detects drift", async () => {
    const candidateState = counters();
    const stableState = counters();
    let revalidated = 0;
    await expect(
      runFormalPairedAbV2WasmPairCoreForTests(
        request(),
        dependencies(
          candidateState,
          stableState,
          () => "6b5b+",
          () => "6b5b+",
          {
            revalidateAssets: () => {
              revalidated += 1;
              throw new Error("candidate weights drifted");
            },
          },
        ),
      ),
    ).rejects.toMatchObject({
      phase: "postvalidation",
      receipt_issued: false,
      partial_result_publishable: false,
    });
    expect(revalidated).toBe(1);
    expect(candidateState.closes).toBe(1);
    expect(stableState.closes).toBe(1);
  });

  it("rejects same-weight loads and forged execution capabilities before games", async () => {
    const same = request(MATE_IN_ONE_SFEN, [], {
      stable_weights: { ...CANDIDATE },
    });
    await expect(
      runFormalPairedAbV2WasmPairCoreForTests(
        same,
        dependencies(counters(), counters()),
      ),
    ).rejects.toMatchObject({ phase: "capture" });
    await expect(
      runAuthenticatedFormalPairedAbV2WasmPair({
        kind: "authenticated-formal-paired-ab-v2-pair-capability",
      }),
    ).rejects.toMatchObject({ phase: "authentication" });
  });

  it("independently detects enrolled-file drift in the real child load path", async () => {
    const root = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "formal-ab-wasm-drift-"),
    );
    temporaryRoots.push(root);
    await fs.promises.mkdir(path.join(root, "artifacts"));
    const candidateBytes = Buffer.alloc(FORMAL_PAIRED_AB_V2_NNUE_BYTES, 0x11);
    const stableBytes = Buffer.alloc(FORMAL_PAIRED_AB_V2_NNUE_BYTES, 0x22);
    const candidatePath = path.join(root, "artifacts", "candidate.bin");
    const stablePath = path.join(root, "artifacts", "stable.bin");
    await Promise.all([
      fs.promises.writeFile(candidatePath, candidateBytes, { mode: 0o600 }),
      fs.promises.writeFile(stablePath, stableBytes, { mode: 0o600 }),
    ]);
    const enrolled = request(MATE_IN_ONE_SFEN, [], {
      candidate_weights: {
        path: "artifacts/candidate.bin",
        bytes: candidateBytes.byteLength,
        sha256: sha256(candidateBytes),
      },
      stable_weights: {
        path: "artifacts/stable.bin",
        bytes: stableBytes.byteLength,
        sha256: sha256(stableBytes),
      },
    });
    const authority = authenticateFormalPairedAbV2WasmPair(root, enrolled);
    candidateBytes[0] ^= 0xff;
    await fs.promises.writeFile(candidatePath, candidateBytes, { mode: 0o600 });

    await expect(
      runAuthenticatedFormalPairedAbV2WasmPair(authority),
    ).rejects.toMatchObject({
      receipt_issued: false,
      partial_result_publishable: false,
    });
  }, 30_000);

  it("really loads two distinct int16 files into isolated WASM players and reaps both", async () => {
    const root = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "formal-ab-wasm-load-"),
    );
    temporaryRoots.push(root);
    await fs.promises.mkdir(path.join(root, "artifacts"));
    const candidateBytes = Buffer.alloc(FORMAL_PAIRED_AB_V2_NNUE_BYTES, 0x31);
    const stableBytes = Buffer.alloc(FORMAL_PAIRED_AB_V2_NNUE_BYTES, 0x42);
    const candidatePath = path.join(root, "artifacts", "candidate.bin");
    const stablePath = path.join(root, "artifacts", "stable.bin");
    await Promise.all([
      fs.promises.writeFile(candidatePath, candidateBytes, { mode: 0o600 }),
      fs.promises.writeFile(stablePath, stableBytes, { mode: 0o600 }),
    ]);
    // The forced mate makes the two real depth-11 search calls quick while
    // still proving the loaded child engines can choose and adjudicate moves.
    const enrolled = request(MATE_IN_ONE_SFEN, [], {
      candidate_weights: {
        path: "artifacts/candidate.bin",
        bytes: candidateBytes.byteLength,
        sha256: sha256(candidateBytes),
      },
      stable_weights: {
        path: "artifacts/stable.bin",
        bytes: stableBytes.byteLength,
        sha256: sha256(stableBytes),
      },
    });
    const authority = authenticateFormalPairedAbV2WasmPair(root, enrolled);
    const receipt = await runAuthenticatedFormalPairedAbV2WasmPair(authority);

    expect(receipt.execution_boundary).toBe(
      "authenticated-content-addressed-local-assets",
    );
    expect(receipt.candidate_weights_sha256).toBe(sha256(candidateBytes));
    expect(receipt.stable_weights_sha256).toBe(sha256(stableBytes));
    expect(receipt.candidate_weights_sha256).not.toBe(
      receipt.stable_weights_sha256,
    );
    expect(receipt.games).toHaveLength(2);
    expect(receipt.games.every((game) => game.plies === 1)).toBe(true);
    expect(receipt.games.map((game) => game.result)).toEqual(["win", "loss"]);
    expect(receipt.cleanup).toMatchObject({
      candidate_closed_and_reaped: true,
      stable_closed_and_reaped: true,
      assets_revalidated_after_games: true,
    });
    await expect(
      runAuthenticatedFormalPairedAbV2WasmPair(authority),
    ).rejects.toMatchObject({ phase: "authentication" });
  }, 30_000);

  it("executes the no-argument canonical-stdin pair entry used by the Python journal", async () => {
    const root = await fs.promises.mkdtemp(
      path.join(process.cwd(), ".formal-ab-cli-test-"),
    );
    temporaryRoots.push(root);
    const candidateBytes = Buffer.alloc(FORMAL_PAIRED_AB_V2_NNUE_BYTES, 0x51);
    const stableBytes = Buffer.alloc(FORMAL_PAIRED_AB_V2_NNUE_BYTES, 0x62);
    const candidatePath = path.join(root, "candidate.bin");
    const stablePath = path.join(root, "stable.bin");
    await Promise.all([
      fs.promises.writeFile(candidatePath, candidateBytes, { mode: 0o600 }),
      fs.promises.writeFile(stablePath, stableBytes, { mode: 0o600 }),
    ]);
    const relativeRoot = path
      .relative(process.cwd(), root)
      .split(path.sep)
      .join("/");
    const terminalSfen = childSfenAfterUsi(MATE_IN_ONE_SFEN, "6b5b+");
    const enrolled = request(terminalSfen, [], {
      candidate_weights: {
        path: `${relativeRoot}/candidate.bin`,
        bytes: candidateBytes.byteLength,
        sha256: sha256(candidateBytes),
      },
      stable_weights: {
        path: `${relativeRoot}/stable.bin`,
        bytes: stableBytes.byteLength,
        sha256: sha256(stableBytes),
      },
    });
    const cli = path.resolve(
      process.cwd(),
      "ml/run-formal-paired-ab-v2-wasm-pair.ts",
    );
    const tsx = createRequire(import.meta.url).resolve("tsx/cjs");
    const completed = spawnSync(process.execPath, ["-r", tsx, cli], {
      cwd: process.cwd(),
      encoding: "utf8",
      input: `${canonicalJson(enrolled)}\n`,
      maxBuffer: 4 * 1024 * 1024,
    });

    expect(completed.status, completed.stderr).toBe(0);
    expect(completed.stderr).toBe("");
    expect(completed.stdout.endsWith("\n")).toBe(true);
    const receipt = JSON.parse(completed.stdout);
    expect(receipt.schema).toBe(
      "shogi-formal-paired-ab-v2-wasm-pair-receipt-v1",
    );
    expect(receipt.execution_boundary).toBe(
      "authenticated-content-addressed-local-assets",
    );
    expect(receipt.games).toHaveLength(2);
    expect(receipt.cleanup).toMatchObject({
      candidate_closed_and_reaped: true,
      stable_closed_and_reaped: true,
      assets_revalidated_after_games: true,
    });
  }, 30_000);

  it("enforces exact 384-pair/768-game accounting and at most two pair workers", () => {
    expect(() =>
      validateFormalPairedAbV2ExactAccounting(
        FORMAL_PAIRED_AB_V2_PAIR_COUNT,
        FORMAL_PAIRED_AB_V2_GAME_COUNT,
        2,
      ),
    ).not.toThrow();
    for (const probe of [
      [383, 766, 2],
      [384, 767, 2],
      [384, 768, 3],
      [384, 768, 0],
    ] as const) {
      expect(() => validateFormalPairedAbV2ExactAccounting(...probe)).toThrow(
        FormalPairedAbV2WasmMatchError,
      );
    }
  });
});
