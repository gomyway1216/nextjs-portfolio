import * as fs from "node:fs";
import * as path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  FloodgateV7TrainingLabelProductionError,
  copyFloodgateV7TrainingLabelOutputKeysCoreForTests,
  discardFloodgateV7TrainingLabelFinalizationPlan,
  finalizeAndPublishFloodgateV7TrainingLabels,
  type FloodgateV7TrainingLabelFinalizationPlan,
} from "../../../ml/floodgate-v7-training-label-finalizer-core";
import type { FloodgateTrainingConsumerPostflightReceipt } from "../../../ml/floodgate-training-row-consumer";

const originalTypedArrayFill = Uint8Array.prototype.fill;
const originalArrayPush = Array.prototype.push;

afterEach(() => {
  Object.defineProperty(Uint8Array.prototype, "fill", {
    configurable: true,
    writable: true,
    value: originalTypedArrayFill,
  });
  Object.defineProperty(Array.prototype, "push", {
    configurable: true,
    writable: true,
    value: originalArrayPush,
  });
});

function foreignProductionPlan(
  leakedPath = "/private/secret/stage/work.jsonl",
): Readonly<FloodgateV7TrainingLabelFinalizationPlan> {
  return Object.freeze({
    contract: "shogi-floodgate-v7-training-label-finalization-plan-v1",
    status: "production-opaque-one-shot-authenticated-sealed-scan-plan",
    claim_boundary: leakedPath,
    execution_boundary:
      "production-fixed-authenticated-sealed-scan-backed-restartable-plan",
  }) as Readonly<FloodgateV7TrainingLabelFinalizationPlan>;
}

describe("Floodgate v7 production training-label composition boundaries", () => {
  it("keeps legacy test, scanner-test, and production plan registries disjoint in source", async () => {
    const source = await fs.promises.readFile(
      path.join(
        process.cwd(),
        "ml/floodgate-v7-training-label-finalizer-core.ts",
      ),
      "utf8",
    );
    expect(source).toContain("const TEST_PLAN_REGISTRY = new WeakMap");
    expect(source).toContain(
      "const TEST_PRODUCTION_PLAN_REGISTRY = new WeakMap",
    );
    expect(source).toContain("const PRODUCTION_PLAN_REGISTRY = new WeakMap");
    const productionAdapter = source.slice(
      source.indexOf(
        "export async function finalizeAndPublishFloodgateV7TrainingLabels(",
      ),
      source.indexOf(
        "export async function finalizeAndPublishFloodgateV7TrainingLabelsProductionCoreForTests(",
      ),
    );
    expect(productionAdapter).not.toContain("CoreForTests");
    expect(productionAdapter).not.toContain("rootKey");
    expect(productionAdapter).not.toContain("stageRoot");
    expect(productionAdapter).not.toContain("dependencies");
  });

  it("sanitizes foreign-plan finalization and discard without retaining a private path or cause", async () => {
    const leakedPath = "/private/secret/stage/work.jsonl";
    const plan = foreignProductionPlan(leakedPath);
    const postflight = Object.freeze({
      leakedPath,
    }) as unknown as Readonly<FloodgateTrainingConsumerPostflightReceipt>;

    let finalizationFailure: unknown;
    try {
      await finalizeAndPublishFloodgateV7TrainingLabels(plan, postflight);
    } catch (error) {
      finalizationFailure = error;
    }
    expect(finalizationFailure).toBeInstanceOf(
      FloodgateV7TrainingLabelProductionError,
    );
    expect(String(finalizationFailure)).not.toContain(leakedPath);
    expect(finalizationFailure).not.toHaveProperty("cause");
    expect(finalizationFailure).not.toHaveProperty("primary");
    expect(finalizationFailure).not.toHaveProperty("cleanupFailures");

    let discardFailure: unknown;
    try {
      await discardFloodgateV7TrainingLabelFinalizationPlan(plan);
    } catch (error) {
      discardFailure = error;
    }
    expect(discardFailure).toBeInstanceOf(
      FloodgateV7TrainingLabelProductionError,
    );
    expect(String(discardFailure)).not.toContain(leakedPath);
    expect(discardFailure).not.toHaveProperty("cause");
  });

  it("uses captured typed-array primitives when public fill and Array.push are poisoned", () => {
    Object.defineProperty(Uint8Array.prototype, "fill", {
      configurable: true,
      writable: true,
      value: () => {
        throw new Error("poisoned public fill");
      },
    });
    Object.defineProperty(Array.prototype, "push", {
      configurable: true,
      writable: true,
      value: () => {
        throw new Error("poisoned public push");
      },
    });
    const claimedResult = new Uint8Array(32);
    const claimedManifest = new Uint8Array(32);
    Reflect.apply(originalTypedArrayFill, claimedResult, [0x31]);
    Reflect.apply(originalTypedArrayFill, claimedManifest, [0x52]);

    const copied = copyFloodgateV7TrainingLabelOutputKeysCoreForTests({
      resultKey: claimedResult,
      manifestKey: claimedManifest,
    });
    Object.defineProperty(Uint8Array.prototype, "fill", {
      configurable: true,
      writable: true,
      value: originalTypedArrayFill,
    });
    Object.defineProperty(Array.prototype, "push", {
      configurable: true,
      writable: true,
      value: originalArrayPush,
    });
    expect([...claimedResult]).toEqual(new Array(32).fill(0));
    expect([...claimedManifest]).toEqual(new Array(32).fill(0));
    expect([...copied.resultKey]).toEqual(new Array(32).fill(0x31));
    expect([...copied.manifestKey]).toEqual(new Array(32).fill(0x52));
    Reflect.apply(originalTypedArrayFill, copied.resultKey, [0]);
    Reflect.apply(originalTypedArrayFill, copied.manifestKey, [0]);
  });

  it("fails a detached claimed key while still zeroing the other claimed key", () => {
    Object.defineProperty(Array.prototype, "push", {
      configurable: true,
      writable: true,
      value: () => {
        throw new Error("poisoned public push");
      },
    });
    const detached = new Uint8Array(32);
    const manifest = new Uint8Array(32);
    Reflect.apply(originalTypedArrayFill, detached, [0x17]);
    Reflect.apply(originalTypedArrayFill, manifest, [0x29]);
    structuredClone(detached.buffer, { transfer: [detached.buffer] });

    let failure: unknown;
    try {
      copyFloodgateV7TrainingLabelOutputKeysCoreForTests({
        resultKey: detached,
        manifestKey: manifest,
      });
    } catch (error) {
      failure = error;
    }
    Object.defineProperty(Array.prototype, "push", {
      configurable: true,
      writable: true,
      value: originalArrayPush,
    });
    expect(failure).toBeInstanceOf(AggregateError);
    expect(String(failure)).toContain("output-key copy or zeroization failed");
    expect(detached.byteLength).toBe(0);
    expect([...manifest]).toEqual(new Array(32).fill(0));
  });
});
