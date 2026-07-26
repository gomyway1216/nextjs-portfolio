import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  loadQuietHistoryCorrectnessPlan,
  parseQuietHistoryCorrectnessCli,
  runQuietHistoryMalusInvariants,
} from "../../../wasm-spike/quiet-history-malus-invariants";

const HISTORY_MAX = 16_384;

const IDENTITIES = {
  productionSource: {
    bytes: 139_447,
    sha256: "0a522e5e167e9a6070d2d1f339ceaada48f623493a827038b744b2b49163115c",
  },
  productionWasm: {
    bytes: 35_597,
    sha256: "e185df728616b7e7af93232ada5e53c33ec7211bf05a99b1e01f48c4e56d813c",
  },
  productionBase64: {
    bytes: 47_993,
    sha256: "927c46aa02af2b76fac7608e3512a3d667e96ce4b8d4d8997d9cb23e64af7960",
  },
  jsReference: {
    bytes: 78_406,
    sha256: "7b4592da2b348bc38dcc9a70027bb73251052b16bed1c07933e1df16cbd505e3",
  },
  liveWeights: {
    bytes: 1_185_988,
    sha256: "e4e738f99fbd8685bcfe2700e4df364af6274e75b44b298432fc313b9a3e28dc",
  },
  researchPatch: {
    bytes: 9_981,
    sha256: "462eeacdfc6bb822537228349905c625350cad2e0785f9aa8a7051d48ac12ca1",
  },
  builder: {
    bytes: 5_370,
    sha256: "4efa2d609a01b1da21062fe46a9888f6ecbcbd44581d08c953f06a9f8c43a104",
  },
  researchWasm: {
    bytes: 37_475,
    sha256: "8b0469b220ccaf61eb2e4ab6575d73e681e007ab88367e5892a44778ac5f684c",
  },
  invariantRunner: {
    bytes: 26_505,
    sha256: "b992f67d16caa0b888681400ef9fb275750e7118675c0e17c1e5ff70525bf26e",
  },
} as const;

function read(...parts: string[]): Buffer {
  return readFileSync(join(process.cwd(), ...parts));
}

