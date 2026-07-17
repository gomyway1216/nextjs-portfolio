/**
 * Read-only exact-clean capture of the existing Floodgate production
 * application checkout. This binding is compared with the registry record; it
 * is not execution authority for the dedicated diagnostic checkout.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { captureFloodgateGitExactCleanRevision } from "./floodgate-git";
import { FLOODGATE_STABLE_WASM_DEADLINE_REGISTRY_APPLICATION_LAYOUT } from "./floodgate-stable-wasm-deadline-read-only-registry";

export interface FloodgateStableWasmDeadlineRegistryApplicationSourceBinding {
  readonly layout: typeof FLOODGATE_STABLE_WASM_DEADLINE_REGISTRY_APPLICATION_LAYOUT;
  readonly revision: string;
}

const ROOT_COMPONENTS = Object.freeze([
  ".codex",
  "worktrees",
  "shogi-floodgate-v7-production-application",
] as const);
const REVISION_RE = /^[0-9a-f]{40}$/u;

function fail(): never {
  throw new Error("stable-WASM deadline registry application source rejected");
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

function sourceRoot(homeDirectory: string): string {
  if (!canonicalPath(homeDirectory)) fail();
  const root = path.join(homeDirectory, ...ROOT_COMPONENTS);
  const before = fs.lstatSync(root, { bigint: true });
  if (
    !before.isDirectory() ||
    before.isSymbolicLink() ||
    fs.realpathSync.native(root) !== root
  ) {
    fail();
  }
  const after = fs.lstatSync(root, { bigint: true });
  if (
    before.dev !== after.dev ||
    before.ino !== after.ino ||
    before.mode !== after.mode ||
    before.uid !== after.uid ||
    before.mtimeNs !== after.mtimeNs ||
    before.ctimeNs !== after.ctimeNs
  ) {
    fail();
  }
  return root;
}

export async function captureFloodgateStableWasmDeadlineRegistryApplicationSourceCoreForTests(
  homeDirectory: string,
  captureExactCleanRevision: (repositoryRoot: string) => Promise<string>,
): Promise<
  Readonly<FloodgateStableWasmDeadlineRegistryApplicationSourceBinding>
> {
  if (
    arguments.length !== 2 ||
    typeof captureExactCleanRevision !== "function"
  ) {
    return Promise.reject(new Error("application source invocation rejected"));
  }
  const revision = await captureExactCleanRevision(sourceRoot(homeDirectory));
  if (!REVISION_RE.test(revision)) fail();
  return Object.freeze({
    layout: FLOODGATE_STABLE_WASM_DEADLINE_REGISTRY_APPLICATION_LAYOUT,
    revision,
  });
}

export function captureFloodgateStableWasmDeadlineRegistryApplicationSource(): Promise<
  Readonly<FloodgateStableWasmDeadlineRegistryApplicationSourceBinding>
> {
  if (arguments.length !== 0 || typeof process.geteuid !== "function") {
    return Promise.reject(new Error("application source invocation rejected"));
  }
  try {
    const effectiveUserId = process.geteuid();
    const user = os.userInfo();
    if (
      effectiveUserId <= 0 ||
      user.uid !== effectiveUserId ||
      !canonicalPath(user.homedir)
    ) {
      fail();
    }
    return captureFloodgateStableWasmDeadlineRegistryApplicationSourceCoreForTests(
      user.homedir,
      captureFloodgateGitExactCleanRevision,
    );
  } catch (error) {
    return Promise.reject(error);
  }
}
