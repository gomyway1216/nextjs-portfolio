/**
 * Kyokumen (Board State) - Direct conversion from Java
 */

import {
  Position,
  Te,
  SENTE,
  GOTE,
  EMPTY,
  WALL,
  PROMOTE,
  OU,
  FU,
  HI,
  SOU,
  GOU,
  SFU,
  GFU,
  SKA,
  SHI,
  GKA,
  GHI,
  isSente,
  isGote,
  isSelf,
  getKomashu,
  komaValue,
  toString as komaToString,
  toBanString
} from './types';

export class Kyokumen {
  // Board (11x11 where 1-9 are used, 0 and 10 are walls)
  ban: number[][];

  // Captured pieces (hand[0] = SENTE, hand[1] = GOTE)
  hand: number[][];

  // Current turn
  teban: number;

  constructor() {
    this.ban = Array(11).fill(0).map(() => Array(11).fill(0));
    this.hand = [[], []];
    this.teban = SENTE;
  }

  // Clone the board state
  clone(): Kyokumen {
    const k = new Kyokumen();

    // Copy board
    for (let suji = 0; suji < 11; suji++) {
      for (let dan = 0; dan < 11; dan++) {
        k.ban[suji][dan] = this.ban[suji][dan];
      }
    }

    // Copy captured pieces
    k.hand[0] = [...this.hand[0]];
    k.hand[1] = [...this.hand[1]];

    // Copy turn
    k.teban = this.teban;

    return k;
  }

  // Check if two board states are equal
  equals(k: Kyokumen): boolean {
    // Compare turn
    if (this.teban !== k.teban) {
      return false;
    }

    // Compare board
    for (let suji = 1; suji <= 9; suji++) {
      for (let dan = 1; dan <= 9; dan++) {
        if (this.ban[suji][dan] !== k.ban[suji][dan]) {
          return false;
        }
      }
    }

    // Compare captured pieces by count
    const handSente: number[] = Array(HI + 1).fill(0);
    const handGote: number[] = Array(HI + 1).fill(0);
    const compareHandSente: number[] = Array(HI + 1).fill(0);
    const compareHandGote: number[] = Array(HI + 1).fill(0);

    // Count this board's pieces
    for (let i = 0; i < this.hand[0].length; i++) {
      const komaShu = getKomashu(this.hand[0][i]);
      handSente[komaShu]++;
    }
    for (let i = 0; i < this.hand[1].length; i++) {
      const komaShu = getKomashu(this.hand[1][i]);
      handGote[komaShu]++;
    }

    // Count comparison board's pieces
    for (let i = 0; i < k.hand[0].length; i++) {
      const komaShu = getKomashu(k.hand[0][i]);
      compareHandSente[komaShu]++;
    }
    for (let i = 0; i < k.hand[1].length; i++) {
      const komaShu = getKomashu(k.hand[1][i]);
      compareHandGote[komaShu]++;
    }

    // Compare counts
    for (let i = FU; i <= HI; i++) {
      if (handSente[i] !== compareHandSente[i]) return false;
      if (handGote[i] !== compareHandGote[i]) return false;
    }

    return true;
  }

  // Get piece at position
  get(p: Position): number {
    // Return WALL if outside board
    if (p.suji < 1 || 9 < p.suji || p.dan < 1 || 9 < p.dan) {
      return WALL;
    }
    return this.ban[p.suji][p.dan];
  }

  // Put piece at position
  put(p: Position, koma: number): void {
    this.ban[p.suji][p.dan] = koma;
  }

  // Execute a move
  move(te: Te): void {
    // If destination has a piece, capture it
    if (this.get(te.to) !== EMPTY) {
      let koma = this.get(te.to);
      if (isSente(koma)) {
        // Captured by gote
        koma = koma & 0x07; // Remove promote/player flags
        koma = koma | GOTE;  // Set gote flag
        this.hand[1].push(koma);
      } else {
        // Captured by sente
        koma = koma & 0x07; // Remove promote/player flags
        koma = koma | SENTE; // Set sente flag
        this.hand[0].push(koma);
      }
    }

    if (te.from.suji === 0) {
      // This is a drop move
      if (isSente(te.koma)) {
        // Sente drops
        const index = this.hand[0].findIndex(k => k === te.koma);
        if (index !== -1) {
          this.hand[0].splice(index, 1);
        }
      } else {
        // Gote drops
        const index = this.hand[1].findIndex(k => k === te.koma);
        if (index !== -1) {
          this.hand[1].splice(index, 1);
        }
      }
    } else {
      // Regular move - clear source
      this.put(te.from, EMPTY);
    }

    // Place piece at destination
    let koma = te.koma;
    if (te.promote) {
      koma = koma | PROMOTE;
    }
    this.put(te.to, koma);
  }

  // Search for king position
  searchGyoku(teban: number): Position {
    const toSearch = teban | OU;
    for (let suji = 1; suji <= 9; suji++) {
      for (let dan = 1; dan <= 9; dan++) {
        if (this.ban[suji][dan] === toSearch) {
          return new Position(suji, dan);
        }
      }
    }
    // Not found - return invalid position
    return new Position(-2, -2);
  }

