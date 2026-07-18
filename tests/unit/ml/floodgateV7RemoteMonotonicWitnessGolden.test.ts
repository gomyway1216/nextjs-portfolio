import {
  createHash,
  createPublicKey,
  verify as verifySignature,
} from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(__dirname, "../../..");
const fixturePath = path.join(
  repositoryRoot,
  "tests/fixtures/floodgate-v7-remote-monotonic-witness-golden-v1.json",
);
const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
const zero32 = Buffer.alloc(32);

function sha256(bytes: Uint8Array): Buffer {
  return createHash("sha256").update(bytes).digest();
}

function hex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("hex");
}

function fromHex(value: unknown, field: string): Buffer {
  if (
    typeof value !== "string" ||
    value.length % 2 !== 0 ||
    !/^[0-9a-f]+$/u.test(value)
  ) {
    throw new Error(`${field} must be nonempty lowercase hexadecimal`);
  }
  return Buffer.from(value, "hex");
}

function requireBytes(bytes: Buffer, expected: Buffer, field: string): void {
  if (!bytes.equals(expected)) {
    throw new Error(`${field} does not match`);
  }
}

function requireDistinct(values: Buffer[], field: string): void {
  if (new Set(values.map(hex)).size !== values.length) {
    throw new Error(`${field} aliases another role`);
  }
}

function isZero(bytes: Buffer): boolean {
  return bytes.equals(Buffer.alloc(bytes.length));
}

type Checkpoint = {
  bytes: Buffer;
  journalId: Buffer;
  sequence: bigint;
  authorityKeyRecordSha256: Buffer;
  journalHeaderSha256: Buffer;
  lastJournalEntrySha256: Buffer;
  expectedActivationHeadSha256: Buffer;
  previousWitnessedCheckpointSha256: Buffer;
  sha256: Buffer;
};

function decodeCheckpoint(bytes: Buffer): Checkpoint {
  if (bytes.length !== 212) {
    throw new Error("checkpoint length");
  }
  requireBytes(
    bytes.subarray(0, 8),
    Buffer.from("FGV7ARC1"),
    "checkpoint magic",
  );
  requireBytes(
    bytes.subarray(8, 12),
    Buffer.from([1, 0, 1, 1]),
    "checkpoint domain",
  );
  const checkpoint: Checkpoint = {
    bytes,
    journalId: bytes.subarray(12, 44),
    sequence: bytes.readBigUInt64BE(44),
    authorityKeyRecordSha256: bytes.subarray(52, 84),
    journalHeaderSha256: bytes.subarray(84, 116),
    lastJournalEntrySha256: bytes.subarray(116, 148),
    expectedActivationHeadSha256: bytes.subarray(148, 180),
    previousWitnessedCheckpointSha256: bytes.subarray(180, 212),
    sha256: sha256(bytes),
  };
  if (checkpoint.sequence === 0n) {
    throw new Error("checkpoint sequence");
  }
  const required = [
    checkpoint.journalId,
    checkpoint.authorityKeyRecordSha256,
    checkpoint.journalHeaderSha256,
    checkpoint.lastJournalEntrySha256,
    checkpoint.expectedActivationHeadSha256,
  ];
  if (required.some(isZero)) {
    throw new Error("checkpoint zero role");
  }
  requireDistinct(
    checkpoint.sequence === 1n
      ? required
      : [...required, checkpoint.previousWitnessedCheckpointSha256],
    "checkpoint role",
  );
  if (
    (checkpoint.sequence === 1n &&
      !checkpoint.previousWitnessedCheckpointSha256.equals(zero32)) ||
    (checkpoint.sequence > 1n &&
      checkpoint.previousWitnessedCheckpointSha256.equals(zero32))
  ) {
    throw new Error("checkpoint chain");
  }
  return checkpoint;
}

type Request = {
  bytes: Buffer;
  operation: number;
  witnessId: Buffer;
  endpointId: Buffer;
  clientNonce: Buffer;
  operationId: Buffer;
  expectedCheckpointSha256: Buffer;
  candidateCheckpointSha256: Buffer;
  candidateCheckpoint: Checkpoint | null;
  sha256: Buffer;
};

