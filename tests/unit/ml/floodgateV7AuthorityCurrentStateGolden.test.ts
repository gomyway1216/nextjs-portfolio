import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

type Offset = readonly [offset: number, length: number];
type Offsets = Readonly<Record<string, Offset>>;

interface GoldenRecord {
  readonly swift_type: string;
  readonly canonical_byte_count: number;
  readonly fields: Readonly<Record<string, unknown>>;
  readonly offsets: Offsets;
  readonly expected_activation_head_offsets?: Offsets;
  readonly canonical_hex: string;
  readonly sha256: string;
}

interface GoldenFixture {
  readonly schema: string;
  readonly status: string;
  readonly encoding: Readonly<Record<string, string>>;
  readonly state_root: string;
  readonly source_fixture: Readonly<Record<string, string>>;
  readonly journal_id_derivation: Readonly<{
    readonly algorithm: string;
    readonly domain: string;
    readonly journal_id_hex: string;
    readonly operational_identifier: boolean;
  }>;
  readonly records: Readonly<{
    readonly authority_public_key: GoldenRecord;
    readonly activation_head_journal_header: GoldenRecord;
    readonly activation_head_journal_entry_1: GoldenRecord;
  }>;
  readonly links: Readonly<Record<string, string>>;
  readonly nonclaims: Readonly<Record<string, boolean>>;
}

interface SourceFixture {
  readonly keys: Readonly<{
    readonly authority: Readonly<{
      readonly public_key_hex: string;
      readonly key_id_hex: string;
    }>;
  }>;
  readonly records: Readonly<{
    readonly expected_activation_head: Readonly<{
      readonly canonical_byte_count: number;
      readonly canonical_hex: string;
      readonly sha256: string;
    }>;
  }>;
}

interface ParsedAuthorityKey {
  readonly rawPublicKey: Buffer;
  readonly keyID: Buffer;
}

interface ParsedExpectedHead {
  readonly authoritySignerKeyID: Buffer;
  readonly latestActivationSequence: bigint;
}

interface ParsedJournalHeader {
  readonly entryByteCount: number;
  readonly journalID: Buffer;
  readonly authoritySignerKeyID: Buffer;
  readonly authorityPublicKeyRecordSHA256: Buffer;
}

interface ParsedJournalEntry {
  readonly journalSequence: bigint;
  readonly previousJournalRecordSHA256: Buffer;
  readonly expectedActivationHead: Buffer;
  readonly parsedExpectedActivationHead: ParsedExpectedHead;
}

const repositoryRoot = path.resolve(__dirname, "../../..");
const fixturePath = path.join(
  repositoryRoot,
  "tests/fixtures/floodgate-v7-authority-current-state-golden-v1.json",
);
const fixture = JSON.parse(
  fs.readFileSync(fixturePath, "utf8"),
) as GoldenFixture;
const sourceFixturePath = path.join(
  repositoryRoot,
  fixture.source_fixture.path,
);
const sourceFixture = JSON.parse(
  fs.readFileSync(sourceFixturePath, "utf8"),
) as SourceFixture;

const LOWER_HEX = /^(?:[0-9a-f]{2})+$/u;
const FIXED_DOMAIN = Buffer.from([1, 0, 1, 1]);

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

function textField(
  fields: Readonly<Record<string, unknown>>,
  name: string,
): string {
  const value = fields[name];
  if (typeof value !== "string") {
    throw new Error(`${name} must be a string`);
  }
  return value;
}

function numberField(
  fields: Readonly<Record<string, unknown>>,
  name: string,
): number {
  const value = fields[name];
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error(`${name} must be a nonnegative safe integer`);
  }
  return value as number;
}

function byte(value: number): Buffer {
  if (!Number.isInteger(value) || value < 0 || value > 0xff) {
    throw new Error("value is not UInt8");
  }
  return Buffer.from([value]);
}

function uint32(value: number): Buffer {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff_ffff) {
    throw new Error("value is not UInt32");
  }
  const encoded = Buffer.alloc(4);
  encoded.writeUInt32BE(value);
  return encoded;
}

