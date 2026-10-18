import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { NOTE_ATTRIBUTE, NoteGate, createOnceNote, noteAttributes, noteGateScript } from '@/components/game/MedalCenter/onceNote';

// The one-time notes on the floor's machines are drawn by the server and hidden before the first paint where this
// device has read them (onceNote.tsx). These tests run the gate's script against a fake page, and the note's state
// against a fake storage; the machines' own render tests check that each note is drawn with its gate.

/** A storage that keeps what it is given, or one that refuses everything. */
function storage(initial: Record<string, string> = {}, blocked = false) {
  const kept = new Map(Object.entries(initial));
  const refuse = () => {
    throw new Error('blocked');
  };
  return {
    kept,
    getItem: (key: string) => (blocked ? refuse() : (kept.get(key) ?? null)),
    setItem: (key: string, value: string) => (blocked ? refuse() : void kept.set(key, value)),
  };
}

/** Runs a gate's script on a fake page; returns the rules it put in the head. */
function runGate(code: string, store: ReturnType<typeof storage>): string[] {
  const rules: string[] = [];
  const document = {
    createElement: () => ({ textContent: '' }),
    head: { appendChild: (element: { textContent: string }) => void rules.push(element.textContent) },
  };
  new Function('window', 'document', code)({ localStorage: store }, document);
  return rules;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('a note’s gate', () => {
  it('hides the note before the first paint where it has been read, and only that note', () => {
    const code = noteGateScript({ name: 'craps', storageKey: 'craps-medals-note' });
    expect(runGate(code, storage())).toEqual([]);
    expect(runGate(code, storage({ 'craps-medals-note': '1' }))).toEqual([`[${NOTE_ATTRIBUTE}="craps"]{display:none!important}`]);
    // Anything at all counts as read when no value is named.
    expect(runGate(code, storage({ 'craps-medals-note': 'seen' }))).toHaveLength(1);
    expect(runGate(code, storage({ 'another-note': '1' }))).toEqual([]);
  });

  it('asks for the value the machine writes, when it names one', () => {
    const code = noteGateScript({ name: 'slot-machine', storageKey: 'slot-machine-medals-notice', readValue: '1' });
    expect(runGate(code, storage({ 'slot-machine-medals-notice': '1' }))).toHaveLength(1);
    expect(runGate(code, storage({ 'slot-machine-medals-notice': 'yes' }))).toEqual([]);
  });

  it('leaves the note shown, and throws nothing, where storage cannot be read', () => {
    const code = noteGateScript({ name: 'roulette', storageKey: 'roulette-medals-notice-v1' });
    expect(runGate(code, storage({}, true))).toEqual([]);
  });

  it('cannot end its own script element, whatever it is given', () => {
    const code = noteGateScript({ name: '</script><b>', storageKey: '</script>' });
    expect(code).not.toContain('<');
    expect(runGate(code, storage({ '</script>': '1' }))).toEqual([`[${NOTE_ATTRIBUTE}="</script><b>"]{display:none!important}`]);
  });

  it('is in the server’s drawing, just before its note', () => {
    const markup = renderToStaticMarkup(
      <>
        <NoteGate name="video-poker" storageKey="video-poker-medals-notice" />
        <section {...noteAttributes('video-poker')}>Told</section>
      </>,
    );
    expect(markup).toBe(`<script>${noteGateScript({ name: 'video-poker', storageKey: 'video-poker-medals-notice' })}</script><section data-once-note="video-poker">Told</section>`);
  });
});

describe('a note’s state', () => {
  it('is shown in the server’s drawing', () => {
    const note = createOnceNote({ name: 'baccarat', storageKey: 'baccarat-medal-notice' });
    const Shown = () => <i>{String(note.useShown())}</i>;
    expect(renderToStaticMarkup(<Shown />)).toBe('<i>true</i>');
  });

  it('is shown in the browser until it is put away, and written down then', () => {
    const store = storage();
    vi.stubGlobal('window', { localStorage: store });
    const note = createOnceNote({ name: 'craps', storageKey: 'craps-medals-note' });
    expect(note.due()).toBe(true);
    expect(store.kept.size).toBe(0);
    note.putAway();
    expect(note.due()).toBe(false);
    expect(store.kept.get('craps-medals-note')).toBe('1');
  });

  it('is not shown where it has been read, by the value asked for', () => {
    vi.stubGlobal('window', { localStorage: storage({ 'blackjack-medals-notice': 'seen' }) });
    expect(createOnceNote({ name: 'blackjack', storageKey: 'blackjack-medals-notice' }).due()).toBe(false);
    vi.stubGlobal('window', { localStorage: storage({ 'slot-machine-medals-notice': 'seen' }) });
    expect(createOnceNote({ name: 'slot-machine', storageKey: 'slot-machine-medals-notice', readValue: '1' }).due()).toBe(true);
  });

  it('is asked of the device once a page: a note written down as soon as it is shown stays shown', () => {
    const store = storage();
    vi.stubGlobal('window', { localStorage: store });
    const note = createOnceNote({ name: 'video-poker', storageKey: 'video-poker-medals-notice', readWhenShown: true });
    expect(note.due()).toBe(true);
    store.setItem('video-poker-medals-notice', '1');
    expect(note.due()).toBe(true);
    note.putAway();
    expect(note.due()).toBe(false);
  });

  it('writes what the machine has always written', () => {
    const store = storage();
    vi.stubGlobal('window', { localStorage: store });
    createOnceNote({ name: 'blackjack', storageKey: 'blackjack-medals-notice', writeValue: 'seen' }).putAway();
    expect(store.kept.get('blackjack-medals-notice')).toBe('seen');
  });

  it('is shown each time, and throws nothing, where storage cannot be read or written', () => {
    vi.stubGlobal('window', { localStorage: storage({}, true) });
    const note = createOnceNote({ name: 'three-card-poker', storageKey: 'three-card-poker-medals-notice' });
    expect(note.due()).toBe(true);
    expect(() => note.putAway()).not.toThrow();
    expect(note.due()).toBe(false);
  });
});
