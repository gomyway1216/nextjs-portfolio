import { describe, it, expect } from 'vitest';
import {
  calculateParticipantAmounts,
  calculateBalances,
  calculateOptimalSettlements,
  calculateFullSettlement,
  calculateMultiCurrencySettlement,
  roundAmount,
  formatAmount,
  convertAmount,
  generateShareCode,
} from '@/lib/settliAlgorithm';
import {
  Currency,
  SplitType,
  type Payment,
  type Member,
  type Balance,
} from '@/types/settli';

// ============================================================================
// Test Helpers
// ============================================================================

function makeMember(id: string, name: string, weight = 1, isActive = true): Member {
  return { id, name, weight, joinedAt: '2024-01-01', isActive };
}

function makePayment(
  overrides: Partial<Payment> & Pick<Payment, 'payerId' | 'amount' | 'splitType' | 'participants'>
): Payment {
  return {
    id: 'pay-1',
    groupId: 'group-1',
    currency: 'JPY',
    description: 'test',
    date: '2024-01-01',
    createdBy: null,
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
    ...overrides,
  };
}

const memberA = makeMember('a', 'Alice');
const memberB = makeMember('b', 'Bob');
const memberC = makeMember('c', 'Charlie');
const twoMembers = [memberA, memberB];
const threeMembers = [memberA, memberB, memberC];

// ============================================================================
// calculateParticipantAmounts
// ============================================================================

describe('calculateParticipantAmounts', () => {
  describe('EQUAL split', () => {
    it('splits equally between 2 members', () => {
      const payment = makePayment({
        payerId: 'a',
        amount: 1000,
        splitType: SplitType.EQUAL,
        participants: [{ memberId: 'a' }, { memberId: 'b' }],
      });
      const result = calculateParticipantAmounts(payment, twoMembers);
      expect(result.get('a')).toBe(500);
      expect(result.get('b')).toBe(500);
    });

    it('splits equally between 3 members', () => {
      const payment = makePayment({
        payerId: 'a',
        amount: 900,
        splitType: SplitType.EQUAL,
        participants: [{ memberId: 'a' }, { memberId: 'b' }, { memberId: 'c' }],
      });
      const result = calculateParticipantAmounts(payment, threeMembers);
      expect(result.get('a')).toBe(300);
      expect(result.get('b')).toBe(300);
      expect(result.get('c')).toBe(300);
    });

    it('handles uneven equal split (e.g. 1000 / 3)', () => {
      const payment = makePayment({
        payerId: 'a',
        amount: 1000,
        splitType: SplitType.EQUAL,
        participants: [{ memberId: 'a' }, { memberId: 'b' }, { memberId: 'c' }],
      });
      const result = calculateParticipantAmounts(payment, threeMembers);
      const total = (result.get('a') || 0) + (result.get('b') || 0) + (result.get('c') || 0);
      expect(total).toBeCloseTo(1000, 5);
    });

    it('uses participant weight override', () => {
      const payment = makePayment({
        payerId: 'a',
        amount: 300,
        splitType: SplitType.EQUAL,
        participants: [
          { memberId: 'a', weight: 1 },
          { memberId: 'b', weight: 2 },
        ],
      });
      const result = calculateParticipantAmounts(payment, twoMembers);
      expect(result.get('a')).toBe(100);
      expect(result.get('b')).toBe(200);
    });

    it('uses member default weight when no participant weight', () => {
      const members = [makeMember('a', 'Alice', 1), makeMember('b', 'Bob', 3)];
      const payment = makePayment({
        payerId: 'a',
        amount: 400,
        splitType: SplitType.EQUAL,
        participants: [{ memberId: 'a' }, { memberId: 'b' }],
      });
      const result = calculateParticipantAmounts(payment, members);
      expect(result.get('a')).toBe(100);
      expect(result.get('b')).toBe(300);
    });

    it('excludes inactive members', () => {
      const members = [memberA, makeMember('b', 'Bob', 1, false)];
      const payment = makePayment({
        payerId: 'a',
        amount: 1000,
        splitType: SplitType.EQUAL,
        participants: [{ memberId: 'a' }, { memberId: 'b' }],
      });
      const result = calculateParticipantAmounts(payment, members);
      expect(result.get('a')).toBe(1000);
      expect(result.has('b')).toBe(false);
    });

    it('returns empty map when no active participants', () => {
      const members = [makeMember('a', 'Alice', 1, false)];
      const payment = makePayment({
        payerId: 'a',
        amount: 1000,
        splitType: SplitType.EQUAL,
        participants: [{ memberId: 'a' }],
      });
      const result = calculateParticipantAmounts(payment, members);
      expect(result.size).toBe(0);
    });
  });

  describe('PERCENTAGE split', () => {
    it('splits by percentage', () => {
      const payment = makePayment({
        payerId: 'a',
        amount: 1000,
        splitType: SplitType.PERCENTAGE,
        participants: [
          { memberId: 'a', percentage: 30 },
          { memberId: 'b', percentage: 70 },
        ],
      });
      const result = calculateParticipantAmounts(payment, twoMembers);
      expect(result.get('a')).toBe(300);
      expect(result.get('b')).toBe(700);
    });

    it('handles 50/50 percentage', () => {
      const payment = makePayment({
        payerId: 'a',
        amount: 55,
        splitType: SplitType.PERCENTAGE,
        participants: [
          { memberId: 'a', percentage: 50 },
          { memberId: 'b', percentage: 50 },
        ],
      });
      const result = calculateParticipantAmounts(payment, twoMembers);
      expect(result.get('a')).toBe(27.5);
      expect(result.get('b')).toBe(27.5);
    });
  });

  describe('AMOUNT split', () => {
    it('uses fixed amounts', () => {
      const payment = makePayment({
        payerId: 'a',
        amount: 1000,
        splitType: SplitType.AMOUNT,
        participants: [
          { memberId: 'a', amount: 400 },
          { memberId: 'b', amount: 600 },
        ],
      });
      const result = calculateParticipantAmounts(payment, twoMembers);
      expect(result.get('a')).toBe(400);
      expect(result.get('b')).toBe(600);
    });
  });

  describe('SHARES split', () => {
    it('splits by shares', () => {
      const payment = makePayment({
        payerId: 'a',
        amount: 1000,
        splitType: SplitType.SHARES,
        participants: [
          { memberId: 'a', shares: 1 },
          { memberId: 'b', shares: 4 },
        ],
      });
      const result = calculateParticipantAmounts(payment, twoMembers);
      expect(result.get('a')).toBe(200);
      expect(result.get('b')).toBe(800);
    });

    it('defaults to 1 share when not specified', () => {
      const payment = makePayment({
        payerId: 'a',
        amount: 300,
        splitType: SplitType.SHARES,
        participants: [{ memberId: 'a' }, { memberId: 'b' }, { memberId: 'c' }],
      });
      const result = calculateParticipantAmounts(payment, threeMembers);
      expect(result.get('a')).toBe(100);
      expect(result.get('b')).toBe(100);
      expect(result.get('c')).toBe(100);
    });
  });
});

