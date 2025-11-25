/**
 * Shogi types and constants - Direct conversion from Java implementation
 */

// Player constants (bitwise flags)
export const SENTE = 1 << 4; // 16 - First player (先手)
export const GOTE = 1 << 5;  // 32 - Second player (後手)

export type Player = typeof SENTE | typeof GOTE;

// Piece type constants
export const EMPTY = 0;
export const EMP = EMPTY;
export const PROMOTE = 8; // Promotion flag

// Basic piece types
export const FU = 1;  // Pawn (歩)
export const KY = 2;  // Lance (香)
export const KE = 3;  // Knight (桂)
export const GI = 4;  // Silver (銀)
export const KI = 5;  // Gold (金)
export const KA = 6;  // Bishop (角)
export const HI = 7;  // Rook (飛)
export const OU = 8;  // King (王/玉)

// Promoted pieces
export const TO = FU + PROMOTE; // Promoted pawn (と金)
export const NY = KY + PROMOTE; // Promoted lance (成香)
export const NK = KE + PROMOTE; // Promoted knight (成桂)
export const NG = GI + PROMOTE; // Promoted silver (成銀)
export const UM = KA + PROMOTE; // Promoted bishop (馬)
export const RY = HI + PROMOTE; // Promoted rook (龍)

// Sente pieces (with player flag)
export const SFU = SENTE + FU;
export const SKY = SENTE + KY;
export const SKE = SENTE + KE;
export const SGI = SENTE + GI;
export const SKI = SENTE + KI;
export const SKA = SENTE + KA;
export const SHI = SENTE + HI;
export const SOU = SENTE + OU;
export const STO = SENTE + TO;
export const SNY = SENTE + NY;
export const SNK = SENTE + NK;
export const SNG = SENTE + NG;
export const SUM = SENTE + UM;
export const SRY = SENTE + RY;

// Gote pieces (with player flag)
export const GFU = GOTE + FU;
export const GKY = GOTE + KY;
export const GKE = GOTE + KE;
export const GGI = GOTE + GI;
export const GKI = GOTE + KI;
export const GKA = GOTE + KA;
export const GHI = GOTE + HI;
export const GOU = GOTE + OU;
export const GTO = GOTE + TO;
export const GNY = GOTE + NY;
export const GNK = GOTE + NK;
export const GNG = GOTE + NG;
export const GUM = GOTE + UM;
export const GRY = GOTE + RY;

export const WALL = 64; // Outside board marker

// Piece utility functions
export const isSente = (koma: number): boolean => {
  return (koma & SENTE) !== 0;
};

export const isGote = (koma: number): boolean => {
  return (koma & GOTE) !== 0;
};

export const isSelf = (teban: number, koma: number): boolean => {
  if (teban === SENTE) {
    return isSente(koma);
  } else {
    return isGote(koma);
  }
};

export const isEnemy = (teban: number, koma: number): boolean => {
  if (teban === SENTE) {
    return isGote(koma);
  } else {
    return isSente(koma);
  }
};

export const getKomashu = (koma: number): number => {
  return koma & 0x0f;
};

// Piece string representations
export const komaString: string[] = [
  '　', '歩', '香', '桂', '銀', '金', '角', '飛',
  '王', 'と', '杏', '圭', '全', '', '馬', '龍'
];

export const toBanString = (koma: number): string => {
  if (koma === EMPTY) {
    return '   ';
  } else if ((koma & SENTE) !== 0) {
    return ' ' + komaString[getKomashu(koma)];
  } else {
    return 'v' + komaString[getKomashu(koma)];
  }
};

export const toString = (koma: number): string => {
  return komaString[getKomashu(koma)];
};

// Can promote lookup table
export const canPromoteTable: boolean[] = [
  false, false, false, false, false, false, false, false,
  false, false, false, false, false, false, false, false,
  false, true, true, true, true, false, true, true,
  false, false, false, false, false, false, false, false,
  false, true, true, true, true, false, true, true,
  false, false, false, false, false, false, false, false
];

export const canPromote = (koma: number): boolean => {
  return canPromoteTable[koma];
};

// Movement directions (8 standard + 4 knight moves)
export const diffDan: number[] = [
  1, 1, 1, 0, 0, -1, -1, -1, -2, -2, 2, 2
];

export const diffSuji: number[] = [
  -1, 0, 1, 1, -1, 1, 0, -1, 1, -1, -1, 1
];

