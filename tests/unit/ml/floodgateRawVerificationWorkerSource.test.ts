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
  type FloodgateRawVerificationWorkerDescriptorOperationsForTests,
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

function captureFixture(
  root: string,
  operations?: FloodgateRawVerificationWorkerDescriptorOperationsForTests,
) {
  return captureFloodgateRawVerificationWorkerBundleCoreForTests(
    root,
    fixtureRelative,
    fixtureSource.byteLength,
    sha256(fixtureSource),
    operations,
  );
}

type DirectoryAcquisitionFault =
  "parent-open" | "parent-fstat" | "parent-realpath";

function faultInjectedDescriptorOperations(
  root: string,
  fault: DirectoryAcquisitionFault,
  failRootClose = false,
): Readonly<{
  operations: FloodgateRawVerificationWorkerDescriptorOperationsForTests;
  openedPaths: Map<number, string>;
  closeCalls: number[];
  primary: Error;
  cleanup: Error;
}> {
  const parent = path.join(root, "ml");
  const openedPaths = new Map<number, string>();
  const closeCalls: number[] = [];
  const primary = new Error(`synthetic ${fault} failure`);
  const cleanup = new Error("synthetic repository-root close failure");
  let parentRealpaths = 0;
  return Object.freeze({
    operations: Object.freeze({
      openSync: (filePath: string, flags: number): number => {
        if (fault === "parent-open" && filePath === parent) throw primary;
        const descriptor = fs.openSync(filePath, flags);
        openedPaths.set(descriptor, filePath);
        return descriptor;
      },
      fstatSync: (descriptor: number): fs.BigIntStats => {
        if (
          fault === "parent-fstat" &&
          openedPaths.get(descriptor) === parent
        ) {
          throw primary;
        }
        return fs.fstatSync(descriptor, { bigint: true });
      },
      realpathSyncNative: (filePath: string): string => {
        if (filePath === parent) {
          parentRealpaths += 1;
          if (fault === "parent-realpath" && parentRealpaths === 2) {
            throw primary;
          }
        }
        return fs.realpathSync.native(filePath);
      },
      closeSync: (descriptor: number): void => {
        closeCalls.push(descriptor);
        fs.closeSync(descriptor);
        if (failRootClose && openedPaths.get(descriptor) === root) {
          throw cleanup;
        }
      },
    }),
    openedPaths,
    closeCalls,
    primary,
    cleanup,
  });
}

function capturedFailure(operation: () => unknown): unknown {
  try {
    operation();
  } catch (error) {
    return error;
  }
  throw new Error("expected operation to fail");
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

  it.each(["parent-open", "parent-fstat", "parent-realpath"] as const)(
    "closes every partially opened descriptor exactly once after a %s failure",
    async (fault) => {
      const root = await temporaryRoot();
      await writeFixture(root);
      const injected = faultInjectedDescriptorOperations(root, fault);

      const failure = capturedFailure(() =>
        captureFixture(root, injected.operations),
      );

      expect(failure).toBe(injected.primary);
      const closedPaths = injected.closeCalls.map((descriptor) =>
        injected.openedPaths.get(descriptor),
      );
      expect(closedPaths).toEqual(
        fault === "parent-open" ? [root] : [path.join(root, "ml"), root],
      );
      expect(new Set(injected.closeCalls).size).toBe(
        injected.closeCalls.length,
      );
      expect(injected.closeCalls).toHaveLength(injected.openedPaths.size);
    },
  );

  it("preserves the parent-open primary and aggregates a repository-root close failure", async () => {
    const root = await temporaryRoot();
    await writeFixture(root);
    const injected = faultInjectedDescriptorOperations(
      root,
      "parent-open",
      true,
    );

    const failure = capturedFailure(() =>
      captureFixture(root, injected.operations),
    );

    expect(failure).toBeInstanceOf(AggregateError);
    const aggregate = failure as AggregateError;
    expect(aggregate.cause).toBe(injected.primary);
    expect(aggregate.errors).toEqual([injected.primary, injected.cleanup]);
    expect(injected.closeCalls).toHaveLength(1);
    expect(injected.openedPaths.get(injected.closeCalls[0])).toBe(root);
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
