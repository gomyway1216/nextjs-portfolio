#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = join(scriptDir, "..");
const source = join(scriptDir, "assembly", "index.ts");
const tables = join(scriptDir, "assembly", "tables.ts");
const patchFile = join(scriptDir, "assembly", "dual-hash-lock-research.patch");
const output = join(
  scriptDir,
  "artifacts",
  "shogi-dual-hash-lock-research.wasm",
);
const protectedFiles = [
  [
    source,
    139447,
    "0a522e5e167e9a6070d2d1f339ceaada48f623493a827038b744b2b49163115c",
    "production Assembly source",
  ],
  [
    tables,
    3926,
    "ec140608ce91c7892cc7b2bdbbb0892ffc8003ec2b6cca0f81633dfd5f483dd2",
    "production Assembly tables",
  ],
  [
    join(root, "src/components/game/ShogiImproved/wasm/shogi.wasm"),
    35597,
    "e185df728616b7e7af93232ada5e53c33ec7211bf05a99b1e01f48c4e56d813c",
    "production WASM",
  ],
  [
    join(root, "src/components/game/ShogiImproved/wasm/shogiWasmBase64.ts"),
    47993,
    "927c46aa02af2b76fac7608e3512a3d667e96ce4b8d4d8997d9cb23e64af7960",
    "embedded production WASM",
  ],
  [
    join(root, "src/components/game/ShogiImproved/ShogiAIImprovedV20.ts"),
    78406,
    "7b4592da2b348bc38dcc9a70027bb73251052b16bed1c07933e1df16cbd505e3",
    "JavaScript V20 reference",
  ],
  [
    join(root, "public/shogi-nnue-weights.bin"),
    1185988,
    "e4e738f99fbd8685bcfe2700e4df364af6274e75b44b298432fc313b9a3e28dc",
    "live NNUE weights",
  ],
];
const expectedPatch = [
  15102,
  "fff3bae8e979a144e559eb6b33f74b8d148b9f374ddaa38262bc7a9fd0224c88",
];
const expectedPatched = [
  146370,
  "d621248425e30f44ccdeb62d9968980de6eb307d9e277e4e6df96f5246587af6",
];
const expectedWasm = [
  37538,
  "90cbf3ce43197732e1f43ca1b03a344f364d0928c58cd04ba40e62d11f7c8edf",
];

function identity(path) {
  const bytes = readFileSync(path);
  return [bytes.byteLength, createHash("sha256").update(bytes).digest("hex")];
}
function requireIdentity(path, expected, label) {
  const actual = identity(path);
  if (actual[0] !== expected[0] || actual[1] !== expected[1]) {
    throw new Error(
      `${label} identity mismatch: expected ${expected.join("/")}, got ${actual.join("/")}`,
    );
  }
}
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  if (result.status !== 0)
    throw new Error(`${command} failed: ${result.stderr || result.stdout}`);
}

for (const [path, bytes, sha, label] of protectedFiles)
  requireIdentity(path, [bytes, sha], label);
requireIdentity(patchFile, expectedPatch, "research patch");
const tempRoot = mkdtempSync(join(tmpdir(), "shogi-dual-hash-lock-research-"));
try {
  const tempAssembly = join(tempRoot, "wasm-spike", "assembly");
  mkdirSync(tempAssembly, { recursive: true });
  copyFileSync(source, join(tempAssembly, "index.ts"));
  copyFileSync(tables, join(tempAssembly, "tables.ts"));
  run("patch", ["--silent", "-p0"], {
    cwd: tempAssembly,
    input: readFileSync(patchFile),
  });
  requireIdentity(
    join(tempAssembly, "index.ts"),
    expectedPatched,
    "patched research source",
  );
  const tempWasm = join(tempRoot, "research.wasm");
  run(
    "npx",
    [
      "-y",
      "-p",
      "assemblyscript@0.28.19",
      "asc",
      "wasm-spike/assembly/index.ts",
      "--outFile",
      "research.wasm",
      "-O3",
      "--runtime",
      "stub",
      "--noAssert",
      "--enable",
      "simd",
    ],
    { cwd: tempRoot },
  );
  requireIdentity(tempWasm, expectedWasm, "research WASM");
  mkdirSync(dirname(output), { recursive: true });
  copyFileSync(tempWasm, output);
  for (const [path, bytes, sha, label] of protectedFiles)
    requireIdentity(path, [bytes, sha], `${label} after build`);
  console.log(
    `[dual-hash-lock] wrote ${statSync(output).size} bytes to ${output}\n[dual-hash-lock] sha256=${expectedWasm[1]}\n[dual-hash-lock] protected production source, runtime, JS, and weights unchanged`,
  );
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}
