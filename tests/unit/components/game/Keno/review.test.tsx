import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { BALLS, DRAWN, LAST_BALL_TIMES, catchChance, payOf, valueOf, winOf } from '@/components/game/Keno/engine';
import { GameReview, type ReviewedGame } from '@/components/game/Keno/GameReview';
import { getStrings } from '@/components/game/Keno/i18n';
import { chanceText, reviewOf } from '@/components/game/Keno/review';

/** A draw of twenty balls: `first` in that order, then the lowest numbers not in `avoid`, then `last` as the twentieth. */
const drawOf = (first: readonly number[], last: number, avoid: readonly number[]): number[] => {
  const balls = [...first];
  for (let n = 1; balls.length < DRAWN - 1; n += 1) {
    if (!balls.includes(n) && !avoid.includes(n) && n !== last) balls.push(n);
  }
  return [...balls, last];
};

const TICKET = [7, 12, 33, 44, 80];

describe('a game looked back at', () => {
  it('lays every number of the board out as a spot, a ball drawn, a spot caught or neither', () => {
    const balls = drawOf([44, 7], 79, TICKET);
    const review = reviewOf(TICKET, balls);
    expect(review.marks).toHaveLength(BALLS);
    expect(review.marks[7 - 1]).toBe('caught');
    expect(review.marks[44 - 1]).toBe('caught');
    expect(review.marks[12 - 1]).toBe('spot');
    expect(review.marks[79 - 1]).toBe('drawn');
    expect(review.marks[78 - 1]).toBe('none');
    expect(review.marks.filter((mark) => mark === 'caught')).toHaveLength(2);
    expect(review.marks.filter((mark) => mark === 'spot')).toHaveLength(3);
    expect(review.marks.filter((mark) => mark === 'drawn')).toHaveLength(DRAWN - 2);
    // The catches in the board's order, not the order they came out in.
    expect(review.caught).toEqual([7, 44]);
    expect(review.lastBall).toBe(79);
    expect(review.lastCaught).toBe(false);
    expect(review.times).toBe(1);
    expect(review.pay).toBe(payOf(5, 2));
    expect(review.chance).toBeCloseTo(valueOf(catchChance(5, 2)), 12);
  });

  it('says the last ball’s ×5 only where the catch paid, and its parts multiply out to the game’s win', () => {
    const paid = drawOf([7, 12, 33], 44, TICKET);
    const review = reviewOf(TICKET, paid);
    expect(review.caught).toEqual([7, 12, 33, 44]);
    expect(review.lastCaught).toBe(true);
    expect(review.pay).toBeGreaterThan(0);
    expect(review.times).toBe(LAST_BALL_TIMES);
    expect(review.pay * review.times * 3).toBe(winOf(TICKET, paid, 3));

    // One spot caught, on the last ball: five spots pay nothing for one, so nothing is multiplied.
    const unpaid = reviewOf(TICKET, drawOf([], 44, TICKET));
    expect(payOf(5, 1)).toBe(0);
    expect(unpaid.lastCaught).toBe(true);
    expect(unpaid.pay).toBe(0);
    expect(unpaid.times).toBe(1);
  });

  it('gives the chance of the exact catch, the chances of a ticket’s catches adding up to one', () => {
    let total = 0;
    for (let caught = 0; caught <= TICKET.length; caught += 1) {
      const balls = drawOf(TICKET.slice(0, caught), 79, TICKET);
      const review = reviewOf(TICKET, balls);
      expect(review.caught).toHaveLength(caught);
      total += review.chance;
    }
    expect(total).toBeCloseTo(1, 12);
  });

  it('never writes a chance that is not nothing as 0.00%: the rarest catches keep their first two figures', () => {
    expect(chanceText(valueOf(catchChance(5, 2)), 'en-US')).toBe('27.05%');
    expect(chanceText(valueOf(catchChance(1, 1)), 'ja-JP')).toBe('25.00%');
    expect(chanceText(valueOf(catchChance(7, 7)), 'en-US')).toBe('0.0024%');
    expect(chanceText(valueOf(catchChance(10, 10)), 'en-US')).toBe('0.000011%');
    for (let spots = 1; spots <= 10; spots += 1) {
      for (let caught = 0; caught <= spots; caught += 1) {
        expect(chanceText(valueOf(catchChance(spots, caught)), 'en-US'), `${caught} of ${spots}`).not.toMatch(/^0\.0+%$/);
      }
    }
    expect(chanceText(0, 'en-US')).toBe('0.00%');
  });
});

