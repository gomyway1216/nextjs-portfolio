import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  NNUE_SELFPLAY_ACCEPTANCE_SCHEMA,
  NNUE_SELFPLAY_DATASET_MANIFEST_SCHEMA,
  NNUE_SELFPLAY_POSITION_SCHEMA,
  NNUE_SELFPLAY_SHARD_MANIFEST_SCHEMA,
  assignSelfplayGameSplit,
  canonicalJson,
  prepareNnueSelfplayDataset,
  prepareNnueSelfplayDatasetCoreForTests,
  runCli,
  validateNnueSelfplayPosition,
  validatePublishedNnueSelfplayPosition,
  type NnueSelfplayPosition,
} from "../../../ml/prepare-nnue-selfplay-dataset";
import { compareBytewise, positionKeyFromSfen } from "../../../ml/sibling-data";
import {
  childSfenAfterUsi,
  positionFromSfen,
  rulesCompleteLegalMoves,
} from "../../../ml/shogi-sfen";

const START = "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1";
const ACTOR = "a".repeat(64);
const SEED = "nnue-selfplay-test-seed";
const VAL_RATIO = 0.25;
const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function digest(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function root(): string {
  const value = fs.mkdtempSync(
    path.join(os.tmpdir(), "nnue-selfplay-dataset-"),
  );
  temporaryRoots.push(value);
  return value;
}

function write(file: string, payload: string | Buffer): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, payload);
}

function uniqueSfens(count: number): string[] {
  const queue = [START];
  const enqueued = new Set([positionKeyFromSfen(START)]);
  const answer: string[] = [];
  while (queue.length > 0 && answer.length < count) {
    const sfen = queue.shift() as string;
    answer.push(sfen);
    const legal = rulesCompleteLegalMoves(positionFromSfen(sfen).position)
      .map((entry) => entry.usi)
      .sort(compareBytewise);
    for (const move of legal.slice(0, 6)) {
      const child = childSfenAfterUsi(sfen, move);
      const id = positionKeyFromSfen(child);
      if (!enqueued.has(id)) {
        enqueued.add(id);
        queue.push(child);
      }
    }
  }
  if (answer.length !== count)
    throw new Error(`only generated ${answer.length}/${count} SFENs`);
  return answer;
}

function gameFor(role: "train" | "val", suffix: string): string {
  for (let index = 0; index < 100_000; index += 1) {
    const gameId = `${suffix}-${index}`;
    if (assignSelfplayGameSplit(gameId, SEED, VAL_RATIO) === role)
      return gameId;
  }
  throw new Error(`could not generate ${role} game`);
}

function row(
  sfen: string,
  gameId: string,
  overrides: Partial<NnueSelfplayPosition> = {},
): NnueSelfplayPosition {
  const parsed = positionFromSfen(sfen);
  const move = rulesCompleteLegalMoves(parsed.position)
    .map((entry) => entry.usi)
    .sort(compareBytewise)[0];
  return {
    schema: NNUE_SELFPLAY_POSITION_SCHEMA,
    game_id: gameId,
    source_game_id: gameId,
    position_id: positionKeyFromSfen(sfen),
    sfen,
    cp: parsed.moveNumber * 3 - 50,
    outcome: 0.5,
    ply: parsed.moveNumber - 1,
    move,
    actor_weights_sha256: ACTOR,
    opening_id: `opening-${gameId}`,
    search: { play_depth: 2, label_depth: 6, depth: 6, nodes: 100, leaves: 55 },
    result: { winner: null, reason: "repetition" },
    ...overrides,
  };
}

function canonicalJsonl(rows: readonly unknown[]): string {
  return `${rows.map(canonicalJson).join("\n")}\n`;
}

function terminalReasons(
  overrides: Partial<
    Record<"checkmate" | "no-legal-move" | "repetition" | "max-plies", number>
  > = {},
): Record<string, number> {
  return {
    checkmate: 0,
    "no-legal-move": 0,
    repetition: 0,
    "max-plies": 0,
    ...overrides,
  };
}

function shard(
  base: string,
  index: number,
  total: number,
  cycle: number,
  rows: readonly NnueSelfplayPosition[],
  options: {
    positionsText?: string;
    outputOverrides?: Record<string, unknown>;
    manifestOverrides?: Record<string, unknown>;
  } = {},
): string {
  const directory = path.join(base, `shard-${index}`);
  fs.mkdirSync(directory, { recursive: true });
  const positionsText = options.positionsText ?? canonicalJsonl(rows);
  write(path.join(directory, "positions.jsonl"), positionsText);
  const bytes = Buffer.from(positionsText);
  const output = {
    file: "positions.jsonl",
    bytes: bytes.byteLength,
    sha256: digest(bytes),
    records: rows.length,
    games: new Set(rows.map((value) => value.game_id)).size,
    unique_positions: new Set(rows.map((value) => value.position_id)).size,
    ...options.outputOverrides,
  };
  const games = new Map<string, string>();
  for (const value of rows) games.set(value.game_id, value.result.reason);
  const reasonCounts = terminalReasons();
  for (const reason of games.values()) {
    reasonCounts[reason] = (reasonCounts[reason] ?? 0) + 1;
  }
  write(
    path.join(directory, "manifest.json"),
    `${canonicalJson({
      schema: NNUE_SELFPLAY_SHARD_MANIFEST_SCHEMA,
      complete: true,
      training_eligible: true,
      run_fingerprint: "f".repeat(64),
      generation: {
        requested_games: games.size,
        completed_games: games.size,
        sampled_games: games.size,
        zero_sample_games: 0,
        terminal_reasons: reasonCounts,
      },
      cycle,
      shard_index: index,
      shard_total: total,
      output,
      ...options.manifestOverrides,
    })}\n`,
  );
  return directory;
}

