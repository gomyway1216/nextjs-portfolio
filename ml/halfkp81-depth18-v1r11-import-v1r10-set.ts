import { createHash, randomBytes } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

import {
  HALFKP81_DEPTH18_WRAPPER_DIGEST_DOMAIN,
  canonicalHalfkp81Depth18Json,
  readHalfkp81Depth18PrivateArtifact,
  validateHalfkp81Depth18V1R10ImportableSet,
  validateHalfkp81Depth18V1R11ImportedSet,
  validateHalfkp81Depth18V1R11MinimalR2ImportableSet,
  validateHalfkp81Depth18V1R11MinimalR3ImportedSet,
} from "./halfkp81-depth18-teacher-artifact-validation";

const SOURCE_ROOT =
  "/Users/yudaiyaguchi/.codex/shogi-runs/halfkp81-hard-depth18-yaneura-only-v1r10";
const SELECTION_ROOT =
  "/Users/yudaiyaguchi/.codex/shogi-runs/halfkp81-hard-depth18-strength-v1";
const ASSET_ROOT =
  "/Users/yudaiyaguchi/.codex/shogi-data/floodgate-teacher-assets-v1";
const V1R11_WORK_SCHEMA =
  "shogi-halfkp81-hard-depth18-yaneura-only-teacher-work-v1r11";
const MINIMAL_R2_SOURCE_ROOT =
  "/Users/yudaiyaguchi/.codex/shogi-runs/halfkp81-hard-depth18-yaneura-only-v1r11-minimal-r2";

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalLine(value: unknown): Buffer {
  return Buffer.from(`${canonicalHalfkp81Depth18Json(value)}\n`, "utf8");
}

