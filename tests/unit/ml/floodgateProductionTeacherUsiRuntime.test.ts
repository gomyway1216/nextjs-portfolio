import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  FLOODGATE_PRODUCTION_TEACHER_RUNTIME,
  verifyPinnedFloodgateProductionTeacherAssetsCoreForTests,
  type FloodgateProductionTeacherAssetAuthorityReceipt,
  type FloodgateProductionTeacherExpectedAssetRegistry,
} from "../../../ml/floodgate-production-teacher-asset-authority";
import {
  FLOODGATE_PRODUCTION_TEACHER_USI_RUNTIME_CLAIM_BOUNDARY,
  FLOODGATE_PRODUCTION_TEACHER_USI_RUNTIME_CONTRACT,
  FLOODGATE_PRODUCTION_TEACHER_USI_RUNTIME_STATUS,
  FloodgateProductionTeacherUsiRuntimeError,
  createFloodgateProductionTeacherUsiRuntime,
  createFloodgateProductionTeacherUsiRuntimeCoreForTests,
} from "../../../ml/floodgate-production-teacher-usi-runtime";
import * as productionTeacherUsiRuntime from "../../../ml/floodgate-production-teacher-usi-runtime";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RUNTIME_SOURCE = path.resolve(
  HERE,
  "../../../ml/floodgate-production-teacher-usi-runtime.ts",
);
const FAKE_ENGINE = path.resolve(
  HERE,
  "../../fixtures/ml/fake-floodgate-production-usi-engine.mjs",
);
const START_SFEN =
  "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1";
const SYNTHETIC_ENGINE_ID = "synthetic exact production teacher engine";
const temporaryRoots: string[] = [];

interface SyntheticAssets {
  readonly container: string;
  readonly root: string;
  readonly snapshotParent: string;
  readonly trace: string;
  readonly enginePath: string;
  readonly nnPath: string;
  readonly engineBytes: Buffer;
  readonly wasmBase64: string;
  readonly registry: FloodgateProductionTeacherExpectedAssetRegistry;
  readonly authority: FloodgateProductionTeacherAssetAuthorityReceipt<"test-only-injected-expected-registry-and-root">;
}

type TestDependencies = Parameters<
  typeof createFloodgateProductionTeacherUsiRuntimeCoreForTests
>[0];

