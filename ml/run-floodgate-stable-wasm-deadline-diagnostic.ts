import { claimFloodgateStableWasmDeadlineDiagnosticLauncherAttestation } from "./floodgate-stable-wasm-deadline-diagnostic-launcher-attestation";
import {
  assertFloodgateStableWasmDeadlineDiagnosticEntrypointContext,
  captureFloodgateStableWasmDeadlineDiagnosticSourceProvenance,
} from "./floodgate-stable-wasm-deadline-diagnostic-source-provenance";

const ENTRYPOINT =
  "ml/run-floodgate-stable-wasm-deadline-diagnostic.cjs" as const;
const FAILURE_SCHEMA =
  "shogi-floodgate-stable-wasm-deadline-run-binding-failure-v1" as const;
const FAILURE_STATUS = "STOP-fixed-phase-no-private-detail" as const;
const BINDING_PHASES = new Set([
  "invocation",
  "platform",
  "persistent-before-control",
  "registry-load",
  "worker-source",
  "persistent-before-assets",
  "asset-authority",
  "public-calibration",
  "registry-claim",
  "registry-application-source-before",
  "persistent-before-role",
  "consumer-authentication",
  "consumer-claim",
  "row-selection",
  "private-diagnostic",
  "consumer-postflight",
  "postflight-claim",
  "asset-cleanup",
  "persistent-after",
  "registry-application-source-after",
  "diagnostic-source-after",
  "signal",
  "output",
  "internal",
]);

interface LazyBindingModule {
  readonly floodgateStableWasmDeadlineRunBindingFailure: (
    error: unknown,
  ) => Readonly<{ readonly phase: unknown }>;
  readonly runFloodgateStableWasmDeadlineRunBinding: (
    expectedSource: Readonly<{
      readonly layout: string;
      readonly revision: string;
    }>,
    shouldStop: () => boolean,
  ) => Promise<unknown>;
}

function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) {
      throw new Error("noncanonical number");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    const descriptors = Object.getOwnPropertyDescriptors(
      value,
    ) as unknown as PropertyDescriptorMap;
    const length = descriptors.length;
    if (
      length === undefined ||
      !("value" in length) ||
      Reflect.ownKeys(descriptors).length !== value.length + 1
    ) {
      throw new Error("noncanonical array");
    }
    const entries: string[] = [];
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (
        descriptor === undefined ||
        !("value" in descriptor) ||
        descriptor.enumerable !== true
      ) {
        throw new Error("noncanonical array entry");
      }
      entries.push(canonicalJson(descriptor.value));
    }
    return `[${entries.join(",")}]`;
  }
  if (typeof value === "object") {
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    if (keys.some((key) => typeof key !== "string")) {
      throw new Error("noncanonical object key");
    }
    const stringKeys = (keys as string[]).sort();
    return `{${stringKeys
      .map((key) => {
        const descriptor = descriptors[key];
        if (
          descriptor === undefined ||
          !("value" in descriptor) ||
          descriptor.enumerable !== true
        ) {
          throw new Error("noncanonical object property");
        }
        return `${JSON.stringify(key)}:${canonicalJson(descriptor.value)}`;
      })
      .join(",")}}`;
  }
  throw new Error("unsupported canonical JSON value");
}

function writeOneLine(value: unknown): Promise<void> {
  const line = `${canonicalJson(value)}\n`;
  if (
    [...line].some((character) => {
      const code = character.charCodeAt(0);
      return code !== 0x0a && (code < 0x20 || code > 0x7e);
    })
  ) {
    return Promise.reject(new Error("output is not printable ASCII"));
  }
  return new Promise((resolve, reject) => {
    process.stdout.write(line, "ascii", (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

async function lazyBindingModule(): Promise<LazyBindingModule> {
  const loaded: unknown =
    await import("./floodgate-stable-wasm-deadline-run-binding");
  if (loaded === null || typeof loaded !== "object") {
    throw new Error("binding module is invalid");
  }
  const descriptors = Object.getOwnPropertyDescriptors(loaded);
  const run = descriptors.runFloodgateStableWasmDeadlineRunBinding;
  const failure = descriptors.floodgateStableWasmDeadlineRunBindingFailure;
  if (
    run === undefined ||
    !("value" in run) ||
    typeof run.value !== "function" ||
    failure === undefined ||
    !("value" in failure) ||
    typeof failure.value !== "function"
  ) {
    throw new Error("binding module exports are invalid");
  }
  return Object.freeze({
    floodgateStableWasmDeadlineRunBindingFailure: failure.value,
    runFloodgateStableWasmDeadlineRunBinding: run.value,
  });
}

function safeBindingPhase(
  binding: LazyBindingModule | null,
  error: unknown,
  fallback: string,
): string {
  if (binding === null) return fallback;
  try {
    const result = binding.floodgateStableWasmDeadlineRunBindingFailure(error);
    const descriptor = Object.getOwnPropertyDescriptor(result, "phase");
    if (
      descriptor !== undefined &&
      "value" in descriptor &&
      typeof descriptor.value === "string" &&
      BINDING_PHASES.has(descriptor.value)
    ) {
      return descriptor.value;
    }
  } catch {
    // The fixed fallback remains the only disclosed failure classification.
  }
  return fallback;
}

async function main(): Promise<void> {
  let interrupted = false;
  const markInterrupted = () => {
    interrupted = true;
  };
  process.on("SIGINT", markInterrupted);
  process.on("SIGTERM", markInterrupted);

  let output: unknown;
  let exitCode = 0;
  let phase = "invocation";
  let binding: LazyBindingModule | null = null;
  try {
    if (process.argv.length !== 2) throw new Error("invalid invocation");
    phase = "launcher-attestation";
    claimFloodgateStableWasmDeadlineDiagnosticLauncherAttestation();
    phase = "entrypoint-context";
    assertFloodgateStableWasmDeadlineDiagnosticEntrypointContext(ENTRYPOINT);
    phase = "diagnostic-source-before";
    const sourceBefore =
      await captureFloodgateStableWasmDeadlineDiagnosticSourceProvenance();
    if (interrupted) throw new Error("interrupted before binding load");

    phase = "binding-load";
    binding = await lazyBindingModule();
    phase = "internal";
    output = await binding.runFloodgateStableWasmDeadlineRunBinding(
      sourceBefore,
      () => interrupted,
    );
    if (interrupted) {
      phase = "signal";
      throw new Error("interrupted after binding completion");
    }
  } catch (error) {
    phase = safeBindingPhase(binding, error, phase);
    output = Object.freeze({
      phase,
      schema: FAILURE_SCHEMA,
      status: FAILURE_STATUS,
    });
    exitCode = 1;
  }

  try {
    await writeOneLine(output);
  } catch {
    exitCode = 1;
  }
  process.removeListener("SIGINT", markInterrupted);
  process.removeListener("SIGTERM", markInterrupted);
  process.exitCode = exitCode;
}

void main();
