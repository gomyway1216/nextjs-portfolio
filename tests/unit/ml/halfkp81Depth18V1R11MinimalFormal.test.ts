import * as fs from "node:fs";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

import { verifyHalfkp81Depth18V1R11FixedEvidenceBytesForTests } from "../../../ml/run-halfkp81-depth18-v1r11-minimal-formal";

const ROOT = path.resolve(__dirname, "../../..");

describe("HalfKP81 depth18 v1r11 minimal formal entrypoint", () => {
  it("accepts the pinned committed minimal-start plan and rejects one-byte tampering", () => {
    const raw = fs.readFileSync(
      path.join(ROOT, "ml/halfkp81-hard-depth18-yaneura-only-v1r11-plan.json"),
    );
    expect(
      verifyHalfkp81Depth18V1R11FixedEvidenceBytesForTests("tracked-plan", raw)
        .minimal_formal_start_gate,
    ).toBeDefined();
    const tampered = Buffer.from(raw);
    tampered[tampered.length - 2] ^= 1;
    expect(() =>
      verifyHalfkp81Depth18V1R11FixedEvidenceBytesForTests(
        "tracked-plan",
        tampered,
      ),
    ).toThrow("fixed tracked-plan receipt identity differs");
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
