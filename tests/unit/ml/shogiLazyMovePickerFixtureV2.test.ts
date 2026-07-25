import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  positionFromSfen,
  rulesCompleteLegalMoves,
} from "../../../ml/shogi-sfen";
import { toSfen } from "../../../ml/shogi-sfen-codec";
import { GenerateMovesImproved } from "../../../src/components/game/ShogiImproved/GenerateMovesImproved";

type Category = "opening" | "middlegame" | "dropHeavy" | "checkEvasion";

interface FixtureCase {
  id: string;
  category: Category;
  sfen: string;
  tesu: number;
  sourceRole: "openingHoldout" | "browserTrain" | "browserValidation";
  source: string;
  sourceGame: string | null;
  handCount: number;
  legalMoves: number;
  legalDrops: number;
  inCheck: boolean;
  selectionSha256: string;
}

interface FixtureV2 {
  schemaVersion: number;
  name: string;
  status: string;
  caseCount: number;
  counts: Record<Category, number>;
  inputs: Record<
    "openingHoldout" | "browserTrain" | "browserValidation",
    {
      requiredCliFlag: string;
      source: string;
      bytes: number;
      sha256: string;
    }
  >;
  v1Exclusion: {
    fixture: string;
    bytes: number;
    sha256: string;
    excludedSfens: number;
    excludedSourceGames: number;
    policy: string;
  };
  selection: {
    domain: string;
    formula: string;
    delimiter: string;
    order: string;
    casesPerCategory: number;
    sourcePolicy: Record<Category, string[]>;
    eligibility: Record<Category, string>;
  };
  cases: FixtureCase[];
}

interface FixtureV1 {
  cases: {
    sfen: string;
    sourceGame: string | null;
  }[];
}

const ROOT = process.cwd();
const V1_PATH = join(ROOT, "wasm-spike", "lazy-move-picker-fixture-v1.json");
const V2_PATH = join(ROOT, "wasm-spike", "lazy-move-picker-fixture-v2.json");
const V1_IDENTITY = {
  bytes: 29_380,
  sha256: "59c1a68bb5515447211ad57ec9cf1a27c8933b95656d78c8e7e8f213a130bdfc",
};
const INPUT_IDENTITIES = {
  openingHoldout: {
    requiredCliFlag: "--opening-holdout",
    source: "opening-holdout-4k",
    bytes: 538_870,
    sha256: "1f8d91f286eec160eb1141ba5adfd36b842af12ceec37aa4f959038a60969ce6",
  },
  browserTrain: {
    requiredCliFlag: "--browser-train",
    source: "browser-confusion-depth12-batch3-v2-train",
    bytes: 97_820_193,
    sha256: "a592f7ece38172a0e2a8ee865359349555d8a3dc31eb6f6697411974d2dd3d1e",
  },
  browserValidation: {
    requiredCliFlag: "--browser-val",
    source: "browser-confusion-depth12-batch3-v2-validation",
    bytes: 50_255_278,
    sha256: "0d3973ea7df7c44a5e863947b358b15dcf0e249dd26bbf0e7ef26dfff8bef3ca",
  },
};

