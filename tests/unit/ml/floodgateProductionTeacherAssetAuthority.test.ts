import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { SHOGI_WASM_BASE64 } from "../../../src/components/game/ShogiImproved/wasm/shogiWasmBase64";
import * as assetAuthority from "../../../ml/floodgate-production-teacher-asset-authority";
import {
  FLOODGATE_FRESH_SIBLING_PLAN_BYTES,
  FLOODGATE_FRESH_SIBLING_PLAN_SHA256,
  FLOODGATE_STABLE_WASM_BYTES,
  FLOODGATE_STABLE_WASM_SHA256,
  FLOODGATE_STABLE_WEIGHTS_BYTES,
  FLOODGATE_STABLE_WEIGHTS_SHA256,
  FLOODGATE_STABLE_WORKER_SOURCE_BYTES,
  FLOODGATE_STABLE_WORKER_SOURCE_SHA256,
} from "../../../ml/floodgate-stable-wasm-proposer";

const REPOSITORY_ROOT = process.cwd();
const ENGINE_RECEIPT_PATH = path.join(
  REPOSITORY_ROOT,
  "ml",
  "engine-receipts",
  "yaneuraou-9133c527-applem1.json",
);
const AUTHORITY_SOURCE_PATH = path.join(
  REPOSITORY_ROOT,
  "ml",
  "floodgate-production-teacher-asset-authority.ts",
);
const PLAN_PATH = path.join(
  REPOSITORY_ROOT,
  "ml",
  "protocols",
  "floodgate-q1-2026-fresh-sibling-plan.json",
);
const WASM_PATH = path.join(
  REPOSITORY_ROOT,
  "src",
  "components",
  "game",
  "ShogiImproved",
  "wasm",
  "shogi.wasm",
);
const WEIGHTS_PATH = path.join(
  REPOSITORY_ROOT,
  "public",
  "shogi-nnue-weights.bin",
);
const WORKER_PATH = path.join(
  REPOSITORY_ROOT,
  "ml",
  "floodgate-stable-wasm-worker.mjs",
);
const ENGINE_RECEIPT_BYTES = 654;
const ENGINE_RECEIPT_SHA256 =
  "a448c6be4229216665a34dbc13edf89f486364a57958ba1adad76a7b206f9c4e";
const temporaryRoots: string[] = [];
const posixDescribe = describe.runIf(typeof process.geteuid === "function");

type ExpectedRegistry = Parameters<
  typeof assetAuthority.verifyPinnedFloodgateProductionTeacherAssetsCoreForTests
>[0];
type AuthorityDependencies = Parameters<
  typeof assetAuthority.verifyPinnedFloodgateProductionTeacherAssetsCoreForTests
>[2];

interface AssetFixture {
  readonly container: string;
  readonly root: string;
  readonly paths: Readonly<{
    engine: string;
    receipt: string;
    nn: string;
    plan: string;
    wasm: string;
    weights: string;
    worker: string;
  }>;
  readonly bytes: Readonly<{
    engine: Buffer;
    receipt: Buffer;
    nn: Buffer;
    plan: Buffer;
    wasm: Buffer;
    weights: Buffer;
    worker: Buffer;
  }>;
  readonly registry: ExpectedRegistry;
}

