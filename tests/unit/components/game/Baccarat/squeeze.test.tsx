import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { PlayingCard } from '@/components/game/Baccarat/Cards';
import { SQUEEZE_MS, SQUEEZE_SETTLE_MS, revealSchedule, squeezeSchedule } from '@/components/game/Baccarat/PlayTab';
import { getStrings } from '@/components/game/Baccarat/i18n';

describe('the squeeze (絞り)', () => {
  it('squeezes only the last card, for a little over a second, and calls the result once its face is up and counted', () => {
    for (const cards of [4, 5, 6]) {
      const { reveal, unveil, settle } = squeezeSchedule(cards);
      // The cards before it come out as they always did.
      expect(reveal).toEqual(revealSchedule(cards).reveal);
      expect(unveil).toBe(reveal[cards - 1] + SQUEEZE_MS);
      // Its total pops in (0.18 s) before the result is called.
      expect(settle - unveil).toBe(SQUEEZE_SETTLE_MS);
      expect(SQUEEZE_SETTLE_MS).toBeGreaterThanOrEqual(180);
    }
    // Short: about three quarters of a second longer than turning the card straight over.
    expect(SQUEEZE_MS).toBeLessThanOrEqual(1300);
    expect(squeezeSchedule(4).settle - revealSchedule(4).settle).toBeLessThan(900);
  });

  it('keeps a card that is being squeezed from a screen reader until it is turned, and says it then', () => {
    const peel = renderToStaticMarkup(<PlayingCard card={{ rank: '9', suit: '♠' }} squeeze="peel" />);
    expect(peel).toContain('data-squeeze="peel"');
    expect(peel).toContain('aria-hidden="true"');
    expect(peel).not.toContain('aria-label="9♠"');
    const done = renderToStaticMarkup(<PlayingCard card={{ rank: '9', suit: '♠' }} squeeze="done" />);
    expect(done).toContain('data-squeeze="done"');
    expect(done).toContain('aria-label="9♠"');
  });

  it('says what is happening, and how to turn the card, in both languages', () => {
    expect(getStrings('en').squeezing).toBe('Squeezing… tap to turn it');
    expect(getStrings('ja').squeezing).toBe('絞り中… タップでめくる');
    expect(getStrings('en').squeezeTurn).toBe('Turn the last card over');
    expect(getStrings('ja').squeezeTurn).toBe('最後のカードをめくる');
  });
});