function publishedRows(
  file: string,
): Array<NnueSelfplayPosition & { split: "train" | "val" }> {
  return fs
    .readFileSync(file, "utf8")
    .trimEnd()
    .split("\n")
    .map((line) => JSON.parse(line));
}

function makeCycle0Fixture(
  base: string,
  suffix = "base",
): {
  shardDir: string;
  rows: NnueSelfplayPosition[];
  trainGame: string;
  valGame: string;
} {
  const sfens = uniqueSfens(8);
  const trainGame = gameFor("train", `${suffix}-train`);
  const valGame = gameFor("val", `${suffix}-val`);
  const rows = [
    row(sfens[0], trainGame),
    row(sfens[1], gameFor("train", `${suffix}-train-one`)),
    row(sfens[2], gameFor("train", `${suffix}-train-two`)),
    row(sfens[3], gameFor("train", `${suffix}-train-three`)),
    row(sfens[4], valGame),
    row(sfens[5], gameFor("val", `${suffix}-val-one`)),
  ];
  return { shardDir: shard(base, 0, 1, 0, rows), rows, trainGame, valGame };
}

function sfensBySide(
  countPerSide: number,
): Record<"b" | "w", readonly string[]> {
  const sfens = uniqueSfens(countPerSide * 8);
  const bySide: Record<"b" | "w", string[]> = { b: [], w: [] };
  for (const sfen of sfens) {
    const side = sfen.split(/\s+/)[1];
    if (side === "b" || side === "w") bySide[side].push(sfen);
  }
  if (bySide.b.length < countPerSide || bySide.w.length < countPerSide) {
    throw new Error(`could not generate ${countPerSide} SFENs for each side`);
  }
  return {
    b: bySide.b.slice(0, countPerSide),
    w: bySide.w.slice(0, countPerSide),
  };
}

function sideCounts(
  rows: readonly NnueSelfplayPosition[],
): Record<"b" | "w", number> {
  const counts = { b: 0, w: 0 };
  for (const value of rows) {
    const side = value.sfen.split(/\s+/)[1];
    if (side !== "b" && side !== "w")
      throw new Error(`unexpected side-to-move ${side}`);
    counts[side] += 1;
  }
  return counts;
}

