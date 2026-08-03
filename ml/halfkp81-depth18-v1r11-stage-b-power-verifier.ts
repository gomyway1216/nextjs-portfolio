import {
  v1r11CanonicalJson,
  v1r11Sha256,
  type V1R11AuthorityFileIdentity,
} from "./halfkp81-depth18-v1r11-authority-io";

const POWER_SCHEMA = "shogi-halfkp81-depth18-power-continuity-ledger-v1r11";
const ENTRY_DOMAIN = "shogi-halfkp81-depth18-power-continuity-entry-v1r11\0";
const REQUIRED_ASSERTIONS = Object.freeze([
  "PreventSystemSleep",
  "PreventUserIdleSystemSleep",
  "PreventUserIdleDisplaySleep",
]);
const SHA256_RE = /^[0-9a-f]{64}$/u;

export interface Halfkp81V1R11FrozenPowerObservation {
  readonly observed_at_ms: number;
  readonly timestamp_utc: string;
  readonly power_source: string;
  readonly battery_percentage: number;
  readonly runner_pid: number;
  readonly guardian_pid: number;
  readonly caffeinate_assertion_holder_pid: number;
  readonly caffeinate_assertion_holder_parent_runner_pid: number;
  readonly caffeinate_executable: string;
  readonly caffeinate_argv: readonly string[];
  readonly runner_utility_argv: readonly string[];
  readonly launchagent_authority_evidence: Readonly<Record<string, unknown>>;
  readonly preformal_authority_verified_receipt: Readonly<V1R11AuthorityFileIdentity>;
  readonly assertion_owner_caffeinate_pid: number;
  readonly required_assertions: readonly string[];
  readonly boot_session_identity: string;
  readonly pmset_start_anchor: Readonly<Record<string, unknown>>;
  readonly pmset_current_cursor: Readonly<Record<string, unknown>>;
}

export interface Halfkp81V1R11FrozenPowerEntry {
  readonly schema: typeof POWER_SCHEMA;
  readonly status: "admission-pass" | "sample-pass" | "final-pass";
  readonly entry_kind: "admission" | "sample" | "final";
  readonly timestamp_utc: string;
  readonly teacher_plan: Readonly<V1R11AuthorityFileIdentity>;
  readonly source_revision: string;
  readonly run_fingerprint: string;
  readonly launchagent_authority_evidence: Readonly<Record<string, unknown>>;
  readonly preformal_authority_verified_receipt: Readonly<V1R11AuthorityFileIdentity>;
  readonly observation: Readonly<Halfkp81V1R11FrozenPowerObservation>;
  readonly previous_entry_sha256: string | null;
  readonly entry_sha256: string;
}

function exactKeys(
  value: Readonly<Record<string, unknown>>,
  keys: readonly string[],
  label: string,
): void {
  if (
    v1r11CanonicalJson(Object.keys(value).sort()) !==
    v1r11CanonicalJson([...keys].sort())
  ) {
    throw new Error(`${label} keys differ`);
  }
}

function integer(value: unknown, minimum: number): boolean {
  return Number.isSafeInteger(value) && Number(value) >= minimum;
}

function iso(value: unknown): boolean {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) &&
    new Date(value).toISOString() === value
  );
}

