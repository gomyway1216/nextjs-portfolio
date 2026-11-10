import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { raceCard } from '@/components/game/HorseRace/card';
import { getStrings } from '@/components/game/HorseRace/i18n';
import { winningsOf, type PlacedTicket } from '@/components/game/HorseRace/medalTable';
import { RaceDetail } from '@/components/game/HorseRace/PlayTab';
import { planRace, planSeed } from '@/components/game/HorseRace/race';
import { NO_RACES, addRace, reviewRace, signed } from '@/components/game/HorseRace/raceReview';

// A race looked back on from the visit's table: the order and margins are the race's own, and the tickets add up to
// exactly what the record says the race brought back.

const CARD = raceCard('testdevice01', 1);
const BETS: PlacedTicket[] = [
  { key: 'win:3', amount: 5, odds: CARD.winOdds[2] },
  { key: 'win:1', amount: 10, odds: CARD.winOdds[0] },
  { key: 'quinella:3-4', amount: 1, odds: 7 },
  { key: 'quinella:1-2', amount: 2, odds: CARD.quinellaOdds[0] },
];
const recordOf = (order: number[], bets: PlacedTicket[] = BETS) => ({
  id: 'abc123',
  race: 4,
  field: CARD.field.map((horse) => horse.id),
  order,
  bets,
  wagered: bets.reduce((sum, bet) => sum + bet.amount, 0),
  won: winningsOf(bets, order),
});
const marginsOf = (order: number[]) => planRace(order, CARD.field.map((horse) => horse.style), planSeed('abc123')).margins;

describe('a race looked back on', () => {
  it('marks each ticket hit or missed, the winning ones first, and they add up to what the race brought back', () => {
    const order = [2, 1, 3, 4, 5, 6];
    const record = recordOf(order);
    const review = reviewRace(record, marginsOf(order));
    expect(review.tickets.map((ticket) => ticket.key)).toEqual(['quinella:1-2', 'win:3', 'win:1', 'quinella:3-4']);
    expect(review.tickets.map((ticket) => ticket.hit)).toEqual([true, false, false, false]);
    expect(review.tickets[0].back).toBe(2 * CARD.quinellaOdds[0]);
    expect(review.tickets.reduce((sum, ticket) => sum + ticket.back, 0)).toBe(record.won);
    expect(review.tickets.reduce((sum, ticket) => sum + ticket.amount, 0)).toBe(record.wagered);
    expect(review.order).toEqual(order);
    expect(review.margins).toHaveLength(6);
  });

  it('pays a win ticket and a quinella on the same race, and nothing when the first two are others', () => {
    const both = reviewRace(recordOf([1, 2, 3, 4, 5, 6]), []);
    expect(both.tickets.filter((ticket) => ticket.hit).map((ticket) => ticket.key)).toEqual(['win:1', 'quinella:1-2']);
    const none = reviewRace(recordOf([5, 6, 1, 2, 3, 4]), []);
    expect(none.tickets.every((ticket) => !ticket.hit && ticket.back === 0)).toBe(true);
    // As bought, when nothing won.
    expect(none.tickets.map((ticket) => ticket.key)).toEqual(BETS.map((bet) => bet.key));
  });

  it('leaves out a ticket it does not know, and does not share its lists with the record', () => {
    const record = recordOf([1, 2, 3, 4, 5, 6], [...BETS, { key: 'trio:1-2-3', amount: 1, odds: 50 }]);
    const review = reviewRace(record, []);
    expect(review.tickets).toHaveLength(4);
    record.order.reverse();
    expect(review.order).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

describe('the visit added up', () => {
  it('counts every race, the ones a ticket won on, and the medals out and back', () => {
    let totals = NO_RACES;
    totals = addRace(totals, { wagered: 10, won: 0 });
    totals = addRace(totals, { wagered: 5, won: 30 });
    totals = addRace(totals, { wagered: 20, won: 8 });
    expect(totals).toEqual({ races: 3, hits: 2, wagered: 35, won: 38 });
    expect(NO_RACES).toEqual({ races: 0, hits: 0, wagered: 0, won: 0 });
  });

  it('writes a difference with its sign', () => {
    expect(signed(12)).toBe('+12');
    expect(signed(-5)).toBe('−5');
    expect(signed(0)).toBe('±0');
  });
});

describe('the race’s details as shown', () => {
  it.each(['en', 'ja'] as const)('names all six finishers with their margins and each ticket, in %s', (language) => {
    const t = getStrings(language);
    const order = [2, 1, 3, 4, 5, 6];
    const review = reviewRace(recordOf(order), marginsOf(order));
    const markup = renderToStaticMarkup(<RaceDetail review={review} t={t} language={language} />);
    expect(markup).toContain(t.resultTitle(4));
    for (const horse of CARD.field) expect(markup).toContain(horse.name[language]);
    for (let place = 1; place <= 6; place += 1) expect(markup).toContain(t.place(place));
    // Five margins: every finisher but the winner.
    for (let place = 1; place < 6; place += 1) expect(markup).toContain(t.margin[review.margins[place]]);
    expect(markup.match(/data-hit="true"/g)).toHaveLength(1);
    expect(markup.match(/data-hit="false"/g)).toHaveLength(3);
    expect(markup).toContain(t.detailBack(2 * CARD.quinellaOdds[0]));
    expect(markup).toContain(t.detailMiss);
    expect(markup).toContain(t.paid(review.won, review.won - review.wagered));
  });

  it('says so when no ticket won', () => {
    const t = getStrings('en');
    const order = [5, 6, 1, 2, 3, 4];
    const markup = renderToStaticMarkup(<RaceDetail review={reviewRace(recordOf(order), marginsOf(order))} t={t} language="en" />);
    expect(markup).not.toContain('data-hit="true"');
    expect(markup).toContain(t.lost(18));
  });
});
