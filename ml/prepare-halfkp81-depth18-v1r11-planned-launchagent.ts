import * as fs from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";

import {
  publishV1R11CreateOnlyBytes,
  readV1R11HeldIdentity,
  v1r11Sha256,
  type V1R11AuthorityDirectoryIdentity,
  type V1R11AuthorityFileIdentity,
} from "./halfkp81-depth18-v1r11-authority-io";

const SNAPSHOT_SCHEMA = "application/x-apple-aspen-config-exact-bytes";
const LABEL_PREFIX = "com.meetyudai.shogi.halfkp81-depth18-yaneura-only-v1r11-";
export const HALFKP81_V1R11_FORMAL_CHILD_ENTRYPOINT =
  "ml/run-halfkp81-depth18-v1r11-formal-child.ts" as const;

export interface Halfkp81V1R11PlannedLaunchAgentDescriptor {
  readonly label: string;
  readonly plistSnapshot: Readonly<V1R11AuthorityFileIdentity>;
  readonly plistSource: Readonly<{
    path: string;
    bytes: number;
    sha256: string;
    dev: number;
    ino: number;
    uid: number;
    mode: 0o600;
    nlink: 1;
  }>;
  readonly programArguments: readonly string[];
  readonly stdoutPath: string;
  readonly stderrPath: string;
}

function xmlEscape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function plistString(value: string): string {
  return `    <string>${xmlEscape(value)}</string>`;
}

export function buildHalfkp81V1R11PlannedLaunchAgentPlistForTests(
  input: Readonly<{
    label: string;
    repositoryRoot: string;
    nodePath: string;
    stdoutPath: string;
    stderrPath: string;
    entrypointPath?: string;
  }>,
): Readonly<{ bytes: Buffer; programArguments: readonly string[] }> {
  if (
    JSON.stringify(Object.keys(input).sort()) !==
    JSON.stringify(
      [
        "label",
        "repositoryRoot",
        "nodePath",
        "stdoutPath",
        "stderrPath",
        ...(input.entrypointPath === undefined ? [] : ["entrypointPath"]),
      ].sort(),
    )
  ) {
    throw new Error("planned LaunchAgent input keys differ");
  }
  const runnerUtilityArgv = Object.freeze([
    input.nodePath,
    "-r",
    path.join(input.repositoryRoot, "node_modules/tsx/dist/cjs/index.cjs"),
    input.entrypointPath ??
      path.join(input.repositoryRoot, HALFKP81_V1R11_FORMAL_CHILD_ENTRYPOINT),
  ]);
  // launchd must own the Node formal child PID. The child starts a separate
  // `caffeinate -dimsu -w <runner-pid>` assertion holder after it enters the
  // fixed process group; wrapping Node in caffeinate would reverse the frozen
  // parent/child topology and make launchctl's PID differ from the runner PID.
  const programArguments = runnerUtilityArgv;
  const bytes = Buffer.from(
    [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
      '<plist version="1.0">',
      "<dict>",
      "  <key>Label</key>",
      plistString(input.label),
      "  <key>ProgramArguments</key>",
      "  <array>",
      ...programArguments.map(plistString),
      "  </array>",
      "  <key>WorkingDirectory</key>",
      plistString(input.repositoryRoot),
      "  <key>StandardOutPath</key>",
      plistString(input.stdoutPath),
      "  <key>StandardErrorPath</key>",
      plistString(input.stderrPath),
      "  <key>RunAtLoad</key>",
      "  <true/>",
      "  <key>KeepAlive</key>",
      "  <false/>",
      "  <key>LaunchOnlyOnce</key>",
      "  <true/>",
      "  <key>Umask</key>",
      "  <integer>63</integer>",
      "  <key>AbandonProcessGroup</key>",
      "  <false/>",
      "</dict>",
      "</plist>",
      "",
    ].join("\n"),
    "utf8",
  );
  if (/[0-9a-f]{64}/u.test(bytes.toString("utf8"))) {
    throw new Error(
      "planned LaunchAgent contains a run-fingerprint-shaped value",
    );
  }
  return Object.freeze({
    bytes,
    programArguments,
  });
}