function uint64(value: number): Buffer {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("fixture UInt64 must be a nonnegative safe integer");
  }
  const encoded = Buffer.alloc(8);
  encoded.writeBigUInt64BE(BigInt(value));
  return encoded;
}

function fixedPrefix(fields: Readonly<Record<string, unknown>>): Buffer {
  return Buffer.concat([
    Buffer.from(textField(fields, "magic"), "utf8"),
    byte(numberField(fields, "schema_version")),
    byte(numberField(fields, "reserved")),
    byte(numberField(fields, "audience")),
    byte(numberField(fields, "purpose")),
  ]);
}

function encodeAuthorityKey(record: GoldenRecord): Buffer {
  return Buffer.concat([
    fixedPrefix(record.fields),
    fromHex(textField(record.fields, "authority_public_key_raw_hex")),
    fromHex(textField(record.fields, "authority_signer_key_id_hex")),
  ]);
}

function encodeJournalHeader(record: GoldenRecord): Buffer {
  return Buffer.concat([
    fixedPrefix(record.fields),
    uint32(numberField(record.fields, "entry_byte_count")),
    fromHex(textField(record.fields, "journal_id_hex")),
    fromHex(textField(record.fields, "authority_signer_key_id_hex")),
    fromHex(textField(record.fields, "authority_public_key_record_sha256_hex")),
  ]);
}

function encodeJournalEntry(record: GoldenRecord): Buffer {
  return Buffer.concat([
    fixedPrefix(record.fields),
    uint64(numberField(record.fields, "journal_sequence")),
    fromHex(textField(record.fields, "previous_journal_record_sha256_hex")),
    fromHex(textField(record.fields, "expected_activation_head_hex")),
  ]);
}

function assertExactOffsets(
  record: GoldenRecord,
  expectedOffsets: Offsets,
  expectedBytes: Readonly<Record<string, Buffer>>,
): void {
  expect(record.offsets).toEqual(expectedOffsets);
  const canonical = fromHex(record.canonical_hex);
  for (const [field, [offset, length]] of Object.entries(record.offsets)) {
    expect(
      canonical.subarray(offset, offset + length),
      `${record.swift_type}.${field}`,
    ).toEqual(expectedBytes[field]);
  }
  const ordered = Object.values(record.offsets);
  for (let index = 1; index < ordered.length; index += 1) {
    expect(ordered[index][0]).toBe(
      ordered[index - 1][0] + ordered[index - 1][1],
    );
  }
  const lastOffset = ordered.at(-1);
  if (lastOffset === undefined) {
    throw new Error(`${record.swift_type} has no canonical offsets`);
  }
  expect(lastOffset[0] + lastOffset[1]).toBe(record.canonical_byte_count);
}

class CanonicalReader {
  private offset = 0;

  public constructor(private readonly bytes: Buffer) {}

  public read(length: number): Buffer {
    if (
      !Number.isInteger(length) ||
      length < 0 ||
      this.offset + length > this.bytes.length
    ) {
      throw new Error("invalid canonical record");
    }
    const result = this.bytes.subarray(this.offset, this.offset + length);
    this.offset += length;
    return result;
  }

  public readByte(): number {
    return this.read(1)[0];
  }

  public readUInt32(): number {
    return this.read(4).readUInt32BE(0);
  }

  public readUInt64(): bigint {
    return this.read(8).readBigUInt64BE(0);
  }

  public finish(): void {
    if (this.offset !== this.bytes.length) {
      throw new Error("invalid canonical record");
    }
  }
}

function requireExact(value: Buffer, expected: Buffer): void {
  if (!value.equals(expected)) {
    throw new Error("invalid canonical record");
  }
}

function requireNonzero(value: Buffer): void {
  if (value.every((octet) => octet === 0)) {
    throw new Error("invalid canonical record");
  }
}

function parseFixedDomain(reader: CanonicalReader, magic: string): void {
  requireExact(reader.read(8), Buffer.from(magic, "utf8"));
  requireExact(reader.read(4), FIXED_DOMAIN);
}

