import * as fs from "node:fs";
import { createHash } from "node:crypto";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

import { verifyHalfkp81Depth18V1R11ReceiptIdentityForTests } from "../../../ml/run-halfkp81-depth18-v1r11-minimal-formal";

const ROOT = path.resolve(__dirname, "../../..");

describe("HalfKP81 depth18 v1r11 minimal formal entrypoint", () => {
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

  it("binds the exact minimal entrypoint identity in both tracked contracts", () => {
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
          "ml/halfkp81-hard-depth18-yaneura-only-v1r11-plan.json",
        ),
        "utf8",
      ),
    ) as Record<string, Record<string, unknown>>;
    const preregistration = JSON.parse(
      fs.readFileSync(
        path.join(
          ROOT,
          "docs/data/shogi-halfkp81-depth18-yaneura-only-v1r11-preregistration-2026-08-02.json",
        ),
        "utf8",
      ),
    ) as Record<string, Record<string, unknown>>;
    expect(
      trackedPlan.minimal_formal_start_gate?.minimal_formal_entrypoint,
    ).toEqual(expectedIdentity);
    expect(
      preregistration.minimal_formal_start_gate?.minimal_formal_entrypoint,
    ).toEqual(expectedIdentity);
  });
});