// ============================================================================
// calculateBalances
// ============================================================================

describe('calculateBalances', () => {
  it('calculates balances for a simple 2-person split in JPY', () => {
    const payment = makePayment({
      payerId: 'a',
      amount: 1000,
      splitType: SplitType.EQUAL,
      participants: [{ memberId: 'a' }, { memberId: 'b' }],
    });
    const summaries = calculateBalances([payment], twoMembers, Currency.JPY);
    const alice = summaries.find((s) => s.memberId === 'a')!;
    const bob = summaries.find((s) => s.memberId === 'b')!;

    expect(alice.totalPaid).toBe(1000);
    expect(alice.totalOwed).toBe(500);
    expect(alice.balance).toBe(500);

    expect(bob.totalPaid).toBe(0);
    expect(bob.totalOwed).toBe(500);
    expect(bob.balance).toBe(-500);
  });

  it('rounds USD amounts to cents', () => {
    const payment = makePayment({
      payerId: 'a',
      amount: 55,
      currency: 'USD',
      splitType: SplitType.EQUAL,
      participants: [{ memberId: 'a' }, { memberId: 'b' }],
    });
    const summaries = calculateBalances([payment], twoMembers, Currency.USD);
    const alice = summaries.find((s) => s.memberId === 'a')!;
    const bob = summaries.find((s) => s.memberId === 'b')!;

    expect(alice.totalOwed).toBe(27.5);
    expect(bob.totalOwed).toBe(27.5);
    expect(alice.balance).toBe(27.5);
    expect(bob.balance).toBe(-27.5);
  });

  it('rounds JPY amounts to integers', () => {
    const payment = makePayment({
      payerId: 'a',
      amount: 1001,
      splitType: SplitType.EQUAL,
      participants: [{ memberId: 'a' }, { memberId: 'b' }, { memberId: 'c' }],
    });
    const summaries = calculateBalances([payment], threeMembers, Currency.JPY);

    for (const s of summaries) {
      expect(Number.isInteger(s.totalPaid)).toBe(true);
      expect(Number.isInteger(s.totalOwed)).toBe(true);
      expect(Number.isInteger(s.balance)).toBe(true);
    }
  });

  it('handles multiple payments from different payers', () => {
    const p1 = makePayment({
      id: 'p1',
      payerId: 'a',
      amount: 600,
      splitType: SplitType.EQUAL,
      participants: [{ memberId: 'a' }, { memberId: 'b' }, { memberId: 'c' }],
    });
    const p2 = makePayment({
      id: 'p2',
      payerId: 'b',
      amount: 300,
      splitType: SplitType.EQUAL,
      participants: [{ memberId: 'a' }, { memberId: 'b' }, { memberId: 'c' }],
    });

    const summaries = calculateBalances([p1, p2], threeMembers, Currency.JPY);
    const totalBalance = summaries.reduce((sum, s) => sum + s.balance, 0);
    expect(totalBalance).toBe(0);

    const alice = summaries.find((s) => s.memberId === 'a')!;
    expect(alice.totalPaid).toBe(600);
    expect(alice.totalOwed).toBe(300);
    expect(alice.balance).toBe(300);

    const bob = summaries.find((s) => s.memberId === 'b')!;
    expect(bob.totalPaid).toBe(300);
    expect(bob.totalOwed).toBe(300);
    expect(bob.balance).toBe(0);

    const charlie = summaries.find((s) => s.memberId === 'c')!;
    expect(charlie.totalPaid).toBe(0);
    expect(charlie.totalOwed).toBe(300);
    expect(charlie.balance).toBe(-300);
  });

  it('balance sum is always zero', () => {
    const p1 = makePayment({
      id: 'p1',
      payerId: 'a',
      amount: 12345,
      splitType: SplitType.EQUAL,
      participants: [{ memberId: 'a' }, { memberId: 'b' }],
    });
    const p2 = makePayment({
      id: 'p2',
      payerId: 'b',
      amount: 6789,
      splitType: SplitType.EQUAL,
      participants: [{ memberId: 'a' }, { memberId: 'b' }],
    });
    const summaries = calculateBalances([p1, p2], twoMembers, Currency.JPY);
    const totalBalance = summaries.reduce((sum, s) => sum + s.balance, 0);
    expect(totalBalance).toBe(0);
  });

  it('excludes inactive members from summaries', () => {
    const members = [memberA, makeMember('b', 'Bob', 1, false)];
    const payment = makePayment({
      payerId: 'a',
      amount: 1000,
      splitType: SplitType.EQUAL,
      participants: [{ memberId: 'a' }],
    });
    const summaries = calculateBalances([payment], members, Currency.JPY);
    expect(summaries.length).toBe(1);
    expect(summaries[0].memberId).toBe('a');
  });

  it('handles no payments', () => {
    const summaries = calculateBalances([], twoMembers, Currency.JPY);
    for (const s of summaries) {
      expect(s.totalPaid).toBe(0);
      expect(s.totalOwed).toBe(0);
      expect(s.balance).toBe(0);
    }
  });
});