// Can move table [direction][piece]
export const canMove: boolean[][] = [
  // Direction 0: diagonal down-left
  [
    false, false, false, false, false, false, false, false,
    false, false, false, false, false, false, false, false,
    false, false, false, false, true, false, false, false,
    true, false, false, false, false, false, false, true,
    false, false, false, false, true, true, false, false,
    true, true, true, true, true, true, false, true
  ],
  // Direction 1: straight down
  [
    false, false, false, false, false, false, false, false,
    false, false, false, false, false, false, false, false,
    false, false, false, false, false, true, false, false,
    true, true, true, true, true, false, true, false,
    false, true, false, false, true, true, false, false,
    true, true, true, true, true, false, true, false
  ],
  // Direction 2: diagonal down-right
  [
    false, false, false, false, false, false, false, false,
    false, false, false, false, false, false, false, false,
    false, false, false, false, true, false, false, false,
    true, false, false, false, false, false, false, true,
    false, false, false, false, true, true, false, false,
    true, true, true, true, true, true, false, true
  ],
  // Direction 3: left
  [
    false, false, false, false, false, false, false, false,
    false, false, false, false, false, false, false, false,
    false, false, false, false, false, true, false, false,
    true, true, true, true, true, false, true, false,
    false, false, false, false, false, true, false, false,
    true, true, true, true, true, false, true, false
  ],
  // Direction 4: right
  [
    false, false, false, false, false, false, false, false,
    false, false, false, false, false, false, false, false,
    false, false, false, false, false, true, false, false,
    true, true, true, true, true, false, true, false,
    false, false, false, false, false, true, false, false,
    true, true, true, true, true, false, true, false
  ],
  // Direction 5: diagonal up-left
  [
    false, false, false, false, false, false, false, false,
    false, false, false, false, false, false, false, false,
    false, false, false, false, true, true, false, false,
    true, true, true, true, true, false, false, true,
    false, false, false, false, true, false, false, false,
    true, false, false, false, false, false, false, true
  ],
  // Direction 6: straight up
  [
    false, false, false, false, false, false, false, false,
    false, false, false, false, false, false, false, false,
    false, true, false, false, true, true, false, false,
    true, true, true, true, true, false, true, false,
    false, false, false, false, false, true, false, false,
    true, true, true, true, true, false, true, false
  ],
  // Direction 7: diagonal up-right
  [
    false, false, false, false, false, false, false, false,
    false, false, false, false, false, false, false, false,
    false, false, false, false, true, true, false, false,
    true, true, true, true, true, false, false, true,
    false, false, false, false, true, false, false, false,
    true, false, false, false, false, false, false, true
  ],
  // Direction 8: knight move (sente left)
  [
    false, false, false, false, false, false, false, false,
    false, false, false, false, false, false, false, false,
    false, false, false, true, false, false, false, false,
    false, false, false, false, false, false, false, false,
    false, false, false, false, false, false, false, false,
    false, false, false, false, false, false, false, false
  ],
  // Direction 9: knight move (sente right)
  [
    false, false, false, false, false, false, false, false,
    false, false, false, false, false, false, false, false,
    false, false, false, true, false, false, false, false,
    false, false, false, false, false, false, false, false,
    false, false, false, false, false, false, false, false,
    false, false, false, false, false, false, false, false
  ],
  // Direction 10: knight move (gote left)
  [
    false, false, false, false, false, false, false, false,
    false, false, false, false, false, false, false, false,
    false, false, false, false, false, false, false, false,
    false, false, false, false, false, false, false, false,
    false, false, false, true, false, false, false, false,
    false, false, false, false, false, false, false, false
  ],
  // Direction 11: knight move (gote right)
  [
    false, false, false, false, false, false, false, false,
    false, false, false, false, false, false, false, false,
    false, false, false, false, false, false, false, false,
    false, false, false, false, false, false, false, false,
    false, false, false, true, false, false, false, false,
    false, false, false, false, false, false, false, false
  ]
];

