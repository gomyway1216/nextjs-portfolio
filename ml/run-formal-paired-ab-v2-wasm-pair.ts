/**
 * One-pair local subprocess entry for the Python formal A/B journal launcher.
 *
 * No command-line arguments are accepted. The exact pair request is read as
 * one canonical JSON line from stdin; repository root is always the physical
 * current working directory. The only stdout line is the complete pair
 * receipt after both isolated players have closed and the assets revalidated.
 */

import * as fs from "node:fs";

import {
  FORMAL_PAIRED_AB_V2_WASM_PAIR_REQUEST_SCHEMA,
  authenticateFormalPairedAbV2WasmPair,
  runAuthenticatedFormalPairedAbV2WasmPair,
  type FormalPairedAbV2PairRequest,
} from "./formal-paired-ab-v2-wasm-match-adapter";

const MAX_STDIN_BYTES = 128 * 1024;

function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (
    typeof value === "string" ||
    typeof value === "boolean" ||
    typeof value === "number"
  ) {
    if (
      typeof value === "number" &&
      (!Number.isFinite(value) || Object.is(value, -0))
    ) {
      throw new Error("canonical JSON rejects nonfinite numbers");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  throw new Error(`canonical JSON rejects ${typeof value}`);
}

async function main(): Promise<number> {
  if (process.argv.length !== 2) {
    process.stderr.write(
      `${canonicalJson({ status: "STOP", reason: "arguments-forbidden" })}\n`,
    );
    return 2;
  }
  const bytes = fs.readFileSync(0);
  if (
    bytes.byteLength === 0 ||
    bytes.byteLength > MAX_STDIN_BYTES ||
    bytes[bytes.byteLength - 1] !== 0x0a ||
    bytes.subarray(0, bytes.byteLength - 1).includes(0x0a)
  ) {
    throw new Error("stdin must be one bounded JSON line with final LF");
  }
  const line = bytes.subarray(0, bytes.byteLength - 1).toString("utf8");
  const value = JSON.parse(line) as FormalPairedAbV2PairRequest;
  if (
    canonicalJson(value) !== line ||
    value.schema !== FORMAL_PAIRED_AB_V2_WASM_PAIR_REQUEST_SCHEMA
  ) {
    throw new Error("stdin is not the exact canonical pair request");
  }
  const authority = authenticateFormalPairedAbV2WasmPair(process.cwd(), value);
  const receipt = await runAuthenticatedFormalPairedAbV2WasmPair(authority);
  process.stdout.write(`${canonicalJson(receipt)}\n`);
  return 0;
}

void main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    const message =
      error instanceof Error ? error.message.slice(0, 900) : "unknown failure";
    process.stderr.write(
      `${canonicalJson({
        status: "STOP",
        reason: "formal-pair-technical-fault",
        message,
      })}\n`,
    );
    process.exitCode = 2;
  },
);