// ============================================================================
// calculateOptimalSettlements
// ============================================================================

describe('calculateOptimalSettlements', () => {
  it('produces single settlement for 2-person case', () => {
    const balances: Balance[] = [
      { memberId: 'a', memberName: 'Alice', amount: 500 },
      { memberId: 'b', memberName: 'Bob', amount: -500 },
    ];
    const settlements = calculateOptimalSettlements(balances, twoMembers, Currency.JPY);
    expect(settlements.length).toBe(1);
    expect(settlements[0].from.id).toBe('b');
    expect(settlements[0].to.id).toBe('a');
    expect(settlements[0].amount).toBe(500);
  });

  it('minimizes transactions for 3 people', () => {
    const balances: Balance[] = [
      { memberId: 'a', memberName: 'Alice', amount: 200 },
      { memberId: 'b', memberName: 'Bob', amount: -100 },
      { memberId: 'c', memberName: 'Charlie', amount: -100 },
    ];
    const settlements = calculateOptimalSettlements(balances, threeMembers, Currency.JPY);
    expect(settlements.length).toBe(2);
    const totalSettled = settlements.reduce((sum, s) => sum + s.amount, 0);
    expect(totalSettled).toBe(200);
  });

  it('returns empty when all balanced', () => {
    const balances: Balance[] = [
      { memberId: 'a', memberName: 'Alice', amount: 0 },
      { memberId: 'b', memberName: 'Bob', amount: 0 },
    ];
    const settlements = calculateOptimalSettlements(balances, twoMembers, Currency.JPY);
    expect(settlements.length).toBe(0);
  });

  it('uses cent precision for USD', () => {
    const balances: Balance[] = [
      { memberId: 'a', memberName: 'Alice', amount: 27.5 },
      { memberId: 'b', memberName: 'Bob', amount: -27.5 },
    ];
    const settlements = calculateOptimalSettlements(balances, twoMembers, Currency.USD);
    expect(settlements.length).toBe(1);
    expect(settlements[0].amount).toBe(27.5);
  });

  it('handles complex 3-person chain settlement', () => {
    const balances: Balance[] = [
      { memberId: 'a', memberName: 'Alice', amount: 300 },
      { memberId: 'b', memberName: 'Bob', amount: 100 },
      { memberId: 'c', memberName: 'Charlie', amount: -400 },
    ];
    const settlements = calculateOptimalSettlements(balances, threeMembers, Currency.JPY);
    const totalFromCharlie = settlements
      .filter((s) => s.from.id === 'c')
      .reduce((sum, s) => sum + s.amount, 0);
    expect(totalFromCharlie).toBe(400);
  });

  it('ignores negligible balances below threshold', () => {
    const balances: Balance[] = [
      { memberId: 'a', memberName: 'Alice', amount: 0.001 },
      { memberId: 'b', memberName: 'Bob', amount: -0.001 },
    ];
    const settlements = calculateOptimalSettlements(balances, twoMembers, Currency.USD);
    expect(settlements.length).toBe(0);
  });
});

