import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { EventEmitter } from "node:events";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { writeFloodgateV7ApprovedKeyCurrentBindingOutputCoreForTests } from "../../../ml/inspect-floodgate-v7-approved-key-current-binding";

const REPOSITORY_ROOT = path.resolve(
  fileURLToPath(new URL("../../../", import.meta.url)),
);
const CLI_SOURCE_PATH = path.join(
  REPOSITORY_ROOT,
  "ml/inspect-floodgate-v7-approved-key-current-binding.ts",
);
const FIXED_FAILURE_MESSAGE =
  "Floodgate v7 approved key current-binding preflight failed without a receipt\n";

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
  return spawnSync(
    process.execPath,
    ["-r", "tsx/cjs", CLI_SOURCE_PATH, ...arguments_],
    {
      cwd: REPOSITORY_ROOT,
      encoding: "utf8",
      env: cleanChildEnvironment(),
      timeout: 30_000,
    },
  );
}

describe("Floodgate v7 approved key current binding CLI", () => {
  it("rejects every positional argument with only the fixed failure", () => {
    const result = runCli(["unexpected-argument"]);

    expect(result.error).toBeUndefined();
    expect(result.signal).toBeNull();
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(FIXED_FAILURE_MESSAGE);
  });

  it("keeps a paired-error listener only through the current event-loop turn", async () => {
    const stream = new TestOutputStream("callback-and-paired-error");

    await expect(
      writeFloodgateV7ApprovedKeyCurrentBindingOutputCoreForTests(
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
          writeFloodgateV7ApprovedKeyCurrentBindingOutputCoreForTests(
            asWriteStream(stream),
            "fixed-failure\n",
          ),
        ).rejects.toThrow(`synthetic-output-${mode}`);
        expect(stream.listenerCount("error")).toBe(0);
      }
      expect(stream.writes).toBe(20);
    },
  );

  it("detaches the temporary listener after a successful write", async () => {
    const stream = new TestOutputStream("success");

    await expect(
      writeFloodgateV7ApprovedKeyCurrentBindingOutputCoreForTests(
        asWriteStream(stream),
        "receipt\n",
      ),
    ).resolves.toBeUndefined();

    expect(stream.writes).toBe(1);
    expect(stream.listenerCount("error")).toBe(0);
  });
});
