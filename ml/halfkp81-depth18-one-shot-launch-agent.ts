#!/usr/bin/env npx tsx

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

const LAUNCHCTL = "/bin/launchctl" as const;
const CAFFEINATE = "/usr/bin/caffeinate" as const;
const ABSENT_SERVICE_STATUS = 113;
const PRIVATE_DIRECTORY_MODE = 0o700;
const PRIVATE_FILE_MODE = 0o600;
const LABEL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9.-]{2,127}$/u;

export interface Halfkp81Depth18OneShotLaunchAgentSpec {
  readonly label: string;
  /**
   * A newly published formal output directory. At launch it must contain
   * exactly the immutable teacher-plan.json declared below and no mutable
   * teacher artifact.
   */
  readonly formalOutputNamespace: string;
  readonly teacherPlanPath: string;
  readonly teacherPlanBytes: number;
  readonly teacherPlanSha256: string;
  /**
   * Private launcher state. The plist and launchd-owned logs are written here,
   * never under the formal output namespace.
   */
  readonly privateStateDirectory: string;
  readonly workingDirectory: string;
  readonly nodePath: string;
  readonly nodePreloadPath?: string;
  readonly entrypointPath: string;
  readonly uid?: number;
}

export interface LaunchctlResult {
  readonly status: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly error?: Error;
}

export interface Halfkp81Depth18LaunchAgentDependencies {
  readonly runLaunchctl: (arguments_: readonly string[]) => LaunchctlResult;
}

export interface Halfkp81Depth18LaunchAgentStatus {
  readonly domain: string;
  readonly label: string;
  readonly loaded: boolean;
  readonly detail: string;
}

export interface Halfkp81Depth18LaunchAgentReceipt {
  readonly domain: string;
  readonly label: string;
  readonly plistPath: string;
  readonly stdoutPath: string;
  readonly stderrPath: string;
  readonly status: Halfkp81Depth18LaunchAgentStatus;
}

export class Halfkp81Depth18LaunchAgentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Halfkp81Depth18LaunchAgentError";
  }
}

interface ValidatedSpec {
  readonly domain: string;
  readonly entrypointPath: string;
  readonly formalOutputNamespace: string;
  readonly label: string;
  readonly nodePath: string;
  readonly nodePreloadPath?: string;
  readonly plistPath: string;
  readonly privateStateDirectory: string;
  readonly stderrPath: string;
  readonly stdoutPath: string;
  readonly teacherPlanBytes: number;
  readonly teacherPlanPath: string;
  readonly teacherPlanSha256: string;
  readonly uid: number;
  readonly workingDirectory: string;
}

function fail(message: string): never {
  throw new Halfkp81Depth18LaunchAgentError(message);
}

function defaultRunLaunchctl(arguments_: readonly string[]): LaunchctlResult {
  const result = spawnSync(LAUNCHCTL, [...arguments_], {
    encoding: "utf8",
    shell: false,
  });
  return {
    error: result.error,
    signal: result.signal,
    status: result.status,
    stderr: result.stderr ?? "",
    stdout: result.stdout ?? "",
  };
}

const DEFAULT_DEPENDENCIES: Halfkp81Depth18LaunchAgentDependencies =
  Object.freeze({
    runLaunchctl: defaultRunLaunchctl,
  });

function assertCanonicalAbsolutePath(value: unknown, field: string): string {
  if (
    typeof value !== "string" ||
    value.length <= 1 ||
    value.includes("\0") ||
    value.includes("\n") ||
    value.includes("\r") ||
    !path.isAbsolute(value) ||
    path.resolve(value) !== value
  ) {
    fail(`${field} must be a normalized absolute path`);
  }
  return value;
}

function assertRealDirectory(value: string, field: string): void {
  let metadata: fs.Stats;
  try {
    metadata = fs.lstatSync(value);
  } catch {
    fail(`${field} is not an existing directory`);
  }
  if (
    !metadata.isDirectory() ||
    metadata.isSymbolicLink() ||
    fs.realpathSync.native(value) !== value
  ) {
    fail(`${field} must be a real, canonical directory`);
  }
}

