import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  HALFKP81_V1R11_PREFORMAL_AUTHORITY_SCHEMA,
  HALFKP81_V1R11_PREFORMAL_VERIFIED_AUTHORITY_SCHEMA,
  HALFKP81_V1R11_PREFORMAL_GATES,
  finalizeHalfkp81V1R11LegacyPreformalAuthorityForTests,
  publishHalfkp81V1R11GateEvidenceAndReceipt,
  validateHalfkp81V1R11GatePayload,
  verifyAndPublishHalfkp81V1R11LegacyPreformalAuthorityForTests,
  verifyHalfkp81V1R11GateReceiptFiles,
  type Halfkp81V1R11FileIdentity,
  type Halfkp81V1R11PreformalGate,
} from "../../../ml/halfkp81-depth18-v1r11-preformal-authority";

const roots: string[] = [];
const sourceRevision = "b".repeat(40);
const headRevision = "c".repeat(40);
let launchAuthorityForPayload: Readonly<Halfkp81V1R11FileIdentity> | undefined;

function sha256(value: Uint8Array | string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const record = value as Readonly<Record<string, unknown>>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
    .join(",")}}`;
}

async function launchAuthorityFixture(
  root: string,
  teacherPlan: Readonly<Halfkp81V1R11FileIdentity>,
): Promise<Readonly<Halfkp81V1R11FileIdentity>> {
  const launchctlPath = path.join(root, "launchagent-launchctl-print.txt");
  const plistPath = path.join(root, "launchagent.plist.snapshot");
  const launchctl = Buffer.from("launchctl-fixture\n", "utf8");
  const plist = Buffer.from("plist-fixture\n", "utf8");
  await fs.promises.writeFile(launchctlPath, launchctl, { mode: 0o600 });
  await fs.promises.writeFile(plistPath, plist, { mode: 0o600 });
  const launchctlIdentity = {
    path: launchctlPath,
    bytes: launchctl.byteLength,
    sha256: sha256(launchctl),
    schema: "text/plain",
  };
  const plistIdentity = {
    path: plistPath,
    bytes: plist.byteLength,
    sha256: sha256(plist),
    schema: "application/x-plist",
  };
  const evidence = {
    schema:
      "shogi-halfkp81-depth18-yaneura-only-launchagent-authority-evidence-v1r11",
    status: "pass",
    teacher_plan: teacherPlan,
    source_revision: sourceRevision,
    label: "com.meetyudai.shogi.halfkp81-depth18-yaneura-only-v1r11-bbbbbbbb",
    runner_pid: 123,
    program_arguments: [
      "/usr/bin/caffeinate",
      "-dimsu",
      "/usr/local/bin/node",
      "-r",
      "/repo/node_modules/tsx/dist/cjs/index.cjs",
      "/repo/ml/run-halfkp81-depth18-v1r11-formal-child.ts",
    ],
    working_directory: "/repo",
    stdout_path: path.join(root, "stdout.log"),
    stderr_path: path.join(root, "stderr.log"),
    launchctl_snapshot: launchctlIdentity,
    plist_snapshot: plistIdentity,
    live_plist_path: path.join(root, "live.plist"),
    authority: {
      may_execute_formal_teacher: true,
      may_train: false,
      may_play_formal_games: false,
      may_write_live_weights: false,
    },
  };
  const evidencePath = path.join(root, "launchagent-authority-evidence.json");
  const bytes = Buffer.from(`${canonical(evidence)}\n`, "utf8");
  await fs.promises.writeFile(evidencePath, bytes, { mode: 0o600 });
  const identity = Object.freeze({
    path: evidencePath,
    bytes: bytes.byteLength,
    sha256: sha256(bytes),
    schema:
      "shogi-halfkp81-depth18-yaneura-only-launchagent-authority-evidence-v1r11",
  });
  launchAuthorityForPayload = identity;
  return identity;
}

function payload(
  gate: Halfkp81V1R11PreformalGate,
): Readonly<Record<string, unknown>> {
  switch (gate) {
    case "ready-pr":
      return {
        pr_number: 777,
        pr_url: "https://github.com/example/repository/pull/777",
        head_revision: headRevision,
        merge_revision: sourceRevision,
        base_branch: "main",
        is_draft: false,
        state: "MERGED",
        observed_at_utc: "2026-08-02T20:00:00.000Z",
      };
    case "all-required-ci-success":
      return {
        pr_number: 777,
        head_revision: headRevision,
        required_checks: 15,
        successful_checks: 15,
        failed_checks: 0,
        pending_checks: 0,
        conclusion: "success",
        observed_at_utc: "2026-08-02T20:01:00.000Z",
      };
    case "regular-merge":
      return {
        merge_revision: sourceRevision,
        parent_count: 2,
        first_parent_revision: "d".repeat(40),
        second_parent_revision: headRevision,
        strategy: "merge-commit",
        base_branch: "main",
      };
    case "clean-main-source-authentication":
      return {
        branch: "main",
        head_revision: sourceRevision,
        main_revision: sourceRevision,
        captured_revision: sourceRevision,
        status_porcelain_bytes: 0,
        status_porcelain_sha256: sha256(""),
      };
    case "preformal-authority-implementation-tests-pass": {
      const testFiles = [
        "tests/unit/ml/halfkp81Depth18V1R11PreformalAuthority.test.ts",
      ];
      return {
        command: ["npx", "vitest", "run", ...testFiles, "--reporter=json"],
        test_files: testFiles,
        tests_passed: 3,
        tests_failed: 0,
        exit_code: 0,
        stdout_sha256: "5".repeat(64),
        stderr_sha256: "6".repeat(64),
      };
    }
    case "artifact-verifier-implementation-tests-pass": {
      const testFiles = [
        "tests/unit/ml/halfkp81Depth18TeacherArtifactValidation.test.ts",
      ];
      return {
        command: ["npx", "vitest", "run", ...testFiles, "--reporter=json"],
        test_files: testFiles,
        tests_passed: 25,
        tests_failed: 0,
        exit_code: 0,
        stdout_sha256: "1".repeat(64),
        stderr_sha256: "2".repeat(64),
      };
    }
    case "power-guardian-implementation-tests-pass": {
      const testFiles = [
        "tests/unit/ml/halfkp81Depth18V1R11PowerContinuity.test.ts",
        "tests/unit/ml/halfkp81Depth18TeacherRunner.test.ts",
        "tests/unit/ml/halfkp81Depth18OneShotLaunchAgent.test.ts",
      ];
      return {
        command: ["npx", "vitest", "run", ...testFiles, "--reporter=json"],
        test_files: testFiles,
        tests_passed: 78,
        tests_failed: 0,
        exit_code: 0,
        stdout_sha256: "3".repeat(64),
        stderr_sha256: "4".repeat(64),
      };
    }
    case "candidate-order-gate":
      return {
        parents: 32,
        normal_fallback_candidate_digest_matches: true,
        canonical_publication_order_matches: true,
        mismatches: 0,
        technical_faults: 0,
      };
    case "known10-probe":
      return {
        parents: 8,
        moves: 10,
        exact_depth18_identity_matches: 10,
        mismatches: 0,
        technical_faults: 0,
      };
    case "pathological-fallback-probe":
      return {
        parent_id:
          "sha256:622377e74345bfcbe509b903ae89e37dfec48e493db0331780b5423382d926a1",
        normal_partial_rows_published: 0,
        capped_rows_published: 0,
        fallback_exact_depth18_matches_hash8192: true,
        technical_faults: 0,
      };
    case "mixed-load-gate":
      return {
        normal_engines: 8,
        normal_hash_mib_each: 512,
        fallback_engines: 2,
        fallback_hash_mib_each: 8_192,
        maximum_normal_active: 8,
        maximum_fallback_active: 2,
        technical_faults: 0,
      };
    case "formal-like-512":
      return {
        parents: 512,
        completed_parents: 512,
        technical_faults: 0,
        teacher_contract_equal_formal: true,
        power_contract_equal_formal: true,
        artifact_verifier_status: "pass",
      };
    case "ac-power-start-admission-pass":
      if (launchAuthorityForPayload === undefined) {
        throw new Error("launch authority fixture is missing");
      }
      return {
        power_source: "AC Power",
        battery_percentage: 100,
        required_assertions: [
          "PreventSystemSleep",
          "PreventUserIdleSystemSleep",
          "PreventUserIdleDisplaySleep",
        ],
        assertion_owner_matches_caffeinate_pid: true,
        launchd_authority_status: "pass",
        launchagent_authority: launchAuthorityForPayload,
        observed_at_utc: "2026-08-02T20:02:00.000Z",
      };
  }
}

async function fixture(): Promise<{
  root: string;
  teacherPlan: Readonly<Halfkp81V1R11FileIdentity>;
}> {
  const root = await fs.promises.realpath(
    await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "halfkp81-v1r11-preformal-"),
    ),
  );
  roots.push(root);
  await fs.promises.chmod(root, 0o700);
  const planPath = path.join(root, "teacher-plan.json");
  const plan = Buffer.from('{"schema":"teacher-plan-v1r11"}\n');
  await fs.promises.writeFile(planPath, plan, { mode: 0o600 });
  return {
    root,
    teacherPlan: Object.freeze({
      path: planPath,
      bytes: plan.byteLength,
      sha256: sha256(plan),
      schema: "teacher-plan-v1r11",
    }),
  };
}

afterEach(async () => {
  while (roots.length > 0) {
    await fs.promises.rm(roots.pop()!, { force: true, recursive: true });
  }
  launchAuthorityForPayload = undefined;
});

describe("HalfKP81 v1r11 semantic preformal authority", () => {
  it("publishes and independently verifies all 13 create-only chained gates", async () => {
    const value = await fixture();
    const gateRoot = path.join(value.root, "preformal-gates");
    await fs.promises.mkdir(gateRoot, { mode: 0o700 });
    const launchAgentAuthority = await launchAuthorityFixture(
      value.root,
      value.teacherPlan,
    );
    const receipts: Halfkp81V1R11FileIdentity[] = [];
    let previous: string | null = null;
    for (const [index, gate] of HALFKP81_V1R11_PREFORMAL_GATES.entries()) {
      const prefix = String(index + 1).padStart(2, "0");
      const published = await publishHalfkp81V1R11GateEvidenceAndReceipt({
        gate,
        sequence: index + 1,
        teacherPlan: value.teacherPlan,
        sourceRevision,
        previousReceiptSha256: previous,
        payload: payload(gate),
        evidencePath: path.join(gateRoot, `${prefix}-${gate}.evidence.json`),
        receiptPath: path.join(gateRoot, `${prefix}-${gate}.receipt.json`),
      });
      receipts.push(published.receipt);
      previous = published.receipt.sha256;
    }
    const authority =
      await finalizeHalfkp81V1R11LegacyPreformalAuthorityForTests({
        teacherPlan: value.teacherPlan,
        sourceRevision,
        requiredOrder: [...HALFKP81_V1R11_PREFORMAL_GATES, "formal-teacher"],
        gateReceipts: receipts,
        launchAgentAuthority,
        ledgerPath: path.join(value.root, "preformal-authority-ledger.jsonl"),
        outputPath: path.join(value.root, "preformal-authority-receipt.json"),
      });
    expect(authority.schema).toBe(HALFKP81_V1R11_PREFORMAL_AUTHORITY_SCHEMA);
    const aggregate = JSON.parse(
      await fs.promises.readFile(authority.path, "utf8"),
    ) as Record<string, unknown>;
    expect(aggregate).toMatchObject({
      status: "all-required-preformal-gates-passed",
      source_revision: sourceRevision,
      authority: {
        may_execute_formal_teacher: false,
        may_train: false,
        may_play_formal_games: false,
        may_write_live_weights: false,
      },
    });
    expect(Object.keys(aggregate.gates as object)).toEqual(
      [...HALFKP81_V1R11_PREFORMAL_GATES].sort(),
    );
    expect(fs.statSync(authority.path).mode & 0o777).toBe(0o600);
    const verified =
      await verifyAndPublishHalfkp81V1R11LegacyPreformalAuthorityForTests({
        rawReceipt: authority,
        outputPath: path.join(
          value.root,
          "preformal-authority-verified-receipt.json",
        ),
      });
    expect(verified.schema).toBe(
      HALFKP81_V1R11_PREFORMAL_VERIFIED_AUTHORITY_SCHEMA,
    );
    await fs.promises.writeFile(
      path.join(value.root, "launchagent-launchctl-print.txt"),
      "tampered\n",
      { mode: 0o600 },
    );
    await expect(
      verifyAndPublishHalfkp81V1R11LegacyPreformalAuthorityForTests({
        rawReceipt: authority,
        outputPath: path.join(
          value.root,
          "preformal-authority-verified-receipt.json",
        ),
      }),
    ).rejects.toThrow(/identity differs/u);
  });

  it("rejects gate-specific drift, a broken hash chain, and cross-gate source drift", async () => {
    expect(() =>
      validateHalfkp81V1R11GatePayload("known10-probe", {
        ...payload("known10-probe"),
        exact_depth18_identity_matches: 9,
      }),
    ).toThrow(/known10-probe result differs/u);
    expect(() =>
      validateHalfkp81V1R11GatePayload(
        "artifact-verifier-implementation-tests-pass",
        {
          ...payload("artifact-verifier-implementation-tests-pass"),
          command: ["true"],
        },
      ),
    ).toThrow(/test evidence|fixed test command/u);

    const value = await fixture();
    const gateRoot = path.join(value.root, "preformal-gates");
    await fs.promises.mkdir(gateRoot, { mode: 0o700 });
    const first = await publishHalfkp81V1R11GateEvidenceAndReceipt({
      gate: "ready-pr",
      sequence: 1,
      teacherPlan: value.teacherPlan,
      sourceRevision,
      previousReceiptSha256: null,
      payload: payload("ready-pr"),
      evidencePath: path.join(gateRoot, "01-ready-pr.evidence.json"),
      receiptPath: path.join(gateRoot, "01-ready-pr.receipt.json"),
    });
    const second = await publishHalfkp81V1R11GateEvidenceAndReceipt({
      gate: "all-required-ci-success",
      sequence: 2,
      teacherPlan: value.teacherPlan,
      sourceRevision,
      previousReceiptSha256: "f".repeat(64),
      payload: payload("all-required-ci-success"),
      evidencePath: path.join(
        gateRoot,
        "02-all-required-ci-success.evidence.json",
      ),
      receiptPath: path.join(
        gateRoot,
        "02-all-required-ci-success.receipt.json",
      ),
    });
    await expect(
      verifyHalfkp81V1R11GateReceiptFiles(second.receipt, {
        gate: "all-required-ci-success",
        sequence: 2,
        teacherPlan: value.teacherPlan,
        sourceRevision,
        previousReceiptSha256: first.receipt.sha256,
      }),
    ).rejects.toThrow(/receipt binding differs/u);
  });

  it("rejects semantically valid individual gates whose cross-gate source identities drift", async () => {
    const value = await fixture();
    const gateRoot = path.join(value.root, "preformal-gates");
    await fs.promises.mkdir(gateRoot, { mode: 0o700 });
    const launchAgentAuthority = await launchAuthorityFixture(
      value.root,
      value.teacherPlan,
    );
    const receipts: Halfkp81V1R11FileIdentity[] = [];
    let previous: string | null = null;
    for (const [index, gate] of HALFKP81_V1R11_PREFORMAL_GATES.entries()) {
      const prefix = String(index + 1).padStart(2, "0");
      const gatePayload =
        gate === "ready-pr"
          ? { ...payload(gate), merge_revision: "e".repeat(40) }
          : payload(gate);
      const published = await publishHalfkp81V1R11GateEvidenceAndReceipt({
        gate,
        sequence: index + 1,
        teacherPlan: value.teacherPlan,
        sourceRevision,
        previousReceiptSha256: previous,
        payload: gatePayload,
        evidencePath: path.join(gateRoot, `${prefix}-${gate}.evidence.json`),
        receiptPath: path.join(gateRoot, `${prefix}-${gate}.receipt.json`),
      });
      receipts.push(published.receipt);
      previous = published.receipt.sha256;
    }
    await expect(
      finalizeHalfkp81V1R11LegacyPreformalAuthorityForTests({
        teacherPlan: value.teacherPlan,
        sourceRevision,
        requiredOrder: [...HALFKP81_V1R11_PREFORMAL_GATES, "formal-teacher"],
        gateReceipts: receipts,
        launchAgentAuthority,
        ledgerPath: path.join(value.root, "preformal-authority-ledger.jsonl"),
        outputPath: path.join(value.root, "preformal-authority-receipt.json"),
      }),
    ).rejects.toThrow(/cross-gate source binding differs/u);
  });
});
