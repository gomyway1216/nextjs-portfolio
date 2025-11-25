import {
  EMPTY,
  SFU, SKY, SKE, SGI, SKI, SKA, SHI, SOU,
  GFU, GKY, GKE, GGI, GKI, GKA, GHI, GOU
} from './types';
import { KyokumenImproved } from './KyokumenImproved';

// Initial position helper class
export class InitialPositionImproved {
  // Standard initial position (hirate)
  static readonly HIRATE: number[][] = [
    [GKY, GKE, GGI, GKI, GOU, GKI, GGI, GKE, GKY],      // Rank 1
    [EMPTY, GHI, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, GKA, EMPTY], // Rank 2
    [GFU, GFU, GFU, GFU, GFU, GFU, GFU, GFU, GFU],      // Rank 3
    [EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY], // Rank 4
    [EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY], // Rank 5
    [EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY], // Rank 6
    [SFU, SFU, SFU, SFU, SFU, SFU, SFU, SFU, SFU],      // Rank 7
    [EMPTY, SKA, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, SHI, EMPTY], // Rank 8
    [SKY, SKE, SGI, SKI, SOU, SKI, SGI, SKE, SKY],      // Rank 9
  ];

  // Create and return initial position
  static createInitialPosition(): KyokumenImproved {
    const kyokumen = new KyokumenImproved();
    kyokumen.initHirate();
    return kyokumen;
  }

  // Set up initial position
  static setupHirate(kyokumen: KyokumenImproved): void {
    kyokumen.initHirate();
  }

  // Set up custom position from array
  static setupCustom(kyokumen: KyokumenImproved, position: number[][]): void {
    // Clear board first
    for (let suji = 1; suji <= 9; suji++) {
      for (let dan = 1; dan <= 9; dan++) {
        kyokumen.ban[(suji << 4) + dan] = EMPTY;
      }
    }

    // Set pieces from array
    for (let dan = 1; dan <= 9; dan++) {
      for (let suji = 9; suji >= 1; suji--) {
        if (dan - 1 < position.length && 9 - suji < position[dan - 1].length) {
          kyokumen.ban[(suji << 4) + dan] = position[dan - 1][9 - suji];
        }
      }
    }

    // Clear hands
    for (let koma = SFU; koma <= GHI; koma++) {
      kyokumen.hand[koma] = 0;
    }

    // Initialize evaluation and hash
    kyokumen.initAll();
  }

  // Common handicap positions
  static readonly LANCE_HANDICAP: number[][] = [
    [EMPTY, GKE, GGI, GKI, GOU, GKI, GGI, GKE, GKY],   // Left lance removed
    [EMPTY, GHI, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, GKA, EMPTY],
    [GFU, GFU, GFU, GFU, GFU, GFU, GFU, GFU, GFU],
    [EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY],
    [EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY],
    [EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY],
    [SFU, SFU, SFU, SFU, SFU, SFU, SFU, SFU, SFU],
    [EMPTY, SKA, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, SHI, EMPTY],
    [SKY, SKE, SGI, SKI, SOU, SKI, SGI, SKE, SKY],
  ];

  static readonly BISHOP_HANDICAP: number[][] = [
    [GKY, GKE, GGI, GKI, GOU, GKI, GGI, GKE, GKY],
    [EMPTY, GHI, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY], // Bishop removed
    [GFU, GFU, GFU, GFU, GFU, GFU, GFU, GFU, GFU],
    [EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY],
    [EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY],
    [EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY],
    [SFU, SFU, SFU, SFU, SFU, SFU, SFU, SFU, SFU],
    [EMPTY, SKA, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, SHI, EMPTY],
    [SKY, SKE, SGI, SKI, SOU, SKI, SGI, SKE, SKY],
  ];

  static readonly ROOK_HANDICAP: number[][] = [
    [GKY, GKE, GGI, GKI, GOU, GKI, GGI, GKE, GKY],
    [EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, GKA, EMPTY], // Rook removed
    [GFU, GFU, GFU, GFU, GFU, GFU, GFU, GFU, GFU],
    [EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY],
    [EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY],
    [EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY],
    [SFU, SFU, SFU, SFU, SFU, SFU, SFU, SFU, SFU],
    [EMPTY, SKA, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, SHI, EMPTY],
    [SKY, SKE, SGI, SKI, SOU, SKI, SGI, SKE, SKY],
  ];

  static readonly TWO_PIECE_HANDICAP: number[][] = [
    [GKY, GKE, GGI, GKI, GOU, GKI, GGI, GKE, GKY],
    [EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY], // Rook and bishop removed
    [GFU, GFU, GFU, GFU, GFU, GFU, GFU, GFU, GFU],
    [EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY],
    [EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY],
    [EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY],
    [SFU, SFU, SFU, SFU, SFU, SFU, SFU, SFU, SFU],
    [EMPTY, SKA, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, SHI, EMPTY],
    [SKY, SKE, SGI, SKI, SOU, SKI, SGI, SKE, SKY],
  ];

  // Set up handicap games
  static setupLanceHandicap(kyokumen: KyokumenImproved): void {
    this.setupCustom(kyokumen, this.LANCE_HANDICAP);
  }

  static setupBishopHandicap(kyokumen: KyokumenImproved): void {
    this.setupCustom(kyokumen, this.BISHOP_HANDICAP);
  }

  static setupRookHandicap(kyokumen: KyokumenImproved): void {
    this.setupCustom(kyokumen, this.ROOK_HANDICAP);
  }

  static setupTwoPieceHandicap(kyokumen: KyokumenImproved): void {
    this.setupCustom(kyokumen, this.TWO_PIECE_HANDICAP);
  }
}