// ============================================================================
// calculateFullSettlement
// ============================================================================

describe('calculateFullSettlement', () => {
  it('produces complete settlement from payments (JPY)', () => {
    const payment = makePayment({
      payerId: 'a',
      amount: 1000,
      splitType: SplitType.EQUAL,
      participants: [{ memberId: 'a' }, { memberId: 'b' }],
    });
    const result = calculateFullSettlement([payment], twoMembers, Currency.JPY);

    expect(result.currency).toBe(Currency.JPY);
    expect(result.totalAmount).toBe(1000);
    expect(result.summaries.length).toBe(2);
    expect(result.settlements.length).toBe(1);
    expect(result.settlements[0].from.id).toBe('b');
    expect(result.settlements[0].to.id).toBe('a');
    expect(result.settlements[0].amount).toBe(500);
  });

  it('produces correct cent-level settlement for USD', () => {
    const payment = makePayment({
      payerId: 'a',
      amount: 55,
      currency: 'USD',
      splitType: SplitType.EQUAL,
      participants: [{ memberId: 'a' }, { memberId: 'b' }],
    });
    const result = calculateFullSettlement([payment], twoMembers, Currency.USD);

    expect(result.settlements.length).toBe(1);
    expect(result.settlements[0].amount).toBe(27.5);
  });

  it('no settlement when all payers pay their fair share', () => {
    const p1 = makePayment({
      id: 'p1',
      payerId: 'a',
      amount: 500,
      splitType: SplitType.EQUAL,
      participants: [{ memberId: 'a' }, { memberId: 'b' }],
    });
    const p2 = makePayment({
      id: 'p2',
      payerId: 'b',
      amount: 500,
      splitType: SplitType.EQUAL,
      participants: [{ memberId: 'a' }, { memberId: 'b' }],
    });
    const result = calculateFullSettlement([p1, p2], twoMembers, Currency.JPY);
    expect(result.settlements.length).toBe(0);
  });

  it('handles large group with many payments', () => {
    const members = Array.from({ length: 5 }, (_, i) =>
      makeMember(`m${i}`, `Member${i}`)
    );
    const allParticipants = members.map((m) => ({ memberId: m.id }));
    const payments = Array.from({ length: 10 }, (_, i) =>
      makePayment({
        id: `p${i}`,
        payerId: members[i % 5].id,
        amount: (i + 1) * 100,
        splitType: SplitType.EQUAL,
        participants: allParticipants,
      })
    );
    const result = calculateFullSettlement(payments, members, Currency.JPY);
    const totalBalance = result.summaries.reduce((sum, s) => sum + s.balance, 0);
    expect(totalBalance).toBe(0);
    expect(result.settlements.length).toBeLessThanOrEqual(4);
  });

  it('handles empty payments', () => {
    const result = calculateFullSettlement([], twoMembers, Currency.JPY);
    expect(result.totalAmount).toBe(0);
    expect(result.settlements.length).toBe(0);
  });
});

