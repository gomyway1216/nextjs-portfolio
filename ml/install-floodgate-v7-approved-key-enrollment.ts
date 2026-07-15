/**
 * Argumentless operator entry point for one create-only Floodgate v7 approved
 * key-enrollment installation. It accepts one bounded canonical JSONL request
 * on stdin and writes only the installer's sanitized receipt to stdout.
 */

import { Buffer } from "node:buffer";
import { TextDecoder } from "node:util";

import { installFloodgateV7ApprovedKeyEnrollment } from "./floodgate-v7-approved-key-enrollment-installer";

const INSTALL_REQUEST_CONTRACT =
  "shogi-floodgate-v7-approved-key-enrollment-install-request-v1" as const;
const MAX_INSTALL_REQUEST_BYTES = 65_536;
const INSTALL_REQUEST_KEYS = [
  "contract",
  "approval_id",
  "approved_at_utc",
  "approved_candidate_sha256",
  "candidate_canonical_json",
] as const;
const FIXED_FAILURE_MESSAGE =
  "Floodgate v7 approved key enrollment installation failed without a success receipt\n";

interface InstallRequest {
  readonly contract: typeof INSTALL_REQUEST_CONTRACT;
  readonly approval_id: string;
  readonly approved_at_utc: string;
  readonly approved_candidate_sha256: string;
  readonly candidate_canonical_json: string;
}

const scheduleImmediate = setImmediate;

function writeOutput(stream: NodeJS.WriteStream, value: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const onError = (error: Error): void => {
      if (settled) return;
      settled = true;
      // A failed stream.write callback can be followed by a paired "error"
      // event. Keep this listener through the current event-loop turn, then
      // detach it before exposing the rejection to a caller that may retry.
      scheduleImmediate(() => {
        stream.off("error", onError);
        reject(error);
      });
    };
    stream.on("error", onError);
    try {
      stream.write(value, (error) => {
        if (error) {
          // Keep the listener for the paired error event Node may emit after
          // invoking this callback with the same failure.
          onError(error);
          return;
        }
        if (settled) return;
        settled = true;
        stream.off("error", onError);
        resolve();
      });
    } catch (error) {
      onError(
        error instanceof Error
          ? error
          : new Error("approved enrollment installer output failed"),
      );
    }
  });
}

/** Test-only stream boundary; it never invokes the production installer. */
export function writeFloodgateV7ApprovedKeyEnrollmentOutputCoreForTests(
  stream: NodeJS.WriteStream,
  value: string,
): Promise<void> {
  if (arguments.length !== 2) {
    return Promise.reject(
      new TypeError("test installer output accepts exactly two arguments"),
    );
  }
  return writeOutput(stream, value);
}

async function readBoundedStdin(stream: NodeJS.ReadStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const inputChunk of stream) {
    const chunk = Buffer.isBuffer(inputChunk)
      ? inputChunk
      : Buffer.from(inputChunk);
    if (chunk.byteLength > MAX_INSTALL_REQUEST_BYTES - totalBytes) {
      throw new Error("approved enrollment install request is oversized");
    }
    totalBytes += chunk.byteLength;
    chunks.push(chunk);
  }
  if (totalBytes < 2) {
    throw new Error("approved enrollment install request is empty");
  }
  return Buffer.concat(chunks, totalBytes);
}

function parseInstallRequest(bytes: Buffer): Readonly<InstallRequest> {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
      bytes,
    );
  } catch {
    throw new Error("approved enrollment install request is not UTF-8");
  }
  if (
    !text.endsWith("\n") ||
    text.indexOf("\n") !== text.length - 1 ||
    text.includes("\r")
  ) {
    throw new Error("approved enrollment install request is not one LF record");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("approved enrollment install request is not JSON");
  }
  if (
    parsed === null ||
    typeof parsed !== "object" ||
    Array.isArray(parsed) ||
    Object.getPrototypeOf(parsed) !== Object.prototype
  ) {
    throw new Error(
      "approved enrollment install request is not a plain record",
    );
  }
  const descriptors = Object.getOwnPropertyDescriptors(parsed);
  const ownKeys = Reflect.ownKeys(parsed);
  if (ownKeys.length !== INSTALL_REQUEST_KEYS.length) {
    throw new Error("approved enrollment install request key count differs");
  }
  for (const key of ownKeys) {
    if (
      typeof key !== "string" ||
      !INSTALL_REQUEST_KEYS.includes(
        key as (typeof INSTALL_REQUEST_KEYS)[number],
      )
    ) {
      throw new Error("approved enrollment install request has an unknown key");
    }
  }
  for (const key of INSTALL_REQUEST_KEYS) {
    const descriptor = descriptors[key];
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.enumerable !== true
    ) {
      throw new Error("approved enrollment install request is not plain data");
    }
  }

  const candidate = parsed as Record<string, unknown>;
  if (
    candidate.contract !== INSTALL_REQUEST_CONTRACT ||
    typeof candidate.approval_id !== "string" ||
    typeof candidate.approved_at_utc !== "string" ||
    typeof candidate.approved_candidate_sha256 !== "string" ||
    typeof candidate.candidate_canonical_json !== "string"
  ) {
    throw new Error("approved enrollment install request fields differ");
  }
  const captured = Object.freeze({
    contract: INSTALL_REQUEST_CONTRACT,
    approval_id: candidate.approval_id,
    approved_at_utc: candidate.approved_at_utc,
    approved_candidate_sha256: candidate.approved_candidate_sha256,
    candidate_canonical_json: candidate.candidate_canonical_json,
  });
  if (`${JSON.stringify(captured)}\n` !== text) {
    throw new Error("approved enrollment install request is not canonical");
  }
  return captured;
}

async function main(): Promise<void> {
  if (process.argv.length !== 2) {
    throw new Error("approved enrollment installer accepts no arguments");
  }
  const request = parseInstallRequest(await readBoundedStdin(process.stdin));
  const receipt = await installFloodgateV7ApprovedKeyEnrollment({
    approval_id: request.approval_id,
    approved_at_utc: request.approved_at_utc,
    approved_candidate_sha256: request.approved_candidate_sha256,
    candidate_canonical_json: request.candidate_canonical_json,
  });
  await writeOutput(process.stdout, `${JSON.stringify(receipt)}\n`);
}

if (require.main === module) {
  const suppressPublicStreamFailure = (): void => {
    process.exitCode = 1;
  };
  process.stdout.on("error", suppressPublicStreamFailure);
  process.stderr.on("error", suppressPublicStreamFailure);
  void main().catch(async () => {
    process.exitCode = 1;
    try {
      await writeOutput(process.stderr, FIXED_FAILURE_MESSAGE);
    } catch {
      // The fixed exit status remains authoritative if stderr is also closed.
    }
  });
}
