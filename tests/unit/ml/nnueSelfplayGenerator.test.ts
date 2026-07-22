import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { GenerateMovesImproved } from "../../../src/components/game/ShogiImproved/GenerateMovesImproved";
import { InitialPositionImproved } from "../../../src/components/game/ShogiImproved/InitialPositionImproved";
import {
  GOTE,
  SENTE,
  Te,
} from "../../../src/components/game/ShogiImproved/types";
import { positionKeyFromSfen } from "../../../ml/sibling-data";
import {
  NNUE_SELFPLAY_GAME_SCHEMA,
  buildSelfplayGameId,
  buildTestCuratedOpening,
  canonicalSelfplayJson,
  outcomeForSelfplaySide,
  parsePinnedOpeningCorpus,
  parseSelfplayArgs,
  playAndLabelSelfplayGame,
  recoverSelfplayWorkerProgress,
  selfplayRepetitionKey,
  selfplayRunFingerprintForBinding,
  shouldSampleSelfplayPly,
  summarizeSelfplayGeneration,
  terminalForNoLegalMoves,
  validateSelfplayPositionInvariant,
  verifyCompletedSelfplayShard,
  writeCanonicalExclusive,
  type FixedDepthActor,
  type FixedDepthSearchResult,
  type SelfplayGameConfig,
} from "../../../ml/generate-nnue-selfplay";

const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

function baseArgs(extra: readonly string[] = []): string[] {
  return [
    "--weights",
    "/tmp/weights.bin",
    "--weights-sha",
    SHA_A,
    "--wasm",
    "/tmp/research.wasm",
    "--wasm-sha",
    SHA_B,
    "--expected-buckets",
    "81",
    "--out-dir",
    "/tmp/selfplay",
    "--cycle",
    "0",
    "--game-start",
    "0",
    "--games",
    "20",
    "--workers",
    "2",
    "--seed",
    "100000",
    "--play-depth",
    "2",
    "--label-depth",
    "4",
    ...extra,
  ];
}

class FirstLegalActor implements FixedDepthActor {
  clears = 0;

  constructor(private readonly scoreMultiplier: number) {}

  clearTT(): void {
    this.clears += 1;
  }

  search(
    position: ReturnType<typeof InitialPositionImproved.createInitialPosition>,
    _ply: number,
    depth: number,
  ): FixedDepthSearchResult {
    const move = GenerateMovesImproved.generateLegalMoves(position)[0];
    if (!move) throw new Error("fixture reached a terminal unexpectedly");
    return {
      move,
      moveUsi: `${move.from}-${move.to}`,
      score: depth * this.scoreMultiplier,
      completedDepth: depth,
      nodes: depth * 10,
      leaves: depth * 20,
    };
  }
}

