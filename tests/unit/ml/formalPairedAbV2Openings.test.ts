import { describe, expect, it } from "vitest";

import {
  FORMAL_PAIRED_AB_V2_OPENING_COUNT,
  FORMAL_PAIRED_AB_V2_OPENING_PLY,
  FORMAL_PAIRED_AB_V2_SOURCE_GAMES_SCHEMA,
  buildFormalPairedAbV2OpeningsManifestCoreForTests,
  formalPairedAbV2CanonicalJson,
  formalPairedAbV2GameIdForTests,
  formalPairedAbV2OpeningIdForTests,
  formalPairedAbV2SourceGameIdForTests,
  preflightFormalPairedAbV2OpeningsManifestCoreForTests,
  type FormalPairedAbV2SourceGames,
} from "../../../ml/formal-paired-ab-v2-openings";

function source(
  movesByGame: readonly (readonly string[])[],
): FormalPairedAbV2SourceGames {
  return {
    schema: FORMAL_PAIRED_AB_V2_SOURCE_GAMES_SCHEMA,
    games: movesByGame.map((moves) => ({
      source_game_id: formalPairedAbV2SourceGameIdForTests(moves),
      usi_moves: [...moves],
    })),
  };
}

const FIRST = ["7g7f", "3c3d"] as const;
const SECOND = ["2g2f", "8c8d"] as const;

describe("formal paired A/B v2 label-blind openings", () => {
  it("builds deterministically, uses safe seeds, and passes production rules", () => {
    const first = buildFormalPairedAbV2OpeningsManifestCoreForTests(
      source([FIRST, SECOND]),
      2,
      2,
    );
    const reversed = buildFormalPairedAbV2OpeningsManifestCoreForTests(
      source([SECOND, FIRST]),
      2,
      2,
    );

    expect(formalPairedAbV2CanonicalJson(first)).toBe(
      formalPairedAbV2CanonicalJson(reversed),
    );
    expect(first.pairs).toHaveLength(2);
    expect(new Set(first.pairs.map((pair) => pair.source_game_id)).size).toBe(
      2,
    );
    expect(
      first.pairs.every(
        (pair) =>
          Number.isSafeInteger(pair.seed) &&
          pair.seed >= 1 &&
          pair.seed <= Number.MAX_SAFE_INTEGER,
      ),
    ).toBe(true);
    expect(first.pairs.flatMap((pair) => pair.games)).toHaveLength(4);

    expect(
      preflightFormalPairedAbV2OpeningsManifestCoreForTests(first, 2, 2),
    ).toMatchObject({
      status: "PASS",
      pairs: 2,
      games: 4,
      source_games: 2,
      semantic_final_positions: 2,
    });
  });

  it("rejects labels, illegal moves, duplicate sources, and transposed finals", () => {
    const labeled = source([FIRST, SECOND]) as unknown as {
      games: Array<Record<string, unknown>>;
    };
    labeled.games[0].winner = "sente";
    expect(() =>
      buildFormalPairedAbV2OpeningsManifestCoreForTests(
        labeled as unknown as FormalPairedAbV2SourceGames,
        2,
        2,
      ),
    ).toThrow(/fields differ/u);

    expect(() =>
      buildFormalPairedAbV2OpeningsManifestCoreForTests(
        source([["7g7f", "7g7f"], SECOND]),
        2,
        2,
      ),
    ).toThrow(/illegal/u);

    const duplicate = source([FIRST, SECOND]);
    const duplicateSource = {
      ...duplicate,
      games: [
        duplicate.games[0],
        {
          ...duplicate.games[1],
          source_game_id: duplicate.games[0].source_game_id,
        },
      ],
    };
    expect(() =>
      buildFormalPairedAbV2OpeningsManifestCoreForTests(duplicateSource, 2, 2),
    ).toThrow(/identity is invalid or duplicated/u);

    const transpositionA = ["7g7f", "3c3d", "2g2f", "8c8d"] as const;
    const transpositionB = ["2g2f", "8c8d", "7g7f", "3c3d"] as const;
    expect(() =>
      buildFormalPairedAbV2OpeningsManifestCoreForTests(
        source([transpositionA, transpositionB]),
        4,
        2,
      ),
    ).toThrow(/only 1 semantically unique nonterminal openings/u);
  });

  it("rejects a legally parsed but terminal final position", () => {
    const checkmate = "4k4/4+R4/5G3/9/9/9/9/9/4K4 w - 17";
    const opening = { sfen: checkmate, usi_moves: [] };
    const openingId = formalPairedAbV2OpeningIdForTests(opening);
    const manifest = {
      schema: "shogi-formal-paired-ab-v2-wasm-openings-manifest-v2" as const,
      source_manifest_sha256: "a".repeat(64),
      selection_rule: {
        label_blind: true as const,
        opening_ply: 0,
        ranking: "sha256-domain-source-game-id-byte-order" as const,
        duplicate_policy: "keep-first-ranked-semantic-final-position" as const,
        required_openings: 1,
      },
      pairs: [
        {
          pair_index: 0,
          source_game_id: `sha256:${"b".repeat(64)}`,
          opening_id: openingId,
          opening,
          seed: 1,
          games: [
            {
              game_index: 0 as const,
              game_id: formalPairedAbV2GameIdForTests(openingId, 0, 0, "sente"),
              candidate_color: "sente" as const,
            },
            {
              game_index: 1 as const,
              game_id: formalPairedAbV2GameIdForTests(openingId, 0, 1, "gote"),
              candidate_color: "gote" as const,
            },
          ] as const,
        },
      ],
    };
    expect(() =>
      preflightFormalPairedAbV2OpeningsManifestCoreForTests(manifest, 0, 1),
    ).toThrow(/final position is terminal/u);
  });

  it("keeps the production extraction and accounting constants fixed", () => {
    expect(FORMAL_PAIRED_AB_V2_OPENING_PLY).toBe(16);
    expect(FORMAL_PAIRED_AB_V2_OPENING_COUNT).toBe(384);
  });
});
