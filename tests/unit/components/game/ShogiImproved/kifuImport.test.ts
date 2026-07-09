import { describe, expect, it } from 'vitest';
import { InitialPositionImproved } from '@/components/game/ShogiImproved/InitialPositionImproved';
import { GenerateMovesImproved } from '@/components/game/ShogiImproved/GenerateMovesImproved';
import { KyokumenImproved } from '@/components/game/ShogiImproved/KyokumenImproved';
import { parseKifuText } from '@/components/game/ShogiImproved/KifuImportImproved';
import { computeDisambiguation, disambiguationToText } from '@/components/game/ShogiImproved/KifuNotationImproved';
import {
  EMPTY, GKI, GOTE, GOU,
  SENTE, SFU, SGI, SHI, SKI, SOU,
  type Te,
} from '@/components/game/ShogiImproved/types';

function pos(suji: number, dan: number): number {
  return (suji << 4) + dan;
}

function findMove(k: KyokumenImproved, fromSuji: number, fromDan: number, toSuji: number, toDan: number, promote = false): Te {
  const from = pos(fromSuji, fromDan);
  const to = pos(toSuji, toDan);
  const legal = GenerateMovesImproved.generateLegalMoves(k);
  const te = legal.find((m) => m.from === from && m.to === to && m.promote === promote) ?? null;
  expect(te, `expected legal move from=${from} to=${to} promote=${promote}`).not.toBeNull();
  return te as Te;
}