// ============================================================================
// calculateMultiCurrencySettlement
// ============================================================================

describe('calculateMultiCurrencySettlement', () => {
  it('groups payments by currency', () => {
    const jpyPayment = makePayment({
      id: 'p1',
      payerId: 'a',
      amount: 1000,
      currency: 'JPY',
      splitType: SplitType.EQUAL,
      participants: [{ memberId: 'a' }, { memberId: 'b' }],
    });
    const usdPayment = makePayment({
      id: 'p2',
      payerId: 'a',
      amount: 55,
      currency: 'USD',
      splitType: SplitType.EQUAL,
      participants: [{ memberId: 'a' }, { memberId: 'b' }],
    });

    const result = calculateMultiCurrencySettlement(
      [jpyPayment, usdPayment],
      twoMembers,
      Currency.JPY
    );

    expect(result.byCurrency.length).toBe(2);
    expect(result.byCurrency[0].currency).toBe(Currency.JPY);
    expect(result.byCurrency[1].currency).toBe(Currency.USD);
  });

  it('puts group currency first', () => {
    const usdPayment = makePayment({
      id: 'p1',
      payerId: 'a',
      amount: 100,
      currency: 'USD',
      splitType: SplitType.EQUAL,
      participants: [{ memberId: 'a' }, { memberId: 'b' }],
    });
    const eurPayment = makePayment({
      id: 'p2',
      payerId: 'b',
      amount: 200,
      currency: 'EUR',
      splitType: SplitType.EQUAL,
      participants: [{ memberId: 'a' }, { memberId: 'b' }],
    });

    const result = calculateMultiCurrencySettlement(
      [usdPayment, eurPayment],
      twoMembers,
      Currency.EUR
    );

    expect(result.byCurrency[0].currency).toBe(Currency.EUR);
    expect(result.byCurrency[1].currency).toBe(Currency.USD);
  });

  it('falls back to group currency when payment has no currency', () => {
    const payment = makePayment({
      payerId: 'a',
      amount: 1000,
      currency: '',
      splitType: SplitType.EQUAL,
      participants: [{ memberId: 'a' }, { memberId: 'b' }],
    });

    const result = calculateMultiCurrencySettlement(
      [payment],
      twoMembers,
      Currency.JPY
    );

    expect(result.byCurrency.length).toBe(1);
    expect(result.byCurrency[0].currency).toBe(Currency.JPY);
  });

  it('calculates settlements independently per currency', () => {
    const jpyPayment = makePayment({
      id: 'p1',
      payerId: 'a',
      amount: 1000,
      currency: 'JPY',
      splitType: SplitType.EQUAL,
      participants: [{ memberId: 'a' }, { memberId: 'b' }],
    });
    const usdPayment = makePayment({
      id: 'p2',
      payerId: 'b',
      amount: 100,
      currency: 'USD',
      splitType: SplitType.EQUAL,
      participants: [{ memberId: 'a' }, { memberId: 'b' }],
    });

    const result = calculateMultiCurrencySettlement(
      [jpyPayment, usdPayment],
      twoMembers,
      Currency.JPY
    );

    const jpySettlement = result.byCurrency.find((c) => c.currency === Currency.JPY)!;
    expect(jpySettlement.settlements[0].from.id).toBe('b');
    expect(jpySettlement.settlements[0].to.id).toBe('a');
    expect(jpySettlement.settlements[0].amount).toBe(500);

    const usdSettlement = result.byCurrency.find((c) => c.currency === Currency.USD)!;
    expect(usdSettlement.settlements[0].from.id).toBe('a');
    expect(usdSettlement.settlements[0].to.id).toBe('b');
    expect(usdSettlement.settlements[0].amount).toBe(50);
  });

  it('counts total settlements across currencies', () => {
    const jpyPayment = makePayment({
      id: 'p1',
      payerId: 'a',
      amount: 1000,
      currency: 'JPY',
      splitType: SplitType.EQUAL,
      participants: [{ memberId: 'a' }, { memberId: 'b' }],
    });
    const usdPayment = makePayment({
      id: 'p2',
      payerId: 'a',
      amount: 55,
      currency: 'USD',
      splitType: SplitType.EQUAL,
      participants: [{ memberId: 'a' }, { memberId: 'b' }],
    });
    const eurPayment = makePayment({
      id: 'p3',
      payerId: 'b',
      amount: 1234,
      currency: 'EUR',
      splitType: SplitType.EQUAL,
      participants: [{ memberId: 'a' }, { memberId: 'b' }],
    });

    const result = calculateMultiCurrencySettlement(
      [jpyPayment, usdPayment, eurPayment],
      twoMembers,
      Currency.JPY
    );

    expect(result.totalSettlementCount).toBe(3);
  });

  it('handles single currency (no grouping needed)', () => {
    const p1 = makePayment({
      id: 'p1',
      payerId: 'a',
      amount: 1000,
      currency: 'JPY',
      splitType: SplitType.EQUAL,
      participants: [{ memberId: 'a' }, { memberId: 'b' }],
    });
    const p2 = makePayment({
      id: 'p2',
      payerId: 'b',
      amount: 500,
      currency: 'JPY',
      splitType: SplitType.EQUAL,
      participants: [{ memberId: 'a' }, { memberId: 'b' }],
    });

    const result = calculateMultiCurrencySettlement(
      [p1, p2],
      twoMembers,
      Currency.JPY
    );

    expect(result.byCurrency.length).toBe(1);
    expect(result.byCurrency[0].currency).toBe(Currency.JPY);
  });

  it('handles real-world scenario: trip with mixed currencies', () => {
    const payments = [
      makePayment({
        id: 'p1', payerId: 'a', amount: 55, currency: 'USD',
        splitType: SplitType.EQUAL,
        participants: [{ memberId: 'a' }, { memberId: 'b' }],
      }),
      makePayment({
        id: 'p2', payerId: 'a', amount: 10, currency: 'JPY',
        splitType: SplitType.EQUAL,
        participants: [{ memberId: 'a' }, { memberId: 'b' }],
      }),
      makePayment({
        id: 'p3', payerId: 'b', amount: 1234, currency: 'EUR',
        splitType: SplitType.EQUAL,
        participants: [{ memberId: 'a' }, { memberId: 'b' }],
      }),
      makePayment({
        id: 'p4', payerId: 'b', amount: 12350, currency: 'JPY',
        splitType: SplitType.EQUAL,
        participants: [{ memberId: 'a' }, { memberId: 'b' }],
      }),
    ];

    const result = calculateMultiCurrencySettlement(payments, twoMembers, Currency.JPY);

    expect(result.byCurrency.length).toBe(3);

    const jpyCalc = result.byCurrency.find((c) => c.currency === Currency.JPY)!;
    expect(jpyCalc.totalAmount).toBe(12360);
    expect(jpyCalc.settlements[0].from.id).toBe('a');
    expect(jpyCalc.settlements[0].to.id).toBe('b');
    expect(jpyCalc.settlements[0].amount).toBe(6170);

    const usdCalc = result.byCurrency.find((c) => c.currency === Currency.USD)!;
    expect(usdCalc.totalAmount).toBe(55);
    expect(usdCalc.settlements[0].amount).toBe(27.5);

    const eurCalc = result.byCurrency.find((c) => c.currency === Currency.EUR)!;
    expect(eurCalc.totalAmount).toBe(1234);
    expect(eurCalc.settlements[0].amount).toBe(617);
  });
});

