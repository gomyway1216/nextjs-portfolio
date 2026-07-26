/**
 * Fixed read-only authority for only the stable WASM and NNUE bytes consumed by
 * the deadline diagnostic. It carries no engine, evaluator, writer, or teacher
 * authority.
 */

import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { types as nodeUtilTypes } from "node:util";

export const FLOODGATE_STABLE_WASM_DEADLINE_READ_ONLY_ASSET_ROOT_COMPONENTS =
  Object.freeze([
    "Library",
    "Application Support",
    "nextjs-portfolio",
    "shogi-production-teacher-assets-v1",
  ] as const);
export const FLOODGATE_STABLE_WASM_DEADLINE_READ_ONLY_ASSET_IDENTITIES =
  Object.freeze({
    wasm: Object.freeze({
      bytes: 36_545,
      sha256:
        "9142b6b0f0b993596ff3fffa1e05f0d0846bc7672b3f2fc7c90b9f4feaae4c31",
    }),
    weights: Object.freeze({
      bytes: 1_185_988,
      sha256:
        "e4e738f99fbd8685bcfe2700e4df364af6274e75b44b298432fc313b9a3e28dc",
    }),
  } as const);

export interface FloodgateStableWasmDeadlineReadOnlyAssets {
  readonly bytes: Readonly<{
    readonly wasm: Uint8Array;
    readonly weights: Uint8Array;
  }>;
}

interface Snapshot {
  readonly ctimeNs: bigint;
  readonly dev: bigint;
  readonly gid: bigint;
  readonly ino: bigint;
  readonly mode: bigint;
  readonly mtimeNs: bigint;
  readonly nlink: bigint;
  readonly size: bigint;
  readonly uid: bigint;
}

interface OpenedAsset {
  readonly bytes: Buffer;
  readonly handle: fs.promises.FileHandle;
  readonly path: string;
  readonly snapshot: Readonly<Snapshot>;
}

const RELATIVE_ASSETS = Object.freeze([
  Object.freeze({
    key: "wasm" as const,
    relative: Object.freeze(["stable", "shogi.wasm"] as const),
    identity: FLOODGATE_STABLE_WASM_DEADLINE_READ_ONLY_ASSET_IDENTITIES.wasm,
  }),
  Object.freeze({
    key: "weights" as const,
    relative: Object.freeze(["stable", "shogi-nnue-weights.bin"] as const),
    identity: FLOODGATE_STABLE_WASM_DEADLINE_READ_ONLY_ASSET_IDENTITIES.weights,
  }),
] as const);
const MODE_MASK = BigInt(0o7777);
const TYPE_MASK = BigInt(fs.constants.S_IFMT);
const DIRECTORY_TYPE = BigInt(fs.constants.S_IFDIR);
const REGULAR_TYPE = BigInt(fs.constants.S_IFREG);
const DIRECTORY_MODE = BigInt(0o700);
const FILE_MODE = BigInt(0o600);
const HOME_OWNER_MODE = BigInt(0o700);
const HOME_FORBIDDEN_MODE = BigInt(0o7022);
const DIRECTORY_FLAGS =
  fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW;
const FILE_FLAGS = fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW;

function fail(): never {
  throw new Error("stable-WASM deadline read-only assets rejected");
}

function canonicalPath(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 1 &&
    !value.includes("\0") &&
    !value.includes("\n") &&
    !value.includes("\r") &&
    path.isAbsolute(value) &&
    path.resolve(value) === value
  );
}

function snapshot(value: fs.BigIntStats): Readonly<Snapshot> {
  return Object.freeze({
    ctimeNs: value.ctimeNs,
    dev: value.dev,
    gid: value.gid,
    ino: value.ino,
    mode: value.mode,
    mtimeNs: value.mtimeNs,
    nlink: value.nlink,
    size: value.size,
    uid: value.uid,
  });
}

function sameSnapshot(
  left: Readonly<Snapshot>,
  right: Readonly<Snapshot>,
): boolean {
  return (
    left.ctimeNs === right.ctimeNs &&
    left.dev === right.dev &&
    left.gid === right.gid &&
    left.ino === right.ino &&
    left.mode === right.mode &&
    left.mtimeNs === right.mtimeNs &&
    left.nlink === right.nlink &&
    left.size === right.size &&
    left.uid === right.uid
  );
}

