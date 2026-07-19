"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// ml/floodgate-git.ts
function floodgateGitEnvironment(_inherited = process.env) {
  return { ...FLOODGATE_GIT_FIXED_ENVIRONMENT };
}
function floodgateGitTrackedEntriesAreOrdinary(output) {
  if (typeof output !== "string") return false;
  if (output === "") return true;
  if (!output.endsWith("\0")) return false;
  return output.slice(0, -1).split("\0").every((entry) => entry.length > 2 && entry.startsWith("H "));
}
function nulRecords(output, label) {
  if (output === "") return [];
  if (!output.endsWith("\0")) {
    throw new Error(`invalid Floodgate Git ${label}: missing NUL framing`);
  }
  return output.slice(0, -1).split("\0");
}
function parseHeadTree(output) {
  return nulRecords(output, "HEAD tree").map((record) => {
    const tab = record.indexOf("	");
    const header = tab < 0 ? [] : record.slice(0, tab).split(/ +/u);
    const entryPath = tab < 0 ? "" : record.slice(tab + 1);
    const bytes = header.length === 4 ? Number(header[3]) : Number.NaN;
    if (header.length !== 4 || header[1] !== "blob" || header[0] !== "100644" && header[0] !== "100755" && header[0] !== "120000" || !/^[0-9a-f]+$/.test(header[2]) || !/^(?:0|[1-9][0-9]*)$/u.test(header[3] ?? "") || !Number.isSafeInteger(bytes) || entryPath.length === 0 || path2.isAbsolute(entryPath) || path2.normalize(entryPath) !== entryPath || entryPath.split("/").some((part) => part === "" || part === "..")) {
      throw new Error("invalid Floodgate Git HEAD tree entry");
    }
    return Object.freeze({
      mode: header[0],
      object: header[2],
      bytes,
      path: entryPath
    });
  });
}
function parseIndex(output) {
  const entries = /* @__PURE__ */ new Map();
  for (const record of nulRecords(output, "index")) {
    const tab = record.indexOf("	");
    const header = tab < 0 ? [] : record.slice(0, tab).split(" ");
    const entryPath = tab < 0 ? "" : record.slice(tab + 1);
    if (header.length !== 3 || header[2] !== "0" || !/^(?:100644|100755|120000)$/.test(header[0]) || !/^[0-9a-f]+$/.test(header[1]) || entryPath.length === 0 || entries.has(entryPath)) {
      throw new Error("invalid Floodgate Git index entry");
    }
    entries.set(entryPath, `${header[0]} ${header[1]}`);
  }
  return entries;
}
function gitBlobId(bytes, algorithm) {
  return (0, import_node_crypto.createHash)(algorithm).update(`blob ${bytes.byteLength}\0`, "utf8").update(bytes).digest("hex");
}
function sameStat(left, right) {
  return left.dev === right.dev && left.ino === right.ino && left.mode === right.mode && left.size === right.size && left.ctimeNs === right.ctimeNs && left.mtimeNs === right.mtimeNs && left.nlink === right.nlink;
}
function readExactTrackedBytes(descriptor, expectedBytes, entryPath) {
  const bytes = new Uint8Array(expectedBytes);
  let offset = 0;
  while (offset < bytes.byteLength) {
    const count = fs2.readSync(
      descriptor,
      bytes,
      offset,
      bytes.byteLength - offset,
      null
    );
    if (count === 0) {
      throw new Error(`tracked file shortened while reading: ${entryPath}`);
    }
    offset += count;
  }
  const extra = new Uint8Array(1);
  if (fs2.readSync(descriptor, extra, 0, 1, null) !== 0) {
    throw new Error(`tracked file grew while reading: ${entryPath}`);
  }
  return bytes;
}
function readTrackedBlob(repositoryRoot, entry) {
  const filePath = path2.join(repositoryRoot, entry.path);
  if (entry.mode === "120000") {
    const parent = path2.dirname(filePath);
    if (fs2.realpathSync.native(parent) !== parent) {
      throw new Error(`tracked symlink parent is not canonical: ${entry.path}`);
    }
    const before = fs2.lstatSync(filePath, { bigint: true });
    if (!before.isSymbolicLink()) {
      throw new Error(
        `tracked path is not the recorded symlink: ${entry.path}`
      );
    }
    const bytes = fs2.readlinkSync(filePath, { encoding: "buffer" });
    const after = fs2.lstatSync(filePath, { bigint: true });
    if (before.size !== BigInt(entry.bytes) || !sameStat(before, after) || BigInt(bytes.byteLength) !== after.size) {
      throw new Error(`tracked symlink changed while hashing: ${entry.path}`);
    }
    return new Uint8Array(bytes);
  }
  if (fs2.realpathSync.native(filePath) !== filePath) {
    throw new Error(`tracked file traverses a symbolic link: ${entry.path}`);
  }
  const noFollow = fs2.constants.O_NOFOLLOW;
  const nonblock = fs2.constants.O_NONBLOCK;
  if (typeof noFollow !== "number" || typeof nonblock !== "number") {
    throw new Error(
      "Floodgate Git verification requires O_NOFOLLOW/O_NONBLOCK"
    );
  }
  const fd = fs2.openSync(filePath, fs2.constants.O_RDONLY | noFollow | nonblock);
  try {
    const before = fs2.fstatSync(fd, { bigint: true });
    if (!before.isFile()) {
      throw new Error(`tracked path is not a regular file: ${entry.path}`);
    }
    const executable = (before.mode & BigInt(73)) !== BigInt(0);
    if (entry.mode === "100755" !== executable) {
      throw new Error(`tracked executable mode changed: ${entry.path}`);
    }
    if (before.size !== BigInt(entry.bytes)) {
      throw new Error(`tracked file size differs from HEAD: ${entry.path}`);
    }
    const bytes = readExactTrackedBytes(fd, entry.bytes, entry.path);
    const after = fs2.fstatSync(fd, { bigint: true });
    const pathAfter = fs2.lstatSync(filePath, { bigint: true });
    if (!sameStat(before, after) || !sameStat(after, pathAfter) || BigInt(bytes.byteLength) !== after.size || fs2.realpathSync.native(filePath) !== filePath) {
      throw new Error(`tracked file changed while hashing: ${entry.path}`);
    }
    return new Uint8Array(bytes);
  } finally {
    fs2.closeSync(fd);
  }
}
async function fixedGitOutput(repositoryRoot, arguments_) {
  const { stdout } = await execFile(
    FLOODGATE_GIT_EXECUTABLE,
    [...FLOODGATE_GIT_COMMAND_PREFIX, ...arguments_],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: floodgateGitEnvironment(),
      maxBuffer: 64 * 1024 * 1024
    }
  );
  return stdout;
}
function assertFloodgateCanonicalRepositoryRoot(repositoryRoot) {
  if (typeof repositoryRoot !== "string" || repositoryRoot.length === 0 || repositoryRoot.includes("\0") || repositoryRoot.includes("\n") || repositoryRoot.includes("\r") || !path2.isAbsolute(repositoryRoot) || path2.normalize(repositoryRoot) !== repositoryRoot) {
    throw new Error(
      "Floodgate Git repository root must be a canonical absolute path"
    );
  }
  const before = fs2.lstatSync(repositoryRoot, { bigint: true });
  if (!before.isDirectory() || before.isSymbolicLink()) {
    throw new Error("Floodgate Git repository root must be a real directory");
  }
  if (fs2.realpathSync.native(repositoryRoot) !== repositoryRoot) {
    throw new Error(
      "Floodgate Git repository root must not traverse symbolic links"
    );
  }
  const after = fs2.lstatSync(repositoryRoot, { bigint: true });
  if (!sameStat(before, after)) {
    throw new Error(
      "Floodgate Git repository root changed during canonicalization"
    );
  }
  return after;
}
function parseFloodgateGitLine(output, label) {
  if (typeof output !== "string" || !output.endsWith("\n") || output.length <= 1 || output.slice(0, -1).includes("\n") || output.includes("\r") || output.includes("\0")) {
    throw new Error(`invalid Floodgate Git ${label} output`);
  }
  return output.slice(0, -1);
}
async function captureFloodgateGitCleanRevisionContext(repositoryRoot, expectedRevision) {
  const before = assertFloodgateCanonicalRepositoryRoot(repositoryRoot);
  const [topLevelOutput, headOutput, status, trackedFlags] = await Promise.all([
    fixedGitOutput(repositoryRoot, ["rev-parse", "--show-toplevel"]),
    fixedGitOutput(repositoryRoot, ["rev-parse", "--verify", "HEAD^{commit}"]),
    fixedGitOutput(repositoryRoot, [
      "status",
      "--porcelain=v1",
      "-z",
      "--untracked-files=all"
    ]),
    fixedGitOutput(repositoryRoot, ["ls-files", "-v", "-z"])
  ]);
  const after = assertFloodgateCanonicalRepositoryRoot(repositoryRoot);
  if (!sameStat(before, after)) {
    throw new Error(
      "Floodgate Git repository root changed during context verification"
    );
  }
  const topLevel = parseFloodgateGitLine(topLevelOutput, "top-level");
  if (topLevel !== repositoryRoot) {
    throw new Error(
      "Floodgate Git repository root must be the exact worktree top-level"
    );
  }
  const head = parseFloodgateGitLine(headOutput, "HEAD revision");
  if (!FLOODGATE_FULL_GIT_OBJECT_ID.test(head)) {
    throw new Error("invalid Floodgate Git HEAD revision");
  }
  if (expectedRevision !== void 0 && head !== expectedRevision) {
    throw new Error("Floodgate Git HEAD is not the expected exact revision");
  }
  if (status !== "") {
    throw new Error(
      "Floodgate Git worktree and index must be clean, including non-ignored untracked files"
    );
  }
  if (!floodgateGitTrackedEntriesAreOrdinary(trackedFlags)) {
    throw new Error("Floodgate Git index contains special tracked flags");
  }
  return Object.freeze({
    repositoryStat: after,
    topLevel,
    head,
    status,
    trackedFlags
  });
}
async function assertFloodgateGitTrackedTreeMatchesHead(repositoryRoot) {
  const [objectFormatText, headTree, index] = await Promise.all([
    fixedGitOutput(repositoryRoot, ["rev-parse", "--show-object-format"]),
    fixedGitOutput(repositoryRoot, [
      "ls-tree",
      "-r",
      "-l",
      "-z",
      "--full-tree",
      "HEAD"
    ]),
    fixedGitOutput(repositoryRoot, ["ls-files", "-s", "-z"])
  ]);
  const objectFormat = objectFormatText.trim();
  if (objectFormat !== "sha1" && objectFormat !== "sha256") {
    throw new Error("invalid Floodgate Git object format");
  }
  const treeEntries = parseHeadTree(headTree);
  const indexEntries = parseIndex(index);
  if (treeEntries.length !== indexEntries.size) {
    throw new Error("Floodgate Git index does not match the HEAD tree");
  }
  for (const entry of treeEntries) {
    if (indexEntries.get(entry.path) !== `${entry.mode} ${entry.object}`) {
      throw new Error(`Floodgate Git index differs from HEAD: ${entry.path}`);
    }
    const bytes = readTrackedBlob(repositoryRoot, entry);
    if (gitBlobId(bytes, objectFormat) !== entry.object) {
      throw new Error(
        `Floodgate tracked bytes differ from HEAD: ${entry.path}`
      );
    }
  }
  const [finalHeadTree, finalIndex] = await Promise.all([
    fixedGitOutput(repositoryRoot, [
      "ls-tree",
      "-r",
      "-l",
      "-z",
      "--full-tree",
      "HEAD"
    ]),
    fixedGitOutput(repositoryRoot, ["ls-files", "-s", "-z"])
  ]);
  if (finalHeadTree !== headTree || finalIndex !== index) {
    throw new Error(
      "Floodgate Git HEAD/index changed during byte verification"
    );
  }
}
async function assertFloodgateGitExactCleanRevision(repositoryRoot, expectedRevision) {
  if (typeof expectedRevision !== "string" || !FLOODGATE_FULL_GIT_OBJECT_ID.test(expectedRevision)) {
    throw new Error(
      "Floodgate Git expected revision must be a full lowercase object ID"
    );
  }
  const revision = await captureFloodgateGitExactCleanRevisionContext(
    repositoryRoot,
    expectedRevision
  );
  if (revision !== expectedRevision) {
    throw new Error("Floodgate Git HEAD is not the expected exact revision");
  }
}
async function captureFloodgateGitExactCleanRevisionContext(repositoryRoot, expectedRevision) {
  const initial = await captureFloodgateGitCleanRevisionContext(
    repositoryRoot,
    expectedRevision
  );
  await assertFloodgateGitTrackedTreeMatchesHead(repositoryRoot);
  const final = await captureFloodgateGitCleanRevisionContext(
    repositoryRoot,
    initial.head
  );
  if (!sameStat(initial.repositoryStat, final.repositoryStat) || initial.topLevel !== final.topLevel || initial.head !== final.head || initial.status !== final.status || initial.trackedFlags !== final.trackedFlags) {
    throw new Error(
      "Floodgate Git repository context changed during exact revision verification"
    );
  }
  return initial.head;
}
async function captureFloodgateGitExactCleanRevision(repositoryRoot) {
  return captureFloodgateGitExactCleanRevisionContext(repositoryRoot);
}
var import_node_child_process2, import_node_crypto, fs2, path2, import_node_util2, execFile, FLOODGATE_GIT_EXECUTABLE, FLOODGATE_GIT_FIXED_ENVIRONMENT, FLOODGATE_GIT_COMMAND_PREFIX, FLOODGATE_FULL_GIT_OBJECT_ID;
var init_floodgate_git = __esm({
  "ml/floodgate-git.ts"() {
    "use strict";
    import_node_child_process2 = require("node:child_process");
    import_node_crypto = require("node:crypto");
    fs2 = __toESM(require("node:fs"));
    path2 = __toESM(require("node:path"));
    import_node_util2 = require("node:util");
    execFile = (0, import_node_util2.promisify)(import_node_child_process2.execFile);
    FLOODGATE_GIT_EXECUTABLE = "/usr/bin/git";
    FLOODGATE_GIT_FIXED_ENVIRONMENT = Object.freeze({
      NODE_ENV: "production",
      PATH: "/usr/bin:/bin",
      TMPDIR: "/tmp",
      HOME: "/var/empty",
      TZ: "UTC",
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_SYSTEM: "/dev/null",
      GIT_GRAFT_FILE: "/dev/null",
      GIT_OPTIONAL_LOCKS: "0",
      GIT_TERMINAL_PROMPT: "0",
      LC_ALL: "C",
      LANG: "C"
    });
    FLOODGATE_GIT_COMMAND_PREFIX = Object.freeze([
      "--no-replace-objects",
      "--no-optional-locks",
      "-c",
      "core.fsmonitor=false",
      "-c",
      "core.untrackedCache=false",
      "-c",
      "core.preloadIndex=false",
      "-c",
      "core.ignoreStat=false",
      "-c",
      "core.trustctime=true",
      "-c",
      "core.checkStat=default"
    ]);
    FLOODGATE_FULL_GIT_OBJECT_ID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
  }
});

// ml/floodgate-stable-wasm-deadline-diagnostic-source-provenance.ts
function fail2() {
  throw new FloodgateStableWasmDeadlineDiagnosticSourceProvenanceError();
}
function rejected() {
  return new nativePromise((_resolve, reject) => reject(fail2()));
}
function canonicalAbsolutePath2(value) {
  return typeof value === "string" && value.length > 1 && !value.includes("\0") && !value.includes("\n") && !value.includes("\r") && path3.isAbsolute(value) && path3.resolve(value) === value;
}
function sameStat2(left, right) {
  return left.dev === right.dev && left.ino === right.ino && left.mode === right.mode && left.nlink === right.nlink && left.uid === right.uid && left.gid === right.gid && left.size === right.size && left.mtimeNs === right.mtimeNs && left.ctimeNs === right.ctimeNs;
}
function assertStableDirectory(value) {
  const before = fs3.lstatSync(value, { bigint: true });
  if (!before.isDirectory() || before.isSymbolicLink() || realpathSync4(value) !== value) {
    fail2();
  }
  const after = fs3.lstatSync(value, { bigint: true });
  if (!sameStat2(before, after)) fail2();
}
function sourceRoot(homeDirectory) {
  if (!canonicalAbsolutePath2(homeDirectory)) fail2();
  const root = path3.join(homeDirectory, ...DIAGNOSTIC_ROOT_COMPONENTS);
  if (!canonicalAbsolutePath2(root) || root === homeDirectory) fail2();
  assertStableDirectory(root);
  return root;
}
function productionHome() {
  if (getEffectiveUserId === null) fail2();
  const effectiveUserId = getEffectiveUserId();
  const user = getUserInfo();
  if (!Number.isSafeInteger(effectiveUserId) || effectiveUserId <= 0 || user.uid !== effectiveUserId || !canonicalAbsolutePath2(user.homedir)) {
    fail2();
  }
  return user.homedir;
}
function exactPlainRecord(value, expectedKeys) {
  if (value === null || typeof value !== "object" || import_node_util3.types.isProxy(value) || Object.getPrototypeOf(value) !== objectPrototype) {
    fail2();
  }
  const descriptors = Object.getOwnPropertyDescriptors(
    value
  );
  const keys = Reflect.ownKeys(descriptors);
  if (keys.length !== expectedKeys.length || keys.some((key) => typeof key !== "string" || !expectedKeys.includes(key))) {
    fail2();
  }
  const captured = /* @__PURE__ */ Object.create(null);
  for (const key of expectedKeys) {
    const descriptor = descriptors[key];
    if (descriptor === void 0 || !("value" in descriptor) || descriptor.enumerable !== true) {
      fail2();
    }
    Object.defineProperty(captured, key, {
      configurable: false,
      enumerable: true,
      writable: false,
      value: descriptor.value
    });
  }
  return Object.freeze(captured);
}
function exactStringArray(value) {
  if (!Array.isArray(value) || import_node_util3.types.isProxy(value) || Object.getPrototypeOf(value) !== arrayPrototype2) {
    fail2();
  }
  const descriptors = Object.getOwnPropertyDescriptors(
    value
  );
  const lengthDescriptor = descriptors.length;
  const length = lengthDescriptor !== void 0 && "value" in lengthDescriptor ? lengthDescriptor.value : null;
  if (!Number.isSafeInteger(length) || length < 0 || Reflect.ownKeys(descriptors).length !== length + 1) {
    fail2();
  }
  const output = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (descriptor === void 0 || !("value" in descriptor) || descriptor.enumerable !== true || typeof descriptor.value !== "string") {
      fail2();
    }
    output.push(descriptor.value);
  }
  return Object.freeze(output);
}
function captureDependencies(value) {
  const record = exactPlainRecord(value, [
    "captureExactCleanRevision",
    "homeDirectory"
  ]);
  const capture = record.captureExactCleanRevision;
  const homeDirectory = record.homeDirectory;
  if (typeof capture !== "function" || import_node_util3.types.isProxy(capture) || !canonicalAbsolutePath2(homeDirectory)) {
    fail2();
  }
  return Object.freeze({
    captureExactCleanRevision: capture,
    homeDirectory
  });
}
async function captureSource(dependencies) {
  try {
    const repositoryRoot = sourceRoot(dependencies.homeDirectory);
    const revision = await dependencies.captureExactCleanRevision(repositoryRoot);
    if (typeof revision !== "string" || FULL_GIT_REVISION.exec(revision) === null) {
      fail2();
    }
    return Object.freeze({
      layout: FLOODGATE_STABLE_WASM_DEADLINE_DIAGNOSTIC_SOURCE_LAYOUT,
      revision
    });
  } catch {
    fail2();
  }
}
function captureContext(value) {
  const record = exactPlainRecord(value, [
    "argv",
    "cwd",
    "execArgv",
    "homeDirectory",
    "mainFilename"
  ]);
  const argv = exactStringArray(record.argv);
  const execArgv = exactStringArray(record.execArgv);
  const cwd = record.cwd;
  const homeDirectory = record.homeDirectory;
  const mainFilename = record.mainFilename;
  if (!canonicalAbsolutePath2(cwd) || !canonicalAbsolutePath2(homeDirectory) || mainFilename !== null && !canonicalAbsolutePath2(mainFilename)) {
    fail2();
  }
  return Object.freeze({
    argv,
    cwd,
    execArgv,
    homeDirectory,
    mainFilename
  });
}
function expectedEntrypoint(repositoryRoot, relativeEntrypoint) {
  if (typeof relativeEntrypoint !== "string" || relativeEntrypoint.length === 0 || path3.isAbsolute(relativeEntrypoint) || path3.normalize(relativeEntrypoint) !== relativeEntrypoint || !relativeEntrypoint.startsWith(`ml${path3.sep}`) || !relativeEntrypoint.endsWith(".cjs") || relativeEntrypoint.split(path3.sep).some((component) => ["", ".", ".."].includes(component))) {
    fail2();
  }
  const entrypoint = path3.join(repositoryRoot, relativeEntrypoint);
  if (!canonicalAbsolutePath2(entrypoint)) fail2();
  const before = fs3.lstatSync(entrypoint, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink() || realpathSync4(entrypoint) !== entrypoint) {
    fail2();
  }
  const after = fs3.lstatSync(entrypoint, { bigint: true });
  if (!sameStat2(before, after)) fail2();
  return entrypoint;
}
function assertContext(relativeEntrypoint, context) {
  const repositoryRoot = sourceRoot(context.homeDirectory);
  const entrypoint = expectedEntrypoint(repositoryRoot, relativeEntrypoint);
  if (context.cwd !== repositoryRoot || context.argv.length !== 2 || context.argv[1] !== entrypoint || context.mainFilename !== entrypoint || context.execArgv.length !== REQUIRED_EXEC_ARGV.length || context.execArgv.some(
    (argument, index) => argument !== REQUIRED_EXEC_ARGV[index]
  )) {
    fail2();
  }
}
function captureFloodgateStableWasmDeadlineDiagnosticSourceProvenance() {
  if (arguments.length !== 0) return rejected();
  try {
    return captureSource(
      captureDependencies({
        captureExactCleanRevision,
        homeDirectory: productionHome()
      })
    );
  } catch {
    return rejected();
  }
}
function assertFloodgateStableWasmDeadlineDiagnosticEntrypointContext(relativeEntrypoint) {
  if (arguments.length !== 1) fail2();
  try {
    assertContext(
      relativeEntrypoint,
      captureContext({
        argv: process.argv,
        cwd: getCurrentWorkingDirectory(),
        execArgv: process.execArgv,
        homeDirectory: productionHome(),
        mainFilename: require.main?.filename ?? null
      })
    );
  } catch {
    fail2();
  }
}
var fs3, os2, path3, import_node_util3, FLOODGATE_STABLE_WASM_DEADLINE_DIAGNOSTIC_SOURCE_LAYOUT, FloodgateStableWasmDeadlineDiagnosticSourceProvenanceError, DIAGNOSTIC_ROOT_COMPONENTS, REQUIRED_EXEC_ARGV, FULL_GIT_REVISION, objectPrototype, arrayPrototype2, nativePromise, captureExactCleanRevision, getEffectiveUserId, getUserInfo, getCurrentWorkingDirectory, realpathSync4;
var init_floodgate_stable_wasm_deadline_diagnostic_source_provenance = __esm({
  "ml/floodgate-stable-wasm-deadline-diagnostic-source-provenance.ts"() {
    "use strict";
    fs3 = __toESM(require("node:fs"));
    os2 = __toESM(require("node:os"));
    path3 = __toESM(require("node:path"));
    import_node_util3 = require("node:util");
    init_floodgate_git();
    FLOODGATE_STABLE_WASM_DEADLINE_DIAGNOSTIC_SOURCE_LAYOUT = "fixed-current-euid-userinfo-home-stable-deadline-diagnostic-application-v1";
    FloodgateStableWasmDeadlineDiagnosticSourceProvenanceError = class extends Error {
      constructor() {
        super("Floodgate stable-WASM deadline diagnostic source closure failed");
        this.name = "FloodgateStableWasmDeadlineDiagnosticSourceProvenanceError";
        Object.defineProperty(this, "stack", {
          configurable: false,
          enumerable: false,
          writable: false,
          value: "FloodgateStableWasmDeadlineDiagnosticSourceProvenanceError: source closure failed"
        });
        Object.freeze(this);
      }
    };
    DIAGNOSTIC_ROOT_COMPONENTS = Object.freeze([
      ".codex",
      "worktrees",
      "shogi-floodgate-stable-deadline-diagnostic-application"
    ]);
    REQUIRED_EXEC_ARGV = Object.freeze([]);
    FULL_GIT_REVISION = /^[0-9a-f]{40}$/u;
    objectPrototype = Object.prototype;
    arrayPrototype2 = Array.prototype;
    nativePromise = Promise;
    captureExactCleanRevision = captureFloodgateGitExactCleanRevision;
    getEffectiveUserId = typeof process.geteuid === "function" ? process.geteuid.bind(process) : null;
    getUserInfo = os2.userInfo.bind(os2);
    getCurrentWorkingDirectory = process.cwd.bind(process);
    realpathSync4 = fs3.realpathSync.native.bind(fs3.realpathSync);
  }
});

