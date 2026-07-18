/**
 * Pure SFEN serialization shared by the engine-facing tools and read-only
 * dataset verifiers. This module deliberately has no filesystem, process, or
 * writer dependency.
 */

import type { KyokumenImproved } from "../src/components/game/ShogiImproved/KyokumenImproved";
import {
  EMPTY,
  GOTE,
  PROMOTE,
  SENTE,
  getKomashu,
  isSente,
} from "../src/components/game/ShogiImproved/types";

const SFEN_LETTER: Readonly<Record<number, string>> = Object.freeze({
  1: "P",
  2: "L",
  3: "N",
  4: "S",
  5: "G",
  6: "B",
  7: "R",
  8: "K",
});
const HAND_ORDER = Object.freeze([7, 6, 5, 4, 3, 2, 1] as const);

function pieceToSfen(piece: number): string {
  const kind = getKomashu(piece);
  const base = kind & 0x07;
  const promoted = (kind & PROMOTE) !== 0 && base !== 0;
  const letter = kind === 8 ? "K" : SFEN_LETTER[base];
  if (letter === undefined) throw new Error("unknown shogi piece");
  const encoded = `${promoted ? "+" : ""}${letter}`;
  return isSente(piece) ? encoded : encoded.toLowerCase();
}

/** Serialize one engine position using canonical SFEN field ordering. */
export function toSfen(position: KyokumenImproved, moveNumber: number): string {
  if (!Number.isSafeInteger(moveNumber) || moveNumber <= 0) {
    throw new Error("SFEN move number must be a positive safe integer");
  }
  const rows: string[] = [];
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
    const count = position.hand[SENTE + kind] ?? 0;
    if (count > 0) {
      hand += `${count > 1 ? String(count) : ""}${SFEN_LETTER[kind]}`;
    }
  }
  for (const kind of HAND_ORDER) {
    const count = position.hand[GOTE + kind] ?? 0;
    if (count > 0) {
      hand += `${count > 1 ? String(count) : ""}${SFEN_LETTER[
        kind
      ].toLowerCase()}`;
    }
  }
  if (hand === "") hand = "-";

  return `${rows.join("/")} ${
    position.teban === SENTE ? "b" : "w"
  } ${hand} ${moveNumber}`;
}
