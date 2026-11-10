import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it } from 'vitest';

import { STRINGS } from '@/components/game/Janken/i18n';
import { Janken } from '@/components/game/Janken/Janken';
import type { Happening } from '@/components/game/Janken/machine';
import { emptyRecord, noted, type PlayRecord } from '@/components/game/Janken/record';
import { RecordCard } from '@/components/game/Janken/RecordCard';
import { GameLanguageProvider } from '@/components/game/contexts/GameLanguageContext';
import { createI18nInstance } from '@/lib/i18n';

const within = (lang: 'en' | 'ja', node: React.ReactNode) =>
  renderToStaticMarkup(
    <I18nextProvider i18n={createI18nInstance(lang)}>
      <GameLanguageProvider>{node}</GameLanguageProvider>
    </I18nextProvider>,
  );
const card = (record: PlayRecord, lang: 'en' | 'ja' = 'en') => within(lang, <RecordCard record={record} onClear={() => undefined} />);

const thrown = (machine: 'gu' | 'choki' | 'pa', kind: 'play' | 'double' = 'play', lamp = -1): Happening => ({
  type: 'thrown',
  throw: { player: 'gu', machine, outcome: machine === 'gu' ? 'draw' : machine === 'choki' ? 'win' : 'lose', lamp, kind, draws: 0 },
  round: null,
});
/** Ten medals: nine lost, and one drawn, won on the lamp of 3 (lamp 6), doubled once and taken. */
const sample = (): PlayRecord => {
  let record = emptyRecord();
  for (let i = 0; i < 9; i++) record = [{ type: 'inserted' } as Happening, thrown('pa')].reduce((at, happening) => noted(at, happening), record);
  return [{ type: 'inserted' } as Happening, thrown('gu'), thrown('choki', 'play', 6), thrown('choki', 'double'), { type: 'paid', medals: 6, left: false } as Happening].reduce(
    (at, happening) => noted(at, happening),
    record,
  );
};

describe('the record card', () => {
  it('stands under the plate with nothing in it before a round has ended', () => {
    const html = within('en', <Janken />);
    expect(html).toContain('data-testid="janken-record"');
    expect(html).toContain(STRINGS.en.recordEmpty);
    expect(html).not.toContain('data-testid="janken-record-clear"');
    // After the plate, in the column beside the cabinet.
    expect(html.indexOf('data-testid="janken-record"')).toBeGreaterThan(html.indexOf('data-testid="janken-plate"'));
  });

  it('says what the medals came to, next to the machine’s average for as many', () => {
    const html = card(sample());
    expect(html).toMatch(/data-testid="janken-record-played">10</);
    expect(html).toMatch(/data-testid="janken-record-back">6</);
    expect(html).toMatch(/data-testid="janken-record-net" data-net="behind">−4</);
    // Nine medals of ten come back on average.
    expect(html).toContain(STRINGS.en.recordAverage('10', '9'));
    expect(html).toMatch(/data-testid="janken-record-doubles">1 of 1</);
    expect(html).toMatch(/data-testid="janken-record-throws">.*won <b>2<\/b>.*drawn <b>1<\/b>.*lost <b>9<\/b>/);
    expect(html).toMatch(/data-testid="janken-record-cat">.*Rock <b>1<\/b>.*Scissors <b>2<\/b>.*Paper <b>9<\/b>/);
    expect(html).toContain('data-testid="janken-record-clear"');
  });

  it('lists the last rounds newest first, each in marks and in words', () => {
    const html = card(sample());
    const rows = html.split('data-testid="janken-record-round"').slice(1);
    expect(rows).toHaveLength(8);
    expect(rows[0]).toContain('Round 10; Rock against the cat’s Rock, drawn; Rock against the cat’s Scissors, won; Rock against the cat’s Scissors, won; the lamp of 3; 1 double-up won; 6 medals taken');
    expect(rows[0]).toMatch(/data-outcome="draw"[^>]*>D<.*data-outcome="win"[^>]*>W<.*data-tone="three">3<.*×2.*\+6/);
    expect(rows[1]).toContain('Round 9; Rock against the cat’s Paper, lost; no medals');
    expect(rows[1]).toMatch(/data-outcome="lose"[^>]*>L</);
  });

  it('reads in Japanese', () => {
    const html = card(sample(), 'ja');
    expect(html).toContain('きろく');
    expect(html).toContain('10回目、グーとねこのグーであいこ、グーとねこのチョキでかち、グーとねこのチョキでかち、3のランプ、ダブルアップ1回成功、6枚うけとり');
    expect(html).toContain(STRINGS.ja.recordAverage('10', '9'));
    expect(html).toContain(STRINGS.ja.recordNote);
  });

  it('marks a round carried on, and says what that means', () => {
    const carried = [thrown('choki', 'double'), { type: 'paid', medals: 4, left: false } as Happening].reduce((at, happening) => noted(at, happening), emptyRecord());
    const html = card(carried);
    expect(html).toContain(STRINGS.en.recordCarriedNote);
    expect(html).toContain('Round 1 (carried on)');
    expect(html).toMatch(/data-testid="janken-record-played">0</);
    expect(card(sample())).not.toContain(STRINGS.en.recordCarriedNote);
  });
});
