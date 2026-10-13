import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MedalPusher } from '@/components/game/MedalPusher';
import { ACHIEVEMENT_NUMBERS, BonusDot, BonusDotView, BonusStrip, BonusStripView, StampCard, TOAST_SECONDS, ToastView, bonusStatus, canTake } from '@/components/game/MedalPusher/DailyBonus';
import { PlayTab } from '@/components/game/MedalPusher/PlayTab';
import { RecordsTab, RecordsView, boardValue } from '@/components/game/MedalPusher/RecordsTab';
import { stampDate, tiltOf } from '@/components/game/MedalPusher/Stamps';
import { getStrings } from '@/components/game/MedalPusher/i18n';
import { CHAIN_GOAL, CHESTS } from '@/components/game/MedalPusher/lottery';
import {
  ACHIEVEMENT_IDS,
  BONUS_CARD,
  COUNTER_IDS,
  MANY_MEDALS,
  RECORDS_KEY,
  WEEK,
  cardFor,
  claim,
  createBook,
  dayNumber,
  dayOf,
  record,
  serializeBook,
  viewOf,
  type Day,
  type RecordBook,
  type RecordEvent,
} from '@/components/game/MedalPusher/records';
import { WAITING, type RecordsState } from '@/components/game/MedalPusher/recordsStore';
import { BOARD_GROUPS, BOARD_ROWS, getRecordStrings, type BoardRow } from '@/components/game/MedalPusher/recordsStrings';
import { MAX_STOCK, START_CREDITS } from '@/components/game/MedalPusher/session';
import { VIEW } from '@/components/game/MedalPusher/view';
import { createI18nInstance } from '@/lib/i18n';

const render = (node: React.ReactNode, lang: 'en' | 'ja' = 'en') =>
  renderToStaticMarkup(<I18nextProvider i18n={createI18nInstance(lang)}>{node}</I18nextProvider>);

afterEach(() => {
  vi.unstubAllGlobals();
});

