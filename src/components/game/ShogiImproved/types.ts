// Constants for player flags
export const SENTE = 1 << 4; // 16
export const GOTE = 1 << 5;  // 32

// Piece type constants (matching Java exactly)
export const EMPTY = 0;
export const EMP = 0;
export const PROMOTE = 8;

// Base piece types (without player flag)
export const FU = 1;  // Pawn
export const KY = 2;  // Lance
export const KE = 3;  // Knight
export const GI = 4;  // Silver
export const KI = 5;  // Gold
export const KA = 6;  // Bishop
export const HI = 7;  // Rook
export const OU = 8;  // King
export const TO = FU + PROMOTE;  // Promoted pawn
export const NY = KY + PROMOTE;  // Promoted lance
export const NK = KE + PROMOTE;  // Promoted knight
export const NG = GI + PROMOTE;  // Promoted silver
export const UM = KA + PROMOTE;  // Horse (promoted bishop)
export const RY = HI + PROMOTE;  // Dragon (promoted rook)

// Sente pieces (with SENTE flag)
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

// Gote pieces (with GOTE flag)
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

// Wall constant for out of bounds
export const WALL = 64;

// Piece value table (for evaluation)
export const komaValue: number[] = [
  0,    0,    0,    0,    0,    0,    0,    0, // Empty spaces
  0,    0,    0,    0,    0,    0,    0,    0, // Cannot promote
  0,  100,  600,  700, 1000, 1200, 1800, 2000, // Sente FU-HI
  10000, 1200, 1200, 1200, 1200,    0, 2000, 2200, // Sente OU,TO,NY,NK,NG,UM,RY
  0, -100, -600, -700,-1000,-1200,-1800,-2000, // Gote FU-HI
  -10000,-1200,-1200,-1200,-1200,    0,-2000,-2200  // Gote OU,TO,NY,NK,NG,UM,RY
];

// Can promote table
export const canPromote: boolean[] = [
  false,false,false,false,false,false,false,false,// Cannot promote
  false,false,false,false,false,false,false,false,// Cannot promote
  false, true, true, true, true,false, true, true,// Sente pieces
  false,false,false,false,false,false,false,false,// Already promoted
  false, true, true, true, true,false, true, true,// Gote pieces
  false,false,false,false,false,false,false,false // Already promoted
];

// Move class (Te in Java)
export class Te {
  koma: number;      // Piece that moves
  from: number;      // From position (0 for drops)
  to: number;        // To position
  promote: boolean;  // Whether to promote
  capture: number;   // Captured piece
  value: number;     // Move value for ordering

  constructor(
    koma: number = 0,
    from: number = 0,
    to: number = 0,
    promote: boolean = false,
    capture: number = 0
  ) {
    this.koma = koma;
    this.from = from;
    this.to = to;
    this.promote = promote;
    this.capture = capture;
    this.value = 0;
  }

  equals(te: Te | null): boolean {
    if (!te) return false;
    return (
      te.koma === this.koma &&
      te.from === this.from &&
      te.to === this.to &&
      te.promote === this.promote
    );
  }

  clone(): Te {
    return new Te(this.koma, this.from, this.to, this.promote, this.capture);
  }

  toString(): string {
    const sujiStr = ["", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
    const danStr = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"];

    const suji = this.to >> 4;
    const dan = this.to & 0x0f;

    return `${sujiStr[suji]}${danStr[dan]}${this.getKomaString()}${this.promote ? "成" : ""}`;
  }

  private getKomaString(): string {
    const komaString = [
      "  ",
      "歩", "香", "桂", "銀", "金", "角", "飛",
      "玉", "と", "杏", "圭", "全", "", "馬", "竜"
    ];
    return komaString[getKomashu(this.koma)];
  }
}

// Helper functions
export function isSente(koma: number): boolean {
  return (koma & SENTE) !== 0;
}

export function isGote(koma: number): boolean {
  return (koma & GOTE) !== 0;
}

export function isSelf(teban: number, koma: number): boolean {
  if (teban === SENTE) {
    return isSente(koma);
  } else {
    return isGote(koma);
  }
}

export function isEnemy(teban: number, koma: number): boolean {
  if (teban === SENTE) {
    return isGote(koma);
  } else {
    return isSente(koma);
  }
}

export function getKomashu(koma: number): number {
  // Get piece type without player flag
  return koma & 0x0f;
}

// Position encoding (suji << 4) + dan
export function makePosition(suji: number, dan: number): number {
  return (suji << 4) + dan;
}

export function getSuji(pos: number): number {
  return pos >> 4;
}

export function getDan(pos: number): number {
  return pos & 0x0f;
}

// Position class for UI compatibility
// Backend uses integer positions, but UI expects Position objects
export class Position {
  suji: number;
  dan: number;

  constructor(suji: number, dan: number) {
    this.suji = suji;
    this.dan = dan;
  }

  clone(): Position {
    return new Position(this.suji, this.dan);
  }

  toInt(): number {
    return makePosition(this.suji, this.dan);
  }

  static fromInt(pos: number): Position {
    return new Position(getSuji(pos), getDan(pos));
  }

  equals(other: Position | null): boolean {
    if (!other) return false;
    return this.suji === other.suji && this.dan === other.dan;
  }
}

// Piece string representations
export function toBanString(koma: number): string {
  const komaString = [
    "  ",
    "歩", "香", "桂", "銀", "金", "角", "飛",
    "玉", "と", "杏", "圭", "全", "", "馬", "竜"
  ];

  if (koma === EMPTY) {
    return "   ";
  } else if ((koma & SENTE) !== 0) {
    // Sente piece with " " prefix
    return " " + komaString[getKomashu(koma)];
  } else {
    // Gote piece with "v" prefix
    return "v" + komaString[getKomashu(koma)];
  }
}

export function toString(koma: number): string {
  const komaString = [
    "  ",
    "歩", "香", "桂", "銀", "金", "角", "飛",
    "玉", "と", "杏", "圭", "全", "", "馬", "竜"
  ];
  return komaString[getKomashu(koma)];
}