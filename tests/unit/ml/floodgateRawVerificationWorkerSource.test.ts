import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  FLOODGATE_RAW_VERIFICATION_WORKER_BUNDLE_BYTES,
  FLOODGATE_RAW_VERIFICATION_WORKER_BUNDLE_RELATIVE_PATH,
  FLOODGATE_RAW_VERIFICATION_WORKER_BUNDLE_SHA256,
  FLOODGATE_RAW_VERIFICATION_WORKER_RUNTIME_CLOSURE,
  FLOODGATE_RAW_VERIFICATION_WORKER_TRANSITIVE_SOURCES,
  captureFloodgateRawVerificationWorkerBundleCoreForTests,
  capturePinnedFloodgateRawVerificationWorkerBundle,
} from "../../../ml/floodgate-raw-verification-worker-source";

const temporaryRoots: string[] = [];
const fixtureRelative = "ml/worker.cjs";
const fixtureSource = Buffer.from('"use strict";\nvoid 0;\n', "utf8");

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function temporaryRoot(): Promise<string> {
  const created = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "floodgate-raw-worker-source-"),
  );
  const root = await fs.promises.realpath(created);
  temporaryRoots.push(root);
  return root;
}

async function writeFixture(root: string): Promise<string> {
  const target = path.join(root, fixtureRelative);
  await fs.promises.mkdir(path.dirname(target), { recursive: true });
  await fs.promises.writeFile(target, fixtureSource, { flag: "wx" });
  return target;
}

function captureFixture(root: string) {
  return captureFloodgateRawVerificationWorkerBundleCoreForTests(
    root,
    fixtureRelative,
    fixtureSource.byteLength,
    sha256(fixtureSource),
  );
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => fs.promises.rm(root, { recursive: true, force: true })),
  );
});

describe("Floodgate pinned raw-verification worker source", () => {
  it("binds the tracked self-contained production bundle and exact source list", () => {
    const root = repositoryRoot();
    const target = path.join(
      root,
      ...FLOODGATE_RAW_VERIFICATION_WORKER_BUNDLE_RELATIVE_PATH.split("/"),
    );
    const bytes = fs.readFileSync(target);
    expect(bytes.byteLength).toBe(
      FLOODGATE_RAW_VERIFICATION_WORKER_BUNDLE_BYTES,
    );
    expect(sha256(bytes)).toBe(FLOODGATE_RAW_VERIFICATION_WORKER_BUNDLE_SHA256);
    expect(FLOODGATE_RAW_VERIFICATION_WORKER_TRANSITIVE_SOURCES).toEqual([
      "ml/floodgate-raw-lock.ts",
      "ml/floodgate-raw-verification-worker-protocol.ts",
      "ml/floodgate-raw-verification-worker.ts",
      "ml/floodgate-source.ts",
    ]);
    expect(FLOODGATE_RAW_VERIFICATION_WORKER_RUNTIME_CLOSURE).toContain(
      "node-builtins-only",
    );
    const lease = capturePinnedFloodgateRawVerificationWorkerBundle(root);
    expect(Buffer.byteLength(lease.source)).toBe(bytes.byteLength);
    expect(lease.source).not.toContain("tsx/cjs");
    expect(lease.source).not.toContain("node_modules");
    lease.assertUnchangedAndClose();
  });

  it("rebuilds the tracked bundle byte-identically in normal unit validation", () => {
    const child = spawnSync(
      process.execPath,
      ["ml/build-floodgate-raw-verification-worker-bundle.mjs"],
      {
        cwd: repositoryRoot(),
        encoding: "utf8",
        env: { ...process.env, NODE_ENV: "test" },
        timeout: 30_000,
      },
    );
    expect(child.error).toBeUndefined();
    expect(child.status).toBe(0);
    expect(child.stdout).toBe("");
    expect(child.stderr).toBe("");
  });

  it("rejects a worker bundle symlink and a symlinked parent", async () => {
    const fileRoot = await temporaryRoot();
    const target = await writeFixture(fileRoot);
    const outside = path.join(fileRoot, "outside.cjs");
    await fs.promises.writeFile(outside, fixtureSource);
    await fs.promises.rm(target);
    await fs.promises.symlink(outside, target);
    expect(() => captureFixture(fileRoot)).toThrow();

    const parentRoot = await temporaryRoot();
    const actualParent = path.join(parentRoot, "actual");
    await fs.promises.mkdir(actualParent);
    await fs.promises.writeFile(
      path.join(actualParent, "worker.cjs"),
      fixtureSource,
    );
    await fs.promises.symlink(actualParent, path.join(parentRoot, "ml"));
    expect(() => captureFixture(parentRoot)).toThrow(/symlink|canonical/);
  });

  it("rejects a pathname swap while workers hold the original inode", async () => {
    const root = await temporaryRoot();
    const target = await writeFixture(root);
    const lease = captureFixture(root);
    const displaced = `${target}.old`;
    await fs.promises.rename(target, displaced);
    await fs.promises.writeFile(target, fixtureSource, { flag: "wx" });
    expect(() => lease.assertUnchangedAndClose()).toThrow(
      /pathname changed|changed while workers ran/,
    );
  });

  it("rejects in-place mutation even if the original bytes are restored", async () => {
    const root = await temporaryRoot();
    const target = await writeFixture(root);
    const lease = captureFixture(root);
    const changed = Buffer.from(fixtureSource);
    changed[changed.byteLength - 2] ^= 1;
    await fs.promises.writeFile(target, changed);
    await fs.promises.writeFile(target, fixtureSource);
    expect(() => lease.assertUnchangedAndClose()).toThrow(
      /changed while workers ran/,
    );
  });

  it("rejects parent-directory churn during the worker lifetime", async () => {
    const root = await temporaryRoot();
    await writeFixture(root);
    const lease = captureFixture(root);
    const transient = path.join(root, "ml/transient");
    await fs.promises.writeFile(transient, "x");
    await fs.promises.rm(transient);
    expect(() => lease.assertUnchangedAndClose()).toThrow(
      /pathname changed|changed while workers ran/,
    );
  });
});

function repositoryRoot(): string {
  return path.resolve(__dirname, "../../..");
}
