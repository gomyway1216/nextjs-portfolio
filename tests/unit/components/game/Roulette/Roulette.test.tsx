import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it } from 'vitest';

import { Roulette } from '@/components/game/Roulette';
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
