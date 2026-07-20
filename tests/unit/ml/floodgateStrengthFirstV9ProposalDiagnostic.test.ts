import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

import { runStrengthFirstV9DiagnosticSearchCoreForTests } from "../../../ml/floodgate-strength-first-v9-proposal-diagnostic";

describe("strength-first v9 proposal diagnostic child failures", () => {
  it("classifies a spawn error instead of emitting an unhandled process error", async () => {
    const workerDirectory = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "v9-proposal-spawn-error-"),
    );
    await expect(
      runStrengthFirstV9DiagnosticSearchCoreForTests({
        engineBin: path.join(workerDirectory, "missing-engine"),
        evalDir: workerDirectory,
        workerDirectory,
        sfen: "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1",
        legalMoves: 30,
        depth: 14,
      }),
    ).resolves.toEqual({
      complete: false,
      failureKind: "engine-failure",
    });
  });
});
