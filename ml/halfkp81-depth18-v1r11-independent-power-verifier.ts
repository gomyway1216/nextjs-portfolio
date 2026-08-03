import * as crypto from "node:crypto";

export const INDEPENDENT_V1R11_POWER_LEDGER_SCHEMA =
  "shogi-halfkp81-depth18-power-continuity-ledger-v1r11" as const;
export const INDEPENDENT_V1R11_POWER_RECEIPT_SCHEMA =
  "shogi-halfkp81-depth18-power-continuity-receipt-v1r11" as const;
export const INDEPENDENT_V1R11_ENVIRONMENT_FAULT_SCHEMA =
  "shogi-halfkp81-depth18-yaneura-only-environment-terminal-fault-v1r11" as const;

const ENTRY_DOMAIN =
  "shogi-halfkp81-depth18-power-continuity-entry-v1r11\0";
const MAXIMUM_GAP_MS = 90_000;
const MINIMUM_BATTERY = 80;
const SHA256_RE = /^[0-9a-f]{64}$/u;
const REQUIRED_ASSERTIONS = Object.freeze([
  "PreventSystemSleep",
  "PreventUserIdleSystemSleep",
  "PreventUserIdleDisplaySleep",
] as const);

export interface IndependentV1R11PowerObservation {
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
  readonly assertion_owner_caffeinate_pid: number;
  readonly assertions: readonly string[];
  readonly boot_session_identity: string;
  readonly pmset_event_ordinal: number;
  readonly pmset_previous_raw_event_line_sha256: string | null;
  readonly pmset_last_raw_event_line_sha256: string;
  readonly pmset_anchor_raw_event_line: string;
  readonly pmset_new_raw_event_lines: readonly string[];
}

export interface IndependentV1R11PowerBinding {
  readonly outcome: "success" | "environment-continuity-fault";
  readonly teacher_plan_sha256: string;
  readonly run_fingerprint: string | null;
  readonly launchagent_authority: Readonly<Record<string, unknown>> & {
    readonly sha256: string;
  };
  readonly preformal_authority: Readonly<Record<string, unknown>> & {
    readonly sha256: string;
  };
  readonly runner_pid: number;
  readonly guardian_pid: number;
  readonly caffeinate_assertion_holder_pid: number;
  readonly engines_started: number;
  readonly engines_reaped: number;
  readonly first_engine_started_at_ms: number | null;
  readonly last_engine_reaped_at_ms: number | null;
  readonly all_yaneuraou_processes_reaped: true;
  readonly terminal_fault_preimage_sha256?: string;
}

export interface IndependentV1R11PowerLedgerEntry {
  readonly schema: typeof INDEPENDENT_V1R11_POWER_LEDGER_SCHEMA;
  readonly kind: "admission" | "heartbeat" | "terminal-fault" | "final";
  readonly sequence: number;
  readonly previous_entry_sha256: string | null;
  readonly gap_ms: number;
  readonly status: "pass" | "fail";
  readonly fault_reason: string | null;
  readonly observation: Readonly<IndependentV1R11PowerObservation>;
  readonly binding?: Readonly<IndependentV1R11PowerBinding>;
  readonly entry_sha256: string;
}

