import { GenerateMovesImproved } from "../src/components/game/ShogiImproved/GenerateMovesImproved";
import { KyokumenImproved } from "../src/components/game/ShogiImproved/KyokumenImproved";
import { buildDeclinablePromotion } from "../src/components/game/ShogiImproved/PromotionRulesImproved";
import { toSfen } from "./generate-teacher";
import {
  EMPTY,
  FU,
  GI,
  GOTE,
  HI,
  KA,
  KE,
  KI,
  KY,
  OU,
  PROMOTE,
  SENTE,
  Te,
  getKomashu,
} from "../src/components/game/ShogiImproved/types";

const PIECE_KIND: Readonly<Record<string, number>> = {
  P: FU,
  L: KY,
  N: KE,
  S: GI,
  G: KI,
  B: KA,
  R: HI,
  K: OU,
};

const DROP_LETTER: Readonly<Record<number, string>> = {
  [FU]: "P",
  [KY]: "L",
  [KE]: "N",
  [GI]: "S",
  [KI]: "G",
  [KA]: "B",
  [HI]: "R",
};

function square(file: number, rank: number): number {
  return (file << 4) + rank;
}

function rankNumber(letter: string): number {
  const rank = letter.toLowerCase().charCodeAt(0) - 96;
  if (rank < 1 || rank > 9) throw new Error(`invalid USI rank: ${letter}`);
  return rank;
}

export interface ParsedSfenPosition {
  position: KyokumenImproved;
  moveNumber: number;
}

/** Parse a standard SFEN into the in-browser engine's position representation. */
export function positionFromSfen(sfen: string): ParsedSfenPosition {
  const parts = sfen.trim().split(/\s+/);
  if (parts.length !== 4 || (parts[1] !== "b" && parts[1] !== "w")) {
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
      const side = piece === upper ? SENTE : GOTE;
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
      const side = piece === upper ? SENTE : GOTE;
      position.hand[side + base] += copies;
      count = "";
    }
    if (count) throw new Error(`dangling SFEN hand count ${count}`);
  }

  position.teban = parts[1] === "b" ? SENTE : GOTE;
  position.initAll();
  return { position, moveNumber };
}

export function teToUsi(move: Te): string {
  const toFile = move.to >> 4;
  const toRank = String.fromCharCode(96 + (move.to & 0x0f));
  if (move.from === 0) {
    const piece = DROP_LETTER[getKomashu(move.koma)];
    if (!piece)
      throw new Error(`cannot encode dropped piece ${getKomashu(move.koma)}`);
    return `${piece}*${toFile}${toRank}`;
  }
  const fromFile = move.from >> 4;
  const fromRank = String.fromCharCode(96 + (move.from & 0x0f));
  return `${fromFile}${fromRank}${toFile}${toRank}${move.promote ? "+" : ""}`;
}

export interface RulesCompleteLegalMove {
  readonly usi: string;
  readonly move: Te;
}

/**
 * Enumerate the rules-complete legal move set in deterministic USI byte order.
 *
 * `GenerateMovesImproved` intentionally prunes optional bishop/rook
 * non-promotion branches as a search optimization. Dataset eligibility,
 * sibling candidates, USI resolution, and semantic child isolation are rules
 * contracts instead, so every legally declinable promotion is restored here.
 */
export function rulesCompleteLegalMoves(
  position: KyokumenImproved,
): readonly Readonly<RulesCompleteLegalMove>[] {
  const byUsi = new Map<string, Te>();
  for (const move of GenerateMovesImproved.generateLegalMoves(position)) {
    byUsi.set(teToUsi(move), move);
    const declined = buildDeclinablePromotion(move, position.teban);
    if (declined) byUsi.set(teToUsi(declined), declined);
  }
  return Object.freeze(
    [...byUsi]
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([usi, move]) => Object.freeze({ usi, move })),
  );
}

/** Resolve USI against the legal list so illegal drops/promotions fail closed. */
export function resolveUsiMove(position: KyokumenImproved, usi: string): Te {
  const legal = rulesCompleteLegalMoves(position).map((entry) => entry.move);
  let matches: Te[];
  const drop = usi.match(/^([PLNSGBR])\*([1-9])([a-i])$/i);
  if (drop) {
    const kind = PIECE_KIND[drop[1].toUpperCase()];
    const to = square(Number.parseInt(drop[2], 10), rankNumber(drop[3]));
    matches = legal.filter(
      (move) =>
        move.from === 0 && move.to === to && getKomashu(move.koma) === kind,
    );
  } else {
    const boardMove = usi.match(/^([1-9])([a-i])([1-9])([a-i])(\+)?$/i);
    if (!boardMove) throw new Error(`invalid USI move: ${usi}`);
    const from = square(
      Number.parseInt(boardMove[1], 10),
      rankNumber(boardMove[2]),
    );
    const to = square(
      Number.parseInt(boardMove[3], 10),
      rankNumber(boardMove[4]),
    );
    const promote = boardMove[5] === "+";
    matches = legal.filter(
      (move) =>
        move.from === from && move.to === to && move.promote === promote,
    );
  }
  if (matches.length !== 1) {
    throw new Error(`USI move ${usi} matched ${matches.length} legal moves`);
  }
  return matches[0];
}

export function childSfenAfterUsi(parentSfen: string, usi: string): string {
  const { position, moveNumber } = positionFromSfen(parentSfen);
  const move = resolveUsiMove(position, usi);
  position.move(move);
  position.toggleTeban();
  return toSfen(position, moveNumber + 1);
}
