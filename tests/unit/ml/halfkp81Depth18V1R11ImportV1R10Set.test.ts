import * as fs from "node:fs";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

import {
  validateHalfkp81Depth18V1R10ImportableSet,
  validateHalfkp81Depth18V1R11MinimalR2ImportableSet,
  validateHalfkp81Depth18V1R11MinimalR3ImportableSet,
  validateHalfkp81Depth18V1R11MinimalR4ImportableSet,
  validateHalfkp81Depth18V1R11MinimalR5ImportableSet,
  type Halfkp81Depth18PrivateSnapshot,
} from "../../../ml/halfkp81-depth18-teacher-artifact-validation";
import {
  importHalfkp81Depth18V1R10CompletedSetIntoV1R11,
  importHalfkp81Depth18V1R11MinimalR4CompletedSetIntoR5,
  importHalfkp81Depth18V1R11MinimalR5CompletedSetIntoR6,
} from "../../../ml/halfkp81-depth18-v1r11-import-v1r10-set";

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

  it("rejects an unpinned minimal-r3 successor source before parsing it", () => {
    const invalid = snapshot("invalid-r3.json");
    expect(() =>
      validateHalfkp81Depth18V1R11MinimalR3ImportableSet({
        plan: invalid,
        selection: invalid,
        work: invalid,
        terminalFault: invalid,
      }),
    ).toThrow("minimal-r3 source plan identity differs");
  });

  it("rejects an unpinned minimal-r4 successor source before parsing it", () => {
    const invalid = snapshot("invalid-r4.json");
    expect(() =>
      validateHalfkp81Depth18V1R11MinimalR4ImportableSet({
        plan: invalid,
        selection: invalid,
        work: invalid,
        failureLog: invalid,
      }),
    ).toThrow("minimal-r4 source plan identity differs");
  });

  it("rejects reusing the minimal-r4 fingerprint for the r5 target", async () => {
    const fingerprint =
      "d8837f1ff01002bd5c770f9231532f8d5cfc0d7c6fb2d2b53fe55a93080e9fab";
    await expect(
      importHalfkp81Depth18V1R11MinimalR4CompletedSetIntoR5({
        repositoryRoot: "/private/tmp/does-not-exist",
        targetWorkPath: "/private/tmp/never-created-r5/work.jsonl",
        targetHeader: Object.freeze({
          schema: "shogi-halfkp81-hard-depth18-yaneura-only-teacher-work-v1r11",
          run_fingerprint: fingerprint,
        }),
        targetRunFingerprint: fingerprint,
        selectionOrderedParentIds: Array.from(
          { length: 8_192 },
          (_, index) => `parent-${index}`,
        ),
        authorityDirectory: "/private/tmp/never-created-r5/authority",
      }),
    ).rejects.toThrow("minimal-r5 import target identity differs");
    expect(fs.existsSync("/private/tmp/never-created-r5")).toBe(false);
  });

  it("pins the r5 source before allowing a distinct create-only r6 target", async () => {
    const invalid = snapshot("invalid-r5.json");
    expect(() =>
      validateHalfkp81Depth18V1R11MinimalR5ImportableSet({
        plan: invalid,
        selection: invalid,
        work: invalid,
        terminalFault: invalid,
      }),
    ).toThrow("minimal-r5 source plan identity differs");
    const fingerprint =
      "37691a15085bb5cd3231346f025edbad42ac334c59077f22f30bf75669d3f3e1";
    await expect(
      importHalfkp81Depth18V1R11MinimalR5CompletedSetIntoR6({
        repositoryRoot: "/private/tmp/does-not-exist",
        targetWorkPath: "/private/tmp/never-created-r6/work.jsonl",
        targetHeader: Object.freeze({
          schema: "shogi-halfkp81-hard-depth18-yaneura-only-teacher-work-v1r11",
          run_fingerprint: fingerprint,
        }),
        targetRunFingerprint: fingerprint,
        selectionOrderedParentIds: Array.from(
          { length: 8_192 },
          (_, index) => `parent-${index}`,
        ),
        authorityDirectory: "/private/tmp/never-created-r6/authority",
      }),
    ).rejects.toThrow("minimal-r6 import target identity differs");
    expect(fs.existsSync("/private/tmp/never-created-r6")).toBe(false);
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
    expect(source).toContain(
      "validateHalfkp81Depth18V1R11MinimalR3ImportableSet",
    );
    expect(source).toContain(
      "validateHalfkp81Depth18V1R11MinimalR4ImportedSet",
    );
    expect(source).toContain("if (imported.length !== 4_238)");
    expect(source).toContain(
      "validateHalfkp81Depth18V1R11MinimalR4ImportableSet",
    );
    expect(source).toContain(
      "validateHalfkp81Depth18V1R11MinimalR5ImportedSet",
    );
    expect(source).toContain("if (imported.length !== 4_336)");
    expect(source).toContain(
      '"minimal-r4-import-source-verification-receipt.json"',
    );
    expect(source).toContain(
      "validateHalfkp81Depth18V1R11MinimalR5ImportableSet",
    );
    expect(source).toContain(
      "validateHalfkp81Depth18V1R11MinimalR6ImportedSet",
    );
    expect(source).toContain("if (imported.length !== 4_419)");
    expect(source).toContain(
      '"minimal-r5-import-source-verification-receipt.json"',
    );
  });
});