// ============================================================================
// roundAmount (display rounding)
// ============================================================================

describe('roundAmount', () => {
  it('rounds JPY to nearest 10', () => {
    expect(roundAmount(1234, Currency.JPY)).toBe(1230);
    expect(roundAmount(1235, Currency.JPY)).toBe(1240);
    expect(roundAmount(1000, Currency.JPY)).toBe(1000);
    expect(roundAmount(5, Currency.JPY)).toBe(10);
  });

  it('rounds KRW to nearest 10', () => {
    expect(roundAmount(1234, Currency.KRW)).toBe(1230);
    expect(roundAmount(1236, Currency.KRW)).toBe(1240);
  });

  it('rounds USD to 2 decimal places', () => {
    expect(roundAmount(10.555, Currency.USD)).toBe(10.56);
    expect(roundAmount(10.554, Currency.USD)).toBe(10.55);
    expect(roundAmount(100, Currency.USD)).toBe(100);
  });

  it('rounds EUR to 2 decimal places', () => {
    expect(roundAmount(99.999, Currency.EUR)).toBe(100);
    expect(roundAmount(0.001, Currency.EUR)).toBe(0);
  });

  it('rounds other currencies to 2 decimal places', () => {
    expect(roundAmount(1.236, Currency.GBP)).toBe(1.24);
    expect(roundAmount(1.234, Currency.THB)).toBe(1.23);
    expect(roundAmount(1.235, Currency.AUD)).toBe(1.24);
  });
});

