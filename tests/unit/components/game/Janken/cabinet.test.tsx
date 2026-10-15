import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it } from 'vitest';

import { COUNTER_PLACES, lampAt, spinPath, spinWaits, SPIN } from '@/components/game/Janken/Cabinet';
import { HANDS, LAMPS } from '@/components/game/Janken/engine';
import { STRINGS } from '@/components/game/Janken/i18n';
import { Janken } from '@/components/game/Janken/Janken';
import { keyAction } from '@/components/game/Janken/keys';
import { histogram } from '@/components/game/Janken/OddsTab';
import { SOUNDS, PEAK, pitch, renderSound } from '@/components/game/Janken/sounds';
import { FLOOR } from '@/components/game/MedalCenter/MedalCenter';
import { NOT_MONEY } from '@/components/game/MedalCenter/strings';
import { games } from '@/components/game/constants/games';
import { GameLanguageProvider } from '@/components/game/contexts/GameLanguageContext';
import { createI18nInstance } from '@/lib/i18n';

const render = (lang: 'en' | 'ja' = 'en') =>
  renderToStaticMarkup(
    <I18nextProvider i18n={createI18nInstance(lang)}>
      <GameLanguageProvider>
        <Janken />
      </GameLanguageProvider>
    </I18nextProvider>,
  );

describe('the page, as the server sends it', () => {
  it('shows the cabinet with nothing playable until the medals have been found', () => {
    const html = render();
    expect(html).toContain('data-testid="janken-cabinet" data-phase="idle" data-ready="false"');
    expect(html).toMatch(/data-testid="janken-medals" data-loaded="false">—</);
    for (const hand of HANDS) expect(html).toMatch(new RegExp(`<button[^>]*data-testid="janken-hand-${hand}"[^>]*disabled=""`));
    expect(html).toMatch(/<button[^>]*data-testid="janken-medal-in"[^>]*disabled=""/);
    // The counter of medals has its places, every segment dark; so has the counter of medals won.
    expect(html.match(/<polygon[^>]*data-on="true"/g)).toBeNull();
    expect(html.match(/<polygon[^>]*data-on="false"/g)?.length).toBe((COUNTER_PLACES + 3) * 7);
    // Thirty lamps on the ring, each with its medals.
    expect(html.match(/data-tone="(one|two|three|five|ten)"/g)?.length).toBeGreaterThanOrEqual(LAMPS.length);
    expect(html).toContain('data-testid="janken-not-money"');
    expect(html).toContain(NOT_MONEY.en);
    expect(html).toContain('href="/games/medal-center"');
  });

  it('reads in Japanese, with the note that medals are not money', () => {
    const html = render('ja');
    expect(html).toContain('みけじゃんけん');
    expect(html).toContain('持ちメダル');
    expect(html).toContain(NOT_MONEY.ja);
    expect(html).toContain('グー');
    expect(html).toContain('あそびかた');
  });

  it('is in the catalog under its own path, and open on the medal center’s floor', () => {
    const entry = games.find((game) => game.id === 'janken');
    expect(entry).toMatchObject({ path: '/games/janken', category: 'Arcade', title: 'Calico Janken' });
    expect(FLOOR.find(({ id }) => id === 'janken')?.path).toBe(entry?.path);
  });
});

describe('the ring and the roulette', () => {
  it('stands its lamps on the circle at the same rounded places on the server and in the browser', () => {
    expect(lampAt(0)).toEqual({ x: 200, y: 20 });
    expect(lampAt(15)).toEqual({ x: 200, y: 380 });
    for (let i = 0; i < LAMPS.length; i++) {
      const { x, y } = lampAt(i);
      expect(Number.isInteger(Math.round(x * 100))).toBe(true);
      expect(Math.hypot(x - 200, y - 200)).toBeCloseTo(180, 1);
    }
  });

  it('runs the light round once and on to the lamp drawn, slowing as it goes', () => {
    for (const [from, to] of [
      [0, 15],
      [15, 0],
      [7, 7],
      [29, 0],
    ]) {
      const path = spinPath(from, to);
      expect(path.at(-1)).toBe(to);
      expect(path.length).toBe(SPIN.turns * LAMPS.length + ((to - from + LAMPS.length) % LAMPS.length));
      for (let i = 1; i < path.length; i++) expect(path[i]).toBe((path[i - 1] + 1) % LAMPS.length);
      const waits = spinWaits(path.length);
      for (let i = 1; i < waits.length; i++) expect(waits[i]).toBeGreaterThanOrEqual(waits[i - 1]);
      const total = waits.reduce((a, b) => a + b, 0);
      // A real lamp roulette runs for a few seconds: between about two and five here.
      expect(total).toBeGreaterThan(1500);
      expect(total).toBeLessThan(5500);
    }
  });
});

