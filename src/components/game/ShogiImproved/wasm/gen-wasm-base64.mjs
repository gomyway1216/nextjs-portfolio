/**
 * gen-wasm-base64.mjs — regenerate the embedded shogi WASM modules.
 *
 * The WASM engine binary is embedded as base64 instead of being fetched as an
 * asset so that the exact same loading path works under webpack, Turbopack,
 * vitest and plain node (no bundler-specific asset/wasm module config needed).
 *
 * Usage (after replacing/rebuilding either pinned WASM):
 *   node src/components/game/ShogiImproved/wasm/gen-wasm-base64.mjs
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = dirname(fileURLToPath(import.meta.url));
const targets = [
  {
    wasmFile: 'shogi-halfkp64-rki16.wasm',
    moduleFile: 'shogiHalfkp64Rki16WasmBase64.ts',
  },
  {
    wasmFile: 'shogi-halfkp81-production.wasm',
    moduleFile: 'shogiHalfkp81ProductionWasmBase64.ts',
  },
];

for (const { wasmFile, moduleFile } of targets) {
  const wasm = readFileSync(join(dir, wasmFile));
  const b64 = wasm.toString('base64');
  const sha256 = createHash('sha256').update(wasm).digest('hex');

  const out = `/**
 * AUTO-GENERATED — do not edit by hand.
 *
 * Base64 of ${wasmFile} (${wasm.length} bytes), the AssemblyScript full-search
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

  writeFileSync(join(dir, moduleFile), out);
  console.log(`${moduleFile} written (${wasm.length} bytes -> ${b64.length} base64 chars)`);
}
