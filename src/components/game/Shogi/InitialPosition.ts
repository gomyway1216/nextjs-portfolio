/**
 * Initial Shogi Position Setup
 */

import { Kyokumen } from './Kyokumen';
import {
  EMPTY,
  SFU, SKY, SKE, SGI, SKI, SKA, SHI, SOU,
  GFU, GKY, GKE, GGI, GKI, GKA, GHI, GOU,
  SENTE
} from './types';

export function createInitialPosition(): Kyokumen {
  const k = new Kyokumen();

  // Clear board
  for (let suji = 0; suji < 11; suji++) {
    for (let dan = 0; dan < 11; dan++) {
      k.ban[suji][dan] = EMPTY;
    }
  }

  // Standard shogi starting position
  // Gote (opponent) - rows 1-3
  // Row 1 (furthest from player)
  k.ban[1][1] = GKY; // Lance
  k.ban[2][1] = GKE; // Knight
  k.ban[3][1] = GGI; // Silver
  k.ban[4][1] = GKI; // Gold
  k.ban[5][1] = GOU; // King
  k.ban[6][1] = GKI; // Gold
  k.ban[7][1] = GGI; // Silver
  k.ban[8][1] = GKE; // Knight
  k.ban[9][1] = GKY; // Lance

  // Row 2
  k.ban[8][2] = GHI; // Rook
  k.ban[2][2] = GKA; // Bishop

  // Row 3 - pawns
  for (let suji = 1; suji <= 9; suji++) {
    k.ban[suji][3] = GFU;
  }

  // Sente (player) - rows 7-9
  // Row 7 - pawns
  for (let suji = 1; suji <= 9; suji++) {
    k.ban[suji][7] = SFU;
  }

  // Row 8
  k.ban[8][8] = SKA; // Bishop
  k.ban[2][8] = SHI; // Rook

  // Row 9 (closest to player)
  k.ban[1][9] = SKY; // Lance
  k.ban[2][9] = SKE; // Knight
  k.ban[3][9] = SGI; // Silver
  k.ban[4][9] = SKI; // Gold
  k.ban[5][9] = SOU; // King
  k.ban[6][9] = SKI; // Gold
  k.ban[7][9] = SGI; // Silver
  k.ban[8][9] = SKE; // Knight
  k.ban[9][9] = SKY; // Lance

  // Set starting player
  k.teban = SENTE;

  // Empty captured pieces
  k.hand[0] = [];
  k.hand[1] = [];

  return k;
}
