import { describe, expect, it } from 'vitest';

import { getPetersburgStrings, plural } from '@/components/game/Petersburg/i18n';

describe('Petersburg counts', () => {
  it('uses the singular for exactly one', () => {
    expect(plural(1, 'flip', 'flips')).toBe('1 flip');
    expect(plural(0, 'flip', 'flips')).toBe('0 flips');
    expect(plural(2, 'flip', 'flips')).toBe('2 flips');
  });

  it('counts flips in both languages', () => {
    const en = getPetersburgStrings('en');
    const ja = getPetersburgStrings('ja');
    expect(en.flips(1)).toBe('1 flip');
    expect(en.flips(7)).toBe('7 flips');
    expect(ja.flips(1)).toBe('1 回');
    expect(ja.flips(7)).toBe('7 回');
  });

  it('describes a one-game balance chart in the singular', () => {
    const en = getPetersburgStrings('en');
    expect(en.bankrollAria('1', '-$4', '-$4', '-$4')).toBe('Running balance over 1 game: now -$4, lowest -$4, highest -$4.');
    expect(en.bankrollAria('1,000', '+$2', '-$40', '+$9')).toContain('over 1,000 games:');
  });
});
