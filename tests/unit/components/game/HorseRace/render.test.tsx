import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it } from 'vitest';

import { HorseRace } from '@/components/game/HorseRace';
import { raceCard } from '@/components/game/HorseRace/card';
import { getStrings } from '@/components/game/HorseRace/i18n';
import { CardOdds, OddsTab } from '@/components/game/HorseRace/OddsTab';
import { PlayTab } from '@/components/game/HorseRace/PlayTab';
import { MEDAL_CENTER_PATH } from '@/components/game/MedalCenter/paths';
import { NOT_MONEY } from '@/components/game/MedalCenter/strings';
import { createI18nInstance } from '@/lib/i18n';

const render = (node: React.ReactNode, lang: 'en' | 'ja' = 'en') => renderToStaticMarkup(<I18nextProvider i18n={createI18nInstance(lang)}>{node}</I18nextProvider>);

describe('the machine as the server sends it', () => {
  it('shows the board, the track with six horses in the gate, all 21 tickets, and the medals still being found', () => {
    const markup = render(<PlayTab />);
    expect(markup).toContain('data-testid="hr-track"');
    expect(markup.match(/data-gate="\d"/g)).toHaveLength(6);
    expect(markup.match(/data-testid="hr-ticket-win:\d"/g)).toHaveLength(6);
    expect(markup.match(/data-testid="hr-ticket-quinella:\d-\d"/g)).toHaveLength(15);
    // Nothing can be bought until the medals are found in the browser.
    expect(markup).toContain('data-playable="false"');
    expect(markup).toContain('data-testid="hr-meter" data-loaded="false"');
    expect(markup).toContain(getStrings('en').finding);
    expect(markup).toContain(NOT_MONEY.en);
    expect(markup).toContain(`href="${MEDAL_CENTER_PATH}"`);
    expect(markup).toContain('data-testid="hr-sound"');
  });

  it('says that medals are not money, and names everything, in Japanese too', () => {
    const markup = render(<HorseRace />, 'ja');
    const t = getStrings('ja');
    expect(markup).toContain(NOT_MONEY.ja);
    expect(markup).toContain(t.title);
    expect(markup).toContain(t.tabRace);
    expect(markup).toContain(t.tabOdds);
    expect(markup).toContain(t.win);
    expect(markup).toContain(t.quinella);
    // The floor jackpot's strip over the machine, as on every machine of the floor.
    expect(markup).toContain('data-testid="floor-jackpot-strip"');
  });
});

describe('the Odds tab', () => {
  it('shows the card the machine shows, with every ticket of a kind bringing back the same', () => {
    const card = raceCard('render-test', 3);
    const markup = render(<CardOdds card={card} sample={false} />);
    expect(markup).toContain('Race 3: the exact odds');
    expect(markup).not.toContain('A sample race');
    for (const horse of card.field) expect(markup).toContain(horse.name.en);
    expect(markup).toContain(`×${card.winOdds[0]}`);
    expect(markup.match(/<tr>/g)).toHaveLength(2 + 6 + 15);
  });

  it('shows a sample race until the machine has one', () => {
    const markup = render(<OddsTab />, 'ja');
    expect(markup).toContain('サンプル');
    expect(markup).toContain('第1レース');
  });
});