describe("NNUE selfplay generator", () => {
  it("publishes manifests atomically, cleans failed temporaries, and refuses replacement", () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), "nnue-selfplay-manifest-test-"),
    );
    temporaryDirectories.push(directory);
    const output = path.join(directory, "manifest.json");

    expect(() =>
      writeCanonicalExclusive(
        output,
        { complete: true, schema: "test-v1" },
        {
          writeBytes(descriptor, bytes) {
            fs.writeSync(descriptor, bytes, 0, Math.min(7, bytes.byteLength));
          },
        },
      ),
    ).toThrow(/temporary write length mismatch/);
    expect(fs.existsSync(output)).toBe(false);
    expect(fs.readdirSync(directory)).toEqual([]);

    expect(() =>
      writeCanonicalExclusive(
        output,
        { complete: true, schema: "test-v1" },
        {
          beforePublish() {
            throw new Error("injected pre-publish failure");
          },
        },
      ),
    ).toThrow(/injected pre-publish failure/);
    expect(fs.existsSync(output)).toBe(false);
    expect(fs.readdirSync(directory)).toEqual([]);

    const original = { complete: true, schema: "test-v1" };
    writeCanonicalExclusive(output, original);
    const originalBytes = `${canonicalSelfplayJson(original)}\n`;
    expect(fs.readFileSync(output, "utf8")).toBe(originalBytes);
    expect(fs.statSync(output).mode & 0o777).toBe(0o600);

    expect(() =>
      writeCanonicalExclusive(output, {
        complete: false,
        schema: "replacement",
      }),
    ).toThrow(/EEXIST/);
    expect(fs.readFileSync(output, "utf8")).toBe(originalBytes);
    expect(fs.readdirSync(directory)).toEqual(["manifest.json"]);
  });

  it("requires a pinned opening corpus in production and isolates the smoke-only seam", () => {
    expect(() => parseSelfplayArgs(baseArgs())).toThrow(
      /requires both --openings/,
    );
    const smoke = parseSelfplayArgs([
      ...baseArgs(),
      "--allow-test-curated-openings",
    ]);
    expect(smoke.allowTestCuratedOpenings).toBe(true);
    expect(smoke.openings).toBeNull();

    const production = parseSelfplayArgs([
      ...baseArgs(),
      "--openings",
      "/tmp/openings.jsonl",
      "--openings-sha",
      "c".repeat(64),
    ]);
    expect(production.openings).toBe("/tmp/openings.jsonl");
    expect(production.openingsSha256).toBe("c".repeat(64));

    expect(() =>
      parseSelfplayArgs([
        ...baseArgs(),
        "--openings",
        "/tmp/openings.jsonl",
        "--openings-sha",
        "c".repeat(64),
        "--allow-test-curated-openings",
      ]),
    ).toThrow(/cannot be combined/);
  });

  it("rejects misspelled, duplicate, and non-deeper configurations", () => {
    expect(() =>
      parseSelfplayArgs([
        ...baseArgs(),
        "--allow-test-curated-openings",
        "--workerz",
        "2",
      ]),
    ).toThrow(/unknown option/);
    expect(() =>
      parseSelfplayArgs([
        ...baseArgs(),
        "--allow-test-curated-openings",
        "--games",
        "22",
      ]),
    ).toThrow(/duplicate option/);
    const shallowLabel = baseArgs().map((value, index, all) =>
      all[index - 1] === "--label-depth" ? "2" : value,
    );
    expect(() =>
      parseSelfplayArgs([...shallowLabel, "--allow-test-curated-openings"]),
    ).toThrow(/greater/);
  });

  it("builds one deterministic, materially valid smoke opening per game", () => {
    const first = buildTestCuratedOpening(7, 100000);
    const repeated = buildTestCuratedOpening(7, 100000);
    const different = buildTestCuratedOpening(8, 100000);
    expect(first).toEqual(repeated);
    expect(first.openingId).not.toBe(different.openingId);
    expect(first.ply).toBe(6);
    expect(first.source).toBe("test-curated");
  });

  it("accepts the exported exact opening schema and rejects noncanonical or duplicate rows", () => {
    const first = buildTestCuratedOpening(0, 100000);
    const second = buildTestCuratedOpening(1, 100000);
    const rows = [
      {
        game_id: "source-game-0",
        opening_id: first.openingId,
        sfen: first.sfen,
      },
      {
        game_id: "source-game-1",
        opening_id: second.openingId,
        sfen: second.sfen,
      },
    ];
    const bytes = Buffer.from(
      `${rows.map(canonicalSelfplayJson).join("\n")}\n`,
    );
    expect(parsePinnedOpeningCorpus(bytes)).toMatchObject([
      { source: "pinned-corpus", sourceGameId: "source-game-0", ply: 6 },
      { source: "pinned-corpus", sourceGameId: "source-game-1", ply: 6 },
    ]);
    expect(() =>
      parsePinnedOpeningCorpus(
        Buffer.from(
          `{"sfen":${JSON.stringify(first.sfen)},"opening_id":${JSON.stringify(
            first.openingId,
          )},"game_id":"source-game-0"}\n`,
        ),
      ),
    ).toThrow(/not canonical JSON/);
    expect(() =>
      parsePinnedOpeningCorpus(
        Buffer.from(
          `${canonicalSelfplayJson(rows[0])}\n${canonicalSelfplayJson(rows[0])}\n`,
        ),
      ),
    ).toThrow(/opening_id repeats/);
  });

  it("directly accepts the authenticated Floodgate training.raw row schema", () => {
    const first = buildTestCuratedOpening(0, 100000);
    const positionId = `sha256:${"1".repeat(64)}`;
    const wrong = {
      game_id: "sha256:" + "2".repeat(64),
      parent_sfen: first.sfen,
      position_id: positionId,
    };
    expect(() =>
      parsePinnedOpeningCorpus(
        Buffer.from(`${canonicalSelfplayJson(wrong)}\n`),
      ),
    ).toThrow(/does not match parent_sfen/);

    const row = { ...wrong, position_id: positionKeyFromSfen(first.sfen) };
    expect(
      parsePinnedOpeningCorpus(Buffer.from(`${canonicalSelfplayJson(row)}\n`)),
    ).toMatchObject([
      {
        source: "pinned-floodgate-parent",
        sourceGameId: wrong.game_id,
        openingId: row.position_id,
        sfen: first.sfen,
      },
    ]);
    const authenticKeyOrder = `{"game_id":${JSON.stringify(
      wrong.game_id,
    )},"game_sha256":"${"3".repeat(64)}","parent_id":"sha256:${"4".repeat(
      64,
    )}","parent_sfen":${JSON.stringify(first.sfen)},"played_move":"7g7f","ply":6,"position_id":${JSON.stringify(
      row.position_id,
    )},"schema_version":1,"source":"floodgate","source_url":"https://example.test/game.csa"}\n`;
    expect(
      parsePinnedOpeningCorpus(Buffer.from(authenticKeyOrder)),
    ).toHaveLength(1);
    expect(() =>
      parsePinnedOpeningCorpus(
        Buffer.from(
          authenticKeyOrder.replace(
            '"game_id":',
            '"game_id":"duplicate","game_id":',
          ),
        ),
      ),
    ).toThrow(/repeats JSON key game_id/);
  });

  it("orients game outcomes to every sampled SFEN side to move", () => {
    expect(outcomeForSelfplaySide(SENTE, SENTE)).toBe(1);
    expect(outcomeForSelfplaySide(SENTE, GOTE)).toBe(0);
    expect(outcomeForSelfplaySide(GOTE, GOTE)).toBe(1);
    expect(outcomeForSelfplaySide(null, SENTE)).toBe(0.5);
  });

  it("uses full position identity for repetition and treats every no-move terminal as a loss", () => {
    const position = InitialPositionImproved.createInitialPosition();
    const originalKey = selfplayRepetitionKey(position, 0);
    position.HashVal ^= 0x3fff_ffff;
    expect(selfplayRepetitionKey(position, 0)).toBe(originalKey);
    position.toggleTeban();
    expect(selfplayRepetitionKey(position, 0)).not.toBe(originalKey);

    expect(terminalForNoLegalMoves(SENTE, false, 17)).toEqual({
      winner: GOTE,
      reason: "no-legal-move",
      plies: 17,
    });
    expect(terminalForNoLegalMoves(GOTE, true, 18)).toEqual({
      winner: SENTE,
      reason: "checkmate",
      plies: 18,
    });
  });

  it("samples only the fixed non-check schedule and enforces the cap", () => {
    const config = {
      minPly: 12,
      maxSamplePly: 180,
      sampleEvery: 4,
      maxSamplesPerGame: 24,
    };
    expect(shouldSampleSelfplayPly(12, false, 0, config)).toBe(true);
    expect(shouldSampleSelfplayPly(13, false, 0, config)).toBe(false);
    expect(shouldSampleSelfplayPly(16, true, 0, config)).toBe(false);
    expect(shouldSampleSelfplayPly(180, false, 23, config)).toBe(true);
    expect(shouldSampleSelfplayPly(180, false, 24, config)).toBe(false);
  });

  it("plays shallow fixed depth, labels after the terminal at deeper depth, and never flips cp", () => {
    const opening = buildTestCuratedOpening(0, 100000);
    const play = new FirstLegalActor(11);
    const label = new FirstLegalActor(101);
    const config: SelfplayGameConfig = {
      cycle: 0,
      globalGameIndex: 0,
      seed: 100000,
      runFingerprint: "d".repeat(64),
      actorWeightsSha256: SHA_A,
      playDepth: 2,
      labelDepth: 4,
      minPly: 8,
      maxSamplePly: 20,
      sampleEvery: 4,
      maxSamplesPerGame: 3,
      maxPlies: 22,
      opening,
    };
    const game = playAndLabelSelfplayGame(config, play, label);
    expect(game.schema).toBe(NNUE_SELFPLAY_GAME_SCHEMA);
    expect(game.result).toMatchObject({
      winner: null,
      reason: "max-plies",
      plies: 22,
    });
    expect(game.samples).toHaveLength(3);
    expect(Object.keys(game.samples[0]).sort()).toEqual(
      [
        "actor_weights_sha256",
        "cp",
        "game_id",
        "move",
        "opening_id",
        "outcome",
        "ply",
        "position_id",
        "result",
        "schema",
        "search",
        "sfen",
        "source_game_id",
      ].sort(),
    );
    expect(game.samples.map((sample) => sample.ply)).toEqual([8, 12, 16]);
    expect(game.samples.every((sample) => sample.cp === 404)).toBe(true);
    expect(game.samples.every((sample) => sample.search.depth === 4)).toBe(
      true,
    );
    expect(game.samples.every((sample) => sample.search.play_depth === 2)).toBe(
      true,
    );
    expect(
      game.samples.every((sample) => sample.search.label_depth === 4),
    ).toBe(true);
    expect(game.samples.every((sample) => sample.outcome === 0.5)).toBe(true);
    expect(
      new Set(game.samples.map((sample) => sample.source_game_id)),
    ).toEqual(new Set([opening.sourceGameId]));
    expect(play.clears).toBe(1);
    expect(label.clears).toBe(game.samples.length);
    expect(
      validateSelfplayPositionInvariant(
        InitialPositionImproved.createInitialPosition(),
      ),
    ).toEqual({ ok: true });
  });

  it("rejects an illegal actor move instead of selecting a random fallback", () => {
    const opening = buildTestCuratedOpening(0, 100000);
    const illegalActor: FixedDepthActor = {
      clearTT() {},
      search(position, _ply, depth) {
        const legal = GenerateMovesImproved.generateLegalMoves(position)[0];
        return {
          move: new Te(
            legal.koma,
            legal.from,
            legal.to ^ 1,
            legal.promote,
            legal.capture,
          ),
          moveUsi: "illegal",
          score: 0,
          completedDepth: depth,
          nodes: 1,
          leaves: 1,
        };
      },
    };
    const config: SelfplayGameConfig = {
      cycle: 0,
      globalGameIndex: 0,
      seed: 100000,
      runFingerprint: "d".repeat(64),
      actorWeightsSha256: SHA_A,
      playDepth: 2,
      labelDepth: 4,
      minPly: 12,
      maxSamplePly: 20,
      sampleEvery: 4,
      maxSamplesPerGame: 3,
      maxPlies: 22,
      opening,
    };
    expect(() =>
      playAndLabelSelfplayGame(config, illegalActor, new FirstLegalActor(1)),
    ).toThrow(/illegal move/);
  });

  it("derives game-index-specific IDs and resumes flat rows only through committed game offsets", () => {
    const opening = buildTestCuratedOpening(0, 100000);
    const common = {
      cycle: 0,
      seed: 100000,
      runFingerprint: "d".repeat(64),
      actorWeightsSha256: SHA_A,
      playDepth: 2,
      labelDepth: 4,
      minPly: 12,
      maxSamplePly: 20,
      sampleEvery: 4,
      maxSamplesPerGame: 3,
      maxPlies: 22,
      opening,
    };
    expect(buildSelfplayGameId({ ...common, globalGameIndex: 0 })).not.toBe(
      buildSelfplayGameId({ ...common, globalGameIndex: 1 }),
    );

    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), "nnue-selfplay-test-"),
    );
    temporaryDirectories.push(directory);
    const positions = path.join(directory, "positions.jsonl");
    const progress = path.join(directory, "progress.jsonl");
    fs.writeFileSync(positions, "row-one\nrow-two-partial");
    const progressRow = {
      schema: "shogi-nnue-selfplay-worker-progress-v1",
      run_fingerprint: "d".repeat(64),
      game_index: 0,
      game_id: buildSelfplayGameId({ ...common, globalGameIndex: 0 }),
      source_game_id: opening.sourceGameId,
      opening_id: opening.openingId,
      result: { reason: "max-plies", winner: null },
      samples: 1,
      positions_bytes: Buffer.byteLength("row-one\n"),
      records: 1,
    };
    fs.writeFileSync(
      progress,
      `${canonicalSelfplayJson(progressRow)}\npartial`,
    );
    expect(
      recoverSelfplayWorkerProgress(
        progress,
        positions,
        [0, 2],
        "d".repeat(64),
      ),
    ).toHaveLength(1);
    expect(fs.readFileSync(positions, "utf8")).toBe("row-one\n");
    expect(fs.readFileSync(progress, "utf8")).toBe(
      `${canonicalSelfplayJson(progressRow)}\n`,
    );
    expect(() =>
      recoverSelfplayWorkerProgress(progress, positions, [2], "d".repeat(64)),
    ).toThrow(/deterministic prefix/);
  });

  it("summarizes sampled, zero-sample, and terminal-reason counts without dropping games", () => {
    const progress = [
      {
        schema: "shogi-nnue-selfplay-worker-progress-v1" as const,
        run_fingerprint: "d".repeat(64),
        game_index: 0,
        game_id: `sha256:${"1".repeat(64)}`,
        source_game_id: "source-0",
        opening_id: `sha256:${"2".repeat(64)}`,
        result: { reason: "max-plies" as const, winner: null },
        samples: 3,
        positions_bytes: 300,
        records: 3,
      },
      {
        schema: "shogi-nnue-selfplay-worker-progress-v1" as const,
        run_fingerprint: "d".repeat(64),
        game_index: 1,
        game_id: `sha256:${"3".repeat(64)}`,
        source_game_id: "source-1",
        opening_id: `sha256:${"4".repeat(64)}`,
        result: { reason: "repetition" as const, winner: null },
        samples: 0,
        positions_bytes: 300,
        records: 3,
      },
    ];
    expect(summarizeSelfplayGeneration(2, progress)).toEqual({
      requested_games: 2,
      completed_games: 2,
      sampled_games: 1,
      zero_sample_games: 1,
      terminal_reasons: {
        checkmate: 0,
        "no-legal-move": 0,
        repetition: 1,
        "max-plies": 1,
      },
    });
  });

  it("rejects an old completed shard when weights, depth, seed, or sampling binding changes", () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), "nnue-selfplay-complete-test-"),
    );
    temporaryDirectories.push(directory);
    const shardDirectory = path.join(directory, "shard-000");
    fs.mkdirSync(shardDirectory);
    const opening = buildTestCuratedOpening(0, 100000);
    const binding = {
      weights_sha256: SHA_A,
      wasm_sha256: SHA_B,
      openings_sha256: "c".repeat(64),
      game_start: 0,
      games: 20,
      seed: 100000,
      play_depth: 2,
      label_depth: 4,
      sampling: { min_ply: 12, max_ply: 180, every: 4, max_per_game: 24 },
    };
    const originalFingerprint = selfplayRunFingerprintForBinding(binding);
    const game = playAndLabelSelfplayGame(
      {
        cycle: 0,
        globalGameIndex: 0,
        seed: 100000,
        runFingerprint: originalFingerprint,
        actorWeightsSha256: SHA_A,
        playDepth: 2,
        labelDepth: 4,
        minPly: 8,
        maxSamplePly: 20,
        sampleEvery: 4,
        maxSamplesPerGame: 3,
        maxPlies: 22,
        opening,
      },
      new FirstLegalActor(11),
      new FirstLegalActor(101),
    );
    const positions = Buffer.from(
      `${game.samples.map((sample) => canonicalSelfplayJson(sample)).join("\n")}\n`,
    );
    fs.writeFileSync(path.join(shardDirectory, "positions.jsonl"), positions);
    const manifest = {
      schema: "shogi-nnue-selfplay-shard-manifest-v1",
      complete: true,
      training_eligible: true,
      run_fingerprint: originalFingerprint,
      cycle: 0,
      shard_index: 0,
      shard_total: 2,
      generation: {
        requested_games: 10,
        completed_games: 10,
        sampled_games: 1,
        zero_sample_games: 9,
        terminal_reasons: {
          checkmate: 0,
          "no-legal-move": 0,
          repetition: 0,
          "max-plies": 10,
        },
      },
      output: {
        file: "positions.jsonl",
        bytes: positions.byteLength,
        sha256: createHash("sha256").update(positions).digest("hex"),
        records: game.samples.length,
        games: 1,
        unique_positions: new Set(
          game.samples.map((sample) => sample.position_id),
        ).size,
      },
    };
    fs.writeFileSync(
      path.join(shardDirectory, "manifest.json"),
      `${canonicalSelfplayJson(manifest)}\n`,
    );
    const args = parseSelfplayArgs([
      ...baseArgs(),
      "--openings",
      "/tmp/openings.jsonl",
      "--openings-sha",
      "c".repeat(64),
    ]);
    expect(() =>
      verifyCompletedSelfplayShard(
        shardDirectory,
        args,
        0,
        originalFingerprint,
      ),
    ).not.toThrow();

    const changedBindings = [
      { ...binding, weights_sha256: "9".repeat(64) },
      { ...binding, play_depth: 3 },
      { ...binding, seed: 100001 },
      { ...binding, sampling: { ...binding.sampling, every: 2 } },
    ];
    for (const changed of changedBindings) {
      expect(() =>
        verifyCompletedSelfplayShard(
          shardDirectory,
          args,
          0,
          selfplayRunFingerprintForBinding(changed),
        ),
      ).toThrow(/existing manifest is invalid/);
    }

    const incomplete = {
      ...manifest,
      generation: { ...manifest.generation, completed_games: 9 },
    };
    fs.writeFileSync(
      path.join(shardDirectory, "manifest.json"),
      `${canonicalSelfplayJson(incomplete)}\n`,
    );
    expect(() =>
      verifyCompletedSelfplayShard(
        shardDirectory,
        args,
        0,
        originalFingerprint,
      ),
    ).toThrow(/generation accounting is invalid/);
  });
});
