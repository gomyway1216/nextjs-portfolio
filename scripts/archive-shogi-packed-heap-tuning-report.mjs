#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { basename, isAbsolute, relative, resolve, sep } from "node:path";

const EXPECTED_SOURCE_BYTES = 286_144;
const EXPECTED_SOURCE_SHA256 =
  "6dd953f6654c40dfc53f37dd3b5c7ddfd8658a55bcf79b6e6093da4b866c951f";

function fail(message) {
  throw new Error(`packed tuning report archive failed: ${message}`);
}

function readArgument(name) {
  const index = process.argv.indexOf(name);
  if (index === -1 || index + 1 >= process.argv.length) {
    fail(`missing ${name}`);
  }
  return process.argv[index + 1];
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function repositoryPath(absolutePath, repositoryRoot) {
  const candidate = relative(repositoryRoot, absolutePath);
  if (
    candidate === "" ||
    candidate === ".." ||
    candidate.startsWith(`..${sep}`) ||
    isAbsolute(candidate)
  ) {
    fail(`absolute path is outside repository root: ${absolutePath}`);
  }
  return candidate.split(sep).join("/");
}

function sanitize(value, repositoryRoot, rewrittenPaths) {
  if (Array.isArray(value)) {
    return value.map((item) => sanitize(item, repositoryRoot, rewrittenPaths));
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        sanitize(item, repositoryRoot, rewrittenPaths),
      ]),
    );
  }
  if (typeof value === "string" && isAbsolute(value)) {
    const replacement = repositoryPath(value, repositoryRoot);
    rewrittenPaths.push(replacement);
    return replacement;
  }
  return value;
}

function collectNumbers(value, output = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectNumbers(item, output);
  } else if (value !== null && typeof value === "object") {
    for (const item of Object.values(value)) collectNumbers(item, output);
  } else if (typeof value === "number") {
    output.push(value);
  }
  return output;
}

const sourcePath = resolve(readArgument("--source"));
const outputPath = resolve(readArgument("--output"));
const repositoryRoot = resolve(readArgument("--repo-root"));
const sourceBytes = readFileSync(sourcePath);
const sourceSha256 = sha256(sourceBytes);

if (sourceBytes.byteLength !== EXPECTED_SOURCE_BYTES) {
  fail(
    `source byte count ${sourceBytes.byteLength} != ${EXPECTED_SOURCE_BYTES}`,
  );
}
if (sourceSha256 !== EXPECTED_SOURCE_SHA256) {
  fail(`source SHA-256 ${sourceSha256} != ${EXPECTED_SOURCE_SHA256}`);
}

const sourceReport = JSON.parse(sourceBytes.toString("utf8"));
const rewrittenPaths = [];
const report = sanitize(sourceReport, repositoryRoot, rewrittenPaths);

if (
  JSON.stringify(sourceReport.fixedDepth.rows) !==
    JSON.stringify(report.fixedDepth.rows) ||
  JSON.stringify(sourceReport.throughput.rows) !==
    JSON.stringify(report.throughput.rows)
) {
  fail("fixed-depth or timing rows changed during sanitization");
}
if (
  JSON.stringify(collectNumbers(sourceReport)) !==
  JSON.stringify(collectNumbers(report))
) {
  fail("numeric values changed during sanitization");
}

const remainingAbsolutePaths = [];
(function inspect(value) {
  if (Array.isArray(value)) {
    value.forEach(inspect);
  } else if (value !== null && typeof value === "object") {
    Object.values(value).forEach(inspect);
  } else if (typeof value === "string" && isAbsolute(value)) {
    remainingAbsolutePaths.push(value);
  }
})(report);
if (remainingAbsolutePaths.length !== 0) {
  fail(`absolute paths remain: ${remainingAbsolutePaths.join(", ")}`);
}

const archive = {
  archiveSchema: "shogi-packed-heap-tuning-report-archive-v1",
  source: {
    basename: basename(sourcePath),
    bytes: sourceBytes.byteLength,
    sha256: sourceSha256,
  },
  sanitization: {
    transformation:
      "Only absolute repository paths were rewritten as repository-relative paths; fixed-depth rows, timing rows, and every numeric value are unchanged.",
    rewrittenAbsolutePaths: rewrittenPaths.length,
  },
  report,
};

writeFileSync(outputPath, `${JSON.stringify(archive, null, 2)}\n`);
const outputBytes = readFileSync(outputPath);
process.stdout.write(
  `${JSON.stringify({
    output: relative(repositoryRoot, outputPath).split(sep).join("/"),
    bytes: outputBytes.byteLength,
    sha256: sha256(outputBytes),
    rewrittenAbsolutePaths: rewrittenPaths.length,
  })}\n`,
);
