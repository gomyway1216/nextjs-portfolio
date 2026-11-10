import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it } from 'vitest';

import { GameLog } from '@/components/game/KellyCriterion/GameLog';
import { PlayTab, effectiveStake } from '@/components/game/KellyCriterion/PlayTab';
import { CAP, MAX_FLIPS, SCENARIOS, START_BANKROLL, fixedFractionPath, kellyFraction, settle, type ScenarioId } from '@/components/game/KellyCriterion/engine';
import { getStrings } from '@/components/game/KellyCriterion/i18n';
import { againstKelly, finishReason, recordOf, tallyOf, type GameRecord } from '@/components/game/KellyCriterion/record';
import { createI18nInstance } from '@/lib/i18n';

const render = (node: React.ReactNode, lang: 'en' | 'ja' = 'en') =>
  renderToStaticMarkup(<I18nextProvider i18n={createI18nInstance(lang)}>{node}</I18nextProvider>);

/** Plays `flips` the way the table does, staking `fraction(i)` of the bankroll on flip i, and stops when the game is over. */
function play(scenario: ScenarioId, flips: readonly boolean[], fraction: (index: number) => number) {
  const path = [START_BANKROLL];
  const fractions: number[] = [];
  const played: boolean[] = [];
  for (let i = 0; i < flips.length; i++) {
    const before = path[path.length - 1];
    if (finishReason(before, i) !== null) break;
    const stake = effectiveStake(before, fraction(i));
    path.push(settle(before, stake, flips[i], SCENARIOS[scenario].b));
    fractions.push(stake / before);
    played.push(flips[i]);
  }
  return { scenario, flips: played, path, fractions };
}

const recordFor = (scenario: ScenarioId, flips: readonly boolean[], fraction: (index: number) => number) => {
  const game = play(scenario, flips, fraction);
  return recordOf(game.scenario, game.flips, game.path, game.fractions);
};

const pattern = (count: number, win: (index: number) => boolean) => Array.from({ length: count }, (_, i) => win(i));
/** Three wins to two losses, in turn: a 60% coin with no luck in it. */
const steady = pattern(MAX_FLIPS, (i) => i % 5 < 3);

describe('finishReason', () => {
  it('names why play is over, or says it is not', () => {
    expect(finishReason(START_BANKROLL, 0)).toBeNull();
    expect(finishReason(0.01, 299)).toBeNull();
    expect(finishReason(0, 1)).toBe('bust');
    expect(finishReason(CAP, 4)).toBe('cap');
    expect(finishReason(100, MAX_FLIPS)).toBe('flips');
    // The last flip can also be the one that busts or reaches the cap.
    expect(finishReason(0, MAX_FLIPS)).toBe('bust');
    expect(finishReason(CAP, MAX_FLIPS)).toBe('cap');
  });
});