function identity(bytes: Uint8Array): { bytes: number; sha256: string } {
  return {
    bytes: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

function loadFixtures(): { v1: FixtureV1; v2: FixtureV2 } {
  return {
    v1: JSON.parse(readFileSync(V1_PATH, "utf8")) as FixtureV1,
    v2: JSON.parse(readFileSync(V2_PATH, "utf8")) as FixtureV2,
  };
}

function selectionDigest(domain: string, entry: FixtureCase): string {
  return createHash("sha256")
    .update(
      `${domain}\0${entry.category}\0${entry.sfen}\0${entry.sourceGame ?? "-"}`,
      "utf8",
    )
    .digest("hex");
}

describe("formal lazy move picker fixture v2", () => {
  it("pins all three explicit inputs and the unchanged v1 tuning fixture", () => {
    const { v2 } = loadFixtures();
    expect(identity(readFileSync(V1_PATH))).toEqual(V1_IDENTITY);
    expect(v2.inputs).toEqual(INPUT_IDENTITIES);
    expect(v2.v1Exclusion).toMatchObject({
      fixture: "wasm-spike/lazy-move-picker-fixture-v1.json",
      ...V1_IDENTITY,
      excludedSfens: 64,
      excludedSourceGames: 16,
      policy: "reject-candidate-on-exact-canonical-sfen-or-source-game-match",
    });
  });

  it("contains a category-balanced, SFEN-disjoint formal holdout", () => {
    const { v2 } = loadFixtures();
    const categories: Category[] = [
      "opening",
      "middlegame",
      "dropHeavy",
      "checkEvasion",
    ];
    expect(v2).toMatchObject({
      schemaVersion: 2,
      name: "lazy-move-picker-fixed-depth-formal-v2",
      status: "formal-holdout-not-for-tuning",
      caseCount: 64,
      counts: {
        opening: 16,
        middlegame: 16,
        dropHeavy: 16,
        checkEvasion: 16,
      },
    });
    expect(new Set(v2.cases.map((entry) => entry.id)).size).toBe(64);
    expect(new Set(v2.cases.map((entry) => entry.sfen)).size).toBe(64);
    for (const category of categories) {
      const selected = v2.cases.filter((entry) => entry.category === category);
      expect(selected).toHaveLength(16);
      expect(selected.map((entry) => entry.selectionSha256)).toEqual(
        [...selected]
          .sort(
            (left, right) =>
              left.selectionSha256.localeCompare(right.selectionSha256) ||
              left.sfen.localeCompare(right.sfen) ||
              left.sourceRole.localeCompare(right.sourceRole),
          )
          .map((entry) => entry.selectionSha256),
      );
    }
  });

  it("excludes every v1 SFEN and source game", () => {
    const { v1, v2 } = loadFixtures();
    const v1Sfens = new Set(v1.cases.map((entry) => entry.sfen));
    const v1Games = new Set(
      v1.cases
        .map((entry) => entry.sourceGame)
        .filter((value): value is string => value !== null),
    );
    expect(v2.cases.filter((entry) => v1Sfens.has(entry.sfen))).toEqual([]);
    expect(
      v2.cases.filter(
        (entry) => entry.sourceGame !== null && v1Games.has(entry.sourceGame),
      ),
    ).toEqual([]);
  });

  it("recomputes position metadata and the domain-separated digest", () => {
    const { v2 } = loadFixtures();
    expect(v2.selection).toMatchObject({
      domain: "lazy-move-picker-formal-fixture-v2",
      formula:
        "sha256(utf8(domain + NUL + category + NUL + canonicalSfen + NUL + (sourceGame ?? '-')))",
      delimiter: "NUL U+0000",
      casesPerCategory: 16,
    });
    for (const entry of v2.cases) {
      const parsed = positionFromSfen(entry.sfen);
      const legal = rulesCompleteLegalMoves(parsed.position);
      let handCount = 0;
      for (const count of parsed.position.hand) handCount += count;
      expect(toSfen(parsed.position, parsed.moveNumber)).toBe(entry.sfen);
      expect(entry.tesu).toBe(parsed.moveNumber - 1);
      expect(entry.handCount).toBe(handCount);
      expect(entry.legalMoves).toBe(legal.length);
      expect(entry.legalDrops).toBe(
        legal.filter((move) => move.move.from === 0).length,
      );
      expect(entry.inCheck).toBe(
        GenerateMovesImproved.isKingInCheck(
          parsed.position,
          parsed.position.teban,
        ),
      );
      expect(entry.selectionSha256).toBe(
        selectionDigest(v2.selection.domain, entry),
      );
    }
  });

  it("enforces each category contract and distinct check-evasion games", () => {
    const { v2 } = loadFixtures();
    const checkGames = new Set<string>();
    for (const entry of v2.cases) {
      const dropHeavy =
        !entry.inCheck && entry.handCount >= 6 && entry.legalDrops >= 46;
      if (entry.category === "opening") {
        expect(entry.sourceRole).toBe("openingHoldout");
        expect(entry.inCheck).toBe(false);
        expect(dropHeavy).toBe(false);
        expect(entry.tesu).toBeLessThanOrEqual(20);
      } else if (entry.category === "middlegame") {
        expect(entry.sourceRole).toBe("openingHoldout");
        expect(entry.inCheck).toBe(false);
        expect(dropHeavy).toBe(false);
        expect(entry.tesu).toBeGreaterThanOrEqual(21);
      } else if (entry.category === "dropHeavy") {
        expect(entry.inCheck).toBe(false);
        expect(entry.handCount).toBeGreaterThanOrEqual(6);
        expect(entry.legalDrops).toBeGreaterThanOrEqual(46);
      } else {
        expect(entry.sourceRole).not.toBe("openingHoldout");
        expect(entry.inCheck).toBe(true);
        expect(entry.sourceGame).toMatch(/^sha256:[0-9a-f]{64}$/);
        expect(checkGames.has(entry.sourceGame as string)).toBe(false);
        checkGames.add(entry.sourceGame as string);
      }
    }
    expect(checkGames.size).toBe(16);
    expect(new Set(v2.cases.map((entry) => entry.sourceRole))).toEqual(
      new Set(["openingHoldout", "browserTrain", "browserValidation"]),
    );
  });
});