function verifyObservation(
  observation: Readonly<Halfkp81V1R11FrozenPowerObservation>,
  previous: Readonly<Halfkp81V1R11FrozenPowerObservation> | null,
  first: Readonly<Halfkp81V1R11FrozenPowerObservation>,
): void {
  exactKeys(
    observation as unknown as Readonly<Record<string, unknown>>,
    [
      "observed_at_ms",
      "timestamp_utc",
      "power_source",
      "battery_percentage",
      "runner_pid",
      "guardian_pid",
      "caffeinate_assertion_holder_pid",
      "caffeinate_assertion_holder_parent_runner_pid",
      "caffeinate_executable",
      "caffeinate_argv",
      "runner_utility_argv",
      "launchagent_authority_evidence",
      "preformal_authority_verified_receipt",
      "assertion_owner_caffeinate_pid",
      "required_assertions",
      "boot_session_identity",
      "pmset_start_anchor",
      "pmset_current_cursor",
    ],
    "Stage B power observation",
  );
  if (
    !integer(observation.observed_at_ms, 0) ||
    observation.timestamp_utc !==
      new Date(observation.observed_at_ms).toISOString() ||
    observation.power_source !== "AC Power" ||
    !integer(observation.battery_percentage, 80) ||
    observation.battery_percentage > 100 ||
    !integer(observation.runner_pid, 1) ||
    !integer(observation.guardian_pid, 1) ||
    !integer(observation.caffeinate_assertion_holder_pid, 1) ||
    observation.caffeinate_assertion_holder_pid === observation.runner_pid ||
    observation.caffeinate_assertion_holder_parent_runner_pid !==
      observation.runner_pid ||
    observation.assertion_owner_caffeinate_pid !==
      observation.caffeinate_assertion_holder_pid ||
    observation.caffeinate_executable !== "/usr/bin/caffeinate" ||
    !Array.isArray(observation.runner_utility_argv) ||
    observation.runner_utility_argv.length < 1 ||
    observation.runner_utility_argv.some(
      (entry) => typeof entry !== "string" || entry.length < 1,
    ) ||
    v1r11CanonicalJson(observation.caffeinate_argv) !==
      v1r11CanonicalJson([
        "/usr/bin/caffeinate",
        "-dimsu",
        ...observation.runner_utility_argv,
      ]) ||
    v1r11CanonicalJson(observation.required_assertions) !==
      v1r11CanonicalJson(REQUIRED_ASSERTIONS) ||
    typeof observation.boot_session_identity !== "string" ||
    observation.boot_session_identity.length < 1 ||
    observation.pmset_start_anchor === null ||
    observation.pmset_current_cursor === null
  ) {
    throw new Error("Stage B power observation semantics differ");
  }
  if (
    observation.runner_pid !== first.runner_pid ||
    observation.guardian_pid !== first.guardian_pid ||
    observation.caffeinate_assertion_holder_pid !==
      first.caffeinate_assertion_holder_pid ||
    observation.boot_session_identity !== first.boot_session_identity ||
    v1r11CanonicalJson(observation.pmset_start_anchor) !==
      v1r11CanonicalJson(first.pmset_start_anchor) ||
    (previous !== null &&
      (observation.observed_at_ms - previous.observed_at_ms < 0 ||
        observation.observed_at_ms - previous.observed_at_ms > 30_000))
  ) {
    throw new Error("Stage B power continuity differs");
  }
}