function assertRealFile(value: string, field: string): void {
  let metadata: fs.Stats;
  try {
    metadata = fs.lstatSync(value);
  } catch {
    fail(`${field} is not an existing file`);
  }
  if (
    !metadata.isFile() ||
    metadata.isSymbolicLink() ||
    metadata.nlink !== 1 ||
    fs.realpathSync.native(value) !== value
  ) {
    fail(`${field} must be one real, canonical file`);
  }
}

function assertExecutableFile(value: string, field: string): void {
  assertRealFile(value, field);
  try {
    fs.accessSync(value, fs.constants.X_OK);
  } catch {
    fail(`${field} must be executable`);
  }
}

function assertAbsent(value: string, field: string): void {
  try {
    fs.lstatSync(value);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    fail(`${field} could not be checked`);
  }
  fail(`${field} must be absent`);
}

function readStableFile(value: string, field: string): Buffer {
  const beforePath = fs.lstatSync(value);
  const noFollow = fs.constants.O_NOFOLLOW ?? 0;
  let descriptor: number | undefined;
  try {
    descriptor = fs.openSync(value, fs.constants.O_RDONLY | noFollow);
    const before = fs.fstatSync(descriptor);
    if (
      !before.isFile() ||
      before.isSymbolicLink() ||
      before.nlink !== 1 ||
      before.dev !== beforePath.dev ||
      before.ino !== beforePath.ino
    ) {
      fail(`${field} changed during safe open`);
    }
    const readAt = (): Buffer => {
      const raw = Buffer.alloc(before.size);
      let offset = 0;
      while (offset < raw.length) {
        const count = fs.readSync(
          descriptor!,
          raw,
          offset,
          raw.length - offset,
          offset,
        );
        if (count < 1) fail(`${field} made no read progress`);
        offset += count;
      }
      return raw;
    };
    const first = readAt();
    const afterFirst = fs.fstatSync(descriptor);
    const second = readAt();
    const afterSecond = fs.fstatSync(descriptor);
    const afterPath = fs.lstatSync(value);
    const signature = (metadata: fs.Stats): string =>
      [
        metadata.dev,
        metadata.ino,
        metadata.size,
        metadata.mtimeMs,
        metadata.ctimeMs,
      ].join(":");
    if (
      signature(before) !== signature(afterFirst) ||
      signature(before) !== signature(afterSecond) ||
      signature(before) !== signature(afterPath) ||
      !first.equals(second)
    ) {
      fail(`${field} changed during stable read`);
    }
    return first;
  } catch (error: unknown) {
    if (error instanceof Halfkp81Depth18LaunchAgentError) throw error;
    return fail(`${field} could not be read safely`);
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

function isInside(parent: string, candidate: string): boolean {
  const relative = path.relative(parent, candidate);
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) && relative !== "..")
  );
}

function assertPrivateDirectory(directory: string, uid: number): void {
  try {
    fs.mkdirSync(directory, {
      mode: PRIVATE_DIRECTORY_MODE,
      recursive: true,
    });
  } catch {
    fail("privateStateDirectory could not be created");
  }
  assertRealDirectory(directory, "privateStateDirectory");
  const metadata = fs.lstatSync(directory);
  if (metadata.uid !== uid || (metadata.mode & 0o077) !== 0) {
    fail("privateStateDirectory must be owned by uid and mode 0700");
  }
}

