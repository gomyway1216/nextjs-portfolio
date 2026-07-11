import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

import {
  FLOODGATE_ACQUISITION_RESULT_SCHEMA,
  readFloodgateAcquisitionAuditFilesCoreForTests,
  summarizeFloodgateAcquisitionCoreForTests,
  type FloodgateAcquisitionAuditFileInput,
  type FloodgateAcquisitionAuthoritativeFacts,
} from "../../../ml/floodgate-acquisition-summary";
import { FLOODGATE_RAW_OFFLINE_VERIFICATION_SCHEMA } from "../../../ml/floodgate-raw-lock-verifier";
import { sha256Hex } from "../../../ml/floodgate-source";
import {
  runNonProductionFloodgateSummaryCliForTests,
  type NonProductionFloodgateSummaryCliDependenciesForTests,
} from "../../../ml/summarize-floodgate-acquisition";

const REVISION = "a".repeat(40);
const TOKEN_A = "1".repeat(64);
const TOKEN_B = "2".repeat(64);
const LISTING_URL = "https://wdoor.c.u-tokyo.ac.jp/shogi/x/2026/01/01/";
const RATING_URL =
  "https://wdoor.c.u-tokyo.ac.jp/shogi/x/rating/players-floodgate-20260101.html";
const CSA_URL =
  "https://wdoor.c.u-tokyo.ac.jp/shogi/x/2026/01/01/wdoor+floodgate-300-10F+Alpha+Beta+20260101010203.csa";
const PERIOD_URL =
  "https://wdoor.c.u-tokyo.ac.jp/shogi/x/rating/players-floodgate-20260401.html";

const FACTS: FloodgateAcquisitionAuthoritativeFacts = {
  source_revision: REVISION,
  receipts: {
    total: 5,
    listings: 1,
    daily_ratings: 1,
    period_inventory: 1,
    csa: 2,
  },
  status_200: 4,
  status_404: 1,
  response_bytes: 123,
  unique_objects: 4,
  canonical_games: 1,
  duplicate_groups: 1,
  duplicate_aliases: 1,
  manifest_bytes: 999,
  manifest_sha256: "b".repeat(64),
  offline_verification_schema: FLOODGATE_RAW_OFFLINE_VERIFICATION_SCHEMA,
};

