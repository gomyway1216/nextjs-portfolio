import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export interface V1R11AuthorityFileIdentity {
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly schema: string;
}

export interface V1R11AuthorityDirectoryIdentity {
  readonly path: string;
  readonly realpath: string;
  readonly dev: number;
  readonly ino: number;
  readonly uid: number;
  readonly mode: number;
}

export interface V1R11HeldIdentityGuard {
  readonly identity: Readonly<V1R11AuthorityFileIdentity>;
  validate(): Promise<void>;
  close(): Promise<void>;
}

const PRIVATE_DIRECTORY_MODE = 0o700;
const PRIVATE_FILE_MODE = 0o600;
const V1R11_PRODUCTION_AUTHORITY_DIRECTORY =
  "/Users/yudaiyaguchi/.codex/shogi-runs/halfkp81-hard-depth18-yaneura-only-v1r11-authority";
const V1R11_PRODUCTION_TEACHER_PLAN_PATH =
  "/Users/yudaiyaguchi/.codex/shogi-runs/halfkp81-hard-depth18-yaneura-only-v1r11/teacher-plan.json";

export interface Halfkp81V1R11ScratchNamespaceCapabilityForTests {
  readonly __halfkp81V1R11ScratchNamespaceCapability: never;
}

export interface Halfkp81V1R11ScratchNamespaceForTests {
  readonly scratchRoot: string;
  readonly authorityDirectory: string;
  readonly teacherPlanPath: string;
}

const v1r11ScratchNamespaceCapabilities = new WeakMap<
  object,
  Readonly<Halfkp81V1R11ScratchNamespaceForTests>
>();

function pathInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative.length > 0 && !relative.startsWith(`..${path.sep}`) &&
    relative !== ".." && !path.isAbsolute(relative);
}

/**
 * Creates an unforgeable, process-local capability for tests that must run the
 * production authority pipeline without touching the fixed formal namespace.
 */
export function createHalfkp81V1R11ScratchNamespaceCapabilityForTests(
  request: Readonly<Halfkp81V1R11ScratchNamespaceForTests>,
): Readonly<Halfkp81V1R11ScratchNamespaceCapabilityForTests> {
  const scratchRoot = fs.realpathSync.native(request.scratchRoot);
  const temporaryRoot = fs.realpathSync.native(os.tmpdir());
  const authorityDirectory = fs.realpathSync.native(
    request.authorityDirectory,
  );
  const teacherPlanPath = path.normalize(request.teacherPlanPath);
  if (
    !pathInside(temporaryRoot, scratchRoot) ||
    !pathInside(scratchRoot, authorityDirectory) ||
    !pathInside(scratchRoot, teacherPlanPath) ||
    authorityDirectory === V1R11_PRODUCTION_AUTHORITY_DIRECTORY ||
    teacherPlanPath === V1R11_PRODUCTION_TEACHER_PLAN_PATH ||
    !path.isAbsolute(teacherPlanPath) ||
    request.scratchRoot !== scratchRoot ||
    request.authorityDirectory !== authorityDirectory ||
    request.teacherPlanPath !== teacherPlanPath
  ) {
    throw new Error("v1r11 scratch namespace capability request differs");
  }
  const capability = Object.freeze({});
  v1r11ScratchNamespaceCapabilities.set(
    capability,
    Object.freeze({ scratchRoot, authorityDirectory, teacherPlanPath }),
  );
  return capability as Readonly<Halfkp81V1R11ScratchNamespaceCapabilityForTests>;
}

export function resolveHalfkp81V1R11ScratchNamespaceCapabilityForTests(
  capability: Readonly<Halfkp81V1R11ScratchNamespaceCapabilityForTests>,
): Readonly<Halfkp81V1R11ScratchNamespaceForTests> {
  const resolved = v1r11ScratchNamespaceCapabilities.get(capability as object);
  if (resolved === undefined) {
    throw new Error("v1r11 scratch namespace capability is forged");
  }
  return resolved;
}

