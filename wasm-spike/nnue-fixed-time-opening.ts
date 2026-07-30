import { createHash } from "node:crypto";

import { GenerateMovesImproved } from "../src/components/game/ShogiImproved/GenerateMovesImproved";
import { KyokumenImproved } from "../src/components/game/ShogiImproved/KyokumenImproved";
import {
  EMPTY,
  FU,
  OU,
  SENTE,
  Te,
  getKomashu,
} from "../src/components/game/ShogiImproved/types";

export const NNUE_FIXED_TIME_OPENING_PLIES = 6 as const;
export const NNUE_FIXED_TIME_OPENING_DOMAIN =
  "shogi-nnue-fixed-time-opening-v1\0" as const;
export const NNUE_FIXED_TIME_SEED_MULTIPLIER = 15_485_863 as const;
export const NNUE_FIXED_TIME_PAIR_OFFSET = 104_729 as const;
export const NNUE_FIXED_TIME_SEED_DOMAIN = 0x5eed00 as const;

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function pickCuratedOpeningMove(
  position: KyokumenImproved,
  moves: readonly Te[],
  random: () => number,
): Te {
  const quiet = moves.filter(
    (move) => move.from !== 0 && move.capture === EMPTY && !move.promote,
  );
  const pawnStartDan = position.teban === SENTE ? 7 : 3;
  const pawnNextDan = position.teban === SENTE ? 6 : 4;
  const pawnPushes = quiet.filter(
    (move) =>
      getKomashu(move.koma) === FU &&
      (move.from & 0x0f) === pawnStartDan &&
      (move.to & 0x0f) === pawnNextDan,
  );
  if (pawnPushes.length > 0) {
    return pawnPushes[Math.floor(random() * pawnPushes.length)];
  }
  const development = quiet.filter((move) => getKomashu(move.koma) !== OU);
  if (development.length > 0) {
    return development[Math.floor(random() * development.length)];
  }
  if (quiet.length > 0) return quiet[Math.floor(random() * quiet.length)];
  return moves[Math.floor(random() * moves.length)];
}

export function nnueFixedTimeDerivedSeed(
  seedBase: number,
  pairIndex = 0,
): number {
  if (
    !Number.isSafeInteger(seedBase) ||
    seedBase < 1 ||
    !Number.isSafeInteger(pairIndex) ||
    pairIndex < 0
  ) {
    throw new Error("fixed-time opening seed inputs must be nonnegative safe integers");
  }
  const derived =
    NNUE_FIXED_TIME_SEED_DOMAIN +
    seedBase * NNUE_FIXED_TIME_SEED_MULTIPLIER +
    pairIndex * NNUE_FIXED_TIME_PAIR_OFFSET;
  if (!Number.isSafeInteger(derived)) {
    throw new Error("fixed-time opening derived seed exceeds safe integer range");
  }
  return derived;
}

export function nnueFixedTimeOpeningFingerprint(
  moves: readonly Te[],
): string {
  const canonical = moves.map((move) => [
    move.koma,
    move.from,
    move.to,
    move.promote ? 1 : 0,
  ]);
  return createHash("sha256")
    .update(NNUE_FIXED_TIME_OPENING_DOMAIN)
    .update(JSON.stringify(canonical))
    .digest("hex");
}

export function buildNnueFixedTimeOpening(
  seedBase: number,
  pairIndex = 0,
): Readonly<{
  readonly derivedSeed: number;
  readonly moves: readonly Te[];
  readonly fingerprint: string;
}> {
  const derivedSeed = nnueFixedTimeDerivedSeed(seedBase, pairIndex);
  const position = new KyokumenImproved();
  position.initHirate();
  const random = mulberry32(derivedSeed);
  const moves: Te[] = [];
  for (let ply = 0; ply < NNUE_FIXED_TIME_OPENING_PLIES; ply += 1) {
    const legalMoves = GenerateMovesImproved.generateLegalMoves(position);
    if (legalMoves.length === 0) {
      throw new Error("fixed-time opening generator reached a terminal position");
    }
    const selected = pickCuratedOpeningMove(position, legalMoves, random).clone();
    selected.capture = position.get(selected.to);
    moves.push(selected.clone());
    position.move(selected);
    position.toggleTeban();
  }
  return Object.freeze({
    derivedSeed,
    moves: Object.freeze(moves),
    fingerprint: nnueFixedTimeOpeningFingerprint(moves),
  });
}