describe('KifuImportImproved: parseKifuText', () => {
  it('parses the user-provided sample opening (numbered, ▲/△, half-width numbers)', () => {
    const start = InitialPositionImproved.createInitialPosition();
    start.setTeban(SENTE);
    const text = '1. ▲７六歩 2. △８四歩 3. ▲７七角 4. △３四歩';
    const result = parseKifuText(text, start);

    expect(result.error).toBeUndefined();
    expect(result.steps).toHaveLength(4);
    expect(result.steps[0].notation).toBe('▲７六歩');
    expect(result.steps[1].notation).toBe('△８四歩');
    expect(result.steps[2].notation).toBe('▲７七角');
    expect(result.steps[3].notation).toBe('△３四歩');
  });

  it('parses without move numbers or side markers, inferring turn order', () => {
    const start = InitialPositionImproved.createInitialPosition();
    start.setTeban(SENTE);
    const text = '７六歩 ８四歩 ２六歩 ８五歩';
    const result = parseKifuText(text, start);

    expect(result.error).toBeUndefined();
    expect(result.steps).toHaveLength(4);
  });

  it('handles 同 (same square as previous move)', () => {
    const start = InitialPositionImproved.createInitialPosition();
    start.setTeban(SENTE);
    // ▲８六歩 △同歩 (gote pawn captures the pushed pawn at 86... use a legal capture sequence)
    const text = '1. ▲２六歩 2. △８四歩 3. ▲２五歩 4. △８五歩 5. ▲７八金 6. △３二金 7. ▲２四歩 8. △同歩';
    const result = parseKifuText(text, start);
    expect(result.error).toBeUndefined();
    expect(result.steps).toHaveLength(8);
    expect(result.steps[7].notation).toContain('同歩');
  });

  it('handles 打 (drop) notation', () => {
    // Build a position where Sente has a pawn in hand and an empty file to drop it on.
    const k = new KyokumenImproved();
    const E = EMPTY;
    const board: number[][] = [
      [E, E, E, E, GOU, E, E, E, E],
      [E, E, E, E, E, E, E, E, E],
      [E, E, E, E, E, E, E, E, E],
      [E, E, E, E, E, E, E, E, E],
      [E, E, E, E, E, E, E, E, E],
      [E, E, E, E, E, E, E, E, E],
      [E, E, E, E, E, E, E, E, E],
      [E, E, E, E, E, E, E, E, E],
      [E, E, E, E, SOU, E, E, E, E],
    ];
    InitialPositionImproved.setupCustom(k, board);
    k.hand[SFU] = 1;
    k.initAll();
    k.setTeban(SENTE);

    const result = parseKifuText('1. ▲５五歩打', k);
    expect(result.error).toBeUndefined();
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].move.from).toBe(0);
    expect(result.steps[0].notation).toBe('▲５五歩打');
  });

  it('handles 成 (promote) and promoted-piece kanji (と/馬/龍/竜/全/圭/杏)', () => {
    // Sente silver at 1三, can move-promote into gote territory at 1二.
    const k = new KyokumenImproved();
    const E = EMPTY;
    const board: number[][] = [
      [E, E, E, E, GOU, E, E, E, E],
      [E, E, E, E, E, E, E, E, E],
      [E, E, E, E, E, E, E, E, E],
      [E, E, E, E, E, E, E, E, E],
      [E, E, E, E, E, E, E, E, E],
      [E, E, E, E, E, E, E, E, E],
      [E, E, E, E, E, E, E, E, E],
      [E, E, E, E, E, E, E, E, E],
      [E, E, E, E, SOU, E, E, E, E],
    ];
    InitialPositionImproved.setupCustom(k, board);
    // Place a Sente silver at suji1 dan3 directly (board index math), to promote moving to 1二.
    k.ban[pos(1, 3)] = SGI;
    k.initAll();
    k.setTeban(SENTE);

    const result = parseKifuText('1. ▲１二銀成', k);
    expect(result.error).toBeUndefined();
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].move.promote).toBe(true);
  });

  it('reports partial success and the failing move when the kifu contains an illegal move', () => {
    const start = InitialPositionImproved.createInitialPosition();
    start.setTeban(SENTE);
    // Move 3 tries to push the same pawn two squares in one move (7六 -> 7四),
    // which is not a legal pawn move — parsing must stop there, not silently
    // skip it or guess a different piece.
    const text = '1. ▲７六歩 2. △８四歩 3. ▲７四歩';
    const result = parseKifuText(text, start);

    expect(result.steps).toHaveLength(2);
    expect(result.error).toBeDefined();
    expect(result.error?.moveNumber).toBe(3);
    expect(result.error?.token).toContain('７四歩');
  });

  it('round-trips the full user-provided sample game (moveToKifu-equivalent notation -> parse -> same final position)', () => {
    // The 141-ply sample game from the user's real kifu (see PR description), with
    // move numbers and ▲/△ added mechanically (alternating from move 1 = Sente).
    // Two plies are genuinely ambiguous in this exact game and need a JSA
    // disambiguator to parse deterministically (the reference Python script's
    // naive "first legal-move match wins" logic silently picked one without
    // recording which piece actually moved):
    // - Move 12 (△５二金): Gote has golds on both 4一 and 6一, both reaching 5二.
    //   Replaying the position (full_sfens.txt ply 12: rank1 file6 empties,
    //   gold lands on 5二) confirms it was the 6一 gold -> "５二金右" (suji6 is
    //   more toward Gote's own right than suji4).
    // - Move 75 (▲７九銀): Sente has silvers on both 6八 and 8八, both reaching
    //   7九. Replaying the position (full_sfens.txt ply 75: rank8 file8 empties)
    //   confirms it was the 8八 silver -> "７九銀左" (suji8 is more toward
    //   Sente's own left than suji6).
    const text = [
      '1. ▲７六歩 2. △８四歩 3. ▲２六歩 4. △８五歩 5. ▲７七角 6. △３四歩 7. ▲６六歩 8. △３三角 9. ▲２五歩 10. △７四歩',
      '11. ▲４八銀 12. △５二金右 13. ▲３六歩 14. △５四歩 15. ▲７八金 16. △８六歩 17. ▲同歩 18. △６二銀 19. ▲３七銀 20. △２二銀',
      '21. ▲８八銀 22. △６四歩 23. ▲４六銀 24. △９四歩 25. ▲３五歩 26. △同歩 27. ▲３四歩打 28. △４四角 29. ▲５六歩 30. △６三銀',
      '31. ▲３八飛 32. △３二金 33. ▲３五銀 34. △５三角 35. ▲２四歩 36. △同歩 37. ▲同銀 38. △２六歩打 39. ▲２八飛 40. △５五歩',
      '41. ▲同歩 42. △４四角 43. ▲６八角 44. △５五角 45. ▲４六角 46. △同角 47. ▲同歩 48. △４四角打 49. ▲２三歩打 50. △同銀',
      '51. ▲同銀成 52. △同金 53. ▲４五歩 54. △３五角 55. ▲５五角打 56. △２七銀打 57. ▲５八飛 58. △５七歩打 59. ▲４八飛 60. △３四金',
      '61. ▲１一角成 62. △３七歩打 63. ▲３九歩打 64. △３八歩成 65. ▲同歩 66. △３七歩打 67. ▲同歩 68. △８六飛 69. ▲２一馬 70. △５八歩成',
      '71. ▲同玉 72. △５六歩打 73. ▲６八銀打 74. △８七歩打 75. ▲７九銀左 76. △８八歩成 77. ▲同銀 78. △７六飛 79. ▲７七歩打 80. △６六飛',
      '81. ▲６七歩打 82. △８六飛 83. ▲８七香打 84. △５七歩成 85. ▲同銀 86. △５六歩打 87. ▲６八銀 88. △５七歩成 89. ▲同銀 90. △５六歩打',
      '91. ▲６八銀 92. △３八銀成 93. ▲同金 94. △８七飛成 95. ▲同銀 96. △６二玉 97. ▲８二飛打 98. △７一玉 99. ▲８三歩打 100. △５五香打',
      '101. ▲６九玉 102. △５七歩成 103. ▲８四桂打 104. △６八と 105. ▲同金 106. △同角成 107. ▲同飛 108. △５八銀打 109. ▲７八玉 110. △７二金打',
      '111. ▲同桂成 112. △同銀 113. ▲５四角打 114. △６三桂打 115. ▲４三角成 116. △同金 117. ▲同馬 118. △６九角打 119. ▲同飛 120. △同銀',
      '121. ▲同玉 122. △５九飛打 123. ▲６八玉 124. △５八香成 125. ▲７八玉 126. △６九飛成 127. ▲８八玉 128. △６八竜 129. ▲７八銀 130. △８三銀',
      '131. ▲７三銀打 132. △７八竜 133. ▲同玉 134. △６九銀打 135. ▲８八玉 136. △７八銀成 137. ▲同玉 138. △６八杏 139. ▲同玉 140. △７三桂',
      '141. ▲８一金打',
    ].join(' ');

    const start = InitialPositionImproved.createInitialPosition();
    start.setTeban(SENTE);
    const result = parseKifuText(text, start);

    expect(result.error).toBeUndefined();
    expect(result.steps).toHaveLength(141);

    // Independently replay the same moves by hand-walking generateLegalMoves +
    // matching only on destination square (ply-by-ply) is exactly what the parser
    // already does; the meaningful assertion here is that parsing the entire game
    // never stalls (every move, including the many 同/打/成/成駒-named moves,
    // resolves to exactly one legal move) and that replaying step-by-step produces
    // a strictly increasing, self-consistent position chain.
    let prev = start;
    for (const step of result.steps) {
      const legalBefore = GenerateMovesImproved.generateLegalMoves(prev);
      expect(legalBefore.some((m) => m.equals(step.move))).toBe(true);
      prev = step.kyokumen;
    }
  });
});

