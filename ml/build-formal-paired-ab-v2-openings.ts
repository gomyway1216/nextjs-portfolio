/**
 * Argumentless canonical-stdin builder for the fixed label-blind formal A/B
 * v2 opening manifest. The only stdout line is the canonical manifest.
 */

import {
  FORMAL_PAIRED_AB_V2_SOURCE_GAMES_SCHEMA,
  buildFormalPairedAbV2OpeningsManifest,
  formalPairedAbV2CanonicalJson,
  type FormalPairedAbV2SourceGames,
} from "./formal-paired-ab-v2-openings";

const MAX_STDIN_BYTES = 32 * 1024 * 1024;

async function readBoundedStdin(): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const value of process.stdin) {
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
    total += chunk.byteLength;
    if (total > MAX_STDIN_BYTES) {
      throw new Error("stdin exceeds the hard byte limit");
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, total);
}

async function main(): Promise<number> {
  if (process.argv.length !== 2) {
    throw new Error("arguments are forbidden");
  }
  const bytes = await readBoundedStdin();
  if (
    bytes.byteLength === 0 ||
    bytes[bytes.byteLength - 1] !== 0x0a ||
    bytes.subarray(0, bytes.byteLength - 1).includes(0x0a)
  ) {
    throw new Error("stdin must be one bounded JSON line with final LF");
  }
  const line = bytes.subarray(0, bytes.byteLength - 1).toString("utf8");
  const value = JSON.parse(line) as FormalPairedAbV2SourceGames;
  if (
    formalPairedAbV2CanonicalJson(value) !== line ||
    value.schema !== FORMAL_PAIRED_AB_V2_SOURCE_GAMES_SCHEMA
  ) {
    throw new Error("stdin is not the exact canonical source manifest");
  }
  const manifest = buildFormalPairedAbV2OpeningsManifest(value);
  process.stdout.write(`${formalPairedAbV2CanonicalJson(manifest)}\n`);
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
      `${formalPairedAbV2CanonicalJson({
        status: "STOP",
        reason: "formal-opening-builder-fault",
        message,
      })}\n`,
    );
    process.exitCode = 2;
  },
);
