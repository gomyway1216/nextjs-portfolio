import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  CLEAN_RECEIPT_SCHEMA,
  FIXED_PARENTS_PER_SHARD,
  FIXED_SEALED_PARENTS,
  FIXED_SHARDS,
  LABEL_RECEIPT_SCHEMA,
  SEALED_HASH_DOMAIN,
  buildCleanDerivative,
  finalizeLabelShards,
  labelAndPublishShard,
  publishCleanAndSelection,
  requireRegisteredCleanIdentity,
  selectSealedParents,
  shardSlices,
  type FileIdentity,
  type ShardBinding,
  type ShardShape,
} from "../../../ml/child_board_sealed512_pipeline";
import type {
  FixedMoveTeacher,
  SelectedConfusionParent,
} from "../../../ml/build-browser-confusion-ranking-teacher";
import type { FloodgateTrainingParent } from "../../../ml/floodgate-training-row-validation";
import {
  buildSiblingGroup,
  compareBytewise,
  positionKeyFromSfen,
} from "../../../ml/sibling-data";
import {
  childSfenAfterUsi,
  positionFromSfen,
  rulesCompleteLegalMoves,
} from "../../../ml/shogi-sfen";

const START = "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1";
const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function temporaryRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sealed512-test-"));
  temporaryRoots.push(root);
  return root;
}

function row(
  parentSfen: string,
  gameId: string,
  parentId: string,
): Readonly<FloodgateTrainingParent> {
  const parsed = positionFromSfen(parentSfen);
  const played = rulesCompleteLegalMoves(parsed.position)
    .map((move) => move.usi)
    .sort(compareBytewise)[0];
  return Object.freeze({
    schema_version: 1 as const,
    game_id: gameId,
    parent_id: parentId,
    position_id: positionKeyFromSfen(parentSfen),
    parent_sfen: parentSfen,
    ply: parsed.moveNumber - 1,
    played_move: played,
  });
}

