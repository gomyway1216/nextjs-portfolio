import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import * as fs from "node:fs";

import { describe, expect, it } from "vitest";

import {
  FLOODGATE_V7_PRIVATE_HUMAN_KEY_REVIEW_HELPER,
  FLOODGATE_V7_PRIVATE_HUMAN_KEY_REVIEW_OSASCRIPT,
  FLOODGATE_V7_PRIVATE_HUMAN_KEY_REVIEW_REQUEST_CONTRACT,
  FLOODGATE_V7_PRIVATE_HUMAN_KEY_REVIEW_RESPONSE_CONTRACT,
  FloodgateV7PrivateHumanKeyReviewUiError,
  reviewFloodgateV7PrivateHumanKeyCandidateCoreForTests,
  type FloodgateV7PrivateHumanKeyReviewRequest,
  type FloodgateV7PrivateHumanKeyReviewSpawnOptionsForTests,
  type FloodgateV7PrivateHumanKeyReviewUiDependenciesForTests,
} from "../../../ml/floodgate-v7-private-human-key-review-ui";

type FakeHelperMode =
  | "approve"
  | "cancel"
  | "crlf"
  | "digest-mismatch"
  | "invalid-utf8"
  | "multiple-lines"
  | "nonzero-with-private-stderr"
  | "oversized"
  | "oversized-stderr"
  | "reordered"
  | "private-stderr";

interface CapturedInvocation {
  readonly executable: string;
  readonly arguments_: readonly string[];
  readonly options: Readonly<FloodgateV7PrivateHumanKeyReviewSpawnOptionsForTests>;
  readonly child: ChildProcessWithoutNullStreams;
}

const PRIVATE_CANDIDATE_SENTINEL =
  "PRIVATE-CANDIDATE-MUST-REMAIN-INSIDE-PIPES-7f6c0d";
const CANDIDATE_CANONICAL_JSON = `${JSON.stringify({
  contract: "synthetic-private-review-candidate-v1",
  candidate_label: PRIVATE_CANDIDATE_SENTINEL,
  owner_uid: 424_242,
  parent_identity: { dev: "111", ino: "222" },
  key_identity: { dev: "333", ino: "444" },
})}\n`;
const CANDIDATE_SHA256 = createHash("sha256")
  .update(CANDIDATE_CANONICAL_JSON, "utf8")
  .digest("hex");
const VALID_REQUEST: FloodgateV7PrivateHumanKeyReviewRequest = {
  contract: FLOODGATE_V7_PRIVATE_HUMAN_KEY_REVIEW_REQUEST_CONTRACT,
  candidate_canonical_json: CANDIDATE_CANONICAL_JSON,
  candidate_sha256: CANDIDATE_SHA256,
  candidate_bytes: Buffer.byteLength(CANDIDATE_CANONICAL_JSON, "utf8"),
};

// This process is only a deterministic stdin/stdout test double. The private
// candidate and digest are parsed from stdin and are never interpolated here.
const FAKE_HELPER_SOURCE = String.raw`
const chunks = [];
process.stdin.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
process.stdin.on("end", () => {
  const privateInput = Buffer.concat(chunks);
  const request = JSON.parse(privateInput.toString("utf8"));
  const contract = "shogi-floodgate-v7-private-human-key-review-response-v1";
  const approve = JSON.stringify({
    contract,
    decision: "approve",
    typed_candidate_sha256: request.candidate_sha256,
  });
  const cancel = JSON.stringify({
    contract,
    decision: "cancel",
    typed_candidate_sha256: null,
  });
  switch (process.argv[1]) {
    case "approve":
      process.stdout.write(approve + "\n");
      return;
    case "cancel":
      process.stdout.write(cancel + "\n");
      return;
    case "crlf":
      process.stdout.write(cancel + "\r\n");
      return;
    case "digest-mismatch":
      process.stdout.write(JSON.stringify({
        contract,
        decision: "approve",
        typed_candidate_sha256: "0".repeat(64),
      }) + "\n");
      return;
    case "invalid-utf8":
      process.stdout.write(Buffer.from([0xff, 0x0a]));
      return;
    case "multiple-lines":
      process.stdout.write(cancel + "\n" + cancel + "\n");
      return;
    case "nonzero-with-private-stderr":
      process.stderr.write(privateInput);
      process.exitCode = 7;
      return;
    case "oversized":
      process.stdout.write("x".repeat(1025));
      return;
    case "oversized-stderr":
      process.stderr.write("x".repeat(1025));
      process.stdout.write(cancel + "\n");
      return;
    case "reordered":
      process.stdout.write(JSON.stringify({
        decision: "cancel",
        contract,
        typed_candidate_sha256: null,
      }) + "\n");
      return;
    case "private-stderr":
      process.stderr.write(privateInput);
      process.stdout.write(cancel + "\n");
      return;
    default:
      process.exitCode = 9;
  }
});
`;

