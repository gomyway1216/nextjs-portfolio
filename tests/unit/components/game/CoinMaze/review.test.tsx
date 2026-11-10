import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { GATE_KINDS, GATE_PATTERNS, STAGES, TIMEOUT, WINDOWS, playOf, type Draw } from '@/components/game/CoinMaze/engine';
import { FlickReview } from '@/components/game/CoinMaze/FlickReview';
import { getStrings } from '@/components/game/CoinMaze/i18n';
import { atWidest, reviewOf, timingOf, widestOf } from '@/components/game/CoinMaze/review';

// Gate settings 0 are wide, wide, mid, mid; setting 7 is a fluttering gate at every lever.
const draw = (over: Partial<Draw> = {}): Draw => ({ gates: [0, 0, 0, 0], phases: [0, 0, 0, 0], wobbles: [true, true, true, true], blinds: [6, 6, 6, 6], pins: [true, true, false, false], ...over });

describe('how far a flick was from the gate’s widest', () => {
  it('is nothing in a window where the gate stood open', () => {
    // wide: H O O O O H S S
    for (const window of [1, 2, 3, 4]) expect(timingOf('wide', window)).toBe(0);
    expect(timingOf('slit', 1)).toBe(0);
  });

  it('counts the windows to the nearest open one: early before it, late after it', () => {
    expect(timingOf('wide', 0)).toBe(-1);
    expect(timingOf('wide', 5)).toBe(1);
    expect(timingOf('wide', 6)).toBe(2);
    // Round the turn: from the last window the next opening is two on, the one gone by three back.
    expect(timingOf('wide', 7)).toBe(-2);
    // mid: H O O O H S S S
    expect(timingOf('mid', 4)).toBe(1);
    expect(timingOf('mid', 5)).toBe(2);
    // Window 6 is three from an open window both ways, and counts as early.
    expect(timingOf('mid', 6)).toBe(-3);
    expect(timingOf('mid', 7)).toBe(-2);
    // slit: H O H S S S S S — window 5 is four from its one open window both ways.
    expect(timingOf('slit', 2)).toBe(1);
    expect(timingOf('slit', 5)).toBe(-4);
    expect(timingOf('slit', 6)).toBe(-3);
  });

  it('takes a fluttering gate’s half-open windows as its widest: it never opens further', () => {
    expect(widestOf('flutter')).toBeLessThan(widestOf('wide'));
    expect(timingOf('flutter', 0)).toBe(0);
    expect(timingOf('flutter', 1)).toBe(0);
    expect(timingOf('flutter', 2)).toBe(1);
    expect(timingOf('flutter', 7)).toBe(-1);
  });

  it('agrees with the gate’s turn in every window of every kind, and is never further than half a turn', () => {
    for (const kind of GATE_KINDS) {
      for (let window = 0; window < WINDOWS; window++) {
        const off = timingOf(kind, window);
        expect(off).not.toBeNull();
        expect(Math.abs(off!)).toBeLessThanOrEqual(WINDOWS / 2);
        expect(off === 0).toBe(atWidest(kind, window));
        // The window it points at is one of the widest, and none nearer is.
        expect(atWidest(kind, (window - off! + WINDOWS) % WINDOWS)).toBe(true);
        for (let n = 1; n < Math.abs(off!); n++) {
          expect(atWidest(kind, (window + n) % WINDOWS)).toBe(false);
          expect(atWidest(kind, (window - n + WINDOWS) % WINDOWS)).toBe(false);
        }
      }
      // Where a gate opens at all, its widest windows are exactly its open ones.
      if (GATE_PATTERNS[kind].includes('open')) GATE_PATTERNS[kind].forEach((slot, window) => expect(atWidest(kind, window)).toBe(slot === 'open'));
    }
  });

  it('has nothing to say of a flick that never came', () => {
    expect(timingOf('wide', TIMEOUT)).toBeNull();
  });
});

describe('a play looked back at', () => {
  it('has every gate in order: the ones flicked, then nothing for the ones never reached', () => {
    const review = reviewOf(playOf(draw(), [1, 6]));
    expect(review).toHaveLength(STAGES);
    expect(review[0]).toMatchObject({ off: 0, opens: true, played: { gate: 'wide', window: 1, end: 'through', blind: false } });
    expect(review[1]).toMatchObject({ off: 2, opens: true, played: { gate: 'wide', window: 6, end: 'shut' } });
    expect(review[2]).toBeNull();
    expect(review[3]).toBeNull();
  });

  it('knows a gate that never opens, a flick that never came, and the flicks made blind for a play left mid-way', () => {
    const fluttering = reviewOf(playOf(draw({ gates: [7, 0, 0, 0] }), [1, TIMEOUT]));
    expect(fluttering[0]).toMatchObject({ off: 0, opens: false, played: { gate: 'flutter', end: 'graze-through' } });
    expect(fluttering[1]).toMatchObject({ off: null, played: { end: 'timeout' } });
    // Left after the first lever: the second is flicked blind, in window 6 of a wide gate, shut.
    const left = reviewOf(playOf(draw(), [1], true));
    expect(left[1]).toMatchObject({ off: 2, played: { blind: true, window: 6, end: 'shut' } });
    // A play still under way shows only the gates flicked so far.
    expect(reviewOf(playOf(draw(), [1])).map((gate) => gate !== null)).toEqual([true, false, false, false]);
  });
});

