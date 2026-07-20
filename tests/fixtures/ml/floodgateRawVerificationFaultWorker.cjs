"use strict";

const { createHash } = require("node:crypto");
const { parentPort, workerData } = require("node:worker_threads");

const RESULT_SCHEMA = "shogi-floodgate-raw-verification-worker-result-v1";
const CONTROL_SCHEMA = "shogi-floodgate-raw-verification-worker-control-v1";
const RECEIPT_SCHEMA = "shogi-floodgate-raw-response-receipt-v1";
const URL_HASH_DOMAIN = "floodgate-q1-2026-raw-lock-url-v1";
const EMPTY_SHA256 =
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

if (workerData.scenario === "startup_error") {
  throw new Error("injected startup error");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function success(task) {
  const receipt = {
    schema: RECEIPT_SCHEMA,
    kind: "csa",
    url: task.url,
    url_sha256: sha256(`${URL_HASH_DOMAIN}\0${task.url}`),
    request: {
      accept_encoding: "identity",
      redirect: "manual",
      user_agent: "nextjs-portfolio-floodgate-lock/1.0",
    },
    response: {
      url: task.url,
      status: 200,
      content_encoding: null,
      bytes: 0,
      sha256: EMPTY_SHA256,
    },
    object: `objects/sha256/e3/${EMPTY_SHA256}`,
  };
  return {
    schema: RESULT_SCHEMA,
    ordinal: task.ordinal,
    status: "success",
    result: {
      receipt_kind: "csa",
      receipt,
    },
  };
}

function failure(task, message) {
  return {
    schema: RESULT_SCHEMA,
    ordinal: task.ordinal,
    status: "failure",
    error: {
      name: "Error",
      message,
    },
  };
}

parentPort.on("message", (message) => {
  if (
    message &&
    message.schema === CONTROL_SCHEMA &&
    message.operation === "shutdown"
  ) {
    if (workerData.scenario !== "shutdown_hang") parentPort.close();
    return;
  }

  switch (workerData.scenario) {
    case "hang":
      return;
    case "malformed":
      parentPort.postMessage({ schema: "malformed-response" });
      return;
    case "extra_message":
      parentPort.postMessage(success(message));
      parentPort.postMessage({ schema: "unsolicited-extra-response" });
      return;
    case "ordered_failure":
      if (message.ordinal === 2) {
        setTimeout(
          () => parentPort.postMessage(failure(message, "ordered failure 2")),
          50,
        );
      } else if (message.ordinal === 7) {
        parentPort.postMessage(failure(message, "timed-first failure 7"));
      } else {
        parentPort.postMessage(success(message));
      }
      return;
    case "ordered_timeout":
      if (message.ordinal === 2) return;
      if (message.ordinal === 7) {
        parentPort.postMessage(failure(message, "timed-first failure 7"));
      } else {
        parentPort.postMessage(success(message));
      }
      return;
    default:
      parentPort.postMessage(success(message));
  }
});
