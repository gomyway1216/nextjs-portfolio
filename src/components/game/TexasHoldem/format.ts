import type { LogEntry, PlayerState } from './engine';
import type { HoldemStrings } from './i18n';

export type NamedPlayer = Pick<PlayerState, 'name' | 'isHuman'>;

export const chips = (amount: number): string => amount.toLocaleString('en-US');

export const signedChips = (amount: number): string => (
  amount > 0 ? `+${chips(amount)}` : amount < 0 ? `−${chips(-amount)}` : '0'
);

/** A signed rate with one decimal place; a value that rounds to zero has no sign. */
export function signedRate(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  if (rounded === 0) return '0.0';
  return `${rounded > 0 ? '+' : '−'}${Math.abs(rounded).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`;
}

export function fill(template: string, values: Record<string, string | number>): string {
  return Object.entries(values).reduce((result, [key, value]) => result.replace(`{{${key}}}`, String(value)), template);
}

export function playerName(player: NamedPlayer, strings: HoldemStrings): string {
  return player.isHuman ? strings.table.you : player.name;
}

export function formatLog(entry: LogEntry, players: readonly NamedPlayer[], strings: HoldemStrings): string {
  const name = entry.seatIndex === undefined ? '' : playerName(players[entry.seatIndex], strings);
  if (entry.type === 'hand') return fill(strings.log.hand, { amount: entry.amount ?? 0 });
  if (entry.type === 'blind') {
    return fill(strings.log.posts, {
      player: name,
      blind: entry.detail === 'small' ? 'SB' : 'BB',
      amount: chips(entry.amount ?? 0),
    });
  }
  if (entry.type === 'street') return fill(strings.log.street, { street: strings.streets[entry.street ?? 'flop'] });
  if (entry.type === 'result') return fill(strings.log.collects, { player: name, amount: chips(entry.amount ?? 0) });
  if (entry.action === 'fold') return fill(strings.log.folds, { player: name });
  if (entry.action === 'check') return fill(strings.log.checks, { player: name });
  if (entry.action === 'call') return fill(strings.log.calls, { player: name, amount: chips(entry.amount ?? 0) });
  if (entry.detail === 'bet') return fill(strings.log.bets, { player: name, amount: chips(entry.amount ?? 0) });
  return fill(strings.log.raises, { player: name, amount: chips(entry.amount ?? 0) });
}
