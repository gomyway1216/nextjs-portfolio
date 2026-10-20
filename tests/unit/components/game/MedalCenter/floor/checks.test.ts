import { describe, expect, it } from 'vitest';

import { DAILY_WON_MOST, FLOOR_RULES } from '@/lib/medalFloor/games';
import { NAME_MAX, checkName, tagFrom } from '@/lib/medalFloor/names';
import { dayStart, periodAt, periodBefore, weekStart } from '@/lib/medalFloor/periods';
import { DAILY_PLAYED_MOST } from '@/lib/medalFloor/jackpot';
import { REPORTS_PER_MINUTE, allowanceAt, checkReport, countable, countablePlayed, nextWindow, playAllowanceAt } from '@/lib/medalFloor/report';
import { feedFrom, ranked } from '@/lib/medalFloor/store';

describe('names on the floor', () => {
  it('takes short nicknames in any script, tidied', () => {
    for (const name of ['Lucky Cat', 'みけ', 'メダル王', 'night_owl', 'Ace-7', 'ねこ・まる', 'Zoë', '小判']) expect(checkName(name)).toEqual({ ok: true, name });
    expect(checkName('  Lucky   Cat  ')).toEqual({ ok: true, name: 'Lucky Cat' });
    // Full-width letters and half-width kana come out as plain ones.
    expect(checkName('ＬＵＣＫＹ')).toEqual({ ok: true, name: 'LUCKY' });
    expect(checkName('ﾈｺ')).toEqual({ ok: true, name: 'ネコ' });
  });

  it('is between two and twelve characters, counted as characters, not bytes', () => {
    expect(checkName('')).toEqual({ ok: false, reason: 'empty' });
    expect(checkName('   ')).toEqual({ ok: false, reason: 'empty' });
    expect(checkName(null)).toEqual({ ok: false, reason: 'empty' });
    expect(checkName('a')).toEqual({ ok: false, reason: 'short' });
    expect(checkName('あ'.repeat(NAME_MAX)).ok).toBe(true);
    expect(checkName('あ'.repeat(NAME_MAX + 1))).toEqual({ ok: false, reason: 'long' });
  });

  it('is never an email, a link or a phone number', () => {
    for (const name of ['me@example.com', 'a＠b', 'www.site', 'cats.com', 'http cat', '090 1234 5678', '5551234567']) expect(checkName(name), name).toEqual({ ok: false, reason: 'contact' });
  });

  it('has no emoji, symbols, or invisible and right-to-left characters', () => {
    for (const name of ['cat\u{1f431}', 'a<b>', 'x\u200by', 'ab\u202e', 'bell\u0007', 'a/b', 'e\u0301\u0301x']) expect(checkName(name).ok, JSON.stringify(name)).toBe(false);
  });

  it('cannot pass for the site, its owner or staff, or somebody’s default name', () => {
    for (const name of ['Admin', 'admin2', 'Official', 'Yudai', 'yudai fan', '運営', '公式さん', 'スタッフ', 'Player 1234', 'player', 'プレイヤー5678', '1234']) {
      expect(checkName(name), name).toEqual({ ok: false, reason: 'reserved' });
    }
  });

  it('refuses the obvious abuse in English and Japanese, however it is spelled', () => {
    for (const name of ['fuck', 'FUUUCK', 'f u c k', 'sh1t', 'b1tch', 'ass', 'big ass', 'ちんこ', 'チンコ', 'ﾁﾝｺ', '死ね', 'しね', 'ファック', 'kys']) {
      expect(checkName(name), name).toEqual({ ok: false, reason: 'abuse' });
    }
  });

  it('lets through harmless names that only contain a short bad word', () => {
    for (const name of ['Grape', 'Class', 'Cucumber', 'Bass', 'Torpedo', 'Shiitake', 'Tittle']) expect(checkName(name).ok, name).toBe(true);
  });

  it('gives a new player four digits', () => {
    expect(tagFrom(0)).toBe('0000');
    expect(tagFrom(0.1234)).toBe('1234');
    expect(tagFrom(0.99999)).toBe('9999');
  });
});