// ============================================================================
// formatAmount
// ============================================================================

describe('formatAmount', () => {
  it('formats JPY with yen symbol and no decimals', () => {
    const result = formatAmount(1234, Currency.JPY);
    expect(result).toContain('¥');
    expect(result).not.toContain('.');
  });

  it('formats USD with dollar symbol and 2 decimals', () => {
    const result = formatAmount(27.5, Currency.USD);
    expect(result).toContain('$');
    expect(result).toContain('27.50');
  });

  it('formats EUR with euro symbol', () => {
    const result = formatAmount(100, Currency.EUR);
    expect(result).toContain('€');
  });

  it('formats GBP with pound symbol', () => {
    const result = formatAmount(50, Currency.GBP);
    expect(result).toContain('£');
  });

  it('formats KRW with won symbol and no decimals', () => {
    const result = formatAmount(10000, Currency.KRW);
    expect(result).toContain('₩');
    expect(result).not.toContain('.');
  });

  it('formats TWD with NT$ prefix', () => {
    const result = formatAmount(500, Currency.TWD);
    expect(result).toContain('NT$');
  });

  it('formats negative amounts', () => {
    const result = formatAmount(-500, Currency.JPY);
    expect(result).toContain('-');
  });

  it('formats zero', () => {
    const result = formatAmount(0, Currency.USD);
    expect(result).toBe('$0.00');
  });
});

// ============================================================================
// convertAmount
// ============================================================================

describe('convertAmount', () => {
  const rates: Record<string, number> = {
    JPY: 150,
    USD: 1,
    EUR: 0.92,
  };

  it('returns same amount when currencies match', () => {
    expect(convertAmount(100, Currency.USD, Currency.USD, rates)).toBe(100);
    expect(convertAmount(1000, Currency.JPY, Currency.JPY, rates)).toBe(1000);
  });

  it('converts USD to JPY', () => {
    const result = convertAmount(100, Currency.USD, Currency.JPY, rates);
    expect(result).toBe(15000);
  });

  it('converts JPY to USD', () => {
    const result = convertAmount(15000, Currency.JPY, Currency.USD, rates);
    expect(result).toBe(100);
  });

  it('converts USD to EUR', () => {
    const result = convertAmount(100, Currency.USD, Currency.EUR, rates);
    expect(result).toBe(92);
  });

  it('converts EUR to JPY (cross rate)', () => {
    const result = convertAmount(100, Currency.EUR, Currency.JPY, rates);
    expect(result).toBeCloseTo(16304.35, 0);
  });

  it('handles missing rate gracefully (defaults to 1)', () => {
    const result = convertAmount(100, Currency.THB, Currency.USD, rates);
    expect(result).toBe(100);
  });
});

// ============================================================================
// generateShareCode
// ============================================================================

describe('generateShareCode', () => {
  it('generates an 8-character code', () => {
    const code = generateShareCode();
    expect(code.length).toBe(8);
  });

  it('only contains allowed characters', () => {
    const allowedChars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    for (let i = 0; i < 100; i++) {
      const code = generateShareCode();
      for (const char of code) {
        expect(allowedChars).toContain(char);
      }
    }
  });

  it('excludes similar characters (0, O, 1, I)', () => {
    for (let i = 0; i < 100; i++) {
      const code = generateShareCode();
      expect(code).not.toContain('0');
      expect(code).not.toContain('O');
      expect(code).not.toContain('1');
      expect(code).not.toContain('I');
    }
  });

  it('generates unique codes', () => {
    const codes = new Set<string>();
    for (let i = 0; i < 50; i++) {
      codes.add(generateShareCode());
    }
    expect(codes.size).toBe(50);
  });
});