function parseAuthorityKey(bytes: Buffer): ParsedAuthorityKey {
  if (bytes.length !== 76) throw new Error("invalid canonical record");
  const reader = new CanonicalReader(bytes);
  parseFixedDomain(reader, "FGV7APK1");
  const rawPublicKey = reader.read(32);
  const keyID = reader.read(32);
  reader.finish();
  requireNonzero(rawPublicKey);
  requireExact(digest(rawPublicKey), keyID);
  return { rawPublicKey, keyID };
}

function parseExpectedActivationHead(bytes: Buffer): ParsedExpectedHead {
  if (bytes.length !== 148) throw new Error("invalid canonical record");
  const reader = new CanonicalReader(bytes);
  parseFixedDomain(reader, "FGV7EAH1");
  const authoritySignerKeyID = reader.read(32);
  const latestActivationSequence = reader.readUInt64();
  const latestActivationEnvelopeSHA256 = reader.read(32);
  const activeEnrollmentEnvelopeSHA256 = reader.read(32);
  const activeEnrollmentRecordSHA256 = reader.read(32);
  reader.finish();
  requireNonzero(authoritySignerKeyID);
  requireNonzero(latestActivationEnvelopeSHA256);
  requireNonzero(activeEnrollmentEnvelopeSHA256);
  requireNonzero(activeEnrollmentRecordSHA256);
  if (latestActivationSequence === 0n) {
    throw new Error("invalid canonical record");
  }
  return { authoritySignerKeyID, latestActivationSequence };
}

function parseJournalHeader(
  bytes: Buffer,
  authorityKeyBytes: Buffer,
): ParsedJournalHeader {
  if (bytes.length !== 112) throw new Error("invalid canonical record");
  const authorityKey = parseAuthorityKey(authorityKeyBytes);
  const reader = new CanonicalReader(bytes);
  parseFixedDomain(reader, "FGV7AJH1");
  const entryByteCount = reader.readUInt32();
  const journalID = reader.read(32);
  const authoritySignerKeyID = reader.read(32);
  const authorityPublicKeyRecordSHA256 = reader.read(32);
  reader.finish();
  if (entryByteCount !== 200) throw new Error("invalid canonical record");
  requireNonzero(journalID);
  requireExact(authoritySignerKeyID, authorityKey.keyID);
  requireExact(authorityPublicKeyRecordSHA256, digest(authorityKeyBytes));
  return {
    entryByteCount,
    journalID,
    authoritySignerKeyID,
    authorityPublicKeyRecordSHA256,
  };
}

function parseJournalEntry(
  bytes: Buffer,
  headerBytes: Buffer,
  authorityKeyBytes: Buffer,
): ParsedJournalEntry {
  if (bytes.length !== 200) throw new Error("invalid canonical record");
  const header = parseJournalHeader(headerBytes, authorityKeyBytes);
  if (bytes.length !== header.entryByteCount) {
    throw new Error("invalid canonical record");
  }
  const reader = new CanonicalReader(bytes);
  parseFixedDomain(reader, "FGV7AJE1");
  const journalSequence = reader.readUInt64();
  const previousJournalRecordSHA256 = reader.read(32);
  const expectedActivationHead = reader.read(148);
  reader.finish();
  if (journalSequence === 0n) throw new Error("invalid canonical record");
  requireExact(previousJournalRecordSHA256, digest(headerBytes));
  const parsedExpectedActivationHead = parseExpectedActivationHead(
    expectedActivationHead,
  );
  if (
    journalSequence !== parsedExpectedActivationHead.latestActivationSequence
  ) {
    throw new Error("invalid canonical record");
  }
  requireExact(
    parsedExpectedActivationHead.authoritySignerKeyID,
    header.authoritySignerKeyID,
  );
  return {
    journalSequence,
    previousJournalRecordSHA256,
    expectedActivationHead,
    parsedExpectedActivationHead,
  };
}