describe('recordOf', () => {
  it('has nothing to record while the game is going', () => {
    expect(recordFor('coin60', [], () => 0.2)).toBeNull();
    expect(recordFor('coin60', [true, false, true], () => 0.2)).toBeNull();
  });

  it('records an all-in bust beside the Kelly stake on the same flips', () => {
    const record = recordFor('coin60', [true, false, true, true], () => 1)!;
    // $25 → $50 → nothing; the flips after the bust were never played. Kelly: $25 → $30 → $24.
    expect(record).toEqual({ scenario: 'coin60', reason: 'bust', flips: 2, final: 0, averageStake: 1, kellyFinal: 24 });
    expect(againstKelly(record)).toBe('behind');
  });

  it('records reaching the cap, where all in on four heads beats Kelly', () => {
    const record = recordFor('coin60', [true, true, true, true], () => 1)!;
    expect(record.reason).toBe('cap');
    expect(record.flips).toBe(4);
    expect(record.final).toBe(CAP);
    // 25 × 1.2⁴
    expect(record.kellyFinal).toBe(51.84);
    expect(againstKelly(record)).toBe('ahead');
  });

  it('is level with Kelly, to the cent, when the Kelly stake was played throughout', () => {
    const kelly = kellyFraction(SCENARIOS.edge53);
    // Eight wins in fifteen: a 53% coin with no luck in it, which never gets near the cap.
    const flips = pattern(MAX_FLIPS, (i) => i % 15 < 8);
    const record = recordFor('edge53', flips, () => kelly)!;
    const path = fixedFractionPath(SCENARIOS.edge53, kelly, flips);
    expect(record.reason).toBe('flips');
    expect(record.flips).toBe(MAX_FLIPS);
    expect(record.kellyFinal).toBe(path[path.length - 1]);
    expect(record.final).toBe(record.kellyFinal);
    expect(againstKelly(record)).toBe('level');
    // Whole cents make each share a little off 6%.
    expect(record.averageStake).toBeGreaterThan(0.055);
    expect(record.averageStake).toBeLessThan(0.065);
  });

  it('averages the shares actually staked', () => {
    const record = recordFor('edge53', steady, (i) => (i % 2 === 0 ? 0.01 : 0.03))!;
    expect(record.reason).toBe('flips');
    expect(record.scenario).toBe('edge53');
    expect(record.averageStake).toBeGreaterThan(0.018);
    expect(record.averageStake).toBeLessThan(0.022);
  });

  it('uses the Kelly fraction of the bet that was played', () => {
    // One win in four at 4 to 1: the long shot with no luck in it.
    const flips = pattern(MAX_FLIPS, (i) => i % 4 === 3);
    const record = recordFor('longshot', flips, () => 0.02)!;
    const path = fixedFractionPath(SCENARIOS.longshot, 0.0625, flips);
    expect(record.flips).toBe(MAX_FLIPS);
    expect(record.kellyFinal).toBe(path[path.length - 1]);
    expect(againstKelly(record)).toBe('behind');
  });
});

const sample: GameRecord[] = [
  { scenario: 'coin60', reason: 'bust', flips: 2, final: 0, averageStake: 1, kellyFinal: 24 },
  { scenario: 'coin60', reason: 'cap', flips: 4, final: 250, averageStake: 1, kellyFinal: 51.84 },
  { scenario: 'longshot', reason: 'flips', flips: 300, final: 61.2, averageStake: 0.0625, kellyFinal: 61.2 },
  { scenario: 'edge53', reason: 'flips', flips: 300, final: 12.34, averageStake: 0.2512, kellyFinal: 40.01 },
  { scenario: 'coin60', reason: 'cap', flips: 31, final: 250, averageStake: 0.2, kellyFinal: 250 },
];

describe('tallyOf', () => {
  it('counts nothing when nothing is finished', () => {
    expect(tallyOf([])).toEqual({ games: 0, bust: 0, cap: 0, ahead: 0, behind: 0 });
  });

  it('counts busts, caps and the games that ended strictly ahead of or behind Kelly', () => {
    expect(tallyOf(sample)).toEqual({ games: 5, bust: 1, cap: 2, ahead: 1, behind: 2 });
  });

  it('compares to the cent, not to a rounding error', () => {
    const record: GameRecord = { scenario: 'coin60', reason: 'flips', flips: 300, final: 0.1 + 0.2, averageStake: 0.2, kellyFinal: 0.3 };
    expect(againstKelly(record)).toBe('level');
    expect(againstKelly({ ...record, final: 0.31 })).toBe('ahead');
    expect(againstKelly({ ...record, final: 0.29 })).toBe('behind');
  });
});

