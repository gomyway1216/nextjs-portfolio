import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  DERIVED_GAP,
  DERIVED_ROADS,
  derivedCells,
  derivedMarks,
  nextMarks,
  streakLengths,
  type DerivedMark,
} from '@/components/game/Baccarat/derivedRoads';
import { ROAD_ROWS, type RoadEntry, type Side } from '@/components/game/Baccarat/engine';
import { getStrings } from '@/components/game/Baccarat/i18n';
import { DerivedRoad, NextMarks, newestCol } from '@/components/game/Baccarat/Roads';

const e = (winner: RoadEntry['winner']): RoadEntry => ({ winner, playerPair: false, bankerPair: false, natural: false });
const seq = (s: string) => s.split('').map((c) => e(c === 'B' ? 'banker' : c === 'P' ? 'player' : 'tie'));
const marks = (s: string) => s.split('').map((c): DerivedMark => (c === 'r' ? 'red' : 'blue'));
const text = (list: readonly DerivedMark[]) => list.map((m) => m[0]).join('');

/**
 * The rule as a board keeper applies it, cell by cell on the big road drawn
 * without dragon tails: independent of the streak-length form the code uses.
 */
function byTheBoard(entries: readonly RoadEntry[], gap: number): DerivedMark[] {
  const filled = new Set<string>();
  const has = (col: number, row: number) => filled.has(`${col},${row}`);
  const depth = (col: number) => {
    let d = 0;
    while (has(col, d)) d++;
    return d;
  };
  const out: DerivedMark[] = [];
  let col = -1;
  let row = 0;
  let previous: Side | null = null;
  for (const { winner } of entries) {
    if (winner === 'tie') continue;
    if (winner === previous) row++;
    else {
      col++;
      row = 0;
    }
    previous = winner;
    filled.add(`${col},${row}`);
    const started = col > gap || (col === gap && row >= 1);
    if (!started) continue;
    if (row === 0) out.push(depth(col - 1) === depth(col - 1 - gap) ? 'red' : 'blue');
    else if (has(col - gap, row)) out.push('red');
    else out.push(has(col - gap, row - 1) ? 'blue' : 'red');
  }
  return out;
}

describe('derived roads', () => {
  it('reads the big road as streak lengths, leaving ties out', () => {
    expect(streakLengths(seq(''))).toEqual([]);
    expect(streakLengths(seq('TT'))).toEqual([]);
    expect(streakLengths(seq('TBBTBPTPPB'))).toEqual([3, 3, 1]);
  });

  it('starts each road at the second hand of its column, or the first hand of the next', () => {
    // One column is never enough; the big eye boy starts with the second hand of the second column.
    expect(derivedMarks(seq('BBBBBB'), 'bigEye')).toEqual([]);
    expect(derivedMarks(seq('BP'), 'bigEye')).toEqual([]);
    expect(text(derivedMarks(seq('BPP'), 'bigEye'))).toBe('b');
    // ...or, when that column stays one hand deep, with the first hand of the third.
    expect(text(derivedMarks(seq('BPB'), 'bigEye'))).toBe('r');
    expect(derivedMarks(seq('BPB'), 'small')).toEqual([]);
    expect(text(derivedMarks(seq('BPBB'), 'small'))).toBe('b');
    expect(text(derivedMarks(seq('BPBP'), 'small'))).toBe('r');
    expect(derivedMarks(seq('BPBP'), 'cockroach')).toEqual([]);
    expect(text(derivedMarks(seq('BPBPP'), 'cockroach'))).toBe('b');
  });

  it('marks a worked shoe the way the board does', () => {
    // Big road columns: B, PP, BBBB, P, B.
    const shoe = seq('BPPBBBBTPB');
    // PP: second P outruns the lone B (blue). BBBB: opens against 2 vs 1 (blue), level with PP (red), one past
    // it (blue), further past (red). P: opens against 4 vs 2 (blue). B: opens against 1 vs 4 (blue).
    expect(text(derivedMarks(shoe, 'bigEye'))).toBe('bbrbrbb');
    // Small road, two columns back. BBBB: second B outruns the lone first B (blue), then red, red. P: 4 vs 1
    // (blue). B: 1 vs 2 (blue).
    expect(text(derivedMarks(shoe, 'small'))).toBe('brrbb');
    // Cockroach pig, three back. P opens the fourth column: no mark yet. B: 1 vs 1 (red).
    expect(text(derivedMarks(shoe, 'cockroach'))).toBe('r');
  });

  it('colours a steady chop and a steady pair of twos red on every road', () => {
    for (const road of DERIVED_ROADS) {
      expect(new Set(derivedMarks(seq('BPBPBPBPBPBP'), road))).toEqual(new Set(['red']));
      expect(new Set(derivedMarks(seq('BBPPBBPPBBPPBBPP'), road))).toEqual(new Set(['red']));
    }
  });

  it('agrees with the cell-by-cell rule on random shoes', () => {
    let state = 12345;
    const random = () => {
      state = (state * 1103515245 + 12345) & 0x7fffffff;
      return state / 0x7fffffff;
    };
    for (let shoe = 0; shoe < 200; shoe++) {
      const entries = Array.from({ length: 5 + Math.floor(random() * 75) }, () => {
        const x = random();
        return e(x < 0.46 ? 'banker' : x < 0.9 ? 'player' : 'tie');
      });
      for (const road of DERIVED_ROADS) {
        expect(derivedMarks(entries, road)).toEqual(byTheBoard(entries, DERIVED_GAP[road]));
      }
    }
  });

  it('foretells exactly the mark the next hand then puts down', () => {
    expect(nextMarks(seq(''), 'banker')).toEqual({ bigEye: null, small: null, cockroach: null });
    expect(nextMarks(seq('TT'), 'player')).toEqual({ bigEye: null, small: null, cockroach: null });
    const played = seq('BPPBBTBBPBPPPBBPTB');
    for (let n = 0; n <= played.length; n++) {
      const so = played.slice(0, n);
      for (const side of ['banker', 'player'] as const) {
        const told = nextMarks(so, side);
        for (const road of DERIVED_ROADS) {
          const before = derivedMarks(so, road);
          const after = derivedMarks([...so, e(side)], road);
          expect(told[road]).toBe(after.length > before.length ? after[after.length - 1] : null);
        }
      }
    }
  });

  it('lays marks out like the big road, turning right at the bottom', () => {
    expect(derivedCells(marks('rrbr'))).toEqual([
      { col: 0, row: 0, mark: 'red' },
      { col: 0, row: 1, mark: 'red' },
      { col: 1, row: 0, mark: 'blue' },
      { col: 2, row: 0, mark: 'red' },
    ]);
    const tail = derivedCells(marks('rrrrrrrr'));
    expect(tail[ROAD_ROWS - 1]).toEqual({ col: 0, row: ROAD_ROWS - 1, mark: 'red' });
    expect(tail[7]).toEqual({ col: 2, row: ROAD_ROWS - 1, mark: 'red' });
  });

  it('finds the newest mark left of a dragon tail, where the board scrolls to', () => {
    expect(newestCol([])).toBe(0);
    const cells = derivedCells(marks('rrrrrrrrrrb'));
    expect(Math.max(...cells.map((c) => c.col))).toBe(4);
    expect(newestCol(cells)).toBe(1);
  });
});

