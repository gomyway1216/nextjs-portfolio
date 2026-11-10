/**
 * Riichi Mahjong — the discard guide.
 *
 * The pure half (`discardAdvice`, `unseenCounts`, `guideRows`) is checked on
 * hand-built positions whose answer can be counted by eye; the rendered half
 * is checked through static markup, the same way the rest of the UI is.
 */

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { legalActions } from '@/components/game/Mahjong/engine/actions';
import { shanten } from '@/components/game/Mahjong/engine/shanten';
import { parseKinds, tilesToCounts } from '@/components/game/Mahjong/engine/tiles';
import type { RoundState, Seat, TileKind } from '@/components/game/Mahjong/engine/types';
import { discardAdvice, unseenCounts } from '@/components/game/Mahjong/discardGuide';
import {
  GUIDE_ROW_LIMIT,
  guideRows,
  handShape,
  HandView,
} from '@/components/game/Mahjong/HandView';
import handStyles from '@/components/game/Mahjong/HandView.module.css';
import { getMahjongCopy } from '@/components/game/Mahjong/i18n';

import { buildRound } from './roundFixtures';

const HERO: Seat = 0;
const OPP_A = '456789p45678s11z';
const OPP_B = '2223334446667s';
const OPP_C = '1122334455667z';

const [P1, P8, P9] = parseKinds('189p');

/**
 * 123m 456m 789m 123p + 8p 9p, hero to discard. Cutting the 8p leaves a 9p
 * tanki and cutting the 9p an 8p tanki; every other discard breaks tenpai.
 */
function tankiRound(oppDiscards = '1m'): RoundState {
  return buildRound({
    dealer: 1,
    seats: [
      { hand: '123456789m123p89p', drawn: true },
      { hand: OPP_A, discards: oppDiscards },
      { hand: OPP_B },
      { hand: OPP_C },
    ],
    doraIndicators: '7z',
    turn: 0,
    phase: 'discard',
  });
}

/** Thirteen tiles, someone else's turn: there is no discard to advise on. */
function waitingRound(): RoundState {
  return buildRound({
    dealer: 0,
    seats: [
      { hand: '123456789m123p9p', discards: '9p' },
      { hand: '456789p456789s11z', drawn: true, discards: '9p' },
      { hand: OPP_B },
      { hand: OPP_C },
    ],
    doraIndicators: '7z',
    turn: 1,
    phase: 'discard',
  });
}

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

function renderHand(
  round: RoundState,
  options: { guide: boolean; interactive?: boolean; language?: 'en' | 'ja'; toggle?: boolean },
): string {
  return renderToStaticMarkup(
    <HandView
      state={round}
      seat={HERO}
      copy={getMahjongCopy(options.language ?? 'en')}
      actions={legalActions(round, HERO)}
      riichiArmed={false}
      onToggleRiichi={() => {}}
      onDiscard={() => {}}
      interactive={options.interactive ?? true}
      guideEnabled={options.guide}
      onToggleGuide={options.toggle === false ? undefined : () => {}}
    />,
  );
}

describe('discardAdvice', () => {
  it('counts the unseen winning tiles behind each tenpai discard', () => {
    const advice = discardAdvice(tankiRound(), HERO);
    const byKind = new Map(advice.map((entry) => [entry.kind, entry]));

    // The hero holds one 8p and one 9p, so three of each are still unseen.
    expect(byKind.get(P8)).toMatchObject({ shanten: 0, total: 3, best: true });
    expect(byKind.get(P8)?.accepts).toEqual([{ kind: P9, remaining: 3 }]);
    expect(byKind.get(P9)).toMatchObject({ shanten: 0, total: 3, best: true });
    expect(byKind.get(P9)?.accepts).toEqual([{ kind: P8, remaining: 3 }]);

    // Breaking a completed run gives up tenpai and is never "best".
    expect(byKind.get(P1)?.shanten).toBe(1);
    expect(byKind.get(P1)?.best).toBe(false);
  });

  it('lists one entry per distinct kind held, best first', () => {
    const round = tankiRound();
    const advice = discardAdvice(round, HERO);
    expect(advice).toHaveLength(14);
    expect(advice.slice(0, 2).map((entry) => entry.kind)).toEqual([P8, P9]);
    for (let i = 1; i < advice.length; i += 1) {
      const previous = advice[i - 1];
      const current = advice[i];
      expect(
        previous.shanten < current.shanten ||
          (previous.shanten === current.shanten && previous.total >= current.total),
      ).toBe(true);
    }
    expect(advice[0].shanten).toBe(handShape(round.players[HERO]).shanten);
  });

  it("discounts a wait that is already in someone's pond", () => {
    // A 9p on the table: the 9p tanki has two live tiles, the 8p tanki three.
    const advice = discardAdvice(tankiRound('9p'), HERO);
    const byKind = new Map(advice.map((entry) => [entry.kind, entry]));
    expect(byKind.get(P8)).toMatchObject({ total: 2, best: false });
    expect(byKind.get(P9)).toMatchObject({ total: 3, best: true });
    expect(advice[0].kind).toBe(P9);
  });

  it('agrees with a direct shanten recount of every accepted kind', () => {
    const round = tankiRound('9p');
    const hand = round.players[HERO].hand;
    for (const entry of discardAdvice(round, HERO)) {
      const counts = tilesToCounts(hand);
      counts[entry.kind] -= 1;
      expect(shanten(counts, 0)).toBe(entry.shanten);
      const accepted: TileKind[] = [];
      for (let kind = 0; kind < 34; kind += 1) {
        if (counts[kind] >= 4) continue;
        counts[kind] += 1;
        if (shanten(counts, 0) < entry.shanten) accepted.push(kind);
        counts[kind] -= 1;
      }
      expect(entry.accepts.map((accept) => accept.kind)).toEqual(accepted);
      expect(entry.total).toBe(
        entry.accepts.reduce((sum, accept) => sum + accept.remaining, 0),
      );
    }
  });

  it('judges "best" among the allowed discards only', () => {
    const advice = discardAdvice(tankiRound('9p'), HERO, new Set([P1, P8]));
    expect(advice.map((entry) => entry.kind)).toEqual([P8, P1]);
    expect(advice[0].best).toBe(true);
    expect(advice[1].best).toBe(false);
    expect(discardAdvice(tankiRound(), HERO, new Set())).toEqual([]);
  });

  it('has nothing to say about a hand that is not holding an extra tile', () => {
    expect(discardAdvice(waitingRound(), HERO)).toEqual([]);
  });
});

