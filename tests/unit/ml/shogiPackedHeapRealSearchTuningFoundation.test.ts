import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

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
  currentResearchPatch: {
    bytes: 5_624,
    sha256: "e979b5609bd8d63305037d37860b5f5914fcf641a49f7a61ae0a943af4fb3162",
  },
  currentResearchWasm: {
    bytes: 36_358,
    sha256: "49b66b2466c654232a6bccc5e3d7a72d69ec71d46977aa17f8644cc84361d311",
  },
  packedDeltaPatch: {
    bytes: 2_985,
    sha256: "cc95e43f0b5274dff695da8e5d04e7fb6588902a212813754ad689a74f1f6657",
  },
  packedResearchWasm: {
    bytes: 36_284,
    sha256: "8d94d2d9157b3635fd62d20847c08e2c42dbdb29d23c9e4d4e47aca9bbbbad66",
  },
  runner: {
    bytes: 20_636,
    sha256: "67ff5ab0fa5bc0ea44854223215753fd2ee8bcf92d2a1940d272f5c6f87649ff",
  },
  builder: {
    bytes: 5_311,
    sha256: "e0234cf40dded363411402c2859503970377f0d7fa81909a8daf2887f003c431",
  },
} as const;

function identity(bytes: Uint8Array): { bytes: number; sha256: string } {
  return {
    bytes: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

function read(...parts: string[]): Buffer {
  return readFileSync(join(process.cwd(), ...parts));
}

function instantiate(bytes: Uint8Array): WebAssembly.Exports {
  return new WebAssembly.Instance(new WebAssembly.Module(bytes), {
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

describe("packed stable-heap real-search tuning foundation", () => {
  it("keeps the archived baseline sealed and detects that production advanced", () => {
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
    const historicalWasm = Buffer.from(
      read(
        "docs",
        "data",
        "shogi-dual-hash-lock-production-wasm-2026-07-25.base64",
      ).toString("utf8"),
      "base64",
    );
    expect(identity(historicalWasm)).toEqual(IDENTITIES.productionWasm);
    expect(
      identity(
        read("wasm-spike", "assembly", "lazy-move-picker-research.patch"),
      ),
    ).toEqual(IDENTITIES.currentResearchPatch);
    expect(
      identity(
        read("wasm-spike", "artifacts", "shogi-lazy-move-picker-research.wasm"),
      ),
    ).toEqual(IDENTITIES.currentResearchWasm);
  });

  it("pins the packed delta, isolated artifact, builder, and runner", () => {
    const patch = read(
      "wasm-spike",
      "assembly",
      "packed-heap-move-picker-research.patch",
    );
    expect(identity(patch)).toEqual(IDENTITIES.packedDeltaPatch);
    expect(
      identity(
        read(
          "wasm-spike",
          "artifacts",
          "shogi-lazy-move-picker-packed-research.wasm",
        ),
      ),
    ).toEqual(IDENTITIES.packedResearchWasm);
    expect(
      identity(
        read("wasm-spike", "build-lazy-move-picker-packed-research-wasm.mjs"),
      ),
    ).toEqual(IDENTITIES.builder);
    expect(
      identity(read("wasm-spike", "packed-heap-real-search-tuning.ts")),
    ).toEqual(IDENTITIES.runner);

    const text = patch.toString("utf8");
    expect(text).toContain("researchHeapKeyBuf = new StaticArray<u64>");
    expect(text).toContain("const scoreWord = <u32>score ^ 0x80000000;");
    expect(text).toContain("const ordinalWord = 0xffffffff - <u32>ordinal;");
    expect(text).toContain(
      "researchHeapMakeKey(unchecked(moveScoreBuf[base + i]), i)",
    );
    expect(text).not.toContain(
      "+    unchecked(moveScoreBuf[base + a] = moveScoreBuf[base + b]);",
    );
  });

  it("keeps both research candidates default-off with the same bounded switch", () => {
    const current = instantiate(
      read("wasm-spike", "artifacts", "shogi-lazy-move-picker-research.wasm"),
    ) as WebAssembly.Exports & {
      setResearchLazyMovePicker(flag: number, minMoves: number): void;
      getResearchLazyMovePickerEnabled(): number;
      getResearchLazyMovePickerMinMoves(): number;
    };
    const packed = instantiate(
      read(
        "wasm-spike",
        "artifacts",
        "shogi-lazy-move-picker-packed-research.wasm",
      ),
    ) as WebAssembly.Exports & {
      setResearchLazyMovePicker(flag: number, minMoves: number): void;
      getResearchLazyMovePickerEnabled(): number;
      getResearchLazyMovePickerMinMoves(): number;
    };

    for (const candidate of [current, packed]) {
      expect(candidate.getResearchLazyMovePickerEnabled()).toBe(0);
      expect(candidate.getResearchLazyMovePickerMinMoves()).toBe(64);
      candidate.setResearchLazyMovePicker(1, 1);
      expect(candidate.getResearchLazyMovePickerEnabled()).toBe(1);
      expect(candidate.getResearchLazyMovePickerMinMoves()).toBe(2);
      candidate.setResearchLazyMovePicker(0, 1_000);
      expect(candidate.getResearchLazyMovePickerEnabled()).toBe(0);
      expect(candidate.getResearchLazyMovePickerMinMoves()).toBe(640);
    }
  });

  it("fixes the three-arm screen and forbids formal or live claims", () => {
    const plan = JSON.parse(
      read(
        "ml",
        "protocols",
        "packed-heap-real-search-tuning-v1-plan.json",
      ).toString("utf8"),
    );
    expect(plan.status).toBe("fixed-before-result");
    expect(plan.parentMainCommit).toBe(
      "f75af80a5b368b8a9a7bd07b602b2c5bea51f050",
    );
    expect(plan.identities.runner).toEqual(IDENTITIES.runner);
    expect(plan.identities.builder).toEqual(IDENTITIES.builder);
    expect(plan.identities.productionWasm).toEqual(
      IDENTITIES.productionWasm,
    );
    expect(plan.search.timingOrder).toEqual([
      "production",
      "currentHeap",
      "packedHeap",
      "packedHeap",
      "currentHeap",
      "production",
      "packedHeap",
      "production",
      "currentHeap",
      "currentHeap",
      "production",
      "packedHeap",
    ]);
    expect(plan.gates.packedVsProductionAggregatePctAtLeast).toBe(8.5);
    expect(plan.gates.packedVsCurrentHeapAggregatePctAtLeast).toBe(1.5);
    expect(plan.claimBoundary.formalEvidenceEligible).toBe(false);
    expect(plan.claimBoundary.productionChangeAuthorized).toBe(false);
    expect(plan.claimBoundary.liveChangeAuthorized).toBe(false);
  });
});
