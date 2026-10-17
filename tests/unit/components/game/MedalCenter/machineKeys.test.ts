import { describe, expect, it } from 'vitest';
import { forTheMachine, keyName, pressTarget, typingTarget } from '@/components/game/MedalCenter/machineKeys';

// Which key presses a table machine takes on a desktop: never typing, never a key with a modifier or held down, and
// never Space or Enter on something that Space or Enter already press.

/** A stand-in for an element: `closest` finds it when the selector names one of its kinds. */
const element = (...kinds: string[]): EventTarget =>
  ({
    closest: (selector: string) => (selector.split(',').some((s) => kinds.includes(s.trim())) ? {} : null),
  }) as unknown as EventTarget;

describe('a machine’s keys', () => {
  it('names a key as the machines do', () => {
    expect(keyName('B')).toBe('b');
    expect(keyName(' ')).toBe(' ');
    expect(keyName('Enter')).toBe('Enter');
    expect(keyName('3')).toBe('3');
  });

  it('leaves typing alone', () => {
    expect(typingTarget(element('input'))).toBe(true);
    expect(typingTarget(element('select'))).toBe(true);
    expect(typingTarget(element('div'))).toBe(false);
    expect(typingTarget(null)).toBe(false);
    expect(forTheMachine({ key: 'm', target: element('input') })).toBe(false);
  });

  it('leaves keys with a modifier, held keys and keys being composed alone', () => {
    expect(forTheMachine({ key: 'm', ctrlKey: true })).toBe(false);
    expect(forTheMachine({ key: 'm', metaKey: true })).toBe(false);
    expect(forTheMachine({ key: 'm', altKey: true })).toBe(false);
    expect(forTheMachine({ key: ' ', repeat: true })).toBe(false);
    expect(forTheMachine({ key: 'Enter', isComposing: true })).toBe(false);
    expect(forTheMachine({ key: 'm' })).toBe(true);
  });

  it('lets Space and Enter press the button or follow the link they are on, and takes them anywhere else', () => {
    expect(pressTarget(element('button'))).toBe(true);
    expect(pressTarget(element('a[href]'))).toBe(true);
    expect(forTheMachine({ key: ' ', target: element('button') })).toBe(false);
    expect(forTheMachine({ key: 'Enter', target: element('a[href]') })).toBe(false);
    expect(forTheMachine({ key: ' ', target: element('div') })).toBe(true);
    expect(forTheMachine({ key: 'Enter', target: null })).toBe(true);
    // A letter or a digit is the machine's even on a button: it does not press it.
    expect(forTheMachine({ key: '3', target: element('button') })).toBe(true);
  });
});
