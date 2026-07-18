import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign,
  verify,
  type KeyObject,
} from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

type Role = "authority" | "supervisor" | "verifier";
type Offset = readonly [offset: number, length: number];
type FlatOffsets = Readonly<Record<string, Offset>>;
type PathPolicy = readonly [
  path: string,
  kind: number,
  ownerUID: number,
  ownerGID: number,
  mode: number,
  linkPolicy: number,
  exactLinkCount: number,
];

interface GoldenKey {
  readonly seed_hex: string;
  readonly public_key_hex: string;
  readonly key_id_hex: string;
}

interface GoldenRecord {
  readonly swift_type: string;
  readonly canonical_byte_count: number;
  readonly fields: Readonly<Record<string, unknown>>;
  readonly offsets: unknown;
  readonly canonical_hex: string;
  readonly sha256: string;
  readonly signature_payload_byte_count?: number;
  readonly signer_role?: Role;
  readonly signature_payload_hex?: string;
  readonly signature_hex?: string;
}

interface GoldenFixture {
  readonly schema: string;
  readonly status: string;
  readonly scope: Readonly<{
    readonly wire_level: string;
    readonly authority_manifest_chain: string;
    readonly excluded_evidence: string;
    readonly authority_binding_domain_utf8: string;
    readonly manifest_authority_binding: string;
  }>;
  readonly encoding: Readonly<{
    readonly byte_order: string;
    readonly hex: string;
    readonly signature_algorithm: string;
    readonly key_id: string;
    readonly signature_generation: string;
    readonly swift_cryptokit: string;
  }>;
  readonly keys: Readonly<Record<Role, GoldenKey>>;
  readonly records: Readonly<{
    readonly fixed_argv: GoldenRecord;
    readonly fixed_cwd: GoldenRecord;
    readonly fixed_env: GoldenRecord;
    readonly runtime_install: GoldenRecord;
    readonly runtime_launch_policy: GoldenRecord;
    readonly repository_source_manifest: GoldenRecord;
    readonly enrollment: GoldenRecord;
    readonly signed_enrollment: GoldenRecord;
    readonly activation: GoldenRecord;
    readonly signed_activation: GoldenRecord;
    readonly expected_activation_head: GoldenRecord;
    readonly supervisor_challenge: GoldenRecord;
    readonly verifier_receipt: GoldenRecord;
    readonly one_shot_attestation: GoldenRecord;
  }>;
  readonly links: Readonly<Record<string, string>>;
}

interface DerivedKey {
  readonly privateKey: KeyObject;
  readonly publicKey: KeyObject;
  readonly publicKeyBytes: Buffer;
}

interface Encoded {
  readonly bytes: Buffer;
  readonly offsets: FlatOffsets;
}

interface SignedSpec {
  readonly record: GoldenRecord;
  readonly expectedMagic: string;
  readonly expectedRole: "supervisor" | "verifier";
  readonly hexFields: readonly string[];
  readonly uint32Fields: readonly string[];
  readonly uint64Fields: readonly string[];
}

interface AuthorityEnvelopeSpec {
  readonly record: GoldenRecord;
  readonly expectedMagic: "FGV7SEN1" | "FGV7SAC1";
  readonly innerRecord: GoldenRecord;
  readonly innerField: "enrollment_record_hex" | "activation_record_hex";
}

const repositoryRoot = path.resolve(__dirname, "../../..");
const fixturePath = path.join(
  repositoryRoot,
  "tests/fixtures/floodgate-v7-external-trust-root-canonical-golden-v1.json",
);
const fixture = JSON.parse(
  fs.readFileSync(fixturePath, "utf8"),
) as GoldenFixture;

const PKCS8_ED25519_SEED_PREFIX = Buffer.from(
  "302e020100300506032b657004220420",
  "hex",
);
const SPKI_ED25519_PUBLIC_KEY_PREFIX = Buffer.from(
  "302a300506032b6570032100",
  "hex",
);
const LOWER_HEX = /^(?:[0-9a-f]{2})+$/u;

function digest(value: Buffer): Buffer {
  return createHash("sha256").update(value).digest();
}

function sha256(value: Buffer): string {
  return digest(value).toString("hex");
}

function fromHex(value: string): Buffer {
  if (!LOWER_HEX.test(value)) {
    throw new Error("fixture hex must be nonempty lowercase octets");
  }
  return Buffer.from(value, "hex");
}

function unsignedByte(value: number): Buffer {
  if (!Number.isInteger(value) || value < 0 || value > 0xff) {
    throw new Error("value is not UInt8");
  }
  return Buffer.from([value]);
}

function unsigned32(value: number): Buffer {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff_ffff) {
    throw new Error("value is not UInt32");
  }
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32BE(value);
  return bytes;
}

function unsigned64(value: number): Buffer {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("fixture UInt64 must be a nonnegative safe integer");
  }
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64BE(BigInt(value));
  return bytes;
}

function stringField(
  fields: Readonly<Record<string, unknown>>,
  name: string,
): string {
  const value = fields[name];
  if (typeof value !== "string") throw new Error(`${name} is not a string`);
  return value;
}

function numberField(
  fields: Readonly<Record<string, unknown>>,
  name: string,
): number {
  const value = fields[name];
  if (typeof value !== "number") throw new Error(`${name} is not a number`);
  return value;
}

function numberArrayField(
  fields: Readonly<Record<string, unknown>>,
  name: string,
): readonly number[] {
  const value = fields[name];
  if (
    !Array.isArray(value) ||
    value.some((element) => typeof element !== "number")
  ) {
    throw new Error(`${name} is not a number array`);
  }
  return value as number[];
}

class CanonicalEncoder {
  readonly #parts: Buffer[] = [];
  readonly #offsets: Record<string, Offset> = {};
  #length = 0;

