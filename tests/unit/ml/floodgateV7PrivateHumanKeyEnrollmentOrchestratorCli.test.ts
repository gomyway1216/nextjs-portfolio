import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { EventEmitter } from "node:events";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

vi.mock(
  "../../../ml/floodgate-v7-private-human-key-enrollment-orchestrator",
  () => ({
    FloodgateV7PrivateHumanKeyEnrollmentOrchestratorError: class extends Error {},
    runFloodgateV7PrivateHumanKeyEnrollmentOrchestrator: vi.fn(async () => ({
      production_touched: true,
    })),
  }),
);

import {
  FLOODGATE_V7_PRIVATE_HUMAN_KEY_ENROLLMENT_FAILURE_CONTRACT,
  FLOODGATE_V7_PRIVATE_HUMAN_KEY_ENROLLMENT_FAILURE_STATUS,
  writeFloodgateV7PrivateHumanKeyEnrollmentOutputCoreForTests,
} from "../../../ml/run-floodgate-v7-private-human-key-enrollment-orchestrator";

const REPOSITORY_ROOT = path.resolve(
  fileURLToPath(new URL("../../../", import.meta.url)),
);
const CLI_SOURCE_PATH = path.join(
  REPOSITORY_ROOT,
  "ml/run-floodgate-v7-private-human-key-enrollment-orchestrator.ts",
);
const CONSERVATIVE_FAILURE_MESSAGE =
  "Floodgate v7 private human enrollment may have committed; do not retry before the sanitized binding preflight\n";

type OutputMode = "callback-and-paired-error" | "synchronous-throw" | "success";

class TestOutputStream extends EventEmitter {
  readonly mode: OutputMode;
  writes = 0;

  constructor(mode: OutputMode) {
    super();
    this.mode = mode;
  }

  write(_value: string, callback: (error?: Error | null) => void): boolean {
    this.writes += 1;
    if (this.mode === "success") {
      callback(null);
      return true;
    }
    const failure = new Error(`synthetic-output-${this.mode}`);
    if (this.mode === "synchronous-throw") throw failure;
    callback(failure);
    process.nextTick(() => this.emit("error", failure));
    return false;
  }
}

function asWriteStream(stream: TestOutputStream): NodeJS.WriteStream {
  return stream as unknown as NodeJS.WriteStream;
}

function cleanChildEnvironment(): NodeJS.ProcessEnv {
  const environment = { ...process.env };
  delete environment.NODE_OPTIONS;
  delete environment.TSX_TSCONFIG_PATH;
  return environment;
}

function runCli(arguments_: readonly string[]): SpawnSyncReturns<string> {
  const launcher = `
const Module = require("node:module");
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request.endsWith("floodgate-v7-private-human-key-enrollment-orchestrator")) {
    return {
      FloodgateV7PrivateHumanKeyEnrollmentOrchestratorError: class extends Error {},
      runFloodgateV7PrivateHumanKeyEnrollmentOrchestrator: async () => ({ production_touched: true }),
    };
  }
  return Reflect.apply(originalLoad, this, [request, parent, isMain]);
};
process.argv = [process.execPath, ${JSON.stringify(CLI_SOURCE_PATH)}, ...${JSON.stringify(arguments_)}];
Module.runMain();
`;
  return spawnSync(process.execPath, ["-r", "tsx/cjs", "-e", launcher], {
    cwd: REPOSITORY_ROOT,
    encoding: "utf8",
    env: cleanChildEnvironment(),
    timeout: 30_000,
  });
}

