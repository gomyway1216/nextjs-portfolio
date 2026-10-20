import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it } from 'vitest';

import { CarouselPusher } from '@/components/game/CarouselPusher';
import { SOURCES, getStrings } from '@/components/game/CarouselPusher/i18n';
import { VIEW } from '@/components/game/CarouselPusher/view';
import { NOT_MONEY } from '@/components/game/MedalCenter/strings';
import { createI18nInstance } from '@/lib/i18n';

// The page as the server sends it, in both languages, and every word the machine has: none of it reads as money.

const render = (lang: 'en' | 'ja') => renderToStaticMarkup(<I18nextProvider i18n={createI18nInstance(lang)}>{<CarouselPusher />}</I18nextProvider>);

/** Every string the machine shows, its functions called with sample values. */
function everything(lang: 'en' | 'ja'): string[] {
  const out: string[] = [];
  const walk = (value: unknown) => {
    if (typeof value === 'string') out.push(value);
    else if (typeof value === 'function') {
      const called = (value as (...args: unknown[]) => unknown)('triple', 20, 3);
      walk(called);
    } else if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === 'object') Object.values(value).forEach(walk);
  };
  walk(getStrings(lang));
  for (const source of SOURCES) out.push(source.label[lang]);
  return out;
}

describe('the page as the server sends it', () => {
  it('has the cabinet, its counters, DROP and RETURN, the floor’s note that medals are not money, and both tabs', () => {
    for (const lang of ['en', 'ja'] as const) {
      const html = render(lang);
      for (const id of ['cp-machine', 'cp-stage', 'cp-counter', 'cp-holds', 'cp-stock', 'cp-drop', 'cp-return', 'cp-medals', 'cp-credit', 'cp-status', 'cp-message', 'cp-sound', 'cp-keys', 'cp-not-money', 'cp-how-to-play']) {
        expect(html, `${lang} ${id}`).toContain(`data-testid="${id}"`);
      }
      expect(html).toContain(NOT_MONEY[lang]);
      expect(html).toContain('role="tablist"');
      // The window onto the field keeps its shape before anything is drawn: nothing under it moves as it is.
      expect(html).toContain(`aspect-ratio:${VIEW.width} / ${VIEW.height}`);
    }
  });

  it('never reads as money, in either language', () => {
    // NOT_MONEY says outright that the medals are not money: the one place those words are allowed.
    const words = (lang: 'en' | 'ja') => everything(lang).filter((text) => text !== NOT_MONEY[lang]);
    for (const text of words('en')) expect(text, text).not.toMatch(/\b(bank|banked|deposit|withdraw|balance|cash|money|wager)\b|\$/i);
    for (const text of words('ja')) expect(text, text).not.toMatch(/預け|預かり|引き出し|残高|お金|換金|現金/);
  });

  it('says its Japanese in phrases a narrow line can break between', () => {
    const ja = getStrings('ja');
    for (const line of [ja.subtitle, ja.status.empty, ja.status.ready, ja.status.full, ja.status.throwing]) expect(line).toContain('​');
  });
});
