import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(__dirname, "../../..");
const evidenceRelative =
  "docs/data/floodgate-v7-local-clean-room-teacher-second-run-verification-stop-2026-07-19.json";
const japaneseRelative =
  "docs/blog-shogi-floodgate-v7-local-clean-room-teacher-second-run-verification-stop.md";
const englishRelative =
  "docs/blog-shogi-floodgate-v7-local-clean-room-teacher-second-run-verification-stop.en.md";
const readmeRelative = "ml/README.md";
const gitEnvironment = Object.freeze({
  LANG: "C",
  LC_ALL: "C",
  NODE_ENV: "test",
  PATH: "/usr/bin:/bin",
});

function read(relative: string): string {
  return fs.readFileSync(path.join(repositoryRoot, relative), "utf8");
}

function evidence(): Record<string, unknown> {
  return JSON.parse(read(evidenceRelative)) as Record<string, unknown>;
}

function gitOutput(arguments_: readonly string[]): string {
  return execFileSync("/usr/bin/git", arguments_, {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: gitEnvironment,
  }).trim();
}

function gitIsAncestor(ancestor: string): boolean {
  const result = spawnSync(
    "/usr/bin/git",
    ["--no-replace-objects", "merge-base", "--is-ancestor", ancestor, "HEAD"],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: gitEnvironment,
    },
  );
  if (result.error) throw result.error;
  if (result.status === 0) return true;
  if (result.status === 1) return false;
  throw new Error(
    `git ancestry check failed with status ${String(result.status)}`,
  );
}

describe("Floodgate v7 second local teacher verification-stop evidence", () => {
  it("pins the exact diagnostic implementation revision and tree", () => {
    const record = evidence();
    expect(record).toMatchObject({
      schema:
        "shogi-floodgate-v7-local-clean-room-teacher-second-run-verification-stop-evidence-v1",
      status: "STOP-VERIFICATION-ROOT-CAUSE-CONFIRMED",
      diagnostic_remediation: {
        implementation_revision: "2caf94335d679139b977e9bacdacabca212a2624",
        implementation_tree: "f56ca3652ca9165fdadcd7a4e16ab9ed35407493",
        focused_tests: {
          files: 6,
          tests_passed: 60,
          tests_failed: 0,
        },
      },
    });
    const diagnostic = record.diagnostic_remediation as {
      implementation_revision: string;
      implementation_tree: string;
    };
    expect(gitIsAncestor(diagnostic.implementation_revision)).toBe(true);
    expect(
      gitOutput([
        "--no-replace-objects",
        "show",
        "-s",
        "--format=%T",
        diagnostic.implementation_revision,
      ]),
    ).toBe(diagnostic.implementation_tree);
  });

  it("proves materialization completion and exact copy totals", () => {
    const record = evidence();
    expect(record.phase_proof).toMatchObject({
      materialization_operations_fulfilled: 5,
      materialization_operations_total: 5,
      legacy_standalone_copy_fulfilled: true,
      verification_entered: true,
      teacher_engine_entered: false,
      checkpoint_gate_entered: false,
    });
    const audit = record.copy_audit as {
      totals: {
        files: number;
        bytes: number;
        path_type_mode_owner_nlink_byte_mismatches: number;
        source_destination_inode_aliases: number;
      };
      trees: Array<{ files: number; bytes: number; mismatches: number }>;
      verifier: {
        tracked_files: number;
        tracked_byte_mismatches: number;
        missing_git_objects: number;
        fsck_passed: boolean;
      };
    };
    expect(audit.totals).toEqual({
      files: 72717,
      bytes: 1227490748,
      path_type_mode_owner_nlink_byte_mismatches: 0,
      source_destination_inode_aliases: 0,
    });
    expect(audit.trees.reduce((sum, tree) => sum + tree.files, 0)).toBe(
      audit.totals.files,
    );
    expect(audit.trees.reduce((sum, tree) => sum + tree.bytes, 0)).toBe(
      audit.totals.bytes,
    );
    expect(audit.trees.every((tree) => tree.mismatches === 0)).toBe(true);
    expect(audit.verifier).toMatchObject({
      tracked_files: 1431,
      tracked_byte_mismatches: 0,
      missing_git_objects: 0,
      fsck_passed: true,
    });
  });

  it("records the isolated deterministic role-bundle failure and excludes cloud causes", () => {
    const record = evidence();
    expect(record.verification_isolation).toMatchObject({
      teacher_assets: {
        result: "PASS",
        elapsed_ms: 36,
        read_only: true,
      },
      role_bundle: {
        result: "FAIL",
        read_only: true,
        elapsed_ms: 522211,
        safe_substage:
          "role-lock-full-replay-watched-directory-closure-binding",
        reproduction_elapsed_within_original_interval: true,
      },
    });
    expect(record.root_cause).toMatchObject({
      classification:
        "historical-filesystem-identity-versus-copy-by-value-contract-mismatch",
      data_corruption: false,
      timeout: false,
      aws: false,
      network: false,
      deterministically_reproduced: true,
    });
    expect(record.stack_boundary).toMatchObject({
      teacher_generation_training_and_ab: "local-Mac",
      aws_required: false,
      aws_used: false,
      cloud_credentials_used: false,
      network_used: false,
    });
  });

  it("keeps every downstream or live action at zero", () => {
    const record = evidence();
    expect(
      Object.values(record.nonactions as Record<string, number>).every(
        (value) => value === 0,
      ),
    ).toBe(true);
    expect(record.portable_transition_next_gate).toMatchObject({
      weaken_historical_inode_check: false,
      verify_historical_closure_on_original_fixed_role_lock: true,
      bind_verified_semantic_content_authority_to_exact_copy_by_value_receipts: true,
      verify_destination_fresh_closure_and_all_bytes: true,
      reject_source_replacement_destination_mutation_byte_change_or_capability_replay: true,
      live_weight_must_remain_unchanged: true,
    });
  });

  it("keeps the Japanese and English articles aligned on the cause and next gate", () => {
    const record = evidence();
    expect(record.articles).toEqual({
      japanese:
        "../blog-shogi-floodgate-v7-local-clean-room-teacher-second-run-verification-stop.md",
      english:
        "../blog-shogi-floodgate-v7-local-clean-room-teacher-second-run-verification-stop.en.md",
    });
    const japanese = read(japaneseRelative);
    const english = read(englishRelative);
    for (const marker of [
      "5/5成功",
      "72,717",
      "1,227,490,748",
      "522.211秒",
      "historical full-replay",
      "AWSは不要・未使用",
      "portable transition",
      "live weightは引き続き変更しない",
    ]) {
      expect(japanese).toContain(marker);
    }
    for (const marker of [
      "All five materialization operations completed",
      "72,717",
      "1,227,490,748",
      "522.211 seconds",
      "historical full-replay",
      "AWS was not required or used",
      "portable transition",
      "Live weights remain unchanged",
    ]) {
      expect(english).toContain(marker);
    }

    const readme = read(readmeRelative);
    for (const marker of [
      "../docs/blog-shogi-floodgate-v7-local-clean-room-teacher-second-run-verification-stop.md",
      "../docs/blog-shogi-floodgate-v7-local-clean-room-teacher-second-run-verification-stop.en.md",
      "../docs/data/floodgate-v7-local-clean-room-teacher-second-run-verification-stop-2026-07-19.json",
      "historical inode / ctime固定とfresh copy-by-value closureの契約不整合",
    ]) {
      expect(readme).toContain(marker);
    }
  });
});