function decodeRequest(bytes: Buffer): Request {
  if (bytes.length !== 418) {
    throw new Error("request length");
  }
  requireBytes(bytes.subarray(0, 8), Buffer.from("FGV7RWR1"), "request magic");
  requireBytes(
    bytes.subarray(8, 12),
    Buffer.from([1, 0, 1, 1]),
    "request domain",
  );
  const operation = bytes[12];
  if ((operation !== 1 && operation !== 2) || bytes[13] !== 0) {
    throw new Error("request operation");
  }
  const request: Request = {
    bytes,
    operation,
    witnessId: bytes.subarray(14, 46),
    endpointId: bytes.subarray(46, 78),
    clientNonce: bytes.subarray(78, 110),
    operationId: bytes.subarray(110, 142),
    expectedCheckpointSha256: bytes.subarray(142, 174),
    candidateCheckpointSha256: bytes.subarray(174, 206),
    candidateCheckpoint: null,
    sha256: sha256(bytes),
  };
  const roles = [
    request.witnessId,
    request.endpointId,
    request.clientNonce,
    request.operationId,
  ];
  if (roles.some(isZero)) {
    throw new Error("request zero role");
  }
  requireDistinct(roles, "request role");
  const candidateBytes = bytes.subarray(206, 418);
  if (operation === 1) {
    if (
      !request.expectedCheckpointSha256.equals(zero32) ||
      !request.candidateCheckpointSha256.equals(zero32) ||
      !isZero(candidateBytes)
    ) {
      throw new Error("query tail");
    }
  } else {
    if (request.expectedCheckpointSha256.equals(zero32)) {
      throw new Error("advance expected checkpoint");
    }
    const candidate = decodeCheckpoint(candidateBytes);
    requireBytes(
      request.candidateCheckpointSha256,
      candidate.sha256,
      "advance candidate digest",
    );
    requireBytes(
      candidate.previousWitnessedCheckpointSha256,
      request.expectedCheckpointSha256,
      "advance CAS predecessor",
    );
    request.candidateCheckpoint = candidate;
  }
  return request;
}

type Receipt = {
  bytes: Buffer;
  operation: number;
  accepted: boolean;
  witnessId: Buffer;
  endpointId: Buffer;
  witnessSignerKeyId: Buffer;
  clientNonce: Buffer;
  operationId: Buffer;
  requestSha256: Buffer;
  checkpointSha256: Buffer;
  checkpoint: Checkpoint;
  issuedAt: bigint;
  expiresAt: bigint;
  signature: Buffer;
  signaturePayload: Buffer;
};

function decodeReceipt(bytes: Buffer): Receipt {
  if (bytes.length !== 530) {
    throw new Error("receipt length");
  }
  requireBytes(bytes.subarray(0, 8), Buffer.from("FGV7RCP1"), "receipt magic");
  requireBytes(
    bytes.subarray(8, 12),
    Buffer.from([1, 0, 1, 1]),
    "receipt domain",
  );
  const operation = bytes[12];
  const acceptedByte = bytes[13];
  if (
    (operation !== 1 && operation !== 2) ||
    (acceptedByte !== 0 && acceptedByte !== 1) ||
    (operation === 1 && acceptedByte !== 1)
  ) {
    throw new Error("receipt operation");
  }
  const checkpoint = decodeCheckpoint(bytes.subarray(238, 450));
  const receipt: Receipt = {
    bytes,
    operation,
    accepted: acceptedByte === 1,
    witnessId: bytes.subarray(14, 46),
    endpointId: bytes.subarray(46, 78),
    witnessSignerKeyId: bytes.subarray(78, 110),
    clientNonce: bytes.subarray(110, 142),
    operationId: bytes.subarray(142, 174),
    requestSha256: bytes.subarray(174, 206),
    checkpointSha256: bytes.subarray(206, 238),
    checkpoint,
    issuedAt: bytes.readBigUInt64BE(450),
    expiresAt: bytes.readBigUInt64BE(458),
    signature: bytes.subarray(466, 530),
    signaturePayload: bytes.subarray(0, 466),
  };
  const roles = [
    receipt.witnessId,
    receipt.endpointId,
    receipt.witnessSignerKeyId,
    receipt.clientNonce,
    receipt.operationId,
    receipt.requestSha256,
    receipt.checkpointSha256,
  ];
  if (roles.some(isZero) || isZero(receipt.signature)) {
    throw new Error("receipt zero role");
  }
  requireDistinct(roles, "receipt role");
  requireBytes(
    receipt.checkpointSha256,
    checkpoint.sha256,
    "receipt checkpoint digest",
  );
  if (
    receipt.issuedAt === 0n ||
    receipt.expiresAt <= receipt.issuedAt ||
    receipt.expiresAt - receipt.issuedAt > 30n
  ) {
    throw new Error("receipt lifetime");
  }
  return receipt;
}

function rawEd25519PublicKey(raw: Buffer) {
  if (raw.length !== 32) {
    throw new Error("Ed25519 public key length");
  }
  return createPublicKey({
    key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), raw]),
    format: "der",
    type: "spki",
  });
}