  append(name: string, value: Buffer): this {
    if (Object.hasOwn(this.#offsets, name)) {
      throw new Error(`duplicate canonical field ${name}`);
    }
    this.#offsets[name] = [this.#length, value.length];
    this.#parts.push(value);
    this.#length += value.length;
    return this;
  }

  finish(): Encoded {
    return Object.freeze({
      bytes: Buffer.concat(this.#parts),
      offsets: Object.freeze({ ...this.#offsets }),
    });
  }
}

class CanonicalCursor {
  readonly #bytes: Buffer;
  #offset = 0;

  constructor(bytes: Buffer) {
    this.#bytes = bytes;
  }

  read(length: number): Buffer {
    if (
      !Number.isInteger(length) ||
      length < 0 ||
      this.#offset + length > this.#bytes.length
    ) {
      throw new Error("canonical field exceeds record");
    }
    const start = this.#offset;
    this.#offset += length;
    return this.#bytes.subarray(start, this.#offset);
  }

  readByte(): number {
    return this.read(1)[0];
  }

  readUInt32(): number {
    return this.read(4).readUInt32BE(0);
  }

  readUInt64(): number {
    const value = this.read(8).readBigUInt64BE(0);
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error("fixture UInt64 exceeds exact JavaScript range");
    }
    return Number(value);
  }

  assertAtEnd(): void {
    if (this.#offset !== this.#bytes.length) {
      throw new Error("canonical record contains a trailing field");
    }
  }
}

function appendCommon(
  encoder: CanonicalEncoder,
  fields: Readonly<Record<string, unknown>>,
): void {
  encoder
    .append("magic", Buffer.from(stringField(fields, "magic"), "utf8"))
    .append(
      "schema_version",
      unsignedByte(numberField(fields, "schema_version")),
    )
    .append("reserved", unsignedByte(numberField(fields, "reserved")))
    .append("audience", unsignedByte(numberField(fields, "audience")))
    .append("purpose", unsignedByte(numberField(fields, "purpose")));
}

function assertCommon(
  cursor: CanonicalCursor,
  fields: Readonly<Record<string, unknown>>,
): void {
  expect(cursor.read(8).toString("utf8")).toBe(stringField(fields, "magic"));
  expect(cursor.readByte()).toBe(numberField(fields, "schema_version"));
  expect(cursor.readByte()).toBe(numberField(fields, "reserved"));
  expect(cursor.readByte()).toBe(numberField(fields, "audience"));
  expect(cursor.readByte()).toBe(numberField(fields, "purpose"));
}

function assertGolden(
  record: GoldenRecord,
  encoded: Encoded,
  compareOffsets = true,
): void {
  expect(encoded.bytes).toHaveLength(record.canonical_byte_count);
  expect(encoded.bytes.toString("hex")).toBe(record.canonical_hex);
  expect(sha256(encoded.bytes)).toBe(record.sha256);
  if (compareOffsets) {
    expect(encoded.offsets).toEqual(record.offsets);
  }
}

function encodeFixedArgv(record: GoldenRecord): Encoded {
  const fields = record.fields;
  const argumentsValue = fields.arguments;
  if (
    !Array.isArray(argumentsValue) ||
    argumentsValue.some((value) => typeof value !== "string")
  ) {
    throw new Error("arguments must be strings");
  }
  const arguments_ = argumentsValue as string[];
  const encoder = new CanonicalEncoder();
  appendCommon(encoder, fields);
  encoder.append("argument_count", unsigned32(arguments_.length));
  for (const [index, argument] of arguments_.entries()) {
    const value = Buffer.from(argument, "utf8");
    encoder
      .append(`arguments[${index}].length`, unsigned32(value.length))
      .append(`arguments[${index}].utf8`, value);
  }
  return encoder.finish();
}

function parseFixedArgv(record: GoldenRecord): void {
  const cursor = new CanonicalCursor(fromHex(record.canonical_hex));
  assertCommon(cursor, record.fields);
  const argumentsValue = record.fields.arguments as string[];
  expect(cursor.readUInt32()).toBe(argumentsValue.length);
  for (const argument of argumentsValue) {
    const expected = Buffer.from(argument, "utf8");
    expect(cursor.readUInt32()).toBe(expected.length);
    expect(cursor.read(expected.length)).toEqual(expected);
  }
  cursor.assertAtEnd();
}

function encodeFixedCwd(record: GoldenRecord): Encoded {
  const encoder = new CanonicalEncoder();
  appendCommon(encoder, record.fields);
  const value = Buffer.from(
    stringField(record.fields, "working_directory"),
    "utf8",
  );
  encoder
    .append("working_directory.length", unsigned32(value.length))
    .append("working_directory.utf8", value);
  return encoder.finish();
}

function encodeFixedEnvironment(record: GoldenRecord): Encoded {
  const entries = record.fields.entries;
  if (!Array.isArray(entries)) throw new Error("entries must be an array");
  const encoder = new CanonicalEncoder();
  appendCommon(encoder, record.fields);
  encoder.append("entry_count", unsigned32(entries.length));
  return encoder.finish();
}

function parseSingleStringOrEmptyRecord(
  record: GoldenRecord,
  field: "working_directory" | "entries",
): void {
  const cursor = new CanonicalCursor(fromHex(record.canonical_hex));
  assertCommon(cursor, record.fields);
  if (field === "working_directory") {
    const expected = Buffer.from(stringField(record.fields, field), "utf8");
    expect(cursor.readUInt32()).toBe(expected.length);
    expect(cursor.read(expected.length)).toEqual(expected);
  } else {
    expect(cursor.readUInt32()).toBe(0);
    expect(record.fields.entries).toEqual([]);
  }
  cursor.assertAtEnd();
}

const RUNTIME_INSTALL_DIGEST_FIELDS = [
  "record_id_hex",
  "node_whole_file_sha256_hex",
  "node_code_directory_sha256_hex",
  "node_designated_requirement_sha256_hex",
  "node_held_executable_identity_sha256_hex",
  "diagnostic_entry_bundle_whole_file_sha256_hex",
  "diagnostic_entry_bundle_held_file_identity_sha256_hex",
  "filesystem_identity_policy_sha256_hex",
  "acl_policy_sha256_hex",
] as const;

function pathPolicies(record: GoldenRecord): readonly PathPolicy[] {
  const value = record.fields.path_policies;
  if (
    !Array.isArray(value) ||
    value.some(
      (policy) =>
        !Array.isArray(policy) ||
        policy.length !== 7 ||
        typeof policy[0] !== "string" ||
        policy.slice(1).some((field) => typeof field !== "number"),
    )
  ) {
    throw new Error("path policies differ");
  }
  return value as unknown as PathPolicy[];
}

function encodeRuntimeInstall(record: GoldenRecord): Encoded {
  const fields = record.fields;
  const encoder = new CanonicalEncoder();
  appendCommon(encoder, fields);
  encoder
    .append("path_count", unsignedByte(numberField(fields, "path_count")))
    .append(
      "require_no_follow",
      unsignedByte(numberField(fields, "require_no_follow")),
    )
    .append(
      "require_same_device",
      unsignedByte(numberField(fields, "require_same_device")),
    )
    .append(
      "require_local_filesystem",
      unsignedByte(numberField(fields, "require_local_filesystem")),
    )
    .append(
      "allowed_writable_acl_entry_count",
      unsigned32(numberField(fields, "allowed_writable_acl_entry_count")),
    );
  for (const field of RUNTIME_INSTALL_DIGEST_FIELDS) {
    encoder.append(field, fromHex(stringField(fields, field)));
  }
  for (const [index, policy] of pathPolicies(record).entries()) {
    const [pathValue, kind, ownerUID, ownerGID, mode, linkPolicy, linkCount] =
      policy;
    const pathBytes = Buffer.from(pathValue, "utf8");
    encoder
      .append(
        `path_policies[${index}].path_length`,
        unsignedByte(pathBytes.length),
      )
      .append(`path_policies[${index}].path_utf8`, pathBytes)
      .append(`path_policies[${index}].kind`, unsignedByte(kind))
      .append(`path_policies[${index}].owner_uid`, unsigned32(ownerUID))
      .append(`path_policies[${index}].owner_gid`, unsigned32(ownerGID))
      .append(`path_policies[${index}].mode`, unsigned32(mode))
      .append(`path_policies[${index}].link_policy`, unsignedByte(linkPolicy))
      .append(
        `path_policies[${index}].exact_link_count`,
        unsigned32(linkCount),
      );
  }
  return encoder.finish();
}

function parseRuntimeInstall(record: GoldenRecord): void {
  const cursor = new CanonicalCursor(fromHex(record.canonical_hex));
  const fields = record.fields;
  assertCommon(cursor, fields);
  expect(cursor.readByte()).toBe(numberField(fields, "path_count"));
  expect(cursor.readByte()).toBe(numberField(fields, "require_no_follow"));
  expect(cursor.readByte()).toBe(numberField(fields, "require_same_device"));
  expect(cursor.readByte()).toBe(
    numberField(fields, "require_local_filesystem"),
  );
  expect(cursor.readUInt32()).toBe(
    numberField(fields, "allowed_writable_acl_entry_count"),
  );
  for (const field of RUNTIME_INSTALL_DIGEST_FIELDS) {
    expect(cursor.read(32).toString("hex")).toBe(stringField(fields, field));
  }
  for (const policy of pathPolicies(record)) {
    const [pathValue, kind, ownerUID, ownerGID, mode, linkPolicy, linkCount] =
      policy;
    const pathBytes = Buffer.from(pathValue, "utf8");
    expect(cursor.readByte()).toBe(pathBytes.length);
    expect(cursor.read(pathBytes.length)).toEqual(pathBytes);
    expect(cursor.readByte()).toBe(kind);
    expect(cursor.readUInt32()).toBe(ownerUID);
    expect(cursor.readUInt32()).toBe(ownerGID);
    expect(cursor.readUInt32()).toBe(mode);
    expect(cursor.readByte()).toBe(linkPolicy);
    expect(cursor.readUInt32()).toBe(linkCount);
  }
  cursor.assertAtEnd();
}

function assertRuntimeInstallOffsets(record: GoldenRecord): void {
  const offsets = record.offsets as {
    readonly path_policies: readonly (readonly [
      pathLengthOffset: number,
      pathOffset: number,
      metadataOffset: number,
      totalLength: number,
    ])[];
  } & FlatOffsets;
  const policies = pathPolicies(record);
  expect(offsets.digest_block).toEqual([20, 288]);
  let cursor = 308;
  for (const [index, policy] of policies.entries()) {
    const pathLength = Buffer.byteLength(policy[0]);
    const [pathLengthOffset, pathOffset, metadataOffset, totalLength] =
      offsets.path_policies[index];
    expect(pathLengthOffset).toBe(cursor);
    expect(pathOffset).toBe(cursor + 1);
    expect(metadataOffset).toBe(pathOffset + pathLength);
    expect(totalLength).toBe(pathLength + 19);
    cursor += totalLength;
  }
  expect(cursor).toBe(record.canonical_byte_count);
}

const RUNTIME_LAUNCH_DIGEST_FIELDS = [
  "record_id_hex",
  "fixed_argv_sha256_hex",
  "fixed_working_directory_sha256_hex",
  "fixed_environment_sha256_hex",
  "runtime_install_policy_sha256_hex",
  "diagnostic_entry_bundle_sha256_hex",
] as const;

function encodeRuntimeLaunch(record: GoldenRecord): Encoded {
  const encoder = new CanonicalEncoder();
  appendCommon(encoder, record.fields);
  encoder.append(
    "flags",
    Buffer.from(numberArrayField(record.fields, "flags")),
  );
  for (const field of RUNTIME_LAUNCH_DIGEST_FIELDS) {
    encoder.append(field, fromHex(stringField(record.fields, field)));
  }
  return encoder.finish();
}

function parseRuntimeLaunch(record: GoldenRecord): void {
  const cursor = new CanonicalCursor(fromHex(record.canonical_hex));
  assertCommon(cursor, record.fields);
  const flags = numberArrayField(record.fields, "flags");
  expect([...cursor.read(flags.length)]).toEqual(flags);
  for (const field of RUNTIME_LAUNCH_DIGEST_FIELDS) {
    expect(cursor.read(32).toString("hex")).toBe(
      stringField(record.fields, field),
    );
  }
  cursor.assertAtEnd();
}

const MANIFEST_DIGEST_FIELDS = [
  "repository_source_closure_sha256_hex",
  "diagnostic_bundle_sha256_hex",
  "diagnostic_launcher_jxa_sha256_hex",
  "pinned_node_runtime_sha256_hex",
  "runtime_launch_policy_sha256_hex",
  "supervisor_artifact_sha256_hex",
  "verifier_artifact_sha256_hex",
  "supervisor_code_directory_sha256_hex",
  "supervisor_designated_requirement_sha256_hex",
  "supervisor_held_executable_identity_sha256_hex",
  "verifier_code_directory_sha256_hex",
  "verifier_designated_requirement_sha256_hex",
  "verifier_held_executable_identity_sha256_hex",
  "pinned_node_code_directory_sha256_hex",
  "pinned_node_designated_requirement_sha256_hex",
  "pinned_node_held_executable_identity_sha256_hex",
  "supervisor_attestation_key_id_hex",
  "verifier_attestation_key_id_hex",
  "git_directory_policy_sha256_hex",
  "repository_path_policy_sha256_hex",
  "artifact_closure_record_sha256_hex",
  "install_policy_record_sha256_hex",
] as const;

function encodeRepositorySourceManifest(record: GoldenRecord): Encoded {
  const fields = record.fields;
  const encoder = new CanonicalEncoder();
  appendCommon(encoder, fields);
  encoder
    .append("manifest_id_hex", fromHex(stringField(fields, "manifest_id_hex")))
    .append(
      "approved_commit_hex",
      fromHex(stringField(fields, "approved_commit_hex")),
    )
    .append(
      "approved_tree_hex",
      fromHex(stringField(fields, "approved_tree_hex")),
    );
  for (const field of MANIFEST_DIGEST_FIELDS) {
    encoder.append(field, fromHex(stringField(fields, field)));
  }
  return encoder.finish();
}

function parseRepositorySourceManifest(record: GoldenRecord): void {
  const fields = record.fields;
  const cursor = new CanonicalCursor(fromHex(record.canonical_hex));
  assertCommon(cursor, fields);
  for (const [field, length] of [
    ["manifest_id_hex", 32],
    ["approved_commit_hex", 20],
    ["approved_tree_hex", 20],
  ] as const) {
    expect(cursor.read(length).toString("hex")).toBe(
      stringField(fields, field),
    );
  }
  for (const field of MANIFEST_DIGEST_FIELDS) {
    expect(cursor.read(32).toString("hex")).toBe(stringField(fields, field));
  }
  cursor.assertAtEnd();
}

function encodeEnrollment(record: GoldenRecord): Encoded {
  const fields = record.fields;
  const encoder = new CanonicalEncoder();
  appendCommon(encoder, fields);
  encoder
    .append("expected_uid", unsigned32(numberField(fields, "expected_uid")))
    .append(
      "enrollment_id_hex",
      fromHex(stringField(fields, "enrollment_id_hex")),
    )
    .append(
      "approved_commit_hex",
      fromHex(stringField(fields, "approved_commit_hex")),
    )
    .append(
      "approved_tree_hex",
      fromHex(stringField(fields, "approved_tree_hex")),
    );
  for (const field of [
    "source_manifest_sha256_hex",
    "supervisor_artifact_sha256_hex",
    "child_artifact_sha256_hex",
    "runtime_closure_sha256_hex",
  ] as const) {
    encoder.append(field, fromHex(stringField(fields, field)));
  }
  encoder
    .append(
      "not_before_unix_seconds",
      unsigned64(numberField(fields, "not_before_unix_seconds")),
    )
    .append(
      "expires_at_unix_seconds",
      unsigned64(numberField(fields, "expires_at_unix_seconds")),
    );
  return encoder.finish();
}

function parseEnrollment(record: GoldenRecord): void {
  const fields = record.fields;
  const cursor = new CanonicalCursor(fromHex(record.canonical_hex));
  assertCommon(cursor, fields);
  expect(cursor.readUInt32()).toBe(numberField(fields, "expected_uid"));
  for (const [field, length] of [
    ["enrollment_id_hex", 32],
    ["approved_commit_hex", 20],
    ["approved_tree_hex", 20],
    ["source_manifest_sha256_hex", 32],
    ["supervisor_artifact_sha256_hex", 32],
    ["child_artifact_sha256_hex", 32],
    ["runtime_closure_sha256_hex", 32],
  ] as const) {
    expect(cursor.read(length).toString("hex")).toBe(
      stringField(fields, field),
    );
  }
  expect(cursor.readUInt64()).toBe(
    numberField(fields, "not_before_unix_seconds"),
  );
  expect(cursor.readUInt64()).toBe(
    numberField(fields, "expires_at_unix_seconds"),
  );
  cursor.assertAtEnd();
}

function authorityEnvelopeSpecs(): readonly AuthorityEnvelopeSpec[] {
  return [
    {
      record: fixture.records.signed_enrollment,
      expectedMagic: "FGV7SEN1",
      innerRecord: fixture.records.enrollment,
      innerField: "enrollment_record_hex",
    },
    {
      record: fixture.records.signed_activation,
      expectedMagic: "FGV7SAC1",
      innerRecord: fixture.records.activation,
      innerField: "activation_record_hex",
    },
  ];
}

function encodeAuthorityEnvelope(spec: AuthorityEnvelopeSpec): Encoded {
  const fields = spec.record.fields;
  const encoder = new CanonicalEncoder();
  encoder
    .append("magic", Buffer.from(stringField(fields, "magic"), "utf8"))
    .append(
      "schema_version",
      unsignedByte(numberField(fields, "schema_version")),
    )
    .append("reserved", unsignedByte(numberField(fields, "reserved")))
    .append("audience", unsignedByte(numberField(fields, "audience")))
    .append(
      "signature_algorithm",
      unsignedByte(numberField(fields, "signature_algorithm")),
    )
    .append(
      "signer_key_id_hex",
      fromHex(stringField(fields, "signer_key_id_hex")),
    )
    .append(
      "record_sha256_hex",
      fromHex(stringField(fields, "record_sha256_hex")),
    )
    .append(spec.innerField, fromHex(stringField(fields, spec.innerField)))
    .append("signature_hex", fromHex(spec.record.signature_hex ?? ""));
  return encoder.finish();
}

function parseAuthorityEnvelope(spec: AuthorityEnvelopeSpec): void {
  const fields = spec.record.fields;
  const cursor = new CanonicalCursor(fromHex(spec.record.canonical_hex));
  expect(cursor.read(8).toString("utf8")).toBe(spec.expectedMagic);
  expect(cursor.readByte()).toBe(1);
  expect(cursor.readByte()).toBe(0);
  expect(cursor.readByte()).toBe(1);
  expect(cursor.readByte()).toBe(1);
  expect(cursor.read(32).toString("hex")).toBe(
    fixture.keys.authority.key_id_hex,
  );
  expect(cursor.read(32).toString("hex")).toBe(spec.innerRecord.sha256);
  expect(
    cursor.read(spec.innerRecord.canonical_byte_count).toString("hex"),
  ).toBe(spec.innerRecord.canonical_hex);
  expect(cursor.read(64).toString("hex")).toBe(spec.record.signature_hex);
  expect(stringField(fields, "record_sha256_hex")).toBe(
    spec.innerRecord.sha256,
  );
  expect(stringField(fields, spec.innerField)).toBe(
    spec.innerRecord.canonical_hex,
  );
  cursor.assertAtEnd();
}

function boundVerifyAuthorityEnvelope(
  spec: AuthorityEnvelopeSpec,
  payload: Buffer,
  signature: Buffer,
  publicKey: KeyObject,
): boolean {
  const recordBytes = payload.subarray(76);
  return (
    payload.subarray(0, 8).equals(Buffer.from(spec.expectedMagic, "utf8")) &&
    payload[8] === 1 &&
    payload[9] === 0 &&
    payload[10] === 1 &&
    payload[11] === 1 &&
    payload
      .subarray(12, 44)
      .equals(fromHex(fixture.keys.authority.key_id_hex)) &&
    payload.subarray(44, 76).equals(digest(recordBytes)) &&
    recordBytes.equals(fromHex(spec.innerRecord.canonical_hex)) &&
    verify(null, payload, publicKey, signature)
  );
}

function encodeActivation(record: GoldenRecord): Encoded {
  const fields = record.fields;
  const encoder = new CanonicalEncoder();
  encoder
    .append("magic", Buffer.from(stringField(fields, "magic"), "utf8"))
    .append(
      "schema_version",
      unsignedByte(numberField(fields, "schema_version")),
    )
    .append("reserved", unsignedByte(numberField(fields, "reserved")))
    .append("audience", unsignedByte(numberField(fields, "audience")))
    .append("action", unsignedByte(numberField(fields, "action")))
    .append("sequence", unsigned64(numberField(fields, "sequence")))
    .append(
      "activation_id_hex",
      fromHex(stringField(fields, "activation_id_hex")),
    )
    .append(
      "target_enrollment_id_hex",
      fromHex(stringField(fields, "target_enrollment_id_hex")),
    )
    .append(
      "previous_activation_digest_hex",
      fromHex(stringField(fields, "previous_activation_digest_hex")),
    )
    .append(
      "issued_at_unix_seconds",
      unsigned64(numberField(fields, "issued_at_unix_seconds")),
    );
  return encoder.finish();
}

function encodeExpectedActivationHead(record: GoldenRecord): Encoded {
  const fields = record.fields;
  const encoder = new CanonicalEncoder();
  appendCommon(encoder, fields);
  encoder
    .append(
      "authority_signer_key_id_hex",
      fromHex(stringField(fields, "authority_signer_key_id_hex")),
    )
    .append(
      "latest_activation_sequence",
      unsigned64(numberField(fields, "latest_activation_sequence")),
    )
    .append(
      "latest_activation_envelope_sha256_hex",
      fromHex(stringField(fields, "latest_activation_envelope_sha256_hex")),
    )
    .append(
      "active_enrollment_envelope_sha256_hex",
      fromHex(stringField(fields, "active_enrollment_envelope_sha256_hex")),
    )
    .append(
      "active_enrollment_record_sha256_hex",
      fromHex(stringField(fields, "active_enrollment_record_sha256_hex")),
    );
  return encoder.finish();
}

function parseActivationRecords(
  activation: GoldenRecord,
  head: GoldenRecord,
): void {
  const activationCursor = new CanonicalCursor(
    fromHex(activation.canonical_hex),
  );
  const activationFields = activation.fields;
  expect(activationCursor.read(8).toString("utf8")).toBe("FGV7ACT1");
  expect(activationCursor.readByte()).toBe(1);
  expect(activationCursor.readByte()).toBe(0);
  expect(activationCursor.readByte()).toBe(1);
  expect(activationCursor.readByte()).toBe(1);
  expect(activationCursor.readUInt64()).toBe(1);
  for (const field of [
    "activation_id_hex",
    "target_enrollment_id_hex",
    "previous_activation_digest_hex",
  ]) {
    expect(activationCursor.read(32).toString("hex")).toBe(
      stringField(activationFields, field),
    );
  }
  expect(activationCursor.readUInt64()).toBe(
    numberField(activationFields, "issued_at_unix_seconds"),
  );
  activationCursor.assertAtEnd();

  const headCursor = new CanonicalCursor(fromHex(head.canonical_hex));
  assertCommon(headCursor, head.fields);
  expect(headCursor.read(32).toString("hex")).toBe(
    fixture.keys.authority.key_id_hex,
  );
  expect(headCursor.readUInt64()).toBe(1);
  for (const field of [
    "latest_activation_envelope_sha256_hex",
    "active_enrollment_envelope_sha256_hex",
    "active_enrollment_record_sha256_hex",
  ]) {
    expect(headCursor.read(32).toString("hex")).toBe(
      stringField(head.fields, field),
    );
  }
  headCursor.assertAtEnd();
}

function appendSignedHeader(
  encoder: CanonicalEncoder,
  fields: Readonly<Record<string, unknown>>,
): void {
  appendCommon(encoder, fields);
  encoder.append(
    "signature_algorithm",
    unsignedByte(numberField(fields, "signature_algorithm")),
  );
}

function encodeSigned(spec: SignedSpec): Encoded {
  const { record } = spec;
  const fields = record.fields;
  const encoder = new CanonicalEncoder();
  appendSignedHeader(encoder, fields);
  for (const field of spec.hexFields) {
    encoder.append(field, fromHex(stringField(fields, field)));
  }
  for (const field of spec.uint32Fields) {
    encoder.append(field, unsigned32(numberField(fields, field)));
  }
  for (const field of spec.uint64Fields) {
    encoder.append(field, unsigned64(numberField(fields, field)));
  }
  encoder.append("signature_hex", fromHex(record.signature_hex ?? ""));
  return encoder.finish();
}

function signedSpecs(): readonly SignedSpec[] {
  return [
    {
      record: fixture.records.supervisor_challenge,
      expectedMagic: "FGV7SCH1",
      expectedRole: "supervisor",
      hexFields: [
        "challenge_id_hex",
        "nonce_hex",
        "enrollment_id_hex",
        "activation_digest_hex",
        "activation_head_sha256_hex",
        "source_manifest_sha256_hex",
        "target_process_identity_sha256_hex",
        "supervisor_process_identity_sha256_hex",
        "verifier_anonymous_fd_channel_binding_sha256_hex",
        "signer_key_id_hex",
      ],
      uint32Fields: ["target_process_id", "expected_uid"],
      uint64Fields: [
        "issued_at_unix_seconds",
        "expires_at_unix_seconds",
        "monotonic_issued_at_nanoseconds",
        "monotonic_expires_at_nanoseconds",
      ],
    },
    {
      record: fixture.records.verifier_receipt,
      expectedMagic: "FGV7VRC1",
      expectedRole: "verifier",
      hexFields: [
        "receipt_id_hex",
        "challenge_sha256_hex",
        "enrollment_id_hex",
        "activation_digest_hex",
        "source_manifest_sha256_hex",
        "repository_observation_sha256_hex",
        "approved_commit_hex",
        "approved_tree_hex",
        "target_process_identity_sha256_hex",
        "verifier_artifact_sha256_hex",
        "verifier_process_identity_sha256_hex",
        "signer_key_id_hex",
      ],
      uint32Fields: ["target_process_id", "expected_uid"],
      uint64Fields: ["issued_at_unix_seconds", "expires_at_unix_seconds"],
    },
    {
      record: fixture.records.one_shot_attestation,
      expectedMagic: "FGV7OSA1",
      expectedRole: "supervisor",
      hexFields: [
        "attestation_id_hex",
        "challenge_sha256_hex",
        "receipt_sha256_hex",
        "enrollment_id_hex",
        "activation_digest_hex",
        "source_manifest_sha256_hex",
        "approved_commit_hex",
        "approved_tree_hex",
        "child_process_identity_sha256_hex",
        "supervisor_process_identity_sha256_hex",
        "nonce_hex",
        "signer_key_id_hex",
      ],
      uint32Fields: ["child_process_id", "expected_uid"],
      uint64Fields: ["issued_at_unix_seconds", "expires_at_unix_seconds"],
    },
  ] as const;
}

function deriveKey(key: GoldenKey): DerivedKey {
  const seed = fromHex(key.seed_hex);
  const privateKey = createPrivateKey({
    key: Buffer.concat([PKCS8_ED25519_SEED_PREFIX, seed]),
    format: "der",
    type: "pkcs8",
  });
  const publicKey = createPublicKey(
    privateKey.export({ format: "pem", type: "pkcs8" }),
  );
  const publicKeyDer = publicKey.export({ format: "der", type: "spki" });
  if (!Buffer.isBuffer(publicKeyDer)) {
    throw new Error("Ed25519 SPKI export was not a Buffer");
  }
  return Object.freeze({
    privateKey,
    publicKey,
    publicKeyBytes: publicKeyDer.subarray(-32),
  });
}

function publicKeyFromRaw(raw: Buffer): KeyObject {
  return createPublicKey({
    key: Buffer.concat([SPKI_ED25519_PUBLIC_KEY_PREFIX, raw]),
    format: "der",
    type: "spki",
  });
}

function signaturePayload(record: GoldenRecord): Buffer {
  if (
    record.signature_payload_hex === undefined ||
    record.signature_payload_byte_count === undefined
  ) {
    throw new Error("signed fixture is missing its payload");
  }
  const payload = fromHex(record.signature_payload_hex);
  expect(payload).toHaveLength(record.signature_payload_byte_count);
  expect(record.canonical_hex).toBe(
    `${record.signature_payload_hex}${record.signature_hex}`,
  );
  return payload;
}

function boundVerify(
  spec: SignedSpec,
  payload: Buffer,
  signature: Buffer,
  publicKey: KeyObject,
): boolean {
  const offsets = spec.record.offsets as FlatOffsets;
  const signerOffset = offsets.signer_key_id_hex;
  return (
    payload.subarray(0, 8).equals(Buffer.from(spec.expectedMagic, "utf8")) &&
    payload[8] === 1 &&
    payload[9] === 0 &&
    payload[10] === 1 &&
    payload[11] === 1 &&
    payload[12] === 1 &&
    payload
      .subarray(signerOffset[0], signerOffset[0] + signerOffset[1])
      .equals(fromHex(fixture.keys[spec.expectedRole].key_id_hex)) &&
    verify(null, payload, publicKey, signature)
  );
}

describe("Floodgate v7 external trust-root cross-parser golden fixture", () => {
  it("derives the three fixed Ed25519 public keys and key IDs with Node standard crypto", () => {
    expect(fixture).toMatchObject({
      schema: "shogi-floodgate-v7-external-trust-root-canonical-golden-v1",
      status:
        "synthetic-test-only-cross-parser-fixture-not-operational-evidence",
      scope: {
        wire_level: "synthetic-valid-canonical-records-and-Ed25519-signatures",
        excluded_evidence:
          "not-live-process-observation-and-not-full-operational-transcript",
        authority_binding_domain_utf8: "FGV7GOLDENMANIFESTAUTHORITYV1",
        manifest_authority_binding:
          "manifest_id=SHA-256(authority_binding_domain_utf8||authority_key_id)",
      },
      encoding: {
        byte_order: "big-endian",
        hex: "lowercase",
        signature_algorithm: "Ed25519",
        signature_generation: "node-deterministic-fixture",
        swift_cryptokit: "verify-exact-bytes-but-resigning-is-randomized",
      },
    });
    const publicKeys = new Set<string>();
    const keyIDs = new Set<string>();
    for (const role of ["authority", "supervisor", "verifier"] as const) {
      const golden = fixture.keys[role];
      const derived = deriveKey(golden);
      expect(derived.publicKeyBytes.toString("hex")).toBe(
        golden.public_key_hex,
      );
      expect(sha256(derived.publicKeyBytes)).toBe(golden.key_id_hex);
      const imported = publicKeyFromRaw(derived.publicKeyBytes).export({
        format: "der",
        type: "spki",
      });
      expect(Buffer.isBuffer(imported)).toBe(true);
      publicKeys.add(golden.public_key_hex);
      keyIDs.add(golden.key_id_hex);
    }
    expect(publicKeys.size).toBe(3);
    expect(keyIDs.size).toBe(3);
  });

  it("independently encodes and parses all five runtime launch preimage records at exact offsets", () => {
    const records = fixture.records;
    const argv = encodeFixedArgv(records.fixed_argv);
    const cwd = encodeFixedCwd(records.fixed_cwd);
    const environment = encodeFixedEnvironment(records.fixed_env);
    const install = encodeRuntimeInstall(records.runtime_install);
    const launch = encodeRuntimeLaunch(records.runtime_launch_policy);

    assertGolden(records.fixed_argv, argv);
    assertGolden(records.fixed_cwd, cwd);
    assertGolden(records.fixed_env, environment);
    assertGolden(records.runtime_install, install, false);
    assertGolden(records.runtime_launch_policy, launch);
    assertRuntimeInstallOffsets(records.runtime_install);

    parseFixedArgv(records.fixed_argv);
    parseSingleStringOrEmptyRecord(records.fixed_cwd, "working_directory");
    parseSingleStringOrEmptyRecord(records.fixed_env, "entries");
    parseRuntimeInstall(records.runtime_install);
    parseRuntimeLaunch(records.runtime_launch_policy);

    expect(
      stringField(
        records.runtime_launch_policy.fields,
        "fixed_argv_sha256_hex",
      ),
    ).toBe(records.fixed_argv.sha256);
    expect(
      stringField(
        records.runtime_launch_policy.fields,
        "fixed_working_directory_sha256_hex",
      ),
    ).toBe(records.fixed_cwd.sha256);
    expect(
      stringField(
        records.runtime_launch_policy.fields,
        "fixed_environment_sha256_hex",
      ),
    ).toBe(records.fixed_env.sha256);
    expect(
      stringField(
        records.runtime_launch_policy.fields,
        "runtime_install_policy_sha256_hex",
      ),
    ).toBe(records.runtime_install.sha256);
  });

  it("independently encodes and parses the manifest and enrollment with the real runtime closure", () => {
    const records = fixture.records;
    const manifest = records.repository_source_manifest;
    const enrollment = records.enrollment;
    assertGolden(manifest, encodeRepositorySourceManifest(manifest));
    assertGolden(enrollment, encodeEnrollment(enrollment));
    parseRepositorySourceManifest(manifest);
    parseEnrollment(enrollment);

    const manifestFields = manifest.fields;
    const enrollmentFields = enrollment.fields;
    const installFields = records.runtime_install.fields;
    const launchFields = records.runtime_launch_policy.fields;
    expect(
      sha256(
        Buffer.concat([
          Buffer.from(fixture.scope.authority_binding_domain_utf8, "utf8"),
          fromHex(fixture.keys.authority.key_id_hex),
        ]),
      ),
    ).toBe(stringField(manifestFields, "manifest_id_hex"));
    expect(
      stringField(manifestFields, "runtime_launch_policy_sha256_hex"),
    ).toBe(records.runtime_launch_policy.sha256);
    expect(stringField(manifestFields, "pinned_node_runtime_sha256_hex")).toBe(
      stringField(installFields, "node_whole_file_sha256_hex"),
    );
    expect(stringField(manifestFields, "diagnostic_bundle_sha256_hex")).toBe(
      stringField(
        installFields,
        "diagnostic_entry_bundle_whole_file_sha256_hex",
      ),
    );
    expect(stringField(manifestFields, "diagnostic_bundle_sha256_hex")).toBe(
      stringField(launchFields, "diagnostic_entry_bundle_sha256_hex"),
    );
    for (const [manifestField, installField] of [
      [
        "pinned_node_code_directory_sha256_hex",
        "node_code_directory_sha256_hex",
      ],
      [
        "pinned_node_designated_requirement_sha256_hex",
        "node_designated_requirement_sha256_hex",
      ],
      [
        "pinned_node_held_executable_identity_sha256_hex",
        "node_held_executable_identity_sha256_hex",
      ],
    ] as const) {
      expect(stringField(manifestFields, manifestField)).toBe(
        stringField(installFields, installField),
      );
    }
    expect(
      stringField(manifestFields, "install_policy_record_sha256_hex"),
    ).toBe(records.runtime_install.sha256);
    expect(
      stringField(manifestFields, "supervisor_attestation_key_id_hex"),
    ).toBe(fixture.keys.supervisor.key_id_hex);
    expect(stringField(manifestFields, "verifier_attestation_key_id_hex")).toBe(
      fixture.keys.verifier.key_id_hex,
    );

    expect(stringField(enrollmentFields, "source_manifest_sha256_hex")).toBe(
      manifest.sha256,
    );
    for (const [enrollmentField, manifestField] of [
      ["approved_commit_hex", "approved_commit_hex"],
      ["approved_tree_hex", "approved_tree_hex"],
      ["supervisor_artifact_sha256_hex", "supervisor_artifact_sha256_hex"],
      ["child_artifact_sha256_hex", "diagnostic_bundle_sha256_hex"],
      ["runtime_closure_sha256_hex", "pinned_node_runtime_sha256_hex"],
    ] as const) {
      expect(stringField(enrollmentFields, enrollmentField)).toBe(
        stringField(manifestFields, manifestField),
      );
    }
    expect(fixture.links).toMatchObject({
      manifest_runtime_launch_policy_sha256:
        records.runtime_launch_policy.sha256,
      manifest_pinned_node_runtime_sha256: stringField(
        installFields,
        "node_whole_file_sha256_hex",
      ),
      manifest_diagnostic_bundle_sha256: stringField(
        installFields,
        "diagnostic_entry_bundle_whole_file_sha256_hex",
      ),
      manifest_authority_key_id: fixture.keys.authority.key_id_hex,
      manifest_supervisor_key_id: fixture.keys.supervisor.key_id_hex,
      manifest_verifier_key_id: fixture.keys.verifier.key_id_hex,
      enrollment_source_manifest_sha256: manifest.sha256,
    });
  });

  it("verifies authority envelopes and binds the authenticated activation head", () => {
    const derived = Object.fromEntries(
      (["authority", "supervisor", "verifier"] as const).map((role) => [
        role,
        deriveKey(fixture.keys[role]),
      ]),
    ) as Record<Role, DerivedKey>;
    const specs = authorityEnvelopeSpecs();

    for (const spec of specs) {
      const encoded = encodeAuthorityEnvelope(spec);
      assertGolden(spec.record, encoded);
      parseAuthorityEnvelope(spec);
      const payload = signaturePayload(spec.record);
      const signature = fromHex(spec.record.signature_hex ?? "");
      expect(sign(null, payload, derived.authority.privateKey)).toEqual(
        signature,
      );
      expect(
        boundVerifyAuthorityEnvelope(
          spec,
          payload,
          signature,
          derived.authority.publicKey,
        ),
      ).toBe(true);
      for (const wrongRole of ["supervisor", "verifier"] as const) {
        expect(
          boundVerifyAuthorityEnvelope(
            spec,
            payload,
            signature,
            derived[wrongRole].publicKey,
          ),
        ).toBe(false);
      }

      const changedSignature = Buffer.from(signature);
      changedSignature[changedSignature.length - 1] ^= 1;
      expect(
        boundVerifyAuthorityEnvelope(
          spec,
          payload,
          changedSignature,
          derived.authority.publicKey,
        ),
      ).toBe(false);

      const changedRecord = Buffer.from(payload);
      changedRecord[changedRecord.length - 1] ^= 1;
      digest(changedRecord.subarray(76)).copy(changedRecord, 44);
      const changedRecordSignature = sign(
        null,
        changedRecord,
        derived.authority.privateKey,
      );
      expect(
        verify(
          null,
          changedRecord,
          derived.authority.publicKey,
          changedRecordSignature,
        ),
      ).toBe(true);
      expect(
        boundVerifyAuthorityEnvelope(
          spec,
          changedRecord,
          changedRecordSignature,
          derived.authority.publicKey,
        ),
      ).toBe(false);

      const wrongDomain = Buffer.from(payload);
      Buffer.from(
        spec.expectedMagic === "FGV7SEN1" ? "FGV7SAC1" : "FGV7SEN1",
        "utf8",
      ).copy(wrongDomain, 0);
      const wrongDomainSignature = sign(
        null,
        wrongDomain,
        derived.authority.privateKey,
      );
      expect(
        boundVerifyAuthorityEnvelope(
          spec,
          wrongDomain,
          wrongDomainSignature,
          derived.authority.publicKey,
        ),
      ).toBe(false);

      const roleSwapped = Buffer.from(payload);
      fromHex(fixture.keys.supervisor.key_id_hex).copy(roleSwapped, 12);
      const roleSwappedSignature = sign(
        null,
        roleSwapped,
        derived.supervisor.privateKey,
      );
      expect(
        verify(
          null,
          roleSwapped,
          derived.supervisor.publicKey,
          roleSwappedSignature,
        ),
      ).toBe(true);
      expect(
        boundVerifyAuthorityEnvelope(
          spec,
          roleSwapped,
          roleSwappedSignature,
          derived.supervisor.publicKey,
        ),
      ).toBe(false);
    }

    const activation = fixture.records.activation;
    const head = fixture.records.expected_activation_head;
    assertGolden(activation, encodeActivation(activation));
    assertGolden(head, encodeExpectedActivationHead(head));
    parseActivationRecords(activation, head);

    expect(stringField(head.fields, "authority_signer_key_id_hex")).toBe(
      fixture.keys.authority.key_id_hex,
    );
    expect(
      stringField(head.fields, "latest_activation_envelope_sha256_hex"),
    ).toBe(fixture.records.signed_activation.sha256);
    expect(
      stringField(head.fields, "active_enrollment_envelope_sha256_hex"),
    ).toBe(fixture.records.signed_enrollment.sha256);
    expect(
      stringField(head.fields, "active_enrollment_record_sha256_hex"),
    ).toBe(fixture.records.enrollment.sha256);
    expect(stringField(activation.fields, "target_enrollment_id_hex")).toBe(
      stringField(fixture.records.enrollment.fields, "enrollment_id_hex"),
    );
    expect(
      stringField(
        fixture.records.supervisor_challenge.fields,
        "activation_digest_hex",
      ),
    ).toBe(fixture.records.signed_activation.sha256);
    expect(
      stringField(
        fixture.records.supervisor_challenge.fields,
        "activation_head_sha256_hex",
      ),
    ).toBe(head.sha256);
    expect(
      stringField(
        fixture.records.supervisor_challenge.fields,
        "source_manifest_sha256_hex",
      ),
    ).toBe(fixture.records.repository_source_manifest.sha256);
    expect(fixture.links).toMatchObject({
      signed_enrollment_record_sha256: fixture.records.enrollment.sha256,
      signed_activation_record_sha256: activation.sha256,
      expected_head_latest_activation_sha256:
        fixture.records.signed_activation.sha256,
      expected_head_active_enrollment_envelope_sha256:
        fixture.records.signed_enrollment.sha256,
      expected_head_active_enrollment_record_sha256:
        fixture.records.enrollment.sha256,
      challenge_activation_sha256: fixture.records.signed_activation.sha256,
      challenge_activation_head_sha256: head.sha256,
      challenge_source_manifest_sha256:
        fixture.records.repository_source_manifest.sha256,
    });
  });

  it("verifies exact Ed25519 payloads, canonical hashes, roles, and chained digests", () => {
    const derived = Object.fromEntries(
      (["authority", "supervisor", "verifier"] as const).map((role) => [
        role,
        deriveKey(fixture.keys[role]),
      ]),
    ) as Record<Role, DerivedKey>;

    for (const spec of signedSpecs()) {
      const encoded = encodeSigned(spec);
      assertGolden(spec.record, encoded);
      const payload = signaturePayload(spec.record);
      const signature = fromHex(spec.record.signature_hex ?? "");
      expect(encoded.bytes.subarray(0, payload.length)).toEqual(payload);
      expect(encoded.bytes.subarray(payload.length)).toEqual(signature);
      expect(
        sign(null, payload, derived[spec.expectedRole].privateKey),
      ).toEqual(signature);
      expect(
        boundVerify(
          spec,
          payload,
          signature,
          derived[spec.expectedRole].publicKey,
        ),
      ).toBe(true);
      for (const wrongRole of [
        "authority",
        "supervisor",
        "verifier",
      ] as const) {
        if (wrongRole === spec.expectedRole) continue;
        expect(
          boundVerify(spec, payload, signature, derived[wrongRole].publicKey),
        ).toBe(false);
      }
    }

    const { supervisor_challenge: challenge, verifier_receipt: receipt } =
      fixture.records;
    const attestation = fixture.records.one_shot_attestation;
    expect(stringField(receipt.fields, "challenge_sha256_hex")).toBe(
      challenge.sha256,
    );
    expect(stringField(attestation.fields, "challenge_sha256_hex")).toBe(
      challenge.sha256,
    );
    expect(stringField(attestation.fields, "receipt_sha256_hex")).toBe(
      receipt.sha256,
    );
    for (const record of [challenge, receipt, attestation]) {
      expect(stringField(record.fields, "enrollment_id_hex")).toBe(
        stringField(fixture.records.enrollment.fields, "enrollment_id_hex"),
      );
      expect(stringField(record.fields, "activation_digest_hex")).toBe(
        fixture.records.signed_activation.sha256,
      );
      expect(stringField(record.fields, "source_manifest_sha256_hex")).toBe(
        fixture.records.repository_source_manifest.sha256,
      );
    }
    expect(stringField(receipt.fields, "approved_commit_hex")).toBe(
      stringField(
        fixture.records.repository_source_manifest.fields,
        "approved_commit_hex",
      ),
    );
    expect(stringField(receipt.fields, "approved_tree_hex")).toBe(
      stringField(
        fixture.records.repository_source_manifest.fields,
        "approved_tree_hex",
      ),
    );
    expect(stringField(receipt.fields, "verifier_artifact_sha256_hex")).toBe(
      stringField(
        fixture.records.repository_source_manifest.fields,
        "verifier_artifact_sha256_hex",
      ),
    );
    expect(fixture.links).toMatchObject({
      receipt_challenge_sha256: challenge.sha256,
      receipt_activation_sha256: fixture.records.signed_activation.sha256,
      receipt_source_manifest_sha256:
        fixture.records.repository_source_manifest.sha256,
      attestation_challenge_sha256: challenge.sha256,
      attestation_receipt_sha256: receipt.sha256,
      attestation_activation_sha256: fixture.records.signed_activation.sha256,
      attestation_source_manifest_sha256:
        fixture.records.repository_source_manifest.sha256,
    });
  });

  it("rejects cryptographically re-signed role swaps and domain mutations", () => {
    const derived = Object.fromEntries(
      (["authority", "supervisor", "verifier"] as const).map((role) => [
        role,
        deriveKey(fixture.keys[role]),
      ]),
    ) as Record<Role, DerivedKey>;
    const specs = signedSpecs();

    for (const [index, spec] of specs.entries()) {
      const payload = signaturePayload(spec.record);
      const expectedKey = derived[spec.expectedRole];
      const originalSignature = fromHex(spec.record.signature_hex ?? "");

      const changedSignature = Buffer.from(originalSignature);
      changedSignature[changedSignature.length - 1] ^= 1;
      expect(
        boundVerify(spec, payload, changedSignature, expectedKey.publicKey),
      ).toBe(false);

      const domainChanged = Buffer.from(payload);
      Buffer.from(specs[(index + 1) % specs.length].expectedMagic, "utf8").copy(
        domainChanged,
        0,
      );
      const domainSignature = sign(null, domainChanged, expectedKey.privateKey);
      expect(
        verify(null, domainChanged, expectedKey.publicKey, domainSignature),
      ).toBe(true);
      expect(
        boundVerify(
          spec,
          domainChanged,
          domainSignature,
          expectedKey.publicKey,
        ),
      ).toBe(false);

      for (const offset of [10, 11, 12]) {
        const headerChanged = Buffer.from(payload);
        headerChanged[offset] ^= 1;
        const headerSignature = sign(
          null,
          headerChanged,
          expectedKey.privateKey,
        );
        expect(
          verify(null, headerChanged, expectedKey.publicKey, headerSignature),
        ).toBe(true);
        expect(
          boundVerify(
            spec,
            headerChanged,
            headerSignature,
            expectedKey.publicKey,
          ),
        ).toBe(false);
      }

      const wrongRole: Role =
        spec.expectedRole === "supervisor" ? "verifier" : "supervisor";
      const roleChanged = Buffer.from(payload);
      const signerOffset = (spec.record.offsets as FlatOffsets)
        .signer_key_id_hex;
      fromHex(fixture.keys[wrongRole].key_id_hex).copy(
        roleChanged,
        signerOffset[0],
      );
      const roleSignature = sign(
        null,
        roleChanged,
        derived[wrongRole].privateKey,
      );
      expect(
        verify(null, roleChanged, derived[wrongRole].publicKey, roleSignature),
      ).toBe(true);
      expect(
        boundVerify(
          spec,
          roleChanged,
          roleSignature,
          derived[wrongRole].publicKey,
        ),
      ).toBe(false);
    }

    const changedChallenge = Buffer.from(
      fixture.records.supervisor_challenge.canonical_hex,
      "hex",
    );
    changedChallenge[13] ^= 1;
    expect(sha256(changedChallenge)).not.toBe(
      fixture.records.verifier_receipt.fields.challenge_sha256_hex,
    );
    const changedReceipt = Buffer.from(
      fixture.records.verifier_receipt.canonical_hex,
      "hex",
    );
    changedReceipt[13] ^= 1;
    expect(sha256(changedReceipt)).not.toBe(
      fixture.records.one_shot_attestation.fields.receipt_sha256_hex,
    );
  });
});
