/**
 * Riichi Mahjong — UI tests (M6).
 *
 * The repo has no jsdom and no `@testing-library/react`, and this milestone may
 * not add dependencies, so these are `react-dom/server` render-to-string
 * assertions in the style of `tileSvg.test.tsx` next door. That covers exactly
 * what matters here: every one of these components is a pure function of its
 * props plus the engine state handed in, and all the decision-making the UI
 * does lives in exported helpers, which are tested directly.
 *
 * Class names come from the imported CSS modules rather than being hard-coded,
 * so the assertions survive both vitest's identity proxy and hashed production
 * names.
 */

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { legalActions } from '@/components/game/Mahjong/engine/actions';
import { applyAction, cloneRoundState } from '@/components/game/Mahjong/engine/gameState';
import { kindOf } from '@/components/game/Mahjong/engine/tiles';
import type { RoundState, Seat } from '@/components/game/Mahjong/engine/types';
import {
  CallPrompt,
  claimTiles,
  groupClaims,
} from '@/components/game/Mahjong/CallPrompt';
import {
  buildDiscardMap,
  canArmRiichi,
  discardGroupKey,
  handShape,
  HandView,
} from '@/components/game/Mahjong/HandView';
import handStyles from '@/components/game/Mahjong/HandView.module.css';
import { getMahjongCopy } from '@/components/game/Mahjong/i18n';
import {
  fallbackAiDriver,
  decisionKey,
  logEntriesFor,
  MahjongGame,
} from '@/components/game/Mahjong/MahjongGame';
import {
  doraHanOf,
  finalSeatLabel,
  formatDelta,
  ResultModal,
  seatLabel,
} from '@/components/game/Mahjong/ResultModal';
import resultStyles from '@/components/game/Mahjong/ResultModal.module.css';
import {
  chunkPond,
  meldTileViews,
  relativeSeat,
  seatOnSide,
  TableView,
} from '@/components/game/Mahjong/TableView';
import tableStyles from '@/components/game/Mahjong/TableView.module.css';
import tileStyles from '@/components/game/Mahjong/TileSvg.module.css';

import { buildGame, buildRound } from './roundFixtures';

const copy = getMahjongCopy('en');
const HERO: Seat = 0;

/** Count elements whose class attribute contains `className`. */
function countClass(html: string, className: string): number {
  const re = /class="([^"]*)"/g;
  let count = 0;
  let match = re.exec(html);
  while (match !== null) {
    if (match[1].split(/\s+/).includes(className)) count += 1;
    match = re.exec(html);
  }
  return count;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/*
 * Filler hands for the seats a test is not interested in. They are spelled out
 * rather than generated so the whole table stays tile-legal: `buildRound`
 * hands out real, distinct tile ids and refuses to deal a fifth copy of a
 * kind, which is the invariant keeping these fixtures honest.
 */
const OPP_A_13 = '456789p45678s11z';
const OPP_A_14 = '456789p456789s11z';
// No triplet of fives anywhere: the fixture pool keeps the red copy in
// reserve, so only three ordinary 5m/5p/5s exist.
const OPP_B = '2223334446667s';
const OPP_C = '1122334455667z';

/** Mid-hand: seat 1 holds a draw, so the hero is sitting on thirteen tiles. */
function midRound(): RoundState {
  return buildRound({
    dealer: 0,
    roundWind: 0,
    honba: 1,
    riichiSticks: 2,
    seats: [
      { hand: '123456789m123p1s', discards: '99p' },
      { hand: OPP_A_14, drawn: true, discards: '1m' },
      { hand: OPP_B, discards: '2m' },
      { hand: OPP_C, discards: '3m' },
    ],
    doraIndicators: '7z',
    turn: 1,
    phase: 'discard',
  });
}

/** A 3m on the table from the hero's kamicha: pon and three different chi. */
function callRound(): RoundState {
  return buildRound({
    dealer: 0,
    seats: [
      { hand: '123345m1199p119s' },
      { hand: OPP_A_13 },
      { hand: OPP_B },
      { hand: OPP_C, discards: '3m' },
    ],
    pending: { seat: 3 },
  });
}

