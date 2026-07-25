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
const packedResearchPatch = join(
  scriptDir,
  "assembly",
  "packed-heap-move-picker-research.patch",
);
const output = join(
  scriptDir,
  "artifacts",
  "shogi-lazy-move-picker-packed-research.wasm",
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
  packedResearchPatch: {
    bytes: 2_985,
    sha256: "cc95e43f0b5274dff695da8e5d04e7fb6588902a212813754ad689a74f1f6657",
  },
  baseResearchSource: {
    bytes: 143_410,
    sha256: "5edc0c5a80f0bd6283a58c42e2d88d0c0125b69a626d7569b216d127995c3153",
  },
  packedResearchSource: {
    bytes: 143_290,
    sha256: "c9b92fa2c98e9effa77681c9f550804cd836896d8aa015bd67d3085c312ab182",
  },
  packedResearchWasm: {
    bytes: 36_284,
    sha256: "8d94d2d9157b3635fd62d20847c08e2c42dbdb29d23c9e4d4e47aca9bbbbad66",
  },
};

function identity(pathOrBytes) {
  const bytes =
    typeof pathOrBytes === "string" ? readFileSync(pathOrBytes) : pathOrBytes;
  return {
    bytes: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

function requireIdentity(pathOrBytes, expected, label) {
  const actual = identity(pathOrBytes);
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
requireIdentity(
  packedResearchPatch,
  EXPECTED.packedResearchPatch,
  "packed research patch",
);

const tempRoot = mkdtempSync(
  join(tmpdir(), "shogi-lazy-move-picker-packed-research-"),
);
try {
  const tempAssembly = join(tempRoot, "wasm-spike", "assembly");
  mkdirSync(tempAssembly, { recursive: true });
  const tempSource = join(tempAssembly, "index.ts");
  copyFileSync(productionSource, tempSource);
  copyFileSync(tablesSource, join(tempAssembly, "tables.ts"));

  run("patch", ["--silent", "-p0"], {
    cwd: tempAssembly,
    input: readFileSync(researchPatch),
  });
  requireIdentity(
    tempSource,
    EXPECTED.baseResearchSource,
    "base research source",
  );

  run("patch", ["--silent", "-p0"], {
    cwd: tempAssembly,
    input: readFileSync(packedResearchPatch),
  });
  const packedSourceIdentity = identity(tempSource);
  requireIdentity(
    tempSource,
    EXPECTED.packedResearchSource,
    "packed research source",
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
  const packedWasmIdentity = identity(tempWasm);
  requireIdentity(
    tempWasm,
    EXPECTED.packedResearchWasm,
    "packed research WASM",
  );

  mkdirSync(dirname(output), { recursive: true });
  copyFileSync(tempWasm, output);

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
    `[packed-lazy-move-picker] source ${packedSourceIdentity.bytes}/${packedSourceIdentity.sha256}\n` +
      `[packed-lazy-move-picker] wrote ${statSync(output).size} bytes to ${output}\n` +
      `[packed-lazy-move-picker] sha256=${packedWasmIdentity.sha256}\n` +
      "[packed-lazy-move-picker] production source, production WASM, and embedded runtime were not modified",
  );
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}