function safeDirectory(
  value: Readonly<Snapshot>,
  effectiveUserId: number,
  home: boolean,
): boolean {
  const permissions = value.mode & MODE_MASK;
  return (
    (value.mode & TYPE_MASK) === DIRECTORY_TYPE &&
    value.uid === BigInt(effectiveUserId) &&
    (home
      ? (permissions & HOME_OWNER_MODE) === HOME_OWNER_MODE &&
        (permissions & HOME_FORBIDDEN_MODE) === BigInt(0)
      : permissions === DIRECTORY_MODE)
  );
}

async function openDirectoryChain(
  homeDirectory: string,
  effectiveUserId: number,
): Promise<readonly fs.promises.FileHandle[]> {
  const directories = [
    homeDirectory,
    ...FLOODGATE_STABLE_WASM_DEADLINE_READ_ONLY_ASSET_ROOT_COMPONENTS.map(
      (_component, index) =>
        path.join(
          homeDirectory,
          ...FLOODGATE_STABLE_WASM_DEADLINE_READ_ONLY_ASSET_ROOT_COMPONENTS.slice(
            0,
            index + 1,
          ),
        ),
    ),
    path.join(
      homeDirectory,
      ...FLOODGATE_STABLE_WASM_DEADLINE_READ_ONLY_ASSET_ROOT_COMPONENTS,
      "stable",
    ),
  ];
  const handles: fs.promises.FileHandle[] = [];
  try {
    for (let index = 0; index < directories.length; index += 1) {
      const directory = directories[index];
      if (fs.realpathSync.native(directory) !== directory) fail();
      const before = snapshot(
        await fs.promises.lstat(directory, { bigint: true }),
      );
      if (!safeDirectory(before, effectiveUserId, index === 0)) fail();
      const handle = await fs.promises.open(directory, DIRECTORY_FLAGS);
      handles.push(handle);
      const held = snapshot(await handle.stat({ bigint: true }));
      const after = snapshot(
        await fs.promises.lstat(directory, { bigint: true }),
      );
      if (
        !safeDirectory(held, effectiveUserId, index === 0) ||
        !sameSnapshot(before, held) ||
        !sameSnapshot(held, after)
      ) {
        fail();
      }
    }
    return Object.freeze(handles);
  } catch (error) {
    await Promise.allSettled(handles.map((handle) => handle.close()));
    throw error;
  }
}

async function openAsset(
  assetRoot: string,
  effectiveUserId: number,
  specification: (typeof RELATIVE_ASSETS)[number],
): Promise<Readonly<OpenedAsset>> {
  const assetPath = path.join(assetRoot, ...specification.relative);
  if (
    !canonicalPath(assetPath) ||
    fs.realpathSync.native(assetPath) !== assetPath
  ) {
    fail();
  }
  const before = snapshot(await fs.promises.lstat(assetPath, { bigint: true }));
  if (
    (before.mode & TYPE_MASK) !== REGULAR_TYPE ||
    (before.mode & MODE_MASK) !== FILE_MODE ||
    before.uid !== BigInt(effectiveUserId) ||
    before.nlink !== BigInt(1) ||
    before.size !== BigInt(specification.identity.bytes)
  ) {
    fail();
  }
  const handle = await fs.promises.open(assetPath, FILE_FLAGS);
  try {
    const held = snapshot(await handle.stat({ bigint: true }));
    if (!sameSnapshot(before, held)) fail();
    const bytes = await handle.readFile();
    const heldAfterRead = snapshot(await handle.stat({ bigint: true }));
    if (
      !sameSnapshot(held, heldAfterRead) ||
      bytes.byteLength !== specification.identity.bytes ||
      createHash("sha256").update(bytes).digest("hex") !==
        specification.identity.sha256
    ) {
      bytes.fill(0);
      fail();
    }
    return Object.freeze({
      bytes,
      handle,
      path: assetPath,
      snapshot: held,
    });
  } catch (error) {
    await handle.close().catch(() => undefined);
    throw error;
  }
}