function effectiveUserId(): number {
  if (typeof process.geteuid !== "function") {
    throw new Error("production teacher asset tests require a POSIX euid");
  }
  return process.geteuid();
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

async function mkdir0700(directory: string): Promise<void> {
  await fs.promises.mkdir(directory, { recursive: true, mode: 0o700 });
  await fs.promises.chmod(directory, 0o700);
}

async function write0600(
  filePath: string,
  contents: string | Uint8Array,
): Promise<void> {
  await mkdir0700(path.dirname(filePath));
  await fs.promises.writeFile(filePath, contents, { flag: "wx", mode: 0o600 });
  await fs.promises.chmod(filePath, 0o600);
}

function syntheticEngineReceipt(engine: Uint8Array): string {
  return `${JSON.stringify({
    schema: "shogi-teacher-engine-receipt-v1",
    source_repository: "https://example.test/synthetic-engine.git",
    source_commit: "1".repeat(40),
    source_commit_date: "2026-07-02T13:41:06+09:00",
    build_directory: "source",
    build_command: "synthetic test build",
    compiler: "synthetic compiler",
    compiler_target: "synthetic-target",
    engine_id: "synthetic exact teacher engine",
    binary_bytes: engine.byteLength,
    binary_sha256: sha256(engine),
  })}\n`;
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

async function fixture(): Promise<AssetFixture> {
  const created = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "production-teacher-assets-"),
  );
  const container = await fs.promises.realpath(created);
  temporaryRoots.push(container);
  await fs.promises.chmod(container, 0o700);
  const root = path.join(container, "deployment");
  const paths = Object.freeze({
    engine: path.join(root, "engine", "yaneuraou"),
    receipt: path.join(root, "engine", "yaneuraou-receipt.json"),
    nn: path.join(root, "eval", "nn.bin"),
    plan: path.join(root, "stable", "floodgate-plan.json"),
    wasm: path.join(root, "stable", "shogi.wasm"),
    weights: path.join(root, "stable", "shogi-nnue-weights.bin"),
    worker: path.join(root, "stable", "floodgate-stable-wasm-worker.mjs"),
  });
  await Promise.all([
    mkdir0700(root),
    mkdir0700(path.join(root, "engine")),
    mkdir0700(path.join(root, "eval")),
    mkdir0700(path.join(root, "stable")),
  ]);
  const engine = Buffer.from("synthetic pinned YaneuraOu executable\n");
  const receipt = Buffer.from(syntheticEngineReceipt(engine));
  const nn = Buffer.from("synthetic pinned teacher nnue evaluation\n");
  const plan = Buffer.from('{"synthetic":"fixed plan"}\n');
  const wasm = Buffer.from("synthetic stable wasm bytes\n");
  const weights = Buffer.from("synthetic stable weights bytes\n");
  const worker = Buffer.from("export const syntheticWorker = true;\n");
  await Promise.all([
    write0600(paths.engine, engine),
    write0600(paths.receipt, receipt),
    write0600(paths.nn, nn),
    write0600(paths.plan, plan),
    write0600(paths.wasm, wasm),
    write0600(paths.weights, weights),
    write0600(paths.worker, worker),
  ]);
  await fs.promises.chmod(paths.engine, 0o700);
  const registry: ExpectedRegistry = Object.freeze({
    engine: Object.freeze({
      yaneuraou: identity(engine),
      receipt: identity(receipt),
    }),
    eval: Object.freeze({
      nn: identity(nn),
      treeSha256: evalTreeSha256(nn),
    }),
    stable: Object.freeze({
      plan: identity(plan),
      wasm: identity(wasm),
      weights: identity(weights),
      worker: identity(worker),
    }),
  });
  return {
    container,
    root,
    paths,
    bytes: Object.freeze({
      engine,
      receipt,
      nn,
      plan,
      wasm,
      weights,
      worker,
    }),
    registry,
  };
}

function dependencies(
  value: AssetFixture,
  overrides: Partial<AuthorityDependencies> = {},
): AuthorityDependencies {
  return {
    effectiveUserId: effectiveUserId(),
    embeddedWasmBase64: value.bytes.wasm.toString("base64"),
    ...overrides,
  };
}

async function captureFailure(operation: Promise<unknown>): Promise<unknown> {
  try {
    await operation;
  } catch (error) {
    return error;
  }
  throw new Error("expected operation to fail");
}

function expectDeepFrozen(value: unknown, seen = new Set<object>()): void {
  if (value === null || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  expect(Object.isFrozen(value)).toBe(true);
  for (const child of Object.values(value)) expectDeepFrozen(child, seen);
}

function forbiddenReceiptKeys(value: unknown): string[] {
  const forbidden = new Set([
    "fd",
    "handle",
    "rawBytes",
    "rootKey",
    "transaction",
  ]);
  const found = new Set<string>();
  const seen = new Set<object>();
  const visit = (candidate: unknown): void => {
    if (candidate === null || typeof candidate !== "object") return;
    if (seen.has(candidate)) return;
    seen.add(candidate);
    for (const key of Reflect.ownKeys(candidate)) {
      if (typeof key === "string" && forbidden.has(key)) found.add(key);
      visit(Reflect.get(candidate, key));
    }
  };
  visit(value);
  return [...found].sort();
}

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await Promise.all(
    temporaryRoots.splice(0).map(async (root) => {
      await fs.promises.chmod(root, 0o700).catch(() => undefined);
      await fs.promises.rm(root, { recursive: true, force: true });
    }),
  );
});

