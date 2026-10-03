import type { ReactElement, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Drives the Table tab without a browser: PlayTab is a single function
 * component, so it is called directly with stand-in hooks that keep their
 * state between calls. Clicking is calling an element's onClick; the deal and
 * reveal timers run on vitest's fake clock.
 */
const hooks = vi.hoisted(() => {
  let slots: unknown[] = [];
  let cursor = 0;
  return {
    reset() {
      slots = [];
      cursor = 0;
    },
    begin() {
      cursor = 0;
    },
    useState<T>(initial: T | (() => T)) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = typeof initial === 'function' ? (initial as () => T)() : initial;
      const set = (next: T | ((prev: T) => T)) => {
        slots[i] = typeof next === 'function' ? (next as (prev: T) => T)(slots[i] as T) : next;
      };
      return [slots[i] as T, set] as const;
    },
    useRef<T>(initial: T) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = { current: initial };
      return slots[i] as { current: T };
    },
    useEffect() {
      cursor++;
    },
    useMemo<T>(compute: () => T, deps: readonly unknown[]) {
      const i = cursor++;
      const prev = slots[i] as { value: T; deps: readonly unknown[] } | undefined;
      if (prev && prev.deps.length === deps.length && deps.every((d, k) => Object.is(d, prev.deps[k]))) return prev.value;
      const value = compute();
      slots[i] = { value, deps };
      return value;
    },
  };
});

vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useState: hooks.useState,
  useRef: hooks.useRef,
  useEffect: hooks.useEffect,
  useMemo: hooks.useMemo,
}));
vi.mock('@/components/game/contexts/GameLanguageContext', () => ({
  useGameLanguage: () => ({ language: 'en', setLanguage: () => undefined }),
}));

import { DEALER_HANDS, handOdds } from '@/components/game/ThreeCardPoker/analysis';
import { HoleCard, PlayingCard } from '@/components/game/ThreeCardPoker/Cards';
import { decide, settle, type Card } from '@/components/game/ThreeCardPoker/engine';
import { INITIAL_BANKROLL, PlayTab, TIMING, dealSchedule, revealSchedule } from '@/components/game/ThreeCardPoker/PlayTab';

type El = ReactElement<Record<string, unknown>>;
const isEl = (node: unknown): node is El => typeof node === 'object' && node !== null && 'props' in node;

function all(node: ReactNode, out: El[] = []): El[] {
  if (Array.isArray(node)) node.forEach((child) => all(child, out));
  else if (isEl(node)) {
    out.push(node);
    all(node.props.children as ReactNode, out);
  }
  return out;
}
const textOf = (node: ReactNode): string =>
  Array.isArray(node) ? node.map(textOf).join('') : isEl(node) ? textOf(node.props.children as ReactNode) : node == null || typeof node === 'boolean' ? '' : String(node);

/** Renders the tab as it stands now. */
const view = (): El[] => {
  hooks.begin();
  return all(PlayTab());
};
const find = (match: (el: El) => boolean, what: string): El => {
  const el = view().find(match);
  if (!el) throw new Error(`not on the table: ${what}`);
  return el;
};
const testId = (id: string) => find((el) => el.props['data-testid'] === id, id);
const has = (id: string) => view().some((el) => el.props['data-testid'] === id);
const button = (label: string) => find((el) => el.type === 'button' && textOf(el) === label, `button ${label}`);
const spot = (id: 'ante' | 'pairPlus' | 'play') => find((el) => el.props['data-bet'] === id, `spot ${id}`);
const click = (el: El) => {
  if (el.props.disabled) throw new Error(`"${textOf(el)}" is disabled`);
  (el.props.onClick as () => void)();
};
const chip = (value: number) => click(find((el) => el.props['aria-label'] === `Chip ${value}`, `chip ${value}`));

const bankroll = () => Number(textOf(testId('tcp-bankroll')));
const onTable = () => Number(textOf(testId('tcp-on-table')));
const message = () => textOf(testId('tcp-message'));
const callout = () => textOf(testId('tcp-callout'));
const area = (side: 'player' | 'dealer') => all(find((el) => el.props['data-hand'] === side, side));
const faceUp = (side: 'player' | 'dealer'): Card[] => area(side).filter((el) => el.type === PlayingCard).map((el) => el.props.card as Card);
const faceDown = (side: 'player' | 'dealer') => area(side).filter((el) => el.type === HoleCard);

/** Bets, deals and waits until the player may act. */
function dealHand(ante: number, pairPlus = 0) {
  for (let i = 0; i < ante / 5; i++) click(spot('ante'));
  for (let i = 0; i < pairPlus / 5; i++) click(spot('pairPlus'));
  click(button('DEAL'));
  vi.advanceTimersByTime(dealSchedule().ready);
  return faceUp('player');
}
/** Plays or folds and waits until the dealer's cards are up and the bets are paid. */
function finishHand(decision: 'play' | 'fold') {
  click(button(decision === 'play' ? 'PLAY' : 'FOLD'));
  vi.advanceTimersByTime(revealSchedule().paid);
  return faceUp('dealer');
}

