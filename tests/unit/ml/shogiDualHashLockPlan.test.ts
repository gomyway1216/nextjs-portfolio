import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { loadDualHashCorrectnessPlan } from "../../../wasm-spike/dual-hash-lock-collision-invariants";
import {
  DUAL_HASH_LOCK_GAMES,
  DUAL_HASH_LOCK_PAIRS,
  loadDualHashPlan,
} from "../../../wasm-spike/match-dual-hash-lock-vs-production";

const planPath = resolve(
  process.cwd(),
  "ml/protocols/dual-hash-lock-v1-plan.json",
);

describe("dual hash lock fixed plan", () => {
  it("is accepted by both authenticated runners", () => {
    const bytes = readFileSync(planPath);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const correctness = loadDualHashCorrectnessPlan(planPath, sha256);
    const match = loadDualHashPlan(planPath, sha256);

    expect(correctness.sha256).toBe(sha256);
    expect(match.plan.experiment_id).toBe("dual-hash-lock-v1");
    expect(match.plan.match).toMatchObject({
      pairs: DUAL_HASH_LOCK_PAIRS,
      games: DUAL_HASH_LOCK_GAMES,
      pair_workers: 12,
      pass_halfpoints: 82,
      score_denominator_halfpoints: 192,
    });
    expect(match.plan.match.pair_seeds).toEqual(
      Array.from(
        { length: DUAL_HASH_LOCK_PAIRS },
        (_, index) => 980_001 + index,
      ),
    );
  });
});
