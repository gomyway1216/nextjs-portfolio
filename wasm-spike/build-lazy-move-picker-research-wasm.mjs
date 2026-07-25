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
const productionSource = join(scriptDir, "assembly", "index.ts");
const tablesSource = join(scriptDir, "assembly", "tables.ts");
const productionWasm = join(
  scriptDir,
  "..",
  "src",
  "components",
  "game",
  "ShogiImproved",
  "wasm",
  "shogi.wasm",
);
const researchPatch = join(
  scriptDir,
  "assembly",
  "lazy-move-picker-research.patch",
);
const output = join(
  scriptDir,
  "artifacts",
  "shogi-lazy-move-picker-research.wasm",
);

const EXPECTED = {
  productionSource: {
    bytes: 139_447,
    sha256: "0a522e5e167e9a6070d2d1f339ceaada48f623493a827038b744b2b49163115c",
  },
  productionWasm: {
    bytes: 35_597,
    sha256: "e185df728616b7e7af93232ada5e53c33ec7211bf05a99b1e01f48c4e56d813c",
  },
  researchPatch: {
    bytes: 5_624,
    sha256: "e979b5609bd8d63305037d37860b5f5914fcf641a49f7a61ae0a943af4fb3162",
  },
  patchedSource: {
    bytes: 143_410,
    sha256: "5edc0c5a80f0bd6283a58c42e2d88d0c0125b69a626d7569b216d127995c3153",
  },
  researchWasm: {
    bytes: 36_358,
    sha256: "49b66b2466c654232a6bccc5e3d7a72d69ec71d46977aa17f8644cc84361d311",
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

requireIdentity(
  productionSource,
  EXPECTED.productionSource,
  "production Assembly source",
);
requireIdentity(productionWasm, EXPECTED.productionWasm, "production WASM");
requireIdentity(researchPatch, EXPECTED.researchPatch, "research patch");

const tempRoot = mkdtempSync(
  join(tmpdir(), "shogi-lazy-move-picker-research-"),
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

  // Re-check the forbidden production inputs after the only write above.
  requireIdentity(
    productionSource,
    EXPECTED.productionSource,
    "production Assembly source after build",
  );
  requireIdentity(
    productionWasm,
    EXPECTED.productionWasm,
    "production WASM after build",
  );

  console.log(
    `[lazy-move-picker] wrote ${statSync(output).size} bytes to ${output}\n` +
      `[lazy-move-picker] sha256=${EXPECTED.researchWasm.sha256}\n` +
      "[lazy-move-picker] production source, production WASM, and embedded runtime were not modified",
  );
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}