describe('the floor’s days and weeks, in Japan time', () => {
  // 2026-10-17 is a Saturday.
  const at = (iso: string) => Date.parse(iso);

  it('starts a day at midnight in Japan, whatever the time zone of the machine it runs on', () => {
    expect(dayStart(at('2026-10-17T14:59:59Z'))).toBe(at('2026-10-16T15:00:00Z'));
    expect(dayStart(at('2026-10-17T15:00:00Z'))).toBe(at('2026-10-17T15:00:00Z'));
    expect(periodAt('day', at('2026-10-17T06:00:00Z'))).toEqual({ kind: 'day', key: '2026-10-17', id: 'day-2026-10-17', start: at('2026-10-16T15:00:00Z'), end: at('2026-10-17T15:00:00Z') });
  });

  it('starts a week on Monday', () => {
    expect(weekStart(at('2026-10-17T06:00:00Z'))).toBe(at('2026-10-11T15:00:00Z'));
    expect(periodAt('week', at('2026-10-17T06:00:00Z')).key).toBe('2026-10-12');
    // Sunday night in Japan is still the same week; Monday 00:00 starts the next.
    expect(periodAt('week', at('2026-10-18T14:59:59Z')).key).toBe('2026-10-12');
    expect(periodAt('week', at('2026-10-18T15:00:00Z')).key).toBe('2026-10-19');
    expect(periodBefore('week', at('2026-10-17T06:00:00Z')).key).toBe('2026-10-05');
    expect(periodBefore('day', at('2026-10-17T06:00:00Z')).key).toBe('2026-10-16');
  });

  it('runs across a year’s end', () => {
    expect(periodAt('week', at('2027-01-01T03:00:00Z')).key).toBe('2026-12-28');
    expect(periodAt('day', at('2026-12-31T15:30:00Z')).key).toBe('2027-01-01');
  });
});

describe('reports', () => {
  it('are taken in their checked shape only', () => {
    expect(checkReport({ game: 'slot-machine', won: 30, best: 15, extra: 'ignored' })).toEqual({ ok: true, report: { game: 'slot-machine', won: 30, best: 15 } });
    // A moment is a biggest win too.
    expect(checkReport({ game: 'janken', won: 160, moment: { medals: 160, label: 'double-up' } })).toEqual({
      ok: true,
      report: { game: 'janken', won: 160, best: 160, moment: { medals: 160, label: 'double-up' } },
    });
    expect(checkReport({ game: 'medal-pusher', moment: { medals: 600, label: 'jackpot' } })).toEqual({ ok: true, report: { game: 'medal-pusher', won: 0, best: 600, moment: { medals: 600, label: 'jackpot' } } });
    for (const body of [null, 1, 'x', [], {}, { game: 'slot-machine' }, { game: 'slot-machine', won: '5' }, { game: 'slot-machine', won: 5, moment: [] }, { game: 'slot-machine', won: 5, moment: { medals: 5, label: 7 } }]) {
      expect(checkReport(body).ok, JSON.stringify(body)).toBe(false);
    }
  });

  it('believe a machine’s medals won at up to its fastest, and a full allowance for a new player', () => {
    const rule = FLOOR_RULES['slot-machine'];
    expect(allowanceAt('slot-machine', undefined, 0)).toBe(rule.burst);
    expect(allowanceAt('slot-machine', { level: 0, at: 0 }, 30_000)).toBe(rule.perMinute / 2);
    expect(allowanceAt('slot-machine', { level: 0, at: 0 }, 60 * 60_000)).toBe(rule.burst);
    // A clock that went backwards refills nothing.
    expect(allowanceAt('slot-machine', { level: 10, at: 60_000 }, 0)).toBe(10);
    expect(countable(500, 300.7, 0)).toBe(300);
    expect(countable(500, 10_000, DAILY_WON_MOST - 20)).toBe(20);
    expect(countable(500, 10_000, DAILY_WON_MOST + 5)).toBe(0);
  });

  it(`come at most ${REPORTS_PER_MINUTE} a minute from one player`, () => {
    let window = nextWindow(undefined, 60_000);
    for (let index = 1; index < REPORTS_PER_MINUTE; index += 1) window = nextWindow(window!, 60_500);
    expect(window).toEqual({ minute: 1, count: REPORTS_PER_MINUTE });
    expect(nextWindow(window!, 119_999)).toBeNull();
    expect(nextWindow(window!, 120_000)).toEqual({ minute: 2, count: 1 });
  });
});

