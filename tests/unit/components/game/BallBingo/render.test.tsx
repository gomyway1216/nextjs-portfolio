import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it } from 'vitest';

import { BallBingo } from '@/components/game/BallBingo';
import { Board } from '@/components/game/BallBingo/Board';
import { Card } from '@/components/game/BallBingo/Card';
import { FULL_CARD, POCKETS, START, after, analyzeMachine, pocketOfNumber } from '@/components/game/BallBingo/engine';
import { CUPS, FOOT_POCKETS, PINS } from '@/components/game/BallBingo/field';
import { STRINGS, getStrings } from '@/components/game/BallBingo/i18n';
import { OddsTab } from '@/components/game/BallBingo/OddsTab';
import { BALL_PLACES, MEDAL_PLACES, PlayTab, WIN_PLACES } from '@/components/game/BallBingo/PlayTab';
import { keyParts } from '@/components/game/MedalCenter/KeysHint';
import { MEDAL_CENTER_PATH } from '@/components/game/MedalCenter/paths';
import { NOT_MONEY } from '@/components/game/MedalCenter/strings';
import { createI18nInstance } from '@/lib/i18n';

const render = (node: React.ReactNode, lang: 'en' | 'ja' = 'en') => renderToStaticMarkup(<I18nextProvider i18n={createI18nInstance(lang)}>{node}</I18nextProvider>);

