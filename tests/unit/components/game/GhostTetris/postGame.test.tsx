import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { RevealBar, RunSummary } from '@/components/game/GhostTetris/PostGame';
import { getStrings } from '@/components/game/GhostTetris/i18n';

const LANGS = ['en', 'ja'] as const;

describe('RunSummary', () => {
  it.each(LANGS)('lists each kind of clear with its count, then the pieces (%s)', (lang) => {
    const t = getStrings(lang);
    const html = renderToStaticMarkup(
      <RunSummary stats={{ pieces: 57, clears: [9, 4, 2, 1] }} t={t} />,
    );
    const pairs = [...html.matchAll(/<dt>([^<]*)<\/dt><dd>([^<]*)<\/dd>/g)].map((m) => [m[1], m[2]]);
    expect(pairs).toEqual([
      [t.clearNames[0], '9'],
      [t.clearNames[1], '4'],
      [t.clearNames[2], '2'],
      [t.clearNames[3], '1'],
      [t.piecesPlaced, '57'],
    ]);
  });
});

describe('RevealBar', () => {
  it.each(LANGS)('shows the gap count and ties the note to the back button (%s)', (lang) => {
    const t = getStrings(lang);
    const html = renderToStaticMarkup(
      <RevealBar gaps={12} t={t} noteId="note" onBack={() => {}} />,
    );
    expect(html).toContain(`${t.buriedGaps}: <strong>12</strong>`);
    expect(html).toContain(`<p id="note"`);
    expect(html).toContain(t.revealNote);
    expect(html).toMatch(new RegExp(`<button[^>]*aria-describedby="note"[^>]*>${t.backToResults}</button>`));
  });
});

describe('strings', () => {
  it('has every post-game string in both languages, and Japanese ones are translated', () => {
    const en = getStrings('en');
    const ja = getStrings('ja');
    for (const key of ['piecesPlaced', 'reveal', 'backToResults', 'revealNote', 'buriedGaps'] as const) {
      expect(en[key].length).toBeGreaterThan(0);
      expect(ja[key].length).toBeGreaterThan(0);
      expect(ja[key]).not.toBe(en[key]);
    }
    expect(en.clearNames).toHaveLength(4);
    expect(ja.clearNames).toHaveLength(4);
  });
});
