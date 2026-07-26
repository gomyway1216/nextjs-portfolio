/**
 * Migrate the committed SBK1 opening book to collision-safe SBK2.
 *
 * SBK1 stores a 30-bit primary hash plus a correlated 16-bit board check. The independent
 * 32-bit secondary hash cannot be reconstructed from those bytes, so this script replays the
 * book-induced graph from the initial position and records the exact secondary identity of
 * every matching position. A legacy identity that resolves to multiple independent pairs is
 * omitted rather than copying an unauthenticated move payload to both positions.
 *
 * Usage:
 *   node -r tsx/cjs scripts/shogi-migrate-opening-book-v2.ts \
 *     [public/shogi-opening-book.bin] [public/shogi-opening-book-v2.bin] \
 *     [--allow-unreachable 175] [--allow-ambiguous 68] [--allow-invalid 2]
 *
 * The committed SBK1 has 175 identities disconnected from this traversal and 68 identities
 * that each resolve to two independent pairs. Two more recovered identities have no trustworthy
 * legal move payload. Those 245 legacy identities are an explicit 0.251% coverage loss, not
 * proof that the positions can never occur after an off-book line.
 * Exact allowances make the loss visible and fail if the source or engine behavior changes.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { GenerateMovesImproved } from '../src/components/game/ShogiImproved/GenerateMovesImproved';
import { InitialPositionImproved } from '../src/components/game/ShogiImproved/InitialPositionImproved';
import { KyokumenImproved } from '../src/components/game/ShogiImproved/KyokumenImproved';
import { SENTE, Te, getKomashu } from '../src/components/game/ShogiImproved/types';

const SBK1_MAGIC = 0x314b4253;
const SBK2_MAGIC = 0x324b4253;
const inputPath = path.resolve(process.argv[2] ?? 'public/shogi-opening-book.bin');
const outputPath = path.resolve(process.argv[3] ?? 'public/shogi-opening-book-v2.bin');
const allowIndex = process.argv.indexOf('--allow-unreachable');
const allowedUnreachable = allowIndex >= 0 ? Number(process.argv[allowIndex + 1]) : 0;
if (!Number.isSafeInteger(allowedUnreachable) || allowedUnreachable < 0) {
  throw new Error('--allow-unreachable must be a non-negative integer');
}
const ambiguousIndex = process.argv.indexOf('--allow-ambiguous');
const allowedAmbiguous = ambiguousIndex >= 0 ? Number(process.argv[ambiguousIndex + 1]) : 0;
if (!Number.isSafeInteger(allowedAmbiguous) || allowedAmbiguous < 0) {
  throw new Error('--allow-ambiguous must be a non-negative integer');
}
const invalidIndex = process.argv.indexOf('--allow-invalid');
const allowedInvalid = invalidIndex >= 0 ? Number(process.argv[invalidIndex + 1]) : 0;
if (!Number.isSafeInteger(allowedInvalid) || allowedInvalid < 0) {
  throw new Error('--allow-invalid must be a non-negative integer');
}

type PackedMove = [number, number, number];

interface LegacyEntry {
  hashA: number;
  check: number;
  moves: PackedMove[];
}

interface MigratedEntry {
  hashA: number;
  hashB: number;
  moves: PackedMove[];
}

function legacyKey(hashA: number, check: number): string {
  return `${hashA >>> 0}:${check & 0xffff}`;
}

function pairKey(hashA: number, hashB: number): string {
  return `${hashA >>> 0}:${hashB >>> 0}`;
}

function legacyPositionKey(k: KyokumenImproved): string {
  return legacyKey(k.HashVal, k.BanHash);
}

function readLegacyBook(filename: string): Map<string, LegacyEntry> {
  const buf = fs.readFileSync(filename);
  if (buf.length < 8 || buf.readUInt32LE(0) !== SBK1_MAGIC) {
    throw new Error(`${filename}: expected SBK1`);
  }
  const count = buf.readUInt32LE(4);
  const entries = new Map<string, LegacyEntry>();
  let off = 8;
  for (let i = 0; i < count; i++) {
    if (off + 7 > buf.length) throw new Error(`${filename}: truncated entry ${i}`);
    const hashA = buf.readUInt32LE(off);
    const check = buf.readUInt16LE(off + 4);
    const moveCount = buf.readUInt8(off + 6);
    off += 7;
    if (moveCount === 0 || off + moveCount * 3 > buf.length) {
      throw new Error(`${filename}: invalid move count at entry ${i}`);
    }
    const moves: PackedMove[] = [];
    for (let j = 0; j < moveCount; j++) {
      moves.push([buf.readUInt8(off), buf.readUInt8(off + 1), buf.readUInt8(off + 2)]);
      off += 3;
    }
    const key = legacyKey(hashA, check);
    if (entries.has(key)) throw new Error(`${filename}: duplicate legacy identity ${key}`);
    entries.set(key, { hashA, check, moves });
  }
  if (off !== buf.length) throw new Error(`${filename}: trailing bytes`);
  if (entries.size !== count) throw new Error(`${filename}: expected ${count} unique entries, got ${entries.size}`);
  return entries;
}

function writeBook(filename: string, entries: MigratedEntry[]): void {
  entries.sort((a, b) => a.hashA - b.hashA || a.hashB - b.hashB);
  let bytes = 8;
  for (const entry of entries) bytes += 9 + entry.moves.length * 3;
  const buf = Buffer.alloc(bytes);
  buf.writeUInt32LE(SBK2_MAGIC, 0);
  buf.writeUInt32LE(entries.length, 4);
  let off = 8;
  for (const entry of entries) {
    buf.writeUInt32LE(entry.hashA >>> 0, off);
    buf.writeUInt32LE(entry.hashB >>> 0, off + 4);
    buf.writeUInt8(entry.moves.length, off + 8);
    off += 9;
    for (const [from, to, flags] of entry.moves) {
      buf.writeUInt8(from, off);
      buf.writeUInt8(to, off + 1);
      buf.writeUInt8(flags, off + 2);
      off += 3;
    }
  }
  fs.writeFileSync(filename, buf);
}

function matchesPackedMove(move: Te, packed: PackedMove): boolean {
  const [from, to, flags] = packed;
  if (move.from !== from || move.to !== to) return false;
  if (from === 0) return getKomashu(move.koma) === ((flags >> 1) & 7);
  return move.promote === ((flags & 1) !== 0);
}

function migrate(legacy: Map<string, LegacyEntry>): {
  entries: MigratedEntry[];
  missing: string[];
  ambiguous: string[];
  invalid: string[];
} {
  const root = InitialPositionImproved.createInitialPosition();
  root.setTeban(SENTE);
  if (!legacy.has(legacyPositionKey(root))) throw new Error('legacy book does not contain the initial position');

  const queue: KyokumenImproved[] = [root];
  const queuedPairs = new Set<string>([pairKey(root.HashVal, root.SecondaryHashVal)]);
  const recoveredLegacy = new Set<string>();
  const candidates = new Map<
    string,
    Map<string, { position: KyokumenImproved; entry: LegacyEntry }>
  >();
  let cursor = 0;

  while (cursor < queue.length) {
    const position = queue[cursor++];
    const legacyIdentity = legacyPositionKey(position);
    const entry = legacy.get(legacyIdentity);
    if (!entry) continue;

    recoveredLegacy.add(legacyIdentity);
    const identity = pairKey(position.HashVal, position.SecondaryHashVal);
    let identityCandidates = candidates.get(legacyIdentity);
    if (!identityCandidates) {
      identityCandidates = new Map();
      candidates.set(legacyIdentity, identityCandidates);
    }
    identityCandidates.set(identity, { position, entry });

    for (const move of GenerateMovesImproved.generateLegalMoves(position)) {
      const child = position.clone();
      child.move(move);
      child.toggleTeban();
      if (!legacy.has(legacyPositionKey(child))) continue;
      const childPair = pairKey(child.HashVal, child.SecondaryHashVal);
      if (queuedPairs.has(childPair)) continue;
      queuedPairs.add(childPair);
      queue.push(child);
    }

    if (cursor % 10_000 === 0) {
      console.log(`replayed ${cursor.toLocaleString()} positions; recovered ${recoveredLegacy.size.toLocaleString()}`);
    }
  }

  const missing = [...legacy.keys()].filter((key) => !recoveredLegacy.has(key));
  if (missing.length !== allowedUnreachable) {
    throw new Error(
      `migration incomplete: recovered ${recoveredLegacy.size}/${legacy.size}; ` +
        `expected ${allowedUnreachable} unreachable but found ${missing.length}; first missing: ${missing.slice(0, 20).join(', ')}`
    );
  }

  const ambiguous = [...candidates.entries()]
    .filter(([, identityCandidates]) => identityCandidates.size !== 1)
    .map(([legacyIdentity]) => legacyIdentity);
  if (ambiguous.length !== allowedAmbiguous) {
    throw new Error(
      `migration ambiguous: expected ${allowedAmbiguous} legacy identities but found ${ambiguous.length}; ` +
        `first ambiguous: ${ambiguous.slice(0, 20).join(', ')}`
    );
  }

  const entries: MigratedEntry[] = [];
  const invalid: string[] = [];
  for (const [legacyIdentity, identityCandidates] of candidates) {
    if (identityCandidates.size !== 1) continue;
    const [{ position, entry }] = identityCandidates.values();
    const legal = GenerateMovesImproved.generateLegalMoves(position);
    const invalidMoves = entry.moves.filter((packed) => !legal.some((move) => matchesPackedMove(move, packed)));
    if (invalidMoves.length > 0) {
      invalid.push(legacyIdentity);
      continue;
    }
    entries.push({
      hashA: position.HashVal >>> 0,
      hashB: position.SecondaryHashVal >>> 0,
      moves: entry.moves,
    });
  }
  if (invalid.length !== allowedInvalid) {
    throw new Error(
      `migration invalid payloads: expected ${allowedInvalid} legacy identities but found ${invalid.length}; ` +
        `first invalid: ${invalid.slice(0, 20).join(', ')}`
    );
  }
  return { entries, missing, ambiguous, invalid };
}

const legacy = readLegacyBook(inputPath);
console.log(`loaded ${legacy.size.toLocaleString()} SBK1 entries`);
const { entries: migrated, missing, ambiguous, invalid } = migrate(legacy);
if (missing.length > 0) {
  console.warn(`explicitly omitted ${missing.length} SBK1 identities disconnected from the book-induced traversal`);
}
if (ambiguous.length > 0) {
  console.warn(`explicitly omitted ${ambiguous.length} ambiguous SBK1 identities (${ambiguous.length * 2} pairs)`);
}
if (invalid.length > 0) {
  console.warn(`explicitly omitted ${invalid.length} SBK1 identities whose stored payload is not legal`);
}
writeBook(outputPath, migrated);
const stat = fs.statSync(outputPath);
console.log(
  `wrote ${migrated.length.toLocaleString()} SBK2 entries (${stat.size.toLocaleString()} bytes) to ${outputPath}`
);
