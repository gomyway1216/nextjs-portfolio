import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const PRODUCTION_SOURCE_IDENTITY = {
  bytes: 143_322,
  sha256: "1005153cbfd17dc7046c5f82d87d33efa7a651736aba35c384e24a5162028880",
};
const PRODUCTION_WASM_IDENTITY = {
  bytes: 36_545,
  sha256: "9142b6b0f0b993596ff3fffa1e05f0d0846bc7672b3f2fc7c90b9f4feaae4c31",
};
const PRODUCTION_BASE64_SOURCE_IDENTITY = {
  bytes: 49_257,
  sha256: "faf307b458f6327e54cc3ba1de9b779a162665fb3d87fbff800c1999efb001dd",
};
const RESEARCH_PATCH_IDENTITY = {
  bytes: 5_624,
  sha256: "e979b5609bd8d63305037d37860b5f5914fcf641a49f7a61ae0a943af4fb3162",
};
const RESEARCH_WASM_IDENTITY = {
  bytes: 36_358,
  sha256: "49b66b2466c654232a6bccc5e3d7a72d69ec71d46977aa17f8644cc84361d311",
};

function identity(bytes: Uint8Array): { bytes: number; sha256: string } {
  return {
    bytes: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
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

describe("stable lazy move picker research WASM isolation", () => {
  it("keeps every production runtime input byte-pinned", () => {
    const root = process.cwd();
    expect(
      identity(readFileSync(join(root, "wasm-spike", "assembly", "index.ts"))),
    ).toEqual(PRODUCTION_SOURCE_IDENTITY);
    expect(
      identity(
        readFileSync(
          join(
            root,
            "src",
            "components",
            "game",
            "ShogiImproved",
            "wasm",
            "shogi.wasm",
          ),
        ),
      ),
    ).toEqual(PRODUCTION_WASM_IDENTITY);
    expect(
      identity(
        readFileSync(
          join(
            root,
            "src",
            "components",
            "game",
            "ShogiImproved",
            "wasm",
            "shogiWasmBase64.ts",
          ),
        ),
      ),
    ).toEqual(PRODUCTION_BASE64_SOURCE_IDENTITY);
  });

  it("stores the experiment only as a pinned patch and isolated artifact", () => {
    const root = process.cwd();
    const patch = readFileSync(
      join(root, "wasm-spike", "assembly", "lazy-move-picker-research.patch"),
    );
    const research = readFileSync(
      join(
        root,
        "wasm-spike",
        "artifacts",
        "shogi-lazy-move-picker-research.wasm",
      ),
    );

    expect(identity(patch)).toEqual(RESEARCH_PATCH_IDENTITY);
    expect(identity(research)).toEqual(RESEARCH_WASM_IDENTITY);
    expect(patch.toString("utf8")).toContain(
      "scoreMovesAS(ply, n, ttMoveKey, ttSecondMoveKey);",
    );
    expect(patch.toString("utf8")).toContain("researchHeapBuild(ply, n);");
    expect(patch.toString("utf8")).toContain("researchHeapPopMove(ply, n - i)");
    expect(patch.toString("utf8")).toContain(
      "if (scoreA != scoreB) return scoreA > scoreB;",
    );
    expect(patch.toString("utf8")).toContain(
      "return unchecked(researchHeapOrdinalBuf[base + a]) <",
    );
    expect(patch.toString("utf8")).toContain(
      "unchecked(moveBuf[base + a] = moveBuf[base + b]);",
    );
    expect(patch.toString("utf8")).toContain(
      "unchecked(moveScoreBuf[base + a] = moveScoreBuf[base + b]);",
    );
    expect(patch.toString("utf8")).not.toContain("researchHeapMoveBuf");
    expect(patch.toString("utf8")).not.toContain("researchHeapScoreBuf");
    expect(patch.toString("utf8")).not.toContain("beta - alpha == 1");
  });

  it("keeps the switch research-only, disabled by default, and threshold-bounded", () => {
    const root = process.cwd();
    const production = instantiate(
      readFileSync(
        join(
          root,
          "src",
          "components",
          "game",
          "ShogiImproved",
          "wasm",
          "shogi.wasm",
        ),
      ),
    ) as WebAssembly.Exports & {
      setResearchLazyMovePicker?: (flag: number, minMoves: number) => void;
    };
    const research = instantiate(
      readFileSync(
        join(
          root,
          "wasm-spike",
          "artifacts",
          "shogi-lazy-move-picker-research.wasm",
        ),
      ),
    ) as WebAssembly.Exports & {
      setResearchLazyMovePicker(flag: number, minMoves: number): void;
      getResearchLazyMovePickerEnabled(): number;
      getResearchLazyMovePickerMinMoves(): number;
      getResearchLazyMovePickerNodes(): number;
    };

    expect(production.setResearchLazyMovePicker).toBeUndefined();
    expect(research.getResearchLazyMovePickerEnabled()).toBe(0);
    expect(research.getResearchLazyMovePickerMinMoves()).toBe(64);
    expect(research.getResearchLazyMovePickerNodes()).toBe(0);

    research.setResearchLazyMovePicker(1, 1);
    expect(research.getResearchLazyMovePickerEnabled()).toBe(1);
    expect(research.getResearchLazyMovePickerMinMoves()).toBe(2);
    research.setResearchLazyMovePicker(0, 1_000);
    expect(research.getResearchLazyMovePickerEnabled()).toBe(0);
    expect(research.getResearchLazyMovePickerMinMoves()).toBe(640);
  });
});
