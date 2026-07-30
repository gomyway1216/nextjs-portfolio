import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(__dirname, "../../..");

describe("fixed-time NNUE gate match harness", () => {
  it("binds fixed time, TT retention, bucket overrides, one opening, and swapped colors", () => {
    const weights = resolve(REPO_ROOT, "public/shogi-nnue-weights.bin");
    const weightsSha256 = createHash("sha256")
      .update(readFileSync(weights))
      .digest("hex");
    const completed = spawnSync(
      process.execPath,
      [
        "-r",
        "tsx/cjs",
        "wasm-spike/match-nnue-vs-v3.ts",
        weights,
        "--vs",
        weights,
        "--games",
        "2",
        "--ms",
        "1",
        "--seed",
        "4242",
        "--buckets-a",
        "1",
        "--buckets-b",
        "1",
        "--sha-a",
        weightsSha256,
        "--sha-b",
        weightsSha256,
      ],
      {
        cwd: REPO_ROOT,
        encoding: "utf8",
        timeout: 15_000,
      },
    );

    expect(completed.status, completed.stderr).toBe(0);
    expect(completed.stderr).toBe("");
    expect(completed.stdout).toContain("fixed-time-ms=1");
    expect(completed.stdout).toContain("lazy-picker=A:off,B:off");
    expect(completed.stdout).toContain(
      "tt=clear-before-each-game-retain-within-game",
    );
    expect(completed.stdout).toContain("NNUE-A(");
    expect(completed.stdout).toContain("NNUE-B(");
    expect(completed.stdout).toContain("buckets=1");
    expect(completed.stdout).toMatch(/\(all [1-9][0-9]* moves legal\)/u);

    const games = completed.stdout
      .split("\n")
      .filter((line) => line.startsWith("game "));
    expect(games).toHaveLength(2);
    expect(games[0]).toContain("game 1/2: NNUE=SENTE");
    expect(games[1]).toContain("game 2/2: NNUE=GOTE");
    const fingerprints = games.map(
      (line) => /\bopening=([0-9a-f]{64})\b/u.exec(line)?.[1],
    );
    expect(fingerprints[0]).toMatch(/^[0-9a-f]{64}$/u);
    expect(fingerprints[1]).toBe(fingerprints[0]);
  }, 20_000);

  it("rejects a weight whose bytes differ from the preregistered SHA-256", () => {
    const weights = resolve(REPO_ROOT, "public/shogi-nnue-weights.bin");
    const completed = spawnSync(
      process.execPath,
      [
        "-r",
        "tsx/cjs",
        "wasm-spike/match-nnue-vs-v3.ts",
        weights,
        "--vs",
        weights,
        "--games",
        "2",
        "--ms",
        "1",
        "--seed",
        "4242",
        "--buckets-a",
        "1",
        "--buckets-b",
        "1",
        "--sha-a",
        "0".repeat(64),
      ],
      { cwd: REPO_ROOT, encoding: "utf8", timeout: 15_000 },
    );

    expect(completed.status).not.toBe(0);
    expect(completed.stdout).toBe("");
    expect(completed.stderr).toContain("weights SHA-256 differs");
  });

  it("configures each side independently only on an explicit research WASM", () => {
    const weights = resolve(REPO_ROOT, "public/shogi-nnue-weights.bin");
    const researchWasm = resolve(
      REPO_ROOT,
      "wasm-spike/artifacts/shogi-lazy-move-picker-research.wasm",
    );
    const completed = spawnSync(
      process.execPath,
      [
        "-r",
        "tsx/cjs",
        "wasm-spike/match-nnue-vs-v3.ts",
        weights,
        "--vs",
        weights,
        "--games",
        "2",
        "--ms",
        "1",
        "--buckets-a",
        "1",
        "--buckets-b",
        "1",
        "--wasm-path",
        researchWasm,
        "--lazy-picker-a-min-moves",
        "64",
        "--lazy-picker-b-min-moves",
        "0",
      ],
      { cwd: REPO_ROOT, encoding: "utf8", timeout: 15_000 },
    );

    expect(completed.status, completed.stderr).toBe(0);
    expect(completed.stderr).toBe("");
    expect(completed.stdout).toContain("lazy-picker=A:64,B:off");
  }, 20_000);

  it("rejects enabling the picker without both an explicit WASM and its research export", () => {
    const weights = resolve(REPO_ROOT, "public/shogi-nnue-weights.bin");
    const baseArgs = [
      "-r",
      "tsx/cjs",
      "wasm-spike/match-nnue-vs-v3.ts",
      weights,
      "--games",
      "2",
      "--ms",
      "1",
      "--buckets-a",
      "1",
      "--lazy-picker-a-min-moves",
      "64",
    ];
    const implicitProduction = spawnSync(process.execPath, baseArgs, {
      cwd: REPO_ROOT,
      encoding: "utf8",
      timeout: 15_000,
    });
    const explicitProduction = spawnSync(
      process.execPath,
      [
        ...baseArgs,
        "--wasm-path",
        resolve(REPO_ROOT, "src/components/game/ShogiImproved/wasm/shogi.wasm"),
      ],
      { cwd: REPO_ROOT, encoding: "utf8", timeout: 15_000 },
    );

    expect(implicitProduction.status).not.toBe(0);
    expect(implicitProduction.stderr).toContain(
      "requires an explicit --wasm-path",
    );
    expect(explicitProduction.status).not.toBe(0);
    expect(explicitProduction.stderr).toContain(
      "does not export setResearchLazyMovePicker",
    );
  });

  it.each(["1", "-2", "641", "not-a-number"])(
    "rejects invalid lazy picker minimum %s",
    (invalidValue) => {
      const weights = resolve(REPO_ROOT, "public/shogi-nnue-weights.bin");
      const completed = spawnSync(
        process.execPath,
        [
          "-r",
          "tsx/cjs",
          "wasm-spike/match-nnue-vs-v3.ts",
          weights,
          "--lazy-picker-a-min-moves",
          invalidValue,
        ],
        { cwd: REPO_ROOT, encoding: "utf8", timeout: 15_000 },
      );

      expect(completed.status).not.toBe(0);
      expect(completed.stderr).toContain(
        "must be 0 (off) or an integer from 2 through 640",
      );
    },
  );

  it.each(["0", "513", "-1"])(
    "rejects an invalid maximum ply limit %s before loading the runtime",
    (invalidValue) => {
      const weights = resolve(REPO_ROOT, "public/shogi-nnue-weights.bin");
      const completed = spawnSync(
        process.execPath,
        [
          "-r",
          "tsx/cjs",
          "wasm-spike/match-nnue-vs-v3.ts",
          weights,
          "--max-plies",
          invalidValue,
        ],
        { cwd: REPO_ROOT, encoding: "utf8", timeout: 15_000 },
      );

      expect(completed.status).not.toBe(0);
      expect(completed.stderr).toContain(
        "--max-plies must be an integer from 1 through 512",
      );
    },
  );
});