/** Hero in riichi holding a completed hand — tsumo is on offer. */
function tsumoRound(): RoundState {
  return buildRound({
    dealer: 1,
    seats: [
      // 11m 234m 567m 234p 567p, drawn on the 7p — a complete pinfu hand.
      { hand: '11m234m567m234p567p', drawn: true, riichi: true, discards: '9p' },
      { hand: OPP_A_13, discards: '3m' },
      { hand: OPP_B, discards: '4m' },
      { hand: OPP_C, discards: '5m' },
    ],
    doraIndicators: '7z',
    turn: 0,
    phase: 'discard',
  });
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

describe('seat-relative positioning', () => {
  it('puts the hero at the bottom and reads turn order clockwise', () => {
    expect(relativeSeat(0, 0)).toBe('self');
    expect(relativeSeat(1, 0)).toBe('right');
    expect(relativeSeat(2, 0)).toBe('across');
    expect(relativeSeat(3, 0)).toBe('left');
  });

  it('works for any hero seat, wrapping the other way round', () => {
    expect(relativeSeat(0, 2)).toBe('across');
    expect(relativeSeat(1, 2)).toBe('left');
    expect(relativeSeat(2, 2)).toBe('self');
    expect(relativeSeat(3, 2)).toBe('right');
  });

  it('round-trips with seatOnSide', () => {
    for (const hero of [0, 1, 2, 3] as Seat[]) {
      for (const seat of [0, 1, 2, 3] as Seat[]) {
        expect(seatOnSide(relativeSeat(seat, hero), hero)).toBe(seat);
      }
    }
  });
});

describe('chunkPond', () => {
  it('lays the pond out six to a row and leaves the last row short', () => {
    const pond = Array.from({ length: 14 }, (_, i) => i);
    const rows = chunkPond(pond, 6);
    expect(rows.map((row) => row.length)).toEqual([6, 6, 2]);
    expect(rows.flat()).toEqual(pond);
  });

  it('returns no rows at all for an empty pond', () => {
    expect(chunkPond([], 6)).toEqual([]);
  });

  it('refuses a nonsensical row width', () => {
    expect(() => chunkPond([1, 2], 0)).toThrow();
  });
});

describe('meldTileViews', () => {
  it('lays the called tile sideways', () => {
    const round = buildRound({
      seats: [
        { hand: '123456789m2p', melds: [{ type: 'pon', tiles: '111p', calledIndex: 0, from: 3 }] },
        { hand: OPP_A_13 },
        { hand: OPP_B },
        { hand: '223344556677z' },
      ],
    });
    const views = meldTileViews(round.players[0].melds[0]);
    expect(views.filter((view) => view.rotated)).toHaveLength(1);
    expect(views.every((view) => !view.faceDown)).toBe(true);
  });

  it('hides the outer tiles of a closed kan', () => {
    const round = buildRound({
      seats: [
        { hand: '123456789m2p', melds: [{ type: 'ankan', tiles: '1111p' }] },
        { hand: OPP_A_13 },
        { hand: OPP_B },
        { hand: '223344556677z' },
      ],
    });
    const views = meldTileViews(round.players[0].melds[0]);
    expect(views.map((view) => view.faceDown)).toEqual([true, false, false, true]);
  });
});

describe('legal-discard derivation', () => {
  it('offers exactly the tiles legalActions offers, grouped by copy', () => {
    const round = midRound();
    const actions = legalActions(round, 1);
    const map = buildDiscardMap(actions, round.rules.redFives, false);
    const offered = actions.filter(
      (action) => action.type === 'discard' && action.riichi !== true,
    );
    expect(map.size).toBe(offered.length);
    for (const action of offered) {
      if (action.type !== 'discard') continue;
      expect(map.get(discardGroupKey(action.tile, round.rules.redFives))).toBe(action);
    }
  });

  it('locks a riichi hand to the drawn tile', () => {
    const round = tsumoRound();
    const actions = legalActions(round, HERO);
    const map = buildDiscardMap(actions, round.rules.redFives, false);
    const drawn = round.players[HERO].drawn;
    expect(drawn).not.toBeNull();
    expect(map.size).toBe(1);
    expect([...map.values()][0].tile).toBe(drawn);
  });

  it('separates the red five from its ordinary copies', () => {
    // Kind 4 is 5m; tile id 16 is its red copy (RED_FIVE_TILE_IDS).
    expect(discardGroupKey(16, true)).not.toBe(discardGroupKey(17, true));
    // With red fives switched off the two are interchangeable again.
    expect(discardGroupKey(16, false)).toBe(discardGroupKey(17, false));
  });

  it('offers only riichi-flagged discards once riichi is armed', () => {
    const round = buildRound({
      dealer: 1,
      seats: [
        { hand: '123456789m123p12s', drawn: true },
        { hand: OPP_A_13 },
        { hand: OPP_B },
        { hand: OPP_C },
      ],
      turn: 0,
      phase: 'discard',
    });
    const actions = legalActions(round, HERO);
    expect(canArmRiichi(actions)).toBe(true);

    const armed = buildDiscardMap(actions, round.rules.redFives, true);
    expect(armed.size).toBeGreaterThan(0);
    for (const action of armed.values()) expect(action.riichi).toBe(true);

    const plain = buildDiscardMap(actions, round.rules.redFives, false);
    for (const action of plain.values()) expect(action.riichi).not.toBe(true);
  });
});

describe('handShape', () => {
  it('reports tenpai and the waits for a thirteen-tile hand', () => {
    const round = buildRound({
      seats: [
        // 123m 456m 789m 123p, waiting to pair the lone 1s (tanki).
        { hand: '123456789m123p1s' },
        { hand: OPP_A_13 },
        { hand: OPP_B },
        { hand: OPP_C },
      ],
    });
    const shape = handShape(round.players[0]);
    expect(shape.shanten).toBe(0);
    expect(shape.waits).toContain(kindOf(round.players[0].hand[round.players[0].hand.length - 1]));
  });

  it('reads a fourteen-tile hand as the best it can do after a discard', () => {
    const round = buildRound({
      seats: [
        // 123m 456m 789m 123p plus a stray 1s/2s: one discard away from tenpai.
        { hand: '123456789m123p12s', drawn: true },
        { hand: OPP_A_13 },
        { hand: OPP_B },
        { hand: OPP_C },
      ],
      turn: 0,
      phase: 'discard',
    });
    const shape = handShape(round.players[HERO]);
    expect(shape.shanten).toBe(0);
    expect(shape.waits.length).toBeGreaterThan(0);
  });

  it('reports a fourteen-tile winning hand as complete', () => {
    expect(handShape(tsumoRound().players[HERO]).shanten).toBe(-1);
  });
});

describe('groupClaims', () => {
  it('drops plain discards and orders the claims consistently', () => {
    const round = callRound();
    const groups = groupClaims(legalActions(round, HERO));
    expect(groups.map((group) => group.type)).toEqual(['pon', 'chi', 'pass']);
    expect(groups.find((group) => group.type === 'chi')?.actions).toHaveLength(3);
  });

  it('names the tiles a claim would use', () => {
    const round = callRound();
    const chi = legalActions(round, HERO).find((action) => action.type === 'chi');
    expect(chi).toBeDefined();
    expect(claimTiles(chi!)).toHaveLength(2);
  });
});

describe('decisionKey', () => {
  it('separates the two seats deciding on the same discard', () => {
    const round = callRound();
    expect(decisionKey(round, 1, 0)).not.toBe(decisionKey(round, 1, 2));
  });

  it('ignores which seats have already answered', () => {
    const round = callRound();
    const before = decisionKey(round, 1, 0);
    round.pendingResponses.push(2);
    expect(decisionKey(round, 1, 0)).toBe(before);
  });

  it('changes when the hand is redealt', () => {
    const round = callRound();
    expect(decisionKey(round, 1, 0)).not.toBe(decisionKey(round, 2, 0));
  });
});

describe('fallbackAiDriver', () => {
  it('plays a legal discard on its own turn', () => {
    const round = midRound();
    const action = fallbackAiDriver(round, 1);
    expect(action.type).toBe('discard');
    expect(legalActions(round, 1)).toContainEqual(action);
  });

  it("passes on someone else's discard", () => {
    const round = callRound();
    expect(fallbackAiDriver(round, 2).type).toBe('pass');
  });
});

describe('logEntriesFor', () => {
  it('names the seat a call took its tile from', () => {
    const before = callRound();
    const pon = legalActions(before, HERO).find((action) => action.type === 'pon');
    expect(pon).toBeDefined();
    const after = applyAction(cloneRoundState(before), pon!);
    const entries = logEntriesFor(pon!, before, after);
    expect(entries[0]).toMatchObject({ kind: 'call', call: 'pon', seat: 0, from: 3 });
  });

  it('records the win once the hand ends', () => {
    const before = tsumoRound();
    const tsumo = legalActions(before, HERO).find((action) => action.type === 'tsumo');
    expect(tsumo).toBeDefined();
    const after = applyAction(cloneRoundState(before), tsumo!);
    expect(logEntriesFor(tsumo!, before, after)).toContainEqual({
      kind: 'win',
      seat: 0,
      how: 'tsumo',
    });
  });
});

describe('final standings seat labels', () => {
  const copy = getMahjongCopy('en');

  it('follows the rotated winds rather than the raw seat index', () => {
    // Second hand: the deal has moved to seat 1, so seat 1 is East and seat 0
    // -- the hero -- is North. Reading copy.winds[seat] directly would call
    // seat 2 "West" when it is in fact South.
    const game = { dealer: 1 as const } as Parameters<typeof finalSeatLabel>[0];
    expect(finalSeatLabel(game, 0, 0, copy)).toBe('You');
    expect(finalSeatLabel(game, 2, 0, copy)).toBe('South seat');
    expect(finalSeatLabel(game, 3, 0, copy)).toBe('West seat');
    expect(finalSeatLabel(game, 1, 0, copy)).toBe('East seat');
  });

  it('agrees with the raw index only while seat 0 still deals', () => {
    const game = { dealer: 0 as const } as Parameters<typeof finalSeatLabel>[0];
    expect(finalSeatLabel(game, 1, 0, copy)).toBe('South seat');
    expect(finalSeatLabel(game, 3, 0, copy)).toBe('North seat');
  });
});

describe('result formatting', () => {
  it('signs score deltas', () => {
    expect(formatDelta(8000)).toBe('+8,000');
    expect(formatDelta(-3900)).toBe('-3,900');
    expect(formatDelta(0)).toBe('±0');
  });

  it('reads the dora han back out of the hand value', () => {
    expect(
      doraHanOf({
        yaku: [{ id: 'riichi', han: 1, yakuman: 0 }],
        han: 4,
        fu: 40,
        yakuman: 0,
        limit: null,
        points: 5200,
        tsumoNonDealer: 0,
        tsumoDealer: 0,
      }),
    ).toBe(3);
  });

  it('reports no dora for a yakuman, whose han is a display figure', () => {
    expect(
      doraHanOf({
        yaku: [{ id: 'daisangen', han: 0, yakuman: 1 }],
        han: 13,
        fu: 50,
        yakuman: 1,
        limit: 'yakuman',
        points: 32000,
        tsumoNonDealer: 0,
        tsumoDealer: 0,
      }),
    ).toBe(0);
  });

  it('calls the hero "You" and the others by their seat wind', () => {
    const round = midRound();
    expect(seatLabel(round, 0, 0, copy)).toBe(copy.you);
    expect(seatLabel(round, 1, 0, copy)).toBe(copy.seatName('South'));
  });
});

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

describe('start screen', () => {
  it('offers exactly the three difficulties and a start button', () => {
    const html = renderToStaticMarkup(<MahjongGame />);
    for (const level of ['easy', 'medium', 'hard'] as const) {
      expect(html).toContain(copy.difficulties[level].label);
      expect(html).toContain(copy.difficulties[level].description);
    }
    expect(html).toContain(copy.start);
    expect(html).toContain(copy.title);
    // No table is dealt until the player starts.
    expect(countClass(html, tableStyles.table)).toBe(0);
  });
});

describe('table rendering', () => {
  const round = midRound();
  const html = renderToStaticMarkup(
    <TableView state={round} hero={HERO} copy={copy} handIndex={0} activeSeats={[1]} />,
  );

  it('shows the round, honba and riichi sticks', () => {
    expect(html).toContain(copy.roundLabel('East', 1));
    expect(html).toContain(`${copy.honbaLabel} 1`);
    expect(html).toContain(`${copy.sticksLabel} 2`);
  });

  it("shows every seat's score", () => {
    expect(countClass(html, tableStyles.seatScore)).toBe(4);
    expect(html).toContain('25,000');
  });

  it('marks the dealer', () => {
    expect(countClass(html, tableStyles.dealerBadge)).toBe(1);
  });

  it('shows the dora indicator face up', () => {
    const indicator = round.wall.doraIndicators[0];
    expect(round.wall.doraIndicators).toHaveLength(1);
    expect(html).toContain(copy.doraLabel);
    expect(html).toContain(`data-tile-kind="${kindOf(indicator)}"`);
  });

  it('shows only tile backs for the three opponents', () => {
    // 13 + 14 + 13 concealed tiles across the three AI seats.
    expect(countClass(html, tileStyles.faceDown)).toBe(40);
    // The hero's own concealed tiles are HandView's job, not the table's.
    expect(countClass(html, tableStyles.concealed)).toBe(3);
  });

  it('lays each pond out six to a row', () => {
    expect(countClass(html, tableStyles.pond)).toBe(4);
    expect(countClass(html, tableStyles.pondRow)).toBe(4);
  });
});

describe('hand rendering', () => {
  it('renders thirteen tappable tiles and no drawn tile for the hero', () => {
    const round = midRound();
    const html = renderToStaticMarkup(
      <HandView
        state={round}
        seat={HERO}
        copy={copy}
        actions={legalActions(round, HERO)}
        riichiArmed={false}
        onToggleRiichi={() => {}}
        onDiscard={() => {}}
        interactive={false}
      />,
    );
    expect(countClass(html, handStyles.tileButton)).toBe(13);
    expect(html).not.toContain('data-drawn="true"');
    // It is not the hero's turn, so nothing is playable.
    expect(html).not.toContain('data-playable="true"');
  });

  it('sets the drawn tile apart and only enables the legal discard', () => {
    const round = tsumoRound();
    const html = renderToStaticMarkup(
      <HandView
        state={round}
        seat={HERO}
        copy={copy}
        actions={legalActions(round, HERO)}
        riichiArmed={false}
        onToggleRiichi={() => {}}
        onDiscard={() => {}}
        interactive
      />,
    );
    expect(countClass(html, handStyles.tileButton)).toBe(14);
    expect(html).toContain('data-drawn="true"');
    // Riichi means tsumogiri only: exactly one tile responds.
    expect(html.match(/data-playable="true"/g)).toHaveLength(1);
    expect(html).toContain(copy.riichiLocked);
    expect(html).toContain(copy.complete);
  });
});

describe('call prompt', () => {
  it('renders one button per claim plus pass', () => {
    const round = callRound();
    const html = renderToStaticMarkup(
      <CallPrompt actions={legalActions(round, HERO)} copy={copy} onAct={() => {}} />,
    );
    expect(html).toContain(copy.actionPon);
    expect(html).toContain(copy.actionChi);
    expect(html).toContain(copy.actionPass);
    expect(html).not.toContain(copy.actionRon);
    // Three different chi are available, so that button expands rather than
    // choosing for the player.
    expect(html).toContain('×3');
    expect(html).toContain('aria-expanded="false"');
  });

  it('renders nothing when there is nothing to claim', () => {
    const round = midRound();
    expect(
      renderToStaticMarkup(
        <CallPrompt actions={legalActions(round, HERO)} copy={copy} onAct={() => {}} />,
      ),
    ).toBe('');
  });

  it("offers tsumo on the hero's own turn", () => {
    const round = tsumoRound();
    const html = renderToStaticMarkup(
      <CallPrompt actions={legalActions(round, HERO)} copy={copy} onAct={() => {}} />,
    );
    expect(html).toContain(copy.actionTsumo);
    expect(html).not.toContain(copy.actionPass);
  });
});

describe('result modal', () => {
  it("lists the yaku, the value and every seat's delta", () => {
    const round = tsumoRound();
    const tsumo = legalActions(round, HERO).find((action) => action.type === 'tsumo');
    expect(tsumo).toBeDefined();
    applyAction(round, tsumo!);
    const result = round.result;
    expect(result).not.toBeNull();

    const game = buildGame(round);
    const html = renderToStaticMarkup(
      <ResultModal
        open
        round={round}
        game={game}
        hero={HERO}
        copy={copy}
        onNext={() => {}}
        onPlayAgain={() => {}}
      />,
    );

    expect(html).toContain(copy.handResultTitle);
    expect(html).toContain(copy.tsumoBy(copy.you));

    const yaku = result!.agari[0].value.yaku;
    expect(yaku.length).toBeGreaterThan(0);
    for (const entry of yaku) expect(html).toContain(copy.yakuId(entry.id));
    expect(countClass(html, resultStyles.yakuRow)).toBeGreaterThanOrEqual(yaku.length);

    expect(html).toContain(`${result!.agari[0].value.fu} ${copy.fuLabel}`);
    expect(html).toContain(result!.agari[0].value.points.toLocaleString('en-US'));

    expect(countClass(html, resultStyles.deltaRow)).toBe(4);
    for (const seat of [0, 1, 2, 3] as Seat[]) {
      expect(html).toContain(formatDelta(result!.scoreDeltas[seat]));
    }
    expect(html).toContain(copy.nextHand);
  });

  it('shows who was tenpai on an exhaustive draw', () => {
    const round = buildRound({
      dealer: 0,
      seats: [
        { hand: '123456789m12345p', drawn: true },
        { hand: OPP_A_13 },
        { hand: OPP_B },
        { hand: OPP_C },
      ],
      liveRemaining: 0,
      turn: 0,
      phase: 'discard',
    });
    // The live wall is already empty, so this discard closes the hand.
    const discard = legalActions(round, HERO).find(
      (action) => action.type === 'discard' && action.riichi !== true,
    );
    expect(discard).toBeDefined();
    applyAction(round, discard!);
    expect(round.result?.draw).not.toBeNull();

    const html = renderToStaticMarkup(
      <ResultModal
        open
        round={round}
        game={buildGame(round)}
        hero={HERO}
        copy={copy}
        onNext={() => {}}
        onPlayAgain={() => {}}
      />,
    );
    expect(html).toContain(copy.drawReason.exhaustive);
    expect(html).toContain(copy.tenpaiSeats);
    expect(html).toContain(copy.notenSeats);
    expect(countClass(html, resultStyles.deltaRow)).toBe(4);
  });

  it('shows the final standings once the game is over', () => {
    const round = midRound();
    const game = buildGame(round, {
      finished: true,
      round: null,
      placements: [2, 0, 3, 1],
      scores: [30000, 12000, 41000, 17000],
    });
    const html = renderToStaticMarkup(
      <ResultModal
        open
        round={null}
        game={game}
        hero={HERO}
        copy={copy}
        onNext={() => {}}
        onPlayAgain={() => {}}
      />,
    );
    expect(html).toContain(copy.gameResultTitle);
    expect(html).toContain(copy.finalStandings);
    expect(html).toContain(copy.placeLabel(1));
    expect(html).toContain('41,000');
    expect(html).toContain(copy.playAgain);
    expect(countClass(html, resultStyles.standingRow)).toBe(4);
  });
});
