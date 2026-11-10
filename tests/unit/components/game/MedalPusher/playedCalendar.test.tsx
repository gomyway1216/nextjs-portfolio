import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it } from 'vitest';

import { PlayedCalendar, PlayedCalendarView } from '@/components/game/MedalPusher/PlayedCalendar';
import { RecordsView } from '@/components/game/MedalPusher/RecordsTab';
import { SHEET_WEEKS, WEEK_DAYS, monthOf, pickOf, pickedIn, sheetOf, shownMonth, spanOf, stepMonth } from '@/components/game/MedalPusher/playedCalendar';
import { LIMITS, claim, clearBook, countDays, createBook, mergeBooks, parseBook, record, serializeBook, viewOf, type Day, type RecordBook } from '@/components/game/MedalPusher/records';
import { WAITING, type RecordsState } from '@/components/game/MedalPusher/recordsStore';
import { getRecordStrings } from '@/components/game/MedalPusher/recordsStrings';
import { createI18nInstance } from '@/lib/i18n';

const render = (node: React.ReactNode, lang: 'en' | 'ja' = 'en') =>
  renderToStaticMarkup(<I18nextProvider i18n={createI18nInstance(lang)}>{node}</I18nextProvider>);

const TODAY: Day = '2026-10-12';
/** A book that fed a medal on each of these days, written out and read back as the browser would. */
const fedOn = (days: Day[], book = createBook('device0001')): RecordBook => {
  const kept = days.reduce((at, day) => record(at, [{ type: 'fed', count: 1 }], day), book);
  const read = parseBook(serializeBook(kept));
  if (!read) throw new Error('the book did not read back');
  return read;
};
const reading = (book: RecordBook, day: Day | null = TODAY): RecordsState => ({ ...WAITING, book, day });
const cells = (html: string, attribute: string): string[] => [...html.matchAll(new RegExp(`<td data-day="([^"]+)"[^>]*${attribute}="true"`, 'g'))].map((found) => found[1]);
const shown = (html: string, id: string): string => new RegExp(`data-testid="${id}"[^>]*>([^<]*)<`).exec(html)?.[1] ?? '';
const disabled = (html: string, id: string): boolean => new RegExp(`aria-disabled="true"[^>]*data-testid="${id}"`).test(html);

describe('the months the calendar can be turned to', () => {
  it('is the month today is in for a book with no day played', () => {
    expect(spanOf({}, TODAY)).toEqual({ first: '2026-10', last: '2026-10', now: '2026-10' });
  });

  it('runs from the earliest month played to the month today is in', () => {
    const book = fedOn(['2025-12-31', '2026-03-02', TODAY]);
    expect(spanOf(book.played, TODAY)).toEqual({ first: '2025-12', last: '2026-10', now: '2026-10' });
  });

  it('reaches a month after today when a clock put forward left a day there', () => {
    const book = fedOn(['2027-01-05']);
    expect(spanOf(book.played, TODAY)).toEqual({ first: '2026-10', last: '2027-01', now: '2026-10' });
  });

  it('has no today when the clock is off the book’s calendar, and nothing at all when the book is empty too', () => {
    expect(monthOf('1999-01-01')).toBeNull();
    expect(monthOf('2026-02-30')).toBeNull();
    expect(monthOf(null)).toBeNull();
    expect(spanOf({}, '1999-01-01')).toBeNull();
    expect(spanOf({}, null)).toBeNull();
    expect(spanOf(fedOn(['2026-03-02']).played, '1999-01-01')).toEqual({ first: '2026-03', last: '2026-03', now: null });
  });

  it('leaves out what is not a month', () => {
    expect(spanOf({ 'not-a-month': 1, '2026-13': 1, '2026-09': 0, '2026-08': 4 }, TODAY)).toEqual({ first: '2026-08', last: '2026-10', now: '2026-10' });
  });

  it('opens at today’s month, and keeps a picked month within the span', () => {
    const span = { first: '2025-12', last: '2026-10', now: '2026-10' };
    expect(shownMonth(span, null)).toBe('2026-10');
    expect(shownMonth(span, '2026-03')).toBe('2026-03');
    expect(shownMonth(span, '2024-01')).toBe('2025-12');
    expect(shownMonth(span, '2030-01')).toBe('2026-10');
    expect(shownMonth(span, 'nonsense')).toBe('2026-10');
    expect(shownMonth({ first: '2026-03', last: '2026-05', now: null }, null)).toBe('2026-05');
  });

  it('steps a month at a time, over the turn of a year, and stops at either end', () => {
    const span = { first: '2025-12', last: '2026-02', now: '2026-02' };
    expect(stepMonth(span, '2026-02', -1)).toBe('2026-01');
    expect(stepMonth(span, '2026-01', -1)).toBe('2025-12');
    expect(stepMonth(span, '2025-12', -1)).toBeNull();
    expect(stepMonth(span, '2025-12', 1)).toBe('2026-01');
    expect(stepMonth(span, '2026-02', 1)).toBeNull();
    expect(stepMonth(span, 'nonsense', 1)).toBeNull();
  });

  it('forgets a picked month when the records are cleared, and when the player turns back to today’s month', () => {
    const span = { first: '2025-12', last: '2026-10', now: '2026-10' };
    const book = fedOn(['2025-12-31']);
    const pick = pickOf(span, '2025-12', book.era);
    expect(pick).toEqual({ month: '2025-12', era: 0 });
    expect(pickedIn(pick, book.era)).toBe('2025-12');
    expect(pickedIn(pick, clearBook(book).era)).toBeNull();
    expect(pickOf(span, '2026-10', book.era)).toBeNull();
    expect(pickedIn(null, 0)).toBeNull();
  });
});