function rawLine(value: Readonly<FloodgateTrainingParent>): Uint8Array {
  return Buffer.from(`${JSON.stringify(value)}\n`, "utf8");
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function fileIdentity(name: string, marker: string): FileIdentity {
  return Object.freeze({
    path: `/fixed/${name}`,
    bytes: marker.length + 10,
    sha256: digest(marker),
  });
}

function binding(): ShardBinding {
  return Object.freeze({
    parentProtocolSha256: "a".repeat(64),
    cleanDerivativeReceiptSha256: "b".repeat(64),
    selectionReceiptSha256: "c".repeat(64),
    legalEnumerator: fileIdentity("shogi-sfen.ts", "legal"),
    teacherReceipt: fileIdentity("teacher-receipt.json", "teacher"),
    depth: 12,
  });
}

const unusedTeacher: FixedMoveTeacher = {
  async resetForParent() {
    throw new Error("custom labeler must not call teacher");
  },
  async search() {
    throw new Error("custom labeler must not call teacher");
  },
};

async function syntheticLabeler(parent: SelectedConfusionParent) {
  const candidates = parent.legal_moves.map((move, index) => ({
    move,
    child_sfen: childSfenAfterUsi(parent.parent_sfen, move),
    sources: ["all-legal-fixed-depth-teacher"],
    teacher_parent_cp: parent.legal_moves.length - index,
    teacher_rank: index + 1,
    teacher_score_kind: "cp" as const,
  }));
  return {
    records: buildSiblingGroup(
      {
        game_id: parent.game_id,
        parent_id: parent.parent_id,
        position_id: parent.position_id,
        parent_sfen: parent.parent_sfen,
        parent_ply: parent.parent_ply,
      },
      candidates,
    ),
  };
}

function selectedRows(count: number): Readonly<FloodgateTrainingParent>[] {
  return Array.from({ length: count }, (_, index) =>
    row(
      START,
      `game-${Math.floor(index / 2)}`,
      `parent-${index.toString().padStart(3, "0")}`,
    ),
  );
}

describe("child-board sealed512 pipeline", () => {
  it("freezes the production 512 = 16 x 32 shard arithmetic", () => {
    expect(FIXED_SEALED_PARENTS).toBe(512);
    expect(FIXED_SHARDS).toBe(16);
    expect(FIXED_PARENTS_PER_SHARD).toBe(32);
    const slices = shardSlices(selectedRows(512));
    expect(slices).toHaveLength(16);
    expect(slices.every((slice) => slice.length === 32)).toBe(true);
    expect(slices.flat().map((entry) => entry.parent_id)).toEqual(
      selectedRows(512).map((entry) => entry.parent_id),
    );
  });

  it("drops a complete game on any parent or rules-complete child overlap", () => {
    const after7g7f = childSfenAfterUsi(START, "7g7f");
    const after2g2f = childSfenAfterUsi(START, "2g2f");
    const rows = [
      row(START, "game-a", "parent-a0"),
      row(after7g7f, "game-a", "parent-a1"),
      row(after2g2f, "game-b", "parent-b0"),
    ];
    const lines = rows.map(rawLine);
    const knownChild = positionKeyFromSfen(childSfenAfterUsi(START, "9g9f"));
    const clean = buildCleanDerivative(rows, lines, new Set([knownChild]));
    expect(clean.receipt.schema).toBe(CLEAN_RECEIPT_SCHEMA);
    expect(clean.droppedGameIds).toEqual(["game-a"]);
    expect(clean.rows.map((entry) => entry.parent_id)).toEqual(["parent-b0"]);
    expect(Buffer.from(clean.bytes)).toEqual(Buffer.from(lines[2]));
    expect(
      (clean.receipt.output as { known_eval_semantic_overlap: number })
        .known_eval_semantic_overlap,
    ).toBe(0);
    expect(clean.receipt).toMatchObject({
      teacher_labels_opened: false,
      candidate_scores_opened: false,
      live_weights_changed: false,
    });
  });

  it("uses hash priority with an exact per-game cap before slicing", () => {
    const rows = Array.from({ length: 8 }, (_, index) =>
      row(START, `game-${Math.floor(index / 2)}`, `parent-${index}`),
    );
    const selection = selectSealedParents(rows, 3, 1);
    expect(selection.rows).toHaveLength(3);
    expect(new Set(selection.rows.map((entry) => entry.game_id)).size).toBe(3);
    const expected: typeof rows = [];
    const counts = new Map<string, number>();
    for (const entry of [...rows].sort((left, right) => {
      const leftHash = digest(`${SEALED_HASH_DOMAIN}${left.parent_id}`);
      const rightHash = digest(`${SEALED_HASH_DOMAIN}${right.parent_id}`);
      return (
        compareBytewise(leftHash, rightHash) ||
        compareBytewise(left.parent_id, right.parent_id)
      );
    })) {
      if ((counts.get(entry.game_id) ?? 0) >= 1) continue;
      expected.push(entry);
      counts.set(entry.game_id, 1);
      if (expected.length === 3) break;
    }
    expect(selection.rows.map((entry) => entry.parent_id)).toEqual(
      expected.map((entry) => entry.parent_id),
    );
    expect(selection.receipt).toMatchObject({
      parents: 3,
      maximum_parents_per_game: 1,
      teacher_labels_opened: false,
      candidate_scores_opened: false,
    });
  });

  it("requires the preregistered clean identity and terminalizes exact preparation files", async () => {
    const root = temporaryRoot();
    const rows = [
      row(START, "game-a", "parent-a"),
      row(childSfenAfterUsi(START, "7g7f"), "game-b", "parent-b"),
    ];
    const clean = buildCleanDerivative(rows, rows.map(rawLine), new Set());
    const expected = {
      ...(clean.receipt.output as {
        bytes: number;
        sha256: string;
        parents: number;
        games: number;
        game_ids_sha256: string;
        parent_ids_sha256: string;
        position_ids_sha256: string;
        known_eval_semantic_overlap: 0;
      }),
    };
    requireRegisteredCleanIdentity(clean, expected);
    expect(() =>
      requireRegisteredCleanIdentity(clean, {
        ...expected,
        sha256: "0".repeat(64),
      }),
    ).toThrow(/preregistered identity/);
    const selection = selectSealedParents(clean.rows, 2, 1);
    const paths = {
      cleanDerivative: path.join(root, "clean.jsonl"),
      cleanDerivativeReceipt: path.join(root, "clean-receipt.json"),
      selectedParentIds: path.join(root, "selected.txt"),
      selectionReceipt: path.join(root, "selection-receipt.json"),
    };
    const first = await publishCleanAndSelection(
      clean,
      selection,
      expected,
      paths,
    );
    const recovered = await publishCleanAndSelection(
      clean,
      selection,
      expected,
      paths,
    );
    expect(recovered).toEqual(first);
    expect(fs.readFileSync(paths.cleanDerivative)).toEqual(
      Buffer.from(clean.bytes),
    );
    expect(fs.readFileSync(paths.selectedParentIds)).toEqual(
      Buffer.from(selection.parentIdsBytes),
    );
    fs.appendFileSync(paths.selectedParentIds, "tamper\n");
    await expect(
      publishCleanAndSelection(clean, selection, expected, paths),
    ).rejects.toThrow(/existing create-only output differs/);
  });

  it("reuses all-legal labeling and resumes only exact immutable content-addressed shards", async () => {
    const root = temporaryRoot();
    const shape: ShardShape = { parents: 4, shards: 2, parentsPerShard: 2 };
    const selected = selectedRows(4);
    const options = {
      selectedRows: selected,
      shardIndex: 0,
      shape,
      binding: binding(),
      shardDirectory: path.join(root, "shards"),
      receiptDirectory: path.join(root, "receipts"),
      teacher: unusedTeacher,
      labeler: syntheticLabeler,
      verifyBindingFiles: false,
    };
    const first = await labelAndPublishShard(options);
    expect(first.recovered).toBe(false);
    expect(first.parents).toBe(2);
    expect(first.output.path).toContain(first.contentAddress);
    const records = fs
      .readFileSync(first.output.path, "utf8")
      .trimEnd()
      .split("\n")
      .map((line) => JSON.parse(line) as { parent_id: string; move: string });
    expect([...new Set(records.map((entry) => entry.parent_id))]).toEqual(
      selected.slice(0, 2).map((entry) => entry.parent_id),
    );
    for (const parentId of selected
      .slice(0, 2)
      .map((entry) => entry.parent_id)) {
      const moves = records
        .filter((entry) => entry.parent_id === parentId)
        .map((entry) => entry.move);
      expect(moves).toEqual([...moves].sort(compareBytewise));
      expect(moves).toHaveLength(
        rulesCompleteLegalMoves(positionFromSfen(START).position).length,
      );
    }

    const recovered = await labelAndPublishShard({
      ...options,
      labeler: async () => {
        throw new Error("valid shard must not be relabeled");
      },
    });
    expect(recovered.recovered).toBe(true);
    expect(recovered.output).toEqual(first.output);

    const receiptBytes = fs.readFileSync(first.receipt.path);
    fs.writeFileSync(
      first.receipt.path,
      receiptBytes
        .toString("utf8")
        .replace(
          '"status":"complete-immutable-content-addressed-label-shard"',
          '"status":"duplicate","status":"complete-immutable-content-addressed-label-shard"',
        ),
    );
    await expect(labelAndPublishShard(options)).rejects.toThrow(
      /canonical duplicate-free JSON/,
    );
    fs.writeFileSync(first.receipt.path, receiptBytes);
    fs.appendFileSync(first.output.path, "tamper\n");
    await expect(labelAndPublishShard(options)).rejects.toThrow(
      /receipt mismatch/,
    );
  });

  it("verifies legal-enumerator and teacher-receipt bytes before shard recovery", async () => {
    const root = temporaryRoot();
    const legalPath = path.join(root, "shogi-sfen.ts");
    const teacherPath = path.join(root, "teacher-receipt.json");
    fs.writeFileSync(legalPath, "fixed legal enumerator");
    fs.writeFileSync(teacherPath, "fixed teacher receipt");
    const boundIdentity = (file: string): FileIdentity => {
      const bytes = fs.readFileSync(file);
      return {
        path: file,
        bytes: bytes.byteLength,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      };
    };
    const verifiedBinding: ShardBinding = {
      ...binding(),
      legalEnumerator: boundIdentity(legalPath),
      teacherReceipt: boundIdentity(teacherPath),
    };
    const options = {
      selectedRows: selectedRows(2),
      shardIndex: 0,
      shape: { parents: 2, shards: 1, parentsPerShard: 2 },
      binding: verifiedBinding,
      shardDirectory: path.join(root, "shards"),
      receiptDirectory: path.join(root, "receipts"),
      teacher: unusedTeacher,
      labeler: syntheticLabeler,
    };
    const published = await labelAndPublishShard(options);
    expect(published.recovered).toBe(false);
    fs.appendFileSync(teacherPath, "tamper");
    await expect(labelAndPublishShard(options)).rejects.toThrow(
      /teacher receipt byte\/SHA identity mismatch/,
    );
  });

  it("terminalizes complete labels after a crash without relabeling shards", async () => {
    const root = temporaryRoot();
    const shape: ShardShape = { parents: 4, shards: 2, parentsPerShard: 2 };
    const selected = selectedRows(4);
    const shards = [];
    for (let index = 0; index < shape.shards; index += 1) {
      shards.push(
        await labelAndPublishShard({
          selectedRows: selected,
          shardIndex: index,
          shape,
          binding: binding(),
          shardDirectory: path.join(root, "shards"),
          receiptDirectory: path.join(root, "receipts"),
          teacher: unusedTeacher,
          labeler: syntheticLabeler,
          verifyBindingFiles: false,
        }),
      );
    }
    const labelsPath = path.join(root, "labels.jsonl");
    const receiptPath = path.join(root, "label-receipt.json");
    await expect(
      finalizeLabelShards({
        shards,
        labelsPath,
        labelReceiptPath: receiptPath,
        expectedParents: 4,
        faultAfterLabels: true,
      }),
    ).rejects.toThrow(/injected fault/);
    expect(fs.existsSync(labelsPath)).toBe(true);
    expect(fs.existsSync(receiptPath)).toBe(false);

    const terminal = await finalizeLabelShards({
      shards,
      labelsPath,
      labelReceiptPath: receiptPath,
      expectedParents: 4,
    });
    expect(terminal.schema).toBe(LABEL_RECEIPT_SCHEMA);
    expect(terminal.recovery).toBe("fresh-or-terminalize-only-complete");
    expect(terminal).toMatchObject({
      parents: 4,
      shards: 2,
      candidate_scores_opened: false,
      live_weights_changed: false,
    });
    expect(fs.readFileSync(labelsPath)).toEqual(
      Buffer.concat(shards.map((shard) => fs.readFileSync(shard.output.path))),
    );
  });
});