function requireGoldenBytes(actual: Buffer, record: GoldenRecord): void {
  const reconstructed =
    record.swift_type === "AuthorityPublicKeyRecordV1"
      ? encodeAuthorityKey(record)
      : record.swift_type === "ActivationHeadJournalHeaderV1"
        ? encodeJournalHeader(record)
        : encodeJournalEntry(record);
  requireExact(actual, reconstructed);
  if (
    actual.length !== record.canonical_byte_count ||
    actual.toString("hex") !== record.canonical_hex ||
    sha256(actual) !== record.sha256
  ) {
    throw new Error("golden fixture drift");
  }
}

function validateGoldenTranscript(
  authorityKeyBytes: Buffer,
  headerBytes: Buffer,
  entryBytes: Buffer,
): void {
  parseAuthorityKey(authorityKeyBytes);
  parseJournalHeader(headerBytes, authorityKeyBytes);
  parseJournalEntry(entryBytes, headerBytes, authorityKeyBytes);
  requireGoldenBytes(authorityKeyBytes, fixture.records.authority_public_key);
  requireGoldenBytes(
    headerBytes,
    fixture.records.activation_head_journal_header,
  );
  requireGoldenBytes(
    entryBytes,
    fixture.records.activation_head_journal_entry_1,
  );
  requireExact(
    digest(Buffer.from(fixture.journal_id_derivation.domain, "utf8")),
    fromHex(fixture.journal_id_derivation.journal_id_hex),
  );
}

function mutate(bytes: Buffer, offset: number): Buffer {
  const result = Buffer.from(bytes);
  result[offset] ^= 0x01;
  return result;
}

function zeroRange(bytes: Buffer, offset: number, length: number): Buffer {
  const result = Buffer.from(bytes);
  result.fill(0, offset, offset + length);
  return result;
}

