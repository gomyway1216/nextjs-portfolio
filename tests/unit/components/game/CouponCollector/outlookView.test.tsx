/**
 * Render-to-string checks (the repo has no jsdom): the wait chart draws one
 * bar per finished wait plus one for the wait in progress, and the Play tab
 * shows the outlook before the first draw in both languages.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { WAIT_COLORS, WaitChart } from '@/components/game/CouponCollector/charts';
import { PlayTab } from '@/components/game/CouponCollector/PlayTab';
import { getStrings } from '@/components/game/CouponCollector/i18n';

const count = (html: string, needle: string) => html.split(needle).length - 1;

describe('CouponCollector wait chart', () => {
  const render = (waits: number[], pendingWait: number) =>
    renderToStaticMarkup(
      <WaitChart waits={waits} n={5} pendingWait={pendingWait} ariaLabel="waits" axisLabel="k-th" />,
    );

  it('renders the expected curve with no bars before the first draw', () => {
    const html = render([], 0);
    expect(count(html, '<rect')).toBe(0);
    expect(count(html, '<polyline')).toBe(1);
    expect(html).toContain('aria-label="waits"');
  });

  it('draws finished waits and the wait in progress in different colours', () => {
    const html = render([1, 2, 4], 3);
    expect(count(html, `fill="${WAIT_COLORS.actual}"`)).toBe(3);
    expect(count(html, `fill="${WAIT_COLORS.pending}"`)).toBe(1);
  });

  it('has no pending bar once every coupon is collected', () => {
    const html = render([1, 1, 2, 3, 9], 0);
    expect(count(html, `fill="${WAIT_COLORS.actual}"`)).toBe(5);
    expect(count(html, `fill="${WAIT_COLORS.pending}"`)).toBe(0);
  });

  it('scales the axis to the longest wait when it exceeds n', () => {
    const html = render([1, 1, 2, 3, 40], 0);
    expect(html).toContain('>40</text>');
  });
});

describe('CouponCollector play tab outlook', () => {
  it.each(['en', 'ja'] as const)('shows the starting outlook (%s)', (language) => {
    const t = getStrings(language);
    const html = renderToStaticMarkup(<PlayTab t={t} />);
    expect(html).toContain(t.outlookHeading);
    expect(html).toContain(t.nextNewChance);
    expect(html).toContain('100%');
    // n = 20 by default: E[T] = 20·H₂₀ ≈ 72.0 is both "still to go" and the projected total.
    expect(count(html, '>72.0<')).toBeGreaterThanOrEqual(3);
    expect(html).toContain('0 / 1.0');
    expect(html).toContain(t.luckPending);
    expect(html).toContain(t.waitSummaryEmpty);
    expect(html).toContain(t.waitLegendExpected);
  });
});
