import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { getOpeningMoveImproved, clearExternalOpeningBookForTests, loadExternalOpeningBook } from "@/components/game/ShogiImproved/OpeningBookImproved";
import { __shogiEngineParityHarnessForTests } from "@/components/game/ShogiImproved/ShogiEngineParityHarness";
import {
  canonicalShogiEngineParityJson,
  isExactShogiEngineParityQuery,
  SHOGI_ENGINE_PARITY_QUERY_KEY,
  SHOGI_ENGINE_PARITY_QUERY_VALUE,
} from "@/components/game/ShogiImproved/shogiEngineParityProtocol";

afterEach(() => {
  clearExternalOpeningBookForTests();
});

describe("Shogi browser Worker parity protocol", () => {
  it("mounts only for the one exact, unlinked diagnostics query", () => {
    expect(
      isExactShogiEngineParityQuery({
        [SHOGI_ENGINE_PARITY_QUERY_KEY]: SHOGI_ENGINE_PARITY_QUERY_VALUE,
      }),
    ).toBe(true);
    expect(isExactShogiEngineParityQuery({})).toBe(false);
    expect(isExactShogiEngineParityQuery(null)).toBe(false);
    expect(isExactShogiEngineParityQuery(undefined)).toBe(false);
    expect(
      isExactShogiEngineParityQuery({
        [SHOGI_ENGINE_PARITY_QUERY_KEY]: [
          SHOGI_ENGINE_PARITY_QUERY_VALUE,
        ],
      }),
    ).toBe(false);
    expect(
      isExactShogiEngineParityQuery({
        [SHOGI_ENGINE_PARITY_QUERY_KEY]: SHOGI_ENGINE_PARITY_QUERY_VALUE,
        extra: "1",
      }),
    ).toBe(false);
    expect(
      isExactShogiEngineParityQuery({
        [SHOGI_ENGINE_PARITY_QUERY_KEY]: "future-protocol",
      }),
    ).toBe(false);

    const ordinaryGame = readFileSync(
      join(
        process.cwd(),
        "src",
        "components",
        "game",
        "ShogiImproved",
        "ShogiImproved.tsx",
      ),
      "utf8",
    );
    expect(ordinaryGame).not.toContain("ShogiEngineParityHarness");
    expect(ordinaryGame).not.toContain(SHOGI_ENGINE_PARITY_QUERY_VALUE);
    expect(ordinaryGame).not.toContain("searchParams");

    const diagnosticsPage = readFileSync(
      join(
        process.cwd(),
        "src",
        "app",
        "games",
        "shogi",
        "engine-parity",
        "page.tsx",
      ),
      "utf8",
    );
    expect(diagnosticsPage).toContain("isExactShogiEngineParityQuery");
    expect(diagnosticsPage).toContain("notFound()");
  });

  it("canonicalizes aggregate evidence and rejects ambiguous numbers", () => {
    expect(
      canonicalShogiEngineParityJson({
        z: [3, { b: true, a: null }],
        a: "value",
      }),
    ).toBe('{"a":"value","z":[3,{"a":null,"b":true}]}');
    expect(() => canonicalShogiEngineParityJson(Number.NaN)).toThrow(
      /nonfinite/,
    );
    expect(() => canonicalShogiEngineParityJson(-0)).toThrow(/negative zero/);
    expect(() =>
      canonicalShogiEngineParityJson({ missing: undefined }),
    ).toThrow(/object is invalid/);
  });

  it("pins a legal bishop-handicap fixture outside curated and shipped external books", () => {
    const { position } = __shogiEngineParityHarnessForTests.buildFixture();
    expect(getOpeningMoveImproved(position, "hard")).toBeNull();

    const externalBook = readFileSync(
      join(process.cwd(), "public", "shogi-opening-book.bin"),
    );
    const arrayBuffer = externalBook.buffer.slice(
      externalBook.byteOffset,
      externalBook.byteOffset + externalBook.byteLength,
    );
    expect(loadExternalOpeningBook(arrayBuffer)).toBeGreaterThan(0);
    expect(getOpeningMoveImproved(position, "hard")).toBeNull();
  });
});