function record(
  overrides: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> {
  const value: Record<string, unknown> = {
    schema: "shogi-floodgate-acquisition-audit-v1",
    run_token: TOKEN_A,
    source_revision: REVISION,
    run_started_at: "2026-01-01T00:00:00.000Z",
    recorded_at: "2026-01-01T00:00:01.000Z",
    sequence: 1,
    phase: "daily_listings",
    fetched: 1,
    reused: 0,
    status_200: 1,
    status_404: 0,
    response_bytes: 10,
    first_url: LISTING_URL,
    last_url: LISTING_URL,
    ...overrides,
  };
  const phase = value.phase;
  const defaultUrl =
    phase === "daily_ratings"
      ? RATING_URL
      : phase === "period_inventory"
        ? PERIOD_URL
        : phase === "csa"
          ? CSA_URL
          : phase === "manifest_published"
            ? null
            : LISTING_URL;
  if (!Object.prototype.hasOwnProperty.call(overrides, "first_url")) {
    value.first_url = defaultUrl;
  }
  if (!Object.prototype.hasOwnProperty.call(overrides, "last_url")) {
    value.last_url = defaultUrl;
  }
  return value;
}

function jsonl(...records: readonly Record<string, unknown>[]): string {
  return `${records.map((value) => JSON.stringify(value)).join("\n")}\n`;
}

function auditFile(
  token: string,
  value: string | Uint8Array,
): FloodgateAcquisitionAuditFileInput {
  return {
    filename: `${token}.jsonl`,
    bytes: typeof value === "string" ? new TextEncoder().encode(value) : value,
  };
}

describe("Floodgate acquisition summary", () => {
  it("pins the canonical completed Q1 acquisition receipt", async () => {
    const bytes = await fs.promises.readFile(
      path.join(
        process.cwd(),
        "ml/protocols/floodgate-q1-2026-acquisition-result.json",
      ),
    );
    expect(bytes.byteLength).toBe(1_534);
    expect(sha256Hex(bytes)).toBe(
      "f48155a5371411f7ea3b27abdf035c86c9df059b5e924620432449c45f650301",
    );
    const text = new TextDecoder("utf-8", {
      fatal: true,
      ignoreBOM: true,
    }).decode(bytes);
    const receipt = JSON.parse(text) as Record<string, unknown>;
    expect(`${JSON.stringify(receipt)}\n`).toBe(text);
    expect(receipt).toMatchObject({
      schema: FLOODGATE_ACQUISITION_RESULT_SCHEMA,
      source_revision: "649423d455b5762a697864610d9e8f606cc327c3",
      timing: { attempts: 1, resume_count: 0, elapsed_ms: 4_717_610 },
      audit: {
        fetched: 36_349,
        authoritative_receipt_delta: 0,
        gaps: {
          empty_files: 0,
          trailing_partial_files: 0,
          trailing_partial_bytes: 0,
          files_without_source_revision: 0,
        },
      },
      authoritative: {
        status_200: 36_347,
        status_404: 2,
        response_bytes: 541_445_115,
        canonical_games: 36_168,
      },
      manifest: {
        bytes: 23_698_679,
        sha256:
          "1479a3a207458c9d3afe6cf9ba88abc6c44fb7b8b0e621aca9d6558637314619",
      },
    });
  });

  it("summarizes ordered attempts and keeps audit observations distinct from authority", () => {
    const first = jsonl(
      record({ fetched: 2, status_200: 2, response_bytes: 40 }),
    );
    const second = jsonl(
      record({
        run_token: TOKEN_B,
        run_started_at: "2026-01-01T00:01:00.000Z",
        recorded_at: "2026-01-01T00:01:01.000Z",
        phase: "daily_ratings",
        fetched: 3,
        reused: 0,
        status_200: 2,
        status_404: 1,
        response_bytes: 83,
      }),
      record({
        run_token: TOKEN_B,
        run_started_at: "2026-01-01T00:01:00.000Z",
        recorded_at: "2026-01-01T00:01:02.000Z",
        sequence: 2,
        phase: "daily_ratings",
        fetched: 0,
        reused: 2,
        status_200: 0,
        status_404: 0,
        response_bytes: 0,
      }),
      record({
        run_token: TOKEN_B,
        run_started_at: "2026-01-01T00:01:00.000Z",
        recorded_at: "2026-01-01T00:02:00.000Z",
        sequence: 3,
        phase: "manifest_published",
        fetched: 0,
        reused: 0,
        status_200: 0,
        status_404: 0,
        response_bytes: 0,
        first_url: null,
        last_url: null,
      }),
    );

    const result = summarizeFloodgateAcquisitionCoreForTests(FACTS, [
      auditFile(TOKEN_B, second),
      auditFile(TOKEN_A, first),
    ]);

    expect(result.receipt).toMatchObject({
      schema: FLOODGATE_ACQUISITION_RESULT_SCHEMA,
      source_revision: REVISION,
      timing: {
        started_at: "2026-01-01T00:00:00.000Z",
        finished_at: "2026-01-01T00:02:00.000Z",
        elapsed_ms: 120_000,
        attempts: 2,
        resume_count: 1,
        manifest_publish_audit_present: true,
        start_observation_complete: true,
      },
      audit: {
        records: 4,
        fetched: 5,
        reused_observations: 2,
        status_200: 4,
        status_404: 1,
        authoritative_receipt_delta: 0,
        gaps: {
          empty_files: 0,
          trailing_partial_files: 0,
          trailing_partial_bytes: 0,
          files_without_source_revision: 0,
        },
      },
      authoritative: {
        receipts: FACTS.receipts,
        response_bytes: 123,
        unique_objects: 4,
        canonical_games: 1,
      },
      manifest: { bytes: 999, sha256: "b".repeat(64) },
    });
    expect(
      result.receipt.audit.attempts.map((attempt) => attempt.run_token),
    ).toEqual([TOKEN_A, TOKEN_B]);
    expect(result.canonical_json).toBe(`${JSON.stringify(result.receipt)}\n`);
    expect(Object.isFrozen(result.receipt.audit.attempts)).toBe(true);
  });

  it("allows a durable manifest whose final audit append failed but reports that boundary", () => {
    const result = summarizeFloodgateAcquisitionCoreForTests(FACTS, [
      auditFile(TOKEN_A, jsonl(record({ fetched: 4, status_200: 4 }))),
    ]);
    expect(result.receipt.timing).toMatchObject({
      finished_at: null,
      elapsed_ms: null,
      manifest_publish_audit_present: false,
    });
    expect(result.receipt.audit.authoritative_receipt_delta).toBe(1);
  });

  it("rejects malformed complete records, discontinuous envelopes, and repeated publication", () => {
    expect(() =>
      summarizeFloodgateAcquisitionCoreForTests(FACTS, [
        auditFile(TOKEN_A, "{}\n"),
      ]),
    ).toThrow(/keys are not exact/);
    expect(() =>
      summarizeFloodgateAcquisitionCoreForTests(FACTS, [
        auditFile(TOKEN_A, jsonl(record({ sequence: 2 }))),
      ]),
    ).toThrow(/continuity/);
    expect(() =>
      summarizeFloodgateAcquisitionCoreForTests(FACTS, [
        auditFile(TOKEN_A, jsonl(record({ source_revision: "b".repeat(40) }))),
      ]),
    ).toThrow(/continuity/);
    expect(() =>
      summarizeFloodgateAcquisitionCoreForTests(FACTS, [
        auditFile(
          TOKEN_A,
          jsonl(
            record({
              phase: "manifest_published",
              fetched: 0,
              status_200: 0,
              response_bytes: 0,
            }),
            record({
              sequence: 2,
              phase: "manifest_published",
              fetched: 0,
              status_200: 0,
              response_bytes: 0,
            }),
          ),
        ),
      ]),
    ).toThrow(/repeats manifest_published/);
  });

  it("rejects noncanonical JSON and unsupported phases", () => {
    expect(() =>
      summarizeFloodgateAcquisitionCoreForTests(FACTS, [
        auditFile(TOKEN_A, `${JSON.stringify(record(), null, 2)}\n`),
      ]),
    ).toThrow(/not canonical compact JSON|is not JSON/);
    expect(() =>
      summarizeFloodgateAcquisitionCoreForTests(FACTS, [
        auditFile(TOKEN_A, jsonl(record({ phase: "teacher_labels" }))),
      ]),
    ).toThrow(/phase is unsupported/);
    expect(() =>
      summarizeFloodgateAcquisitionCoreForTests(FACTS, [
        auditFile(TOKEN_A, jsonl(record({ fetched: 2, status_200: 1 }))),
      ]),
    ).toThrow(/status accounting/);
    expect(() =>
      summarizeFloodgateAcquisitionCoreForTests(FACTS, [
        auditFile(TOKEN_A, jsonl(record({ status_200: 0, status_404: 1 }))),
      ]),
    ).toThrow(/outside daily_ratings/);
  });

  it("preserves raw identity while parsing only the durable complete-line prefix", () => {
    const complete = new TextEncoder().encode(jsonl(record()));
    const partial = Uint8Array.from([0x7b, 0x22, 0x78, 0x22, 0x3a, 0xff]);
    const raw = new Uint8Array(complete.byteLength + partial.byteLength);
    raw.set(complete);
    raw.set(partial, complete.byteLength);

    const result = summarizeFloodgateAcquisitionCoreForTests(FACTS, [
      auditFile(TOKEN_A, raw),
    ]);
    expect(result.receipt.audit.gaps).toEqual({
      empty_files: 0,
      trailing_partial_files: 1,
      trailing_partial_bytes: partial.byteLength,
      files_without_source_revision: 0,
    });
    expect(result.receipt.audit.attempts[0]).toMatchObject({
      records: 1,
      audit_bytes: raw.byteLength,
      audit_sha256: sha256Hex(raw),
      complete_jsonl_bytes: complete.byteLength,
      trailing_partial_bytes: partial.byteLength,
    });
  });

  it("reports empty and wholly partial crash attempts without inventing timing", () => {
    const partial = new TextEncoder().encode('{"schema":');
    const result = summarizeFloodgateAcquisitionCoreForTests(FACTS, [
      auditFile(TOKEN_A, new Uint8Array()),
      auditFile(TOKEN_B, partial),
    ]);
    expect(result.receipt.timing).toEqual({
      started_at: null,
      finished_at: null,
      elapsed_ms: null,
      attempts: 2,
      resume_count: 1,
      manifest_publish_audit_present: false,
      start_observation_complete: false,
    });
    expect(result.receipt.audit.gaps).toEqual({
      empty_files: 1,
      trailing_partial_files: 1,
      trailing_partial_bytes: partial.byteLength,
      files_without_source_revision: 2,
    });
    expect(result.receipt.audit.authoritative_receipt_delta).toBe(5);
  });

  it("rejects BOM-prefixed raw audit bytes and production-impossible counters", () => {
    const body = new TextEncoder().encode(jsonl(record()));
    const bom = new Uint8Array(body.byteLength + 3);
    bom.set([0xef, 0xbb, 0xbf]);
    bom.set(body, 3);
    expect(() =>
      summarizeFloodgateAcquisitionCoreForTests(FACTS, [
        auditFile(TOKEN_A, bom),
      ]),
    ).toThrow(/must not start with a UTF-8 BOM/);
    expect(() =>
      summarizeFloodgateAcquisitionCoreForTests(FACTS, [
        auditFile(
          TOKEN_A,
          jsonl(record({ fetched: 1, reused: 1, status_200: 1 })),
        ),
      ]),
    ).toThrow(/mixes fetched and reused/);
  });

  it("rejects audit totals that contradict authoritative response accounting", () => {
    expect(() =>
      summarizeFloodgateAcquisitionCoreForTests(FACTS, [
        auditFile(
          TOKEN_A,
          jsonl(
            record({
              phase: "daily_ratings",
              fetched: 5,
              status_200: 5,
              response_bytes: 123,
            }),
          ),
        ),
      ]),
    ).toThrow(/exceed authoritative response accounting/);
    expect(() =>
      summarizeFloodgateAcquisitionCoreForTests(FACTS, [
        auditFile(
          TOKEN_A,
          jsonl(
            record({
              phase: "daily_ratings",
              fetched: 5,
              status_200: 4,
              status_404: 1,
              response_bytes: 122,
            }),
          ),
        ),
      ]),
    ).toThrow(/complete audit observations disagree/);
  });

  it("pins the listing barrier detail and rejects normalized URL aliases", () => {
    const barrierDetail = {
      listing_responses: 90,
      listing_bytes: 10_098_337,
      all_official_csa_urls: 36_419,
      target_csa_urls: 36_168,
      listing_identity_bytes: 10_963,
      listing_identity_sha256:
        "05d353413f310087316e16cfc1ec29800967886db43f090aee59f713c4bfc822",
    };
    expect(() =>
      summarizeFloodgateAcquisitionCoreForTests(FACTS, [
        auditFile(
          TOKEN_A,
          jsonl(
            record({
              phase: "listing_barrier",
              fetched: 0,
              status_200: 0,
              response_bytes: 0,
              detail: barrierDetail,
            }),
          ),
        ),
      ]),
    ).not.toThrow();
    expect(() =>
      summarizeFloodgateAcquisitionCoreForTests(FACTS, [
        auditFile(
          TOKEN_A,
          jsonl(
            record({
              phase: "listing_barrier",
              fetched: 0,
              status_200: 0,
              response_bytes: 0,
              detail: { ...barrierDetail, target_csa_urls: 36_167 },
            }),
          ),
        ),
      ]),
    ).toThrow(/target_csa_urls is not preregistered/);
    expect(() =>
      summarizeFloodgateAcquisitionCoreForTests(FACTS, [
        auditFile(
          TOKEN_A,
          jsonl(
            record({
              first_url: "HTTPS://WDOOR.C.U-TOKYO.AC.JP/shogi/x/2026/01/01/",
              last_url: "HTTPS://WDOOR.C.U-TOKYO.AC.JP/shogi/x/2026/01/01/",
            }),
          ),
        ),
      ]),
    ).toThrow(/is not canonical/);
  });

  it("reads audit entries through the pinned directory descriptor", async () => {
    const created = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "floodgate-audit-reader-"),
    );
    const temporaryRoot = await fs.promises.realpath(created);
    const lockRoot = path.join(temporaryRoot, "raw-lock");
    const auditRoot = `${lockRoot}.audit`;
    await fs.promises.mkdir(auditRoot);
    const body = jsonl(record());
    await fs.promises.writeFile(path.join(auditRoot, `${TOKEN_A}.jsonl`), body);
    try {
      const files =
        await readFloodgateAcquisitionAuditFilesCoreForTests(lockRoot);
      expect(files).toHaveLength(1);
      expect(files[0].filename).toBe(`${TOKEN_A}.jsonl`);
      expect(new TextDecoder().decode(files[0].bytes)).toBe(body);
    } finally {
      await fs.promises.rm(temporaryRoot, { recursive: true, force: true });
    }
  });

  it("rejects a token-named FIFO without blocking the descriptor child", async () => {
    const created = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "floodgate-audit-fifo-"),
    );
    const temporaryRoot = await fs.promises.realpath(created);
    const lockRoot = path.join(temporaryRoot, "raw-lock");
    const auditRoot = `${lockRoot}.audit`;
    await fs.promises.mkdir(auditRoot);
    const fifoPath = path.join(auditRoot, `${TOKEN_A}.jsonl`);
    const createdFifo = spawnSync("/usr/bin/mkfifo", [fifoPath], {
      encoding: "utf8",
    });
    expect(createdFifo.status, createdFifo.stderr).toBe(0);
    const startedAt = Date.now();
    try {
      await expect(
        readFloodgateAcquisitionAuditFilesCoreForTests(lockRoot),
      ).rejects.toThrow(/descriptor-relative audit reader failed/);
      expect(Date.now() - startedAt).toBeLessThan(3_000);
    } finally {
      await fs.promises.rm(temporaryRoot, { recursive: true, force: true });
    }
  });
});

