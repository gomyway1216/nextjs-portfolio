import * as fs from "node:fs";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

const REPOSITORY_ROOT = process.cwd();
const JAPANESE_ARTICLE_PATH = path.join(
  REPOSITORY_ROOT,
  "docs/blog-shogi-floodgate-v7-checkpoint-failure-state-hardening.md",
);
const ENGLISH_ARTICLE_PATH = path.join(
  REPOSITORY_ROOT,
  "docs/blog-shogi-floodgate-v7-checkpoint-failure-state-hardening.en.md",
);
const EVIDENCE_PATH = path.join(
  REPOSITORY_ROOT,
  "docs/data/floodgate-v7-checkpoint-failure-state-hardening-2026-07-16.json",
);
const CONNECTOR_SOURCE_PATH = path.join(
  REPOSITORY_ROOT,
  "ml/floodgate-v7-production-checkpoint-connector.ts",
);
const LEGACY_JAPANESE_ARTICLE_PATH = path.join(
  REPOSITORY_ROOT,
  "docs/blog-shogi-floodgate-v7-production-checkpoint-connector.md",
);
const LEGACY_ENGLISH_ARTICLE_PATH = path.join(
  REPOSITORY_ROOT,
  "docs/blog-shogi-floodgate-v7-production-checkpoint-connector.en.md",
);

function readText(filePath: string): string {
  return fs.readFileSync(filePath, "utf8");
}

function numberedSections(article: string): number[] {
  return Array.from(article.matchAll(/^## ([0-9]+)\. /gmu), (match) =>
    Number(match[1]),
  );
}

function collectNullPaths(value: unknown, prefix = ""): string[] {
  if (value === null) return [prefix];
  if (typeof value !== "object") return [];
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) =>
      collectNullPaths(entry, `${prefix}[${index}]`),
    );
  }
  return Object.entries(value).flatMap(([key, entry]) =>
    collectNullPaths(entry, prefix.length === 0 ? key : `${prefix}.${key}`),
  );
}

function collectObjectKeys(value: unknown, keys: Set<string>): void {
  if (value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const entry of value) collectObjectKeys(entry, keys);
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    keys.add(key);
    collectObjectKeys(entry, keys);
  }
}

function assertNoDuplicateJsonObjectKeys(source: string): void {
  let offset = 0;

  function fail(message: string): never {
    throw new Error(`${message} at offset ${offset}`);
  }

  function skipWhitespace(): void {
    while (/\s/u.test(source[offset] ?? "")) offset += 1;
  }

  function parseString(): string {
    const start = offset;
    if (source[offset] !== '"') fail("Expected JSON string");
    offset += 1;
    while (offset < source.length) {
      if (source[offset] === '"') {
        offset += 1;
        return JSON.parse(source.slice(start, offset));
      }
      offset += source[offset] === "\\" ? 2 : 1;
    }
    return fail("Unterminated JSON string");
  }

  function consumeLiteral(literal: string): void {
    if (!source.startsWith(literal, offset)) {
      fail(`Expected JSON literal ${literal}`);
    }
    offset += literal.length;
  }

  function parseNumber(): void {
    const match = source
      .slice(offset)
      .match(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/u);
    if (match === null) fail("Expected JSON number");
    offset += match[0].length;
  }

  function parseArray(): void {
    offset += 1;
    skipWhitespace();
    if (source[offset] === "]") {
      offset += 1;
      return;
    }
    while (true) {
      parseValue();
      skipWhitespace();
      if (source[offset] === "]") {
        offset += 1;
        return;
      }
      if (source[offset] !== ",") fail("Expected comma in JSON array");
      offset += 1;
      skipWhitespace();
    }
  }

  function parseObject(): void {
    offset += 1;
    skipWhitespace();
    const keys = new Set<string>();
    if (source[offset] === "}") {
      offset += 1;
      return;
    }
    while (true) {
      const keyOffset = offset;
      const key = parseString();
      if (keys.has(key)) {
        throw new Error(
          `Duplicate JSON object key ${JSON.stringify(key)} at offset ${keyOffset}`,
        );
      }
      keys.add(key);
      skipWhitespace();
      if (source[offset] !== ":") fail("Expected colon after JSON object key");
      offset += 1;
      parseValue();
      skipWhitespace();
      if (source[offset] === "}") {
        offset += 1;
        return;
      }
      if (source[offset] !== ",") fail("Expected comma in JSON object");
      offset += 1;
      skipWhitespace();
    }
  }

  function parseValue(): void {
    skipWhitespace();
    switch (source[offset]) {
      case "{":
        parseObject();
        return;
      case "[":
        parseArray();
        return;
      case '"':
        parseString();
        return;
      case "t":
        consumeLiteral("true");
        return;
      case "f":
        consumeLiteral("false");
        return;
      case "n":
        consumeLiteral("null");
        return;
      default:
        parseNumber();
    }
  }

  parseValue();
  skipWhitespace();
  if (offset !== source.length) fail("Unexpected content after JSON value");
}

