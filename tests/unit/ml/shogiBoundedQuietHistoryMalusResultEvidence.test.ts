import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  analyzeSearchWasmScreen,
  validateSearchWasmPlan,
} from "../../../wasm-spike/match-search-wasm-vs-production";

type JsonRecord = Record<string, any>;

const root = process.cwd();

function readJson(path: string): JsonRecord {
  return JSON.parse(readFileSync(join(root, path), "utf8")) as JsonRecord;
}

function identity(path: string) {
  const bytes = readFileSync(join(root, path));
  return {
    bytes: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

describe("bounded quiet-history malus result evidence", () => {
  const evidence = readJson(
    "docs/data/shogi-bounded-quiet-history-malus-result-2026-07-25.json",
  );
  const plan = readJson(
    "ml/protocols/bounded-quiet-history-malus-v1-plan.json",
  );
  const raw = readJson(
    "docs/data/shogi-bounded-quiet-history-malus-raw-2026-07-25.json",
  );

  it("binds the result to the merged preregistration and exact assets", () => {
    expect(evidence.preregistration).toMatchObject({
      planId: plan.plan_id,
      planStatus: "fixed-and-merged-before-formal-gate-and-direct-play",
      pullRequest: 623,
      mergeCommit: "07f623c89d70df51fae802de500f030e5d652268",
    });
    expect(identity(evidence.preregistration.identity.path)).toEqual({
      bytes: evidence.preregistration.identity.bytes,
      sha256: evidence.preregistration.identity.sha256,
    });
    expect(identity(evidence.rawEvidence.path)).toEqual({
      bytes: evidence.rawEvidence.bytes,
      sha256: evidence.rawEvidence.sha256,
    });

    for (const asset of Object.values(evidence.assets) as JsonRecord[]) {
      expect(identity(asset.path)).toEqual({
        bytes: asset.bytes,
        sha256: asset.sha256,
      });
    }
    expect(plan.pinned_inputs.immutable_live_weights).toMatchObject(
      evidence.assets.liveWeights,
    );
    expect(plan.pinned_inputs.production_wasm).toMatchObject(
      evidence.assets.productionWasm,
    );
    expect(plan.planned_research_artifacts.research_wasm).toMatchObject(
      evidence.assets.candidateResearchWasm,
    );
  });

  it("records a passing non-strength correctness gate", () => {
    const correctness = evidence.correctness;
    expect(correctness).toMatchObject({
      status: "passed-direct-play-authorized-live-change-not-authorized",
      cases: 64,
      fixedDepth: 5,
      quiescenceDepth: 8,
      strengthMetric: false,
      directPlayAuthorized: true,
      liveChangeAuthorized: false,
    });
    expect(correctness.totals).toEqual({
      cutoffs: 30_361,
      rewards: 30_361,
      maluses: 28_421,
      mainUpdates: 58_782,
      continuationUpdates: 58_782,
      storedPeak: 32,
      storageDrops: 3_993_221,
      maxAbsMain: 14_907,
      maxAbsContinuation: 9_312,
      nonQuietViolations: 0,
    });
    expect(Object.values(correctness.gates)).toEqual(
      expect.arrayContaining([true]),
    );
    expect(Object.values(correctness.gates).every(Boolean)).toBe(true);
    expect(correctness.totals.maxAbsMain).toBeLessThanOrEqual(16_384);
    expect(correctness.totals.maxAbsContinuation).toBeLessThanOrEqual(16_384);
  });

  it("recomputes the observed score and preregistered futility stop", () => {
    const direct = evidence.directPlay;
    const outcome = direct.outcome;
    const byPair = direct.candidateHalfpointsByPlannedPairIndex as Array<
      number | null
    >;
    const completed = byPair.filter((value): value is number => value !== null);
    const missingGames =
      (direct.configuration.plannedPairs - completed.length) *
      direct.configuration.gamesPerPair;

    expect(byPair).toHaveLength(direct.configuration.plannedPairs);
    expect(completed).toHaveLength(outcome.completedPairs);
    expect(completed.reduce((sum, value) => sum + value, 0)).toBe(
      outcome.candidateHalfpoints,
    );
    expect(outcome.candidateWins * 2 + outcome.candidateDraws).toBe(
      outcome.candidateHalfpoints,
    );
    expect(
      outcome.candidateWins + outcome.candidateLosses + outcome.candidateDraws,
    ).toBe(outcome.completedGames);
    expect(outcome.observedHalfpointsDenominator).toBe(
      outcome.completedGames * 2,
    );
    expect(outcome.observedScoreRate).toBeCloseTo(
      outcome.candidateHalfpoints / outcome.observedHalfpointsDenominator,
      15,
    );

    const maximum = outcome.candidateHalfpoints + missingGames * 2;
    expect(maximum).toBe(outcome.maximumPossibleFinalHalfpoints);
    expect(maximum).toBe(61);
    expect(maximum).toBeLessThan(direct.configuration.passHalfpoints);
    expect(outcome.shortfallEvenIfAllRemainingGamesWon).toBe(
      direct.configuration.passHalfpoints - maximum,
    );
    expect(outcome.missingPairIndices).toEqual([23, 27]);
    expect(direct.status).toBe("REJECTED-futility");
    expect(direct.strengthConclusionAllowed).toBe(true);
  });

  it("replays the formal decision from all 26 authenticated raw pair receipts", () => {
    const manifest = validateSearchWasmPlan(plan.execution_manifest);
    const recomputed = analyzeSearchWasmScreen(
      manifest,
      evidence.preregistration.identity.sha256,
      raw.pairs,
    );

    expect(raw.archiveSchema).toBe(
      "shogi-bounded-quiet-history-malus-raw-evidence-v1",
    );
    expect(raw.pairs).toHaveLength(26);
    expect(recomputed).toEqual(raw.result);
    expect(raw.result).toMatchObject({
      status: evidence.directPlay.status,
      candidate_wins: evidence.directPlay.outcome.candidateWins,
      candidate_losses: evidence.directPlay.outcome.candidateLosses,
      candidate_draws: evidence.directPlay.outcome.candidateDraws,
      candidate_halfpoints: evidence.directPlay.outcome.candidateHalfpoints,
      missing_pairs: evidence.directPlay.outcome.missingPairIndices,
      result_sha256: evidence.directPlay.resultArtifact.embeddedResultSha256,
    });
    expect(raw.correctness.all_gates_passed).toBe(true);
    expect(raw.run.deadline_at_ms - raw.run.started_at_ms).toBe(
      evidence.directPlay.timing.wallClockLimitSeconds * 1_000,
    );
  });

  it("preserves complete pair summaries and clean integrity counters", () => {
    const direct = evidence.directPlay;
    const receipts = direct.completedPairReceiptSha256 as string[];
    const distribution = direct.pairOutcomeCountsByCandidateHalfpoints;
    const pairs = raw.pairs as JsonRecord[];
    const games = pairs.flatMap((pair) => pair.games as JsonRecord[]);
    const byPlannedPair = Array.from(
      { length: direct.configuration.plannedPairs },
      () => null as number | null,
    );
    const byColor = {
      sente: { wins: 0, losses: 0, draws: 0 },
      gote: { wins: 0, losses: 0, draws: 0 },
    };
    const terminations = {
      noLegalMoves: 0,
      perpetualCheck: 0,
      fourfoldRepetition: 0,
    };

    for (const pair of pairs) {
      byPlannedPair[pair.pair_index] = pair.candidate_halfpoints;
    }
    for (const game of games) {
      const color = byColor[game.candidate_color as "sente" | "gote"];
      if (game.candidate_result === "win") color.wins += 1;
      else if (game.candidate_result === "loss") color.losses += 1;
      else color.draws += 1;

      if (game.termination === "no-legal-moves") {
        terminations.noLegalMoves += 1;
      } else if (game.termination === "perpetual-check") {
        terminations.perpetualCheck += 1;
      } else if (game.termination === "fourfold-repetition") {
        terminations.fourfoldRepetition += 1;
      } else {
        throw new Error(`unexpected termination: ${game.termination}`);
      }
    }

    expect(receipts).toHaveLength(direct.outcome.completedPairs);
    expect(new Set(receipts).size).toBe(receipts.length);
    for (const receipt of receipts) {
      expect(receipt).toMatch(/^[0-9a-f]{64}$/u);
    }
    expect(
      Object.values(distribution).reduce(
        (sum: number, count) => sum + Number(count),
        0,
      ),
    ).toBe(direct.outcome.completedPairs);
    expect(distribution).toEqual({
      "0": 4,
      "1": 1,
      "2": 16,
      "3": 0,
      "4": 5,
    });
    expect(
      pairs.reduce(
        (counts, pair) => ({
          ...counts,
          [pair.candidate_halfpoints]:
            counts[String(pair.candidate_halfpoints)] + 1,
        }),
        { "0": 0, "1": 0, "2": 0, "3": 0, "4": 0 } as Record<string, number>,
      ),
    ).toEqual(distribution);
    expect(byPlannedPair).toEqual(direct.candidateHalfpointsByPlannedPairIndex);
    expect(pairs.map((pair) => pair.receipt_sha256)).toEqual(receipts);
    expect(byColor).toEqual(direct.candidateResultsByColor);
    expect(terminations).toEqual(direct.integrity.terminationCounts);
    expect(games.reduce((sum, game) => sum + game.plies, 0)).toBe(
      direct.integrity.totalPlies,
    );
    expect(games.reduce((sum, game) => sum + game.legal_moves_checked, 0)).toBe(
      direct.integrity.totalLegalMovesChecked,
    );
    expect(new Set(pairs.map((pair) => pair.opening_fingerprint)).size).toBe(
      direct.integrity.completedOpeningFingerprintsUnique,
    );
    expect(direct.integrity).toMatchObject({
      technicalFaultCount: 0,
      allObservedMovesLegal: true,
      allObservedOpeningsUnique: true,
      completedOpeningFingerprintsUnique: 26,
      totalPlies: 6_361,
      totalLegalMovesChecked: 6_049,
    });
    expect(direct.timing.wallClockExpired).toBe(false);
    expect(direct.timing.elapsedSeconds).toBeLessThan(
      direct.timing.wallClockLimitSeconds,
    );
  });

  it("rejects promotion without claiming a proven regression or changing live", () => {
    expect(evidence.status).toBe(
      "rejected-mathematical-futility-live-unchanged",
    );
    expect(evidence.decision).toMatchObject({
      value: "reject-no-independent-96-game-confirmation-no-live-change",
      candidateEligibleForIndependent96GameConfirmation: false,
      candidateEligibleForLivePromotion: false,
    });
    expect(evidence.live).toEqual({
      weightsChanged: false,
      productionSearchChanged: false,
      deploymentRun: false,
    });
    expect(evidence.claimBoundary).toEqual({
      implementationCorrectnessPassed: true,
      playingStrengthMeasured: true,
      playingStrengthGainProved: false,
      playingStrengthRegressionProved: false,
      candidatePromoted: false,
      liveChanged: false,
    });
  });
});