function effectiveUserId(): number {
  if (typeof process.geteuid !== "function") {
    throw new Error("production USI runtime tests require a POSIX euid");
  }
  return process.geteuid();
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function identity(bytes: Uint8Array): Readonly<{
  readonly bytes: number;
  readonly sha256: string;
}> {
  return Object.freeze({ bytes: bytes.byteLength, sha256: sha256(bytes) });
}

function evalTreeSha256(nn: Uint8Array): string {
  return sha256(
    `eval-tree-v1\0${JSON.stringify({
      bytes: nn.byteLength,
      path: "nn.bin",
      sha256: sha256(nn),
    })}`,
  );
}

async function mkdir0700(directory: string): Promise<void> {
  await fs.promises.mkdir(directory, { recursive: true, mode: 0o700 });
  await fs.promises.chmod(directory, 0o700);
}

async function writePrivate(
  filePath: string,
  contents: string | Uint8Array,
  mode: 0o600 | 0o700 = 0o600,
): Promise<void> {
  await mkdir0700(path.dirname(filePath));
  await fs.promises.writeFile(filePath, contents, { flag: "wx", mode });
  await fs.promises.chmod(filePath, mode);
}

function syntheticReceipt(engine: Uint8Array): Buffer {
  return Buffer.from(
    `${JSON.stringify({
      schema: "shogi-teacher-engine-receipt-v1",
      source_repository: "https://example.test/synthetic-engine.git",
      source_commit: "1".repeat(40),
      source_commit_date: "2026-07-02T13:41:06+09:00",
      build_directory: "source",
      build_command: "synthetic test build",
      compiler: "synthetic compiler",
      compiler_target: "synthetic-target",
      engine_id: SYNTHETIC_ENGINE_ID,
      binary_bytes: engine.byteLength,
      binary_sha256: sha256(engine),
    })}\n`,
  );
}

async function syntheticAssets(): Promise<SyntheticAssets> {
  const created = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "production-teacher-usi-"),
  );
  const container = await fs.promises.realpath(created);
  temporaryRoots.push(container);
  await fs.promises.chmod(container, 0o700);
  const root = path.join(container, "assets");
  const snapshotParent = path.join(container, "snapshots");
  const trace = path.join(container, "trace.jsonl");
  await Promise.all([
    mkdir0700(root),
    mkdir0700(path.join(root, "engine")),
    mkdir0700(path.join(root, "eval")),
    mkdir0700(path.join(root, "stable")),
    mkdir0700(snapshotParent),
  ]);

  const enginePath = path.join(root, "engine", "yaneuraou");
  const receiptPath = path.join(root, "engine", "yaneuraou-receipt.json");
  const nnPath = path.join(root, "eval", "nn.bin");
  const planPath = path.join(root, "stable", "floodgate-plan.json");
  const wasmPath = path.join(root, "stable", "shogi.wasm");
  const weightsPath = path.join(root, "stable", "shogi-nnue-weights.bin");
  const workerPath = path.join(
    root,
    "stable",
    "floodgate-stable-wasm-worker.mjs",
  );
  const engineBytes = Buffer.from("synthetic pinned executable bytes\n");
  const receiptBytes = syntheticReceipt(engineBytes);
  const nnBytes = Buffer.from("synthetic pinned nnue bytes\n");
  const planBytes = Buffer.from('{"synthetic":"plan"}\n');
  const wasmBytes = Buffer.from("synthetic stable wasm\n");
  const weightsBytes = Buffer.from("synthetic stable weights\n");
  const workerBytes = Buffer.from("export const synthetic = true;\n");
  await Promise.all([
    writePrivate(enginePath, engineBytes, 0o700),
    writePrivate(receiptPath, receiptBytes),
    writePrivate(nnPath, nnBytes),
    writePrivate(planPath, planBytes),
    writePrivate(wasmPath, wasmBytes),
    writePrivate(weightsPath, weightsBytes),
    writePrivate(workerPath, workerBytes),
  ]);
  const registry: FloodgateProductionTeacherExpectedAssetRegistry =
    Object.freeze({
      engine: Object.freeze({
        yaneuraou: identity(engineBytes),
        receipt: identity(receiptBytes),
      }),
      eval: Object.freeze({
        nn: identity(nnBytes),
        treeSha256: evalTreeSha256(nnBytes),
      }),
      stable: Object.freeze({
        plan: identity(planBytes),
        wasm: identity(wasmBytes),
        weights: identity(weightsBytes),
        worker: identity(workerBytes),
      }),
    });
  const authority =
    await verifyPinnedFloodgateProductionTeacherAssetsCoreForTests(
      registry,
      root,
      {
        effectiveUserId: effectiveUserId(),
        embeddedWasmBase64: wasmBytes.toString("base64"),
      },
    );
  return {
    container,
    root,
    snapshotParent,
    trace,
    enginePath,
    nnPath,
    engineBytes,
    wasmBase64: wasmBytes.toString("base64"),
    registry,
    authority,
  };
}