async function revalidateAsset(
  opened: Readonly<OpenedAsset>,
  effectiveUserId: number,
): Promise<void> {
  const held = snapshot(await opened.handle.stat({ bigint: true }));
  const named = snapshot(
    await fs.promises.lstat(opened.path, { bigint: true }),
  );
  if (
    !sameSnapshot(opened.snapshot, held) ||
    !sameSnapshot(held, named) ||
    named.uid !== BigInt(effectiveUserId) ||
    fs.realpathSync.native(opened.path) !== opened.path
  ) {
    fail();
  }
}

async function withAssets<TResult>(
  homeDirectory: string,
  effectiveUserId: number,
  callback: (
    assets: Readonly<FloodgateStableWasmDeadlineReadOnlyAssets>,
  ) => Promise<TResult>,
): Promise<TResult> {
  if (
    !canonicalPath(homeDirectory) ||
    !Number.isSafeInteger(effectiveUserId) ||
    effectiveUserId <= 0 ||
    typeof callback !== "function" ||
    nodeUtilTypes.isProxy(callback)
  ) {
    fail();
  }
  const assetRoot = path.join(
    homeDirectory,
    ...FLOODGATE_STABLE_WASM_DEADLINE_READ_ONLY_ASSET_ROOT_COMPONENTS,
  );
  const directoryHandles = await openDirectoryChain(
    homeDirectory,
    effectiveUserId,
  );
  const opened: OpenedAsset[] = [];
  let wasmCopy: Uint8Array | undefined;
  let weightsCopy: Uint8Array | undefined;
  let primary: unknown;
  try {
    for (const specification of RELATIVE_ASSETS) {
      opened.push(await openAsset(assetRoot, effectiveUserId, specification));
    }
    const wasm = opened.find((asset) =>
      asset.path.endsWith(`${path.sep}shogi.wasm`),
    );
    const weights = opened.find((asset) =>
      asset.path.endsWith(`${path.sep}shogi-nnue-weights.bin`),
    );
    if (wasm === undefined || weights === undefined) fail();
    wasmCopy = Uint8Array.from(wasm.bytes);
    weightsCopy = Uint8Array.from(weights.bytes);
    const result = await callback(
      Object.freeze({
        bytes: Object.freeze({
          wasm: wasmCopy,
          weights: weightsCopy,
        }),
      }),
    );
    for (const asset of opened) {
      await revalidateAsset(asset, effectiveUserId);
    }
    return result;
  } catch (error) {
    primary = error;
    throw error;
  } finally {
    wasmCopy?.fill(0);
    weightsCopy?.fill(0);
    for (const asset of opened) asset.bytes.fill(0);
    const closeResults = await Promise.allSettled([
      ...opened.map((asset) => asset.handle.close()),
      ...directoryHandles.map((handle) => handle.close()),
    ]);
    if (
      primary === undefined &&
      closeResults.some((result) => result.status === "rejected")
    ) {
      fail();
    }
  }
}

export function withFloodgateStableWasmDeadlineReadOnlyAssetsCoreForTests<
  TResult,
>(
  homeDirectory: string,
  effectiveUserId: number,
  callback: (
    assets: Readonly<FloodgateStableWasmDeadlineReadOnlyAssets>,
  ) => Promise<TResult>,
): Promise<TResult> {
  if (arguments.length !== 3) {
    return Promise.reject(new Error("read-only asset invocation rejected"));
  }
  return withAssets(homeDirectory, effectiveUserId, callback);
}

export function withFloodgateStableWasmDeadlineReadOnlyAssets<TResult>(
  callback: (
    assets: Readonly<FloodgateStableWasmDeadlineReadOnlyAssets>,
  ) => Promise<TResult>,
): Promise<TResult> {
  if (
    arguments.length !== 1 ||
    process.platform !== "darwin" ||
    process.arch !== "arm64" ||
    typeof process.geteuid !== "function"
  ) {
    return Promise.reject(new Error("read-only asset platform rejected"));
  }
  try {
    const effectiveUserId = process.geteuid();
    const user = os.userInfo();
    if (
      user.uid !== effectiveUserId ||
      effectiveUserId <= 0 ||
      !canonicalPath(user.homedir)
    ) {
      fail();
    }
    return withAssets(user.homedir, effectiveUserId, callback);
  } catch (error) {
    return Promise.reject(error);
  }
}
