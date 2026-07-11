/**
 * Label-free replay exclusion union for the fresh Floodgate evaluation roles.
 *
 * Production binds the legacy component to the preregistered 8,678-ID file.
 * The two fresh components contain semantic parent/child IDs from fresh final
 * and fresh selection only. Training-role IDs are deliberately not added.
 */

import { types as nodeUtilTypes } from "node:util";

import { floodgateIdentifierDigest } from "./floodgate-roles";
import { sha256Hex } from "./floodgate-source";
import { compareBytewise } from "./sibling-data";

export const FLOODGATE_REPLAY_EXCLUSION_UNION_SCHEMA =
  "shogi-floodgate-replay-exclusion-union-v1" as const;
export const FLOODGATE_PROTECTED_POSITION_ID_FORMAT =
  "sorted-unique-sha256-position-id-utf8-lf-v1" as const;

export const FLOODGATE_PINNED_LEGACY_REPLAY_EXCLUSION = Object.freeze({
  format: FLOODGATE_PROTECTED_POSITION_ID_FORMAT,
  bytes: 624_816,
  sha256: "1cddfa87218de7c0752acfd6d238d3581103a6051e7f17bf54256bee2586ce5a",
  count: 8_678,
  identifiers_sha256:
    "f9d9560452554b7e40ed0183c95f9d42cc8b8787f63200b453a511dd44fac5c5",
});

const POSITION_ID_RE = /^sha256:[0-9a-f]{64}$/;

export interface FloodgateReplayExclusionUnionInput {
  readonly legacy: string;
  readonly fresh_final: string;
  readonly fresh_selection: string;
}

export interface FloodgateProtectedPositionIdIdentity {
  readonly format: typeof FLOODGATE_PROTECTED_POSITION_ID_FORMAT;
  readonly bytes: number;
  readonly sha256: string;
  readonly count: number;
  readonly identifiers_sha256: string;
}

export interface FloodgateReplayExclusionUnionReceipt {
  readonly schema: typeof FLOODGATE_REPLAY_EXCLUSION_UNION_SCHEMA;
  readonly format: typeof FLOODGATE_PROTECTED_POSITION_ID_FORMAT;
  readonly components: {
    readonly legacy: FloodgateProtectedPositionIdIdentity;
    readonly fresh_final: FloodgateProtectedPositionIdIdentity;
    readonly fresh_selection: FloodgateProtectedPositionIdIdentity;
  };
  readonly overlaps: {
    readonly legacy_and_fresh_final: number;
    readonly legacy_and_fresh_selection: number;
    readonly fresh_final_and_fresh_selection: number;
    readonly all_three: number;
  };
  readonly summary: {
    readonly component_memberships: number;
    readonly unique_identifiers: number;
    readonly duplicate_memberships: number;
    readonly fresh_evaluation_unique_identifiers: number;
    readonly added_to_legacy: number;
  };
  readonly output: FloodgateProtectedPositionIdIdentity;
}

export interface FloodgateReplayExclusionUnionArtifact {
  readonly identifiers: readonly string[];
  readonly text: string;
  readonly receipt: FloodgateReplayExclusionUnionReceipt;
  readonly receipt_json: string;
}

interface ParsedComponent {
  readonly identifiers: readonly string[];
  readonly set: ReadonlySet<string>;
  readonly identity: FloodgateProtectedPositionIdIdentity;
}

function fail(message: string): never {
  throw new Error(`invalid Floodgate replay exclusion union: ${message}`);
}

function strictInput(
  input: unknown,
): Readonly<FloodgateReplayExclusionUnionInput> {
  if (
    nodeUtilTypes.isProxy(input) ||
    input === null ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.getPrototypeOf(input) !== Object.prototype ||
    Object.getOwnPropertySymbols(input).length !== 0
  ) {
    fail("input must be a non-Proxy plain object without symbol keys");
  }
  const expected = ["fresh_final", "fresh_selection", "legacy"];
  const names = Object.getOwnPropertyNames(input).sort(compareBytewise);
  if (
    names.length !== expected.length ||
    names.some((name, index) => name !== expected[index])
  ) {
    fail("input keys must be exactly legacy, fresh_final, fresh_selection");
  }
  const values: Record<string, unknown> = {};
  for (const name of names) {
    const descriptor = Object.getOwnPropertyDescriptor(input, name);
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
      fail(`input.${name} must be an enumerable data property`);
    }
    values[name] = descriptor.value;
  }
  if (
    typeof values.legacy !== "string" ||
    typeof values.fresh_final !== "string" ||
    typeof values.fresh_selection !== "string"
  ) {
    fail("every component must be a primitive string");
  }
  return Object.freeze({
    legacy: values.legacy,
    fresh_final: values.fresh_final,
    fresh_selection: values.fresh_selection,
  });
}