  // Helper: Find king position
  private findKingPosition(teban: number): Position | null {
    const targetKing = teban === SENTE ? SOU : GOU;
    for (let suji = 1; suji <= 9; suji++) {
      for (let dan = 1; dan <= 9; dan++) {
        if (this.ban[suji][dan] === targetKing) {
          return new Position(suji, dan);
        }
      }
    }
    return null;
  }

  // Helper: Count pieces around a position
  private countDefenders(pos: Position, teban: number): number {
    let defenders = 0;
    const directions = [
      [-1, -1], [-1, 0], [-1, 1],
      [0, -1],           [0, 1],
      [1, -1],  [1, 0],  [1, 1]
    ];

    for (const [dSuji, dDan] of directions) {
      const newSuji = pos.suji + dSuji;
      const newDan = pos.dan + dDan;
      if (newSuji >= 1 && newSuji <= 9 && newDan >= 1 && newDan <= 9) {
        const piece = this.ban[newSuji][newDan];
        if (piece !== EMPTY && isSelf(teban, piece)) {
          defenders++;
        }
      }
    }
    return defenders;
  }

  // Evaluate king safety
  private evaluateKingSafety(teban: number): number {
    const kingPos = this.findKingPosition(teban);
    if (!kingPos) return 0;

    let safety = 0;

    // Reward pieces defending the king
    safety += this.countDefenders(kingPos, teban) * 15;

    // Penalize king in center of board (dangerous)
    const centerDistance = Math.abs(kingPos.suji - 5) + Math.abs(kingPos.dan - 5);
    if (centerDistance < 4) {
      safety -= 20;
    }

    // Reward king in corner (safer)
    if ((kingPos.suji <= 2 || kingPos.suji >= 8) &&
        (kingPos.dan <= 2 || kingPos.dan >= 8)) {
      safety += 25;
    }

    return safety;
  }

  // Evaluate pawn structure
  private evaluatePawnStructure(teban: number): number {
    let score = 0;
    const pawnCounts = Array(9).fill(0);
    const targetPawn = teban === SENTE ? SFU : GFU;

    for (let suji = 1; suji <= 9; suji++) {
      for (let dan = 1; dan <= 9; dan++) {
        const piece = this.ban[suji][dan];
        if (piece === targetPawn) {
          pawnCounts[suji - 1]++;

          // Reward advanced pawns
          if (teban === SENTE) {
            if (dan <= 3) score += 15; // Advanced into enemy territory
            else if (dan <= 5) score += 5; // Middle of board
          } else {
            if (dan >= 7) score += 15;
            else if (dan >= 5) score += 5;
          }
        }
      }
    }

    // Penalize doubled pawns
    for (const count of pawnCounts) {
      if (count > 1) score -= 40;
    }

    return score;
  }

  // Evaluate piece development
  private evaluateDevelopment(teban: number): number {
    let score = 0;

    // Penalize pieces on starting rank (not developed)
    const startRank = teban === SENTE ? 9 : 1;
    const bigPieces = teban === SENTE ? [SKA, SHI] : [GKA, GHI];

    for (let suji = 1; suji <= 9; suji++) {
      const piece = this.ban[suji][startRank];
      if (bigPieces.includes(piece)) {
        score -= 10; // Penalize unmoved major pieces
      }
    }

    return score;
  }

  // Evaluate board position (improved)
  evaluate(): number {
    let score = 0;

    // Material value
    for (let suji = 1; suji <= 9; suji++) {
      for (let dan = 1; dan <= 9; dan++) {
        const koma = this.ban[suji][dan];
        score += komaValue[koma];
      }
    }

    // Captured pieces (slightly more valuable than board pieces)
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < this.hand[i].length; j++) {
        const koma = this.hand[i][j];
        // Hand pieces are worth 110% of their value (can be dropped anywhere)
        score += Math.floor(komaValue[koma] * 1.1);
      }
    }

    // Positional evaluation
    const senteKingSafety = this.evaluateKingSafety(SENTE);
    const goteKingSafety = this.evaluateKingSafety(GOTE);
    score += senteKingSafety - goteKingSafety;

    const sentePawnStructure = this.evaluatePawnStructure(SENTE);
    const gotePawnStructure = this.evaluatePawnStructure(GOTE);
    score += sentePawnStructure - gotePawnStructure;

    const senteDevelopment = this.evaluateDevelopment(SENTE);
    const goteDevelopment = this.evaluateDevelopment(GOTE);
    score += senteDevelopment - goteDevelopment;

    return score;
  }

  // Convert board to string for display
  toString(): string {
    let s = '';

    // Gote's captured pieces
    s += '後手持駒:';
    for (let i = 0; i < this.hand[1].length; i++) {
      s += komaToString(this.hand[1][i]);
    }
    s += '\n';

    // Board
    s += ' ９ ８ ７ ６ ５ ４ ３ ２ １\n';
    s += '+---+---+---+---+---+---+---+---+---+\n';
    for (let dan = 1; dan <= 9; dan++) {
      for (let suji = 9; suji >= 1; suji--) {
        s += '|';
        s += toBanString(this.ban[suji][dan]);
      }
      s += '|';
      const danStr = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
      s += danStr[dan];
      s += '\n';
      s += '+---+---+---+---+---+---+---+---+---+\n';
    }

    // Sente's captured pieces
    s += '先手持駒:';
    for (let i = 0; i < this.hand[0].length; i++) {
      s += komaToString(this.hand[0][i]);
    }
    s += '\n';

    return s;
  }
}
