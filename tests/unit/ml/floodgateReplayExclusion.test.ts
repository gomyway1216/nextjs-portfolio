import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  FLOODGATE_PROTECTED_POSITION_ID_FORMAT,
  FLOODGATE_REPLAY_EXCLUSION_UNION_SCHEMA,
  buildFloodgateReplayExclusionUnion,
  buildFloodgateReplayExclusionUnionCoreForTests,
} from "../../../ml/floodgate-replay-exclusion";
import { floodgateIdentifierDigest } from "../../../ml/floodgate-roles";

function id(character: string): string {
  return `sha256:${character.repeat(64)}`;
}

function text(...identifiers: string[]): string {
  return `${identifiers.join("\n")}\n`;
}

describe("Floodgate replay exclusion union", () => {
  it("forms the sorted legacy plus fresh-evaluation union with overlap accounting", () => {
    const a = id("1");
    const b = id("2");
    const c = id("3");
    const d = id("4");
    const e = id("5");
    const artifact = buildFloodgateReplayExclusionUnionCoreForTests({
      legacy: text(a, b),
      fresh_final: text(b, c, d),
      fresh_selection: text(c, e),
    });

    expect(artifact.text).toBe(text(a, b, c, d, e));
    expect(artifact.identifiers).toEqual([a, b, c, d, e]);
    expect(artifact.receipt).toMatchObject({
      schema: FLOODGATE_REPLAY_EXCLUSION_UNION_SCHEMA,
      format: FLOODGATE_PROTECTED_POSITION_ID_FORMAT,
      overlaps: {
        legacy_and_fresh_final: 1,
        legacy_and_fresh_selection: 0,
        fresh_final_and_fresh_selection: 1,
        all_three: 0,
      },
      summary: {
        component_memberships: 7,
        unique_identifiers: 5,
        duplicate_memberships: 2,
        fresh_evaluation_unique_identifiers: 4,
        added_to_legacy: 3,
      },
      output: {
        count: 5,
        identifiers_sha256: floodgateIdentifierDigest([a, b, c, d, e]),
      },
    });
    expect(artifact.receipt.output.sha256).toBe(
      createHash("sha256").update(artifact.text).digest("hex"),
    );
    expect(artifact.receipt.output.bytes).toBe(
      Buffer.byteLength(artifact.text, "utf8"),
    );
    expect(artifact.receipt_json).toBe(`${JSON.stringify(artifact.receipt)}\n`);
    expect(Object.isFrozen(artifact)).toBe(true);
    expect(Object.isFrozen(artifact.receipt.components)).toBe(true);
    expect(Object.isFrozen(artifact.identifiers)).toBe(true);
  });

  it("counts triple membership without weakening pairwise accounting", () => {
    const shared = id("a");
    const artifact = buildFloodgateReplayExclusionUnionCoreForTests({
      legacy: text(shared),
      fresh_final: text(shared),
      fresh_selection: text(shared),
    });
    expect(artifact.receipt.overlaps).toEqual({
      legacy_and_fresh_final: 1,
      legacy_and_fresh_selection: 1,
      fresh_final_and_fresh_selection: 1,
      all_three: 1,
    });
    expect(artifact.receipt.summary).toMatchObject({
      component_memberships: 3,
      unique_identifiers: 1,
      duplicate_memberships: 2,
      added_to_legacy: 0,
    });
  });

  it.each([
    ["empty", ""],
    ["missing final LF", id("1")],
    ["double final LF", `${id("1")}\n\n`],
    ["CRLF", `${id("1")}\r\n`],
    ["invalid identifier", "not-an-id\n"],
    ["duplicate", text(id("1"), id("1"))],
    ["unsorted", text(id("2"), id("1"))],
  ])("rejects a %s component", (_label, legacy) => {
    expect(() =>
      buildFloodgateReplayExclusionUnionCoreForTests({
        legacy,
        fresh_final: text(id("3")),
        fresh_selection: text(id("4")),
      }),
    ).toThrow(/invalid Floodgate replay exclusion union/);
  });

  it("rejects hidden fields, accessors, symbols, and Proxies without reading them", () => {
    const base = {
      legacy: text(id("1")),
      fresh_final: text(id("2")),
      fresh_selection: text(id("3")),
    };
    const hidden = { ...base } as Record<string, unknown>;
    Object.defineProperty(hidden, "extra", { value: true });
    expect(() =>
      buildFloodgateReplayExclusionUnionCoreForTests(hidden),
    ).toThrow(/keys must be exactly/);

    let accessorTouched = false;
    const accessor = {
      fresh_final: base.fresh_final,
      fresh_selection: base.fresh_selection,
    } as Record<string, unknown>;
    Object.defineProperty(accessor, "legacy", {
      enumerable: true,
      get() {
        accessorTouched = true;
        return base.legacy;
      },
    });
    expect(() =>
      buildFloodgateReplayExclusionUnionCoreForTests(accessor),
    ).toThrow(/enumerable data property/);
    expect(accessorTouched).toBe(false);

    const symbol = { ...base, [Symbol("extra")]: true };
    expect(() =>
      buildFloodgateReplayExclusionUnionCoreForTests(symbol),
    ).toThrow(/symbol keys/);

    let proxyTrapTouched = false;
    const proxy = new Proxy(base, {
      ownKeys() {
        proxyTrapTouched = true;
        return [];
      },
    });
    expect(() => buildFloodgateReplayExclusionUnionCoreForTests(proxy)).toThrow(
      /non-Proxy/,
    );
    expect(proxyTrapTouched).toBe(false);
  });

  it("keeps the production legacy component pinned", () => {
    expect(() =>
      buildFloodgateReplayExclusionUnion({
        legacy: text(id("1")),
        fresh_final: text(id("2")),
        fresh_selection: text(id("3")),
      }),
    ).toThrow(/legacy component does not match the preregistered/);
  });
});