describe('derived road boards', () => {
  const shoe = seq('BPPBBBBTPB');

  it('draws one cell per mark and names the board with its counts', () => {
    const t = getStrings('en');
    const markup = renderToStaticMarkup(
      <DerivedRoad entries={shoe} road="bigEye" name={t.derivedRoad.bigEye} ariaLabel={(red, blue) => t.derivedAria(t.derivedRoad.bigEye, red, blue)} />,
    );
    expect(markup.match(/data-cell="/g)).toHaveLength(7);
    expect(markup).toContain('data-road="bigEye"');
    expect(markup).toContain('aria-label="Big eye boy: red 2, blue 5"');
    expect(markup).toContain('data-cell="blue" data-col="0" data-row="1"');
    expect(markup).toContain('data-cell="red" data-col="1" data-row="0"');
  });

  it('draws an empty board before a road has started', () => {
    const markup = renderToStaticMarkup(<DerivedRoad entries={seq('BP')} road="cockroach" name="C" ariaLabel={(red, blue) => `${red}/${blue}`} />);
    expect(markup).not.toContain('data-cell=');
    expect(markup).toContain('aria-label="0/0"');
  });

  it('shows what a Banker and a Player win would mark next, in both languages', () => {
    for (const language of ['en', 'ja'] as const) {
      const t = getStrings(language);
      const markup = renderToStaticMarkup(<NextMarks entries={shoe} title={t.nextMarksTitle} letters={t.roadLetter} ariaLabel={t.nextMarksAria} />);
      expect(markup).toContain(t.nextMarksTitle);
      expect(markup.match(/data-next="/g)).toHaveLength(6);
    }
    const en = getStrings('en');
    // After B, PP, BBBB, P, B: a second B outruns the lone P (big eye boy blue), stays inside BBBB (small road red)
    // and inside PP (cockroach pig red). A P opens a column: 1 vs 1 (red), 1 vs 4 (blue), 1 vs 2 (blue).
    expect(en.nextMarksAria('banker', nextMarks(shoe, 'banker'))).toBe('If Banker wins: Big eye boy blue, Small road red, Cockroach pig red');
    expect(en.nextMarksAria('player', nextMarks(shoe, 'player'))).toBe('If Player wins: Big eye boy red, Small road blue, Cockroach pig blue');
    expect(en.nextMarksAria('banker', nextMarks([], 'banker'))).toBe('If Banker wins: Big eye boy no mark yet, Small road no mark yet, Cockroach pig no mark yet');
    expect(getStrings('ja').nextMarksAria('player', nextMarks(seq('BPP'), 'player'))).toContain('大眼仔（ビッグアイボーイ） 赤');
  });
});
