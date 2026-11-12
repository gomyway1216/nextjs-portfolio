/**
 * Riichi Mahjong — the wait list of a hand in riichi, and the tiles' names in Japanese.
 */

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { legalActions } from '@/components/game/Mahjong/engine/actions';
import { waits as waitsOf } from '@/components/game/Mahjong/engine/shanten';
import { kindOf, parseKinds, tilesToCounts } from '@/components/game/Mahjong/engine/tiles';
import type { RoundState, Seat } from '@/components/game/Mahjong/engine/types';
import { handShape, HandView } from '@/components/game/Mahjong/HandView';
import handStyles from '@/components/game/Mahjong/HandView.module.css';
import { getMahjongCopy } from '@/components/game/Mahjong/i18n';
import { faceDownLabel, FACE_DOWN_LABEL, tileLabel } from '@/components/game/Mahjong/TileSvg';

import { buildRound } from './roundFixtures';

const HERO: Seat = 0;
const OPP_A = '456789p45678s11z';
const OPP_B = '2223334446667s';
const OPP_C = '1122334455667z';

const [P7, P8, P9] = parseKinds('789p');
const [M5] = parseKinds('5m');
const [Z1, Z5] = parseKinds('15z');

/**
 * 345m 678m 999m 79p 88s in riichi, waiting on the 8p alone, having just drawn
 * a third 8s. Without riichi the 8s would open two other tenpai (cut the 7p to
 * wait on the 9p, or the 9p to wait on the 7p), but riichi only lets the drawn
 * tile go, so neither of those is a wait.
 */
function riichiRound(riichi: boolean): RoundState {
  return buildRound({
    seats: [
      { hand: '345678999m79p888s', drawn: true, riichi, discards: '2z' },
      { hand: OPP_A, discards: '3m' },
      { hand: OPP_B, discards: '4m' },
      { hand: OPP_C, discards: '5m' },
    ],
    turn: HERO,
    phase: 'discard',
  });
}

describe('handShape in riichi', () => {
  it('lists only the waits of the hand without the drawn tile', () => {
    const round = riichiRound(true);
    const player = round.players[HERO];
    const shape = handShape(player);
    expect(shape.shanten).toBe(0);
    expect(shape.waits).toEqual([P8]);

    // Exactly the engine's waits for the thirteen tiles the player is left with.
    const kept = player.hand.filter((tile) => tile !== player.drawn);
    expect(shape.waits).toEqual(waitsOf(tilesToCounts(kept), player.melds.length));
    // And the engine does only allow the drawn tile to be discarded.
    const discards = legalActions(round, HERO).filter((action) => action.type === 'discard');
    expect(discards.map((action) => kindOf(action.tile))).toEqual([kindOf(player.drawn!)]);
  });

  it('still shows what each discard could wait on before riichi is declared', () => {
    const shape = handShape(riichiRound(false).players[HERO]);
    expect(shape.shanten).toBe(0);
    expect(shape.waits).toEqual([P7, P8, P9]);
  });

  it('draws only the real wait in the hand panel', () => {
    const round = riichiRound(true);
    const html = renderToStaticMarkup(
      <HandView
        state={round}
        seat={HERO}
        copy={getMahjongCopy('en')}
        actions={legalActions(round, HERO)}
        riichiArmed={false}
        onToggleRiichi={() => {}}
        onDiscard={() => {}}
        interactive
      />,
    );
    const from = html.indexOf(handStyles.waitTiles);
    const to = html.indexOf(handStyles.handRow);
    expect(from).toBeGreaterThan(-1);
    expect(to).toBeGreaterThan(from);
    const waitsHtml = html.slice(from, to);
    const shown = [...waitsHtml.matchAll(/data-tile-kind="(\d+)"/g)].map((match) => Number(match[1]));
    expect(shown.length).toBeGreaterThan(0);
    expect(new Set(shown)).toEqual(new Set([P8]));
  });
});

describe('tileLabel', () => {
  it('names the tiles in Japanese', () => {
    expect(tileLabel(M5, false, 'ja')).toBe('五萬');
    expect(tileLabel(M5, true, 'ja')).toBe('赤五萬');
    expect(tileLabel(P7, false, 'ja')).toBe('七筒');
    expect(tileLabel(parseKinds('1s')[0], false, 'ja')).toBe('一索');
    expect(tileLabel(Z1, false, 'ja')).toBe('東');
    expect(tileLabel(Z5, false, 'ja')).toBe('白');
    expect(faceDownLabel('ja')).toBe('伏せ牌');
  });

  it('has no English left in any Japanese tile name', () => {
    for (let kind = 0; kind < 34; kind++) {
      expect(tileLabel(kind, false, 'ja'), String(kind)).not.toMatch(/[A-Za-z]/);
    }
  });

  it('keeps the English names as the default', () => {
    expect(tileLabel(M5)).toBe('5 of characters');
    expect(tileLabel(M5, true, 'en')).toBe('5 of characters (red)');
    expect(faceDownLabel()).toBe(FACE_DOWN_LABEL);
  });
});