function fakeHelperDependencies(
  mode: FakeHelperMode,
  invocations: CapturedInvocation[] = [],
): FloodgateV7PrivateHumanKeyReviewUiDependenciesForTests {
  return {
    spawnChild(executable, arguments_, options) {
      const child = spawn(process.execPath, ["-e", FAKE_HELPER_SOURCE, mode], {
        stdio: ["pipe", "pipe", "pipe"],
      });
      invocations.push({
        executable,
        arguments_: [...arguments_],
        options,
        child,
      });
      return child;
    },
  };
}

async function captureFailure(
  operation: () => Promise<unknown>,
): Promise<unknown> {
  try {
    await operation();
  } catch (error) {
    return error;
  }
  throw new Error("expected private human review to fail");
}

function expectSanitizedFailure(
  error: unknown,
  phase: "capture" | "helper" | "request" | "response",
): void {
  expect(error).toBeInstanceOf(FloodgateV7PrivateHumanKeyReviewUiError);
  expect(error).toMatchObject({
    name: "FloodgateV7PrivateHumanKeyReviewUiError",
    phase,
    approval_returned: false,
    public_sensitive_values_disclosed: false,
  });
  const publicProjection = [
    String(error),
    error instanceof Error ? (error.stack ?? "") : "",
    JSON.stringify(error),
  ].join("\n");
  expect(publicProjection).not.toContain(PRIVATE_CANDIDATE_SENTINEL);
  expect(publicProjection).not.toContain(CANDIDATE_CANONICAL_JSON.trim());
  expect(publicProjection).not.toContain(CANDIDATE_SHA256);
}

function expectNoPrivateReviewListeners(
  child: ChildProcessWithoutNullStreams,
): void {
  expect(child.listenerCount("spawn")).toBe(0);
  expect(child.listenerCount("error")).toBe(0);
  expect(child.listenerCount("close")).toBe(0);
  expect(child.stdin.listenerCount("error")).toBe(0);
  expect(child.stdout.listenerCount("data")).toBe(0);
  expect(child.stdout.listenerCount("error")).toBe(0);
  expect(child.stderr.listenerCount("data")).toBe(0);
  expect(child.stderr.listenerCount("error")).toBe(0);
}

