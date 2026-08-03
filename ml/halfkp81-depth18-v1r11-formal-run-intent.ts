import { createHash } from "node:crypto";
import * as path from "node:path";

import { v1r11CanonicalJson } from "./halfkp81-depth18-v1r11-authority-io";

export const HALFKP81_V1R11_FORMAL_RUN_INTENT_SCHEMA =
  "shogi-halfkp81-depth18-yaneura-only-formal-run-intent-v2" as const;
export const HALFKP81_V1R11_FORMAL_RUN_INTENT_DOMAIN =
  "shogi-halfkp81-depth18-yaneura-only-formal-run-intent-v2\0" as const;
export const HALFKP81_V1R11_ENGINE_BINARY_IDENTITY_SCHEMA =
  "application/x-mach-o-executable-exact-bytes" as const;
export const HALFKP81_V1R11_ENGINE_EVAL_IDENTITY_SCHEMA =
  "application/octet-stream-exact-bytes" as const;

const SHA256_RE = /^[0-9a-f]{64}$/u;
const REVISION_RE = /^[0-9a-f]{40}$/u;
const FORBIDDEN_AUTHORITY_KEY_RE =
  /(?:run_fingerprint|launchagent_authority|launch_agent_authority|launchagent_evidence|launch_agent_evidence|preformal_authority|formal_authority|raw_receipt|verified_receipt|teacher_receipt|artifact_receipt|authority_receipt|power_continuity|process_cleanup|terminal_fault)/u;

export interface Halfkp81V1R11FormalRunIntentIdentity {
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly schema?: string;
  readonly rows?: number;
}

export interface Halfkp81V1R11FormalRunIntentInput {
  readonly teacherPlan: Readonly<Halfkp81V1R11FormalRunIntentIdentity>;
  readonly selectionJsonl: Readonly<Halfkp81V1R11FormalRunIntentIdentity>;
  readonly selectionManifest: Readonly<Halfkp81V1R11FormalRunIntentIdentity>;
  readonly sourceRevision: string;
  readonly engine: Readonly<{
    binary: Readonly<Halfkp81V1R11FormalRunIntentIdentity>;
    evalFile: Readonly<Halfkp81V1R11FormalRunIntentIdentity>;
    receipt: Readonly<Halfkp81V1R11FormalRunIntentIdentity>;
  }>;
  readonly teacherContract: Readonly<Record<string, unknown>>;
  readonly candidateContract: Readonly<Record<string, unknown>>;
  readonly plannedFinalDescriptor: Readonly<Halfkp81V1R11FormalRunIntentIdentity>;
}

function identity(
  value: Readonly<Halfkp81V1R11FormalRunIntentIdentity>,
  label: string,
): Readonly<Halfkp81V1R11FormalRunIntentIdentity> {
  if (
    !path.isAbsolute(value.path) ||
    path.normalize(value.path) !== value.path ||
    !Number.isSafeInteger(value.bytes) ||
    value.bytes < 1 ||
    !SHA256_RE.test(value.sha256) ||
    typeof value.schema !== "string" ||
    value.schema.length < 1 ||
    (value.rows !== undefined &&
      (!Number.isSafeInteger(value.rows) || value.rows < 1)) ||
    v1r11CanonicalJson(Object.keys(value).sort()) !==
      v1r11CanonicalJson(
        [
          "bytes",
          "path",
          "sha256",
          ...(value.schema === undefined ? [] : ["schema"]),
          ...(value.rows === undefined ? [] : ["rows"]),
        ].sort(),
      )
  ) {
    throw new Error(`${label} identity differs`);
  }
  return Object.freeze({ ...value });
}

function contract(
  value: Readonly<Record<string, unknown>>,
  label: string,
): Readonly<Record<string, unknown>> {
  const containsForbiddenAuthorityKey = (candidate: unknown): boolean => {
    if (Array.isArray(candidate)) {
      return candidate.some(containsForbiddenAuthorityKey);
    }
    if (candidate !== null && typeof candidate === "object") {
      return Object.entries(candidate as Readonly<Record<string, unknown>>).some(
        ([key, child]) =>
          FORBIDDEN_AUTHORITY_KEY_RE.test(key) ||
          containsForbiddenAuthorityKey(child),
      );
    }
    return false;
  };
  if (
    value === null ||
    Array.isArray(value) ||
    Object.keys(value).length < 1 ||
    containsForbiddenAuthorityKey(value)
  ) {
    throw new Error(`${label} differs or contains a circular authority input`);
  }
  // Canonicalization rejects undefined, bigint, NaN and functions recursively.
  v1r11CanonicalJson(value);
  return Object.freeze({ ...value });
}

export function buildHalfkp81V1R11FormalRunIntentV2(
  input: Readonly<Halfkp81V1R11FormalRunIntentInput>,
): Readonly<Record<string, unknown>> {
  if (
    input === null ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    v1r11CanonicalJson(Object.keys(input).sort()) !==
      v1r11CanonicalJson(
        [
          "teacherPlan",
          "selectionJsonl",
          "selectionManifest",
          "sourceRevision",
          "engine",
          "teacherContract",
          "candidateContract",
          "plannedFinalDescriptor",
        ].sort(),
      ) ||
    input.engine === null ||
    typeof input.engine !== "object" ||
    Array.isArray(input.engine) ||
    v1r11CanonicalJson(Object.keys(input.engine).sort()) !==
      v1r11CanonicalJson(["binary", "evalFile", "receipt"].sort())
  ) {
    throw new Error("formal run intent fields are not exact");
  }
  if (
    !REVISION_RE.test(input.sourceRevision) ||
    input.selectionJsonl.rows === undefined
  ) {
    throw new Error("formal run intent source revision differs");
  }
  return Object.freeze({
    schema: HALFKP81_V1R11_FORMAL_RUN_INTENT_SCHEMA,
    teacher_plan: identity(input.teacherPlan, "formal run teacher plan"),
    selection_jsonl: identity(
      input.selectionJsonl,
      "formal run selection JSONL",
    ),
    selection_manifest: identity(
      input.selectionManifest,
      "formal run selection manifest",
    ),
    source_revision: input.sourceRevision,
    engine: Object.freeze({
      binary: identity(input.engine.binary, "formal run engine binary"),
      eval_file: identity(input.engine.evalFile, "formal run eval file"),
      receipt: identity(input.engine.receipt, "formal run engine receipt"),
    }),
    teacher: contract(input.teacherContract, "formal run teacher contract"),
    candidate_generation: contract(
      input.candidateContract,
      "formal run candidate contract",
    ),
    planned_final_launchagent_descriptor: identity(
      input.plannedFinalDescriptor,
      "formal run planned final descriptor",
    ),
  });
}

export function halfkp81V1R11FormalRunFingerprintV2(
  input: Readonly<Halfkp81V1R11FormalRunIntentInput>,
): string {
  const intent = buildHalfkp81V1R11FormalRunIntentV2(input);
  return createHash("sha256")
    .update(
      `${HALFKP81_V1R11_FORMAL_RUN_INTENT_DOMAIN}${v1r11CanonicalJson(intent)}`,
    )
    .digest("hex");
}