describe("Floodgate v7 authority current-state cross-parser golden fixture", () => {
  const keyRecord = fixture.records.authority_public_key;
  const headerRecord = fixture.records.activation_head_journal_header;
  const entryRecord = fixture.records.activation_head_journal_entry_1;
  const keyBytes = fromHex(keyRecord.canonical_hex);
  const headerBytes = fromHex(headerRecord.canonical_hex);
  const entryBytes = fromHex(entryRecord.canonical_hex);

  it("reuses the earlier synthetic authority key and ExpectedActivationHeadV1 exactly", () => {
    expect(fixture).toMatchObject({
      schema: "shogi-floodgate-v7-authority-current-state-golden-v1",
      status:
        "synthetic-test-only-cross-parser-fixture-not-operational-evidence",
      encoding: {
        byte_order: "big-endian",
        hex: "lowercase",
        hash: "SHA-256",
        key_id: "SHA-256(raw-32-byte-Ed25519-public-key)",
      },
      state_root:
        "/Library/Application Support/com.gomyway1216.shogi-floodgate-v7/ExternalTrustRoot/v1/state",
    });
    expect(textField(keyRecord.fields, "authority_public_key_raw_hex")).toBe(
      sourceFixture.keys.authority.public_key_hex,
    );
    expect(textField(keyRecord.fields, "authority_signer_key_id_hex")).toBe(
      sourceFixture.keys.authority.key_id_hex,
    );
    expect(textField(entryRecord.fields, "expected_activation_head_hex")).toBe(
      sourceFixture.records.expected_activation_head.canonical_hex,
    );
    expect(
      fromHex(textField(entryRecord.fields, "expected_activation_head_hex")),
    ).toHaveLength(
      sourceFixture.records.expected_activation_head.canonical_byte_count,
    );
    expect(
      sha256(
        fromHex(textField(entryRecord.fields, "expected_activation_head_hex")),
      ),
    ).toBe(sourceFixture.records.expected_activation_head.sha256);
  });

  it("derives the deterministic nonzero journal ID from its documented domain", () => {
    expect(fixture.journal_id_derivation).toMatchObject({
      algorithm: "SHA-256(UTF-8(domain))",
      domain: "shogi-floodgate-v7-authority-current-state-journal-v1",
      operational_identifier: false,
    });
    const derived = digest(
      Buffer.from(fixture.journal_id_derivation.domain, "utf8"),
    );
    expect(derived.toString("hex")).toBe(
      fixture.journal_id_derivation.journal_id_hex,
    );
    expect(derived.some((octet) => octet !== 0)).toBe(true);
  });

  it("independently reconstructs every byte, digest, and exact offset", () => {
    const reconstructedKey = encodeAuthorityKey(keyRecord);
    const reconstructedHeader = encodeJournalHeader(headerRecord);
    const reconstructedEntry = encodeJournalEntry(entryRecord);

    for (const [record, encoded] of [
      [keyRecord, reconstructedKey],
      [headerRecord, reconstructedHeader],
      [entryRecord, reconstructedEntry],
    ] as const) {
      expect(encoded).toHaveLength(record.canonical_byte_count);
      expect(encoded.toString("hex")).toBe(record.canonical_hex);
      expect(sha256(encoded)).toBe(record.sha256);
    }

    assertExactOffsets(
      keyRecord,
      {
        magic: [0, 8],
        schema_version: [8, 1],
        reserved: [9, 1],
        audience: [10, 1],
        purpose: [11, 1],
        authority_public_key_raw_hex: [12, 32],
        authority_signer_key_id_hex: [44, 32],
      },
      {
        magic: Buffer.from("FGV7APK1"),
        schema_version: byte(1),
        reserved: byte(0),
        audience: byte(1),
        purpose: byte(1),
        authority_public_key_raw_hex: fromHex(
          sourceFixture.keys.authority.public_key_hex,
        ),
        authority_signer_key_id_hex: fromHex(
          sourceFixture.keys.authority.key_id_hex,
        ),
      },
    );
    assertExactOffsets(
      headerRecord,
      {
        magic: [0, 8],
        schema_version: [8, 1],
        reserved: [9, 1],
        audience: [10, 1],
        purpose: [11, 1],
        entry_byte_count: [12, 4],
        journal_id_hex: [16, 32],
        authority_signer_key_id_hex: [48, 32],
        authority_public_key_record_sha256_hex: [80, 32],
      },
      {
        magic: Buffer.from("FGV7AJH1"),
        schema_version: byte(1),
        reserved: byte(0),
        audience: byte(1),
        purpose: byte(1),
        entry_byte_count: uint32(200),
        journal_id_hex: fromHex(fixture.journal_id_derivation.journal_id_hex),
        authority_signer_key_id_hex: digest(
          fromHex(sourceFixture.keys.authority.public_key_hex),
        ),
        authority_public_key_record_sha256_hex: digest(reconstructedKey),
      },
    );
    assertExactOffsets(
      entryRecord,
      {
        magic: [0, 8],
        schema_version: [8, 1],
        reserved: [9, 1],
        audience: [10, 1],
        purpose: [11, 1],
        journal_sequence: [12, 8],
        previous_journal_record_sha256_hex: [20, 32],
        expected_activation_head_hex: [52, 148],
      },
      {
        magic: Buffer.from("FGV7AJE1"),
        schema_version: byte(1),
        reserved: byte(0),
        audience: byte(1),
        purpose: byte(1),
        journal_sequence: uint64(1),
        previous_journal_record_sha256_hex: digest(reconstructedHeader),
        expected_activation_head_hex: fromHex(
          sourceFixture.records.expected_activation_head.canonical_hex,
        ),
      },
    );
    expect(entryRecord.expected_activation_head_offsets).toEqual({
      magic: [52, 8],
      schema_version: [60, 1],
      reserved: [61, 1],
      audience: [62, 1],
      purpose: [63, 1],
      authority_signer_key_id_hex: [64, 32],
      latest_activation_sequence: [96, 8],
      latest_activation_envelope_sha256_hex: [104, 32],
      active_enrollment_envelope_sha256_hex: [136, 32],
      active_enrollment_record_sha256_hex: [168, 32],
    });
  });

  it("parses all cross-links and the header-to-entry hash chain without Swift", () => {
    const authority = parseAuthorityKey(keyBytes);
    const header = parseJournalHeader(headerBytes, keyBytes);
    const entry = parseJournalEntry(entryBytes, headerBytes, keyBytes);

    expect(authority.keyID).toEqual(digest(authority.rawPublicKey));
    expect(header.authoritySignerKeyID).toEqual(authority.keyID);
    expect(header.authorityPublicKeyRecordSHA256).toEqual(digest(keyBytes));
    expect(header.journalID.toString("hex")).toBe(
      fixture.journal_id_derivation.journal_id_hex,
    );
    expect(entry.previousJournalRecordSHA256).toEqual(digest(headerBytes));
    expect(entry.journalSequence).toBe(1n);
    expect(entry.parsedExpectedActivationHead.latestActivationSequence).toBe(
      entry.journalSequence,
    );
    expect(entry.parsedExpectedActivationHead.authoritySignerKeyID).toEqual(
      header.authoritySignerKeyID,
    );
    expect(entry.expectedActivationHead.toString("hex")).toBe(
      sourceFixture.records.expected_activation_head.canonical_hex,
    );
    expect(() =>
      validateGoldenTranscript(keyBytes, headerBytes, entryBytes),
    ).not.toThrow();
  });

  it("rejects truncation, trailing bytes, fixed-domain drift, zero IDs, and broken links", () => {
    for (const [parser, bytes] of [
      [(value: Buffer) => parseAuthorityKey(value), keyBytes],
      [(value: Buffer) => parseJournalHeader(value, keyBytes), headerBytes],
      [
        (value: Buffer) => parseJournalEntry(value, headerBytes, keyBytes),
        entryBytes,
      ],
    ] as const) {
      expect(() => parser(bytes.subarray(0, bytes.length - 1))).toThrow();
      expect(() => parser(Buffer.concat([bytes, Buffer.from([0])]))).toThrow();
      for (const offset of [0, 8, 9, 10, 11]) {
        expect(() => parser(mutate(bytes, offset))).toThrow();
      }
    }

    expect(() => parseAuthorityKey(mutate(keyBytes, 12))).toThrow();
    expect(() => parseAuthorityKey(mutate(keyBytes, 44))).toThrow();
    expect(() => parseAuthorityKey(zeroRange(keyBytes, 12, 32))).toThrow();
    expect(() =>
      parseJournalHeader(zeroRange(headerBytes, 16, 32), keyBytes),
    ).toThrow();
    expect(() =>
      parseJournalHeader(mutate(headerBytes, 15), keyBytes),
    ).toThrow();
    expect(() =>
      parseJournalHeader(mutate(headerBytes, 48), keyBytes),
    ).toThrow();
    expect(() =>
      parseJournalHeader(mutate(headerBytes, 80), keyBytes),
    ).toThrow();
    expect(() =>
      parseJournalEntry(mutate(entryBytes, 19), headerBytes, keyBytes),
    ).toThrow();
    expect(() =>
      parseJournalEntry(mutate(entryBytes, 20), headerBytes, keyBytes),
    ).toThrow();
    expect(() =>
      parseJournalEntry(mutate(entryBytes, 64), headerBytes, keyBytes),
    ).toThrow();
    expect(() =>
      parseJournalEntry(mutate(entryBytes, 103), headerBytes, keyBytes),
    ).toThrow();
  });

  it("rejects every one-bit drift from the exact synthetic transcript", () => {
    const records = [keyBytes, headerBytes, entryBytes] as const;
    for (let recordIndex = 0; recordIndex < records.length; recordIndex += 1) {
      for (
        let byteOffset = 0;
        byteOffset < records[recordIndex].length;
        byteOffset += 1
      ) {
        const candidates = records.map((bytes) => Buffer.from(bytes)) as [
          Buffer,
          Buffer,
          Buffer,
        ];
        candidates[recordIndex][byteOffset] ^= 0x01;
        expect(() => validateGoldenTranscript(...candidates)).toThrow();
      }
    }
  });

  it("labels every operational claim as absent from the fixture", () => {
    expect(fixture.nonclaims).toEqual({
      real_root_state_read: false,
      real_key_provisioned: false,
      writer_implemented: false,
      production_inspector_run: false,
      production_execution: false,
      live_weights_changed: false,
    });
    expect(fixture.journal_id_derivation.operational_identifier).toBe(false);
  });
});
