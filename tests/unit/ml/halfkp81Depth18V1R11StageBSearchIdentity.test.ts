import { describe, expect, it } from "vitest";

import { parseHalfkp81V1R11Depth18SearchIdentity } from "../../../ml/halfkp81-depth18-v1r11-stage-b-search-identity";
import type { UsiMultiPvResult } from "../../../ml/usi-multipv";

describe("HalfKP81 v1r11 typed Stage-B depth18 identity", () => {
  it("reads the real USI scoreKind field and preserves the exact cp result", () => {
    const result = {
      depth: 18,
      bestmove: "6h5i",
      observedNodes: 42_001,
      lines: [
        {
          depth: 18,
          multipv: 1,
          cp: 73,
          nodes: 42_001,
          move: "6h5i",
          pv: ["6h5i", "4a5b"],
          scoreKind: "cp",
        },
      ],
    } satisfies Readonly<UsiMultiPvResult>;

    expect(
      parseHalfkp81V1R11Depth18SearchIdentity(result, "6h5i"),
    ).toEqual({
      bestmove: "6h5i",
      depth: 18,
      moves: ["6h5i"],
      observed_nodes: 42_001,
      requested_multipv: 1,
      scores: [{ cp: 73, move: "6h5i", score_kind: "cp" }],
    });
  });

  it("rejects mate/non-cp lines instead of publishing a fake cp label", () => {
    const mateResult = {
      depth: 18,
      bestmove: "6h5i",
      observedNodes: 42_001,
      lines: [
        {
          depth: 18,
          multipv: 1,
          cp: 0,
          nodes: 42_001,
          move: "6h5i",
          pv: ["6h5i"],
          scoreKind: "mate",
          mate: 3,
          mateSign: 1,
        },
      ],
    } satisfies Readonly<UsiMultiPvResult>;

    expect(() =>
      parseHalfkp81V1R11Depth18SearchIdentity(mateResult, "6h5i"),
    ).toThrow(/exact depth18 search differs/u);
  });
});
