import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it } from 'vitest';

import { getStrings } from '@/components/game/Pachinko/i18n';
import { PlayTab } from '@/components/game/Pachinko/PlayTab';
import { createI18nInstance } from '@/lib/i18n';

const render = (lang: 'en' | 'ja') => renderToStaticMarkup(<I18nextProvider i18n={createI18nInstance(lang)}><PlayTab /></I18nextProvider>);
const plain = (text: string) => text.replaceAll('\u200b', '');

describe('the data counter beside the machine', () => {
  it.each(['en', 'ja'] as const)('is drawn empty before a ball is fired, in its own words (%s)', (lang) => {
    const t = getStrings(lang);
    const html = plain(render(lang));
    for (const words of [t.dataTitle, t.dataSince, t.dataLongest, t.dataBestRun, t.pocketsTitle, t.overflow, t.historyTitle, t.historyEmpty]) {
      expect(html, words).toContain(plain(words));
    }
    expect(html).toMatch(/data-testid="pk-data-since"[^>]*>0</);
    expect(html).toMatch(/data-testid="pk-data-longest"[^>]*>—</);
    // No share is written of no balls: never 0.0% of nothing.
    expect(html).not.toContain('%)');
    expect(html).not.toContain('data-testid="pk-history"');
  });

  it('words a share under a tenth of a percent as under it, in both languages', () => {
    expect(getStrings('en').share('0.1', '<')).toBe('under 0.1%');
    expect(getStrings('ja').share('0.1', '<')).toBe('0.1%未満');
    expect(getStrings('en').share('99.9', '>')).toBe('over 99.9%');
    expect(getStrings('ja').share('33.3', null)).toBe('33.3%');
  });

  it('gives every new string in both languages', () => {
    const en = getStrings('en');
    const ja = getStrings('ja');
    expect(ja.dataNote).not.toBe(en.dataNote);
    expect(ja.spinsCount(87)).toBe('87回転');
    expect(en.spinsCount(1)).toBe('1 spin');
    expect(en.hitsCount(3)).toBe('3 hits');
    expect(ja.hitRun(3)).toBe('3連目');
  });
});
