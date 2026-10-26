import { isValidElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AdventureWorld from '@/components/game/StarcatCaravan/AdventureWorld';
import { CHARACTERS } from '@/components/game/StarcatCaravan/data';
import { gameReducer, initialGame, type Action } from '@/components/game/StarcatCaravan/engine';
import { adventureOf, near, PLACES } from '@/components/game/StarcatCaravan/adventure';

// Exercise the rendered input handlers and real reducer without adding a DOM runtime.
const hooks = vi.hoisted(() => ({ effects: [] as (() => void | (() => void))[] }));
vi.mock('react', async importOriginal => ({
  ...await importOriginal<typeof import('react')>(),
  useState: <T,>(value: T) => [value, vi.fn()],
  useRef: <T,>(current: T) => ({ current }),
  useCallback: <T,>(callback: T) => callback,
  useId: () => 'map-input-test',
  useEffect: (effect: () => void | (() => void)) => { hooks.effects.push(effect); },
}));

type InputNode = { type: unknown; props: Record<string, unknown> };
function mapNode(value: ReactNode): InputNode | undefined {
  if (Array.isArray(value)) return value.map(mapNode).find(Boolean);
  if (!isValidElement(value)) return;
  const node = value as InputNode;
  if (node.type === 'svg' && node.props.role === 'img') return node;
  return mapNode(node.props.children as ReactNode);
}

class PlaceTarget {
  closest() { return this; }
  getAttribute() { return 'guide'; }
}
let cleanups: (() => void)[] = [];
beforeEach(() => {
  vi.useFakeTimers();
  hooks.effects.length = 0;
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('document', Object.assign(new EventTarget(), { hidden: false }));
  vi.stubGlobal('Element', PlaceTarget);
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('DOMPoint', class {
    constructor(public x: number, public y: number) {}
    matrixTransform() { return this; }
  });
});
afterEach(() => {
  for (const cleanup of cleanups) cleanup();
  cleanups = [];
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function renderMap(ready = true) {
  let game = initialGame();
  const dispatch = vi.fn((action: Exclude<Action, { type: 'load' }>) => {
    game = gameReducer(game, action, CHARACTERS);
  });
  const tree = AdventureWorld({
    game, characters: CHARACTERS, language: 'en', ready,
    readGame: () => game, dispatch, onParty: vi.fn(), onWish: vi.fn(),
  });
  const map = mapNode(tree)!;
  (map.props.ref as { current: unknown }).current = { getScreenCTM: () => ({ inverse: () => ({}) }) };
  cleanups = hooks.effects.map(effect => effect()).filter((cleanup): cleanup is () => void => typeof cleanup === 'function');
  return {
    game: () => game, dispatch,
    event(name: string, button = 0) {
      const handler = map.props[name] as ((event: unknown) => void) | undefined;
      handler?.({ button, clientX: 0, clientY: 0, target: new PlaceTarget() });
    },
  };
}

describe('adventure map completed taps', () => {
  it('walks to a place when touch focus settles between pointer down and click', () => {
    const map = renderMap();
    const owned = structuredClone(map.game().save.owned);
    map.event('onPointerDown');
    window.dispatchEvent(new Event('blur'));
    map.event('onClick');
    vi.advanceTimersByTime(3000);
    expect(map.dispatch.mock.calls.filter(([action]) => action.type === 'walk').length).toBeGreaterThan(1);
    expect(near(adventureOf(map.game().save).position, PLACES.find(place => place.id === 'guide')!)).toBe(true);
    expect(map.game().save.owned).toEqual(owned);
    expect(map.game().save.gems).toBe(3000);
  });

  it('does not start a route for a scroll gesture that never becomes a click', () => {
    const map = renderMap();
    map.event('onPointerDown');
    vi.advanceTimersByTime(1000);
    map.event('onPointerCancel');
    vi.advanceTimersByTime(1000);
    expect(map.dispatch.mock.calls.some(([action]) => action.type === 'walk')).toBe(false);
  });

  it.each([{ ready: false, button: 0 }, { ready: true, button: 2 }])('ignores unavailable or secondary clicks (%j)', ({ ready, button }) => {
    const map = renderMap(ready);
    map.event('onClick', button);
    vi.advanceTimersByTime(3000);
    expect(map.dispatch).not.toHaveBeenCalled();
  });
});