export interface Halfkp81V1R11LaunchctlBoundary {
  run(arguments_: readonly string[]): Readonly<{
    exitCode: number;
    stdout: Buffer;
    stderr: Buffer;
  }>;
}

function productionLaunchctlBoundary(): Readonly<Halfkp81V1R11LaunchctlBoundary> {
  return Object.freeze({
    run(arguments_: readonly string[]) {
      const result = spawnSync("/bin/launchctl", [...arguments_], {
        encoding: null,
        stdio: ["ignore", "pipe", "pipe"],
      });
      if (
        result.error !== undefined ||
        result.signal !== null ||
        result.status === null ||
        !Buffer.isBuffer(result.stdout) ||
        !Buffer.isBuffer(result.stderr)
      ) {
        throw new Error("formal LaunchAgent launchctl transport differs");
      }
      return Object.freeze({
        exitCode: result.status,
        stdout: result.stdout,
        stderr: result.stderr,
      });
    },
  });
}

export async function bootstrapHalfkp81V1R11PlannedLaunchAgentForTests(
  descriptor: Readonly<Halfkp81V1R11PlannedLaunchAgentDescriptor>,
  uid: number,
  boundary: Readonly<Halfkp81V1R11LaunchctlBoundary>,
): Promise<void> {
  if (!Number.isSafeInteger(uid) || uid < 1) {
    throw new Error("formal LaunchAgent uid differs");
  }
  const held = await readV1R11HeldIdentity(
    descriptor.plistSnapshot,
    SNAPSHOT_SCHEMA,
    "formal planned plist snapshot before bootstrap",
  );
  const source = fs.readFileSync(descriptor.plistSource.path);
  if (
    !source.equals(held) ||
    source.byteLength !== descriptor.plistSource.bytes ||
    v1r11Sha256(source) !== descriptor.plistSource.sha256
  ) {
    throw new Error("formal planned plist source changed before bootstrap");
  }
  const domain = `gui/${String(uid)}`;
  const service = `${domain}/${descriptor.label}`;
  const before = boundary.run(["print", service]);
  if (before.exitCode !== 113) {
    throw new Error(
      "formal LaunchAgent service already exists or is ambiguous",
    );
  }
  const bootstrap = boundary.run([
    "bootstrap",
    domain,
    descriptor.plistSource.path,
  ]);
  if (bootstrap.exitCode !== 0) {
    throw new Error("formal LaunchAgent bootstrap failed");
  }
  const kickstart = boundary.run(["kickstart", service]);
  if (kickstart.exitCode !== 0) {
    throw new Error("formal LaunchAgent kickstart failed");
  }
}

export async function bootstrapHalfkp81V1R11PlannedLaunchAgent(
  descriptor: Readonly<Halfkp81V1R11PlannedLaunchAgentDescriptor>,
): Promise<void> {
  const uid = process.geteuid?.();
  if (!Number.isSafeInteger(uid)) {
    throw new Error("formal LaunchAgent effective uid differs");
  }
  return bootstrapHalfkp81V1R11PlannedLaunchAgentForTests(
    descriptor,
    Number(uid),
    productionLaunchctlBoundary(),
  );
}

function publishPrivateCreateOnly(filePath: string, raw: Buffer): void {
  const directory = path.dirname(filePath);
  const parent = fs.lstatSync(directory);
  const euid = process.geteuid?.();
  if (
    !parent.isDirectory() ||
    parent.isSymbolicLink() ||
    parent.uid !== euid ||
    fs.realpathSync.native(directory) !== directory
  ) {
    throw new Error("planned LaunchAgent source parent differs");
  }
  const handle = fs.openSync(
    filePath,
    fs.constants.O_CREAT |
      fs.constants.O_EXCL |
      fs.constants.O_WRONLY |
      (fs.constants.O_NOFOLLOW ?? 0),
    0o600,
  );
  try {
    fs.writeFileSync(handle, raw);
    fs.fsyncSync(handle);
  } finally {
    fs.closeSync(handle);
  }
  const directoryHandle = fs.openSync(directory, fs.constants.O_RDONLY);
  try {
    fs.fsyncSync(directoryHandle);
  } finally {
    fs.closeSync(directoryHandle);
  }
}