describe('reports of medals played', () => {
  it('are taken alone or with a win, in whole medals, no more at once than the machine’s allowance holds', () => {
    expect(checkReport({ game: 'slot-machine', played: 90 })).toEqual({ ok: true, report: { game: 'slot-machine', won: 0, played: 90 } });
    expect(checkReport({ game: 'slot-machine', won: 30, played: 90 })).toEqual({ ok: true, report: { game: 'slot-machine', won: 30, played: 90 } });
    expect(checkReport({ game: 'slot-machine', won: 30, played: 0 })).toEqual({ ok: true, report: { game: 'slot-machine', won: 30 } });
    const rule = FLOOR_RULES.roulette;
    expect(checkReport({ game: 'roulette', played: rule.playBurst }).ok).toBe(true);
    for (const played of [rule.playBurst + 1, -1, 1.5, '90', Number.NaN, Number.POSITIVE_INFINITY, 2 ** 60]) {
      expect(checkReport({ game: 'roulette', played }), String(played)).toEqual({ ok: false, error: 'Medals played out of range' });
    }
    expect(checkReport({ game: 'slot-machine', won: 0, played: 0 })).toEqual({ ok: false, error: 'Nothing to report' });
  });

  it('believe a machine’s medals played at up to its fastest, and a full allowance for a new player', () => {
    const rule = FLOOR_RULES['medal-pusher'];
    expect(playAllowanceAt('medal-pusher', undefined, 0)).toBe(rule.playBurst);
    expect(playAllowanceAt('medal-pusher', { level: 0, at: 0 }, 60_000)).toBe(rule.perMinute);
    expect(playAllowanceAt('medal-pusher', { level: 0, at: 0 }, 3_600_000)).toBe(rule.playBurst);
    expect(playAllowanceAt('medal-pusher', { level: Number.NaN, at: 0 }, 0)).toBe(rule.playBurst);
    expect(countablePlayed(500, 300.7, 0)).toBe(300);
    expect(countablePlayed(500, 10_000, DAILY_PLAYED_MOST - 120)).toBe(120);
    expect(countablePlayed(500, 10_000, DAILY_PLAYED_MOST)).toBe(0);
  });
});

describe('what the floor shows', () => {
  const doc = (name: string) => ({ name, tag: '0001', pid: '0123456789abcdef' });

  it('ranks a board by score, the earlier first between equals, which share a rank', () => {
    const rows = ranked(
      [
        { doc: doc('c'), score: 50, at: 3, hidden: false },
        { doc: doc('a'), score: 90, at: 9, hidden: false },
        { doc: doc('b'), score: 50, at: 1, hidden: false },
        { doc: doc('d'), score: 10, at: 1, hidden: false },
        { doc: doc('zero'), score: 0, at: 1, hidden: false },
      ],
      3,
      false,
    );
    expect(rows.map((row) => [row.rank, row.name, row.score])).toEqual([
      [1, 'a', 90],
      [2, 'b', 50],
      [2, 'c', 50],
    ]);
    expect(rows[0]).not.toHaveProperty('pid');
  });

  it('leaves hidden lines out, and shows the owner them marked, taking nobody’s place', () => {
    const lines = [
      { doc: doc('cheat'), score: 999, at: 1, hidden: true },
      { doc: doc('a'), score: 90, at: 1, hidden: false },
      { doc: doc('b'), score: 80, at: 1, hidden: false },
    ];
    expect(ranked(lines, 1, false).map((row) => [row.rank, row.name])).toEqual([[1, 'a']]);
    expect(ranked(lines, 1, true).map((row) => [row.rank, row.name, row.hidden])).toEqual([
      [0, 'cheat', true],
      [1, 'a', false],
    ]);
  });

  it('reads the moments on show newest first, leaving out anything malformed', () => {
    const feed = feedFrom({
      s01: { id: 1, tag: '0001', game: 'slot-machine', label: 'seven3', medals: 3_000, at: 5 },
      s02: { id: 2, tag: '0002', name: 'Lucky Cat', game: 'janken', medals: 40, at: 6 },
      s03: { id: 3, tag: '0003', game: 'pachislot', medals: 40, at: 7 },
      s04: { id: 'x', tag: '0004', game: 'janken', medals: 40, at: 7 },
      s05: null,
    });
    expect(feed).toEqual([
      { id: 2, name: 'Lucky Cat', tag: '0002', game: 'janken', label: null, medals: 40, at: 6 },
      { id: 1, name: null, tag: '0001', game: 'slot-machine', label: 'seven3', medals: 3_000, at: 5 },
    ]);
    expect(feedFrom(null)).toEqual([]);
  });
});
