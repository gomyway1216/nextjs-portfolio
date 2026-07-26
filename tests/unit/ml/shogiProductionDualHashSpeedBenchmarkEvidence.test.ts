import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const rawPath =
  "docs/data/shogi-production-dual-hash-speed-benchmark-raw-2026-07-26.json";
const resultPath =
  "docs/data/shogi-production-dual-hash-speed-benchmark-result-2026-07-26.json";

function read(path: string): Buffer {
  return readFileSync(join(root, path));
}

function identity(bytes: Uint8Array) {
  return {
    bytes: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

function nearestRank(values: readonly number[], probability: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[
    Math.min(sorted.length - 1, Math.ceil(probability * sorted.length) - 1)
  ];
}

describe("production dual-hash exact-binary speed evidence", () => {
  const rawBytes = read(rawPath);
  const raw = JSON.parse(rawBytes.toString("utf8"));
  const result = JSON.parse(read(resultPath).toString("utf8"));

  it("authenticates the runner, final binary, baseline snapshot, and weights", () => {
    expect(identity(read(raw.provenance.reproductionRunner.path))).toEqual({
      bytes: raw.provenance.reproductionRunner.bytes,
      sha256: raw.provenance.reproductionRunner.sha256,
    });
    expect(identity(read(raw.assets.final.path))).toEqual({
      bytes: raw.assets.final.bytes,
      sha256: raw.assets.final.sha256,
    });
    const envelope = read(raw.assets.baseline.snapshotPath);
    expect(identity(envelope)).toEqual({
      bytes: raw.assets.baseline.envelopeBytes,
      sha256: raw.assets.baseline.envelopeSha256,
    });
    expect(identity(Buffer.from(envelope.toString("utf8").trim(), "base64"))).toEqual(
      {
        bytes: raw.assets.baseline.decodedBytes,
        sha256: raw.assets.baseline.decodedSha256,
      },
    );
    expect(identity(read(raw.assets.weights.path))).toEqual({
      bytes: raw.assets.weights.bytes,
      sha256: raw.assets.weights.sha256,
    });
    expect(identity(read(raw.assets.holdout.path))).toEqual({
      bytes: raw.assets.holdout.bytes,
      sha256: raw.assets.holdout.sha256,
    });
  });

  it("recomputes every paired ratio, aggregate, median, range, and wall metric", () => {
    expect(raw.blocks).toHaveLength(12);
    expect(raw.blocks.filter((block: { arm: string }) => block.arm === "final"))
      .toHaveLength(6);
    expect(
      raw.blocks.filter(
        (block: { arm: string }) => block.arm === "baseline",
      ),
    ).toHaveLength(6);

    const paired = Array.from({ length: 6 }, (_, pair) => {
      const selected = raw.blocks.filter(
        (block: { pair: number }) => block.pair === pair,
      );
      const baseline = selected.find(
        (block: { arm: string }) => block.arm === "baseline",
      );
      const final = selected.find(
        (block: { arm: string }) => block.arm === "final",
      );
      return {
        pair,
        finalToBaselineThroughput:
          final.throughput / baseline.throughput,
        finalToBaselineWall: final.elapsedMs / baseline.elapsedMs,
      };
    });
    expect(paired).toEqual(raw.paired);

    const aggregate = (arm: string) => {
      const blocks = raw.blocks.filter(
        (block: { arm: string }) => block.arm === arm,
      );
      return (
        blocks.reduce(
          (sum: number, block: { work: number }) => sum + block.work,
          0,
        ) /
        blocks.reduce(
          (sum: number, block: { elapsedMs: number }) =>
            sum + block.elapsedMs,
          0,
        )
      );
    };
    const ratios = paired.map((pair) => pair.finalToBaselineThroughput);
    const walls = paired.map((pair) => pair.finalToBaselineWall - 1);
    expect(aggregate("baseline")).toBe(
      raw.observed.aggregateBaselineThroughput,
    );
    expect(aggregate("final")).toBe(raw.observed.aggregateFinalThroughput);
    expect(aggregate("final") / aggregate("baseline")).toBe(
      raw.observed.aggregateFinalToBaselineThroughput,
    );
    expect(nearestRank(ratios, 0.5)).toBe(
      raw.observed.robustMedianFinalToBaselineThroughput,
    );
    expect(Math.min(...ratios)).toBe(
      raw.observed.minimumFinalToBaselineThroughput,
    );
    expect(Math.max(...ratios)).toBe(
      raw.observed.maximumFinalToBaselineThroughput,
    );
    expect(nearestRank(walls, 0.9)).toBe(raw.observed.p90WallRegression);
  });

  it("records the one intended legal collision-correction decision separately", () => {
    expect(raw.correctness.exactDecisionCases).toBe(63);
    expect(raw.correctness.totalCases).toBe(64);
    expect(raw.correctness.matchingCaseIds).toHaveLength(63);
    expect(raw.correctness.differingCases).toEqual([
      expect.objectContaining({
        id: "checkEvasion-06",
        baseline: expect.objectContaining({ key: 1414616, score: -880 }),
        final: expect.objectContaining({ key: 1709528, score: -943 }),
        formalResearchCrossCheck: expect.objectContaining({
          onDeterministic: true,
          onLegal: true,
        }),
      }),
    ]);
  });

  it("binds the summary to the raw bytes without making a strength claim", () => {
    expect(identity(rawBytes)).toEqual({
      bytes: result.rawEvidence.bytes,
      sha256: result.rawEvidence.sha256,
    });
    expect(result.observed.robustMedianFinalToBaselineThroughput).toBe(
      raw.observed.robustMedianFinalToBaselineThroughput,
    );
    expect(result.observed.minimumMeasuredFinalToBaselineThroughput).toBe(
      raw.observed.minimumFinalToBaselineThroughput,
    );
    expect(result.observed.memoryDeltaBytes).toBe(
      raw.observed.memoryDeltaBytes,
    );
    expect(raw.claimBoundary.strengthMetric).toBe(false);
    expect(raw.claimBoundary.browserHostMeasured).toBe(false);
    expect(raw.claimBoundary.sharedTtMeasured).toBe(false);
    expect(result.existingSealedEvidenceChanged).toBe(false);
  });
});