function validatedSpec(
  spec: Halfkp81Depth18OneShotLaunchAgentSpec,
): ValidatedSpec {
  if (!LABEL_PATTERN.test(spec.label)) {
    fail("label has an invalid launchd service name");
  }
  const uid =
    spec.uid ??
    (typeof process.getuid === "function" ? process.getuid() : undefined);
  if (uid === undefined || !Number.isSafeInteger(uid) || uid < 1) {
    fail("uid must be a positive integer");
  }

  const formalOutputNamespace = assertCanonicalAbsolutePath(
    spec.formalOutputNamespace,
    "formalOutputNamespace",
  );
  const teacherPlanPath = assertCanonicalAbsolutePath(
    spec.teacherPlanPath,
    "teacherPlanPath",
  );
  const privateStateDirectory = assertCanonicalAbsolutePath(
    spec.privateStateDirectory,
    "privateStateDirectory",
  );
  const workingDirectory = assertCanonicalAbsolutePath(
    spec.workingDirectory,
    "workingDirectory",
  );
  const nodePath = assertCanonicalAbsolutePath(spec.nodePath, "nodePath");
  const entrypointPath = assertCanonicalAbsolutePath(
    spec.entrypointPath,
    "entrypointPath",
  );
  const nodePreloadPath =
    spec.nodePreloadPath === undefined
      ? undefined
      : assertCanonicalAbsolutePath(spec.nodePreloadPath, "nodePreloadPath");

  if (
    isInside(formalOutputNamespace, privateStateDirectory) ||
    isInside(privateStateDirectory, formalOutputNamespace)
  ) {
    fail(
      "privateStateDirectory and formalOutputNamespace must be disjoint trees",
    );
  }

  assertRealDirectory(formalOutputNamespace, "formalOutputNamespace");
  const formalDirectoryMetadata = fs.lstatSync(formalOutputNamespace);
  if (
    formalDirectoryMetadata.uid !== uid ||
    (formalDirectoryMetadata.mode & 0o777) !== PRIVATE_DIRECTORY_MODE
  ) {
    fail("formalOutputNamespace must be owned by uid and mode 0700");
  }
  if (
    teacherPlanPath !== path.join(formalOutputNamespace, "teacher-plan.json")
  ) {
    fail("teacherPlanPath must be formalOutputNamespace/teacher-plan.json");
  }
  if (
    !Number.isSafeInteger(spec.teacherPlanBytes) ||
    spec.teacherPlanBytes < 1
  ) {
    fail("teacherPlanBytes must be a positive integer");
  }
  if (!/^[0-9a-f]{64}$/u.test(spec.teacherPlanSha256)) {
    fail("teacherPlanSha256 must be a lowercase SHA-256 digest");
  }
  const entries = fs.readdirSync(formalOutputNamespace);
  if (entries.length !== 1 || entries[0] !== "teacher-plan.json") {
    fail(
      "formalOutputNamespace must contain exactly immutable teacher-plan.json",
    );
  }
  assertRealFile(teacherPlanPath, "teacherPlanPath");
  const teacherPlanMetadata = fs.lstatSync(teacherPlanPath);
  if (
    teacherPlanMetadata.uid !== uid ||
    (teacherPlanMetadata.mode & 0o077) !== 0
  ) {
    fail("teacherPlanPath must be private and owned by uid");
  }
  const teacherPlanRaw = readStableFile(teacherPlanPath, "teacherPlanPath");
  if (
    teacherPlanRaw.length !== spec.teacherPlanBytes ||
    createHash("sha256").update(teacherPlanRaw).digest("hex") !==
      spec.teacherPlanSha256
  ) {
    fail("teacherPlanPath differs from supplied bytes/SHA-256");
  }
  assertRealDirectory(workingDirectory, "workingDirectory");
  assertExecutableFile(nodePath, "nodePath");
  assertRealFile(entrypointPath, "entrypointPath");
  if (nodePreloadPath !== undefined) {
    assertRealFile(nodePreloadPath, "nodePreloadPath");
  }
  assertPrivateDirectory(privateStateDirectory, uid);

  const plistPath = path.join(
    privateStateDirectory,
    `${spec.label}.launch-agent.plist`,
  );
  const stdoutPath = path.join(
    privateStateDirectory,
    `${spec.label}.stdout.log`,
  );
  const stderrPath = path.join(
    privateStateDirectory,
    `${spec.label}.stderr.log`,
  );
  assertAbsent(plistPath, "private plist");
  assertAbsent(stdoutPath, "private stdout");
  assertAbsent(stderrPath, "private stderr");

  return Object.freeze({
    domain: `gui/${uid}`,
    entrypointPath,
    formalOutputNamespace,
    label: spec.label,
    nodePath,
    nodePreloadPath,
    plistPath,
    privateStateDirectory,
    stderrPath,
    stdoutPath,
    teacherPlanBytes: spec.teacherPlanBytes,
    teacherPlanPath,
    teacherPlanSha256: spec.teacherPlanSha256,
    uid,
    workingDirectory,
  });
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

export function buildHalfkp81Depth18OneShotLaunchAgentPlist(
  spec: Readonly<{
    readonly label: string;
    readonly nodePath: string;
    readonly nodePreloadPath?: string;
    readonly entrypointPath: string;
    readonly workingDirectory: string;
    readonly stdoutPath: string;
    readonly stderrPath: string;
  }>,
): string {
  const programArguments = [
    CAFFEINATE,
    "-dimsu",
    spec.nodePath,
    ...(spec.nodePreloadPath === undefined ? [] : ["-r", spec.nodePreloadPath]),
    spec.entrypointPath,
  ];
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    "<dict>",
    "  <key>Label</key>",
    plistString(spec.label),
    "  <key>ProgramArguments</key>",
    "  <array>",
    ...programArguments.map(plistString),
    "  </array>",
    "  <key>WorkingDirectory</key>",
    plistString(spec.workingDirectory),
    "  <key>StandardOutPath</key>",
    plistString(spec.stdoutPath),
    "  <key>StandardErrorPath</key>",
    plistString(spec.stderrPath),
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
  ].join("\n");
}