function canonical(value: unknown): string {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return JSON.stringify(value);
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object") {
    const row = value as Readonly<Record<string, unknown>>;
    return `{${Object.keys(row)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(row[key])}`)
      .join(",")}}`;
  }
  throw new Error("independent v1r11 power value is not canonicalizable");
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function exactKeys(
  value: Readonly<Record<string, unknown>>,
  expected: readonly string[],
  label: string,
): void {
  if (canonical(Object.keys(value).sort()) !== canonical([...expected].sort())) {
    throw new Error(`${label} keys differ`);
  }
}

function bytewise(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left), Buffer.from(right));
}

function integer(value: unknown, minimum = 0): value is number {
  return Number.isSafeInteger(value) && Number(value) >= minimum;
}

function pmsetEvent(line: string): string | null {
  const match =
    /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} [+-]\d{4}\s+(Sleep|DarkWake|Wake) *\t/u.exec(
      line,
    );
  if (match?.[1] === "Wake") {
    return /Wake from Hibernate/u.test(line) ? "Hibernate" : "Wake";
  }
  return match?.[1] ?? null;
}

function validateObservation(
  value: Readonly<IndependentV1R11PowerObservation>,
  allowContinuityFault = false,
): void {
  exactKeys(
    value as unknown as Readonly<Record<string, unknown>>,
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
      "assertion_owner_caffeinate_pid",
      "assertions",
      "boot_session_identity",
      "pmset_event_ordinal",
      "pmset_previous_raw_event_line_sha256",
      "pmset_last_raw_event_line_sha256",
      "pmset_anchor_raw_event_line",
      "pmset_new_raw_event_lines",
    ],
    "independent power observation",
  );
  const last = value.pmset_new_raw_event_lines.at(-1);
  const expectedLast =
    last === undefined
      ? (value.pmset_previous_raw_event_line_sha256 ??
        sha256(value.pmset_anchor_raw_event_line))
      : sha256(last);
  if (
    !integer(value.observed_at_ms) ||
    value.timestamp_utc !== new Date(value.observed_at_ms).toISOString() ||
    typeof value.power_source !== "string" ||
    value.power_source.length < 1 ||
    !integer(value.battery_percentage) ||
    value.battery_percentage > 100 ||
    !integer(value.runner_pid, 1) ||
    !integer(value.guardian_pid, 1) ||
    !integer(value.caffeinate_assertion_holder_pid, 1) ||
    !integer(value.caffeinate_assertion_holder_parent_runner_pid, 1) ||
    !integer(value.assertion_owner_caffeinate_pid, 1) ||
    typeof value.caffeinate_executable !== "string" ||
    value.caffeinate_executable.length < 1 ||
    !Array.isArray(value.caffeinate_argv) ||
    value.caffeinate_argv.length < 3 ||
    value.caffeinate_argv.some(
      (entry) => typeof entry !== "string" || entry.length < 1,
    ) ||
    !Array.isArray(value.runner_utility_argv) ||
    value.runner_utility_argv.length < 1 ||
    value.runner_utility_argv.some(
      (entry) => typeof entry !== "string" || entry.length < 1,
    ) ||
    !Array.isArray(value.assertions) ||
    value.assertions.some((entry) => typeof entry !== "string") ||
    typeof value.boot_session_identity !== "string" ||
    value.boot_session_identity.length < 1 ||
    !integer(value.pmset_event_ordinal) ||
    (value.pmset_previous_raw_event_line_sha256 !== null &&
      !SHA256_RE.test(value.pmset_previous_raw_event_line_sha256)) ||
    !SHA256_RE.test(value.pmset_last_raw_event_line_sha256) ||
    typeof value.pmset_anchor_raw_event_line !== "string" ||
    value.pmset_anchor_raw_event_line.length < 1 ||
    !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} [+-]\d{4}\s+\S/u.test(
      value.pmset_anchor_raw_event_line,
    ) ||
    !Array.isArray(value.pmset_new_raw_event_lines) ||
    value.pmset_new_raw_event_lines.some(
      (line) => typeof line !== "string" || line.length < 1,
    ) ||
    expectedLast !== value.pmset_last_raw_event_line_sha256
  ) {
    throw new Error("independent power observation differs");
  }
  if (
    !allowContinuityFault &&
    (value.power_source !== "AC Power" ||
      value.caffeinate_assertion_holder_pid === value.runner_pid ||
      value.caffeinate_assertion_holder_parent_runner_pid !== value.runner_pid ||
      value.assertion_owner_caffeinate_pid !==
        value.caffeinate_assertion_holder_pid ||
      value.caffeinate_executable !== "/usr/bin/caffeinate" ||
      canonical(value.caffeinate_argv) !==
        canonical([
          "/usr/bin/caffeinate",
          "-dimsu",
          "-w",
          String(value.runner_pid),
        ]) ||
      canonical([...value.assertions].sort(bytewise)) !==
        canonical([...REQUIRED_ASSERTIONS].sort(bytewise)) ||
      value.pmset_new_raw_event_lines.some((line) => pmsetEvent(line) !== null))
  ) {
    throw new Error("independent power continuity semantics differ");
  }
}

function validateBinding(
  binding: Readonly<IndependentV1R11PowerBinding>,
  observation: Readonly<IndependentV1R11PowerObservation>,
): void {
  const success = binding.outcome === "success";
  exactKeys(
    binding as unknown as Readonly<Record<string, unknown>>,
    success
      ? [
          "outcome",
          "teacher_plan_sha256",
          "run_fingerprint",
          "launchagent_authority",
          "preformal_authority",
          "runner_pid",
          "guardian_pid",
          "caffeinate_assertion_holder_pid",
          "engines_started",
          "engines_reaped",
          "first_engine_started_at_ms",
          "last_engine_reaped_at_ms",
          "all_yaneuraou_processes_reaped",
        ]
      : [
          "outcome",
          "teacher_plan_sha256",
          "run_fingerprint",
          "launchagent_authority",
          "preformal_authority",
          "runner_pid",
          "guardian_pid",
          "caffeinate_assertion_holder_pid",
          "engines_started",
          "engines_reaped",
          "first_engine_started_at_ms",
          "last_engine_reaped_at_ms",
          "all_yaneuraou_processes_reaped",
          "terminal_fault_preimage_sha256",
        ],
    "independent power binding",
  );
  if (
    !SHA256_RE.test(binding.teacher_plan_sha256) ||
    (binding.run_fingerprint !== null &&
      !SHA256_RE.test(binding.run_fingerprint)) ||
    !SHA256_RE.test(binding.launchagent_authority.sha256) ||
    !SHA256_RE.test(binding.preformal_authority.sha256) ||
    binding.runner_pid !== observation.runner_pid ||
    binding.guardian_pid !== observation.guardian_pid ||
    binding.caffeinate_assertion_holder_pid !==
      observation.caffeinate_assertion_holder_pid ||
    !integer(binding.engines_started) ||
    binding.engines_started !== binding.engines_reaped ||
    binding.all_yaneuraou_processes_reaped !== true ||
    (success &&
      (binding.engines_started < 1 ||
        !SHA256_RE.test(String(binding.run_fingerprint)) ||
        !integer(binding.first_engine_started_at_ms, 0) ||
        !integer(binding.last_engine_reaped_at_ms, 0) ||
        Number(binding.last_engine_reaped_at_ms) <
          Number(binding.first_engine_started_at_ms))) ||
    (!success &&
      (!SHA256_RE.test(String(binding.terminal_fault_preimage_sha256)) ||
        (binding.engines_started === 0
          ? binding.first_engine_started_at_ms !== null ||
            binding.last_engine_reaped_at_ms !== null
          : !integer(binding.first_engine_started_at_ms, 0) ||
            !integer(binding.last_engine_reaped_at_ms, 0) ||
            Number(binding.last_engine_reaped_at_ms) <
              Number(binding.first_engine_started_at_ms))))
  ) {
    throw new Error("independent power binding differs");
  }
}

function independentContinuityFailureReason(
  start: Readonly<IndependentV1R11PowerObservation>,
  previous: Readonly<IndependentV1R11PowerObservation>,
  current: Readonly<IndependentV1R11PowerObservation>,
): string | null {
  const gap = current.observed_at_ms - previous.observed_at_ms;
  if (gap < 0 || gap > MAXIMUM_GAP_MS) {
    return "heartbeat-gap-greater-than-90000ms";
  }
  if (current.power_source !== "AC Power") return "power-source-not-AC-Power";
  if (
    current.caffeinate_assertion_holder_parent_runner_pid !==
      current.runner_pid ||
    current.caffeinate_assertion_holder_pid === current.runner_pid
  ) {
    return "caffeinate-assertion-holder-parent-pid-not-exact-runner-pid";
  }
  if (
    current.caffeinate_executable !== "/usr/bin/caffeinate" ||
    canonical(current.caffeinate_argv) !==
      canonical([
        "/usr/bin/caffeinate",
        "-dimsu",
        "-w",
        String(current.runner_pid),
      ])
  ) {
    return "caffeinate-executable-or-argv-mismatch";
  }
  if (
    current.assertion_owner_caffeinate_pid !==
    current.caffeinate_assertion_holder_pid
  ) {
    return "assertion-owner-caffeinate-pid-mismatch";
  }
  if (
    canonical([...current.assertions].sort(bytewise)) !==
    canonical([...REQUIRED_ASSERTIONS].sort(bytewise))
  ) {
    return "required-caffeinate-assertion-missing";
  }
  const event = current.pmset_new_raw_event_lines
    .map(pmsetEvent)
    .find((entry) => entry !== null);
  if (event !== undefined) return `power-event-${event}`;
  if (current.boot_session_identity !== start.boot_session_identity) {
    return "boot-session-identity-change";
  }
  if (
    current.runner_pid !== start.runner_pid ||
    current.guardian_pid !== start.guardian_pid ||
    current.caffeinate_assertion_holder_pid !==
      start.caffeinate_assertion_holder_pid ||
    current.assertion_owner_caffeinate_pid !==
      start.assertion_owner_caffeinate_pid ||
    current.caffeinate_executable !== start.caffeinate_executable ||
    canonical(current.caffeinate_argv) !== canonical(start.caffeinate_argv) ||
    canonical(current.runner_utility_argv) !==
      canonical(start.runner_utility_argv)
  ) {
    return "power-process-identity-change";
  }
  if (
    current.pmset_anchor_raw_event_line !== start.pmset_anchor_raw_event_line ||
    current.pmset_previous_raw_event_line_sha256 !==
      previous.pmset_last_raw_event_line_sha256 ||
    current.pmset_event_ordinal !==
      previous.pmset_event_ordinal + current.pmset_new_raw_event_lines.length ||
    current.pmset_event_ordinal < previous.pmset_event_ordinal
  ) {
    return "pmset-anchor-missing-truncated-reset-or-ambiguous";
  }
  return null;
}

function verifyCommon(
  entries: readonly Readonly<IndependentV1R11PowerLedgerEntry>[],
  terminalKind: "final" | "terminal-fault",
): void {
  if (
    entries.length < 2 ||
    entries[0]?.kind !== "admission" ||
    entries.at(-1)?.kind !== terminalKind
  ) {
    throw new Error("independent power ledger endpoints differ");
  }
  const start = entries[0]!.observation;
  for (const [index, entry] of entries.entries()) {
    const expectedKeys = [
      "schema",
      "kind",
      "sequence",
      "previous_entry_sha256",
      "gap_ms",
      "status",
      "fault_reason",
      "observation",
      ...(entry.binding === undefined ? [] : ["binding"]),
      "entry_sha256",
    ];
    exactKeys(
      entry as unknown as Readonly<Record<string, unknown>>,
      expectedKeys,
      `independent power row ${index + 1}`,
    );
    const { entry_sha256: digest, ...preimage } = entry;
    const previous = entries[index - 1];
    const terminal = index === entries.length - 1;
    const continuityFaultTerminal =
      terminal && terminalKind === "terminal-fault";
    validateObservation(
      entry.observation,
      continuityFaultTerminal,
    );
    if (
      entry.schema !== INDEPENDENT_V1R11_POWER_LEDGER_SCHEMA ||
      entry.sequence !== index ||
      entry.previous_entry_sha256 !== (previous?.entry_sha256 ?? null) ||
      digest !== sha256(`${ENTRY_DOMAIN}${canonical(preimage)}`) ||
      entry.gap_ms !==
        (previous === undefined
          ? 0
          : entry.observation.observed_at_ms -
            previous.observation.observed_at_ms) ||
      entry.gap_ms < 0 ||
      (!continuityFaultTerminal && entry.gap_ms > MAXIMUM_GAP_MS) ||
      (!continuityFaultTerminal &&
        (entry.observation.boot_session_identity !== start.boot_session_identity ||
          entry.observation.runner_pid !== start.runner_pid ||
          entry.observation.guardian_pid !== start.guardian_pid ||
          entry.observation.caffeinate_assertion_holder_pid !==
            start.caffeinate_assertion_holder_pid ||
          entry.observation.assertion_owner_caffeinate_pid !==
            start.assertion_owner_caffeinate_pid ||
          entry.observation.caffeinate_executable !==
            start.caffeinate_executable ||
          canonical(entry.observation.caffeinate_argv) !==
            canonical(start.caffeinate_argv) ||
          canonical(entry.observation.runner_utility_argv) !==
            canonical(start.runner_utility_argv) ||
          entry.observation.pmset_anchor_raw_event_line !==
            start.pmset_anchor_raw_event_line ||
          (previous !== undefined &&
            (entry.observation.pmset_previous_raw_event_line_sha256 !==
              previous.observation.pmset_last_raw_event_line_sha256 ||
              entry.observation.pmset_event_ordinal !==
                previous.observation.pmset_event_ordinal +
                  entry.observation.pmset_new_raw_event_lines.length ||
              entry.observation.pmset_event_ordinal <
                previous.observation.pmset_event_ordinal))))
    ) {
      throw new Error(`independent power row ${index + 1} differs`);
    }
    if (previous !== undefined) {
      const independentlyClassified = independentContinuityFailureReason(
        start,
        previous.observation,
        entry.observation,
      );
      if (
        (continuityFaultTerminal &&
          independentlyClassified !== entry.fault_reason) ||
        (!continuityFaultTerminal && independentlyClassified !== null)
      ) {
        throw new Error(
          `independent power row ${index + 1} fault classification differs`,
        );
      }
    }
    if (
      (!terminal && (entry.status !== "pass" || entry.fault_reason !== null)) ||
      (terminalKind === "final" &&
        terminal &&
        (entry.status !== "pass" ||
          entry.fault_reason !== null ||
          entry.binding?.outcome !== "success")) ||
      (terminalKind === "terminal-fault" &&
        terminal &&
        (entry.status !== "fail" ||
          entry.fault_reason === null ||
          entry.binding?.outcome !== "environment-continuity-fault"))
    ) {
      throw new Error(`independent power row ${index + 1} status differs`);
    }
    if (entry.binding !== undefined) {
      validateBinding(entry.binding, entry.observation);
      if (
        entry.binding.outcome === "success" &&
        (start.observed_at_ms >
          Number(entry.binding.first_engine_started_at_ms) ||
          entry.observation.observed_at_ms <
            Number(entry.binding.last_engine_reaped_at_ms))
      ) {
        throw new Error("independent power success coverage differs");
      }
      if (
        entry.binding.outcome === "environment-continuity-fault" &&
        entry.binding.last_engine_reaped_at_ms !== null &&
        entry.observation.observed_at_ms <
          entry.binding.last_engine_reaped_at_ms
      ) {
        throw new Error("independent power fault coverage differs");
      }
    }
  }
  if (
    start.pmset_previous_raw_event_line_sha256 !== null ||
    start.pmset_new_raw_event_lines.length !== 0 ||
    start.battery_percentage < MINIMUM_BATTERY
  ) {
    throw new Error("independent power admission differs");
  }
}

export function verifyIndependentV1R11PowerSuccessLedger(
  entries: readonly Readonly<IndependentV1R11PowerLedgerEntry>[],
) {
  verifyCommon(entries, "final");
  return Object.freeze({
    samples: entries.length,
    maximum_gap_ms: Math.max(...entries.map((entry) => entry.gap_ms)),
    final_entry_sha256: entries.at(-1)!.entry_sha256,
  });
}

export function verifyIndependentV1R11PowerFaultLedger(
  entries: readonly Readonly<IndependentV1R11PowerLedgerEntry>[],
) {
  verifyCommon(entries, "terminal-fault");
  return Object.freeze({
    samples: entries.length,
    fault_reason: entries.at(-1)!.fault_reason as string,
    final_entry_sha256: entries.at(-1)!.entry_sha256,
  });
}

export function parseIndependentV1R11PmsetLogRows(
  raw: string,
): readonly string[] {
  const rows = raw
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/u, ""))
    .filter(
      (line) =>
        /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} [+-]\d{4}\s+\S/u.test(line) &&
        !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} [+-]\d{4}\s+: Showing all currently held IOKit power assertions$/u.test(
          line,
        ),
    );
  if (rows.length === 0) throw new Error("pmset log has no anchorable rows");
  return Object.freeze(rows);
}