const MONDAY: Day = '2026-10-12';
const after = (days: number): Day => dayOf((dayNumber(MONDAY) as number) + days);
/** The page with a book read: kept, with a machine to pay into. */
const reading = (book: RecordBook, day: Day = MONDAY, more: Partial<RecordsState> = {}): RecordsState => ({ ...WAITING, book, day, purse: true, ...more });
const taking = (days: Day[], book = createBook('device0001')): RecordBook => days.reduce((kept, day) => claim(kept, day).book, book);
/** What one thing on the page shows, by its test id. There has to be exactly one thing of that name, as there has to be for a test in a browser. */
const shown = (html: string, id: string): string => {
  const found = [...html.matchAll(new RegExp(`data-testid="${id}"[^>]*>([^<]*)<`, 'g'))];
  if (found.length === 0) throw new Error(`nothing on the page is called ${id}`);
  if (found.length > 1) throw new Error(`${found.length} things on the page are called ${id}`);
  return found[0][1];
};
/** Every test id in a piece of the page, in the order they come. */
const testIds = (html: string): string[] => [...html.matchAll(/data-testid="([^"]+)"/g)].map((found) => found[1]);
/** The names that more than one thing answers to. */
const sharedIds = (html: string): string[] => {
  const ids = testIds(html);
  return [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
};
const count = (html: string, pattern: RegExp): number => html.match(pattern)?.length ?? 0;
/** A book with a little of everything in it. */
function played(): RecordBook {
  const events: RecordEvent[] = [
    { type: 'fed', count: 1200 },
    { type: 'won', count: 1080 },
    { type: 'lost', count: 96 },
    { type: 'checker', gate: 0, held: true },
    { type: 'checker', gate: 0, held: false },
    { type: 'spinEnd', result: { tier: 'small', digits: [2, 2, 2], reach: true, reachKind: 'long' } },
    { type: 'spinEnd', result: { tier: 'miss', digits: [2, 3, 2], reach: true, reachKind: 'normal' } },
    { type: 'spinEnd', result: { tier: 'miss', digits: [1, 2, 3], reach: false, reachKind: 'none' } },
    { type: 'sugorokuEnd', square: 7, payout: 30, fever: true },
    { type: 'rouletteStep', pocket: 1, medals: 10, level: 1 },
    { type: 'rouletteStep', pocket: 2, medals: 20, level: 2 },
    { type: 'rouletteEnd', total: 30, level: 2 },
    { type: 'refill', count: 2 },
  ];
  let book = record(createBook('device0001'), events, after(-1));
  book = record(book, [{ type: 'fed', count: 1 }], MONDAY);
  return claim(book, after(-1)).book;
}

describe('the first drawing, on the server and in the browser', () => {
  it('shows the Records tab with nothing of the day or the book in it', () => {
    for (const lang of ['en', 'ja'] as const) {
      const t = getRecordStrings(lang);
      const html = render(<RecordsTab />, lang);
      expect(html).toContain('data-loaded="false"');
      // The card: seven squares with what each gives, none stamped, none today's, and nothing to press.
      expect(html).toMatch(/data-state="waiting"[^>]*data-testid="pusher-card"/);
      expect(count(html, /data-stamped="false"/g)).toBe(BONUS_CARD.length);
      expect(html).not.toContain('data-stamped="true"');
      expect(html).not.toContain('data-today="true"');
      expect(html).not.toContain('pusher-card-take');
      expect(shown(html, 'pusher-card-status')).toBe(t.bonusWaiting);
      for (const medals of BONUS_CARD) expect(html).toContain(`>+${medals}<`);
      // The board: a dash where every figure will be.
      for (const row of BOARD_GROUPS.flatMap((group) => [...BOARD_ROWS[group]])) expect(shown(html, `pusher-record-${row}`)).toBe('—');
      for (const big of ['won', 'return', 'prize', 'jackpots']) expect(shown(html, `pusher-headline-${big}`)).toBe('—');
      // The sheet: every achievement named, none stamped, and no date anywhere on the page.
      expect(count(html, /data-earned="false"/g)).toBe(ACHIEVEMENT_IDS.length);
      expect(html).not.toContain('data-earned="true"');
      expect(shown(html, 'pusher-achievements-count')).toBe(t.sheetCount(0, ACHIEVEMENT_IDS.length));
      expect(html).not.toMatch(/20\d\d|\d\d\.\d\d\.\d\d/);
      // Clearing waits for the book too.
      expect(html).toMatch(/<button[^>]*data-armed="false"[^>]*data-testid="pusher-records-clear"[^>]*disabled=""/);
      expect(html).toContain(t.keptNote);
    }
  });

  it('shows the bonus plate holding its place, and no dot on the tab', () => {
    const html = render(<BonusStrip />);
    expect(html).toMatch(/aria-label="DAILY BONUS"[^>]*data-state="waiting"[^>]*data-testid="pusher-bonus"/);
    expect(shown(html, 'pusher-bonus-status')).toBe('Looking at your stamp card…');
    expect(count(html, /data-on="false" data-today="false"/g)).toBe(BONUS_CARD.length);
    expect(html).not.toContain('<button');
    expect(render(<BonusDot />)).toBe('');
    expect(render(<BonusStrip />, 'ja')).toContain('デイリーボーナス');
  });

  it('never touches storage or the clock on the server, whatever the browser holds', () => {
    const calls: string[] = [];
    const storage = {
      getItem: (key: string) => {
        calls.push(`get ${key}`);
        return key === RECORDS_KEY ? serializeBook(played()) : null;
      },
      setItem: (key: string) => void calls.push(`set ${key}`),
      removeItem: (key: string) => void calls.push(`remove ${key}`),
    };
    vi.stubGlobal('localStorage', storage);
    vi.stubGlobal('window', { localStorage: storage });
    const html = render(<MedalPusher />);
    expect(calls).toEqual([]);
    expect(html).toContain('data-loaded="false"');
    expect(html).not.toContain('pusher-bonus-take');
    expect(html).not.toContain('pusher-bonus-dot');
    // The machine starts with what it always started with.
    expect(html).toMatch(new RegExp(`data-testid="pusher-credits"[^>]*>${START_CREDITS}<`));
  });

  it('has the plate between the cabinet and the tally, and the toast’s place empty at the top of the cabinet', () => {
    const html = render(<PlayTab />);
    const [toast, field, controls, plate, tally] = ['pusher-toast', 'pusher-field', 'pusher-controls', 'pusher-bonus"', 'pusher-played'].map((id) => html.indexOf(`data-testid="${id}`));
    expect(toast).toBeGreaterThan(0);
    expect(toast).toBeLessThan(field);
    expect(field).toBeLessThan(controls);
    expect(controls).toBeLessThan(plate);
    expect(plate).toBeLessThan(tally);
    expect(html).toMatch(/<div[^>]*role="status"[^>]*data-testid="pusher-toast"[^>]*><\/div>/);
  });

  it('has a fourth tab, Records, in both languages', () => {
    const en = render(<MedalPusher />);
    expect(en.match(/role="tab"[^>]*>([^<]+)</g)?.map((tab) => tab.replace(/.*>([^<]+)<$/, '$1'))).toEqual(['Machine', 'Odds', 'Simulation', 'Records']);
    expect(en).toMatch(/id="pusher-panel-records"[^>]*aria-labelledby="pusher-tab-records"[^>]*hidden/);
    expect(en).toMatch(/id="pusher-tab-records"[^>]*aria-selected="false"[^>]*aria-controls="pusher-panel-records"/);
    const ja = render(<MedalPusher />, 'ja');
    expect(ja.match(/role="tab"[^>]*>([^<]+)</g)?.map((tab) => tab.replace(/.*>([^<]+)<$/, '$1'))).toEqual(['マシン', '確率', 'シミュレーション', '記録']);
    expect(getStrings('en').tabRecords).toBe('Records');
    expect(getStrings('ja').tabRecords).toBe('記録');
  });
});

describe('the bonus plate beside the cabinet', () => {
  const book = createBook('device0001');

  it('offers the first day’s bonus, with the button that takes it', () => {
    const html = render(<BonusStripView state={reading(book)} />);
    expect(html).toContain('data-state="ready"');
    expect(shown(html, 'pusher-bonus-status')).toBe(`Day 1 is ready: ${BONUS_CARD[0]} medals.`);
    expect(html).toMatch(new RegExp(`<button[^>]*data-testid="pusher-bonus-take"[^>]*>TAKE \\+${BONUS_CARD[0]}<span[^>]*> medals: today’s daily bonus</span></button>`));
    // No lamp is lit, and the first is ringed as today's.
    expect(count(html, /data-on="true"/g)).toBe(0);
    expect(html).toMatch(/data-on="false" data-today="true"/);
    expect(html).toContain(`aria-label="0 of ${BONUS_CARD.length} stamped"`);
  });

  it('shows the week so far and what today gives', () => {
    const three = taking([after(-3), after(-2), after(-1)]);
    const html = render(<BonusStripView state={reading(three)} />);
    expect(shown(html, 'pusher-bonus-status')).toBe(`Day 4 is ready: ${BONUS_CARD[3]} medals.`);
    expect(count(html, /data-on="true"/g)).toBe(3);
    expect(html).toContain(`aria-label="3 of ${BONUS_CARD.length} stamped"`);
    expect(render(<BonusStripView state={reading(three)} />, 'ja')).toContain(`4日目のボーナスを受け取れます: ${BONUS_CARD[3]}枚`);
  });

  it('shows today’s stamp once it is taken, and what tomorrow gives', () => {
    const taken = taking([after(-1), MONDAY]);
    const html = render(<BonusStripView state={reading(taken)} />);
    expect(html).toContain('data-state="taken"');
    expect(html).not.toContain('<button');
    expect(shown(html, 'pusher-bonus-status')).toBe(`Stamped today: +${BONUS_CARD[1]} medals. Tomorrow: +${BONUS_CARD[2]}.`);
    expect(html).toContain('26.10.12');
    // The stamp comes down only on the page that took it.
    expect(html).toContain('data-fresh="false"');
    expect(render(<BonusStripView state={reading(taken, MONDAY, { claims: 1, paid: BONUS_CARD[1] })} />)).toContain('data-fresh="true"');
  });

  it('says so when a day was missed, when the card is full, and when the card is ahead of the clock', () => {
    const t = getRecordStrings('en');
    const missed = reading(taking([after(-4), after(-3)]));
    expect(bonusStatus(t, missed, cardFor(missed.book as RecordBook, MONDAY))).toBe(`A day was missed, so this is a new card. Day 1 is ready: ${BONUS_CARD[0]} medals.`);
    const full = reading(taking(Array.from({ length: WEEK }, (_, index) => after(index - WEEK + 1))));
    expect(bonusStatus(t, full, cardFor(full.book as RecordBook, MONDAY))).toBe(`Stamped today: +${BONUS_CARD[6]} medals. The card is full! A new one starts tomorrow: +${BONUS_CARD[0]}.`);
    const ahead = reading(taking([MONDAY, after(3)]));
    expect(bonusStatus(t, ahead, cardFor(ahead.book as RecordBook, MONDAY))).toBe(`The card is stamped ahead of today. The next bonus is on Oct 16, 2026: +${BONUS_CARD[1]}.`);
    const html = render(<BonusStripView state={ahead} />);
    expect(html).toContain('data-state="later"');
    expect(html).not.toContain('<button');
    const offCalendar = reading(book, '2150-01-01');
    expect(bonusStatus(t, offCalendar, cardFor(book, '2150-01-01'))).toBe(t.bonusNoDay);
    expect(bonusStatus(getRecordStrings('ja'), ahead, cardFor(ahead.book as RecordBook, MONDAY))).toContain('2026年10月16日');
  });

  it('offers nothing where the book is not kept or no machine is running, and says why', () => {
    const t = getRecordStrings('en');
    const notKept = reading(book, MONDAY, { kept: false });
    const noMachine = reading(book, MONDAY, { purse: false });
    expect(canTake(reading(book), cardFor(book, MONDAY))).toBe(true);
    expect(canTake(notKept, cardFor(book, MONDAY))).toBe(false);
    expect(canTake(noMachine, cardFor(book, MONDAY))).toBe(false);
    expect(canTake(WAITING, null)).toBe(false);
    const html = render(<BonusStripView state={notKept} />);
    expect(html).toContain('data-state="off"');
    expect(html).not.toContain('<button');
    expect(shown(html, 'pusher-bonus-status')).toBe(t.bonusNotKept);
    expect(shown(render(<BonusStripView state={noMachine} />), 'pusher-bonus-status')).toBe(t.bonusNoMachine);
    expect(render(<BonusStripView state={noMachine} />)).not.toContain('<button');
  });

  it('offers nothing in a browser that cannot keep its tabs apart, and says why, on the plate, the card and the tab', () => {
    for (const lang of ['en', 'ja'] as const) {
      const t = getRecordStrings(lang);
      const state = reading(book, MONDAY, { apart: false });
      expect(canTake(state, cardFor(book, MONDAY))).toBe(false);
      const plate = render(<BonusStripView state={state} />, lang);
      expect(plate).toContain('data-state="off"');
      expect(plate).not.toContain('<button');
      expect(plate).not.toContain('data-today="true"');
      expect(shown(plate, 'pusher-bonus-status')).toBe(t.bonusNotApart);
      const card = render(<StampCard state={state} />, lang);
      expect(card).toMatch(/data-state="off"[^>]*data-testid="pusher-card"/);
      expect(card).not.toContain('pusher-card-take');
      expect(card).not.toContain('data-today="true"');
      expect(shown(card, 'pusher-card-status')).toBe(t.bonusNotApart);
      expect(render(<BonusDotView state={state} />, lang)).toBe('');
    }
    expect(getRecordStrings('en').bonusNotApart).toContain('no way to keep two tabs');
    expect(getRecordStrings('ja').bonusNotApart).toContain('2つのタブ');
    // A book that is not kept says that first: it is the nearer reason.
    const neither = reading(book, MONDAY, { apart: false, kept: false });
    expect(shown(render(<BonusStripView state={neither} />), 'pusher-bonus-status')).toBe(getRecordStrings('en').bonusNotKept);
  });

  it('puts a dot on the Records tab while the bonus is waiting, and takes it off once it is taken', () => {
    expect(render(<BonusDotView state={reading(book)} />)).toContain('data-testid="pusher-bonus-dot"');
    expect(render(<BonusDotView state={reading(book)} />)).toContain('aria-hidden="true"');
    expect(render(<BonusDotView state={reading(taking([MONDAY]))} />)).toBe('');
    expect(render(<BonusDotView state={reading(book, MONDAY, { kept: false })} />)).toBe('');
    expect(render(<BonusDotView state={WAITING} />)).toBe('');
  });
});

describe('the stamp card', () => {
  it('stamps the days taken with their dates, marks today’s square, and reads each square out', () => {
    const three = taking([after(-3), after(-2), after(-1)]);
    const html = render(<StampCard state={reading(three)} />);
    expect(count(html, /data-stamped="true"/g)).toBe(3);
    expect(count(html, /data-today="true"/g)).toBe(1);
    expect(html).toMatch(/data-stamped="false" data-today="true" data-last="false"/);
    for (const date of ['26.10.09', '26.10.10', '26.10.11']) expect(html).toContain(date);
    expect(html).not.toContain('26.10.12');
    expect(html).toContain(`Day 1: ${BONUS_CARD[0]} medals. Stamped Oct 9, 2026.`);
    expect(html).toContain(`Day 4: ${BONUS_CARD[3]} medals. Ready today.`);
    expect(html).toContain(`Day 7: ${BONUS_CARD[6]} medals.`);
    expect(html).toMatch(/data-stamped="false" data-today="false" data-last="true"/);
    expect(html).toMatch(new RegExp(`<button[^>]*data-testid="pusher-card-take"[^>]*>TAKE \\+${BONUS_CARD[3]}<`));
    expect(html).toMatch(/<p[^>]*role="status"[^>]*data-testid="pusher-card-status"[^>]*>Day 4 is ready/);
  });

  it('says on the card that free medals change no return, and what a changed clock gets', () => {
    for (const lang of ['en', 'ja'] as const) {
      const t = getRecordStrings(lang);
      const html = render(<StampCard state={reading(createBook('device0001'))} />, lang);
      expect(html).toContain(t.cardNote);
      expect(html).toContain(t.clockNote);
      expect(html).toContain(t.cardLead(WEEK));
    }
    expect(getRecordStrings('en').cardNote).toContain('not counted as fed, won or paid');
    expect(getRecordStrings('en').cardNote).toContain('change no return');
    expect(getRecordStrings('ja').cardNote).toContain('還元率');
    expect(getRecordStrings('en').clockNote).toContain('putting the clock forward takes that day’s stamp early');
    expect(getRecordStrings('ja').clockNote).toContain('時計を進める');
  });

  it('is a full card on the seventh day, and a new one after a missed day', () => {
    const full = render(<StampCard state={reading(taking(Array.from({ length: WEEK }, (_, index) => after(index - WEEK + 1))))} />);
    expect(count(full, /data-stamped="true"/g)).toBe(WEEK);
    expect(full).not.toContain('pusher-card-take');
    const missed = render(<StampCard state={reading(taking([after(-5), after(-4), after(-3), after(-2)]))} />);
    expect(count(missed, /data-stamped="true"/g)).toBe(0);
    expect(missed).toMatch(/data-stamped="false" data-today="true" data-last="false"/);
    expect(shown(missed, 'pusher-card-status')).toContain('A day was missed');
  });
});

describe('the record board and the achievement sheet', () => {
  it('shows the figures of a book that has been played', () => {
    const html = render(<RecordsView state={reading(played())} />);
    expect(html).toContain('data-loaded="true"');
    const figures: Partial<Record<BoardRow, string>> = {
      fed: '1,201',
      won: '1,080',
      lost: '96',
      return: '89.9%',
      bonus: String(BONUS_CARD[0]),
      refills: '2',
      hits: '2',
      wasted: '1',
      fulls: '0',
      spins: '3',
      reaches: '2',
      reachWins: '1',
      supers: '1',
      superWins: '1',
      small: '1',
      big: '0',
      seven: '0',
      fevers: '1',
      chests: '0',
      topChests: '0',
      towers: '0',
      balls: '0',
      run: '2 in a row',
      challenges: '0',
      jackpots: '0',
      jackpot: '—',
      prize: '30',
      days: '2',
      streakNow: '2',
      streak: '2',
      claims: '1',
    };
    for (const row of BOARD_GROUPS.flatMap((group) => [...BOARD_ROWS[group]])) expect(shown(html, `pusher-record-${row}`), row).toBe(figures[row]);
    // Every row has a figure in that list, and every counter the book keeps is on the board, but for the roulettes a ball starts, which are the balls.
    expect(Object.keys(figures).sort()).toEqual(BOARD_GROUPS.flatMap((group) => [...BOARD_ROWS[group]]).sort());
    const rows: string[] = BOARD_GROUPS.flatMap((group) => [...BOARD_ROWS[group]]);
    expect(COUNTER_IDS.filter((id) => !rows.includes(id))).toEqual(['roulettes']);
    // The four the board leads with are the same figures as their rows, each under a name of its own.
    expect(shown(html, 'pusher-headline-won')).toBe('1,080');
    expect(shown(html, 'pusher-headline-return')).toBe('89.9%');
    expect(shown(html, 'pusher-headline-prize')).toBe('30');
    expect(shown(html, 'pusher-headline-jackpots')).toBe('0');
    for (const [headline, row] of [['won', 'won'], ['return', 'return'], ['prize', 'prize'], ['jackpots', 'jackpots']]) {
      expect(shown(html, `pusher-headline-${headline}`)).toBe(shown(html, `pusher-record-${row}`));
    }
    expect(count(html, />89\.9%</g)).toBe(2);
    expect(html).toContain(`Chests that held ${Math.max(...CHESTS)}`);
  });

  it('stamps the achievements earned with their dates and leaves the others blank', () => {
    const html = render(<RecordsView state={reading(played())} />);
    const earned = ['firstLine', 'superWin', 'fever', 'thousand'];
    expect(shown(html, 'pusher-achievements-count')).toBe(`${earned.length} of ${ACHIEVEMENT_IDS.length} stamped`);
    for (const id of ACHIEVEMENT_IDS) {
      expect(html).toContain(`data-earned="${earned.includes(id)}" data-achievement="${id}"`);
    }
    // Each stamp says when, in words for whoever cannot see it, and as a date stamp writes it.
    expect(count(html, />Stamped Oct 11, 2026</g)).toBe(earned.length);
    expect(count(html, /<span aria-hidden="true">26\.10\.11<\/span>/g)).toBe(earned.length);
    expect(count(html, />Not yet</g)).toBe(ACHIEVEMENT_IDS.length - earned.length);
    const ja = render(<RecordsView state={reading(played())} />, 'ja');
    expect(count(ja, /2026年10月11日 達成/g)).toBe(earned.length);
    expect(count(ja, />未達成</g)).toBe(ACHIEVEMENT_IDS.length - earned.length);
    expect(shown(ja, 'pusher-record-run')).toBe('2連続');
    expect(shown(ja, 'pusher-record-days')).toBe('2日');
    expect(shown(ja, 'pusher-record-refills')).toBe('2回');
  });

  it('shows an empty book as noughts, with a dash for what has nothing behind it yet', () => {
    const html = render(<RecordsView state={reading(createBook('device0001'))} />);
    expect(shown(html, 'pusher-record-fed')).toBe('0');
    expect(shown(html, 'pusher-record-return')).toBe('—');
    expect(shown(html, 'pusher-record-prize')).toBe('—');
    expect(shown(html, 'pusher-record-jackpot')).toBe('—');
    expect(shown(html, 'pusher-record-run')).toBe('—');
    expect(shown(html, 'pusher-record-days')).toBe('0');
    expect(html).toMatch(/<button[^>]*data-testid="pusher-records-clear"[^>]*>Clear the records<\/button>/);
    expect(html).not.toMatch(/<button[^>]*data-testid="pusher-records-clear"[^>]*disabled/);
  });

  it('says when the browser is not keeping the book', () => {
    const html = render(<RecordsView state={reading(createBook('device0001'), MONDAY, { kept: false })} />);
    expect(html).toMatch(/data-kept="false"[^>]*>This browser is not keeping the record book/);
    expect(html).not.toContain('pusher-card-take');
    expect(render(<RecordsView state={reading(createBook('device0001'))} />)).toMatch(/data-kept="true"[^>]*>The record book is kept on this device, apart from the machine\./);
  });

  it('works out each row from the book', () => {
    const t = getRecordStrings('en');
    const fmt = (n: number) => n.toLocaleString('en-US');
    const view = viewOf(played());
    expect(boardValue('return', view, 0, t, fmt)).toBe('89.9%');
    expect(boardValue('reachWins', view, 0, t, fmt)).toBe('1');
    expect(boardValue('streakNow', view, 5, t, fmt)).toBe('5');
    expect(boardValue('fed', view, 0, t, fmt)).toBe('1,201');
    expect(boardValue('fed', view, 0, getRecordStrings('ja'), (n) => n.toLocaleString('ja-JP'))).toBe('1,201');
    expect(boardValue('claims', view, 0, getRecordStrings('ja'), fmt)).toBe('1回');
  });
});

describe('the names the tests find things by', () => {
  // A test in a browser asks for the one thing of a name, and fails when two answer. Every panel is looked through
  // on its own, the way those tests look: in each state it can be in, no two things in it share a name.
  const book = createBook('device0001');
  const states: [string, RecordsState][] = [
    ['before the book is read', WAITING],
    ['an empty book, the bonus ready', reading(book)],
    ['a book that has been played, the bonus ready', reading(played())],
    ['the bonus taken on this page', reading(taking([MONDAY]), MONDAY, { claims: 1, paid: BONUS_CARD[0] })],
    ['a full card', reading(taking(Array.from({ length: WEEK }, (_, index) => after(index - WEEK + 1))))],
    ['the book not kept', reading(book, MONDAY, { kept: false })],
    ['a browser that cannot keep its tabs apart', reading(book, MONDAY, { apart: false })],
    ['no machine running', reading(book, MONDAY, { purse: false })],
    ['a stamp just earned', reading(played(), MONDAY, { fresh: ['jackpot'] })],
  ];

  it('are each one thing’s alone on the Records tab, in every state and both languages', () => {
    for (const lang of ['en', 'ja'] as const) {
      for (const [name, state] of states) {
        const html = render(<RecordsView state={state} />, lang);
        expect(sharedIds(html), `${name} (${lang})`).toEqual([]);
        expect(testIds(html).length).toBeGreaterThan(40);
      }
    }
    // The board's four headline figures and the rows that repeat them are told apart.
    const ids = testIds(render(<RecordsView state={reading(played())} />));
    for (const figure of ['won', 'return', 'prize', 'jackpots']) {
      expect(ids).toContain(`pusher-headline-${figure}`);
      expect(ids).toContain(`pusher-record-${figure}`);
    }
    // Every row of the board has its name, and so has everything the tests in the browser ask for.
    for (const row of BOARD_GROUPS.flatMap((group) => [...BOARD_ROWS[group]])) expect(ids).toContain(`pusher-record-${row}`);
    for (const id of ['pusher-records', 'pusher-card', 'pusher-card-squares', 'pusher-card-take', 'pusher-card-status', 'pusher-records-board', 'pusher-achievements', 'pusher-achievements-count', 'pusher-records-kept', 'pusher-records-clear', 'pusher-records-said']) {
      expect(ids, id).toContain(id);
    }
  });

  it('are each one thing’s alone on the Machine tab, with the plate and the toast in every state', () => {
    // The cabinet as the server sends it, and the plate and the toast in each state they come to after.
    const cabinet = render(<PlayTab />);
    expect(sharedIds(cabinet)).toEqual([]);
    for (const id of ['pusher-toast', 'pusher-bonus', 'pusher-bonus-pips', 'pusher-bonus-status']) expect(testIds(cabinet), id).toContain(id);
    const others = testIds(cabinet).filter((id) => !id.startsWith('pusher-bonus') && id !== 'pusher-toast');
    for (const [name, state] of states) {
      const mine = render(
        <>
          <ToastView id={state.fresh.length > 0 ? state.fresh[0] : null} />
          <BonusStripView state={state} />
        </>,
      );
      expect(sharedIds(mine), name).toEqual([]);
      // Nothing of the plate's or the toast's goes by a name the cabinet already uses.
      expect(testIds(mine).filter((id) => others.includes(id)), name).toEqual([]);
    }
    expect(testIds(render(<BonusStripView state={reading(book)} />))).toContain('pusher-bonus-take');
  });

  it('are not shared between the Machine tab and the Records tab either, but for nothing', () => {
    const html = render(<MedalPusher />);
    const panel = (id: string): string => html.slice(html.indexOf(`id="pusher-panel-${id}"`)).split('role="tabpanel"')[0];
    const [machineIds, recordIds] = [testIds(panel('machine')), testIds(panel('records'))];
    expect(machineIds.length).toBeGreaterThan(10);
    expect(recordIds.length).toBeGreaterThan(40);
    expect(machineIds.filter((id) => recordIds.includes(id))).toEqual([]);
    expect(testIds(html).filter((id) => id === 'pusher-bonus-dot')).toEqual([]);
  });
});

describe('a stamp’s toast', () => {
  it('names the stamp and how it was earned, in a place that is read out, and is empty otherwise', () => {
    const html = render(<ToastView id="jackpot" />);
    expect(html).toMatch(/role="status"[^>]*data-testid="pusher-toast"/);
    expect(html).toContain('data-achievement="jackpot"');
    expect(html).toContain('Achievement stamped: Jackpot!.');
    expect(html).toContain('Win the jackpot.');
    expect(html).toContain(`--mp-toast:${TOAST_SECONDS}s`);
    expect(render(<ToastView id="jackpot" />, 'ja')).toContain('実績スタンプを獲得しました: ジャックポット');
    expect(render(<ToastView id={null} />)).toMatch(/data-testid="pusher-toast"[^>]*><\/div>/);
    expect(TOAST_SECONDS).toBeGreaterThanOrEqual(4);
    expect(TOAST_SECONDS).toBeLessThanOrEqual(10);
  });
});

describe('the words', () => {
  it('name every achievement and say how it is earned, in both languages, from the game’s own numbers', () => {
    expect(ACHIEVEMENT_NUMBERS).toEqual({ hold: MAX_STOCK, chest: Math.max(...CHESTS), run: CHAIN_GOAL, medals: MANY_MEDALS, days: WEEK });
    for (const lang of ['en', 'ja'] as const) {
      const words = getRecordStrings(lang).achievement(ACHIEVEMENT_NUMBERS);
      expect(Object.keys(words).sort()).toEqual([...ACHIEVEMENT_IDS].sort());
      expect(new Set(Object.values(words).map((word) => word.name)).size).toBe(ACHIEVEMENT_IDS.length);
      for (const id of ACHIEVEMENT_IDS) {
        expect(words[id].name.length).toBeGreaterThan(0);
        expect(words[id].how.length).toBeGreaterThan(4);
      }
      expect(words.holdFull.how).toContain(String(MAX_STOCK));
      expect(words.treasure.how).toContain(String(Math.max(...CHESTS)));
      expect(words.fullRun.how).toContain(String(CHAIN_GOAL));
      expect(words.thousand.how).toContain('1,000');
      expect(words.week.how).toContain(String(WEEK));
    }
    // Change a number and the words follow.
    expect(getRecordStrings('en').achievement({ ...ACHIEVEMENT_NUMBERS, run: 6 }).fullRun.how).toBe('Hit 6 numbers in a row on the roulette.');
    expect(getRecordStrings('ja').achievement({ ...ACHIEVEMENT_NUMBERS, days: 10 }).week.how).toBe('10日続けて遊ぶ。');
  });

  it('have a name for every row and every heading of the board, in both languages', () => {
    for (const lang of ['en', 'ja'] as const) {
      const t = getRecordStrings(lang);
      for (const group of BOARD_GROUPS) {
        expect(t.group[group].length).toBeGreaterThan(0);
        for (const row of BOARD_ROWS[group]) expect(t.row[row].length).toBeGreaterThan(0);
      }
    }
    const rows = BOARD_GROUPS.flatMap((group) => [...BOARD_ROWS[group]]);
    expect(new Set(rows).size).toBe(rows.length);
  });

  it('write a day out in each language, and the way a date stamp does', () => {
    expect(getRecordStrings('en').date('2026-10-12')).toBe('Oct 12, 2026');
    expect(getRecordStrings('en').date('2027-01-03')).toBe('Jan 3, 2027');
    expect(getRecordStrings('ja').date('2026-10-12')).toBe('2026年10月12日');
    expect(getRecordStrings('ja').date('2027-01-03')).toBe('2027年1月3日');
    expect(stampDate('2026-10-12')).toBe('26.10.12');
    expect(stampDate('2027-01-03')).toBe('27.01.03');
  });

  it('announce the bonus in the cabinet’s own words', () => {
    expect(getStrings('en').sayBonus(30)).toBe('Daily bonus: 30 medals added to your medals.');
    expect(getStrings('ja').sayBonus(30)).toBe('デイリーボーナス: メダルが30枚増えました。');
  });

  it('turn no two neighbouring stamps the same way, and none far', () => {
    for (let index = 0; index < 24; index++) {
      expect(Math.abs(tiltOf(index))).toBeLessThanOrEqual(12);
      expect(tiltOf(index)).not.toBe(tiltOf(index + 1));
    }
    expect(tiltOf(-1)).toBe(tiltOf(11));
  });
});

describe('the styles', () => {
  const css = readFileSync(join(process.cwd(), 'src/components/game/MedalPusher/Records.module.css'), 'utf8');
  const shared = readFileSync(join(process.cwd(), 'src/components/game/MedalPusher/MedalPusher.module.css'), 'utf8');

  it('keep everything that moves still for a player who asks for less motion', () => {
    const calm = css.slice(css.lastIndexOf('@media (prefers-reduced-motion: reduce)'));
    const moving = [...css.matchAll(/^(\.[a-zA-Z]+(?:\[[^\]]+\])?) \{[^}]*animation: mp-/gm)].map((match) => match[1]);
    expect(moving.sort()).toEqual([".pip[data-today='true']", ".square[data-today='true']", ".stamp[data-fresh='true']", '.toast']);
    for (const selector of moving) expect(calm, selector).toContain(selector);
    expect(calm).toMatch(/animation: none/);
  });

  it('keep the toast off the controls: it hangs from the top of the cabinet, goes no lower than the stage, and takes no room and no presses', () => {
    const rule = (name: string) => new RegExp(`\\.${name} \\{([^}]*)\\}`).exec(css)?.[1] ?? '';
    // What stands in the cabinet for it has no height and takes no presses, and neither does anything inside it.
    expect(rule('toastAnchor')).toContain('height: 0');
    expect(rule('toastAnchor')).toContain('pointer-events: none');
    // The rail sticks to the top of the window, inside a track laid over the top of the cabinet.
    expect(rule('toastRail')).toContain('position: sticky');
    expect(rule('toastRail')).toContain('top: 8px');
    expect(rule('toastTrack')).toContain('position: absolute');
    expect(rule('toastTrack')).toContain('top: 0');
    // The track is the shape of the stage, so it ends above the stage's bottom edge by what the cabinet has over the stage.
    const html = render(<ToastView id="jackpot" />);
    expect(html).toContain(`aspect-ratio:${VIEW.width} / ${VIEW.height}`);
    expect(html.indexOf('aspect-ratio')).toBeLessThan(html.indexOf('data-testid="pusher-toast"'));
  });

  it('put the plate beside the cabinet where there are two columns and under it where there is one', () => {
    expect(shared).toMatch(/@media \(min-width: 981px\) \{\s*\.machine \{\s*grid-template-rows: auto 1fr;\s*\}\s*\.cabinet \{\s*grid-row: 1 \/ span 2;\s*\}\s*\}/);
    expect(css).toMatch(/@media \(max-width: 980px\) \{\s*\.strip \{[^}]*max-width: 640px;/);
  });
});
