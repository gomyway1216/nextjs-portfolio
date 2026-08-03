import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

import { describe, expect, it, vi } from "vitest";

import * as producerClosure from "../../../ml/halfkp81-depth18-v1r11-producer-closure";
import {
  buildHalfkp81V1R11RecursiveProducerIdentity,
  validateHalfkp81V1R11RecursiveProducerIdentityForTests,
} from "../../../ml/halfkp81-depth18-v1r11-producer-closure";
import { buildHalfkp81V1R11IndependentRecursiveProducerIdentityForTests } from "../../../ml/verify-halfkp81-depth18-v1r11-staged-authority";

describe("HalfKP81 v1r11 recursive producer closure", () => {
  const repositoryRoot = fs.realpathSync.native(path.resolve(__dirname, "../../.."));
  const sourceRevision = execFileSync(
    "git",
    ["-C", repositoryRoot, "rev-parse", "HEAD"],
    { encoding: "utf8" },
  ).trim();
  const entrypoint = "ml/halfkp81-depth18-v1r11-stage-c-live-evidence.ts";
  const expected = buildHalfkp81V1R11RecursiveProducerIdentity(
    repositoryRoot,
    sourceRevision,
    entrypoint,
    { requireTrackedRevision: false },
  );

  it("recursively includes the entrypoint, helpers, and runtime child", () => {
    const paths = expected.dependency_closure.map((row) => row.path);
    expect(paths[0]).toBe(entrypoint);
    expect(paths).toContain("ml/halfkp81-depth18-v1r11-authority-io.ts");
    expect(paths).toContain("ml/halfkp81-depth18-v1r11-formal-run-intent.ts");
    expect(paths).toContain("ml/run-halfkp81-depth18-v1r11-formal-child.ts");
    expect(paths.length).toBeGreaterThan(4);
    expect(() =>
      validateHalfkp81V1R11RecursiveProducerIdentityForTests(expected, expected),
    ).not.toThrow();
  });

  it("the all-13 resolver is independent of a mocked producer helper", () => {
    const independent =
      buildHalfkp81V1R11IndependentRecursiveProducerIdentityForTests(
        repositoryRoot,
        sourceRevision,
        entrypoint,
        { requireTrackedRevision: false },
      );
    expect(independent).toEqual(expected);
    const mocked = vi
      .spyOn(producerClosure, "buildHalfkp81V1R11RecursiveProducerIdentity")
      .mockReturnValue({
        ...expected,
        dependency_closure: Object.freeze([expected.dependency_closure[0]!]),
      });
    expect(
      producerClosure.buildHalfkp81V1R11RecursiveProducerIdentity(
        repositoryRoot,
        sourceRevision,
        entrypoint,
      ),
    ).not.toEqual(independent);
    expect(
      buildHalfkp81V1R11IndependentRecursiveProducerIdentityForTests(
        repositoryRoot,
        sourceRevision,
        entrypoint,
        { requireTrackedRevision: false },
      ),
    ).toEqual(independent);
    mocked.mockRestore();
  });

  it("rejects dependency tamper, missing, extra, and reordering", () => {
    const rows = expected.dependency_closure;
    const variants = [
      {
        ...expected,
        dependency_closure: [
          { ...rows[0]!, sha256: "f".repeat(64) },
          ...rows.slice(1),
        ],
      },
      { ...expected, dependency_closure: rows.slice(0, -1) },
      {
        ...expected,
        dependency_closure: [
          ...rows,
          { path: "ml/extra.ts", bytes: 1, sha256: "e".repeat(64) },
        ],
      },
      {
        ...expected,
        dependency_closure: [rows[1]!, rows[0]!, ...rows.slice(2)],
      },
    ];
    for (const variant of variants) {
      expect(() =>
        validateHalfkp81V1R11RecursiveProducerIdentityForTests(
          variant,
          expected,
        ),
      ).toThrow(/identity differs/u);
    }
  });
});
