import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

import {
  v1r11CanonicalJson,
  v1r11Sha256,
} from "./halfkp81-depth18-v1r11-authority-io";

export interface Halfkp81V1R11RecursiveProducerIdentity {
  readonly source_revision: string;
  readonly entrypoint: string;
  readonly dependency_closure: readonly Readonly<{
    path: string;
    bytes: number;
    sha256: string;
  }>[];
}

export function validateHalfkp81V1R11RecursiveProducerIdentityForTests(
  actual: unknown,
  expected: Readonly<Halfkp81V1R11RecursiveProducerIdentity>,
): void {
  if (
    actual === null ||
    typeof actual !== "object" ||
    Array.isArray(actual) ||
    v1r11CanonicalProducer(actual) !== v1r11CanonicalProducer(expected)
  ) {
    throw new Error("v1r11 recursive producer identity differs");
  }
}

function v1r11CanonicalProducer(value: unknown): string {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("v1r11 recursive producer identity differs");
  }
  const producer = value as Readonly<Record<string, unknown>>;
  if (
    JSON.stringify(Object.keys(producer).sort()) !==
      JSON.stringify(["source_revision", "entrypoint", "dependency_closure"].sort()) ||
    typeof producer.source_revision !== "string" ||
    !REVISION_RE.test(producer.source_revision) ||
    typeof producer.entrypoint !== "string" ||
    !Array.isArray(producer.dependency_closure)
  ) {
    throw new Error("v1r11 recursive producer identity differs");
  }
  return v1r11CanonicalJson(producer);
}

const REVISION_RE = /^[0-9a-f]{40}$/u;
const STATIC_IMPORT_RE =
  /\b(?:import|export)\s+(?:type\s+)?(?:[^;]*?\s+from\s+)?["'](\.[^"']+)["']/gu;
const CALL_IMPORT_RE =
  /\b(?:require|import)\s*\(\s*["'](\.[^"']+)["']\s*\)/gu;
const RUNTIME_ENTRYPOINT_RE = /["'](ml\/[^"']+\.ts)["']/gu;

function utf8Order(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function resolveRelativeImport(
  repositoryRoot: string,
  importer: string,
  specifier: string,
): string {
  const unresolved = path.resolve(
    repositoryRoot,
    path.dirname(importer),
    specifier,
  );
  const candidates = [
    unresolved,
    `${unresolved}.ts`,
    `${unresolved}.tsx`,
    `${unresolved}.js`,
    `${unresolved}.json`,
    path.join(unresolved, "index.ts"),
    path.join(unresolved, "index.tsx"),
    path.join(unresolved, "index.js"),
  ];
  const resolved = candidates.find((candidate) => {
    try {
      return fs.lstatSync(candidate).isFile();
    } catch {
      return false;
    }
  });
  if (resolved === undefined) {
    throw new Error(
      `v1r11 producer closure cannot resolve ${specifier} from ${importer}`,
    );
  }
  const relative = path.relative(repositoryRoot, resolved).split(path.sep).join("/");
  if (
    relative.length < 1 ||
    relative.startsWith("../") ||
    path.isAbsolute(relative)
  ) {
    throw new Error("v1r11 producer closure escaped repository root");
  }
  return relative;
}

function directRelativeImports(
  repositoryRoot: string,
  relativePath: string,
): readonly string[] {
  const raw = fs.readFileSync(path.join(repositoryRoot, relativePath));
  const source = raw.toString("utf8");
  if (!Buffer.from(source, "utf8").equals(raw)) {
    throw new Error(`v1r11 producer closure ${relativePath} is not UTF-8`);
  }
  const imports = new Set<string>();
  for (const expression of [STATIC_IMPORT_RE, CALL_IMPORT_RE]) {
    for (const match of source.matchAll(expression)) {
      imports.add(
        resolveRelativeImport(repositoryRoot, relativePath, match[1]!),
      );
    }
  }
  for (const match of source.matchAll(RUNTIME_ENTRYPOINT_RE)) {
    const runtimePath = match[1]!;
    const absolute = path.join(repositoryRoot, runtimePath);
    try {
      if (fs.lstatSync(absolute).isFile()) imports.add(runtimePath);
    } catch {
      throw new Error(
        `v1r11 producer closure runtime entrypoint ${runtimePath} is missing`,
      );
    }
  }
  return Object.freeze([...imports].sort(utf8Order));
}

export function buildHalfkp81V1R11RecursiveProducerIdentity(
  repositoryRoot: string,
  sourceRevision: string,
  entrypoint: string,
  options: Readonly<{ requireTrackedRevision?: boolean }> = {},
): Readonly<Halfkp81V1R11RecursiveProducerIdentity> {
  if (
    !path.isAbsolute(repositoryRoot) ||
    path.normalize(repositoryRoot) !== repositoryRoot ||
    fs.realpathSync(repositoryRoot) !== repositoryRoot ||
    !REVISION_RE.test(sourceRevision) ||
    path.isAbsolute(entrypoint) ||
    path.normalize(entrypoint).split(path.sep).join("/") !== entrypoint ||
    entrypoint.startsWith("../")
  ) {
    throw new Error("v1r11 producer closure context differs");
  }
  if (
    execFileSync("git", ["-C", repositoryRoot, "rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim() !== sourceRevision
  ) {
    throw new Error("v1r11 producer closure source revision differs");
  }

  const pending = [entrypoint];
  const visited = new Set<string>();
  while (pending.length > 0) {
    const current = pending.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const imported of directRelativeImports(repositoryRoot, current)) {
      if (!visited.has(imported)) pending.push(imported);
    }
  }
  const ordered = Object.freeze([
    entrypoint,
    ...[...visited].filter((value) => value !== entrypoint).sort(utf8Order),
  ]);
  const requireTrackedRevision = options.requireTrackedRevision ?? true;
  const dependencyClosure = ordered.map((relativePath) => {
    const raw = fs.readFileSync(path.join(repositoryRoot, relativePath));
    if (requireTrackedRevision) {
      let tracked: Buffer;
      try {
        tracked = execFileSync(
          "git",
          ["-C", repositoryRoot, "show", `${sourceRevision}:${relativePath}`],
          { encoding: null },
        );
      } catch {
        throw new Error(
          `v1r11 producer closure ${relativePath} is not tracked at source revision`,
        );
      }
      if (!raw.equals(tracked)) {
        throw new Error(
          `v1r11 producer closure ${relativePath} differs from source revision`,
        );
      }
    }
    return Object.freeze({
      path: relativePath,
      bytes: raw.byteLength,
      sha256: v1r11Sha256(raw),
    });
  });
  return Object.freeze({
    source_revision: sourceRevision,
    entrypoint,
    dependency_closure: Object.freeze(dependencyClosure),
  });
}