// ml/floodgate-stable-wasm-deadline-diagnostic.ts
function fail3(message) {
  throw new Error(message);
}
function sha256(bytes) {
  return (0, import_node_crypto2.createHash)("sha256").update(bytes).digest("hex");
}
function snapshotBytes(value, label) {
  if (!(value instanceof Uint8Array)) fail3(`${label} must be a Uint8Array`);
  return Buffer.from(value.slice());
}
function assertIdentity(bytes, identity, label) {
  if (bytes.byteLength !== identity.bytes || sha256(bytes) !== identity.sha256) {
    fail3(`${label} does not match its fixed identity`);
  }
}
function captureAssets(assets, workerIdentity) {
  if (assets === null || typeof assets !== "object" || Array.isArray(assets)) {
    fail3("diagnostic assets must be an object");
  }
  const wasmBytes = snapshotBytes(assets.wasmBytes, "WASM bytes");
  const weightsBytes = snapshotBytes(assets.weightsBytes, "weights bytes");
  const workerSourceBytes = snapshotBytes(
    assets.workerSourceBytes,
    "worker source bytes"
  );
  assertIdentity(
    wasmBytes,
    FLOODGATE_STABLE_WASM_DIAGNOSTIC_WASM_IDENTITY,
    "WASM bytes"
  );
  assertIdentity(
    weightsBytes,
    FLOODGATE_STABLE_WASM_DIAGNOSTIC_WEIGHTS_IDENTITY,
    "weights bytes"
  );
  assertIdentity(workerSourceBytes, workerIdentity, "worker source bytes");
  return Object.freeze({ wasmBytes, weightsBytes, workerSourceBytes });
}
function captureInteger(value, minimum, maximum, label) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    fail3(`${label} is outside its permitted integer range`);
  }
  return value;
}
function pieceSide(koma) {
  if ((koma & SENTE) !== 0) return SENTE;
  if ((koma & GOTE) !== 0) return GOTE;
  return 0;
}
function basePieceKind(koma) {
  const kind = koma & 15;
  return kind >= 9 ? kind - 8 : kind;
}
function captureInput(input) {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    fail3("diagnostic input must be an object");
  }
  if (!Array.isArray(input.board) || input.board.length !== 81) {
    fail3("diagnostic board must contain exactly 81 squares");
  }
  if (!Array.isArray(input.hands) || input.hands.length !== 23) {
    fail3("diagnostic hands must contain exactly 23 slots");
  }
  const materialByKind = Array.from({ length: 9 }, () => 0);
  let senteKings = 0;
  let goteKings = 0;
  const board = Object.freeze(
    input.board.map((value, index) => {
      const koma = captureInteger(
        value,
        0,
        47,
        `diagnostic board square ${index}`
      );
      if (!VALID_BOARD_PIECES.includes(koma)) {
        fail3(`diagnostic board square ${index} contains an invalid piece`);
      }
      if (koma === 24) senteKings += 1;
      if (koma === 40) goteKings += 1;
      if (koma !== 0) materialByKind[basePieceKind(koma)] += 1;
      return koma;
    })
  );
  if (senteKings !== 1 || goteKings !== 1) {
    fail3("diagnostic board must contain exactly one king for each side");
  }
  const hands = Object.freeze(
    input.hands.map((value, index) => {
      const count = captureInteger(value, 0, 18, `diagnostic hands[${index}]`);
      const koma = FIRST_HAND_KOMA + index;
      const kind = koma & 15;
      const droppable = (pieceSide(koma) === SENTE || pieceSide(koma) === GOTE) && kind >= 1 && kind <= 7;
      if (!droppable && count !== 0) {
        fail3(`diagnostic hands[${index}] is not a droppable-piece slot`);
      }
      if (count !== 0) materialByKind[kind] += count;
      return count;
    })
  );
  for (let kind = 1; kind < MATERIAL_LIMIT_BY_KIND.length; kind += 1) {
    if (materialByKind[kind] > MATERIAL_LIMIT_BY_KIND[kind]) {
      fail3(`diagnostic position exceeds the material limit for kind ${kind}`);
    }
  }
  if (input.sideToMove !== 16 && input.sideToMove !== 32) {
    fail3("diagnostic side to move is invalid");
  }
  return Object.freeze({
    board,
    hands,
    side_to_move: input.sideToMove,
    root_tesu: captureInteger(
      input.rootTesu,
      0,
      2147483647,
      "diagnostic root tesu"
    )
  });
}
function captureInputs(inputs) {
  if (!Array.isArray(inputs) || inputs.length < 1 || inputs.length > FLOODGATE_STABLE_WASM_DIAGNOSTIC_MAX_REQUESTS) {
    fail3("diagnostic input count must be between 1 and 12");
  }
  return Object.freeze(inputs.map((input) => captureInput(input)));
}
function captureOptions(options) {
  if (options === null || typeof options !== "object" || Array.isArray(options)) {
    fail3("diagnostic test options must be an object");
  }
  const cooperativeDeadlineMilliseconds = captureInteger(
    options.cooperativeDeadlineMilliseconds ?? FLOODGATE_STABLE_WASM_DIAGNOSTIC_COOPERATIVE_DEADLINE_MS,
    1,
    FLOODGATE_STABLE_WASM_DIAGNOSTIC_COOPERATIVE_DEADLINE_MS,
    "cooperative deadline"
  );
  const outerWatchdogMilliseconds = captureInteger(
    options.outerWatchdogMilliseconds ?? FLOODGATE_STABLE_WASM_DIAGNOSTIC_OUTER_WATCHDOG_MS,
    cooperativeDeadlineMilliseconds + 1,
    FLOODGATE_STABLE_WASM_DIAGNOSTIC_OUTER_WATCHDOG_MS,
    "outer watchdog"
  );
  const childExecutablePath = options.testOnlyChildExecutablePath ?? process.execPath;
  const shouldStop = options.shouldStop ?? NEVER_STOP;
  if (typeof childExecutablePath !== "string" || !(0, import_node_path.isAbsolute)(childExecutablePath) || childExecutablePath.length > 4096 || /[\u0000-\u001f\u007f]/u.test(childExecutablePath) || typeof shouldStop !== "function") {
    fail3("diagnostic test child executable path is invalid");
  }
  return Object.freeze({
    cooperativeDeadlineMilliseconds,
    outerWatchdogMilliseconds,
    childExecutablePath,
    shouldStop
  });
}
function stopRequested(shouldStop) {
  try {
    const result = shouldStop();
    return typeof result !== "boolean" || result;
  } catch {
    return true;
  }
}
function canonicalJson(value) {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) {
      fail3("canonical JSON rejects nonfinite numbers and negative zero");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value;
    const keys = Object.keys(record).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
  }
  fail3(`canonical JSON rejects ${typeof value}`);
}
function isCounterBucket(value) {
  return typeof value === "string" && COUNTER_BUCKETS.includes(value);
}
function isDiagnosticPhase(value) {
  return typeof value === "string" && PHASES.includes(value);
}
function exactKeys(value, expected) {
  const keys = Object.keys(value);
  return keys.length === expected.length && keys.every((key, index) => key === expected[index]);
}
function parseWorkerMessage(stdout, mode) {
  if (stdout.byteLength < 2 || stdout[stdout.length - 1] !== 10 || stdout.subarray(0, stdout.length - 1).includes(10)) {
    return null;
  }
  const line = stdout.subarray(0, stdout.length - 1).toString("ascii");
  let parsed;
  try {
    parsed = JSON.parse(line);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed) || canonicalJson(parsed) !== line) {
    return null;
  }
  const message = parsed;
  if (message.schema !== FLOODGATE_STABLE_WASM_DEADLINE_DIAGNOSTIC_WORKER_SCHEMA) {
    return null;
  }
  if (mode === "parity") {
    if (!exactKeys(message, [
      "compared_field_count",
      "exact",
      "schema",
      "type"
    ]) || message.type !== "parity" || message.compared_field_count !== 5 || typeof message.exact !== "boolean") {
      return null;
    }
    return message;
  }
  if (!exactKeys(message, [
    "adopted",
    "completed_depth",
    "leaves_bucket",
    "nodes_bucket",
    "outcome",
    "phase",
    "schema",
    "type"
  ]) || message.type !== "result" || message.adopted !== false || message.outcome !== "complete" && message.outcome !== "deadline" || !Number.isSafeInteger(message.completed_depth) || message.completed_depth < 0 || message.completed_depth > FLOODGATE_STABLE_WASM_DIAGNOSTIC_REQUESTED_DEPTH || !isCounterBucket(message.nodes_bucket) || !isCounterBucket(message.leaves_bucket) || !isDiagnosticPhase(message.phase)) {
    return null;
  }
  const completedDepth = message.completed_depth;
  const expectedPhase = message.outcome === "deadline" ? `cooperative-deadline-after-completed-depth-${completedDepth}` : completedDepth === FLOODGATE_STABLE_WASM_DIAGNOSTIC_REQUESTED_DEPTH ? "requested-depth-complete" : "winning-mate-early";
  if (message.phase !== expectedPhase) return null;
  return message;
}
function workerEnvironment() {
  const environment = {
    NODE_ENV: process.env.NODE_ENV ?? "test"
  };
  if (process.platform !== "win32") return Object.freeze(environment);
  if (process.env.SystemRoot !== void 0) {
    environment.SystemRoot = process.env.SystemRoot;
  }
  if (process.env.SystemDrive !== void 0) {
    environment.SystemDrive = process.env.SystemDrive;
  }
  return Object.freeze(environment);
}
function workerCwd() {
  if (process.platform !== "win32") return "/";
  const drive = process.env.SystemDrive;
  return drive === void 0 ? "C:\\" : `${drive}\\`;
}
function createWorkerInputLine(input, assets, cooperativeDeadlineMilliseconds, mode) {
  return `${canonicalJson({
    board: input.board,
    cooperative_deadline_ms: cooperativeDeadlineMilliseconds,
    hands: input.hands,
    mode,
    root_tesu: input.root_tesu,
    schema: FLOODGATE_STABLE_WASM_DEADLINE_DIAGNOSTIC_WORKER_SCHEMA,
    side_to_move: input.side_to_move,
    wasm_base64: assets.wasmBytes.toString("base64"),
    weights_base64: assets.weightsBytes.toString("base64")
  })}
`;
}
function safeFailure() {
  return Object.freeze({
    outcome: "failure",
    phase: "failure",
    completedDepth: null,
    nodesBucket: null,
    leavesBucket: null
  });
}
function runOneChild(input, assets, options, mode, lifecycle) {
  if (stopRequested(options.shouldStop)) {
    return Promise.resolve(mode === "diagnostic" ? safeFailure() : null);
  }
  return new Promise((resolve8) => {
    let child;
    try {
      child = (0, import_node_child_process3.spawn)(
        options.childExecutablePath,
        ["--input-type=module", "--eval", WORKER_BOOTSTRAP_SOURCE],
        {
          cwd: workerCwd(),
          env: workerEnvironment(),
          shell: false,
          stdio: ["pipe", "pipe", "pipe", "pipe"]
        }
      );
    } catch {
      resolve8(mode === "diagnostic" ? safeFailure() : null);
      return;
    }
    let lifecycleSpawned = false;
    child.once("spawn", () => {
      lifecycleSpawned = true;
      lifecycle?.onSpawn();
    });
    const stdoutPieces = [];
    let stdoutBytes = 0;
    let invalid = false;
    let stopped = false;
    let watchdog = false;
    let settled = false;
    const killOnlyThisChild = () => {
      try {
        child.kill("SIGKILL");
      } catch {
      }
    };
    const markInvalid = () => {
      invalid = true;
      killOnlyThisChild();
    };
    const stopPoll = setInterval(() => {
      if (!stopRequested(options.shouldStop)) return;
      stopped = true;
      killOnlyThisChild();
    }, STOP_POLL_MILLISECONDS);
    const timer = setTimeout(() => {
      watchdog = true;
      killOnlyThisChild();
    }, options.outerWatchdogMilliseconds);
    const stdin = child.stdin;
    const stdout = child.stdout;
    const stderr = child.stderr;
    if (stdin === null || stdout === null || stderr === null) {
      markInvalid();
    } else {
      stdout.on("data", (chunk) => {
        if (invalid || watchdog) return;
        if (chunk.byteLength > MAX_WORKER_STDOUT_BYTES - stdoutBytes || chunk.some((byte) => byte !== 10 && (byte < 32 || byte > 126))) {
          markInvalid();
          return;
        }
        stdoutPieces.push(Buffer.from(chunk));
        stdoutBytes += chunk.byteLength;
      });
      stderr.on("data", () => markInvalid());
      stdin.on("error", () => markInvalid());
    }
    child.on("error", () => {
      markInvalid();
    });
    const sourcePipe = child.stdio[3];
    if (sourcePipe === null || sourcePipe === void 0) {
      markInvalid();
    } else {
      try {
        sourcePipe.once("error", () => markInvalid());
        sourcePipe.end(assets.workerSourceBytes);
      } catch {
        markInvalid();
      }
    }
    child.once(
      "close",
      (code, signal) => {
        if (settled) return;
        settled = true;
        if (lifecycleSpawned) lifecycle?.onReap();
        clearInterval(stopPoll);
        clearTimeout(timer);
        if (watchdog) {
          resolve8(
            mode === "diagnostic" ? Object.freeze({
              outcome: "watchdog",
              phase: "outer-watchdog",
              completedDepth: null,
              nodesBucket: null,
              leavesBucket: null
            }) : null
          );
          return;
        }
        if (stopped || invalid || code !== 0 || signal !== null) {
          resolve8(mode === "diagnostic" ? safeFailure() : null);
          return;
        }
        const message = parseWorkerMessage(
          Buffer.concat(stdoutPieces, stdoutBytes),
          mode
        );
        if (message === null) {
          resolve8(mode === "diagnostic" ? safeFailure() : null);
        } else if (message.type === "parity") {
          resolve8(message);
        } else {
          resolve8(
            Object.freeze({
              outcome: message.outcome,
              phase: message.phase,
              completedDepth: message.completed_depth,
              nodesBucket: message.nodes_bucket,
              leavesBucket: message.leaves_bucket
            })
          );
        }
      }
    );
    if (stdin === null) {
      markInvalid();
      return;
    }
    try {
      stdin.end(
        createWorkerInputLine(
          input,
          assets,
          options.cooperativeDeadlineMilliseconds,
          mode
        ),
        "ascii"
      );
    } catch {
      markInvalid();
    }
  });
}
function emptyOutcomeCounts() {
  return { complete: 0, deadline: 0, watchdog: 0, failure: 0 };
}
function aggregate(telemetry, options, observedPeakParallelChildren) {
  const outcomeCounts = emptyOutcomeCounts();
  const phaseCounts = new Map(
    PHASES.map((phase) => [phase, 0])
  );
  const depthCounts = Array.from(
    { length: FLOODGATE_STABLE_WASM_DIAGNOSTIC_REQUESTED_DEPTH + 1 },
    () => 0
  );
  const nodeCounts = new Map(
    COUNTER_BUCKETS.map((bucket) => [bucket, 0])
  );
  const leafCounts = new Map(
    COUNTER_BUCKETS.map((bucket) => [bucket, 0])
  );
  for (const lane of telemetry) {
    outcomeCounts[lane.outcome] += 1;
    phaseCounts.set(lane.phase, (phaseCounts.get(lane.phase) ?? 0) + 1);
    if (lane.completedDepth !== null) depthCounts[lane.completedDepth] += 1;
    if (lane.nodesBucket !== null) {
      nodeCounts.set(
        lane.nodesBucket,
        (nodeCounts.get(lane.nodesBucket) ?? 0) + 1
      );
    }
    if (lane.leavesBucket !== null) {
      leafCounts.set(
        lane.leavesBucket,
        (leafCounts.get(lane.leavesBucket) ?? 0) + 1
      );
    }
  }
  return Object.freeze({
    schema: FLOODGATE_STABLE_WASM_DEADLINE_DIAGNOSTIC_SCHEMA,
    status: FLOODGATE_STABLE_WASM_DEADLINE_DIAGNOSTIC_STATUS,
    claim_boundary: FLOODGATE_STABLE_WASM_DEADLINE_DIAGNOSTIC_CLAIM_BOUNDARY,
    requests: telemetry.length,
    configured_maximum_parallel_children: FLOODGATE_STABLE_WASM_DIAGNOSTIC_MAX_CONCURRENT_CHILDREN,
    observed_peak_parallel_children: observedPeakParallelChildren,
    cooperative_deadline_ms: options.cooperativeDeadlineMilliseconds,
    outer_watchdog_ms: options.outerWatchdogMilliseconds,
    outcome_counts: Object.freeze(outcomeCounts),
    phase_histogram: Object.freeze(
      PHASES.map(
        (phase) => Object.freeze({ phase, count: phaseCounts.get(phase) ?? 0 })
      )
    ),
    completed_depth_histogram: Object.freeze(
      depthCounts.map((count, depth) => Object.freeze({ depth, count }))
    ),
    nodes_bucket_histogram: Object.freeze(
      COUNTER_BUCKETS.map(
        (bucket) => Object.freeze({ bucket, count: nodeCounts.get(bucket) ?? 0 })
      )
    ),
    leaves_bucket_histogram: Object.freeze(
      COUNTER_BUCKETS.map(
        (bucket) => Object.freeze({ bucket, count: leafCounts.get(bucket) ?? 0 })
      )
    ),
    individual_lane_records_returned: 0,
    partial_iteration_results_adopted: 0,
    all_children_reaped: true
  });
}
function runCapturedDiagnostic(inputs, assets, options) {
  const outcomes = new Array(inputs.length);
  let nextInput = 0;
  let activeChildren = 0;
  let observedPeakParallelChildren = 0;
  const lifecycle = Object.freeze({
    onSpawn: () => {
      activeChildren += 1;
      observedPeakParallelChildren = Math.max(
        observedPeakParallelChildren,
        activeChildren
      );
    },
    onReap: () => {
      activeChildren -= 1;
    }
  });
  const consume2 = async () => {
    while (nextInput < inputs.length) {
      const inputIndex = nextInput;
      nextInput += 1;
      outcomes[inputIndex] = await runOneChild(
        inputs[inputIndex],
        assets,
        options,
        "diagnostic",
        lifecycle
      );
    }
  };
  const consumers = Array.from(
    {
      length: Math.min(
        FLOODGATE_STABLE_WASM_DIAGNOSTIC_MAX_CONCURRENT_CHILDREN,
        inputs.length
      )
    },
    () => consume2()
  );
  return Promise.all(consumers).then(() => {
    if (activeChildren !== 0) {
      fail3("diagnostic aggregation requires every child to be reaped");
    }
    const telemetry = outcomes.map(
      (outcome) => outcome === null || "type" in outcome ? safeFailure() : outcome
    );
    return aggregate(telemetry, options, observedPeakParallelChildren);
  });
}
function runFloodgateStableWasmDeadlineDiagnosticCoreForTests(inputs, assets, options = {}) {
  const capturedInputs = captureInputs(inputs);
  const capturedAssets = captureAssets(
    assets,
    FLOODGATE_STABLE_WASM_DIAGNOSTIC_WORKER_IDENTITY
  );
  const capturedOptions = captureOptions(options);
  return runCapturedDiagnostic(capturedInputs, capturedAssets, capturedOptions);
}
var import_node_child_process3, import_node_crypto2, import_node_path, FLOODGATE_STABLE_WASM_DEADLINE_DIAGNOSTIC_SCHEMA, FLOODGATE_STABLE_WASM_DEADLINE_DIAGNOSTIC_WORKER_SCHEMA, FLOODGATE_STABLE_WASM_DEADLINE_DIAGNOSTIC_STATUS, FLOODGATE_STABLE_WASM_DEADLINE_DIAGNOSTIC_CLAIM_BOUNDARY, FLOODGATE_STABLE_WASM_DIAGNOSTIC_COOPERATIVE_DEADLINE_MS, FLOODGATE_STABLE_WASM_DIAGNOSTIC_OUTER_WATCHDOG_MS, FLOODGATE_STABLE_WASM_DIAGNOSTIC_REQUESTED_DEPTH, FLOODGATE_STABLE_WASM_DIAGNOSTIC_MAX_REQUESTS, FLOODGATE_STABLE_WASM_DIAGNOSTIC_MAX_CONCURRENT_CHILDREN, FLOODGATE_STABLE_WASM_DIAGNOSTIC_WASM_IDENTITY, FLOODGATE_STABLE_WASM_DIAGNOSTIC_WEIGHTS_IDENTITY, FLOODGATE_STABLE_WASM_DIAGNOSTIC_WORKER_IDENTITY, COUNTER_BUCKETS, PHASES, WORKER_BOOTSTRAP_SOURCE, MAX_WORKER_STDOUT_BYTES, STOP_POLL_MILLISECONDS, NEVER_STOP, SENTE, GOTE, FIRST_HAND_KOMA, VALID_BOARD_PIECES, MATERIAL_LIMIT_BY_KIND;
var init_floodgate_stable_wasm_deadline_diagnostic = __esm({
  "ml/floodgate-stable-wasm-deadline-diagnostic.ts"() {
    "use strict";
    import_node_child_process3 = require("node:child_process");
    import_node_crypto2 = require("node:crypto");
    import_node_path = require("node:path");
    FLOODGATE_STABLE_WASM_DEADLINE_DIAGNOSTIC_SCHEMA = "shogi-floodgate-stable-wasm-deadline-diagnostic-v1";
    FLOODGATE_STABLE_WASM_DEADLINE_DIAGNOSTIC_WORKER_SCHEMA = "shogi-floodgate-stable-wasm-deadline-diagnostic-worker-v1";
    FLOODGATE_STABLE_WASM_DEADLINE_DIAGNOSTIC_STATUS = "non-operational-in-memory-contract-core-no-production-import-binding-reader-writer-or-run-authority";
    FLOODGATE_STABLE_WASM_DEADLINE_DIAGNOSTIC_CLAIM_BOUNDARY = "deadline-isolation-and-aggregate-telemetry-only-not-teacher-data-partial-result-adoption-training-playing-strength-or-live-change";
    FLOODGATE_STABLE_WASM_DIAGNOSTIC_COOPERATIVE_DEADLINE_MS = 6e5;
    FLOODGATE_STABLE_WASM_DIAGNOSTIC_OUTER_WATCHDOG_MS = 615e3;
    FLOODGATE_STABLE_WASM_DIAGNOSTIC_REQUESTED_DEPTH = 11;
    FLOODGATE_STABLE_WASM_DIAGNOSTIC_MAX_REQUESTS = 12;
    FLOODGATE_STABLE_WASM_DIAGNOSTIC_MAX_CONCURRENT_CHILDREN = 6;
    FLOODGATE_STABLE_WASM_DIAGNOSTIC_WASM_IDENTITY = Object.freeze({
      bytes: 35597,
      sha256: "e185df728616b7e7af93232ada5e53c33ec7211bf05a99b1e01f48c4e56d813c"
    });
    FLOODGATE_STABLE_WASM_DIAGNOSTIC_WEIGHTS_IDENTITY = Object.freeze({
      bytes: 1185988,
      sha256: "e4e738f99fbd8685bcfe2700e4df364af6274e75b44b298432fc313b9a3e28dc"
    });
    FLOODGATE_STABLE_WASM_DIAGNOSTIC_WORKER_IDENTITY = Object.freeze({
      bytes: 17346,
      sha256: "7d085ddfce1c55e8ad792be13e44e48cd34344fe8a876c67fe89389271db16ca"
    });
    COUNTER_BUCKETS = Object.freeze([
      "0",
      "1-1023",
      "1024-32767",
      "32768-1048575",
      "1048576-33554431",
      "33554432-2147483647"
    ]);
    PHASES = Object.freeze([
      "requested-depth-complete",
      "winning-mate-early",
      "cooperative-deadline-after-completed-depth-0",
      "cooperative-deadline-after-completed-depth-1",
      "cooperative-deadline-after-completed-depth-2",
      "cooperative-deadline-after-completed-depth-3",
      "cooperative-deadline-after-completed-depth-4",
      "cooperative-deadline-after-completed-depth-5",
      "cooperative-deadline-after-completed-depth-6",
      "cooperative-deadline-after-completed-depth-7",
      "cooperative-deadline-after-completed-depth-8",
      "cooperative-deadline-after-completed-depth-9",
      "cooperative-deadline-after-completed-depth-10",
      "outer-watchdog",
      "failure"
    ]);
    WORKER_BOOTSTRAP_SOURCE = 'import { readFileSync } from "node:fs";const source=readFileSync(3);const encoded=Buffer.from(source).toString("base64");await import("data:text/javascript;base64,"+encoded);';
    MAX_WORKER_STDOUT_BYTES = 1024;
    STOP_POLL_MILLISECONDS = 25;
    NEVER_STOP = () => false;
    SENTE = 16;
    GOTE = 32;
    FIRST_HAND_KOMA = 17;
    VALID_BOARD_PIECES = Object.freeze([
      0,
      17,
      18,
      19,
      20,
      21,
      22,
      23,
      24,
      25,
      26,
      27,
      28,
      30,
      31,
      33,
      34,
      35,
      36,
      37,
      38,
      39,
      40,
      41,
      42,
      43,
      44,
      46,
      47
    ]);
    MATERIAL_LIMIT_BY_KIND = Object.freeze([
      0,
      18,
      4,
      4,
      4,
      4,
      2,
      2
    ]);
  }
});

// ml/floodgate-stable-wasm-deadline-public-calibration.ts
function fail4(message) {
  throw new Error(message);
}
function sha2562(bytes) {
  return (0, import_node_crypto3.createHash)("sha256").update(bytes).digest("hex");
}
function snapshotBytes2(value, label) {
  if (!(value instanceof Uint8Array)) fail4(`${label} must be bytes`);
  return Buffer.from(value.slice());
}
function assertIdentity2(bytes, identity, label) {
  if (bytes.byteLength !== identity.bytes || sha2562(bytes) !== identity.sha256) {
    fail4(`${label} does not match its fixed identity`);
  }
}
function captureAssets2(assets, workerIdentity) {
  if (assets === null || typeof assets !== "object") {
    fail4("calibration assets must be an object");
  }
  const captured = {
    wasmBytes: snapshotBytes2(assets.wasmBytes, "calibration WASM"),
    weightsBytes: snapshotBytes2(assets.weightsBytes, "calibration weights"),
    workerSourceBytes: snapshotBytes2(
      assets.workerSourceBytes,
      "calibration worker"
    )
  };
  assertIdentity2(
    captured.wasmBytes,
    FLOODGATE_STABLE_WASM_DIAGNOSTIC_WASM_IDENTITY,
    "calibration WASM"
  );
  assertIdentity2(
    captured.weightsBytes,
    FLOODGATE_STABLE_WASM_DIAGNOSTIC_WEIGHTS_IDENTITY,
    "calibration weights"
  );
  assertIdentity2(
    captured.workerSourceBytes,
    workerIdentity,
    "calibration worker"
  );
  return Object.freeze(captured);
}
function canonicalJson2(value) {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) {
      fail4("canonical JSON rejects nonfinite numbers");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson2(entry)).join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value;
    const keys = Object.keys(record).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson2(record[key])}`).join(",")}}`;
  }
  fail4("canonical JSON rejects unsupported values");
}
function exactKeys2(value, expected) {
  const keys = Object.keys(value);
  return keys.length === expected.length && keys.every((key, index) => key === expected[index]);
}
function parseWorkerResult(bytes) {
  if (bytes.byteLength < 2 || bytes[bytes.byteLength - 1] !== 10 || bytes.subarray(0, bytes.byteLength - 1).includes(10)) {
    return null;
  }
  const line = bytes.subarray(0, bytes.byteLength - 1).toString("ascii");
  let parsed;
  try {
    parsed = JSON.parse(line);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed) || canonicalJson2(parsed) !== line) {
    return null;
  }
  const message = parsed;
  if (!exactKeys2(message, [
    "callback_overhead_ratio_ppm",
    "exact_parity_count",
    "schema",
    "type"
  ]) || message.schema !== FLOODGATE_STABLE_WASM_DEADLINE_PUBLIC_CALIBRATION_WORKER_SCHEMA || message.type !== "calibration" || !Number.isSafeInteger(message.callback_overhead_ratio_ppm) || message.callback_overhead_ratio_ppm <= 0 || message.exact_parity_count !== FLOODGATE_STABLE_WASM_DEADLINE_PUBLIC_CALIBRATION_SAMPLE_COUNT) {
    return null;
  }
  return message;
}
function workerEnvironment2() {
  const environment = {
    NODE_ENV: process.env.NODE_ENV ?? "test"
  };
  if (process.platform !== "win32") return Object.freeze(environment);
  if (process.env.SystemRoot !== void 0) {
    environment.SystemRoot = process.env.SystemRoot;
  }
  if (process.env.SystemDrive !== void 0) {
    environment.SystemDrive = process.env.SystemDrive;
  }
  return Object.freeze(environment);
}
function workerCwd2() {
  if (process.platform !== "win32") return "/";
  return process.env.SystemDrive === void 0 ? "C:\\" : `${process.env.SystemDrive}\\`;
}
function workerInputLine(assets) {
  return `${canonicalJson2({
    schema: FLOODGATE_STABLE_WASM_DEADLINE_PUBLIC_CALIBRATION_WORKER_SCHEMA,
    wasm_base64: assets.wasmBytes.toString("base64"),
    weights_base64: assets.weightsBytes.toString("base64")
  })}
`;
}
function runCapturedCalibration(assets, options) {
  const childExecutablePath = options.childExecutablePath ?? process.execPath;
  const shouldStop = options.shouldStop ?? NEVER_STOP2;
  const watchdogMilliseconds = options.watchdogMilliseconds ?? FLOODGATE_STABLE_WASM_DEADLINE_PUBLIC_CALIBRATION_WATCHDOG_MS;
  if (typeof childExecutablePath !== "string" || childExecutablePath.length === 0 || typeof shouldStop !== "function" || !Number.isSafeInteger(watchdogMilliseconds) || watchdogMilliseconds < 1 || watchdogMilliseconds > FLOODGATE_STABLE_WASM_DEADLINE_PUBLIC_CALIBRATION_WATCHDOG_MS) {
    return Promise.reject(new Error("invalid calibration child options"));
  }
  const stopRequested2 = () => {
    try {
      const result = shouldStop();
      return typeof result !== "boolean" || result;
    } catch {
      return true;
    }
  };
  if (stopRequested2()) {
    return Promise.reject(new Error("public calibration stopped before spawn"));
  }
  return new Promise((resolve8, reject) => {
    let child;
    try {
      child = (0, import_node_child_process4.spawn)(
        childExecutablePath,
        ["--input-type=module", "--eval", WORKER_BOOTSTRAP_SOURCE2],
        {
          cwd: workerCwd2(),
          env: workerEnvironment2(),
          shell: false,
          stdio: ["pipe", "pipe", "pipe", "pipe"]
        }
      );
    } catch (error) {
      reject(error);
      return;
    }
    const stdoutPieces = [];
    let stdoutBytes = 0;
    let invalid = false;
    let stopped = false;
    let watchdog = false;
    let settled = false;
    const killChild = () => {
      try {
        child.kill("SIGKILL");
      } catch {
      }
    };
    const invalidate = () => {
      invalid = true;
      killChild();
    };
    const stopPoll = setInterval(() => {
      if (!stopRequested2()) return;
      stopped = true;
      killChild();
    }, STOP_POLL_MILLISECONDS2);
    const timer = setTimeout(() => {
      watchdog = true;
      killChild();
    }, watchdogMilliseconds);
    child.once(
      "close",
      (code, signal) => {
        if (settled) return;
        settled = true;
        clearInterval(stopPoll);
        clearTimeout(timer);
        if (stopped || watchdog || invalid || code !== 0 || signal !== null) {
          reject(new Error("public calibration child failed closed"));
          return;
        }
        const result = parseWorkerResult(
          Buffer.concat(stdoutPieces, stdoutBytes)
        );
        if (result === null) {
          reject(new Error("public calibration child result was invalid"));
          return;
        }
        resolve8(
          Object.freeze({
            callback_overhead_ratio_ppm: result.callback_overhead_ratio_ppm,
            exact_parity_count: result.exact_parity_count
          })
        );
      }
    );
    const stdin = child.stdin;
    const stdout = child.stdout;
    const stderr = child.stderr;
    if (stdin === null || stdout === null || stderr === null) {
      invalidate();
    } else {
      stdout.on("data", (chunk) => {
        if (invalid || watchdog || chunk.byteLength > MAX_WORKER_STDOUT_BYTES2 - stdoutBytes || chunk.some((byte) => byte !== 10 && (byte < 32 || byte > 126))) {
          invalidate();
          return;
        }
        stdoutPieces.push(Buffer.from(chunk));
        stdoutBytes += chunk.byteLength;
      });
      stderr.on("data", invalidate);
      stdin.on("error", invalidate);
    }
    child.on("error", () => {
      invalidate();
    });
    const sourcePipe = child.stdio[3];
    if (sourcePipe === null || sourcePipe === void 0) {
      invalidate();
    } else {
      sourcePipe.once("error", invalidate);
      try {
        sourcePipe.end(assets.workerSourceBytes);
      } catch {
        invalidate();
      }
    }
    if (stdin === null) {
      invalidate();
      return;
    }
    try {
      stdin.end(workerInputLine(assets), "ascii");
    } catch {
      invalidate();
    }
  });
}
function runFloodgateStableWasmDeadlinePublicCalibration(assets, shouldStop = NEVER_STOP2) {
  return runCapturedCalibration(
    captureAssets2(
      assets,
      FLOODGATE_STABLE_WASM_DEADLINE_PUBLIC_CALIBRATION_WORKER_IDENTITY
    ),
    { shouldStop }
  );
}
var import_node_child_process4, import_node_crypto3, FLOODGATE_STABLE_WASM_DEADLINE_PUBLIC_CALIBRATION_WORKER_SCHEMA, FLOODGATE_STABLE_WASM_DEADLINE_PUBLIC_CALIBRATION_SAMPLE_COUNT, FLOODGATE_STABLE_WASM_DEADLINE_PUBLIC_CALIBRATION_WATCHDOG_MS, FLOODGATE_STABLE_WASM_DEADLINE_PUBLIC_CALIBRATION_WORKER_IDENTITY, WORKER_BOOTSTRAP_SOURCE2, MAX_WORKER_STDOUT_BYTES2, STOP_POLL_MILLISECONDS2, NEVER_STOP2;
var init_floodgate_stable_wasm_deadline_public_calibration = __esm({
  "ml/floodgate-stable-wasm-deadline-public-calibration.ts"() {
    "use strict";
    import_node_child_process4 = require("node:child_process");
    import_node_crypto3 = require("node:crypto");
    init_floodgate_stable_wasm_deadline_diagnostic();
    FLOODGATE_STABLE_WASM_DEADLINE_PUBLIC_CALIBRATION_WORKER_SCHEMA = "shogi-floodgate-stable-wasm-deadline-public-calibration-worker-v1";
    FLOODGATE_STABLE_WASM_DEADLINE_PUBLIC_CALIBRATION_SAMPLE_COUNT = 5;
    FLOODGATE_STABLE_WASM_DEADLINE_PUBLIC_CALIBRATION_WATCHDOG_MS = 18e4;
    FLOODGATE_STABLE_WASM_DEADLINE_PUBLIC_CALIBRATION_WORKER_IDENTITY = Object.freeze({
      bytes: 13014,
      sha256: "899c9eaea9dcc5478ad833a840232cc6aadf584f6bc2682ca5869832d12acbb6"
    });
    WORKER_BOOTSTRAP_SOURCE2 = 'import { readFileSync } from "node:fs";const source=readFileSync(3);const encoded=Buffer.from(source).toString("base64");await import("data:text/javascript;base64,"+encoded);';
    MAX_WORKER_STDOUT_BYTES2 = 256;
    STOP_POLL_MILLISECONDS2 = 25;
    NEVER_STOP2 = () => false;
  }
});

// ml/floodgate-stable-wasm-deadline-read-only-registry.ts
function fail5() {
  throw new Error("stable-WASM deadline read-only registry rejected");
}
function canonicalNonRootPath(value) {
  return typeof value === "string" && value.length > 1 && value.length <= 4096 && value.trim() === value && !CONTROL_RE.test(value) && path4.isAbsolute(value) && path4.resolve(value) === value && path4.parse(value).root !== value;
}
function snapshot(value) {
  return Object.freeze({
    ctimeNs: value.ctimeNs,
    dev: value.dev,
    ino: value.ino,
    mode: value.mode,
    mtimeNs: value.mtimeNs,
    nlink: value.nlink,
    size: value.size,
    uid: value.uid
  });
}
function sameSnapshot(left, right) {
  return left.ctimeNs === right.ctimeNs && left.dev === right.dev && left.ino === right.ino && left.mode === right.mode && left.mtimeNs === right.mtimeNs && left.nlink === right.nlink && left.size === right.size && left.uid === right.uid;
}
function safeDirectory(value, effectiveUserId, isHome) {
  const permissions = value.mode & MODE_MASK;
  return (value.mode & TYPE_MASK) === DIRECTORY_TYPE && value.uid === BigInt(effectiveUserId) && (isHome ? (permissions & HOME_OWNER_MODE) === HOME_OWNER_MODE && (permissions & HOME_FORBIDDEN_MODE) === BigInt(0) : permissions === DIRECTORY_MODE);
}
function safeRecord(value, effectiveUserId) {
  return (value.mode & TYPE_MASK) === REGULAR_TYPE && (value.mode & MODE_MASK) === FILE_MODE && value.uid === BigInt(effectiveUserId) && value.nlink === BigInt(1) && value.size >= BigInt(2) && value.size <= BigInt(MAX_RECORD_BYTES);
}
function exactDataRecord(value, keys) {
  if (value === null || typeof value !== "object" || Array.isArray(value) || import_node_util4.types.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
    fail5();
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const ownKeys = Reflect.ownKeys(descriptors);
  if (ownKeys.length !== keys.length || ownKeys.some((key, index) => typeof key !== "string" || key !== keys[index])) {
    fail5();
  }
  const captured = /* @__PURE__ */ Object.create(null);
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (descriptor === void 0 || !("value" in descriptor) || descriptor.enumerable !== true) {
      fail5();
    }
    Object.defineProperty(captured, key, {
      configurable: false,
      enumerable: true,
      writable: false,
      value: descriptor.value
    });
  }
  return Object.freeze(captured);
}
function requiredDigest(value) {
  if (typeof value !== "string" || !SHA256_RE.test(value)) fail5();
  return value;
}
function requiredRevision(value) {
  if (typeof value !== "string" || !REVISION_RE.test(value)) fail5();
  return value;
}
function validateEngineArguments(value) {
  if (!Array.isArray(value) || import_node_util4.types.isProxy(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > 64) {
    fail5();
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).length !== value.length + 1) fail5();
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = descriptors[String(index)];
    const argument = descriptor !== void 0 && "value" in descriptor ? descriptor.value : null;
    if (descriptor === void 0 || !("value" in descriptor) || descriptor.enumerable !== true || typeof argument !== "string" || argument.length < 1 || argument.length > 4096 || argument.trim() !== argument || CONTROL_RE.test(argument) || !SAFE_OPTION_RE.test(argument) && !canonicalNonRootPath(argument)) {
      fail5();
    }
  }
}
function parseRecord(bytes) {
  if (bytes.byteLength < 2 || bytes.byteLength > MAX_RECORD_BYTES || bytes.byteLength >= 3 && bytes[0] === 239 && bytes[1] === 187 && bytes[2] === 191) {
    fail5();
  }
  let text;
  try {
    text = new TextDecoder("utf-8", {
      fatal: true,
      ignoreBOM: true
    }).decode(bytes);
  } catch {
    return fail5();
  }
  if (!text.endsWith("\n") || text.indexOf("\n") !== text.length - 1 || text.includes("\r") || text.charCodeAt(0) === 65279) {
    fail5();
  }
  let parsed;
  try {
    parsed = JSON.parse(text.slice(0, -1));
  } catch {
    return fail5();
  }
  if (`${JSON.stringify(parsed)}
` !== text) fail5();
  const record = exactDataRecord(parsed, RECORD_KEYS);
  if (record.contract !== REGISTRY_CONTRACT || record.status !== REGISTRY_STATUS || record.layout !== REGISTRY_LAYOUT) {
    fail5();
  }
  requiredDigest(record.run_id);
  const approved = exactDataRecord(
    record.approved_key_binding,
    APPROVED_BINDING_KEYS
  );
  if (!Number.isSafeInteger(approved.record_bytes) || approved.record_bytes < 2 || approved.record_bytes > MAX_RECORD_BYTES) {
    fail5();
  }
  requiredDigest(approved.record_sha256);
  requiredDigest(approved.key_instance_id);
  const verifierRevision = requiredRevision(record.verifier_revision);
  const source = exactDataRecord(
    record.application_source_binding,
    SOURCE_BINDING_KEYS
  );
  if (source.layout !== FLOODGATE_STABLE_WASM_DEADLINE_REGISTRY_APPLICATION_LAYOUT) {
    fail5();
  }
  const applicationRevision = requiredRevision(source.revision);
  for (const key of [
    "repository_root",
    "raw_lock_root",
    "role_lock_root",
    "role_bundle_root",
    "legacy_protected_position_ids_path"
  ]) {
    if (!canonicalNonRootPath(record[key])) fail5();
  }
  validateEngineArguments(record.engine_args);
  return Object.freeze({
    applicationSourceBinding: Object.freeze({
      layout: FLOODGATE_STABLE_WASM_DEADLINE_REGISTRY_APPLICATION_LAYOUT,
      revision: applicationRevision
    }),
    consumer: Object.freeze({
      legacyProtectedPositionIdsPath: record.legacy_protected_position_ids_path,
      outputRoot: record.role_bundle_root,
      rawLockRoot: record.raw_lock_root,
      repositoryRoot: record.repository_root,
      roleLockRoot: record.role_lock_root,
      verifierRevision
    })
  });
}
function captureDependencies2(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value) || import_node_util4.types.isProxy(value)) {
    fail5();
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.some(
    (key) => typeof key !== "string" || ![
      "beforeFinalRevalidationForTests",
      "effectiveUserId",
      "homeDirectory"
    ].includes(key)
  ) || descriptors.effectiveUserId === void 0 || descriptors.homeDirectory === void 0) {
    fail5();
  }
  for (const descriptor of Object.values(descriptors)) {
    if (!("value" in descriptor) || descriptor.enumerable !== true) fail5();
  }
  const effectiveUserId = descriptors.effectiveUserId.value;
  const homeDirectory = descriptors.homeDirectory.value;
  const hook = descriptors.beforeFinalRevalidationForTests?.value;
  if (!Number.isSafeInteger(effectiveUserId) || effectiveUserId <= 0 || !canonicalNonRootPath(homeDirectory) || hook !== void 0 && (typeof hook !== "function" || import_node_util4.types.isProxy(hook))) {
    fail5();
  }
  return Object.freeze({
    effectiveUserId,
    homeDirectory,
    ...hook === void 0 ? {} : { beforeFinalRevalidationForTests: hook }
  });
}
function issueCapability(registry, claim2) {
  const capability = Object.freeze({
    contract: "shogi-floodgate-stable-wasm-deadline-read-only-registry-capability-v1",
    status: "opaque-single-use-private-registry-not-claimed"
  });
  registry.set(capability, claim2);
  return capability;
}
async function load(dependenciesInput, claims) {
  const dependencies = captureDependencies2(dependenciesInput);
  const registryRoot = path4.join(
    dependencies.homeDirectory,
    ...FLOODGATE_STABLE_WASM_DEADLINE_READ_ONLY_REGISTRY_ROOT_COMPONENTS
  );
  const directories = [
    dependencies.homeDirectory,
    ...FLOODGATE_STABLE_WASM_DEADLINE_READ_ONLY_REGISTRY_ROOT_COMPONENTS.map(
      (_component, index) => path4.join(
        dependencies.homeDirectory,
        ...FLOODGATE_STABLE_WASM_DEADLINE_READ_ONLY_REGISTRY_ROOT_COMPONENTS.slice(
          0,
          index + 1
        )
      )
    ),
    path4.join(registryRoot, RUNS_BASENAME)
  ];
  const recordPath = path4.join(
    registryRoot,
    FLOODGATE_STABLE_WASM_DEADLINE_READ_ONLY_REGISTRY_FILENAME
  );
  const directoryHandles = [];
  const directorySnapshots = [];
  let recordHandle;
  let recordBefore;
  let bytes;
  let primary;
  try {
    for (let index = 0; index < directories.length; index += 1) {
      const directoryPath = directories[index];
      if (fs4.realpathSync.native(directoryPath) !== directoryPath) {
        fail5();
      }
      const before = snapshot(
        await fs4.promises.lstat(directoryPath, { bigint: true })
      );
      if (!safeDirectory(before, dependencies.effectiveUserId, index === 0)) {
        fail5();
      }
      const handle = await fs4.promises.open(directoryPath, DIRECTORY_FLAGS);
      directoryHandles.push(handle);
      const held2 = snapshot(await handle.stat({ bigint: true }));
      const after = snapshot(
        await fs4.promises.lstat(directoryPath, { bigint: true })
      );
      if (!safeDirectory(held2, dependencies.effectiveUserId, index === 0) || !sameSnapshot(before, held2) || !sameSnapshot(held2, after)) {
        fail5();
      }
      directorySnapshots.push(before);
    }
    if (fs4.realpathSync.native(recordPath) !== recordPath) fail5();
    recordBefore = snapshot(
      await fs4.promises.lstat(recordPath, { bigint: true })
    );
    if (!safeRecord(recordBefore, dependencies.effectiveUserId)) fail5();
    recordHandle = await fs4.promises.open(recordPath, FILE_FLAGS);
    const held = snapshot(await recordHandle.stat({ bigint: true }));
    if (!sameSnapshot(recordBefore, held)) fail5();
    bytes = await recordHandle.readFile();
    if (BigInt(bytes.byteLength) !== held.size) fail5();
    const claim2 = parseRecord(bytes);
    await dependencies.beforeFinalRevalidationForTests?.();
    for (let index = 0; index < directories.length; index += 1) {
      const heldAfter = snapshot(
        await directoryHandles[index].stat({ bigint: true })
      );
      const namedAfter = snapshot(
        await fs4.promises.lstat(directories[index], { bigint: true })
      );
      if (!sameSnapshot(directorySnapshots[index], heldAfter) || !sameSnapshot(heldAfter, namedAfter) || fs4.realpathSync.native(directories[index]) !== directories[index]) {
        fail5();
      }
    }
    const recordHeldAfter = snapshot(await recordHandle.stat({ bigint: true }));
    const recordNamedAfter = snapshot(
      await fs4.promises.lstat(recordPath, { bigint: true })
    );
    if (!sameSnapshot(recordBefore, recordHeldAfter) || !sameSnapshot(recordHeldAfter, recordNamedAfter) || fs4.realpathSync.native(recordPath) !== recordPath) {
      fail5();
    }
    return issueCapability(claims, claim2);
  } catch (error) {
    primary = error;
    throw error;
  } finally {
    bytes?.fill(0);
    const closeErrors = [];
    if (recordHandle !== void 0) {
      try {
        await recordHandle.close();
      } catch (error) {
        closeErrors.push(error);
      }
    }
    for (let index = directoryHandles.length - 1; index >= 0; index -= 1) {
      try {
        await directoryHandles[index].close();
      } catch (error) {
        closeErrors.push(error);
      }
    }
    if (closeErrors.length > 0 && primary === void 0) fail5();
  }
}
function claim(capability, claims) {
  if (capability === null || typeof capability !== "object" || import_node_util4.types.isProxy(capability)) {
    fail5();
  }
  const stored = claims.get(capability);
  if (stored === void 0) fail5();
  claims.delete(capability);
  return stored;
}
function loadFloodgateStableWasmDeadlineReadOnlyRegistry() {
  if (arguments.length !== 0 || process.platform !== "darwin" || process.arch !== "arm64" || typeof process.geteuid !== "function") {
    return Promise.reject(new Error("read-only registry platform rejected"));
  }
  try {
    const effectiveUserId = process.geteuid();
    const user = os3.userInfo();
    if (user.uid !== effectiveUserId || effectiveUserId <= 0 || !canonicalNonRootPath(user.homedir)) {
      fail5();
    }
    return load(
      {
        effectiveUserId,
        homeDirectory: user.homedir
      },
      productionClaims
    );
  } catch (error) {
    return Promise.reject(error);
  }
}
function claimFloodgateStableWasmDeadlineReadOnlyRegistry(capability) {
  if (arguments.length !== 1) fail5();
  return claim(capability, productionClaims);
}
var fs4, os3, path4, import_node_util4, FLOODGATE_STABLE_WASM_DEADLINE_REGISTRY_APPLICATION_LAYOUT, REGISTRY_CONTRACT, REGISTRY_STATUS, REGISTRY_LAYOUT, FLOODGATE_STABLE_WASM_DEADLINE_READ_ONLY_REGISTRY_ROOT_COMPONENTS, FLOODGATE_STABLE_WASM_DEADLINE_READ_ONLY_REGISTRY_FILENAME, RUNS_BASENAME, MAX_RECORD_BYTES, RECORD_KEYS, APPROVED_BINDING_KEYS, SOURCE_BINDING_KEYS, SHA256_RE, REVISION_RE, CONTROL_RE, SAFE_OPTION_RE, MODE_MASK, TYPE_MASK, DIRECTORY_TYPE, REGULAR_TYPE, DIRECTORY_MODE, FILE_MODE, HOME_OWNER_MODE, HOME_FORBIDDEN_MODE, DIRECTORY_FLAGS, FILE_FLAGS, productionClaims;
var init_floodgate_stable_wasm_deadline_read_only_registry = __esm({
  "ml/floodgate-stable-wasm-deadline-read-only-registry.ts"() {
    "use strict";
    fs4 = __toESM(require("node:fs"));
    os3 = __toESM(require("node:os"));
    path4 = __toESM(require("node:path"));
    import_node_util4 = require("node:util");
    FLOODGATE_STABLE_WASM_DEADLINE_REGISTRY_APPLICATION_LAYOUT = "fixed-current-euid-userinfo-home-production-application-v1";
    REGISTRY_CONTRACT = "shogi-floodgate-v7-production-connector-registry-record-v2";
    REGISTRY_STATUS = "fixed-private-production-connector-run-registry";
    REGISTRY_LAYOUT = "fixed-current-euid-userinfo-home-v1";
    FLOODGATE_STABLE_WASM_DEADLINE_READ_ONLY_REGISTRY_ROOT_COMPONENTS = Object.freeze([
      "Library",
      "Application Support",
      "nextjs-portfolio",
      "shogi-floodgate-v7-production-connector-v1"
    ]);
    FLOODGATE_STABLE_WASM_DEADLINE_READ_ONLY_REGISTRY_FILENAME = "registry.json";
    RUNS_BASENAME = "runs";
    MAX_RECORD_BYTES = 64 * 1024;
    RECORD_KEYS = Object.freeze([
      "contract",
      "status",
      "layout",
      "run_id",
      "approved_key_binding",
      "verifier_revision",
      "application_source_binding",
      "repository_root",
      "raw_lock_root",
      "role_lock_root",
      "role_bundle_root",
      "legacy_protected_position_ids_path",
      "engine_args"
    ]);
    APPROVED_BINDING_KEYS = Object.freeze([
      "record_bytes",
      "record_sha256",
      "key_instance_id"
    ]);
    SOURCE_BINDING_KEYS = Object.freeze(["layout", "revision"]);
    SHA256_RE = /^[0-9a-f]{64}$/u;
    REVISION_RE = /^[0-9a-f]{40}$/u;
    CONTROL_RE = /[\u0000-\u001f\u007f]/u;
    SAFE_OPTION_RE = /^--?[A-Za-z0-9][A-Za-z0-9_-]*$/u;
    MODE_MASK = BigInt(4095);
    TYPE_MASK = BigInt(fs4.constants.S_IFMT);
    DIRECTORY_TYPE = BigInt(fs4.constants.S_IFDIR);
    REGULAR_TYPE = BigInt(fs4.constants.S_IFREG);
    DIRECTORY_MODE = BigInt(448);
    FILE_MODE = BigInt(384);
    HOME_OWNER_MODE = BigInt(448);
    HOME_FORBIDDEN_MODE = BigInt(3602);
    DIRECTORY_FLAGS = fs4.constants.O_RDONLY | fs4.constants.O_DIRECTORY | fs4.constants.O_NOFOLLOW;
    FILE_FLAGS = fs4.constants.O_RDONLY | fs4.constants.O_NOFOLLOW;
    productionClaims = /* @__PURE__ */ new WeakMap();
  }
});

