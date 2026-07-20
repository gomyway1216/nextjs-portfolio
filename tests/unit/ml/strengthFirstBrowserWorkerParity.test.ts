import { describe, expect, it } from "vitest";

import {
  authenticateBrowserWorkerParityRequestForTests,
  BROWSER_WORKER_PARITY_REQUEST_SCHEMA,
  CANDIDATE_WEIGHTS_SCHEMA,
  isBrowserWorkerParityLoopbackUrlForTests,
  NNUE_WEIGHTS_BYTES,
  PRODUCTION_WASM_BYTES,
  PRODUCTION_WASM_PATH,
  PRODUCTION_WASM_SCHEMA,
  PRODUCTION_WASM_SHA256,
  validateBrowserWorkerHarnessObservationForTests,
  type BrowserWorkerParityArtifactIdentity,
} from "../../../ml/run-strength-first-browser-worker-parity";
import {
  SHOGI_ENGINE_PARITY_FIXTURE,
  SHOGI_ENGINE_PARITY_HARNESS_SCHEMA,
} from "../../../src/components/game/ShogiImproved/shogiEngineParityProtocol";

const SHIPPED_WEIGHTS_SHA256 =
  "e4e738f99fbd8685bcfe2700e4df364af6274e75b44b298432fc313b9a3e28dc";

const candidate: BrowserWorkerParityArtifactIdentity = {
  path: "public/shogi-nnue-weights.bin",
  bytes: NNUE_WEIGHTS_BYTES,
  sha256: SHIPPED_WEIGHTS_SHA256,
  schema: CANDIDATE_WEIGHTS_SCHEMA,
};

const wasm: BrowserWorkerParityArtifactIdentity = {
  path: PRODUCTION_WASM_PATH,
  bytes: PRODUCTION_WASM_BYTES,
  sha256: PRODUCTION_WASM_SHA256,
  schema: PRODUCTION_WASM_SCHEMA,
};

function request() {
  return {
    schema: BROWSER_WORKER_PARITY_REQUEST_SCHEMA,
    candidate_weights: { ...candidate },
    production_wasm: { ...wasm },
  };
}

function observation(): Record<string, unknown> {
  return {
    schema: SHOGI_ENGINE_PARITY_HARNESS_SCHEMA,
    status: "pass",
    fixture: SHOGI_ENGINE_PARITY_FIXTURE,
    environment: {
      cross_origin_isolated: true,
      shared_array_buffer: true,
    },
    execution: {
      worker_response: true,
      legal_result: true,
      search_path: "wasm",
      evaluation_path: "nnue-wasm",
    },
    nnue: {
      fetch_status: "loaded",
      fetched_weights: {
        bytes: candidate.bytes,
        sha256: candidate.sha256,
      },
      loaded: true,
      enabled: true,
    },
    runtime_wasm: {
      ready: true,
      embedded: {
        bytes: wasm.bytes,
        sha256: wasm.sha256,
      },
    },
    failure_code: null,
  };
}

describe("strength-first browser Worker parity request", () => {
  it("allows only the fixed loopback HTTP and same-host WebSocket boundary", () => {
    expect(
      isBrowserWorkerParityLoopbackUrlForTests("http://127.0.0.1:3000/a"),
    ).toBe(true);
    expect(
      isBrowserWorkerParityLoopbackUrlForTests("ws://127.0.0.1:3000/_next/webpack-hmr"),
    ).toBe(true);
    expect(
      isBrowserWorkerParityLoopbackUrlForTests("http://localhost:3000/a"),
    ).toBe(false);
    expect(
      isBrowserWorkerParityLoopbackUrlForTests("http://127.0.0.1:3001/a"),
    ).toBe(false);
    expect(
      isBrowserWorkerParityLoopbackUrlForTests("https://127.0.0.1:3000/a"),
    ).toBe(false);
  });

  it("authenticates the explicit local artifact and exact production WASM", () => {
    expect(
      authenticateBrowserWorkerParityRequestForTests(
        process.cwd(),
        request(),
      ),
    ).toEqual(request());
  });

  it.each([
    [
      "absolute candidate path",
      () => {
        const value = request();
        value.candidate_weights.path = "/tmp/candidate.bin";
        return value;
      },
    ],
    [
      "escaping candidate path",
      () => {
        const value = request();
        value.candidate_weights.path = "../candidate.bin";
        return value;
      },
    ],
    [
      "candidate schema",
      () => {
        const value = request();
        value.candidate_weights.schema = "untrusted-weights";
        return value;
      },
    ],
    [
      "candidate size",
      () => {
        const value = request();
        value.candidate_weights.bytes--;
        return value;
      },
    ],
    [
      "candidate SHA",
      () => {
        const value = request();
        value.candidate_weights.sha256 = "a".repeat(64);
        return value;
      },
    ],
    [
      "production WASM path",
      () => {
        const value = request();
        value.production_wasm.path = "public/shogi.wasm";
        return value;
      },
    ],
    [
      "production WASM SHA",
      () => {
        const value = request();
        value.production_wasm.sha256 = "b".repeat(64);
        return value;
      },
    ],
    [
      "extra request field",
      () => ({ ...request(), authority: "caller-authored" }),
    ],
  ])("rejects a differing %s", (_label, mutate) => {
    expect(() =>
      authenticateBrowserWorkerParityRequestForTests(
        process.cwd(),
        mutate(),
      ),
    ).toThrow();
  });
});

describe("strength-first browser Worker parity observation", () => {
  it("accepts only the aggregate real Worker/WASM/NNUE observation", () => {
    expect(
      validateBrowserWorkerHarnessObservationForTests(
        observation(),
        candidate,
        wasm,
      ),
    ).toEqual(observation());
  });

  it.each([
    [
      "failed status",
      (value: Record<string, any>) => {
        value.status = "fail";
        value.failure_code = "worker-request-failed";
      },
    ],
    [
      "non-isolated page",
      (value: Record<string, any>) => {
        value.environment.cross_origin_isolated = false;
      },
    ],
    [
      "missing Worker response",
      (value: Record<string, any>) => {
        value.execution.worker_response = false;
      },
    ],
    [
      "illegal result",
      (value: Record<string, any>) => {
        value.execution.legal_result = false;
      },
    ],
    [
      "book route",
      (value: Record<string, any>) => {
        value.execution.search_path = "book";
      },
    ],
    [
      "silent V3 fallback",
      (value: Record<string, any>) => {
        value.execution.evaluation_path = "v3-wasm";
      },
    ],
    [
      "disabled NNUE",
      (value: Record<string, any>) => {
        value.nnue.enabled = false;
      },
    ],
    [
      "candidate SHA mismatch",
      (value: Record<string, any>) => {
        value.nnue.fetched_weights.sha256 = "c".repeat(64);
      },
    ],
    [
      "unready WASM",
      (value: Record<string, any>) => {
        value.runtime_wasm.ready = false;
      },
    ],
    [
      "runtime WASM mismatch",
      (value: Record<string, any>) => {
        value.runtime_wasm.embedded.bytes--;
      },
    ],
    [
      "raw move field",
      (value: Record<string, any>) => {
        value.move = "7a6b";
      },
    ],
  ])("rejects %s", (_label, mutate) => {
    const value = observation();
    mutate(value);
    expect(() =>
      validateBrowserWorkerHarnessObservationForTests(
        value,
        candidate,
        wasm,
      ),
    ).toThrow();
  });
});
