import * as fs from "node:fs";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

import {
  validateHalfkp81Depth18V1R10ImportableSet,
  validateHalfkp81Depth18V1R11MinimalR2ImportableSet,
  type Halfkp81Depth18PrivateSnapshot,
} from "../../../ml/halfkp81-depth18-teacher-artifact-validation";
import { importHalfkp81Depth18V1R10CompletedSetIntoV1R11 } from "../../../ml/halfkp81-depth18-v1r11-import-v1r10-set";

function snapshot(name: string): Readonly<Halfkp81Depth18PrivateSnapshot> {
  const bytes = Buffer.from("{}\n", "utf8");
  return Object.freeze({
    bytes,
    identity: Object.freeze({
      path: `/private/tmp/${name}`,
      bytes: bytes.byteLength,
      sha256: "0".repeat(64),
    }),
  });
}

describe("HalfKP81 v1r10 exact-set import into v1r11", () => {
  it("rejects an unpinned source before parsing or importing it", () => {
    const invalid = snapshot("invalid.json");
    expect(() =>
      validateHalfkp81Depth18V1R10ImportableSet({
        plan: invalid,
        selection: invalid,
        selectionManifest: invalid,
        work: invalid,
        terminalFault: invalid,
        engineBinary: invalid,
        engineEval: invalid,
        engineReceipt: invalid,
      }),
    ).toThrow("v1r10 import plan identity differs");
  });

  it("rejects an unpinned minimal-r2 successor source before parsing it", () => {
    const invalid = snapshot("invalid-r2.json");
    expect(() =>
      validateHalfkp81Depth18V1R11MinimalR2ImportableSet({
        plan: invalid,
        selection: invalid,
        work: invalid,
        terminalFault: invalid,
      }),
    ).toThrow("minimal-r2 source plan identity differs");
  });

  it("rejects a target before reading the immutable source", async () => {
    await expect(
      importHalfkp81Depth18V1R10CompletedSetIntoV1R11({
        repositoryRoot: "/private/tmp/does-not-exist",
        targetWorkPath: "/private/tmp/never-created/work.jsonl",
        targetHeader: Object.freeze({
          schema: "shogi-halfkp81-hard-depth18-yaneura-only-teacher-work-v1r11",
          run_fingerprint: "not-a-digest",
        }),
        targetRunFingerprint: "not-a-digest",
        selectionOrderedParentIds: [],
        authorityDirectory: "/private/tmp/never-created/authority",
      }),
    ).rejects.toThrow("v1r11 import target identity differs");
    expect(fs.existsSync("/private/tmp/never-created")).toBe(false);
  });

  it("fixes exact-set order, rebinding, and an independent target reparse", () => {
    const source = fs.readFileSync(
      path.resolve(
        process.cwd(),
        "ml/halfkp81-depth18-v1r11-import-v1r10-set.ts",
      ),
      "utf8",
    );
    expect(source).toContain("validateHalfkp81Depth18V1R10ImportableSet");
    expect(source).toContain("validateHalfkp81Depth18V1R11ImportedSet");
    expect(source).toContain(
      "for (const parentId of request.selectionOrderedParentIds)",
    );
    expect(source).toContain("run_fingerprint: request.targetRunFingerprint");
    expect(source).toContain("HALFKP81_DEPTH18_WRAPPER_DIGEST_DOMAIN");
    expect(source).not.toContain("slice(0, 4_196)");
    expect(source).toContain(
      "validateHalfkp81Depth18V1R11MinimalR2ImportableSet",
    );
    expect(source).toContain(
      "validateHalfkp81Depth18V1R11MinimalR3ImportedSet",
    );
    expect(source).toContain("if (imported.length !== 4_209)");
    expect(source).toContain(
      '"minimal-r2-import-source-verification-receipt.json"',
    );
  });
});
