import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { describe, expect, it } from "vitest";

type Arm = "production" | "currentHeap" | "packedHeap";
type Category = "opening" | "middlegame" | "dropHeavy" | "checkEvasion";

interface Block {
  arm: Arm;
  elapsedMs: number;
  work: number;
  lazyNodes: number;
}

interface TimingRow {
  category: Category;
  blocks: Block[];
  packedVsProductionPct: number;
  packedVsCurrentHeapPct: number;
  packedVsProductionWallRegressionPct: number;
}

const RAW_ARCHIVE_IDENTITY = {
  bytes: 306_864,
  sha256: "c9a1927ceac6bc6a56f9bc1c702b778199f1c0c1c6b27e59d33a33ab0c60d3c1",
};
const SOURCE_RAW_IDENTITY = {
  bytes: 286_144,
  sha256: "6dd953f6654c40dfc53f37dd3b5c7ddfd8658a55bcf79b6e6093da4b866c951f",
};

function read(...parts: string[]): Buffer {
  return readFileSync(join(process.cwd(), ...parts));
}

function identity(bytes: Uint8Array): { bytes: number; sha256: string } {
  return {
    bytes: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function percentile(values: number[], quantile: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(quantile * sorted.length) - 1];
}

function armTotals(rows: TimingRow[], arm: Arm) {
  const blocks = rows.flatMap((row) =>
    row.blocks.filter((block) => block.arm === arm),
  );
  const elapsedMs = blocks.reduce((sum, block) => sum + block.elapsedMs, 0);
  const work = blocks.reduce((sum, block) => sum + block.work, 0);
  return {
    blocks: blocks.length,
    elapsedMs,
    work,
    nps: (work * 1_000) / elapsedMs,
    lazyNodes: blocks.reduce((sum, block) => sum + block.lazyNodes, 0),
  };
}

function aggregatePair(
  rows: TimingRow[],
  baseline: Arm,
  candidate: Arm,
): number {
  const base = armTotals(rows, baseline);
  const next = armTotals(rows, candidate);
  return (next.nps / base.nps - 1) * 100;
}

function findAbsoluteStrings(value: unknown, output: string[] = []): string[] {
  if (Array.isArray(value)) {
    value.forEach((item) => findAbsoluteStrings(item, output));
  } else if (value !== null && typeof value === "object") {
    Object.values(value).forEach((item) => findAbsoluteStrings(item, output));
  } else if (typeof value === "string" && isAbsolute(value)) {
    output.push(value);
  }
  return output;
}

describe("packed heap real-search tuning evidence", () => {
  const archiveBytes = read(
    "docs",
    "data",
    "shogi-packed-heap-real-search-tuning-raw-2026-07-25.json",
  );
  const archive = JSON.parse(archiveBytes.toString("utf8"));
  const report = archive.report;
  const summary = JSON.parse(
    read(
      "docs",
      "data",
      "shogi-packed-heap-real-search-tuning-2026-07-25.json",
    ).toString("utf8"),
  );
  const rows = report.throughput.rows as TimingRow[];

  it("pins the complete raw archive and preserves the source identity", () => {
    expect(identity(archiveBytes)).toEqual(RAW_ARCHIVE_IDENTITY);
    expect(archive.archiveSchema).toBe(
      "shogi-packed-heap-tuning-report-archive-v1",
    );
    expect(archive.source).toEqual({
      basename: "result.json",
      ...SOURCE_RAW_IDENTITY,
    });
    expect(archive.sanitization.rewrittenAbsolutePaths).toBe(5);
    expect(findAbsoluteStrings(archive)).toEqual([]);
  });

  it("recomputes three-arm parity, activation, and equal work from raw rows", () => {
    expect(report.fixedDepth.rows).toHaveLength(64);
    expect(rows).toHaveLength(64);
    expect(
      report.fixedDepth.rows.filter(
        (row: { exact: boolean }) => row.exact !== true,
      ),
    ).toHaveLength(0);

    const activation = report.fixedDepth.rows.reduce(
      (
        totals: Record<Category, number>,
        row: {
          category: Category;
          packedHeap: { lazyNodes: number };
        },
      ) => {
        totals[row.category] += row.packedHeap.lazyNodes;
        return totals;
      },
      { opening: 0, middlegame: 0, dropHeavy: 0, checkEvasion: 0 },
    );
    expect(activation).toEqual({
      opening: 5_411,
      middlegame: 2_923,
      dropHeavy: 100_391,
      checkEvasion: 168_931,
    });
    expect(
      Object.values(activation).reduce((sum, value) => sum + value, 0),
    ).toBe(277_656);

    const production = armTotals(rows, "production");
    const currentHeap = armTotals(rows, "currentHeap");
    const packedHeap = armTotals(rows, "packedHeap");
    expect(production.blocks).toBe(256);
    expect(currentHeap.blocks).toBe(256);
    expect(packedHeap.blocks).toBe(256);
    expect(production.work).toBe(42_582_768);
    expect(currentHeap.work).toBe(production.work);
    expect(packedHeap.work).toBe(production.work);
    expect(currentHeap.lazyNodes).toBe(1_165_888);
    expect(packedHeap.lazyNodes).toBe(1_165_888);
  });

  it("recomputes every aggregate, category, and promotion gate", () => {
    const kpAggregate = aggregatePair(rows, "production", "packedHeap");
    const khAggregate = aggregatePair(rows, "currentHeap", "packedHeap");
    const kpMedian = median(rows.map((row) => row.packedVsProductionPct));
    const khMedian = median(rows.map((row) => row.packedVsCurrentHeapPct));
    const kpP90 = percentile(
      rows.map((row) => row.packedVsProductionWallRegressionPct),
      0.9,
    );

    expect(kpAggregate).toBeCloseTo(6.847911662228889, 12);
    expect(khAggregate).toBeCloseTo(0.38079545034153117, 12);
    expect(kpMedian).toBeCloseTo(5.809171818412063, 12);
    expect(khMedian).toBeCloseTo(0.2635625262927488, 12);
    expect(kpP90).toBeCloseTo(0.03667813389585106, 12);

    const expectedCategories = {
      opening: [2.6438033116486404, -0.05580833937880447],
      middlegame: [2.6112377428926914, 0.37071262335712785],
      dropHeavy: [7.667986760198153, 0.5235777688199716],
      checkEvasion: [6.82543832484277, 0.3364952985994485],
    } as const;
    for (const category of Object.keys(expectedCategories) as Category[]) {
      const categoryRows = rows.filter((row) => row.category === category);
      expect(categoryRows).toHaveLength(16);
      expect(
        aggregatePair(categoryRows, "production", "packedHeap"),
      ).toBeCloseTo(expectedCategories[category][0], 12);
      expect(
        aggregatePair(categoryRows, "currentHeap", "packedHeap"),
      ).toBeCloseTo(expectedCategories[category][1], 12);
    }

    expect(report.gates).toEqual({
      exact64: true,
      nonVacuousEveryCategory: true,
      packedVsProductionAggregate: false,
      packedVsProductionMedian: true,
      packedVsProductionP90Wall: true,
      packedVsProductionCategories: true,
      packedVsCurrentHeapAggregate: false,
      packedVsCurrentHeapMedian: true,
      packedVsCurrentHeapCategories: true,
      technicalFaultsZero: true,
    });
    expect(report.status).toBe("fail");
    expect(report.decision).toBe(
      "reject-packed-key-candidate-no-v3-no-match-no-production-change",
    );
  });

  it("records timing limitations and forbids unsupported strength or live claims", () => {
    const blocks = rows.flatMap((row) => row.blocks);
    expect(blocks).toHaveLength(768);
    expect(blocks.filter((block) => block.elapsedMs < 25)).toHaveLength(142);
    expect(Math.min(...blocks.map((block) => block.elapsedMs))).toBeCloseTo(
      20.311583000009705,
      12,
    );

    expect(summary.status).toBe("rejected-live-unchanged");
    expect(summary.gates.overall).toBe(false);
    expect(summary.measurementCaveats.realizedBlocksBelow25Ms).toBe(142);
    expect(summary.claimBoundary.formalEvidenceEligible).toBe(false);
    expect(summary.claimBoundary.strengthGainProved).toBe(false);
    expect(summary.claimBoundary.productionWasmChanged).toBe(false);
    expect(summary.claimBoundary.liveNnueWeightsChanged).toBe(false);
    expect(summary.nextAction.freshV3Authorized).toBe(false);
    expect(summary.nextAction.fixedTimeMatchAuthorized).toBe(false);
    expect(summary.nextAction.productionPromotionAuthorized).toBe(false);
  });

  it("pins all decision-critical inputs and confirms production stayed unchanged", () => {
    for (const item of Object.values(summary.identities) as Array<{
      path: string;
      bytes: number;
      sha256: string;
    }>) {
      if (item.path.startsWith("$HOME/")) continue;
      expect(identity(read(...item.path.split("/")))).toEqual({
        bytes: item.bytes,
        sha256: item.sha256,
      });
    }
    expect(summary.identities.archivedRawReport).toEqual({
      path: "docs/data/shogi-packed-heap-real-search-tuning-raw-2026-07-25.json",
      ...RAW_ARCHIVE_IDENTITY,
    });
  });
});