describe('GameLog', () => {
  const row = (markup: string, game: number) => markup.match(new RegExp(`<tr data-game="${game}"[^>]*>(.*?)</tr>`))![0];

  it('says what will be listed before any game is finished', () => {
    const markup = render(<GameLog records={[]} onClear={() => {}} />);
    expect(markup).toContain('No finished game yet.');
    expect(markup).toContain('reach the $250.00 cap or use all 300 flips');
    expect(markup).not.toContain('data-testid="kelly-log-table"');
    expect(markup).not.toContain('Clear the list');
  });

  it('is on the table from the start, empty', () => {
    const markup = render(<PlayTab />);
    expect(markup).toContain('data-testid="kelly-log"');
    expect(markup).toContain('data-testid="kelly-log-empty"');
  });

  it('lists the finished games newest first, numbered in the order they were played', () => {
    const markup = render(<GameLog records={sample} onClear={() => {}} />);
    expect([...markup.matchAll(/<tr data-game="(\d+)"/g)].map((m) => m[1])).toEqual(['5', '4', '3', '2', '1']);
    expect(row(markup, 1)).toContain('data-reason="bust" data-versus="behind"');
    expect(row(markup, 1)).toMatch(/<th scope="row">1<\/th><td[^>]*>60%, even money<\/td><td[^>]*>Bust<\/td><td[^>]*>2<\/td><td[^>]*>100%<\/td>/);
    expect(row(markup, 1)).toMatch(/data-col="you" data-sign="neg">\$0\.00<\/td><td[^>]*data-col="kelly">\$24\.00</);
    expect(row(markup, 2)).toMatch(/data-col="you" data-sign="pos">\$250\.00<\/td><td[^>]*data-col="kelly">\$51\.84</);
    expect(row(markup, 3)).toContain('>25%, 4 to 1<');
    expect(row(markup, 3)).toContain('>Out of flips<');
    expect(row(markup, 3)).toContain('>6.3%<');
    // Level with Kelly: no colour either way.
    expect(row(markup, 3)).toMatch(/data-col="you">\$61\.20</);
    expect(row(markup, 4)).toContain('>25.1%<');
    expect(row(markup, 5)).toContain('data-versus="level"');
  });

  it('adds the games up', () => {
    const markup = render(<GameLog records={sample} onClear={() => {}} />);
    const tally = (name: string) => markup.match(new RegExp(`<dd data-tally="${name}">(\\d+)</dd>`))![1];
    expect([tally('games'), tally('bust'), tally('cap'), tally('ahead')]).toEqual(['5', '1', '2', '1']);
    expect(markup).toContain('>Clear the list</button>');
    expect(markup).toContain('counts the games that ended with more money than staking the Kelly fraction on every one of the same flips');
  });

  it('can be scrolled from the keyboard, and the region says what it is', () => {
    const markup = render(<GameLog records={sample} onClear={() => {}} />);
    expect(markup).toMatch(/role="region" aria-label="Finished games, newest first" tabindex="0"/);
    expect(markup).toMatch(/<caption[^>]*>Finished games, newest first<\/caption>/);
    expect(markup.match(/<th scope="col"/g)).toHaveLength(7);
  });

  it('is localized, screen-reader text included', () => {
    const empty = render(<GameLog records={[]} onClear={() => {}} />, 'ja');
    expect(empty).toContain('まだ終了したゲームはありません。');
    expect(empty).toContain('上限の$250.00に届く、300回すべて投げる');
    const markup = render(<GameLog records={sample} onClear={() => {}} />, 'ja');
    expect(markup).toContain('aria-label="終了したゲーム（新しい順）"');
    expect(row(markup, 1)).toContain('>60%・1倍<');
    expect(row(markup, 1)).toContain('>破産<');
    expect(row(markup, 3)).toContain('>25%・4倍<');
    expect(row(markup, 3)).toContain('>回数終了<');
    expect(markup).toContain('>記録を消す</button>');
    expect(markup).not.toMatch(/Finished games|Clear the list|Out of flips|Bust</);
  });

  it('has every string in both languages', () => {
    const en = getStrings('en');
    const ja = getStrings('ja');
    const keys = (Object.keys(en) as (keyof typeof en)[]).filter((key) => key.startsWith('log'));
    expect(keys.length).toBeGreaterThanOrEqual(18);
    for (const key of keys) {
      expect(ja[key], key).toBeDefined();
      if (typeof en[key] === 'string') expect(ja[key], key).not.toBe(en[key]);
    }
    expect(Object.keys(ja.logReason).sort()).toEqual(['bust', 'cap', 'flips']);
  });
});
