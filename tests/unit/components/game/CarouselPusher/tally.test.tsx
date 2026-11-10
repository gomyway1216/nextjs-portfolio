import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it } from 'vitest';

import { CarouselPusher } from '@/components/game/CarouselPusher';
import { CounterTally } from '@/components/game/CarouselPusher/CounterTally';
import { PRESS_TO_DECK, copyMachine, feed, freshMachine, nextPocketUnderDrop, slotFree, step, type Machine, type MachineEvent } from '@/components/game/CarouselPusher/engine';
import { getStrings } from '@/components/game/CarouselPusher/i18n';
import { LOTTERY, OUTCOME_IDS, WEIGHTS, WEIGHT_TOTAL, classify, ticketFor, type OutcomeId } from '@/components/game/CarouselPusher/lottery';
import { EMPTY_TALLY, counted, endedOn, tallyRows, tallyTotal, tooSmallToShow, type Tally } from '@/components/game/CarouselPusher/tally';
import { createI18nInstance } from '@/lib/i18n';

// The panel that says what the counter has stopped on: counted from the events the machine plays out, shown beside
// each outcome's chance, and nothing more than the counter itself has already shown.

/** Steps until a press made now brings a medal down as a hole passes under the drop spot, and the slot is free. */
const toTheMoment = (m: Machine, events: MachineEvent[]): void => {
  for (let i = 0; i < 2_000 && !(slotFree(m) && nextPocketUnderDrop(m.step + PRESS_TO_DECK).steps === 0); i++) step(m, LOTTERY, events);
};
const run = (m: Machine, steps: number, events: MachineEvent[]): void => {
  for (let i = 0; i < steps; i++) step(m, LOTTERY, events);
};
const tallyOf = (events: readonly MachineEvent[]): Tally => events.reduce(counted, EMPTY_TALLY);

const panel = (tally: Tally, lang: 'en' | 'ja') => renderToStaticMarkup(<CounterTally tally={tally} t={getStrings(lang)} locale={lang === 'ja' ? 'ja-JP' : 'en-US'} />);
/** The cells of an outcome's row, as text. */
const rowOf = (html: string, id: OutcomeId): string[] => {
  const row = new RegExp(`<tr data-outcome="${id}"[^>]*>(.*?)</tr>`).exec(html)?.[1] ?? '';
  return [...row.matchAll(/<t[hd][^>]*>(.*?)<\/t[hd]>/g)].map((cell) => cell[1]);
};

describe('the tally of what the counter stopped on', () => {
  it('counts each spin the machine plays out once, under what its digits showed', () => {
    for (const id of OUTCOME_IDS) {
      const m = freshMachine(11);
      const events: MachineEvent[] = [];
      toTheMoment(m, events);
      feed(m, 0, 0, ticketFor(id), 0.5, events);
      run(m, 1_200, events);
      const spins = events.filter((e) => e.type === 'spin');
      expect(spins, id).toHaveLength(1);
      const tally = tallyOf(events);
      expect(tally[id], id).toBe(1);
      // A jackpot is one spin, not two: the machine says `jackpot` for it and no `paid`.
      expect(tallyTotal(tally), id).toBe(1);
    }
  });

  it('agrees with the digits of every spin over a long play, and leaves a spin still rolling uncounted', () => {
    const m = freshMachine(12);
    const events: MachineEvent[] = [];
    const order: OutcomeId[] = ['miss', 'seven', 'miss', 'sevens', 'triple', 'seven', 'miss', 'jackpot', 'miss', 'seven'];
    for (let press = 0; press < 30; press++) {
      toTheMoment(m, events);
      feed(m, 0, 0, ticketFor(order[press % order.length], press), 0.5, events);
      run(m, 40, events);
    }
    // Stopped part way through whatever is rolling.
    const ended = events.filter((e) => endedOn(e) !== null).length;
    const started = events.filter((e) => e.type === 'spin');
    expect(started.length).toBeGreaterThan(5);
    const tally = tallyOf(events);
    expect(tallyTotal(tally)).toBe(ended);
    expect(started.length - ended).toBe(m.spin ? 1 : 0);
    const shown: Record<OutcomeId, number> = { jackpot: 0, triple: 0, sevens: 0, seven: 0, miss: 0 };
    for (const e of started.slice(0, ended)) if (e.type === 'spin') shown[classify(...e.spin.digits)] += 1;
    expect(tally).toEqual(shown);
  });

  it('changes nothing of the machine: counting is a reading of its events', () => {
    const m = freshMachine(13);
    const events: MachineEvent[] = [];
    toTheMoment(m, events);
    feed(m, 0, 0, ticketFor('triple'), 0.5, events);
    run(m, 600, events);
    const before = JSON.stringify(copyMachine(m));
    const frozen = Object.freeze({ ...EMPTY_TALLY });
    const tally = events.reduce(counted, frozen);
    expect(JSON.stringify(copyMachine(m))).toBe(before);
    expect(frozen).toEqual(EMPTY_TALLY);
    expect(tally.triple).toBe(1);
    // An event that ends no spin gives the same tally back.
    expect(counted(tally, { type: 'fed', id: 1 })).toBe(tally);
    expect(counted(tally, { type: 'paid', outcome: 99, medals: 0 })).toBe(tally);
  });

  it('gives each outcome its share of the spins counted, and the chance the lottery gives it', () => {
    expect(tallyRows(EMPTY_TALLY).map((row) => row.share)).toEqual([null, null, null, null, null]);
    const rows = tallyRows({ jackpot: 1, triple: 2, sevens: 3, seven: 10, miss: 24 });
    expect(rows.map((row) => row.id)).toEqual([...OUTCOME_IDS]);
    expect(rows.map((row) => row.share)).toEqual([1 / 40, 2 / 40, 3 / 40, 10 / 40, 24 / 40]);
    for (const row of rows) expect(row.chance).toBe(WEIGHTS[row.id] / WEIGHT_TOTAL);
    expect(rows.reduce((sum, row) => sum + row.chance, 0)).toBeCloseTo(1, 12);
  });

  it('never calls a share that is of something none at all', () => {
    expect(tooSmallToShow({ count: 0, share: 0 })).toBe(false);
    expect(tooSmallToShow({ count: 0, share: null })).toBe(false);
    expect(tooSmallToShow({ count: 1, share: 1 / 10_000 })).toBe(false);
    expect(tooSmallToShow({ count: 1, share: 1 / 30_000 })).toBe(true);
  });
});