export function verifyHalfkp81V1R11FrozenStageBPowerLedger(
  entries: readonly Readonly<Halfkp81V1R11FrozenPowerEntry>[],
  context: Readonly<{
    teacherPlan: Readonly<V1R11AuthorityFileIdentity>;
    sourceRevision: string;
    stageBRunFingerprint: string;
    stageAReceipt: Readonly<V1R11AuthorityFileIdentity>;
    launchAgentEvidence: Readonly<Record<string, unknown>>;
    pmsetRawRows: readonly string[];
  }>,
): Readonly<{
  entries: number;
  first_entry_sha256: string;
  final_entry_sha256: string;
  runner_pid: number;
  guardian_pid: number;
}> {
  if (
    entries.length < 2 ||
    entries[0]?.entry_kind !== "admission" ||
    entries.at(-1)?.entry_kind !== "final" ||
    !SHA256_RE.test(context.stageBRunFingerprint)
  ) {
    throw new Error("Stage B frozen power endpoints differ");
  }
  const first = entries[0]!.observation;
  let previousDigest: string | null = null;
  let previousObservation: Readonly<Halfkp81V1R11FrozenPowerObservation> | null =
    null;
  entries.forEach((entry, index) => {
    exactKeys(
      entry as unknown as Readonly<Record<string, unknown>>,
      [
        "schema",
        "status",
        "entry_kind",
        "timestamp_utc",
        "teacher_plan",
        "source_revision",
        "run_fingerprint",
        "launchagent_authority_evidence",
        "preformal_authority_verified_receipt",
        "observation",
        "previous_entry_sha256",
        "entry_sha256",
      ],
      `Stage B power row ${index + 1}`,
    );
    const expectedKind =
      index === 0
        ? "admission"
        : index === entries.length - 1
          ? "final"
          : "sample";
    const expectedStatus = `${expectedKind}-pass`;
    const { entry_sha256: digest, ...preimage } = entry;
    if (
      entry.schema !== POWER_SCHEMA ||
      entry.entry_kind !== expectedKind ||
      entry.status !== expectedStatus ||
      !iso(entry.timestamp_utc) ||
      entry.timestamp_utc !== entry.observation.timestamp_utc ||
      v1r11CanonicalJson(entry.teacher_plan) !==
        v1r11CanonicalJson(context.teacherPlan) ||
      entry.source_revision !== context.sourceRevision ||
      entry.run_fingerprint !== context.stageBRunFingerprint ||
      v1r11CanonicalJson(entry.launchagent_authority_evidence) !==
        v1r11CanonicalJson(context.launchAgentEvidence) ||
      v1r11CanonicalJson(entry.preformal_authority_verified_receipt) !==
        v1r11CanonicalJson(context.stageAReceipt) ||
      entry.previous_entry_sha256 !== previousDigest ||
      digest !== v1r11Sha256(`${ENTRY_DOMAIN}${v1r11CanonicalJson(preimage)}`)
    ) {
      throw new Error(`Stage B power row ${index + 1} differs`);
    }
    if (
      v1r11CanonicalJson(entry.observation.launchagent_authority_evidence) !==
        v1r11CanonicalJson(context.launchAgentEvidence) ||
      v1r11CanonicalJson(
        entry.observation.preformal_authority_verified_receipt,
      ) !== v1r11CanonicalJson(context.stageAReceipt)
    ) {
      throw new Error(
        `Stage B power row ${index + 1} observation binding differs`,
      );
    }
    verifyObservation(entry.observation, previousObservation, first);
    const anchor = entry.observation.pmset_start_anchor;
    const cursor = entry.observation.pmset_current_cursor;
    exactKeys(
      anchor,
      [
        "boot_session_identity",
        "timestamp_utc",
        "timezone_offset",
        "pmset_event_ordinal",
        "last_raw_event_line_sha256",
      ],
      `Stage B power row ${index + 1} start anchor`,
    );
    exactKeys(
      cursor,
      [
        "boot_session_identity",
        "timestamp_utc",
        "timezone_offset",
        "pmset_event_ordinal",
        "last_raw_event_line_sha256",
      ],
      `Stage B power row ${index + 1} current cursor`,
    );
    const anchorOrdinal = Number(anchor.pmset_event_ordinal);
    const cursorOrdinal = Number(cursor.pmset_event_ordinal);
    const previousOrdinal =
      previousObservation === null
        ? anchorOrdinal
        : Number(previousObservation.pmset_current_cursor.pmset_event_ordinal);
    const intervalRows = context.pmsetRawRows.slice(
      previousOrdinal,
      cursorOrdinal,
    );
    if (
      anchor.boot_session_identity !==
        entry.observation.boot_session_identity ||
      cursor.boot_session_identity !==
        entry.observation.boot_session_identity ||
      !iso(anchor.timestamp_utc) ||
      !iso(cursor.timestamp_utc) ||
      typeof anchor.timezone_offset !== "string" ||
      typeof cursor.timezone_offset !== "string" ||
      !/^[+-]\d{2}:\d{2}$/u.test(anchor.timezone_offset) ||
      cursor.timezone_offset !== anchor.timezone_offset ||
      !integer(anchorOrdinal, 1) ||
      !integer(cursorOrdinal, anchorOrdinal) ||
      cursorOrdinal > context.pmsetRawRows.length ||
      anchor.last_raw_event_line_sha256 !==
        v1r11Sha256(context.pmsetRawRows[anchorOrdinal - 1] ?? "") ||
      cursor.last_raw_event_line_sha256 !==
        v1r11Sha256(context.pmsetRawRows[cursorOrdinal - 1] ?? "") ||
      intervalRows.some((line) =>
        /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} [+-]\d{4}\s+(?:Sleep|DarkWake|Wake|Hibernate)\b/u.test(
          line,
        ),
      )
    ) {
      throw new Error(
        `Stage B power row ${index + 1} raw pmset cursor differs`,
      );
    }
    previousDigest = digest;
    previousObservation = entry.observation;
  });
  if (context.pmsetRawRows.length < 1) {
    throw new Error("Stage B raw pmset transcript is empty");
  }
  const firstAnchor = first.pmset_start_anchor;
  const finalCursor = entries.at(-1)!.observation.pmset_current_cursor;
  const anchorOrdinal = Number(firstAnchor.pmset_event_ordinal);
  const endOrdinal = Number(finalCursor.pmset_event_ordinal);
  if (
    !Number.isSafeInteger(anchorOrdinal) ||
    !Number.isSafeInteger(endOrdinal) ||
    anchorOrdinal < 1 ||
    endOrdinal < anchorOrdinal ||
    endOrdinal > context.pmsetRawRows.length ||
    firstAnchor.last_raw_event_line_sha256 !==
      v1r11Sha256(context.pmsetRawRows[anchorOrdinal - 1]!) ||
    finalCursor.last_raw_event_line_sha256 !==
      v1r11Sha256(context.pmsetRawRows[endOrdinal - 1]!) ||
    context.pmsetRawRows
      .slice(anchorOrdinal, endOrdinal)
      .some((line) =>
        /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} [+-]\d{4}\s+(?:Sleep|DarkWake|Wake|Hibernate)\b/u.test(
          line,
        ),
      )
  ) {
    throw new Error("Stage B raw pmset anchor/cursor interval differs");
  }
  return Object.freeze({
    entries: entries.length,
    first_entry_sha256: entries[0]!.entry_sha256,
    final_entry_sha256: entries.at(-1)!.entry_sha256,
    runner_pid: first.runner_pid,
    guardian_pid: first.guardian_pid,
  });
}