// ml/floodgate-stable-wasm-deadline-read-only-application-source.ts
function fail6() {
  throw new Error("stable-WASM deadline registry application source rejected");
}
function canonicalPath(value) {
  return typeof value === "string" && value.length > 1 && !value.includes("\0") && !value.includes("\n") && !value.includes("\r") && path5.isAbsolute(value) && path5.resolve(value) === value;
}
function sourceRoot2(homeDirectory) {
  if (!canonicalPath(homeDirectory)) fail6();
  const root = path5.join(homeDirectory, ...ROOT_COMPONENTS);
  const before = fs5.lstatSync(root, { bigint: true });
  if (!before.isDirectory() || before.isSymbolicLink() || fs5.realpathSync.native(root) !== root) {
    fail6();
  }
  const after = fs5.lstatSync(root, { bigint: true });
  if (before.dev !== after.dev || before.ino !== after.ino || before.mode !== after.mode || before.uid !== after.uid || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs) {
    fail6();
  }
  return root;
}
async function captureFloodgateStableWasmDeadlineRegistryApplicationSourceCoreForTests(homeDirectory, captureExactCleanRevision2) {
  if (arguments.length !== 2 || typeof captureExactCleanRevision2 !== "function") {
    return Promise.reject(new Error("application source invocation rejected"));
  }
  const revision = await captureExactCleanRevision2(sourceRoot2(homeDirectory));
  if (!REVISION_RE2.test(revision)) fail6();
  return Object.freeze({
    layout: FLOODGATE_STABLE_WASM_DEADLINE_REGISTRY_APPLICATION_LAYOUT,
    revision
  });
}
function captureFloodgateStableWasmDeadlineRegistryApplicationSource() {
  if (arguments.length !== 0 || typeof process.geteuid !== "function") {
    return Promise.reject(new Error("application source invocation rejected"));
  }
  try {
    const effectiveUserId = process.geteuid();
    const user = os4.userInfo();
    if (effectiveUserId <= 0 || user.uid !== effectiveUserId || !canonicalPath(user.homedir)) {
      fail6();
    }
    return captureFloodgateStableWasmDeadlineRegistryApplicationSourceCoreForTests(
      user.homedir,
      captureFloodgateGitExactCleanRevision
    );
  } catch (error) {
    return Promise.reject(error);
  }
}
var fs5, os4, path5, ROOT_COMPONENTS, REVISION_RE2;
var init_floodgate_stable_wasm_deadline_read_only_application_source = __esm({
  "ml/floodgate-stable-wasm-deadline-read-only-application-source.ts"() {
    "use strict";
    fs5 = __toESM(require("node:fs"));
    os4 = __toESM(require("node:os"));
    path5 = __toESM(require("node:path"));
    init_floodgate_git();
    init_floodgate_stable_wasm_deadline_read_only_registry();
    ROOT_COMPONENTS = Object.freeze([
      ".codex",
      "worktrees",
      "shogi-floodgate-v7-production-application"
    ]);
    REVISION_RE2 = /^[0-9a-f]{40}$/u;
  }
});

// ml/floodgate-stable-wasm-deadline-read-only-assets.ts
function fail7() {
  throw new Error("stable-WASM deadline read-only assets rejected");
}
function canonicalPath2(value) {
  return typeof value === "string" && value.length > 1 && !value.includes("\0") && !value.includes("\n") && !value.includes("\r") && path6.isAbsolute(value) && path6.resolve(value) === value;
}
function snapshot2(value) {
  return Object.freeze({
    ctimeNs: value.ctimeNs,
    dev: value.dev,
    gid: value.gid,
    ino: value.ino,
    mode: value.mode,
    mtimeNs: value.mtimeNs,
    nlink: value.nlink,
    size: value.size,
    uid: value.uid
  });
}
function sameSnapshot2(left, right) {
  return left.ctimeNs === right.ctimeNs && left.dev === right.dev && left.gid === right.gid && left.ino === right.ino && left.mode === right.mode && left.mtimeNs === right.mtimeNs && left.nlink === right.nlink && left.size === right.size && left.uid === right.uid;
}
function safeDirectory2(value, effectiveUserId, home) {
  const permissions = value.mode & MODE_MASK2;
  return (value.mode & TYPE_MASK2) === DIRECTORY_TYPE2 && value.uid === BigInt(effectiveUserId) && (home ? (permissions & HOME_OWNER_MODE2) === HOME_OWNER_MODE2 && (permissions & HOME_FORBIDDEN_MODE2) === BigInt(0) : permissions === DIRECTORY_MODE2);
}
async function openDirectoryChain(homeDirectory, effectiveUserId) {
  const directories = [
    homeDirectory,
    ...FLOODGATE_STABLE_WASM_DEADLINE_READ_ONLY_ASSET_ROOT_COMPONENTS.map(
      (_component, index) => path6.join(
        homeDirectory,
        ...FLOODGATE_STABLE_WASM_DEADLINE_READ_ONLY_ASSET_ROOT_COMPONENTS.slice(
          0,
          index + 1
        )
      )
    ),
    path6.join(
      homeDirectory,
      ...FLOODGATE_STABLE_WASM_DEADLINE_READ_ONLY_ASSET_ROOT_COMPONENTS,
      "stable"
    )
  ];
  const handles = [];
  try {
    for (let index = 0; index < directories.length; index += 1) {
      const directory = directories[index];
      if (fs6.realpathSync.native(directory) !== directory) fail7();
      const before = snapshot2(
        await fs6.promises.lstat(directory, { bigint: true })
      );
      if (!safeDirectory2(before, effectiveUserId, index === 0)) fail7();
      const handle = await fs6.promises.open(directory, DIRECTORY_FLAGS2);
      handles.push(handle);
      const held = snapshot2(await handle.stat({ bigint: true }));
      const after = snapshot2(
        await fs6.promises.lstat(directory, { bigint: true })
      );
      if (!safeDirectory2(held, effectiveUserId, index === 0) || !sameSnapshot2(before, held) || !sameSnapshot2(held, after)) {
        fail7();
      }
    }
    return Object.freeze(handles);
  } catch (error) {
    await Promise.allSettled(handles.map((handle) => handle.close()));
    throw error;
  }
}
async function openAsset(assetRoot, effectiveUserId, specification) {
  const assetPath = path6.join(assetRoot, ...specification.relative);
  if (!canonicalPath2(assetPath) || fs6.realpathSync.native(assetPath) !== assetPath) {
    fail7();
  }
  const before = snapshot2(await fs6.promises.lstat(assetPath, { bigint: true }));
  if ((before.mode & TYPE_MASK2) !== REGULAR_TYPE2 || (before.mode & MODE_MASK2) !== FILE_MODE2 || before.uid !== BigInt(effectiveUserId) || before.nlink !== BigInt(1) || before.size !== BigInt(specification.identity.bytes)) {
    fail7();
  }
  const handle = await fs6.promises.open(assetPath, FILE_FLAGS2);
  try {
    const held = snapshot2(await handle.stat({ bigint: true }));
    if (!sameSnapshot2(before, held)) fail7();
    const bytes = await handle.readFile();
    const heldAfterRead = snapshot2(await handle.stat({ bigint: true }));
    if (!sameSnapshot2(held, heldAfterRead) || bytes.byteLength !== specification.identity.bytes || (0, import_node_crypto4.createHash)("sha256").update(bytes).digest("hex") !== specification.identity.sha256) {
      bytes.fill(0);
      fail7();
    }
    return Object.freeze({
      bytes,
      handle,
      path: assetPath,
      snapshot: held
    });
  } catch (error) {
    await handle.close().catch(() => void 0);
    throw error;
  }
}
async function revalidateAsset(opened, effectiveUserId) {
  const held = snapshot2(await opened.handle.stat({ bigint: true }));
  const named = snapshot2(
    await fs6.promises.lstat(opened.path, { bigint: true })
  );
  if (!sameSnapshot2(opened.snapshot, held) || !sameSnapshot2(held, named) || named.uid !== BigInt(effectiveUserId) || fs6.realpathSync.native(opened.path) !== opened.path) {
    fail7();
  }
}
async function withAssets(homeDirectory, effectiveUserId, callback) {
  if (!canonicalPath2(homeDirectory) || !Number.isSafeInteger(effectiveUserId) || effectiveUserId <= 0 || typeof callback !== "function" || import_node_util5.types.isProxy(callback)) {
    fail7();
  }
  const assetRoot = path6.join(
    homeDirectory,
    ...FLOODGATE_STABLE_WASM_DEADLINE_READ_ONLY_ASSET_ROOT_COMPONENTS
  );
  const directoryHandles = await openDirectoryChain(
    homeDirectory,
    effectiveUserId
  );
  const opened = [];
  let wasmCopy;
  let weightsCopy;
  let primary;
  try {
    for (const specification of RELATIVE_ASSETS) {
      opened.push(await openAsset(assetRoot, effectiveUserId, specification));
    }
    const wasm = opened.find(
      (asset) => asset.path.endsWith(`${path6.sep}shogi.wasm`)
    );
    const weights = opened.find(
      (asset) => asset.path.endsWith(`${path6.sep}shogi-nnue-weights.bin`)
    );
    if (wasm === void 0 || weights === void 0) fail7();
    wasmCopy = Uint8Array.from(wasm.bytes);
    weightsCopy = Uint8Array.from(weights.bytes);
    const result = await callback(
      Object.freeze({
        bytes: Object.freeze({
          wasm: wasmCopy,
          weights: weightsCopy
        })
      })
    );
    for (const asset of opened) {
      await revalidateAsset(asset, effectiveUserId);
    }
    return result;
  } catch (error) {
    primary = error;
    throw error;
  } finally {
    wasmCopy?.fill(0);
    weightsCopy?.fill(0);
    for (const asset of opened) asset.bytes.fill(0);
    const closeResults = await Promise.allSettled([
      ...opened.map((asset) => asset.handle.close()),
      ...directoryHandles.map((handle) => handle.close())
    ]);
    if (primary === void 0 && closeResults.some((result) => result.status === "rejected")) {
      fail7();
    }
  }
}
function withFloodgateStableWasmDeadlineReadOnlyAssets(callback) {
  if (arguments.length !== 1 || process.platform !== "darwin" || process.arch !== "arm64" || typeof process.geteuid !== "function") {
    return Promise.reject(new Error("read-only asset platform rejected"));
  }
  try {
    const effectiveUserId = process.geteuid();
    const user = os5.userInfo();
    if (user.uid !== effectiveUserId || effectiveUserId <= 0 || !canonicalPath2(user.homedir)) {
      fail7();
    }
    return withAssets(user.homedir, effectiveUserId, callback);
  } catch (error) {
    return Promise.reject(error);
  }
}
var import_node_crypto4, fs6, os5, path6, import_node_util5, FLOODGATE_STABLE_WASM_DEADLINE_READ_ONLY_ASSET_ROOT_COMPONENTS, FLOODGATE_STABLE_WASM_DEADLINE_READ_ONLY_ASSET_IDENTITIES, RELATIVE_ASSETS, MODE_MASK2, TYPE_MASK2, DIRECTORY_TYPE2, REGULAR_TYPE2, DIRECTORY_MODE2, FILE_MODE2, HOME_OWNER_MODE2, HOME_FORBIDDEN_MODE2, DIRECTORY_FLAGS2, FILE_FLAGS2;
var init_floodgate_stable_wasm_deadline_read_only_assets = __esm({
  "ml/floodgate-stable-wasm-deadline-read-only-assets.ts"() {
    "use strict";
    import_node_crypto4 = require("node:crypto");
    fs6 = __toESM(require("node:fs"));
    os5 = __toESM(require("node:os"));
    path6 = __toESM(require("node:path"));
    import_node_util5 = require("node:util");
    FLOODGATE_STABLE_WASM_DEADLINE_READ_ONLY_ASSET_ROOT_COMPONENTS = Object.freeze([
      "Library",
      "Application Support",
      "nextjs-portfolio",
      "shogi-production-teacher-assets-v1"
    ]);
    FLOODGATE_STABLE_WASM_DEADLINE_READ_ONLY_ASSET_IDENTITIES = Object.freeze({
      wasm: Object.freeze({
        bytes: 35597,
        sha256: "e185df728616b7e7af93232ada5e53c33ec7211bf05a99b1e01f48c4e56d813c"
      }),
      weights: Object.freeze({
        bytes: 1185988,
        sha256: "e4e738f99fbd8685bcfe2700e4df364af6274e75b44b298432fc313b9a3e28dc"
      })
    });
    RELATIVE_ASSETS = Object.freeze([
      Object.freeze({
        key: "wasm",
        relative: Object.freeze(["stable", "shogi.wasm"]),
        identity: FLOODGATE_STABLE_WASM_DEADLINE_READ_ONLY_ASSET_IDENTITIES.wasm
      }),
      Object.freeze({
        key: "weights",
        relative: Object.freeze(["stable", "shogi-nnue-weights.bin"]),
        identity: FLOODGATE_STABLE_WASM_DEADLINE_READ_ONLY_ASSET_IDENTITIES.weights
      })
    ]);
    MODE_MASK2 = BigInt(4095);
    TYPE_MASK2 = BigInt(fs6.constants.S_IFMT);
    DIRECTORY_TYPE2 = BigInt(fs6.constants.S_IFDIR);
    REGULAR_TYPE2 = BigInt(fs6.constants.S_IFREG);
    DIRECTORY_MODE2 = BigInt(448);
    FILE_MODE2 = BigInt(384);
    HOME_OWNER_MODE2 = BigInt(448);
    HOME_FORBIDDEN_MODE2 = BigInt(3602);
    DIRECTORY_FLAGS2 = fs6.constants.O_RDONLY | fs6.constants.O_DIRECTORY | fs6.constants.O_NOFOLLOW;
    FILE_FLAGS2 = fs6.constants.O_RDONLY | fs6.constants.O_NOFOLLOW;
  }
});