describe('the keys', () => {
  it('puts a medal in with M, throws with 1 2 3 or G C P, doubles up with D and takes with T', () => {
    expect(keyAction({ key: 'm' })).toEqual({ type: 'insert' });
    expect(keyAction({ key: 'M' })).toEqual({ type: 'insert' });
    expect(keyAction({ key: '1' })).toEqual({ type: 'hand', hand: 'gu' });
    expect(keyAction({ key: '2' })).toEqual({ type: 'hand', hand: 'choki' });
    expect(keyAction({ key: '3' })).toEqual({ type: 'hand', hand: 'pa' });
    expect(keyAction({ key: 'g' })).toEqual({ type: 'hand', hand: 'gu' });
    expect(keyAction({ key: 'C' })).toEqual({ type: 'hand', hand: 'choki' });
    expect(keyAction({ key: 'p' })).toEqual({ type: 'hand', hand: 'pa' });
    expect(keyAction({ key: 'd' })).toEqual({ type: 'double' });
    expect(keyAction({ key: 't' })).toEqual({ type: 'collect' });
  });

  it('leaves alone a key with a modifier, a key held down, any other key, and typing in a field', () => {
    expect(keyAction({ key: '1', ctrlKey: true })).toBeNull();
    expect(keyAction({ key: 'm', metaKey: true })).toBeNull();
    expect(keyAction({ key: 'd', altKey: true })).toBeNull();
    expect(keyAction({ key: '1', repeat: true })).toBeNull();
    expect(keyAction({ key: 'Enter' })).toBeNull();
    expect(keyAction({ key: ' ' })).toBeNull();
    expect(keyAction({ key: 'x' })).toBeNull();
    const field = { closest: (selector: string) => (selector.includes('input') ? {} : null), isContentEditable: false } as unknown as EventTarget;
    expect(keyAction({ key: '1', target: field })).toBeNull();
    const button = { closest: () => null, isContentEditable: false } as unknown as EventTarget;
    expect(keyAction({ key: '1', target: button })).toEqual({ type: 'hand', hand: 'gu' });
  });
});

describe('the words', () => {
  // The owner: 「本当のお金と誤解される書き方はしないでほしい。」 Nothing a player reads may sound like money, except
  // the note that says medals are not money.
  const EN_FORBIDDEN = /\b(bank|deposit|deposited|withdraw|withdrawn|cash|money|balance|credits?)\b|\$/i;
  const JA_FORBIDDEN = /預け|預かり|引き出し|入金|出金|残高|お金|円|換金/;

  /** Every string a language has, functions called with sample values. */
  const texts = (lang: 'en' | 'ja'): string[] => {
    const out: string[] = [];
    const walk = (value: unknown) => {
      if (typeof value === 'string') out.push(value);
      else if (typeof value === 'function') {
        for (const sample of [
          [1, 2, 3],
          ['1', '2', 'win', 'play'],
          ['1', '2', 'lose', 'double'],
          [5, 5, true],
        ])
          walk((value as (...args: unknown[]) => unknown)(...sample));
      } else if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === 'object') Object.values(value).forEach(walk);
    };
    walk(STRINGS[lang]);
    return out;
  };

  it('never speaks of medals as money in English, but for the note that they are not', () => {
    const offending = texts('en')
      .map((text) => text.replace(NOT_MONEY.en, '').replace('They are not money: they cannot be bought, cashed out or exchanged for anything.', ''))
      .filter((text) => EN_FORBIDDEN.test(text));
    expect(offending).toEqual([]);
    expect(STRINGS.en.notMoney).toBe(NOT_MONEY.en);
  });

  it('never speaks of medals as money in Japanese, but for the note that they are not', () => {
    const offending = texts('ja')
      .map((text) => text.replace(NOT_MONEY.ja, '').replace('お金ではなく、購入・換金・景品との交換はできません。', ''))
      .filter((text) => JA_FORBIDDEN.test(text));
    expect(offending).toEqual([]);
    expect(STRINGS.ja.notMoney).toBe(NOT_MONEY.ja);
  });

  it('has every string in both languages', () => {
    expect(Object.keys(STRINGS.ja).sort()).toEqual(Object.keys(STRINGS.en).sort());
    expect(STRINGS.ja.infoBody).toHaveLength(STRINGS.en.infoBody.length);
    expect(STRINGS.ja.plateSteps).toHaveLength(STRINGS.en.plateSteps.length);
  });
});

describe('the sounds', () => {
  it('makes every sound from numbers alone: it begins and ends in silence and is never louder than the peak', () => {
    for (const sound of SOUNDS) {
      const samples = renderSound(sound, 22050);
      expect(samples.length, sound).toBeGreaterThan(100);
      expect(samples.length / 22050, sound).toBeLessThan(2);
      let loudest = 0;
      for (const v of samples) {
        expect(Number.isFinite(v), sound).toBe(true);
        loudest = Math.max(loudest, Math.abs(v));
      }
      // Brought to the peak, less what the fade at its start takes from a sound that is loudest at once (the click).
      expect(loudest, sound).toBeLessThanOrEqual(PEAK + 1e-6);
      expect(loudest, sound).toBeGreaterThan(PEAK * 0.6);
      expect(Math.abs(samples[0]), sound).toBeLessThan(0.01);
      expect(Math.abs(samples[samples.length - 1]), sound).toBeLessThan(0.01);
    }
  });

  it('tunes its notes from A4 = 440 Hz', () => {
    expect(pitch('A4')).toBe(440);
    expect(pitch('A5')).toBe(880);
    expect(pitch('C4')).toBeCloseTo(261.63, 1);
  });
});

describe('the Odds tab’s chart', () => {
  it('gathers every session into one bar or another', () => {
    const nets = [-10, -3, 0, 0, 4, 25, 25, 160];
    const bars = histogram(nets, 8);
    expect(bars.reduce((sum, bar) => sum + bar.count, 0)).toBe(nets.length);
    expect(bars[0].from).toBe(-10);
    expect(bars.at(-1)!.to).toBeGreaterThanOrEqual(160);
    expect(histogram([])).toEqual([]);
  });
});