describe("NNUE self-play dataset preparation", () => {
  it("strictly validates generator rows and separately requires split on published rows", () => {
    const value = row(START, "game-one");
    expect(validateNnueSelfplayPosition(value)).toEqual(value);
    expect(() =>
      validateNnueSelfplayPosition({ ...value, split: "train" }),
    ).toThrow(/keys/);
    expect(
      validatePublishedNnueSelfplayPosition(
        { ...value, split: "train" },
        "train",
      ),
    ).toEqual({
      ...value,
      split: "train",
    });
    expect(() => validatePublishedNnueSelfplayPosition(value, "train")).toThrow(
      /keys/,
    );
    expect(() =>
      validatePublishedNnueSelfplayPosition(
        { ...value, split: "val" },
        "train",
      ),
    ).toThrow(/split must be train/);
  });

  it("rejects a recomputed position mismatch, illegal move, bad search, and outcome contradiction", () => {
    const value = row(START, "game-two");
    expect(() =>
      validateNnueSelfplayPosition({
        ...value,
        position_id: `sha256:${"0".repeat(64)}`,
      }),
    ).toThrow(/position_id does not match/);
    expect(() =>
      validateNnueSelfplayPosition({ ...value, move: "9z9z" }),
    ).toThrow(/not legal/);
    expect(() =>
      validateNnueSelfplayPosition({
        ...value,
        search: { ...value.search, label_depth: value.search.play_depth },
      }),
    ).toThrow(/must exceed/);
    expect(() =>
      validateNnueSelfplayPosition({
        ...value,
        outcome: 0,
        result: { winner: "b", reason: "checkmate" },
      }),
    ).toThrow(/outcome contradicts/);
  });

  it("publishes canonical split rows and a manifest-last cycle-zero holdout", async () => {
    const base = root();
    const fixture = makeCycle0Fixture(base);
    const outDir = path.join(base, "dataset");
    const manifest = await prepareNnueSelfplayDataset({
      currentShardDirs: [fixture.shardDir],
      cycle: 0,
      splitSeed: SEED,
      valRatio: VAL_RATIO,
      outDir,
    });

    expect(manifest.schema).toBe(NNUE_SELFPLAY_DATASET_MANIFEST_SCHEMA);
    expect(manifest.live_weight_write_authorized).toBe(false);
    const input = manifest.input as {
      current_run_fingerprint: string;
      current_generation: {
        requested_games: number;
        completed_games: number;
        sampled_games: number;
      };
      current_shards: Array<{
        run_fingerprint: string;
        generation: { sampled_games: number };
        positions: { bytes: number; sha256: string };
        manifest: { bytes: number; sha256: string };
      }>;
    };
    expect(input.current_run_fingerprint).toBe("f".repeat(64));
    expect(input.current_shards[0].run_fingerprint).toBe("f".repeat(64));
    expect(input.current_generation).toMatchObject({
      requested_games: 6,
      completed_games: 6,
      sampled_games: 6,
    });
    expect(input.current_shards[0].generation.sampled_games).toBe(6);
    expect(manifest.accounting).toMatchObject({
      generation_requested_games: 6,
      generation_completed_games: 6,
      generation_sampled_games: 6,
      generation_zero_sample_games: 0,
      generation_terminal_reasons: terminalReasons({ repetition: 6 }),
      train_validation_source_game_overlap: 0,
    });
    const sourceBytes = fs.readFileSync(
      path.join(fixture.shardDir, "positions.jsonl"),
    );
    const sourceManifestBytes = fs.readFileSync(
      path.join(fixture.shardDir, "manifest.json"),
    );
    expect(input.current_shards[0].positions).toMatchObject({
      bytes: sourceBytes.byteLength,
      sha256: digest(sourceBytes),
    });
    expect(input.current_shards[0].manifest).toMatchObject({
      bytes: sourceManifestBytes.byteLength,
      sha256: digest(sourceManifestBytes),
    });
    expect(fs.readdirSync(outDir).sort()).toEqual([
      "manifest.json",
      "train.jsonl",
      "val.jsonl",
    ]);
    const train = publishedRows(path.join(outDir, "train.jsonl"));
    const val = publishedRows(path.join(outDir, "val.jsonl"));
    expect(train.length).toBeGreaterThan(0);
    expect(val.length).toBeGreaterThan(0);
    expect(train.every((value) => value.split === "train")).toBe(true);
    expect(val.every((value) => value.split === "val")).toBe(true);
    expect(new Set(train.map((value) => value.game_id))).not.toContain(
      fixture.valGame,
    );
    expect(new Set(val.map((value) => value.game_id))).toContain(
      fixture.valGame,
    );
    const trainGames = new Set(train.map((value) => value.game_id));
    const trainPositions = new Set(train.map((value) => value.position_id));
    expect(val.filter((value) => trainGames.has(value.game_id))).toEqual([]);
    expect(
      val.filter((value) => trainPositions.has(value.position_id)),
    ).toEqual([]);
    for (const file of ["train.jsonl", "val.jsonl", "manifest.json"]) {
      expect(fs.readFileSync(path.join(outDir, file), "utf8")).toMatch(/\n$/);
    }
  });

  it("optionally balances each cycle-zero split exactly and deterministically", async () => {
    const base = root();
    const sfens = sfensBySide(8);
    const rows = [
      ...sfens.b
        .slice(0, 4)
        .map((sfen, index) =>
          row(sfen, gameFor("train", `balance-train-b-${index}`)),
        ),
      ...sfens.w
        .slice(0, 2)
        .map((sfen, index) =>
          row(sfen, gameFor("train", `balance-train-w-${index}`)),
        ),
      ...sfens.b
        .slice(4, 6)
        .map((sfen, index) =>
          row(sfen, gameFor("val", `balance-val-b-${index}`)),
        ),
      ...sfens.w
        .slice(2, 7)
        .map((sfen, index) =>
          row(sfen, gameFor("val", `balance-val-w-${index}`)),
        ),
    ];
    const shardDir = shard(base, 0, 1, 0, rows);
    const common = {
      currentShardDirs: [shardDir],
      cycle: 0,
      splitSeed: SEED,
      valRatio: VAL_RATIO,
    } as const;
    const implicitDefaultDir = path.join(base, "implicit-default");
    const explicitFalseDir = path.join(base, "explicit-false");
    await prepareNnueSelfplayDataset({
      ...common,
      outDir: implicitDefaultDir,
    });
    await prepareNnueSelfplayDataset({
      ...common,
      outDir: explicitFalseDir,
      balanceSideToMove: false,
    });
    for (const file of ["train.jsonl", "val.jsonl", "manifest.json"]) {
      expect(fs.readFileSync(path.join(explicitFalseDir, file))).toEqual(
        fs.readFileSync(path.join(implicitDefaultDir, file)),
      );
    }

    const firstDir = path.join(base, "balanced-a");
    const secondDir = path.join(base, "balanced-b");
    const manifest = await prepareNnueSelfplayDataset({
      ...common,
      outDir: firstDir,
      balanceSideToMove: true,
    });
    await prepareNnueSelfplayDataset({
      ...common,
      outDir: secondDir,
      balanceSideToMove: true,
    });
    const train = publishedRows(path.join(firstDir, "train.jsonl"));
    const validation = publishedRows(path.join(firstDir, "val.jsonl"));
    expect(sideCounts(train)).toEqual({ b: 2, w: 2 });
    expect(sideCounts(validation)).toEqual({ b: 2, w: 2 });
    expect(fs.readFileSync(path.join(secondDir, "train.jsonl"))).toEqual(
      fs.readFileSync(path.join(firstDir, "train.jsonl")),
    );
    expect(fs.readFileSync(path.join(secondDir, "val.jsonl"))).toEqual(
      fs.readFileSync(path.join(firstDir, "val.jsonl")),
    );
    expect(manifest.policy).toMatchObject({
      side_to_move_balance:
        "cycle0-deterministic-majority-downsample-per-split-v1",
    });
    expect(manifest.accounting).toMatchObject({
      replay_selected_current_records: 4,
      replay_selected_past_accepted_records: 0,
      replay_selected_total_records: 4,
      side_to_move_balance: {
        train: {
          available: { b: 4, w: 2 },
          selected: { b: 2, w: 2 },
          removed: { b: 2, w: 0 },
        },
        validation: {
          available: { b: 2, w: 5 },
          selected: { b: 2, w: 2 },
          removed: { b: 0, w: 3 },
        },
      },
    });
    const holdout = manifest.holdout as {
      source_game_ids: { count: number };
      game_ids: { count: number };
      opening_ids: { count: number };
      position_ids: { count: number };
    };
    expect(holdout.source_game_ids.count).toBe(7);
    expect(holdout.game_ids.count).toBe(7);
    expect(holdout.opening_ids.count).toBe(7);
    expect(holdout.position_ids.count).toBe(7);

    const shardRoot = path.join(base, "generator-run");
    fs.mkdirSync(shardRoot);
    fs.renameSync(shardDir, path.join(shardRoot, "shard-000"));
    const cliDir = path.join(base, "balanced-cli");
    await runCli([
      "--cycle",
      "0",
      "--shard-root",
      shardRoot,
      "--shards",
      "1",
      "--split-seed",
      SEED,
      "--val-ratio",
      String(VAL_RATIO),
      "--out-dir",
      cliDir,
      "--balance-side-to-move",
    ]);
    expect(sideCounts(publishedRows(path.join(cliDir, "train.jsonl")))).toEqual(
      { b: 2, w: 2 },
    );
  });

  it("rejects side-to-move balancing after cycle zero", async () => {
    await expect(
      prepareNnueSelfplayDataset({
        currentShardDirs: ["/does/not/need/to/exist"],
        cycle: 1,
        splitSeed: SEED,
        outDir: "/does/not/need/to/exist-either",
        balanceSideToMove: true,
      }),
    ).rejects.toThrow(/supported only for cycle zero/);
  });

  it("fails cycle-zero balancing when a split contains only one side", async () => {
    const base = root();
    const sfens = sfensBySide(4);
    const rows = [
      ...sfens.b
        .slice(0, 2)
        .map((sfen, index) =>
          row(sfen, gameFor("train", `one-side-train-${index}`)),
        ),
      row(sfens.b[2], gameFor("val", "one-side-val-b")),
      row(sfens.w[0], gameFor("val", "one-side-val-w")),
    ];
    await expect(
      prepareNnueSelfplayDataset({
        currentShardDirs: [shard(base, 0, 1, 0, rows)],
        cycle: 0,
        splitSeed: SEED,
        valRatio: VAL_RATIO,
        outDir: path.join(base, "dataset"),
        balanceSideToMove: true,
      }),
    ).rejects.toThrow(/train side-to-move balance requires both b and w/);
  });

  it("gives validation priority when a semantic position occurs in both roles", async () => {
    const base = root();
    const sfens = uniqueSfens(3);
    const trainGame = gameFor("train", "priority-train");
    const valGame = gameFor("val", "priority-val");
    const shadowValGame = gameFor("val", "priority-val-shadow");
    const rows = [
      row(sfens[0], trainGame),
      row(sfens[0], valGame),
      row(sfens[1], trainGame, { opening_id: `opening-${trainGame}` }),
      row(sfens[2], valGame, { opening_id: `opening-${valGame}` }),
      row(sfens[2], shadowValGame),
    ];
    const shardDir = shard(base, 0, 1, 0, rows);
    const outDir = path.join(base, "dataset");
    const manifest = await prepareNnueSelfplayDataset({
      currentShardDirs: [shardDir],
      cycle: 0,
      splitSeed: SEED,
      valRatio: VAL_RATIO,
      outDir,
    });
    const train = publishedRows(path.join(outDir, "train.jsonl"));
    const val = publishedRows(path.join(outDir, "val.jsonl"));
    expect(train.map((value) => value.position_id)).not.toContain(
      positionKeyFromSfen(sfens[0]),
    );
    expect(val.map((value) => value.position_id)).toContain(
      positionKeyFromSfen(sfens[0]),
    );
    const accounting = manifest.accounting as Record<string, number>;
    expect(
      accounting.validation_position_priority_current_records_removed,
    ).toBe(1);
    expect(accounting.train_validation_game_overlap).toBe(0);
    expect(accounting.train_validation_position_overlap).toBe(0);
    const holdout = manifest.holdout as {
      source_game_ids: { values: string[] };
    };
    expect(holdout.source_game_ids.values).toEqual(
      expect.arrayContaining([valGame, shadowValGame]),
    );
  });

  it("assigns cycle-zero split by source_game_id instead of generated game_id", async () => {
    const base = root();
    const sfens = uniqueSfens(4);
    const validationSource = gameFor("val", "floodgate-source-val");
    const trainingSource = gameFor("train", "floodgate-source-train");
    const rows = [
      row(sfens[0], gameFor("train", "generated-would-train"), {
        source_game_id: validationSource,
      }),
      row(sfens[1], gameFor("val", "generated-would-val"), {
        source_game_id: validationSource,
      }),
      row(sfens[2], "generated-training-a", {
        source_game_id: trainingSource,
      }),
      row(sfens[3], "generated-training-b", {
        source_game_id: trainingSource,
      }),
    ];
    const shardDir = shard(base, 0, 1, 0, rows);
    const outDir = path.join(base, "dataset");
    await prepareNnueSelfplayDataset({
      currentShardDirs: [shardDir],
      cycle: 0,
      splitSeed: SEED,
      valRatio: VAL_RATIO,
      outDir,
    });
    const train = publishedRows(path.join(outDir, "train.jsonl"));
    const val = publishedRows(path.join(outDir, "val.jsonl"));
    expect(new Set(val.map((value) => value.source_game_id))).toEqual(
      new Set([validationSource]),
    );
    expect(new Set(train.map((value) => value.source_game_id))).toEqual(
      new Set([trainingSource]),
    );
  });

  it("binds shard bytes, hashes, counts, canonical JSONL, and non-symlink inputs", async () => {
    const scenarios: Array<{
      name: string;
      build: (base: string) => string;
      error: RegExp;
    }> = [
      {
        name: "generation-requested",
        build: (base) => {
          const value = row(START, gameFor("train", "generation-requested"));
          return shard(base, 0, 1, 0, [value], {
            manifestOverrides: {
              generation: {
                requested_games: 2,
                completed_games: 1,
                sampled_games: 1,
                zero_sample_games: 0,
                terminal_reasons: terminalReasons({ repetition: 1 }),
              },
            },
          });
        },
        error: /requested_games must equal completed_games/,
      },
      {
        name: "generation-sampled-zero",
        build: (base) => {
          const value = row(START, gameFor("train", "generation-zero"));
          return shard(base, 0, 1, 0, [value], {
            manifestOverrides: {
              generation: {
                requested_games: 1,
                completed_games: 1,
                sampled_games: 0,
                zero_sample_games: 0,
                terminal_reasons: terminalReasons({ repetition: 1 }),
              },
            },
          });
        },
        error: /sampled_games plus zero_sample_games/,
      },
      {
        name: "generation-output-games",
        build: (base) => {
          const value = row(START, gameFor("train", "generation-output"));
          return shard(base, 0, 1, 0, [value], {
            manifestOverrides: {
              generation: {
                requested_games: 1,
                completed_games: 1,
                sampled_games: 0,
                zero_sample_games: 1,
                terminal_reasons: terminalReasons({ repetition: 1 }),
              },
            },
          });
        },
        error: /sampled_games must equal output.games/,
      },
      {
        name: "generation-terminal-reasons",
        build: (base) => {
          const value = row(START, gameFor("train", "generation-reasons"));
          return shard(base, 0, 1, 0, [value], {
            manifestOverrides: {
              generation: {
                requested_games: 1,
                completed_games: 1,
                sampled_games: 1,
                zero_sample_games: 0,
                terminal_reasons: terminalReasons(),
              },
            },
          });
        },
        error: /terminal_reasons counts must sum/,
      },
      {
        name: "run-fingerprint",
        build: (base) => {
          const value = row(START, gameFor("train", "fingerprint-train"));
          return shard(base, 0, 1, 0, [value], {
            manifestOverrides: { run_fingerprint: "A".repeat(64) },
          });
        },
        error: /lowercase SHA-256/,
      },
      {
        name: "training-ineligible",
        build: (base) => {
          const value = row(START, gameFor("train", "ineligible-train"));
          return shard(base, 0, 1, 0, [value], {
            manifestOverrides: { training_eligible: false },
          });
        },
        error: /training-eligible/,
      },
      {
        name: "hash",
        build: (base) => {
          const value = row(START, gameFor("train", "hash-train"));
          return shard(base, 0, 1, 0, [value], {
            outputOverrides: { sha256: "0".repeat(64) },
          });
        },
        error: /sha256 does not match/,
      },
      {
        name: "accounting",
        build: (base) => {
          const value = row(START, gameFor("train", "count-train"));
          return shard(base, 0, 1, 0, [value], {
            outputOverrides: { records: 2 },
          });
        },
        error: /record accounting differs/,
      },
      {
        name: "canonical",
        build: (base) => {
          const value = row(START, gameFor("train", "canonical-train"));
          return shard(base, 0, 1, 0, [value], {
            positionsText: `${JSON.stringify(value)}\n`,
          });
        },
        error: /not canonical JSON/,
      },
    ];
    for (const scenario of scenarios) {
      const base = root();
      const shardDir = scenario.build(base);
      await expect(
        prepareNnueSelfplayDataset({
          currentShardDirs: [shardDir],
          cycle: 0,
          splitSeed: SEED,
          valRatio: VAL_RATIO,
          outDir: path.join(base, scenario.name),
        }),
      ).rejects.toThrow(scenario.error);
    }

    const symlinkBase = root();
    const target = path.join(symlinkBase, "outside.jsonl");
    const value = row(START, gameFor("train", "link-train"));
    write(target, canonicalJsonl([value]));
    const directory = path.join(symlinkBase, "shard-0");
    fs.mkdirSync(directory);
    fs.symlinkSync(target, path.join(directory, "positions.jsonl"));
    const bytes = fs.readFileSync(target);
    write(
      path.join(directory, "manifest.json"),
      `${canonicalJson({
        schema: NNUE_SELFPLAY_SHARD_MANIFEST_SCHEMA,
        complete: true,
        training_eligible: true,
        run_fingerprint: "f".repeat(64),
        generation: {
          requested_games: 1,
          completed_games: 1,
          sampled_games: 1,
          zero_sample_games: 0,
          terminal_reasons: terminalReasons({ repetition: 1 }),
        },
        cycle: 0,
        shard_index: 0,
        shard_total: 1,
        output: {
          file: "positions.jsonl",
          bytes: bytes.byteLength,
          sha256: digest(bytes),
          records: 1,
          games: 1,
          unique_positions: 1,
        },
      })}\n`,
    );
    await expect(
      prepareNnueSelfplayDataset({
        currentShardDirs: [directory],
        cycle: 0,
        splitSeed: SEED,
        valRatio: VAL_RATIO,
        outDir: path.join(symlinkBase, "out"),
      }),
    ).rejects.toThrow();
  });

  it("rejects mixed per-game result evidence even when every row is locally valid", async () => {
    const base = root();
    const sfens = uniqueSfens(2);
    const game = gameFor("train", "mixed-result");
    const first = row(sfens[0], game, {
      result: { winner: "b", reason: "checkmate" },
      outcome: sfens[0].split(/\s+/)[1] === "b" ? 1 : 0,
    });
    const second = row(sfens[1], game, {
      opening_id: first.opening_id,
      result: { winner: null, reason: "repetition" },
      outcome: 0.5,
    });
    const shardDir = shard(base, 0, 1, 0, [first, second]);
    await expect(
      prepareNnueSelfplayDataset({
        currentShardDirs: [shardDir],
        cycle: 0,
        splitSeed: SEED,
        valRatio: VAL_RATIO,
        outDir: path.join(base, "out"),
      }),
    ).rejects.toThrow(/mixed results/);
  });

  it("requires one lowercase run fingerprint across every current shard", async () => {
    const base = root();
    const sfens = uniqueSfens(2);
    const first = shard(
      base,
      0,
      2,
      0,
      [row(sfens[0], gameFor("train", "fingerprint-first"))],
      { manifestOverrides: { run_fingerprint: "1".repeat(64) } },
    );
    const second = shard(
      base,
      1,
      2,
      0,
      [row(sfens[1], gameFor("val", "fingerprint-second"))],
      { manifestOverrides: { run_fingerprint: "2".repeat(64) } },
    );
    await expect(
      prepareNnueSelfplayDataset({
        currentShardDirs: [first, second],
        cycle: 0,
        splitSeed: SEED,
        valRatio: VAL_RATIO,
        outDir: path.join(base, "out"),
      }),
    ).rejects.toThrow(/different run_fingerprint/);
  });

  it("reuses exact cycle-zero holdout and deterministically composes 75/25 replay", async () => {
    const base = root();
    const cycle0 = makeCycle0Fixture(base, "holdout");
    const cycle0Dir = path.join(base, "cycle0");
    await prepareNnueSelfplayDataset({
      currentShardDirs: [cycle0.shardDir],
      cycle: 0,
      splitSeed: SEED,
      valRatio: VAL_RATIO,
      outDir: cycle0Dir,
    });
    const holdoutBytes = fs.readFileSync(path.join(cycle0Dir, "val.jsonl"));
    const fixedValidation = publishedRows(path.join(cycle0Dir, "val.jsonl"));
    const holdoutOpening = fixedValidation[0].opening_id;
    const cycle0Manifest = JSON.parse(
      fs.readFileSync(path.join(cycle0Dir, "manifest.json"), "utf8"),
    ) as {
      holdout: {
        source_game_ids: { count: number; sha256: string };
        opening_ids: { count: number; sha256: string };
      };
    };
    expect(cycle0Manifest.holdout.opening_ids).toMatchObject({
      count: new Set(fixedValidation.map((value) => value.opening_id)).size,
    });
    expect(cycle0Manifest.holdout.opening_ids.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(cycle0Manifest.holdout.source_game_ids).toMatchObject({
      count: new Set(fixedValidation.map((value) => value.source_game_id)).size,
    });

    const sfens = uniqueSfens(40);
    const used = new Set(cycle0.rows.map((value) => value.position_id));
    const free = sfens.filter((sfen) => !used.has(positionKeyFromSfen(sfen)));
    const currentRows = free
      .slice(0, 8)
      .map((sfen, index) => row(sfen, `cycle1-current-${index}`));
    // One current row repeats the fixed holdout and must never reach training.
    currentRows.push(
      row(
        cycle0.rows.find((value) => value.game_id === cycle0.valGame)!.sfen,
        "cycle1-holdout-repeat",
      ),
    );
    // A distinct position/game from the same opening is correlated holdout data.
    currentRows.push(
      row(free[16], "cycle1-opening-repeat", {
        opening_id: holdoutOpening,
      }),
    );
    currentRows.push(
      row(free[18], "cycle1-source-repeat", {
        source_game_id: fixedValidation[0].source_game_id,
      }),
    );
    const currentShard = shard(base, 0, 1, 1, currentRows);

    const acceptedDir = path.join(base, "accepted-cycle0");
    fs.mkdirSync(acceptedDir);
    const pastRows = free.slice(8, 16).map((sfen, index) => ({
      ...row(sfen, `past-${index}`),
      split: "train" as const,
    }));
    pastRows.push({
      ...row(free[17], "past-opening-repeat", {
        opening_id: holdoutOpening,
      }),
      split: "train" as const,
    });
    pastRows.push({
      ...row(free[19], "past-source-repeat", {
        source_game_id: fixedValidation[0].source_game_id,
      }),
      split: "train" as const,
    });
    const trainText = canonicalJsonl(pastRows);
    write(path.join(acceptedDir, "train.jsonl"), trainText);
    const trainBytes = Buffer.from(trainText);
    write(
      path.join(acceptedDir, "acceptance.json"),
      `${canonicalJson({
        schema: NNUE_SELFPLAY_ACCEPTANCE_SCHEMA,
        accepted: true,
        cycle: 0,
        dataset: {
          file: "train.jsonl",
          bytes: trainBytes.byteLength,
          sha256: digest(trainBytes),
          records: pastRows.length,
        },
      })}\n`,
    );

    const outA = path.join(base, "cycle1-a");
    const outB = path.join(base, "cycle1-b");
    const options = {
      currentShardDirs: [currentShard],
      cycle: 1,
      splitSeed: SEED,
      valRatio: VAL_RATIO,
      cycle0HoldoutDir: cycle0Dir,
      pastAcceptedDirs: [acceptedDir],
    } as const;
    const first = await prepareNnueSelfplayDataset({
      ...options,
      outDir: outA,
    });
    await prepareNnueSelfplayDataset({ ...options, outDir: outB });
    expect(fs.readFileSync(path.join(outA, "val.jsonl"))).toEqual(holdoutBytes);
    expect(fs.readFileSync(path.join(outA, "train.jsonl"))).toEqual(
      fs.readFileSync(path.join(outB, "train.jsonl")),
    );
    const train = publishedRows(path.join(outA, "train.jsonl"));
    const accounting = first.accounting as Record<string, number>;
    expect(accounting.replay_selected_current_records).toBe(6);
    expect(accounting.replay_selected_past_accepted_records).toBe(2);
    expect(accounting.actual_current_ratio).toBe(0.75);
    expect(accounting.actual_past_accepted_ratio).toBe(0.25);
    expect(
      accounting.validation_source_game_priority_current_records_removed,
    ).toBe(1);
    expect(
      accounting.validation_source_game_priority_past_records_removed,
    ).toBe(1);
    expect(accounting.validation_opening_priority_current_records_removed).toBe(
      1,
    );
    expect(accounting.validation_opening_priority_past_records_removed).toBe(1);
    const holdoutPositions = new Set(
      publishedRows(path.join(outA, "val.jsonl")).map(
        (value) => value.position_id,
      ),
    );
    expect(
      train.filter((value) => holdoutPositions.has(value.position_id)),
    ).toEqual([]);
    const holdoutOpenings = new Set(
      fixedValidation.map((value) => value.opening_id),
    );
    expect(
      train.filter((value) => holdoutOpenings.has(value.opening_id)),
    ).toEqual([]);
    const holdoutSourceGames = new Set(
      fixedValidation.map((value) => value.source_game_id),
    );
    expect(
      train.filter((value) => holdoutSourceGames.has(value.source_game_id)),
    ).toEqual([]);
  });

  it("requires explicit accepted evidence and an unchanged cycle-zero policy", async () => {
    const base = root();
    const cycle0 = makeCycle0Fixture(base, "evidence");
    const cycle0Dir = path.join(base, "cycle0");
    await prepareNnueSelfplayDataset({
      currentShardDirs: [cycle0.shardDir],
      cycle: 0,
      splitSeed: SEED,
      valRatio: VAL_RATIO,
      outDir: cycle0Dir,
    });
    const current = shard(
      base,
      0,
      1,
      1,
      uniqueSfens(5).map((sfen, index) => row(sfen, `later-${index}`)),
    );
    const unaccepted = path.join(base, "unaccepted");
    fs.mkdirSync(unaccepted);
    const train = canonicalJsonl([
      { ...row(uniqueSfens(7)[6], "old"), split: "train" },
    ]);
    write(path.join(unaccepted, "train.jsonl"), train);
    write(
      path.join(unaccepted, "acceptance.json"),
      `${canonicalJson({
        schema: NNUE_SELFPLAY_ACCEPTANCE_SCHEMA,
        accepted: false,
        cycle: 0,
        dataset: {
          file: "train.jsonl",
          bytes: Buffer.byteLength(train),
          sha256: digest(train),
          records: 1,
        },
      })}\n`,
    );
    await expect(
      prepareNnueSelfplayDataset({
        currentShardDirs: [current],
        cycle: 1,
        splitSeed: SEED,
        valRatio: VAL_RATIO,
        outDir: path.join(base, "later"),
        cycle0HoldoutDir: cycle0Dir,
        pastAcceptedDirs: [unaccepted],
      }),
    ).rejects.toThrow(/explicitly accept/);

    await expect(
      prepareNnueSelfplayDataset({
        currentShardDirs: [current],
        cycle: 1,
        splitSeed: `${SEED}-changed`,
        valRatio: VAL_RATIO,
        outDir: path.join(base, "changed"),
        cycle0HoldoutDir: cycle0Dir,
        pastAcceptedDirs: [unaccepted],
      }),
    ).rejects.toThrow(/split policy differs/);
  });

  it("cleans the temporary directory when atomic publication fails", async () => {
    const base = root();
    const fixture = makeCycle0Fixture(base, "atomic");
    const outDir = path.join(base, "dataset");
    let filesAtPublish: string[] = [];
    await expect(
      prepareNnueSelfplayDatasetCoreForTests(
        {
          currentShardDirs: [fixture.shardDir],
          cycle: 0,
          splitSeed: SEED,
          valRatio: VAL_RATIO,
          outDir,
        },
        async (source) => {
          filesAtPublish = fs.readdirSync(source).sort();
          throw new Error("injected publication failure");
        },
      ),
    ).rejects.toThrow(/injected publication failure/);
    expect(filesAtPublish).toEqual([
      "manifest.json",
      "train.jsonl",
      "val.jsonl",
    ]);
    expect(fs.existsSync(outDir)).toBe(false);
    expect(
      fs.readdirSync(base).filter((entry) => entry.includes(".dataset.tmp-")),
    ).toEqual([]);
  });

  it("never clobbers an existing output directory", async () => {
    const base = root();
    const fixture = makeCycle0Fixture(base, "fresh");
    const outDir = path.join(base, "dataset");
    await prepareNnueSelfplayDataset({
      currentShardDirs: [fixture.shardDir],
      cycle: 0,
      splitSeed: SEED,
      valRatio: VAL_RATIO,
      outDir,
    });
    const before = digest(fs.readFileSync(path.join(outDir, "manifest.json")));
    await expect(
      prepareNnueSelfplayDataset({
        currentShardDirs: [fixture.shardDir],
        cycle: 0,
        splitSeed: SEED,
        valRatio: VAL_RATIO,
        outDir,
      }),
    ).rejects.toThrow(/already exists/);
    expect(digest(fs.readFileSync(path.join(outDir, "manifest.json")))).toBe(
      before,
    );
  });

  it("maps --shard-root to zero-padded generator shard directories", async () => {
    const base = root();
    const fixture = makeCycle0Fixture(base, "cli-root");
    const shardRoot = path.join(base, "generator-run");
    fs.mkdirSync(shardRoot);
    fs.renameSync(fixture.shardDir, path.join(shardRoot, "shard-000"));
    const outDir = path.join(base, "dataset");
    await runCli([
      "--cycle",
      "0",
      "--shard-root",
      shardRoot,
      "--shards",
      "1",
      "--split-seed",
      SEED,
      "--val-ratio",
      String(VAL_RATIO),
      "--out-dir",
      outDir,
    ]);
    expect(fs.existsSync(path.join(outDir, "manifest.json"))).toBe(true);
    await expect(
      runCli([
        "--cycle",
        "0",
        "--shard-prefix",
        shardRoot,
        "--shards",
        "1",
        "--split-seed",
        SEED,
        "--out-dir",
        path.join(base, "legacy"),
      ]),
    ).rejects.toThrow(/unknown argument --shard-prefix/);
  });
});