async function fsyncDirectory(directory: string): Promise<void> {
  const handle = await fs.promises.open(directory, fs.constants.O_RDONLY);
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function publishCreateOnly(
  destination: string,
  bytes: Uint8Array,
): Promise<Readonly<{ path: string; bytes: number; sha256: string }>> {
  const directory = path.dirname(destination);
  await fs.promises.mkdir(directory, { recursive: true, mode: 0o700 });
  const temporary = path.join(
    directory,
    `.${path.basename(destination)}.${process.pid}.${randomBytes(12).toString("hex")}.tmp`,
  );
  const handle = await fs.promises.open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(bytes);
    await handle.datasync();
  } finally {
    await handle.close();
  }
  try {
    await fs.promises.link(temporary, destination);
    await fsyncDirectory(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const existing = await fs.promises.readFile(destination);
    if (!existing.equals(Buffer.from(bytes))) {
      throw new Error(`create-only import target differs: ${destination}`);
    }
  } finally {
    await fs.promises.rm(temporary, { force: true });
  }
  return Object.freeze({
    path: destination,
    bytes: bytes.byteLength,
    sha256: sha256(bytes),
  });
}

async function readSourceSnapshots(repositoryRoot: string) {
  const uid = process.getuid?.() ?? -1;
  const read = (
    file: string,
    root: string,
    label: string,
    maximumBytes: number,
    privateMode = true,
  ) =>
    readHalfkp81Depth18PrivateArtifact(
      file,
      root,
      uid,
      label,
      maximumBytes,
      privateMode,
    );
  const plan = await read(
    path.join(SOURCE_ROOT, "teacher-plan.json"),
    SOURCE_ROOT,
    "v1r10 import plan",
    16_859,
  );
  const work = await read(
    path.join(SOURCE_ROOT, "teacher-work.jsonl"),
    SOURCE_ROOT,
    "v1r10 import work",
    91_081_134,
  );
  const firstLf = Buffer.from(work.bytes).indexOf(0x0a);
  const header = JSON.parse(
    Buffer.from(work.bytes).subarray(0, firstLf).toString("utf8"),
  ) as Readonly<{
    engine: Readonly<{
      binary: Readonly<{ path: string }>;
      eval_file: Readonly<{ path: string }>;
      receipt: Readonly<{ path: string }>;
    }>;
  }>;
  const [
    selection,
    selectionManifest,
    terminalFault,
    engineBinary,
    engineEval,
    engineReceipt,
  ] = await Promise.all([
    read(
      path.join(SELECTION_ROOT, "hard-parents.jsonl"),
      SELECTION_ROOT,
      "v1r10 import selection",
      7_268_777,
    ),
    read(
      path.join(SELECTION_ROOT, "hard-parents.manifest.json"),
      SELECTION_ROOT,
      "v1r10 import selection manifest",
      3_234,
    ),
    read(
      path.join(SOURCE_ROOT, "teacher-terminal-fault.json"),
      SOURCE_ROOT,
      "v1r10 import terminal fault",
      1_084,
    ),
    read(
      header.engine.binary.path,
      ASSET_ROOT,
      "v1r10 import engine binary",
      700_048,
      false,
    ),
    read(
      header.engine.eval_file.path,
      ASSET_ROOT,
      "v1r10 import engine eval",
      64_217_066,
      false,
    ),
    read(
      header.engine.receipt.path,
      repositoryRoot,
      "v1r10 import engine receipt",
      654,
      false,
    ),
  ]);
  return Object.freeze({
    plan,
    selection,
    selectionManifest,
    work,
    terminalFault,
    engineBinary,
    engineEval,
    engineReceipt,
  });
}

export interface Halfkp81Depth18V1R11ImportRequest {
  readonly repositoryRoot: string;
  readonly targetWorkPath: string;
  readonly targetHeader: Readonly<Record<string, unknown>>;
  readonly targetRunFingerprint: string;
  readonly selectionOrderedParentIds: readonly string[];
  readonly authorityDirectory: string;
}

export async function importHalfkp81Depth18V1R10CompletedSetIntoV1R11(
  request: Readonly<Halfkp81Depth18V1R11ImportRequest>,
): Promise<Readonly<Record<string, unknown>>> {
  if (
    !/^[0-9a-f]{64}$/u.test(request.targetRunFingerprint) ||
    request.targetHeader.run_fingerprint !== request.targetRunFingerprint ||
    request.targetHeader.schema !== V1R11_WORK_SCHEMA ||
    request.selectionOrderedParentIds.length !== 8_192 ||
    new Set(request.selectionOrderedParentIds).size !== 8_192
  ) {
    throw new Error("v1r11 import target identity differs");
  }
  const source = await readSourceSnapshots(request.repositoryRoot);
  const sourceVerification = validateHalfkp81Depth18V1R10ImportableSet(source);
  const verifierReceiptPath = path.join(
    request.authorityDirectory,
    "v1r10-import-source-verification-receipt.json",
  );
  const verifierReceiptIdentity = await publishCreateOnly(
    verifierReceiptPath,
    canonicalLine(sourceVerification),
  );

  const sourceLines = Buffer.from(source.work.bytes)
    .toString("utf8")
    .trimEnd()
    .split("\n")
    .slice(1)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
  const sourceByParentId = new Map(
    sourceLines.map((entry) => [String(entry.parent_id), entry] as const),
  );
  const imported: Record<string, unknown>[] = [];
  for (const parentId of request.selectionOrderedParentIds) {
    const sourceEntry = sourceByParentId.get(parentId);
    if (sourceEntry === undefined) continue;
    const sourceTeacher = sourceEntry.teacher_entry as Record<string, unknown>;
    const teacherEntry: Record<string, unknown> = {
      ...sourceTeacher,
      run_fingerprint: request.targetRunFingerprint,
      payload_sha256: "",
    };
    delete teacherEntry.payload_sha256;
    teacherEntry.payload_sha256 = sha256(
      canonicalHalfkp81Depth18Json(teacherEntry),
    );
    const withoutDigest: Record<string, unknown> = {
      ...sourceEntry,
      schema: V1R11_WORK_SCHEMA,
      run_fingerprint: request.targetRunFingerprint,
      teacher_entry: teacherEntry,
    };
    delete withoutDigest.payload_sha256;
    const entry = {
      ...withoutDigest,
      payload_sha256: sha256(
        `${HALFKP81_DEPTH18_WRAPPER_DIGEST_DOMAIN}${canonicalHalfkp81Depth18Json(withoutDigest)}`,
      ),
    };
    imported.push(entry);
  }
  if (imported.length !== 4_196) {
    throw new Error("v1r11 import transformed parent count differs");
  }
  const targetBytes = Buffer.concat([
    canonicalLine(request.targetHeader),
    ...imported.map(canonicalLine),
  ]);
  const targetWorkIdentity = await publishCreateOnly(
    request.targetWorkPath,
    targetBytes,
  );
  const targetWork = await readHalfkp81Depth18PrivateArtifact(
    request.targetWorkPath,
    path.dirname(request.targetWorkPath),
    process.getuid?.() ?? -1,
    "v1r11 imported target work",
    targetBytes.byteLength,
  );
  const targetVerification = validateHalfkp81Depth18V1R11ImportedSet({
    selection: source.selection,
    targetWork,
    expectedHeader: request.targetHeader,
    targetRunFingerprint: request.targetRunFingerprint,
  });
  const receipt = Object.freeze({
    schema: "shogi-halfkp81-depth18-v1r11-v1r10-import-receipt-v1",
    status: "new-family-create-only-exact-set-imported",
    source_verification_receipt: Object.freeze({
      ...verifierReceiptIdentity,
      schema: String(sourceVerification.schema),
    }),
    source_work: sourceVerification.source,
    target_verification: targetVerification,
    target: Object.freeze({
      run_fingerprint: request.targetRunFingerprint,
      work: Object.freeze({
        ...targetWorkIdentity,
        schema: V1R11_WORK_SCHEMA,
        rows: imported.length + 1,
      }),
      imported_parents: imported.length,
      imported_rows: 49_190,
      remaining_parent_id_set_difference: 8_192 - imported.length,
    }),
    authority: Object.freeze({
      may_resume_v1r10: false,
      may_train: false,
      may_play_formal_games: false,
      may_write_live_weights: false,
    }),
  });
  const importReceiptPath = path.join(
    request.authorityDirectory,
    "v1r10-import-receipt.json",
  );
  await publishCreateOnly(importReceiptPath, canonicalLine(receipt));
  return receipt;
}

async function readMinimalR2SourceSnapshots() {
  const uid = process.getuid?.() ?? -1;
  const read = (
    file: string,
    root: string,
    label: string,
    maximumBytes: number,
  ) => readHalfkp81Depth18PrivateArtifact(file, root, uid, label, maximumBytes);
  const [plan, selection, work, terminalFault] = await Promise.all([
    read(
      path.join(MINIMAL_R2_SOURCE_ROOT, "teacher-plan.json"),
      MINIMAL_R2_SOURCE_ROOT,
      "minimal-r2 import plan",
      119_913,
    ),
    read(
      path.join(SELECTION_ROOT, "hard-parents.jsonl"),
      SELECTION_ROOT,
      "minimal-r2 import selection",
      7_268_777,
    ),
    read(
      path.join(MINIMAL_R2_SOURCE_ROOT, "teacher-work.jsonl"),
      MINIMAL_R2_SOURCE_ROOT,
      "minimal-r2 import work",
      91_324_617,
    ),
    read(
      path.join(MINIMAL_R2_SOURCE_ROOT, "teacher-terminal-fault.json"),
      MINIMAL_R2_SOURCE_ROOT,
      "minimal-r2 import terminal fault",
      1_033,
    ),
  ]);
  return Object.freeze({ plan, selection, work, terminalFault });
}

export async function importHalfkp81Depth18V1R11MinimalR2CompletedSetIntoR3(
  request: Readonly<Halfkp81Depth18V1R11ImportRequest>,
): Promise<Readonly<Record<string, unknown>>> {
  if (
    !/^[0-9a-f]{64}$/u.test(request.targetRunFingerprint) ||
    request.targetHeader.run_fingerprint !== request.targetRunFingerprint ||
    request.targetHeader.schema !== V1R11_WORK_SCHEMA ||
    request.selectionOrderedParentIds.length !== 8_192 ||
    new Set(request.selectionOrderedParentIds).size !== 8_192
  ) {
    throw new Error("minimal-r3 import target identity differs");
  }
  const source = await readMinimalR2SourceSnapshots();
  const sourceVerification =
    validateHalfkp81Depth18V1R11MinimalR2ImportableSet(source);
  const verifierReceiptIdentity = await publishCreateOnly(
    path.join(
      request.authorityDirectory,
      "minimal-r2-import-source-verification-receipt.json",
    ),
    canonicalLine(sourceVerification),
  );
  const sourceLines = Buffer.from(source.work.bytes)
    .toString("utf8")
    .trimEnd()
    .split("\n")
    .slice(1)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
  const sourceByParentId = new Map(
    sourceLines.map((entry) => [String(entry.parent_id), entry] as const),
  );
  const imported: Record<string, unknown>[] = [];
  for (const parentId of request.selectionOrderedParentIds) {
    const sourceEntry = sourceByParentId.get(parentId);
    if (sourceEntry === undefined) continue;
    const sourceTeacher = sourceEntry.teacher_entry as Record<string, unknown>;
    const teacherEntry: Record<string, unknown> = {
      ...sourceTeacher,
      run_fingerprint: request.targetRunFingerprint,
    };
    delete teacherEntry.payload_sha256;
    teacherEntry.payload_sha256 = sha256(
      canonicalHalfkp81Depth18Json(teacherEntry),
    );
    const withoutDigest: Record<string, unknown> = {
      ...sourceEntry,
      schema: V1R11_WORK_SCHEMA,
      run_fingerprint: request.targetRunFingerprint,
      teacher_entry: teacherEntry,
    };
    delete withoutDigest.payload_sha256;
    imported.push({
      ...withoutDigest,
      payload_sha256: sha256(
        `${HALFKP81_DEPTH18_WRAPPER_DIGEST_DOMAIN}${canonicalHalfkp81Depth18Json(withoutDigest)}`,
      ),
    });
  }
  if (imported.length !== 4_209) {
    throw new Error("minimal-r3 transformed parent count differs");
  }
  const targetBytes = Buffer.concat([
    canonicalLine(request.targetHeader),
    ...imported.map(canonicalLine),
  ]);
  const targetWorkIdentity = await publishCreateOnly(
    request.targetWorkPath,
    targetBytes,
  );
  const targetWork = await readHalfkp81Depth18PrivateArtifact(
    request.targetWorkPath,
    path.dirname(request.targetWorkPath),
    process.getuid?.() ?? -1,
    "minimal-r3 imported target work",
    targetBytes.byteLength,
  );
  const targetVerification = validateHalfkp81Depth18V1R11MinimalR3ImportedSet({
    selection: source.selection,
    targetWork,
    expectedHeader: request.targetHeader,
    targetRunFingerprint: request.targetRunFingerprint,
  });
  const receipt = Object.freeze({
    schema: "shogi-halfkp81-depth18-v1r11-minimal-r2-to-r3-import-receipt-v1",
    status: "new-family-create-only-exact-set-imported",
    source_verification_receipt: Object.freeze({
      ...verifierReceiptIdentity,
      schema: String(sourceVerification.schema),
    }),
    source: sourceVerification,
    target_verification: targetVerification,
    target: Object.freeze({
      run_fingerprint: request.targetRunFingerprint,
      work: Object.freeze({
        ...targetWorkIdentity,
        schema: V1R11_WORK_SCHEMA,
        rows: imported.length + 1,
      }),
      imported_parents: imported.length,
      imported_rows: 49_316,
      remaining_parent_id_set_difference: 8_192 - imported.length,
    }),
    authority: Object.freeze({
      may_resume_minimal_r2: false,
      may_train: false,
      may_play_formal_games: false,
      may_write_live_weights: false,
    }),
  });
  await publishCreateOnly(
    path.join(request.authorityDirectory, "minimal-r2-import-receipt.json"),
    canonicalLine(receipt),
  );
  return receipt;
}