function parseComponent(text: string, label: string): ParsedComponent {
  if (
    text.length === 0 ||
    !text.endsWith("\n") ||
    text.endsWith("\n\n") ||
    text.includes("\r") ||
    text.includes("\0")
  ) {
    fail(`${label} must be nonempty and use exact single-final-LF framing`);
  }
  const identifiers = text.slice(0, -1).split("\n");
  for (let index = 0; index < identifiers.length; index += 1) {
    const identifier = identifiers[index];
    if (!POSITION_ID_RE.test(identifier)) {
      fail(`${label}[${index}] is not a canonical semantic position ID`);
    }
    if (index > 0 && compareBytewise(identifiers[index - 1], identifier) >= 0) {
      fail(`${label} must be UTF-8-bytewise sorted and unique`);
    }
  }
  const frozenIdentifiers = Object.freeze([...identifiers]);
  return Object.freeze({
    identifiers: frozenIdentifiers,
    set: new Set(frozenIdentifiers),
    identity: Object.freeze({
      format: FLOODGATE_PROTECTED_POSITION_ID_FORMAT,
      bytes: Buffer.byteLength(text, "utf8"),
      sha256: sha256Hex(text),
      count: frozenIdentifiers.length,
      identifiers_sha256: floodgateIdentifierDigest(frozenIdentifiers),
    }),
  });
}

function intersectionSize(
  left: ReadonlySet<string>,
  right: ReadonlySet<string>,
): number {
  let count = 0;
  const [small, large] =
    left.size <= right.size ? [left, right] : [right, left];
  for (const value of small) if (large.has(value)) count += 1;
  return count;
}

function tripleIntersectionSize(
  first: ReadonlySet<string>,
  second: ReadonlySet<string>,
  third: ReadonlySet<string>,
): number {
  let count = 0;
  const ordered = [first, second, third].sort(
    (left, right) => left.size - right.size,
  );
  for (const value of ordered[0]) {
    if (ordered[1].has(value) && ordered[2].has(value)) count += 1;
  }
  return count;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const key of Object.getOwnPropertyNames(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

function buildCore(inputValue: unknown): FloodgateReplayExclusionUnionArtifact {
  const input = strictInput(inputValue);
  const legacy = parseComponent(input.legacy, "legacy");
  const freshFinal = parseComponent(input.fresh_final, "fresh_final");
  const freshSelection = parseComponent(
    input.fresh_selection,
    "fresh_selection",
  );
  const identifiers = [
    ...new Set([
      ...legacy.identifiers,
      ...freshFinal.identifiers,
      ...freshSelection.identifiers,
    ]),
  ].sort(compareBytewise);
  const text = `${identifiers.join("\n")}\n`;
  const freshEvaluation = new Set([
    ...freshFinal.identifiers,
    ...freshSelection.identifiers,
  ]);
  const componentMemberships =
    legacy.identifiers.length +
    freshFinal.identifiers.length +
    freshSelection.identifiers.length;
  const receipt: FloodgateReplayExclusionUnionReceipt = {
    schema: FLOODGATE_REPLAY_EXCLUSION_UNION_SCHEMA,
    format: FLOODGATE_PROTECTED_POSITION_ID_FORMAT,
    components: {
      legacy: legacy.identity,
      fresh_final: freshFinal.identity,
      fresh_selection: freshSelection.identity,
    },
    overlaps: {
      legacy_and_fresh_final: intersectionSize(legacy.set, freshFinal.set),
      legacy_and_fresh_selection: intersectionSize(
        legacy.set,
        freshSelection.set,
      ),
      fresh_final_and_fresh_selection: intersectionSize(
        freshFinal.set,
        freshSelection.set,
      ),
      all_three: tripleIntersectionSize(
        legacy.set,
        freshFinal.set,
        freshSelection.set,
      ),
    },
    summary: {
      component_memberships: componentMemberships,
      unique_identifiers: identifiers.length,
      duplicate_memberships: componentMemberships - identifiers.length,
      fresh_evaluation_unique_identifiers: freshEvaluation.size,
      added_to_legacy: identifiers.length - legacy.identifiers.length,
    },
    output: {
      format: FLOODGATE_PROTECTED_POSITION_ID_FORMAT,
      bytes: Buffer.byteLength(text, "utf8"),
      sha256: sha256Hex(text),
      count: identifiers.length,
      identifiers_sha256: floodgateIdentifierDigest(identifiers),
    },
  };
  const frozenReceipt = deepFreeze(receipt);
  return deepFreeze({
    identifiers,
    text,
    receipt: frozenReceipt,
    receipt_json: `${JSON.stringify(frozenReceipt)}\n`,
  });
}

/** Production entrypoint. The legacy input cannot be substituted. */
export function buildFloodgateReplayExclusionUnion(
  input: unknown,
): FloodgateReplayExclusionUnionArtifact {
  const artifact = buildCore(input);
  const legacy = artifact.receipt.components.legacy;
  for (const key of [
    "format",
    "bytes",
    "sha256",
    "count",
    "identifiers_sha256",
  ] as const) {
    if (legacy[key] !== FLOODGATE_PINNED_LEGACY_REPLAY_EXCLUSION[key]) {
      fail(`legacy component does not match the preregistered ${key}`);
    }
  }
  return artifact;
}

/** Explicit small-fixture seam; never use it to publish production evidence. */
export function buildFloodgateReplayExclusionUnionCoreForTests(
  input: unknown,
): FloodgateReplayExclusionUnionArtifact {
  return buildCore(input);
}