// src/components/game/ShogiImproved/types.ts
function isSente(koma) {
  return (koma & SENTE2) !== 0;
}
function isGote(koma) {
  return (koma & GOTE2) !== 0;
}
function isSelf(teban, koma) {
  if (teban === SENTE2) {
    return isSente(koma);
  } else {
    return isGote(koma);
  }
}
function getKomashu(koma) {
  return koma & 15;
}
function getDan(pos) {
  return pos & 15;
}
var SENTE2, GOTE2, EMPTY, PROMOTE, FU, KY, KE, GI, KI, KA, HI, OU, TO, NY, NK, NG, UM, RY, SFU, SKY, SKE, SGI, SKI, SKA, SHI, SOU, STO, SNY, SNK, SNG, SUM, SRY, GFU, GKY, GKE, GGI, GKI, GKA, GHI, GOU, GTO, GNY, GNK, GNG, GUM, GRY, WALL, komaValue, canPromote, Te;
var init_types = __esm({
  "src/components/game/ShogiImproved/types.ts"() {
    "use strict";
    SENTE2 = 1 << 4;
    GOTE2 = 1 << 5;
    EMPTY = 0;
    PROMOTE = 8;
    FU = 1;
    KY = 2;
    KE = 3;
    GI = 4;
    KI = 5;
    KA = 6;
    HI = 7;
    OU = 8;
    TO = FU + PROMOTE;
    NY = KY + PROMOTE;
    NK = KE + PROMOTE;
    NG = GI + PROMOTE;
    UM = KA + PROMOTE;
    RY = HI + PROMOTE;
    SFU = SENTE2 + FU;
    SKY = SENTE2 + KY;
    SKE = SENTE2 + KE;
    SGI = SENTE2 + GI;
    SKI = SENTE2 + KI;
    SKA = SENTE2 + KA;
    SHI = SENTE2 + HI;
    SOU = SENTE2 + OU;
    STO = SENTE2 + TO;
    SNY = SENTE2 + NY;
    SNK = SENTE2 + NK;
    SNG = SENTE2 + NG;
    SUM = SENTE2 + UM;
    SRY = SENTE2 + RY;
    GFU = GOTE2 + FU;
    GKY = GOTE2 + KY;
    GKE = GOTE2 + KE;
    GGI = GOTE2 + GI;
    GKI = GOTE2 + KI;
    GKA = GOTE2 + KA;
    GHI = GOTE2 + HI;
    GOU = GOTE2 + OU;
    GTO = GOTE2 + TO;
    GNY = GOTE2 + NY;
    GNK = GOTE2 + NK;
    GNG = GOTE2 + NG;
    GUM = GOTE2 + UM;
    GRY = GOTE2 + RY;
    WALL = 64;
    komaValue = [
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      // Empty spaces
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      // Cannot promote
      0,
      100,
      600,
      700,
      1e3,
      1200,
      1800,
      2e3,
      // Sente FU-HI
      1e4,
      1200,
      1200,
      1200,
      1200,
      0,
      2e3,
      2200,
      // Sente OU,TO,NY,NK,NG,UM,RY
      0,
      -100,
      -600,
      -700,
      -1e3,
      -1200,
      -1800,
      -2e3,
      // Gote FU-HI
      -1e4,
      -1200,
      -1200,
      -1200,
      -1200,
      0,
      -2e3,
      -2200
      // Gote OU,TO,NY,NK,NG,UM,RY
    ];
    canPromote = [
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      // Cannot promote
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      // Cannot promote
      false,
      true,
      true,
      true,
      true,
      false,
      true,
      true,
      // Sente pieces
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      // Already promoted
      false,
      true,
      true,
      true,
      true,
      false,
      true,
      true,
      // Gote pieces
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false
      // Already promoted
    ];
    Te = class _Te {
      // Move value for ordering
      constructor(koma = 0, from = 0, to = 0, promote = false, capture = 0) {
        this.koma = koma;
        this.from = from;
        this.to = to;
        this.promote = promote;
        this.capture = capture;
        this.value = 0;
      }
      equals(te) {
        if (!te) return false;
        return te.koma === this.koma && te.from === this.from && te.to === this.to && te.promote === this.promote;
      }
      clone() {
        return new _Te(this.koma, this.from, this.to, this.promote, this.capture);
      }
      toString() {
        const sujiStr = ["", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
        const danStr = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
        const suji = this.to >> 4;
        const dan = this.to & 15;
        return `${sujiStr[suji]}${danStr[dan]}${this.getKomaString()}${this.promote ? "成" : ""}`;
      }
      getKomaString() {
        const komaString = [
          "  ",
          "歩",
          "香",
          "桂",
          "銀",
          "金",
          "角",
          "飛",
          "玉",
          "と",
          "杏",
          "圭",
          "全",
          "",
          "馬",
          "竜"
        ];
        return komaString[getKomashu(this.koma)];
      }
    };
  }
});

// ml/shogi-sfen-codec.ts
function pieceToSfen(piece) {
  const kind = getKomashu(piece);
  const base = kind & 7;
  const promoted = (kind & PROMOTE) !== 0 && base !== 0;
  const letter = kind === 8 ? "K" : SFEN_LETTER[base];
  if (letter === void 0) throw new Error("unknown shogi piece");
  const encoded = `${promoted ? "+" : ""}${letter}`;
  return isSente(piece) ? encoded : encoded.toLowerCase();
}
function toSfen(position, moveNumber) {
  if (!Number.isSafeInteger(moveNumber) || moveNumber <= 0) {
    throw new Error("SFEN move number must be a positive safe integer");
  }
  const rows = [];
  for (let rank = 1; rank <= 9; rank += 1) {
    let row = "";
    let emptyRun = 0;
    for (let file = 9; file >= 1; file -= 1) {
      const piece = position.ban[(file << 4) + rank];
      if (piece === EMPTY) {
        emptyRun += 1;
      } else {
        if (emptyRun > 0) {
          row += String(emptyRun);
          emptyRun = 0;
        }
        row += pieceToSfen(piece);
      }
    }
    if (emptyRun > 0) row += String(emptyRun);
    rows.push(row);
  }
  let hand = "";
  for (const kind of HAND_ORDER) {
    const count = position.hand[SENTE2 + kind] ?? 0;
    if (count > 0) {
      hand += `${count > 1 ? String(count) : ""}${SFEN_LETTER[kind]}`;
    }
  }
  for (const kind of HAND_ORDER) {
    const count = position.hand[GOTE2 + kind] ?? 0;
    if (count > 0) {
      hand += `${count > 1 ? String(count) : ""}${SFEN_LETTER[kind].toLowerCase()}`;
    }
  }
  if (hand === "") hand = "-";
  return `${rows.join("/")} ${position.teban === SENTE2 ? "b" : "w"} ${hand} ${moveNumber}`;
}
var SFEN_LETTER, HAND_ORDER;
var init_shogi_sfen_codec = __esm({
  "ml/shogi-sfen-codec.ts"() {
    "use strict";
    init_types();
    SFEN_LETTER = Object.freeze({
      1: "P",
      2: "L",
      3: "N",
      4: "S",
      5: "G",
      6: "B",
      7: "R",
      8: "K"
    });
    HAND_ORDER = Object.freeze([7, 6, 5, 4, 3, 2, 1]);
  }
});

// src/components/game/ShogiImproved/GenerateMovesImproved.ts
var diffDan, diffSuji, diff, canMove, canJump, GenerateMovesImproved;
var init_GenerateMovesImproved = __esm({
  "src/components/game/ShogiImproved/GenerateMovesImproved.ts"() {
    "use strict";
    init_types();
    diffDan = [1, 1, 1, 0, 0, -1, -1, -1, -2, -2, 2, 2];
    diffSuji = [-1, 0, 1, 1, -1, 1, 0, -1, 1, -1, -1, 1];
    diff = diffSuji.map((s, i) => s * 16 + diffDan[i]);
    canMove = [
      // Direction 0 - diagonal down-left
      [
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        // Cannot move
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        // Cannot move
        false,
        false,
        false,
        false,
        true,
        false,
        false,
        false,
        // Sente pieces
        true,
        false,
        false,
        false,
        false,
        false,
        false,
        true,
        // Sente promoted
        false,
        false,
        false,
        false,
        true,
        true,
        false,
        false,
        // Gote pieces
        true,
        true,
        true,
        true,
        true,
        true,
        false,
        true
        // Gote promoted
      ],
      // Direction 1 - straight down
      [
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        // Cannot move
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        // Cannot move
        false,
        false,
        false,
        false,
        false,
        true,
        false,
        false,
        // Sente pieces
        true,
        true,
        true,
        true,
        true,
        false,
        true,
        false,
        // Sente promoted
        false,
        true,
        false,
        false,
        true,
        true,
        false,
        false,
        // Gote pieces
        true,
        true,
        true,
        true,
        true,
        false,
        true,
        false
        // Gote promoted
      ],
      // Direction 2 - diagonal down-right
      [
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        // Cannot move
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        // Cannot move
        false,
        false,
        false,
        false,
        true,
        false,
        false,
        false,
        // Sente pieces
        true,
        false,
        false,
        false,
        false,
        false,
        false,
        true,
        // Sente promoted
        false,
        false,
        false,
        false,
        true,
        true,
        false,
        false,
        // Gote pieces
        true,
        true,
        true,
        true,
        true,
        true,
        false,
        true
        // Gote promoted
      ],
      // Direction 3 - right
      [
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        // Cannot move
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        // Cannot move
        false,
        false,
        false,
        false,
        false,
        true,
        false,
        false,
        // Sente pieces
        true,
        true,
        true,
        true,
        true,
        false,
        true,
        false,
        // Sente promoted
        false,
        false,
        false,
        false,
        false,
        true,
        false,
        false,
        // Gote pieces
        true,
        true,
        true,
        true,
        true,
        false,
        true,
        false
        // Gote promoted
      ],
      // Direction 4 - left
      [
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        // Cannot move
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        // Cannot move
        false,
        false,
        false,
        false,
        false,
        true,
        false,
        false,
        // Sente pieces
        true,
        true,
        true,
        true,
        true,
        false,
        true,
        false,
        // Sente promoted
        false,
        false,
        false,
        false,
        false,
        true,
        false,
        false,
        // Gote pieces
        true,
        true,
        true,
        true,
        true,
        false,
        true,
        false
        // Gote promoted
      ],
      // Direction 5 - diagonal up-right
      [
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        // Cannot move
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        // Cannot move
        false,
        false,
        false,
        false,
        true,
        true,
        false,
        false,
        // Sente pieces
        true,
        true,
        true,
        true,
        true,
        false,
        false,
        true,
        // Sente promoted
        false,
        false,
        false,
        false,
        true,
        false,
        false,
        false,
        // Gote pieces
        true,
        false,
        false,
        false,
        false,
        false,
        false,
        true
        // Gote promoted
      ],
      // Direction 6 - straight up
      [
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        // Cannot move
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        // Cannot move
        false,
        true,
        false,
        false,
        true,
        true,
        false,
        false,
        // Sente pieces
        true,
        true,
        true,
        true,
        true,
        false,
        true,
        false,
        // Sente promoted
        false,
        false,
        false,
        false,
        false,
        true,
        false,
        false,
        // Gote pieces
        true,
        true,
        true,
        true,
        true,
        false,
        true,
        false
        // Gote promoted
      ],
      // Direction 7 - diagonal up-left
      [
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        // Cannot move
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        // Cannot move
        false,
        false,
        false,
        false,
        true,
        true,
        false,
        false,
        // Sente pieces
        true,
        true,
        true,
        true,
        true,
        false,
        false,
        true,
        // Sente promoted
        false,
        false,
        false,
        false,
        true,
        false,
        false,
        false,
        // Gote pieces
        true,
        false,
        false,
        false,
        false,
        false,
        false,
        true
        // Gote promoted
      ],
      // Direction 8 - knight left-up (sente)
      [
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        // Cannot move
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        // Cannot move
        false,
        false,
        false,
        true,
        false,
        false,
        false,
        false,
        // Sente knight
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        // Sente promoted
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        // Gote pieces
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false
        // Gote promoted
      ],
      // Direction 9 - knight right-up (sente)
      [
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        // Cannot move
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        // Cannot move
        false,
        false,
        false,
        true,
        false,
        false,
        false,
        false,
        // Sente knight
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        // Sente promoted
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        // Gote pieces
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false
        // Gote promoted
      ],
      // Direction 10 - knight left-down (gote)
      [
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        // Cannot move
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        // Cannot move
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        // Sente pieces
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        // Sente promoted
        false,
        false,
        false,
        true,
        false,
        false,
        false,
        false,
        // Gote knight
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false
        // Gote promoted
      ],
      // Direction 11 - knight right-down (gote)
      [
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        // Cannot move
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        // Cannot move
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        // Sente pieces
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        // Sente promoted
        false,
        false,
        false,
        true,
        false,
        false,
        false,
        false,
        // Gote knight
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false
        // Gote promoted
      ]
    ];
    canJump = [
      // Direction 0 - diagonal down-left
      [
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        // Cannot jump
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        // Cannot jump
        false,
        false,
        false,
        false,
        false,
        false,
        true,
        false,
        // Bishop
        false,
        false,
        false,
        false,
        false,
        false,
        true,
        false,
        // Promoted
        false,
        false,
        false,
        false,
        false,
        false,
        true,
        false,
        // Bishop
        false,
        false,
        false,
        false,
        false,
        false,
        true,
        false
        // Promoted
      ],
      // Direction 1 - straight down
      [
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        // Cannot jump
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        // Cannot jump
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        true,
        // Rook
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        true,
        // Promoted
        false,
        false,
        true,
        false,
        false,
        false,
        false,
        true,
        // Lance/Rook
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        true
        // Promoted
      ],
      // Direction 2 - diagonal down-right
      [
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        // Cannot jump
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        // Cannot jump
        false,
        false,
        false,
        false,
        false,
        false,
        true,
        false,
        // Bishop
        false,
        false,
        false,
        false,
        false,
        false,
        true,
        false,
        // Promoted
        false,
        false,
        false,
        false,
        false,
        false,
        true,
        false,
        // Bishop
        false,
        false,
        false,
        false,
        false,
        false,
        true,
        false
        // Promoted
      ],
      // Direction 3 - right
      [
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        // Cannot jump
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        // Cannot jump
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        true,
        // Rook
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        true,
        // Promoted
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        true,
        // Rook
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        true
        // Promoted
      ],
      // Direction 4 - left
      [
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        // Cannot jump
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        // Cannot jump
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        true,
        // Rook
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        true,
        // Promoted
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        true,
        // Rook
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        true
        // Promoted
      ],
      // Direction 5 - diagonal up-right
      [
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        // Cannot jump
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        // Cannot jump
        false,
        false,
        false,
        false,
        false,
        false,
        true,
        false,
        // Bishop
        false,
        false,
        false,
        false,
        false,
        false,
        true,
        false,
        // Promoted
        false,
        false,
        false,
        false,
        false,
        false,
        true,
        false,
        // Bishop
        false,
        false,
        false,
        false,
        false,
        false,
        true,
        false
        // Promoted
      ],
      // Direction 6 - straight up
      [
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        // Cannot jump
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        // Cannot jump
        false,
        false,
        true,
        false,
        false,
        false,
        false,
        true,
        // Lance/Rook
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        true,
        // Promoted
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        true,
        // Rook
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        true
        // Promoted
      ],
      // Direction 7 - diagonal up-left
      [
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        // Cannot jump
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        // Cannot jump
        false,
        false,
        false,
        false,
        false,
        false,
        true,
        false,
        // Bishop
        false,
        false,
        false,
        false,
        false,
        false,
        true,
        false,
        // Promoted
        false,
        false,
        false,
        false,
        false,
        false,
        true,
        false,
        // Bishop
        false,
        false,
        false,
        false,
        false,
        false,
        true,
        false
        // Promoted
      ]
    ];
    GenerateMovesImproved = class {
      /**
       * Returns true if `teban`'s king is attacked by any enemy piece in the current position.
       *
       * This is a core primitive used in:
       * - legality filtering (`removeSelfMate`)
       * - move validation (`isLegalMove`)
       * - search extensions / quiescence (checking positions are tactically sharp)
       *
       * Notes:
       * - This function does NOT modify the position.
       * - It assumes `KyokumenImproved.searchGyoku(teban)` returns the current king square for that side.
       */
      static isKingInCheck(k, teban) {
        const gyokuPosition = k.searchGyoku(teban);
        if (gyokuPosition < 0) return true;
        return this.isSquareAttacked(k, gyokuPosition, teban);
      }
      /**
       * Returns true if `target` is attacked by the enemy of `teban`.
       *
       * This is a generalization of `isKingInCheck()`:
       * - `isKingInCheck(k, teban)` is equivalent to `isSquareAttacked(k, kingSquare, teban)`
       *
       * Why this exists:
       * - Move ordering heuristics sometimes need to know if a dropped/moved piece is immediately capturable.
       * - Doing a full `generateLegalMoves()` for the opponent is much more expensive than this direct attack test.
       *
       * Notes:
       * - This function does NOT modify the position.
       * - `teban` is the *defender* (the side that owns the piece sitting on `target`).
       */
      static isSquareAttacked(k, target, teban) {
        const ban = k.ban;
        if (target <= 0 || ban[target] === WALL) return false;
        const enemyFlag = teban === SENTE2 ? GOTE2 : SENTE2;
        const selfFlag = teban === SENTE2 ? SENTE2 : GOTE2;
        for (let direct = 0; direct < 12; direct++) {
          const pos = target - diff[direct];
          const koma = pos >= 0 ? ban[pos] : WALL;
          if ((koma & enemyFlag) !== 0 && canMove[direct][koma]) {
            return true;
          }
        }
        for (let direct = 0; direct < 8; direct++) {
          const step = diff[direct];
          const cj = canJump[direct];
          let pos = target - step;
          let koma = ban[pos] ?? WALL;
          while (koma !== WALL) {
            if (koma !== EMPTY) {
              if ((koma & selfFlag) !== 0) break;
              if (cj[koma]) return true;
              break;
            }
            pos -= step;
            koma = ban[pos] ?? WALL;
          }
        }
        return false;
      }
      /**
       * Returns the absolute value (material) of the least valuable *enemy* attacker of `target`,
       * or `Infinity` if `target` is not attacked.
       *
       * Conventions:
       * - `teban` is the *defender* (the side that owns the piece sitting on `target`).
       * - Attackers are the enemy of `teban`.
       */
      static getLeastAttackerValue(k, target, teban) {
        const ban = k.ban;
        if (target <= 0 || ban[target] === WALL) return Infinity;
        const enemyFlag = teban === SENTE2 ? GOTE2 : SENTE2;
        const selfFlag = teban === SENTE2 ? SENTE2 : GOTE2;
        let best = Infinity;
        for (let direct = 0; direct < 12; direct++) {
          const pos = target - diff[direct];
          const koma = pos >= 0 ? ban[pos] : WALL;
          if ((koma & enemyFlag) !== 0 && canMove[direct][koma]) {
            const value = Math.abs(komaValue[koma]) | 0;
            if (value < best) best = value;
          }
        }
        for (let direct = 0; direct < 8; direct++) {
          const step = diff[direct];
          const cj = canJump[direct];
          let pos = target - step;
          let koma = ban[pos] ?? WALL;
          while (koma !== WALL) {
            if (koma !== EMPTY) {
              if ((koma & selfFlag) !== 0) break;
              if (cj[koma]) {
                const value = Math.abs(komaValue[koma]) | 0;
                if (value < best) best = value;
              }
              break;
            }
            pos -= step;
            koma = ban[pos] ?? WALL;
          }
        }
        return best;
      }
      // Remove self-mate moves
      static removeSelfMate(k, v) {
        const removed = [];
        for (const te of v) {
          te.capture = k.get(te.to);
          k.move(te);
          const isOuteHouchi = this.isKingInCheck(k, k.teban);
          k.back(te);
          if (!isOuteHouchi) removed.push(te);
        }
        return removed;
      }
      // Add a move with promotion consideration
      static addTe(k, v, teban, koma, from, to) {
        if (teban === SENTE2) {
          if ((getKomashu(koma) === KY || getKomashu(koma) === FU) && (to & 15) === 1) {
            const te = new Te(koma, from, to, true, k.get(to));
            v.push(te);
          } else if (getKomashu(koma) === KE && (to & 15) <= 2) {
            const te = new Te(koma, from, to, true, k.get(to));
            v.push(te);
          } else if (((to & 15) <= 3 || (from & 15) <= 3) && canPromote[koma]) {
            const komashu = getKomashu(koma);
            const forcePromoteMajor = komashu === KA || komashu === HI;
            const te1 = new Te(koma, from, to, true, k.get(to));
            v.push(te1);
            if (!forcePromoteMajor) {
              const te2 = new Te(koma, from, to, false, k.get(to));
              v.push(te2);
            }
          } else {
            const te = new Te(koma, from, to, false, k.get(to));
            v.push(te);
          }
        } else {
          if ((getKomashu(koma) === KY || getKomashu(koma) === FU) && (to & 15) === 9) {
            const te = new Te(koma, from, to, true, k.get(to));
            v.push(te);
          } else if (getKomashu(koma) === KE && (to & 15) >= 8) {
            const te = new Te(koma, from, to, true, k.get(to));
            v.push(te);
          } else if (((to & 15) >= 7 || (from & 15) >= 7) && canPromote[koma]) {
            const komashu = getKomashu(koma);
            const forcePromoteMajor = komashu === KA || komashu === HI;
            const te1 = new Te(koma, from, to, true, k.get(to));
            v.push(te1);
            if (!forcePromoteMajor) {
              const te2 = new Te(koma, from, to, false, k.get(to));
              v.push(te2);
            }
          } else {
            const te = new Te(koma, from, to, false, k.get(to));
            v.push(te);
          }
        }
      }
      // Check for pawn drop checkmate (uchifuzume)
      static isUtiFuDume(k, te) {
        if (te.from !== 0) {
          return false;
        }
        if (getKomashu(te.koma) !== FU) {
          return false;
        }
        let teban;
        let tebanAite;
        if ((te.koma & SENTE2) !== 0) {
          teban = SENTE2;
          tebanAite = GOTE2;
        } else {
          teban = GOTE2;
          tebanAite = SENTE2;
        }
        const gyokuPositionAite = k.searchGyoku(tebanAite);
        if (teban === SENTE2) {
          if (gyokuPositionAite !== te.to - 1) {
            return false;
          }
        } else {
          if (gyokuPositionAite !== te.to + 1) {
            return false;
          }
        }
        const captureOrig = te.capture;
        te.capture = k.get(te.to);
        const tebanOrig = k.teban;
        k.move(te);
        k.setTeban(tebanAite);
        try {
          return this.generateLegalMoves(k).length === 0;
        } finally {
          k.setTeban(tebanOrig);
          k.back(te);
          te.capture = captureOrig;
        }
      }
      // Generate all legal moves for the position
      static generateLegalMoves(k) {
        const v = [];
        for (let suji = 16; suji <= 144; suji += 16) {
          for (let dan = 1; dan <= 9; dan++) {
            const from = dan + suji;
            const koma = k.get(from);
            if (isSelf(k.teban, koma)) {
              for (let direct = 0; direct < 12; direct++) {
                if (canMove[direct][koma]) {
                  const to = from + diff[direct];
                  if (1 <= to >> 4 && to >> 4 <= 9 && 1 <= (to & 15) && (to & 15) <= 9) {
                    if (isSelf(k.teban, k.get(to))) {
                      continue;
                    }
                    this.addTe(k, v, k.teban, koma, from, to);
                  }
                }
              }
              for (let direct = 0; direct < 8; direct++) {
                if (canJump[direct][koma]) {
                  for (let i = 1; i < 9; i++) {
                    const to = from + diff[direct] * i;
                    if (k.get(to) === WALL) break;
                    if (isSelf(k.teban, k.get(to))) break;
                    this.addTe(k, v, k.teban, koma, from, to);
                    if (k.get(to) !== EMPTY) break;
                  }
                }
              }
            }
          }
        }
        for (let i = FU; i <= HI; i++) {
          const koma = i | k.teban;
          if (k.hand[koma] > 0) {
            const komashu = getKomashu(koma);
            for (let suji = 16; suji <= 144; suji += 16) {
              if (komashu === FU) {
                let isNifu = false;
                for (let dan = 1; dan <= 9; dan++) {
                  const p = suji + dan;
                  if (k.get(p) === (k.teban | FU)) {
                    isNifu = true;
                    break;
                  }
                }
                if (isNifu) {
                  continue;
                }
              }
              for (let dan = 1; dan <= 9; dan++) {
                if (komashu === KE) {
                  if (k.teban === SENTE2 && dan <= 2) {
                    continue;
                  } else if (k.teban === GOTE2 && dan >= 8) {
                    continue;
                  }
                }
                if (komashu === FU || komashu === KY) {
                  if (k.teban === SENTE2 && dan === 1) {
                    continue;
                  } else if (k.teban === GOTE2 && dan === 9) {
                    continue;
                  }
                }
                const from = 0;
                const to = suji + dan;
                if (k.get(to) !== EMPTY) {
                  continue;
                }
                const te = new Te(koma, from, to, false, EMPTY);
                if (this.isUtiFuDume(k, te)) {
                  continue;
                }
                v.push(te);
              }
            }
          }
        }
        return this.removeSelfMate(k, v);
      }
      /**
       * Generate all legal moves, but reuse `Te` objects inside `out` to avoid per-node allocations.
       *
       * Intended usage:
       * - engines that search deeply (V11+) should call this instead of `generateLegalMoves()`
       *   to reduce GC pressure and search deeper within the same time budget.
       *
       * Notes:
       * - The returned array is `out.moves` and is only valid until the next call that mutates `out`.
       * - This function mutates `out.size` and trims `out.moves.length` to `out.size`.
       */
      static generateLegalMovesPooled(k, out) {
        this.generatePseudoLegalMovesPooled(k, out);
        this.removeSelfMateInPlace(k, out);
        return out.trim();
      }
      /**
       * Pseudo-legal pooled generation (V20 speed path).
       *
       * Same as `generateLegalMovesPooled` except moves that leave the mover's own king in check are
       * NOT filtered out. Rationale: with alpha-beta most nodes cut off after searching 1-3 moves, so
       * paying make/unmake + a king-attack scan for *every* generated move up front (60-120 per node)
       * wastes the bulk of the search budget. Callers must do the legality test lazily:
       *
       *   k.move(te);
       *   if (GenerateMovesImproved.isKingInCheck(k, k.teban)) { k.back(te); continue; }
       *
       * Nifu, drop restrictions and uchifuzume are still enforced here (they are cheap or rare).
       */
      static generatePseudoLegalMovesPooled(k, out) {
        out.reset();
        for (let suji = 16; suji <= 144; suji += 16) {
          for (let dan = 1; dan <= 9; dan++) {
            const from = dan + suji;
            const koma = k.get(from);
            if (!isSelf(k.teban, koma)) continue;
            for (let direct = 0; direct < 12; direct++) {
              if (!canMove[direct][koma]) continue;
              const to = from + diff[direct];
              if (1 <= to >> 4 && to >> 4 <= 9 && 1 <= (to & 15) && (to & 15) <= 9) {
                if (isSelf(k.teban, k.get(to))) continue;
                this.addTePooled(k, out, k.teban, koma, from, to);
              }
            }
            for (let direct = 0; direct < 8; direct++) {
              if (!canJump[direct][koma]) continue;
              for (let i = 1; i < 9; i++) {
                const to = from + diff[direct] * i;
                if (k.get(to) === WALL) break;
                if (isSelf(k.teban, k.get(to))) break;
                this.addTePooled(k, out, k.teban, koma, from, to);
                if (k.get(to) !== EMPTY) break;
              }
            }
          }
        }
        let hasDrop = false;
        for (let i = FU; i <= HI; i++) {
          if (k.hand[i | k.teban] > 0) {
            hasDrop = true;
            break;
          }
        }
        if (hasDrop) {
          const ban = k.ban;
          const ownPawn = k.teban | FU;
          const emptyBits = new Array(10).fill(0);
          const sujiHasOwnPawn = new Array(10).fill(false);
          for (let suji = 16; suji <= 144; suji += 16) {
            let bits = 0;
            let nifu = false;
            for (let dan = 1; dan <= 9; dan++) {
              const c = ban[suji + dan];
              if (c === EMPTY) bits |= 1 << dan;
              else if (c === ownPawn) nifu = true;
            }
            const s = suji >> 4;
            emptyBits[s] = bits;
            sujiHasOwnPawn[s] = nifu;
          }
          const sente = k.teban === SENTE2;
          for (let i = FU; i <= HI; i++) {
            const koma = i | k.teban;
            if (k.hand[koma] <= 0) continue;
            const komashu = getKomashu(koma);
            for (let suji = 16; suji <= 144; suji += 16) {
              const s = suji >> 4;
              if (komashu === FU && sujiHasOwnPawn[s]) continue;
              const bits = emptyBits[s];
              if (bits === 0) continue;
              for (let dan = 1; dan <= 9; dan++) {
                if ((bits & 1 << dan) === 0) continue;
                if (komashu === KE) {
                  if (sente && dan <= 2) continue;
                  if (!sente && dan >= 8) continue;
                }
                if (komashu === FU || komashu === KY) {
                  if (sente && dan === 1) continue;
                  if (!sente && dan === 9) continue;
                }
                const to = suji + dan;
                const before = out.size;
                out.push(koma, 0, to, false, EMPTY);
                const te = out.moves[before];
                if (komashu === FU && this.isUtiFuDume(k, te)) {
                  out.size = before;
                  continue;
                }
              }
            }
          }
        }
        return out.trim();
      }
      static addTePooled(k, out, teban, koma, from, to) {
        const capture = k.get(to);
        if (teban === SENTE2) {
          if ((getKomashu(koma) === KY || getKomashu(koma) === FU) && (to & 15) === 1) {
            out.push(koma, from, to, true, capture);
          } else if (getKomashu(koma) === KE && (to & 15) <= 2) {
            out.push(koma, from, to, true, capture);
          } else if (((to & 15) <= 3 || (from & 15) <= 3) && canPromote[koma]) {
            const komashu = getKomashu(koma);
            const forcePromoteMajor = komashu === KA || komashu === HI;
            out.push(koma, from, to, true, capture);
            if (!forcePromoteMajor) out.push(koma, from, to, false, capture);
          } else {
            out.push(koma, from, to, false, capture);
          }
          return;
        }
        if ((getKomashu(koma) === KY || getKomashu(koma) === FU) && (to & 15) === 9) {
          out.push(koma, from, to, true, capture);
        } else if (getKomashu(koma) === KE && (to & 15) >= 8) {
          out.push(koma, from, to, true, capture);
        } else if (((to & 15) >= 7 || (from & 15) >= 7) && canPromote[koma]) {
          const komashu = getKomashu(koma);
          const forcePromoteMajor = komashu === KA || komashu === HI;
          out.push(koma, from, to, true, capture);
          if (!forcePromoteMajor) out.push(koma, from, to, false, capture);
        } else {
          out.push(koma, from, to, false, capture);
        }
      }
      /**
       * Filter out moves that leave the mover's king in check (王手放置).
       *
       * This is the pooled equivalent of `removeSelfMate()`:
       * - It does not allocate a new array.
       * - It compacts the list in-place by swapping `Te` object references.
       */
      static removeSelfMateInPlace(k, out) {
        const moves = out.moves;
        let write = 0;
        for (let read = 0; read < out.size; read++) {
          const te = moves[read];
          te.capture = k.get(te.to);
          k.move(te);
          const isOuteHouchi = this.isKingInCheck(k, k.teban);
          k.back(te);
          if (isOuteHouchi) continue;
          if (write !== read) {
            const tmp = moves[write];
            moves[write] = te;
            moves[read] = tmp;
          }
          write++;
        }
        out.size = write;
      }
      // Evaluate moves for ordering
      static evaluateTe(k, v) {
        const nowEval = k.evaluate();
        for (const te of v) {
          k.move(te);
          te.value = k.evaluate() - nowEval;
          k.back(te);
          if (k.teban === GOTE2) {
            te.value = -te.value;
          }
          if (te.promote) {
            te.value += 2e3;
          }
          if (te.capture !== EMPTY) {
            const captureKomashu = getKomashu(te.capture);
            if (captureKomashu === HI || captureKomashu === KA) {
              te.value += 3e3;
            } else if (captureKomashu === KI || captureKomashu === GI) {
              te.value += 2e3;
            } else if (captureKomashu !== FU) {
              te.value += 1500;
            } else {
              te.value += 500;
            }
          }
        }
        v.sort((a, b) => b.value - a.value);
      }
      // Check if a move is legal
      static isLegalMove(k, t) {
        if (t.from > 0 && k.ban[t.from] !== t.koma) {
          return false;
        }
        if (t.from === 0 && k.hand[t.koma] === 0) {
          return false;
        }
        if (t.from === 0 && k.ban[t.to] !== EMPTY) {
          return false;
        }
        if (isSelf(t.koma & (SENTE2 | GOTE2), k.ban[t.to])) {
          return false;
        }
        if (this.isUtiFuDume(k, t)) {
          return false;
        }
        t.capture = k.get(t.to);
        k.move(t);
        const isOuteHouchi = this.isKingInCheck(k, k.teban);
        k.back(t);
        if (isOuteHouchi) return false;
        return true;
      }
      // Make priority moves first (for move ordering)
      static makeMoveFirst(k, depth, best, e) {
        const v = [];
        if (e && e.best && this.isLegalMove(k, e.best)) {
          v.push(e.best);
        }
        if (depth > 0 && best[depth - 1][depth] && this.isLegalMove(k, best[depth - 1][depth])) {
          v.push(best[depth - 1][depth]);
        }
        if (e && e.second && this.isLegalMove(k, e.second)) {
          v.push(e.second);
        }
        return v;
      }
    };
  }
});

// src/components/game/ShogiImproved/KyokumenImproved.ts
var KyokumenImproved;
var init_KyokumenImproved = __esm({
  "src/components/game/ShogiImproved/KyokumenImproved.ts"() {
    "use strict";
    init_types();
    KyokumenImproved = class _KyokumenImproved {
      static {
        this.EVAL_V3_SHIFT = 7;
      }
      static {
        // fixed-point scale: 1.0 === 1<<7
        this.EVAL_V3_HALF = 1 << _KyokumenImproved.EVAL_V3_SHIFT - 1;
      }
      static {
        // Phase buckets are indexed as: 0=endgame ... 3=opening (based on total captured pieces in hand).
        // Weights are scaled by 1<<EVAL_V3_SHIFT (128).
        // - Keep opening heuristics strong in the opening (weight=128) so shallow searches avoid basic disasters.
        // - Gradually down-weight them as trades accumulate so they don't dominate mid/endgame evaluation.
        this.EVAL_V3_PSQT_W = new Int16Array([96, 112, 128, 160]);
      }
      static {
        this.EVAL_V3_CASTLE_W = new Int16Array([32, 64, 96, 128]);
      }
      static {
        this.EVAL_V3_FILE_DEFENSE_W = new Int16Array([32, 64, 96, 128]);
      }
      static {
        this.EVAL_V3_PROMO_THREAT_W = new Int16Array([64, 96, 112, 128]);
      }
      static {
        // Candidate weights for `evaluateV3Tuned()` (eval mode 'v3t').
        // These exist so tuning experiments (scripts/shogi-texel-tune.ts) can be A/B validated
        // *directly* against the current v3 weights in a single self-play match.
        // They default to the v3 values; override via `setEvalV3TunedWeights()`.
        this.EVAL_V3T_PSQT_W = new Int16Array(_KyokumenImproved.EVAL_V3_PSQT_W);
      }
      static {
        this.EVAL_V3T_CASTLE_W = new Int16Array(_KyokumenImproved.EVAL_V3_CASTLE_W);
      }
      static {
        this.EVAL_V3T_FILE_DEFENSE_W = new Int16Array(_KyokumenImproved.EVAL_V3_FILE_DEFENSE_W);
      }
      static {
        this.EVAL_V3T_PROMO_THREAT_W = new Int16Array(_KyokumenImproved.EVAL_V3_PROMO_THREAT_W);
      }
      /**
       * Override the phase-indexed evaluation weights used by `evaluateV3()`.
       *
       * Intended for offline tuning tools (e.g. `scripts/shogi-texel-tune.ts`) and A/B match
       * harnesses so they can inject candidate weights without editing this file.
       * Each array must have exactly 4 entries (index 0=endgame ... 3=opening), fixed-point
       * with denominator 1<<EVAL_V3_SHIFT (128 === 1.0).
       */
      static setEvalV3Weights(weights) {
        const apply = (target, source, name) => {
          if (!source) return;
          if (source.length !== target.length) {
            throw new Error(`setEvalV3Weights: "${name}" must have ${target.length} entries, got ${source.length}`);
          }
          for (let i = 0; i < target.length; i++) target[i] = source[i] | 0;
        };
        apply(_KyokumenImproved.EVAL_V3_PSQT_W, weights.psqt, "psqt");
        apply(_KyokumenImproved.EVAL_V3_CASTLE_W, weights.castle, "castle");
        apply(_KyokumenImproved.EVAL_V3_FILE_DEFENSE_W, weights.fileDefense, "fileDefense");
        apply(_KyokumenImproved.EVAL_V3_PROMO_THREAT_W, weights.promoThreat, "promoThreat");
      }
      /**
       * Same as `setEvalV3Weights`, but targets the candidate weights used by `evaluateV3Tuned()`
       * (eval mode 'v3t'), so a tuned candidate can play directly against the current v3 weights.
       */
      static setEvalV3TunedWeights(weights) {
        const apply = (target, source, name) => {
          if (!source) return;
          if (source.length !== target.length) {
            throw new Error(`setEvalV3TunedWeights: "${name}" must have ${target.length} entries, got ${source.length}`);
          }
          for (let i = 0; i < target.length; i++) target[i] = source[i] | 0;
        };
        apply(_KyokumenImproved.EVAL_V3T_PSQT_W, weights.psqt, "psqt");
        apply(_KyokumenImproved.EVAL_V3T_CASTLE_W, weights.castle, "castle");
        apply(_KyokumenImproved.EVAL_V3T_FILE_DEFENSE_W, weights.fileDefense, "fileDefense");
        apply(_KyokumenImproved.EVAL_V3T_PROMO_THREAT_W, weights.promoThreat, "promoThreat");
      }
      /** Snapshot of the current `evaluateV3()` weights (see `setEvalV3Weights`). */
      static getEvalV3Weights() {
        return {
          psqt: Array.from(_KyokumenImproved.EVAL_V3_PSQT_W),
          castle: Array.from(_KyokumenImproved.EVAL_V3_CASTLE_W),
          fileDefense: Array.from(_KyokumenImproved.EVAL_V3_FILE_DEFENSE_W),
          promoThreat: Array.from(_KyokumenImproved.EVAL_V3_PROMO_THREAT_W)
        };
      }
      /** Snapshot of the current `evaluateV3Tuned()` weights (see `setEvalV3TunedWeights`). */
      static getEvalV3TunedWeights() {
        return {
          psqt: Array.from(_KyokumenImproved.EVAL_V3T_PSQT_W),
          castle: Array.from(_KyokumenImproved.EVAL_V3T_CASTLE_W),
          fileDefense: Array.from(_KyokumenImproved.EVAL_V3T_FILE_DEFENSE_W),
          promoThreat: Array.from(_KyokumenImproved.EVAL_V3T_PROMO_THREAT_W)
        };
      }
      static scaleEvalV3(value, weight) {
        const product = Math.imul(value | 0, weight | 0);
        return product >= 0 ? product + _KyokumenImproved.EVAL_V3_HALF >> _KyokumenImproved.EVAL_V3_SHIFT : product - _KyokumenImproved.EVAL_V3_HALF >> _KyokumenImproved.EVAL_V3_SHIFT;
      }
      static {
        // Hash seeds (Zobrist hashing)
        this.HashSeed = [];
      }
      static {
        this.HandHashSeed = [];
      }
      static {
        this.TebanHashSeed = 0;
      }
      static {
        this.hashInitialized = false;
      }
      static {
        // Piece-square tables (SENTE perspective). Indexed by (koma & 0x0f) then 81-square index.
        this.PSQT = [];
      }
      static {
        this.psqtInitialized = false;
      }
      constructor() {
        this.ban = new Array(16 * 11);
        this.hand = new Array(GHI + 1).fill(0);
        this.teban = SENTE2;
        this.eval = 0;
        this.psqtEval = 0;
        this.kingS = -34;
        this.kingG = -34;
        this.HashVal = 0;
        this.BanHash = 0;
        this.HandHash = 0;
        for (let i = 0; i < 16 * 11; i++) {
          this.ban[i] = WALL;
        }
        for (let suji = 1; suji <= 9; suji++) {
          for (let dan = 1; dan <= 9; dan++) {
            this.ban[(suji << 4) + dan] = EMPTY;
          }
        }
        if (!_KyokumenImproved.hashInitialized) {
          _KyokumenImproved.initializeHash();
        }
        if (!_KyokumenImproved.psqtInitialized) {
          _KyokumenImproved.initializePsqt();
        }
      }
      /**
       * Initialize Zobrist hash seeds (static).
       *
       * Why this is careful:
       * - Transposition Tables only work if hashes are well-distributed and actually change per position.
       * - A previous approach used 48-bit bitwise operations (like Java's LCG) but JavaScript bitwise operators are
       *   *32-bit*, which can accidentally produce all zeros and collapse the entire TT (every position hashes to 0).
       *
       * This implementation uses a deterministic 32-bit PRNG (Mulberry32-ish) via `Math.imul` so:
       * - seeds are stable across runtime/environment
       * - values are non-zero and well-mixed for our purposes
       */
      static initializeHash() {
        let seed = 1831565813 >>> 0;
        const rand32 = () => {
          seed = seed + 1831565813 >>> 0;
          let t = seed;
          t = Math.imul(t ^ t >>> 15, t | 1);
          t ^= t + Math.imul(t ^ t >>> 7, t | 61);
          return (t ^ t >>> 14) >>> 0;
        };
        const rand30 = () => rand32() & 1073741823;
        this.HashSeed = Array(GRY + 1).fill(null).map(() => new Array(16 * 11).fill(0));
        for (let i = 0; i <= GRY; i++) {
          for (let j = 0; j < 16 * 11; j++) {
            this.HashSeed[i][j] = rand30();
          }
        }
        this.HandHashSeed = Array(GHI + 1).fill(null).map(() => new Array(20).fill(0));
        for (let i = 0; i <= GHI; i++) {
          for (let j = 0; j < 20; j++) {
            this.HandHashSeed[i][j] = rand30();
          }
        }
        this.TebanHashSeed = rand30() || 1;
        this.hashInitialized = true;
      }
      /**
       * Initialize PSQT tables (static).
       *
       * Conventions:
       * - Tables are defined from SENTE's perspective.
       * - For GOTE pieces we mirror the rank (dan' = 10 - dan) and flip the sign.
       *
       * Magnitudes are intentionally small compared to material (歩=100) so tactics still dominate.
       */
      static initializePsqt() {
        const make81 = (valueAt) => {
          const t = new Int16Array(81);
          let idx = 0;
          for (let dan = 1; dan <= 9; dan++) {
            for (let suji = 1; suji <= 9; suji++) {
              t[idx++] = valueAt(suji, dan);
            }
          }
          return t;
        };
        const centerFile = (suji) => 4 - Math.abs(suji - 5);
        const centerRank = (dan) => 4 - Math.abs(dan - 5);
        const pawnRank = [0, 0, 18, 16, 14, 12, 10, 6, 2, 0];
        const lanceRank = [0, 0, 14, 12, 10, 8, 6, 4, 2, 0];
        const knightRank = [0, 0, 0, 10, 14, 16, 14, 10, 4, 0];
        const silverRank = [0, 0, 6, 10, 12, 14, 16, 14, 10, 0];
        const goldRank = [0, 0, 2, 4, 6, 8, 10, 12, 14, 16];
        const goldLikeAdvanced = [0, 0, 18, 16, 14, 12, 10, 8, 6, 4];
        this.PSQT = new Array(16);
        for (let i = 0; i < this.PSQT.length; i++) this.PSQT[i] = new Int16Array(81);
        this.PSQT[FU] = make81((suji, dan) => pawnRank[dan] + centerFile(suji));
        this.PSQT[KY] = make81((suji, dan) => lanceRank[dan] + centerFile(suji));
        this.PSQT[KE] = make81((suji, dan) => knightRank[dan] + centerFile(suji) * 2);
        this.PSQT[GI] = make81((suji, dan) => silverRank[dan] + centerFile(suji));
        this.PSQT[KI] = make81((suji, dan) => goldRank[dan] + centerFile(suji));
        this.PSQT[KA] = make81((suji, dan) => centerFile(suji) * 3 + centerRank(dan) * 3);
        this.PSQT[HI] = make81((suji, dan) => centerFile(suji) * 2 + centerRank(dan) * 2);
        this.PSQT[OU] = make81((suji, dan) => {
          const distFromCenter = Math.abs(suji - 5) + Math.abs(dan - 5);
          const home = dan >= 8 ? 4 : 0;
          return Math.min(18, distFromCenter * 2 + home);
        });
        this.PSQT[TO] = make81((suji, dan) => goldLikeAdvanced[dan] + centerFile(suji));
        this.PSQT[NY] = make81((suji, dan) => goldLikeAdvanced[dan] + centerFile(suji));
        this.PSQT[NK] = make81((suji, dan) => goldLikeAdvanced[dan] + centerFile(suji));
        this.PSQT[NG] = make81((suji, dan) => goldLikeAdvanced[dan] + centerFile(suji));
        this.PSQT[UM] = make81((suji, dan) => 6 + centerFile(suji) * 3 + centerRank(dan) * 3);
        this.PSQT[RY] = make81((suji, dan) => 6 + centerFile(suji) * 3 + centerRank(dan) * 3);
        this.psqtInitialized = true;
      }
      static psqtValue(koma, pos) {
        if (koma === EMPTY || koma === WALL) return 0;
        const suji = pos >> 4;
        const dan0 = pos & 15;
        if (suji < 1 || suji > 9 || dan0 < 1 || dan0 > 9) return 0;
        const type = koma & 15;
        const table = _KyokumenImproved.PSQT[type];
        if (!table) return 0;
        const isS = isSente(koma);
        const dan = isS ? dan0 : 10 - dan0;
        const idx = (dan - 1) * 9 + (suji - 1);
        const v = table[idx] | 0;
        return isS ? v : -v;
      }
      // Clone the position
      clone() {
        const k = new _KyokumenImproved();
        for (let i = 0; i < 16 * 11; i++) {
          k.ban[i] = this.ban[i];
        }
        for (let i = SFU; i <= GHI; i++) {
          k.hand[i] = this.hand[i];
        }
        k.teban = this.teban;
        k.eval = this.eval;
        k.psqtEval = this.psqtEval;
        k.kingS = this.kingS;
        k.kingG = this.kingG;
        k.HashVal = this.HashVal;
        k.BanHash = this.BanHash;
        k.HandHash = this.HandHash;
        return k;
      }
      /**
       * Set the side to move while keeping the incremental Zobrist hash consistent.
       *
       * Why a helper exists:
       * - `HashVal` now includes side-to-move, so `teban = ...` is no longer a "free" assignment.
       * - The search flips the side very frequently; XOR'ing a single seed is much cheaper than a full re-hash.
       */
      setTeban(teban) {
        if (this.teban === teban) return;
        this.teban = teban;
        this.HashVal ^= _KyokumenImproved.TebanHashSeed;
      }
      /**
       * Toggle side-to-move while keeping `HashVal` consistent.
       * Equivalent to `setTeban(this.teban === SENTE ? GOTE : SENTE)` but slightly cheaper.
       */
      toggleTeban() {
        this.teban = this.teban === SENTE2 ? GOTE2 : SENTE2;
        this.HashVal ^= _KyokumenImproved.TebanHashSeed;
      }
      // Check if positions are equal
      equals(k) {
        if (this.teban !== k.teban) {
          return false;
        }
        for (let suji = 16; suji <= 144; suji += 16) {
          for (let dan = 1; dan <= 9; dan++) {
            if (this.ban[suji + dan] !== k.ban[suji + dan]) {
              return false;
            }
          }
        }
        for (let i = SFU; i <= GHI; i++) {
          if (this.hand[i] !== k.hand[i]) {
            return false;
          }
        }
        return true;
      }
      // Get piece at position
      get(p) {
        if (p < 0 || p > 16 * 11) {
          return WALL;
        }
        return this.ban[p];
      }
      // Put piece at position
      put(p, koma) {
        this.ban[p] = koma;
      }
      // Make a move (CRITICAL: matches Java logic exactly)
      move(te) {
        const capturedKoma = this.get(te.to);
        if (capturedKoma !== EMPTY) {
          this.psqtEval -= _KyokumenImproved.psqtValue(capturedKoma, te.to);
        }
        if (te.from !== 0) {
          this.psqtEval -= _KyokumenImproved.psqtValue(te.koma, te.from);
        }
        this.BanHash ^= _KyokumenImproved.HashSeed[this.get(te.to)][te.to];
        if (this.get(te.to) !== EMPTY) {
          this.eval -= komaValue[this.get(te.to)];
          if (isSente(this.get(te.to))) {
            let koma2 = this.get(te.to);
            koma2 = koma2 & 7;
            koma2 = koma2 | GOTE2;
            this.hand[koma2]++;
            this.HandHash ^= _KyokumenImproved.HandHashSeed[koma2][this.hand[koma2]];
            this.eval += komaValue[koma2];
          } else {
            let koma2 = this.get(te.to);
            koma2 = koma2 & 7;
            koma2 = koma2 | SENTE2;
            this.hand[koma2]++;
            this.HandHash ^= _KyokumenImproved.HandHashSeed[koma2][this.hand[koma2]];
            this.eval += komaValue[koma2];
          }
        }
        if (te.from === 0) {
          this.HandHash ^= _KyokumenImproved.HandHashSeed[te.koma][this.hand[te.koma]];
          this.hand[te.koma]--;
        } else {
          this.put(te.from, EMPTY);
          this.BanHash ^= _KyokumenImproved.HashSeed[te.koma][te.from];
          this.BanHash ^= _KyokumenImproved.HashSeed[EMPTY][te.from];
        }
        let koma = te.koma;
        if (te.promote) {
          this.eval -= komaValue[koma];
          koma = koma | PROMOTE;
          this.eval += komaValue[koma];
        }
        this.put(te.to, koma);
        this.BanHash ^= _KyokumenImproved.HashSeed[koma][te.to];
        this.psqtEval += _KyokumenImproved.psqtValue(koma, te.to);
        if (te.koma === SOU) {
          this.kingS = te.to;
        } else if (te.koma === GOU) {
          this.kingG = te.to;
        }
        this.HashVal = this.BanHash ^ this.HandHash ^ (this.teban === GOTE2 ? _KyokumenImproved.TebanHashSeed : 0);
      }
      // Undo a move (CRITICAL: matches Java logic exactly)
      back(te) {
        this.BanHash ^= _KyokumenImproved.HashSeed[this.get(te.to)][te.to];
        this.psqtEval -= _KyokumenImproved.psqtValue(this.get(te.to), te.to);
        this.put(te.to, te.capture);
        this.BanHash ^= _KyokumenImproved.HashSeed[te.capture][te.to];
        if (te.capture !== EMPTY) {
          this.psqtEval += _KyokumenImproved.psqtValue(te.capture, te.to);
        }
        this.eval += komaValue[te.capture];
        if (te.capture !== EMPTY) {
          if (isSente(te.capture)) {
            let koma = te.capture;
            koma = koma & 7;
            koma = koma | GOTE2;
            this.HandHash ^= _KyokumenImproved.HandHashSeed[koma][this.hand[koma]];
            this.hand[koma]--;
            this.eval -= komaValue[koma];
          } else {
            let koma = te.capture;
            koma = koma & 7;
            koma = koma | SENTE2;
            this.HandHash ^= _KyokumenImproved.HandHashSeed[koma][this.hand[koma]];
            this.hand[koma]--;
            this.eval -= komaValue[koma];
          }
        }
        if (te.from === 0) {
          this.hand[te.koma]++;
          this.HandHash ^= _KyokumenImproved.HandHashSeed[te.koma][this.hand[te.koma]];
        } else {
          this.put(te.from, te.koma);
          this.BanHash ^= _KyokumenImproved.HashSeed[EMPTY][te.from];
          this.BanHash ^= _KyokumenImproved.HashSeed[te.koma][te.from];
          this.psqtEval += _KyokumenImproved.psqtValue(te.koma, te.from);
          if (te.promote) {
            const koma = te.koma | PROMOTE;
            this.eval -= komaValue[koma];
            this.eval += komaValue[te.koma];
          }
        }
        if (te.koma === SOU) {
          this.kingS = te.from;
        } else if (te.koma === GOU) {
          this.kingG = te.from;
        }
        this.HashVal = this.BanHash ^ this.HandHash ^ (this.teban === GOTE2 ? _KyokumenImproved.TebanHashSeed : 0);
      }
      // Initialize king positions
      initKingPos() {
        this.kingS = -34;
        this.kingG = -34;
        for (let suji = 16; suji <= 144; suji += 16) {
          for (let dan = 1; dan <= 9; dan++) {
            if (this.ban[suji + dan] === SOU) {
              this.kingS = suji + dan;
            }
            if (this.ban[suji + dan] === GOU) {
              this.kingG = suji + dan;
            }
          }
        }
      }
      // Search for king position
      searchGyoku(teban) {
        if (teban === SENTE2) {
          return this.kingS;
        } else {
          return this.kingG;
        }
      }
      // Initialize evaluation
      initEval() {
        this.eval = 0;
        for (let suji = 16; suji <= 144; suji += 16) {
          for (let dan = 1; dan <= 9; dan++) {
            this.eval += komaValue[this.ban[suji + dan]];
          }
        }
        for (let i = SFU; i <= SHI; i++) {
          this.eval += komaValue[i] * this.hand[i];
        }
        for (let i = GFU; i <= GHI; i++) {
          this.eval += komaValue[i] * this.hand[i];
        }
      }
      // Calculate hash from scratch
      calcHash() {
        this.HandHash = 0;
        this.BanHash = 0;
        for (let i = 0; i <= GHI; i++) {
          for (let j = 0; j <= this.hand[i]; j++) {
            this.HandHash ^= _KyokumenImproved.HandHashSeed[i][j];
          }
        }
        for (let i = 1; i <= 9; i++) {
          for (let j = 1; j <= 9; j++) {
            this.BanHash ^= _KyokumenImproved.HashSeed[this.ban[i * 16 + j]][i * 16 + j];
          }
        }
        this.HashVal = this.HandHash ^ this.BanHash ^ (this.teban === GOTE2 ? _KyokumenImproved.TebanHashSeed : 0);
      }
      // Initialize all
      initAll() {
        this.initEval();
        this.initKingPos();
        this.initPsqt();
        this.calcHash();
      }
      // Initialize PSQT evaluation from scratch (board only; pieces in hand have no square value).
      initPsqt() {
        this.psqtEval = 0;
        for (let suji = 16; suji <= 144; suji += 16) {
          for (let dan = 1; dan <= 9; dan++) {
            const pos = suji + dan;
            const p = this.ban[pos];
            if (p === EMPTY || p === WALL) continue;
            this.psqtEval += _KyokumenImproved.psqtValue(p, pos);
          }
        }
      }
      // Evaluate position - comprehensive evaluation beyond just material
      evaluate() {
        let score = this.eval;
        score += this.psqtEval;
        score += this.evaluateHandBonus();
        score += this.evaluateFileDefense();
        score += this.evaluateClimbingSilverPressure();
        score += this.evaluatePromotionThreats();
        score += this.evaluateKingSafetyV2();
        score += this.evaluateCastleShapes();
        score += this.evaluateMajorPieceActivity();
        return score;
      }
      /**
       * Tuned evaluation (v3).
       *
       * Goal:
       * - Improve stability/variety in human-like openings without slowing the engine down.
       *
       * Approach:
       * - Keep the exact same evaluation terms as v2.
       * - Reweight only the two most opening-specific (and previously "spiky") heuristics by phase:
       *   - file defense
       *   - promotion threats
       *
       * Performance:
       * - No new board scans vs v2; this is only phase-aware scaling.
       */
      evaluateV3() {
        return this.evaluateV3WithWeights(
          _KyokumenImproved.EVAL_V3_PSQT_W,
          _KyokumenImproved.EVAL_V3_CASTLE_W,
          _KyokumenImproved.EVAL_V3_FILE_DEFENSE_W,
          _KyokumenImproved.EVAL_V3_PROMO_THREAT_W
        );
      }
      /**
       * Same evaluation as `evaluateV3()` but using the candidate weight arrays
       * (see `setEvalV3TunedWeights`). Exposed as eval mode 'v3t' so tuned weights
       * can be A/B validated against the current v3 weights in one self-play match.
       */
      evaluateV3Tuned() {
        return this.evaluateV3WithWeights(
          _KyokumenImproved.EVAL_V3T_PSQT_W,
          _KyokumenImproved.EVAL_V3T_CASTLE_W,
          _KyokumenImproved.EVAL_V3T_FILE_DEFENSE_W,
          _KyokumenImproved.EVAL_V3T_PROMO_THREAT_W
        );
      }
      evaluateV3WithWeights(psqtW, castleW, fileDefenseW, promoThreatW) {
        let score = this.eval | 0;
        const handTotal = this.totalHandPieces();
        const phaseBucket = handTotal <= 2 ? 3 : handTotal <= 6 ? 2 : handTotal <= 10 ? 1 : 0;
        const phase = this.openingPhaseFactorFromHand(handTotal);
        score += _KyokumenImproved.scaleEvalV3(this.psqtEval | 0, psqtW[phaseBucket] ?? 128);
        score += this.evaluateHandBonus() | 0;
        score += this.evaluateKingSafetyV2WithPhase(phase) | 0;
        score += _KyokumenImproved.scaleEvalV3(
          this.evaluateCastleShapes() | 0,
          castleW[phaseBucket] ?? 128
        );
        score += this.evaluateMajorPieceActivity() | 0;
        score += _KyokumenImproved.scaleEvalV3(
          this.evaluateFileDefense() + this.evaluateClimbingSilverPressure() | 0,
          fileDefenseW[phaseBucket] ?? 0
        );
        score += _KyokumenImproved.scaleEvalV3(
          this.evaluatePromotionThreats() | 0,
          promoThreatW[phaseBucket] ?? 0
        );
        return score;
      }
      /**
       * Opening-book evaluation (fast).
       *
       * Used only for `OpeningBookImproved` safety validation:
       * - It needs to score many 1-ply candidates quickly.
       * - The full evaluation includes mobility-style scans (major piece activity) that are relatively expensive
       *   and not very informative in the first few moves.
       *
       * This intentionally matches v3's terms/weights except it omits `evaluateMajorPieceActivity()`.
       */
      evaluateForOpeningBook() {
        let score = this.eval | 0;
        const handTotal = this.totalHandPieces();
        const phaseBucket = handTotal <= 2 ? 3 : handTotal <= 6 ? 2 : handTotal <= 10 ? 1 : 0;
        const phase = this.openingPhaseFactorFromHand(handTotal);
        score += _KyokumenImproved.scaleEvalV3(
          this.psqtEval | 0,
          _KyokumenImproved.EVAL_V3_PSQT_W[phaseBucket] ?? 128
        );
        score += this.evaluateHandBonus() | 0;
        score += this.evaluateKingSafetyV2WithPhase(phase) | 0;
        score += _KyokumenImproved.scaleEvalV3(
          this.evaluateCastleShapes() | 0,
          _KyokumenImproved.EVAL_V3_CASTLE_W[phaseBucket] ?? 128
        );
        score += _KyokumenImproved.scaleEvalV3(
          this.evaluateFileDefense() + this.evaluateClimbingSilverPressure() | 0,
          _KyokumenImproved.EVAL_V3_FILE_DEFENSE_W[phaseBucket] ?? 0
        );
        score += _KyokumenImproved.scaleEvalV3(
          this.evaluatePromotionThreats() | 0,
          _KyokumenImproved.EVAL_V3_PROMO_THREAT_W[phaseBucket] ?? 0
        );
        return score;
      }
      /**
       * Castle (囲い) evaluation.
       *
       * Why this exists:
       * - Pure material/king-safety heuristics can still allow "technically safe but aimless" moves early.
       * - A small castle-shape term helps the engine prefer coherent king safety plans (矢倉/美濃/穴熊の方向性).
       *
       * Notes:
       * - Kept intentionally small vs material (歩=100) so tactics still dominate.
       * - Uses only the current board (no history/opening recognition).
       */
      evaluateCastleShapes() {
        const sente = this.castleScoreForSide(SENTE2, this.kingS);
        const gote = this.castleScoreForSide(GOTE2, this.kingG);
        return sente - gote;
      }
      castleScoreForSide(teban, kingPos) {
        if (kingPos <= 0) return 0;
        const kingSuji = kingPos >> 4;
        const kingDan = kingPos & 15;
        const ks = teban === SENTE2 ? kingSuji : 10 - kingSuji;
        const kd = teban === SENTE2 ? kingDan : 10 - kingDan;
        const at = (sujiSente, danSente) => {
          const suji = teban === SENTE2 ? sujiSente : 10 - sujiSente;
          const dan = teban === SENTE2 ? danSente : 10 - danSente;
          return this.get((suji << 4) + dan);
        };
        const has = (sujiSente, danSente, type) => {
          const p = at(sujiSente, danSente);
          return p !== EMPTY && p !== WALL && isSelf(teban, p) && this.getKomashu(p) === type;
        };
        const anaguma = (() => {
          let score = 0;
          if (ks === 9 && kd === 9) score += 90;
          else if (ks === 8 && kd === 9) score += 55;
          else if (ks === 9 && kd === 8) score += 45;
          else return 0;
          if (has(8, 9, KI)) score += 40;
          if (has(9, 8, KI)) score += 40;
          if (has(8, 8, GI)) score += 25;
          return score;
        })();
        const mino = (() => {
          let score = 0;
          if (ks === 8 && kd === 8) score += 70;
          else if (ks === 9 && kd === 8) score += 60;
          else return 0;
          if (has(7, 8, KI)) score += 35;
          if (has(8, 9, KI)) score += 30;
          if (has(7, 9, GI)) score += 20;
          return score;
        })();
        const yagura = (() => {
          let score = 0;
          if (ks === 7 && kd === 8) score += 65;
          else if (ks === 7 && kd === 9) score += 50;
          else return 0;
          if (has(6, 8, KI)) score += 35;
          if (has(7, 9, KI)) score += 30;
          if (has(7, 7, GI)) score += 20;
          return score;
        })();
        return Math.max(anaguma, mino, yagura);
      }
      /**
       * Baseline evaluation (v1) kept for benchmarking/regression comparisons.
       * The current `evaluate()` uses the stronger v2 king-safety evaluation.
       */
      evaluateV1() {
        let score = this.eval;
        score += this.evaluateHandBonus();
        score += this.evaluateFileDefense();
        score += this.evaluatePromotionThreats();
        score += this.evaluateKingSafetyV1();
        score += this.evaluateMajorPieceActivity();
        return score;
      }
      evaluateHandBonus() {
        const handBonusByType = [
          0,
          // EMPTY
          15,
          // FU
          60,
          // KY
          70,
          // KE
          110,
          // GI
          130,
          // KI
          220,
          // KA
          260,
          // HI
          0,
          // OU (not in hand)
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0
        ];
        let score = 0;
        for (let koma = SFU; koma <= SHI; koma++) {
          const count = this.hand[koma];
          if (!count) continue;
          score += handBonusByType[this.getKomashu(koma)] * count;
        }
        for (let koma = GFU; koma <= GHI; koma++) {
          const count = this.hand[koma];
          if (!count) continue;
          score -= handBonusByType[this.getKomashu(koma)] * count;
        }
        return score;
      }
      /**
       * King safety (very simplified).
       *
       * Why this matters for "weird drops":
       * - With mostly material-based eval, many non-losing moves can look similar, so the engine may choose a
       *   "harmless" drop that doesn't actually improve king safety or piece activity.
       * - Adding even a small king-safety term helps the engine prefer moves that keep a defensive shape
       *   (and penalize wasting key defenders as random drops).
       *
       * This is intentionally lightweight:
       * - rewards friendly defenders in the 3x3 around the king
       * - penalizes adjacent empty squares (lack of shelter)
       * - penalizes enemy pieces adjacent to the king (danger)
       * - small "home rank" bonus so the engine doesn't keep the king in the open forever
       */
      evaluateKingSafetyV1() {
        let score = 0;
        if (this.kingS <= 0) {
          return -5e4;
        }
        if (this.kingG <= 0) {
          return 5e4;
        }
        score += this.evaluateOneKingSafetyV1(SENTE2, this.kingS);
        score -= this.evaluateOneKingSafetyV1(GOTE2, this.kingG);
        return score;
      }
      evaluateOneKingSafetyV1(teban, kingPos) {
        const suji = kingPos >> 4;
        const dan = kingPos & 15;
        const defenderWeight = [
          0,
          10,
          // FU
          18,
          // KY
          16,
          // KE
          22,
          // GI
          28,
          // KI
          16,
          // KA (doesn't usually "shield" king)
          18,
          // HI (doesn't usually "shield" king)
          0,
          // OU
          26,
          // TO
          24,
          // NY
          24,
          // NK
          24,
          // NG
          0,
          // (unused)
          18,
          // UM
          18
          // RY
        ];
        const enemyAdjPenalty = [
          0,
          10,
          // FU
          16,
          // KY
          16,
          // KE
          22,
          // GI
          28,
          // KI
          22,
          // KA
          22,
          // HI
          0,
          // OU
          20,
          // TO
          20,
          // NY
          20,
          // NK
          20,
          // NG
          0,
          // (unused)
          22,
          // UM
          22
          // RY
        ];
        let safety = 0;
        for (let dSuji = -1; dSuji <= 1; dSuji++) {
          for (let dDan = -1; dDan <= 1; dDan++) {
            if (dSuji === 0 && dDan === 0) continue;
            const p = this.getAt(suji + dSuji, dan + dDan);
            if (p === WALL) continue;
            if (p === EMPTY) {
              safety -= 4;
              continue;
            }
            const komashu = this.getKomashu(p);
            if (isSelf(teban, p)) {
              safety += defenderWeight[komashu] ?? 0;
            } else {
              safety -= enemyAdjPenalty[komashu] ?? 0;
            }
          }
        }
        if (teban === SENTE2) {
          if (dan >= 8) safety += 10;
        } else {
          if (dan <= 2) safety += 10;
        }
        const distFromCenter = Math.abs(suji - 5) + Math.abs(dan - 5);
        safety += distFromCenter;
        return safety;
      }
      /**
       * King safety v2 (stronger, still lightweight).
       *
       * Design goals:
       * - Encourage building a reasonable castle (囲い) in the opening without hard-forcing a specific pattern.
       * - Avoid "keep castling forever" by using phase-aware weights and diminishing returns.
       * - When the king is under pressure (enemy pieces close), reduce the "castle-building" incentive so defense/tactics take priority.
       */
      evaluateKingSafetyV2() {
        return this.evaluateKingSafetyV2WithPhase(this.openingPhaseFactor());
      }
      evaluateKingSafetyV2WithPhase(phase) {
        let score = 0;
        if (this.kingS <= 0) return -5e4;
        if (this.kingG <= 0) return 5e4;
        score += this.evaluateOneKingSafetyV2(SENTE2, this.kingS, phase);
        score -= this.evaluateOneKingSafetyV2(GOTE2, this.kingG, phase);
        return score;
      }
      totalHandPieces() {
        let total = 0;
        for (let koma = SFU; koma <= GRY; koma++) {
          total += this.hand[koma] | 0;
        }
        return total;
      }
      openingPhaseFactor() {
        return this.openingPhaseFactorFromHand(this.totalHandPieces());
      }
      openingPhaseFactorFromHand(hand) {
        if (hand <= 2) return 1;
        if (hand <= 6) return 0.7;
        if (hand <= 10) return 0.45;
        return 0.25;
      }
      enemyProximityDanger(teban, kingSuji, kingDan) {
        const dangerByKomashu = [
          0,
          6,
          // FU
          10,
          // KY
          12,
          // KE
          16,
          // GI
          18,
          // KI
          22,
          // KA
          26,
          // HI
          0,
          // OU
          14,
          // TO
          12,
          // NY
          12,
          // NK
          12,
          // NG
          0,
          // (unused)
          26,
          // UM
          30
          // RY
        ];
        let danger = 0;
        for (let ds = -2; ds <= 2; ds++) {
          for (let dd = -2; dd <= 2; dd++) {
            if (ds === 0 && dd === 0) continue;
            const p = this.getAt(kingSuji + ds, kingDan + dd);
            if (p === EMPTY || p === WALL) continue;
            if (isSelf(teban, p)) continue;
            danger += dangerByKomashu[this.getKomashu(p)] ?? 0;
          }
        }
        return danger;
      }
      evaluateOneKingSafetyV2(teban, kingPos, phase) {
        const suji = kingPos >> 4;
        const dan = kingPos & 15;
        const defenderWeight = [
          0,
          10,
          // FU
          18,
          // KY
          16,
          // KE
          24,
          // GI
          32,
          // KI
          14,
          // KA
          16,
          // HI
          0,
          // OU
          30,
          // TO (gold-like)
          26,
          // NY
          26,
          // NK
          26,
          // NG
          0,
          // (unused)
          18,
          // UM
          18
          // RY
        ];
        const enemyAdjPenalty = [
          0,
          10,
          // FU
          16,
          // KY
          16,
          // KE
          24,
          // GI
          28,
          // KI
          24,
          // KA
          24,
          // HI
          0,
          // OU
          22,
          // TO
          22,
          // NY
          22,
          // NK
          22,
          // NG
          0,
          // (unused)
          24,
          // UM
          26
          // RY
        ];
        let shelter = 0;
        for (let dSuji = -1; dSuji <= 1; dSuji++) {
          for (let dDan = -1; dDan <= 1; dDan++) {
            if (dSuji === 0 && dDan === 0) continue;
            const p = this.getAt(suji + dSuji, dan + dDan);
            if (p === WALL) continue;
            if (p === EMPTY) {
              shelter -= 5;
              continue;
            }
            const komashu = this.getKomashu(p);
            if (isSelf(teban, p)) shelter += defenderWeight[komashu] ?? 0;
            else shelter -= enemyAdjPenalty[komashu] ?? 0;
          }
        }
        const forward = teban === SENTE2 ? -1 : 1;
        for (let dSuji = -1; dSuji <= 1; dSuji++) {
          const p1 = this.getAt(suji + dSuji, dan + forward);
          const p2 = this.getAt(suji + dSuji, dan + forward * 2);
          if (p1 === WALL) continue;
          if ((p1 === EMPTY || p1 === WALL) && (p2 === EMPTY || p2 === WALL)) {
            shelter -= 5;
            continue;
          }
          const pawn1 = p1 !== WALL && p1 !== EMPTY && isSelf(teban, p1) && this.getKomashu(p1) === FU;
          const pawn2 = p2 !== WALL && p2 !== EMPTY && isSelf(teban, p2) && this.getKomashu(p2) === FU;
          if (pawn2) shelter += 12;
          else if (pawn1) shelter += 6;
          if (p1 !== WALL && p1 !== EMPTY && !isSelf(teban, p1)) shelter -= 10;
          if (p2 !== WALL && p2 !== EMPTY && !isSelf(teban, p2)) shelter -= 6;
        }
        const distFromCenter = Math.abs(suji - 5) + Math.abs(dan - 5);
        let homeCamp = 0;
        if (teban === SENTE2) {
          if (dan >= 8) homeCamp += 12;
          if (dan === 9) homeCamp += 10;
        } else {
          if (dan <= 2) homeCamp += 12;
          if (dan === 1) homeCamp += 10;
        }
        const edgeDist = Math.min(suji - 1, 9 - suji);
        const edgeBonus = Math.max(0, 4 - edgeDist) * 4;
        const progressRaw = distFromCenter * 2 + homeCamp + edgeBonus;
        const progress = Math.min(progressRaw, 60);
        const danger = this.enemyProximityDanger(teban, suji, dan);
        const progressFactor = danger >= 70 ? 0.15 : danger >= 45 ? 0.4 : 1;
        shelter += Math.round(progress * phase * progressFactor);
        shelter -= Math.min(danger, 160);
        if (shelter > 220) shelter = 220;
        if (shelter < -220) shelter = -220;
        return shelter;
      }
      /**
       * Major piece activity (rook/bishop + promoted variants).
       *
       * This is a fast mobility-style term:
       * - reward rooks/bishops that have open lines
       * - reward having lines pointing at the enemy king (even if not immediate tactics yet)
       */
      evaluateMajorPieceActivity() {
        let score = 0;
        const kingPosGote = this.kingG;
        const kingPosSente = this.kingS;
        const kingSujiG = kingPosGote >> 4;
        const kingDanG = kingPosGote & 15;
        const kingSujiS = kingPosSente >> 4;
        const kingDanS = kingPosSente & 15;
        for (let suji = 1; suji <= 9; suji++) {
          for (let dan = 1; dan <= 9; dan++) {
            const p = this.getAt(suji, dan);
            if (p === EMPTY || p === WALL) continue;
            const komashu = this.getKomashu(p);
            const isS = isSente(p);
            if (komashu === HI || komashu === RY) {
              const mobility = this.countSlidingMobility(suji, dan, [
                { ds: 1, dd: 0 },
                { ds: -1, dd: 0 },
                { ds: 0, dd: 1 },
                { ds: 0, dd: -1 }
              ]);
              const lineBonus = isS ? this.lineToKingBonusRookLike(suji, dan, kingSujiG, kingDanG) : this.lineToKingBonusRookLike(suji, dan, kingSujiS, kingDanS);
              const base = mobility * 6 + lineBonus;
              score += isS ? base : -base;
              if (komashu === RY) {
                const diagAdj = this.countAdjacentMobility(suji, dan, [
                  { ds: 1, dd: 1 },
                  { ds: 1, dd: -1 },
                  { ds: -1, dd: 1 },
                  { ds: -1, dd: -1 }
                ]);
                const extra = diagAdj * 3;
                score += isS ? extra : -extra;
              }
              continue;
            }
            if (komashu === KA || komashu === UM) {
              const mobility = this.countSlidingMobility(suji, dan, [
                { ds: 1, dd: 1 },
                { ds: 1, dd: -1 },
                { ds: -1, dd: 1 },
                { ds: -1, dd: -1 }
              ]);
              const lineBonus = isS ? this.lineToKingBonusBishopLike(suji, dan, kingSujiG, kingDanG) : this.lineToKingBonusBishopLike(suji, dan, kingSujiS, kingDanS);
              const base = mobility * 5 + lineBonus;
              score += isS ? base : -base;
              if (komashu === UM) {
                const orthoAdj = this.countAdjacentMobility(suji, dan, [
                  { ds: 1, dd: 0 },
                  { ds: -1, dd: 0 },
                  { ds: 0, dd: 1 },
                  { ds: 0, dd: -1 }
                ]);
                const extra = orthoAdj * 3;
                score += isS ? extra : -extra;
              }
            }
          }
        }
        return score;
      }
      countAdjacentMobility(suji, dan, dirs) {
        let count = 0;
        for (const { ds, dd } of dirs) {
          const p = this.getAt(suji + ds, dan + dd);
          if (p === WALL) continue;
          if (p === EMPTY) count++;
        }
        return count;
      }
      countSlidingMobility(suji, dan, dirs) {
        let count = 0;
        for (const { ds, dd } of dirs) {
          for (let step = 1; step <= 8; step++) {
            const p = this.getAt(suji + ds * step, dan + dd * step);
            if (p === WALL) break;
            if (p !== EMPTY) {
              count++;
              break;
            }
            count++;
          }
        }
        return count;
      }
      lineToKingBonusRookLike(suji, dan, kingSuji, kingDan) {
        if (suji === kingSuji) {
          const step = dan < kingDan ? 1 : -1;
          let blockers = 0;
          for (let d = dan + step; d !== kingDan; d += step) {
            const p = this.getAt(suji, d);
            if (p !== EMPTY) blockers++;
            if (blockers > 1) break;
          }
          if (blockers === 0) return 35;
          if (blockers === 1) return 15;
        }
        if (dan === kingDan) {
          const step = suji < kingSuji ? 1 : -1;
          let blockers = 0;
          for (let s = suji + step; s !== kingSuji; s += step) {
            const p = this.getAt(s, dan);
            if (p !== EMPTY) blockers++;
            if (blockers > 1) break;
          }
          if (blockers === 0) return 25;
          if (blockers === 1) return 12;
        }
        return 0;
      }
      lineToKingBonusBishopLike(suji, dan, kingSuji, kingDan) {
        const dS = kingSuji - suji;
        const dD = kingDan - dan;
        if (Math.abs(dS) !== Math.abs(dD) || dS === 0) return 0;
        const stepS = dS > 0 ? 1 : -1;
        const stepD = dD > 0 ? 1 : -1;
        let blockers = 0;
        for (let i = 1; i < Math.abs(dS); i++) {
          const p = this.getAt(suji + stepS * i, dan + stepD * i);
          if (p !== EMPTY) blockers++;
          if (blockers > 1) break;
        }
        if (blockers === 0) return 28;
        if (blockers === 1) return 12;
        return 0;
      }
      // Helper: Get piece at position using suji/dan coordinates
      getAt(suji, dan) {
        if (suji < 1 || suji > 9 || dan < 1 || dan > 9) return WALL;
        return this.ban[(suji << 4) + dan];
      }
      // Helper: Get komashu (piece type without player flag)
      getKomashu(koma) {
        return koma & 15;
      }
      // Evaluate file defense - CRITICAL for opening
      // Prevents disasters like letting pawn promote on 2-file
      evaluateFileDefense() {
        let score = 0;
        const sentePawnOn26 = isSente(this.getAt(2, 6)) && this.getKomashu(this.getAt(2, 6)) === FU;
        const sentePawnOn25 = isSente(this.getAt(2, 5)) && this.getKomashu(this.getAt(2, 5)) === FU;
        const sentePawnOn24 = isSente(this.getAt(2, 4)) && this.getKomashu(this.getAt(2, 4)) === FU;
        const goteBishopOn33 = isGote(this.getAt(3, 3)) && this.getKomashu(this.getAt(3, 3)) === KA;
        const goteGoldOn32 = isGote(this.getAt(3, 2)) && this.getKomashu(this.getAt(3, 2)) === KI;
        const gotePawnOn23 = isGote(this.getAt(2, 3)) && this.getKomashu(this.getAt(2, 3)) === FU;
        const goteBishopOn22 = isGote(this.getAt(2, 2)) && this.getKomashu(this.getAt(2, 2)) === KA;
        const goteBishopMissing = !goteBishopOn33 && !goteBishopOn22;
        const senteAttacking = sentePawnOn26 || sentePawnOn25 || sentePawnOn24;
        if (senteAttacking) {
          if (goteBishopOn33) {
            score -= 200;
          } else if (goteGoldOn32 && gotePawnOn23) {
            score -= 150;
          } else {
            if (sentePawnOn24) {
              if (!gotePawnOn23) {
                score += 1e3;
              } else {
                score += 500;
              }
            } else if (sentePawnOn25) {
              score += 600;
            } else if (sentePawnOn26) {
              score += 150;
            }
            if (goteBishopMissing && !goteBishopOn22) {
              score += 250;
            }
          }
          if (goteBishopOn22 && (sentePawnOn25 || sentePawnOn24)) {
            score += 300;
          }
        }
        const gotePawnOn84 = isGote(this.getAt(8, 4)) && this.getKomashu(this.getAt(8, 4)) === FU;
        const gotePawnOn85 = isGote(this.getAt(8, 5)) && this.getKomashu(this.getAt(8, 5)) === FU;
        const gotePawnOn86 = isGote(this.getAt(8, 6)) && this.getKomashu(this.getAt(8, 6)) === FU;
        const senteBishopOn77 = isSente(this.getAt(7, 7)) && this.getKomashu(this.getAt(7, 7)) === KA;
        const senteGoldOn78 = isSente(this.getAt(7, 8)) && this.getKomashu(this.getAt(7, 8)) === KI;
        const sentePawnOn87 = isSente(this.getAt(8, 7)) && this.getKomashu(this.getAt(8, 7)) === FU;
        const senteBishopOn88 = isSente(this.getAt(8, 8)) && this.getKomashu(this.getAt(8, 8)) === KA;
        const goteAttacking = gotePawnOn84 || gotePawnOn85 || gotePawnOn86;
        if (goteAttacking) {
          if (senteBishopOn77) {
            score += 200;
          } else if (senteGoldOn78 && sentePawnOn87) {
            score += 150;
          } else {
            if (gotePawnOn86) {
              if (!sentePawnOn87) {
                score -= 1e3;
              } else {
                score -= 500;
              }
            } else if (gotePawnOn85) {
              score -= 600;
            } else if (gotePawnOn84) {
              score -= 150;
            }
          }
          if (senteBishopOn88 && (gotePawnOn85 || gotePawnOn86)) {
            score -= 300;
          }
        }
        return score;
      }
      // Evaluate promotion threats - penalize allowing enemy pieces to promote
      evaluatePromotionThreats() {
        let score = 0;
        for (let suji = 1; suji <= 9; suji++) {
          for (let dan = 4; dan <= 6; dan++) {
            const piece = this.getAt(suji, dan);
            if (piece === EMPTY || piece === WALL) continue;
            if (isSente(piece)) {
              const komashu = this.getKomashu(piece);
              if (komashu === HI || komashu === KA) {
                let pathClear = true;
                for (let checkDan = dan - 1; checkDan >= 1; checkDan--) {
                  const blocking = this.getAt(suji, checkDan);
                  if (blocking !== EMPTY) {
                    if (isSente(blocking)) pathClear = false;
                    break;
                  }
                }
                if (pathClear) {
                  score += 500;
                }
              }
            }
          }
          for (let dan = 1; dan <= 3; dan++) {
            const piece = this.getAt(suji, dan);
            if (piece !== EMPTY && isSente(piece)) {
              const komashu = this.getKomashu(piece);
              if (komashu === HI || komashu === KA) {
                score += 800;
              } else if (komashu === RY || komashu === UM) {
                score += 350;
              }
            }
          }
        }
        for (let suji = 1; suji <= 9; suji++) {
          for (let dan = 4; dan <= 6; dan++) {
            const piece = this.getAt(suji, dan);
            if (piece === EMPTY || piece === WALL) continue;
            if (isGote(piece)) {
              const komashu = this.getKomashu(piece);
              if (komashu === HI || komashu === KA) {
                let pathClear = true;
                for (let checkDan = dan + 1; checkDan <= 9; checkDan++) {
                  const blocking = this.getAt(suji, checkDan);
                  if (blocking !== EMPTY) {
                    if (isGote(blocking)) pathClear = false;
                    break;
                  }
                }
                if (pathClear) {
                  score -= 500;
                }
              }
            }
          }
          for (let dan = 7; dan <= 9; dan++) {
            const piece = this.getAt(suji, dan);
            if (piece !== EMPTY && isGote(piece)) {
              const komashu = this.getKomashu(piece);
              if (komashu === HI || komashu === KA) {
                score -= 800;
              } else if (komashu === RY || komashu === UM) {
                score -= 350;
              }
            }
          }
        }
        return score;
      }
      /**
       * Climbing-silver (棒銀) pressure on the rook file.
       *
       * `evaluateFileDefense()` only looks at the attacking *pawn*, but the classic amateur plan is
       * pawn + rook + a silver marching up the edge files (▲3八銀→2七→2六→1五 …). Once the silver
       * reaches the 5th rank the 2四 exchange breaks through unless the defender has the proper shape.
       *
       * Joseki-informed defense shapes (mirrored for both sides):
       * - 角3三 (bishop covering 2四) is the primary defense — "▲2五歩には△3三角" .
       * - 銀2二 / 金3二 back up 2三 so the exchange doesn't win the file outright.
       * - 歩1四 denies the ▲1五銀 route ("棒銀を五段目に出させない").
       *
       * Returned score is SENTE-positive (like the other eval terms) and is meant to be phase-weighted
       * by the caller together with `evaluateFileDefense()`.
       */
      evaluateClimbingSilverPressure() {
        return this.climbingSilverPenaltyAgainstGote() - this.climbingSilverPenaltyAgainstSente();
      }
      /** Positive result = SENTE's climbing silver is dangerous for GOTE (added to SENTE's score). */
      climbingSilverPenaltyAgainstGote() {
        let rookOnFile = false;
        for (let dan = 5; dan <= 9; dan++) {
          const p = this.getAt(2, dan);
          if (p !== EMPTY && isSente(p) && this.getKomashu(p) === HI) {
            rookOnFile = true;
            break;
          }
        }
        if (!rookOnFile) return 0;
        let silverLevel = 0;
        let silverOnEdgeApproach = false;
        for (let suji = 1; suji <= 3; suji++) {
          for (let dan = 1; dan <= 7; dan++) {
            const p = this.getAt(suji, dan);
            if (p === EMPTY || !isSente(p) || this.getKomashu(p) !== GI) continue;
            const level = dan === 7 ? 1 : dan === 6 ? 2 : dan === 5 ? 3 : 4;
            if (level > silverLevel) silverLevel = level;
            if (dan === 6 && suji <= 2) silverOnEdgeApproach = true;
          }
        }
        if (silverLevel === 0) return 0;
        const bishop33 = isGote(this.getAt(3, 3)) && this.getKomashu(this.getAt(3, 3)) === KA;
        const silver22 = isGote(this.getAt(2, 2)) && this.getKomashu(this.getAt(2, 2)) === GI;
        const silver23 = isGote(this.getAt(2, 3)) && this.getKomashu(this.getAt(2, 3)) === GI;
        const silver33 = isGote(this.getAt(3, 3)) && this.getKomashu(this.getAt(3, 3)) === GI;
        const gold32 = isGote(this.getAt(3, 2)) && this.getKomashu(this.getAt(3, 2)) === KI;
        const pawn23 = isGote(this.getAt(2, 3)) && this.getKomashu(this.getAt(2, 3)) === FU;
        const pawn14 = isGote(this.getAt(1, 4)) && this.getKomashu(this.getAt(1, 4)) === FU;
        const strongCover = bishop33 || silver23 || silver33;
        const backup23 = silver22 || gold32;
        let penalty = 0;
        if (silverLevel >= 2) {
          if (strongCover && backup23) penalty -= 220;
          else if (strongCover) penalty -= 120;
          else if (backup23 && pawn23) penalty += 140;
          else penalty += 320;
        } else {
          if (!strongCover && !backup23) penalty += 90;
          else if (strongCover) penalty -= 40;
        }
        if (silverLevel >= 3) {
          penalty += strongCover ? 120 : 260;
        }
        if (silverLevel >= 4) {
          penalty += strongCover ? 180 : 320;
        }
        if (silverOnEdgeApproach) {
          penalty += pawn14 ? -70 : 80;
        }
        return penalty;
      }
      /** Positive result = GOTE's climbing silver is dangerous for SENTE (subtracted from SENTE's score). */
      climbingSilverPenaltyAgainstSente() {
        let rookOnFile = false;
        for (let dan = 1; dan <= 5; dan++) {
          const p = this.getAt(8, dan);
          if (p !== EMPTY && isGote(p) && this.getKomashu(p) === HI) {
            rookOnFile = true;
            break;
          }
        }
        if (!rookOnFile) return 0;
        let silverLevel = 0;
        let silverOnEdgeApproach = false;
        for (let suji = 7; suji <= 9; suji++) {
          for (let dan = 3; dan <= 9; dan++) {
            const p = this.getAt(suji, dan);
            if (p === EMPTY || !isGote(p) || this.getKomashu(p) !== GI) continue;
            const level = dan === 3 ? 1 : dan === 4 ? 2 : dan === 5 ? 3 : 4;
            if (level > silverLevel) silverLevel = level;
            if (dan === 4 && suji >= 8) silverOnEdgeApproach = true;
          }
        }
        if (silverLevel === 0) return 0;
        const bishop77 = isSente(this.getAt(7, 7)) && this.getKomashu(this.getAt(7, 7)) === KA;
        const silver88 = isSente(this.getAt(8, 8)) && this.getKomashu(this.getAt(8, 8)) === GI;
        const silver87 = isSente(this.getAt(8, 7)) && this.getKomashu(this.getAt(8, 7)) === GI;
        const silver77 = isSente(this.getAt(7, 7)) && this.getKomashu(this.getAt(7, 7)) === GI;
        const gold78 = isSente(this.getAt(7, 8)) && this.getKomashu(this.getAt(7, 8)) === KI;
        const pawn87 = isSente(this.getAt(8, 7)) && this.getKomashu(this.getAt(8, 7)) === FU;
        const pawn96 = isSente(this.getAt(9, 6)) && this.getKomashu(this.getAt(9, 6)) === FU;
        const strongCover = bishop77 || silver87 || silver77;
        const backup87 = silver88 || gold78;
        let penalty = 0;
        if (silverLevel >= 2) {
          if (strongCover && backup87) penalty -= 220;
          else if (strongCover) penalty -= 120;
          else if (backup87 && pawn87) penalty += 140;
          else penalty += 320;
        } else {
          if (!strongCover && !backup87) penalty += 90;
          else if (strongCover) penalty -= 40;
        }
        if (silverLevel >= 3) {
          penalty += strongCover ? 120 : 260;
        }
        if (silverLevel >= 4) {
          penalty += strongCover ? 180 : 320;
        }
        if (silverOnEdgeApproach) {
          penalty += pawn96 ? -70 : 80;
        }
        return penalty;
      }
      static {
        // Initial position setup
        this.ShokiBanmen = [
          [GKY, GKE, GGI, GKI, GOU, GKI, GGI, GKE, GKY],
          [EMPTY, GHI, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, GKA, EMPTY],
          [GFU, GFU, GFU, GFU, GFU, GFU, GFU, GFU, GFU],
          [EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY],
          [EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY],
          [EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY],
          [SFU, SFU, SFU, SFU, SFU, SFU, SFU, SFU, SFU],
          [EMPTY, SKA, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, SHI, EMPTY],
          [SKY, SKE, SGI, SKI, SOU, SKI, SGI, SKE, SKY]
        ];
      }
      // Initialize standard starting position
      initHirate() {
        this.teban = SENTE2;
        for (let dan = 1; dan <= 9; dan++) {
          for (let suji = 9; suji >= 1; suji--) {
            this.ban[(suji << 4) + dan] = _KyokumenImproved.ShokiBanmen[dan - 1][9 - suji];
          }
        }
        for (let koma = SFU; koma <= GHI; koma++) {
          this.hand[koma] = 0;
        }
        this.initAll();
      }
      // Convert to string for display
      toString() {
        const _sujiStr = ["", "１", "２", "３", "４", "５", "６", "７", "８", "９"];
        const danStr = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
        let s = "";
        s += "後手持駒：";
        for (let i = GFU; i <= GHI; i++) {
          if (this.hand[i] === 1) {
            s += this.getKomaString(i);
          } else if (this.hand[i] > 1) {
            s += this.getKomaString(i) + this.hand[i];
          }
        }
        s += "\n";
        s += " ９ ８ ７ ６ ５ ４ ３ ２ １\n";
        s += "+---+---+---+---+---+---+---+---+---+\n";
        for (let dan = 1; dan <= 9; dan++) {
          for (let suji = 9; suji >= 1; suji--) {
            s += "|";
            s += this.toBanStringForKoma(this.ban[(suji << 4) + dan]);
          }
          s += "|";
          s += danStr[dan];
          s += "\n";
          s += "+---+---+---+---+---+---+---+---+---+\n";
        }
        s += "先手持駒：";
        for (let i = SFU; i <= SHI; i++) {
          if (this.hand[i] === 1) {
            s += this.getKomaString(i);
          } else if (this.hand[i] > 1) {
            s += this.getKomaString(i) + this.hand[i];
          }
        }
        s += "\n";
        return s;
      }
      getKomaString(koma) {
        const komaString = [
          "  ",
          "歩",
          "香",
          "桂",
          "銀",
          "金",
          "角",
          "飛",
          "玉",
          "と",
          "杏",
          "圭",
          "全",
          "",
          "馬",
          "竜"
        ];
        return komaString[this.getKomashu(koma)];
      }
      toBanStringForKoma(koma) {
        const komaString = [
          "  ",
          "歩",
          "香",
          "桂",
          "銀",
          "金",
          "角",
          "飛",
          "玉",
          "と",
          "杏",
          "圭",
          "全",
          "",
          "馬",
          "竜"
        ];
        if (koma === EMPTY) {
          return "   ";
        } else if ((koma & SENTE2) !== 0) {
          return " " + komaString[this.getKomashu(koma)];
        } else {
          return "v" + komaString[this.getKomashu(koma)];
        }
      }
      /**
       * Convert captured pieces to array format (for UI compatibility)
       * Converts from count-based hand[] to array of pieces
       */
      toHandArrays() {
        const hands = [[], []];
        for (let pieceType = FU; pieceType <= HI; pieceType++) {
          const senteHandKey = SENTE2 + pieceType;
          for (let j = 0; j < this.hand[senteHandKey]; j++) {
            hands[0].push(senteHandKey);
          }
        }
        for (let pieceType = FU; pieceType <= HI; pieceType++) {
          const goteHandKey = GOTE2 + pieceType;
          for (let j = 0; j < this.hand[goteHandKey]; j++) {
            hands[1].push(goteHandKey);
          }
        }
        return hands;
      }
      /**
       * Get piece at position (using Position class for UI compatibility)
       */
      getByPosition(pos) {
        return this.ban[(pos.suji << 4) + pos.dan];
      }
    };
  }
});

// src/components/game/ShogiImproved/PromotionRulesImproved.ts
function isForcedPromotion(koma, teban, toDan) {
  const komashu = getKomashu(koma);
  if (komashu === FU || komashu === KY) {
    return teban === SENTE2 ? toDan === 1 : toDan === 9;
  }
  if (komashu === KE) {
    return teban === SENTE2 ? toDan <= 2 : toDan >= 8;
  }
  return false;
}
function buildDeclinablePromotion(promoteMove, teban) {
  if (!promoteMove.promote) return null;
  const toDan = getDan(promoteMove.to);
  if (isForcedPromotion(promoteMove.koma, teban, toDan)) return null;
  const nonPromote = promoteMove.clone();
  nonPromote.promote = false;
  return nonPromote;
}
var init_PromotionRulesImproved = __esm({
  "src/components/game/ShogiImproved/PromotionRulesImproved.ts"() {
    "use strict";
    init_types();
  }
});

// ml/shogi-sfen.ts
function square(file, rank) {
  return (file << 4) + rank;
}
function positionFromSfen(sfen) {
  const parts = sfen.trim().split(/\s+/);
  if (parts.length !== 4 || parts[1] !== "b" && parts[1] !== "w") {
    throw new Error(`invalid SFEN header: ${sfen}`);
  }
  const moveNumber = Number.parseInt(parts[3], 10);
  if (!Number.isInteger(moveNumber) || moveNumber <= 0) {
    throw new Error(`invalid SFEN move number: ${parts[3]}`);
  }
  const position = new KyokumenImproved();
  for (let file = 1; file <= 9; file++) {
    for (let rank = 1; rank <= 9; rank++)
      position.ban[square(file, rank)] = EMPTY;
  }
  position.hand.fill(0);
  const rows = parts[0].split("/");
  if (rows.length !== 9)
    throw new Error(`SFEN board must have nine ranks: ${parts[0]}`);
  for (let rank = 1; rank <= 9; rank++) {
    const row = rows[rank - 1];
    let file = 9;
    for (let index = 0; index < row.length; index++) {
      const token = row[index];
      if (/^[1-9]$/.test(token)) {
        file -= Number.parseInt(token, 10);
        continue;
      }
      let promoted = false;
      let piece = token;
      if (token === "+") {
        promoted = true;
        piece = row[++index];
        if (!piece)
          throw new Error(`dangling promotion marker in SFEN rank ${rank}`);
      }
      const upper = piece.toUpperCase();
      const base = PIECE_KIND[upper];
      if (!base || file < 1 || file > 9)
        throw new Error(`invalid SFEN piece ${piece}`);
      if (promoted && (base === KI || base === OU)) {
        throw new Error(`piece ${upper} cannot be promoted in SFEN`);
      }
      const side = piece === upper ? SENTE2 : GOTE2;
      position.ban[square(file, rank)] = side + base + (promoted ? PROMOTE : 0);
      file--;
    }
    if (file !== 0)
      throw new Error(`SFEN rank ${rank} does not contain nine squares`);
  }
  if (parts[2] !== "-") {
    let count = "";
    for (const piece of parts[2]) {
      if (/^[0-9]$/.test(piece)) {
        count += piece;
        continue;
      }
      const upper = piece.toUpperCase();
      const base = PIECE_KIND[upper];
      if (!base || base === OU)
        throw new Error(`invalid SFEN hand piece ${piece}`);
      const copies = count ? Number.parseInt(count, 10) : 1;
      if (!Number.isInteger(copies) || copies <= 0)
        throw new Error(`invalid SFEN hand count ${count}`);
      const side = piece === upper ? SENTE2 : GOTE2;
      position.hand[side + base] += copies;
      count = "";
    }
    if (count) throw new Error(`dangling SFEN hand count ${count}`);
  }
  position.teban = parts[1] === "b" ? SENTE2 : GOTE2;
  position.initAll();
  return { position, moveNumber };
}
function teToUsi(move) {
  const toFile = move.to >> 4;
  const toRank = String.fromCharCode(96 + (move.to & 15));
  if (move.from === 0) {
    const piece = DROP_LETTER[getKomashu(move.koma)];
    if (!piece)
      throw new Error(`cannot encode dropped piece ${getKomashu(move.koma)}`);
    return `${piece}*${toFile}${toRank}`;
  }
  const fromFile = move.from >> 4;
  const fromRank = String.fromCharCode(96 + (move.from & 15));
  return `${fromFile}${fromRank}${toFile}${toRank}${move.promote ? "+" : ""}`;
}
function rulesCompleteLegalMoves(position) {
  const byUsi = /* @__PURE__ */ new Map();
  for (const move of GenerateMovesImproved.generateLegalMoves(position)) {
    byUsi.set(teToUsi(move), move);
    const declined = buildDeclinablePromotion(move, position.teban);
    if (declined) byUsi.set(teToUsi(declined), declined);
  }
  return Object.freeze(
    [...byUsi].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0).map(([usi, move]) => Object.freeze({ usi, move }))
  );
}
var PIECE_KIND, DROP_LETTER;
var init_shogi_sfen = __esm({
  "ml/shogi-sfen.ts"() {
    "use strict";
    init_GenerateMovesImproved();
    init_KyokumenImproved();
    init_PromotionRulesImproved();
    init_shogi_sfen_codec();
    init_types();
    PIECE_KIND = {
      P: FU,
      L: KY,
      N: KE,
      S: GI,
      G: KI,
      B: KA,
      R: HI,
      K: OU
    };
    DROP_LETTER = {
      [FU]: "P",
      [KY]: "L",
      [KE]: "N",
      [GI]: "S",
      [KI]: "G",
      [KA]: "B",
      [HI]: "R"
    };
  }
});

