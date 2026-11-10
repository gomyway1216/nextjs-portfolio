import { beforeAll, describe, expect, it } from 'vitest';

import { analyzeHand, tables } from '@/components/game/VideoPoker/analysis';
import { PAY_TABLES } from '@/components/game/VideoPoker/engine';
import { HISTORY_LIMIT, addRecord, cardsAt, judgeHold, judgePending, mistakesOf, type HandRecord } from '@/components/game/VideoPoker/history';
import { getStrings } from '@/components/game/VideoPoker/i18n';

const RANKS = '23456789TJQKA';
const c = (s: string) => '♠♥♦♣'.indexOf(s[1]) * 13 + RANKS.indexOf(s[0]);
const PAYS = PAY_TABLES['9/6'];

beforeAll(() => {
  tables();
}, 30_000);

const record = (no: number, over: Partial<HandRecord> = {}): HandRecord => ({
  no,
  dealt: ['A♠', 'K♠', 'Q♠', 'J♠', '9♠'].map(c),
  held: 0b11111,
  payId: '9/6',
  coins: 5,
  pays: PAYS,
  rank: 5,
  won: 30,
  verdict: null,
  ...over,
});

describe('judgeHold', () => {
  // A made flush whose best play breaks it for four to a royal.
  const hand = ['A♠', 'K♠', 'Q♠', 'J♠', '9♠'].map(c);

  it('calls the best hold the best, with nothing given up', () => {
    expect(judgeHold(hand, 0b01111, PAYS)).toEqual({ bestMask: 0b01111, lost: 0, best: true });
  });

  it('names the best hold and what another hold gave up per medal bet', () => {
    const values = analyzeHand(hand, PAYS);
    const flush = values.find((h) => h.mask === 0b11111)!;
    const verdict = judgeHold(hand, 0b11111, PAYS)!;
    expect(verdict.best).toBe(false);
    expect(verdict.bestMask).toBe(0b01111);
    expect(verdict.lost).toBeCloseTo(values[0].ev - flush.ev, 12);
    expect(verdict.lost).toBeCloseTo(18.4255 - 6, 3);
  });

  it('counts a hold that ties the best as a best play, and keeps the masks in screen order', () => {
    // A pat royal in a shuffled order: only holding all five is best.
    const royal = ['Q♥', 'A♥', 'T♥', 'K♥', 'J♥'].map(c);
    expect(judgeHold(royal, 0b11111, PAYS)).toMatchObject({ best: true, bestMask: 0b11111 });
    // Junk whose best play keeps the lone jack, wherever it sits.
    const junk = ['2♠', '7♥', 'J♦', '4♣', '9♠'].map(c);
    const verdict = judgeHold(junk, 0, PAYS)!;
    expect(verdict.best).toBe(false);
    expect(cardsAt(junk, verdict.bestMask)).toEqual([c('J♦')]);
  });

  it('has no verdict for a mask that is not a hold of five cards', () => {
    expect(judgeHold(hand, 32, PAYS)).toBeNull();
  });
});

describe('the list of hands', () => {
  it('puts the newest first and keeps only the newest of the limit', () => {
    let log: HandRecord[] = [];
    for (let no = 1; no <= HISTORY_LIMIT + 3; no++) log = addRecord(log, record(no));
    expect(log).toHaveLength(HISTORY_LIMIT);
    expect(log[0].no).toBe(HISTORY_LIMIT + 3);
    expect(log[log.length - 1].no).toBe(4);
    expect(addRecord([record(1), record(2)], record(3), 2).map((r) => r.no)).toEqual([3, 1]);
  });

  it('judges the hands finished before the tables were ready, and leaves the judged ones as they are', () => {
    const judged = record(2, { held: 0b01111, verdict: { bestMask: 0b01111, lost: 0, best: true } });
    const log = judgePending([record(3), judged]);
    expect(log[0].verdict).toMatchObject({ best: false, bestMask: 0b01111 });
    expect(log[1]).toBe(judged);
  });

  it('picks out the holds judged worse than the best, never the ones not judged yet', () => {
    const log = judgePending([record(3), record(2, { held: 0b01111 })]);
    expect(mistakesOf(log).map((r) => r.no)).toEqual([3]);
    expect(mistakesOf([record(1)])).toEqual([]);
  });

  it('reads the cards of a mask in screen order', () => {
    expect(cardsAt([10, 20, 30, 40, 50], 0b10101)).toEqual([10, 30, 50]);
    expect(cardsAt([10, 20, 30, 40, 50], 0)).toEqual([]);
  });
});

describe('the strings of the list', () => {
  it('are in both languages', () => {
    const en = getStrings('en');
    const ja = getStrings('ja');
    expect(en.historyNote(HISTORY_LIMIT)).toContain(`last ${HISTORY_LIMIT} hands`);
    expect(ja.historyNote(HISTORY_LIMIT)).toContain(`直近${HISTORY_LIMIT}ハンド`);
    expect(en.historyCardsAria('A♠ K♠', 'A♠')).toBe('Dealt A♠ K♠. Held A♠.');
    expect(en.historyCardsAria('A♠ K♠', null)).toBe('Dealt A♠ K♠. Held nothing.');
    expect(ja.historyCardsAria('A♠ K♠', null)).toBe('配札 A♠ K♠。ホールドなし。');
    expect(en.historyMistakesOnly(2)).toBe('Only holds that were not the best (2)');
    expect(ja.historyCost('0.123')).toBe('平均でベットの0.123倍の損');
  });
});
