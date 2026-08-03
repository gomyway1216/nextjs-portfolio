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
});
