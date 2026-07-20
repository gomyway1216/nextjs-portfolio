import { builtinModules } from "node:module";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const entrypoint = "ml/floodgate-raw-verification-worker.ts";
const outputRelative = "ml/floodgate-raw-verification-worker.cjs";
const outputPath = join(repositoryRoot, outputRelative);
const allowedExternals = new Set([
  ...builtinModules,
  ...builtinModules.map((name) => `node:${name}`),
]);
const exactInputAllowlist = Object.freeze([
  "ml/floodgate-raw-lock.ts",
  "ml/floodgate-raw-verification-worker-protocol.ts",
  "ml/floodgate-raw-verification-worker.ts",
  "ml/floodgate-source.ts",
]);
const forbiddenOutputPatterns = Object.freeze([
  /\/Users\//u,
  /\bnode_modules\b/u,
  /tsx\/cjs/u,
  /NODE_OPTIONS/u,
  /PRIVATE_/u,
]);

function fail(message) {
  throw new Error(message);
}

if (
  process.argv.length > 3 ||
  (process.argv.length === 3 && process.argv[2] !== "--write")
) {
  fail(
    "usage: node build-floodgate-raw-verification-worker-bundle.mjs [--write]",
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
  fail(
    `bundle source closure differs from the exact worker allowlist: ${inputPaths.join(",")}`,
  );
}
const text = Buffer.from(output).toString("utf8");
if (
  !Buffer.from(text, "utf8").equals(Buffer.from(output)) ||
  text.includes("sourceMappingURL=")
) {
  fail("bundle is not canonical standalone UTF-8 without a source map");
}
if (forbiddenOutputPatterns.some((pattern) => pattern.test(text))) {
  fail("bundle contains forbidden local or package-loader text");
}
const packageLikeRequires = Array.from(
  text.matchAll(/require\(["']([^"']+)["']\)/gu),
  (match) => match[1],
).filter((specifier) => !allowedExternals.has(specifier));
if (packageLikeRequires.length !== 0) {
  fail("bundle contains package resolution at runtime");
}

if (process.argv[2] === "--write") {
  await writeFile(outputPath, output, { mode: 0o644 });
} else {
  const tracked = await readFile(outputPath);
  if (!tracked.equals(output)) {
    fail("tracked raw-verification worker bundle is stale");
  }
}