describe("floodgate v7 private human key review UI", () => {
  it("passes private input only over a pipe and accepts exact digest typeback", async () => {
    const invocations: CapturedInvocation[] = [];
    const response =
      await reviewFloodgateV7PrivateHumanKeyCandidateCoreForTests(
        VALID_REQUEST,
        fakeHelperDependencies("approve", invocations),
      );

    expect({ ...response }).toStrictEqual({
      contract: FLOODGATE_V7_PRIVATE_HUMAN_KEY_REVIEW_RESPONSE_CONTRACT,
      decision: "approve",
      typed_candidate_sha256: CANDIDATE_SHA256,
    });
    expect(Object.isFrozen(response)).toBe(true);
    expect(invocations).toHaveLength(1);
    const invocation = invocations[0];
    expect(invocation).toBeDefined();
    if (invocation === undefined) throw new Error("missing helper invocation");
    expect(invocation.executable).toBe(
      FLOODGATE_V7_PRIVATE_HUMAN_KEY_REVIEW_OSASCRIPT,
    );
    expect(invocation.arguments_).toStrictEqual([
      "-l",
      "JavaScript",
      FLOODGATE_V7_PRIVATE_HUMAN_KEY_REVIEW_HELPER,
    ]);
    expect(FLOODGATE_V7_PRIVATE_HUMAN_KEY_REVIEW_HELPER).toMatch(
      /^\/.*\.jxa$/u,
    );
    expect(invocation.options).toMatchObject({
      cwd: "/",
      detached: false,
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    expect(invocation.options.env).toStrictEqual({
      LANG: "en_US.UTF-8",
      LC_ALL: "en_US.UTF-8",
      NODE_ENV: "production",
      PATH: "/usr/bin:/bin",
    });
    const publicLaunch = JSON.stringify({
      executable: invocation.executable,
      arguments_: invocation.arguments_,
      options: invocation.options,
    });
    expect(publicLaunch).not.toContain(PRIVATE_CANDIDATE_SENTINEL);
    expect(publicLaunch).not.toContain(CANDIDATE_CANONICAL_JSON.trim());
    expect(publicLaunch).not.toContain(CANDIDATE_SHA256);
    expectNoPrivateReviewListeners(invocation.child);
  });

  it("returns only the canonical cancel response", async () => {
    const response =
      await reviewFloodgateV7PrivateHumanKeyCandidateCoreForTests(
        VALID_REQUEST,
        fakeHelperDependencies("cancel"),
      );
    expect({ ...response }).toStrictEqual({
      contract: FLOODGATE_V7_PRIVATE_HUMAN_KEY_REVIEW_RESPONSE_CONTRACT,
      decision: "cancel",
      typed_candidate_sha256: null,
    });
  });

  it.each([
    ["CRLF framing", "crlf", "response"],
    ["mismatched digest", "digest-mismatch", "response"],
    ["invalid UTF-8", "invalid-utf8", "response"],
    ["multiple response lines", "multiple-lines", "response"],
    ["oversized stdout", "oversized", "helper"],
    ["oversized stderr", "oversized-stderr", "helper"],
    ["reordered response fields", "reordered", "response"],
  ] as const)(
    "fails closed with a sanitized error for %s",
    async (_label, mode, phase) => {
      const error = await captureFailure(() =>
        reviewFloodgateV7PrivateHumanKeyCandidateCoreForTests(
          VALID_REQUEST,
          fakeHelperDependencies(mode),
        ),
      );
      expectSanitizedFailure(error, phase);
    },
  );

  it("fails closed on nonzero exit and removes every installed listener", async () => {
    const invocations: CapturedInvocation[] = [];
    const error = await captureFailure(() =>
      reviewFloodgateV7PrivateHumanKeyCandidateCoreForTests(
        VALID_REQUEST,
        fakeHelperDependencies("nonzero-with-private-stderr", invocations),
      ),
    );
    expectSanitizedFailure(error, "helper");
    expect(invocations).toHaveLength(1);
    const invocation = invocations[0];
    expect(invocation).toBeDefined();
    if (invocation === undefined) throw new Error("missing helper invocation");
    expectNoPrivateReviewListeners(invocation.child);
  });

  it("zeroizes pipe chunks that arrive after failure has already begun", async () => {
    const stdin = new EventEmitter();
    const stdout = new EventEmitter();
    const stderr = new EventEmitter();
    const childEvents = new EventEmitter();
    const oversized = Buffer.alloc(1025, 0x61);
    const lateStdout = Buffer.from(CANDIDATE_CANONICAL_JSON, "utf8");
    const lateStderr = Buffer.from(CANDIDATE_SHA256, "ascii");
    Object.defineProperty(stdin, "end", {
      value(_bytes: Buffer, callback: () => void) {
        queueMicrotask(callback);
        return stdin;
      },
    });
    Object.defineProperties(childEvents, {
      stdin: { value: stdin },
      stdout: { value: stdout },
      stderr: { value: stderr },
      kill: { value: () => true },
    });
    const child = childEvents as unknown as ChildProcessWithoutNullStreams;
    const dependencies = {
      spawnChild(): ChildProcessWithoutNullStreams {
        queueMicrotask(() => {
          child.emit("spawn");
          stdout.emit("data", oversized);
          stdout.emit("data", lateStdout);
          stderr.emit("data", lateStderr);
          child.emit("close", null, "SIGKILL");
        });
        return child;
      },
    };

    const error = await captureFailure(() =>
      reviewFloodgateV7PrivateHumanKeyCandidateCoreForTests(
        VALID_REQUEST,
        dependencies,
      ),
    );
    expectSanitizedFailure(error, "helper");
    expect(oversized.every((byte) => byte === 0)).toBe(true);
    expect(lateStdout.every((byte) => byte === 0)).toBe(true);
    expect(lateStderr.every((byte) => byte === 0)).toBe(true);
    expectNoPrivateReviewListeners(child);
  });

  it("tolerates bounded private system stderr and removes every installed listener", async () => {
    const invocations: CapturedInvocation[] = [];
    const response =
      await reviewFloodgateV7PrivateHumanKeyCandidateCoreForTests(
        VALID_REQUEST,
        fakeHelperDependencies("private-stderr", invocations),
      );
    expect({ ...response }).toStrictEqual({
      contract: FLOODGATE_V7_PRIVATE_HUMAN_KEY_REVIEW_RESPONSE_CONTRACT,
      decision: "cancel",
      typed_candidate_sha256: null,
    });
    expect(invocations).toHaveLength(1);
    const invocation = invocations[0];
    expect(invocation).toBeDefined();
    if (invocation === undefined) throw new Error("missing helper invocation");
    expectNoPrivateReviewListeners(invocation.child);
  });

  it.each([
    [
      "wrong contract",
      { ...VALID_REQUEST, contract: "wrong-private-review-contract" },
    ],
    [
      "wrong byte count",
      { ...VALID_REQUEST, candidate_bytes: VALID_REQUEST.candidate_bytes + 1 },
    ],
    ["wrong digest", { ...VALID_REQUEST, candidate_sha256: "0".repeat(64) }],
    [
      "uppercase digest",
      {
        ...VALID_REQUEST,
        candidate_sha256: VALID_REQUEST.candidate_sha256.toUpperCase(),
      },
    ],
    [
      "missing terminal LF",
      {
        ...VALID_REQUEST,
        candidate_canonical_json: VALID_REQUEST.candidate_canonical_json.slice(
          0,
          -1,
        ),
      },
    ],
    [
      "CRLF candidate",
      {
        ...VALID_REQUEST,
        candidate_canonical_json: `${VALID_REQUEST.candidate_canonical_json.trim()}\r\n`,
      },
    ],
    ["extra key", { ...VALID_REQUEST, extra_public_field: false }],
    [
      "reordered keys",
      {
        candidate_canonical_json: VALID_REQUEST.candidate_canonical_json,
        contract: VALID_REQUEST.contract,
        candidate_sha256: VALID_REQUEST.candidate_sha256,
        candidate_bytes: VALID_REQUEST.candidate_bytes,
      },
    ],
  ] as const)("rejects %s before spawning", async (_label, malformed) => {
    let spawnCalls = 0;
    const dependencies = {
      spawnChild(): ChildProcessWithoutNullStreams {
        spawnCalls += 1;
        throw new Error("must not spawn for an invalid request");
      },
    };
    const error = await captureFailure(() =>
      reviewFloodgateV7PrivateHumanKeyCandidateCoreForTests(
        malformed as FloodgateV7PrivateHumanKeyReviewRequest,
        dependencies,
      ),
    );
    expectSanitizedFailure(error, "request");
    expect(spawnCalls).toBe(0);
  });

  it("rejects proxy and accessor-bearing requests without reading accessors", async () => {
    let getterCalls = 0;
    const accessorRequest = { ...VALID_REQUEST };
    Object.defineProperty(accessorRequest, "candidate_canonical_json", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return CANDIDATE_CANONICAL_JSON;
      },
    });
    const proxyRequest = new Proxy({ ...VALID_REQUEST }, {});
    let spawnCalls = 0;
    const dependencies = {
      spawnChild(): ChildProcessWithoutNullStreams {
        spawnCalls += 1;
        throw new Error("must not spawn for an invalid request");
      },
    };

    for (const malformed of [accessorRequest, proxyRequest]) {
      const error = await captureFailure(() =>
        reviewFloodgateV7PrivateHumanKeyCandidateCoreForTests(
          malformed as FloodgateV7PrivateHumanKeyReviewRequest,
          dependencies,
        ),
      );
      expectSanitizedFailure(error, "request");
    }
    expect(getterCalls).toBe(0);
    expect(spawnCalls).toBe(0);
  });

  it("keeps the checked-in helper static, native, and free of public leak sinks", () => {
    const source = fs.readFileSync(
      FLOODGATE_V7_PRIVATE_HUMAN_KEY_REVIEW_HELPER,
      "utf8",
    );
    expect(source).toContain('ObjC.import("AppKit")');
    expect(source).toContain("NSAlert");
    expect(source).toContain("NSSecureTextField");
    expect(source).toContain("candidate_bytes = ${request.candidate_bytes}");
    expect(source).toContain("final byte = 0A");
    expect(source).toContain("terminal LF count = 1");
    expect(source).toContain(
      FLOODGATE_V7_PRIVATE_HUMAN_KEY_REVIEW_REQUEST_CONTRACT,
    );
    expect(source).toContain(
      FLOODGATE_V7_PRIVATE_HUMAN_KEY_REVIEW_RESPONSE_CONTRACT,
    );
    expect(source).not.toMatch(
      /NSPasteboard|clipboard|pbcopy|pbpaste|\/dev\/tty|console\.|NSLog|mktemp|writeToFile/iu,
    );
  });
});
