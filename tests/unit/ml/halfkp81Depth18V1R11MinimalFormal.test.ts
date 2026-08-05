import * as fs from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

import { verifyHalfkp81Depth18V1R11ReceiptIdentityForTests } from "../../../ml/run-halfkp81-depth18-v1r11-minimal-formal";
import { HALFKP81_DEPTH18_V1R11_EXPECTED_PLAN_OUTPUT_KEYS } from "../../../ml/halfkp81-depth18-teacher-runner";

const ROOT = path.resolve(__dirname, "../../..");

describe("HalfKP81 depth18 v1r11 minimal formal entrypoint", () => {
  it("resolves the formal gate through the actual tsx/cjs module boundary", () => {
    const preload = execFileSync(
      process.execPath,
      ["-p", "require.resolve('tsx/cjs')"],
      { cwd: ROOT, encoding: "utf8" },
    ).trim();
    const output = execFileSync(
      process.execPath,
      [
        "-r",
        preload,
        "-e",
        "const m=require('./ml/halfkp81-depth18-teacher-runner.ts'); const g=m.loadHalfkp81Depth18V1R11MinimalFormalModuleForTests(); if(typeof g.verifyHalfkp81Depth18V1R11MinimalFormalFixedGate!=='function') process.exit(2); process.stdout.write('pass')",
      ],
      { cwd: ROOT, encoding: "utf8" },
    );
    expect(output).toBe("pass");
  });

  it("accepts every output sealed by the tracked v1r11 namespace", () => {
    const trackedPlan = JSON.parse(
      fs.readFileSync(
        path.join(
          ROOT,
          "ml/halfkp81-hard-depth18-yaneura-only-v1r11-minimal-r13-plan.json",
        ),
        "utf8",
      ),
    ) as { output_namespace: Record<string, unknown> };
    const { collision_policy: _collisionPolicy, ...outputs } =
      trackedPlan.output_namespace;
    expect(
      [...HALFKP81_DEPTH18_V1R11_EXPECTED_PLAN_OUTPUT_KEYS].sort(),
    ).toEqual(Object.keys(outputs).sort());
  });

  it("accepts an exact receipt identity and rejects one-byte tampering", () => {
    const raw = Buffer.from('{"schema":"test-receipt","status":"pass"}\n');
    const expected = {
      bytes: raw.byteLength,
      sha256: createHash("sha256").update(raw).digest("hex"),
    };
    expect(
      verifyHalfkp81Depth18V1R11ReceiptIdentityForTests(raw, expected),
    ).toBe(true);
    const tampered = Buffer.from(raw);
    tampered[tampered.length - 2] ^= 1;
    expect(
      verifyHalfkp81Depth18V1R11ReceiptIdentityForTests(tampered, expected),
    ).toBe(false);
  });

  it("has no dependency on the legacy all-13/preformal orchestration path", () => {
    const source = fs.readFileSync(
      path.join(ROOT, "ml/run-halfkp81-depth18-v1r11-minimal-formal.ts"),
      "utf8",
    );
    expect(source).not.toContain("production-preformal-orchestrator");
    expect(source).not.toContain("executeFixedStages");
    expect(source).not.toContain(
      "reauthenticateHalfkp81V1R11ExistingStagedAuthorityForFormalChild",
    );
    expect(source).toContain(
      "runHalfkp81Depth18V1R11MinimalFormalFromFixedGate",
    );
  });

  it("anchors the smoke engine receipt to a fixed canonical root", () => {
    const source = fs.readFileSync(
      path.join(ROOT, "ml/run-halfkp81-depth18-v1r11-minimal-formal.ts"),
      "utf8",
    );
    expect(source).toContain("SOURCE_ENGINE_RECEIPT_ROOT");
    expect(source).toContain(
      "header.engine.receipt.path,\n      SOURCE_ENGINE_RECEIPT_ROOT,",
    );
    expect(source).not.toContain(
      "path.dirname(path.dirname(header.engine.receipt.path))",
    );
  });

  it("binds the exact minimal entrypoint identity in the tracked plan", () => {
    const entrypointPath = path.join(
      ROOT,
      "ml/run-halfkp81-depth18-v1r11-minimal-formal.ts",
    );
    const entrypoint = fs.readFileSync(entrypointPath);
    const expectedIdentity = {
      path: "ml/run-halfkp81-depth18-v1r11-minimal-formal.ts",
      bytes: entrypoint.byteLength,
      sha256: createHash("sha256").update(entrypoint).digest("hex"),
      schema: "text/typescript-utf8-exact-source",
    };
    const trackedPlan = JSON.parse(
      fs.readFileSync(
        path.join(
          ROOT,
          "ml/halfkp81-hard-depth18-yaneura-only-v1r11-minimal-r13-plan.json",
        ),
        "utf8",
      ),
    ) as Record<string, Record<string, unknown>>;
    expect(
      trackedPlan.minimal_formal_start_gate?.minimal_formal_entrypoint,
    ).toEqual(expectedIdentity);
  });
});
