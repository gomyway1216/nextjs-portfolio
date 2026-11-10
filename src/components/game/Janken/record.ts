/**
 * The record of a sitting at the machine: what was thrown and what came of
 * each medal, on this page, since it was opened (or since the record was
 * cleared). It is made from what the machine says happened (`Happening`,
 * machine.ts) and from nothing else: it never touches the medals, is kept in
 * memory only, and is gone with the page.
 *
 * A medal is counted when its round ends: lost, or paid. A medal put in and
 * given back unthrown is not counted. A round whose medal went in before the
 * record began (carried on from another tab, or from a page that was closed
 * without a word) is listed when it ends here, and marked, but its medals
 * are not counted: the record would have what it paid without what it took.
 */

import { HANDS, LAMPS, type Hand, type Outcome } from './engine';
import type { Happening } from './machine';

/** How many finished rounds the record lists, the newest last. The counts go on past it. */
export const ROUNDS_KEPT = 8;
/** How many throws of one round are listed: a long run of draws is cut at its start, and counted (`earlier`). */
export const THROWS_KEPT = 12;

export interface RecordThrow {
  player: Hand;
  machine: Hand;
  outcome: Outcome;
  kind: 'play' | 'double';
}

export interface RecordRound {
  /** Its number in the record, from 1. */
  n: number;
  /** The round's name at the machine, when it has one: tells a round carried on from another one found in its place. */
  id?: string;
  /** Its medal went in before the record began: listed, not counted in the medals. */
  carried: boolean;
  /** Its last throws, oldest first, and how many before them are not listed. */
  throws: RecordThrow[];
  earlier: number;
  /** The medals on the lamp the roulette stopped on, once a play is won. */
  lamp: number | null;
  /** Double-ups won. */
  doubles: number;
  /** How it ended: null while it is in play. */
  end: 'paid' | 'lost' | null;
  /** The medals it paid. */
  medals: number;
}

export interface PlayRecord {
  /** Rounds started in the record, finished or not. */
  started: number;
  /** The round in play, if any. */
  open: RecordRound | null;
  /** The last finished rounds, oldest first. */
  rounds: RecordRound[];
  /** Every throw made here, by how it came out, and by the hand the cat showed. */
  throws: Record<Outcome, number>;
  cat: Record<Hand, number>;
  /** Medals whose round ended here (lost or paid), and the medals those rounds paid. */
  played: number;
  back: number;
  /** Rounds among them that paid something. */
  wins: number;
  /** The most one of them paid. */
  best: number;
  /** Double-ups decided (won or lost, a draw is thrown again), and those won. */
  doublesTried: number;
  doublesWon: number;
}

export const emptyRecord = (): PlayRecord => ({
  started: 0,
  open: null,
  rounds: [],
  throws: { win: 0, draw: 0, lose: 0 },
  cat: { gu: 0, choki: 0, pa: 0 },
  played: 0,
  back: 0,
  wins: 0,
  best: 0,
  doublesTried: 0,
  doublesWon: 0,
});

const opened = (record: PlayRecord, carried: boolean, id?: string, lamp: number | null = null, doubles = 0): PlayRecord => ({
  ...record,
  started: record.started + 1,
  open: { n: record.started + 1, id, carried, throws: [], earlier: 0, lamp, doubles, end: null, medals: 0 },
});

/** The round in play ends: it joins the list, and its medal is counted unless it was carried. */
const closed = (record: PlayRecord, round: RecordRound, end: 'paid' | 'lost', medals: number): PlayRecord => {
  const done: RecordRound = { ...round, end, medals };
  const next: PlayRecord = { ...record, open: null, rounds: [...record.rounds, done].slice(-ROUNDS_KEPT) };
  if (round.carried) return next;
  return { ...next, played: record.played + 1, back: record.back + medals, wins: record.wins + (medals > 0 ? 1 : 0), best: Math.max(record.best, medals) };
};

/**
 * The record after something happened at the machine. `id` is the name of the round a medal has just gone into
 * (`inserted` does not carry it).
 */
export function noted(record: PlayRecord, happening: Happening, id?: string): PlayRecord {
  switch (happening.type) {
    case 'inserted':
      return opened({ ...record, open: null }, false, id);
    case 'resumed': {
      const round = happening.round;
      const lamp = round.lamp >= 0 ? LAMPS[round.lamp] : null;
      // The round this page was playing, back with the card: it goes on, with the lamp and the double-ups it has now
      // (another tab may have thrown for it meanwhile). Any other round was played on elsewhere.
      if (record.open && record.open.id === round.id) {
        if (record.open.lamp === lamp && record.open.doubles === round.doubles) return record;
        return { ...record, open: { ...record.open, lamp, doubles: round.doubles } };
      }
      return opened({ ...record, open: null }, true, round.id, lamp, round.doubles);
    }
    case 'thrown': {
      const { player, machine, outcome, kind, lamp } = happening.throw;
      const at = record.open ? record : opened(record, true, happening.round?.id ?? id);
      const before = at.open!;
      const all = [...before.throws, { player, machine, outcome, kind }];
      const cut = Math.max(0, all.length - THROWS_KEPT);
      const round: RecordRound = {
        ...before,
        throws: all.slice(cut),
        earlier: before.earlier + cut,
        lamp: outcome === 'win' && kind === 'play' && lamp >= 0 ? LAMPS[lamp] : before.lamp,
        doubles: before.doubles + (outcome === 'win' && kind === 'double' ? 1 : 0),
      };
      const decided = kind === 'double' && outcome !== 'draw';
      const next: PlayRecord = {
        ...at,
        open: round,
        throws: { ...at.throws, [outcome]: at.throws[outcome] + 1 },
        cat: { ...at.cat, [machine]: at.cat[machine] + 1 },
        doublesTried: at.doublesTried + (decided ? 1 : 0),
        doublesWon: at.doublesWon + (decided && outcome === 'win' ? 1 : 0),
      };
      return outcome === 'lose' ? closed(next, round, 'lost', 0) : next;
    }
    case 'paid':
      // Medals of a round this record never saw (found being paid, left so by a page that died) are not its own.
      return record.open ? closed(record, record.open, 'paid', happening.medals) : record;
    case 'returned':
      // The medal came back unthrown (draws aside): the round was not played.
      return record.open ? { ...record, open: null } : record;
    case 'restarted':
      // Every medal was thrown away at the medal center, and the machine started over: so does the record. (The machine
      // says so only when it had a round in play; the cabinet also hears of every reset from the medals themselves.)
      return emptyRecord();
  }
}

/** The record cleared: it begins again, and a round in play now is one whose medal went in before it began. */
export function cleared(record: PlayRecord): PlayRecord {
  const fresh = emptyRecord();
  return record.open ? { ...fresh, started: 1, open: { ...record.open, n: 1, carried: true } } : fresh;
}

/** What the record comes to. */
export interface RecordSums {
  /** Medals back less medals played: above 0 is ahead. */
  net: number;
  /** Throws made, and the cat's hands among them in the order of `HANDS`. */
  thrown: number;
  hands: { hand: Hand; count: number }[];
}

export function sumsOf(record: PlayRecord): RecordSums {
  return {
    net: record.back - record.played,
    thrown: record.throws.win + record.throws.draw + record.throws.lose,
    hands: HANDS.map((hand) => ({ hand, count: record.cat[hand] })),
  };
}