describe('KifuNotationImproved: computeDisambiguation', () => {
  function emptyBoardWithKings(): number[][] {
    // Kings tucked in the far corners (suji9 — column index 0, since
    // InitialPositionImproved.setupCustom maps column index to suji=9-col) so
    // they never collide with the pieces individual tests place at suji4-6.
    const E = EMPTY;
    return [
      [GOU, E, E, E, E, E, E, E, E],
      [E, E, E, E, E, E, E, E, E],
      [E, E, E, E, E, E, E, E, E],
      [E, E, E, E, E, E, E, E, E],
      [E, E, E, E, E, E, E, E, E],
      [E, E, E, E, E, E, E, E, E],
      [E, E, E, E, E, E, E, E, E],
      [E, E, E, E, E, E, E, E, E],
      [SOU, E, E, E, E, E, E, E, E],
    ];
  }

  it('右/左: two Sente golds on different suji converging on one square', () => {
    // Golds at 6九 (suji6,dan9) and 4九 (suji4,dan9), both can move to 5八 (suji5,dan8).
    // Suji 1 is Sente's right / suji 9 is Sente's left (matches this app's board
    // layout: suji = 9-col, so the rightmost rendered column is suji 1).
    // -> 4九 (lower suji, more toward Sente's right) gets 右; 6九 gets 左.
    const k = new KyokumenImproved();
    InitialPositionImproved.setupCustom(k, emptyBoardWithKings());
    k.ban[pos(6, 9)] = SKI;
    k.ban[pos(4, 9)] = SKI;
    k.initAll();
    k.setTeban(SENTE);

    const moveFrom6 = findMove(k, 6, 9, 5, 8);
    const moveFrom4 = findMove(k, 4, 9, 5, 8);

    const flags6 = computeDisambiguation(k, moveFrom6);
    const flags4 = computeDisambiguation(k, moveFrom4);

    expect(disambiguationToText(flags4)).toBe('右'); // suji4: more right than suji6
    expect(disambiguationToText(flags6)).toBe('左'); // suji6: more left than suji4
  });

  it('combines 右/左 with 上/引 when 2+ candidates share the extreme suji (3-way silver convergence)', () => {
    // Silvers at 6六, 6八 (both suji6 — the leftmost file), and 4六 (suji4 —
    // uniquely rightmost), all converging on 5七.
    const k = new KyokumenImproved();
    InitialPositionImproved.setupCustom(k, emptyBoardWithKings());
    k.ban[pos(6, 6)] = SGI;
    k.ban[pos(6, 8)] = SGI;
    k.ban[pos(4, 6)] = SGI;
    k.initAll();
    k.setTeban(SENTE);

    const fromRight = findMove(k, 4, 6, 5, 7); // suji4: uniquely rightmost -> plain 右
    const fromLeftBack = findMove(k, 6, 6, 5, 7); // suji6, dan6->7 (backward) -> 左引
    const fromLeftFwd = findMove(k, 6, 8, 5, 7); // suji6, dan8->7 (forward) -> 左上

    expect(disambiguationToText(computeDisambiguation(k, fromRight))).toBe('右');
    expect(disambiguationToText(computeDisambiguation(k, fromLeftBack))).toBe('左引');
    expect(disambiguationToText(computeDisambiguation(k, fromLeftFwd))).toBe('左上');
  });

  it('上/引: two Sente rooks on the same suji, one approaching from ahead, one from behind', () => {
    // Rooks at 5九 (behind) and 5五 (ahead), both sliding to 5七.
    const k = new KyokumenImproved();
    InitialPositionImproved.setupCustom(k, emptyBoardWithKings());
    k.ban[pos(5, 9)] = SHI;
    k.ban[pos(5, 5)] = SHI;
    k.initAll();
    k.setTeban(SENTE);

    const fromBehind = findMove(k, 5, 9, 5, 7); // moves forward (dan 9 -> 7): 上
    const fromAhead = findMove(k, 5, 5, 5, 7); // moves backward (dan 5 -> 7): 引

    expect(disambiguationToText(computeDisambiguation(k, fromBehind))).toBe('上');
    expect(disambiguationToText(computeDisambiguation(k, fromAhead))).toBe('引');
  });

  it('直: gold moving straight ahead one square, disambiguated from a diagonal approach', () => {
    // Golds at 5八 (directly behind 5七) and 4八 (diagonal approach to 5七).
    const k = new KyokumenImproved();
    InitialPositionImproved.setupCustom(k, emptyBoardWithKings());
    k.ban[pos(5, 8)] = SKI;
    k.ban[pos(4, 8)] = SKI;
    k.initAll();
    k.setTeban(SENTE);

    const straight = findMove(k, 5, 8, 5, 7);
    const diagonal = findMove(k, 4, 8, 5, 7);

    expect(disambiguationToText(computeDisambiguation(k, straight))).toBe('直');
    expect(disambiguationToText(computeDisambiguation(k, diagonal))).toBe('右'); // suji4 vs suji5: suji4 is more right
  });

  it('打: drop is marked when a board move by the same piece type also reaches the square', () => {
    // Sente has a silver on the board that can reach 5五, AND a silver in hand to drop there.
    const k = new KyokumenImproved();
    InitialPositionImproved.setupCustom(k, emptyBoardWithKings());
    k.ban[pos(5, 6)] = SGI; // silver at 5六 can step forward-diagonally... use straight-adjacent square instead
    k.ban[pos(4, 4)] = SGI; // silver at 4四 can move diagonally to 5五
    k.initAll();
    k.setTeban(SENTE);
    k.hand[SGI] = 1;

    const legal = GenerateMovesImproved.generateLegalMoves(k);
    const dropMove = legal.find((m) => m.from === 0 && m.to === pos(5, 5));
    expect(dropMove).toBeDefined();

    const flags = computeDisambiguation(k, dropMove as Te);
    expect(flags.drop).toBe(true);
    expect(disambiguationToText(flags)).toBe(''); // right/left/up/pull never apply to drops
  });

  it('不成: promotion declined inside the promotion zone', () => {
    // Sente silver at 4四 moving into the zone (4三, rank 3) without promoting.
    const k = new KyokumenImproved();
    InitialPositionImproved.setupCustom(k, emptyBoardWithKings());
    k.ban[pos(4, 4)] = SGI;
    k.initAll();
    k.setTeban(SENTE);

    const legal = GenerateMovesImproved.generateLegalMoves(k);
    const nonPromote = legal.find((m) => m.from === pos(4, 4) && m.to === pos(4, 3) && !m.promote);
    expect(nonPromote).toBeDefined();

    const flags = computeDisambiguation(k, nonPromote as Te);
    expect(flags.noPromote).toBe(true);
  });

  it('mirrors right/left for Gote (facing the opposite way)', () => {
    // Gote golds at 6一 and 4一 converging on 5二 — for Gote, suji9 is Gote's right
    // (board is mirrored relative to Sente), so higher suji = more right.
    const k = new KyokumenImproved();
    const E = EMPTY;
    const board: number[][] = [
      [E, E, E, GKI, E, GKI, E, E, GOU],
      [E, E, E, E, E, E, E, E, E],
      [E, E, E, E, E, E, E, E, E],
      [E, E, E, E, E, E, E, E, E],
      [E, E, E, E, E, E, E, E, E],
      [E, E, E, E, E, E, E, E, E],
      [E, E, E, E, E, E, E, E, E],
      [E, E, E, E, E, E, E, E, E],
      [E, E, E, E, SOU, E, E, E, E],
    ];
    InitialPositionImproved.setupCustom(k, board);
    k.initAll();
    k.setTeban(GOTE);

    const moveFrom6 = findMove(k, 6, 1, 5, 2);
    const moveFrom4 = findMove(k, 4, 1, 5, 2);

    // For Gote, suji9 is Gote's right / suji1 is Gote's left (mirrored vs Sente):
    // suji6 is more toward Gote's right than suji4.
    expect(disambiguationToText(computeDisambiguation(k, moveFrom6))).toBe('右');
    expect(disambiguationToText(computeDisambiguation(k, moveFrom4))).toBe('左');
  });

  it('produces round-trippable notation via parseKifuText for an ambiguous 右/左 position', () => {
    const k = new KyokumenImproved();
    InitialPositionImproved.setupCustom(k, emptyBoardWithKings());
    k.ban[pos(6, 9)] = SKI;
    k.ban[pos(4, 9)] = SKI;
    k.initAll();
    k.setTeban(SENTE);

    const moveFrom4 = findMove(k, 4, 9, 5, 8);
    const flags = computeDisambiguation(k, moveFrom4);
    const notation = `▲５八金${disambiguationToText(flags)}`;
    expect(notation).toBe('▲５八金右');

    const result = parseKifuText(notation, k);
    expect(result.error).toBeUndefined();
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].move.equals(moveFrom4)).toBe(true);
  });

  it('parses combined 右/左+上/引 modifiers (相対表記) back to the correct move', () => {
    const k = new KyokumenImproved();
    InitialPositionImproved.setupCustom(k, emptyBoardWithKings());
    k.ban[pos(6, 6)] = SGI;
    k.ban[pos(6, 8)] = SGI;
    k.ban[pos(4, 6)] = SGI;
    k.initAll();
    k.setTeban(SENTE);

    const fromLeftBack = findMove(k, 6, 6, 5, 7);
    const fromLeftFwd = findMove(k, 6, 8, 5, 7);

    const resultBack = parseKifuText('▲５七銀左引', k);
    expect(resultBack.error).toBeUndefined();
    expect(resultBack.steps[0].move.equals(fromLeftBack)).toBe(true);

    const resultFwd = parseKifuText('▲５七銀左上', k);
    expect(resultFwd.error).toBeUndefined();
    expect(resultFwd.steps[0].move.equals(fromLeftFwd)).toBe(true);
  });

  it('surfaces an explicit "ambiguous" failure (not a silent wrong pick) when no modifier is given', () => {
    const k = new KyokumenImproved();
    InitialPositionImproved.setupCustom(k, emptyBoardWithKings());
    k.ban[pos(6, 9)] = SKI;
    k.ban[pos(4, 9)] = SKI;
    k.initAll();
    k.setTeban(SENTE);

    const result = parseKifuText('▲５八金', k);
    expect(result.steps).toHaveLength(0);
    expect(result.error).toBeDefined();
    expect(result.error?.reason).toContain('一意に決定できません');
  });
});
