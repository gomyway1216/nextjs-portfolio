import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { BOARD_ROWS, HistoryBoard } from '@/components/game/Roulette/HistoryBoard';
import { HOT_COLD_MIN_SPINS } from '@/components/game/Roulette/history';
import { getStrings } from '@/components/game/Roulette/i18n';

const en = getStrings('en');
const ja = getStrings('ja');

/** Winning numbers in the LED column, top to bottom, with their colour lane. */
function ledRows(markup: string) {
  const list = markup.match(/<ol[^>]*aria-label="Winning numbers, newest first"[^>]*>(.*?)<\/ol>/)?.[1] ?? '';
  return [...list.matchAll(/<li class="[^"]*" data-color="(\w+)"><span[^>]*>(\d+)<\/span>/g)].map((m) => ({
    color: m[1],
    n: Number(m[2]),
  }));
}

describe('HistoryBoard', () => {
  it('shows an empty state before the first spin', () => {
    const markup = renderToStaticMarkup(<HistoryBoard results={[]} spinCount={0} t={en} />);
    expect(markup).toContain('Winning numbers');
    expect(markup).toContain(en.none);
    expect(markup).toContain(en.hotColdPending(HOT_COLD_MIN_SPINS));
    expect(ledRows(markup)).toEqual([]);
  });

  it('lists winning numbers newest first in red / zero / black lanes', () => {
    const markup = renderToStaticMarkup(<HistoryBoard results={[17, 0, 32, 5]} spinCount={4} t={en} />);
    expect(ledRows(markup)).toEqual([
      { n: 17, color: 'black' },
      { n: 0, color: 'green' },
      { n: 32, color: 'red' },
      { n: 5, color: 'red' },
    ]);
    // Colour is announced to screen readers, not only shown by lane / glow.
    expect(markup).toMatch(/>17<\/span><span class="[^"]*"> black<\/span>/);
    expect(markup).toContain('Last 4 spins');
  });

  it('caps the LED column but keeps statistics over the whole history', () => {
    const results = Array.from({ length: 30 }, (_, i) => (i % 2 === 0 ? 1 : 2)); // 15 red, 15 black
    const markup = renderToStaticMarkup(<HistoryBoard results={results} spinCount={30} t={en} />);
    expect(ledRows(markup)).toHaveLength(BOARD_ROWS);
    expect(markup).toContain('Last 30 spins');
    expect(markup).toContain('aria-label="RED 50%, Zero 0%, BLACK 50%"');
    expect(markup).toContain('aria-label="1–12 100%, 13–24 0%, 25–36 0%, Zero 0%"');
  });

  it('reveals hot and cold numbers once there is enough data', () => {
    const few = Array.from({ length: HOT_COLD_MIN_SPINS - 1 }, () => 7);
    const before = renderToStaticMarkup(<HistoryBoard results={few} spinCount={few.length} t={en} />);
    expect(before).toContain(en.hotColdPending(1));
    expect(before).not.toContain('aria-label="Hot"');

    const enough = [...few, 7];
    const after = renderToStaticMarkup(<HistoryBoard results={enough} spinCount={enough.length} t={en} />);
    expect(after).toContain('aria-label="Hot"');
    expect(after).toContain('aria-label="Cold"');
    expect(after).toContain(`red, ${en.hitCount(HOT_COLD_MIN_SPINS)}`);
  });

  it('offers a clear button only when a handler is given, disabled while empty or spinning', () => {
    const noHandler = renderToStaticMarkup(<HistoryBoard results={[3]} spinCount={1} t={en} />);
    expect(noHandler).not.toContain('aria-label="Clear saved winning numbers"');

    const clearButton = (markup: string) => markup.match(/<button[^>]*aria-label="Clear saved winning numbers"[^>]*>/)?.[0] ?? '';
    const active = renderToStaticMarkup(<HistoryBoard results={[3]} spinCount={1} t={en} onClear={() => {}} />);
    expect(clearButton(active)).not.toBe('');
    expect(clearButton(active)).not.toContain('disabled');

    const empty = renderToStaticMarkup(<HistoryBoard results={[]} spinCount={0} t={en} onClear={() => {}} />);
    expect(clearButton(empty)).toContain('disabled');

    const spinning = renderToStaticMarkup(
      <HistoryBoard results={[3]} spinCount={1} t={en} onClear={() => {}} clearDisabled />,
    );
    expect(clearButton(spinning)).toContain('disabled');
  });

  it('renders Japanese labels', () => {
    const markup = renderToStaticMarkup(<HistoryBoard results={[3, 26]} spinCount={2} t={ja} />);
    expect(markup).toContain('出目履歴');
    expect(markup).toContain('直近 2 回');
    expect(markup).toContain('当選番号（新しい順）');
  });
});
