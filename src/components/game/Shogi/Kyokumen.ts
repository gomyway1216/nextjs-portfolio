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
  isSente,
  isGote,
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

  // Evaluate board position
  evaluate(): number {
    let score = 0;

    // Board pieces
    for (let suji = 1; suji <= 9; suji++) {
      for (let dan = 1; dan <= 9; dan++) {
        const koma = this.ban[suji][dan];
        score += komaValue[koma];
      }
    }

    // Captured pieces
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < this.hand[i].length; j++) {
        const koma = this.hand[i][j];
        score += komaValue[koma];
      }
    }

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
