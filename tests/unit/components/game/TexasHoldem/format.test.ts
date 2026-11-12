import { describe, expect, it } from 'vitest';

import type { LogEntry } from '@/components/game/TexasHoldem/engine';
import { formatLog, type NamedPlayer } from '@/components/game/TexasHoldem/format';
import { getHoldemStrings } from '@/components/game/TexasHoldem/i18n';

const players: NamedPlayer[] = [
  { name: 'You', isHuman: true },
  { name: 'Solver 01', isHuman: false },
];

const entries: Record<string, Omit<LogEntry, 'id' | 'seatIndex'>> = {
  blind: { type: 'blind', detail: 'small', amount: 1 },
  check: { type: 'action', action: 'check' },
  fold: { type: 'action', action: 'fold' },
  call: { type: 'action', action: 'call', amount: 5 },
  bet: { type: 'action', action: 'raise', detail: 'bet', amount: 6 },
  raise: { type: 'action', action: 'raise', amount: 1200 },
  result: { type: 'result', amount: 40 },
};

const line = (key: keyof typeof entries, seatIndex: number, language: 'en' | 'ja') =>
  formatLog({ id: 1, seatIndex, ...entries[key] } as LogEntry, players, getHoldemStrings(language));

describe('formatLog', () => {
  it('makes the verb agree with "You" in English', () => {
    expect(line('blind', 0, 'en')).toBe('You post SB 1');
    expect(line('check', 0, 'en')).toBe('You check');
    expect(line('fold', 0, 'en')).toBe('You fold');
    expect(line('call', 0, 'en')).toBe('You call 5');
    expect(line('bet', 0, 'en')).toBe('You bet 6');
    expect(line('raise', 0, 'en')).toBe('You raise to 1,200');
    expect(line('result', 0, 'en')).toBe('You collect 40');
  });

  it('keeps the third person for the other seats', () => {
    expect(line('blind', 1, 'en')).toBe('Solver 01 posts SB 1');
    expect(line('check', 1, 'en')).toBe('Solver 01 checks');
    expect(line('fold', 1, 'en')).toBe('Solver 01 folds');
    expect(line('call', 1, 'en')).toBe('Solver 01 calls 5');
    expect(line('bet', 1, 'en')).toBe('Solver 01 bets 6');
    expect(line('raise', 1, 'en')).toBe('Solver 01 raises to 1,200');
    expect(line('result', 1, 'en')).toBe('Solver 01 collects 40');
  });

  it('uses the same Japanese wording for every seat', () => {
    expect(line('call', 0, 'ja')).toBe('あなた が 5 をコール');
    expect(line('call', 1, 'ja')).toBe('Solver 01 が 5 をコール');
    expect(line('check', 0, 'ja')).toBe('あなた がチェック');
  });
});