// ml/floodgate-training-row-validation.ts
function fail8(message) {
  throw new Error(`invalid Floodgate training rows: ${message}`);
}
function sha2563(value) {
  return (0, import_node_crypto5.createHash)("sha256").update(value).digest("hex");
}
function compareBytewise(left, right) {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}
function exactDataRecord2(value, expectedKeys, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value) || import_node_util6.types.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
    fail8(`${label} must be a non-Proxy plain object`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const ownKeys = Reflect.ownKeys(descriptors);
  if (ownKeys.some((key) => typeof key !== "string") || ownKeys.length !== expectedKeys.length || ownKeys.some((key) => !expectedKeys.includes(key))) {
    fail8(`${label} keys are not exact`);
  }
  const captured = /* @__PURE__ */ Object.create(null);
  for (const key of expectedKeys) {
    const descriptor = descriptors[key];
    if (descriptor === void 0 || !("value" in descriptor) || descriptor.enumerable !== true) {
      fail8(`${label}.${key} must be an enumerable data property`);
    }
    Object.defineProperty(captured, key, {
      configurable: false,
      enumerable: true,
      writable: false,
      value: descriptor.value
    });
  }
  return Object.freeze(captured);
}
function canonicalJson3(value) {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) {
      fail8("canonical JSON rejects nonfinite numbers and negative zero");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    if (import_node_util6.types.isProxy(value) || Object.getPrototypeOf(value) !== Array.prototype) {
      fail8("canonical JSON rejects exotic arrays");
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Reflect.ownKeys(descriptors).length !== value.length + 1) {
      fail8("canonical JSON rejects sparse or decorated arrays");
    }
    return `[${Array.from({ length: value.length }, (_, index) => {
      const descriptor = descriptors[String(index)];
      if (descriptor === void 0 || !("value" in descriptor) || descriptor.enumerable !== true) {
        fail8("canonical JSON rejects array accessors");
      }
      return canonicalJson3(descriptor.value);
    }).join(",")}]`;
  }
  if (typeof value === "object") {
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (import_node_util6.types.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null || Reflect.ownKeys(descriptors).some((key) => typeof key !== "string")) {
      fail8("canonical JSON rejects exotic records");
    }
    const keys = Object.keys(descriptors).sort(compareBytewise);
    return `{${keys.map((key) => {
      const descriptor = descriptors[key];
      if (descriptor === void 0 || !("value" in descriptor) || descriptor.enumerable !== true) {
        fail8("canonical JSON rejects accessors and hidden fields");
      }
      return `${JSON.stringify(key)}:${canonicalJson3(descriptor.value)}`;
    }).join(",")}}`;
  }
  return fail8(`canonical JSON rejects ${typeof value}`);
}
function hasRawDotSegment(value) {
  try {
    const pathStart = value.indexOf("/", value.indexOf("://") + 3);
    const pathValue = pathStart < 0 ? "" : value.slice(pathStart);
    return pathValue.split(/[?#]/u, 1)[0].split("/").some((component) => component === "." || component === "..");
  } catch {
    return true;
  }
}
function validateQ1Date(yearRaw, monthRaw, dayRaw) {
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  const date = `${yearRaw}-${monthRaw}-${dayRaw}`;
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (utc.getUTCFullYear() !== year || utc.getUTCMonth() + 1 !== month || utc.getUTCDate() !== day || date < "2026-01-01" || date > "2026-03-31") {
    fail8("source URL date is outside 2026 Q1");
  }
}
function decodeFilenamePart(value) {
  let decoded;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return fail8("source URL player token has invalid percent encoding");
  }
  if (decoded.length === 0 || decoded !== decoded.trim() || CONTROL_RE2.test(decoded) || /[+\\/?#]/u.test(decoded)) {
    fail8("source URL player token is not canonical");
  }
  return decoded;
}
function canonicalFloodgateCsaUrl(value) {
  if (typeof value !== "string" || value.length === 0 || value !== value.trim() || CONTROL_RE2.test(value) || value.includes("\\") || hasRawDotSegment(value) || ENCODED_STRUCTURAL_RE.test(value)) {
    fail8("source URL is not canonical text");
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    return fail8("source URL is not absolute");
  }
  if (url.protocol !== "https:" || url.origin !== FLOODGATE_ORIGIN || url.hostname !== "wdoor.c.u-tokyo.ac.jp" || url.port !== "" || url.username !== "" || url.password !== "" || url.search !== "" || url.hash !== "" || url.href !== value) {
    fail8("source URL does not use the exact Floodgate HTTPS origin");
  }
  const pathMatch = /^\/shogi\/x\/(2026)\/(\d{2})\/(\d{2})\/([^/]+\.csa)$/u.exec(url.pathname);
  if (pathMatch === null) {
    fail8("source URL is not an official 2026 daily CSA path");
  }
  validateQ1Date(pathMatch[1], pathMatch[2], pathMatch[3]);
  const filename = pathMatch[4];
  const fileMatch = /^wdoor\+([^+]+)\+([^+]+)\+([^+]+)\+(\d{14})\.csa$/u.exec(
    filename
  );
  if (fileMatch === null || fileMatch[1] !== FLOODGATE_EVENT || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(fileMatch[1])) {
    fail8("source URL filename does not bind the Floodgate event");
  }
  decodeFilenamePart(fileMatch[2]);
  decodeFilenamePart(fileMatch[3]);
  const timestamp = fileMatch[4];
  if (!timestamp.startsWith(`${pathMatch[1]}${pathMatch[2]}${pathMatch[3]}`) || Number(timestamp.slice(8, 10)) > 23 || Number(timestamp.slice(10, 12)) > 59 || Number(timestamp.slice(12, 14)) > 59) {
    fail8("source URL timestamp is invalid");
  }
  return url.href;
}
function gameIdForUrl(sourceUrl) {
  const canonical = canonicalFloodgateCsaUrl(sourceUrl);
  return `sha256:${sha2563(`${FLOODGATE_GAME_ID_DOMAIN}\0${canonical}`)}`;
}
function parentOccurrenceId(gameId, ply) {
  return `sha256:${sha2563(`parent-occurrence-v1\0${gameId}\0${ply}`)}`;
}
function positionIdForSfen(sfen) {
  const parts = sfen.trim().split(/\s+/u);
  if (parts.length < 3) fail8("parent SFEN is invalid");
  return `sha256:${sha2563(`sfen-v1\0${parts.slice(0, 3).join(" ")}`)}`;
}
function identifierDigest(values) {
  return sha2563([...new Set(values)].sort(compareBytewise).join("\n"));
}
function requiredString(value, label) {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value || value.includes("\0")) {
    fail8(`${label} must be non-empty canonical text`);
  }
  return value;
}
function captureFloodgateTrainingRawIdentity(value) {
  const identity = exactDataRecord2(
    value,
    RAW_IDENTITY_KEYS,
    "training raw identity"
  );
  if (identity.path !== "training.raw.jsonl" || identity.format !== FLOODGATE_TRAINING_RAW_PARENT_FORMAT) {
    fail8("training raw path or format is not fixed");
  }
  for (const key of [
    "bytes",
    "records",
    "games",
    "position_ids_count"
  ]) {
    if (!Number.isSafeInteger(identity[key]) || identity[key] <= 0) {
      fail8(`training raw ${key} is not a positive safe integer`);
    }
  }
  if (identity.bytes > FLOODGATE_TRAINING_RAW_MAX_BYTES) {
    fail8("training raw identity exceeds the fixed size bound");
  }
  for (const key of [
    "sha256",
    "game_ids_sha256",
    "parent_ids_sha256",
    "position_ids_sha256"
  ]) {
    if (typeof identity[key] !== "string" || !SHA256_RE2.test(identity[key])) {
      fail8(`training raw ${key} is not a SHA-256 digest`);
    }
  }
  return Object.freeze({
    bytes: identity.bytes,
    format: FLOODGATE_TRAINING_RAW_PARENT_FORMAT,
    game_ids_sha256: identity.game_ids_sha256,
    games: identity.games,
    parent_ids_sha256: identity.parent_ids_sha256,
    path: "training.raw.jsonl",
    position_ids_count: identity.position_ids_count,
    position_ids_sha256: identity.position_ids_sha256,
    records: identity.records,
    sha256: identity.sha256
  });
}
function parseRawParent(value, canonicalLine, lineNumber) {
  const raw = exactDataRecord2(
    value,
    RAW_PARENT_KEYS,
    `training row ${lineNumber}`
  );
  if (canonicalJson3(value) !== canonicalLine) {
    fail8(`training row ${lineNumber} is not canonical JSON`);
  }
  if (raw.schema_version !== 1 || raw.source !== "floodgate") {
    fail8(`training row ${lineNumber} source schema is invalid`);
  }
  const sourceUrl = canonicalFloodgateCsaUrl(raw.source_url);
  const gameSha256 = requiredString(
    raw.game_sha256,
    `training row ${lineNumber} game_sha256`
  );
  if (!SHA256_RE2.test(gameSha256)) {
    fail8(`training row ${lineNumber} game_sha256 is invalid`);
  }
  const gameId = requiredString(
    raw.game_id,
    `training row ${lineNumber} game_id`
  );
  const parentId = requiredString(
    raw.parent_id,
    `training row ${lineNumber} parent_id`
  );
  const positionId = requiredString(
    raw.position_id,
    `training row ${lineNumber} position_id`
  );
  if (!POSITION_ID_RE.test(gameId) || !POSITION_ID_RE.test(parentId) || !POSITION_ID_RE.test(positionId) || gameId !== gameIdForUrl(sourceUrl)) {
    fail8(`training row ${lineNumber} semantic identifiers are invalid`);
  }
  if (!Number.isSafeInteger(raw.ply) || raw.ply < 0) {
    fail8(`training row ${lineNumber} ply is invalid`);
  }
  const ply = raw.ply;
  if (parentId !== parentOccurrenceId(gameId, ply)) {
    fail8(`training row ${lineNumber} parent_id does not match game and ply`);
  }
  const parentSfen = requiredString(
    raw.parent_sfen,
    `training row ${lineNumber} parent_sfen`
  );
  if (parentSfen.split(/\s+/u).join(" ") !== parentSfen) {
    fail8(`training row ${lineNumber} parent_sfen is not normalized`);
  }
  const playedMove = requiredString(
    raw.played_move,
    `training row ${lineNumber} played_move`
  );
  try {
    const parsed = positionFromSfen(parentSfen);
    if (toSfen(parsed.position, parsed.moveNumber) !== parentSfen || parsed.moveNumber !== ply + 1) {
      fail8(`training row ${lineNumber} SFEN is not canonical for its ply`);
    }
    if (!rulesCompleteLegalMoves(parsed.position).some(
      (move) => move.usi === playedMove
    )) {
      fail8(`training row ${lineNumber} played_move is illegal`);
    }
  } catch {
    fail8(`training row ${lineNumber} SFEN or played_move is invalid`);
  }
  if (positionIdForSfen(parentSfen) !== positionId) {
    fail8(`training row ${lineNumber} position_id does not match SFEN`);
  }
  return Object.freeze({
    gameSha256,
    parent: Object.freeze({
      game_id: gameId,
      parent_id: parentId,
      parent_sfen: parentSfen,
      played_move: playedMove,
      ply,
      position_id: positionId,
      schema_version: 1
    }),
    sourceUrl
  });
}
function parseAuthenticatedFloodgateTrainingRows(bytes, expectedIdentityInput) {
  if (!(bytes instanceof Uint8Array) || import_node_util6.types.isProxy(bytes)) {
    fail8("training raw snapshot must be a non-Proxy Uint8Array");
  }
  const expectedIdentity = captureFloodgateTrainingRawIdentity(
    expectedIdentityInput
  );
  if (bytes.byteLength !== expectedIdentity.bytes || sha2563(bytes) !== expectedIdentity.sha256) {
    fail8("training raw bytes do not match the authenticated identity");
  }
  if (bytes.byteLength >= 3 && bytes[0] === 239 && bytes[1] === 187 && bytes[2] === 191) {
    fail8("training raw snapshot contains a UTF-8 BOM");
  }
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return fail8("training raw snapshot is not fatal-valid UTF-8");
  }
  if (text.startsWith("\uFEFF") || text.includes("\0") || text.includes("\r") || !text.endsWith("\n") || text.endsWith("\n\n")) {
    fail8("training raw JSONL framing is not canonical");
  }
  const lines = text.slice(0, -1).split("\n");
  if (lines.length !== expectedIdentity.records || lines.some((line) => line.length === 0)) {
    fail8("training raw record count or blank-line framing differs");
  }
  const rows = [];
  const gameIds = /* @__PURE__ */ new Set();
  const parentIds = /* @__PURE__ */ new Set();
  const positionIds = /* @__PURE__ */ new Set();
  const gameSources = /* @__PURE__ */ new Map();
  let previousParentId;
  for (let index = 0; index < lines.length; index += 1) {
    let parsed;
    try {
      parsed = JSON.parse(lines[index]);
    } catch {
      return fail8(`training row ${index + 1} is not valid JSON`);
    }
    const parsedRow = parseRawParent(parsed, lines[index], index + 1);
    const row = parsedRow.parent;
    if (previousParentId !== void 0 && compareBytewise(previousParentId, row.parent_id) >= 0) {
      fail8("training parent_id order is not strict UTF-8 byte order");
    }
    previousParentId = row.parent_id;
    if (parentIds.has(row.parent_id)) fail8("training parent_id is duplicated");
    if (positionIds.has(row.position_id)) {
      fail8("training semantic position is duplicated");
    }
    const sourceIdentity = `${parsedRow.sourceUrl}\0${parsedRow.gameSha256}`;
    const existingSource = gameSources.get(row.game_id);
    if (existingSource !== void 0 && existingSource !== sourceIdentity) {
      fail8("training game source identity is inconsistent");
    }
    gameSources.set(row.game_id, sourceIdentity);
    gameIds.add(row.game_id);
    parentIds.add(row.parent_id);
    positionIds.add(row.position_id);
    rows.push(row);
  }
  if (gameIds.size !== expectedIdentity.games || parentIds.size !== expectedIdentity.records || positionIds.size !== expectedIdentity.position_ids_count || identifierDigest(gameIds) !== expectedIdentity.game_ids_sha256 || identifierDigest(parentIds) !== expectedIdentity.parent_ids_sha256 || identifierDigest(positionIds) !== expectedIdentity.position_ids_sha256) {
    fail8("training aggregate identity does not match the manifest");
  }
  return Object.freeze(rows);
}
var import_node_crypto5, import_node_util6, FLOODGATE_TRAINING_RAW_PARENT_FORMAT, FLOODGATE_TRAINING_RAW_MAX_BYTES, FLOODGATE_ORIGIN, FLOODGATE_EVENT, FLOODGATE_GAME_ID_DOMAIN, POSITION_ID_RE, SHA256_RE2, CONTROL_RE2, ENCODED_STRUCTURAL_RE, RAW_PARENT_KEYS, RAW_IDENTITY_KEYS;
var init_floodgate_training_row_validation = __esm({
  "ml/floodgate-training-row-validation.ts"() {
    "use strict";
    import_node_crypto5 = require("node:crypto");
    import_node_util6 = require("node:util");
    init_shogi_sfen_codec();
    init_shogi_sfen();
    FLOODGATE_TRAINING_RAW_PARENT_FORMAT = "shogi-floodgate-label-free-raw-parent-jsonl-v1";
    FLOODGATE_TRAINING_RAW_MAX_BYTES = 64 * 1024 * 1024;
    FLOODGATE_ORIGIN = "https://wdoor.c.u-tokyo.ac.jp";
    FLOODGATE_EVENT = "floodgate-300-10F";
    FLOODGATE_GAME_ID_DOMAIN = "floodgate-q1-2026-game-id-v1";
    POSITION_ID_RE = /^sha256:[0-9a-f]{64}$/u;
    SHA256_RE2 = /^[0-9a-f]{64}$/u;
    CONTROL_RE2 = /[\u0000-\u001f\u007f]/u;
    ENCODED_STRUCTURAL_RE = /%(?:2e|2f|5c|25)/iu;
    RAW_PARENT_KEYS = Object.freeze([
      "game_id",
      "game_sha256",
      "parent_id",
      "parent_sfen",
      "played_move",
      "ply",
      "position_id",
      "schema_version",
      "source",
      "source_url"
    ]);
    RAW_IDENTITY_KEYS = Object.freeze([
      "bytes",
      "format",
      "game_ids_sha256",
      "games",
      "parent_ids_sha256",
      "path",
      "position_ids_count",
      "position_ids_sha256",
      "records",
      "sha256"
    ]);
  }
});

