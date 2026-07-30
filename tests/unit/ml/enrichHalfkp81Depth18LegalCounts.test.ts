import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  LEGAL_COUNT_MANIFEST_SCHEMA,
  LEGAL_COUNT_RULES_CLOSURE_RELATIVE_PATHS,
  LEGAL_COUNT_TOOL_RELATIVE_PATH,
  canonicalJson,
  enrichHalfkp81Depth18LegalCounts,
} from "../../../ml/enrich_halfkp81_depth18_legal_counts";
import { positionKeyFromSfen } from "../../../ml/sibling-data";
import {
  childSfenAfterUsi,
  positionFromSfen,
  rulesCompleteLegalMoves,
} from "../../../ml/shogi-sfen";

const START = "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1";
const FORCED = "4k4/2B6/3GRG3/9/9/9/9/9/K8 w - 1";
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function temporaryRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "legal-counts-test-"));
  roots.push(root);
  return root;
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function gameId(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function row(sfen: string, game: string): Record<string, unknown> {
  const parsed = positionFromSfen(sfen);
  const legal = rulesCompleteLegalMoves(parsed.position);
  return {
    schema: "shogi-floodgate-scratch-warm-teacher-v1",
    split: "train",
    game_id: gameId(game),
    game_sha256: "a".repeat(64),
    position_id: positionKeyFromSfen(sfen),
    sfen,
    ply: parsed.moveNumber - 1,
    played_move: legal[0].usi,
    ratings: { sente: 4100, gote: 4050 },
    cp: 25,
    bestmove: (legal[1] ?? legal[0]).usi,
    depth: 12,
    outcome: 0.5,
  };
}

function writeInput(
  root: string,
  rows: readonly Record<string, unknown>[],
  transform?: (text: string) => string,
): {
  readonly input: string;
  readonly bytes: Buffer;
} {
  fs.mkdirSync(root, { recursive: true });
  const input = path.join(root, "input.jsonl");
  const canonical = `${rows.map((value) => JSON.stringify(value)).join("\n")}\n`;
  const bytes = Buffer.from(transform?.(canonical) ?? canonical, "utf8");
  fs.writeFileSync(input, bytes, { mode: 0o444 });
  fs.chmodSync(input, 0o444);
  return { input, bytes };
}

async function run(
  root: string,
  input: string,
  bytes: Buffer,
  rows: number,
  suffix = "one",
) {
  const directory = path.join(root, suffix);
  return enrichHalfkp81Depth18LegalCounts({
    input,
    inputBytes: bytes.byteLength,
    inputSha256: sha256(bytes),
    inputRows: rows,
    output: path.join(directory, "enriched.jsonl"),
    manifest: path.join(directory, "manifest.json"),
  });
}

describe("HalfKP81 depth18 legal-count enrichment", () => {
  it("preserves canonical row order, adds exact counts, and binds accounting", async () => {
    const root = temporaryRoot();
    const second = childSfenAfterUsi(START, "7g7f");
    const fixture = writeInput(root, [
      row(START, "game-a"),
      row(second, "game-b"),
      row(FORCED, "game-c"),
    ]);

    const manifest = await run(root, fixture.input, fixture.bytes, 3);
    const outputPath = path.join(root, "one", "enriched.jsonl");
    const output = fs.readFileSync(outputPath, "utf8");
    const outputRows = output
      .slice(0, -1)
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);

    expect(manifest.schema).toBe(LEGAL_COUNT_MANIFEST_SCHEMA);
    expect(manifest.tool.relative_path).toBe(LEGAL_COUNT_TOOL_RELATIVE_PATH);
    expect(manifest.rules_closure.map((value) => value.relative_path)).toEqual(
      LEGAL_COUNT_RULES_CLOSURE_RELATIVE_PATHS,
    );
    for (const identity of manifest.rules_closure) {
      expect(identity.held_read_only_descriptor).toBe(true);
      expect(identity.stable_double_read).toBe(true);
      expect(identity.bytes).toBeGreaterThan(0);
      expect(identity.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(fs.readFileSync(identity.path).byteLength).toBe(identity.bytes);
      expect(sha256(fs.readFileSync(identity.path))).toBe(identity.sha256);
    }
    expect(outputRows.map((value) => value.game_id)).toEqual([
      gameId("game-a"),
      gameId("game-b"),
      gameId("game-c"),
    ]);
    expect(outputRows.map((value) => value.legal_move_count)).toEqual([
      rulesCompleteLegalMoves(positionFromSfen(START).position).length,
      rulesCompleteLegalMoves(positionFromSfen(second).position).length,
      1,
    ]);
    expect(output.split("\n").slice(0, -1)).toEqual(
      outputRows.map((value) => canonicalJson(value)),
    );
    expect(manifest.accounting.side_to_move_b).toBe(1);
    expect(manifest.accounting.side_to_move_w).toBe(2);
    expect(manifest.accounting.legal_move_count_at_most_one).toBe(1);
    expect(manifest.accounting.legal_move_count_one).toBe(1);
    expect(manifest.validation.recorded_moves_legal).toBe(true);
    expect(manifest.output.sha256).toBe(sha256(Buffer.from(output)));
    expect(fs.statSync(outputPath).mode & 0o777).toBe(0o400);

    const manifestText = fs.readFileSync(
      path.join(root, "one", "manifest.json"),
      "utf8",
    );
    expect(manifestText).toBe(`${canonicalJson(manifest)}\n`);
  });

  it("is byte deterministic for the same authenticated input", async () => {
    const root = temporaryRoot();
    const fixture = writeInput(root, [row(START, "game-a")]);

    const first = await run(root, fixture.input, fixture.bytes, 1, "one");
    const second = await run(root, fixture.input, fixture.bytes, 1, "two");

    expect(fs.readFileSync(path.join(root, "one", "enriched.jsonl"))).toEqual(
      fs.readFileSync(path.join(root, "two", "enriched.jsonl")),
    );
    expect(first.output).toEqual(second.output);
    expect(first.accounting).toEqual(second.accounting);
  });

  it("accepts the formal WDL source's optional mate and decimal outcome encoding", async () => {
    const root = temporaryRoot();
    const fixture = writeInput(root, [row(START, "mate-game")], (text) =>
      text.replace(',"outcome":0.5}\n', ',"mate":-4,"outcome":1.0}\n'),
    );

    const manifest = await run(root, fixture.input, fixture.bytes, 1);
    const enriched = JSON.parse(
      fs.readFileSync(path.join(root, "one", "enriched.jsonl"), "utf8"),
    ) as Record<string, unknown>;

    expect(enriched.mate).toBe(-4);
    expect(enriched.outcome).toBe(1);
    expect(manifest.input.row_schema).toBe(
      "shogi-floodgate-scratch-warm-teacher-v1",
    );
    expect(manifest.validation.source_jsonl_contract).toBe(
      "fixed-schema-compact-canonical-v1",
    );
  });

  it("rejects writable, unauthenticated, and noncanonical JSONL inputs", async () => {
    const root = temporaryRoot();
    const writable = writeInput(root, [row(START, "game-a")]);
    fs.chmodSync(writable.input, 0o644);
    await expect(
      run(root, writable.input, writable.bytes, 1, "writable"),
    ).resolves.toMatchObject({
      input: {
        held_read_only_descriptor: true,
        stable_double_read: true,
      },
    });

    await expect(
      enrichHalfkp81Depth18LegalCounts({
        input: writable.input,
        inputBytes: writable.bytes.byteLength,
        inputSha256: "0".repeat(64),
        inputRows: 1,
        output: path.join(root, "bad-sha", "out.jsonl"),
        manifest: path.join(root, "bad-sha", "manifest.json"),
      }),
    ).rejects.toThrow(/SHA-256/);

    const noncanonicalRoot = path.join(root, "noncanonical-fixture");
    fs.mkdirSync(noncanonicalRoot);
    const noncanonical = writeInput(
      noncanonicalRoot,
      [row(START, "game-a")],
      (text) => text.replace('{"schema"', '{ "schema"'),
    );
    await expect(
      run(root, noncanonical.input, noncanonical.bytes, 1, "noncanonical"),
    ).rejects.toThrow(/not fixed-schema canonical JSON/);
  });

  it("rejects noncanonical SFEN, ply drift, and position identity drift", async () => {
    const root = temporaryRoot();
    const noncanonical = row(` ${START}`, "game-a");
    const first = writeInput(path.join(root, "noncanonical"), [noncanonical]);
    await expect(
      run(root, first.input, first.bytes, 1, "bad-sfen"),
    ).rejects.toThrow(/sfen is not canonical/);

    const wrongPly = { ...row(START, "game-b"), ply: 1 };
    const second = writeInput(path.join(root, "ply"), [wrongPly]);
    await expect(
      run(root, second.input, second.bytes, 1, "bad-ply"),
    ).rejects.toThrow(/ply does not match/);

    const wrongId = {
      ...row(START, "game-c"),
      position_id: `sha256:${"0".repeat(64)}`,
    };
    const third = writeInput(path.join(root, "identity"), [wrongId]);
    await expect(
      run(root, third.input, third.bytes, 1, "bad-id"),
    ).rejects.toThrow(/position_id does not match/);
  });

  it("rejects duplicate positions and pre-enriched rows", async () => {
    const root = temporaryRoot();
    const duplicated = writeInput(path.join(root, "duplicate"), [
      row(START, "game-a"),
      row(START, "game-b"),
    ]);
    await expect(
      run(root, duplicated.input, duplicated.bytes, 2, "duplicate-out"),
    ).rejects.toThrow(/duplicates position_id/);

    const preEnriched = writeInput(path.join(root, "pre-enriched"), [
      { ...row(START, "game-a"), legal_move_count: 30 },
    ]);
    await expect(
      run(root, preEnriched.input, preEnriched.bytes, 1, "pre-enriched-out"),
    ).rejects.toThrow(/already has legal_move_count/);
  });

  it("rejects a recorded move that is not legal in its parent position", async () => {
    const root = temporaryRoot();
    const illegal = writeInput(root, [
      { ...row(START, "game-a"), played_move: "1a1b" },
    ]);

    await expect(
      run(root, illegal.input, illegal.bytes, 1, "illegal-move"),
    ).rejects.toThrow(/recorded move is not legal/);
  });
});
