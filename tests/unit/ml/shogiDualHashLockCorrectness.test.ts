import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { parseDualHashCorrectnessCli } from "../../../wasm-spike/dual-hash-lock-collision-invariants";

const root = process.cwd();
const fixturePath = resolve(
  root,
  "wasm-spike/dual-hash-lock-collision-fixture-v1.json",
);
const preflightPath = resolve(
  root,
  "ml/protocols/dual-hash-lock-collision-preflight-v1.json",
);

describe("dual-hash lock correctness inputs", () => {
  it("requires one absolute plan and a lowercase pinned hash", () => {
    expect(
      parseDualHashCorrectnessCli([
        "--plan",
        "/tmp/dual-hash-plan.json",
        "--plan-sha",
        "a".repeat(64),
      ]),
    ).toEqual({ plan: "/tmp/dual-hash-plan.json", planSha256: "a".repeat(64) });
    expect(() =>
      parseDualHashCorrectnessCli([
        "--plan",
        "relative.json",
        "--plan-sha",
        "a".repeat(64),
      ]),
    ).toThrow("absolute");
    expect(() =>
      parseDualHashCorrectnessCli([
        "--plan",
        "/tmp/a",
        "--plan-sha",
        "A".repeat(64),
      ]),
    ).toThrow("lowercase");
    expect(() =>
      parseDualHashCorrectnessCli([
        "--plan",
        "/tmp/a",
        "--plan-sha",
        "a".repeat(64),
        "--plan",
        "/tmp/b",
      ]),
    ).toThrow("repeats");
  });

  it("tracks the recorded collision and an independent 64-position holdout", () => {
    const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as Record<
      string,
      any
    >;
    const preflight = readFileSync(preflightPath);
    expect(fixture.schema).toBe("shogi-dual-hash-lock-collision-fixture-v1");
    expect(fixture.primary_hash).toEqual({ bits: 30, value: 218180606 });
    expect(fixture.positions.a.primary_hash).toBe(
      fixture.positions.b.primary_hash,
    );
    expect(fixture.positions.a.sfen).not.toBe(fixture.positions.b.sfen);
    expect(fixture.legality_holdout).toMatchObject({
      path: "wasm-spike/lazy-move-picker-fixture-v2.json",
      case_count: 64,
      categories: {
        opening: 16,
        middlegame: 16,
        dropHeavy: 16,
        checkEvasion: 16,
      },
    });
    expect(createHash("sha256").update(preflight).digest("hex")).toBe(
      fixture.source_preflight.sha256,
    );
  });
});