// ============================================================================
// Edge Cases & Integration
// ============================================================================

describe('Edge cases', () => {
  it('single member paying for themselves', () => {
    const payment = makePayment({
      payerId: 'a',
      amount: 1000,
      splitType: SplitType.EQUAL,
      participants: [{ memberId: 'a' }],
    });
    const result = calculateFullSettlement([payment], [memberA], Currency.JPY);
    expect(result.settlements.length).toBe(0);
    const alice = result.summaries.find((s) => s.memberId === 'a')!;
    expect(alice.balance).toBe(0);
  });

  it('everyone pays the same amount equally split', () => {
    const p1 = makePayment({
      id: 'p1', payerId: 'a', amount: 100,
      splitType: SplitType.EQUAL,
      participants: [{ memberId: 'a' }, { memberId: 'b' }, { memberId: 'c' }],
    });
    const p2 = makePayment({
      id: 'p2', payerId: 'b', amount: 100,
      splitType: SplitType.EQUAL,
      participants: [{ memberId: 'a' }, { memberId: 'b' }, { memberId: 'c' }],
    });
    const p3 = makePayment({
      id: 'p3', payerId: 'c', amount: 100,
      splitType: SplitType.EQUAL,
      participants: [{ memberId: 'a' }, { memberId: 'b' }, { memberId: 'c' }],
    });
    const result = calculateFullSettlement([p1, p2, p3], threeMembers, Currency.JPY);
    expect(result.settlements.length).toBe(0);
    for (const s of result.summaries) {
      expect(s.balance).toBe(0);
    }
  });

  it('one person pays everything for the group', () => {
    const payments = [
      makePayment({
        id: 'p1', payerId: 'a', amount: 3000,
        splitType: SplitType.EQUAL,
        participants: [{ memberId: 'a' }, { memberId: 'b' }, { memberId: 'c' }],
      }),
      makePayment({
        id: 'p2', payerId: 'a', amount: 6000,
        splitType: SplitType.EQUAL,
        participants: [{ memberId: 'a' }, { memberId: 'b' }, { memberId: 'c' }],
      }),
    ];
    const result = calculateFullSettlement(payments, threeMembers, Currency.JPY);
    const alice = result.summaries.find((s) => s.memberId === 'a')!;
    expect(alice.totalPaid).toBe(9000);
    expect(alice.totalOwed).toBe(3000);
    expect(alice.balance).toBe(6000);

    const totalSettled = result.settlements.reduce((sum, s) => sum + s.amount, 0);
    expect(totalSettled).toBe(6000);
  });

  it('very small USD amount split correctly', () => {
    const payment = makePayment({
      payerId: 'a',
      amount: 0.01,
      currency: 'USD',
      splitType: SplitType.EQUAL,
      participants: [{ memberId: 'a' }, { memberId: 'b' }],
    });
    const result = calculateFullSettlement([payment], twoMembers, Currency.USD);
    expect(result.totalAmount).toBe(0.01);
  });

  it('large JPY amount', () => {
    const payment = makePayment({
      payerId: 'a',
      amount: 1000000,
      splitType: SplitType.EQUAL,
      participants: [{ memberId: 'a' }, { memberId: 'b' }],
    });
    const result = calculateFullSettlement([payment], twoMembers, Currency.JPY);
    expect(result.settlements[0].amount).toBe(500000);
  });

  it('mixed split types across payments', () => {
    const p1 = makePayment({
      id: 'p1', payerId: 'a', amount: 1000,
      splitType: SplitType.EQUAL,
      participants: [{ memberId: 'a' }, { memberId: 'b' }],
    });
    const p2 = makePayment({
      id: 'p2', payerId: 'b', amount: 600,
      splitType: SplitType.PERCENTAGE,
      participants: [
        { memberId: 'a', percentage: 70 },
        { memberId: 'b', percentage: 30 },
      ],
    });
    const result = calculateFullSettlement([p1, p2], twoMembers, Currency.JPY);
    const alice = result.summaries.find((s) => s.memberId === 'a')!;
    expect(alice.totalPaid).toBe(1000);
    expect(alice.totalOwed).toBe(920);

    const bob = result.summaries.find((s) => s.memberId === 'b')!;
    expect(bob.totalPaid).toBe(600);
    expect(bob.totalOwed).toBe(680);
  });
});