describe('the panel', () => {
  it('has every row from the start, in both languages, with a dash for the shares before any spin', () => {
    for (const lang of ['en', 'ja'] as const) {
      const t = getStrings(lang);
      const html = panel(EMPTY_TALLY, lang);
      expect(html).toContain(t.tallyTitle);
      expect(html).toContain(t.tallyNote);
      for (const head of [t.tallyShows, t.tallyTimes, t.tallyShare, t.tallyChance, t.tallyAll]) expect(html).toContain(`>${head}</th>`);
      for (const id of OUTCOME_IDS) expect(rowOf(html, id).slice(0, 3), `${lang} ${id}`).toEqual([t.outcomeName[id], '0', '—']);
      expect(rowOf(html, 'jackpot')[3]).toBe('0.25%');
      expect(rowOf(html, 'triple')[3]).toBe('3.00%');
      expect(rowOf(html, 'sevens')[3]).toBe('7.00%');
      expect(rowOf(html, 'seven')[3]).toBe('25.00%');
      expect(rowOf(html, 'miss')[3]).toBe('64.75%');
      expect(html).toContain('data-total="0"');
    }
  });

  it('shows the counts and their shares, the same rows as when empty', () => {
    const tally: Tally = { jackpot: 1, triple: 2, sevens: 3, seven: 10, miss: 24 };
    const html = panel(tally, 'en');
    expect(rowOf(html, 'jackpot')).toEqual(['7 7 7', '1', '2.50%', '0.25%']);
    expect(rowOf(html, 'miss')).toEqual(['Anything else', '24', '60.00%', '64.75%']);
    expect(html).toMatch(/data-testid="cp-tally-total"[^>]*>40</);
    const rows = (text: string) => text.match(/<tr/g)?.length;
    expect(rows(html)).toBe(rows(panel(EMPTY_TALLY, 'en')));
    expect(rows(html)).toBe(OUTCOME_IDS.length + 2);
  });

  it('writes a share too small for two decimals as <0.01%, in both languages, and a real zero as 0.00%', () => {
    const tally: Tally = { jackpot: 1, triple: 0, sevens: 0, seven: 0, miss: 29_999 };
    expect(rowOf(panel(tally, 'en'), 'jackpot')).toEqual(['7 7 7', '1', '&lt;0.01%', '0.25%']);
    expect(rowOf(panel(tally, 'ja'), 'jackpot')[2]).toBe('&lt;0.01%');
    expect(rowOf(panel(tally, 'en'), 'triple')[2]).toBe('0.00%');
    expect(rowOf(panel(tally, 'en'), 'miss')[1]).toBe('29,999');
  });

  it('is a table a screen reader can read: named by its title, described by its note, a header on every row and column', () => {
    const html = panel(EMPTY_TALLY, 'ja');
    expect(html).toMatch(/<table[^>]*aria-labelledby="cp-tally-title"[^>]*aria-describedby="cp-tally-note"/);
    expect(html).toContain('id="cp-tally-title"');
    expect(html).toContain('id="cp-tally-note"');
    expect(html.match(/<th scope="col"/g)).toHaveLength(4);
    expect(html.match(/<th scope="row"/g)).toHaveLength(OUTCOME_IDS.length + 1);
  });

  it('stands on the machine’s page, empty, in both languages', () => {
    for (const lang of ['en', 'ja'] as const) {
      const html = renderToStaticMarkup(<I18nextProvider i18n={createI18nInstance(lang)}>{<CarouselPusher />}</I18nextProvider>);
      expect(html).toContain('data-testid="cp-tally"');
      expect(html).toContain(getStrings(lang).tallyTitle);
    }
  });

  it('keeps its number columns at widths of their own, so a count never changes where a name wraps', () => {
    const css = readFileSync(join(process.cwd(), 'src/components/game/CarouselPusher/CarouselPusher.module.css'), 'utf8');
    expect(css).toMatch(/\.tallyTable\s*\{[^}]*table-layout:\s*fixed/);
    expect(css).toMatch(/\.tallyTimes\s*\{[^}]*width:/);
    expect(css).toMatch(/\.tallyPart\s*\{[^}]*width:/);
  });

  it('says its Japanese note in phrases a narrow line can break between', () => {
    expect(getStrings('ja').tallyNote).toContain('\u200b');
  });
});
