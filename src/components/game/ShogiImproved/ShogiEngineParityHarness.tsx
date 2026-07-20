"use client";

import { useEffect, useState } from "react";

import { GenerateMovesImproved } from "./GenerateMovesImproved";
import { InitialPositionImproved } from "./InitialPositionImproved";
import { KyokumenImproved } from "./KyokumenImproved";
import {
  canonicalShogiEngineParityJson,
  SHOGI_ENGINE_PARITY_FIXTURE,
  SHOGI_ENGINE_PARITY_HARNESS_SCHEMA,
  SHOGI_ENGINE_PARITY_TEST_ID,
  type ShogiEngineParityFailureCode,
  type ShogiEngineParityHarnessResult,
} from "./shogiEngineParityProtocol";
import {
  createShogiAiWorkerClient,
  type BestMoveInfo,
  type SerializedKyokumenImproved,
  type SerializedTeImproved,
  type ShogiAiEngineDiagnostics,
} from "./shogiAiWorkerClient";
import { GOTE } from "./types";

function buildFixture(): {
  readonly position: KyokumenImproved;
  readonly serialized: SerializedKyokumenImproved;
} {
  const position = new KyokumenImproved();
  InitialPositionImproved.setupBishopHandicap(position);
  position.setTeban(GOTE);

  const board: number[] = [];
  for (let suji = 1; suji <= 9; suji++) {
    for (let dan = 1; dan <= 9; dan++) {
      board.push(position.ban[(suji << 4) + dan]);
    }
  }
  return {
    position,
    serialized: {
      board,
      hand: [...position.hand],
      teban: position.teban,
    },
  };
}

function isLegalWorkerMove(
  position: KyokumenImproved,
  move: SerializedTeImproved,
): boolean {
  return GenerateMovesImproved.generateLegalMoves(position).some(
    (legal) =>
      legal.koma === move.koma &&
      legal.from === move.from &&
      legal.to === move.to &&
      legal.promote === move.promote,
  );
}

type MutableHarnessObservation = {
  schema: ShogiEngineParityHarnessResult["schema"];
  fixture: ShogiEngineParityHarnessResult["fixture"];
  environment: {
    cross_origin_isolated: boolean;
    shared_array_buffer: boolean;
  };
  execution: {
    worker_response: boolean;
    legal_result: boolean;
    search_path: string;
    evaluation_path: string;
  };
  nnue: {
    fetch_status: string;
    fetched_weights: ShogiEngineParityHarnessResult["nnue"]["fetched_weights"];
    loaded: boolean;
    enabled: boolean;
  };
  runtime_wasm: {
    ready: boolean;
    embedded: ShogiEngineParityHarnessResult["runtime_wasm"]["embedded"];
  };
};

function baseResult(): MutableHarnessObservation {
  return {
    schema: SHOGI_ENGINE_PARITY_HARNESS_SCHEMA,
    fixture: SHOGI_ENGINE_PARITY_FIXTURE,
    environment: {
      cross_origin_isolated: self.crossOriginIsolated === true,
      shared_array_buffer: typeof SharedArrayBuffer !== "undefined",
    },
    execution: {
      worker_response: false,
      legal_result: false,
      search_path: "unavailable",
      evaluation_path: "unavailable",
    },
    nnue: {
      fetch_status: "unavailable",
      fetched_weights: null,
      loaded: false,
      enabled: false,
    },
    runtime_wasm: {
      ready: false,
      embedded: null,
    },
  };
}

/**
 * Deliberately unlinked diagnostics UI. The server mounts this component only
 * for one exact query string; ordinary `/games/shogi` renders the game instead.
 */
export function ShogiEngineParityHarness() {
  const [result, setResult] = useState<ShogiEngineParityHarnessResult | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    const client = createShogiAiWorkerClient();

    const publishFailure = (
      failureCode: ShogiEngineParityFailureCode,
      partial: MutableHarnessObservation,
    ): void => {
      if (!cancelled) {
        setResult({
          ...partial,
          status: "fail",
          failure_code: failureCode,
        });
      }
    };

    void (async () => {
      const fixture = buildFixture();
      const observed = baseResult();
      let bestMove: BestMoveInfo;
      try {
        bestMove = await client.requestBestMoveWithInfo(
          fixture.serialized,
          "hard",
          0,
        );
      } catch {
        publishFailure("worker-request-failed", observed);
        return;
      }
      if (cancelled) return;
      observed.execution.worker_response = true;
      observed.execution.search_path = bestMove.searchPath;
      if (bestMove.move === null) {
        publishFailure("worker-returned-no-move", observed);
        return;
      }
      observed.execution.legal_result = isLegalWorkerMove(
        fixture.position,
        bestMove.move,
      );
      if (!observed.execution.legal_result) {
        publishFailure("worker-returned-illegal-move", observed);
        return;
      }
      if (bestMove.searchPath !== "wasm") {
        publishFailure("worker-search-path-differed", observed);
        return;
      }

      let diagnostics: ShogiAiEngineDiagnostics;
      try {
        diagnostics = await client.requestEngineDiagnostics();
      } catch {
        publishFailure("worker-diagnostics-failed", observed);
        return;
      }
      observed.execution.evaluation_path =
        diagnostics.lastSearch?.evaluationPath ?? "unavailable";
      observed.nnue.fetch_status = diagnostics.nnue.fetchStatus;
      observed.nnue.fetched_weights = diagnostics.nnue.fetchedWeights;
      observed.nnue.loaded = diagnostics.nnue.loaded;
      observed.nnue.enabled = diagnostics.nnue.enabled;
      observed.runtime_wasm.ready = diagnostics.wasm.ready;
      observed.runtime_wasm.embedded = diagnostics.wasm.embedded;

      if (diagnostics.lastSearch?.searchPath !== "wasm") {
        publishFailure("worker-search-path-differed", observed);
      } else if (diagnostics.lastSearch?.evaluationPath !== "nnue-wasm") {
        publishFailure("worker-evaluation-path-differed", observed);
      } else if (
        diagnostics.nnue.fetchStatus !== "loaded" ||
        !diagnostics.nnue.fetchedWeights ||
        !diagnostics.nnue.loaded ||
        !diagnostics.nnue.enabled
      ) {
        publishFailure("nnue-not-loaded-and-enabled", observed);
      } else if (!diagnostics.wasm.ready) {
        publishFailure("runtime-wasm-not-ready", observed);
      } else if (!cancelled) {
        setResult({
          ...observed,
          status: "pass",
          failure_code: null,
        });
      }
    })();

    return () => {
      cancelled = true;
      client.terminate();
    };
  }, []);

  return (
    <output
      hidden
      data-testid={SHOGI_ENGINE_PARITY_TEST_ID}
      data-status={result?.status ?? "running"}
    >
      {result === null ? "" : canonicalShogiEngineParityJson(result)}
    </output>
  );
}

export const __shogiEngineParityHarnessForTests = {
  buildFixture,
  isLegalWorkerMove,
};