describe('unseenCounts', () => {
  it('subtracts the hand, the ponds and the dora indicators', () => {
    const round = waitingRound();
    const [z7] = parseKinds('7z');
    // 9p: one in hand, one in the hero's pond, one in an opponent's pond.
    // 7z: only the dora indicator is face up (the 7z in a hand is hidden).
    expect(unseenCounts(round, HERO, [P9, P8, z7])).toEqual([
      { kind: P9, remaining: 1 },
      { kind: P8, remaining: 4 },
      { kind: z7, remaining: 3 },
    ]);
  });
});

describe('guideRows', () => {
  it('keeps only the discards that hold the best shanten', () => {
    const rows = guideRows(discardAdvice(tankiRound(), HERO));
    expect(rows.map((row) => row.kind)).toEqual([P8, P9]);
  });

  it('caps the list', () => {
    const entry = { shanten: 2, total: 10, accepts: [], best: true };
    const rows = guideRows([0, 1, 2, 3, 4].map((kind) => ({ ...entry, kind })));
    expect(rows).toHaveLength(GUIDE_ROW_LIMIT);
    expect(guideRows([])).toEqual([]);
  });
});

describe('guide rendering', () => {
  it('stays out of the way when switched off', () => {
    const html = renderHand(tankiRound(), { guide: false });
    expect(countClass(html, handStyles.guideChip)).toBe(0);
    expect(countClass(html, handStyles.guide)).toBe(0);
    expect(html).toContain('aria-pressed="false"');
  });

  it('hides the switch when no handler is supplied', () => {
    const html = renderHand(tankiRound(), { guide: false, toggle: false });
    expect(countClass(html, handStyles.guideToggle)).toBe(0);
  });

  it('numbers the discards that keep tenpai and lists them', () => {
    const copy = getMahjongCopy('en');
    const html = renderHand(tankiRound('9p'), { guide: true });
    // A slot under every tile, so the row height does not depend on the turn.
    expect(countClass(html, handStyles.guideChip)).toBe(14);
    expect(html.match(/data-best="true"[^>]*>3</g)).toHaveLength(1);
    expect(html).toContain(copy.guideTileKeeps('9 of circles', 3, true));
    expect(html).toContain(copy.guideTileKeeps('8 of circles', 2, false));
    expect(html).toContain(copy.guideTileSetsBack('1 of circles'));
    expect(countClass(html, handStyles.guideRow)).toBe(2);
    expect(html).toContain(copy.guideHeading(copy.tenpai));
    expect(html).toContain(copy.guideSummary(3, 1));
    expect(html).toContain(copy.guideNote);
    expect(html).toContain('aria-pressed="true"');
  });

  it('renders in Japanese too', () => {
    const copy = getMahjongCopy('ja');
    const html = renderHand(tankiRound('9p'), { guide: true, language: 'ja' });
    expect(html).toContain(copy.guideNote);
    expect(html).toContain(copy.guideSummary(3, 1));
  });

  it('shows only the idle line when there is no discard to choose', () => {
    const copy = getMahjongCopy('en');
    const html = renderHand(waitingRound(), { guide: true, interactive: false });
    expect(countClass(html, handStyles.guideChip)).toBe(13);
    expect(countClass(html, handStyles.guideRow)).toBe(0);
    expect(html).toContain(copy.guideIdle);
    expect(html).not.toContain(copy.guideNote);
  });

  it('shows how many copies of each wait are still unseen', () => {
    // 9p tanki with one 9p in hand and two on the table: one left.
    const html = renderHand(waitingRound(), { guide: false, interactive: false });
    expect(countClass(html, handStyles.countedTile)).toBe(1);
    expect(html).toContain('×1');
  });
});
