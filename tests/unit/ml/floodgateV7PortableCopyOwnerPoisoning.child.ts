import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import {
  bindFloodgateV7PortableCopyOwnerBridgeCoreForTests,
  presealFloodgateV7PortableCopyOwnerCoreForTests,
  revokeFloodgateV7PortableCopyOwnerCoreForTests,
  withFloodgateV7PortableCopyOwnerRevalidationCoreForTests,
  type FloodgateV7PortableCopyOwnerBinding,
  type FloodgateV7PortableCopyOwnerExactBinding,
} from "../../../ml/floodgate-v7-portable-copy-owner";
import type { FloodgateV7PortableCopyKind } from "../../../ml/floodgate-v7-clean-room-copy";

type Mode =
  "array-string" | "weak-collections" | "reflect" | "promise-resolve-preseal";

const kinds = [
  "raw-lock-tree",
  "role-lock-tree",
  "role-bundle-tree",
  "legacy-file",
] as const satisfies readonly FloodgateV7PortableCopyKind[];

async function privateDirectory(directory: string): Promise<void> {
  await fs.promises.mkdir(directory, { recursive: true, mode: 0o700 });
  await fs.promises.chmod(directory, 0o700);
}

async function privateFile(file: string, content: string): Promise<void> {
  await fs.promises.writeFile(file, content, { mode: 0o600 });
  await fs.promises.chmod(file, 0o600);
}

function modeFromArgument(value: string | undefined): Mode {
  switch (value) {
    case "array-string":
    case "weak-collections":
    case "reflect":
    case "promise-resolve-preseal":
      return value;
    default:
      throw new Error("exact poisoning mode is required");
  }
}

async function main(): Promise<void> {
  assert.equal(
    process.env.NODE_OPTIONS,
    undefined,
    "poisoning child must not inherit NODE_OPTIONS",
  );
  assert.equal(
    process.env.NODE_PATH,
    undefined,
    "poisoning child must not inherit NODE_PATH",
  );
  const mode = modeFromArgument(process.argv[2]);
  const root = await fs.promises.realpath(
    await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "floodgate-v7-portable-owner-poison-"),
    ),
  );
  await fs.promises.chmod(root, 0o700);

  const sourceParent = path.join(root, "sources");
  const destinationParent = path.join(root, "destinations");
  const legacyDestinationParent = path.join(root, "legacy-destination");
  await privateDirectory(sourceParent);
  await privateDirectory(destinationParent);
  await privateDirectory(legacyDestinationParent);
  const sources = {
    "raw-lock-tree": path.join(sourceParent, "raw"),
    "role-lock-tree": path.join(sourceParent, "role"),
    "role-bundle-tree": path.join(sourceParent, "bundle"),
    "legacy-file": path.join(sourceParent, "legacy.txt"),
  };
  await privateDirectory(sources["raw-lock-tree"]);
  await privateDirectory(sources["role-lock-tree"]);
  await privateDirectory(sources["role-bundle-tree"]);
  await privateFile(path.join(sources["raw-lock-tree"], "raw.txt"), "raw\n");
  await privateFile(path.join(sources["role-lock-tree"], "role.txt"), "role\n");
  await privateFile(
    path.join(sources["role-bundle-tree"], "bundle.txt"),
    "bundle\n",
  );
  await privateFile(sources["legacy-file"], "legacy\n");
  const destinations = {
    "raw-lock-tree": path.join(destinationParent, "raw"),
    "role-lock-tree": path.join(destinationParent, "role"),
    "role-bundle-tree": path.join(destinationParent, "bundle"),
    "legacy-file": path.join(legacyDestinationParent, "legacy.txt"),
  };
  const effectiveUserId = process.geteuid?.() ?? 501;
  const bindings = kinds.map((kind) => ({
    kind,
    source: sources[kind],
    destination: destinations[kind],
    dependencies: { effectiveUserId },
  })) satisfies FloodgateV7PortableCopyOwnerBinding[];
  const exactBindings = kinds.map((kind) => ({
    kind,
    source: sources[kind],
    destination: destinations[kind],
  })) satisfies FloodgateV7PortableCopyOwnerExactBinding[];

  const originals = {
    arrayIsArray: Array.isArray,
    arrayMap: Array.prototype.map,
    arraySome: Array.prototype.some,
    arrayIncludes: Array.prototype.includes,
    stringIncludes: String.prototype.includes,
    stringStartsWith: String.prototype.startsWith,
    weakMapGet: WeakMap.prototype.get,
    weakMapSet: WeakMap.prototype.set,
    weakMapDelete: WeakMap.prototype.delete,
    weakSetHas: WeakSet.prototype.has,
    weakSetAdd: WeakSet.prototype.add,
    reflectApply: Reflect.apply,
    reflectOwnKeys: Reflect.ownKeys,
    promiseResolve: Promise.resolve,
  };
  const poison = (): never => {
    throw new Error("poisoned intrinsic consulted");
  };

  try {
    if (mode === "array-string") {
      Array.isArray = poison as unknown as typeof Array.isArray;
      Array.prototype.map = poison;
      Array.prototype.some = poison;
      Array.prototype.includes = poison;
      String.prototype.includes = poison;
      String.prototype.startsWith = poison;
    } else if (mode === "weak-collections") {
      WeakMap.prototype.get = poison;
      WeakMap.prototype.set = poison;
      WeakMap.prototype.delete = poison;
      WeakSet.prototype.has = poison;
      WeakSet.prototype.add = poison;
    } else if (mode === "reflect") {
      Reflect.apply = poison;
      Reflect.ownKeys = poison;
    } else {
      Promise.resolve = poison as unknown as typeof Promise.resolve;
    }

    const presealed =
      await presealFloodgateV7PortableCopyOwnerCoreForTests(bindings);
    if (mode === "promise-resolve-preseal") {
      revokeFloodgateV7PortableCopyOwnerCoreForTests(presealed.owner);
    } else {
      const bridge = await bindFloodgateV7PortableCopyOwnerBridgeCoreForTests(
        presealed.owner,
        presealed.verificationPause,
        exactBindings,
      );
      const result =
        await withFloodgateV7PortableCopyOwnerRevalidationCoreForTests(
          presealed.owner,
          bridge,
          () => "captured",
        );
      assert.equal(result, "captured");
      revokeFloodgateV7PortableCopyOwnerCoreForTests(presealed.owner);
    }
  } finally {
    Array.isArray = originals.arrayIsArray;
    Array.prototype.map = originals.arrayMap;
    Array.prototype.some = originals.arraySome;
    Array.prototype.includes = originals.arrayIncludes;
    String.prototype.includes = originals.stringIncludes;
    String.prototype.startsWith = originals.stringStartsWith;
    WeakMap.prototype.get = originals.weakMapGet;
    WeakMap.prototype.set = originals.weakMapSet;
    WeakMap.prototype.delete = originals.weakMapDelete;
    WeakSet.prototype.has = originals.weakSetHas;
    WeakSet.prototype.add = originals.weakSetAdd;
    Reflect.apply = originals.reflectApply;
    Reflect.ownKeys = originals.reflectOwnKeys;
    Promise.resolve = originals.promiseResolve;
    await fs.promises.rm(root, { recursive: true, force: true });
  }
  process.stdout.write(`PASS ${mode}\n`);
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
