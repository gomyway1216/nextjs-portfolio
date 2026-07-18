import { builtinModules } from "node:module";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const entrypoint = "ml/run-floodgate-stable-wasm-deadline-diagnostic.ts";
const outputRelative = "ml/run-floodgate-stable-wasm-deadline-diagnostic.cjs";
const outputPath = join(repositoryRoot, outputRelative);
const allowedExternals = new Set([
  ...builtinModules,
  ...builtinModules.map((name) => `node:${name}`),
]);
const exactInputAllowlist = Object.freeze([
  "ml/floodgate-git.ts",
  "ml/floodgate-stable-wasm-deadline-diagnostic-launcher-attestation.ts",
  "ml/floodgate-stable-wasm-deadline-diagnostic-source-provenance.ts",
  "ml/floodgate-stable-wasm-deadline-diagnostic.ts",
  "ml/floodgate-stable-wasm-deadline-public-calibration.ts",
  "ml/floodgate-stable-wasm-deadline-read-only-application-source.ts",
  "ml/floodgate-stable-wasm-deadline-read-only-assets.ts",
  "ml/floodgate-stable-wasm-deadline-read-only-consumer.ts",
  "ml/floodgate-stable-wasm-deadline-read-only-registry.ts",
  "ml/floodgate-stable-wasm-deadline-run-binding.ts",
  "ml/floodgate-training-row-validation.ts",
  "ml/run-floodgate-stable-wasm-deadline-diagnostic.ts",
  "ml/shogi-sfen-codec.ts",
  "ml/shogi-sfen.ts",
  "src/components/game/ShogiImproved/GenerateMovesImproved.ts",
  "src/components/game/ShogiImproved/KyokumenImproved.ts",
  "src/components/game/ShogiImproved/PromotionRulesImproved.ts",
  "src/components/game/ShogiImproved/types.ts",
]);
const forbiddenOutputPatterns = Object.freeze([
  /\/Users\//u,
  /\bnode_modules\b/u,
  /tsx\/cjs/u,
  /NODE_OPTIONS/u,
  /PRIVATE_/u,
  /secret-(?:game|parent|position)/u,
]);

function fail(message) {
  throw new Error(message);
}

if (
  process.argv.length > 3 ||
  (process.argv.length === 3 && process.argv[2] !== "--write")
) {
  fail(
    "usage: node build-floodgate-stable-wasm-deadline-diagnostic-bundle.mjs [--write]",
  );
}

const result = await build({
  absWorkingDir: repositoryRoot,
  bundle: true,
  charset: "utf8",
  entryPoints: [entrypoint],
  format: "cjs",
  legalComments: "none",
  logLevel: "silent",
  metafile: true,
  packages: "bundle",
  platform: "node",
  sourcemap: false,
  target: "node22",
  treeShaking: true,
  write: false,
});
if (result.outputFiles?.length !== 1 || result.metafile === undefined) {
  fail("bundle build did not return exactly one in-memory output");
}
const output = result.outputFiles[0].contents;
const externalImports = Object.values(result.metafile.outputs).flatMap(
  (metadata) => metadata.imports.filter((entry) => entry.external),
);
if (
  externalImports.some(
    (entry) =>
      entry.kind !== "require-call" || !allowedExternals.has(entry.path),
  )
) {
  fail("bundle contains a non-builtin external runtime dependency");
}
const inputPaths = Object.keys(result.metafile.inputs).sort();
if (
  inputPaths.length !== exactInputAllowlist.length ||
  inputPaths.some(
    (inputPath, index) => inputPath !== exactInputAllowlist[index],
  )
) {
  fail("bundle source closure differs from the exact diagnostic allowlist");
}
const text = Buffer.from(output).toString("utf8");
if (text.includes("sourceMappingURL=")) {
  fail("bundle contains a source map reference");
}
if (forbiddenOutputPatterns.some((pattern) => pattern.test(text))) {
  fail("bundle contains forbidden local or non-diagnostic text");
}
if (/require\(["'](?:tsx|esbuild|@|[a-z][^"':/]*)/u.test(text)) {
  /*
   * Legacy unprefixed Node builtins are permitted by the metafile check
   * above. This text check catches package-like requires without trusting a
   * hand-maintained package allowlist.
   */
  const packageLikeRequires = Array.from(
    text.matchAll(/require\(["']([^"']+)["']\)/gu),
    (match) => match[1],
  ).filter((specifier) => !allowedExternals.has(specifier));
  if (packageLikeRequires.length !== 0) {
    fail("bundle contains package resolution at runtime");
  }
}

if (process.argv[2] === "--write") {
  await writeFile(outputPath, output, { mode: 0o644 });
} else {
  const tracked = await readFile(outputPath);
  if (!tracked.equals(output)) {
    fail("tracked deadline diagnostic bundle is stale");
  }
}