function parseTrace(tracePath: string): Array<Record<string, unknown>> {
  if (!fs.existsSync(tracePath)) return [];
  return fs
    .readFileSync(tracePath, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

function processClosed(child: ChildProcessWithoutNullStreams): boolean {
  return child.exitCode !== null || child.signalCode !== null;
}

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function eventually(
  predicate: () => boolean,
  timeoutMs = 2_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline)
      throw new Error("condition did not become true");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

async function findNamed(root: string, basename: string): Promise<string> {
  for (const entry of await fs.promises.readdir(root, {
    withFileTypes: true,
  })) {
    const candidate = path.join(root, entry.name);
    if (entry.isFile() && entry.name === basename) return candidate;
    if (entry.isDirectory()) {
      try {
        return await findNamed(candidate, basename);
      } catch {
        // Continue through sibling directories.
      }
    }
  }
  throw new Error(`could not find ${basename} below synthetic snapshot`);
}

function testDependencies(
  value: SyntheticAssets,
  options: {
    readonly mode?: string;
    readonly modesBySpawn?: readonly string[];
    readonly fakeArguments?: readonly string[];
    readonly overrides?: Partial<TestDependencies>;
    readonly spawns?: ChildProcessWithoutNullStreams[];
    readonly invocations?: Array<{
      readonly file: string;
      readonly args: readonly string[];
      readonly options: Record<string, unknown>;
    }>;
  } = {},
): TestDependencies {
  const spawns = options.spawns ?? [];
  const invocations = options.invocations ?? [];
  let spawnIndex = 0;
  return {
    assetRoot: value.root,
    snapshotParent: value.snapshotParent,
    effectiveUserId: effectiveUserId(),
    verifyAssets: vi.fn(async () =>
      verifyPinnedFloodgateProductionTeacherAssetsCoreForTests(
        value.registry,
        value.root,
        {
          effectiveUserId: effectiveUserId(),
          embeddedWasmBase64: value.wasmBase64,
        },
      ),
    ),
    spawnEngine: (file, args, spawnOptions) => {
      const selectedMode =
        options.modesBySpawn?.[spawnIndex] ?? options.mode ?? "normal";
      spawnIndex += 1;
      invocations.push({
        file,
        args: [...args],
        options: { ...spawnOptions },
      });
      const child = spawn(
        process.execPath,
        [
          FAKE_ENGINE,
          "--mode",
          selectedMode,
          "--engine-id",
          SYNTHETIC_ENGINE_ID,
          "--trace",
          value.trace,
          ...(options.fakeArguments ?? []),
        ],
        {
          cwd: spawnOptions.cwd,
          env: {
            ...spawnOptions.env,
          } as unknown as NodeJS.ProcessEnv,
          stdio: ["pipe", "pipe", "pipe"],
          shell: false,
          windowsHide: true,
          detached: true,
        },
      );
      spawns.push(child);
      return child;
    },
    engineCount: 1,
    depth: 16,
    timeouts: {
      usiMs: 1_000,
      readyMs: 1_000,
      searchMs: 1_000,
      termGraceMs: 50,
      killGraceMs: 1_000,
    },
    limits: {
      lineBytes: 16 * 1024,
      stdoutBytesPerPhase: 256 * 1024,
      stderrBytesTotal: 16 * 1024,
    },
    ...options.overrides,
  };
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => fs.promises.rm(root, { recursive: true, force: true })),
  );
});

const posixDescribe = describe.runIf(typeof process.geteuid === "function");