describe('the look back beside the machine', () => {
  const en = getStrings('en');
  const ja = getStrings('ja');
  const cells = (markup: string) => markup.match(/data-slot="[a-z]+" data-flicked="(true|false)"/g) ?? [];

  it('keeps its four gates and the pins before any play, with nothing marked', () => {
    const markup = renderToStaticMarkup(<FlickReview t={en} play={null} />);
    expect(markup).toContain('>Last play, flick by flick<');
    expect(markup).toContain('>Finish a play to see how each flick met its gate.<');
    for (let stage = 1; stage <= STAGES; stage++) expect(markup).toContain(`data-testid="cm-review-gate-${stage}"`);
    expect(markup).toContain('data-testid="cm-review-pins"');
    expect(cells(markup)).toHaveLength(STAGES * WINDOWS);
    expect(markup).not.toContain('data-flicked="true"');
    expect(markup).not.toContain('Not reached');
  });

  it('marks the window flicked in on each gate’s turn and says how each flick went', () => {
    // Through the first three gates (a graze at the third), then two windows late at the fourth.
    const markup = renderToStaticMarkup(<FlickReview t={en} play={playOf(draw(), [1, 4, 0, 5])} />);
    expect(markup).toContain('>OUT at gate 4: the gate was shut<');
    expect(markup).toContain('>Gate 1 · Wide<');
    expect(markup).toContain('>Gate 3 · Even<');
    expect(markup).toContain('>On time: through<');
    expect(markup).toContain('>1 window early: grazed the edge, through<');
    expect(markup).toContain('>2 windows late: gate shut, OUT<');
    expect(markup).toContain('>Pins: not reached<');
    expect(markup.match(/data-flicked="true"/g)).toHaveLength(4);
    expect(cells(markup)).toHaveLength(STAGES * WINDOWS);
    // The strips are for the eye; the lines under them say the same in words.
    expect(markup.match(/aria-hidden="true"/g)).toHaveLength(STAGES);
    const fourth = markup.slice(markup.indexOf('cm-review-gate-4'), markup.indexOf('cm-review-pins'));
    expect(fourth).toContain('data-end="shut" data-off="2"');
    expect(cells(fourth)[5]).toBe('data-slot="shut" data-flicked="true"');
  });

  it('tells a gate never reached, a gate that only flutters, a flick that never came and a blind flick apart', () => {
    const out = renderToStaticMarkup(<FlickReview t={en} play={playOf(draw({ gates: [7, 0, 0, 0] }), [0, TIMEOUT])} />);
    expect(out).toContain('>Gate 1 · Flutter<');
    expect(out).toContain('>As wide as it gets: grazed the edge, through<');
    expect(out).toContain('>No flick: time ran out, OUT<');
    expect(out.match(/>Not reached</g)).toHaveLength(2);
    expect(out.match(/data-flicked="true"/g)).toHaveLength(1);
    expect(out.match(/>Gate 3</g)).toHaveLength(1);
    const left = renderToStaticMarkup(<FlickReview t={en} play={playOf(draw(), [1], true)} />);
    expect(left).toContain('>Flicked blind · 2 windows late: gate shut, OUT<');
  });

  it('shows where the pins sent a medal that got through', () => {
    expect(renderToStaticMarkup(<FlickReview t={en} play={playOf(draw({ pins: [true, true, true, true] }), [1, 1, 1, 1])} />)).toContain('>Pins: BIG WIN +5<');
    expect(renderToStaticMarkup(<FlickReview t={en} play={playOf(draw(), [1, 1, 1, 1])} />)).toContain('>Pins: WIN +2<');
    expect(renderToStaticMarkup(<FlickReview t={en} play={playOf(draw({ pins: [true, false, false, false] }), [1, 1, 1, 1])} />)).toContain('>Pins: OUT<');
  });

  it('is in Japanese too', () => {
    const plain = (text: string) => text.replace(/​/g, '');
    const markup = plain(renderToStaticMarkup(<FlickReview t={ja} play={playOf(draw(), [1, 0, 5])} />));
    expect(markup).toContain('>前回のプレイをふり返る<');
    expect(markup).toContain('>ゲート1・ひろい<');
    expect(markup).toContain('>ぴったり：抜けた<');
    expect(markup).toContain('>1つ早い：ふちに当たって抜けた<');
    expect(markup).toContain('>2つ遅い：閉まっていてアウト<');
    expect(markup).toContain('>届かず<');
    expect(markup).toContain('>釘：届かず<');
    expect(plain(renderToStaticMarkup(<FlickReview t={ja} play={playOf(draw({ pins: [true, true, true, true] }), [1, 1, 1, 1])} />))).toContain('>釘：大当たり +5枚<');
    expect(plain(renderToStaticMarkup(<FlickReview t={ja} play={playOf(draw(), [1], true)} />))).toContain('>目をつぶってはじいた・2つ遅い：閉まっていてアウト<');
    expect(plain(renderToStaticMarkup(<FlickReview t={ja} play={null} />))).toContain('>1回遊ぶと、レバーごとのタイミングがここに出ます。<');
  });
});