describe('a month’s sheet', () => {
  it('is six weeks of seven days for every month, with the first on its day of the week', () => {
    // The first of October 2026 is a Thursday, and the twelfth a Monday.
    const october = sheetOf({}, '2026-10', TODAY);
    expect(october?.weeks).toHaveLength(SHEET_WEEKS);
    for (const week of october?.weeks ?? []) expect(week).toHaveLength(WEEK_DAYS);
    expect(october?.weeks[0].map((cell) => cell?.date ?? null)).toEqual([null, null, null, null, 1, 2, 3]);
    expect(october?.weeks[2][1]).toEqual({ date: 12, day: TODAY, played: false, today: true });
    expect(october?.weeks.flat().filter((cell) => cell !== null)).toHaveLength(31);
    // A February that begins on a Sunday in a year that is not a leap year fills four weeks exactly; a leap year's has its 29th.
    expect(sheetOf({}, '2026-02', TODAY)?.weeks.map((week) => week.filter((cell) => cell !== null).length)).toEqual([7, 7, 7, 7, 0, 0]);
    expect(sheetOf({}, '2028-02', TODAY)?.weeks.flat().filter((cell) => cell !== null)).toHaveLength(29);
    // A month of 31 days that begins on a Saturday needs all six weeks.
    expect(sheetOf({}, '2026-08', TODAY)?.weeks[5].map((cell) => cell?.date ?? null)).toEqual([30, 31, null, null, null, null, null]);
    expect(sheetOf({}, 'nonsense', TODAY)).toBeNull();
  });

  it('marks exactly the days the book has as played, and counts them', () => {
    const days: Day[] = ['2026-09-30', '2026-10-01', '2026-10-11', TODAY, '2026-10-31'];
    const book = fedOn(days);
    const sheet = sheetOf(book.played, '2026-10', TODAY);
    const marked = (sheet?.weeks.flat() ?? []).filter((cell) => cell?.played).map((cell) => cell?.day);
    expect(marked).toEqual(['2026-10-01', '2026-10-11', TODAY, '2026-10-31']);
    expect(sheet?.played).toBe(4);
    expect(sheetOf(book.played, '2026-09', TODAY)?.played).toBe(1);
    // Every month's count adds up to the board's own figure for the days played.
    const span = spanOf(book.played, TODAY);
    expect((sheetOf(book.played, '2026-09', TODAY)?.played ?? 0) + (sheet?.played ?? 0)).toBe(viewOf(book).days);
    expect(span).toEqual({ first: '2026-09', last: '2026-10', now: '2026-10' });
  });

  it('marks a day the daily bonus was taken at the cabinet, as the book counts it played', () => {
    const { book } = claim(createBook('device0001'), TODAY);
    expect(sheetOf(book.played, '2026-10', TODAY)?.played).toBe(1);
  });

  it('shows the days of both copies of a book once they are joined, and none after the records are cleared', () => {
    const joined = mergeBooks(fedOn(['2026-10-01']), fedOn(['2026-10-01', '2026-10-02'], createBook('device0002')));
    expect(sheetOf(joined.played, '2026-10', TODAY)?.played).toBe(2);
    expect(sheetOf(clearBook(joined).played, '2026-10', TODAY)?.played).toBe(0);
  });

  it('reads a book stored before the calendar was there, and stores nothing new', () => {
    const stored = '{"v":1,"device":"device0001","era":0,"counters":{"device0001":{"fed":3}},"bests":{},"stamps":{},"played":{"2026-10":2049},"claimed":{}}';
    const book = parseBook(stored);
    if (!book) throw new Error('the stored book did not read');
    // Bits 0 and 11: the first and the twelfth.
    expect(sheetOf(book.played, '2026-10', TODAY)?.played).toBe(2);
    expect(serializeBook(book)).toBe(stored);
    expect(countDays(book.played)).toBe(2);
  });
});

