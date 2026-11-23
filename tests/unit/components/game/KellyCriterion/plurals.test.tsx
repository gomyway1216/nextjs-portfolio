import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it } from 'vitest';

import { PlayTab } from '@/components/game/KellyCriterion/PlayTab';
import { oneDecimal } from '@/components/game/KellyCriterion/format';
import { flipCount, getStrings } from '@/components/game/KellyCriterion/i18n';
import { createI18nInstance } from '@/lib/i18n';

describe('Kelly flip counts in English', () => {
  const en = getStrings('en');

  it('uses the singular for exactly one flip', () => {
    expect(flipCount(1)).toBe('1 flip');
    expect(flipCount(0)).toBe('0 flips');
    expect(flipCount(2)).toBe('2 flips');
  });

  it('ends a one-flip game in the singular', () => {
    expect(en.finished('bust', 1, '$0.00')).toBe('Bust after 1 flip.');
    expect(en.finished('bust', 14, '$0.00')).toBe('Bust after 14 flips.');
    expect(en.finished('cap', 1, '$250.00')).toBe('You reached the $250.00 cap in 1 flip.');
    expect(en.finished('cap', 40, '$250.00')).toBe('You reached the $250.00 cap in 40 flips.');
  });

  it('summarises the chart and the recent list in the singular after one flip', () => {
    expect(en.chartSummary(1, '$30.00', '$30.00')).toBe('After 1 flip you have $30.00. The Kelly stake on the same flip has $30.00.');
    expect(en.chartSummary(3, '$30.00', '$31.00')).toBe('After 3 flips you have $30.00. The Kelly stake on the same flips has $31.00.');
    expect(en.recentAria(1)).toBe('The last flip');
    expect(en.recentAria(30)).toBe('The last 30 flips, oldest first');
  });
});

describe('Kelly bets to double', () => {
  it('shows one decimal place with no trailing zero', () => {
    expect(oneDecimal(34.44)).toBe('34.4');
    expect(oneDecimal(0.4999)).toBe('0.5');
    expect(oneDecimal(1.0026)).toBe('1');
    expect(oneDecimal(0.9665)).toBe('1');
    expect(oneDecimal(2)).toBe('2');
  });

  it('is singular in English only for a count shown as exactly 1', () => {
    const en = getStrings('en');
    expect(en.bets('1')).toBe('bet');
    for (const shown of ['0.5', '1.1', '2', '34.4']) expect(en.bets(shown)).toBe('bets');
  });

  it('keeps the Japanese counter whatever the count', () => {
    const ja = getStrings('ja');
    for (const shown of ['1', '0.5', '34.4']) expect(ja.bets(shown)).toBe('回');
  });
});

describe('Kelly play buttons', () => {
  it('are never natively disabled, so keyboard focus stays on them between flips', () => {
    const html = renderToStaticMarkup(
      <I18nextProvider i18n={createI18nInstance('en')}>
        <PlayTab />
      </I18nextProvider>,
    );
    const flip = html.match(/<button[^>]*>FLIP<\/button>/)?.[0];
    expect(flip).toBeDefined();
    expect(flip).toContain('aria-disabled="false"');
    expect(flip).not.toMatch(/\sdisabled(=|\s|>)/);
    for (const run of html.match(/<button[^>]*data-run="\d+"[^>]*>/g) ?? []) {
      expect(run).toContain('aria-disabled="false"');
      expect(run).not.toMatch(/\sdisabled(=|\s|>)/);
    }
  });
});
