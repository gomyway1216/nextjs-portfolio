/**
 * gen-wasm-base64.mjs — regenerate shogiWasmBase64.ts from shogi.wasm.
 *
 * The WASM engine binary is embedded as base64 instead of being fetched as an
 * asset so that the exact same loading path works under webpack, Turbopack,
 * vitest and plain node (no bundler-specific asset/wasm module config needed).
 *
 * Usage (after rebuilding shogi.wasm, see wasm-spike/README.md):
 *   node src/components/game/ShogiImproved/wasm/gen-wasm-base64.mjs
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = dirname(fileURLToPath(import.meta.url));
const wasm = readFileSync(join(dir, 'shogi.wasm'));
const b64 = wasm.toString('base64');
const sha256 = createHash('sha256').update(wasm).digest('hex');

const out = `/**
 * AUTO-GENERATED — do not edit by hand.
 *
 * Base64 of shogi.wasm (${wasm.length} bytes), the AssemblyScript full-search
 * shogi engine (see wasm-spike/README.md for the build instructions).
 * Regenerate with: node src/components/game/ShogiImproved/wasm/gen-wasm-base64.mjs
 */
export const SHOGI_WASM_BASE64 =
  '${b64}';

/** Build-time identity of the exact bytes encoded above. */
export const SHOGI_WASM_IDENTITY = Object.freeze({
  bytes: ${wasm.length},
  sha256: '${sha256}',
});
`;

writeFileSync(join(dir, 'shogiWasmBase64.ts'), out);
console.log(`shogiWasmBase64.ts written (${wasm.length} bytes -> ${b64.length} base64 chars)`);