beforeEach(() => {
  hooks.reset();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('placing bets', () => {
  it('takes chips off the bankroll as they are placed, and gives them back on undo and clear', () => {
    expect(bankroll()).toBe(INITIAL_BANKROLL);
    click(spot('ante'));
    click(spot('ante'));
    click(spot('pairPlus'));
    expect([bankroll(), onTable()]).toEqual([985, 15]);
    expect(textOf(spot('ante'))).toContain('10');
    click(button('Undo'));
    expect([bankroll(), onTable()]).toEqual([990, 10]);
    chip(100);
    click(spot('pairPlus'));
    expect([bankroll(), onTable()]).toEqual([890, 110]);
    click(button('Clear'));
    expect([bankroll(), onTable()]).toEqual([INITIAL_BANKROLL, 0]);
    // Nothing left to undo.
    click(button('Undo'));
    expect([bankroll(), onTable()]).toEqual([INITIAL_BANKROLL, 0]);
  });

  it('needs an Ante, and enough behind it for the Play bet', () => {
    click(button('DEAL'));
    expect(message()).toBe('Put a chip on the Ante first.');
    click(spot('pairPlus'));
    click(button('DEAL'));
    expect(message()).toBe('Put a chip on the Ante first.');
    expect(faceUp('player')).toHaveLength(0);
    click(button('Clear'));

    chip(500);
    click(spot('ante'));
    click(spot('ante'));
    expect(bankroll()).toBe(0);
    click(spot('ante'));
    expect(message()).toBe('Not enough bankroll for that chip.');
    click(button('DEAL'));
    expect(message()).toBe('Keep 1000 behind for the Play bet — lower the Ante or the Pair Plus bet.');
    expect(faceUp('player')).toHaveLength(0);
    click(button('Undo'));
    click(button('DEAL'));
    expect(message()).toBe('');
    expect(button('Dealing…').props.disabled).toBe(true);
  });
});

describe('a hand', () => {
  it('deals the player face up and the dealer face down, one card at a time', () => {
    click(spot('ante'));
    click(button('DEAL'));
    expect(callout()).toBe('Dealing…');
    expect(faceUp('player')).toHaveLength(0);
    for (let k = 1; k <= 6; k++) {
      vi.advanceTimersByTime(k === 1 ? 0 : TIMING.card);
      expect([faceUp('player').length, faceDown('dealer').length], `card ${k}`).toEqual([Math.min(3, k), Math.max(0, k - 3)]);
      expect(button('PLAY').props.disabled).toBe(true);
      expect(has('tcp-ev')).toBe(false);
    }
    vi.advanceTimersByTime(TIMING.ready);
    expect(callout()).toBe('Play or fold?');
    expect(button('PLAY').props.disabled).toBe(false);
    expect(button('FOLD').props.disabled).toBe(false);
    // The bets are locked and the dealer's cards are still hidden.
    expect(spot('ante').props.disabled).toBe(true);
    expect(button('Undo').props.disabled).toBe(true);
    expect(faceUp('dealer')).toHaveLength(0);
    expect(faceDown('dealer').every((el) => !('card' in el.props))).toBe(true);
    expect([bankroll(), onTable()]).toEqual([995, 5]);
  });

  it('shows the exact value of the hand and the strategy hint', () => {
    const player = dealHand(10);
    const odds = handOdds(player);
    const ev = all(testId('tcp-ev'));
    const row = (id: string) => textOf(ev.find((el) => el.props['data-ev'] === id)!);
    const signed = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(3)}`;
    expect(row('play')).toBe(`Play${signed(odds.evPlay)}`);
    expect(row('fold')).toBe('Fold−1.000');
    expect(ev.find((el) => el.props['data-best'] === 'true')!.props['data-ev']).toBe(odds.best);
    const cases = Object.fromEntries(ev.filter((el) => el.props['data-case']).map((el) => [el.props['data-case'], textOf(el)]));
    expect(cases.notQualified).toContain(`${((odds.notQualified / DEALER_HANDS) * 100).toFixed(2)}%`);
    expect(cases.lose).toContain(`${((odds.lose / DEALER_HANDS) * 100).toFixed(2)}%`);
    const hint = testId('tcp-hint');
    expect(hint.props['data-decision']).toBe(decide('optimal', player));
    expect(button(hint.props['data-decision'] === 'play' ? 'PLAY' : 'FOLD').props['data-hint']).toBe('true');
    // Turning the hint off hides it; the value panel stays.
    const toggle = find((el) => el.type === 'input', 'hint toggle');
    (toggle.props.onChange as (e: { target: { checked: boolean } }) => void)({ target: { checked: false } });
    expect(has('tcp-hint')).toBe(false);
    expect(button('PLAY').props['data-hint']).toBeUndefined();
    expect(has('tcp-ev')).toBe(true);
  });

  it('adds the Play bet, turns the dealer over and pays every line', () => {
    const player = dealHand(10, 5);
    expect([bankroll(), onTable()]).toEqual([985, 15]);
    click(button('PLAY'));
    expect([bankroll(), onTable()]).toEqual([975, 25]);
    expect(textOf(spot('play'))).toContain('10');
    expect(callout()).toBe('The dealer turns over…');
    expect(button('PLAY').props.disabled).toBe(true);
    for (let k = 1; k <= 3; k++) {
      vi.advanceTimersByTime(k === 1 ? 0 : TIMING.flip);
      expect([faceUp('dealer').length, faceDown('dealer').length], `flip ${k}`).toEqual([k, 3 - k]);
    }
    // Nothing is paid until the last card has had its moment.
    expect([bankroll(), onTable()]).toEqual([975, 25]);
    expect(has('tcp-results')).toBe(false);
    vi.advanceTimersByTime(TIMING.settle);

    const dealer = faceUp('dealer');
    const expected = settle({ ante: 10, pairPlus: 5 }, 'play', player, dealer);
    expect([bankroll(), onTable()]).toEqual([975 + expected.returned, 0]);
    expect(textOf(testId('tcp-net'))).toBe(expected.net > 0 ? `+${expected.net}` : expected.net < 0 ? `−${-expected.net}` : '0');
    const lines = all(testId('tcp-results')).filter((el) => el.props['data-line']);
    expect(lines.map((el) => el.props['data-line'])).toEqual([...expected.lines.map((l) => l.id), 'total']);
    expect(lines.slice(0, -1).map((el) => el.props['data-outcome'])).toEqual(expected.lines.map((l) => l.outcome));
    expect(testId('dealer-hand').props['data-qualifies']).toBe(String(expected.dealerQualifies));
    expect(button('DEAL').props.disabled).toBe(false);
    expect(textOf(testId('tcp-stats'))).toContain('Hands1');
  });

  it('forfeits the Ante and Pair Plus on a fold, and still shows the dealer’s hand', () => {
    const player = dealHand(10, 5);
    const dealer = finishHand('fold');
    expect(dealer).toHaveLength(3);
    const expected = settle({ ante: 10, pairPlus: 5 }, 'fold', player, dealer);
    expect(expected.returned).toBe(0);
    expect([bankroll(), onTable()]).toEqual([985, 0]);
    expect(callout()).toBe('You folded · −15');
    expect(textOf(spot('play'))).not.toMatch(/\d/);
    const lines = all(testId('tcp-results')).filter((el) => el.props['data-line']);
    expect(lines.map((el) => el.props['data-line'])).toEqual(['ante', 'pairPlus', 'total']);
  });
});

describe('a session', () => {
  it('keeps the books straight over many hands, rebetting and following the strategy', () => {
    let seed = 20261003;
    vi.spyOn(Math, 'random').mockImplementation(() => (seed = (seed * 16807) % 2147483647) / 2147483647);
    let expected = INITIAL_BANKROLL;
    const seen = new Set<string>();
    let played = 0;
    for (let i = 0; i < 60; i++) {
      if (i === 0) {
        click(spot('ante'));
        click(spot('pairPlus'));
      } else {
        click(button('Rebet'));
      }
      expect(onTable(), `hand ${i}`).toBe(10);
      click(button('DEAL'));
      vi.advanceTimersByTime(dealSchedule().ready);
      const player = faceUp('player');
      const decision = decide('optimal', player);
      const dealer = finishHand(decision);
      const result = settle({ ante: 5, pairPlus: 5 }, decision, player, dealer);
      expected += result.net;
      seen.add(result.showdown);
      if (decision === 'play') played++;
      expect(bankroll(), `hand ${i}`).toBe(expected);
      expect(onTable(), `hand ${i}`).toBe(0);
      expect(new Set([...player, ...dealer].map((c) => `${c.rank}${c.suit}`)).size).toBe(6);
    }
    // Enough hands to have seen folds, wins, losses and a dealer who didn't qualify.
    expect([...seen].sort()).toEqual(expect.arrayContaining(['fold', 'lose', 'notQualified', 'win']));
    const stats = textOf(testId('tcp-stats'));
    expect(stats).toContain('Hands60');
    expect(stats).toContain(`Played${played}`);
    expect(stats).toContain('Agreed with the strategy100%');

    click(button('Reset'));
    expect([bankroll(), onTable()]).toEqual([INITIAL_BANKROLL, 0]);
    expect(faceUp('player')).toHaveLength(0);
    expect(callout()).toBe('Place your Ante, then deal.');
    expect(textOf(testId('tcp-stats'))).toContain('Hands0');
    // Rebet has nothing to repeat after a reset.
    click(button('Rebet'));
    expect(onTable()).toBe(0);
  });
});