describe('the review panel', () => {
  const balls = drawOf([7, 12, 33], 44, TICKET);
  const won = winOf(TICKET, balls, 2);
  const game: ReviewedGame = { ticket: TICKET, balls, bet: 2, spots: 5, caught: 4, won, lastBall: true };
  const panel = (language: 'en' | 'ja', over: Partial<ReviewedGame> = {}, canMark = true) =>
    renderToStaticMarkup(<GameReview t={getStrings(language)} locale={language === 'ja' ? 'ja-JP' : 'en-US'} game={{ ...game, ...over }} canMark={canMark} onMark={() => undefined} onClose={() => undefined} />);

  it('shows the board in small, the balls in order with the last one marked, and how the win was made up', () => {
    const markup = panel('en');
    expect(markup.match(/data-mark="(none|spot|drawn|caught)"/g)).toHaveLength(BALLS + DRAWN + 3);
    // The small board is for the eye; the same is said in words under it.
    expect(markup).toMatch(/aria-hidden="true" data-testid="kn-review-board"/);
    expect(markup).toContain('data-testid="kn-review-spots">Your spots: 7, 12, 33, 44, 80<');
    expect(markup).toContain('data-testid="kn-review-caught">Caught: 7, 12, 33, 44<');
    const order = [...markup.split('data-testid="kn-review-balls"')[1].split('</ol>')[0].matchAll(/<li[^>]*>(\d+)/g)].map((found) => Number(found[1]));
    expect(order).toEqual(balls);
    expect(markup.match(/data-last="true"/g)).toHaveLength(1);
    expect(markup).toContain('data-testid="kn-review-last">Last ball: 44, one of your spots.<');
    expect(markup).toContain('data-testid="kn-review-bet">2<');
    expect(markup).toContain(`data-testid="kn-review-pay">${payOf(5, 4)}<`);
    expect(markup).toContain(`data-testid="kn-review-times">×${LAST_BALL_TIMES}<`);
    expect(markup).toContain(`data-testid="kn-review-won">${won.toLocaleString('en-US')}<`);
    expect(won).toBe(payOf(5, 4) * LAST_BALL_TIMES * 2);
    expect(markup).toContain(`data-testid="kn-review-chance">${(valueOf(catchChance(5, 4)) * 100).toFixed(2)}%<`);
    expect(markup).not.toMatch(/<button[^>]*data-testid="kn-review-mark"[^>]*disabled/);
  });

  it('says so when nothing was caught and no ×5 was paid, and cannot mark while the machine cannot be played', () => {
    const miss = drawOf([], 79, TICKET);
    const markup = panel('en', { balls: miss, caught: 0, won: 0, lastBall: false }, false);
    expect(markup).toContain('data-testid="kn-review-caught">Caught: none<');
    expect(markup).toContain('data-testid="kn-review-last">Last ball: 79, not one of your spots.<');
    expect(markup).toContain('data-testid="kn-review-times">—<');
    expect(markup).toContain('data-testid="kn-review-won">0<');
    expect(markup).toMatch(/<button[^>]*data-testid="kn-review-mark"[^>]*disabled=""/);
  });

  it('is in Japanese too', () => {
    const markup = panel('ja');
    expect(markup).toContain('ゲームのふり返り');
    expect(markup).toContain('えらんだ数字：7、12、33、44、80');
    expect(markup).toContain('当たった数字：7、12、33、44');
    expect(markup).toContain('最後の球：44（自分の数字）');
    expect(markup).toContain('>この数字をえらぶ<');
    expect(markup).not.toMatch(/>(Looking back|Bet|Medals won|Mark these spots|Close|Caught|Drawn|Your spot)</);
  });
});