// ml/floodgate-stable-wasm-deadline-read-only-consumer.ts
function fail9() {
  throw new Error("stable-WASM deadline read-only consumer rejected");
}
function canonicalPath3(value) {
  return typeof value === "string" && value.length > 1 && value.length <= 4096 && !value.includes("\0") && !value.includes("\n") && !value.includes("\r") && path7.isAbsolute(value) && path7.resolve(value) === value && path7.parse(value).root !== value;
}
function exactDataRecord3(value, keys) {
  if (value === null || typeof value !== "object" || Array.isArray(value) || import_node_util7.types.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
    fail9();
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const ownKeys = Reflect.ownKeys(descriptors);
  if (ownKeys.length !== keys.length || ownKeys.some((key) => typeof key !== "string" || !keys.includes(key))) {
    fail9();
  }
  const captured = /* @__PURE__ */ Object.create(null);
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (descriptor === void 0 || !("value" in descriptor) || descriptor.enumerable !== true) {
      fail9();
    }
    Object.defineProperty(captured, key, {
      configurable: false,
      enumerable: true,
      writable: false,
      value: descriptor.value
    });
  }
  return Object.freeze(captured);
}
function captureOptions2(value) {
  const record = exactDataRecord3(value, OPTION_KEYS);
  for (const key of [
    "legacyProtectedPositionIdsPath",
    "outputRoot",
    "rawLockRoot",
    "repositoryRoot",
    "roleLockRoot"
  ]) {
    if (!canonicalPath3(record[key])) fail9();
  }
  if (typeof record.verifierRevision !== "string" || !REVISION_RE3.test(record.verifierRevision)) {
    fail9();
  }
  return Object.freeze({
    legacyProtectedPositionIdsPath: record.legacyProtectedPositionIdsPath,
    outputRoot: record.outputRoot,
    rawLockRoot: record.rawLockRoot,
    repositoryRoot: record.repositoryRoot,
    roleLockRoot: record.roleLockRoot,
    verifierRevision: record.verifierRevision
  });
}
function captureExpectedIdentity(value, expectedPath) {
  const record = exactDataRecord3(value, ["bytes", "path", "sha256"]);
  if (!Number.isSafeInteger(record.bytes) || record.bytes <= 0 || record.path !== expectedPath || typeof record.sha256 !== "string" || !SHA256_RE3.test(record.sha256)) {
    fail9();
  }
  return Object.freeze({
    bytes: record.bytes,
    path: expectedPath,
    sha256: record.sha256
  });
}
function snapshot3(value) {
  return Object.freeze({
    ctimeNs: value.ctimeNs,
    dev: value.dev,
    gid: value.gid,
    ino: value.ino,
    mode: value.mode,
    mtimeNs: value.mtimeNs,
    nlink: value.nlink,
    size: value.size,
    uid: value.uid
  });
}
function sameSnapshot3(left, right) {
  return left.ctimeNs === right.ctimeNs && left.dev === right.dev && left.gid === right.gid && left.ino === right.ino && left.mode === right.mode && left.mtimeNs === right.mtimeNs && left.nlink === right.nlink && left.size === right.size && left.uid === right.uid;
}
async function readHeldFile(handle, size, retainBytes) {
  const digest = (0, import_node_crypto6.createHash)("sha256");
  const retained = retainBytes ? Buffer.alloc(size) : null;
  const chunk = Buffer.alloc(Math.min(READ_CHUNK_BYTES, Math.max(1, size)));
  let offset = 0;
  try {
    while (offset < size) {
      const requested = Math.min(chunk.byteLength, size - offset);
      const { bytesRead } = await handle.read(chunk, 0, requested, offset);
      if (bytesRead !== requested) fail9();
      digest.update(chunk.subarray(0, bytesRead));
      if (retained !== null) {
        chunk.copy(retained, offset, 0, bytesRead);
      }
      offset += bytesRead;
    }
    const extra = Buffer.alloc(1);
    try {
      const { bytesRead } = await handle.read(extra, 0, 1, size);
      if (bytesRead !== 0) fail9();
    } finally {
      extra.fill(0);
    }
    return Object.freeze({
      bytes: retained,
      sha256: digest.digest("hex")
    });
  } catch (error) {
    retained?.fill(0);
    throw error;
  } finally {
    chunk.fill(0);
  }
}
async function openRoleRoot(outputRoot, effectiveUserId) {
  if (fs7.realpathSync.native(outputRoot) !== outputRoot) fail9();
  const before = snapshot3(
    await fs7.promises.lstat(outputRoot, { bigint: true })
  );
  if ((before.mode & TYPE_MASK3) !== DIRECTORY_TYPE3 || (before.mode & MODE_MASK3) !== DIRECTORY_MODE3 || before.uid !== BigInt(effectiveUserId)) {
    fail9();
  }
  const handle = await fs7.promises.open(outputRoot, DIRECTORY_FLAGS3);
  try {
    const held = snapshot3(await handle.stat({ bigint: true }));
    const named = snapshot3(
      await fs7.promises.lstat(outputRoot, { bigint: true })
    );
    if (!sameSnapshot3(before, held) || !sameSnapshot3(held, named)) fail9();
    return Object.freeze({ handle, snapshot: held });
  } catch (error) {
    await handle.close().catch(() => void 0);
    throw error;
  }
}
async function openRoleFile(outputRoot, effectiveUserId, specification) {
  const filePath = path7.join(outputRoot, specification.filename);
  if (fs7.realpathSync.native(filePath) !== filePath) fail9();
  const before = snapshot3(await fs7.promises.lstat(filePath, { bigint: true }));
  if ((before.mode & TYPE_MASK3) !== REGULAR_TYPE3 || (before.mode & MODE_MASK3) !== FILE_MODE3 || before.uid !== BigInt(effectiveUserId) || before.nlink !== BigInt(1) || before.size <= BigInt(0) || before.size > BigInt(specification.maximumBytes)) {
    fail9();
  }
  const handle = await fs7.promises.open(filePath, FILE_FLAGS3);
  try {
    const held = snapshot3(await handle.stat({ bigint: true }));
    if (!sameSnapshot3(before, held)) fail9();
    const size = Number(held.size);
    const content = await readHeldFile(handle, size, specification.retainBytes);
    const heldAfter = snapshot3(await handle.stat({ bigint: true }));
    if (!sameSnapshot3(held, heldAfter)) {
      content.bytes?.fill(0);
      fail9();
    }
    return Object.freeze({
      bytes: content.bytes,
      handle,
      identity: Object.freeze({
        bytes: size,
        sha256: content.sha256
      }),
      path: filePath,
      snapshot: held
    });
  } catch (error) {
    await handle.close().catch(() => void 0);
    throw error;
  }
}
async function openTrackedReceipt(repositoryRoot, effectiveUserId, expectedIdentity) {
  const receiptPath = path7.join(
    repositoryRoot,
    ...expectedIdentity.path.split("/")
  );
  if (fs7.realpathSync.native(receiptPath) !== receiptPath) fail9();
  const before = snapshot3(
    await fs7.promises.lstat(receiptPath, { bigint: true })
  );
  if ((before.mode & TYPE_MASK3) !== REGULAR_TYPE3 || before.uid !== BigInt(effectiveUserId) || before.nlink !== BigInt(1) || before.size !== BigInt(expectedIdentity.bytes)) {
    fail9();
  }
  const handle = await fs7.promises.open(receiptPath, FILE_FLAGS3);
  try {
    const held = snapshot3(await handle.stat({ bigint: true }));
    if (!sameSnapshot3(before, held)) fail9();
    const content = await readHeldFile(handle, expectedIdentity.bytes, true);
    if (content.bytes === null || content.sha256 !== expectedIdentity.sha256) {
      content.bytes?.fill(0);
      fail9();
    }
    return Object.freeze({
      bytes: content.bytes,
      handle,
      identity: Object.freeze({
        bytes: content.bytes.byteLength,
        sha256: content.sha256
      }),
      path: receiptPath,
      snapshot: held
    });
  } catch (error) {
    await handle.close().catch(() => void 0);
    throw error;
  }
}
function canonicalJson4(value) {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) fail9();
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson4(entry)).join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value;
    const keys = Object.keys(record).sort(
      (left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right))
    );
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson4(record[key])}`).join(",")}}`;
  }
  return fail9();
}
function parseCanonicalJson(bytes) {
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return fail9();
  }
  if (text.startsWith("\uFEFF") || text.includes("\0") || text.includes("\r") || !text.endsWith("\n") || text.endsWith("\n\n")) {
    fail9();
  }
  let parsed;
  try {
    parsed = JSON.parse(text.slice(0, -1));
  } catch {
    return fail9();
  }
  if (`${canonicalJson4(parsed)}
` !== text) fail9();
  return parsed;
}
function requiredPositiveInteger(value) {
  if (!Number.isSafeInteger(value) || value <= 0) fail9();
  return value;
}
function requiredSha256(value) {
  if (typeof value !== "string" || !SHA256_RE3.test(value)) fail9();
  return value;
}
function captureBaseFileIdentity(value, expectedPath) {
  if (value.path !== expectedPath) fail9();
  return Object.freeze({
    bytes: requiredPositiveInteger(value.bytes),
    path: expectedPath,
    sha256: requiredSha256(value.sha256)
  });
}
function captureProtectedIdentity(value, expectedPath) {
  const record = exactDataRecord3(value, [
    "bytes",
    "count",
    "format",
    "identifiers_sha256",
    "path",
    "sha256"
  ]);
  if (record.format !== PROTECTED_FORMAT || requiredPositiveInteger(record.count) < 1) {
    fail9();
  }
  requiredSha256(record.identifiers_sha256);
  return captureBaseFileIdentity(record, expectedPath);
}
function captureRawIdentity(value, expectedPath) {
  const record = exactDataRecord3(value, [
    "bytes",
    "format",
    "game_ids_sha256",
    "games",
    "parent_ids_sha256",
    "path",
    "position_ids_count",
    "position_ids_sha256",
    "records",
    "sha256"
  ]);
  if (record.format !== FLOODGATE_TRAINING_RAW_PARENT_FORMAT) fail9();
  for (const key of ["games", "position_ids_count", "records"]) {
    requiredPositiveInteger(record[key]);
  }
  for (const key of [
    "game_ids_sha256",
    "parent_ids_sha256",
    "position_ids_sha256"
  ]) {
    requiredSha256(record[key]);
  }
  return captureBaseFileIdentity(record, expectedPath);
}
function captureSimpleIdentity(value, expectedPath) {
  return captureBaseFileIdentity(
    exactDataRecord3(value, ["bytes", "path", "sha256"]),
    expectedPath
  );
}
function captureManifest(manifestBytes, expectedIdentity) {
  if (manifestBytes.byteLength !== expectedIdentity.bytes || (0, import_node_crypto6.createHash)("sha256").update(manifestBytes).digest("hex") !== expectedIdentity.sha256) {
    fail9();
  }
  const manifest = parseCanonicalJson(manifestBytes);
  const record = exactDataRecord3(manifest, MANIFEST_KEYS);
  if (record.schema !== "shogi-floodgate-label-free-role-bundle-v2" || record.status !== "complete-label-free-role-bundle") {
    fail9();
  }
  const pipeline = exactDataRecord3(record.pipeline, [
    "source_revision",
    "tracked_tree_clean"
  ]);
  if (typeof pipeline.source_revision !== "string" || !REVISION_RE3.test(pipeline.source_revision) || pipeline.tracked_tree_clean !== true) {
    fail9();
  }
  const roles = exactDataRecord3(record.roles, [
    "fresh_final_holdout",
    "fresh_selection",
    "training"
  ]);
  const training = exactDataRecord3(roles.training, [
    "protected_position_ids",
    "raw_parents"
  ]);
  const freshFinal = exactDataRecord3(roles.fresh_final_holdout, [
    "protected_position_ids",
    "raw_parents"
  ]);
  const freshSelection = exactDataRecord3(roles.fresh_selection, [
    "protected_position_ids",
    "raw_parents"
  ]);
  const replay = exactDataRecord3(record.replay_exclusion, [
    "identifiers",
    "receipt",
    "summary"
  ]);
  const trainingRawIdentity = captureFloodgateTrainingRawIdentity(
    training.raw_parents
  );
  const identities = [
    captureProtectedIdentity(
      freshFinal.protected_position_ids,
      "fresh-final-holdout.protected-position-ids.txt"
    ),
    captureRawIdentity(freshFinal.raw_parents, "fresh-final-holdout.raw.jsonl"),
    captureProtectedIdentity(
      freshSelection.protected_position_ids,
      "fresh-selection.protected-position-ids.txt"
    ),
    captureRawIdentity(freshSelection.raw_parents, "fresh-selection.raw.jsonl"),
    Object.freeze({
      bytes: expectedIdentity.bytes,
      path: expectedIdentity.path,
      sha256: expectedIdentity.sha256
    }),
    captureProtectedIdentity(
      replay.identifiers,
      "replay-excluded-position-ids.txt"
    ),
    captureSimpleIdentity(replay.receipt, "replay-exclusion-receipt.json"),
    captureProtectedIdentity(
      training.protected_position_ids,
      "training.protected-position-ids.txt"
    ),
    captureRawIdentity(training.raw_parents, "training.raw.jsonl")
  ];
  const fileIdentities = new Map(
    identities.map((identity) => [identity.path, identity])
  );
  if (identities.length !== FLOODGATE_STABLE_WASM_DEADLINE_READ_ONLY_ROLE_FILES.length || fileIdentities.size !== identities.length || FLOODGATE_STABLE_WASM_DEADLINE_READ_ONLY_ROLE_FILES.some(
    (filename) => !fileIdentities.has(filename)
  )) {
    fail9();
  }
  return Object.freeze({
    fileIdentities,
    manifest,
    producerRevision: pipeline.source_revision,
    rawIdentity: trainingRawIdentity
  });
}
function assertReceipt(receiptBytes, manifest, expectedManifestIdentity) {
  const receipt = exactDataRecord3(
    parseCanonicalJson(receiptBytes),
    RESULT_KEYS
  );
  if (receipt.schema !== "shogi-floodgate-role-bundle-result-v1" || receipt.status !== "complete-label-free-role-bundle" || receipt.claim_boundary !== "integrity-only-not-playing-strength-evidence") {
    fail9();
  }
  const receiptManifest = exactDataRecord3(receipt.manifest, [
    "identity",
    "value"
  ]);
  const identity = exactDataRecord3(receiptManifest.identity, [
    "bytes",
    "path",
    "sha256"
  ]);
  if (identity.bytes !== expectedManifestIdentity.bytes || identity.path !== expectedManifestIdentity.path || identity.sha256 !== expectedManifestIdentity.sha256 || canonicalJson4(receiptManifest.value) !== canonicalJson4(manifest)) {
    fail9();
  }
}
async function revalidateRoleFile(opened) {
  const held = snapshot3(await opened.handle.stat({ bigint: true }));
  const named = snapshot3(
    await fs7.promises.lstat(opened.path, { bigint: true })
  );
  if (!sameSnapshot3(opened.snapshot, held) || !sameSnapshot3(held, named) || fs7.realpathSync.native(opened.path) !== opened.path) {
    fail9();
  }
}
function buildInput(rows, rawIdentity, producerRevision, verifierRevision, expectedManifestIdentity, expectedReceiptIdentity) {
  return Object.freeze({
    binding: Object.freeze({
      bundle_manifest_bytes: expectedManifestIdentity.bytes,
      bundle_manifest_sha256: expectedManifestIdentity.sha256,
      bundle_producer_revision: producerRevision,
      game_ids_sha256: rawIdentity.game_ids_sha256,
      games: rawIdentity.games,
      parent_ids_sha256: rawIdentity.parent_ids_sha256,
      position_ids_count: rawIdentity.position_ids_count,
      position_ids_sha256: rawIdentity.position_ids_sha256,
      raw_bytes: rawIdentity.bytes,
      raw_format: FLOODGATE_TRAINING_RAW_PARENT_FORMAT,
      raw_sha256: rawIdentity.sha256,
      records: rawIdentity.records,
      result_receipt_bytes: expectedReceiptIdentity.bytes,
      result_receipt_sha256: expectedReceiptIdentity.sha256,
      verifier_revision: verifierRevision
    }),
    role: "training",
    rows,
    schema: "shogi-floodgate-stable-wasm-deadline-authenticated-rows-v1"
  });
}
function claimInput(registry, input) {
  if (input === null || typeof input !== "object" || import_node_util7.types.isProxy(input) || !registry.delete(input)) {
    fail9();
  }
}
function claimPostflight(registry, capability) {
  if (capability === null || typeof capability !== "object" || import_node_util7.types.isProxy(capability) || !registry.delete(capability)) {
    fail9();
  }
}
async function consume(optionsInput, callback, dependencies, inputClaims, postflightClaims) {
  const options = captureOptions2(optionsInput);
  if (typeof callback !== "function" || import_node_util7.types.isProxy(callback) || !Number.isSafeInteger(dependencies.effectiveUserId) || dependencies.effectiveUserId <= 0 || typeof dependencies.assertExactCleanRevision !== "function" || import_node_util7.types.isProxy(dependencies.assertExactCleanRevision)) {
    fail9();
  }
  const expectedManifestIdentity = captureExpectedIdentity(
    dependencies.expectedManifestIdentity,
    "manifest.json"
  );
  const expectedReceiptIdentity = captureExpectedIdentity(
    dependencies.expectedReceiptIdentity,
    "ml/protocols/floodgate-q1-2026-role-bundle-result.json"
  );
  await dependencies.assertExactCleanRevision(
    options.repositoryRoot,
    options.verifierRevision
  );
  const roleRoot = await openRoleRoot(
    options.outputRoot,
    dependencies.effectiveUserId
  );
  const opened = [];
  let receipt;
  let primary;
  try {
    for (const specification of ROLE_FILE_SPECIFICATIONS) {
      opened.push(
        await openRoleFile(
          options.outputRoot,
          dependencies.effectiveUserId,
          specification
        )
      );
    }
    receipt = await openTrackedReceipt(
      options.repositoryRoot,
      dependencies.effectiveUserId,
      expectedReceiptIdentity
    );
    const manifestFile = opened.find(
      (entry) => entry.path.endsWith(`${path7.sep}manifest.json`)
    );
    const trainingFile = opened.find(
      (entry) => entry.path.endsWith(`${path7.sep}training.raw.jsonl`)
    );
    if (manifestFile?.bytes === null || manifestFile?.bytes === void 0 || trainingFile?.bytes === null || trainingFile?.bytes === void 0 || receipt.bytes === null) {
      fail9();
    }
    const capturedManifest = captureManifest(
      manifestFile.bytes,
      expectedManifestIdentity
    );
    assertReceipt(
      receipt.bytes,
      capturedManifest.manifest,
      expectedManifestIdentity
    );
    if (opened.length !== FLOODGATE_STABLE_WASM_DEADLINE_READ_ONLY_ROLE_FILES.length) {
      fail9();
    }
    for (const roleFile of opened) {
      const filename = path7.basename(roleFile.path);
      const expected = capturedManifest.fileIdentities.get(filename);
      if (expected === void 0 || expected.bytes !== roleFile.identity.bytes || expected.sha256 !== roleFile.identity.sha256) {
        fail9();
      }
    }
    if (trainingFile.identity.bytes !== capturedManifest.rawIdentity.bytes || trainingFile.identity.sha256 !== capturedManifest.rawIdentity.sha256) {
      fail9();
    }
    const rows = parseAuthenticatedFloodgateTrainingRows(
      trainingFile.bytes,
      capturedManifest.rawIdentity
    );
    const input = buildInput(
      rows,
      capturedManifest.rawIdentity,
      capturedManifest.producerRevision,
      options.verifierRevision,
      expectedManifestIdentity,
      expectedReceiptIdentity
    );
    inputClaims.add(input);
    let callbackPromise;
    let claimed2 = false;
    try {
      callbackPromise = callback(input);
    } finally {
      claimed2 = !inputClaims.delete(input);
    }
    if (!claimed2 || callbackPromise === void 0 || !(callbackPromise instanceof Promise) || import_node_util7.types.isProxy(callbackPromise)) {
      callbackPromise?.catch(() => void 0);
      fail9();
    }
    const callbackValue = await callbackPromise;
    if (callbackValue !== void 0) fail9();
    await revalidateRoleFile(receipt);
    for (const roleFile of opened) await revalidateRoleFile(roleFile);
    const heldRoot = snapshot3(await roleRoot.handle.stat({ bigint: true }));
    const namedRoot = snapshot3(
      await fs7.promises.lstat(options.outputRoot, { bigint: true })
    );
    if (!sameSnapshot3(roleRoot.snapshot, heldRoot) || !sameSnapshot3(heldRoot, namedRoot) || fs7.realpathSync.native(options.outputRoot) !== options.outputRoot) {
      fail9();
    }
  } catch (error) {
    primary = error;
    throw error;
  } finally {
    for (const roleFile of opened) roleFile.bytes?.fill(0);
    receipt?.bytes?.fill(0);
    const closeResults = await Promise.allSettled([
      ...opened.map((roleFile) => roleFile.handle.close()),
      ...receipt === void 0 ? [] : [receipt.handle.close()],
      roleRoot.handle.close()
    ]);
    if (primary === void 0 && closeResults.some((result) => result.status === "rejected")) {
      fail9();
    }
  }
  await dependencies.assertExactCleanRevision(
    options.repositoryRoot,
    options.verifierRevision
  );
  const postflight = Object.freeze({
    contract: "shogi-floodgate-stable-wasm-deadline-consumer-postflight-capability-v1",
    status: "opaque-single-use-postflight-not-claimed"
  });
  postflightClaims.add(postflight);
  return postflight;
}
function withFloodgateStableWasmDeadlineReadOnlyRows(options, callback, effectiveUserId) {
  if (arguments.length !== 3) {
    return Promise.reject(new Error("read-only consumer invocation rejected"));
  }
  return consume(
    options,
    callback,
    {
      assertExactCleanRevision: assertFloodgateGitExactCleanRevision,
      effectiveUserId,
      expectedManifestIdentity: FLOODGATE_STABLE_WASM_DEADLINE_PINNED_MANIFEST_IDENTITY,
      expectedReceiptIdentity: FLOODGATE_STABLE_WASM_DEADLINE_PINNED_RECEIPT_IDENTITY
    },
    productionInputClaims,
    productionPostflightClaims
  );
}
function claimFloodgateStableWasmDeadlineReadOnlyRows(input) {
  if (arguments.length !== 1) fail9();
  claimInput(productionInputClaims, input);
}
function claimFloodgateStableWasmDeadlineConsumerPostflight(capability) {
  if (arguments.length !== 1) fail9();
  claimPostflight(productionPostflightClaims, capability);
}
var import_node_crypto6, fs7, path7, import_node_util7, FLOODGATE_STABLE_WASM_DEADLINE_READ_ONLY_ROLE_FILES, FLOODGATE_STABLE_WASM_DEADLINE_PINNED_MANIFEST_IDENTITY, FLOODGATE_STABLE_WASM_DEADLINE_PINNED_RECEIPT_IDENTITY, ROLE_FILE_SPECIFICATIONS, MANIFEST_KEYS, RESULT_KEYS, OPTION_KEYS, REVISION_RE3, SHA256_RE3, PROTECTED_FORMAT, MODE_MASK3, TYPE_MASK3, DIRECTORY_TYPE3, REGULAR_TYPE3, DIRECTORY_MODE3, FILE_MODE3, DIRECTORY_FLAGS3, FILE_FLAGS3, READ_CHUNK_BYTES, productionInputClaims, productionPostflightClaims;
var init_floodgate_stable_wasm_deadline_read_only_consumer = __esm({
  "ml/floodgate-stable-wasm-deadline-read-only-consumer.ts"() {
    "use strict";
    import_node_crypto6 = require("node:crypto");
    fs7 = __toESM(require("node:fs"));
    path7 = __toESM(require("node:path"));
    import_node_util7 = require("node:util");
    init_floodgate_git();
    init_floodgate_training_row_validation();
    FLOODGATE_STABLE_WASM_DEADLINE_READ_ONLY_ROLE_FILES = Object.freeze([
      "fresh-final-holdout.protected-position-ids.txt",
      "fresh-final-holdout.raw.jsonl",
      "fresh-selection.protected-position-ids.txt",
      "fresh-selection.raw.jsonl",
      "manifest.json",
      "replay-excluded-position-ids.txt",
      "replay-exclusion-receipt.json",
      "training.protected-position-ids.txt",
      "training.raw.jsonl"
    ]);
    FLOODGATE_STABLE_WASM_DEADLINE_PINNED_MANIFEST_IDENTITY = Object.freeze({
      bytes: 7202,
      path: "manifest.json",
      sha256: "2bafc01f602c98ea63069e04b8d39c36470bcc6d31e1861fdaa83c6fc50e3cf9"
    });
    FLOODGATE_STABLE_WASM_DEADLINE_PINNED_RECEIPT_IDENTITY = Object.freeze({
      bytes: 14735,
      path: "ml/protocols/floodgate-q1-2026-role-bundle-result.json",
      sha256: "56009b1abaf83a75ae66ea8abf62e1f9f7214ad1aa687f7808972679e4af3ccf"
    });
    ROLE_FILE_SPECIFICATIONS = Object.freeze(
      FLOODGATE_STABLE_WASM_DEADLINE_READ_ONLY_ROLE_FILES.map(
        (filename) => Object.freeze({
          filename,
          maximumBytes: filename === "manifest.json" || filename === "replay-exclusion-receipt.json" ? 64 * 1024 : filename === "training.raw.jsonl" ? 64 * 1024 * 1024 : 512 * 1024 * 1024,
          retainBytes: filename === "manifest.json" || filename === "training.raw.jsonl"
        })
      )
    );
    MANIFEST_KEYS = Object.freeze([
      "contract",
      "isolation",
      "pipeline",
      "provenance",
      "replay_exclusion",
      "roles",
      "schema",
      "sources",
      "status"
    ]);
    RESULT_KEYS = Object.freeze([
      "claim_boundary",
      "execution",
      "manifest",
      "post_run_audit",
      "schema",
      "status"
    ]);
    OPTION_KEYS = Object.freeze([
      "legacyProtectedPositionIdsPath",
      "outputRoot",
      "rawLockRoot",
      "repositoryRoot",
      "roleLockRoot",
      "verifierRevision"
    ]);
    REVISION_RE3 = /^[0-9a-f]{40}$/u;
    SHA256_RE3 = /^[0-9a-f]{64}$/u;
    PROTECTED_FORMAT = "sorted-unique-sha256-position-id-utf8-lf-v1";
    MODE_MASK3 = BigInt(4095);
    TYPE_MASK3 = BigInt(fs7.constants.S_IFMT);
    DIRECTORY_TYPE3 = BigInt(fs7.constants.S_IFDIR);
    REGULAR_TYPE3 = BigInt(fs7.constants.S_IFREG);
    DIRECTORY_MODE3 = BigInt(448);
    FILE_MODE3 = BigInt(384);
    DIRECTORY_FLAGS3 = fs7.constants.O_RDONLY | fs7.constants.O_DIRECTORY | fs7.constants.O_NOFOLLOW;
    FILE_FLAGS3 = fs7.constants.O_RDONLY | fs7.constants.O_NOFOLLOW;
    READ_CHUNK_BYTES = 1024 * 1024;
    productionInputClaims = /* @__PURE__ */ new WeakSet();
    productionPostflightClaims = /* @__PURE__ */ new WeakSet();
  }
});