describe("Floodgate v7 checkpoint failure-state hardening public evidence", () => {
  it("keeps the Japanese and English articles at the same twelve-section boundary", () => {
    const japanese = readText(JAPANESE_ARTICLE_PATH);
    const english = readText(ENGLISH_ARTICLE_PATH);
    const expected = Array.from({ length: 12 }, (_, index) => index + 1);

    expect(numberedSections(japanese)).toEqual(expected);
    expect(numberedSections(english)).toEqual(expected);
    expect(japanese).toContain(
      "blog-shogi-floodgate-v7-checkpoint-failure-state-hardening.en.md",
    );
    expect(english).toContain(
      "blog-shogi-floodgate-v7-checkpoint-failure-state-hardening.md",
    );
    for (const marker of [
      "https://github.com/gomyway1216/nextjs-portfolio/pull/473",
      "2480ff0d4af4324bee3d79ba7dbace54e69ca34a",
      "6e5197fb9a9200cc1b00db1ee34e072b9de84ea2",
      "127 / 127",
      "252 / 252",
      "P0 / P1 / P2 = 0 / 0 / 0",
      "192 color-swapped pairs / 384 games",
      "runOp1",
    ]) {
      expect(japanese).toContain(marker);
      expect(english).toContain(marker);
    }
  });

  it("has unique JSON keys, no null placeholder, and exact delivery status", () => {
    const source = readText(EVIDENCE_PATH);
    expect(() => assertNoDuplicateJsonObjectKeys(source)).not.toThrow();
    expect(() =>
      assertNoDuplicateJsonObjectKeys(
        '{"outer":{"same":1,"\\u0073ame":2},"same":3}',
      ),
    ).toThrow(/Duplicate JSON object key "same"/u);

    const evidence = JSON.parse(source);
    expect(collectNullPaths(evidence)).toEqual([]);
    expect(evidence).toMatchObject({
      schema:
        "shogi-floodgate-v7-checkpoint-failure-state-hardening-evidence-v1",
      evidence_date: "2026-07-16",
      prerequisite_delivery: {
        pull_request: 472,
        state: "merged",
        merge_method: "regular-merge-commit",
        merge_commit: "6e5197fb9a9200cc1b00db1ee34e072b9de84ea2",
      },
      current_delivery: {
        pull_request: 473,
        url: "https://github.com/gomyway1216/nextjs-portfolio/pull/473",
        state: "ready-open",
        implementation_revision: "2480ff0d4af4324bee3d79ba7dbace54e69ca34a",
        validation_candidate_revision:
          "bbbe91003245ab11ac224fde8af4f855d0ed5afc",
        review:
          "two-actionable-comments-addressed-and-resolved-zero-unresolved",
        continuous_integration: "pending-on-ready-pr-473",
        full_vitest: "passed-on-validation-candidate-bbbe910",
        production_build: "passed-on-validation-candidate-bbbe910",
        merge: "pending-regular-merge-required",
      },
    });
  });

  it("binds public claims to the explicit failure-presence implementation", () => {
    const source = readText(CONNECTOR_SOURCE_PATH);
    expect(source).toContain("let primaryObserved = false;");
    expect(source).toContain("primaryObserved = true;");
    expect(source).not.toContain("sinkFailureObserved");
    expect(source).not.toContain("let sinkFailure:");
    expect(source).toContain(
      "const closeSuccessfully = !primaryObserved && cleanupFailures.length === 0;",
    );
    expect(source).toContain(
      "if (primaryObserved || cleanupFailures.length > 0)",
    );
    expect(source.match(/else if \(error !== primary\)/gu)).toHaveLength(2);
    expect(source).not.toMatch(/primary\s*[!=]==?\s*undefined/u);

    const optionsCapture = source.indexOf(
      "const capturedCheckpointOptions = checkpointOptions(options);",
    );
    const persistenceBoundary = source.indexOf(
      "checkpointMayHavePersisted = true;",
      optionsCapture,
    );
    const sinkInvocation = source.indexOf(
      "const sinkResult = dependencies.checkpoint(",
      persistenceBoundary,
    );
    expect(optionsCapture).toBeGreaterThan(-1);
    expect(persistenceBoundary).toBeGreaterThan(optionsCapture);
    expect(sinkInvocation).toBeGreaterThan(persistenceBoundary);
  });

  it("records undefined failures and the conservative persistence boundary", () => {
    const evidence = JSON.parse(readText(EVIDENCE_PATH));

    expect(evidence.root_cause).toMatchObject({
      classification:
        "javascript-undefined-value-and-failure-presence-sentinel-collision",
      javascript_throw_undefined_is_valid: true,
      javascript_reject_undefined_is_valid: true,
      successful_callback_fulfillment_with_undefined_remains_valid: true,
      raw_payload_value_can_prove_failure_absence: false,
    });
    expect(evidence.failure_state_repair).toMatchObject({
      primary_payload_and_presence_separated: true,
      primary_presence_state: "primaryObserved",
      sink_rejection_observed_by_promise_settlement_branch: true,
      later_settlement_reason_compared_directly_with_current_primary: true,
      separate_sink_failure_cache_present: false,
      undefined_primary_selects_coordinator_close: false,
      undefined_primary_skips_failure_observer: false,
      undefined_primary_can_produce_success_receipt: false,
      observed_primary_selects_abort_and_drain: true,
      raw_primary_payload_may_be_undefined: true,
      raw_primary_payload_is_public: false,
    });
    expect(evidence.checkpoint_persistence_boundary).toMatchObject({
      checkpoint_options_captured_before_boundary: true,
      persistence_possible_set_before_sink_invocation: true,
      synchronous_sink_throw_requires_checkpoint_reconciliation: true,
      sink_rejection_with_any_payload_requires_checkpoint_reconciliation: true,
      postflight_failure_requires_checkpoint_reconciliation: true,
      automatic_fresh_retry_after_sink_invocation: false,
    });
    expect(evidence.undefined_failure_regressions).toEqual([
      expect.objectContaining({
        point: "synchronous-handoff",
        mechanism: "throw-undefined",
        public_phase: "handoff",
        checkpoint_may_have_persisted: false,
        retry_disposition: "fresh-invocation-required",
        success_receipts: 0,
      }),
      expect.objectContaining({
        point: "checkpoint-after-sink-invocation",
        mechanism: "promise-reject-undefined",
        public_phase: "checkpoint",
        checkpoint_may_have_persisted: true,
        retry_disposition: "checkpoint-reconciliation-required",
        success_receipts: 0,
      }),
      expect.objectContaining({
        point: "postflight-after-valid-checkpoint",
        mechanism: "throw-undefined",
        public_phase: "postflight",
        checkpoint_may_have_persisted: true,
        retry_disposition: "checkpoint-reconciliation-required",
        success_receipts: 0,
      }),
    ]);
    expect(evidence.supplementary_regressions).toEqual([
      {
        point: "synchronous-checkpoint-after-sink-invocation",
        mechanism: "throw-undefined",
        public_phase: "checkpoint",
        checkpoint_may_have_persisted: true,
        cleanup_failure_count: 0,
        retry_disposition: "checkpoint-reconciliation-required",
        success_receipts: 0,
      },
      {
        point: "lease-close-after-successful-checkpoint",
        mechanism: "promise-reject-undefined",
        public_phase: "cleanup",
        checkpoint_may_have_persisted: true,
        cleanup_failure_count: 1,
        retry_disposition: "checkpoint-reconciliation-required",
        success_receipts: 0,
      },
    ]);
    expect(evidence.validation).toMatchObject({
      focused_vitest: {
        status: "pass",
        files: 2,
        tests: 127,
        passed: 127,
        failed: 0,
        vitest_duration_seconds: 1.63,
      },
      related_vitest: {
        status: "pass",
        files: 10,
        tests: 252,
        passed: 252,
        failed: 0,
        vitest_duration_seconds: 68.88,
      },
      review: {
        status: "pass",
        actionable_comments: 2,
        actionable_comments_fixed_replied_and_resolved: 2,
        unresolved_threads: 0,
      },
      full_vitest: {
        status: "pass",
        validation_candidate_revision:
          "bbbe91003245ab11ac224fde8af4f855d0ed5afc",
        max_workers: 8,
        files: 148,
        tests: 2746,
        passed: 2746,
        failed: 0,
        vitest_duration_seconds: 155.64,
        wall_seconds: 156.12,
        maximum_rss_bytes: 4365336576,
        swaps: 0,
      },
      production_build: {
        status: "pass",
        validation_candidate_revision:
          "bbbe91003245ab11ac224fde8af4f855d0ed5afc",
        static_pages: 193,
        wall_seconds: 35.08,
        maximum_rss_bytes: 2613690368,
        swaps: 0,
      },
      ml_stdlib: {
        status: "pass",
        tests: 58,
        passed: 58,
        failed: 0,
      },
      npm_audit: {
        status: "pass",
        vulnerabilities: 0,
      },
    });
  });

  it("keeps production counters at zero and the strength plan exact", () => {
    const evidence = JSON.parse(readText(EVIDENCE_PATH));

    for (const count of Object.values(
      evidence.production_execution_for_this_change,
    )) {
      expect(count).toBe(0);
    }
    expect(evidence.playing_strength).toEqual({
      current_production_evaluator: "runOp1",
      current_rollback_evaluator: "runOp1",
      live_weight_changed: false,
      playing_strength_changed_by_this_evidence: false,
      stable_high_dan_claimed: false,
      formal_ab_plan: "192 color-swapped pairs / 384 games",
      formal_ab_color_swapped_pairs: 192,
      formal_ab_total_games: 384,
      external_calibration_games_required: 200,
    });
    expect(evidence.playing_strength.formal_ab_total_games).toBe(
      evidence.playing_strength.formal_ab_color_swapped_pairs * 2,
    );
    for (const claim of Object.values(evidence.nonclaims)) {
      expect(claim).toBe(false);
    }
  });

  it("updates the legacy failure wording without rewriting historical validation", () => {
    const japanese = readText(LEGACY_JAPANESE_ARTICLE_PATH);
    const english = readText(LEGACY_ENGLISH_ARTICLE_PATH);

    expect(japanese).toContain(
      "blog-shogi-floodgate-v7-checkpoint-failure-state-hardening.md",
    );
    expect(english).toContain(
      "blog-shogi-floodgate-v7-checkpoint-failure-state-hardening.en.md",
    );
    expect(japanese).toContain("明示的なobserved-primary bit");
    expect(english).toContain("explicit observed-primary bit");
    expect(japanese).toContain(
      "raw failure payload自体は`undefined`でもよいがfailure stateは残り、publicには出ない",
    );
    expect(english).toContain(
      "The raw failure payload itself may be `undefined`, but its failure state remains and the payload stays nonpublic",
    );
    expect(japanese).toContain(
      "呼出し後のfailureはpayloadやPromise shapeに関係なく必ずreconciliationを要求する",
    );
    expect(english).toContain(
      "every later failure requires reconciliation regardless of payload or Promise shape",
    );
    for (const historicalCount of [
      "57 / 57",
      "132 / 132",
      "335 / 335",
      "2,245 / 2,245",
    ]) {
      expect(japanese).toContain(historicalCount);
      expect(english).toContain(historicalCount);
    }
    expect(japanese).not.toContain(
      "persisted可能性でfresh / reconciliationを分岐",
    );
    expect(english).not.toContain(
      "Fresh / reconciliation depends on persistence possibility",
    );
  });

  it("excludes private values, stale A/B sizing, and invented pending counts", () => {
    const japanese = readText(JAPANESE_ARTICLE_PATH);
    const english = readText(ENGLISH_ARTICLE_PATH);
    const evidenceText = readText(EVIDENCE_PATH);
    const evidence = JSON.parse(evidenceText);
    const combined = `${japanese}\n${english}\n${evidenceText}`;

    expect(combined).toContain("192 color-swapped pairs / 384 games");
    expect(combined).not.toMatch(/\b768\b/u);
    expect(combined).not.toContain("/Users/");
    expect(combined).not.toMatch(/\b[0-9a-f]{64}\b/u);
    expect(combined).not.toMatch(/-----BEGIN [A-Z ]*PRIVATE KEY-----/u);
    expect(combined).not.toContain("PRIVATE_CANARY");

    for (const pending of [
      evidence.validation.continuous_integration,
      evidence.validation.regular_merge,
    ]) {
      expect(Object.keys(pending)).toEqual(["status"]);
      expect(pending.status).toMatch(/^pending/u);
    }

    const keys = new Set<string>();
    collectObjectKeys(evidence, keys);
    for (const forbidden of [
      "absolute_path",
      "effective_user_id",
      "filesystem_device",
      "filesystem_inode",
      "home_directory",
      "key_instance_id",
      "key_material",
      "registry_digest",
      "run_id",
      "work_sha256",
    ]) {
      expect(keys.has(forbidden), forbidden).toBe(false);
    }
  });
});
