/**
 * A race looked back on, once it has been run and settled: the whole order of
 * finish with each margin, and every ticket the player had on it with what it
 * brought back. Nothing here decides anything: the order was drawn (card.ts),
 * the margins are the plan's (race.ts) and the medals are the record's
 * (medalTable.ts).
 */

import { ticketFrom, ticketWins, type Ticket } from './card';
import type { RaceRecord } from './medalTable';
import type { MarginId } from './race';

export interface ReviewedTicket {
  key: string;
  ticket: Ticket;
  amount: number;
  odds: number;
  hit: boolean;
  /** The medals it brought back, the ones on it included: nothing when it missed. */
  back: number;
}

export interface RaceReview {
  id: string;
  race: number;
  /** The horses' ids, by gate − 1. */
  field: readonly string[];
  /** Gates, first to last. */
  order: readonly number[];
  /** How far each finisher was behind the one before it, by place: [0] is not a margin. */
  margins: readonly MarginId[];
  /** The winning tickets first, then the others, each group as it was bought. */
  tickets: readonly ReviewedTicket[];
  wagered: number;
  won: number;
}

/** The look back on a race on record, run with `margins` (its plan's). */
export function reviewRace(record: Pick<RaceRecord, 'id' | 'race' | 'field' | 'order' | 'bets' | 'wagered' | 'won'>, margins: readonly MarginId[]): RaceReview {
  const tickets: ReviewedTicket[] = [];
  for (const { key, amount, odds } of record.bets) {
    const ticket = ticketFrom(key);
    if (!ticket) continue;
    const hit = ticketWins(ticket, record.order);
    tickets.push({ key, ticket, amount, odds, hit, back: hit ? amount * odds : 0 });
  }
  return {
    id: record.id,
    race: record.race,
    field: [...record.field],
    order: [...record.order],
    margins: [...margins],
    tickets: [...tickets.filter((ticket) => ticket.hit), ...tickets.filter((ticket) => !ticket.hit)],
    wagered: record.wagered,
    won: record.won,
  };
}

/** A visit's races added up. */
export interface VisitTotals {
  races: number;
  /** The races a ticket of the player's won on. */
  hits: number;
  wagered: number;
  won: number;
}

export const NO_RACES: VisitTotals = { races: 0, hits: 0, wagered: 0, won: 0 };

export const addRace = (totals: VisitTotals, race: Pick<RaceReview, 'wagered' | 'won'>): VisitTotals => ({
  races: totals.races + 1,
  hits: totals.hits + (race.won > 0 ? 1 : 0),
  wagered: totals.wagered + race.wagered,
  won: totals.won + race.won,
});

/** A difference in medals as the machine writes it: +12, −5, ±0. */
export const signed = (net: number): string => (net > 0 ? `+${net}` : net < 0 ? `−${-net}` : '±0');