function runLaunchctl(
  dependencies: Halfkp81Depth18LaunchAgentDependencies,
  arguments_: readonly string[],
): LaunchctlResult {
  let result: LaunchctlResult;
  try {
    result = dependencies.runLaunchctl(Object.freeze([...arguments_]));
  } catch {
    return fail("launchctl execution threw");
  }
  if (
    result.error !== undefined ||
    result.status === null ||
    result.signal !== null
  ) {
    fail("launchctl did not exit normally");
  }
  return result;
}

function serviceIsRecognizablyAbsent(result: LaunchctlResult): boolean {
  return (
    result.status === ABSENT_SERVICE_STATUS &&
    /Could not find service/u.test(`${result.stderr}\n${result.stdout}`)
  );
}

export function getHalfkp81Depth18OneShotLaunchAgentStatus(
  label: string,
  uid = typeof process.getuid === "function" ? process.getuid() : undefined,
  dependencies: Halfkp81Depth18LaunchAgentDependencies = DEFAULT_DEPENDENCIES,
): Halfkp81Depth18LaunchAgentStatus {
  if (!LABEL_PATTERN.test(label)) fail("label has an invalid service name");
  if (uid === undefined || !Number.isSafeInteger(uid) || uid < 1) {
    fail("uid must be a positive integer");
  }
  const domain = `gui/${uid}`;
  const result = runLaunchctl(dependencies, ["print", `${domain}/${label}`]);
  if (result.status === 0) {
    return Object.freeze({
      detail: result.stdout,
      domain,
      label,
      loaded: true,
    });
  }
  if (serviceIsRecognizablyAbsent(result)) {
    return Object.freeze({
      detail: result.stderr,
      domain,
      label,
      loaded: false,
    });
  }
  return fail("launchctl print returned an unrecognized failure");
}

export function bootoutHalfkp81Depth18OneShotLaunchAgent(
  label: string,
  uid = typeof process.getuid === "function" ? process.getuid() : undefined,
  dependencies: Halfkp81Depth18LaunchAgentDependencies = DEFAULT_DEPENDENCIES,
): Halfkp81Depth18LaunchAgentStatus {
  const before = getHalfkp81Depth18OneShotLaunchAgentStatus(
    label,
    uid,
    dependencies,
  );
  if (!before.loaded) fail("refusing bootout because service is not loaded");
  const result = runLaunchctl(dependencies, [
    "bootout",
    `${before.domain}/${label}`,
  ]);
  if (result.status !== 0) fail("launchctl bootout failed");
  const after = getHalfkp81Depth18OneShotLaunchAgentStatus(
    label,
    uid,
    dependencies,
  );
  if (after.loaded) fail("service remained loaded after bootout");
  return after;
}

