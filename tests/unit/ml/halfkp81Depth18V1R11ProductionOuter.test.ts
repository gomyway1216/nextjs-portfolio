import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

import {
  parseHalfkp81V1R11ProductionOuterArgumentsForTests,
  runHalfkp81V1R11ProductionOuter,
  validateHalfkp81V1R11ProductionOuterPlanContractForTests,
} from "../../../ml/run-halfkp81-depth18-v1r11-production-outer";

describe("HalfKP81 v1r11 sole production outer", () => {
  it("accepts only the bounded PR-number CLI contract", () => {
    expect(parseHalfkp81V1R11ProductionOuterArgumentsForTests(["--pr-number", "667"]))
      .toEqual({ prNumber: 667 });
    for (const argv of [
      [],
      ["667"],
      ["--pr-number", "0"],
      ["--pr-number", "667", "--run-fingerprint", "a".repeat(64)],
    ]) {
      expect(() =>
        parseHalfkp81V1R11ProductionOuterArgumentsForTests(argv),
      ).toThrow(/requires exactly/u);
    }
  });

  it("keeps the production lock before request or filesystem validation", async () => {
    await expect(runHalfkp81V1R11ProductionOuter({} as never)).rejects.toThrow(
      /remains locked/u,
    );
  });

  it("rejects an unregistered or mismatched sole outer entrypoint", () => {
    const repositoryRoot = path.resolve(__dirname, "../../..");
    const plan = JSON.parse(
      fs.readFileSync(
        path.join(
          repositoryRoot,
          "ml/halfkp81-hard-depth18-yaneura-only-v1r11-plan.json",
        ),
        "utf8",
      ),
    ) as Record<string, unknown>;
    expect(() =>
      validateHalfkp81V1R11ProductionOuterPlanContractForTests(plan),
    ).not.toThrow();
    const preformal = plan.preformal_authority as Record<string, unknown>;
    const contract = preformal.outer_orchestrator_contract as Record<
      string,
      unknown
    >;
    expect(() =>
      validateHalfkp81V1R11ProductionOuterPlanContractForTests({
        ...plan,
        preformal_authority: {
          ...preformal,
          outer_orchestrator_contract: {
            ...contract,
            entrypoint_exact:
              "ml/run-halfkp81-depth18-v1r11-preformal-orchestrator.ts",
          },
        },
      }),
    ).toThrow(/plan contract differs/u);
  });

  it("has zero import-time production side effects", () => {
    const repositoryRoot = path.resolve(__dirname, "../../..");
    const preload = path.join(
      repositoryRoot,
      "node_modules/tsx/dist/cjs/index.cjs",
    );
    const entrypoint = path.join(
      repositoryRoot,
      "ml/run-halfkp81-depth18-v1r11-production-outer.ts",
    );
    const result = spawnSync(
      process.execPath,
      ["-r", preload, "-e", `require(${JSON.stringify(entrypoint)});process.stdout.write("import-ok\\n")`],
      { encoding: "utf8", timeout: 10_000 },
    );
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toBe("import-ok\n");
  });
});