posixDescribe("Floodgate production teacher USI runtime", () => {
  it("keeps the public production factory argumentless and pins twelve engines", async () => {
    expect(createFloodgateProductionTeacherUsiRuntime).toHaveLength(0);
    expect(FLOODGATE_PRODUCTION_TEACHER_USI_RUNTIME_CONTRACT).toBe(
      "shogi-floodgate-production-teacher-usi-runtime-v1",
    );
    expect(FLOODGATE_PRODUCTION_TEACHER_USI_RUNTIME_STATUS).toBe(
      "initialized-hardened-pinned-usi-process-pool",
    );
    expect(FLOODGATE_PRODUCTION_TEACHER_USI_RUNTIME_CLAIM_BOUNDARY).toBe(
      "engine-runtime-and-search-protocol-not-teacher-label-training-holdout-or-playing-strength-evidence",
    );
    expect(FLOODGATE_PRODUCTION_TEACHER_RUNTIME.parallel_engines).toBe(12);
    expect(
      "FloodgateProductionTeacherUsiPool" in productionTeacherUsiRuntime,
    ).toBe(false);
    const source = await fs.promises.readFile(RUNTIME_SOURCE, "utf8");
    expect(source).not.toContain("os.tmpdir()");
    expect(source).toContain("shogi-production-teacher-runtime-v1");
  });

  it("uses the test-only boundary and exact fixed proposal/rescore transcript", async () => {
    const value = await syntheticAssets();
    const invocations: Array<{
      readonly file: string;
      readonly args: readonly string[];
      readonly options: Record<string, unknown>;
    }> = [];
    const pool = await createFloodgateProductionTeacherUsiRuntimeCoreForTests(
      testDependencies(value, { invocations }),
    );
    let snapshotRoot: string | undefined;
    try {
      expect(Object.getPrototypeOf(pool)).toBeNull();
      expect(Object.isFrozen(pool)).toBe(true);
      expect(Reflect.ownKeys(pool).sort()).toEqual(
        ["close", "poisoned", "propose", "receipt", "rescore"].sort(),
      );
      expect(typeof pool.propose).toBe("function");
      expect(typeof pool.rescore).toBe("function");
      expect(typeof pool.close).toBe("function");
      expect(pool.receipt.execution_boundary).toBe(
        "test-only-injected-asset-root-and-runtime-dependencies",
      );
      expect(pool.receipt.snapshot.engine.mode).toBe("0500");
      expect(pool.receipt.snapshot.eval.mode).toBe("0400");
      expect(pool.poisoned).toBe(false);

      const proposal = await pool.propose(START_SFEN, 5);
      expect(proposal.depth).toBe(16);
      expect(proposal.lines).toHaveLength(5);
      expect(proposal.bestmove).toBe("7g7f");
      expect(Object.isFrozen(proposal)).toBe(true);
      expect(Object.isFrozen(proposal.lines)).toBe(true);
      expect(Object.isFrozen(proposal.lines[0])).toBe(true);
      expect(Object.isFrozen(proposal.lines[0].pv)).toBe(true);

      const rescore = await pool.rescore(START_SFEN, "2g2f");
      expect(rescore.depth).toBe(16);
      expect(rescore.lines.map((line) => [line.multipv, line.move])).toEqual([
        [1, "2g2f"],
      ]);
      expect(invocations).toHaveLength(1);
      expect(invocations[0].args).toEqual([]);
      expect(path.basename(invocations[0].file)).toBe("yaneuraou");
      expect(invocations[0].file).not.toBe(value.enginePath);
      snapshotRoot = path.dirname(path.dirname(invocations[0].file));
      expect((await fs.promises.stat(invocations[0].file)).mode & 0o7777).toBe(
        0o500,
      );
      expect(
        (await fs.promises.stat(path.join(snapshotRoot, "eval", "nn.bin")))
          .mode & 0o7777,
      ).toBe(0o400);
      expect(invocations[0].options).toMatchObject({
        stdio: ["pipe", "pipe", "pipe"],
        shell: false,
        windowsHide: true,
        detached: true,
      });
      expect(Object.keys(invocations[0].options.env as object).sort()).toEqual([
        "HOME",
        "LANG",
        "LC_ALL",
        "PATH",
        "TMPDIR",
        "TZ",
      ]);
      expect(invocations[0].options.env).toMatchObject({
        HOME: expect.stringMatching(/workers\/worker-00\/home$/),
        LANG: "C",
        LC_ALL: "C",
        PATH: "/usr/bin:/bin",
        TMPDIR: expect.stringMatching(/workers\/worker-00\/tmp$/),
        TZ: "UTC",
      });
      expect(invocations[0].options.cwd).toMatch(/workers\/worker-00\/cwd$/);

      const commands = parseTrace(value.trace)
        .filter((event) => event.event === "stdin")
        .map((event) => event.line);
      expect(commands).toEqual([
        "usi",
        expect.stringMatching(/^setoption name EvalDir value /),
        "setoption name FV_SCALE value 20",
        "setoption name USI_Hash value 64",
        "setoption name Threads value 1",
        "setoption name USI_OwnBook value false",
        "setoption name BookFile value no_book",
        "setoption name NetworkDelay value 0",
        "setoption name NetworkDelay2 value 0",
        "isready",
        "usinewgame",
        "isready",
        "usinewgame",
        "setoption name MultiPV value 5",
        `position sfen ${START_SFEN}`,
        "go depth 16",
        "isready",
        "usinewgame",
        "isready",
        "usinewgame",
        "setoption name MultiPV value 1",
        `position sfen ${START_SFEN}`,
        "go depth 16 searchmoves 2g2f",
        "isready",
        "usinewgame",
      ]);
    } finally {
      await pool.close();
    }
    expect(snapshotRoot).toBeDefined();
    expect(fs.existsSync(snapshotRoot as string)).toBe(false);
  });

  it("validates SFEN, move, and legal-move count before writing a search command", async () => {
    const value = await syntheticAssets();
    const pool = await createFloodgateProductionTeacherUsiRuntimeCoreForTests(
      testDependencies(value),
    );
    try {
      const invalidOperations = [
        pool.propose("not an sfen", 5),
        pool.propose(START_SFEN, 1),
        pool.propose(START_SFEN, 5.5),
        pool.propose(START_SFEN, 801),
        pool.rescore(START_SFEN, "7z7f"),
        pool.rescore("not an sfen", "7g7f"),
      ];
      for (const operation of invalidOperations) {
        await expect(operation).rejects.toThrow();
      }
      expect(pool.poisoned).toBe(false);
      const commands = parseTrace(value.trace)
        .filter((event) => event.event === "stdin")
        .map((event) => String(event.line));
      expect(commands.some((line) => line.startsWith("position "))).toBe(false);
      expect(commands.some((line) => line.startsWith("go "))).toBe(false);
    } finally {
      await pool.close();
    }
  });

  it("wraps an invalid test-only canonical path as a capture-phase runtime error", async () => {
    const value = await syntheticAssets();
    let failure: unknown;
    try {
      await createFloodgateProductionTeacherUsiRuntimeCoreForTests({
        ...testDependencies(value),
        assetRoot: "relative-assets-are-not-canonical",
      });
    } catch (primary) {
      failure = primary;
    }
    expect(failure).toBeInstanceOf(FloodgateProductionTeacherUsiRuntimeError);
    expect((failure as FloodgateProductionTeacherUsiRuntimeError).phase).toBe(
      "capture",
    );
  });

  it("leases engines in parallel, queues only a bounded backlog, and does not poison on busy", async () => {
    const value = await syntheticAssets();
    const pool = await createFloodgateProductionTeacherUsiRuntimeCoreForTests(
      testDependencies(value, {
        fakeArguments: ["--delay-ms", "40"],
        overrides: { engineCount: 2 },
      }),
    );
    try {
      const operations = Array.from({ length: 11 }, () =>
        pool.propose(START_SFEN, 2),
      );
      // Attach every rejection handler before observing the deliberately slow
      // in-flight searches; the last call must fail immediately.
      const allSettled = Promise.allSettled(operations);
      await eventually(
        () =>
          parseTrace(value.trace).filter(
            (event) =>
              event.event === "stdin" &&
              String(event.line).startsWith("go depth "),
          ).length === 2,
      );
      const settled = await allSettled;
      expect(
        settled.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(10);
      const rejected = settled.filter((result) => result.status === "rejected");
      expect(rejected).toHaveLength(1);
      expect(String((rejected[0] as PromiseRejectedResult).reason)).toMatch(
        /busy|queue|capacity/i,
      );
      expect(pool.poisoned).toBe(false);
      const searchEvents = parseTrace(value.trace).filter(
        (event) =>
          event.event === "stdin" && String(event.line).startsWith("go depth "),
      );
      expect(searchEvents).toHaveLength(10);
      expect(new Set(searchEvents.map((event) => event.pid)).size).toBe(2);
    } finally {
      await pool.close();
    }
  });

  it("rejects every concurrent operation with the identical global poison after one worker fails", async () => {
    const value = await syntheticAssets();
    const poisonMarker = path.join(value.container, "poison.marker");
    const children: ChildProcessWithoutNullStreams[] = [];
    const pool = await createFloodgateProductionTeacherUsiRuntimeCoreForTests(
      testDependencies(value, {
        modesBySpawn: ["poison-race-failure", "poison-race-success"],
        fakeArguments: ["--poison-marker", poisonMarker],
        spawns: children,
        overrides: { engineCount: 2 },
      }),
    );

    try {
      const settled = await Promise.allSettled([
        pool.propose(START_SFEN, 2),
        pool.propose(START_SFEN, 2),
      ]);
      const rejected = settled.filter(
        (result): result is PromiseRejectedResult =>
          result.status === "rejected",
      );
      expect(settled.filter((result) => result.status === "fulfilled")).toEqual(
        [],
      );
      expect(rejected).toHaveLength(2);
      expect(rejected[0].reason).toBe(rejected[1].reason);
      expect(pool.poisoned).toBe(true);
      expect(fs.existsSync(poisonMarker)).toBe(true);

      const trace = parseTrace(value.trace);
      const successSpawn = trace.find(
        (event) =>
          event.event === "spawn" &&
          Array.isArray(event.argv) &&
          event.argv.includes("poison-race-success"),
      );
      expect(successSpawn).toBeDefined();
      expect(
        trace.some(
          (event) =>
            event.pid === successSpawn?.pid &&
            event.event === "stdout" &&
            String(event.line).startsWith("bestmove "),
        ),
      ).toBe(true);
      await eventually(() => children.every(processClosed));
    } finally {
      await pool.close();
    }
  });

  it("shares one terminal error across active and later work when poison cleanup also fails", async () => {
    const value = await syntheticAssets();
    const poisonMarker = path.join(value.container, "cleanup-poison.marker");
    const children: ChildProcessWithoutNullStreams[] = [];
    const invocations: Array<{
      readonly file: string;
      readonly args: readonly string[];
      readonly options: Record<string, unknown>;
    }> = [];
    const pool = await createFloodgateProductionTeacherUsiRuntimeCoreForTests(
      testDependencies(value, {
        modesBySpawn: ["poison-race-failure", "poison-race-success"],
        fakeArguments: ["--poison-marker", poisonMarker],
        invocations,
        spawns: children,
        overrides: { engineCount: 2 },
      }),
    );
    const snapshotRoot = path.dirname(path.dirname(invocations[0].file));
    const snapshotEval = path.join(snapshotRoot, "eval", "nn.bin");
    const mutatedEval = await fs.promises.readFile(snapshotEval);
    mutatedEval[0] ^= 0x01;
    await fs.promises.chmod(snapshotEval, 0o600);
    await fs.promises.writeFile(snapshotEval, mutatedEval);
    await fs.promises.chmod(snapshotEval, 0o400);

    const active = await Promise.allSettled([
      pool.propose(START_SFEN, 2),
      pool.propose(START_SFEN, 2),
    ]);
    const activeFailures = active.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    expect(activeFailures).toHaveLength(2);
    expect(activeFailures[0].reason).toBe(activeFailures[1].reason);
    expect(activeFailures[0].reason).toBeInstanceOf(
      FloodgateProductionTeacherUsiRuntimeError,
    );
    expect(
      (activeFailures[0].reason as FloodgateProductionTeacherUsiRuntimeError)
        .phase,
    ).toBe("cleanup");

    let laterFailure: unknown;
    try {
      await pool.propose(START_SFEN, 2);
    } catch (primary) {
      laterFailure = primary;
    }
    expect(laterFailure).toBe(activeFailures[0].reason);
    await expect(pool.close()).rejects.toThrow();
    expect(children.every(processClosed)).toBe(true);
    expect(fs.existsSync(snapshotRoot)).toBe(false);
  });

  it("bounds an immediate operation-close race and removes every process and snapshot", async () => {
    const value = await syntheticAssets();
    const children: ChildProcessWithoutNullStreams[] = [];
    const invocations: Array<{
      readonly file: string;
      readonly args: readonly string[];
      readonly options: Record<string, unknown>;
    }> = [];
    const pool = await createFloodgateProductionTeacherUsiRuntimeCoreForTests(
      testDependencies(value, {
        fakeArguments: ["--delay-ms", "40"],
        invocations,
        spawns: children,
      }),
    );
    const snapshotRoot = path.dirname(path.dirname(invocations[0].file));
    const operation = pool.propose(START_SFEN, 2);
    const closing = pool.close();
    const settled = await Promise.race([
      Promise.allSettled([operation, closing]),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("operation-close race timed out")),
          3_000,
        ),
      ),
    ]);

    expect(settled[0].status).toBe("rejected");
    expect(settled[1].status).toBe("fulfilled");
    expect(children).toHaveLength(1);
    expect(children.every(processClosed)).toBe(true);
    expect(fs.existsSync(snapshotRoot)).toBe(false);
  });

  it.each([
    "exit-on-go",
    "wrong-depth",
    "incomplete-multipv",
    "hang-go",
    "missing-bestmove",
    "invalid-bestmove",
    "malformed-info",
    "partial-after-bestmove",
  ])(
    "poisons and closes every process after a search protocol failure: %s",
    async (mode) => {
      const value = await syntheticAssets();
      const children: ChildProcessWithoutNullStreams[] = [];
      const invocations: Array<{
        readonly file: string;
        readonly args: readonly string[];
        readonly options: Record<string, unknown>;
      }> = [];
      const pool = await createFloodgateProductionTeacherUsiRuntimeCoreForTests(
        testDependencies(value, {
          mode,
          spawns: children,
          invocations,
          overrides: { engineCount: 2 },
        }),
      );
      const snapshotRoot = path.dirname(path.dirname(invocations[0].file));

      let poison: unknown;
      try {
        await pool.propose(START_SFEN, 2);
      } catch (error) {
        poison = error;
      }
      expect(poison).toBeInstanceOf(Error);
      expect(pool.poisoned).toBe(true);
      await expect(pool.rescore(START_SFEN, "7g7f")).rejects.toBe(poison);
      await eventually(() => children.every(processClosed));
      await pool.close();
      expect(fs.existsSync(snapshotRoot)).toBe(false);
    },
  );

  it.each([
    ["wrong-id", []],
    ["missing-option", []],
    ["duplicate-option", []],
    ["oversized-line", []],
    ["stdout-flood", ["--stdout-noise-bytes", String(300 * 1024)]],
    ["normal", ["--stderr-bytes", String(20 * 1024)]],
    ["hang-usi", []],
    ["hang-ready", []],
    ["exit-on-usi", []],
    ["exit-on-option", []],
    ["exit-on-ready", []],
    ["fatal-between-phases", []],
    ["partial-after-ready", []],
  ] as const)(
    "fails closed and reaps children for hostile initialization: %s",
    async (mode, fakeArguments) => {
      const value = await syntheticAssets();
      const children: ChildProcessWithoutNullStreams[] = [];
      const invocations: Array<{
        readonly file: string;
        readonly args: readonly string[];
        readonly options: Record<string, unknown>;
      }> = [];
      await expect(
        createFloodgateProductionTeacherUsiRuntimeCoreForTests(
          testDependencies(value, {
            mode,
            fakeArguments,
            spawns: children,
            invocations,
            overrides: {
              timeouts: {
                usiMs: 100,
                readyMs: 100,
                searchMs: 100,
                termGraceMs: 25,
                killGraceMs: 1_000,
              },
            },
          }),
        ),
      ).rejects.toThrow();
      await eventually(
        () => children.length > 0 && children.every(processClosed),
      );
      expect(invocations).toHaveLength(1);
      expect(
        fs.existsSync(path.dirname(path.dirname(invocations[0].file))),
      ).toBe(false);
    },
  );

  it("bounds stdout line count independently of stdout bytes", async () => {
    const value = await syntheticAssets();
    const children: ChildProcessWithoutNullStreams[] = [];
    await expect(
      createFloodgateProductionTeacherUsiRuntimeCoreForTests(
        testDependencies(value, {
          mode: "line-flood",
          fakeArguments: ["--stdout-lines", "64"],
          spawns: children,
          overrides: {
            limits: {
              lineBytes: 16 * 1024,
              stdoutBytesPerPhase: 256 * 1024,
              stdoutLinesPerPhase: 32,
              stderrBytesTotal: 16 * 1024,
            },
          },
        }),
      ),
    ).rejects.toThrow(/line count|bound/i);
    await eventually(
      () => children.length === 1 && children.every(processClosed),
    );
  });

  it("uses distinct private process directories while sharing one immutable snapshot", async () => {
    const value = await syntheticAssets();
    const invocations: Array<{
      readonly file: string;
      readonly args: readonly string[];
      readonly options: Record<string, unknown>;
    }> = [];
    const pool = await createFloodgateProductionTeacherUsiRuntimeCoreForTests(
      testDependencies(value, {
        invocations,
        overrides: { engineCount: 2 },
      }),
    );
    try {
      expect(invocations).toHaveLength(2);
      expect(new Set(invocations.map((entry) => entry.file)).size).toBe(1);
      expect(new Set(invocations.map((entry) => entry.options.cwd)).size).toBe(
        2,
      );
      expect(
        new Set(
          invocations.map(
            (entry) => (entry.options.env as Record<string, string>).HOME,
          ),
        ).size,
      ).toBe(2);
      for (const entry of invocations) {
        expect(
          (await fs.promises.stat(String(entry.options.cwd))).mode & 0o7777,
        ).toBe(0o700);
      }
    } finally {
      await pool.close();
    }
  });

  it.each(["ignore-quit", "ignore-eof"])(
    "escalates ignored orderly shutdown (%s) and confirms process and snapshot cleanup",
    async (mode) => {
      const value = await syntheticAssets();
      const children: ChildProcessWithoutNullStreams[] = [];
      const invocations: Array<{
        readonly file: string;
        readonly args: readonly string[];
        readonly options: Record<string, unknown>;
      }> = [];
      const pool = await createFloodgateProductionTeacherUsiRuntimeCoreForTests(
        testDependencies(value, {
          mode,
          spawns: children,
          invocations,
        }),
      );
      const snapshotRoot = path.dirname(path.dirname(invocations[0].file));

      await pool.close();

      expect(children).toHaveLength(1);
      expect(processClosed(children[0])).toBe(true);
      expect(fs.existsSync(snapshotRoot)).toBe(false);
    },
  );

  it("reaps a same-group descendant after the USI leader exits", async () => {
    const value = await syntheticAssets();
    const descendantPidPath = path.join(value.container, "descendant.pid");
    const children: ChildProcessWithoutNullStreams[] = [];
    const pool = await createFloodgateProductionTeacherUsiRuntimeCoreForTests(
      testDependencies(value, {
        mode: "leader-exit-with-descendant",
        fakeArguments: ["--descendant-pid-file", descendantPidPath],
        spawns: children,
      }),
    );
    let descendantPid: number | undefined;
    try {
      await pool.close();
      descendantPid = Number.parseInt(
        await fs.promises.readFile(descendantPidPath, "utf8"),
        10,
      );
      expect(Number.isSafeInteger(descendantPid) && descendantPid > 1).toBe(
        true,
      );
      await eventually(() => !processAlive(descendantPid as number), 3_000);
      expect(children).toHaveLength(1);
      expect(processClosed(children[0])).toBe(true);
    } finally {
      if (descendantPid !== undefined && processAlive(descendantPid)) {
        process.kill(descendantPid, "SIGKILL");
      }
    }
  });

  it("rejects snapshot-parent aliases and non-private modes before spawning", async () => {
    for (const variant of ["alias", "mode"] as const) {
      const value = await syntheticAssets();
      if (variant === "alias") {
        const target = path.join(value.container, "snapshot-target");
        await mkdir0700(target);
        await fs.promises.rmdir(value.snapshotParent);
        await fs.promises.symlink(target, value.snapshotParent);
      } else {
        await fs.promises.chmod(value.snapshotParent, 0o755);
      }
      const children: ChildProcessWithoutNullStreams[] = [];
      await expect(
        createFloodgateProductionTeacherUsiRuntimeCoreForTests(
          testDependencies(value, { spawns: children }),
        ),
      ).rejects.toThrow();
      expect(children).toHaveLength(0);
    }
  });

  it("cross-binds source and snapshot bytes across both TOCTOU hooks", async () => {
    for (const variant of [
      "source-after-copy",
      "snapshot-before-revalidate",
    ] as const) {
      const value = await syntheticAssets();
      const children: ChildProcessWithoutNullStreams[] = [];
      const mutateSameSize = async (
        target: string,
        mode: 0o500 | 0o700,
      ): Promise<void> => {
        const bytes = await fs.promises.readFile(target);
        bytes[0] ^= 0x01;
        if (mode === 0o500) await fs.promises.chmod(target, 0o700);
        await fs.promises.writeFile(target, bytes);
        await fs.promises.chmod(target, mode);
      };
      const overrides: Partial<TestDependencies> =
        variant === "source-after-copy"
          ? {
              afterSourceCopyForTests: async () =>
                mutateSameSize(value.enginePath, 0o700),
            }
          : {
              beforeSnapshotRevalidationForTests: async () =>
                mutateSameSize(
                  await findNamed(value.snapshotParent, "yaneuraou"),
                  0o500,
                ),
            };

      await expect(
        createFloodgateProductionTeacherUsiRuntimeCoreForTests(
          testDependencies(value, { overrides, spawns: children }),
        ),
      ).rejects.toThrow();
      expect(children).toHaveLength(0);
    }
  });
});