posixDescribe("Floodgate production teacher asset authority", () => {
  it("verifies an exact synthetic tree and returns an exact compact frozen receipt", async () => {
    const value = await fixture();

    const receipt =
      await assetAuthority.verifyPinnedFloodgateProductionTeacherAssetsCoreForTests(
        value.registry,
        value.root,
        dependencies(value),
      );

    expect(Object.keys(receipt)).toEqual([
      "contract",
      "status",
      "claim_boundary",
      "trust_boundary",
      "execution_boundary",
      "deployment",
      "assets",
      "engine",
      "runtime",
      "postverification",
    ]);
    expectDeepFrozen(receipt);
    expect(forbiddenReceiptKeys(receipt)).toEqual([]);
    const auditText = JSON.stringify(receipt);
    expect(Buffer.byteLength(auditText, "utf8")).toBeLessThan(8_192);
    expect(receipt.deployment).toEqual({
      layout: "fixed-per-user-application-support-v1",
      owner_uid: effectiveUserId(),
      exact_tree: true,
      private_directories: true,
    });
    expect(receipt.execution_boundary).toBe(
      "test-only-injected-expected-registry-and-root",
    );
    expect(receipt.assets.eval.tree_sha256).toBe(
      evalTreeSha256(value.bytes.nn),
    );
  });

  it("rejects extra entries, symlinks, and hardlinks without following aliases", async () => {
    for (const variant of ["extra", "symlink", "hardlink"] as const) {
      const value = await fixture();
      if (variant === "extra") {
        await write0600(
          path.join(value.root, "stable", "unexpected.bin"),
          "synthetic unexpected asset\n",
        );
      } else if (variant === "symlink") {
        const outside = path.join(value.container, "outside-nn.bin");
        await write0600(outside, value.bytes.nn);
        await fs.promises.rm(value.paths.nn);
        await fs.promises.symlink(outside, value.paths.nn);
      } else {
        const outside = path.join(value.container, "outside-weights.bin");
        await write0600(outside, value.bytes.weights);
        await fs.promises.rm(value.paths.weights);
        await fs.promises.link(outside, value.paths.weights);
      }

      const failure = await captureFailure(
        assetAuthority.verifyPinnedFloodgateProductionTeacherAssetsCoreForTests(
          value.registry,
          value.root,
          dependencies(value),
        ),
      );

      expect(failure).toBeInstanceOf(
        assetAuthority.FloodgateProductionTeacherAssetAuthorityError,
      );
      expect(failure).toMatchObject({ phase: "namespace" });
      if (variant === "symlink") {
        expect(
          await fs.promises.readFile(
            path.join(value.container, "outside-nn.bin"),
          ),
        ).toEqual(value.bytes.nn);
      } else if (variant === "hardlink") {
        expect(
          await fs.promises.readFile(
            path.join(value.container, "outside-weights.bin"),
          ),
        ).toEqual(value.bytes.weights);
      }
    }
  });

  it("rejects non-private modes and a mismatched expected uid", async () => {
    for (const target of ["file", "directory", "uid"] as const) {
      const value = await fixture();
      if (target !== "uid") {
        await fs.promises.chmod(
          target === "file"
            ? value.paths.weights
            : path.join(value.root, "stable"),
          target === "file" ? 0o640 : 0o750,
        );
      }

      const failure = await captureFailure(
        assetAuthority.verifyPinnedFloodgateProductionTeacherAssetsCoreForTests(
          value.registry,
          value.root,
          dependencies(
            value,
            target === "uid" ? { effectiveUserId: effectiveUserId() + 1 } : {},
          ),
        ),
      );
      expect(failure).toMatchObject({ phase: "namespace" });
    }
  });

  it("rejects size/hash mutations and engine receipt cross-binding", async () => {
    for (const mutation of ["size", "hash"] as const) {
      const mutated = await fixture();
      if (mutation === "size") {
        await fs.promises.appendFile(mutated.paths.weights, "mutation");
      } else {
        const sameSize = Buffer.from(mutated.bytes.weights);
        sameSize[0] ^= 0x01;
        await fs.promises.writeFile(mutated.paths.weights, sameSize);
      }
      const mutationFailure = await captureFailure(
        assetAuthority.verifyPinnedFloodgateProductionTeacherAssetsCoreForTests(
          mutated.registry,
          mutated.root,
          dependencies(mutated),
        ),
      );
      expect(mutationFailure).toMatchObject({ phase: "asset-read" });
    }

    const crossed = await fixture();
    const otherEngine = Buffer.from("different synthetic engine\n");
    const crossedReceipt = Buffer.from(syntheticEngineReceipt(otherEngine));
    await fs.promises.writeFile(crossed.paths.receipt, crossedReceipt);
    const crossedRegistry: ExpectedRegistry = {
      ...crossed.registry,
      engine: {
        ...crossed.registry.engine,
        receipt: identity(crossedReceipt),
      },
    };
    const crossingFailure = await captureFailure(
      assetAuthority.verifyPinnedFloodgateProductionTeacherAssetsCoreForTests(
        crossedRegistry,
        crossed.root,
        dependencies(crossed),
      ),
    );
    expect(crossingFailure).toMatchObject({ phase: "receipt" });
  });

  it("zero-fills temporary and retained buffers when a held read fails", async () => {
    const value = await fixture();
    const mutatedReceipt = Buffer.from(value.bytes.receipt);
    mutatedReceipt[0] ^= 0x01;
    await fs.promises.writeFile(value.paths.receipt, mutatedReceipt);
    const fills = vi.spyOn(Buffer.prototype, "fill");

    const failure = await captureFailure(
      assetAuthority.verifyPinnedFloodgateProductionTeacherAssetsCoreForTests(
        value.registry,
        value.root,
        dependencies(value),
      ),
    );

    expect(failure).toMatchObject({ phase: "asset-read" });
    const receiptSizedBuffers = fills.mock.instances.filter(
      (candidate): candidate is Buffer =>
        Buffer.isBuffer(candidate) &&
        candidate.byteLength === value.bytes.receipt.byteLength,
    );
    expect(receiptSizedBuffers.length).toBeGreaterThanOrEqual(2);
    for (const buffer of receiptSizedBuffers) {
      expect(buffer.equals(Buffer.alloc(buffer.byteLength))).toBe(true);
    }
  });

  it("preserves a primary held-read failure when cleanup close also fails", async () => {
    const value = await fixture();
    const primary = new Error("synthetic primary held-read failure");
    const cleanup = new Error("synthetic cleanup close failure");
    const originalOpen = fs.promises.open.bind(fs.promises);
    let closeActualHandle: (() => Promise<void>) | undefined;
    vi.spyOn(fs.promises, "open").mockImplementationOnce(
      async (...arguments_: Parameters<typeof fs.promises.open>) => {
        const handle = await originalOpen(...arguments_);
        closeActualHandle = handle.close.bind(handle);
        vi.spyOn(handle, "read").mockRejectedValue(primary);
        vi.spyOn(handle, "close").mockRejectedValue(cleanup);
        return handle;
      },
    );

    const failure = await captureFailure(
      assetAuthority.verifyPinnedFloodgateProductionTeacherAssetsCoreForTests(
        value.registry,
        value.root,
        dependencies(value),
      ),
    );
    await closeActualHandle?.();

    expect(failure).toMatchObject({ phase: "asset-read", primary });
    expect((failure as Error).message).toContain(primary.message);
    expect((failure as Error).message).not.toContain(cleanup.message);
  });

  it("rejects eval_options.txt and late tree mutations", async () => {
    const evalOptions = await fixture();
    await write0600(
      path.join(evalOptions.root, "eval", "eval_options.txt"),
      "synthetic mutable override\n",
    );
    const evalFailure = await captureFailure(
      assetAuthority.verifyPinnedFloodgateProductionTeacherAssetsCoreForTests(
        evalOptions.registry,
        evalOptions.root,
        dependencies(evalOptions),
      ),
    );
    expect(evalFailure).toMatchObject({ phase: "namespace" });

    const afterRead = await fixture();
    let mutatedAfterRead = false;
    const afterReadFailure = await captureFailure(
      assetAuthority.verifyPinnedFloodgateProductionTeacherAssetsCoreForTests(
        afterRead.registry,
        afterRead.root,
        dependencies(afterRead, {
          afterAssetReadForTests: async (relativePath) => {
            if (
              relativePath === "stable/shogi-nnue-weights.bin" &&
              !mutatedAfterRead
            ) {
              mutatedAfterRead = true;
              const sameSize = Buffer.from(afterRead.bytes.weights);
              sameSize[0] ^= 0x01;
              await fs.promises.writeFile(afterRead.paths.weights, sameSize);
            }
          },
        }),
      ),
    );
    expect(mutatedAfterRead).toBe(true);
    expect(afterReadFailure).toMatchObject({ phase: "revalidation" });

    const beforeRevalidation = await fixture();
    const revalidationFailure = await captureFailure(
      assetAuthority.verifyPinnedFloodgateProductionTeacherAssetsCoreForTests(
        beforeRevalidation.registry,
        beforeRevalidation.root,
        dependencies(beforeRevalidation, {
          beforeFinalRevalidationForTests: async () => {
            await write0600(
              path.join(beforeRevalidation.root, "stable", "late-extra.bin"),
              "synthetic late extra\n",
            );
          },
        }),
      ),
    );
    expect(revalidationFailure).toMatchObject({ phase: "revalidation" });
  });

  it("rejects hostile registry and dependency surfaces before asset reads", async () => {
    const value = await fixture();
    const reads = vi.fn();
    const base = dependencies(value, { afterAssetReadForTests: reads });
    const hostileRegistry = new Proxy(value.registry, {});
    const wrongEvalTreeRegistry = {
      ...value.registry,
      eval: { ...value.registry.eval, treeSha256: "0".repeat(64) },
    };
    const oversizedEmbeddedWasm = {
      ...base,
      embeddedWasmBase64: `${base.embeddedWasmBase64}AAAA`,
    };
    const accessorDependencies = Object.create(null) as Record<string, unknown>;
    Object.defineProperties(accessorDependencies, {
      effectiveUserId: { enumerable: true, value: effectiveUserId() },
      embeddedWasmBase64: {
        enumerable: true,
        get: () => value.bytes.wasm.toString("base64"),
      },
    });
    for (const [registry, dependencyValue] of [
      [hostileRegistry, base],
      [wrongEvalTreeRegistry, base],
      [value.registry, oversizedEmbeddedWasm],
      [value.registry, { ...base, unexpected: vi.fn() }],
      [value.registry, accessorDependencies],
    ] as const) {
      const failure = await captureFailure(
        assetAuthority.verifyPinnedFloodgateProductionTeacherAssetsCoreForTests(
          registry as ExpectedRegistry,
          value.root,
          dependencyValue as AuthorityDependencies,
        ),
      );
      expect(failure).toMatchObject({ phase: "capture" });
    }
    expect(reads).not.toHaveBeenCalled();
  });

  it("keeps the production entry point zero-argument", () => {
    expect(
      assetAuthority.verifyPinnedFloodgateProductionTeacherAssets,
    ).toHaveLength(0);
  });

  it("keeps the fixed production root independent of HOME", async () => {
    const source = await fs.promises.readFile(AUTHORITY_SOURCE_PATH, "utf8");
    expect(source).toContain('process.platform !== "darwin"');
    expect(source).toContain('process.arch !== "arm64"');
    expect(source).toContain("const user = os.userInfo();");
    expect(source).toContain("user.uid !== effectiveUserId");
    expect(source).not.toContain("os.homedir()");
  });

  it("pins every tracked static production identity without reading training data", async () => {
    const [receipt, plan, wasm, weights, worker] = await Promise.all([
      fs.promises.readFile(ENGINE_RECEIPT_PATH),
      fs.promises.readFile(PLAN_PATH),
      fs.promises.readFile(WASM_PATH),
      fs.promises.readFile(WEIGHTS_PATH),
      fs.promises.readFile(WORKER_PATH),
    ]);
    expect({ bytes: receipt.byteLength, sha256: sha256(receipt) }).toEqual({
      bytes: ENGINE_RECEIPT_BYTES,
      sha256: ENGINE_RECEIPT_SHA256,
    });
    expect({ bytes: plan.byteLength, sha256: sha256(plan) }).toEqual({
      bytes: FLOODGATE_FRESH_SIBLING_PLAN_BYTES,
      sha256: FLOODGATE_FRESH_SIBLING_PLAN_SHA256,
    });
    expect({ bytes: wasm.byteLength, sha256: sha256(wasm) }).toEqual({
      bytes: FLOODGATE_STABLE_WASM_BYTES,
      sha256: FLOODGATE_STABLE_WASM_SHA256,
    });
    expect({ bytes: weights.byteLength, sha256: sha256(weights) }).toEqual({
      bytes: FLOODGATE_STABLE_WEIGHTS_BYTES,
      sha256: FLOODGATE_STABLE_WEIGHTS_SHA256,
    });
    expect({ bytes: worker.byteLength, sha256: sha256(worker) }).toEqual({
      bytes: FLOODGATE_STABLE_WORKER_SOURCE_BYTES,
      sha256: FLOODGATE_STABLE_WORKER_SOURCE_SHA256,
    });
    expect(Buffer.from(SHOGI_WASM_BASE64, "base64")).toEqual(wasm);
    const trackedReceipt = JSON.parse(receipt.toString("utf8")) as {
      binary_bytes: number;
      binary_sha256: string;
    };
    const trackedPlan = JSON.parse(plan.toString("utf8")) as {
      teacher: {
        proposal: { multipv: number; limit: { depth: number } };
        stable_candidate_asset: { search_depth: number };
        independent_rescore: {
          multipv: number;
          searchmoves: string;
          limit: { depth: number };
        };
        runtime: {
          parallel_engines: number;
          threads_per_engine: number;
          hash_mb_per_engine: number;
          timeout_ms_per_search: number;
        };
      };
    };
    expect(
      assetAuthority.FLOODGATE_PRODUCTION_TEACHER_ASSET_REGISTRY,
    ).toMatchObject({
      engine: {
        yaneuraou: {
          bytes: trackedReceipt.binary_bytes,
          sha256: trackedReceipt.binary_sha256,
        },
        receipt: {
          bytes: ENGINE_RECEIPT_BYTES,
          sha256: ENGINE_RECEIPT_SHA256,
        },
      },
      stable: {
        plan: {
          bytes: FLOODGATE_FRESH_SIBLING_PLAN_BYTES,
          sha256: FLOODGATE_FRESH_SIBLING_PLAN_SHA256,
        },
        wasm: {
          bytes: FLOODGATE_STABLE_WASM_BYTES,
          sha256: FLOODGATE_STABLE_WASM_SHA256,
        },
        weights: {
          bytes: FLOODGATE_STABLE_WEIGHTS_BYTES,
          sha256: FLOODGATE_STABLE_WEIGHTS_SHA256,
        },
        worker: {
          bytes: FLOODGATE_STABLE_WORKER_SOURCE_BYTES,
          sha256: FLOODGATE_STABLE_WORKER_SOURCE_SHA256,
        },
      },
    });
    expectDeepFrozen(
      assetAuthority.FLOODGATE_PRODUCTION_TEACHER_ASSET_REGISTRY,
    );
    expect(assetAuthority.FLOODGATE_PRODUCTION_TEACHER_RUNTIME).toEqual({
      ...trackedPlan.teacher.runtime,
      proposal: {
        multipv: trackedPlan.teacher.proposal.multipv,
        depth: trackedPlan.teacher.proposal.limit.depth,
      },
      independent_rescore: {
        multipv: trackedPlan.teacher.independent_rescore.multipv,
        searchmoves: trackedPlan.teacher.independent_rescore.searchmoves,
        depth: trackedPlan.teacher.independent_rescore.limit.depth,
      },
      stable: {
        depth: trackedPlan.teacher.stable_candidate_asset.search_depth,
      },
    });
    expectDeepFrozen(assetAuthority.FLOODGATE_PRODUCTION_TEACHER_RUNTIME);
  });
});
