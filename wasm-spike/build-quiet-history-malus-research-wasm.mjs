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
const productionSource = join(scriptDir, "assembly", "index.ts");
const tablesSource = join(scriptDir, "assembly", "tables.ts");
const productionWasm = join(
  root,
  "src",
  "components",
  "game",
  "ShogiImproved",
  "wasm",
  "shogi.wasm",
);
const productionBase64 = join(
  root,
  "src",
  "components",
  "game",
  "ShogiImproved",
  "wasm",
  "shogiWasmBase64.ts",
);
const jsReference = join(
  root,
  "src",
  "components",
  "game",
  "ShogiImproved",
  "ShogiAIImprovedV20.ts",
);
const liveWeights = join(root, "public", "shogi-nnue-weights.bin");
const researchPatch = join(
  scriptDir,
  "assembly",
  "quiet-history-malus-research.patch",
);
const output = join(
  scriptDir,
  "artifacts",
  "shogi-quiet-history-malus-research.wasm",
);

const EXPECTED = {
  productionSource: {
    bytes: 139_447,
    sha256: "0a522e5e167e9a6070d2d1f339ceaada48f623493a827038b744b2b49163115c",
  },
  tablesSource: {
    bytes: 3_926,
    sha256: "ec140608ce91c7892cc7b2bdbbb0892ffc8003ec2b6cca0f81633dfd5f483dd2",
  },
  productionWasm: {
    bytes: 35_597,
    sha256: "e185df728616b7e7af93232ada5e53c33ec7211bf05a99b1e01f48c4e56d813c",
  },
  productionBase64: {
    bytes: 47_993,
    sha256: "927c46aa02af2b76fac7608e3512a3d667e96ce4b8d4d8997d9cb23e64af7960",
  },
  jsReference: {
    bytes: 78_406,
    sha256: "7b4592da2b348bc38dcc9a70027bb73251052b16bed1c07933e1df16cbd505e3",
  },
  liveWeights: {
    bytes: 1_185_988,
    sha256: "e4e738f99fbd8685bcfe2700e4df364af6274e75b44b298432fc313b9a3e28dc",
  },
  researchPatch: {
    bytes: 9_981,
    sha256: "462eeacdfc6bb822537228349905c625350cad2e0785f9aa8a7051d48ac12ca1",
  },
  patchedSource: {
    bytes: 146_625,
    sha256: "77c0c4c20107c644ac5cc004ec7d09b07ca34d9a60446fbdd592d50cc00e0d29",
  },
  researchWasm: {
    bytes: 37_475,
    sha256: "8b0469b220ccaf61eb2e4ab6575d73e681e007ab88367e5892a44778ac5f684c",
  },
};

function identity(path) {
  const bytes = readFileSync(path);
  return {
    bytes: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

function requireIdentity(path, expected, label) {
  const actual = identity(path);
  if (actual.bytes !== expected.bytes || actual.sha256 !== expected.sha256) {
    throw new Error(
      `${label} identity mismatch: expected ${expected.bytes}/${expected.sha256}, ` +
        `got ${actual.bytes}/${actual.sha256}`,
    );
  }
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  if (result.status !== 0) {
    const details = [result.stdout, result.stderr].filter(Boolean).join("\n");
    throw new Error(
      `${command} failed with exit ${result.status}${details ? `\n${details}` : ""}`,
    );
  }
}

const protectedInputs = [
  [productionSource, EXPECTED.productionSource, "production Assembly source"],
  [tablesSource, EXPECTED.tablesSource, "production Assembly tables"],
  [productionWasm, EXPECTED.productionWasm, "production WASM"],
  [productionBase64, EXPECTED.productionBase64, "embedded production WASM"],
  [jsReference, EXPECTED.jsReference, "JavaScript V20 reference"],
  [liveWeights, EXPECTED.liveWeights, "live NNUE weights"],
];
for (const [path, expected, label] of protectedInputs) {
  requireIdentity(path, expected, label);
}
requireIdentity(researchPatch, EXPECTED.researchPatch, "research patch");

const tempRoot = mkdtempSync(
  join(tmpdir(), "shogi-quiet-history-malus-research-"),
);
try {
  const tempAssembly = join(tempRoot, "wasm-spike", "assembly");
  mkdirSync(tempAssembly, { recursive: true });
  copyFileSync(productionSource, join(tempAssembly, "index.ts"));
  copyFileSync(tablesSource, join(tempAssembly, "tables.ts"));

  run("patch", ["--silent", "-p0"], {
    cwd: tempAssembly,
    input: readFileSync(researchPatch),
  });
  requireIdentity(
    join(tempAssembly, "index.ts"),
    EXPECTED.patchedSource,
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
  requireIdentity(tempWasm, EXPECTED.researchWasm, "research WASM");

  mkdirSync(dirname(output), { recursive: true });
  copyFileSync(tempWasm, output);

  for (const [path, expected, label] of protectedInputs) {
    requireIdentity(path, expected, `${label} after build`);
  }

  console.log(
    `[quiet-history-malus] wrote ${statSync(output).size} bytes to ${output}\n` +
      `[quiet-history-malus] sha256=${EXPECTED.researchWasm.sha256}\n` +
      "[quiet-history-malus] production source, WASM, embedded runtime, JS V20, and live weights were not modified",
  );
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}
