import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { describe, expect, it } from "vitest";

import {
  assertNoCrossSplitOverlap,
  classifyLabelFailure,
  ensureLabelManifest,
  main,
  parseLabelSplits,
  parsePrepareTargets,
  readLabelFailures,
  recoverAndReadTeacherRows,
  selectParentsFromGame,
  splitForId,
  type PilotParentRow,
  type ScratchWarmSplit,
} from "../../../ml/prepare-floodgate-scratch-warm-pilot";
import { parseCsaGame, type ParsedCsaGame } from "../../../ml/import-csa-games";

function gameWithMoves(count = 16): ParsedCsaGame {
  const opening = [
    "+7776FU",
    "-3334FU",
    "+2726FU",
    "-8384FU",
    "+2625FU",
    "-8485FU",
    "+6978KI",
    "-4132KI",
    "+2524FU",
    "-2324FU",
    "+2824HI",
    "-0023FU",
    "+2428HI",
    "-7162GI",
    "+3938GI",
    "-3142GI",
  ];
  return parseCsaGame(
    [
      "V2",
      "N+StrongA",
      "N-StrongB",
      "'black_rate:StrongA:x:3500",
      "'white_rate:StrongB:y:3600",
      "PI",
      "+",
      ...opening.slice(0, count),
      "%TORYO",
    ].join("\n"),
    { source: "floodgate" },
  );
}

function row(sfen: string, split: ScratchWarmSplit): PilotParentRow {
  return {
    schema: "shogi-floodgate-scratch-warm-parent-v1",
    split,
    game_id: `game-${split}`,
    game_sha256: "a".repeat(64),
    position_id: `position-${split}`,
    sfen,
    ply: 20,
    played_move: "7g7f",
    ratings: { sente: 3500, gote: 3600 },
  };
}