describe('the calendar on the Records tab', () => {
  const book = fedOn(['2026-09-30', '2026-10-01', '2026-10-11', TODAY]);

  it('is a blank sheet of the same size until the book has been read', () => {
    const html = render(<PlayedCalendar state={WAITING} />);
    expect(html.match(/<td/g)).toHaveLength(SHEET_WEEKS * WEEK_DAYS);
    expect(html).not.toContain('data-day=');
    expect(shown(html, 'pusher-calendar-month')).toBe('—');
    expect(shown(html, 'pusher-calendar-count')).toBe('—');
    expect(disabled(html, 'pusher-calendar-prev')).toBe(true);
    expect(disabled(html, 'pusher-calendar-next')).toBe(true);
  });

  it('opens at today’s month with the days played marked and today ringed', () => {
    const html = render(<PlayedCalendar state={reading(book)} />);
    expect(html.match(/<td/g)).toHaveLength(SHEET_WEEKS * WEEK_DAYS);
    expect(html.match(/<td data-day=/g)).toHaveLength(31);
    expect(html).toContain('data-month="2026-10"');
    expect(shown(html, 'pusher-calendar-month')).toBe('October 2026');
    expect(cells(html, 'data-played')).toEqual(['2026-10-01', '2026-10-11', TODAY]);
    expect(cells(html, 'data-now')).toEqual([TODAY]);
    expect(shown(html, 'pusher-calendar-count')).toBe('Days played this month: 3');
    // There is an earlier month to turn to, and none later than today's.
    expect(disabled(html, 'pusher-calendar-prev')).toBe(false);
    expect(disabled(html, 'pusher-calendar-next')).toBe(true);
    // What the marks show is said in words too.
    expect(html).toMatch(/>12<\/span><span class="[^"]*srOnly[^"]*">, played, today<\/span>/);
    expect(html).toMatch(/>11<\/span><span class="[^"]*srOnly[^"]*">, played<\/span>/);
    expect(html).toMatch(/<caption class="[^"]*srOnly[^"]*">Days played in October 2026<\/caption>/);
    expect(html).toContain('<th scope="col" abbr="Sunday">Sun</th>');
  });

  it('turns to a picked month, and stops at the first one with a day in it', () => {
    const html = render(<PlayedCalendarView played={book.played} today={TODAY} picked="2026-09" />);
    expect(shown(html, 'pusher-calendar-month')).toBe('September 2026');
    expect(cells(html, 'data-played')).toEqual(['2026-09-30']);
    expect(cells(html, 'data-now')).toEqual([]);
    expect(shown(html, 'pusher-calendar-count')).toBe('Days played this month: 1');
    expect(disabled(html, 'pusher-calendar-prev')).toBe(true);
    expect(disabled(html, 'pusher-calendar-next')).toBe(false);
  });

  it('reads in Japanese, the words for those who cannot see it included', () => {
    const html = render(<PlayedCalendar state={reading(book)} />, 'ja');
    expect(shown(html, 'pusher-calendar-month')).toBe('2026年10月');
    expect(shown(html, 'pusher-calendar-count')).toBe('この月に遊んだ日：3日');
    expect(html).toContain('aria-label="プレイカレンダー"');
    expect(html).toContain('aria-label="前の月"');
    expect(html).toContain('aria-label="次の月"');
    expect(html).toMatch(/<span class="[^"]*srOnly[^"]*">、遊んだ日、今日<\/span>/);
    expect(html).toMatch(/<caption class="[^"]*srOnly[^"]*">2026年10月に遊んだ日<\/caption>/);
    expect(html).toContain('<th scope="col" abbr="日曜日">日</th>');
    expect(html).toContain(`直近${LIMITS.months}か月分`);
    expect(html).not.toMatch(/Days played|Previous month|Next month|, played|Today/);
  });

  it('has every string in both languages', () => {
    const [en, ja] = [getRecordStrings('en'), getRecordStrings('ja')];
    for (const t of [en, ja]) {
      expect(t.weekdays).toHaveLength(WEEK_DAYS);
      expect(t.weekdaysFull).toHaveLength(WEEK_DAYS);
      expect(new Set(t.weekdays).size).toBe(WEEK_DAYS);
      for (const text of [t.calendarTitle, t.calendarLead, t.calendarPrev, t.calendarNext, t.calendarPlayed, t.calendarToday, t.calendarCount(3), t.calendarNote(48), t.calendarCaption('x')]) {
        expect(text.length).toBeGreaterThan(0);
      }
      expect(t.calendarMark(false, false)).toBe('');
      expect(t.calendarNote(48)).toContain('48');
      for (let month = 1; month <= 12; month++) expect(t.calendarMonth(2026, month)).not.toContain('?');
    }
    expect(en.calendarTitle).not.toBe(ja.calendarTitle);
    expect(en.calendarNote(48)).not.toBe(ja.calendarNote(48));
  });

  it('stands on the Records tab once, between the board and the achievement sheet, and shows the same days the board counts', () => {
    for (const lang of ['en', 'ja'] as const) {
      const html = render(<RecordsView state={reading(book)} />, lang);
      expect(html.match(/data-testid="pusher-calendar"/g)).toHaveLength(1);
      expect(html.indexOf('data-testid="pusher-records-board"')).toBeLessThan(html.indexOf('data-testid="pusher-calendar"'));
      expect(html.indexOf('data-testid="pusher-calendar"')).toBeLessThan(html.indexOf('data-testid="pusher-achievements"'));
    }
    const html = render(<RecordsView state={reading(book)} />);
    expect(shown(html, 'pusher-record-days')).toBe('4');
    // The server's page, and the browser's first, have the blank sheet.
    expect(render(<RecordsView state={WAITING} />)).toContain('data-month=""');
  });
});