export function v1r11CanonicalJson(value: unknown): string {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return JSON.stringify(value);
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(v1r11CanonicalJson).join(",")}]`;
  }
  if (typeof value === "object") {
    const object = value as Readonly<Record<string, unknown>>;
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${v1r11CanonicalJson(object[key])}`)
      .join(",")}}`;
  }
  throw new Error("v1r11 authority value is not canonicalizable");
}

export function v1r11CanonicalLine(value: unknown): Buffer {
  return Buffer.from(`${v1r11CanonicalJson(value)}\n`, "utf8");
}

export function v1r11Sha256(value: Uint8Array | string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function assertAbsoluteNormalized(value: string, label: string): void {
  if (!path.isAbsolute(value) || path.normalize(value) !== value) {
    throw new Error(`${label} path differs`);
  }
}

export async function createV1R11AuthorityDirectory(
  directory: string,
): Promise<Readonly<V1R11AuthorityDirectoryIdentity>> {
  assertAbsoluteNormalized(directory, "v1r11 authority directory");
  await fs.promises.mkdir(path.dirname(directory), {
    recursive: true,
    mode: PRIVATE_DIRECTORY_MODE,
  });
  await fs.promises.mkdir(directory, {
    mode: PRIVATE_DIRECTORY_MODE,
    recursive: false,
  });
  return pinV1R11AuthorityDirectory(directory);
}

export async function createV1R11GateDirectory(
  authority: Readonly<V1R11AuthorityDirectoryIdentity>,
  gateDirectory: string,
): Promise<Readonly<V1R11AuthorityDirectoryIdentity>> {
  await assertV1R11AuthorityDirectory(authority);
  if (path.dirname(gateDirectory) !== authority.path) {
    throw new Error("v1r11 gate directory is outside authority namespace");
  }
  await fs.promises.mkdir(gateDirectory, {
    mode: PRIVATE_DIRECTORY_MODE,
    recursive: false,
  });
  return pinV1R11AuthorityDirectory(gateDirectory);
}

export async function pinV1R11AuthorityDirectory(
  directory: string,
): Promise<Readonly<V1R11AuthorityDirectoryIdentity>> {
  assertAbsoluteNormalized(directory, "v1r11 authority directory");
  const metadata = await fs.promises.lstat(directory);
  const realpath = await fs.promises.realpath(directory);
  const euid = process.geteuid?.();
  if (
    !metadata.isDirectory() ||
    metadata.isSymbolicLink() ||
    metadata.nlink < 1 ||
    !Number.isSafeInteger(euid) ||
    metadata.uid !== euid ||
    (metadata.mode & 0o7777) !== PRIVATE_DIRECTORY_MODE ||
    realpath !== directory
  ) {
    throw new Error("v1r11 authority directory is not owned/private/real");
  }
  return Object.freeze({
    path: directory,
    realpath,
    dev: metadata.dev,
    ino: metadata.ino,
    uid: metadata.uid,
    mode: metadata.mode & 0o7777,
  });
}

export async function assertV1R11AuthorityDirectory(
  expected: Readonly<V1R11AuthorityDirectoryIdentity>,
): Promise<void> {
  const actual = await pinV1R11AuthorityDirectory(expected.path);
  if (v1r11CanonicalJson(actual) !== v1r11CanonicalJson(expected)) {
    throw new Error("v1r11 authority directory identity changed");
  }
}

export async function assertV1R11CreateOnlyTargetAbsent(
  namespace: Readonly<V1R11AuthorityDirectoryIdentity>,
  filePath: string,
  label: string,
): Promise<void> {
  await assertV1R11AuthorityDirectory(namespace);
  assertAbsoluteNormalized(filePath, label);
  if (path.dirname(filePath) !== namespace.path || label.length < 1) {
    throw new Error(`${label} namespace differs`);
  }
  try {
    await fs.promises.lstat(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      await assertV1R11AuthorityDirectory(namespace);
      return;
    }
    throw error;
  }
  throw new Error(`${label} already exists; namespace is closed`);
}

export async function publishV1R11CreateOnlyBytes(
  namespace: Readonly<V1R11AuthorityDirectoryIdentity>,
  filePath: string,
  bytes: Buffer,
  schema: string,
): Promise<Readonly<V1R11AuthorityFileIdentity>> {
  await assertV1R11AuthorityDirectory(namespace);
  assertAbsoluteNormalized(filePath, "v1r11 authority artifact");
  if (
    path.dirname(filePath) !== namespace.path ||
    bytes.byteLength < 1 ||
    schema.length < 1
  ) {
    throw new Error("v1r11 authority artifact namespace differs");
  }
  const handle = await fs.promises.open(
    filePath,
    fs.constants.O_CREAT |
      fs.constants.O_EXCL |
      fs.constants.O_WRONLY |
      (fs.constants.O_NOFOLLOW ?? 0),
    PRIVATE_FILE_MODE,
  );
  let opened: fs.Stats;
  try {
    opened = await handle.stat();
    const linked = await fs.promises.lstat(filePath);
    const euid = process.geteuid?.();
    if (
      !opened.isFile() ||
      opened.nlink !== 1 ||
      !Number.isSafeInteger(euid) ||
      opened.uid !== euid ||
      (opened.mode & 0o7777) !== PRIVATE_FILE_MODE ||
      linked.dev !== opened.dev ||
      linked.ino !== opened.ino ||
      (await fs.promises.realpath(filePath)) !== filePath ||
      opened.size !== 0
    ) {
      throw new Error("v1r11 create-only authority artifact changed at open");
    }
    await handle.writeFile(bytes);
    await handle.sync();
    const after = await handle.stat();
    const linkedAfter = await fs.promises.lstat(filePath);
    if (
      after.dev !== opened.dev ||
      after.ino !== opened.ino ||
      after.size !== bytes.byteLength ||
      after.nlink !== 1 ||
      linkedAfter.dev !== opened.dev ||
      linkedAfter.ino !== opened.ino ||
      (await fs.promises.realpath(filePath)) !== filePath
    ) {
      throw new Error(
        "v1r11 create-only authority artifact changed during publish",
      );
    }
  } finally {
    await handle.close();
  }
  const directoryHandle = await fs.promises.open(
    namespace.path,
    fs.constants.O_RDONLY,
  );
  try {
    await directoryHandle.sync();
  } finally {
    await directoryHandle.close();
  }
  const identity = Object.freeze({
    path: filePath,
    bytes: bytes.byteLength,
    sha256: v1r11Sha256(bytes),
    schema,
  });
  await readV1R11HeldIdentity(identity, schema, "new authority artifact");
  await assertV1R11AuthorityDirectory(namespace);
  return identity;
}

export async function publishV1R11CreateOnlyCanonical(
  namespace: Readonly<V1R11AuthorityDirectoryIdentity>,
  filePath: string,
  value: unknown,
  schema: string,
): Promise<Readonly<V1R11AuthorityFileIdentity>> {
  return publishV1R11CreateOnlyBytes(
    namespace,
    filePath,
    v1r11CanonicalLine(value),
    schema,
  );
}

export async function appendV1R11CanonicalLedgerRow(
  namespace: Readonly<V1R11AuthorityDirectoryIdentity>,
  filePath: string,
  row: unknown,
  previous: Readonly<V1R11AuthorityFileIdentity> | null,
  schema: string,
  label: string,
): Promise<Readonly<V1R11AuthorityFileIdentity>> {
  await assertV1R11AuthorityDirectory(namespace);
  assertAbsoluteNormalized(filePath, label);
  if (
    path.dirname(filePath) !== namespace.path ||
    schema.length < 1 ||
    label.length < 1
  ) {
    throw new Error(`${label} namespace or schema differs`);
  }
  if (previous !== null) {
    if (previous.path !== filePath || previous.schema !== schema) {
      throw new Error(`${label} prior identity differs`);
    }
    await readV1R11HeldIdentity(previous, schema, `${label} prior identity`);
  }
  const line = v1r11CanonicalLine(row);
  const handle = await fs.promises.open(
    filePath,
    (previous === null
      ? fs.constants.O_CREAT | fs.constants.O_EXCL
      : fs.constants.O_APPEND) |
      fs.constants.O_RDWR |
      (fs.constants.O_NOFOLLOW ?? 0),
    PRIVATE_FILE_MODE,
  );
  let identity: Readonly<V1R11AuthorityFileIdentity> | null = null;
  try {
    const opened = await handle.stat();
    const linked = await fs.promises.lstat(filePath);
    const euid = process.geteuid?.();
    if (
      !opened.isFile() ||
      opened.nlink !== 1 ||
      !Number.isSafeInteger(euid) ||
      opened.uid !== euid ||
      (opened.mode & 0o7777) !== PRIVATE_FILE_MODE ||
      linked.dev !== opened.dev ||
      linked.ino !== opened.ino ||
      (await fs.promises.realpath(filePath)) !== filePath ||
      opened.size !== (previous?.bytes ?? 0)
    ) {
      throw new Error(`${label} append target differs`);
    }
    await handle.writeFile(line);
    await handle.sync();
    const after = await handle.stat();
    const linkedAfter = await fs.promises.lstat(filePath);
    if (
      after.dev !== opened.dev ||
      after.ino !== opened.ino ||
      after.size !== opened.size + line.byteLength ||
      after.nlink !== 1 ||
      linkedAfter.dev !== opened.dev ||
      linkedAfter.ino !== opened.ino ||
      linkedAfter.size !== after.size ||
      (await fs.promises.realpath(filePath)) !== filePath
    ) {
      throw new Error(`${label} changed during append`);
    }
    const directory = await fs.promises.open(
      namespace.path,
      fs.constants.O_RDONLY,
    );
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
    const first = Buffer.alloc(after.size);
    const second = Buffer.alloc(after.size);
    const firstRead = await handle.read(first, 0, first.length, 0);
    const middle = await handle.stat();
    const secondRead = await handle.read(second, 0, second.length, 0);
    const final = await handle.stat();
    const finalLink = await fs.promises.lstat(filePath);
    if (
      firstRead.bytesRead !== first.length ||
      secondRead.bytesRead !== second.length ||
      !first.equals(second) ||
      [middle, final].some(
        (metadata) =>
          metadata.dev !== opened.dev ||
          metadata.ino !== opened.ino ||
          metadata.size !== after.size ||
          metadata.nlink !== 1 ||
          metadata.uid !== opened.uid ||
          (metadata.mode & 0o7777) !== PRIVATE_FILE_MODE ||
          metadata.mtimeMs !== after.mtimeMs ||
          metadata.ctimeMs !== after.ctimeMs,
      ) ||
      finalLink.dev !== opened.dev ||
      finalLink.ino !== opened.ino ||
      finalLink.size !== after.size ||
      finalLink.nlink !== 1 ||
      finalLink.uid !== opened.uid ||
      (finalLink.mode & 0o7777) !== PRIVATE_FILE_MODE ||
      (await fs.promises.realpath(filePath)) !== filePath
    ) {
      throw new Error(`${label} changed during held identity read`);
    }
    identity = Object.freeze({
      path: filePath,
      bytes: first.byteLength,
      sha256: v1r11Sha256(first),
      schema,
    });
  } finally {
    await handle.close();
  }
  if (identity === null) throw new Error(`${label} identity was not sealed`);
  await assertV1R11AuthorityDirectory(namespace);
  return identity;
}

export async function readV1R11HeldFile(
  filePath: string,
  label: string,
): Promise<Buffer> {
  assertAbsoluteNormalized(filePath, label);
  const pathMetadata = await fs.promises.lstat(filePath);
  const euid = process.geteuid?.();
  if (
    !pathMetadata.isFile() ||
    pathMetadata.isSymbolicLink() ||
    pathMetadata.nlink !== 1 ||
    !Number.isSafeInteger(euid) ||
    pathMetadata.uid !== euid ||
    (pathMetadata.mode & 0o7777) !== PRIVATE_FILE_MODE ||
    (await fs.promises.realpath(filePath)) !== filePath
  ) {
    throw new Error(`${label} is not an owned private real single-link file`);
  }
  const handle = await fs.promises.open(
    filePath,
    fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0),
  );
  try {
    const before = await handle.stat();
    const first = Buffer.alloc(before.size);
    const second = Buffer.alloc(before.size);
    const firstRead = await handle.read(first, 0, first.length, 0);
    const middle = await handle.stat();
    const secondRead = await handle.read(second, 0, second.length, 0);
    const after = await handle.stat();
    if (
      before.dev !== pathMetadata.dev ||
      before.ino !== pathMetadata.ino ||
      firstRead.bytesRead !== first.length ||
      secondRead.bytesRead !== second.length ||
      !first.equals(second) ||
      [middle, after].some(
        (entry) =>
          entry.dev !== before.dev ||
          entry.ino !== before.ino ||
          entry.size !== before.size ||
          entry.mtimeMs !== before.mtimeMs ||
          entry.ctimeMs !== before.ctimeMs,
      )
    ) {
      throw new Error(`${label} changed during held-descriptor read`);
    }
    const pathAfter = await fs.promises.lstat(filePath);
    if (
      pathAfter.dev !== before.dev ||
      pathAfter.ino !== before.ino ||
      pathAfter.size !== before.size ||
      pathAfter.mtimeMs !== before.mtimeMs ||
      pathAfter.ctimeMs !== before.ctimeMs ||
      (await fs.promises.realpath(filePath)) !== filePath
    ) {
      throw new Error(`${label} path identity changed during held read`);
    }
    return first;
  } finally {
    await handle.close();
  }
}

export async function openV1R11HeldIdentityGuard(
  filePath: string,
  schema: string,
  label: string,
): Promise<Readonly<V1R11HeldIdentityGuard>> {
  assertAbsoluteNormalized(filePath, label);
  if (schema.length < 1 || label.length < 1) {
    throw new Error(`${label} schema differs`);
  }
  const pathMetadata = await fs.promises.lstat(filePath);
  const euid = process.geteuid?.();
  if (
    !pathMetadata.isFile() ||
    pathMetadata.isSymbolicLink() ||
    pathMetadata.nlink !== 1 ||
    !Number.isSafeInteger(euid) ||
    pathMetadata.uid !== euid ||
    (pathMetadata.mode & 0o7777) !== PRIVATE_FILE_MODE ||
    (await fs.promises.realpath(filePath)) !== filePath
  ) {
    throw new Error(`${label} is not an owned private real single-link file`);
  }
  const handle = await fs.promises.open(
    filePath,
    fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0),
  );
  let closed = false;
  try {
    const opened = await handle.stat();
    const raw = Buffer.alloc(opened.size);
    const duplicate = Buffer.alloc(opened.size);
    const firstRead = await handle.read(raw, 0, raw.length, 0);
    const secondRead = await handle.read(duplicate, 0, duplicate.length, 0);
    if (
      opened.dev !== pathMetadata.dev ||
      opened.ino !== pathMetadata.ino ||
      firstRead.bytesRead !== raw.length ||
      secondRead.bytesRead !== duplicate.length ||
      !raw.equals(duplicate)
    ) {
      throw new Error(`${label} changed while opening held guard`);
    }
    const identity = Object.freeze({
      path: filePath,
      bytes: raw.byteLength,
      sha256: v1r11Sha256(raw),
      schema,
    });
    const validate = async (): Promise<void> => {
      if (closed) throw new Error(`${label} held guard is closed`);
      const before = await handle.stat();
      const first = Buffer.alloc(opened.size);
      const second = Buffer.alloc(opened.size);
      const firstResult = await handle.read(first, 0, first.length, 0);
      const middle = await handle.stat();
      const secondResult = await handle.read(second, 0, second.length, 0);
      const after = await handle.stat();
      const linked = await fs.promises.lstat(filePath);
      if (
        firstResult.bytesRead !== first.length ||
        secondResult.bytesRead !== second.length ||
        !first.equals(second) ||
        !first.equals(raw) ||
        [before, middle, after].some(
          (entry) =>
            entry.dev !== opened.dev ||
            entry.ino !== opened.ino ||
            entry.size !== opened.size ||
            entry.nlink !== 1 ||
            entry.uid !== opened.uid ||
            (entry.mode & 0o7777) !== PRIVATE_FILE_MODE ||
            entry.mtimeMs !== opened.mtimeMs ||
            entry.ctimeMs !== opened.ctimeMs,
        ) ||
        linked.dev !== opened.dev ||
        linked.ino !== opened.ino ||
        linked.size !== opened.size ||
        linked.nlink !== 1 ||
        linked.uid !== opened.uid ||
        (linked.mode & 0o7777) !== PRIVATE_FILE_MODE ||
        (await fs.promises.realpath(filePath)) !== filePath
      ) {
        throw new Error(`${label} changed while held guard was active`);
      }
    };
    await validate();
    return Object.freeze({
      identity,
      validate,
      close: async () => {
        if (closed) return;
        closed = true;
        await handle.close();
      },
    });
  } catch (error) {
    if (!closed) {
      closed = true;
      await handle.close();
    }
    throw error;
  }
}

export async function readV1R11HeldIdentity(
  identity: Readonly<V1R11AuthorityFileIdentity>,
  expectedSchema: string | undefined,
  label: string,
): Promise<Buffer> {
  if (
    !path.isAbsolute(identity.path) ||
    !Number.isSafeInteger(identity.bytes) ||
    identity.bytes < 1 ||
    !/^[0-9a-f]{64}$/u.test(identity.sha256) ||
    typeof identity.schema !== "string" ||
    identity.schema.length < 1 ||
    (expectedSchema !== undefined && identity.schema !== expectedSchema)
  ) {
    throw new Error(`${label} identity differs`);
  }
  const raw = await readV1R11HeldFile(identity.path, label);
  if (
    raw.byteLength !== identity.bytes ||
    v1r11Sha256(raw) !== identity.sha256
  ) {
    throw new Error(`${label} bytes or sha256 differ`);
  }
  return raw;
}

export function parseV1R11CanonicalObject(
  raw: Buffer,
  label: string,
): Readonly<Record<string, unknown>> {
  let value: unknown;
  try {
    value = JSON.parse(raw.toString("utf8"));
  } catch {
    throw new Error(`${label} is not JSON`);
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} is not one object`);
  }
  if (!v1r11CanonicalLine(value).equals(raw)) {
    throw new Error(`${label} is not canonical JSON with one terminal LF`);
  }
  return value as Readonly<Record<string, unknown>>;
}
