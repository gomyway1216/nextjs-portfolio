import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const evidencePath =
  "docs/data/shogi-production-dual-hash-integration-2026-07-26.json";
const japaneseArticlePath =
  "docs/blog-shogi-production-dual-hash-integration.md";
const englishArticlePath =
  "docs/blog-shogi-production-dual-hash-integration.en.md";
const speedRawPath =
  "docs/data/shogi-production-dual-hash-speed-benchmark-raw-2026-07-26.json";
const speedResultPath =
  "docs/data/shogi-production-dual-hash-speed-benchmark-result-2026-07-26.json";

function read(relativePath: string): Buffer {
  return readFileSync(join(root, relativePath));
}

function identity(bytes: Uint8Array): {
  bytes: number;
  sha256: string;
} {
  return {
    bytes: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

describe("production dual-hash integration evidence", () => {
  const evidence = JSON.parse(read(evidencePath).toString("utf8"));

  it("content-addresses the exact production WASM, weights, and SBK2 asset", () => {
    expect(identity(read(evidence.productionAssets.wasm.path))).toEqual({
      bytes: evidence.productionAssets.wasm.bytes,
      sha256: evidence.productionAssets.wasm.sha256,
    });
    expect(identity(read(evidence.productionAssets.nnueWeights.path))).toEqual({
      bytes: evidence.productionAssets.nnueWeights.bytes,
      sha256: evidence.productionAssets.nnueWeights.sha256,
    });

    const book = read(evidence.productionAssets.openingBook.path);
    expect(identity(book)).toEqual({
      bytes: evidence.productionAssets.openingBook.bytes,
      sha256: evidence.productionAssets.openingBook.sha256,
    });
    expect(book.readUInt32LE(0)).toBe(0x324b4253);
    expect(book.readUInt32LE(4)).toBe(
      evidence.productionAssets.openingBook.positions,
    );
    expect(evidence.productionAssets.openingBook.positions).toBe(
      evidence.openingBookMigration.keptIndependentPairs,
    );
    expect(evidence.productionAssets.openingBook.format).toBe("SBK2");
    expect(evidence.productionAssets.openingBook.identity).toBe(
      "primary-30-bit-and-independent-secondary-32-bit-pair",
    );
  });

  it("binds the antecedent match without turning it into a final-binary strength claim", () => {
    const antecedent = JSON.parse(
      read(evidence.antecedentDirectPlay.evidencePath).toString("utf8"),
    );
    expect(evidence.antecedentDirectPlay).toMatchObject({
      completedPairs: antecedent.observed.completedPairs,
      completedGames: antecedent.observed.completedGames,
      candidateWins: antecedent.observed.candidateWins,
      candidateLosses: antecedent.observed.candidateLosses,
      candidateDraws: antecedent.observed.candidateDraws,
      technicalFaultCount: antecedent.observed.technicalFaultCount,
      candidateWasm: {
        bytes: antecedent.execution.candidateWasm.bytes,
        sha256: antecedent.execution.candidateWasm.sha256,
      },
      candidateIsByteIdenticalToIntegratedProductionWasm: false,
      strengthGainProven: false,
      highDanProven: false,
    });
    expect(evidence.claimBoundary.notSupported).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/gained Elo|stronger/u),
        expect.stringMatching(/stable high-dan/u),
        expect.stringMatching(/36,545-byte production WASM itself/u),
        expect.stringMatching(/live site already serves/u),
      ]),
    );
  });

  it("links the exact-binary speed diagnostic without turning it into strength evidence", () => {
    const diagnostic = evidence.finalBinarySpeedDiagnostic;
    expect(identity(read(diagnostic.resultEvidence.path))).toEqual({
      bytes: diagnostic.resultEvidence.bytes,
      sha256: diagnostic.resultEvidence.sha256,
    });
    expect(identity(read(diagnostic.rawEvidence.path))).toEqual({
      bytes: diagnostic.rawEvidence.bytes,
      sha256: diagnostic.rawEvidence.sha256,
    });
    expect(diagnostic).toMatchObject({
      robustMedianFinalToBaselineThroughput: 0.9968869903399259,
      memoryDeltaBytes: 0,
      grossDirectWasmRegressionObserved: false,
      strengthMetric: false,
      browserHostMeasured: false,
      sharedTtMeasured: false,
      promotionAuthority: false,
    });
  });

  it("keeps the Japanese and English articles cross-linked to each other and the evidence", () => {
    const japanese = read(japaneseArticlePath).toString("utf8");
    const english = read(englishArticlePath).toString("utf8");
    expect(japanese).toContain(
      "[English version](./blog-shogi-production-dual-hash-integration.en.md)",
    );
    expect(english).toContain(
      "[日本語版](./blog-shogi-production-dual-hash-integration.md)",
    );
    for (const article of [japanese, english]) {
      expect(article).toContain(
        "./data/shogi-production-dual-hash-integration-2026-07-26.json",
      );
      expect(article).toContain(
        "./data/shogi-production-dual-hash-speed-benchmark-result-2026-07-26.json",
      );
      expect(article).toMatch(/47[^0-9]+47[^0-9]+2/u);
      expect(article).toMatch(/not (?:prove|support)|証明ではない/u);
      expect(article).toContain(
        "./data/shogi-production-dual-hash-speed-benchmark-raw-2026-07-26.json",
      );
      expect(article).toContain(
        "./data/shogi-production-dual-hash-speed-benchmark-result-2026-07-26.json",
      );
      expect(article).toContain(
        "../wasm-spike/benchmark-production-dual-hash-vs-snapshot.ts",
      );
    }
  });

  it("binds the post-run speed diagnostic without granting it strength or deployment authority", () => {
    const rawBytes = read(speedRawPath);
    const raw = JSON.parse(rawBytes.toString("utf8"));
    const result = JSON.parse(read(speedResultPath).toString("utf8"));
    expect(identity(rawBytes)).toEqual({
      bytes: result.rawEvidence.bytes,
      sha256: result.rawEvidence.sha256,
    });
    expect(identity(read(result.reproductionRunner.path))).toEqual({
      bytes: result.reproductionRunner.bytes,
      sha256: result.reproductionRunner.sha256,
    });
    expect(raw.provenance.reproductionRunner).toEqual({
      path: result.reproductionRunner.path,
      bytes: result.reproductionRunner.bytes,
      sha256: result.reproductionRunner.sha256,
    });
    expect(result.comparison.final).toEqual({
      bytes: evidence.productionAssets.wasm.bytes,
      sha256: evidence.productionAssets.wasm.sha256,
    });
    expect(result.observed).toMatchObject({
      exactDecisionCases: raw.correctness.exactDecisionCases,
      totalDecisionCases: raw.correctness.totalCases,
      memoryDeltaBytes: raw.observed.memoryDeltaBytes,
      postflightAssetAuthenticationPassed: true,
    });
    expect(raw.correctness.differingCases).toHaveLength(1);
    const changed = raw.correctness.differingCases[0];
    expect(changed).toMatchObject({
      id: result.observed.changedDecision.id,
      formalResearchCrossCheck: {
        onDeterministic: true,
        onLegal: true,
      },
    });
    expect(raw.claimBoundary).toMatchObject({
      strengthMetric: false,
      deploymentAuthorized: false,
    });
    expect(result.claimBoundary.notSupported).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/stronger|Elo/u),
        expect.stringMatching(/authorizes merge|deployment/u),
      ]),
    );
  });
});