// Can jump table [direction][piece] for sliding pieces
export const canJump: boolean[][] = [
  // Direction 0: diagonal down-left
  [
    false, false, false, false, false, false, false, false,
    false, false, false, false, false, false, false, false,
    false, false, false, false, false, false, true, false,
    false, false, false, false, false, false, true, false,
    false, false, false, false, false, false, true, false,
    false, false, false, false, false, false, true, false
  ],
  // Direction 1: straight down
  [
    false, false, false, false, false, false, false, false,
    false, false, false, false, false, false, false, false,
    false, false, false, false, false, false, false, true,
    false, false, false, false, false, false, false, true,
    false, false, true, false, false, false, false, true,
    false, false, false, false, false, false, false, true
  ],
  // Direction 2: diagonal down-right
  [
    false, false, false, false, false, false, false, false,
    false, false, false, false, false, false, false, false,
    false, false, false, false, false, false, true, false,
    false, false, false, false, false, false, true, false,
    false, false, false, false, false, false, true, false,
    false, false, false, false, false, false, true, false
  ],
  // Direction 3: left
  [
    false, false, false, false, false, false, false, false,
    false, false, false, false, false, false, false, false,
    false, false, false, false, false, false, false, true,
    false, false, false, false, false, false, false, true,
    false, false, false, false, false, false, false, true,
    false, false, false, false, false, false, false, true
  ],
  // Direction 4: right
  [
    false, false, false, false, false, false, false, false,
    false, false, false, false, false, false, false, false,
    false, false, false, false, false, false, false, true,
    false, false, false, false, false, false, false, true,
    false, false, false, false, false, false, false, true,
    false, false, false, false, false, false, false, true
  ],
  // Direction 5: diagonal up-left
  [
    false, false, false, false, false, false, false, false,
    false, false, false, false, false, false, false, false,
    false, false, false, false, false, false, true, false,
    false, false, false, false, false, false, true, false,
    false, false, false, false, false, false, true, false,
    false, false, false, false, false, false, true, false
  ],
  // Direction 6: straight up
  [
    false, false, false, false, false, false, false, false,
    false, false, false, false, false, false, false, false,
    false, false, true, false, false, false, false, true,
    false, false, false, false, false, false, false, true,
    false, false, false, false, false, false, false, true,
    false, false, false, false, false, false, false, true
  ],
  // Direction 7: diagonal up-right
  [
    false, false, false, false, false, false, false, false,
    false, false, false, false, false, false, false, false,
    false, false, false, false, false, false, true, false,
    false, false, false, false, false, false, true, false,
    false, false, false, false, false, false, true, false,
    false, false, false, false, false, false, true, false
  ]
];

// Piece evaluation values (on board)
// Standard ratios: P=1, L=3, N=4, S=5, G=6, B=8, R=9, TO=7, promoted minor=6, UM=10, RY=11
// Scale: Pawn = 100 points
export const komaValue: number[] = [
  0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0,
  //  FU   KY   KE   GI   KI   KA    HI
  0, 100, 300, 400, 500, 600, 800, 900,
  //  OU   TO   NY   NK   NG   --   UM    RY
  10000, 700, 600, 600, 600, 0, 1000, 1100,
  0, -100, -300, -400, -500, -600, -800, -900,
  -10000, -700, -600, -600, -600, 0, -1000, -1100
];

// Hand piece values (pieces in hand are worth MORE due to drop flexibility)
// Major pieces in hand are especially valuable
export const handPieceValue: number[] = [
  0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0,
  //  FU   KY   KE   GI   KI   KA    HI
  0, 115, 350, 450, 575, 700, 1050, 1200,  // ~15-30% bonus for flexibility
  0, 0, 0, 0, 0, 0, 0, 0,  // Promoted pieces can't be in hand
  0, -115, -350, -450, -575, -700, -1050, -1200,
  0, 0, 0, 0, 0, 0, 0, 0
];

// Position class
export class Position {
  suji: number; // Column (1-9)
  dan: number;  // Row (1-9)

  constructor(suji: number = 0, dan: number = 0) {
    this.suji = suji;
    this.dan = dan;
  }

  equals(p: Position): boolean {
    return p.suji === this.suji && p.dan === this.dan;
  }

  clone(): Position {
    return new Position(this.suji, this.dan);
  }

  add(diffSujiOrDirect: number, diffDanParam?: number): void {
    if (diffDanParam !== undefined) {
      this.suji += diffSujiOrDirect;
      this.dan += diffDanParam;
    } else {
      this.suji += diffSuji[diffSujiOrDirect];
      this.dan += diffDan[diffSujiOrDirect];
    }
  }

  sub(diffSujiOrDirect: number, diffDanParam?: number): void {
    if (diffDanParam !== undefined) {
      this.suji -= diffSujiOrDirect;
      this.dan -= diffDanParam;
    } else {
      this.suji -= diffSuji[diffSujiOrDirect];
      this.dan -= diffDan[diffSujiOrDirect];
    }
  }
}

// Move (Te) class
export class Te {
  koma: number;       // Which piece
  from: Position;     // Source position (0,0 for drops)
  to: Position;       // Destination position
  promote: boolean;   // Whether to promote

  constructor(koma: number, from: Position, to: Position, promote: boolean) {
    this.koma = koma;
    this.from = from.clone();
    this.to = to.clone();
    this.promote = promote;
  }

  equals(te: Te): boolean {
    return te.koma === this.koma &&
      te.from.equals(this.from) &&
      te.to.equals(this.to) &&
      te.promote === this.promote;
  }

  clone(): Te {
    return new Te(this.koma, this.from, this.to, this.promote);
  }
}
