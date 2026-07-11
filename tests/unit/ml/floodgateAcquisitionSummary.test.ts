import { describe, expect, it } from "vitest";

import {
  FLOODGATE_ACQUISITION_RESULT_SCHEMA,
  summarizeFloodgateAcquisitionCoreForTests,
  type FloodgateAcquisitionAuthoritativeFacts,
} from "../../../ml/floodgate-acquisition-summary";
import { FLOODGATE_RAW_OFFLINE_VERIFICATION_SCHEMA } from "../../../ml/floodgate-raw-lock-verifier";
import {
  runNonProductionFloodgateSummaryCliForTests,
  type NonProductionFloodgateSummaryCliDependenciesForTests,
} from "../../../ml/summarize-floodgate-acquisition";

const REVISION = "a".repeat(40);
const TOKEN_A = "1".repeat(64);
const TOKEN_B = "2".repeat(64);

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
  return {
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
    first_url: "https://wdoor.c.u-tokyo.ac.jp/a",
    last_url: "https://wdoor.c.u-tokyo.ac.jp/a",
    ...overrides,
  };
}

function jsonl(...records: readonly Record<string, unknown>[]): string {
  return `${records.map((value) => JSON.stringify(value)).join("\n")}\n`;
}

describe("Floodgate acquisition summary", () => {
  it("summarizes ordered attempts and keeps audit observations distinct from authority", () => {
    const first = jsonl(record({ fetched: 2, status_200: 2 }));
    const second = jsonl(
      record({
        run_token: TOKEN_B,
        run_started_at: "2026-01-01T00:01:00.000Z",
        recorded_at: "2026-01-01T00:01:01.000Z",
        phase: "daily_ratings",
        fetched: 3,
        reused: 2,
        status_200: 2,
        status_404: 1,
      }),
      record({
        run_token: TOKEN_B,
        run_started_at: "2026-01-01T00:01:00.000Z",
        recorded_at: "2026-01-01T00:02:00.000Z",
        sequence: 2,
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
      second,
      first,
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
      },
      audit: {
        records: 3,
        fetched: 5,
        reused_observations: 2,
        status_200: 4,
        status_404: 1,
        authoritative_receipt_delta: 0,
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
      jsonl(record({ fetched: 4, status_200: 4 })),
    ]);
    expect(result.receipt.timing).toMatchObject({
      finished_at: null,
      elapsed_ms: null,
      manifest_publish_audit_present: false,
    });
    expect(result.receipt.audit.authoritative_receipt_delta).toBe(1);
  });

  it("rejects malformed framing, discontinuous sequence, revision drift, and repeated publication", () => {
    expect(() =>
      summarizeFloodgateAcquisitionCoreForTests(FACTS, ["{}"]),
    ).toThrow(/JSONL framing/);
    expect(() =>
      summarizeFloodgateAcquisitionCoreForTests(FACTS, [
        jsonl(record({ sequence: 2 })),
      ]),
    ).toThrow(/continuity/);
    expect(() =>
      summarizeFloodgateAcquisitionCoreForTests(FACTS, [
        jsonl(record({ source_revision: "b".repeat(40) })),
      ]),
    ).toThrow(/continuity/);
    expect(() =>
      summarizeFloodgateAcquisitionCoreForTests(FACTS, [
        jsonl(
          record({ phase: "manifest_published" }),
          record({ sequence: 2, phase: "manifest_published" }),
        ),
      ]),
    ).toThrow(/repeats manifest_published/);
  });

  it("rejects noncanonical JSON and unsupported phases", () => {
    expect(() =>
      summarizeFloodgateAcquisitionCoreForTests(FACTS, [
        `${JSON.stringify(record(), null, 2)}\n`,
      ]),
    ).toThrow(/not canonical compact JSON|is not JSON/);
    expect(() =>
      summarizeFloodgateAcquisitionCoreForTests(FACTS, [
        jsonl(record({ phase: "teacher_labels" })),
      ]),
    ).toThrow(/phase is unsupported/);
    expect(() =>
      summarizeFloodgateAcquisitionCoreForTests(FACTS, [
        jsonl(record({ fetched: 2, status_200: 1 })),
      ]),
    ).toThrow(/status accounting/);
    expect(() =>
      summarizeFloodgateAcquisitionCoreForTests(FACTS, [
        jsonl(record({ status_200: 0, status_404: 1 })),
      ]),
    ).toThrow(/outside daily_ratings/);
  });
});

describe("Floodgate acquisition summary CLI", () => {
  it("accepts one canonical input and writes only canonical result JSON", async () => {
    const stdout: string[] = [];
    const artifact = summarizeFloodgateAcquisitionCoreForTests(FACTS, [
      jsonl(record({ fetched: 5, status_200: 5 })),
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
