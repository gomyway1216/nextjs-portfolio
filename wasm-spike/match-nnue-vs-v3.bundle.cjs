// Generated with esbuild 0.28.1: --bundle --platform=node --format=cjs --target=node18 --define:require.main=undefined
"use strict";

// wasm-spike/match-nnue-vs-v3.ts
var import_node_crypto2 = require("node:crypto");
var import_node_fs2 = require("node:fs");

// src/components/game/ShogiImproved/types.ts
var SENTE = 1 << 4;
var GOTE = 1 << 5;
var EMPTY = 0;
var PROMOTE = 8;
var FU = 1;
var KY = 2;
var KE = 3;
var GI = 4;
var KI = 5;
var KA = 6;
var HI = 7;
var OU = 8;
var TO = FU + PROMOTE;
var NY = KY + PROMOTE;
var NK = KE + PROMOTE;
var NG = GI + PROMOTE;
var UM = KA + PROMOTE;
var RY = HI + PROMOTE;
var SFU = SENTE + FU;
var SKY = SENTE + KY;
var SKE = SENTE + KE;
var SGI = SENTE + GI;
var SKI = SENTE + KI;
var SKA = SENTE + KA;
var SHI = SENTE + HI;
var SOU = SENTE + OU;
var STO = SENTE + TO;
var SNY = SENTE + NY;
var SNK = SENTE + NK;
var SNG = SENTE + NG;
var SUM = SENTE + UM;
var SRY = SENTE + RY;
var GFU = GOTE + FU;
var GKY = GOTE + KY;
var GKE = GOTE + KE;
var GGI = GOTE + GI;
var GKI = GOTE + KI;
var GKA = GOTE + KA;
var GHI = GOTE + HI;
var GOU = GOTE + OU;
var GTO = GOTE + TO;
var GNY = GOTE + NY;
var GNK = GOTE + NK;
var GNG = GOTE + NG;
var GUM = GOTE + UM;
var GRY = GOTE + RY;
var WALL = 64;
var komaValue = [
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
var canPromote = [
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
var Te = class _Te {
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
    const danStr = ["", "\u4E00", "\u4E8C", "\u4E09", "\u56DB", "\u4E94", "\u516D", "\u4E03", "\u516B", "\u4E5D"];
    const suji = this.to >> 4;
    const dan = this.to & 15;
    return `${sujiStr[suji]}${danStr[dan]}${this.getKomaString()}${this.promote ? "\u6210" : ""}`;
  }
  getKomaString() {
    const komaString = [
      "  ",
      "\u6B69",
      "\u9999",
      "\u6842",
      "\u9280",
      "\u91D1",
      "\u89D2",
      "\u98DB",
      "\u7389",
      "\u3068",
      "\u674F",
      "\u572D",
      "\u5168",
      "",
      "\u99AC",
      "\u7ADC"
    ];
    return komaString[getKomashu(this.koma)];
  }
};
function isSente(koma) {
  return (koma & SENTE) !== 0;
}
function isGote(koma) {
  return (koma & GOTE) !== 0;
}
function isSelf(teban, koma) {
  if (teban === SENTE) {
    return isSente(koma);
  } else {
    return isGote(koma);
  }
}
function getKomashu(koma) {
  return koma & 15;
}

// src/components/game/ShogiImproved/GenerateMovesImproved.ts
var diffDan = [1, 1, 1, 0, 0, -1, -1, -1, -2, -2, 2, 2];
var diffSuji = [-1, 0, 1, 1, -1, 1, 0, -1, 1, -1, -1, 1];
var diff = diffSuji.map((s, i) => s * 16 + diffDan[i]);
var canMove = [
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
var canJump = [
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
var GenerateMovesImproved = class {
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
    const enemyFlag = teban === SENTE ? GOTE : SENTE;
    const selfFlag = teban === SENTE ? SENTE : GOTE;
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
    const enemyFlag = teban === SENTE ? GOTE : SENTE;
    const selfFlag = teban === SENTE ? SENTE : GOTE;
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
    if (teban === SENTE) {
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
    if ((te.koma & SENTE) !== 0) {
      teban = SENTE;
      tebanAite = GOTE;
    } else {
      teban = GOTE;
      tebanAite = SENTE;
    }
    const gyokuPositionAite = k.searchGyoku(tebanAite);
    if (teban === SENTE) {
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
              if (k.teban === SENTE && dan <= 2) {
                continue;
              } else if (k.teban === GOTE && dan >= 8) {
                continue;
              }
            }
            if (komashu === FU || komashu === KY) {
              if (k.teban === SENTE && dan === 1) {
                continue;
              } else if (k.teban === GOTE && dan === 9) {
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
      const sente = k.teban === SENTE;
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
    if (teban === SENTE) {
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
      if (k.teban === GOTE) {
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
    if (isSelf(t.koma & (SENTE | GOTE), k.ban[t.to])) {
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

// src/components/game/ShogiImproved/KyokumenImproved.ts
var KyokumenImproved = class _KyokumenImproved {
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
    this.SecondaryHashSeed = [];
  }
  static {
    this.SecondaryHandHashSeed = [];
  }
  static {
    this.SecondaryTebanHashSeed = 0;
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
    this.teban = SENTE;
    this.eval = 0;
    this.psqtEval = 0;
    this.kingS = -34;
    this.kingG = -34;
    this.HashVal = 0;
    this.BanHash = 0;
    this.HandHash = 0;
    this.SecondaryHashVal = 0;
    this.SecondaryBanHash = 0;
    this.SecondaryHandHash = 0;
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
    let secondarySeed = 2403242437 >>> 0;
    const rand32Secondary = () => {
      secondarySeed = secondarySeed + 1831565813 >>> 0;
      let t = secondarySeed;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return (t ^ t >>> 14) >>> 0;
    };
    this.SecondaryHashSeed = Array(GRY + 1).fill(null).map(() => new Array(16 * 11).fill(0));
    for (let i = 0; i <= GRY; i++) {
      for (let j = 0; j < 16 * 11; j++) {
        this.SecondaryHashSeed[i][j] = rand32Secondary();
      }
    }
    this.SecondaryHandHashSeed = Array(GHI + 1).fill(null).map(() => new Array(20).fill(0));
    for (let i = 0; i <= GHI; i++) {
      for (let j = 0; j < 20; j++) {
        this.SecondaryHandHashSeed[i][j] = rand32Secondary();
      }
    }
    this.SecondaryTebanHashSeed = rand32Secondary();
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
    k.SecondaryHashVal = this.SecondaryHashVal;
    k.SecondaryBanHash = this.SecondaryBanHash;
    k.SecondaryHandHash = this.SecondaryHandHash;
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
    this.SecondaryHashVal ^= _KyokumenImproved.SecondaryTebanHashSeed;
  }
  /**
   * Toggle side-to-move while keeping `HashVal` consistent.
   * Equivalent to `setTeban(this.teban === SENTE ? GOTE : SENTE)` but slightly cheaper.
   */
  toggleTeban() {
    this.teban = this.teban === SENTE ? GOTE : SENTE;
    this.HashVal ^= _KyokumenImproved.TebanHashSeed;
    this.SecondaryHashVal ^= _KyokumenImproved.SecondaryTebanHashSeed;
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
    this.SecondaryBanHash ^= _KyokumenImproved.SecondaryHashSeed[this.get(te.to)][te.to];
    if (this.get(te.to) !== EMPTY) {
      this.eval -= komaValue[this.get(te.to)];
      if (isSente(this.get(te.to))) {
        let koma2 = this.get(te.to);
        koma2 = koma2 & 7;
        koma2 = koma2 | GOTE;
        this.hand[koma2]++;
        this.HandHash ^= _KyokumenImproved.HandHashSeed[koma2][this.hand[koma2]];
        this.SecondaryHandHash ^= _KyokumenImproved.SecondaryHandHashSeed[koma2][this.hand[koma2]];
        this.eval += komaValue[koma2];
      } else {
        let koma2 = this.get(te.to);
        koma2 = koma2 & 7;
        koma2 = koma2 | SENTE;
        this.hand[koma2]++;
        this.HandHash ^= _KyokumenImproved.HandHashSeed[koma2][this.hand[koma2]];
        this.SecondaryHandHash ^= _KyokumenImproved.SecondaryHandHashSeed[koma2][this.hand[koma2]];
        this.eval += komaValue[koma2];
      }
    }
    if (te.from === 0) {
      this.HandHash ^= _KyokumenImproved.HandHashSeed[te.koma][this.hand[te.koma]];
      this.SecondaryHandHash ^= _KyokumenImproved.SecondaryHandHashSeed[te.koma][this.hand[te.koma]];
      this.hand[te.koma]--;
    } else {
      this.put(te.from, EMPTY);
      this.BanHash ^= _KyokumenImproved.HashSeed[te.koma][te.from];
      this.BanHash ^= _KyokumenImproved.HashSeed[EMPTY][te.from];
      this.SecondaryBanHash ^= _KyokumenImproved.SecondaryHashSeed[te.koma][te.from];
      this.SecondaryBanHash ^= _KyokumenImproved.SecondaryHashSeed[EMPTY][te.from];
    }
    let koma = te.koma;
    if (te.promote) {
      this.eval -= komaValue[koma];
      koma = koma | PROMOTE;
      this.eval += komaValue[koma];
    }
    this.put(te.to, koma);
    this.BanHash ^= _KyokumenImproved.HashSeed[koma][te.to];
    this.SecondaryBanHash ^= _KyokumenImproved.SecondaryHashSeed[koma][te.to];
    this.psqtEval += _KyokumenImproved.psqtValue(koma, te.to);
    if (te.koma === SOU) {
      this.kingS = te.to;
    } else if (te.koma === GOU) {
      this.kingG = te.to;
    }
    this.HashVal = this.BanHash ^ this.HandHash ^ (this.teban === GOTE ? _KyokumenImproved.TebanHashSeed : 0);
    this.SecondaryHashVal = this.SecondaryBanHash ^ this.SecondaryHandHash ^ (this.teban === GOTE ? _KyokumenImproved.SecondaryTebanHashSeed : 0);
  }
  // Undo a move (CRITICAL: matches Java logic exactly)
  back(te) {
    this.BanHash ^= _KyokumenImproved.HashSeed[this.get(te.to)][te.to];
    this.SecondaryBanHash ^= _KyokumenImproved.SecondaryHashSeed[this.get(te.to)][te.to];
    this.psqtEval -= _KyokumenImproved.psqtValue(this.get(te.to), te.to);
    this.put(te.to, te.capture);
    this.BanHash ^= _KyokumenImproved.HashSeed[te.capture][te.to];
    this.SecondaryBanHash ^= _KyokumenImproved.SecondaryHashSeed[te.capture][te.to];
    if (te.capture !== EMPTY) {
      this.psqtEval += _KyokumenImproved.psqtValue(te.capture, te.to);
    }
    this.eval += komaValue[te.capture];
    if (te.capture !== EMPTY) {
      if (isSente(te.capture)) {
        let koma = te.capture;
        koma = koma & 7;
        koma = koma | GOTE;
        this.HandHash ^= _KyokumenImproved.HandHashSeed[koma][this.hand[koma]];
        this.SecondaryHandHash ^= _KyokumenImproved.SecondaryHandHashSeed[koma][this.hand[koma]];
        this.hand[koma]--;
        this.eval -= komaValue[koma];
      } else {
        let koma = te.capture;
        koma = koma & 7;
        koma = koma | SENTE;
        this.HandHash ^= _KyokumenImproved.HandHashSeed[koma][this.hand[koma]];
        this.SecondaryHandHash ^= _KyokumenImproved.SecondaryHandHashSeed[koma][this.hand[koma]];
        this.hand[koma]--;
        this.eval -= komaValue[koma];
      }
    }
    if (te.from === 0) {
      this.hand[te.koma]++;
      this.HandHash ^= _KyokumenImproved.HandHashSeed[te.koma][this.hand[te.koma]];
      this.SecondaryHandHash ^= _KyokumenImproved.SecondaryHandHashSeed[te.koma][this.hand[te.koma]];
    } else {
      this.put(te.from, te.koma);
      this.BanHash ^= _KyokumenImproved.HashSeed[EMPTY][te.from];
      this.BanHash ^= _KyokumenImproved.HashSeed[te.koma][te.from];
      this.SecondaryBanHash ^= _KyokumenImproved.SecondaryHashSeed[EMPTY][te.from];
      this.SecondaryBanHash ^= _KyokumenImproved.SecondaryHashSeed[te.koma][te.from];
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
    this.HashVal = this.BanHash ^ this.HandHash ^ (this.teban === GOTE ? _KyokumenImproved.TebanHashSeed : 0);
    this.SecondaryHashVal = this.SecondaryBanHash ^ this.SecondaryHandHash ^ (this.teban === GOTE ? _KyokumenImproved.SecondaryTebanHashSeed : 0);
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
    if (teban === SENTE) {
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
    this.SecondaryHandHash = 0;
    this.SecondaryBanHash = 0;
    for (let i = 0; i <= GHI; i++) {
      for (let j = 0; j <= this.hand[i]; j++) {
        this.HandHash ^= _KyokumenImproved.HandHashSeed[i][j];
        this.SecondaryHandHash ^= _KyokumenImproved.SecondaryHandHashSeed[i][j];
      }
    }
    for (let i = 1; i <= 9; i++) {
      for (let j = 1; j <= 9; j++) {
        this.BanHash ^= _KyokumenImproved.HashSeed[this.ban[i * 16 + j]][i * 16 + j];
        this.SecondaryBanHash ^= _KyokumenImproved.SecondaryHashSeed[this.ban[i * 16 + j]][i * 16 + j];
      }
    }
    this.HashVal = this.HandHash ^ this.BanHash ^ (this.teban === GOTE ? _KyokumenImproved.TebanHashSeed : 0);
    this.SecondaryHashVal = this.SecondaryHandHash ^ this.SecondaryBanHash ^ (this.teban === GOTE ? _KyokumenImproved.SecondaryTebanHashSeed : 0);
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
    const sente = this.castleScoreForSide(SENTE, this.kingS);
    const gote = this.castleScoreForSide(GOTE, this.kingG);
    return sente - gote;
  }
  castleScoreForSide(teban, kingPos) {
    if (kingPos <= 0) return 0;
    const kingSuji = kingPos >> 4;
    const kingDan = kingPos & 15;
    const ks = teban === SENTE ? kingSuji : 10 - kingSuji;
    const kd = teban === SENTE ? kingDan : 10 - kingDan;
    const at = (sujiSente, danSente) => {
      const suji = teban === SENTE ? sujiSente : 10 - sujiSente;
      const dan = teban === SENTE ? danSente : 10 - danSente;
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
    score += this.evaluateOneKingSafetyV1(SENTE, this.kingS);
    score -= this.evaluateOneKingSafetyV1(GOTE, this.kingG);
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
    if (teban === SENTE) {
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
    score += this.evaluateOneKingSafetyV2(SENTE, this.kingS, phase);
    score -= this.evaluateOneKingSafetyV2(GOTE, this.kingG, phase);
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
    const forward = teban === SENTE ? -1 : 1;
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
    if (teban === SENTE) {
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
    this.teban = SENTE;
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
    const _sujiStr = ["", "\uFF11", "\uFF12", "\uFF13", "\uFF14", "\uFF15", "\uFF16", "\uFF17", "\uFF18", "\uFF19"];
    const danStr = ["", "\u4E00", "\u4E8C", "\u4E09", "\u56DB", "\u4E94", "\u516D", "\u4E03", "\u516B", "\u4E5D"];
    let s = "";
    s += "\u5F8C\u624B\u6301\u99D2\uFF1A";
    for (let i = GFU; i <= GHI; i++) {
      if (this.hand[i] === 1) {
        s += this.getKomaString(i);
      } else if (this.hand[i] > 1) {
        s += this.getKomaString(i) + this.hand[i];
      }
    }
    s += "\n";
    s += " \uFF19 \uFF18 \uFF17 \uFF16 \uFF15 \uFF14 \uFF13 \uFF12 \uFF11\n";
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
    s += "\u5148\u624B\u6301\u99D2\uFF1A";
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
      "\u6B69",
      "\u9999",
      "\u6842",
      "\u9280",
      "\u91D1",
      "\u89D2",
      "\u98DB",
      "\u7389",
      "\u3068",
      "\u674F",
      "\u572D",
      "\u5168",
      "",
      "\u99AC",
      "\u7ADC"
    ];
    return komaString[this.getKomashu(koma)];
  }
  toBanStringForKoma(koma) {
    const komaString = [
      "  ",
      "\u6B69",
      "\u9999",
      "\u6842",
      "\u9280",
      "\u91D1",
      "\u89D2",
      "\u98DB",
      "\u7389",
      "\u3068",
      "\u674F",
      "\u572D",
      "\u5168",
      "",
      "\u99AC",
      "\u7ADC"
    ];
    if (koma === EMPTY) {
      return "   ";
    } else if ((koma & SENTE) !== 0) {
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
      const senteHandKey = SENTE + pieceType;
      for (let j = 0; j < this.hand[senteHandKey]; j++) {
        hands[0].push(senteHandKey);
      }
    }
    for (let pieceType = FU; pieceType <= HI; pieceType++) {
      const goteHandKey = GOTE + pieceType;
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

// wasm-spike/nnue-ref.ts
var NNUE_H1 = 256;
var NNUE_H2 = 32;
var NNUE_BOARD_FEATS = 28 * 81;
var NNUE_HAND_FEATS = 14;
var NNUE_KP_BUCKETS = 6;
var NNUE_HALFKP_BUCKETS = 81;
var NNUE_HALFKP_DUAL_FORMAT = 82;
var NNUE_BONAPIECE_HALFKP_FORMAT = 83;
var NNUE_BONAPIECE_HALFKP_SINGLE_FORMAT = 84;
var NNUE_BONAPIECE_FE_END = 1548;
function layoutFor(buckets) {
  const w1BoardBytes = buckets * NNUE_BOARD_FEATS * NNUE_H1 * 2;
  const w1HandBytes = buckets * NNUE_HAND_FEATS * NNUE_H1 * 2;
  const b1Bytes = NNUE_H1 * 4;
  const w2Bytes = NNUE_H2 * NNUE_H1 * 2;
  const b2Bytes = NNUE_H2 * 4;
  const w3Bytes = NNUE_H2 * 2;
  const b3Bytes = 4;
  const w1BoardOff = 0;
  const w1HandOff = w1BoardOff + w1BoardBytes;
  const b1Off = w1HandOff + w1HandBytes;
  const w2Off = b1Off + b1Bytes;
  const b2Off = w2Off + w2Bytes;
  const w3Off = b2Off + b2Bytes;
  const b3Off = w3Off + w3Bytes;
  return {
    buckets,
    w1BoardOff,
    w1HandOff,
    b1Off,
    w2Off,
    b2Off,
    w3Off,
    b3Off,
    totalBytes: b3Off + b3Bytes
  };
}
var NNUE_LAYOUT = layoutFor(1);
var NNUE_KP_LAYOUT = layoutFor(NNUE_KP_BUCKETS);
var NNUE_HALFKP_LAYOUT = layoutFor(NNUE_HALFKP_BUCKETS);
var NNUE_HALFKP_DUAL_LAYOUT = (() => {
  const w1BoardOff = 0;
  const w1HandOff = NNUE_HALFKP_BUCKETS * NNUE_BOARD_FEATS * NNUE_H1 * 2;
  const b1Off = w1HandOff + NNUE_HALFKP_BUCKETS * NNUE_HAND_FEATS * NNUE_H1 * 2;
  const w2Off = b1Off + NNUE_H1 * 4;
  const b2Off = w2Off + NNUE_H2 * (NNUE_H1 * 2) * 2;
  const w3Off = b2Off + NNUE_H2 * 4;
  const b3Off = w3Off + NNUE_H2 * NNUE_H2 * 2;
  const w4Off = b3Off + NNUE_H2 * 4;
  const b4Off = w4Off + NNUE_H2 * 2;
  return {
    format: NNUE_HALFKP_DUAL_FORMAT,
    buckets: NNUE_HALFKP_BUCKETS,
    w1BoardOff,
    w1HandOff,
    b1Off,
    w2Off,
    b2Off,
    w3Off,
    b3Off,
    w4Off,
    b4Off,
    totalBytes: b4Off + 4
  };
})();
var NNUE_BONAPIECE_HALFKP_LAYOUT = (() => {
  const w1BoardOff = 0;
  const w1HandOff = 81 * NNUE_BONAPIECE_FE_END * NNUE_H1 * 2;
  const b1Off = w1HandOff;
  const w2Off = b1Off + NNUE_H1 * 4;
  const b2Off = w2Off + NNUE_H2 * (NNUE_H1 * 2) * 2;
  const w3Off = b2Off + NNUE_H2 * 4;
  const b3Off = w3Off + NNUE_H2 * NNUE_H2 * 2;
  const w4Off = b3Off + NNUE_H2 * 4;
  const b4Off = w4Off + NNUE_H2 * 2;
  return {
    format: NNUE_BONAPIECE_HALFKP_FORMAT,
    buckets: NNUE_HALFKP_BUCKETS,
    w1BoardOff,
    w1HandOff,
    b1Off,
    w2Off,
    b2Off,
    w3Off,
    b3Off,
    w4Off,
    b4Off,
    totalBytes: b4Off + 4
  };
})();
var NNUE_BONAPIECE_HALFKP_SINGLE_LAYOUT = (() => {
  const w1BoardOff = 0;
  const w1HandOff = NNUE_HALFKP_BUCKETS * NNUE_BONAPIECE_FE_END * NNUE_H1 * 2;
  const b1Off = w1HandOff;
  const w2Off = b1Off + NNUE_H1 * 4;
  const b2Off = w2Off + NNUE_H2 * NNUE_H1 * 2;
  const w3Off = b2Off + NNUE_H2 * 4;
  const b3Off = w3Off + NNUE_H2 * 2;
  return {
    format: NNUE_BONAPIECE_HALFKP_SINGLE_FORMAT,
    buckets: NNUE_HALFKP_BUCKETS,
    w1BoardOff,
    w1HandOff,
    b1Off,
    w2Off,
    b2Off,
    w3Off,
    b3Off,
    totalBytes: b3Off + 4
  };
})();
function bucketsForByteLength(byteLength) {
  if (byteLength === NNUE_LAYOUT.totalBytes) return 1;
  if (byteLength === NNUE_KP_LAYOUT.totalBytes) return NNUE_KP_BUCKETS;
  if (byteLength === NNUE_HALFKP_LAYOUT.totalBytes) return NNUE_HALFKP_BUCKETS;
  if (byteLength === NNUE_HALFKP_DUAL_LAYOUT.totalBytes) return NNUE_HALFKP_DUAL_FORMAT;
  if (byteLength === NNUE_BONAPIECE_HALFKP_LAYOUT.totalBytes) return NNUE_BONAPIECE_HALFKP_FORMAT;
  if (byteLength === NNUE_BONAPIECE_HALFKP_SINGLE_LAYOUT.totalBytes) {
    return NNUE_BONAPIECE_HALFKP_SINGLE_FORMAT;
  }
  throw new Error(
    `unrecognized weights.bin size ${byteLength} (expected ${NNUE_LAYOUT.totalBytes}, ${NNUE_KP_LAYOUT.totalBytes}, ${NNUE_HALFKP_LAYOUT.totalBytes}, ${NNUE_HALFKP_DUAL_LAYOUT.totalBytes}, ${NNUE_BONAPIECE_HALFKP_LAYOUT.totalBytes}, or ${NNUE_BONAPIECE_HALFKP_SINGLE_LAYOUT.totalBytes})`
  );
}
var MATERIAL_VU = [100, 430, 450, 640, 690, 890, 1040, 0, 1200, 1150, 1150, 1150, 1450, 1630].map(
  (v) => Math.round(v / 32)
);

// wasm-spike/nnue-fixed-time-opening.ts
var import_node_crypto = require("node:crypto");
var NNUE_FIXED_TIME_OPENING_PLIES = 6;
var NNUE_FIXED_TIME_OPENING_DOMAIN = "shogi-nnue-fixed-time-opening-v1\0";
var NNUE_FIXED_TIME_SEED_MULTIPLIER = 15485863;
var NNUE_FIXED_TIME_PAIR_OFFSET = 104729;
var NNUE_FIXED_TIME_SEED_DOMAIN = 6221056;
function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = state + 1831565813 >>> 0;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}
function pickCuratedOpeningMove(position, moves, random) {
  const quiet = moves.filter(
    (move) => move.from !== 0 && move.capture === EMPTY && !move.promote
  );
  const pawnStartDan = position.teban === SENTE ? 7 : 3;
  const pawnNextDan = position.teban === SENTE ? 6 : 4;
  const pawnPushes = quiet.filter(
    (move) => getKomashu(move.koma) === FU && (move.from & 15) === pawnStartDan && (move.to & 15) === pawnNextDan
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
function nnueFixedTimeDerivedSeed(seedBase, pairIndex = 0) {
  if (!Number.isSafeInteger(seedBase) || seedBase < 1 || !Number.isSafeInteger(pairIndex) || pairIndex < 0) {
    throw new Error("fixed-time opening seed inputs must be nonnegative safe integers");
  }
  const derived = NNUE_FIXED_TIME_SEED_DOMAIN + seedBase * NNUE_FIXED_TIME_SEED_MULTIPLIER + pairIndex * NNUE_FIXED_TIME_PAIR_OFFSET;
  if (!Number.isSafeInteger(derived)) {
    throw new Error("fixed-time opening derived seed exceeds safe integer range");
  }
  return derived;
}
function nnueFixedTimeOpeningFingerprint(moves) {
  const canonical = moves.map((move) => [
    move.koma,
    move.from,
    move.to,
    move.promote ? 1 : 0
  ]);
  return (0, import_node_crypto.createHash)("sha256").update(NNUE_FIXED_TIME_OPENING_DOMAIN).update(JSON.stringify(canonical)).digest("hex");
}
function buildNnueFixedTimeOpening(seedBase, pairIndex = 0) {
  const derivedSeed = nnueFixedTimeDerivedSeed(seedBase, pairIndex);
  const position = new KyokumenImproved();
  position.initHirate();
  const random = mulberry32(derivedSeed);
  const moves = [];
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
    fingerprint: nnueFixedTimeOpeningFingerprint(moves)
  });
}

// wasm-spike/search-driver.ts
var import_node_fs = require("node:fs");
var import_node_path = require("node:path");

// src/components/game/ShogiImproved/MoveListImproved.ts
var MoveListImproved = class {
  constructor() {
    this.moves = [];
    this.size = 0;
  }
  reset() {
    this.size = 0;
  }
  trim() {
    this.moves.length = this.size;
    return this.moves;
  }
  push(koma, from, to, promote, capture) {
    const index = this.size++;
    const te = this.moves[index];
    if (te) {
      te.koma = koma;
      te.from = from;
      te.to = to;
      te.promote = promote;
      te.capture = capture;
      te.value = 0;
      return;
    }
    this.moves[index] = new Te(koma, from, to, promote, capture);
  }
};

// src/components/game/ShogiImproved/MateSolverImproved.ts
var MateSolverImproved = class _MateSolverImproved {
  constructor() {
    // Pooled per-ply move lists (same pattern as the engines): zero allocation per node.
    this.moveLists = Array.from(
      { length: _MateSolverImproved.MAX_PLY + 1 },
      () => new MoveListImproved()
    );
    this.nodes = 0;
    this.maxNodes = 0;
    this.startTime = 0;
    this.maxTimeMs = 0;
    this.aborted = false;
    // Full dual-hash identities of every position on the current search path. The primary
    // 30-bit hash remains the outer-map index; the independent full-width secondary lock
    // prevents a collision from being mistaken for a repetition.
    this.pathHashes = /* @__PURE__ */ new Map();
  }
  static {
    this.MAX_PLY = 24;
  }
  hasPathHash(primary, secondary) {
    return this.pathHashes.get(primary)?.has(secondary) ?? false;
  }
  addPathHash(primary, secondary) {
    let bucket = this.pathHashes.get(primary);
    if (!bucket) {
      bucket = /* @__PURE__ */ new Set();
      this.pathHashes.set(primary, bucket);
    }
    bucket.add(secondary);
  }
  deletePathHash(primary, secondary) {
    const bucket = this.pathHashes.get(primary);
    if (!bucket) return;
    bucket.delete(secondary);
    if (bucket.size === 0) this.pathHashes.delete(primary);
  }
  nowMs() {
    return typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
  }
  /**
   * Returns true (and latches `aborted`) once the node or time budget is exhausted.
   * Once aborted, every result bubbling up is treated as "unknown / no mate proven".
   */
  budgetExceeded() {
    if (this.aborted) return true;
    if (this.maxNodes > 0 && this.nodes >= this.maxNodes) {
      this.aborted = true;
      return true;
    }
    if (this.maxTimeMs > 0 && (this.nodes & 127) === 0 && this.nowMs() - this.startTime >= this.maxTimeMs) {
      this.aborted = true;
      return true;
    }
    return false;
  }
  /**
   * Cheap pre-filter for drop moves: can a `koma` dropped on `to` possibly check the king on
   * `enemyKing`? Drops never give discovered check, so a geometric test is exact up to blockers
   * (sliding paths are validated by the real make/`isKingInCheck` test afterwards).
   *
   * This matters because endgame positions have large hands, and drops dominate the pseudo-legal
   * move list (~70 drop squares per piece type); skipping the make/unmake for the vast majority
   * of non-checking drops is the solver's main speed lever.
   */
  dropMayGiveCheck(koma, to, enemyKing, attacker) {
    const ds = (enemyKing >> 4) - (to >> 4);
    const dd = (enemyKing & 15) - (to & 15);
    const forward = attacker === SENTE ? -1 : 1;
    const type = getKomashu(koma);
    switch (type) {
      case FU:
        return ds === 0 && dd === forward;
      case KE:
        return Math.abs(ds) === 1 && dd === forward * 2;
      case GI:
        if (Math.abs(ds) > 1 || Math.abs(dd) > 1) return false;
        return dd === forward || Math.abs(ds) === 1 && dd !== 0;
      case KI:
        if (Math.abs(ds) > 1 || Math.abs(dd) > 1) return false;
        return !(dd === -forward && Math.abs(ds) === 1);
      case KY:
        return ds === 0 && (forward < 0 ? dd < 0 : dd > 0);
      case KA:
        return ds !== 0 && Math.abs(ds) === Math.abs(dd);
      case HI:
        return ds === 0 || dd === 0;
      default:
        return true;
    }
  }
  /**
   * Search for a forced mate for the side to move in `k0`.
   *
   * Returns the first move of the shortest forced mate found within the budget, or `null` when
   * no mate was proven (either genuinely no mate within `maxPlies`, or the budget ran out —
   * the caller should treat both the same way: fall back to the normal search).
   */
  solve(k0, options = {}) {
    const requested = options.maxPlies ?? 7;
    const maxPlies = Math.min(_MateSolverImproved.MAX_PLY - 1, requested % 2 === 0 ? requested - 1 : requested);
    if (maxPlies < 1) return null;
    this.maxNodes = options.maxNodes ?? 2e5;
    this.maxTimeMs = options.maxTimeMs ?? 200;
    this.nodes = 0;
    this.aborted = false;
    this.startTime = this.nowMs();
    this.pathHashes.clear();
    const k = k0.clone();
    this.addPathHash(k.HashVal, k.SecondaryHashVal);
    for (let plies = 1; plies <= maxPlies; plies += 2) {
      const te = this.attack(k, plies, 0);
      if (te) return te;
      if (this.aborted) return null;
    }
    return null;
  }
  /**
   * OR node: the attacker (side to move in `k`) tries every legal checking move.
   * Returns a mating move if one forces mate within `pliesLeft` plies, else null.
   */
  attack(k, pliesLeft, ply) {
    if (pliesLeft < 1) return null;
    if (ply >= _MateSolverImproved.MAX_PLY) return null;
    this.nodes++;
    if (this.budgetExceeded()) return null;
    const attacker = k.teban;
    const defender = attacker === SENTE ? GOTE : SENTE;
    const enemyKing = attacker === SENTE ? k.kingG : k.kingS;
    if (enemyKing <= 0) return null;
    const moves = GenerateMovesImproved.generatePseudoLegalMovesPooled(k, this.moveLists[ply]);
    for (const te of moves) {
      if (te.from === 0 && !this.dropMayGiveCheck(te.koma, te.to, enemyKing, attacker)) continue;
      k.move(te);
      if (GenerateMovesImproved.isKingInCheck(k, attacker)) {
        k.back(te);
        continue;
      }
      if (!GenerateMovesImproved.isKingInCheck(k, defender)) {
        k.back(te);
        continue;
      }
      k.toggleTeban();
      let mated = false;
      const hashA = k.HashVal;
      const hashB = k.SecondaryHashVal;
      if (!this.hasPathHash(hashA, hashB)) {
        this.addPathHash(hashA, hashB);
        mated = this.defend(k, pliesLeft - 1, ply + 1);
        this.deletePathHash(hashA, hashB);
      }
      k.toggleTeban();
      k.back(te);
      if (this.aborted) return null;
      if (mated) return te.clone();
    }
    return null;
  }
  /**
   * AND node: the defender (side to move in `k`, currently in check) tries every legal reply.
   * Returns true only when EVERY legal reply still leads to mate within the remaining budget
   * (or when there is no legal reply at all — that is the checkmate base case).
   */
  defend(k, pliesLeft, ply) {
    if (ply >= _MateSolverImproved.MAX_PLY) return false;
    this.nodes++;
    if (this.budgetExceeded()) return false;
    const defender = k.teban;
    const moves = GenerateMovesImproved.generatePseudoLegalMovesPooled(k, this.moveLists[ply]);
    for (const te of moves) {
      k.move(te);
      if (GenerateMovesImproved.isKingInCheck(k, defender)) {
        k.back(te);
        continue;
      }
      if (pliesLeft <= 1) {
        k.back(te);
        return false;
      }
      k.toggleTeban();
      let refuted = true;
      const hashA = k.HashVal;
      const hashB = k.SecondaryHashVal;
      if (!this.hasPathHash(hashA, hashB)) {
        this.addPathHash(hashA, hashB);
        refuted = this.attack(k, pliesLeft - 1, ply + 1) === null;
        this.deletePathHash(hashA, hashB);
      }
      k.toggleTeban();
      k.back(te);
      if (this.aborted || refuted) return false;
    }
    return true;
  }
};

// src/components/game/ShogiImproved/InitialPositionImproved.ts
var InitialPositionImproved = class {
  static {
    // Standard initial position (hirate)
    this.HIRATE = [
      [GKY, GKE, GGI, GKI, GOU, GKI, GGI, GKE, GKY],
      // Rank 1
      [EMPTY, GHI, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, GKA, EMPTY],
      // Rank 2
      [GFU, GFU, GFU, GFU, GFU, GFU, GFU, GFU, GFU],
      // Rank 3
      [EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY],
      // Rank 4
      [EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY],
      // Rank 5
      [EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY],
      // Rank 6
      [SFU, SFU, SFU, SFU, SFU, SFU, SFU, SFU, SFU],
      // Rank 7
      [EMPTY, SKA, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, SHI, EMPTY],
      // Rank 8
      [SKY, SKE, SGI, SKI, SOU, SKI, SGI, SKE, SKY]
      // Rank 9
    ];
  }
  // Create and return initial position
  static createInitialPosition() {
    const kyokumen = new KyokumenImproved();
    kyokumen.initHirate();
    return kyokumen;
  }
  // Set up initial position
  static setupHirate(kyokumen) {
    kyokumen.initHirate();
  }
  // Set up custom position from array
  static setupCustom(kyokumen, position) {
    for (let suji = 1; suji <= 9; suji++) {
      for (let dan = 1; dan <= 9; dan++) {
        kyokumen.ban[(suji << 4) + dan] = EMPTY;
      }
    }
    for (let dan = 1; dan <= 9; dan++) {
      for (let suji = 9; suji >= 1; suji--) {
        if (dan - 1 < position.length && 9 - suji < position[dan - 1].length) {
          kyokumen.ban[(suji << 4) + dan] = position[dan - 1][9 - suji];
        }
      }
    }
    for (let koma = SFU; koma <= GHI; koma++) {
      kyokumen.hand[koma] = 0;
    }
    kyokumen.initAll();
  }
  static {
    // Common handicap positions
    this.LANCE_HANDICAP = [
      [EMPTY, GKE, GGI, GKI, GOU, GKI, GGI, GKE, GKY],
      // Left lance removed
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
  static {
    this.BISHOP_HANDICAP = [
      [GKY, GKE, GGI, GKI, GOU, GKI, GGI, GKE, GKY],
      [EMPTY, GHI, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY],
      // Bishop removed
      [GFU, GFU, GFU, GFU, GFU, GFU, GFU, GFU, GFU],
      [EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY],
      [EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY],
      [EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY],
      [SFU, SFU, SFU, SFU, SFU, SFU, SFU, SFU, SFU],
      [EMPTY, SKA, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, SHI, EMPTY],
      [SKY, SKE, SGI, SKI, SOU, SKI, SGI, SKE, SKY]
    ];
  }
  static {
    this.ROOK_HANDICAP = [
      [GKY, GKE, GGI, GKI, GOU, GKI, GGI, GKE, GKY],
      [EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, GKA, EMPTY],
      // Rook removed
      [GFU, GFU, GFU, GFU, GFU, GFU, GFU, GFU, GFU],
      [EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY],
      [EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY],
      [EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY],
      [SFU, SFU, SFU, SFU, SFU, SFU, SFU, SFU, SFU],
      [EMPTY, SKA, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, SHI, EMPTY],
      [SKY, SKE, SGI, SKI, SOU, SKI, SGI, SKE, SKY]
    ];
  }
  static {
    this.TWO_PIECE_HANDICAP = [
      [GKY, GKE, GGI, GKI, GOU, GKI, GGI, GKE, GKY],
      [EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY],
      // Rook and bishop removed
      [GFU, GFU, GFU, GFU, GFU, GFU, GFU, GFU, GFU],
      [EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY],
      [EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY],
      [EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY],
      [SFU, SFU, SFU, SFU, SFU, SFU, SFU, SFU, SFU],
      [EMPTY, SKA, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, SHI, EMPTY],
      [SKY, SKE, SGI, SKI, SOU, SKI, SGI, SKE, SKY]
    ];
  }
  // Set up handicap games
  static setupLanceHandicap(kyokumen) {
    this.setupCustom(kyokumen, this.LANCE_HANDICAP);
  }
  static setupBishopHandicap(kyokumen) {
    this.setupCustom(kyokumen, this.BISHOP_HANDICAP);
  }
  static setupRookHandicap(kyokumen) {
    this.setupCustom(kyokumen, this.ROOK_HANDICAP);
  }
  static setupTwoPieceHandicap(kyokumen) {
    this.setupCustom(kyokumen, this.TWO_PIECE_HANDICAP);
  }
};

// src/components/game/ShogiImproved/OpeningBookImproved.ts
function posOf(suji, dan) {
  if (suji === 0 && dan === 0) return 0;
  return (suji << 4) + dan;
}
function moveKey(te) {
  return `${te.koma}:${te.from}->${te.to}:${te.promote ? 1 : 0}`;
}
function evalForSideToMove(k) {
  const evalSente = k.evaluateForOpeningBook();
  return k.teban === SENTE ? evalSente : -evalSente;
}
function staticEvalAfterMove(root, move, evalBeforeMove) {
  root.move(move);
  let score = evalForSideToMove(root);
  const moved = root.get(move.to);
  const movedValue = Math.abs(komaValue[moved]) | 0;
  if (movedValue > 0) {
    const enemyLeastAttacker = GenerateMovesImproved.getLeastAttackerValue(root, move.to, root.teban);
    if (Number.isFinite(enemyLeastAttacker)) {
      const selfLeastDefender = GenerateMovesImproved.getLeastAttackerValue(
        root,
        move.to,
        root.teban === SENTE ? GOTE : SENTE
      );
      const capturedValue = Math.abs(komaValue[move.capture]) | 0;
      const movedTradeValue = Math.abs(komaValue[move.koma]) | 0;
      if (!Number.isFinite(selfLeastDefender)) {
        score = Math.min(score - movedValue, evalBeforeMove + capturedValue - movedTradeValue);
      } else if ((enemyLeastAttacker | 0) + 150 < movedValue) {
        score = Math.min(
          score - (movedValue - (enemyLeastAttacker | 0)),
          evalBeforeMove + capturedValue - movedTradeValue + (enemyLeastAttacker | 0)
        );
      }
    }
  }
  root.back(move);
  return score;
}
function openingThresholdByDifficulty(difficulty) {
  switch (difficulty) {
    case "easy":
      return 260;
    case "medium":
      return 180;
    case "hard":
      return 140;
    case "expert":
      return 110;
    case "master":
      return 90;
  }
}
function varietyMarginByDifficulty(difficulty) {
  switch (difficulty) {
    case "easy":
      return 140;
    case "medium":
      return 80;
    case "hard":
      return 40;
    case "expert":
    case "master":
      return 0;
  }
}
function varietyPoolSizeByDifficulty(difficulty) {
  switch (difficulty) {
    case "easy":
      return 4;
    case "medium":
      return 3;
    case "hard":
      return 2;
    case "expert":
    case "master":
      return 1;
  }
}
var OPENING_LINES = [
  {
    name: "\u77E2\u5009 (basic)",
    category: "\u76F8\u5C45\u98DB\u8ECA",
    priority: 90,
    moves: [
      { teban: SENTE, from: { suji: 7, dan: 7 }, to: { suji: 7, dan: 6 } },
      // ☗７六歩
      { teban: GOTE, from: { suji: 3, dan: 3 }, to: { suji: 3, dan: 4 } },
      // ☖３四歩
      { teban: SENTE, from: { suji: 2, dan: 7 }, to: { suji: 2, dan: 6 } },
      // ☗２六歩
      { teban: GOTE, from: { suji: 8, dan: 3 }, to: { suji: 8, dan: 4 } },
      // ☖８四歩
      { teban: SENTE, from: { suji: 6, dan: 9 }, to: { suji: 6, dan: 8 } },
      // ☗６八金
      { teban: GOTE, from: { suji: 4, dan: 1 }, to: { suji: 3, dan: 2 } },
      // ☖３二金 (囲い方向)
      // IMPORTANT move order (YaneuraOu-verified): ☗６六歩で角道を止めてから☗７八銀。
      // 旧手順（☗７八銀→☗６六歩）は７八銀の瞬間に☖８八角成で角をタダ取りされる大悪手だった
      // （７九銀が８八の唯一の受けで、それが７八に上がると８八が浮く）。
      { teban: SENTE, from: { suji: 6, dan: 7 }, to: { suji: 6, dan: 6 } },
      // ☗６六歩
      { teban: GOTE, from: { suji: 7, dan: 1 }, to: { suji: 6, dan: 2 } },
      // ☖６二銀
      { teban: SENTE, from: { suji: 7, dan: 9 }, to: { suji: 7, dan: 8 } },
      // ☗７八銀
      { teban: GOTE, from: { suji: 5, dan: 3 }, to: { suji: 5, dan: 4 } },
      // ☖５四歩
      { teban: SENTE, from: { suji: 2, dan: 6 }, to: { suji: 2, dan: 5 } },
      // ☗２五歩
      { teban: GOTE, from: { suji: 8, dan: 4 }, to: { suji: 8, dan: 5 } },
      // ☖８五歩
      { teban: SENTE, from: { suji: 7, dan: 8 }, to: { suji: 7, dan: 7 } },
      // ☗７七銀 (矢倉の骨格)
      { teban: GOTE, from: { suji: 6, dan: 3 }, to: { suji: 6, dan: 4 } },
      // ☖６四歩
      // YaneuraOu depth18 最善手による延長 (2026-07): ▲６八金を７八へ寄せ、△７四歩から▲２四歩の飛先交換まで。
      { teban: SENTE, from: { suji: 6, dan: 8 }, to: { suji: 7, dan: 8 } },
      // ☗７八金 (右金を寄せて囲いを整える)
      { teban: GOTE, from: { suji: 7, dan: 3 }, to: { suji: 7, dan: 4 } },
      // ☖７四歩
      { teban: SENTE, from: { suji: 2, dan: 5 }, to: { suji: 2, dan: 4 } },
      // ☗２四歩 (飛先交換)
      { teban: GOTE, from: { suji: 2, dan: 3 }, to: { suji: 2, dan: 4 } }
      // ☖同歩
    ]
  },
  {
    name: "\u96C1\u6728 (basic)",
    category: "\u76F8\u5C45\u98DB\u8ECA",
    priority: 82,
    moves: [
      { teban: SENTE, from: { suji: 7, dan: 7 }, to: { suji: 7, dan: 6 } },
      // ☗７六歩
      { teban: GOTE, from: { suji: 3, dan: 3 }, to: { suji: 3, dan: 4 } },
      // ☖３四歩
      { teban: SENTE, from: { suji: 2, dan: 7 }, to: { suji: 2, dan: 6 } },
      // ☗２六歩
      { teban: GOTE, from: { suji: 8, dan: 3 }, to: { suji: 8, dan: 4 } },
      // ☖８四歩
      { teban: SENTE, from: { suji: 6, dan: 9 }, to: { suji: 6, dan: 8 } },
      // ☗６八金
      { teban: GOTE, from: { suji: 4, dan: 1 }, to: { suji: 4, dan: 2 } },
      // ☖４二金
      // ☗６六歩→☗７八銀の順 (矢倉basicと同じ理由: 先に７八銀は☖８八角成でタダ取りされる)。
      { teban: SENTE, from: { suji: 6, dan: 7 }, to: { suji: 6, dan: 6 } },
      // ☗６六歩
      { teban: GOTE, from: { suji: 7, dan: 1 }, to: { suji: 6, dan: 2 } },
      // ☖６二銀
      { teban: SENTE, from: { suji: 7, dan: 9 }, to: { suji: 7, dan: 8 } },
      // ☗７八銀
      { teban: GOTE, from: { suji: 5, dan: 3 }, to: { suji: 5, dan: 4 } },
      // ☖５四歩
      { teban: SENTE, from: { suji: 3, dan: 9 }, to: { suji: 4, dan: 8 } },
      // ☗４八銀 (雁木へ)
      { teban: GOTE, from: { suji: 3, dan: 1 }, to: { suji: 3, dan: 2 } },
      // ☖３二銀
      { teban: SENTE, from: { suji: 8, dan: 8 }, to: { suji: 7, dan: 7 } },
      // ☗７七角
      // YaneuraOu depth18 最善手による延長 (2026-07): △８五歩〜▲４六歩、△３三銀〜▲６七銀の雁木の骨格。
      { teban: GOTE, from: { suji: 8, dan: 4 }, to: { suji: 8, dan: 5 } },
      // ☖８五歩
      { teban: SENTE, from: { suji: 4, dan: 7 }, to: { suji: 4, dan: 6 } },
      // ☗４六歩 (雁木の形)
      { teban: GOTE, from: { suji: 3, dan: 2 }, to: { suji: 3, dan: 3 } },
      // ☖３三銀 (雁木を組む)
      { teban: SENTE, from: { suji: 7, dan: 8 }, to: { suji: 6, dan: 7 } }
      // ☗６七銀 (雁木の骨格)
    ]
  },
  {
    name: "\u89D2\u63DB\u308F\u308A (basic)",
    category: "\u76F8\u5C45\u98DB\u8ECA",
    priority: 80,
    moves: [
      { teban: SENTE, from: { suji: 7, dan: 7 }, to: { suji: 7, dan: 6 } },
      // ☗７六歩
      { teban: GOTE, from: { suji: 3, dan: 3 }, to: { suji: 3, dan: 4 } },
      // ☖３四歩
      { teban: SENTE, from: { suji: 2, dan: 7 }, to: { suji: 2, dan: 6 } },
      // ☗２六歩
      { teban: GOTE, from: { suji: 8, dan: 3 }, to: { suji: 8, dan: 4 } },
      // ☖８四歩
      { teban: SENTE, from: { suji: 2, dan: 6 }, to: { suji: 2, dan: 5 } },
      // ☗２五歩
      { teban: GOTE, from: { suji: 8, dan: 4 }, to: { suji: 8, dan: 5 } },
      // ☖８五歩
      // YaneuraOu depth18 最善手による延長 (2026-07): 飛先交換。
      // (居飛車 (…84 early)/(…34 early) も同一局面に合流するため、この延長は共有される。)
      { teban: SENTE, from: { suji: 2, dan: 5 }, to: { suji: 2, dan: 4 } },
      // ☗２四歩
      { teban: GOTE, from: { suji: 2, dan: 3 }, to: { suji: 2, dan: 4 } },
      // ☖同歩
      { teban: SENTE, from: { suji: 2, dan: 8 }, to: { suji: 2, dan: 4 } },
      // ☗同飛
      { teban: GOTE, from: { suji: 4, dan: 1 }, to: { suji: 3, dan: 2 } },
      // ☖３二金
      // YaneuraOu depth18 最善手による延長 (2026-07): ▲７八金（６九の右金）で飛車を安定させ、△８六歩▲同歩△同飛のお返し交換。
      { teban: SENTE, from: { suji: 6, dan: 9 }, to: { suji: 7, dan: 8 } },
      // ☗７八金 (右金を上がって飛車を安定)
      { teban: GOTE, from: { suji: 8, dan: 5 }, to: { suji: 8, dan: 6 } },
      // ☖８六歩 (お返しの飛先交換)
      { teban: SENTE, from: { suji: 8, dan: 7 }, to: { suji: 8, dan: 6 } },
      // ☗同歩
      { teban: GOTE, from: { suji: 8, dan: 2 }, to: { suji: 8, dan: 6 } }
      // ☖同飛
    ]
  },
  {
    // Classic bishop exchange trigger: ☗８八角→☗２二角成
    // This is intentionally short: bishop exchanges often branch quickly into tactics.
    name: "\u89D2\u63DB\u308F\u308A (Bx22+)",
    category: "\u76F8\u5C45\u98DB\u8ECA",
    priority: 78,
    moves: [
      { teban: SENTE, from: { suji: 7, dan: 7 }, to: { suji: 7, dan: 6 } },
      // ☗７六歩
      { teban: GOTE, from: { suji: 3, dan: 3 }, to: { suji: 3, dan: 4 } },
      // ☖３四歩
      { teban: SENTE, from: { suji: 2, dan: 7 }, to: { suji: 2, dan: 6 } },
      // ☗２六歩
      { teban: GOTE, from: { suji: 8, dan: 3 }, to: { suji: 8, dan: 4 } },
      // ☖８四歩
      { teban: SENTE, from: { suji: 2, dan: 6 }, to: { suji: 2, dan: 5 } },
      // ☗２五歩
      { teban: GOTE, from: { suji: 8, dan: 4 }, to: { suji: 8, dan: 5 } },
      // ☖８五歩
      // Bishop/rook promotion is forced in this engine when legal.
      { teban: SENTE, from: { suji: 8, dan: 8 }, to: { suji: 2, dan: 2 }, promote: true },
      // ☗２二角成
      { teban: GOTE, from: { suji: 3, dan: 1 }, to: { suji: 2, dan: 2 } }
      // ☖同銀
    ]
  },
  {
    // 対原始棒銀: ▲２五歩には△３三角、銀の進軍には△２二銀/△３二金、▲１五銀は△１四歩で防ぐ。
    name: "\u5BFE\u539F\u59CB\u68D2\u9280 (\uFF13\u4E09\u89D2\u578B)",
    category: "\u5BFE\u68D2\u9280",
    priority: 88,
    moves: [
      { teban: SENTE, from: { suji: 2, dan: 7 }, to: { suji: 2, dan: 6 } },
      // ☗２六歩
      { teban: GOTE, from: { suji: 3, dan: 3 }, to: { suji: 3, dan: 4 } },
      // ☖３四歩
      { teban: SENTE, from: { suji: 2, dan: 6 }, to: { suji: 2, dan: 5 } },
      // ☗２五歩
      { teban: GOTE, from: { suji: 2, dan: 2 }, to: { suji: 3, dan: 3 } },
      // ☖３三角
      { teban: SENTE, from: { suji: 3, dan: 9 }, to: { suji: 3, dan: 8 } },
      // ☗３八銀
      { teban: GOTE, from: { suji: 3, dan: 1 }, to: { suji: 2, dan: 2 } },
      // ☖２二銀
      { teban: SENTE, from: { suji: 3, dan: 8 }, to: { suji: 2, dan: 7 } },
      // ☗２七銀
      { teban: GOTE, from: { suji: 4, dan: 1 }, to: { suji: 3, dan: 2 } },
      // ☖３二金
      // 旧９手目▲２六銀 (原始棒銀の継続) は depth18/22 で最善と 200cp 超離れるため、
      // エンジン最善の▲３六銀 (銀を中央寄りに使う) ルートへ差し替え (2026-07)。
      // △３三角/△２二銀/△３二金という対棒銀の受けの骨格はそのまま残る。
      { teban: SENTE, from: { suji: 2, dan: 7 }, to: { suji: 3, dan: 6 } },
      // ☗３六銀
      { teban: GOTE, from: { suji: 8, dan: 3 }, to: { suji: 8, dan: 4 } },
      // ☖８四歩
      { teban: SENTE, from: { suji: 3, dan: 6 }, to: { suji: 4, dan: 5 } },
      // ☗４五銀 (３四を狙う)
      { teban: GOTE, from: { suji: 3, dan: 4 }, to: { suji: 3, dan: 5 } },
      // ☖３五歩 (かわす)
      // YaneuraOu depth18 最善手による延長 (2026-07): ▲７八金で整えてから▲３四銀と進出、△４四角と展開。
      { teban: SENTE, from: { suji: 6, dan: 9 }, to: { suji: 7, dan: 8 } },
      // ☗７八金
      { teban: GOTE, from: { suji: 8, dan: 4 }, to: { suji: 8, dan: 5 } },
      // ☖８五歩
      { teban: SENTE, from: { suji: 4, dan: 5 }, to: { suji: 3, dan: 4 } },
      // ☗３四銀 (３四へ進出。３五歩とにらみ合い)
      { teban: GOTE, from: { suji: 3, dan: 3 }, to: { suji: 4, dan: 4 } }
      // ☖４四角 (角を展開し攻めに利かす)
    ]
  },
  {
    // (旧「相掛かり (2-6 start)」は本ラインと完全同一手順の重複だったため削除。)
    name: "\u76F8\u639B\u304B\u308A (basic)",
    category: "\u76F8\u5C45\u98DB\u8ECA",
    priority: 72,
    moves: [
      { teban: SENTE, from: { suji: 2, dan: 7 }, to: { suji: 2, dan: 6 } },
      // ☗２六歩
      { teban: GOTE, from: { suji: 8, dan: 3 }, to: { suji: 8, dan: 4 } },
      // ☖８四歩
      { teban: SENTE, from: { suji: 2, dan: 6 }, to: { suji: 2, dan: 5 } },
      // ☗２五歩
      { teban: GOTE, from: { suji: 8, dan: 4 }, to: { suji: 8, dan: 5 } },
      // ☖８五歩
      { teban: SENTE, from: { suji: 7, dan: 7 }, to: { suji: 7, dan: 6 } },
      // ☗７六歩
      { teban: GOTE, from: { suji: 3, dan: 3 }, to: { suji: 3, dan: 4 } },
      // ☖３四歩
      // YaneuraOu depth18 最善手による延長 (2026-07): 飛先交換まで。
      { teban: SENTE, from: { suji: 2, dan: 5 }, to: { suji: 2, dan: 4 } },
      // ☗２四歩
      { teban: GOTE, from: { suji: 2, dan: 3 }, to: { suji: 2, dan: 4 } },
      // ☖同歩
      { teban: SENTE, from: { suji: 2, dan: 8 }, to: { suji: 2, dan: 4 } },
      // ☗同飛
      { teban: GOTE, from: { suji: 4, dan: 1 }, to: { suji: 3, dan: 2 } },
      // ☖３二金 (横歩と２三を受ける)
      // YaneuraOu depth18 最善手による延長 (2026-07): ▲７八金で飛車を安定させ、△８六歩▲同歩△同飛のお返し交換。
      { teban: SENTE, from: { suji: 6, dan: 9 }, to: { suji: 7, dan: 8 } },
      // ☗７八金
      { teban: GOTE, from: { suji: 8, dan: 5 }, to: { suji: 8, dan: 6 } },
      // ☖８六歩 (お返しの飛先交換)
      { teban: SENTE, from: { suji: 8, dan: 7 }, to: { suji: 8, dan: 6 } },
      // ☗同歩
      { teban: GOTE, from: { suji: 8, dan: 2 }, to: { suji: 8, dan: 6 } }
      // ☖同飛
    ]
  },
  {
    name: "\u56DB\u9593\u98DB\u8ECA (basic)",
    category: "\u632F\u308A\u98DB\u8ECA",
    priority: 85,
    moves: [
      { teban: SENTE, from: { suji: 7, dan: 7 }, to: { suji: 7, dan: 6 } },
      // ☗７六歩
      { teban: GOTE, from: { suji: 3, dan: 3 }, to: { suji: 3, dan: 4 } },
      // ☖３四歩
      { teban: SENTE, from: { suji: 6, dan: 7 }, to: { suji: 6, dan: 6 } },
      // ☗６六歩
      { teban: GOTE, from: { suji: 8, dan: 3 }, to: { suji: 8, dan: 4 } },
      // ☖８四歩
      { teban: SENTE, from: { suji: 2, dan: 8 }, to: { suji: 6, dan: 8 } },
      // ☗６八飛
      { teban: GOTE, from: { suji: 5, dan: 3 }, to: { suji: 5, dan: 4 } },
      // ☖５四歩
      // Quick Mino-ish development (美濃の方向性). Stop early; branching is huge after this.
      { teban: SENTE, from: { suji: 5, dan: 9 }, to: { suji: 4, dan: 8 } },
      // ☗４八玉
      { teban: GOTE, from: { suji: 5, dan: 1 }, to: { suji: 4, dan: 2 } },
      // ☖４二玉
      { teban: SENTE, from: { suji: 4, dan: 9 }, to: { suji: 5, dan: 8 } },
      // ☗５八金左
      { teban: GOTE, from: { suji: 4, dan: 1 }, to: { suji: 3, dan: 2 } },
      // ☖３二金
      // YaneuraOu depth18 最善手による延長 (2026-07)。
      { teban: SENTE, from: { suji: 8, dan: 8 }, to: { suji: 7, dan: 7 } },
      // ☗７七角 (飛先を受ける)
      { teban: GOTE, from: { suji: 7, dan: 1 }, to: { suji: 6, dan: 2 } },
      // ☖６二銀
      { teban: SENTE, from: { suji: 1, dan: 7 }, to: { suji: 1, dan: 6 } },
      // ☗１六歩
      { teban: GOTE, from: { suji: 1, dan: 3 }, to: { suji: 1, dan: 4 } },
      // ☖１四歩
      // YaneuraOu depth18 最善手による延長 (2026-07): ▲７八銀で美濃の骨格を整え、双方の駒組み。
      { teban: SENTE, from: { suji: 7, dan: 9 }, to: { suji: 7, dan: 8 } },
      // ☗７八銀
      { teban: GOTE, from: { suji: 7, dan: 3 }, to: { suji: 7, dan: 4 } },
      // ☖７四歩
      { teban: SENTE, from: { suji: 3, dan: 7 }, to: { suji: 3, dan: 6 } },
      // ☗３六歩
      { teban: GOTE, from: { suji: 6, dan: 1 }, to: { suji: 5, dan: 2 } }
      // ☖５二金右
    ]
  },
  {
    name: "\u56DB\u9593\u98DB\u8ECA (\u202684 first)",
    category: "\u632F\u308A\u98DB\u8ECA",
    priority: 76,
    moves: [
      { teban: SENTE, from: { suji: 7, dan: 7 }, to: { suji: 7, dan: 6 } },
      // ☗７六歩
      { teban: GOTE, from: { suji: 8, dan: 3 }, to: { suji: 8, dan: 4 } },
      // ☖８四歩
      { teban: SENTE, from: { suji: 6, dan: 7 }, to: { suji: 6, dan: 6 } },
      // ☗６六歩
      { teban: GOTE, from: { suji: 3, dan: 3 }, to: { suji: 3, dan: 4 } },
      // ☖３四歩
      { teban: SENTE, from: { suji: 2, dan: 8 }, to: { suji: 6, dan: 8 } },
      // ☗６八飛
      { teban: GOTE, from: { suji: 5, dan: 3 }, to: { suji: 5, dan: 4 } },
      // ☖５四歩
      { teban: SENTE, from: { suji: 5, dan: 9 }, to: { suji: 4, dan: 8 } },
      // ☗４八玉
      { teban: GOTE, from: { suji: 5, dan: 1 }, to: { suji: 4, dan: 2 } },
      // ☖４二玉
      // YaneuraOu depth18 最善手による延長 (2026-07)。
      { teban: SENTE, from: { suji: 1, dan: 7 }, to: { suji: 1, dan: 6 } },
      // ☗１六歩
      { teban: GOTE, from: { suji: 1, dan: 3 }, to: { suji: 1, dan: 4 } },
      // ☖１四歩
      { teban: SENTE, from: { suji: 3, dan: 9 }, to: { suji: 3, dan: 8 } },
      // ☗３八銀 (美濃へ)
      { teban: GOTE, from: { suji: 7, dan: 1 }, to: { suji: 6, dan: 2 } },
      // ☖６二銀
      // YaneuraOu depth18 最善手による延長 (2026-07): ▲７七角で飛先を受け、△３二玉〜▲７八銀で相互に囲う。
      { teban: SENTE, from: { suji: 8, dan: 8 }, to: { suji: 7, dan: 7 } },
      // ☗７七角 (飛先を受ける)
      { teban: GOTE, from: { suji: 4, dan: 2 }, to: { suji: 3, dan: 2 } },
      // ☖３二玉 (舟囲い)
      { teban: SENTE, from: { suji: 7, dan: 9 }, to: { suji: 7, dan: 8 } },
      // ☗７八銀 (美濃を厚くする)
      { teban: GOTE, from: { suji: 7, dan: 3 }, to: { suji: 7, dan: 4 } }
      // ☖７四歩
    ]
  },
  {
    // ▲２六歩△３四歩▲７六歩の出だしから飛先交換へ（YaneuraOu検証済み: 全手が depth18 の最善手）。
    // 旧「四間飛車/三間飛車 (2-6 start)」は▲２六歩＋角道オープンのまま飛車を振る形で、
    // ▲６八飛/▲７八飛がエンジン最善と200cp以上離れる悪手だったため本ラインに置き換えた。
    name: "\u6A2A\u6B69\u53D6\u308A\u6A21\u69D8 (basic)",
    category: "\u76F8\u5C45\u98DB\u8ECA",
    priority: 74,
    moves: [
      { teban: SENTE, from: { suji: 2, dan: 7 }, to: { suji: 2, dan: 6 } },
      // ☗２六歩
      { teban: GOTE, from: { suji: 3, dan: 3 }, to: { suji: 3, dan: 4 } },
      // ☖３四歩
      { teban: SENTE, from: { suji: 7, dan: 7 }, to: { suji: 7, dan: 6 } },
      // ☗７六歩
      { teban: GOTE, from: { suji: 8, dan: 3 }, to: { suji: 8, dan: 4 } },
      // ☖８四歩
      { teban: SENTE, from: { suji: 2, dan: 6 }, to: { suji: 2, dan: 5 } },
      // ☗２五歩
      { teban: GOTE, from: { suji: 4, dan: 1 }, to: { suji: 3, dan: 2 } },
      // ☖３二金
      { teban: SENTE, from: { suji: 6, dan: 9 }, to: { suji: 7, dan: 8 } },
      // ☗７八金
      { teban: GOTE, from: { suji: 8, dan: 4 }, to: { suji: 8, dan: 5 } },
      // ☖８五歩
      { teban: SENTE, from: { suji: 2, dan: 5 }, to: { suji: 2, dan: 4 } },
      // ☗２四歩 (飛先交換)
      { teban: GOTE, from: { suji: 2, dan: 3 }, to: { suji: 2, dan: 4 } },
      // ☖同歩
      { teban: SENTE, from: { suji: 2, dan: 8 }, to: { suji: 2, dan: 4 } },
      // ☗同飛
      { teban: GOTE, from: { suji: 8, dan: 5 }, to: { suji: 8, dan: 6 } },
      // ☖８六歩 (お返しの交換)
      { teban: SENTE, from: { suji: 8, dan: 7 }, to: { suji: 8, dan: 6 } },
      // ☗同歩
      { teban: GOTE, from: { suji: 8, dan: 2 }, to: { suji: 8, dan: 6 } },
      // ☖同飛 (横歩取り基本図の直前)
      // YaneuraOu depth18 最善手による延長 (2026-07): ▲３四飛の横歩取り、△３三角▲５八玉△５二玉。
      { teban: SENTE, from: { suji: 2, dan: 4 }, to: { suji: 3, dan: 4 } },
      // ☗３四飛 (横歩を取る)
      { teban: GOTE, from: { suji: 2, dan: 2 }, to: { suji: 3, dan: 3 } },
      // ☖３三角 (飛車取り)
      { teban: SENTE, from: { suji: 5, dan: 9 }, to: { suji: 5, dan: 8 } },
      // ☗５八玉 (中住まいへ)
      { teban: GOTE, from: { suji: 5, dan: 1 }, to: { suji: 5, dan: 2 } }
      // ☖５二玉
    ]
  },
  {
    name: "\u4E09\u9593\u98DB\u8ECA (basic)",
    category: "\u632F\u308A\u98DB\u8ECA",
    priority: 78,
    moves: [
      { teban: SENTE, from: { suji: 7, dan: 7 }, to: { suji: 7, dan: 6 } },
      // ☗７六歩
      { teban: GOTE, from: { suji: 3, dan: 3 }, to: { suji: 3, dan: 4 } },
      // ☖３四歩
      { teban: SENTE, from: { suji: 2, dan: 8 }, to: { suji: 7, dan: 8 } },
      // ☗７八飛
      { teban: GOTE, from: { suji: 8, dan: 3 }, to: { suji: 8, dan: 4 } },
      // ☖８四歩
      { teban: SENTE, from: { suji: 6, dan: 7 }, to: { suji: 6, dan: 6 } },
      // ☗６六歩
      { teban: GOTE, from: { suji: 5, dan: 3 }, to: { suji: 5, dan: 4 } },
      // ☖５四歩
      { teban: SENTE, from: { suji: 5, dan: 9 }, to: { suji: 4, dan: 8 } },
      // ☗４八玉
      { teban: GOTE, from: { suji: 5, dan: 1 }, to: { suji: 4, dan: 2 } },
      // ☖４二玉
      // YaneuraOu depth18 最善手による延長 (2026-07): ▲７五歩〜▲７六飛の石田流志向。
      { teban: SENTE, from: { suji: 7, dan: 6 }, to: { suji: 7, dan: 5 } },
      // ☗７五歩 (石田流)
      { teban: GOTE, from: { suji: 8, dan: 4 }, to: { suji: 8, dan: 5 } },
      // ☖８五歩
      { teban: SENTE, from: { suji: 7, dan: 8 }, to: { suji: 7, dan: 6 } },
      // ☗７六飛 (浮き飛車)
      { teban: GOTE, from: { suji: 1, dan: 3 }, to: { suji: 1, dan: 4 } },
      // ☖１四歩
      // YaneuraOu depth18 最善手による延長 (2026-07): ▲１六歩〜▲３八銀の美濃づくり、△３二玉〜△６四歩。
      { teban: SENTE, from: { suji: 1, dan: 7 }, to: { suji: 1, dan: 6 } },
      // ☗１六歩
      { teban: GOTE, from: { suji: 4, dan: 2 }, to: { suji: 3, dan: 2 } },
      // ☖３二玉
      { teban: SENTE, from: { suji: 3, dan: 9 }, to: { suji: 3, dan: 8 } },
      // ☗３八銀 (美濃へ)
      { teban: GOTE, from: { suji: 6, dan: 3 }, to: { suji: 6, dan: 4 } }
      // ☖６四歩
    ]
  },
  {
    // 相振り飛車の基本: 先手三間 vs 後手三間。両者とも美濃へ。
    name: "\u76F8\u632F\u308A\u98DB\u8ECA (\u76F8\u4E09\u9593)",
    category: "\u76F8\u632F\u308A",
    priority: 74,
    moves: [
      { teban: SENTE, from: { suji: 7, dan: 7 }, to: { suji: 7, dan: 6 } },
      // ☗７六歩
      { teban: GOTE, from: { suji: 3, dan: 3 }, to: { suji: 3, dan: 4 } },
      // ☖３四歩
      { teban: SENTE, from: { suji: 6, dan: 7 }, to: { suji: 6, dan: 6 } },
      // ☗６六歩 (角道を止めて振り飛車宣言)
      { teban: GOTE, from: { suji: 8, dan: 2 }, to: { suji: 3, dan: 2 } },
      // ☖３二飛 (後手三間飛車)
      { teban: SENTE, from: { suji: 2, dan: 8 }, to: { suji: 7, dan: 8 } },
      // ☗７八飛 (先手三間飛車)
      { teban: GOTE, from: { suji: 5, dan: 1 }, to: { suji: 6, dan: 2 } },
      // ☖６二玉
      { teban: SENTE, from: { suji: 5, dan: 9 }, to: { suji: 4, dan: 8 } },
      // ☗４八玉
      // 旧８手目△７二玉は△３五歩 (石田流の伸び) に depth18 で 200cp 超劣るため、
      // ほぼ互角次善 (差1cp) の△７二銀→△７一玉ルートに変更 (YaneuraOu検証, 2026-07)。
      // ▲２八玉/△８二玉まで進める旧形は３筋の歩交換を軽視しすぎで検証を通らず、11手で打ち切る。
      { teban: GOTE, from: { suji: 7, dan: 1 }, to: { suji: 7, dan: 2 } },
      // ☖７二銀
      { teban: SENTE, from: { suji: 4, dan: 8 }, to: { suji: 3, dan: 8 } },
      // ☗３八玉
      { teban: GOTE, from: { suji: 6, dan: 2 }, to: { suji: 7, dan: 1 } },
      // ☖７一玉
      { teban: SENTE, from: { suji: 7, dan: 9 }, to: { suji: 6, dan: 8 } },
      // ☗６八銀
      // YaneuraOu depth18 最善手による延長 (2026-07): 後手が△３五歩〜△３六歩と３筋の位を取り、▲同歩と応じる。
      { teban: GOTE, from: { suji: 3, dan: 4 }, to: { suji: 3, dan: 5 } },
      // ☖３五歩 (石田流の位取り)
      { teban: SENTE, from: { suji: 3, dan: 9 }, to: { suji: 2, dan: 8 } },
      // ☗２八銀 (３九の右銀を美濃の壁に。玉は既に３八)
      { teban: GOTE, from: { suji: 3, dan: 5 }, to: { suji: 3, dan: 6 } },
      // ☖３六歩 (位を伸ばす)
      { teban: SENTE, from: { suji: 3, dan: 7 }, to: { suji: 3, dan: 6 } }
      // ☗同歩
    ]
  },
  {
    name: "\u4E2D\u98DB\u8ECA (basic)",
    category: "\u632F\u308A\u98DB\u8ECA",
    priority: 80,
    moves: [
      { teban: SENTE, from: { suji: 5, dan: 7 }, to: { suji: 5, dan: 6 } },
      // ☗５六歩
      { teban: GOTE, from: { suji: 5, dan: 3 }, to: { suji: 5, dan: 4 } },
      // ☖５四歩
      { teban: SENTE, from: { suji: 2, dan: 8 }, to: { suji: 5, dan: 8 } },
      // ☗５八飛
      { teban: GOTE, from: { suji: 8, dan: 3 }, to: { suji: 8, dan: 4 } },
      // ☖８四歩
      // A small amount of king-side safety so "rook shift and nothing" doesn't look random.
      { teban: SENTE, from: { suji: 5, dan: 9 }, to: { suji: 4, dan: 8 } },
      // ☗４八玉
      { teban: GOTE, from: { suji: 5, dan: 1 }, to: { suji: 4, dan: 2 } },
      // ☖４二玉
      // YaneuraOu depth18 最善手による延長 (2026-07): ▲５五歩△同歩の交換から▲７六歩で角道を開き、▲５五角と歩を回収。
      { teban: SENTE, from: { suji: 5, dan: 6 }, to: { suji: 5, dan: 5 } },
      // ☗５五歩 (５筋交換)
      { teban: GOTE, from: { suji: 5, dan: 4 }, to: { suji: 5, dan: 5 } },
      // ☖同歩
      { teban: SENTE, from: { suji: 7, dan: 7 }, to: { suji: 7, dan: 6 } },
      // ☗７六歩 (角道を開ける)
      { teban: GOTE, from: { suji: 6, dan: 1 }, to: { suji: 5, dan: 2 } },
      // ☖５二金右
      { teban: SENTE, from: { suji: 8, dan: 8 }, to: { suji: 5, dan: 5 } },
      // ☗５五角 (角で５五の歩を回収)
      { teban: GOTE, from: { suji: 4, dan: 2 }, to: { suji: 3, dan: 2 } }
      // ☖３二玉
    ]
  },
  {
    // 旧「中飛車 (mino-ish)」を改修 (2026-07): 旧８手目△３二金は△８五歩 (エンジン最善+240cp) を
    // 逃す手だったため、△８五歩以降を YaneuraOu depth18 最善手で差し替え。▲９六歩〜▲９七角で
    // ８六を受け、５筋の位を交換するのが中飛車らしい本筋。
    name: "\u4E2D\u98DB\u8ECA (\uFF15\u7B4B\u4EA4\u63DB)",
    category: "\u632F\u308A\u98DB\u8ECA",
    priority: 78,
    moves: [
      { teban: SENTE, from: { suji: 5, dan: 7 }, to: { suji: 5, dan: 6 } },
      // ☗５六歩
      { teban: GOTE, from: { suji: 5, dan: 3 }, to: { suji: 5, dan: 4 } },
      // ☖５四歩
      { teban: SENTE, from: { suji: 2, dan: 8 }, to: { suji: 5, dan: 8 } },
      // ☗５八飛
      { teban: GOTE, from: { suji: 8, dan: 3 }, to: { suji: 8, dan: 4 } },
      // ☖８四歩
      { teban: SENTE, from: { suji: 5, dan: 9 }, to: { suji: 4, dan: 8 } },
      // ☗４八玉
      { teban: GOTE, from: { suji: 5, dan: 1 }, to: { suji: 4, dan: 2 } },
      // ☖４二玉
      { teban: SENTE, from: { suji: 6, dan: 9 }, to: { suji: 6, dan: 8 } },
      // ☗６八金
      { teban: GOTE, from: { suji: 8, dan: 4 }, to: { suji: 8, dan: 5 } },
      // ☖８五歩 (飛先を伸ばすのが最善)
      { teban: SENTE, from: { suji: 9, dan: 7 }, to: { suji: 9, dan: 6 } },
      // ☗９六歩 (▲９七角の受けを用意)
      { teban: GOTE, from: { suji: 4, dan: 2 }, to: { suji: 3, dan: 2 } },
      // ☖３二玉
      { teban: SENTE, from: { suji: 5, dan: 6 }, to: { suji: 5, dan: 5 } },
      // ☗５五歩 (５筋交換)
      { teban: GOTE, from: { suji: 5, dan: 4 }, to: { suji: 5, dan: 5 } },
      // ☖同歩
      { teban: SENTE, from: { suji: 5, dan: 8 }, to: { suji: 5, dan: 5 } },
      // ☗同飛
      { teban: GOTE, from: { suji: 7, dan: 1 }, to: { suji: 6, dan: 2 } }
      // ☖６二銀
    ]
  },
  {
    // Another common first move for humans: ☗７六歩 with an early …☖８四歩 response.
    // Adding this increases variety in the AI's replies without forcing risky tactics.
    name: "\u5C45\u98DB\u8ECA (\u202684 early)",
    category: "\u76F8\u5C45\u98DB\u8ECA",
    priority: 70,
    moves: [
      { teban: SENTE, from: { suji: 7, dan: 7 }, to: { suji: 7, dan: 6 } },
      // ☗７六歩
      { teban: GOTE, from: { suji: 8, dan: 3 }, to: { suji: 8, dan: 4 } },
      // ☖８四歩
      { teban: SENTE, from: { suji: 2, dan: 7 }, to: { suji: 2, dan: 6 } },
      // ☗２六歩
      { teban: GOTE, from: { suji: 3, dan: 3 }, to: { suji: 3, dan: 4 } },
      // ☖３四歩
      { teban: SENTE, from: { suji: 2, dan: 6 }, to: { suji: 2, dan: 5 } },
      // ☗２五歩
      { teban: GOTE, from: { suji: 8, dan: 4 }, to: { suji: 8, dan: 5 } },
      // ☖８五歩
      // YaneuraOu depth18 最善手による延長 (2026-07): ▲７八金〜▲２四歩の飛先交換、△８六歩のお返し。
      { teban: SENTE, from: { suji: 6, dan: 9 }, to: { suji: 7, dan: 8 } },
      // ☗７八金
      { teban: GOTE, from: { suji: 4, dan: 1 }, to: { suji: 3, dan: 2 } },
      // ☖３二金
      { teban: SENTE, from: { suji: 2, dan: 5 }, to: { suji: 2, dan: 4 } },
      // ☗２四歩 (飛先交換)
      { teban: GOTE, from: { suji: 2, dan: 3 }, to: { suji: 2, dan: 4 } },
      // ☖同歩
      { teban: SENTE, from: { suji: 2, dan: 8 }, to: { suji: 2, dan: 4 } },
      // ☗同飛
      { teban: GOTE, from: { suji: 8, dan: 5 }, to: { suji: 8, dan: 6 } }
      // ☖８六歩 (お返しの交換)
    ]
  },
  {
    name: "\u5C45\u98DB\u8ECA (\u202634 early)",
    category: "\u76F8\u5C45\u98DB\u8ECA",
    priority: 68,
    moves: [
      { teban: SENTE, from: { suji: 7, dan: 7 }, to: { suji: 7, dan: 6 } },
      // ☗７六歩
      { teban: GOTE, from: { suji: 3, dan: 3 }, to: { suji: 3, dan: 4 } },
      // ☖３四歩
      { teban: SENTE, from: { suji: 2, dan: 7 }, to: { suji: 2, dan: 6 } },
      // ☗２六歩
      { teban: GOTE, from: { suji: 8, dan: 3 }, to: { suji: 8, dan: 4 } },
      // ☖８四歩
      { teban: SENTE, from: { suji: 2, dan: 6 }, to: { suji: 2, dan: 5 } },
      // ☗２五歩
      { teban: GOTE, from: { suji: 8, dan: 4 }, to: { suji: 8, dan: 5 } },
      // ☖８五歩
      // YaneuraOu depth18 最善手による延長 (2026-07): ▲７八金、△８六歩▲同歩△同飛のお返し交換から▲２四歩の交換。
      { teban: SENTE, from: { suji: 6, dan: 9 }, to: { suji: 7, dan: 8 } },
      // ☗７八金
      { teban: GOTE, from: { suji: 8, dan: 5 }, to: { suji: 8, dan: 6 } },
      // ☖８六歩
      { teban: SENTE, from: { suji: 8, dan: 7 }, to: { suji: 8, dan: 6 } },
      // ☗同歩
      { teban: GOTE, from: { suji: 8, dan: 2 }, to: { suji: 8, dan: 6 } },
      // ☖同飛
      { teban: SENTE, from: { suji: 2, dan: 5 }, to: { suji: 2, dan: 4 } },
      // ☗２四歩 (飛先交換)
      { teban: GOTE, from: { suji: 2, dan: 3 }, to: { suji: 2, dan: 4 } }
      // ☖同歩
    ]
  },
  {
    name: "\u53F3\u56DB\u9593\u98DB\u8ECA (basic)",
    category: "\u76F8\u5C45\u98DB\u8ECA",
    priority: 66,
    moves: [
      { teban: SENTE, from: { suji: 7, dan: 7 }, to: { suji: 7, dan: 6 } },
      // ☗７六歩
      { teban: GOTE, from: { suji: 3, dan: 3 }, to: { suji: 3, dan: 4 } },
      // ☖３四歩
      { teban: SENTE, from: { suji: 4, dan: 7 }, to: { suji: 4, dan: 6 } },
      // ☗４六歩
      { teban: GOTE, from: { suji: 8, dan: 3 }, to: { suji: 8, dan: 4 } },
      // ☖８四歩
      { teban: SENTE, from: { suji: 4, dan: 6 }, to: { suji: 4, dan: 5 } },
      // ☗４五歩
      { teban: GOTE, from: { suji: 5, dan: 3 }, to: { suji: 5, dan: 4 } },
      // ☖５四歩
      { teban: SENTE, from: { suji: 2, dan: 8 }, to: { suji: 4, dan: 8 } },
      // ☗４八飛
      // 旧８手目△４四歩は▲同角/▲同歩で -2100cp 級の大悪手 (YaneuraOu検証)。△３二金が最善。
      { teban: GOTE, from: { suji: 4, dan: 1 }, to: { suji: 3, dan: 2 } },
      // ☖３二金
      { teban: SENTE, from: { suji: 4, dan: 5 }, to: { suji: 4, dan: 4 } },
      // ☗４四歩 (位を確保)
      { teban: GOTE, from: { suji: 6, dan: 1 }, to: { suji: 5, dan: 2 } },
      // ☖５二金
      // YaneuraOu depth18 最善手による延長 (2026-07): ▲４三歩成△同金の突破から角交換 ▲２二角成△同銀。
      { teban: SENTE, from: { suji: 4, dan: 4 }, to: { suji: 4, dan: 3 }, promote: true },
      // ☗４三歩成 (と金で拠点)
      { teban: GOTE, from: { suji: 5, dan: 2 }, to: { suji: 4, dan: 3 } },
      // ☖同金
      { teban: SENTE, from: { suji: 8, dan: 8 }, to: { suji: 2, dan: 2 }, promote: true },
      // ☗２二角成 (角交換)
      { teban: GOTE, from: { suji: 3, dan: 1 }, to: { suji: 2, dan: 2 } }
      // ☖同銀
    ]
  },
  {
    name: "\u5C45\u98DB\u8ECA (\u202654 early)",
    category: "\u76F8\u5C45\u98DB\u8ECA",
    priority: 66,
    moves: [
      { teban: SENTE, from: { suji: 7, dan: 7 }, to: { suji: 7, dan: 6 } },
      // ☗７六歩
      { teban: GOTE, from: { suji: 5, dan: 3 }, to: { suji: 5, dan: 4 } },
      // ☖５四歩
      { teban: SENTE, from: { suji: 2, dan: 7 }, to: { suji: 2, dan: 6 } },
      // ☗２六歩
      { teban: GOTE, from: { suji: 3, dan: 3 }, to: { suji: 3, dan: 4 } },
      // ☖３四歩
      { teban: SENTE, from: { suji: 2, dan: 6 }, to: { suji: 2, dan: 5 } },
      // ☗２五歩
      { teban: GOTE, from: { suji: 8, dan: 3 }, to: { suji: 8, dan: 4 } },
      // ☖８四歩
      // YaneuraOu depth18 最善手による延長 (2026-07): ▲７八金〜▲２四歩の飛先交換。
      { teban: SENTE, from: { suji: 6, dan: 9 }, to: { suji: 7, dan: 8 } },
      // ☗７八金
      { teban: GOTE, from: { suji: 4, dan: 1 }, to: { suji: 3, dan: 2 } },
      // ☖３二金
      { teban: SENTE, from: { suji: 2, dan: 5 }, to: { suji: 2, dan: 4 } },
      // ☗２四歩 (飛先交換)
      { teban: GOTE, from: { suji: 2, dan: 3 }, to: { suji: 2, dan: 4 } }
      // ☖同歩
    ]
  },
  {
    name: "\u5C45\u98DB\u8ECA (2-6\u2192\u202654)",
    category: "\u76F8\u5C45\u98DB\u8ECA",
    priority: 64,
    moves: [
      { teban: SENTE, from: { suji: 2, dan: 7 }, to: { suji: 2, dan: 6 } },
      // ☗２六歩
      { teban: GOTE, from: { suji: 5, dan: 3 }, to: { suji: 5, dan: 4 } },
      // ☖５四歩
      { teban: SENTE, from: { suji: 7, dan: 7 }, to: { suji: 7, dan: 6 } },
      // ☗７六歩
      { teban: GOTE, from: { suji: 3, dan: 3 }, to: { suji: 3, dan: 4 } },
      // ☖３四歩
      { teban: SENTE, from: { suji: 2, dan: 6 }, to: { suji: 2, dan: 5 } },
      // ☗２五歩
      { teban: GOTE, from: { suji: 8, dan: 3 }, to: { suji: 8, dan: 4 } },
      // ☖８四歩
      // YaneuraOu depth18 最善手による延長 (2026-07): ▲７八金〜▲２四歩の飛先交換。
      { teban: SENTE, from: { suji: 6, dan: 9 }, to: { suji: 7, dan: 8 } },
      // ☗７八金
      { teban: GOTE, from: { suji: 4, dan: 1 }, to: { suji: 3, dan: 2 } },
      // ☖３二金
      { teban: SENTE, from: { suji: 2, dan: 5 }, to: { suji: 2, dan: 4 } },
      // ☗２四歩 (飛先交換)
      { teban: GOTE, from: { suji: 2, dan: 3 }, to: { suji: 2, dan: 4 } }
      // ☖同歩
    ]
  },
  {
    name: "\u77E2\u5009 (\u202684 first)",
    category: "\u76F8\u5C45\u98DB\u8ECA",
    priority: 78,
    moves: [
      { teban: SENTE, from: { suji: 7, dan: 7 }, to: { suji: 7, dan: 6 } },
      // ☗７六歩
      { teban: GOTE, from: { suji: 8, dan: 3 }, to: { suji: 8, dan: 4 } },
      // ☖８四歩
      { teban: SENTE, from: { suji: 2, dan: 7 }, to: { suji: 2, dan: 6 } },
      // ☗２六歩
      { teban: GOTE, from: { suji: 3, dan: 3 }, to: { suji: 3, dan: 4 } },
      // ☖３四歩
      { teban: SENTE, from: { suji: 6, dan: 9 }, to: { suji: 6, dan: 8 } },
      // ☗６八金
      { teban: GOTE, from: { suji: 4, dan: 1 }, to: { suji: 3, dan: 2 } },
      // ☖３二金
      // ☗６六歩→☗７八銀の順 (矢倉basicと同じ理由)。ここから先は矢倉basicと同一局面に合流する。
      { teban: SENTE, from: { suji: 6, dan: 7 }, to: { suji: 6, dan: 6 } },
      // ☗６六歩
      { teban: GOTE, from: { suji: 7, dan: 1 }, to: { suji: 6, dan: 2 } },
      // ☖６二銀
      { teban: SENTE, from: { suji: 7, dan: 9 }, to: { suji: 7, dan: 8 } },
      // ☗７八銀
      { teban: GOTE, from: { suji: 5, dan: 3 }, to: { suji: 5, dan: 4 } },
      // ☖５四歩
      // YaneuraOu depth18 最善手による延長 (2026-07): ▲２五歩△８五歩▲７七角の飛先受け、△４四角の展開。
      { teban: SENTE, from: { suji: 2, dan: 6 }, to: { suji: 2, dan: 5 } },
      // ☗２五歩
      { teban: GOTE, from: { suji: 8, dan: 4 }, to: { suji: 8, dan: 5 } },
      // ☖８五歩
      { teban: SENTE, from: { suji: 8, dan: 8 }, to: { suji: 7, dan: 7 } },
      // ☗７七角 (飛先を受ける)
      { teban: GOTE, from: { suji: 2, dan: 2 }, to: { suji: 4, dan: 4 } }
      // ☖４四角 (角を展開)
    ]
  },
  {
    name: "\u4E2D\u592E\u6B69 (\u202634)",
    category: "\u57FA\u790E",
    priority: 58,
    moves: [
      { teban: SENTE, from: { suji: 5, dan: 7 }, to: { suji: 5, dan: 6 } },
      // ☗５六歩
      { teban: GOTE, from: { suji: 3, dan: 3 }, to: { suji: 3, dan: 4 } },
      // ☖３四歩
      { teban: SENTE, from: { suji: 7, dan: 7 }, to: { suji: 7, dan: 6 } },
      // ☗７六歩
      { teban: GOTE, from: { suji: 5, dan: 3 }, to: { suji: 5, dan: 4 } },
      // ☖５四歩
      { teban: SENTE, from: { suji: 2, dan: 7 }, to: { suji: 2, dan: 6 } },
      // ☗２六歩
      { teban: GOTE, from: { suji: 8, dan: 3 }, to: { suji: 8, dan: 4 } },
      // ☖８四歩
      // YaneuraOu depth18 最善手による延長 (2026-07): ▲２五歩△８五歩から▲２四歩の飛先交換。
      { teban: SENTE, from: { suji: 2, dan: 6 }, to: { suji: 2, dan: 5 } },
      // ☗２五歩
      { teban: GOTE, from: { suji: 8, dan: 4 }, to: { suji: 8, dan: 5 } },
      // ☖８五歩
      { teban: SENTE, from: { suji: 2, dan: 5 }, to: { suji: 2, dan: 4 } },
      // ☗２四歩 (飛先交換)
      { teban: GOTE, from: { suji: 2, dan: 3 }, to: { suji: 2, dan: 4 } }
      // ☖同歩
    ]
  },
  {
    name: "\uFF13\u516D\u6B69 (basic)",
    category: "\u57FA\u790E",
    priority: 55,
    moves: [
      { teban: SENTE, from: { suji: 3, dan: 7 }, to: { suji: 3, dan: 6 } },
      // ☗３六歩
      { teban: GOTE, from: { suji: 8, dan: 3 }, to: { suji: 8, dan: 4 } },
      // ☖８四歩
      { teban: SENTE, from: { suji: 7, dan: 7 }, to: { suji: 7, dan: 6 } },
      // ☗７六歩
      { teban: GOTE, from: { suji: 3, dan: 3 }, to: { suji: 3, dan: 4 } },
      // ☖３四歩
      { teban: SENTE, from: { suji: 2, dan: 7 }, to: { suji: 2, dan: 6 } },
      // ☗２六歩
      { teban: GOTE, from: { suji: 5, dan: 3 }, to: { suji: 5, dan: 4 } },
      // ☖５四歩
      // YaneuraOu depth18 最善手による延長 (2026-07): ▲２五歩△８五歩▲７八金の駒組み。
      { teban: SENTE, from: { suji: 2, dan: 6 }, to: { suji: 2, dan: 5 } },
      // ☗２五歩
      { teban: GOTE, from: { suji: 8, dan: 4 }, to: { suji: 8, dan: 5 } },
      // ☖８五歩
      { teban: SENTE, from: { suji: 6, dan: 9 }, to: { suji: 7, dan: 8 } },
      // ☗７八金 (飛先を安定)
      { teban: GOTE, from: { suji: 4, dan: 1 }, to: { suji: 3, dan: 2 } }
      // ☖３二金
    ]
  },
  {
    // A very common beginner-friendly start: central pawn + bishop-side pawn.
    name: "\u4E2D\u592E\u6B69 (basic)",
    category: "\u57FA\u790E",
    priority: 60,
    moves: [
      { teban: SENTE, from: { suji: 5, dan: 7 }, to: { suji: 5, dan: 6 } },
      // ☗５六歩
      { teban: GOTE, from: { suji: 5, dan: 3 }, to: { suji: 5, dan: 4 } },
      // ☖５四歩
      { teban: SENTE, from: { suji: 7, dan: 7 }, to: { suji: 7, dan: 6 } },
      // ☗７六歩
      { teban: GOTE, from: { suji: 3, dan: 3 }, to: { suji: 3, dan: 4 } },
      // ☖３四歩
      // YaneuraOu depth18 最善手による延長 (2026-07)。
      { teban: SENTE, from: { suji: 2, dan: 7 }, to: { suji: 2, dan: 6 } },
      // ☗２六歩
      { teban: GOTE, from: { suji: 8, dan: 3 }, to: { suji: 8, dan: 4 } },
      // ☖８四歩
      { teban: SENTE, from: { suji: 2, dan: 6 }, to: { suji: 2, dan: 5 } },
      // ☗２五歩
      { teban: GOTE, from: { suji: 8, dan: 4 }, to: { suji: 8, dan: 5 } },
      // ☖８五歩
      // YaneuraOu depth18 最善手による延長 (2026-07): ▲７八金〜△８六歩▲同歩△同飛のお返し交換。
      { teban: SENTE, from: { suji: 6, dan: 9 }, to: { suji: 7, dan: 8 } },
      // ☗７八金
      { teban: GOTE, from: { suji: 8, dan: 5 }, to: { suji: 8, dan: 6 } },
      // ☖８六歩 (お返しの飛先交換)
      { teban: SENTE, from: { suji: 8, dan: 7 }, to: { suji: 8, dan: 6 } },
      // ☗同歩
      { teban: GOTE, from: { suji: 8, dan: 2 }, to: { suji: 8, dan: 6 } }
      // ☖同飛
    ]
  },
  {
    name: "\u5F8C\u624B\u30B4\u30AD\u30B2\u30F3\u4E2D\u98DB\u8ECA (basic)",
    category: "\u632F\u308A\u98DB\u8ECA",
    priority: 80,
    moves: [
      { teban: SENTE, from: { suji: 7, dan: 7 }, to: { suji: 7, dan: 6 } },
      // ☗７六歩
      { teban: GOTE, from: { suji: 8, dan: 2 }, to: { suji: 5, dan: 2 } },
      // ☖５二飛
      { teban: SENTE, from: { suji: 2, dan: 7 }, to: { suji: 2, dan: 6 } },
      // ☗２六歩
      { teban: GOTE, from: { suji: 5, dan: 3 }, to: { suji: 5, dan: 4 } },
      // ☖５四歩
      { teban: SENTE, from: { suji: 2, dan: 6 }, to: { suji: 2, dan: 5 } },
      // ☗２五歩
      { teban: GOTE, from: { suji: 3, dan: 3 }, to: { suji: 3, dan: 4 } },
      // ☖３四歩
      { teban: SENTE, from: { suji: 6, dan: 7 }, to: { suji: 6, dan: 6 } },
      // ☗６六歩
      { teban: GOTE, from: { suji: 5, dan: 1 }, to: { suji: 4, dan: 2 } },
      // ☖４二玉
      // YaneuraOu depth18 最善手による延長 (2026-07): ▲２四歩の交換には△同歩▲同飛△３二金。
      { teban: SENTE, from: { suji: 2, dan: 5 }, to: { suji: 2, dan: 4 } },
      // ☗２四歩
      { teban: GOTE, from: { suji: 2, dan: 3 }, to: { suji: 2, dan: 4 } },
      // ☖同歩
      { teban: SENTE, from: { suji: 2, dan: 8 }, to: { suji: 2, dan: 4 } },
      // ☗同飛
      { teban: GOTE, from: { suji: 4, dan: 1 }, to: { suji: 3, dan: 2 } },
      // ☖３二金
      // YaneuraOu depth18 最善手による延長 (2026-07): ▲９六歩〜▲６八玉の駒組み、後手は△６二銀〜△１四歩。
      { teban: SENTE, from: { suji: 9, dan: 7 }, to: { suji: 9, dan: 6 } },
      // ☗９六歩
      { teban: GOTE, from: { suji: 7, dan: 1 }, to: { suji: 6, dan: 2 } },
      // ☖６二銀
      { teban: SENTE, from: { suji: 5, dan: 9 }, to: { suji: 6, dan: 8 } },
      // ☗６八玉
      { teban: GOTE, from: { suji: 1, dan: 3 }, to: { suji: 1, dan: 4 } }
      // ☖１四歩
    ]
  },
  {
    // 後手四間飛車の正調は△４二飛（旧「△６二飛」は右四間で誤り）。持久戦模様の駒組み。
    name: "\u5F8C\u624B\u56DB\u9593\u98DB\u8ECA (basic)",
    category: "\u632F\u308A\u98DB\u8ECA",
    priority: 72,
    moves: [
      { teban: SENTE, from: { suji: 7, dan: 7 }, to: { suji: 7, dan: 6 } },
      // ☗７六歩
      { teban: GOTE, from: { suji: 3, dan: 3 }, to: { suji: 3, dan: 4 } },
      // ☖３四歩
      { teban: SENTE, from: { suji: 2, dan: 7 }, to: { suji: 2, dan: 6 } },
      // ☗２六歩
      { teban: GOTE, from: { suji: 4, dan: 3 }, to: { suji: 4, dan: 4 } },
      // ☖４四歩 (角道を止める)
      { teban: SENTE, from: { suji: 3, dan: 9 }, to: { suji: 4, dan: 8 } },
      // ☗４八銀
      { teban: GOTE, from: { suji: 8, dan: 2 }, to: { suji: 4, dan: 2 } },
      // ☖４二飛 (四間飛車)
      { teban: SENTE, from: { suji: 5, dan: 7 }, to: { suji: 5, dan: 6 } },
      // ☗５六歩
      { teban: GOTE, from: { suji: 3, dan: 1 }, to: { suji: 3, dan: 2 } },
      // ☖３二銀
      { teban: SENTE, from: { suji: 5, dan: 9 }, to: { suji: 6, dan: 8 } },
      // ☗６八玉
      { teban: GOTE, from: { suji: 5, dan: 1 }, to: { suji: 6, dan: 2 } },
      // ☖６二玉
      { teban: SENTE, from: { suji: 6, dan: 8 }, to: { suji: 7, dan: 8 } },
      // ☗７八玉
      { teban: GOTE, from: { suji: 6, dan: 2 }, to: { suji: 7, dan: 2 } },
      // ☖７二玉
      { teban: SENTE, from: { suji: 4, dan: 9 }, to: { suji: 5, dan: 8 } },
      // ☗５八金右
      { teban: GOTE, from: { suji: 7, dan: 2 }, to: { suji: 8, dan: 2 } }
      // ☖８二玉 (美濃)
    ]
  },
  {
    // 後手三間飛車の正調は△３二飛（旧「△７二飛」は誤り）。▲２五歩には△３三角が必須の一手。
    name: "\u5F8C\u624B\u4E09\u9593\u98DB\u8ECA (basic)",
    category: "\u632F\u308A\u98DB\u8ECA",
    priority: 70,
    moves: [
      { teban: SENTE, from: { suji: 7, dan: 7 }, to: { suji: 7, dan: 6 } },
      // ☗７六歩
      { teban: GOTE, from: { suji: 3, dan: 3 }, to: { suji: 3, dan: 4 } },
      // ☖３四歩
      { teban: SENTE, from: { suji: 2, dan: 7 }, to: { suji: 2, dan: 6 } },
      // ☗２六歩
      { teban: GOTE, from: { suji: 8, dan: 2 }, to: { suji: 3, dan: 2 } },
      // ☖３二飛 (三間飛車)
      { teban: SENTE, from: { suji: 2, dan: 6 }, to: { suji: 2, dan: 5 } },
      // ☗２五歩
      { teban: GOTE, from: { suji: 2, dan: 2 }, to: { suji: 3, dan: 3 } },
      // ☖３三角 (飛車先を受ける)
      { teban: SENTE, from: { suji: 3, dan: 9 }, to: { suji: 4, dan: 8 } },
      // ☗４八銀
      { teban: GOTE, from: { suji: 5, dan: 1 }, to: { suji: 6, dan: 2 } },
      // ☖６二玉
      { teban: SENTE, from: { suji: 5, dan: 9 }, to: { suji: 6, dan: 8 } },
      // ☗６八玉
      { teban: GOTE, from: { suji: 6, dan: 2 }, to: { suji: 7, dan: 2 } },
      // ☖７二玉
      { teban: SENTE, from: { suji: 6, dan: 8 }, to: { suji: 7, dan: 8 } },
      // ☗７八玉
      { teban: GOTE, from: { suji: 7, dan: 2 }, to: { suji: 8, dan: 2 } },
      // ☖８二玉 (美濃)
      { teban: SENTE, from: { suji: 4, dan: 9 }, to: { suji: 5, dan: 8 } },
      // ☗５八金右
      { teban: GOTE, from: { suji: 7, dan: 1 }, to: { suji: 7, dan: 2 } }
      // ☖７二銀
    ]
  },
  // ============================================================================
  // 検証済み定跡ライン追加分 (2026-07)
  // - 相掛かり飛車先交換（△２三歩と正しく受け、△８六歩の交換をお返しする完全手順）
  // - 角換わり基本（▲７八金△３二金型の▲２四歩交換対応 / ▲７七角→▲８八銀の本手順）
  // - 四間飛車 vs 居飛車急戦（△６二玉→７二玉→８二玉の美濃完成まで）
  // - ゴキゲン中飛車 / 三間飛車の主要形
  // ============================================================================
  {
    // 相掛かり・飛車先交換型（引き飛車）。▲２四歩△同歩▲同飛には△２三歩が正しい受け。
    // ▲７八金／△３二金を先に入れるのが本定跡（8八/2二への角打ち・▲７七角の両取り筋を消す）。
    name: "\u76F8\u639B\u304B\u308A (\u98DB\u5148\u4EA4\u63DB\u30FB\u5F15\u304D\u98DB\u8ECA)",
    category: "\u76F8\u5C45\u98DB\u8ECA",
    priority: 86,
    moves: [
      { teban: SENTE, from: { suji: 2, dan: 7 }, to: { suji: 2, dan: 6 } },
      // ☗２六歩
      { teban: GOTE, from: { suji: 8, dan: 3 }, to: { suji: 8, dan: 4 } },
      // ☖８四歩
      { teban: SENTE, from: { suji: 2, dan: 6 }, to: { suji: 2, dan: 5 } },
      // ☗２五歩
      { teban: GOTE, from: { suji: 8, dan: 4 }, to: { suji: 8, dan: 5 } },
      // ☖８五歩
      { teban: SENTE, from: { suji: 6, dan: 9 }, to: { suji: 7, dan: 8 } },
      // ☗７八金
      { teban: GOTE, from: { suji: 4, dan: 1 }, to: { suji: 3, dan: 2 } },
      // ☖３二金
      { teban: SENTE, from: { suji: 2, dan: 5 }, to: { suji: 2, dan: 4 } },
      // ☗２四歩 (飛車先交換)
      { teban: GOTE, from: { suji: 2, dan: 3 }, to: { suji: 2, dan: 4 } },
      // ☖同歩
      { teban: SENTE, from: { suji: 2, dan: 8 }, to: { suji: 2, dan: 4 } },
      // ☗同飛
      { teban: GOTE, from: { suji: 0, dan: 0 }, to: { suji: 2, dan: 3 }, drop: FU },
      // ☖２三歩 (正しい受け)
      { teban: SENTE, from: { suji: 2, dan: 4 }, to: { suji: 2, dan: 8 } },
      // ☗２八飛 (引き飛車)
      { teban: GOTE, from: { suji: 8, dan: 5 }, to: { suji: 8, dan: 6 } },
      // ☖８六歩 (交換をお返し)
      { teban: SENTE, from: { suji: 8, dan: 7 }, to: { suji: 8, dan: 6 } },
      // ☗同歩
      { teban: GOTE, from: { suji: 8, dan: 2 }, to: { suji: 8, dan: 6 } },
      // ☖同飛
      { teban: SENTE, from: { suji: 0, dan: 0 }, to: { suji: 8, dan: 7 }, drop: FU },
      // ☗８七歩
      { teban: GOTE, from: { suji: 8, dan: 6 }, to: { suji: 8, dan: 4 } },
      // ☖８四飛 (浮き飛車: ４段目の横利きで２四をケア)
      { teban: SENTE, from: { suji: 3, dan: 9 }, to: { suji: 3, dan: 8 } },
      // ☗３八銀
      { teban: GOTE, from: { suji: 3, dan: 3 }, to: { suji: 3, dan: 4 } }
      // ☖３四歩 (３四は８四飛の横利きが守る)
    ]
  },
  {
    // 相掛かり・飛車先交換型（浮き飛車）。相浮き飛車の基本形。
    name: "\u76F8\u639B\u304B\u308A (\u98DB\u5148\u4EA4\u63DB\u30FB\u6D6E\u304D\u98DB\u8ECA)",
    category: "\u76F8\u5C45\u98DB\u8ECA",
    priority: 82,
    moves: [
      { teban: SENTE, from: { suji: 2, dan: 7 }, to: { suji: 2, dan: 6 } },
      // ☗２六歩
      { teban: GOTE, from: { suji: 8, dan: 3 }, to: { suji: 8, dan: 4 } },
      // ☖８四歩
      { teban: SENTE, from: { suji: 2, dan: 6 }, to: { suji: 2, dan: 5 } },
      // ☗２五歩
      { teban: GOTE, from: { suji: 8, dan: 4 }, to: { suji: 8, dan: 5 } },
      // ☖８五歩
      { teban: SENTE, from: { suji: 6, dan: 9 }, to: { suji: 7, dan: 8 } },
      // ☗７八金
      { teban: GOTE, from: { suji: 4, dan: 1 }, to: { suji: 3, dan: 2 } },
      // ☖３二金
      { teban: SENTE, from: { suji: 2, dan: 5 }, to: { suji: 2, dan: 4 } },
      // ☗２四歩
      { teban: GOTE, from: { suji: 2, dan: 3 }, to: { suji: 2, dan: 4 } },
      // ☖同歩
      { teban: SENTE, from: { suji: 2, dan: 8 }, to: { suji: 2, dan: 4 } },
      // ☗同飛
      { teban: GOTE, from: { suji: 0, dan: 0 }, to: { suji: 2, dan: 3 }, drop: FU },
      // ☖２三歩
      { teban: SENTE, from: { suji: 2, dan: 4 }, to: { suji: 2, dan: 6 } },
      // ☗２六飛 (浮き飛車)
      // 旧手順の△８六歩▲同歩△同飛は、▲２六飛の横利きで△同飛が丸ごと取られる大悪手だった
      // (▲7六歩が入っていないので6段目が素通し)。YaneuraOu depth18 最善手で差し替え (2026-07)。
      { teban: GOTE, from: { suji: 7, dan: 1 }, to: { suji: 7, dan: 2 } },
      // ☖７二銀
      { teban: SENTE, from: { suji: 7, dan: 7 }, to: { suji: 7, dan: 6 } },
      // ☗７六歩
      { teban: GOTE, from: { suji: 3, dan: 3 }, to: { suji: 3, dan: 4 } },
      // ☖３四歩
      { teban: SENTE, from: { suji: 2, dan: 6 }, to: { suji: 3, dan: 6 } },
      // ☗３六飛 (横歩を狙う)
      { teban: GOTE, from: { suji: 5, dan: 1 }, to: { suji: 4, dan: 2 } },
      // ☖４二玉
      { teban: SENTE, from: { suji: 3, dan: 6 }, to: { suji: 3, dan: 4 } }
      // ☗３四飛 (横歩取り)
    ]
  },
  {
    // 角換わりの本手順: ▲７七角→▲８八銀と組み替えてから△７七角成▲同銀。
    name: "\u89D2\u63DB\u308F\u308A (\u672C\u7D44\u30FB\uFF17\u4E03\u89D2\u578B)",
    category: "\u76F8\u5C45\u98DB\u8ECA",
    priority: 84,
    moves: [
      { teban: SENTE, from: { suji: 7, dan: 7 }, to: { suji: 7, dan: 6 } },
      // ☗７六歩
      { teban: GOTE, from: { suji: 8, dan: 3 }, to: { suji: 8, dan: 4 } },
      // ☖８四歩
      { teban: SENTE, from: { suji: 2, dan: 7 }, to: { suji: 2, dan: 6 } },
      // ☗２六歩
      { teban: GOTE, from: { suji: 8, dan: 4 }, to: { suji: 8, dan: 5 } },
      // ☖８五歩
      { teban: SENTE, from: { suji: 8, dan: 8 }, to: { suji: 7, dan: 7 } },
      // ☗７七角 (８六の交換を受ける)
      { teban: GOTE, from: { suji: 3, dan: 3 }, to: { suji: 3, dan: 4 } },
      // ☖３四歩
      { teban: SENTE, from: { suji: 7, dan: 9 }, to: { suji: 8, dan: 8 } },
      // ☗８八銀
      { teban: GOTE, from: { suji: 2, dan: 2 }, to: { suji: 7, dan: 7 }, promote: true },
      // ☖７七角成
      { teban: SENTE, from: { suji: 8, dan: 8 }, to: { suji: 7, dan: 7 } },
      // ☗同銀
      { teban: GOTE, from: { suji: 4, dan: 1 }, to: { suji: 3, dan: 2 } },
      // ☖３二金 (角打ちに備える)
      { teban: SENTE, from: { suji: 3, dan: 9 }, to: { suji: 3, dan: 8 } },
      // ☗３八銀
      { teban: GOTE, from: { suji: 3, dan: 1 }, to: { suji: 2, dan: 2 } },
      // ☖２二銀
      { teban: SENTE, from: { suji: 6, dan: 9 }, to: { suji: 7, dan: 8 } },
      // ☗７八金
      { teban: GOTE, from: { suji: 2, dan: 2 }, to: { suji: 3, dan: 3 } },
      // ☖３三銀 (基本形)
      // YaneuraOu depth18 最善手による延長 (2026-07)。
      { teban: SENTE, from: { suji: 4, dan: 7 }, to: { suji: 4, dan: 6 } },
      // ☗４六歩 (腰掛け銀準備)
      { teban: GOTE, from: { suji: 7, dan: 3 }, to: { suji: 7, dan: 4 } },
      // ☖７四歩
      { teban: SENTE, from: { suji: 9, dan: 7 }, to: { suji: 9, dan: 6 } },
      // ☗９六歩 (端の突き合い)
      { teban: GOTE, from: { suji: 1, dan: 3 }, to: { suji: 1, dan: 4 } }
      // ☖１四歩
    ]
  },
  {
    // 角換わり模様（▲７八金△３二金型）で▲２四歩と来た場合の交換対応。
    // △同歩▲同飛△２三歩と受け、△８六歩の交換をお返しして互角の分かれ。
    name: "\u89D2\u63DB\u308F\u308A (\uFF17\u516B\u91D1\u578B\u30FB\uFF12\u56DB\u6B69\u4EA4\u63DB\u5BFE\u5FDC)",
    category: "\u76F8\u5C45\u98DB\u8ECA",
    priority: 79,
    moves: [
      { teban: SENTE, from: { suji: 7, dan: 7 }, to: { suji: 7, dan: 6 } },
      // ☗７六歩
      { teban: GOTE, from: { suji: 3, dan: 3 }, to: { suji: 3, dan: 4 } },
      // ☖３四歩
      { teban: SENTE, from: { suji: 2, dan: 7 }, to: { suji: 2, dan: 6 } },
      // ☗２六歩
      { teban: GOTE, from: { suji: 8, dan: 3 }, to: { suji: 8, dan: 4 } },
      // ☖８四歩
      { teban: SENTE, from: { suji: 2, dan: 6 }, to: { suji: 2, dan: 5 } },
      // ☗２五歩
      { teban: GOTE, from: { suji: 8, dan: 4 }, to: { suji: 8, dan: 5 } },
      // ☖８五歩
      { teban: SENTE, from: { suji: 6, dan: 9 }, to: { suji: 7, dan: 8 } },
      // ☗７八金 (８八を受ける)
      { teban: GOTE, from: { suji: 4, dan: 1 }, to: { suji: 3, dan: 2 } },
      // ☖３二金 (２二を受ける)
      { teban: SENTE, from: { suji: 2, dan: 5 }, to: { suji: 2, dan: 4 } },
      // ☗２四歩
      { teban: GOTE, from: { suji: 2, dan: 3 }, to: { suji: 2, dan: 4 } },
      // ☖同歩
      { teban: SENTE, from: { suji: 2, dan: 8 }, to: { suji: 2, dan: 4 } },
      // ☗同飛
      { teban: GOTE, from: { suji: 0, dan: 0 }, to: { suji: 2, dan: 3 }, drop: FU },
      // ☖２三歩
      { teban: SENTE, from: { suji: 2, dan: 4 }, to: { suji: 2, dan: 8 } },
      // ☗２八飛
      { teban: GOTE, from: { suji: 8, dan: 5 }, to: { suji: 8, dan: 6 } },
      // ☖８六歩
      { teban: SENTE, from: { suji: 8, dan: 7 }, to: { suji: 8, dan: 6 } },
      // ☗同歩
      { teban: GOTE, from: { suji: 8, dan: 2 }, to: { suji: 8, dan: 6 } },
      // ☖同飛
      { teban: SENTE, from: { suji: 0, dan: 0 }, to: { suji: 8, dan: 7 }, drop: FU },
      // ☗８七歩
      { teban: GOTE, from: { suji: 8, dan: 6 }, to: { suji: 8, dan: 2 } }
      // ☖８二飛
    ]
  },
  {
    // 後手四間飛車 vs 居飛車急戦の基本形。▲２五歩には△３三角、玉は△６二玉→７二玉→８二玉で美濃完成。
    name: "\u5F8C\u624B\u56DB\u9593\u98DB\u8ECA (vs\u6025\u6226\u30FB\u7F8E\u6FC3\u5B8C\u6210)",
    category: "\u632F\u308A\u98DB\u8ECA",
    priority: 84,
    moves: [
      { teban: SENTE, from: { suji: 7, dan: 7 }, to: { suji: 7, dan: 6 } },
      // ☗７六歩
      { teban: GOTE, from: { suji: 3, dan: 3 }, to: { suji: 3, dan: 4 } },
      // ☖３四歩
      { teban: SENTE, from: { suji: 2, dan: 7 }, to: { suji: 2, dan: 6 } },
      // ☗２六歩
      { teban: GOTE, from: { suji: 4, dan: 3 }, to: { suji: 4, dan: 4 } },
      // ☖４四歩 (角道を止める)
      { teban: SENTE, from: { suji: 2, dan: 6 }, to: { suji: 2, dan: 5 } },
      // ☗２五歩
      { teban: GOTE, from: { suji: 2, dan: 2 }, to: { suji: 3, dan: 3 } },
      // ☖３三角 (飛車先を受ける)
      { teban: SENTE, from: { suji: 3, dan: 9 }, to: { suji: 4, dan: 8 } },
      // ☗４八銀
      { teban: GOTE, from: { suji: 8, dan: 2 }, to: { suji: 4, dan: 2 } },
      // ☖４二飛 (四間飛車)
      { teban: SENTE, from: { suji: 5, dan: 9 }, to: { suji: 6, dan: 8 } },
      // ☗６八玉
      { teban: GOTE, from: { suji: 5, dan: 1 }, to: { suji: 6, dan: 2 } },
      // ☖６二玉
      { teban: SENTE, from: { suji: 6, dan: 8 }, to: { suji: 7, dan: 8 } },
      // ☗７八玉 (舟囲いへ)
      { teban: GOTE, from: { suji: 6, dan: 2 }, to: { suji: 7, dan: 2 } },
      // ☖７二玉
      { teban: SENTE, from: { suji: 4, dan: 9 }, to: { suji: 5, dan: 8 } },
      // ☗５八金右
      { teban: GOTE, from: { suji: 7, dan: 2 }, to: { suji: 8, dan: 2 } },
      // ☖８二玉 (美濃完成)
      { teban: SENTE, from: { suji: 5, dan: 7 }, to: { suji: 5, dan: 6 } },
      // ☗５六歩
      { teban: GOTE, from: { suji: 7, dan: 1 }, to: { suji: 7, dan: 2 } }
      // ☖７二銀
    ]
  },
  {
    // 先手四間飛車 vs 後手居飛車急戦。△８五歩には▲７七角。玉は▲４八→３八→２八で美濃完成。
    name: "\u56DB\u9593\u98DB\u8ECA (\u5148\u624B\u30FB\u7F8E\u6FC3\u5B8C\u6210)",
    category: "\u632F\u308A\u98DB\u8ECA",
    priority: 83,
    moves: [
      { teban: SENTE, from: { suji: 7, dan: 7 }, to: { suji: 7, dan: 6 } },
      // ☗７六歩
      { teban: GOTE, from: { suji: 3, dan: 3 }, to: { suji: 3, dan: 4 } },
      // ☖３四歩
      { teban: SENTE, from: { suji: 6, dan: 7 }, to: { suji: 6, dan: 6 } },
      // ☗６六歩 (角道を止める)
      { teban: GOTE, from: { suji: 8, dan: 3 }, to: { suji: 8, dan: 4 } },
      // ☖８四歩
      { teban: SENTE, from: { suji: 2, dan: 8 }, to: { suji: 6, dan: 8 } },
      // ☗６八飛 (四間飛車)
      { teban: GOTE, from: { suji: 8, dan: 4 }, to: { suji: 8, dan: 5 } },
      // ☖８五歩
      { teban: SENTE, from: { suji: 8, dan: 8 }, to: { suji: 7, dan: 7 } },
      // ☗７七角 (飛車先を受ける)
      { teban: GOTE, from: { suji: 5, dan: 1 }, to: { suji: 4, dan: 2 } },
      // ☖４二玉
      { teban: SENTE, from: { suji: 5, dan: 9 }, to: { suji: 4, dan: 8 } },
      // ☗４八玉
      { teban: GOTE, from: { suji: 4, dan: 2 }, to: { suji: 3, dan: 2 } },
      // ☖３二玉 (舟囲い)
      { teban: SENTE, from: { suji: 4, dan: 8 }, to: { suji: 3, dan: 8 } },
      // ☗３八玉
      { teban: GOTE, from: { suji: 6, dan: 1 }, to: { suji: 5, dan: 2 } },
      // ☖５二金右
      { teban: SENTE, from: { suji: 3, dan: 8 }, to: { suji: 2, dan: 8 } },
      // ☗２八玉 (美濃)
      { teban: GOTE, from: { suji: 5, dan: 3 }, to: { suji: 5, dan: 4 } },
      // ☖５四歩
      { teban: SENTE, from: { suji: 3, dan: 9 }, to: { suji: 3, dan: 8 } },
      // ☗３八銀
      { teban: GOTE, from: { suji: 7, dan: 1 }, to: { suji: 6, dan: 2 } }
      // ☖６二銀 (急戦準備)
    ]
  },
  {
    // 後手ゴキゲン中飛車の本手順: △３四歩→△５四歩→△５二飛→△５五歩位取り→美濃。
    name: "\u30B4\u30AD\u30B2\u30F3\u4E2D\u98DB\u8ECA (\u5F8C\u624B\u30FB\u672C\u5F62)",
    category: "\u632F\u308A\u98DB\u8ECA",
    priority: 82,
    moves: [
      { teban: SENTE, from: { suji: 7, dan: 7 }, to: { suji: 7, dan: 6 } },
      // ☗７六歩
      { teban: GOTE, from: { suji: 3, dan: 3 }, to: { suji: 3, dan: 4 } },
      // ☖３四歩
      { teban: SENTE, from: { suji: 2, dan: 7 }, to: { suji: 2, dan: 6 } },
      // ☗２六歩
      { teban: GOTE, from: { suji: 5, dan: 3 }, to: { suji: 5, dan: 4 } },
      // ☖５四歩
      { teban: SENTE, from: { suji: 2, dan: 6 }, to: { suji: 2, dan: 5 } },
      // ☗２五歩
      { teban: GOTE, from: { suji: 8, dan: 2 }, to: { suji: 5, dan: 2 } },
      // ☖５二飛 (ゴキゲン中飛車)
      { teban: SENTE, from: { suji: 3, dan: 9 }, to: { suji: 4, dan: 8 } },
      // ☗４八銀
      { teban: GOTE, from: { suji: 5, dan: 4 }, to: { suji: 5, dan: 5 } },
      // ☖５五歩 (位取り)
      { teban: SENTE, from: { suji: 5, dan: 9 }, to: { suji: 6, dan: 8 } },
      // ☗６八玉
      { teban: GOTE, from: { suji: 5, dan: 1 }, to: { suji: 6, dan: 2 } },
      // ☖６二玉
      { teban: SENTE, from: { suji: 6, dan: 8 }, to: { suji: 7, dan: 8 } },
      // ☗７八玉
      { teban: GOTE, from: { suji: 6, dan: 2 }, to: { suji: 7, dan: 2 } },
      // ☖７二玉
      { teban: SENTE, from: { suji: 4, dan: 9 }, to: { suji: 5, dan: 8 } },
      // ☗５八金右
      { teban: GOTE, from: { suji: 7, dan: 2 }, to: { suji: 8, dan: 2 } },
      // ☖８二玉 (美濃)
      { teban: SENTE, from: { suji: 7, dan: 9 }, to: { suji: 6, dan: 8 } },
      // ☗６八銀
      { teban: GOTE, from: { suji: 7, dan: 1 }, to: { suji: 7, dan: 2 } }
      // ☖７二銀
    ]
  },
  {
    // ゴキゲン中飛車 vs 丸山ワクチン（▲２二角成△同銀）。△３三銀と上がって美濃へ。
    name: "\u30B4\u30AD\u30B2\u30F3\u4E2D\u98DB\u8ECA (vs\u4E38\u5C71\u30EF\u30AF\u30C1\u30F3)",
    category: "\u632F\u308A\u98DB\u8ECA",
    priority: 76,
    moves: [
      { teban: SENTE, from: { suji: 7, dan: 7 }, to: { suji: 7, dan: 6 } },
      // ☗７六歩
      { teban: GOTE, from: { suji: 3, dan: 3 }, to: { suji: 3, dan: 4 } },
      // ☖３四歩
      { teban: SENTE, from: { suji: 2, dan: 7 }, to: { suji: 2, dan: 6 } },
      // ☗２六歩
      { teban: GOTE, from: { suji: 5, dan: 3 }, to: { suji: 5, dan: 4 } },
      // ☖５四歩
      { teban: SENTE, from: { suji: 2, dan: 6 }, to: { suji: 2, dan: 5 } },
      // ☗２五歩
      { teban: GOTE, from: { suji: 8, dan: 2 }, to: { suji: 5, dan: 2 } },
      // ☖５二飛
      { teban: SENTE, from: { suji: 8, dan: 8 }, to: { suji: 2, dan: 2 }, promote: true },
      // ☗２二角成 (丸山ワクチン)
      { teban: GOTE, from: { suji: 3, dan: 1 }, to: { suji: 2, dan: 2 } },
      // ☖同銀
      { teban: SENTE, from: { suji: 3, dan: 9 }, to: { suji: 4, dan: 8 } },
      // ☗４八銀
      { teban: GOTE, from: { suji: 2, dan: 2 }, to: { suji: 3, dan: 3 } },
      // ☖３三銀 (基本形)
      { teban: SENTE, from: { suji: 5, dan: 9 }, to: { suji: 6, dan: 8 } },
      // ☗６八玉
      { teban: GOTE, from: { suji: 5, dan: 1 }, to: { suji: 6, dan: 2 } },
      // ☖６二玉
      { teban: SENTE, from: { suji: 6, dan: 8 }, to: { suji: 7, dan: 8 } },
      // ☗７八玉
      { teban: GOTE, from: { suji: 6, dan: 2 }, to: { suji: 7, dan: 2 } },
      // ☖７二玉
      { teban: SENTE, from: { suji: 4, dan: 9 }, to: { suji: 5, dan: 8 } },
      // ☗５八金右
      { teban: GOTE, from: { suji: 7, dan: 2 }, to: { suji: 8, dan: 2 } }
      // ☖８二玉 (美濃)
    ]
  },
  {
    // 先手三間飛車の美濃完成形。△８五歩には▲７七角。
    name: "\u4E09\u9593\u98DB\u8ECA (\u5148\u624B\u30FB\u7F8E\u6FC3\u5B8C\u6210)",
    category: "\u632F\u308A\u98DB\u8ECA",
    priority: 79,
    moves: [
      { teban: SENTE, from: { suji: 7, dan: 7 }, to: { suji: 7, dan: 6 } },
      // ☗７六歩
      { teban: GOTE, from: { suji: 3, dan: 3 }, to: { suji: 3, dan: 4 } },
      // ☖３四歩
      { teban: SENTE, from: { suji: 2, dan: 8 }, to: { suji: 7, dan: 8 } },
      // ☗７八飛 (三間飛車)
      { teban: GOTE, from: { suji: 8, dan: 3 }, to: { suji: 8, dan: 4 } },
      // ☖８四歩
      { teban: SENTE, from: { suji: 6, dan: 7 }, to: { suji: 6, dan: 6 } },
      // ☗６六歩 (角道を止める)
      { teban: GOTE, from: { suji: 5, dan: 3 }, to: { suji: 5, dan: 4 } },
      // ☖５四歩
      { teban: SENTE, from: { suji: 5, dan: 9 }, to: { suji: 4, dan: 8 } },
      // ☗４八玉
      { teban: GOTE, from: { suji: 5, dan: 1 }, to: { suji: 4, dan: 2 } },
      // ☖４二玉
      { teban: SENTE, from: { suji: 4, dan: 8 }, to: { suji: 3, dan: 8 } },
      // ☗３八玉
      { teban: GOTE, from: { suji: 4, dan: 2 }, to: { suji: 3, dan: 2 } },
      // ☖３二玉
      { teban: SENTE, from: { suji: 3, dan: 8 }, to: { suji: 2, dan: 8 } },
      // ☗２八玉 (美濃)
      { teban: GOTE, from: { suji: 6, dan: 1 }, to: { suji: 5, dan: 2 } },
      // ☖５二金右
      { teban: SENTE, from: { suji: 3, dan: 9 }, to: { suji: 3, dan: 8 } },
      // ☗３八銀
      { teban: GOTE, from: { suji: 8, dan: 4 }, to: { suji: 8, dan: 5 } },
      // ☖８五歩
      { teban: SENTE, from: { suji: 8, dan: 8 }, to: { suji: 7, dan: 7 } },
      // ☗７七角 (飛車先を受ける)
      { teban: GOTE, from: { suji: 7, dan: 1 }, to: { suji: 6, dan: 2 } }
      // ☖６二銀
    ]
  },
  {
    // 角道相掛かり（▲７七角△３四歩▲６六歩型）。この▲６六歩局面は従来定跡外で、
    // NNUEが△８四飛（浮き飛車, YaneuraOu depth20で約−126cp・最善−23cpから100cp以上劣る弱手）
    // を指していた。本手順は△３三角と収める本筋。YaneuraOu depth20 の最善手で各手を検証 (2026-07)。
    name: "\u89D2\u9053\u76F8\u639B\u304B\u308A (\u25B2\uFF16\u516D\u6B69\u30FB\u25B3\uFF13\u4E09\u89D2\u578B)",
    category: "\u76F8\u5C45\u98DB\u8ECA",
    priority: 85,
    moves: [
      { teban: SENTE, from: { suji: 7, dan: 7 }, to: { suji: 7, dan: 6 } },
      // ☗７六歩
      { teban: GOTE, from: { suji: 8, dan: 3 }, to: { suji: 8, dan: 4 } },
      // ☖８四歩
      { teban: SENTE, from: { suji: 2, dan: 7 }, to: { suji: 2, dan: 6 } },
      // ☗２六歩
      { teban: GOTE, from: { suji: 8, dan: 4 }, to: { suji: 8, dan: 5 } },
      // ☖８五歩
      { teban: SENTE, from: { suji: 8, dan: 8 }, to: { suji: 7, dan: 7 } },
      // ☗７七角 (８六交換を受ける)
      { teban: GOTE, from: { suji: 3, dan: 3 }, to: { suji: 3, dan: 4 } },
      // ☖３四歩
      { teban: SENTE, from: { suji: 6, dan: 7 }, to: { suji: 6, dan: 6 } },
      // ☗６六歩 (角道を止める)
      { teban: GOTE, from: { suji: 2, dan: 2 }, to: { suji: 3, dan: 3 } },
      // ☖３三角 (最善: △８四飛の浮き飛車は弱手)
      { teban: SENTE, from: { suji: 3, dan: 9 }, to: { suji: 4, dan: 8 } },
      // ☗４八銀
      { teban: GOTE, from: { suji: 7, dan: 1 }, to: { suji: 6, dan: 2 } },
      // ☖６二銀
      { teban: SENTE, from: { suji: 2, dan: 6 }, to: { suji: 2, dan: 5 } },
      // ☗２五歩
      { teban: GOTE, from: { suji: 7, dan: 3 }, to: { suji: 7, dan: 4 } },
      // ☖７四歩
      { teban: SENTE, from: { suji: 7, dan: 9 }, to: { suji: 7, dan: 8 } },
      // ☗７八銀
      { teban: GOTE, from: { suji: 5, dan: 3 }, to: { suji: 5, dan: 4 } },
      // ☖５四歩
      { teban: SENTE, from: { suji: 7, dan: 8 }, to: { suji: 6, dan: 7 } }
      // ☗６七銀
    ]
  },
  {
    // 角道相掛かり（▲６六歩型）で後手が△３二銀と上がる変化。▲６六歩局面で△８四飛を避ける
    // もう一つの本筋。上記△３三角型と同じ▲６六歩局面(後手番)を別候補として供給する。
    // YaneuraOu depth20 の最善手で各手を検証 (2026-07)。
    name: "\u89D2\u9053\u76F8\u639B\u304B\u308A (\u25B2\uFF16\u516D\u6B69\u30FB\u25B3\uFF13\u4E8C\u9280\u578B)",
    category: "\u76F8\u5C45\u98DB\u8ECA",
    priority: 80,
    moves: [
      { teban: SENTE, from: { suji: 7, dan: 7 }, to: { suji: 7, dan: 6 } },
      // ☗７六歩
      { teban: GOTE, from: { suji: 8, dan: 3 }, to: { suji: 8, dan: 4 } },
      // ☖８四歩
      { teban: SENTE, from: { suji: 2, dan: 7 }, to: { suji: 2, dan: 6 } },
      // ☗２六歩
      { teban: GOTE, from: { suji: 8, dan: 4 }, to: { suji: 8, dan: 5 } },
      // ☖８五歩
      { teban: SENTE, from: { suji: 8, dan: 8 }, to: { suji: 7, dan: 7 } },
      // ☗７七角
      { teban: GOTE, from: { suji: 3, dan: 3 }, to: { suji: 3, dan: 4 } },
      // ☖３四歩
      { teban: SENTE, from: { suji: 6, dan: 7 }, to: { suji: 6, dan: 6 } },
      // ☗６六歩
      { teban: GOTE, from: { suji: 3, dan: 1 }, to: { suji: 3, dan: 2 } },
      // ☖３二銀 (△８四飛を避けるもう一つの本筋)
      { teban: SENTE, from: { suji: 2, dan: 6 }, to: { suji: 2, dan: 5 } },
      // ☗２五歩
      { teban: GOTE, from: { suji: 2, dan: 2 }, to: { suji: 3, dan: 3 } },
      // ☖３三角
      { teban: SENTE, from: { suji: 7, dan: 9 }, to: { suji: 7, dan: 8 } },
      // ☗７八銀
      { teban: GOTE, from: { suji: 7, dan: 1 }, to: { suji: 6, dan: 2 } }
      // ☖６二銀
    ]
  },
  {
    // 相掛かり・飛車先交換（▲２六飛の浮き飛車）から▲３八銀と上がった局面。▲７六歩を保留した
    // 相掛かりで、この▲３八銀局面(後手番)は従来定跡外でNNUEが弱手を指していた。△３四歩と伸ばして
    // 局面を落ち着かせる本筋。YaneuraOu depth20 の最善手で各手を検証 (2026-07)。
    name: "\u76F8\u639B\u304B\u308A (\u25B2\uFF12\u516D\u98DB\u30FB\u25B2\uFF13\u516B\u9280\u578B)",
    category: "\u76F8\u5C45\u98DB\u8ECA",
    priority: 81,
    moves: [
      { teban: SENTE, from: { suji: 2, dan: 7 }, to: { suji: 2, dan: 6 } },
      // ☗２六歩
      { teban: GOTE, from: { suji: 8, dan: 3 }, to: { suji: 8, dan: 4 } },
      // ☖８四歩
      { teban: SENTE, from: { suji: 2, dan: 6 }, to: { suji: 2, dan: 5 } },
      // ☗２五歩
      { teban: GOTE, from: { suji: 8, dan: 4 }, to: { suji: 8, dan: 5 } },
      // ☖８五歩
      { teban: SENTE, from: { suji: 6, dan: 9 }, to: { suji: 7, dan: 8 } },
      // ☗７八金 (８八を受ける)
      { teban: GOTE, from: { suji: 4, dan: 1 }, to: { suji: 3, dan: 2 } },
      // ☖３二金 (２二を受ける)
      { teban: SENTE, from: { suji: 2, dan: 5 }, to: { suji: 2, dan: 4 } },
      // ☗２四歩 (飛車先交換)
      { teban: GOTE, from: { suji: 2, dan: 3 }, to: { suji: 2, dan: 4 } },
      // ☖同歩
      { teban: SENTE, from: { suji: 2, dan: 8 }, to: { suji: 2, dan: 4 } },
      // ☗同飛
      { teban: GOTE, from: { suji: 0, dan: 0 }, to: { suji: 2, dan: 3 }, drop: FU },
      // ☖２三歩 (正しい受け)
      { teban: SENTE, from: { suji: 2, dan: 4 }, to: { suji: 2, dan: 6 } },
      // ☗２六飛 (浮き飛車)
      { teban: GOTE, from: { suji: 7, dan: 1 }, to: { suji: 7, dan: 2 } },
      // ☖７二銀
      { teban: SENTE, from: { suji: 3, dan: 9 }, to: { suji: 3, dan: 8 } },
      // ☗３八銀 (この局面が従来定跡外だった)
      { teban: GOTE, from: { suji: 3, dan: 3 }, to: { suji: 3, dan: 4 } },
      // ☖３四歩 (最善: 局面を落ち着かせる)
      { teban: SENTE, from: { suji: 7, dan: 7 }, to: { suji: 7, dan: 6 } },
      // ☗７六歩
      { teban: GOTE, from: { suji: 6, dan: 3 }, to: { suji: 6, dan: 4 } },
      // ☖６四歩
      { teban: SENTE, from: { suji: 1, dan: 7 }, to: { suji: 1, dan: 6 } },
      // ☗１六歩
      { teban: GOTE, from: { suji: 5, dan: 1 }, to: { suji: 4, dan: 2 } }
      // ☖４二玉
    ]
  },
  {
    // 角道相掛かり（▲６六歩・△３三角型）の深い延長。#338 の△３三角型は 9手目を ▲４八銀 として
    // いたが、実戦では 9手目 ▲２五歩 が有力で、その後の 10手目局面（SFEN
    // "lnsgkgsnl/1r7/p1ppppbpp/6p2/1p5P1/2PB... w - 10")が従来定跡外だった。NNUE はここで
    // △８四飛（浮き飛車, YaneuraOu depth24 で最善から約58cp以上劣り top6 外の劣手）を指していた。
    // 本手順は △７四歩 から自然に駒組みを進める本筋で、10手目以降の後手手番（10/12/14/16/18手目）を
    // すべて YaneuraOu (NNUE 9.60) depth20〜24 の最善級手（top6・最善から100cp未満）で検証 (2026-07)。
    name: "\u89D2\u9053\u76F8\u639B\u304B\u308A (\u25B2\uFF12\u4E94\u6B69\u30FB\u25B3\uFF17\u56DB\u6B69\u5EF6\u9577\u578B)",
    category: "\u76F8\u5C45\u98DB\u8ECA",
    priority: 86,
    moves: [
      { teban: SENTE, from: { suji: 7, dan: 7 }, to: { suji: 7, dan: 6 } },
      // ☗７六歩
      { teban: GOTE, from: { suji: 8, dan: 3 }, to: { suji: 8, dan: 4 } },
      // ☖８四歩
      { teban: SENTE, from: { suji: 2, dan: 7 }, to: { suji: 2, dan: 6 } },
      // ☗２六歩
      { teban: GOTE, from: { suji: 8, dan: 4 }, to: { suji: 8, dan: 5 } },
      // ☖８五歩
      { teban: SENTE, from: { suji: 8, dan: 8 }, to: { suji: 7, dan: 7 } },
      // ☗７七角
      { teban: GOTE, from: { suji: 3, dan: 3 }, to: { suji: 3, dan: 4 } },
      // ☖３四歩
      { teban: SENTE, from: { suji: 6, dan: 7 }, to: { suji: 6, dan: 6 } },
      // ☗６六歩 (角道を止める)
      { teban: GOTE, from: { suji: 2, dan: 2 }, to: { suji: 3, dan: 3 } },
      // ☖３三角 (△８四飛の浮き飛車は劣手)
      { teban: SENTE, from: { suji: 2, dan: 6 }, to: { suji: 2, dan: 5 } },
      // ☗２五歩 (9手目の有力手・この局面が定跡外だった)
      { teban: GOTE, from: { suji: 7, dan: 3 }, to: { suji: 7, dan: 4 } },
      // ☖７四歩 (最善級: △８四飛を避けて駒組み)
      { teban: SENTE, from: { suji: 3, dan: 9 }, to: { suji: 4, dan: 8 } },
      // ☗４八銀
      { teban: GOTE, from: { suji: 6, dan: 1 }, to: { suji: 5, dan: 2 } },
      // ☖５二金左
      { teban: SENTE, from: { suji: 3, dan: 7 }, to: { suji: 3, dan: 6 } },
      // ☗３六歩
      { teban: GOTE, from: { suji: 5, dan: 3 }, to: { suji: 5, dan: 4 } },
      // ☖５四歩
      { teban: SENTE, from: { suji: 7, dan: 9 }, to: { suji: 7, dan: 8 } },
      // ☗７八銀
      { teban: GOTE, from: { suji: 7, dan: 1 }, to: { suji: 6, dan: 2 } },
      // ☖６二銀
      { teban: SENTE, from: { suji: 4, dan: 8 }, to: { suji: 3, dan: 7 } },
      // ☗３七銀
      { teban: GOTE, from: { suji: 8, dan: 1 }, to: { suji: 7, dan: 3 } }
      // ☖７三桂 (後手やや指せる)
    ]
  },
  {
    // 角道相掛かり（▲６六歩・△３三角型）で 9手目に先手が ▲７八金 と上がる分岐。上の ▲２五歩延長型と
    // 同じく △８四飛の再発を防ぐため、9手目 ▲７八金 の変化でも良い駒組みを供給する。10手目・12手目・
    // 14手目の後手手番を YaneuraOu depth20〜24 の最善級手で検証 (2026-07)。
    name: "\u89D2\u9053\u76F8\u639B\u304B\u308A (\u25B2\uFF17\u516B\u91D1\u5206\u5C90)",
    category: "\u76F8\u5C45\u98DB\u8ECA",
    priority: 82,
    moves: [
      { teban: SENTE, from: { suji: 7, dan: 7 }, to: { suji: 7, dan: 6 } },
      // ☗７六歩
      { teban: GOTE, from: { suji: 8, dan: 3 }, to: { suji: 8, dan: 4 } },
      // ☖８四歩
      { teban: SENTE, from: { suji: 2, dan: 7 }, to: { suji: 2, dan: 6 } },
      // ☗２六歩
      { teban: GOTE, from: { suji: 8, dan: 4 }, to: { suji: 8, dan: 5 } },
      // ☖８五歩
      { teban: SENTE, from: { suji: 8, dan: 8 }, to: { suji: 7, dan: 7 } },
      // ☗７七角
      { teban: GOTE, from: { suji: 3, dan: 3 }, to: { suji: 3, dan: 4 } },
      // ☖３四歩
      { teban: SENTE, from: { suji: 6, dan: 7 }, to: { suji: 6, dan: 6 } },
      // ☗６六歩
      { teban: GOTE, from: { suji: 2, dan: 2 }, to: { suji: 3, dan: 3 } },
      // ☖３三角
      { teban: SENTE, from: { suji: 6, dan: 9 }, to: { suji: 7, dan: 8 } },
      // ☗７八金 (9手目の別の自然手)
      { teban: GOTE, from: { suji: 7, dan: 1 }, to: { suji: 6, dan: 2 } },
      // ☖６二銀 (最善級)
      { teban: SENTE, from: { suji: 7, dan: 9 }, to: { suji: 6, dan: 8 } },
      // ☗６八銀
      { teban: GOTE, from: { suji: 3, dan: 1 }, to: { suji: 3, dan: 2 } },
      // ☖３二銀 (最善)
      { teban: SENTE, from: { suji: 2, dan: 6 }, to: { suji: 2, dan: 5 } },
      // ☗２五歩
      { teban: GOTE, from: { suji: 7, dan: 3 }, to: { suji: 7, dan: 4 } }
      // ☖７四歩 (最善級)
    ]
  }
];
function dualKeyGet(map, primary, secondary) {
  return map.get(primary >>> 0)?.get(secondary >>> 0);
}
function dualKeySet(map, primary, secondary, value) {
  const primaryU32 = primary >>> 0;
  const secondaryU32 = secondary >>> 0;
  let bucket = map.get(primaryU32);
  if (!bucket) {
    bucket = /* @__PURE__ */ new Map();
    map.set(primaryU32, bucket);
  }
  bucket.set(secondaryU32, value);
}
var bookCache = null;
var bestScoreCache = /* @__PURE__ */ new Map();
var buildMoves = new MoveListImproved();
var runtimeMoves = new MoveListImproved();
function buildBook() {
  const map = /* @__PURE__ */ new Map();
  for (const line of OPENING_LINES) {
    const k = InitialPositionImproved.createInitialPosition();
    k.setTeban(SENTE);
    for (const mv of line.moves) {
      if (k.teban !== mv.teban) {
        throw new Error(`[OpeningBookImproved] line=${line.name} expected teban=${mv.teban} but was ${k.teban}`);
      }
      const from = posOf(mv.from.suji, mv.from.dan);
      const to = posOf(mv.to.suji, mv.to.dan);
      const promote = mv.promote ?? false;
      if (from === 0 && !mv.drop) {
        throw new Error(`[OpeningBookImproved] line=${line.name} drop move without \`drop\` piece type`);
      }
      const koma = from === 0 ? mv.drop | mv.teban : k.get(from);
      if (from !== 0 && koma === EMPTY) {
        throw new Error(`[OpeningBookImproved] line=${line.name} empty from square: ${mv.from.suji}${mv.from.dan}`);
      }
      const legal = GenerateMovesImproved.generateLegalMovesPooled(k, buildMoves);
      const found = legal.find((t) => t.from === from && t.to === to && t.promote === promote && t.koma === koma) ?? null;
      if (!found) {
        throw new Error(
          `[OpeningBookImproved] illegal book move in line=${line.name}: from=${from} to=${to} promote=${promote}`
        );
      }
      const hashA = k.HashVal;
      const hashB = k.SecondaryHashVal;
      const cand = { move: found.clone(), priority: line.priority, lineName: line.name };
      const key = moveKey(cand.move);
      let secondaryBuckets = map.get(hashA);
      if (!secondaryBuckets) {
        secondaryBuckets = /* @__PURE__ */ new Map();
        map.set(hashA, secondaryBuckets);
      }
      const bucket = secondaryBuckets.get(hashB) ?? /* @__PURE__ */ new Map();
      const prev = bucket.get(key);
      if (!prev || cand.priority > prev.priority) bucket.set(key, cand);
      secondaryBuckets.set(hashB, bucket);
      k.move(found);
      k.toggleTeban();
    }
  }
  const out = /* @__PURE__ */ new Map();
  for (const [hashA, secondaryBuckets] of map.entries()) {
    for (const [hashB, bucket] of secondaryBuckets.entries()) {
      dualKeySet(out, hashA, hashB, [...bucket.values()]);
    }
  }
  return out;
}
function getBook() {
  if (!bookCache) bookCache = buildBook();
  return bookCache;
}
var EXTERNAL_LINE_NAME = "\u30DA\u30BF\u30B7\u30E7\u30C3\u30AF\u5B9A\u8DE1";
var EXTERNAL_BASE_PRIORITY = 50;
var externalBook = null;
function buildExternalCandidates(entry, k, legal) {
  const out = [];
  const mv = entry.moves;
  const n = mv.length / 3 | 0;
  for (let i = 0; i < n; i++) {
    const from = mv[i * 3];
    const to = mv[i * 3 + 1];
    const flags = mv[i * 3 + 2];
    const promote = (flags & 1) !== 0;
    const dropType = flags >> 1 & 7;
    for (let j = 0; j < legal.length; j++) {
      const m = legal[j];
      if (m.to !== to || m.from !== from) continue;
      if (from === 0) {
        if (m.koma !== (dropType | k.teban)) continue;
      } else if (m.promote !== promote) {
        continue;
      }
      out.push({ move: m, priority: EXTERNAL_BASE_PRIORITY - i, lineName: EXTERNAL_LINE_NAME });
      break;
    }
  }
  return out;
}
function pickDeterministic(candidates, seed) {
  const s = seed >>> 0 ^ (seed >>> 16 | 0);
  const idx = candidates.length <= 1 ? 0 : s % candidates.length;
  return candidates[idx];
}
function looksLikeOpening(k) {
  if (k.kingS <= 0 || k.kingG <= 0) return false;
  let hand = 0;
  for (let i = 0; i < k.hand.length; i++) hand += k.hand[i] | 0;
  return hand <= 4;
}
var openingBookStats = { probes: 0, hits: 0, externalHits: 0 };
function getOpeningMoveImproved(k, difficulty, options = {}) {
  if (!looksLikeOpening(k)) return null;
  if (GenerateMovesImproved.isKingInCheck(k, k.teban)) return null;
  openingBookStats.probes++;
  let candidates = dualKeyGet(getBook(), k.HashVal, k.SecondaryHashVal);
  let externalEntry;
  if (!candidates || candidates.length === 0) {
    externalEntry = externalBook ? dualKeyGet(externalBook, k.HashVal, k.SecondaryHashVal) : void 0;
    if (!externalEntry) return null;
  }
  const legal = GenerateMovesImproved.generateLegalMovesPooled(k, runtimeMoves);
  if (legal.length === 0) return null;
  if (!candidates || candidates.length === 0) {
    candidates = buildExternalCandidates(externalEntry, k, legal);
    if (candidates.length === 0) return null;
  }
  const legalByKey = /* @__PURE__ */ new Map();
  for (const m of legal) legalByKey.set(moveKey(m), m);
  const root = k.clone();
  const evalBeforeMove = evalForSideToMove(root);
  let bestInfo = dualKeyGet(bestScoreCache, k.HashVal, k.SecondaryHashVal);
  if (!bestInfo) {
    let bestScore = -Infinity;
    let secondBestScore = -Infinity;
    let bestIsQuiet = false;
    for (const m of legal) {
      const score = staticEvalAfterMove(root, m, evalBeforeMove);
      if (score > bestScore) {
        secondBestScore = bestScore;
        bestScore = score;
        bestIsQuiet = m.from !== 0 && m.capture === EMPTY && !m.promote;
      } else if (score > secondBestScore) {
        secondBestScore = score;
      }
    }
    bestInfo = { bestScore, secondBestScore, bestIsQuiet };
    dualKeySet(bestScoreCache, k.HashVal, k.SecondaryHashVal, bestInfo);
  }
  const threshold = openingThresholdByDifficulty(difficulty);
  const quietAwareBaseline = bestInfo.bestIsQuiet && Number.isFinite(bestInfo.secondBestScore) ? bestInfo.secondBestScore : bestInfo.bestScore;
  const baselineScore = Math.min(quietAwareBaseline, evalBeforeMove);
  const filtered = [];
  for (const c of candidates) {
    const m = legalByKey.get(moveKey(c.move));
    if (!m) continue;
    filtered.push({ ...c, move: m });
  }
  const scored = [];
  for (const c of filtered) {
    const score = staticEvalAfterMove(root, c.move, evalBeforeMove);
    if (score < baselineScore - threshold) continue;
    scored.push({ ...c, score });
  }
  if (scored.length === 0) return null;
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.priority !== a.priority) return b.priority - a.priority;
    return a.lineName.localeCompare(b.lineName);
  });
  const topScore = scored[0].score;
  const margin = varietyMarginByDifficulty(difficulty);
  const poolSize = varietyPoolSizeByDifficulty(difficulty);
  const pool = margin <= 0 ? scored.slice(0, 1) : scored.filter((c) => topScore - c.score <= margin).slice(0, Math.min(poolSize, scored.length));
  const picked = pickDeterministic(pool.length > 0 ? pool : scored.slice(0, 1), k.HashVal);
  if (options.debug) {
    const pieceType = getKomashu(picked.move.koma);
    const pieceName = pieceType === FU ? "FU" : pieceType === KY ? "KY" : pieceType === KE ? "KE" : pieceType === GI ? "GI" : pieceType === KI ? "KI" : pieceType === KA ? "KA" : pieceType === HI ? "HI" : pieceType === OU ? "OU" : String(pieceType);
    console.log(
      `[OpeningBookImproved] ${picked.lineName} picked=${picked.move.toString()} piece=${pieceName} score=${picked.score} baseline=${baselineScore} best=${bestInfo.bestScore}`
    );
  }
  openingBookStats.hits++;
  if (picked.lineName === EXTERNAL_LINE_NAME) openingBookStats.externalHits++;
  return picked.move.clone();
}

// src/components/game/ShogiImproved/TranspositionTableImprovedPackedDual.ts
var TranspositionTableImprovedPackedDual = class _TranspositionTableImprovedPackedDual {
  constructor() {
    this.usedCount = 0;
    this.primaryHash = new Uint32Array(_TranspositionTableImprovedPackedDual.SIZE);
    this.secondaryHash = new Uint32Array(_TranspositionTableImprovedPackedDual.SIZE);
    this.value = new Int32Array(_TranspositionTableImprovedPackedDual.SIZE);
    this.flag = new Uint8Array(_TranspositionTableImprovedPackedDual.SIZE);
    this.remainDepth = new Uint8Array(_TranspositionTableImprovedPackedDual.SIZE);
    this.bestKey = new Uint32Array(_TranspositionTableImprovedPackedDual.SIZE);
    this.secondKey = new Uint32Array(_TranspositionTableImprovedPackedDual.SIZE);
    this.used = new Uint8Array(_TranspositionTableImprovedPackedDual.SIZE);
  }
  static {
    this.EXACTLY_VALUE = 0;
  }
  static {
    this.LOWER_BOUND = 1;
  }
  static {
    this.UPPER_BOUND = 2;
  }
  static {
    this.SIZE = 1048576;
  }
  static {
    this.MASK = 1048575;
  }
  size() {
    return this.primaryHash.length;
  }
  usedEntries() {
    return this.usedCount;
  }
  fillRate() {
    return this.usedCount / this.size() * 100;
  }
  clear() {
    this.used.fill(0);
    this.usedCount = 0;
  }
  /** @returns the table index if the complete hash pair is present, otherwise -1. */
  probe(primaryHash, secondaryHash) {
    const index = primaryHash & _TranspositionTableImprovedPackedDual.MASK;
    if (this.used[index] === 0) return -1;
    if (this.primaryHash[index] !== primaryHash >>> 0) return -1;
    if (this.secondaryHash[index] !== secondaryHash >>> 0) return -1;
    return index;
  }
  add(primaryHash, secondaryHash, value, alpha, beta, bestKey, remainDepth) {
    const index = primaryHash & _TranspositionTableImprovedPackedDual.MASK;
    const primaryU = primaryHash >>> 0;
    const secondaryU = secondaryHash >>> 0;
    let flag = _TranspositionTableImprovedPackedDual.EXACTLY_VALUE;
    if (value <= alpha) flag = _TranspositionTableImprovedPackedDual.UPPER_BOUND;
    else if (value >= beta) flag = _TranspositionTableImprovedPackedDual.LOWER_BOUND;
    const samePosition = this.used[index] !== 0 && this.primaryHash[index] === primaryU && this.secondaryHash[index] === secondaryU;
    if (samePosition) {
      if (remainDepth < (this.remainDepth[index] | 0)) return;
      this.secondKey[index] = this.bestKey[index];
    } else {
      if (this.used[index] === 0) this.usedCount++;
      this.used[index] = 1;
      this.primaryHash[index] = primaryU;
      this.secondaryHash[index] = secondaryU;
      this.secondKey[index] = 0;
    }
    this.bestKey[index] = bestKey >>> 0;
    this.value[index] = value | 0;
    this.flag[index] = flag;
    this.remainDepth[index] = remainDepth & 255;
  }
};

// src/components/game/ShogiImproved/ShogiAIImprovedV20.ts
var TimeUpError = class extends Error {
  constructor() {
    super(...arguments);
    this.name = "TimeUpError";
  }
};
var ShogiAIImprovedV20 = class _ShogiAIImprovedV20 {
  /**
   * `tt` is injected so callers can reuse a transposition table across moves (stronger) or create a fresh one (clean).
   */
  constructor(tt = new TranspositionTableImprovedPackedDual()) {
    this.leaf = 0;
    this.node = 0;
    this.startTime = 0;
    this.maxTimeMs = 0;
    this.quiescenceDepthMax = 0;
    this.evaluationMode = "v3";
    // Repetition handling (sennichite) within the current search path.
    // Both keys include side-to-move, so a repeated pair means an actual repetition state.
    this.enableRepetition = true;
    this.drawContempt = 0;
    this.repetitionCount = /* @__PURE__ */ new Map();
    this.repetitionPrimaryStack = [];
    this.repetitionSecondaryStack = [];
    // Null-move pruning (enabled only for higher difficulties to keep early levels stable).
    this.enableNullMove = false;
    this.nullMoveReduction = 2;
    // Check extensions (enabled only for higher difficulties to keep early levels stable).
    this.enableCheckExtension = false;
    this.checkExtensionMaxPly = 0;
    // Quiescence delta pruning (speed).
    this.enableDeltaPruning = false;
    this.deltaPruningMargin = 0;
    // Check-aware quiescence (strength).
    this.enableQuiescenceChecks = false;
    this.quiescenceCheckMoveLimit = 0;
    this.quiescenceCheckTryLimit = 0;
    // Extra strength/speed knobs (enabled by higher difficulties).
    this.enableAspiration = false;
    this.aspirationWindow = 0;
    this.enableLMR = false;
    // V19: futility pruning at frontier nodes (depthLeft <= 2).
    // Quiet moves rarely swing the static eval by more than a margin in one ply,
    // so when the stand-pat score is hopelessly below alpha we skip them entirely.
    this.enableFutility = false;
    this.futilityMargin1 = 350;
    this.futilityMargin2 = 700;
    // V19: skip clearly losing captures inside quiescence (SEE-lite via cached attack scans).
    this.enableQSeePruning = false;
    // EXPERIMENTAL (A/B only, default OFF): drop-move Late Move Pruning.
    //
    this.killer1 = new Array(_ShogiAIImprovedV20.MAX_PLY).fill(0);
    this.killer2 = new Array(_ShogiAIImprovedV20.MAX_PLY).fill(0);
    this.history = /* @__PURE__ */ new Map();
    // V19: countermove heuristic.
    // "The refutation of move X is often the same move Y regardless of the rest of the position."
    // We remember, per previous-move key, the quiet move that last caused a beta cutoff in response.
    this.counterMove = /* @__PURE__ */ new Map();
    // The move key that led into each ply on the current search path (index = ply).
    this.prevKeyByPly = new Array(_ShogiAIImprovedV20.MAX_PLY).fill(0);
    this.contHist = new Int32Array(_ShogiAIImprovedV20.CONT_HIST_DIM * _ShogiAIImprovedV20.CONT_HIST_DIM);
    // pieceTo-index of the move that led into each ply on the current search path (-1 = unknown/root).
    this.prevPtByPly = new Array(_ShogiAIImprovedV20.MAX_PLY).fill(-1);
    this.rootBest = null;
    // V20 mate solver (詰みソルバー): dedicated checks-only AND/OR search used as a pre-search probe.
    // See `tryMateSolve()` for the gate/budget policy.
    this.mateSolver = new MateSolverImproved();
    // V20: remaining depth at the node currently being move-ordered.
    // Used to skip expensive per-move attack scans at frontier nodes (see scoreMove).
    this.orderDepthLeft = 99;
    // Root-only metadata (used for opening-like ordering heuristics).
    this.rootTesu = 0;
    this.rootHandTotal = 0;
    this.rootInCheck = false;
    this.rootKingDanger = 0;
    // Root-only ordering cache: avoids re-running expensive safety heuristics every iterative-deepening pass.
    // Keyed by `moveKey(te)` (capture is implicit in the root position).
    this.rootOrderBonusCache = /* @__PURE__ */ new Map();
    // Per-ply move list pool (V11): reduces allocations by reusing `Te` objects across nodes.
    this.moveLists = Array.from(
      { length: _ShogiAIImprovedV20.MAX_PLY },
      () => new MoveListImproved()
    );
    this.attackEpochByPly = new Int32Array(_ShogiAIImprovedV20.MAX_PLY);
    this.attackStampSente = new Int32Array(_ShogiAIImprovedV20.MAX_PLY * _ShogiAIImprovedV20.ATTACK_CACHE_SQUARES);
    this.attackStampGote = new Int32Array(_ShogiAIImprovedV20.MAX_PLY * _ShogiAIImprovedV20.ATTACK_CACHE_SQUARES);
    this.attackValSente = new Int32Array(_ShogiAIImprovedV20.MAX_PLY * _ShogiAIImprovedV20.ATTACK_CACHE_SQUARES);
    this.attackValGote = new Int32Array(_ShogiAIImprovedV20.MAX_PLY * _ShogiAIImprovedV20.ATTACK_CACHE_SQUARES);
    this.tt = tt;
    this.evalCacheKeyV1 = new Int32Array(_ShogiAIImprovedV20.EVAL_CACHE_SIZE);
    this.evalCacheSecondaryKeyV1 = new Int32Array(_ShogiAIImprovedV20.EVAL_CACHE_SIZE);
    this.evalCacheValV1 = new Int32Array(_ShogiAIImprovedV20.EVAL_CACHE_SIZE);
    this.evalCacheKeyV2 = new Int32Array(_ShogiAIImprovedV20.EVAL_CACHE_SIZE);
    this.evalCacheSecondaryKeyV2 = new Int32Array(_ShogiAIImprovedV20.EVAL_CACHE_SIZE);
    this.evalCacheValV2 = new Int32Array(_ShogiAIImprovedV20.EVAL_CACHE_SIZE);
    this.evalCacheKeyV3 = new Int32Array(_ShogiAIImprovedV20.EVAL_CACHE_SIZE);
    this.evalCacheSecondaryKeyV3 = new Int32Array(_ShogiAIImprovedV20.EVAL_CACHE_SIZE);
    this.evalCacheValV3 = new Int32Array(_ShogiAIImprovedV20.EVAL_CACHE_SIZE);
    this.evalCacheKeyV3T = new Int32Array(_ShogiAIImprovedV20.EVAL_CACHE_SIZE);
    this.evalCacheSecondaryKeyV3T = new Int32Array(_ShogiAIImprovedV20.EVAL_CACHE_SIZE);
    this.evalCacheValV3T = new Int32Array(_ShogiAIImprovedV20.EVAL_CACHE_SIZE);
    this.evalCacheKeyV1.fill(_ShogiAIImprovedV20.EVAL_CACHE_SENTINEL);
    this.evalCacheSecondaryKeyV1.fill(_ShogiAIImprovedV20.EVAL_CACHE_SENTINEL);
    this.evalCacheKeyV2.fill(_ShogiAIImprovedV20.EVAL_CACHE_SENTINEL);
    this.evalCacheSecondaryKeyV2.fill(_ShogiAIImprovedV20.EVAL_CACHE_SENTINEL);
    this.evalCacheKeyV3.fill(_ShogiAIImprovedV20.EVAL_CACHE_SENTINEL);
    this.evalCacheSecondaryKeyV3.fill(_ShogiAIImprovedV20.EVAL_CACHE_SENTINEL);
    this.evalCacheKeyV3T.fill(_ShogiAIImprovedV20.EVAL_CACHE_SENTINEL);
    this.evalCacheSecondaryKeyV3T.fill(_ShogiAIImprovedV20.EVAL_CACHE_SENTINEL);
  }
  static {
    this.INFINITE = 99999999;
  }
  static {
    this.MATE = 9e7;
  }
  static {
    this.MAX_PLY = 64;
  }
  static {
    // Evaluation cache (direct-mapped).
    // We cache *SENTE-perspective* evaluation keyed by (BanHash ^ HandHash),
    // which intentionally does NOT include side-to-move (evaluation is position-only).
    this.EVAL_CACHE_SIZE = 1 << 18;
  }
  static {
    this.EVAL_CACHE_SENTINEL = 2147483647;
  }
  static {
    // Continuation history (V20.1): generalization of the countermove heuristic.
    // Indexed by (previous move's piece+to, current move's piece+to) — "after the opponent puts piece X
    // on square A, moving piece Y to square B tends to cause cutoffs". Unlike `counterMove` (one move per
    // key) this is a graded score added to ordering, so it also helps rank non-refutation quiet moves.
    //
    // Index compression: pieceType (0..15) * 81 board squares = 1296 states per move; side is implied
    // (the previous move is always by the opponent of the side to move). Flat Int32Array of 1296^2.
    this.CONT_HIST_DIM = 1296;
  }
  static {
    // --- Lightweight "attack/defense" cache (per node) ---
    //
    // `GenerateMovesImproved.getLeastAttackerValue()` is already cheap (local 12-direction scan + slider rays),
    // but move ordering calls it multiple times per node when many drop moves exist (common in shogi midgame).
    //
    // This cache is:
    // - per-ply (node-local epoch) to avoid needing to clear arrays
    // - per target square (0..255 works for our (suji<<4)+dan encoding)
    // - separate per defender-side (SENTE/GOTE) because "who attacks" flips
    this.ATTACK_CACHE_SQUARES = 256;
  }
  static {
    this.ATTACK_CACHE_INF = 2147483647;
  }
  clearTT() {
    this.tt.clear();
    this.evalCacheKeyV1.fill(_ShogiAIImprovedV20.EVAL_CACHE_SENTINEL);
    this.evalCacheSecondaryKeyV1.fill(_ShogiAIImprovedV20.EVAL_CACHE_SENTINEL);
    this.evalCacheKeyV2.fill(_ShogiAIImprovedV20.EVAL_CACHE_SENTINEL);
    this.evalCacheSecondaryKeyV2.fill(_ShogiAIImprovedV20.EVAL_CACHE_SENTINEL);
    this.evalCacheKeyV3.fill(_ShogiAIImprovedV20.EVAL_CACHE_SENTINEL);
    this.evalCacheSecondaryKeyV3.fill(_ShogiAIImprovedV20.EVAL_CACHE_SENTINEL);
    this.evalCacheKeyV3T.fill(_ShogiAIImprovedV20.EVAL_CACHE_SENTINEL);
    this.evalCacheSecondaryKeyV3T.fill(_ShogiAIImprovedV20.EVAL_CACHE_SENTINEL);
  }
  getStats() {
    return {
      nodes: this.node,
      leaves: this.leaf,
      ttUsage: this.tt.fillRate()
    };
  }
  /**
   * We intentionally reset `rootBest` via a method call instead of `this.rootBest = null` inside `getNextTe()`.
   *
   * Reason:
   * - TypeScript's control-flow analysis will treat `this.rootBest` as always `null` after a direct assignment
   *   within the same function (it does not assume `this.search()` mutates the property).
   * - That breaks type narrowing and causes spurious "never" errors even though the runtime behavior is correct.
   */
  resetRootBest() {
    this.rootBest = null;
  }
  nowMs() {
    return typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
  }
  timeUp() {
    return this.maxTimeMs > 0 && this.nowMs() - this.startTime >= this.maxTimeMs;
  }
  maybeThrowOnTime() {
    const counter = this.node + this.leaf | 0;
    if ((counter & 2047) !== 0) return;
    if (this.timeUp()) throw new TimeUpError();
  }
  toggleTeban(k) {
    k.toggleTeban();
  }
  evalForSideToMove(k) {
    const evalSente = this.evaluateSenteCached(k);
    return k.teban === SENTE ? evalSente : -evalSente;
  }
  /**
   * Hanging-piece threat term (V20), SENTE-positive.
   *
   * Why: quiescence only resolves captures for the side to move. A piece that is merely *threatened*
   * stays on the board in the static eval, so shallow searches happily ignore attacks on their own
   * pieces ("攻撃されても無視する" behavior). This term charges each side ~50% of the expected loss of
   * its single most valuable hanging piece:
   * - 50% because the eval cache is side-to-move agnostic — if it's your turn you can usually save
   *   the piece (loss ≈ 0), if it's the opponent's turn the piece is usually lost (loss ≈ 100%).
   * - only the biggest threat per side matters (the opponent captures once per turn).
   *
   * Cost: one 81-square scan + two cheap attack scans for each piece worth >= lance (~10 pieces),
   * amortized by the eval cache.
   */
  hangingThreatSente(k) {
    let worstSente = 0;
    let worstGote = 0;
    for (let suji = 1; suji <= 9; suji++) {
      for (let dan = 1; dan <= 9; dan++) {
        const pos = (suji << 4) + dan;
        const p = k.get(pos);
        if (p === EMPTY) continue;
        const type = getKomashu(p);
        if (type === OU) continue;
        const value = Math.abs(komaValue[p]) | 0;
        if (value < 1e3) continue;
        const side = isSelf(SENTE, p) ? SENTE : GOTE;
        const attacker = GenerateMovesImproved.getLeastAttackerValue(k, pos, side);
        if (!Number.isFinite(attacker)) continue;
        const defender = GenerateMovesImproved.getLeastAttackerValue(k, pos, side === SENTE ? GOTE : SENTE);
        if (Number.isFinite(defender)) continue;
        const loss = Math.min(value, 700);
        if (side === SENTE) {
          if (loss > worstSente) worstSente = loss;
        } else if (loss > worstGote) {
          worstGote = loss;
        }
      }
    }
    return (worstGote - worstSente) / 3 | 0;
  }
  evaluateSenteCached(k) {
    const key = k.BanHash ^ k.HandHash | 0;
    const secondaryKey = k.SecondaryBanHash ^ k.SecondaryHandHash | 0;
    const index = key & _ShogiAIImprovedV20.EVAL_CACHE_SIZE - 1;
    if (this.evaluationMode === "v1") {
      if (this.evalCacheKeyV1[index] === key && this.evalCacheSecondaryKeyV1[index] === secondaryKey)
        return this.evalCacheValV1[index] | 0;
      const value2 = k.evaluateV1() | 0;
      this.evalCacheKeyV1[index] = key;
      this.evalCacheSecondaryKeyV1[index] = secondaryKey;
      this.evalCacheValV1[index] = value2;
      return value2;
    }
    if (this.evaluationMode === "v2") {
      if (this.evalCacheKeyV2[index] === key && this.evalCacheSecondaryKeyV2[index] === secondaryKey)
        return this.evalCacheValV2[index] | 0;
      const value2 = k.evaluate() | 0;
      this.evalCacheKeyV2[index] = key;
      this.evalCacheSecondaryKeyV2[index] = secondaryKey;
      this.evalCacheValV2[index] = value2;
      return value2;
    }
    if (this.evaluationMode === "v3t") {
      if (this.evalCacheKeyV3T[index] === key && this.evalCacheSecondaryKeyV3T[index] === secondaryKey)
        return this.evalCacheValV3T[index] | 0;
      const value2 = k.evaluateV3Tuned() + this.hangingThreatSente(k) | 0;
      this.evalCacheKeyV3T[index] = key;
      this.evalCacheSecondaryKeyV3T[index] = secondaryKey;
      this.evalCacheValV3T[index] = value2;
      return value2;
    }
    if (this.evalCacheKeyV3[index] === key && this.evalCacheSecondaryKeyV3[index] === secondaryKey)
      return this.evalCacheValV3[index] | 0;
    const value = k.evaluateV3() + this.hangingThreatSente(k) | 0;
    this.evalCacheKeyV3[index] = key;
    this.evalCacheSecondaryKeyV3[index] = secondaryKey;
    this.evalCacheValV3[index] = value;
    return value;
  }
  repetitionDrawScore(k) {
    const standPat = this.evalForSideToMove(k);
    if (this.drawContempt <= 0) return 0;
    if (Math.abs(standPat) < 150) return 0;
    if (standPat > 0) return -this.drawContempt;
    if (standPat < 0) return this.drawContempt;
    return 0;
  }
  promotionGain(te) {
    if (!te.promote) return 0;
    const side = te.koma & (SENTE | GOTE);
    const type = getKomashu(te.koma);
    const promoted = side | type + 8;
    return Math.max(0, Math.abs(komaValue[promoted]) - Math.abs(komaValue[te.koma]));
  }
  pushRepetition(primaryHash, secondaryHash) {
    const secondaryCounts = this.repetitionCount.get(primaryHash);
    const prev = secondaryCounts?.get(secondaryHash) ?? 0;
    if (prev >= 3) return false;
    if (secondaryCounts) secondaryCounts.set(secondaryHash, prev + 1);
    else this.repetitionCount.set(primaryHash, /* @__PURE__ */ new Map([[secondaryHash, 1]]));
    this.repetitionPrimaryStack.push(primaryHash);
    this.repetitionSecondaryStack.push(secondaryHash);
    return true;
  }
  popRepetition() {
    const primaryHash = this.repetitionPrimaryStack.pop();
    const secondaryHash = this.repetitionSecondaryStack.pop();
    if (primaryHash === void 0 || secondaryHash === void 0) return;
    const secondaryCounts = this.repetitionCount.get(primaryHash);
    if (!secondaryCounts) return;
    const prev = secondaryCounts.get(secondaryHash) ?? 0;
    if (prev <= 1) secondaryCounts.delete(secondaryHash);
    else secondaryCounts.set(secondaryHash, prev - 1);
    if (secondaryCounts.size === 0) this.repetitionCount.delete(primaryHash);
  }
  moveKey(te) {
    const piece = te.koma & 63;
    const from = te.from & 255;
    const to = te.to & 255;
    const promote = te.promote ? 1 : 0;
    return piece | from << 6 | to << 14 | promote << 22;
  }
  /**
   * Compact (pieceType, toSquare) index for the continuation-history table.
   * Side is intentionally excluded: at any given ply the mover's side is fixed, so it carries no signal.
   */
  pieceToIndex(te) {
    const toSuji = te.to >> 4;
    const toDan = te.to & 15;
    return getKomashu(te.koma) * 81 + (toSuji - 1) * 9 + (toDan - 1);
  }
  teFromMoveKey(key, k) {
    const koma = key & 63;
    const from = key >> 6 & 255;
    const to = key >> 14 & 255;
    const promote = (key >> 22 & 1) === 1;
    const capture = k.get(to);
    return new Te(koma, from, to, promote, capture);
  }
  recordKiller(ply, key) {
    if (ply < 0 || ply >= _ShogiAIImprovedV20.MAX_PLY) return;
    if (this.killer1[ply] !== key) {
      this.killer2[ply] = this.killer1[ply];
      this.killer1[ply] = key;
    }
  }
  otherSide(teban) {
    return teban === SENTE ? GOTE : SENTE;
  }
  beginAttackCacheForNode(ply) {
    if (ply < 0 || ply >= _ShogiAIImprovedV20.MAX_PLY) return;
    let next = this.attackEpochByPly[ply] + 1 | 0;
    if (next === 0) {
      this.attackStampSente.fill(0);
      this.attackStampGote.fill(0);
      next = 1;
    }
    this.attackEpochByPly[ply] = next;
  }
  leastAttackerValueCached(k, target, defender, ply) {
    if (target <= 0 || k.get(target) === WALL) return Infinity;
    const sq = target & 255;
    const index = ply << 8 | sq;
    const epoch = this.attackEpochByPly[ply] | 0;
    const isDefenderSente = defender === SENTE;
    const stamp = isDefenderSente ? this.attackStampSente : this.attackStampGote;
    const val = isDefenderSente ? this.attackValSente : this.attackValGote;
    if ((stamp[index] | 0) === epoch) {
      const cached = val[index] | 0;
      return cached === _ShogiAIImprovedV20.ATTACK_CACHE_INF ? Infinity : cached;
    }
    const computed = GenerateMovesImproved.getLeastAttackerValue(k, target, defender);
    const stored = Number.isFinite(computed) ? (computed | 0) & 2147483647 : _ShogiAIImprovedV20.ATTACK_CACHE_INF;
    stamp[index] = epoch;
    val[index] = stored;
    return stored === _ShogiAIImprovedV20.ATTACK_CACHE_INF ? Infinity : stored;
  }
  /**
   * Cheap "king is under pressure" proxy for the opening phase.
   *
   * Motivation:
   * - In very low time budgets, root move ordering can dominate the move choice.
   * - If we keep pushing slow castling/development moves while the king is already surrounded,
   *   the AI looks (and plays) irrational.
   *
   * This returns an uncalibrated danger score (higher = more pressure).
   * It is intentionally local (5x5 around the king) and does not require generating moves.
   */
  computeKingDanger(k, teban, kingPos) {
    if (kingPos <= 0) return 0;
    const kingSuji = kingPos >> 4;
    const kingDan = kingPos & 15;
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
        const suji = kingSuji + ds;
        const dan = kingDan + dd;
        if (suji < 1 || suji > 9 || dan < 1 || dan > 9) continue;
        const p = k.get((suji << 4) + dan);
        if (p === EMPTY || p === WALL) continue;
        if (isSelf(teban, p)) continue;
        const base = dangerByKomashu[getKomashu(p)] ?? 0;
        if (!base) continue;
        const dist = Math.abs(ds) + Math.abs(dd);
        danger += base + (dist <= 1 ? 6 : dist <= 2 ? 3 : 0);
      }
    }
    return danger;
  }
  recordHistory(key, depthLeft) {
    const bonus = depthLeft * depthLeft;
    this.history.set(key, (this.history.get(key) ?? 0) + bonus);
  }
  scoreMove(k, te, ply, ttMoveKey, ttSecondMoveKey) {
    const key = this.moveKey(te);
    let score = 0;
    const enemyKing = k.teban === SENTE ? k.kingG : k.kingS;
    if (ttMoveKey !== 0 && key === ttMoveKey) score += 5e6;
    if (ttSecondMoveKey !== 0 && key === ttSecondMoveKey) score += 4e6;
    if (key === this.killer1[ply]) score += 2e6;
    if (key === this.killer2[ply]) score += 15e5;
    if (ply > 0 && ply < _ShogiAIImprovedV20.MAX_PLY) {
      const prevKey = this.prevKeyByPly[ply] | 0;
      if (prevKey !== 0 && this.counterMove.get(prevKey) === key) score += 12e5;
    }
    const historyScore = this.history.get(key);
    if (historyScore) score += historyScore;
    if (ply > 0 && ply < _ShogiAIImprovedV20.MAX_PLY) {
      const prevPt = this.prevPtByPly[ply] | 0;
      if (prevPt >= 0) {
        score += this.contHist[prevPt * _ShogiAIImprovedV20.CONT_HIST_DIM + this.pieceToIndex(te)] | 0;
      }
    }
    if (te.promote) score += 4e5;
    if (te.capture !== EMPTY) {
      const victim = Math.abs(komaValue[te.capture]);
      const attacker = Math.abs(komaValue[te.koma]);
      score += 9e5 + victim * 20 - attacker;
    }
    if (this.orderDepthLeft >= 3 && te.from !== 0 && te.capture !== EMPTY) {
      const attackerValue = Math.abs(komaValue[te.koma]) | 0;
      const victimValue = Math.abs(komaValue[te.capture]) | 0;
      if (attackerValue >= 1e3 && victimValue + 200 < attackerValue) {
        const distToEnemyKing = enemyKing > 0 ? Math.abs((te.to >> 4) - (enemyKing >> 4)) + Math.abs((te.to & 15) - (enemyKing & 15)) : 99;
        if (distToEnemyKing > 2) {
          const enemyLeastAttacker = this.leastAttackerValueCached(k, te.to, k.teban, ply);
          if (Number.isFinite(enemyLeastAttacker)) {
            const selfLeastDefender = this.leastAttackerValueCached(k, te.to, this.otherSide(k.teban), ply);
            if (Number.isFinite(selfLeastDefender)) {
              if (selfLeastDefender <= enemyLeastAttacker) score += 9e3;
            } else {
              const penalty = Math.min(9e4, attackerValue * 30);
              score -= penalty;
            }
          }
        }
      }
    }
    if (te.from === 0) {
      const pieceType = getKomashu(te.koma);
      const selfKing = k.teban === SENTE ? k.kingS : k.kingG;
      const distToEnemyKing = enemyKing > 0 ? Math.abs((te.to >> 4) - (enemyKing >> 4)) + Math.abs((te.to & 15) - (enemyKing & 15)) : 99;
      const distToSelfKing = selfKing > 0 ? Math.abs((te.to >> 4) - (selfKing >> 4)) + Math.abs((te.to & 15) - (selfKing & 15)) : 99;
      score += 12e4;
      if (pieceType === HI) score += 25e4;
      else if (pieceType === KA) score += 18e4;
      else if (pieceType === KI) score += 12e4;
      else if (pieceType === GI) score += 9e4;
      else if (pieceType === KE) score += 4e4;
      else if (pieceType === KY) score += 25e3;
      else if (pieceType === FU) score += 1e4;
      if (distToEnemyKing <= 4) score += (5 - distToEnemyKing) * 35e3;
      if (distToSelfKing <= 3) score += (4 - distToSelfKing) * 3e4;
      if (distToEnemyKing >= 7 && distToSelfKing >= 7) score -= 45e3;
      if (this.orderDepthLeft >= 3 && distToEnemyKing > 2) {
        const enemyLeastAttacker = this.leastAttackerValueCached(k, te.to, k.teban, ply);
        if (Number.isFinite(enemyLeastAttacker)) {
          const selfLeastDefender = this.leastAttackerValueCached(k, te.to, this.otherSide(k.teban), ply);
          if (Number.isFinite(selfLeastDefender)) {
            score += selfLeastDefender <= enemyLeastAttacker ? 14e3 : 3e3;
          } else {
            const pieceValue = Math.abs(komaValue[te.koma]) | 0;
            if (pieceValue >= 1e3) {
              const cheaperCapture = (enemyLeastAttacker | 0) + 200 < pieceValue;
              const basePenalty = cheaperCapture ? Math.min(26e4, pieceValue * 120) : Math.min(12e4, pieceValue * 45);
              const softened = distToSelfKing <= 3 ? Math.floor(basePenalty * 0.6) : basePenalty;
              score -= softened;
            }
          }
        }
      }
    } else {
      if (enemyKing > 0) {
        const pieceType = getKomashu(te.koma);
        const isAttacker = pieceType === HI || pieceType === KA || pieceType === KI || pieceType === GI || pieceType === KE;
        if (isAttacker) {
          const dist = Math.abs((te.to >> 4) - (enemyKing >> 4)) + Math.abs((te.to & 15) - (enemyKing & 15));
          if (dist <= 3) score += (4 - dist) * 25e3;
        }
      }
    }
    if (ply === 0) {
      const cached = this.rootOrderBonusCache.get(key);
      if (cached !== void 0) {
        score += cached;
      } else {
        const bonus = this.openingOrderBonusAtRoot(k, te) + this.rootMoveSafetyOrderAdjustment(k, te, enemyKing);
        this.rootOrderBonusCache.set(key, bonus);
        score += bonus;
      }
    }
    return score;
  }
  openingOrderBonusAtRoot(k, te) {
    if (this.rootInCheck) return 0;
    if (this.rootTesu !== 0 && this.rootTesu >= 24) return 0;
    if (this.rootHandTotal > 4) return 0;
    const selfKing = k.teban === SENTE ? k.kingS : k.kingG;
    if (selfKing <= 0) return 0;
    const selfKingDan = selfKing & 15;
    if (k.teban === SENTE) {
      if (selfKingDan < 7) return 0;
    } else {
      if (selfKingDan > 3) return 0;
    }
    if (te.from === 0) return 0;
    if (te.capture !== EMPTY) return 0;
    if (te.promote) return 0;
    const pieceType = getKomashu(te.koma);
    const fromSuji = te.from >> 4;
    const fromDan = te.from & 15;
    const toSuji = te.to >> 4;
    const toDan = te.to & 15;
    let bonus = 0;
    const underPressure = this.rootKingDanger >= 45;
    const pawnStartDan = k.teban === SENTE ? 7 : 3;
    const pawnNextDan = k.teban === SENTE ? 6 : 4;
    if (pieceType === FU && fromDan === pawnStartDan && toDan === pawnNextDan) {
      bonus += underPressure ? 9e4 : 14e4;
      const distFromCenterFile = Math.abs(fromSuji - 5);
      bonus += Math.max(0, 3 - distFromCenterFile) * (underPressure ? 1e4 : 18e3);
    }
    if (pieceType === GI || pieceType === KI) {
      bonus += 7e4;
      if (k.teban === SENTE && toDan <= fromDan) bonus += 8e3;
      if (k.teban === GOTE && toDan >= fromDan) bonus += 8e3;
    }
    if (pieceType === KA || pieceType === HI) {
      bonus += 45e3;
    }
    if (pieceType === OU) {
      if (underPressure || this.rootTesu < 4) return bonus;
      const fromDist = Math.abs(fromSuji - 5) + Math.abs(fromDan - 5);
      const toDist = Math.abs(toSuji - 5) + Math.abs(toDan - 5);
      const away = toDist - fromDist;
      if (away > 0) bonus += away * 25e3;
      const inHomeCamp = k.teban === SENTE ? toDan >= 8 : toDan <= 2;
      if (inHomeCamp) bonus += 2e4;
    }
    return bonus;
  }
  rootMoveSafetyOrderAdjustment(k, te, enemyKing) {
    if (enemyKing > 0) {
      const dist = Math.abs((te.to >> 4) - (enemyKing >> 4)) + Math.abs((te.to & 15) - (enemyKing & 15));
      if (dist <= 2) return 0;
    }
    if (te.from === 0) {
      const enemyLeastAttacker = GenerateMovesImproved.getLeastAttackerValue(k, te.to, k.teban);
      if (!Number.isFinite(enemyLeastAttacker)) return 0;
      const selfLeastDefender = GenerateMovesImproved.getLeastAttackerValue(k, te.to, this.otherSide(k.teban));
      if (Number.isFinite(selfLeastDefender)) {
        return selfLeastDefender <= enemyLeastAttacker ? 25e3 : 8e3;
      }
      const pieceValue = Math.abs(komaValue[te.koma]) | 0;
      const penalty = Math.min(32e4, pieceValue * 120);
      return -penalty;
    }
    const attackerValue0 = Math.abs(komaValue[te.koma]) | 0;
    const capturedValue0 = te.capture !== EMPTY ? Math.abs(komaValue[te.capture]) | 0 : 0;
    if (te.capture === EMPTY && !te.promote && attackerValue0 <= 200) return 0;
    const isQuiet = te.capture === EMPTY && !te.promote;
    if (isQuiet && attackerValue0 < 700) return 0;
    const isSuspiciousCapture = te.capture !== EMPTY && capturedValue0 + 200 < attackerValue0;
    if (!isQuiet && !isSuspiciousCapture) return 0;
    const captureOrig = te.capture;
    const actualCapture = k.get(te.to);
    if (captureOrig !== actualCapture) te.capture = actualCapture;
    k.move(te);
    try {
      const moved = k.get(te.to);
      const movedValue = Math.abs(komaValue[moved]) | 0;
      const enemyLeastAttacker = GenerateMovesImproved.getLeastAttackerValue(k, te.to, k.teban);
      if (!Number.isFinite(enemyLeastAttacker)) return 0;
      const selfLeastDefender = GenerateMovesImproved.getLeastAttackerValue(k, te.to, this.otherSide(k.teban));
      if (Number.isFinite(selfLeastDefender)) {
        return selfLeastDefender <= enemyLeastAttacker ? 8e3 : 0;
      }
      if (capturedValue0 === 0 && movedValue <= 200) return 0;
      let penalty = Math.min(24e4, movedValue * 80);
      if (capturedValue0 > 0) {
        penalty = Math.max(0, penalty - capturedValue0 * 70);
      }
      return -penalty;
    } finally {
      k.back(te);
      te.capture = captureOrig;
    }
  }
  scoreAndSortMoves(k, moves, ply, ttMoveKey, ttSecondMoveKey) {
    this.beginAttackCacheForNode(ply);
    for (const te of moves) {
      te.value = this.scoreMove(k, te, ply, ttMoveKey, ttSecondMoveKey);
    }
    moves.sort((a, b) => b.value - a.value);
  }
  quiescence(k, alpha, beta, ply, depthLeft) {
    if (ply >= _ShogiAIImprovedV20.MAX_PLY - 1) {
      return this.evalForSideToMove(k);
    }
    this.leaf++;
    this.maybeThrowOnTime();
    const pushed = this.enableRepetition ? this.pushRepetition(k.HashVal, k.SecondaryHashVal) : true;
    if (!pushed) return this.repetitionDrawScore(k);
    try {
      const inCheck = GenerateMovesImproved.isKingInCheck(k, k.teban);
      const standPat = this.evalForSideToMove(k);
      if (!inCheck) {
        if (standPat >= beta) return standPat;
        if (standPat > alpha) alpha = standPat;
        if (depthLeft <= 0) return standPat;
      } else {
        if (depthLeft <= 0) depthLeft = 1;
      }
      const moves = GenerateMovesImproved.generatePseudoLegalMovesPooled(
        k,
        this.moveLists[ply] ?? new MoveListImproved()
      );
      const qTtIndex = this.tt.probe(k.HashVal, k.SecondaryHashVal);
      const qTtMoveKey = qTtIndex >= 0 ? this.tt.bestKey[qTtIndex] | 0 : 0;
      this.orderDepthLeft = 0;
      if (inCheck) {
        this.scoreAndSortMoves(k, moves, ply, qTtMoveKey, 0);
      } else {
        let noisyCount = 0;
        for (let i = 0; i < moves.length; i++) {
          const m = moves[i];
          if (m.capture !== EMPTY || m.promote) {
            if (i !== noisyCount) {
              moves[i] = moves[noisyCount];
              moves[noisyCount] = m;
            }
            noisyCount++;
          }
        }
        this.beginAttackCacheForNode(ply);
        for (let i = 0; i < noisyCount; i++) {
          moves[i].value = this.scoreMove(k, moves[i], ply, qTtMoveKey, 0);
        }
        for (let i = 1; i < noisyCount; i++) {
          const m = moves[i];
          let j = i - 1;
          while (j >= 0 && moves[j].value < m.value) {
            moves[j + 1] = moves[j];
            j--;
          }
          moves[j + 1] = m;
        }
      }
      this.orderDepthLeft = 99;
      let quietChecksSearched = 0;
      let quietChecksTried = 0;
      let legalTried = 0;
      for (const te of moves) {
        const isNoisy = te.capture !== EMPTY || te.promote;
        const canProbeQuietCheck = !inCheck && !isNoisy && this.enableQuiescenceChecks && quietChecksSearched < this.quiescenceCheckMoveLimit && quietChecksTried < this.quiescenceCheckTryLimit;
        if (!inCheck && !isNoisy && !canProbeQuietCheck) continue;
        if (!inCheck && isNoisy && this.enableDeltaPruning) {
          const victimGain = te.capture !== EMPTY ? Math.abs(komaValue[te.capture]) : 0;
          const promoteGain = this.promotionGain(te);
          if (standPat + victimGain + promoteGain + this.deltaPruningMargin <= alpha) {
            continue;
          }
        }
        if (!inCheck && this.enableQSeePruning && te.capture !== EMPTY && !te.promote && te.from !== 0) {
          const attackerValue = Math.abs(komaValue[te.koma]) | 0;
          const victimValue = Math.abs(komaValue[te.capture]) | 0;
          if (attackerValue >= 1e3 && victimValue + 300 <= attackerValue) {
            const enemyKing = k.teban === SENTE ? k.kingG : k.kingS;
            const distToEnemyKing = enemyKing > 0 ? Math.abs((te.to >> 4) - (enemyKing >> 4)) + Math.abs((te.to & 15) - (enemyKing & 15)) : 99;
            if (distToEnemyKing > 2) {
              const enemyLeastAttacker = this.leastAttackerValueCached(k, te.to, k.teban, ply);
              if (Number.isFinite(enemyLeastAttacker) && enemyLeastAttacker < attackerValue) {
                continue;
              }
            }
          }
        }
        k.move(te);
        if ((te.from !== 0 || inCheck) && GenerateMovesImproved.isKingInCheck(k, k.teban)) {
          k.back(te);
          continue;
        }
        legalTried++;
        this.toggleTeban(k);
        if (!inCheck && !isNoisy) {
          quietChecksTried++;
          const givesCheck = GenerateMovesImproved.isKingInCheck(k, k.teban);
          if (!givesCheck) {
            this.toggleTeban(k);
            k.back(te);
            continue;
          }
          quietChecksSearched++;
        }
        const score = -this.quiescence(k, -beta, -alpha, ply + 1, depthLeft - 1);
        this.toggleTeban(k);
        k.back(te);
        if (score > alpha) {
          alpha = score;
          if (alpha >= beta) break;
        }
      }
      if (inCheck && legalTried === 0) return -_ShogiAIImprovedV20.MATE + ply;
      return alpha;
    } finally {
      if (this.enableRepetition) this.popRepetition();
    }
  }
  search(k, depthLeft, alpha, beta, ply) {
    if (depthLeft <= 0) {
      return this.quiescence(k, alpha, beta, ply, this.quiescenceDepthMax);
    }
    if (ply >= _ShogiAIImprovedV20.MAX_PLY - 1) {
      return this.evalForSideToMove(k);
    }
    this.node++;
    this.maybeThrowOnTime();
    const pushed = this.enableRepetition ? this.pushRepetition(k.HashVal, k.SecondaryHashVal) : true;
    if (!pushed) return this.repetitionDrawScore(k);
    try {
      const alphaOrig = alpha;
      const alphaMate = -_ShogiAIImprovedV20.MATE + ply;
      if (alpha < alphaMate) alpha = alphaMate;
      const betaMate = _ShogiAIImprovedV20.MATE - ply;
      if (beta > betaMate) beta = betaMate;
      if (alpha >= beta) return alpha;
      const ttIndex = this.tt.probe(k.HashVal, k.SecondaryHashVal);
      let ttMoveKey = 0;
      let ttSecondMoveKey = 0;
      if (ttIndex >= 0) {
        ttMoveKey = this.tt.bestKey[ttIndex] | 0;
        ttSecondMoveKey = this.tt.secondKey[ttIndex] | 0;
        const ttRemainDepth = this.tt.remainDepth[ttIndex] | 0;
        if (ttRemainDepth >= depthLeft) {
          const ttValue = this.tt.value[ttIndex] | 0;
          const ttFlag = this.tt.flag[ttIndex] | 0;
          if (ttFlag === TranspositionTableImprovedPackedDual.EXACTLY_VALUE) {
            if (ply === 0 && ttMoveKey !== 0) {
              const legalRootMove = GenerateMovesImproved.generateLegalMoves(k).find(
                (move) => this.moveKey(move) === ttMoveKey
              );
              if (legalRootMove) this.rootBest = legalRootMove.clone();
            }
            return ttValue;
          }
          if (ttFlag === TranspositionTableImprovedPackedDual.LOWER_BOUND && ttValue >= beta) return ttValue;
          if (ttFlag === TranspositionTableImprovedPackedDual.UPPER_BOUND && ttValue <= alpha) return ttValue;
        }
      }
      const parentInCheck = GenerateMovesImproved.isKingInCheck(k, k.teban);
      if (parentInCheck) depthLeft++;
      if (ttMoveKey === 0 && depthLeft >= 5 && !parentInCheck) {
        this.search(k, depthLeft - 2, alpha, beta, ply);
        const iidIndex = this.tt.probe(k.HashVal, k.SecondaryHashVal);
        if (iidIndex >= 0) {
          ttMoveKey = this.tt.bestKey[iidIndex] | 0;
          ttSecondMoveKey = this.tt.secondKey[iidIndex] | 0;
        }
      }
      if (!parentInCheck && depthLeft <= 3 && beta > -_ShogiAIImprovedV20.MATE + 1e4 && beta < _ShogiAIImprovedV20.MATE - 1e4) {
        const staticEval = this.evalForSideToMove(k);
        if (staticEval - 200 * depthLeft >= beta) return staticEval;
      }
      if (this.enableNullMove && !parentInCheck && ply > 0 && depthLeft >= 3) {
        const standPat = this.evalForSideToMove(k);
        if (standPat >= beta) {
          const nullR = this.nullMoveReduction + (depthLeft >= 7 ? 1 : 0);
          const reducedDepth = depthLeft - 1 - nullR;
          this.toggleTeban(k);
          let score;
          try {
            score = -this.search(k, reducedDepth, -beta, -beta + 1, ply + 1);
          } finally {
            this.toggleTeban(k);
          }
          if (score >= beta) return score;
        }
      }
      const moves = GenerateMovesImproved.generatePseudoLegalMovesPooled(
        k,
        this.moveLists[ply] ?? new MoveListImproved()
      );
      this.orderDepthLeft = depthLeft;
      this.scoreAndSortMoves(k, moves, ply, ttMoveKey, ttSecondMoveKey);
      this.orderDepthLeft = 99;
      const futilityApplicable = this.enableFutility && !parentInCheck && depthLeft <= 2 && alpha > -_ShogiAIImprovedV20.MATE + 1e4 && beta < _ShogiAIImprovedV20.MATE - 1e4;
      const futilityScore = futilityApplicable ? this.evalForSideToMove(k) + (depthLeft <= 1 ? this.futilityMargin1 : this.futilityMargin2) : 0;
      let bestMove = null;
      let searched = 0;
      let legalTried = 0;
      let prunedAny = false;
      const lmpApplicable = this.enableFutility && !parentInCheck && depthLeft <= 3 && alpha > -_ShogiAIImprovedV20.MATE + 1e4;
      const lmpThreshold = 7 + 5 * depthLeft;
      for (const te of moves) {
        if (lmpApplicable && searched >= lmpThreshold && te.from !== 0 && // never LMP drops: they are tactically critical in shogi
        te.capture === EMPTY && !te.promote) {
          const movedType = getKomashu(te.koma);
          const isLongRange = movedType === KY || movedType === KA || movedType === HI || movedType === UM || movedType === RY;
          if (!isLongRange) {
            const enemyKingSq = k.teban === SENTE ? k.kingG : k.kingS;
            const distToEnemyKing = enemyKingSq > 0 ? Math.abs((te.to >> 4) - (enemyKingSq >> 4)) + Math.abs((te.to & 15) - (enemyKingSq & 15)) : 99;
            if (distToEnemyKing > 3) {
              prunedAny = true;
              continue;
            }
          }
        }
        if (futilityApplicable && searched > 0 && futilityScore <= alpha && te.capture === EMPTY && !te.promote) {
          const movedType = getKomashu(te.koma);
          const isLongRange = movedType === KY || movedType === KA || movedType === HI || movedType === UM || movedType === RY;
          if (!isLongRange) {
            const enemyKingSq = k.teban === SENTE ? k.kingG : k.kingS;
            const distToEnemyKing = enemyKingSq > 0 ? Math.abs((te.to >> 4) - (enemyKingSq >> 4)) + Math.abs((te.to & 15) - (enemyKingSq & 15)) : 99;
            if (distToEnemyKing > 3) {
              prunedAny = true;
              continue;
            }
          }
        }
        k.move(te);
        if ((te.from !== 0 || parentInCheck) && GenerateMovesImproved.isKingInCheck(k, k.teban)) {
          k.back(te);
          continue;
        }
        legalTried++;
        this.toggleTeban(k);
        if (ply + 1 < _ShogiAIImprovedV20.MAX_PLY) {
          this.prevKeyByPly[ply + 1] = this.moveKey(te);
          this.prevPtByPly[ply + 1] = this.pieceToIndex(te);
        }
        const baseDepthNext = depthLeft - 1;
        const canCheckExtend = this.enableCheckExtension && ply <= this.checkExtensionMaxPly;
        const canLMRBase = this.enableLMR && !parentInCheck && baseDepthNext >= 3 && searched >= 4 && te.from !== 0 && // do not reduce drops; drops are tactically critical in shogi
        te.capture === EMPTY && !te.promote;
        const givesCheck = canCheckExtend || canLMRBase ? GenerateMovesImproved.isKingInCheck(k, k.teban) : false;
        const depthNext = canCheckExtend && givesCheck ? baseDepthNext + 1 : baseDepthNext;
        let score;
        if (searched === 0) {
          score = -this.search(k, depthNext, -beta, -alpha, ply + 1);
        } else {
          const canLMR = canLMRBase && !givesCheck;
          let reducedDepth = depthNext;
          if (canLMR) {
            reducedDepth = depthNext - 1;
            if (searched >= 8 && depthNext >= 3) reducedDepth = depthNext - 2;
            if (searched >= 20 && depthNext >= 5) reducedDepth = depthNext - 3;
          }
          score = -this.search(k, reducedDepth, -alpha - 1, -alpha, ply + 1);
          if (reducedDepth !== depthNext && score > alpha) {
            score = -this.search(k, depthNext, -alpha - 1, -alpha, ply + 1);
          }
          if (score > alpha && score < beta) {
            score = -this.search(k, depthNext, -beta, -alpha, ply + 1);
          }
        }
        this.toggleTeban(k);
        k.back(te);
        searched++;
        if (score > alpha) {
          alpha = score;
          bestMove = te;
          if (ply === 0) this.rootBest = te.clone();
          if (alpha >= beta) {
            const key = this.moveKey(te);
            if (te.capture === EMPTY) {
              this.recordKiller(ply, key);
              if (ply > 0 && ply < _ShogiAIImprovedV20.MAX_PLY) {
                const prevKey = this.prevKeyByPly[ply] | 0;
                if (prevKey !== 0) this.counterMove.set(prevKey, key);
                const prevPt = this.prevPtByPly[ply] | 0;
                if (prevPt >= 0) {
                  const idx = prevPt * _ShogiAIImprovedV20.CONT_HIST_DIM + this.pieceToIndex(te);
                  this.contHist[idx] = (this.contHist[idx] | 0) + depthLeft * depthLeft;
                }
              }
            }
            this.recordHistory(key, depthLeft);
            break;
          }
        }
      }
      if (legalTried === 0) {
        if (!prunedAny) return parentInCheck ? -_ShogiAIImprovedV20.MATE + ply : 0;
        return alpha;
      }
      this.tt.add(k.HashVal, k.SecondaryHashVal, alpha, alphaOrig, beta, bestMove ? this.moveKey(bestMove) : 0, depthLeft);
      return alpha;
    } finally {
      if (this.enableRepetition) this.popRepetition();
    }
  }
  /**
   * Lightweight gate for the mate solver (V20).
   *
   * The solver is exact but costs a slice of the move budget, so we only run it when a mate is
   * plausible: attacking material close to the enemy king and/or pieces in hand to drop. In the
   * opening/midgame (no pieces near the enemy king) the gate is essentially free and always off.
   *
   * Condition: at least one own non-king piece within Chebyshev distance 3 of the enemy king,
   * and (near pieces + hand pieces) >= 2 — one lone attacker with an empty hand almost never mates.
   */
  shouldTryMateSolve(k) {
    const enemyKing = k.teban === SENTE ? k.kingG : k.kingS;
    if (enemyKing <= 0) return false;
    const kingSuji = enemyKing >> 4;
    const kingDan = enemyKing & 15;
    let near = 0;
    for (let ds = -3; ds <= 3; ds++) {
      const suji = kingSuji + ds;
      if (suji < 1 || suji > 9) continue;
      for (let dd = -3; dd <= 3; dd++) {
        const dan = kingDan + dd;
        if (dan < 1 || dan > 9) continue;
        const p = k.get((suji << 4) + dan);
        if (p === EMPTY || p === WALL) continue;
        if (isSelf(k.teban, p) && getKomashu(p) !== OU) near++;
      }
    }
    if (near === 0) return false;
    let handCount = 0;
    for (let type = FU; type <= HI; type++) handCount += k.hand[k.teban | type] | 0;
    return near + handCount >= 2;
  }
  /**
   * Pre-search mate probe (V20).
   *
   * Before the main iterative-deepening search we spend a small, bounded budget asking the exact
   * question "do I have a forced mate by consecutive checks?". If yes, the mating move is returned
   * immediately — this is both faster and strictly more reliable than hoping the pruned main
   * search stumbles onto a deep sacrifice mate.
   *
   * Budget policy:
   * - timed searches: ~20% of the move budget, capped at 200ms (and at least 30ms to be useful)
   * - untimed searches (maxTimeMs <= 0, e.g. deterministic tests): fixed 250ms + node cap
   */
  tryMateSolve(k, maxTimeMs) {
    if (!this.shouldTryMateSolve(k)) return null;
    const mateStart = this.nowMs();
    const budgetMs = maxTimeMs > 0 ? Math.max(30, Math.min(200, Math.floor(maxTimeMs * 0.2))) : 250;
    const mate = this.mateSolver.solve(k, {
      maxPlies: 9,
      maxNodes: 15e4,
      maxTimeMs: budgetMs
    });
    if (mate) return mate;
    if (maxTimeMs > 0) {
      const spent = this.nowMs() - mateStart;
      this.maxTimeMs = Math.max(Math.floor(maxTimeMs / 2), maxTimeMs - Math.ceil(spent));
    }
    return null;
  }
  getNextTeWithInfo(k, tesu = 0, options = {}) {
    this.rootTesu = tesu | 0;
    this.rootOrderBonusCache.clear();
    const difficulty = options.difficulty ?? "medium";
    const book = getOpeningMoveImproved(k, difficulty);
    if (book) return { move: book, kind: "book" };
    const defaults = (() => {
      switch (difficulty) {
        case "easy":
          return { maxDepth: 32, maxTimeMs: 250, quiescenceDepthMax: 6 };
        case "medium":
          return { maxDepth: 32, maxTimeMs: 1e3, quiescenceDepthMax: 8 };
        case "hard":
          return { maxDepth: 32, maxTimeMs: 2e3, quiescenceDepthMax: 10 };
        case "expert":
          return { maxDepth: 32, maxTimeMs: 4e3, quiescenceDepthMax: 12 };
        case "master":
          return { maxDepth: 32, maxTimeMs: 5e3, quiescenceDepthMax: 12 };
      }
    })();
    const maxTimeMs = options.maxTimeMs ?? defaults.maxTimeMs;
    this.maxTimeMs = maxTimeMs;
    const maxDepth = Math.max(1, Math.min(options.maxDepth ?? defaults.maxDepth, 32));
    this.quiescenceDepthMax = Math.max(0, options.quiescenceDepthMax ?? defaults.quiescenceDepthMax);
    this.evaluationMode = options.evaluationMode ?? "v3";
    const mateMove = this.tryMateSolve(k, maxTimeMs);
    if (mateMove) return { move: mateMove, scoreCp: 3e4, kind: "mate" };
    this.enableAspiration = true;
    this.aspirationWindow = 300;
    this.enableLMR = true;
    this.enableNullMove = true;
    this.nullMoveReduction = maxTimeMs >= 3e3 ? 3 : 2;
    this.enableCheckExtension = true;
    this.checkExtensionMaxPly = 0;
    this.enableDeltaPruning = true;
    this.deltaPruningMargin = 150;
    this.enableFutility = true;
    this.enableQSeePruning = true;
    this.drawContempt = 12;
    this.enableQuiescenceChecks = true;
    this.quiescenceCheckMoveLimit = maxTimeMs >= 2e3 ? 2 : 1;
    this.quiescenceCheckTryLimit = maxTimeMs >= 2e3 ? 8 : 2;
    this.node = 0;
    this.leaf = 0;
    this.resetRootBest();
    this.killer1.fill(0);
    this.killer2.fill(0);
    this.history.clear();
    this.counterMove.clear();
    this.prevKeyByPly.fill(0);
    this.contHist.fill(0);
    this.prevPtByPly.fill(-1);
    this.repetitionCount.clear();
    this.repetitionPrimaryStack.length = 0;
    this.repetitionSecondaryStack.length = 0;
    const start = this.nowMs();
    this.startTime = start;
    const position = k.clone();
    let handTotal = 0;
    for (let i = 0; i < position.hand.length; i++) handTotal += position.hand[i] | 0;
    this.rootHandTotal = handTotal;
    this.rootInCheck = GenerateMovesImproved.isKingInCheck(position, position.teban);
    const selfKing = position.teban === SENTE ? position.kingS : position.kingG;
    this.rootKingDanger = this.rootInCheck ? 999 : this.computeKingDanger(position, position.teban, selfKing);
    const rootMoves = GenerateMovesImproved.generateLegalMovesPooled(position, this.moveLists[0]);
    if (rootMoves.length === 0) return { move: null, depth: 0, kind: "search" };
    const ttIndexAtRoot = this.tt.probe(position.HashVal, position.SecondaryHashVal);
    const ttMoveKeyAtRoot = ttIndexAtRoot >= 0 ? this.tt.bestKey[ttIndexAtRoot] | 0 : 0;
    const ttSecondMoveKeyAtRoot = ttIndexAtRoot >= 0 ? this.tt.secondKey[ttIndexAtRoot] | 0 : 0;
    this.scoreAndSortMoves(position, rootMoves, 0, ttMoveKeyAtRoot, ttSecondMoveKeyAtRoot);
    let bestMove = rootMoves[0].clone();
    let bestScore = -_ShogiAIImprovedV20.INFINITE;
    for (let i = 0; i < Math.min(6, rootMoves.length); i++) {
      const te = rootMoves[i];
      position.move(te);
      this.toggleTeban(position);
      const score = -this.evalForSideToMove(position);
      this.toggleTeban(position);
      position.back(te);
      if (score > bestScore) {
        bestScore = score;
        bestMove = te.clone();
      }
    }
    let completedDepth = 0;
    for (let depth = 1; depth <= maxDepth; depth++) {
      try {
        this.resetRootBest();
        const useAspiration = this.enableAspiration && depth >= 2 && bestMove !== null;
        const alpha0 = useAspiration ? bestScore - this.aspirationWindow : -_ShogiAIImprovedV20.INFINITE;
        const beta0 = useAspiration ? bestScore + this.aspirationWindow : _ShogiAIImprovedV20.INFINITE;
        let score = this.search(position, depth, alpha0, beta0, 0);
        if (useAspiration && (score <= alpha0 || score >= beta0)) {
          const wide = this.aspirationWindow * 4;
          const alpha1 = score <= alpha0 ? bestScore - wide : alpha0;
          const beta1 = score >= beta0 ? bestScore + wide : beta0;
          this.resetRootBest();
          score = this.search(position, depth, alpha1, beta1, 0);
          if (score <= alpha1 || score >= beta1) {
            this.resetRootBest();
            score = this.search(position, depth, -_ShogiAIImprovedV20.INFINITE, _ShogiAIImprovedV20.INFINITE, 0);
          }
        }
        const rootBest = this.rootBest;
        if (rootBest) {
          bestMove = rootBest.clone();
          bestScore = score;
          completedDepth = depth;
        }
        if (bestScore >= _ShogiAIImprovedV20.MATE - 1e4) break;
      } catch (e) {
        if (e instanceof TimeUpError) break;
        throw e;
      }
      if (this.timeUp()) break;
    }
    if (options.debug) {
      const elapsed = this.nowMs() - start;
      console.log(
        `[ShogiAIImprovedV20] depth=${completedDepth}/${maxDepth} score=${bestScore} nodes=${this.node} leaves=${this.leaf} time=${Math.round(elapsed)}ms`
      );
    }
    return { move: bestMove, scoreCp: bestScore, depth: completedDepth, kind: "search" };
  }
  /** Backward-compatible move-only API. */
  getNextTe(k, tesu = 0, options = {}) {
    return this.getNextTeWithInfo(k, tesu, options).move;
  }
};
var sharedAIV20 = new ShogiAIImprovedV20();

// wasm-spike/search-driver.ts
var PRODUCTION_SHOGI_WASM_PATH = (0, import_node_path.join)(
  __dirname,
  "..",
  "src",
  "components",
  "game",
  "ShogiImproved",
  "wasm",
  "shogi.wasm"
);
function loadShogiWasm(wasmPath = PRODUCTION_SHOGI_WASM_PATH) {
  const wasmBytes = (0, import_node_fs.readFileSync)(wasmPath);
  const wasmModule = new WebAssembly.Module(wasmBytes);
  const instance = new WebAssembly.Instance(wasmModule, {
    env: {
      abort(_msg, _file, line, col) {
        throw new Error(`wasm abort at ${line}:${col}`);
      },
      now: () => performance.now(),
      // Single-thread stubs for the Lazy SMP shared-TT hooks (never called while
      // setSharedTtEnabled stays 0, but the imports must link).
      sharedTtProbe: (_hashA, _hashB) => 0,
      sharedTtStore: (_hashA, _hashB, _value, _flagDepth, _best) => {
      },
      sharedShouldStop: () => 0
    }
  });
  return instance.exports;
}
function syncWasm(wasm, k) {
  wasm.clearBoard();
  for (let suji = 1; suji <= 9; suji++) {
    for (let dan = 1; dan <= 9; dan++) {
      const pos = (suji << 4) + dan;
      wasm.setSquare(pos, k.ban[pos]);
    }
  }
  for (let koma = SFU; koma <= GHI; koma++) {
    wasm.setHand(koma, k.hand[koma] | 0);
  }
  wasm.setSideToMove(k.teban);
  wasm.finalizePosition();
}
function teFromWasmKey(key, k) {
  const koma = key & 63;
  const from = key >> 6 & 255;
  const to = key >> 14 & 255;
  const promote = (key >> 22 & 1) === 1;
  const capture = k.get(to);
  return new Te(koma, from, to, promote, capture);
}
function jsMoveKey(te) {
  return te.koma & 63 | (te.from & 255) << 6 | (te.to & 255) << 14 | (te.promote ? 1 : 0) << 22;
}
function mulberry322(seed) {
  let a = seed >>> 0;
  return () => {
    a = a + 1831565813 >>> 0;
    let t = a;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function runJsSearch(k, tesu, maxTimeMs, maxDepth, quiescenceDepthMax) {
  const ai = new ShogiAIImprovedV20();
  const origLog = console.log;
  let line = null;
  console.log = (...args) => {
    const s = String(args[0] ?? "");
    if (s.startsWith("[ShogiAIImprovedV20]")) line = s;
    else origLog(...args);
  };
  const start = performance.now();
  let move = null;
  try {
    move = ai.getNextTe(k, tesu, {
      maxTimeMs,
      maxDepth,
      quiescenceDepthMax,
      evaluationMode: "v3",
      debug: true
    });
  } finally {
    console.log = origLog;
  }
  const timeMs = performance.now() - start;
  if (line === null) {
    return { move, depth: 0, score: 0, nodes: 0, leaves: 0, fromSearch: false, timeMs };
  }
  const match = /depth=(\d+)\/\d+ score=(-?\d+) nodes=(\d+) leaves=(\d+)/.exec(line);
  if (!match) throw new Error(`unexpected debug line: ${line}`);
  return {
    move,
    depth: parseInt(match[1], 10),
    score: parseInt(match[2], 10),
    nodes: parseInt(match[3], 10),
    leaves: parseInt(match[4], 10),
    fromSearch: true,
    timeMs
  };
}
function buildTestPositions() {
  const positions = [];
  const snapshots = [16, 24, 33, 42];
  for (let game = 0; game < 4; game++) {
    const rnd = mulberry322(12513025 + game * 7919);
    const k = new KyokumenImproved();
    k.initHirate();
    const maxPly = snapshots[snapshots.length - 1];
    for (let ply = 0; ply < maxPly; ply++) {
      const moves = GenerateMovesImproved.generateLegalMoves(k);
      if (moves.length === 0) break;
      const te = moves[Math.floor(rnd() * moves.length)];
      te.capture = k.get(te.to);
      k.move(te);
      k.toggleTeban();
      const tesu = ply + 1;
      if (snapshots.includes(tesu)) {
        if (GenerateMovesImproved.generateLegalMoves(k).length > 0) {
          positions.push({ label: `game${game} ply${tesu}`, k: k.clone(), tesu });
        }
      }
    }
  }
  return positions;
}
function runFixedDepthVerification(wasm) {
  const cases = buildTestPositions();
  const depths = [4, 5, 6];
  let exact = 0;
  let close = 0;
  let skipped = 0;
  let failed = 0;
  let compared = 0;
  console.log(`=== fixed-depth verification (maxTimeMs=0, quiescenceDepthMax=8) ===`);
  for (const depth of depths) {
    for (const c of cases) {
      const js = runJsSearch(c.k, c.tesu, 0, depth, 8);
      if (!js.fromSearch) {
        console.log(`  d${depth} ${c.label}: SKIP (JS answered from book/mate solver: ${js.move?.toString()})`);
        skipped++;
        continue;
      }
      wasm.clearTT();
      syncWasm(wasm, c.k);
      wasm.setRootTesu(c.tesu);
      const key = wasm.searchBestMove(0, depth, 8);
      const wScore = wasm.getSearchScore();
      const wDepth = wasm.getSearchDepth();
      const wNodes = wasm.getSearchNodes();
      const wLeaves = wasm.getSearchLeaves();
      compared++;
      const jsKey = js.move ? jsMoveKey(js.move) : 0;
      const wasmTe = key !== 0 ? teFromWasmKey(key, c.k) : null;
      const legal = GenerateMovesImproved.generateLegalMoves(c.k);
      const isLegal = wasmTe !== null && legal.some(
        (te) => te.koma === wasmTe.koma && te.from === wasmTe.from && te.to === wasmTe.to && te.promote === wasmTe.promote
      );
      if (!isLegal) {
        console.log(`  d${depth} ${c.label}: FAIL \u2014 WASM move ${wasmTe?.toString() ?? "(none)"} is not legal`);
        failed++;
        continue;
      }
      if (key === jsKey && wScore === js.score && wNodes === js.nodes && wLeaves === js.leaves) {
        exact++;
        console.log(
          `  d${depth} ${c.label}: EXACT ${js.move.toString()} score=${js.score} nodes=${js.nodes} leaves=${js.leaves} (JS ${js.timeMs.toFixed(0)}ms)`
        );
      } else if (key === jsKey && Math.abs(wScore - js.score) <= 50) {
        close++;
        console.log(
          `  d${depth} ${c.label}: SAME MOVE, score JS=${js.score} WASM=${wScore}, nodes JS=${js.nodes} WASM=${wNodes}`
        );
      } else {
        failed++;
        console.log(
          `  d${depth} ${c.label}: DIFF \u2014 JS ${js.move.toString()} score=${js.score} nodes=${js.nodes} / WASM ${wasmTe.toString()} score=${wScore} depth=${wDepth} nodes=${wNodes}`
        );
      }
    }
  }
  console.log(
    `
fixed-depth summary: compared=${compared} exact=${exact} sameMoveClose=${close} diff=${failed} skipped(book/mate)=${skipped}`
  );
  if (failed > 0) process.exit(1);
  if (compared === 0) {
    console.error("no positions compared (all book/mate hits?) \u2014 vacuous verification");
    process.exit(1);
  }
}
function runBench(wasm) {
  const cases = buildTestPositions().filter((c) => c.tesu >= 24).slice(0, 3);
  const timeMs = 3e3;
  const qMax = 10;
  console.log(`=== 3s benchmark (maxTimeMs=${timeMs}, quiescenceDepthMax=${qMax}) ===`);
  for (const c of cases) {
    const js = runJsSearch(c.k, c.tesu, timeMs, 32, qMax);
    wasm.clearTT();
    syncWasm(wasm, c.k);
    wasm.setRootTesu(c.tesu);
    const t0 = performance.now();
    const key = wasm.searchBestMove(timeMs, 32, qMax);
    const wTime = performance.now() - t0;
    const wasmTe = key !== 0 ? teFromWasmKey(key, c.k) : null;
    console.log(`  ${c.label}:`);
    console.log(
      `    JS   depth=${js.depth} score=${js.score} nodes=${js.nodes} leaves=${js.leaves} move=${js.move?.toString()} time=${js.timeMs.toFixed(0)}ms${js.fromSearch ? "" : " (book/mate)"}`
    );
    console.log(
      `    WASM depth=${wasm.getSearchDepth()} score=${wasm.getSearchScore()} nodes=${wasm.getSearchNodes()} leaves=${wasm.getSearchLeaves()} move=${wasmTe?.toString()} time=${wTime.toFixed(0)}ms`
    );
  }
}
if (void 0 === module) {
  const wasmPathIndex = process.argv.indexOf("--wasm-path");
  const wasmPath = wasmPathIndex < 0 ? void 0 : process.argv[wasmPathIndex + 1];
  if (wasmPathIndex >= 0 && (!wasmPath || wasmPath.startsWith("--"))) {
    throw new Error("--wasm-path requires a value");
  }
  const wasm = loadShogiWasm(wasmPath);
  if (process.argv.includes("--bench")) {
    runBench(wasm);
  } else {
    runFixedDepthVerification(wasm);
  }
}

// wasm-spike/match-nnue-vs-v3.ts
function argNum(flag, def) {
  const i = process.argv.indexOf(flag);
  if (i < 0) return def;
  const n = parseInt(process.argv[i + 1], 10);
  if (!Number.isFinite(n)) throw new Error(`${flag} requires a numeric value`);
  return n;
}
function argStr(flag) {
  const i = process.argv.indexOf(flag);
  if (i < 0) return null;
  const v = process.argv[i + 1];
  if (!v || v.startsWith("--")) throw new Error(`${flag} requires a value`);
  return v;
}
function argLazyPickerMinMoves(flag) {
  const raw = argStr(flag);
  if (raw === null) return 0;
  if (!/^(?:0|[1-9]\d*)$/u.test(raw)) {
    throw new Error(`${flag} must be 0 (off) or an integer from 2 through 640`);
  }
  const value = Number(raw);
  if (value !== 0 && (value < 2 || value > 640)) {
    throw new Error(`${flag} must be 0 (off) or an integer from 2 through 640`);
  }
  return value;
}
var weightsPath = process.argv[2];
if (!weightsPath || weightsPath.startsWith("--")) {
  console.error(
    "usage: node -r tsx/cjs wasm-spike/match-nnue-vs-v3.ts <weights.bin> [--vs otherWeights.bin] [--games 16] [--ms 200] [--seed 1] [--k 600] [--scale-numer 1] [--scale-denom 1] [--max-plies 256] [--wasm-path research.wasm] [--lazy-picker-a-min-moves 64] [--lazy-picker-b-min-moves 64]"
  );
  process.exit(2);
}
var weightsPathB = argStr("--vs");
var GAMES = argNum("--games", 16);
var MOVE_MS = argNum("--ms", 200);
var SEED_BASE = argNum("--seed", 1);
var SCALE_K = argNum("--k", 600);
var SCALE_NUMER = argNum("--scale-numer", 1);
var SCALE_DENOM = argNum("--scale-denom", 1);
var WASM_PATH = argStr("--wasm-path") ?? void 0;
var LAZY_PICKER_A_MIN_MOVES = argLazyPickerMinMoves(
  "--lazy-picker-a-min-moves"
);
var LAZY_PICKER_B_MIN_MOVES = argLazyPickerMinMoves(
  "--lazy-picker-b-min-moves"
);
var BUCKETS_A = argNum("--buckets-a", 0);
var BUCKETS_B = argNum("--buckets-b", 0);
var EXPECTED_SHA_A = argStr("--sha-a");
var EXPECTED_SHA_B = argStr("--sha-b");
var EXPECTED_WASM_SHA = argStr("--wasm-sha");
var MAX_PLIES = argNum("--max-plies", 256);
if (SCALE_NUMER < 1 || SCALE_DENOM < 1 || SCALE_NUMER > 1e6 || SCALE_DENOM > 1e6) {
  throw new Error(
    "--scale-numer/--scale-denom must be between 1 and 1,000,000"
  );
}
if (!Number.isSafeInteger(MAX_PLIES) || MAX_PLIES < 1 || MAX_PLIES > 512) {
  throw new Error("--max-plies must be an integer from 1 through 512");
}
var MAX_DEPTH = 32;
var QUIESCENCE_DEPTH_MAX = 10;
var WasmPlayer = class {
  constructor(name, wasm) {
    this.name = name;
    this.wasm = wasm;
  }
  newGame() {
    this.wasm.clearTT();
  }
  getNextTe(k, tesu) {
    syncWasm(this.wasm, k);
    this.wasm.setRootTesu(tesu);
    const key = this.wasm.searchBestMove(
      MOVE_MS,
      MAX_DEPTH,
      QUIESCENCE_DEPTH_MAX
    );
    if (key === 0) return null;
    return teFromWasmKey(key, k);
  }
};
var movesChecked = 0;
function playOneGame(nnue, v3, nnueIsSente, openingMoves) {
  const k = new KyokumenImproved();
  k.initHirate();
  k.setTeban(SENTE);
  for (const opening of openingMoves) {
    const te = opening.clone();
    te.capture = k.get(te.to);
    k.move(te);
    k.toggleTeban();
  }
  const repetition = /* @__PURE__ */ new Map();
  for (let ply = openingMoves.length; ply < MAX_PLIES; ply++) {
    repetition.set(k.HashVal, (repetition.get(k.HashVal) ?? 0) + 1);
    if ((repetition.get(k.HashVal) ?? 0) >= 4) {
      return { outcome: "draw", plies: ply, reason: "repetition" };
    }
    const side = k.teban;
    const nnueToMove = nnueIsSente ? side === SENTE : side === GOTE;
    const player = nnueToMove ? nnue : v3;
    const move = player.getNextTe(k, ply);
    const legalMoves = GenerateMovesImproved.generateLegalMoves(k);
    if (!move) {
      if (legalMoves.length > 0) {
        return {
          outcome: "win",
          winner: side === SENTE ? GOTE : SENTE,
          plies: ply,
          reason: "noMove"
        };
      }
      const inCheck = GenerateMovesImproved.isKingInCheck(k, side);
      if (inCheck)
        return {
          outcome: "win",
          winner: side === SENTE ? GOTE : SENTE,
          plies: ply,
          reason: "checkmate"
        };
      return { outcome: "draw", plies: ply, reason: "stalemate" };
    }
    const isLegal = legalMoves.some(
      (te) => te.koma === move.koma && te.from === move.from && te.to === move.to && te.promote === move.promote
    );
    if (!isLegal) {
      console.error(
        `ILLEGAL MOVE by ${player.name} at ply ${ply}: ${move.toString()} (koma=${move.koma} from=${move.from.toString(16)} to=${move.to.toString(16)} promote=${move.promote})`
      );
      process.exit(1);
    }
    movesChecked++;
    move.capture = k.get(move.to);
    k.move(move);
    k.toggleTeban();
  }
  return { outcome: "draw", plies: MAX_PLIES, reason: "maxPlies" };
}
function setupNnueInstance(wasm, path, label, bucketOverride, expectedSha256) {
  const weightsBin = (0, import_node_fs2.readFileSync)(path);
  if (expectedSha256 !== null && (0, import_node_crypto2.createHash)("sha256").update(weightsBin).digest("hex") !== expectedSha256) {
    throw new Error(
      `${label}: weights SHA-256 differs from the preregistered asset`
    );
  }
  const buckets = bucketOverride > 0 ? bucketOverride : bucketsForByteLength(weightsBin.byteLength);
  if (!Number.isInteger(buckets) || buckets < 1 || buckets > 65535) {
    throw new Error(
      `${label}: bucket selector must be an integer from 1 through 65535`
    );
  }
  wasm.setNnueBuckets(buckets);
  if (weightsBin.byteLength !== wasm.getNnueWeightsSize()) {
    console.error(
      `${label}: weights.bin size mismatch: file=${weightsBin.byteLength} wasm=${wasm.getNnueWeightsSize()}`
    );
    process.exit(1);
  }
  new Uint8Array(
    wasm.memory.buffer,
    wasm.getNnueWeightsPtr(),
    weightsBin.byteLength
  ).set(weightsBin);
  wasm.setNnueScaleK(SCALE_K);
  wasm.setNnueOutputScale(SCALE_NUMER, SCALE_DENOM);
  wasm.setNnueEnabled(1);
  return buckets;
}
function configureResearchLazyMovePicker(wasm, label, minMoves) {
  if (minMoves === 0) return;
  if (WASM_PATH === void 0) {
    throw new Error(
      `lazy picker ${label} requires an explicit --wasm-path whose runtime exports setResearchLazyMovePicker`
    );
  }
  if (typeof wasm.setResearchLazyMovePicker !== "function") {
    throw new Error(
      `lazy picker ${label}: explicit WASM does not export setResearchLazyMovePicker`
    );
  }
  wasm.setResearchLazyMovePicker(1, minMoves);
}
function lazyPickerLogValue(minMoves) {
  return minMoves === 0 ? "off" : String(minMoves);
}
function main() {
  if (WASM_PATH !== void 0 && EXPECTED_WASM_SHA !== null && (0, import_node_crypto2.createHash)("sha256").update((0, import_node_fs2.readFileSync)(WASM_PATH)).digest("hex") !== EXPECTED_WASM_SHA) {
    throw new Error(
      "research WASM SHA-256 differs from the preregistered asset"
    );
  }
  const wasmA = loadShogiWasm(WASM_PATH);
  const bucketsA = setupNnueInstance(
    wasmA,
    weightsPath,
    "A",
    BUCKETS_A,
    EXPECTED_SHA_A
  );
  configureResearchLazyMovePicker(wasmA, "A", LAZY_PICKER_A_MIN_MOVES);
  const wasmB = loadShogiWasm(WASM_PATH);
  let opponentName = "V3";
  if (weightsPathB) {
    const bucketsB = setupNnueInstance(
      wasmB,
      weightsPathB,
      "B",
      BUCKETS_B,
      EXPECTED_SHA_B
    );
    opponentName = `NNUE-B(buckets=${bucketsB})`;
  }
  configureResearchLazyMovePicker(wasmB, "B", LAZY_PICKER_B_MIN_MOVES);
  const nnuePlayer = new WasmPlayer(
    weightsPathB ? `NNUE-A(buckets=${bucketsA})` : "NNUE",
    wasmA
  );
  const v3Player = new WasmPlayer(opponentName, wasmB);
  let nnueWins = 0;
  let v3Wins = 0;
  let draws = 0;
  console.log(
    `=== match: WASM+NNUE-A(${weightsPath}, buckets=${bucketsA}, K=${SCALE_K}, outScale=${SCALE_NUMER}/${SCALE_DENOM}) vs ${weightsPathB ? `WASM+NNUE-B(${weightsPathB})` : "WASM+V3"} \u2014 ${GAMES} games, ${MOVE_MS}ms/move, opening ${NNUE_FIXED_TIME_OPENING_PLIES} plies (seed base ${SEED_BASE}), no book / no mate solver, runtime=${WASM_PATH ?? "production"}, fixed-time-ms=${MOVE_MS}, max-plies=${MAX_PLIES}, lazy-picker=A:${lazyPickerLogValue(LAZY_PICKER_A_MIN_MOVES)},B:${lazyPickerLogValue(LAZY_PICKER_B_MIN_MOVES)}, tt=clear-before-each-game-retain-within-game ===`
  );
  for (let game = 0; game < GAMES; game++) {
    const nnueIsSente = game % 2 === 0;
    const generatedOpening = buildNnueFixedTimeOpening(SEED_BASE, game >> 1);
    const openingMoves = [...generatedOpening.moves];
    const opening = generatedOpening.fingerprint;
    nnuePlayer.newGame();
    v3Player.newGame();
    const start = performance.now();
    const result = playOneGame(nnuePlayer, v3Player, nnueIsSente, openingMoves);
    const elapsed = ((performance.now() - start) / 1e3).toFixed(1);
    let summary;
    if (result.outcome === "win") {
      const nnueWon = nnueIsSente ? result.winner === SENTE : result.winner === GOTE;
      if (nnueWon) nnueWins++;
      else v3Wins++;
      summary = `WIN ${nnueWon ? nnuePlayer.name : v3Player.name} (${result.reason}, ${result.winner === SENTE ? "SENTE" : "GOTE"})`;
    } else {
      draws++;
      summary = `DRAW (${result.reason})`;
    }
    console.log(
      `game ${game + 1}/${GAMES}: NNUE=${nnueIsSente ? "SENTE" : "GOTE"} opening=${opening} => ${summary} plies=${result.plies} time=${elapsed}s`
    );
  }
  const decisive = nnueWins + v3Wins;
  const score = nnueWins + draws / 2;
  console.log(
    `
result: ${nnuePlayer.name} ${nnueWins} wins / ${v3Player.name} ${v3Wins} wins / ${draws} draws (all ${movesChecked} moves legal)`
  );
  console.log(
    `${nnuePlayer.name} score: ${score}/${GAMES} (${(score / GAMES * 100).toFixed(1)}%)` + (decisive > 0 ? `, decisive-only: ${nnueWins}/${decisive} (${(nnueWins / decisive * 100).toFixed(1)}%)` : "")
  );
}
main();
