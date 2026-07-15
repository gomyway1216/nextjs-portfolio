import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { EventEmitter } from "node:events";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { writeFloodgateV7ApprovedKeyEnrollmentOutputCoreForTests } from "../../../ml/install-floodgate-v7-approved-key-enrollment";

const REPOSITORY_ROOT = path.resolve(
  fileURLToPath(new URL("../../../", import.meta.url)),
);
const CLI_SOURCE_PATH = path.join(
  REPOSITORY_ROOT,
  "ml/install-floodgate-v7-approved-key-enrollment.ts",
);
const FIXED_FAILURE_MESSAGE =
  "Floodgate v7 approved key enrollment installation failed without a success receipt\n";
const INSTALL_REQUEST_CONTRACT =
  "shogi-floodgate-v7-approved-key-enrollment-install-request-v1";

const requestFields = {
  contract: INSTALL_REQUEST_CONTRACT,
  approval_id: "a1".repeat(32),
  approved_at_utc: "2026-07-15T18:00:00.000Z",
  approved_candidate_sha256: "b2".repeat(32),
  candidate_canonical_json: "{}\n",
} as const;
const canonicalRequest = `${JSON.stringify(requestFields)}\n`;

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

function runCli(
  input: string | Buffer,
  arguments_: readonly string[] = [],
): SpawnSyncReturns<string> {
  return spawnSync(
    process.execPath,
    ["-r", "tsx/cjs", CLI_SOURCE_PATH, ...arguments_],
    {
      cwd: REPOSITORY_ROOT,
      encoding: "utf8",
      env: cleanChildEnvironment(),
      input,
      timeout: 30_000,
    },
  );
}

function expectFixedRejection(result: SpawnSyncReturns<string>): void {
  expect(result.error).toBeUndefined();
  expect(result.signal).toBeNull();
  expect(result.status).toBe(1);
  expect(result.stdout).toBe("");
  expect(result.stderr).toBe(FIXED_FAILURE_MESSAGE);
}

describe("Floodgate v7 approved key enrollment installer CLI", () => {
  it("keeps the temporary listener through a paired error and detaches it before rejection settles", async () => {
    const stream = new TestOutputStream("callback-and-paired-error");

    await expect(
      writeFloodgateV7ApprovedKeyEnrollmentOutputCoreForTests(
        asWriteStream(stream),
        "receipt\n",
      ),
    ).rejects.toThrow("synthetic-output-callback-and-paired-error");

    expect(stream.writes).toBe(1);
    expect(stream.listenerCount("error")).toBe(0);
  });

  it.each(["callback-and-paired-error", "synchronous-throw"] as const)(
    "does not accumulate error listeners across repeated %s failures",
    async (mode) => {
      const stream = new TestOutputStream(mode);

      for (let attempt = 0; attempt < 20; attempt += 1) {
        await expect(
          writeFloodgateV7ApprovedKeyEnrollmentOutputCoreForTests(
            asWriteStream(stream),
            "fixed-failure\n",
          ),
        ).rejects.toThrow(`synthetic-output-${mode}`);
        expect(stream.listenerCount("error")).toBe(0);
      }
      expect(stream.writes).toBe(20);
    },
  );

  it("detaches the temporary listener on successful one-shot output", async () => {
    const stream = new TestOutputStream("success");

    await expect(
      writeFloodgateV7ApprovedKeyEnrollmentOutputCoreForTests(
        asWriteStream(stream),
        "receipt\n",
      ),
    ).resolves.toBeUndefined();

    expect(stream.writes).toBe(1);
    expect(stream.listenerCount("error")).toBe(0);
  });

  it("rejects every positional argument before accepting a request", () => {
    expectFixedRejection(runCli(canonicalRequest, ["unexpected-argument"]));
  });

  it.each([
    ["empty input", Buffer.alloc(0)],
    ["malformed JSON", Buffer.from("{]\n", "utf8")],
    [
      "CRLF framing",
      Buffer.from(`${canonicalRequest.slice(0, -1)}\r\n`, "utf8"),
    ],
    [
      "reordered fields",
      Buffer.from(
        `${JSON.stringify({
          approval_id: requestFields.approval_id,
          contract: requestFields.contract,
          approved_at_utc: requestFields.approved_at_utc,
          approved_candidate_sha256: requestFields.approved_candidate_sha256,
          candidate_canonical_json: requestFields.candidate_canonical_json,
        })}\n`,
        "utf8",
      ),
    ],
    [
      "a duplicate field",
      Buffer.from(
        canonicalRequest.replace(
          `{"contract":"${INSTALL_REQUEST_CONTRACT}"`,
          `{"contract":"${INSTALL_REQUEST_CONTRACT}","contract":"${INSTALL_REQUEST_CONTRACT}"`,
        ),
        "utf8",
      ),
    ],
    ["an oversized record", Buffer.alloc(65_537, 0x61)],
    ["invalid UTF-8", Buffer.from([0xc3, 0x28, 0x0a])],
  ])("rejects %s without touching the installer", (_label, input) => {
    expectFixedRejection(runCli(input));
  });
});
