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
  KA,
  RY,
  UM,
  SOU,
  GOU,
  SFU,
  GFU,
  SKA,
  SHI,
  GKA,
  GHI,
  SKI,
  GKI,
  SGI,
  GGI,
  isSente,
  isGote,
  isSelf,
  getKomashu,
  komaValue,
  toString as komaToString,
  toBanString,
  canMove,
  canJump,
  diffSuji,
  diffDan
} from './types';
import { evaluateAllKakoi } from './KakoiComprehensive';

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

    if (te.from.suji === 0 && te.from.dan === 0) {
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

  // Check if a piece at position is under attack
  private isUnderAttack(pos: Position, teban: number): boolean {
    // Check all 12 directions for attacking pieces
    for (let direct = 0; direct < 12; direct++) {
      const attackerPos = new Position(
        pos.suji - diffSuji[direct],
        pos.dan - diffDan[direct]
      );

      if (attackerPos.suji < 1 || attackerPos.suji > 9 ||
          attackerPos.dan < 1 || attackerPos.dan > 9) {
        continue;
      }

      const attacker = this.ban[attackerPos.suji][attackerPos.dan];

      // Check if enemy piece can attack from this direction
      if (attacker !== EMPTY && !isSelf(teban, attacker)) {
        if (canMove[direct][attacker]) {
          return true;
        }
      }
    }

    // Check sliding pieces (rook, bishop, etc.)
    for (let direct = 0; direct < 8; direct++) {
      let checkPos = new Position(pos.suji, pos.dan);
      checkPos.suji -= diffSuji[direct];
      checkPos.dan -= diffDan[direct];

      while (checkPos.suji >= 1 && checkPos.suji <= 9 &&
             checkPos.dan >= 1 && checkPos.dan <= 9) {
        const piece = this.ban[checkPos.suji][checkPos.dan];

        if (piece === EMPTY) {
          checkPos.suji -= diffSuji[direct];
          checkPos.dan -= diffDan[direct];
          continue;
        }

        // If own piece, this direction is blocked
        if (isSelf(teban, piece)) {
          break;
        }

        // If enemy sliding piece, we're under attack
        if (!isSelf(teban, piece) && canJump[direct][piece]) {
          return true;
        }

        break;
      }
    }

    return false;
  }

  // Evaluate hanging pieces (pieces under attack and not defended)
  private evaluateHangingPieces(teban: number): number {
    let penalty = 0;

    for (let suji = 1; suji <= 9; suji++) {
      for (let dan = 1; dan <= 9; dan++) {
        const piece = this.ban[suji][dan];

        // Check own pieces
        if (piece !== EMPTY && isSelf(teban, piece)) {
          const pos = new Position(suji, dan);

          // If piece is under attack
          if (this.isUnderAttack(pos, teban)) {
            const pieceValue = Math.abs(komaValue[piece]);
            const defenders = this.countDefenders(pos, teban);

            // Heavy penalty if undefended and under attack
            if (defenders === 0) {
              penalty -= pieceValue * 0.8; // Lose 80% of piece value
            } else if (defenders < 2) {
              penalty -= pieceValue * 0.3; // Lose 30% if lightly defended
            }
          }
        }
      }
    }

    return penalty;
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

  // Detect Mino Castle (美濃囲い) - Common ranging rook castle
  private detectMinoCastle(teban: number): number {
    const kingPos = this.findKingPosition(teban);
    if (!kingPos) return 0;

    let score = 0;

    // Mino castle for Sente: King at 7h/8h/9h, Gold at 6h/7i/8h, Silver at 7h
    // Mino castle for Gote: King at 2b/3b/4b, Gold at 2a/3b/4b, Silver at 3b
    if (teban === SENTE) {
      // Check if king is in typical Mino position (7h, 8h, or 9h)
      if ((kingPos.suji >= 7 && kingPos.suji <= 9) && kingPos.dan === 8) {
        score += 30;

        // Check for gold pieces protecting
        const gold1 = this.ban[6][9];
        const gold2 = this.ban[7][9];
        if (gold1 === SKI || gold1 === (SKI | PROMOTE)) score += 20;
        if (gold2 === SKI || gold2 === (SKI | PROMOTE)) score += 20;

        // Check for silver
        const silver = this.ban[7][8];
        if (silver === SGI || silver === (SGI | PROMOTE)) score += 15;
      }
    } else {
      // Gote Mino castle (mirrored)
      if ((kingPos.suji >= 1 && kingPos.suji <= 3) && kingPos.dan === 2) {
        score += 30;

        const gold1 = this.ban[4][1];
        const gold2 = this.ban[3][1];
        if (gold1 === GKI || gold1 === (GKI | PROMOTE)) score += 20;
        if (gold2 === GKI || gold2 === (GKI | PROMOTE)) score += 20;

        const silver = this.ban[3][2];
        if (silver === GGI || silver === (GGI | PROMOTE)) score += 15;
      }
    }

    return score;
  }

  // Detect Yagura Castle (矢倉囲い) - Common static rook castle
  private detectYaguraCastle(teban: number): number {
    const kingPos = this.findKingPosition(teban);
    if (!kingPos) return 0;

    let score = 0;

    // Yagura for Sente: King at 6h/7h, Gold at 5h/6i/7h, Silver at 6h/7g
    // Yagura for Gote: King at 3b/4b, Gold at 3a/4b/5b, Silver at 3b/4c
    if (teban === SENTE) {
      if ((kingPos.suji >= 6 && kingPos.suji <= 7) && kingPos.dan === 8) {
        score += 35;

        // Check for characteristic Yagura gold positions
        const gold1 = this.ban[5][8];
        const gold2 = this.ban[6][9];
        if (gold1 === SKI || gold1 === (SKI | PROMOTE)) score += 20;
        if (gold2 === SKI || gold2 === (SKI | PROMOTE)) score += 20;

        // Check for silver
        const silver1 = this.ban[6][8];
        const silver2 = this.ban[7][7];
        if (silver1 === SGI || silver1 === (SGI | PROMOTE)) score += 15;
        if (silver2 === SGI || silver2 === (SGI | PROMOTE)) score += 15;
      }
    } else {
      // Gote Yagura (mirrored)
      if ((kingPos.suji >= 3 && kingPos.suji <= 4) && kingPos.dan === 2) {
        score += 35;

        const gold1 = this.ban[5][2];
        const gold2 = this.ban[4][1];
        if (gold1 === GKI || gold1 === (GKI | PROMOTE)) score += 20;
        if (gold2 === GKI || gold2 === (GKI | PROMOTE)) score += 20;

        const silver1 = this.ban[4][2];
        const silver2 = this.ban[3][3];
        if (silver1 === GGI || silver1 === (GGI | PROMOTE)) score += 15;
        if (silver2 === GGI || silver2 === (GGI | PROMOTE)) score += 15;
      }
    }

    return score;
  }

  // Detect Anaguma Castle (穴熊囲い) - Very strong but slow to build
  private detectAnagumaCastle(teban: number): number {
    const kingPos = this.findKingPosition(teban);
    if (!kingPos) return 0;

    let score = 0;

    // Anaguma for Sente: King at 9i, Golds at 8i/9h, Silver at 8h
    // Anaguma for Gote: King at 1a, Golds at 2a/1b, Silver at 2b
    if (teban === SENTE) {
      if (kingPos.suji === 9 && kingPos.dan === 9) {
        score += 50; // Very strong castle

        // Check for golds
        const gold1 = this.ban[8][9];
        const gold2 = this.ban[9][8];
        if (gold1 === SKI || gold1 === (SKI | PROMOTE)) score += 25;
        if (gold2 === SKI || gold2 === (SKI | PROMOTE)) score += 25;

        // Check for silver
        const silver = this.ban[8][8];
        if (silver === SGI || silver === (SGI | PROMOTE)) score += 20;
      }
    } else {
      // Gote Anaguma (mirrored)
      if (kingPos.suji === 1 && kingPos.dan === 1) {
        score += 50;

        const gold1 = this.ban[2][1];
        const gold2 = this.ban[1][2];
        if (gold1 === GKI || gold1 === (GKI | PROMOTE)) score += 25;
        if (gold2 === GKI || gold2 === (GKI | PROMOTE)) score += 25;

        const silver = this.ban[2][2];
        if (silver === GGI || silver === (GGI | PROMOTE)) score += 20;
      }
    }

    return score;
  }

  // Evaluate kakoi (castle) formations
  private evaluateKakoi(teban: number): number {
    let score = 0;

    // Check for each type of castle
    score += this.detectMinoCastle(teban);
    score += this.detectYaguraCastle(teban);
    score += this.detectAnagumaCastle(teban);

    return score;
  }

  // Evaluate promotion threats - detect when opponent pieces can promote
  private evaluatePromotionThreats(teban: number): number {
    let penalty = 0;
    const opponent = teban === SENTE ? GOTE : SENTE;

    // Define promotion zones
    const promotionZone = teban === SENTE ? [1, 2, 3] : [7, 8, 9];

    // Check for enemy major pieces (Rook, Bishop) that can reach promotion zone
    for (let suji = 1; suji <= 9; suji++) {
      for (let dan = 1; dan <= 9; dan++) {
        const piece = this.ban[suji][dan];
        if (piece === EMPTY || isSelf(teban, piece)) continue;

        // Heavy penalty for enemy Rook in or near promotion zone
        const isRook = Math.abs(piece) === HI || Math.abs(piece) === RY;
        const isBishop = Math.abs(piece) === KA || Math.abs(piece) === UM;

        if (isRook || isBishop) {
          // Check if piece is in promotion zone
          if (promotionZone.includes(dan)) {
            // Critical: enemy major piece in promotion zone!
            penalty -= (isRook ? 1600 : 1200); // Rook is more dangerous (doubled)

            // Even worse if it's undefended
            if (!this.isUnderAttack(new Position(suji, dan), opponent)) {
              penalty -= 800; // Doubled - undefended promotion threat is critical!
            }
          } else {
            // Check if piece is 1-2 moves away from promotion zone
            const distanceToPromotion = Math.min(...promotionZone.map(d => Math.abs(dan - d)));
            if (distanceToPromotion === 1) {
              penalty -= (isRook ? 800 : 600); // One move away from promotion (doubled)
            } else if (distanceToPromotion === 2) {
              penalty -= (isRook ? 400 : 300); // Two moves away (doubled)
            }
          }
        }
      }
    }

    return penalty;
  }

  // Detect the current game phase
  private detectGamePhase(): 'joban' | 'chuban' | 'shuban' {
    // Count total captured pieces
    const totalHandPieces = this.hand[0].length + this.hand[1].length;

    // Count major pieces that have been developed
    let developedMajorPieces = 0;

    // Check for developed bishop/rook (sente)
    if (this.ban[2][8] !== SKA && this.ban[8][8] !== SHI) {
      developedMajorPieces++; // Sente bishop or rook moved
    }

    // Check for developed bishop/rook (gote)
    if (this.ban[2][2] !== GHI && this.ban[8][2] !== GKA) {
      developedMajorPieces++; // Gote bishop or rook moved
    }

    // Check king positions
    const senteKingPos = this.findKingPosition(SENTE);
    const goteKingPos = this.findKingPosition(GOTE);

    let kingsMovedFromStart = 0;
    if (senteKingPos && (senteKingPos.suji !== 5 || senteKingPos.dan !== 9)) {
      kingsMovedFromStart++;
    }
    if (goteKingPos && (goteKingPos.suji !== 5 || goteKingPos.dan !== 1)) {
      kingsMovedFromStart++;
    }

    // Check for endgame conditions first
    // Shuban: Significant material traded OR king under direct attack OR large material imbalance
    if (totalHandPieces > 8) {
      return 'shuban';
    }

    // Check if either king is under direct attack (pieces within 2-3 squares)
    if (senteKingPos) {
      let attackersNearSente = 0;
      for (let suji = Math.max(1, senteKingPos.suji - 3); suji <= Math.min(9, senteKingPos.suji + 3); suji++) {
        for (let dan = Math.max(1, senteKingPos.dan - 3); dan <= Math.min(9, senteKingPos.dan + 3); dan++) {
          const piece = this.ban[suji][dan];
          if (piece !== EMPTY && isGote(piece)) {
            const distance = Math.abs(suji - senteKingPos.suji) + Math.abs(dan - senteKingPos.dan);
            if (distance <= 2) attackersNearSente++;
          }
        }
      }
      if (attackersNearSente >= 2) return 'shuban';
    }

    if (goteKingPos) {
      let attackersNearGote = 0;
      for (let suji = Math.max(1, goteKingPos.suji - 3); suji <= Math.min(9, goteKingPos.suji + 3); suji++) {
        for (let dan = Math.max(1, goteKingPos.dan - 3); dan <= Math.min(9, goteKingPos.dan + 3); dan++) {
          const piece = this.ban[suji][dan];
          if (piece !== EMPTY && isSente(piece)) {
            const distance = Math.abs(suji - goteKingPos.suji) + Math.abs(dan - goteKingPos.dan);
            if (distance <= 2) attackersNearGote++;
          }
        }
      }
      if (attackersNearGote >= 2) return 'shuban';
    }

    // Check for large material imbalance
    let materialScore = 0;
    for (let suji = 1; suji <= 9; suji++) {
      for (let dan = 1; dan <= 9; dan++) {
        materialScore += komaValue[this.ban[suji][dan]];
      }
    }
    if (Math.abs(materialScore) > 4000) return 'shuban';

    // Joban: Opening phase
    if (developedMajorPieces <= 1 && kingsMovedFromStart === 0 && totalHandPieces < 3) {
      return 'joban';
    }

    // Default to chuban (middle game)
    return 'chuban';
  }

  // Enhanced development evaluation for opening phase
  private evaluateDevelopmentEnhanced(teban: number): number {
    let score = 0;

    // Check bishop and rook development
    if (teban === SENTE) {
      // Bonus for developing bishop from 8h
      if (this.ban[8][8] !== SKA) score += 50;

      // Bonus for developing rook from 2h
      if (this.ban[2][8] !== SHI) score += 50;

      // Bonus for king moving toward castle position (e.g., toward 7h/8h/9h)
      const kingPos = this.findKingPosition(SENTE);
      if (kingPos) {
        if (kingPos.suji >= 7 && kingPos.dan === 8) score += 30;
      }

      // Bonus for controlling central files (4-6)
      for (let suji = 4; suji <= 6; suji++) {
        for (let dan = 4; dan <= 6; dan++) {
          const piece = this.ban[suji][dan];
          if (piece !== EMPTY && isSente(piece)) score += 10;
        }
      }

      // Bonus for key diagonals
      const diagonals = [[7,7], [6,6], [5,5], [4,4], [3,3]];
      for (const [s, d] of diagonals) {
        if (this.ban[s][d] !== EMPTY && isSente(this.ban[s][d])) score += 8;
      }
    } else {
      // Gote development
      if (this.ban[2][2] !== GHI) score += 50;
      if (this.ban[8][2] !== GKA) score += 50;

      const kingPos = this.findKingPosition(GOTE);
      if (kingPos) {
        if (kingPos.suji <= 3 && kingPos.dan === 2) score += 30;
      }

      for (let suji = 4; suji <= 6; suji++) {
        for (let dan = 4; dan <= 6; dan++) {
          const piece = this.ban[suji][dan];
          if (piece !== EMPTY && isGote(piece)) score += 10;
        }
      }

      const diagonals = [[7,3], [6,4], [5,5], [4,6], [3,7]];
      for (const [s, d] of diagonals) {
        if (this.ban[s][d] !== EMPTY && isGote(this.ban[s][d])) score += 8;
      }
    }

    return score;
  }

  // Evaluate king proximity attack for endgame
  private evaluateKingProximityAttack(teban: number): number {
    let score = 0;

    const enemyKingPos = this.findKingPosition(teban === SENTE ? GOTE : SENTE);
    if (!enemyKingPos) return 0;

    // Check all pieces and reward based on proximity to enemy king
    for (let suji = 1; suji <= 9; suji++) {
      for (let dan = 1; dan <= 9; dan++) {
        const piece = this.ban[suji][dan];
        if (piece !== EMPTY && isSelf(teban, piece)) {
          const distance = Math.abs(suji - enemyKingPos.suji) + Math.abs(dan - enemyKingPos.dan);

          if (distance <= 2) {
            score += 200; // Massive bonus for pieces within 2 squares

            // Check if this piece is giving check
            const pos = new Position(suji, dan);
            if (this.canAttackKing(pos, piece, enemyKingPos)) {
              score += 500; // Huge bonus for checks
            }
          } else if (distance <= 3) {
            score += 100;
          } else if (distance <= 4) {
            score += 50;
          }
        }
      }
    }

    // Bonus for advanced pawns in endgame
    const targetPawn = teban === SENTE ? SFU : GFU;
    for (let suji = 1; suji <= 9; suji++) {
      for (let dan = 1; dan <= 9; dan++) {
        if (this.ban[suji][dan] === targetPawn) {
          if (teban === SENTE) {
            if (dan <= 3) score += 300; // 7th/8th/9th rank for sente
            else if (dan <= 4) score += 150;
          } else {
            if (dan >= 7) score += 300;
            else if (dan >= 6) score += 150;
          }
        }
      }
    }

    return score;
  }

  // Helper: Check if a piece can attack the king
  private canAttackKing(from: Position, piece: number, kingPos: Position): boolean {
    const dSuji = kingPos.suji - from.suji;
    const dDan = kingPos.dan - from.dan;

    // Check direct attacks for non-sliding pieces
    for (let direct = 0; direct < 12; direct++) {
      if (diffSuji[direct] === dSuji && diffDan[direct] === dDan) {
        if (canMove[direct][piece]) return true;
      }
    }

    // Check sliding attacks for rooks, bishops, etc.
    const distance = Math.max(Math.abs(dSuji), Math.abs(dDan));
    if (distance > 1) {
      for (let direct = 0; direct < 8; direct++) {
        if (canJump[direct][piece]) {
          // Check if king is on the sliding path
          let checkSuji = from.suji;
          let checkDan = from.dan;
          for (let i = 0; i < distance; i++) {
            checkSuji += diffSuji[direct];
            checkDan += diffDan[direct];
            if (checkSuji === kingPos.suji && checkDan === kingPos.dan) {
              // Check if path is clear
              let pathClear = true;
              let s = from.suji + diffSuji[direct];
              let d = from.dan + diffDan[direct];
              while (s !== kingPos.suji || d !== kingPos.dan) {
                if (this.ban[s][d] !== EMPTY) {
                  pathClear = false;
                  break;
                }
                s += diffSuji[direct];
                d += diffDan[direct];
              }
              if (pathClear) return true;
            }
          }
        }
      }
    }

    return false;
  }

  // Evaluate piece activity for middle game
  private evaluatePieceActivity(teban: number): number {
    let score = 0;

    const enemyKingPos = this.findKingPosition(teban === SENTE ? GOTE : SENTE);
    if (!enemyKingPos) return 0;

    // Reward pieces attacking squares around enemy king
    const kingArea = [
      [enemyKingPos.suji - 1, enemyKingPos.dan - 1],
      [enemyKingPos.suji - 1, enemyKingPos.dan],
      [enemyKingPos.suji - 1, enemyKingPos.dan + 1],
      [enemyKingPos.suji, enemyKingPos.dan - 1],
      [enemyKingPos.suji, enemyKingPos.dan + 1],
      [enemyKingPos.suji + 1, enemyKingPos.dan - 1],
      [enemyKingPos.suji + 1, enemyKingPos.dan],
      [enemyKingPos.suji + 1, enemyKingPos.dan + 1]
    ];

    for (const [targetSuji, targetDan] of kingArea) {
      if (targetSuji < 1 || targetSuji > 9 || targetDan < 1 || targetDan > 9) continue;

      // Check if any of our pieces attack this square
      for (let suji = 1; suji <= 9; suji++) {
        for (let dan = 1; dan <= 9; dan++) {
          const piece = this.ban[suji][dan];
          if (piece !== EMPTY && isSelf(teban, piece)) {
            if (this.canReachSquare(new Position(suji, dan), piece, new Position(targetSuji, targetDan))) {
              score += 60;
            }
          }
        }
      }
    }

    // Bonus for hand pieces (drops are powerful in middle game)
    const handIndex = teban === SENTE ? 0 : 1;
    score += this.hand[handIndex].length * 50;

    return score;
  }

  // Helper: Check if a piece can reach a target square
  private canReachSquare(from: Position, piece: number, to: Position): boolean {
    const dSuji = to.suji - from.suji;
    const dDan = to.dan - from.dan;

    // Check direct moves
    for (let direct = 0; direct < 12; direct++) {
      if (diffSuji[direct] === dSuji && diffDan[direct] === dDan) {
        if (canMove[direct][piece]) return true;
      }
    }

    // Check sliding moves
    const distance = Math.max(Math.abs(dSuji), Math.abs(dDan));
    if (distance > 1) {
      for (let direct = 0; direct < 8; direct++) {
        if (canJump[direct][piece]) {
          // Check if target is on sliding path and path is clear
          let ratio = 0;
          if (diffSuji[direct] !== 0) {
            ratio = dSuji / diffSuji[direct];
          } else if (diffDan[direct] !== 0) {
            ratio = dDan / diffDan[direct];
          }

          if (ratio > 0 && ratio === Math.floor(ratio)) {
            if (diffSuji[direct] * ratio === dSuji && diffDan[direct] * ratio === dDan) {
              // Check if path is clear
              let pathClear = true;
              for (let i = 1; i < ratio; i++) {
                const checkSuji = from.suji + diffSuji[direct] * i;
                const checkDan = from.dan + diffDan[direct] * i;
                if (this.ban[checkSuji][checkDan] !== EMPTY) {
                  pathClear = false;
                  break;
                }
              }
              if (pathClear) return true;
            }
          }
        }
      }
    }

    return false;
  }

  // Evaluate board position (improved with game phase awareness)
  evaluate(): number {
    // First, detect the game phase
    const gamePhase = this.detectGamePhase();

    let score = 0;

    // Material value (adjust weight based on phase)
    let materialWeight = 1.0;
    if (gamePhase === 'shuban') {
      materialWeight = 0.5; // Reduce material weight by 50% in endgame
    }

    for (let suji = 1; suji <= 9; suji++) {
      for (let dan = 1; dan <= 9; dan++) {
        const koma = this.ban[suji][dan];
        score += komaValue[koma] * materialWeight;
      }
    }

    // Captured pieces
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < this.hand[i].length; j++) {
        const koma = this.hand[i][j];
        let handValue = komaValue[koma] * 1.1;
        if (gamePhase === 'chuban') {
          handValue *= 1.2; // Extra bonus for hand pieces in middle game
        }
        score += Math.floor(handValue * materialWeight);
      }
    }

    // Phase-specific evaluations
    if (gamePhase === 'joban') {
      // JOBAN (Opening) priorities

      // Enhanced development evaluation
      const senteDev = this.evaluateDevelopmentEnhanced(SENTE);
      const goteDev = this.evaluateDevelopmentEnhanced(GOTE);
      score += senteDev - goteDev;

      // Reduced hanging piece penalties (50% reduction)
      const senteHanging = this.evaluateHangingPieces(SENTE) * 0.5;
      const goteHanging = this.evaluateHangingPieces(GOTE) * 0.5;
      score += senteHanging - goteHanging;

      // Reduced castle bonuses (50% reduction)
      const senteKakoi = evaluateAllKakoi(this, SENTE) * 0.5;
      const goteKakoi = evaluateAllKakoi(this, GOTE) * 0.5;
      score += senteKakoi - goteKakoi;

      // Normal king safety (but less important)
      const senteKingSafety = this.evaluateKingSafety(SENTE) * 0.7;
      const goteKingSafety = this.evaluateKingSafety(GOTE) * 0.7;
      score += senteKingSafety - goteKingSafety;

    } else if (gamePhase === 'chuban') {
      // CHUBAN (Middle game) priorities

      // Increased piece activity near enemy king
      const senteActivity = this.evaluatePieceActivity(SENTE) * 2;
      const goteActivity = this.evaluatePieceActivity(GOTE) * 2;
      score += senteActivity - goteActivity;

      // Normal hanging piece penalties
      const senteHanging = this.evaluateHangingPieces(SENTE);
      const goteHanging = this.evaluateHangingPieces(GOTE);
      score += senteHanging - goteHanging;

      // Increased king safety differential
      const senteKingSafety = this.evaluateKingSafety(SENTE) * 1.5;
      const goteKingSafety = this.evaluateKingSafety(GOTE) * 1.5;
      score += senteKingSafety - goteKingSafety;

      // Normal castle evaluation
      const senteKakoi = evaluateAllKakoi(this, SENTE);
      const goteKakoi = evaluateAllKakoi(this, GOTE);
      score += senteKakoi - goteKakoi;

      // Pawn structure
      const sentePawnStructure = this.evaluatePawnStructure(SENTE);
      const gotePawnStructure = this.evaluatePawnStructure(GOTE);
      score += sentePawnStructure - gotePawnStructure;

    } else {
      // SHUBAN (Endgame) priorities

      // MASSIVE bonuses for attacking king (3x-5x)
      const senteKingAttack = this.evaluateKingProximityAttack(SENTE) * 4;
      const goteKingAttack = this.evaluateKingProximityAttack(GOTE) * 4;
      score += senteKingAttack - goteKingAttack;

      // Greatly reduced defensive bonuses
      const senteKingSafety = this.evaluateKingSafety(SENTE) * 0.2;
      const goteKingSafety = this.evaluateKingSafety(GOTE) * 0.2;
      score += senteKingSafety - goteKingSafety;

      // Minimal hanging piece penalties (aggressive play prioritized)
      const senteHanging = this.evaluateHangingPieces(SENTE) * 0.3;
      const goteHanging = this.evaluateHangingPieces(GOTE) * 0.3;
      score += senteHanging - goteHanging;

      // Minimal castle importance
      const senteKakoi = evaluateAllKakoi(this, SENTE) * 0.2;
      const goteKakoi = evaluateAllKakoi(this, GOTE) * 0.2;
      score += senteKakoi - goteKakoi;
    }

    // Promotion threats remain important in all phases
    const sentePromotionThreat = this.evaluatePromotionThreats(SENTE);
    const gotePromotionThreat = this.evaluatePromotionThreats(GOTE);
    score += sentePromotionThreat - gotePromotionThreat;

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
