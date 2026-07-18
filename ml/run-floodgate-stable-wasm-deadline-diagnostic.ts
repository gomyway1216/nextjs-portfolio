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
const ENTRY_ONLY_FAILURE_PHASES = new Set([
  "binding-load",
  "diagnostic-source-before",
  "entrypoint-context",
  "external-supervisor-unavailable",
  "internal",
  "invocation",
  "launcher-attestation",
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
  if (/[^\x20-\x7e\x0a]/u.test(line)) {
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

function safeEntryPhase(fallback: string): string {
  return ENTRY_ONLY_FAILURE_PHASES.has(fallback) ? fallback : "internal";
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
  try {
    if (process.argv.length !== 2) throw new Error("invalid invocation");
    phase = "launcher-attestation";
    claimFloodgateStableWasmDeadlineDiagnosticLauncherAttestation();
    // Retain the separately initialized child graph in the single reviewable
    // bundle without loading or invoking it from this non-operational entry.
    Object.freeze(lazyBindingModule);
    phase = "entrypoint-context";
    assertFloodgateStableWasmDeadlineDiagnosticEntrypointContext(ENTRYPOINT);
    phase = "diagnostic-source-before";
    await captureFloodgateStableWasmDeadlineDiagnosticSourceProvenance();
    if (interrupted) throw new Error("interrupted before external gate");
    phase = "external-supervisor-unavailable";
    throw new Error("external supervisor is not installed");
  } catch {
    phase = safeEntryPhase(phase);
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
