import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it } from 'vitest';

import { Roulette } from '@/components/game/Roulette';
import { getStrings } from '@/components/game/Roulette/i18n';
import { NOT_MONEY } from '@/components/game/MedalCenter/strings';
import { createI18nInstance } from '@/lib/i18n';

describe('Roulette shell', () => {
  it('keeps every tab panel mounted and hides the inactive ones (a rolling spin survives a tab switch)', () => {
    const markup = renderToStaticMarkup(
      <I18nextProvider i18n={createI18nInstance('en')}>
        <Roulette />
      </I18nextProvider>,
    );
    const panels = [...markup.matchAll(/<div role="tabpanel" id="rl-panel-(\w+)"[^>]*?( hidden="")?>/g)];
    expect(panels.map((m) => [m[1], Boolean(m[2])])).toEqual([
      ['play', false],
      ['sim', true],
      ['edge', true],
    ]);
    // Each tab points at its own panel.
    for (const id of ['play', 'sim', 'edge']) {
      expect(markup).toMatch(new RegExp(`id="rl-tab-${id}" aria-selected="(true|false)" aria-controls="rl-panel-${id}"`));
    }
  });
});

const renderRoulette = (lang: 'en' | 'ja') =>
  renderToStaticMarkup(
    <I18nextProvider i18n={createI18nInstance(lang)}>
      <Roulette />
    </I18nextProvider>,
  );

/** What a player reads or hears of the markup: its text, and its accessible names and titles. */
const seen = (markup: string): string =>
  [
    ...markup.replace(/<[^>]+>/g, ' ').split(/\s+/),
    ...[...markup.matchAll(/(?:aria-label|title|alt)="([^"]*)"/g)].map((m) => m[1]),
  ].join(' ');

// The owner's rule: nothing that could be mistaken for real money. The note that medals are not money names money to
// say so, and is the one place that may.
const MONEY_EN = /\b(bank|bankroll|deposit|withdraw|cash|money|dollars?|balance|credits?|pay ?(in|out)s?|payouts?)\b|\$/i;
const MONEY_JA = /預け|預かり|引き出し|入金|出金|残高|お金|円|ドル|換金|所持金|資金|賭金|賭け金|マネー|キャッシュ|クレジット/;

/** Every string the game shows, its functions called with sample numbers. */
function everyString(lang: 'en' | 'ja'): string[] {
  const t = getStrings(lang);
  const out: string[] = [];
  for (const value of Object.values(t)) {
    if (typeof value === 'string') out.push(value);
    else if (Array.isArray(value)) out.push(...value);
    else if (typeof value === 'function') out.push(String((value as (...args: number[]) => unknown)(5, 3, 2)));
  }
  return out.filter((text) => text !== t.notMoney);
}

describe('the table on the medal center’s floor', () => {
  it('shows a medal counter and the note that medals are not money, in both languages, with a way to the medal center', () => {
    // The medal center's own words for it, in the player's language.
    expect(getStrings('en').notMoney).toBe(NOT_MONEY.en);
    expect(getStrings('ja').notMoney).toBe(NOT_MONEY.ja);
    const en = renderRoulette('en');
    expect(en).toMatch(/data-testid="roulette-meter" data-loaded="false"/);
    expect(en).toContain(getStrings('en').notMoney);
    expect(en).toContain('Medals are for playing the games on this site only. They are not money: they cannot be bought, cashed out or exchanged for anything.');
    expect(en).toMatch(/<a[^>]*href="\/games\/medal-center"[^>]*data-testid="roulette-center"/);
    expect(en).toMatch(/<a[^>]*href="\/games\/medal-center"[^>]*data-testid="roulette-center-note-link"/);
    // Nothing is bet until the medals have been found: the felt and SPIN wait.
    expect(en).toMatch(/<button[^>]*disabled=""[^>]*>SPIN<\/button>/);
    expect(en).toMatch(/aria-label="Straight up \(35:1\) — 17"[^>]*disabled=""|disabled=""[^>]*aria-label="Straight up \(35:1\) — 17"/);
    // The one-time note is in the server's drawing, with its gate, which hides it before the first paint where this
    // device has seen it: the table never moves for it (MedalCenter/onceNote.tsx).
    expect(en).toMatch(/<script>[^<]*roulette-medals-notice-v1[^<]*<\/script><div[^>]*data-testid="roulette-notice"[^>]*data-once-note="roulette"/);
    // No reset of the table's own: the medals are reset only at the medal center.
    expect(seen(en)).not.toMatch(/\bReset\b/);

    const ja = renderRoulette('ja');
    expect(ja).toContain('メダルはこのサイトのゲームで遊ぶためだけのものです。お金ではなく、購入・換金・景品との交換はできません。');
    expect(ja).toContain('持ちメダル');
  });

  it('never speaks of money: no bank, balance, bankroll or cash in what a player reads, in either language', () => {
    for (const text of everyString('en')) expect(text).not.toMatch(MONEY_EN);
    for (const text of everyString('ja')) expect(text).not.toMatch(MONEY_JA);
    const strip = (markup: string, lang: 'en' | 'ja') => seen(markup).split(getStrings(lang).notMoney).join(' ');
    expect(strip(renderRoulette('en'), 'en')).not.toMatch(MONEY_EN);
    expect(strip(renderRoulette('ja'), 'ja')).not.toMatch(MONEY_JA);
  });

  it('says what the table takes: at least one medal a bet, at most 99 on a spot', () => {
    expect(getStrings('en').outsideHint).toContain('at least 1 a bet and up to 99 on one spot');
    expect(getStrings('ja').outsideHint).toContain('1か所99枚まで');
    expect(getStrings('en').wonLine(36, 31)).toBe('Won 36 medals (+31)');
    expect(getStrings('en').lostLine(5)).toBe('No win (−5)');
    expect(getStrings('ja').wonLine(36, 31)).toBe('36枚獲得（+31枚）');
    expect(getStrings('ja').lostLine(5)).toBe('ハズレ（−5枚）');
  });
});
