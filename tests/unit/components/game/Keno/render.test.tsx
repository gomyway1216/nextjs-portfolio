import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it } from 'vitest';

import { Keno } from '@/components/game/Keno';
import { BALLS, LAST_BALL_TIMES } from '@/components/game/Keno/engine';
import { getStrings } from '@/components/game/Keno/i18n';
import { OddsTab } from '@/components/game/Keno/OddsTab';
import { BET_PLACES, MEDAL_PLACES, PlayTab, WIN_PLACES, phrasesOf } from '@/components/game/Keno/PlayTab';
import { MACHINE_PITCHES, MACHINE_ZONES, NAME_WORDS, NEW_MACHINES } from '@/components/game/MedalCenter/floorPlan';
import { MEDAL_CENTER_PATH } from '@/components/game/MedalCenter/paths';
import { NOT_MONEY } from '@/components/game/MedalCenter/strings';
import { games } from '@/components/game/constants/games';
import { createI18nInstance } from '@/lib/i18n';
import { linked } from '@/lib/medalFloor/jackpot';

const render = (node: React.ReactNode, lang: 'en' | 'ja' = 'en') => renderToStaticMarkup(<I18nextProvider i18n={createI18nInstance(lang)}>{node}</I18nextProvider>);
/** Words that would make the medals read as money, in either language. */
const MONEY = /\b(bank|deposit|withdraw|balance|cash|payout|wager)\b|\$|預け|残高|お金|換金|配当|賭け/i;

describe('the machine', () => {
  it('starts with its counters dark until the medals are read, the whole board of 80 numbers, DRAW and Skip waiting', () => {
    const markup = render(<PlayTab />);
    expect(markup).toContain('data-testid="kn-medals" data-loaded="false">—<');
    expect(markup.match(/data-testid="kn-cell-\d+"/g)).toHaveLength(BALLS);
    // Every number a button that says whether it is marked; the board one stop of the Tab key.
    expect(markup.match(/<button[^>]*data-testid="kn-cell-\d+"[^>]*aria-pressed="false"/g)).toHaveLength(BALLS);
    expect(markup.match(/<button[^>]*data-testid="kn-cell-\d+"[^>]*tabindex="0"/g)).toHaveLength(1);
    // The halves' switch for a phone, the line between the halves for a wider screen.
    expect(markup).toContain('data-testid="kn-half-top"');
    expect(markup).toContain('data-testid="kn-half-bottom"');
    expect(markup).toMatch(/<button[^>]*data-testid="kn-draw"[^>]*disabled=""/);
    expect(markup).toMatch(/<button[^>]*data-testid="kn-skip"[^>]*disabled=""/);
    expect(markup).toMatch(/<button[^>]*data-testid="kn-same"[^>]*disabled=""/);
    // The twenty places of the balls drawn, the last marked as the one that pays ×5.
    expect(markup.match(/data-last="true"/g)).toHaveLength(1);
    expect(markup).toContain(`>LAST BALL ×${LAST_BALL_TIMES}<`);
    expect(markup.match(/<polygon/g)).toHaveLength((MEDAL_PLACES + BET_PLACES + WIN_PLACES) * 7);
    expect(markup).toContain(NOT_MONEY.en);
    expect(markup).toContain(`href="${MEDAL_CENTER_PATH}"`);
    // No refill of its own until there are no medals, and no reset: both are the medal center's.
    expect(markup).not.toContain('kn-refill');
    expect(markup).not.toContain('kn-card-away');
  });

  it('is in Japanese too, the cabinet’s English only on its marquee, and no word of money in either language', () => {
    const markup = render(<PlayTab />, 'ja');
    expect(markup).toContain('持ちメダル');
    expect(markup).toContain('>ドロー<');
    expect(markup).toContain('>クイックピック<');
    expect(markup).toContain('>同じ数字<');
    expect(markup).toContain(NOT_MONEY.ja);
    expect(markup).not.toMatch(/>(DRAW|Skip|Quick pick|Erase|Same spots|LAST BALL[^<]*)</);
    for (const language of ['en', 'ja'] as const) {
      const said = (value: (...args: unknown[]) => unknown) => {
        for (const args of [[3, 2, 1], [{ spots: 4, caught: 3, won: 12, lastBall: true }], [[3, 17, 80]]]) {
          try {
            return value(...args);
          } catch {
            // Not the arguments it takes: the next.
          }
        }
        throw new Error(`no arguments for ${String(value)}`);
      };
      const words = JSON.stringify(getStrings(language), (_key, value) => (typeof value === 'function' ? said(value) : value));
      // The one place money is named: the line that says the medals are not it.
      expect(words.split(NOT_MONEY[language]).join(''), language).not.toMatch(MONEY);
    }
  });

  it('breaks its lines between phrases: after 、。：！… and at the zero-width spaces the words carry', () => {
    expect(phrasesOf('5個中3個当たり：​+12枚')).toEqual(['5個中3個当たり：', '+12枚']);
    expect(phrasesOf('Caught 3 of 5: +12')).toEqual(['Caught ', '3 ', 'of ', '5: ', '+12']);
  });

  it('shows the floor jackpot over it and its exact odds in the Odds tab', () => {
    const markup = render(<Keno />);
    expect(markup).toContain('data-testid="floor-jackpot-strip"');
    expect(markup).toContain('id="kn-tab-odds"');
    expect(linked('keno')).toBe(true);
    const odds = render(<OddsTab />);
    expect(odds).toContain('data-testid="kn-best">90.00%<');
    expect(odds).toContain('data-testid="kn-worst">89.68%<');
    expect(odds).toContain('data-testid="kn-back-10">89.98%<');
    expect(odds).toContain('As a fraction: 9/10.');
    expect(render(<OddsTab />, 'ja')).toContain('分数で：9/10');
  });
});

describe('on the floor', () => {
  it('stands in the video & slots corner, new, with a line of its own and its name in words', () => {
    expect(MACHINE_ZONES.keno).toBe('video');
    expect(NEW_MACHINES.has('keno')).toBe(true);
    expect(MACHINE_PITCHES.keno).toBeDefined();
    const title = games.find((game) => game.id === 'keno');
    expect(title?.path).toBe('/games/keno');
    expect(NAME_WORDS.keno.join('')).toBe('ビデオキノ');
  });
});