export function launchHalfkp81Depth18OneShotLaunchAgent(
  spec: Halfkp81Depth18OneShotLaunchAgentSpec,
  dependencies: Halfkp81Depth18LaunchAgentDependencies = DEFAULT_DEPENDENCIES,
): Halfkp81Depth18LaunchAgentReceipt {
  const validated = validatedSpec(spec);
  const before = getHalfkp81Depth18OneShotLaunchAgentStatus(
    validated.label,
    validated.uid,
    dependencies,
  );
  if (before.loaded) fail("refusing to replace an existing launchd service");

  const plist = buildHalfkp81Depth18OneShotLaunchAgentPlist(validated);
  let descriptor: number | undefined;
  try {
    descriptor = fs.openSync(
      validated.plistPath,
      fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY,
      PRIVATE_FILE_MODE,
    );
    fs.writeFileSync(descriptor, plist, "utf8");
    fs.fsyncSync(descriptor);
  } catch {
    fail("private plist could not be written exclusively");
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
  if ((fs.lstatSync(validated.plistPath).mode & 0o777) !== PRIVATE_FILE_MODE) {
    fail("private plist mode is not 0600");
  }

  const bootstrap = runLaunchctl(dependencies, [
    "bootstrap",
    validated.domain,
    validated.plistPath,
  ]);
  if (bootstrap.status !== 0) fail("launchctl bootstrap failed");
  const status = getHalfkp81Depth18OneShotLaunchAgentStatus(
    validated.label,
    validated.uid,
    dependencies,
  );
  if (!status.loaded) fail("service was not loaded after bootstrap");
  return Object.freeze({
    domain: validated.domain,
    label: validated.label,
    plistPath: validated.plistPath,
    stderrPath: validated.stderrPath,
    stdoutPath: validated.stdoutPath,
    status,
  });
}

function parseCliSpec(
  configPath: string,
): Halfkp81Depth18OneShotLaunchAgentSpec {
  const canonical = assertCanonicalAbsolutePath(configPath, "config path");
  assertRealFile(canonical, "config path");
  const parsed: unknown = JSON.parse(fs.readFileSync(canonical, "utf8"));
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    fail("config must be one JSON object");
  }
  const record = parsed as Record<string, unknown>;
  const allowed = new Set([
    "entrypointPath",
    "formalOutputNamespace",
    "label",
    "nodePath",
    "nodePreloadPath",
    "privateStateDirectory",
    "teacherPlanBytes",
    "teacherPlanPath",
    "teacherPlanSha256",
    "uid",
    "workingDirectory",
  ]);
  for (const key of Object.keys(record)) {
    if (!allowed.delete(key)) fail(`unknown config key: ${key}`);
  }
  for (const key of [
    "entrypointPath",
    "formalOutputNamespace",
    "label",
    "nodePath",
    "privateStateDirectory",
    "teacherPlanPath",
    "teacherPlanSha256",
    "workingDirectory",
  ]) {
    if (typeof record[key] !== "string") fail(`missing config key: ${key}`);
  }
  return {
    entrypointPath: record.entrypointPath as string,
    formalOutputNamespace: record.formalOutputNamespace as string,
    label: record.label as string,
    nodePath: record.nodePath as string,
    nodePreloadPath:
      record.nodePreloadPath === undefined
        ? undefined
        : (record.nodePreloadPath as string),
    privateStateDirectory: record.privateStateDirectory as string,
    teacherPlanBytes: record.teacherPlanBytes as number,
    teacherPlanPath: record.teacherPlanPath as string,
    teacherPlanSha256: record.teacherPlanSha256 as string,
    uid: record.uid === undefined ? undefined : (record.uid as number),
    workingDirectory: record.workingDirectory as string,
  };
}

async function main(): Promise<void> {
  const [, , command, configPath] = process.argv;
  if (
    process.argv.length !== 4 ||
    !["bootout", "launch", "status"].includes(command ?? "")
  ) {
    fail(
      "usage: one-shot-launch-agent <launch|status|bootout> /abs/config.json",
    );
  }
  const spec = parseCliSpec(configPath);
  if (command === "launch") {
    process.stdout.write(
      `${JSON.stringify(launchHalfkp81Depth18OneShotLaunchAgent(spec))}\n`,
    );
    return;
  }
  if (command === "status") {
    process.stdout.write(
      `${JSON.stringify(
        getHalfkp81Depth18OneShotLaunchAgentStatus(spec.label, spec.uid),
      )}\n`,
    );
    return;
  }
  process.stdout.write(
    `${JSON.stringify(
      bootoutHalfkp81Depth18OneShotLaunchAgent(spec.label, spec.uid),
    )}\n`,
  );
}

if (typeof require !== "undefined" && require.main === module) {
  void main().catch((error: unknown) => {
    process.stderr.write(
      `[halfkp81-depth18-one-shot-launch-agent] STOP: ${
        error instanceof Error ? error.message : String(error)
      }\n`,
    );
    process.exitCode = 1;
  });
}