export async function prepareHalfkp81V1R11PlannedLaunchAgentForTests(
  input: Readonly<{
    authorityDirectory: Readonly<V1R11AuthorityDirectoryIdentity>;
    repositoryRoot: string;
    homeDirectory: string;
    nodePath: string;
    sourceRevision: string;
    entrypointPath?: string;
  }>,
): Promise<Readonly<Halfkp81V1R11PlannedLaunchAgentDescriptor>> {
  if (
    !/^[0-9a-f]{40}$/u.test(input.sourceRevision) ||
    !path.isAbsolute(input.repositoryRoot) ||
    path.normalize(input.repositoryRoot) !== input.repositoryRoot ||
    !path.isAbsolute(input.homeDirectory) ||
    path.normalize(input.homeDirectory) !== input.homeDirectory ||
    !path.isAbsolute(input.nodePath) ||
    path.normalize(input.nodePath) !== input.nodePath ||
    (input.entrypointPath !== undefined &&
      (!path.isAbsolute(input.entrypointPath) ||
        path.normalize(input.entrypointPath) !== input.entrypointPath))
  ) {
    throw new Error("planned LaunchAgent context differs");
  }
  const label = `${LABEL_PREFIX}${input.sourceRevision.slice(0, 8)}`;
  const runDirectory = path.join(
    input.homeDirectory,
    ".codex/shogi-runs/halfkp81-hard-depth18-yaneura-only-v1r11",
  );
  const launchAgentsDirectory = path.join(
    input.homeDirectory,
    "Library/LaunchAgents",
  );
  fs.mkdirSync(runDirectory, { recursive: true, mode: 0o700 });
  fs.chmodSync(runDirectory, 0o700);
  fs.mkdirSync(launchAgentsDirectory, { recursive: true, mode: 0o700 });
  const stdoutPath = path.join(runDirectory, "formal-launchagent.stdout.log");
  const stderrPath = path.join(runDirectory, "formal-launchagent.stderr.log");
  const plistPath = path.join(launchAgentsDirectory, `${label}.plist`);
  const planned = buildHalfkp81V1R11PlannedLaunchAgentPlistForTests({
    label,
    repositoryRoot: input.repositoryRoot,
    nodePath: input.nodePath,
    stdoutPath,
    stderrPath,
    ...(input.entrypointPath === undefined
      ? {}
      : { entrypointPath: input.entrypointPath }),
  });
  publishPrivateCreateOnly(plistPath, planned.bytes);
  const snapshot = await publishV1R11CreateOnlyBytes(
    input.authorityDirectory,
    path.join(input.authorityDirectory.path, "launchagent.plist.snapshot"),
    planned.bytes,
    SNAPSHOT_SCHEMA,
  );
  const held = await readV1R11HeldIdentity(
    snapshot,
    SNAPSHOT_SCHEMA,
    "planned LaunchAgent snapshot",
  );
  const sourceMetadata = fs.lstatSync(plistPath);
  if (
    !held.equals(planned.bytes) ||
    !sourceMetadata.isFile() ||
    sourceMetadata.isSymbolicLink() ||
    sourceMetadata.nlink !== 1 ||
    sourceMetadata.uid !== process.geteuid?.() ||
    (sourceMetadata.mode & 0o7777) !== 0o600 ||
    sourceMetadata.size !== planned.bytes.byteLength ||
    !fs.readFileSync(plistPath).equals(planned.bytes)
  ) {
    throw new Error("planned LaunchAgent source or snapshot differs");
  }
  return Object.freeze({
    label,
    plistSnapshot: snapshot,
    plistSource: Object.freeze({
      path: plistPath,
      bytes: planned.bytes.byteLength,
      sha256: v1r11Sha256(planned.bytes),
      dev: sourceMetadata.dev,
      ino: sourceMetadata.ino,
      uid: sourceMetadata.uid,
      mode: 0o600 as const,
      nlink: 1 as const,
    }),
    programArguments: planned.programArguments,
    stdoutPath,
    stderrPath,
  });
}