// ml/floodgate-stable-wasm-deadline-run-binding.ts
var floodgate_stable_wasm_deadline_run_binding_exports = {};
__export(floodgate_stable_wasm_deadline_run_binding_exports, {
  FLOODGATE_STABLE_WASM_DEADLINE_RUN_BINDING_CLAIM_BOUNDARY: () => FLOODGATE_STABLE_WASM_DEADLINE_RUN_BINDING_CLAIM_BOUNDARY,
  FLOODGATE_STABLE_WASM_DEADLINE_RUN_BINDING_FAILURE_SCHEMA: () => FLOODGATE_STABLE_WASM_DEADLINE_RUN_BINDING_FAILURE_SCHEMA,
  FLOODGATE_STABLE_WASM_DEADLINE_RUN_BINDING_FAILURE_STATUS: () => FLOODGATE_STABLE_WASM_DEADLINE_RUN_BINDING_FAILURE_STATUS,
  FLOODGATE_STABLE_WASM_DEADLINE_RUN_BINDING_REQUIRED_NODE: () => FLOODGATE_STABLE_WASM_DEADLINE_RUN_BINDING_REQUIRED_NODE,
  FLOODGATE_STABLE_WASM_DEADLINE_RUN_BINDING_SCHEMA: () => FLOODGATE_STABLE_WASM_DEADLINE_RUN_BINDING_SCHEMA,
  FLOODGATE_STABLE_WASM_DEADLINE_RUN_BINDING_SCOPE_COUNT: () => FLOODGATE_STABLE_WASM_DEADLINE_RUN_BINDING_SCOPE_COUNT,
  FLOODGATE_STABLE_WASM_DEADLINE_RUN_BINDING_STATUS: () => FLOODGATE_STABLE_WASM_DEADLINE_RUN_BINDING_STATUS,
  FloodgateStableWasmDeadlineRunBindingError: () => FloodgateStableWasmDeadlineRunBindingError,
  assertFloodgateStableWasmDeadlineRunBindingInvocation: () => assertFloodgateStableWasmDeadlineRunBindingInvocation,
  captureFloodgateStableWasmDeadlineDiagnosticAggregateCoreForTests: () => captureFloodgateStableWasmDeadlineDiagnosticAggregateCoreForTests,
  floodgateStableWasmDeadlineRunBindingFailure: () => floodgateStableWasmDeadlineRunBindingFailure,
  runFloodgateStableWasmDeadlineRunBinding: () => runFloodgateStableWasmDeadlineRunBinding,
  runFloodgateStableWasmDeadlineRunBindingCoreForTests: () => runFloodgateStableWasmDeadlineRunBindingCoreForTests
});
function fail10(phase) {
  throw new FloodgateStableWasmDeadlineRunBindingError(phase);
}
function statString(stat) {
  return [
    stat.dev,
    stat.ino,
    stat.mode,
    stat.nlink,
    stat.uid,
    stat.gid,
    stat.size,
    stat.mtimeNs,
    stat.ctimeNs
  ].map(String).join(":");
}
function sameIdentityAndMetadata(left, right) {
  return statString(left) === statString(right);
}
function canonicalAbsolutePath3(value) {
  return typeof value === "string" && value.length > 1 && path8.isAbsolute(value) && path8.resolve(value) === value && !value.includes("\0");
}
async function readStableRegularFile(specification, effectiveUserId) {
  if (!canonicalAbsolutePath3(specification.path) || !Number.isSafeInteger(specification.maximumBytes) || specification.maximumBytes < 1) {
    throw new Error("invalid fixed file specification");
  }
  const before = await fs8.promises.lstat(specification.path, {
    bigint: true
  });
  const beforeRealpath = await fs8.promises.realpath(specification.path);
  if (beforeRealpath !== specification.path || (before.mode & MODE_TYPE_MASK) !== MODE_REGULAR || before.nlink !== BigInt(1) || before.uid !== BigInt(effectiveUserId) || before.size < BigInt(0) || before.size > BigInt(specification.maximumBytes)) {
    throw new Error("fixed file namespace or metadata is invalid");
  }
  const handle = await fs8.promises.open(
    specification.path,
    fs8.constants.O_RDONLY | fs8.constants.O_NOFOLLOW
  );
  let bytes = null;
  let completed = false;
  let closeFailure = null;
  try {
    const heldBefore = await handle.stat({ bigint: true });
    if (!sameIdentityAndMetadata(before, heldBefore)) {
      throw new Error("pathname and held descriptor differ");
    }
    bytes = await handle.readFile();
    if (BigInt(bytes.byteLength) !== heldBefore.size) {
      throw new Error("held file byte count changed");
    }
    const heldAfter = await handle.stat({ bigint: true });
    const after = await fs8.promises.lstat(specification.path, {
      bigint: true
    });
    const afterRealpath = await fs8.promises.realpath(specification.path);
    if (afterRealpath !== specification.path || !sameIdentityAndMetadata(heldBefore, heldAfter) || !sameIdentityAndMetadata(heldAfter, after)) {
      throw new Error("fixed file changed during stable read");
    }
    completed = true;
    return Object.freeze({
      bytes,
      fingerprint: Object.freeze({
        label: specification.label,
        path: specification.path,
        bytes: String(bytes.byteLength),
        sha256: (0, import_node_crypto7.createHash)("sha256").update(bytes).digest("hex"),
        stat: statString(heldAfter)
      })
    });
  } finally {
    try {
      await handle.close();
    } catch (error) {
      closeFailure = error;
    }
    if (!completed || closeFailure !== null) bytes?.fill(0);
    if (closeFailure !== null) throw closeFailure;
  }
}
async function snapshotScope(specifications, effectiveUserId) {
  const snapshots = [];
  for (const specification of specifications) {
    const stable = await readStableRegularFile(specification, effectiveUserId);
    try {
      snapshots.push(stable.fingerprint);
    } finally {
      stable.bytes.fill(0);
    }
  }
  return Object.freeze(snapshots);
}
function controlSpecifications(homeDirectory) {
  return Object.freeze([
    Object.freeze({
      label: "control.connector-registry",
      path: path8.join(
        homeDirectory,
        ...FLOODGATE_STABLE_WASM_DEADLINE_READ_ONLY_REGISTRY_ROOT_COMPONENTS,
        FLOODGATE_STABLE_WASM_DEADLINE_READ_ONLY_REGISTRY_FILENAME
      ),
      maximumBytes: CONTROL_MAX_BYTES
    }),
    Object.freeze({
      label: "control.approved-key-enrollment",
      path: path8.join(
        homeDirectory,
        ...APPROVED_KEY_ENROLLMENT_ROOT_COMPONENTS,
        APPROVED_KEY_ENROLLMENT_FILENAME
      ),
      maximumBytes: CONTROL_MAX_BYTES
    })
  ]);
}
function assetSpecifications(homeDirectory) {
  const assetRoot = path8.join(
    homeDirectory,
    ...FLOODGATE_STABLE_WASM_DEADLINE_READ_ONLY_ASSET_ROOT_COMPONENTS
  );
  return Object.freeze([
    Object.freeze({
      label: "runtime.stable-wasm",
      path: path8.join(assetRoot, ...STABLE_WASM_RELATIVE_PATH),
      maximumBytes: 35597
    }),
    Object.freeze({
      label: "runtime.stable-weights",
      path: path8.join(assetRoot, ...STABLE_WEIGHTS_RELATIVE_PATH),
      maximumBytes: 1185988
    })
  ]);
}
function roleSpecifications(outputRoot) {
  if (!canonicalAbsolutePath3(outputRoot)) {
    throw new Error("role output root is not canonical");
  }
  return Object.freeze(
    ROLE_BUNDLE_FILES.map(
      (filename) => Object.freeze({
        label: `role.${filename}`,
        path: path8.join(outputRoot, filename),
        maximumBytes: ROLE_FILE_MAX_BYTES
      })
    )
  );
}
function fingerprintsEqual(left, right) {
  return left.label === right.label && left.path === right.path && left.bytes === right.bytes && left.sha256 === right.sha256 && left.stat === right.stat;
}
function comparePersistentState(before, after) {
  if (before.length !== FLOODGATE_STABLE_WASM_DEADLINE_RUN_BINDING_SCOPE_COUNT || after.length !== FLOODGATE_STABLE_WASM_DEADLINE_RUN_BINDING_SCOPE_COUNT) {
    throw new Error("persistent scope count is invalid");
  }
  const beforeByLabel = new Map(
    before.map((fingerprint) => [fingerprint.label, fingerprint])
  );
  let unchanged = 0;
  for (const current of after) {
    const earlier = beforeByLabel.get(current.label);
    if (earlier !== void 0 && fingerprintsEqual(earlier, current)) {
      unchanged += 1;
    }
  }
  if (unchanged !== FLOODGATE_STABLE_WASM_DEADLINE_RUN_BINDING_SCOPE_COUNT) {
    throw new Error("persistent scope changed");
  }
  return Object.freeze({
    all_unchanged: true,
    scope_count: FLOODGATE_STABLE_WASM_DEADLINE_RUN_BINDING_SCOPE_COUNT,
    unchanged_count: FLOODGATE_STABLE_WASM_DEADLINE_RUN_BINDING_SCOPE_COUNT
  });
}
async function readTrackedWorkers(repositoryRoot, effectiveUserId) {
  const calibration = await readStableRegularFile(
    {
      label: "tracked.public-calibration-worker",
      path: path8.join(repositoryRoot, "ml", CALIBRATION_WORKER_FILENAME),
      maximumBytes: TRACKED_SOURCE_MAX_BYTES
    },
    effectiveUserId
  );
  let diagnostic = null;
  try {
    diagnostic = await readStableRegularFile(
      {
        label: "tracked.private-diagnostic-worker",
        path: path8.join(repositoryRoot, "ml", DIAGNOSTIC_WORKER_FILENAME),
        maximumBytes: TRACKED_SOURCE_MAX_BYTES
      },
      effectiveUserId
    );
    if (calibration.bytes.byteLength !== FLOODGATE_STABLE_WASM_DEADLINE_PUBLIC_CALIBRATION_WORKER_IDENTITY.bytes || (0, import_node_crypto7.createHash)("sha256").update(calibration.bytes).digest("hex") !== FLOODGATE_STABLE_WASM_DEADLINE_PUBLIC_CALIBRATION_WORKER_IDENTITY.sha256 || diagnostic.bytes.byteLength !== FLOODGATE_STABLE_WASM_DIAGNOSTIC_WORKER_IDENTITY.bytes || (0, import_node_crypto7.createHash)("sha256").update(diagnostic.bytes).digest("hex") !== FLOODGATE_STABLE_WASM_DIAGNOSTIC_WORKER_IDENTITY.sha256) {
      throw new Error("tracked worker source identity is invalid");
    }
    return Object.freeze({
      calibration: import_node_buffer2.Buffer.from(calibration.bytes),
      diagnostic: import_node_buffer2.Buffer.from(diagnostic.bytes)
    });
  } finally {
    calibration.bytes.fill(0);
    diagnostic?.bytes.fill(0);
  }
}
function trainingRowsToDiagnosticInputs(input) {
  if (!Array.isArray(input.rows) || input.rows.length < 14) {
    throw new Error("authenticated training input has too few rows");
  }
  const selected = input.rows.slice(2, 14);
  if (selected.length !== FLOODGATE_STABLE_WASM_DIAGNOSTIC_MAX_REQUESTS) {
    throw new Error("fixed logical row selection is incomplete");
  }
  return Object.freeze(
    selected.map((row) => {
      const { position } = positionFromSfen(row.parent_sfen);
      const board = [];
      for (let file = 1; file <= 9; file += 1) {
        for (let rank = 1; rank <= 9; rank += 1) {
          board.push(position.ban[(file << 4) + rank] | 0);
        }
      }
      const hands = [];
      for (let koma = 17; koma <= 39; koma += 1) {
        hands.push(position.hand[koma] | 0);
      }
      return Object.freeze({
        board: Object.freeze(board),
        hands: Object.freeze(hands),
        sideToMove: position.teban,
        rootTesu: row.ply
      });
    })
  );
}
function exactDataRecord4(value, expectedKeys) {
  if (value === null || typeof value !== "object" || import_node_util8.types.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
    throw new Error("aggregate record is not an exact plain record");
  }
  const descriptors = Object.getOwnPropertyDescriptors(
    value
  );
  const keys = Reflect.ownKeys(descriptors);
  if (keys.length !== expectedKeys.length || keys.some((key) => typeof key !== "string" || !expectedKeys.includes(key))) {
    throw new Error("aggregate record has unexpected keys");
  }
  const captured = /* @__PURE__ */ Object.create(null);
  for (const key of expectedKeys) {
    const descriptor = descriptors[key];
    if (descriptor === void 0 || !("value" in descriptor) || descriptor.enumerable !== true) {
      throw new Error("aggregate record contains an accessor");
    }
    Object.defineProperty(captured, key, {
      configurable: false,
      enumerable: true,
      writable: false,
      value: descriptor.value
    });
  }
  return Object.freeze(captured);
}
function exactDataArray(value, expectedLength) {
  if (!Array.isArray(value) || import_node_util8.types.isProxy(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    throw new Error("aggregate array is not an exact array");
  }
  const descriptors = Object.getOwnPropertyDescriptors(
    value
  );
  const length = descriptors.length;
  if (length === void 0 || !("value" in length) || length.value !== expectedLength || Reflect.ownKeys(descriptors).length !== expectedLength + 1) {
    throw new Error("aggregate array shape is invalid");
  }
  const output = [];
  for (let index = 0; index < expectedLength; index += 1) {
    const descriptor = descriptors[String(index)];
    if (descriptor === void 0 || !("value" in descriptor) || descriptor.enumerable !== true) {
      throw new Error("aggregate array contains an accessor");
    }
    output.push(descriptor.value);
  }
  return Object.freeze(output);
}
function safeCount(value, maximum = 12) {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) {
    throw new Error("aggregate count is invalid");
  }
  return value;
}
function captureCalibration(value) {
  const record = exactDataRecord4(value, [
    "callback_overhead_ratio_ppm",
    "exact_parity_count"
  ]);
  const ratio = record.callback_overhead_ratio_ppm;
  if (!Number.isSafeInteger(ratio) || ratio <= 0 || record.exact_parity_count !== FLOODGATE_STABLE_WASM_DEADLINE_PUBLIC_CALIBRATION_SAMPLE_COUNT) {
    throw new Error("public calibration aggregate is invalid");
  }
  return Object.freeze({
    callback_overhead_ratio_ppm: ratio,
    exact_parity_count: FLOODGATE_STABLE_WASM_DEADLINE_PUBLIC_CALIBRATION_SAMPLE_COUNT
  });
}
function captureHistogram(value, labels, labelKey) {
  const entries = exactDataArray(value, labels.length);
  return Object.freeze(
    entries.map((entry, index) => {
      const record = exactDataRecord4(entry, ["count", labelKey]);
      if (record[labelKey] !== labels[index]) {
        throw new Error("aggregate histogram label is invalid");
      }
      return Object.freeze({
        [labelKey]: labels[index],
        count: safeCount(record.count)
      });
    })
  );
}
function captureDiagnostic(value) {
  const aggregate2 = exactDataRecord4(value, [
    "all_children_reaped",
    "claim_boundary",
    "completed_depth_histogram",
    "configured_maximum_parallel_children",
    "cooperative_deadline_ms",
    "individual_lane_records_returned",
    "leaves_bucket_histogram",
    "nodes_bucket_histogram",
    "observed_peak_parallel_children",
    "outcome_counts",
    "outer_watchdog_ms",
    "partial_iteration_results_adopted",
    "phase_histogram",
    "requests",
    "schema",
    "status"
  ]);
  if (aggregate2.schema !== FLOODGATE_STABLE_WASM_DEADLINE_DIAGNOSTIC_SCHEMA || aggregate2.status !== FLOODGATE_STABLE_WASM_DEADLINE_DIAGNOSTIC_STATUS || aggregate2.claim_boundary !== FLOODGATE_STABLE_WASM_DEADLINE_DIAGNOSTIC_CLAIM_BOUNDARY || aggregate2.requests !== FLOODGATE_STABLE_WASM_DIAGNOSTIC_MAX_REQUESTS || aggregate2.configured_maximum_parallel_children !== FLOODGATE_STABLE_WASM_DIAGNOSTIC_MAX_CONCURRENT_CHILDREN || aggregate2.cooperative_deadline_ms !== FLOODGATE_STABLE_WASM_DIAGNOSTIC_COOPERATIVE_DEADLINE_MS || aggregate2.outer_watchdog_ms !== FLOODGATE_STABLE_WASM_DIAGNOSTIC_OUTER_WATCHDOG_MS || aggregate2.all_children_reaped !== true || aggregate2.individual_lane_records_returned !== 0 || aggregate2.partial_iteration_results_adopted !== 0) {
    throw new Error("private diagnostic aggregate header is invalid");
  }
  const observedPeak = safeCount(
    aggregate2.observed_peak_parallel_children,
    FLOODGATE_STABLE_WASM_DIAGNOSTIC_MAX_CONCURRENT_CHILDREN
  );
  const outcomes = exactDataRecord4(aggregate2.outcome_counts, [
    "complete",
    "deadline",
    "failure",
    "watchdog"
  ]);
  const capturedOutcomes = Object.freeze({
    complete: safeCount(outcomes.complete),
    deadline: safeCount(outcomes.deadline),
    failure: safeCount(outcomes.failure),
    watchdog: safeCount(outcomes.watchdog)
  });
  if (Object.values(capturedOutcomes).reduce((sum, count) => sum + count, 0) !== FLOODGATE_STABLE_WASM_DIAGNOSTIC_MAX_REQUESTS) {
    throw new Error("private diagnostic outcome total is invalid");
  }
  const phases = captureHistogram(
    aggregate2.phase_histogram,
    DIAGNOSTIC_PHASES,
    "phase"
  );
  const depthEntries = exactDataArray(aggregate2.completed_depth_histogram, 12);
  const depths = Object.freeze(
    depthEntries.map((entry, depth) => {
      const record = exactDataRecord4(entry, ["count", "depth"]);
      if (record.depth !== depth) {
        throw new Error("private diagnostic depth label is invalid");
      }
      return Object.freeze({ depth, count: safeCount(record.count) });
    })
  );
  const nodes = captureHistogram(
    aggregate2.nodes_bucket_histogram,
    DIAGNOSTIC_COUNTER_BUCKETS,
    "bucket"
  );
  const leaves = captureHistogram(
    aggregate2.leaves_bucket_histogram,
    DIAGNOSTIC_COUNTER_BUCKETS,
    "bucket"
  );
  const completedOrDeadline = capturedOutcomes.complete + capturedOutcomes.deadline;
  const sumCounts = (entries) => entries.reduce((sum, entry) => sum + entry.count, 0);
  if (sumCounts(phases) !== 12 || sumCounts(depths) !== completedOrDeadline || sumCounts(nodes) !== completedOrDeadline || sumCounts(leaves) !== completedOrDeadline) {
    throw new Error("private diagnostic histogram totals are invalid");
  }
  const completePhases = phases[0].count + phases[1].count;
  const deadlinePhases = phases.slice(2, 13).reduce((sum, entry) => sum + entry.count, 0);
  if (completePhases !== capturedOutcomes.complete || deadlinePhases !== capturedOutcomes.deadline || phases[13].count !== capturedOutcomes.watchdog || phases[14].count !== capturedOutcomes.failure) {
    throw new Error("private diagnostic phase totals are invalid");
  }
  return Object.freeze({
    all_children_reaped: true,
    completed_depth_histogram: depths,
    configured_maximum_parallel_children: 6,
    cooperative_deadline_ms: 6e5,
    individual_lane_records_returned: 0,
    leaves_bucket_histogram: leaves,
    nodes_bucket_histogram: nodes,
    observed_peak_parallel_children: observedPeak,
    outcome_counts: capturedOutcomes,
    outer_watchdog_ms: 615e3,
    partial_iteration_results_adopted: 0,
    phase_histogram: phases,
    requests: 12
  });
}
function captureFloodgateStableWasmDeadlineDiagnosticAggregateCoreForTests(value) {
  if (arguments.length !== 1) {
    throw new Error("diagnostic aggregate capture invocation is invalid");
  }
  return captureDiagnostic(value);
}
function captureSourceBinding(value, expectedLayout) {
  const record = exactDataRecord4(value, ["layout", "revision"]);
  if (record.layout !== expectedLayout || typeof record.revision !== "string" || !/^[0-9a-f]{40}$/u.test(record.revision)) {
    throw new Error("source binding is invalid");
  }
  return Object.freeze({
    layout: expectedLayout,
    revision: record.revision
  });
}
function sameSourceBinding(left, right) {
  return left.layout === right.layout && left.revision === right.revision;
}
function captureConsumerOptions(value) {
  const record = exactDataRecord4(value, [
    "legacyProtectedPositionIdsPath",
    "outputRoot",
    "rawLockRoot",
    "repositoryRoot",
    "roleLockRoot",
    "verifierRevision"
  ]);
  for (const key of [
    "legacyProtectedPositionIdsPath",
    "outputRoot",
    "rawLockRoot",
    "repositoryRoot",
    "roleLockRoot"
  ]) {
    if (!canonicalAbsolutePath3(record[key])) {
      throw new Error("consumer path is invalid");
    }
  }
  if (typeof record.verifierRevision !== "string" || !/^[0-9a-f]{40}$/u.test(record.verifierRevision)) {
    throw new Error("consumer verifier revision is invalid");
  }
  return Object.freeze({
    legacyProtectedPositionIdsPath: record.legacyProtectedPositionIdsPath,
    outputRoot: record.outputRoot,
    rawLockRoot: record.rawLockRoot,
    repositoryRoot: record.repositoryRoot,
    roleLockRoot: record.roleLockRoot,
    verifierRevision: record.verifierRevision
  });
}
function captureRegistryClaim(value) {
  const record = exactDataRecord4(value, [
    "applicationSourceBinding",
    "consumer"
  ]);
  return Object.freeze({
    applicationSourceBinding: captureSourceBinding(
      record.applicationSourceBinding,
      FLOODGATE_STABLE_WASM_DEADLINE_REGISTRY_APPLICATION_LAYOUT
    ),
    consumer: captureConsumerOptions(record.consumer)
  });
}
function assertFixedContext(dependencies) {
  if (!Number.isSafeInteger(dependencies.effectiveUserId) || dependencies.effectiveUserId <= 0 || !canonicalAbsolutePath3(dependencies.homeDirectory) || !canonicalAbsolutePath3(dependencies.repositoryRoot)) {
    throw new Error("fixed execution context is invalid");
  }
  captureSourceBinding(
    dependencies.expectedDiagnosticSourceBinding,
    FLOODGATE_STABLE_WASM_DEADLINE_DIAGNOSTIC_SOURCE_LAYOUT
  );
}
async function runFloodgateStableWasmDeadlineRunBindingCoreForTests(dependencies) {
  let phase = "persistent-before-control";
  try {
    assertFixedContext(dependencies);
    const assertRunning = () => {
      if (dependencies.shouldStop()) {
        phase = "signal";
        throw new Error("run binding interrupted");
      }
    };
    assertRunning();
    const expectedDiagnosticSource = captureSourceBinding(
      dependencies.expectedDiagnosticSourceBinding,
      FLOODGATE_STABLE_WASM_DEADLINE_DIAGNOSTIC_SOURCE_LAYOUT
    );
    const controlScope = controlSpecifications(dependencies.homeDirectory);
    const assetScope = assetSpecifications(dependencies.homeDirectory);
    const controlBefore = await snapshotScope(
      controlScope,
      dependencies.effectiveUserId
    );
    phase = "registry-load";
    const capability = await dependencies.loadRegistry();
    phase = "worker-source";
    const workers = dependencies.readTrackedWorkers === void 0 ? await readTrackedWorkers(
      dependencies.repositoryRoot,
      dependencies.effectiveUserId
    ) : await dependencies.readTrackedWorkers();
    phase = "persistent-before-assets";
    const assetsBefore = await snapshotScope(
      assetScope,
      dependencies.effectiveUserId
    );
    let roleScope = null;
    let roleBefore = null;
    let registryApplicationBinding = null;
    let callbackEntered = false;
    let callbackCompleted = false;
    let authenticatedCallbacks = 0;
    let exactInputClaims = 0;
    let registryClaims = 0;
    let postflightClaims = 0;
    phase = "asset-authority";
    let boundResult;
    try {
      boundResult = await dependencies.withAssets(async (runtimeAssets) => {
        if (callbackEntered) throw new Error("asset callback repeated");
        callbackEntered = true;
        phase = "public-calibration";
        const calibration = captureCalibration(
          await dependencies.calibrate({
            wasmBytes: runtimeAssets.bytes.wasm,
            weightsBytes: runtimeAssets.bytes.weights,
            workerSourceBytes: workers.calibration
          })
        );
        assertRunning();
        phase = "registry-claim";
        const claim2 = captureRegistryClaim(
          dependencies.claimRegistry(capability)
        );
        registryClaims += 1;
        registryApplicationBinding = claim2.applicationSourceBinding;
        phase = "registry-application-source-before";
        const freshRegistryApplicationSource = captureSourceBinding(
          await dependencies.captureRegistryApplicationSource(),
          FLOODGATE_STABLE_WASM_DEADLINE_REGISTRY_APPLICATION_LAYOUT
        );
        if (!sameSourceBinding(
          registryApplicationBinding,
          freshRegistryApplicationSource
        )) {
          throw new Error("registry application source binding is stale");
        }
        const consumer = claim2.consumer;
        phase = "persistent-before-role";
        roleScope = roleSpecifications(consumer.outputRoot);
        roleBefore = await snapshotScope(
          roleScope,
          dependencies.effectiveUserId
        );
        assertRunning();
        let diagnostic = null;
        phase = "consumer-authentication";
        const postflight = await dependencies.consumeRows(
          consumer,
          (authenticatedInput) => {
            authenticatedCallbacks += 1;
            phase = "consumer-claim";
            dependencies.claimRows(authenticatedInput);
            exactInputClaims += 1;
            phase = "row-selection";
            const diagnosticInputs = trainingRowsToDiagnosticInputs(authenticatedInput);
            phase = "private-diagnostic";
            return dependencies.diagnose(diagnosticInputs, {
              wasmBytes: runtimeAssets.bytes.wasm,
              weightsBytes: runtimeAssets.bytes.weights,
              workerSourceBytes: workers.diagnostic
            }).then((aggregate2) => {
              diagnostic = captureDiagnostic(aggregate2);
              assertRunning();
              phase = "consumer-postflight";
            });
          }
        );
        if (authenticatedCallbacks !== 1 || exactInputClaims !== 1 || diagnostic === null) {
          throw new Error("authenticated callback lifecycle is invalid");
        }
        phase = "postflight-claim";
        dependencies.claimPostflight(postflight);
        postflightClaims += 1;
        if (registryClaims !== 1 || postflightClaims !== 1) {
          throw new Error("single-use claim lifecycle is invalid");
        }
        callbackCompleted = true;
        return Object.freeze({ calibration, diagnostic });
      });
    } catch (error) {
      if (!callbackEntered) phase = "asset-authority";
      else if (callbackCompleted) phase = "asset-cleanup";
      throw error;
    }
    phase = "persistent-after";
    if (roleScope === null || roleBefore === null) {
      throw new Error("role persistence scope was not captured");
    }
    const [controlAfter, assetsAfter, roleAfter] = await Promise.all([
      snapshotScope(controlScope, dependencies.effectiveUserId),
      snapshotScope(assetScope, dependencies.effectiveUserId),
      snapshotScope(roleScope, dependencies.effectiveUserId)
    ]);
    const persistentState = comparePersistentState(
      [...controlBefore, ...assetsBefore, ...roleBefore],
      [...controlAfter, ...assetsAfter, ...roleAfter]
    );
    assertRunning();
    phase = "registry-application-source-after";
    if (registryApplicationBinding === null) {
      throw new Error("registry application source was not captured");
    }
    const finalRegistryApplicationSource = captureSourceBinding(
      await dependencies.captureRegistryApplicationSource(),
      FLOODGATE_STABLE_WASM_DEADLINE_REGISTRY_APPLICATION_LAYOUT
    );
    if (!sameSourceBinding(
      registryApplicationBinding,
      finalRegistryApplicationSource
    )) {
      throw new Error("registry application source changed");
    }
    phase = "diagnostic-source-after";
    const finalDiagnosticSource = captureSourceBinding(
      await dependencies.captureDiagnosticSource(),
      FLOODGATE_STABLE_WASM_DEADLINE_DIAGNOSTIC_SOURCE_LAYOUT
    );
    if (!sameSourceBinding(expectedDiagnosticSource, finalDiagnosticSource)) {
      throw new Error("diagnostic source changed");
    }
    assertRunning();
    return Object.freeze({
      calibration: boundResult.calibration,
      claim_boundary: FLOODGATE_STABLE_WASM_DEADLINE_RUN_BINDING_CLAIM_BOUNDARY,
      diagnostic: boundResult.diagnostic,
      lifecycle: Object.freeze({
        // Calibration resolves only from its child "close" handler, while the
        // diagnostic aggregate header and histogram totals above prove all 12
        // exact lanes settled and their child processes were reaped.
        all_spawned_children_reaped: true,
        authenticated_callbacks: 1,
        calibration_child_reaped: 1,
        diagnostic_lanes_settled: FLOODGATE_STABLE_WASM_DIAGNOSTIC_MAX_REQUESTS,
        exact_input_claims: 1,
        postflight_claims: 1,
        registry_claims: 1
      }),
      nonclaims: Object.freeze({
        live_mutation: false,
        playing_strength: false,
        teacher_generation: false,
        training: false,
        tt_retry_or_resume: false
      }),
      persistent_state: persistentState,
      schema: FLOODGATE_STABLE_WASM_DEADLINE_RUN_BINDING_SCHEMA,
      source_closure: Object.freeze({
        diagnostic_before_after_exact_clean: true,
        registry_application_binding_before_after_exact: true
      }),
      status: FLOODGATE_STABLE_WASM_DEADLINE_RUN_BINDING_STATUS
    });
  } catch {
    fail10(phase);
  }
}
function productionContext() {
  if (process.platform !== "darwin" || process.arch !== "arm64" || process.version !== FLOODGATE_STABLE_WASM_DEADLINE_RUN_BINDING_REQUIRED_NODE || typeof process.geteuid !== "function") {
    fail10("platform");
  }
  try {
    const effectiveUserId = process.geteuid();
    const user = os6.userInfo();
    const repositoryRoot = path8.resolve(__dirname, "..");
    if (effectiveUserId <= 0 || user.uid !== effectiveUserId || !canonicalAbsolutePath3(user.homedir) || !canonicalAbsolutePath3(repositoryRoot) || fs8.realpathSync(repositoryRoot) !== repositoryRoot || fs8.realpathSync(process.cwd()) !== repositoryRoot) {
      fail10("platform");
    }
    return Object.freeze({
      effectiveUserId,
      homeDirectory: user.homedir,
      repositoryRoot
    });
  } catch {
    fail10("platform");
  }
}
function runFloodgateStableWasmDeadlineRunBinding(expectedDiagnosticSourceBinding, shouldStop) {
  if (arguments.length !== 2 || typeof shouldStop !== "function" || import_node_util8.types.isProxy(shouldStop)) {
    return Promise.reject(
      new FloodgateStableWasmDeadlineRunBindingError("invocation")
    );
  }
  const context = productionContext();
  return runFloodgateStableWasmDeadlineRunBindingCoreForTests({
    ...context,
    expectedDiagnosticSourceBinding,
    shouldStop,
    loadRegistry: loadFloodgateStableWasmDeadlineReadOnlyRegistry,
    claimRegistry: (capability) => {
      const claim2 = claimFloodgateStableWasmDeadlineReadOnlyRegistry(
        capability
      );
      return Object.freeze({
        applicationSourceBinding: claim2.applicationSourceBinding,
        consumer: claim2.consumer
      });
    },
    captureDiagnosticSource: captureFloodgateStableWasmDeadlineDiagnosticSourceProvenance,
    captureRegistryApplicationSource: captureFloodgateStableWasmDeadlineRegistryApplicationSource,
    withAssets: async (callback) => withFloodgateStableWasmDeadlineReadOnlyAssets(callback),
    calibrate: (assets) => runFloodgateStableWasmDeadlinePublicCalibration(assets, shouldStop),
    consumeRows: (options, callback) => withFloodgateStableWasmDeadlineReadOnlyRows(
      options,
      callback,
      context.effectiveUserId
    ),
    claimRows: claimFloodgateStableWasmDeadlineReadOnlyRows,
    claimPostflight: (receipt) => claimFloodgateStableWasmDeadlineConsumerPostflight(
      receipt
    ),
    diagnose: (inputs, assets) => runFloodgateStableWasmDeadlineDiagnosticCoreForTests(inputs, assets, {
      shouldStop
    })
  });
}
function floodgateStableWasmDeadlineRunBindingFailure(error) {
  return Object.freeze({
    phase: import_node_util8.types.isNativeError(error) && error instanceof FloodgateStableWasmDeadlineRunBindingError ? error.phase : "internal",
    schema: FLOODGATE_STABLE_WASM_DEADLINE_RUN_BINDING_FAILURE_SCHEMA,
    status: FLOODGATE_STABLE_WASM_DEADLINE_RUN_BINDING_FAILURE_STATUS
  });
}
function assertFloodgateStableWasmDeadlineRunBindingInvocation(argvLength) {
  if (argvLength !== 2) fail10("invocation");
}
var import_node_buffer2, import_node_crypto7, fs8, os6, path8, import_node_util8, FLOODGATE_STABLE_WASM_DEADLINE_RUN_BINDING_SCHEMA, FLOODGATE_STABLE_WASM_DEADLINE_RUN_BINDING_STATUS, FLOODGATE_STABLE_WASM_DEADLINE_RUN_BINDING_CLAIM_BOUNDARY, FLOODGATE_STABLE_WASM_DEADLINE_RUN_BINDING_FAILURE_SCHEMA, FLOODGATE_STABLE_WASM_DEADLINE_RUN_BINDING_FAILURE_STATUS, FLOODGATE_STABLE_WASM_DEADLINE_RUN_BINDING_REQUIRED_NODE, FLOODGATE_STABLE_WASM_DEADLINE_RUN_BINDING_SCOPE_COUNT, ROLE_BUNDLE_FILES, STABLE_WASM_RELATIVE_PATH, STABLE_WEIGHTS_RELATIVE_PATH, DIAGNOSTIC_WORKER_FILENAME, CALIBRATION_WORKER_FILENAME, APPROVED_KEY_ENROLLMENT_ROOT_COMPONENTS, APPROVED_KEY_ENROLLMENT_FILENAME, CONTROL_MAX_BYTES, ROLE_FILE_MAX_BYTES, TRACKED_SOURCE_MAX_BYTES, MODE_TYPE_MASK, MODE_REGULAR, DIAGNOSTIC_COUNTER_BUCKETS, DIAGNOSTIC_PHASES, FloodgateStableWasmDeadlineRunBindingError;
var init_floodgate_stable_wasm_deadline_run_binding = __esm({
  "ml/floodgate-stable-wasm-deadline-run-binding.ts"() {
    "use strict";
    import_node_buffer2 = require("node:buffer");
    import_node_crypto7 = require("node:crypto");
    fs8 = __toESM(require("node:fs"));
    os6 = __toESM(require("node:os"));
    path8 = __toESM(require("node:path"));
    import_node_util8 = require("node:util");
    init_floodgate_stable_wasm_deadline_diagnostic();
    init_floodgate_stable_wasm_deadline_public_calibration();
    init_floodgate_stable_wasm_deadline_diagnostic_source_provenance();
    init_floodgate_stable_wasm_deadline_read_only_application_source();
    init_floodgate_stable_wasm_deadline_read_only_assets();
    init_floodgate_stable_wasm_deadline_read_only_consumer();
    init_floodgate_stable_wasm_deadline_read_only_registry();
    init_shogi_sfen();
    FLOODGATE_STABLE_WASM_DEADLINE_RUN_BINDING_SCHEMA = "shogi-floodgate-stable-wasm-deadline-run-binding-v1";
    FLOODGATE_STABLE_WASM_DEADLINE_RUN_BINDING_STATUS = "aggregate-only-read-only-diagnostic-complete";
    FLOODGATE_STABLE_WASM_DEADLINE_RUN_BINDING_CLAIM_BOUNDARY = "read-only-public-calibration-and-private-aggregate-deadline-observation-only-no-teacher-label-training-playing-strength-live-weight-or-production-gate-authority";
    FLOODGATE_STABLE_WASM_DEADLINE_RUN_BINDING_FAILURE_SCHEMA = "shogi-floodgate-stable-wasm-deadline-run-binding-failure-v1";
    FLOODGATE_STABLE_WASM_DEADLINE_RUN_BINDING_FAILURE_STATUS = "STOP-fixed-phase-no-private-detail";
    FLOODGATE_STABLE_WASM_DEADLINE_RUN_BINDING_REQUIRED_NODE = "v22.13.0";
    FLOODGATE_STABLE_WASM_DEADLINE_RUN_BINDING_SCOPE_COUNT = 13;
    ROLE_BUNDLE_FILES = Object.freeze([
      "fresh-final-holdout.protected-position-ids.txt",
      "fresh-final-holdout.raw.jsonl",
      "fresh-selection.protected-position-ids.txt",
      "fresh-selection.raw.jsonl",
      "manifest.json",
      "replay-excluded-position-ids.txt",
      "replay-exclusion-receipt.json",
      "training.protected-position-ids.txt",
      "training.raw.jsonl"
    ]);
    STABLE_WASM_RELATIVE_PATH = Object.freeze(["stable", "shogi.wasm"]);
    STABLE_WEIGHTS_RELATIVE_PATH = Object.freeze([
      "stable",
      "shogi-nnue-weights.bin"
    ]);
    DIAGNOSTIC_WORKER_FILENAME = "floodgate-stable-wasm-deadline-diagnostic-worker.mjs";
    CALIBRATION_WORKER_FILENAME = "floodgate-stable-wasm-deadline-public-calibration-worker.mjs";
    APPROVED_KEY_ENROLLMENT_ROOT_COMPONENTS = Object.freeze([
      "Library",
      "Application Support",
      "nextjs-portfolio",
      "shogi-floodgate-v7-control-plane-v1"
    ]);
    APPROVED_KEY_ENROLLMENT_FILENAME = "approved-key-instance.json";
    CONTROL_MAX_BYTES = 64 * 1024;
    ROLE_FILE_MAX_BYTES = 512 * 1024 * 1024;
    TRACKED_SOURCE_MAX_BYTES = 128 * 1024;
    MODE_TYPE_MASK = BigInt(61440);
    MODE_REGULAR = BigInt(32768);
    DIAGNOSTIC_COUNTER_BUCKETS = Object.freeze([
      "0",
      "1-1023",
      "1024-32767",
      "32768-1048575",
      "1048576-33554431",
      "33554432-2147483647"
    ]);
    DIAGNOSTIC_PHASES = Object.freeze([
      "requested-depth-complete",
      "winning-mate-early",
      "cooperative-deadline-after-completed-depth-0",
      "cooperative-deadline-after-completed-depth-1",
      "cooperative-deadline-after-completed-depth-2",
      "cooperative-deadline-after-completed-depth-3",
      "cooperative-deadline-after-completed-depth-4",
      "cooperative-deadline-after-completed-depth-5",
      "cooperative-deadline-after-completed-depth-6",
      "cooperative-deadline-after-completed-depth-7",
      "cooperative-deadline-after-completed-depth-8",
      "cooperative-deadline-after-completed-depth-9",
      "cooperative-deadline-after-completed-depth-10",
      "outer-watchdog",
      "failure"
    ]);
    FloodgateStableWasmDeadlineRunBindingError = class extends Error {
      constructor(phase) {
        super("Floodgate stable-WASM deadline run binding stopped");
        this.name = "FloodgateStableWasmDeadlineRunBindingError";
        this.phase = phase;
        Object.freeze(this);
      }
    };
  }
});