describe('the machine, as the server sends it', () => {
  it('waits for the medals: its LEDs dark but the bet’s and the balls’, START not yet pressable, the card blank', () => {
    const markup = render(<PlayTab />);
    expect(markup).toContain('data-testid="bingo-medals" data-loaded="false">—<');
    expect(markup).toMatch(/<button[^>]*data-testid="bingo-start"[^>]*disabled=""/);
    expect(markup).toMatch(/<button[^>]*data-testid="bingo-skip"[^>]*disabled=""/);
    // Seven-segment displays for the medals, the bet, the balls and the win: every segment there.
    expect(markup.match(/<polygon[^>]*data-on="/g)).toHaveLength((MEDAL_PLACES + 1 + BALL_PLACES + WIN_PLACES) * 7);
    expect(markup).toContain('data-testid="bingo-card"');
    expect(markup).toMatch(/data-testid="bingo-card"[^>]*data-marks="0"/);
    expect(markup.match(/data-marked="true"/g)).toBeNull();
    // Bet 1, 2 or 3; the pay glass at the bet chosen; the exact return beside it.
    expect(markup.match(/role="radio"/g)).toHaveLength(3);
    expect(markup).toContain('aria-checked="true" aria-label="Bet 1 medal a game"');
    expect(markup).toContain(`${(analyzeMachine().rtp * 100).toFixed(3)}%`);
    // The note that medals are not money is under the machine, with the way to the medal center.
    expect(markup).toContain(NOT_MONEY.en);
    expect(markup).toContain(`href="${MEDAL_CENTER_PATH}"`);
    // No reset and no refill of its own until there are no medals: both are the medal center's.
    expect(markup).not.toContain('bingo-refill');
    expect(markup).not.toContain('bingo-card-away');
  });

  it('draws the field from the numbers the flights are worked out against: every pin, cup and pocket, numbered', () => {
    const markup = render(<Board marks={0} frees={0} chance={false} waiting={false} pulling={false} flight={null} flightKey={0} flash={null} label="field" />);
    // Every pin and the gradient that colours them.
    expect(markup.match(/fill="url\(#bb-pin\)"/g)).toHaveLength(PINS.length);
    for (const cup of CUPS) expect(markup).toContain(`data-testid="bingo-cup-${POCKETS[cup.pocket].id}"`);
    for (const foot of FOOT_POCKETS) expect(markup).toContain(`data-testid="bingo-pocket-${POCKETS[foot.pocket].id}"`);
    expect(markup.match(/data-open="true"/g)).toHaveLength(3);
    // The same drawing every time: nothing in it depends on when or where it is drawn.
    expect(render(<Board marks={0} frees={0} chance={false} waiting={false} pulling={false} flight={null} flightKey={0} flash={null} label="field" />)).toBe(markup);
  });

  it('stands a ball in each pocket that holds one, shuts the cups whose lamps are out, and lights the card’s numbers and lines', () => {
    let state = START;
    for (const n of [2, 7, 6, 5]) state = after(state, pocketOfNumber(n));
    state = after(state, POCKETS.findIndex((p) => p.id === 'chance'));
    const board = render(<Board marks={state.marks} frees={state.frees} chance={state.chance} waiting pulling={false} flight={null} flightKey={0} flash={null} label="field" />);
    expect(board.match(/data-filled="true"/g)).toHaveLength(4);
    expect(board).toMatch(/data-testid="bingo-cup-chance"[^>]*/);
    expect(board).toMatch(/data-kind="chance" data-open="false"/);
    expect(board).toContain('data-testid="bingo-waiting"');
    const card = render(<Card marks={state.marks} live fresh={5} label="card" />);
    expect(card.match(/data-marked="true"/g)).toHaveLength(4);
    expect(card).toContain('data-lines="1"');
    // 2 and 5 marked: 8 finishes the diagonal; 7 and 5: 3 finishes the column; 6 and 5: 4 finishes the other diagonal.
    expect(card.match(/data-reach="true"/g)).toHaveLength(3);
    expect(render(<Card marks={FULL_CARD} live={false} fresh={null} label="card" />)).toContain('data-lines="8"');
  });
});

describe('the page', () => {
  it('has the machine and its Odds tab, the floor jackpot over them, in English and in Japanese', () => {
    const en = render(<BallBingo />);
    expect(en).toContain('Ball Bingo');
    expect(en).toContain('data-testid="floor-jackpot-strip"');
    expect(en).toContain('id="bingo-tab-machine"');
    expect(en).toContain('id="bingo-tab-odds"');
    expect(en).toContain('BALL BINGO');
    const ja = render(<BallBingo />, 'ja');
    expect(ja).toContain('ボールビンゴ');
    expect(ja).toContain('持ちメダル');
    expect(ja).toContain(NOT_MONEY.ja);
  });

  it('shows the exact odds: the return, every count of lines, every pocket', () => {
    const odds = analyzeMachine();
    const markup = render(<OddsTab />);
    expect(markup).toContain(`${(odds.rtp * 100).toFixed(3)}%`);
    expect(markup).toContain('89.974%');
    expect(markup.match(/<tr data-lines="/g)).toHaveLength(9);
    expect(markup).toContain('cannot happen');
    expect(markup).toContain('12,747');
    for (const pocket of POCKETS) expect(markup).toContain(`${pocket.weight} / 144`);
    const ja = render(<OddsTab />, 'ja');
    expect(ja).toContain('89.974%');
    expect(ja).toContain('ありえない');
  });
});

describe('the words', () => {
  // The owner: 「本当のお金と誤解される書き方はしないでほしい。」 Nothing a player reads may sound like money, except
  // the note that says medals are not money.
  const EN_FORBIDDEN = /\b(bank|deposit|deposited|withdraw|withdrawn|cash|money|balance|credits?)\b|\$/i;
  const JA_FORBIDDEN = /預け|預かり|引き出し|入金|出金|残高|お金|円|換金/;

  const texts = (lang: 'en' | 'ja'): string[] => {
    const out: string[] = [];
    const walk = (value: unknown) => {
      if (typeof value === 'string') out.push(value);
      else if (typeof value === 'function') {
        // Every function is called with every kind of thing its words are made of; those it does not take are passed over.
        for (const sample of [[1, 2, 3], ['90.00%'], [[1, 5, 9], 2], [[], 0], ['number', 5], ['out', 0], [8, 1500], ['FREE', true]]) {
          let said: unknown;
          try {
            said = (value as (...args: unknown[]) => unknown)(...sample);
          } catch {
            continue;
          }
          walk(said);
        }
      } else if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === 'object') Object.values(value).forEach(walk);
    };
    walk(STRINGS[lang]);
    return out;
  };

  it('never speaks of medals as money, in either language, but for the note that they are not', () => {
    expect(texts('en').map((text) => text.replace(NOT_MONEY.en, '')).filter((text) => EN_FORBIDDEN.test(text))).toEqual([]);
    expect(texts('ja').map((text) => text.replace(NOT_MONEY.ja, '')).filter((text) => JA_FORBIDDEN.test(text))).toEqual([]);
    expect(STRINGS.en.notMoney).toBe(NOT_MONEY.en);
    expect(STRINGS.ja.notMoney).toBe(NOT_MONEY.ja);
    expect(STRINGS.en.infoBody('90%')).toContain(NOT_MONEY.en);
    expect(STRINGS.ja.infoBody('90%')).toContain(NOT_MONEY.ja);
  });

  it('names no real machine or maker on the page', () => {
    const real = /sega|konami|sigma|bally|galaxy|animalotta|fortune|trinity|セガ|コナミ|シグマ|アニマロッタ|フォーチュン/i;
    expect([...texts('en'), ...texts('ja')].filter((text) => real.test(text))).toEqual([]);
  });

  it('has every string in both languages, and a keys line that breaks only between its parts', () => {
    expect(Object.keys(STRINGS.ja).sort()).toEqual(Object.keys(STRINGS.en).sort());
    expect(STRINGS.ja.infoBody('x')).toHaveLength(STRINGS.en.infoBody('x').length);
    expect(STRINGS.ja.rules).toHaveLength(STRINGS.en.rules.length);
    expect(keyParts(getStrings('en').keysHint).length).toBeGreaterThan(2);
    expect(keyParts(getStrings('ja').keysHint).length).toBeGreaterThan(2);
  });
});