describe("Floodgate v7 private human key enrollment orchestrator CLI", () => {
  it("keeps the temporary listener through a paired error and removes it before rejection", async () => {
    const stream = new TestOutputStream("callback-and-paired-error");

    await expect(
      writeFloodgateV7PrivateHumanKeyEnrollmentOutputCoreForTests(
        asWriteStream(stream),
        "receipt\n",
      ),
    ).rejects.toThrow("synthetic-output-callback-and-paired-error");

    expect(stream.writes).toBe(1);
    expect(stream.listenerCount("error")).toBe(0);
  });

  it.each(["callback-and-paired-error", "synchronous-throw"] as const)(
    "does not accumulate temporary listeners across repeated %s failures",
    async (mode) => {
      const stream = new TestOutputStream(mode);
      for (let attempt = 0; attempt < 20; attempt += 1) {
        await expect(
          writeFloodgateV7PrivateHumanKeyEnrollmentOutputCoreForTests(
            asWriteStream(stream),
            "fixed-failure\n",
          ),
        ).rejects.toThrow(`synthetic-output-${mode}`);
        expect(stream.listenerCount("error")).toBe(0);
      }
      expect(stream.writes).toBe(20);
    },
  );

  it("removes the temporary listener after a successful write", async () => {
    const stream = new TestOutputStream("success");

    await expect(
      writeFloodgateV7PrivateHumanKeyEnrollmentOutputCoreForTests(
        asWriteStream(stream),
        "receipt\n",
      ),
    ).resolves.toBeUndefined();

    expect(stream.writes).toBe(1);
    expect(stream.listenerCount("error")).toBe(0);
  });

  it("rejects positional arguments before production work with the conservative fixed error", () => {
    const result = runCli(["candidate-must-not-enter-through-argv"]);

    expect(result.error).toBeUndefined();
    expect(result.signal).toBeNull();
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(CONSERVATIVE_FAILURE_MESSAGE);
  });

  it("statically excludes stdin/env candidate input and emits only an allowlisted typed failure projection", async () => {
    const source = await fs.promises.readFile(CLI_SOURCE_PATH, "utf8");
    const mainStart = source.indexOf("async function main");
    const entryStart = source.indexOf("if (require.main === module)");
    const mainSource = source.slice(mainStart, entryStart);
    const projectionStart = source.indexOf("function sanitizedFailure");
    const projectionEnd = source.indexOf("async function main");
    const projection = source.slice(projectionStart, projectionEnd);

    expect(mainStart).toBeGreaterThan(-1);
    expect(entryStart).toBeGreaterThan(mainStart);
    expect(source).not.toMatch(/process\.(?:stdin|env)\b/);
    expect(source).not.toMatch(/\bJSON\.parse\b|\breadline\b|\bargv\s*\[/);
    expect(source).not.toMatch(
      /node:(?:fs|readline|child_process|net|http|https)/,
    );
    expect(mainSource.indexOf("process.argv.length !== 2")).toBeLessThan(
      mainSource.indexOf(
        "runFloodgateV7PrivateHumanKeyEnrollmentOrchestrator()",
      ),
    );
    expect(mainSource).toMatch(
      /failure\s+instanceof\s+FloodgateV7PrivateHumanKeyEnrollmentOrchestratorError/u,
    );
    expect(mainSource).toContain("stringify(sanitizedFailure(failure))");
    expect(mainSource).toContain("process.exitCode = 1");

    for (const field of [
      "contract",
      "status",
      "phase",
      "durability",
      "approved_record_may_have_been_created",
      "retry_disposition",
      "installer_phase",
      "installer_retry_disposition",
      "sensitive_values_disclosed",
      "success_receipt_issued",
    ]) {
      expect(projection).toContain(`${field}:`);
    }
    expect(projection).toContain("sensitive_values_disclosed: false");
    expect(projection).toContain("success_receipt_issued: false");
    expect(projection).not.toMatch(
      /\b(?:cause|stack|message|candidate|digest|approval_id|path|owner_uid|dev|ino|key_instance_id)\s*:/,
    );
    expect(FLOODGATE_V7_PRIVATE_HUMAN_KEY_ENROLLMENT_FAILURE_CONTRACT).toBe(
      "shogi-floodgate-v7-private-human-key-enrollment-failure-v1",
    );
    expect(FLOODGATE_V7_PRIVATE_HUMAN_KEY_ENROLLMENT_FAILURE_STATUS).toBe(
      "private-human-key-enrollment-did-not-issue-a-success-receipt",
    );
    expect(source).toContain(JSON.stringify(CONSERVATIVE_FAILURE_MESSAGE));
  });
});