describe("Floodgate acquisition summary CLI", () => {
  it("accepts one canonical input and writes only canonical result JSON", async () => {
    const stdout: string[] = [];
    const artifact = summarizeFloodgateAcquisitionCoreForTests(FACTS, [
      auditFile(
        TOKEN_A,
        jsonl(
          record({
            phase: "daily_ratings",
            fetched: 5,
            status_200: 4,
            status_404: 1,
            response_bytes: 123,
          }),
        ),
      ),
    ]);
    const dependencies: NonProductionFloodgateSummaryCliDependenciesForTests = {
      summarize: async () => artifact,
      writeStdout: (value) => stdout.push(value),
    };

    await expect(
      runNonProductionFloodgateSummaryCliForTests(
        ["--input", "/tmp/floodgate-lock"],
        dependencies,
      ),
    ).resolves.toBe(0);
    expect(stdout).toEqual([artifact.canonical_json]);
  });

  it.each([
    [],
    ["--input"],
    ["--input", "relative"],
    ["--input", "/"],
    ["--output", "/tmp/floodgate-lock"],
    ["--input", "/tmp/floodgate-lock", "extra"],
  ])("rejects malformed argv %j", async (...argv) => {
    const dependencies: NonProductionFloodgateSummaryCliDependenciesForTests = {
      summarize: async () => {
        throw new Error("must not run");
      },
      writeStdout: () => undefined,
    };
    await expect(
      runNonProductionFloodgateSummaryCliForTests(argv, dependencies),
    ).rejects.toThrow(/invalid Floodgate summary CLI/);
  });
});