describe("Floodgate v7 remote monotonic witness golden transcript", () => {
  it("recomputes every fixture length and SHA-256 independently", () => {
    expect(fixture).toMatchObject({
      schema: "shogi-floodgate-v7-remote-monotonic-witness-golden-v1",
      status:
        "synthetic-test-only-cross-parser-fixture-not-operational-evidence",
      fixed_domain: {
        maximum_receipt_lifetime_seconds: 30,
      },
    });
    for (const record of Object.values(fixture.records) as Array<{
      canonical_byte_count: number;
      canonical_hex: string;
      sha256: string;
    }>) {
      const bytes = fromHex(record.canonical_hex, "canonical_hex");
      expect(bytes).toHaveLength(record.canonical_byte_count);
      expect(hex(sha256(bytes))).toBe(record.sha256);
    }
  });

  it("parses both checkpoints and pins the monotonic predecessor link", () => {
    const first = decodeCheckpoint(
      fromHex(fixture.records.checkpoint_1.canonical_hex, "checkpoint_1"),
    );
    const second = decodeCheckpoint(
      fromHex(fixture.records.checkpoint_2.canonical_hex, "checkpoint_2"),
    );

    expect(first.sequence).toBe(1n);
    expect(second.sequence).toBe(2n);
    expect(second.journalId.equals(first.journalId)).toBe(true);
    expect(
      second.authorityKeyRecordSha256.equals(first.authorityKeyRecordSha256),
    ).toBe(true);
    expect(second.journalHeaderSha256.equals(first.journalHeaderSha256)).toBe(
      true,
    );
    expect(second.previousWitnessedCheckpointSha256.equals(first.sha256)).toBe(
      true,
    );
  });

  it("parses the query zero-tail and advance CAS transcript", () => {
    const query = decodeRequest(
      fromHex(fixture.records.query_request.canonical_hex, "query_request"),
    );
    const advance = decodeRequest(
      fromHex(fixture.records.advance_request.canonical_hex, "advance_request"),
    );

    expect(query.operation).toBe(1);
    expect(query.candidateCheckpoint).toBeNull();
    expect(advance.operation).toBe(2);
    expect(advance.candidateCheckpoint?.sequence).toBe(2n);
    expect(hex(advance.expectedCheckpointSha256)).toBe(
      fixture.records.checkpoint_1.sha256,
    );
    expect(hex(advance.candidateCheckpointSha256)).toBe(
      fixture.records.checkpoint_2.sha256,
    );
  });

  it("verifies the receipt binding, lifetime, key ID, and Ed25519 signature", () => {
    const request = decodeRequest(
      fromHex(fixture.records.advance_request.canonical_hex, "advance_request"),
    );
    const receipt = decodeReceipt(
      fromHex(fixture.records.signed_receipt.canonical_hex, "signed_receipt"),
    );
    const publicKey = fromHex(fixture.signer.public_key_hex, "public_key");

    expect(hex(sha256(publicKey))).toBe(fixture.signer.key_id_hex);
    expect(receipt.operation).toBe(request.operation);
    expect(receipt.accepted).toBe(true);
    expect(receipt.witnessId.equals(request.witnessId)).toBe(true);
    expect(receipt.endpointId.equals(request.endpointId)).toBe(true);
    expect(receipt.clientNonce.equals(request.clientNonce)).toBe(true);
    expect(receipt.operationId.equals(request.operationId)).toBe(true);
    expect(receipt.requestSha256.equals(request.sha256)).toBe(true);
    expect(
      receipt.checkpoint.bytes.equals(
        request.candidateCheckpoint?.bytes ?? Buffer.alloc(0),
      ),
    ).toBe(true);
    expect(hex(receipt.witnessSignerKeyId)).toBe(fixture.signer.key_id_hex);
    expect(
      verifySignature(
        null,
        receipt.signaturePayload,
        rawEd25519PublicKey(publicKey),
        receipt.signature,
      ),
    ).toBe(true);
    expect(receipt.expiresAt - receipt.issuedAt).toBe(30n);
  });

  it("rejects a one-bit drift at every signed-receipt byte position", () => {
    const canonical = fromHex(
      fixture.records.signed_receipt.canonical_hex,
      "signed_receipt",
    );
    const publicKey = rawEd25519PublicKey(
      fromHex(fixture.signer.public_key_hex, "public_key"),
    );

    for (let offset = 0; offset < canonical.length; offset += 1) {
      const mutated = Buffer.from(canonical);
      mutated[offset] ^= 0x01;
      expect(
        verifySignature(
          null,
          mutated.subarray(0, 466),
          publicKey,
          mutated.subarray(466),
        ),
        `offset ${offset}`,
      ).toBe(false);
    }
  });
});