describe('the calendar’s styles', () => {
  const css = readFileSync(join(process.cwd(), 'src/components/game/MedalPusher/Records.module.css'), 'utf8');
  const rule = (selector: string): string => new RegExp(`^${selector.replace(/[.[\]]/g, '\\$&')} \\{([^}]*)\\}`, 'm').exec(css)?.[1] ?? '';

  it('make the buttons that turn the sheet as large as a fingertip', () => {
    const step = rule('.calendarStep');
    for (const size of ['width: 44px', 'height: 44px', 'min-width: 44px', 'min-height: 44px', 'flex: none', 'box-sizing: border-box']) expect(step).toContain(size);
    // Both buttons on the page carry that class, with a book that has days in it.
    const html = render(<PlayedCalendar state={reading(fedOn(['2026-09-30', TODAY]))} />);
    expect(html.match(/<button type="button" class="[^" ]*calendarStep[^" ]*"/g)).toHaveLength(2);
    expect(html.match(/<button/g)).toHaveLength(2);
    expect(rule('.calendarStep:focus-visible')).toContain('outline: 2px solid');
  });

  it('keep the sheet one size for every month: columns of one width and rows of one height', () => {
    expect(rule('.calendarSheet')).toContain('table-layout: fixed');
    expect(rule('.calendarSheet td')).toContain('height: 2.5rem');
    expect(rule('.calendarMonth')).toContain('white-space: nowrap');
  });

  it('put the calendar under the stamp card, and the board beside the two, where there are two columns', () => {
    expect(css).toMatch(/@media \(min-width: 980px\) \{[^@]*\.board \{\s*grid-column: 2;\s*grid-row: 1 \/ span 2;\s*\}\s*\.calendar \{\s*grid-column: 1;\s*grid-row: 2;\s*\}/);
  });

  it('tell a day played from the others by more than its colour', () => {
    expect(css).toMatch(/\.calendarSheet td\[data-played='true'\] \.calendarDay,\s*\.calendarKey\[data-played='true'\] \.calendarDay \{[^}]*border-color: #8a5a00;[^}]*font-weight: 900;/);
    expect(css).toMatch(/\.calendarSheet td\[data-now='true'\] \.calendarDay,\s*\.calendarKey\[data-now='true'\] \.calendarDay \{[^}]*outline: 2px solid #a30d25;/);
  });
});