describe("Floodgate scratch/warm pilot preparation", () => {
  it("classifies every non-playing teacher result as a durable failure", () => {
    expect(classifyLabelFailure("p1", null)).toEqual({
      position_id: "p1",
      error: "teacher-no-score",
    });
    expect(classifyLabelFailure("p2", { cp: -30, bestmove: "resign" })).toEqual(
      {
        position_id: "p2",
        error: "teacher-bestmove-resign",
      },
    );
    expect(classifyLabelFailure("p3", { cp: 30, bestmove: "win" })).toEqual({
      position_id: "p3",
      error: "teacher-bestmove-win",
    });
    expect(classifyLabelFailure("p4", null, "timeout")).toEqual({
      position_id: "p4",
      error: "evaluation-error:timeout",
    });
    expect(classifyLabelFailure("p5", { cp: 12, bestmove: "7g7f" })).toBeNull();
  });

  it("keeps test blind unless explicitly selected", () => {
    expect(parseLabelSplits()).toEqual(["train", "val"]);
    expect(parseLabelSplits("train,val,test")).toEqual([
      "train",
      "val",
      "test",
    ]);
    expect(() => parseLabelSplits("train,unknown")).toThrow(/unsupported/);
    expect(() => parseLabelSplits("train,train")).toThrow(/duplicate/);
    expect(() => parseLabelSplits("train,")).toThrow(/non-empty/);
  });

  it("makes deterministic 90/5/5 assignments with domain separation", () => {
    const ids = Array.from({ length: 20_000 }, (_, index) => `id-${index}`);
    const counts = { train: 0, val: 0, test: 0 };
    for (const id of ids) counts[splitForId(id)]++;
    expect(counts.train / ids.length).toBeGreaterThan(0.88);
    expect(counts.train / ids.length).toBeLessThan(0.92);
    expect(counts.val / ids.length).toBeGreaterThan(0.04);
    expect(counts.val / ids.length).toBeLessThan(0.06);
    expect(
      ids.some(
        (id) =>
          splitForId(id, "scratch-warm-v1", "game") !==
          splitForId(id, "scratch-warm-v1", "position"),
      ),
    ).toBe(true);
  });

  it("retains only positions whose semantic assignment agrees with the game split", () => {
    const game = gameWithMoves();
    const seed = Array.from(
      { length: 100 },
      (_, index) => `test-seed-${index}`,
    ).find(
      (candidate) => splitForId(game.gameSha256, candidate, "game") === "train",
    )!;
    const split = splitForId(game.gameSha256, seed, "game");
    const selected = selectParentsFromGame(game, split, {
      seed,
      minPly: 1,
      maxPly: 120,
      maxPerGame: 9,
    });
    expect(selected.length).toBeGreaterThan(0);
    expect(selected.length).toBeLessThanOrEqual(9);
    expect(selected.every((candidate) => candidate.split === split)).toBe(true);
    expect(
      selected.every((candidate) => {
        const key = candidate.sfen.split(/\s+/).slice(0, 3).join(" ");
        return splitForId(key, seed, "position") === split;
      }),
    ).toBe(true);
  });

  it("detects semantic overlap across splits", () => {
    const sfen =
      "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1";
    expect(() =>
      assertNoCrossSplitOverlap({
        train: [row(sfen, "train")],
        val: [row(sfen.replace(/ 1$/, " 99"), "val")],
        test: [],
      }),
    ).toThrow(/semantic cross-split overlap/);
  });

  it("requires an explicit opt-in above the 10k pilot ceiling", async () => {
    await expect(main(["prepare", "--target", "10001"])).rejects.toThrow(
      /requires explicit --allow-large/,
    );
  });

  it("supports fixed small holdouts for a large scratch corpus", () => {
    expect(
      parsePrepareTargets([
        "prepare",
        "--train-target",
        "800000",
        "--val-target",
        "5000",
        "--test-target",
        "5000",
      ]),
    ).toEqual({ train: 800000, val: 5000, test: 5000 });
    expect(() =>
      parsePrepareTargets([
        "prepare",
        "--target",
        "10000",
        "--train-target",
        "9000",
        "--val-target",
        "500",
        "--test-target",
        "500",
      ]),
    ).toThrow(/cannot be combined/);
    expect(() =>
      parsePrepareTargets([
        "prepare",
        "--train-target",
        "800000",
        "--val-target",
        "5000",
      ]),
    ).toThrow(/must be provided together/);
  });

  it("refuses to resume labels after an input fingerprint changes", async () => {
    const directory = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "scratch-warm-manifest-"),
    );
    try {
      const output = path.join(directory, "train.teacher.jsonl");
      const manifest = `${output}.manifest.json`;
      const base = {
        schema: "shogi-floodgate-scratch-warm-label-manifest-v1" as const,
        input: { path: "/input", bytes: 10, sha256: "a".repeat(64) },
        engine: { path: "/engine", bytes: 20, sha256: "b".repeat(64) },
        eval: { path: "/eval", bytes: 30, sha256: "c".repeat(64) },
        depth: 12,
        output,
      };
      await ensureLabelManifest(manifest, output, base);
      await expect(
        ensureLabelManifest(manifest, output, {
          ...base,
          input: { ...base.input, sha256: "d".repeat(64) },
        }),
      ).rejects.toThrow(/manifest mismatch/);
    } finally {
      await fs.promises.rm(directory, { recursive: true, force: true });
    }
  });

  it("binds the atomic teacher failure ledger to unique input positions", async () => {
    const directory = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "scratch-warm-failures-"),
    );
    try {
      const file = path.join(directory, "train.teacher.jsonl.failures.json");
      const parent = row(
        "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1",
        "train",
      );
      await fs.promises.writeFile(
        file,
        `${JSON.stringify({
          schema: "shogi-floodgate-scratch-warm-label-failures-v1",
          failures: [{ position_id: parent.position_id, error: "timeout" }],
        })}\n`,
      );
      expect(readLabelFailures(file, [parent])).toEqual([
        { position_id: parent.position_id, error: "timeout" },
      ]);
      await fs.promises.writeFile(
        file,
        `${JSON.stringify({
          schema: "shogi-floodgate-scratch-warm-label-failures-v1",
          failures: [
            { position_id: parent.position_id, error: "timeout" },
            { position_id: parent.position_id, error: "duplicate" },
          ],
        })}\n`,
      );
      expect(() => readLabelFailures(file, [parent])).toThrow(
        /unique input ids/,
      );
    } finally {
      await fs.promises.rm(directory, { recursive: true, force: true });
    }
  });

  it("truncates only an incomplete final teacher fragment", async () => {
    const directory = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "scratch-warm-tail-"),
    );
    try {
      const output = path.join(directory, "teacher.jsonl");
      const parent = row(
        "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1",
        "train",
      );
      const teacher = {
        ...parent,
        schema: "shogi-floodgate-scratch-warm-teacher-v1",
        cp: 12,
        bestmove: "7g7f",
        depth: 12,
      };
      const complete = `${JSON.stringify(teacher)}\n`;
      await fs.promises.writeFile(
        output,
        `${complete}{"schema":"shogi-floodgate`,
      );
      expect(recoverAndReadTeacherRows(output, [parent], 12)).toHaveLength(1);
      expect(await fs.promises.readFile(output, "utf8")).toBe(complete);
    } finally {
      await fs.promises.rm(directory, { recursive: true, force: true });
    }
  });

  it("fails closed on terminated invalid JSON and complete invalid rows", async () => {
    const directory = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "scratch-warm-invalid-"),
    );
    try {
      const output = path.join(directory, "teacher.jsonl");
      const parent = row(
        "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1",
        "train",
      );
      await fs.promises.writeFile(output, "{invalid}\n");
      expect(() => recoverAndReadTeacherRows(output, [parent], 12)).toThrow(
        /invalid JSON/,
      );
      await fs.promises.writeFile(output, "{invalid}");
      expect(() => recoverAndReadTeacherRows(output, [parent], 12)).toThrow(
        /complete but invalid JSON/,
      );
      await fs.promises.writeFile(
        output,
        `${JSON.stringify({ schema: "wrong" })}\n`,
      );
      expect(() => recoverAndReadTeacherRows(output, [parent], 12)).toThrow(
        /wrong schema/,
      );
    } finally {
      await fs.promises.rm(directory, { recursive: true, force: true });
    }
  });
});
