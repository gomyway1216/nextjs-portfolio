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
  it("remains sealed and both runners fail closed after production advances", () => {
    const bytes = readFileSync(planPath);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const plan = JSON.parse(bytes.toString("utf8"));

    expect(() => loadDualHashCorrectnessPlan(planPath, sha256)).toThrow();
    expect(() => loadDualHashPlan(planPath, sha256)).toThrow();
    expect(plan.execution_manifest.experiment_id).toBe("dual-hash-lock-v1");
    expect(plan.execution_manifest.match).toMatchObject({
      pairs: DUAL_HASH_LOCK_PAIRS,
      games: DUAL_HASH_LOCK_GAMES,
      pair_workers: 12,
      pass_halfpoints: 82,
      score_denominator_halfpoints: 192,
    });
    expect(plan.execution_manifest.match.pair_seeds).toEqual(
      Array.from(
        { length: DUAL_HASH_LOCK_PAIRS },
        (_, index) => 980_001 + index,
      ),
    );

    const snapshot = Buffer.from(
      readFileSync(
        resolve(
          process.cwd(),
          "docs/data/shogi-dual-hash-lock-production-wasm-2026-07-25.base64",
        ),
        "utf8",
      ),
      "base64",
    );
    expect({
      bytes: snapshot.byteLength,
      sha256: createHash("sha256").update(snapshot).digest("hex"),
    }).toEqual({
      bytes: plan.pinned_inputs.production_wasm.bytes,
      sha256: plan.pinned_inputs.production_wasm.sha256,
    });
  });
});