function identity(bytes: Uint8Array) {
  return {
    bytes: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

function instantiate(bytes: Uint8Array): WebAssembly.Exports {
  const source = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(source).set(bytes);
  return new WebAssembly.Instance(new WebAssembly.Module(source), {
    env: {
      abort: () => {
        throw new Error("WASM abort");
      },
      now: () => performance.now(),
      sharedTtProbe: () => 0,
      sharedTtStore: () => {},
      sharedShouldStop: () => 0,
    },
  }).exports;
}

function boundedUpdate(current: number, rawBonus: number): number {
  const h = Math.max(-HISTORY_MAX, Math.min(HISTORY_MAX, current));
  const bonus = Math.max(-HISTORY_MAX, Math.min(HISTORY_MAX, rawBonus));
  const damping = Math.trunc((h * Math.abs(bonus)) / HISTORY_MAX);
  return Math.max(-HISTORY_MAX, Math.min(HISTORY_MAX, h + bonus - damping));
}

describe("bounded quiet-history + malus research candidate", () => {
  it("requires one content-addressed plan and forbids ad hoc gate knobs", () => {
    expect(
      parseQuietHistoryCorrectnessCli([
        "--plan",
        "/tmp/plan.json",
        "--plan-sha",
        "a".repeat(64),
      ]),
    ).toEqual({
      plan: "/tmp/plan.json",
      planSha256: "a".repeat(64),
    });
    expect(() => parseQuietHistoryCorrectnessCli([])).toThrow(/required/u);
    expect(() =>
      parseQuietHistoryCorrectnessCli([
        "--plan",
        "/tmp/plan.json",
        "--plan",
        "/tmp/plan-2.json",
        "--plan-sha",
        "a".repeat(64),
      ]),
    ).toThrow(/repeats/u);
    expect(() =>
      parseQuietHistoryCorrectnessCli([
        "--plan",
        "/tmp/plan.json",
        "--plan-sha",
        "a".repeat(64),
        "--depth",
        "4",
      ]),
    ).toThrow(/unknown/u);
  });

  it("rejects even an identical plan copied outside its fixed repo path", () => {
    const planBytes = read(
      "ml",
      "protocols",
      "bounded-quiet-history-malus-v1-plan.json",
    );
    const directory = mkdtempSync(join(tmpdir(), "quiet-history-plan-"));
    const copiedPlan = join(directory, "plan.json");
    try {
      writeFileSync(copiedPlan, planBytes);
      expect(() =>
        loadQuietHistoryCorrectnessPlan(copiedPlan, identity(planBytes).sha256),
      ).toThrow(/must resolve/u);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("pins the historical research lineage and fails closed after production advances", () => {
    expect(identity(read("wasm-spike", "assembly", "index.ts"))).not.toEqual(
      IDENTITIES.productionSource,
    );
    expect(
      identity(
        read(
          "src",
          "components",
          "game",
          "ShogiImproved",
          "wasm",
          "shogi.wasm",
        ),
      ),
    ).not.toEqual(IDENTITIES.productionWasm);
    expect(
      identity(
        read(
          "src",
          "components",
          "game",
          "ShogiImproved",
          "wasm",
          "shogiWasmBase64.ts",
        ),
      ),
    ).not.toEqual(IDENTITIES.productionBase64);
    expect(
      identity(
        read(
          "src",
          "components",
          "game",
          "ShogiImproved",
          "ShogiAIImprovedV20.ts",
        ),
      ),
    ).not.toEqual(IDENTITIES.jsReference);
    const historicalWasm = Buffer.from(
      read(
        "docs",
        "data",
        "shogi-dual-hash-lock-production-wasm-2026-07-25.base64",
      ).toString("utf8"),
      "base64",
    );
    expect(identity(historicalWasm)).toEqual(IDENTITIES.productionWasm);
    const sealedPlan = JSON.parse(
      read(
        "ml",
        "protocols",
        "bounded-quiet-history-malus-v1-plan.json",
      ).toString("utf8"),
    );
    expect(sealedPlan.pinned_inputs.production_search_source).toMatchObject(
      IDENTITIES.productionSource,
    );
    expect(sealedPlan.pinned_inputs.production_wasm).toMatchObject(
      IDENTITIES.productionWasm,
    );
    expect(identity(read("public", "shogi-nnue-weights.bin"))).toEqual(
      IDENTITIES.liveWeights,
    );
    expect(
      identity(
        read("wasm-spike", "assembly", "quiet-history-malus-research.patch"),
      ),
    ).toEqual(IDENTITIES.researchPatch);
    expect(
      identity(
        read("wasm-spike", "build-quiet-history-malus-research-wasm.mjs"),
      ),
    ).toEqual(IDENTITIES.builder);
    expect(
      identity(
        read(
          "wasm-spike",
          "artifacts",
          "shogi-quiet-history-malus-research.wasm",
        ),
      ),
    ).toEqual(IDENTITIES.researchWasm);
    expect(
      identity(read("wasm-spike", "quiet-history-malus-invariants.ts")),
    ).toEqual(IDENTITIES.invariantRunner);
  });

  it("keeps the candidate default-off and implements the exact bounded formula", () => {
    const production = instantiate(
      read("src", "components", "game", "ShogiImproved", "wasm", "shogi.wasm"),
    );
    const research = instantiate(
      read(
        "wasm-spike",
        "artifacts",
        "shogi-quiet-history-malus-research.wasm",
      ),
    ) as WebAssembly.Exports & {
      setResearchQuietHistoryMalus(flag: number): void;
      getResearchQuietHistoryMalusEnabled(): number;
      getResearchQuietHistoryMax(): number;
      getResearchQuietHistoryCap(): number;
      researchQuietHistoryUpdateProbe(
        current: number,
        rawBonus: number,
      ): number;
    };
    expect("setResearchQuietHistoryMalus" in production).toBe(false);
    expect("getResearchQuietHistoryMalusEnabled" in production).toBe(false);
    expect(research.getResearchQuietHistoryMalusEnabled()).toBe(0);
    expect(research.getResearchQuietHistoryMax()).toBe(HISTORY_MAX);
    expect(research.getResearchQuietHistoryCap()).toBe(32);

    const vectors = [
      [0, 2_048],
      [0, -1_024],
      [HISTORY_MAX, 2_048],
      [-HISTORY_MAX, -1_024],
      [HISTORY_MAX - 1, HISTORY_MAX],
      [-HISTORY_MAX + 1, -HISTORY_MAX],
      [100_000, -512],
      [-100_000, 512],
    ] as const;
    for (const [current, bonus] of vectors) {
      expect(research.researchQuietHistoryUpdateProbe(current, bonus)).toBe(
        boundedUpdate(current, bonus),
      );
    }

    let value = 0;
    for (let index = 0; index < 50_000; index++) {
      const bonus = ((index * 1_103_515_245 + 12_345) % 40_001) - 20_000;
      const expected = boundedUpdate(value, bonus);
      value = research.researchQuietHistoryUpdateProbe(value, bonus);
      expect(value).toBe(expected);
      expect(Math.abs(value)).toBeLessThanOrEqual(HISTORY_MAX);
    }
    research.setResearchQuietHistoryMalus(1);
    expect(research.getResearchQuietHistoryMalusEnabled()).toBe(1);
    research.setResearchQuietHistoryMalus(0);
    expect(research.getResearchQuietHistoryMalusEnabled()).toBe(0);
  });

  it("fixes strict quiet eligibility and preserves the historical OFF branch", () => {
    const patch = read(
      "wasm-spike",
      "assembly",
      "quiet-history-malus-research.patch",
    ).toString("utf8");
    expect(patch).toContain("const RESEARCH_QUIET_HISTORY_MAX: i32 = 16_384;");
    expect(patch).toContain("const RESEARCH_QUIET_CAP: i32 = 32;");
    expect(patch).toContain("(<i64>h * <i64>magnitude)");
    expect(patch).toContain("ply > 0");
    expect(patch).toContain("!parentInCheck");
    expect(patch).toContain("capture == EMPTY");
    expect(patch).toContain("promote == 0");
    expect(patch).toContain(
      "const researchStrictQuiet = researchQuietCandidate && !givesCheck;",
    );
    expect(patch).toContain(
      "previousPt >= 0 && !researchQuietHistoryMalusEnabled",
    );
    expect(patch).toContain(
      "unchecked(historyTable[hIdx] = historyTable[hIdx] + depthLeft * depthLeft);",
    );
    expect(patch).toContain(
      "if (researchSearchedQuietCount < RESEARCH_QUIET_CAP)",
    );
  });

  it("exposes only the fixed, plan-bound no-argument diagnostic entrypoint", () => {
    expect(runQuietHistoryMalusInvariants).toHaveLength(0);
  });
});
