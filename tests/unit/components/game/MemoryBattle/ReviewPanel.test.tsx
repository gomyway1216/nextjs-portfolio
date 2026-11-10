import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { getStrings } from '@/components/game/MemoryBattle/i18n';
import { reviewGame } from '@/components/game/MemoryBattle/review';
import { ReviewPanel } from '@/components/game/MemoryBattle/ReviewPanel';

const review = reviewGame(
  [0, 1, 0, 1],
  [
    { mover: 'player', first: 0, second: 1 },
    { mover: 'ai', first: 2, second: 0 },
    { mover: 'ai', first: 3, second: 1 },
  ],
);

const render = (language: 'en' | 'ja') =>
  renderToStaticMarkup(
    <ReviewPanel review={review} strings={getStrings(language)} symbolFor={(v) => `S${v}`} />,
  );

describe('ReviewPanel', () => {
  it('shows both sides in the summary and one log row per turn', () => {
    const html = render('en');
    const t = getStrings('en');
    expect(html).toContain(t.reviewTitle);
    // Pairs from memory: you 0, AI 2.
    expect(html).toContain(`<th scope="row">${t.reviewRecalled}</th><td>0</td><td>2</td>`);
    expect(html).toContain(`<th scope="row">${t.reviewStreak}</th><td>0</td><td>2</td>`);
    expect(html.match(/<li /g)).toHaveLength(3);
    expect(html.match(/data-kind="recalled"/g)).toHaveLength(2);
    expect(html).toContain('S0 S1');
    expect(html).toContain(t.turnKinds.noMatch);
  });

  it('makes the scrollable log focusable and labelled', () => {
    const html = render('en');
    expect(html).toMatch(/<ol[^>]*tabindex="0"[^>]*aria-label="Turn-by-turn log"/);
  });

  it('is fully translated', () => {
    const html = render('ja');
    const ja = getStrings('ja');
    const en = getStrings('en');
    for (const key of ['reviewTitle', 'reviewTurns', 'reviewRecalled', 'reviewLucky', 'reviewMissed', 'reviewStreak', 'reviewNote'] as const) {
      expect(html).toContain(ja[key]);
      expect(ja[key]).not.toBe(en[key]);
    }
    expect(html).toContain(ja.turnKinds.recalled);
  });
});