// ml/floodgate-stable-wasm-deadline-diagnostic-launcher-attestation.ts
var import_node_buffer = require("node:buffer");
var import_node_child_process = require("node:child_process");
var fs = __toESM(require("node:fs"));
var os = __toESM(require("node:os"));
var path = __toESM(require("node:path"));
var import_node_util = require("node:util");
var FLOODGATE_STABLE_WASM_DEADLINE_DIAGNOSTIC_LAUNCHER_ATTESTATION_CONTRACT = "shogi-floodgate-stable-wasm-deadline-diagnostic-launcher-attestation-v1";
var FloodgateStableWasmDeadlineDiagnosticLauncherAttestationError = class extends Error {
  constructor() {
    super(
      "Floodgate stable-WASM deadline diagnostic launcher attestation failed"
    );
    this.attested = false;
    this.live_mutation_performed = false;
    this.sensitive_values_disclosed = false;
    this.name = "FloodgateStableWasmDeadlineDiagnosticLauncherAttestationError";
    objectDefineProperty(this, "stack", {
      configurable: false,
      enumerable: false,
      writable: false,
      value: "FloodgateStableWasmDeadlineDiagnosticLauncherAttestationError: attestation failed"
    });
    objectFreeze(this);
  }
};
var REQUIRED_NODE_VERSION = "v22.13.0";
var OSASCRIPT = "/usr/bin/osascript";
var LSOF = "/usr/sbin/lsof";
var PS = "/bin/ps";
var ROOT_RELATIVE = path.join(
  ".codex",
  "worktrees",
  "shogi-floodgate-stable-deadline-diagnostic-application"
);
var NODE_RELATIVE = path.join(
  ".nvm",
  "versions",
  "node",
  "v22.13.0",
  "bin",
  "node"
);
var HELPER_RELATIVE = path.join(
  "ml",
  "helpers",
  "floodgate-stable-wasm-deadline-diagnostic-launcher.jxa"
);
var ENTRY_RELATIVE = path.join(
  "ml",
  "run-floodgate-stable-wasm-deadline-diagnostic.cjs"
);
var ATTESTATION_ENVIRONMENT_KEYS = Object.freeze([
  "FLOODGATE_STABLE_WASM_DEADLINE_DIAGNOSTIC_LAUNCHER_CONTRACT",
  "FLOODGATE_STABLE_WASM_DEADLINE_DIAGNOSTIC_LAUNCHER_PARENT_PID",
  "FLOODGATE_STABLE_WASM_DEADLINE_DIAGNOSTIC_LAUNCHER_NONCE",
  "FLOODGATE_STABLE_WASM_DEADLINE_DIAGNOSTIC_LAUNCHER_HELPER"
]);
var MAX_FRAME_BYTES = 1024;
var MODE_GROUP_OR_OTHER_WRITABLE = 18;
var NONCE_RE = /^[A-Za-z0-9+/]{43}=$/u;
var PID_RE = /^[1-9][0-9]*$/u;
var PRELOAD_ENVIRONMENT_KEY = ["NODE", "OPTIONS"].join("_");
var NativeError = Error;
var NativeNumber = Number;
var objectDefineProperty = Object.defineProperty;
var objectFreeze = Object.freeze;
var objectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors;
var objectGetPrototypeOf = Object.getPrototypeOf;
var objectKeys = Object.keys;
var arrayIsArray = Array.isArray;
var arrayPrototype = Array.prototype;
var reflectOwnKeys = Reflect.ownKeys;
var stringIncludes = String.prototype.includes;
var stringSplit = String.prototype.split;
var reflectApply = Reflect.apply;
var capturedSpawnSync = import_node_child_process.spawnSync;
var capturedFstatSync = fs.fstatSync.bind(fs);
var capturedLstatSync = fs.lstatSync.bind(fs);
var capturedReadSync = fs.readSync.bind(fs);
var capturedRealpathSync = fs.realpathSync.native.bind(fs.realpathSync);
var capturedGetEffectiveUserId = typeof process.geteuid === "function" ? process.geteuid.bind(process) : null;
var capturedUserInfo = os.userInfo.bind(os);
var capturedCwd = process.cwd.bind(process);
var claimed = false;
function fail() {
  throw new FloodgateStableWasmDeadlineDiagnosticLauncherAttestationError();
}
function canonicalAbsolutePath(value) {
  return typeof value === "string" && value.length > 1 && !reflectApply(stringIncludes, value, ["\0"]) && !reflectApply(stringIncludes, value, ["\n"]) && !reflectApply(stringIncludes, value, ["\r"]) && path.isAbsolute(value) && path.resolve(value) === value;
}
function assertFixedTool(executable) {
  const metadata = capturedLstatSync(executable);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.uid !== 0 || (metadata.mode & MODE_GROUP_OR_OTHER_WRITABLE) !== 0 || capturedRealpathSync(executable) !== executable) {
    fail();
  }
}
function assertExactStringArray(value, expected) {
  if (!arrayIsArray(value) || import_node_util.types.isProxy(value) || objectGetPrototypeOf(value) !== arrayPrototype) {
    fail();
  }
  const descriptors = objectGetOwnPropertyDescriptors(
    value
  );
  const keys = reflectOwnKeys(descriptors);
  if (keys.length !== expected.length + 1) fail();
  const length = descriptors.length;
  if (length === void 0 || !("value" in length) || length.value !== expected.length || length.enumerable !== false || length.configurable !== false) {
    fail();
  }
  for (let index = 0; index < expected.length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (descriptor === void 0 || !("value" in descriptor) || descriptor.value !== expected[index] || descriptor.enumerable !== true) {
      fail();
    }
  }
}
function assertOwnedFixedPath(value, expected, effectiveUserId) {
  if (!canonicalAbsolutePath(value) || capturedRealpathSync(value) !== value) {
    fail();
  }
  const metadata = capturedLstatSync(value);
  const correctType = expected === "directory" ? metadata.isDirectory() : metadata.isFile();
  if (!correctType || metadata.isSymbolicLink() || metadata.uid !== effectiveUserId || (metadata.mode & MODE_GROUP_OR_OTHER_WRITABLE) !== 0 || expected === "file" && metadata.nlink !== 1) {
    fail();
  }
}
function assertExactChildExecutionTuple(repositoryRoot, entrypoint, nodePath, effectiveUserId) {
  assertOwnedFixedPath(repositoryRoot, "directory", effectiveUserId);
  assertOwnedFixedPath(entrypoint, "file", effectiveUserId);
  if (!canonicalAbsolutePath(nodePath) || capturedRealpathSync(nodePath) !== nodePath || capturedCwd() !== repositoryRoot || process.execPath !== nodePath || (require.main?.filename ?? null) !== entrypoint) {
    fail();
  }
  const nodeMetadata = capturedLstatSync(nodePath);
  if (!nodeMetadata.isFile() || nodeMetadata.isSymbolicLink() || nodeMetadata.nlink !== 1 || nodeMetadata.uid !== 0 && nodeMetadata.uid !== effectiveUserId || (nodeMetadata.mode & MODE_GROUP_OR_OTHER_WRITABLE) !== 0) {
    fail();
  }
  assertExactStringArray(process.argv, [nodePath, entrypoint]);
  assertExactStringArray(process.execArgv, []);
}
function assertExactLaunchEnvironment(nodePath, effectiveUserId) {
  const expectedValues = objectFreeze({
    HOME: capturedUserInfo().homedir,
    LANG: "C",
    LC_ALL: "C",
    NODE_ENV: "production",
    PATH: `${path.dirname(nodePath)}:/usr/bin:/bin:/usr/sbin:/sbin`
  });
  const required = /* @__PURE__ */ new Set([
    ...objectKeys(expectedValues),
    ...ATTESTATION_ENVIRONMENT_KEYS
  ]);
  for (const key of objectKeys(process.env)) {
    if (key === "__CF_USER_TEXT_ENCODING") {
      if (process.env[key] !== `0x${effectiveUserId.toString(16).toUpperCase()}:0x0:0x0`) {
        fail();
      }
      continue;
    }
    if (!required.delete(key)) fail();
  }
  if (required.size !== 0) fail();
  for (const key of objectKeys(expectedValues)) {
    if (process.env[key] !== expectedValues[key]) {
      fail();
    }
  }
  if (process.env[PRELOAD_ENVIRONMENT_KEY] !== void 0) fail();
}
function readAttestationFrame() {
  const before = capturedFstatSync(0, { bigint: true });
  if (!before.isFIFO() || before.isSymbolicLink()) fail();
  const bytes = import_node_buffer.Buffer.alloc(MAX_FRAME_BYTES + 1);
  let offset = 0;
  while (offset <= MAX_FRAME_BYTES) {
    const read = capturedReadSync(
      0,
      bytes,
      offset,
      bytes.length - offset,
      null
    );
    if (read === 0) break;
    offset += read;
  }
  const after = capturedFstatSync(0, { bigint: true });
  if (offset === 0 || offset > MAX_FRAME_BYTES || before.dev !== after.dev || before.ino !== after.ino || before.mode !== after.mode || before.uid !== after.uid || before.gid !== after.gid) {
    fail();
  }
  try {
    return bytes.subarray(0, offset).toString("utf8");
  } finally {
    bytes.fill(0);
  }
}
function exactToolOutput(executable, arguments_) {
  const result = capturedSpawnSync(executable, [...arguments_], {
    cwd: "/",
    encoding: "utf8",
    env: {
      LANG: "C",
      LC_ALL: "C",
      NODE_ENV: "production",
      PATH: "/usr/bin:/bin:/usr/sbin:/sbin"
    },
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 5e3,
    windowsHide: true
  });
  if (result.error !== void 0 || result.status !== 0 || result.signal !== null || result.stderr !== "" || typeof result.stdout !== "string" || result.stdout.length === 0 || result.stdout.length > 16384) {
    fail();
  }
  return result.stdout;
}
function assertLiveOsascriptParent(parentPid, expectedCommand) {
  assertFixedTool(LSOF);
  assertFixedTool(PS);
  assertFixedTool(OSASCRIPT);
  const lsofArguments = [
    "-a",
    "-p",
    String(parentPid),
    "-d",
    "txt",
    "-Fn"
  ];
  const firstLsof = exactToolOutput(LSOF, lsofArguments);
  const expectedImageLine = `n${OSASCRIPT}`;
  const firstLines = reflectApply(stringSplit, firstLsof, ["\n"]);
  if (firstLines[0] !== `p${parentPid}` || !firstLines.includes(expectedImageLine)) {
    fail();
  }
  const command = exactToolOutput(PS, [
    "-ww",
    "-p",
    String(parentPid),
    "-o",
    "command="
  ]);
  if (command !== `${expectedCommand}
`) fail();
  const secondLsof = exactToolOutput(LSOF, lsofArguments);
  const secondLines = reflectApply(stringSplit, secondLsof, ["\n"]);
  if (secondLines[0] !== `p${parentPid}` || !secondLines.includes(expectedImageLine)) {
    fail();
  }
}
function claimFloodgateStableWasmDeadlineDiagnosticLauncherAttestation() {
  try {
    if (arguments.length !== 0 || claimed || process.platform !== "darwin" || process.version !== REQUIRED_NODE_VERSION || capturedGetEffectiveUserId === null || process.pid <= 1 || process.ppid <= 1) {
      fail();
    }
    const effectiveUserId = capturedGetEffectiveUserId();
    const user = capturedUserInfo();
    if (user.uid !== effectiveUserId || !canonicalAbsolutePath(user.homedir)) {
      fail();
    }
    const repositoryRoot = path.join(user.homedir, ROOT_RELATIVE);
    const nodePath = path.join(user.homedir, NODE_RELATIVE);
    const helperPath = path.join(repositoryRoot, HELPER_RELATIVE);
    const entrypoint = path.join(repositoryRoot, ENTRY_RELATIVE);
    assertExactChildExecutionTuple(
      repositoryRoot,
      entrypoint,
      nodePath,
      effectiveUserId
    );
    assertOwnedFixedPath(helperPath, "file", effectiveUserId);
    assertExactLaunchEnvironment(nodePath, effectiveUserId);
    const frame = readAttestationFrame();
    const fields = reflectApply(stringSplit, frame, ["\n"]);
    if (fields.length !== 5 || fields[4] !== "") fail();
    const [contract, parentPidText, nonce, frameHelperPath] = fields;
    if (contract !== FLOODGATE_STABLE_WASM_DEADLINE_DIAGNOSTIC_LAUNCHER_ATTESTATION_CONTRACT || !PID_RE.test(parentPidText) || NativeNumber(parentPidText) !== process.ppid || !NONCE_RE.test(nonce) || frameHelperPath !== helperPath) {
      fail();
    }
    if (process.env.FLOODGATE_STABLE_WASM_DEADLINE_DIAGNOSTIC_LAUNCHER_CONTRACT !== contract || process.env.FLOODGATE_STABLE_WASM_DEADLINE_DIAGNOSTIC_LAUNCHER_PARENT_PID !== parentPidText || process.env.FLOODGATE_STABLE_WASM_DEADLINE_DIAGNOSTIC_LAUNCHER_NONCE !== nonce || process.env.FLOODGATE_STABLE_WASM_DEADLINE_DIAGNOSTIC_LAUNCHER_HELPER !== helperPath) {
      fail();
    }
    assertLiveOsascriptParent(
      process.ppid,
      `${OSASCRIPT} -l JavaScript ${helperPath}`
    );
    for (const key of ATTESTATION_ENVIRONMENT_KEYS) {
      delete process.env[key];
      if (process.env[key] !== void 0) fail();
    }
    claimed = true;
  } catch {
    fail();
  }
}
if (NativeError.name !== "Error") fail();

// ml/run-floodgate-stable-wasm-deadline-diagnostic.ts
init_floodgate_stable_wasm_deadline_diagnostic_source_provenance();
var ENTRYPOINT = "ml/run-floodgate-stable-wasm-deadline-diagnostic.cjs";
var FAILURE_SCHEMA = "shogi-floodgate-stable-wasm-deadline-run-binding-failure-v1";
var FAILURE_STATUS = "STOP-fixed-phase-no-private-detail";
var ENTRY_ONLY_FAILURE_PHASES = /* @__PURE__ */ new Set([
  "binding-load",
  "diagnostic-source-before",
  "entrypoint-context",
  "external-supervisor-unavailable",
  "internal",
  "invocation",
  "launcher-attestation"
]);
function canonicalJson5(value) {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) {
      throw new Error("noncanonical number");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    const descriptors = Object.getOwnPropertyDescriptors(
      value
    );
    const length = descriptors.length;
    if (length === void 0 || !("value" in length) || Reflect.ownKeys(descriptors).length !== value.length + 1) {
      throw new Error("noncanonical array");
    }
    const entries = [];
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (descriptor === void 0 || !("value" in descriptor) || descriptor.enumerable !== true) {
        throw new Error("noncanonical array entry");
      }
      entries.push(canonicalJson5(descriptor.value));
    }
    return `[${entries.join(",")}]`;
  }
  if (typeof value === "object") {
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    if (keys.some((key) => typeof key !== "string")) {
      throw new Error("noncanonical object key");
    }
    const stringKeys = keys.sort();
    return `{${stringKeys.map((key) => {
      const descriptor = descriptors[key];
      if (descriptor === void 0 || !("value" in descriptor) || descriptor.enumerable !== true) {
        throw new Error("noncanonical object property");
      }
      return `${JSON.stringify(key)}:${canonicalJson5(descriptor.value)}`;
    }).join(",")}}`;
  }
  throw new Error("unsupported canonical JSON value");
}
function writeOneLine(value) {
  const line = `${canonicalJson5(value)}
`;
  if (/[^\x20-\x7e\x0a]/u.test(line)) {
    return Promise.reject(new Error("output is not printable ASCII"));
  }
  return new Promise((resolve8, reject) => {
    process.stdout.write(line, "ascii", (error) => {
      if (error) reject(error);
      else resolve8();
    });
  });
}
async function lazyBindingModule() {
  const loaded = await Promise.resolve().then(() => (init_floodgate_stable_wasm_deadline_run_binding(), floodgate_stable_wasm_deadline_run_binding_exports));
  if (loaded === null || typeof loaded !== "object") {
    throw new Error("binding module is invalid");
  }
  const descriptors = Object.getOwnPropertyDescriptors(loaded);
  const run = descriptors.runFloodgateStableWasmDeadlineRunBinding;
  const failure = descriptors.floodgateStableWasmDeadlineRunBindingFailure;
  if (run === void 0 || !("value" in run) || typeof run.value !== "function" || failure === void 0 || !("value" in failure) || typeof failure.value !== "function") {
    throw new Error("binding module exports are invalid");
  }
  return Object.freeze({
    floodgateStableWasmDeadlineRunBindingFailure: failure.value,
    runFloodgateStableWasmDeadlineRunBinding: run.value
  });
}
function safeEntryPhase(fallback) {
  return ENTRY_ONLY_FAILURE_PHASES.has(fallback) ? fallback : "internal";
}
async function main() {
  let interrupted = false;
  const markInterrupted = () => {
    interrupted = true;
  };
  process.on("SIGINT", markInterrupted);
  process.on("SIGTERM", markInterrupted);
  let output;
  let exitCode = 0;
  let phase = "invocation";
  try {
    if (process.argv.length !== 2) throw new Error("invalid invocation");
    phase = "launcher-attestation";
    claimFloodgateStableWasmDeadlineDiagnosticLauncherAttestation();
    Object.freeze(lazyBindingModule);
    phase = "entrypoint-context";
    assertFloodgateStableWasmDeadlineDiagnosticEntrypointContext(ENTRYPOINT);
    phase = "diagnostic-source-before";
    await captureFloodgateStableWasmDeadlineDiagnosticSourceProvenance();
    if (interrupted) throw new Error("interrupted before external gate");
    phase = "external-supervisor-unavailable";
    throw new Error("external supervisor is not installed");
  } catch {
    phase = safeEntryPhase(phase);
    output = Object.freeze({
      phase,
      schema: FAILURE_SCHEMA,
      status: FAILURE_STATUS
    });
    exitCode = 1;
  }
  try {
    await writeOneLine(output);
  } catch {
    exitCode = 1;
  }
  process.removeListener("SIGINT", markInterrupted);
  process.removeListener("SIGTERM", markInterrupted);
  process.exitCode = exitCode;
}
void main();
