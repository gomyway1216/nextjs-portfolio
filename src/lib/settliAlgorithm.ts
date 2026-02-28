import {
  Payment,
  Member,
  SplitType,
  SettlementSummary,
  OptimizedSettlement,
  Balance,
  SettlementCalculation,
  MultiCurrencySettlement,
  Currency,
} from '@/types/settli';

/**
 * Calculate how much each participant owes for a single payment
 */
export function calculateParticipantAmounts(
  payment: Payment,
  members: Member[]
): Map<string, number> {
  const amounts = new Map<string, number>();
  const { participants, amount, splitType } = payment;

  // Filter active participants
  const activeParticipants = participants.filter((p) => {
    const member = members.find((m) => m.id === p.memberId);
    return member?.isActive !== false;
  });

  if (activeParticipants.length === 0) {
    return amounts;
  }

  switch (splitType) {
    case SplitType.EQUAL: {
      // Equal split with optional weight override
      const totalWeight = activeParticipants.reduce((sum, p) => {
        const member = members.find((m) => m.id === p.memberId);
        return sum + (p.weight ?? member?.weight ?? 1);
      }, 0);

      activeParticipants.forEach((p) => {
        const member = members.find((m) => m.id === p.memberId);
        const weight = p.weight ?? member?.weight ?? 1;
        amounts.set(p.memberId, (amount * weight) / totalWeight);
      });
      break;
    }

    case SplitType.PERCENTAGE: {
      // Split by percentage
      activeParticipants.forEach((p) => {
        if (p.percentage !== undefined) {
          amounts.set(p.memberId, (amount * p.percentage) / 100);
        }
      });
      break;
    }

    case SplitType.AMOUNT: {
      // Fixed amount per participant
      activeParticipants.forEach((p) => {
        if (p.amount !== undefined) {
          amounts.set(p.memberId, p.amount);
        }
      });
      break;
    }

    case SplitType.SHARES: {
      // Split by shares
      const totalShares = activeParticipants.reduce(
        (sum, p) => sum + (p.shares ?? 1),
        0
      );
      activeParticipants.forEach((p) => {
        const shares = p.shares ?? 1;
        amounts.set(p.memberId, (amount * shares) / totalShares);
      });
      break;
    }
  }

  return amounts;
}

/**
 * Round for calculation: JPY/KRW to nearest 1, others to nearest 0.01
 */
function calcRound(amount: number, currency: Currency): number {
  if (currency === Currency.JPY || currency === Currency.KRW) {
    return Math.round(amount);
  }
  return Math.round(amount * 100) / 100;
}

/**
 * Calculate each member's balance based on all payments
 */
export function calculateBalances(
  payments: Payment[],
  members: Member[],
  currency: Currency
): SettlementSummary[] {
  const summaries = new Map<string, SettlementSummary>();

  // Initialize summaries for all active members
  members.forEach((member) => {
    if (member.isActive !== false) {
      summaries.set(member.id, {
        memberId: member.id,
        memberName: member.name,
        totalPaid: 0,
        totalOwed: 0,
        balance: 0,
      });
    }
  });

  // Process each payment
  payments.forEach((payment) => {
    // Add to payer's totalPaid
    const payer = summaries.get(payment.payerId);
    if (payer) {
      payer.totalPaid += payment.amount;
    }

    // Calculate what each participant owes
    const participantAmounts = calculateParticipantAmounts(payment, members);

    participantAmounts.forEach((owedAmount, memberId) => {
      const summary = summaries.get(memberId);
      if (summary) {
        summary.totalOwed += owedAmount;
      }
    });
  });

  // Calculate final balance for each member with currency-aware rounding
  summaries.forEach((summary) => {
    summary.totalPaid = calcRound(summary.totalPaid, currency);
    summary.totalOwed = calcRound(summary.totalOwed, currency);
    summary.balance = calcRound(summary.totalPaid - summary.totalOwed, currency);
  });

  return Array.from(summaries.values());
}

/**
 * Calculate optimal settlements using a greedy algorithm (Minimum Cash Flow)
 * This minimizes the number of transactions needed
 * Time complexity: O(n log n) where n = number of members
 */
export function calculateOptimalSettlements(
  balances: Balance[],
  members: Member[],
  currency: Currency
): OptimizedSettlement[] {
  const settlements: OptimizedSettlement[] = [];
  const threshold = (currency === Currency.JPY || currency === Currency.KRW) ? 0.5 : 0.005;

  // Separate creditors (positive balance) and debtors (negative balance)
  const creditors = balances
    .filter((b) => b.amount > threshold)
    .map((b) => ({ ...b }))
    .sort((a, b) => b.amount - a.amount);

  const debtors = balances
    .filter((b) => b.amount < -threshold)
    .map((b) => ({ ...b, amount: Math.abs(b.amount) }))
    .sort((a, b) => b.amount - a.amount);

  let i = 0;
  let j = 0;

  while (i < creditors.length && j < debtors.length) {
    const creditor = creditors[i];
    const debtor = debtors[j];
    const settleAmount = Math.min(creditor.amount, debtor.amount);

    if (settleAmount > threshold) {
      const fromMember = members.find((m) => m.id === debtor.memberId);
      const toMember = members.find((m) => m.id === creditor.memberId);

      if (fromMember && toMember) {
        settlements.push({
          from: fromMember,
          to: toMember,
          amount: calcRound(settleAmount, currency),
        });
      }
    }

    creditor.amount -= settleAmount;
    debtor.amount -= settleAmount;

    if (creditor.amount <= threshold) i++;
    if (debtor.amount <= threshold) j++;
  }

  return settlements;
}

/**
 * Main function to calculate full settlement including summaries and optimal settlements
 */
export function calculateFullSettlement(
  payments: Payment[],
  members: Member[],
  currency: Currency
): SettlementCalculation {
  const summaries = calculateBalances(payments, members, currency);

  const balances: Balance[] = summaries.map((s) => ({
    memberId: s.memberId,
    memberName: s.memberName,
    amount: s.balance,
  }));

  const settlements = calculateOptimalSettlements(balances, members, currency);
  const totalAmount = payments.reduce((sum, p) => sum + p.amount, 0);

  return {
    summaries,
    settlements,
    totalAmount: calcRound(totalAmount, currency),
    currency,
  };
}

/**
 * Calculate settlements grouped by currency.
 * Each currency gets its own independent balance sheet and settlement list.
 */
export function calculateMultiCurrencySettlement(
  payments: Payment[],
  members: Member[],
  groupCurrency: Currency
): MultiCurrencySettlement {
  const paymentsByCurrency = new Map<string, Payment[]>();

  for (const payment of payments) {
    const cur = payment.currency || groupCurrency;
    const list = paymentsByCurrency.get(cur) || [];
    list.push(payment);
    paymentsByCurrency.set(cur, list);
  }

  // Sort currencies: group currency first, then alphabetically
  const sortedCurrencies = Array.from(paymentsByCurrency.keys()).sort((a, b) => {
    if (a === groupCurrency) return -1;
    if (b === groupCurrency) return 1;
    return a.localeCompare(b);
  });

  const byCurrency: SettlementCalculation[] = sortedCurrencies.map((cur) => {
    const curPayments = paymentsByCurrency.get(cur)!;
    return calculateFullSettlement(curPayments, members, cur as Currency);
  });

  const totalSettlementCount = byCurrency.reduce(
    (sum, c) => sum + c.settlements.length,
    0
  );

  return { byCurrency, totalSettlementCount };
}

/**
 * Round amount based on currency (JPY rounds to 10, others to 2 decimal places)
 */
export function roundAmount(amount: number, currency: Currency): number {
  if (currency === Currency.JPY || currency === Currency.KRW) {
    // Round to nearest 10 for currencies without decimals
    return Math.round(amount / 10) * 10;
  }
  // Round to 2 decimal places for other currencies
  return Math.round(amount * 100) / 100;
}

/**
 * Format amount with currency symbol
 */
export function formatAmount(amount: number, currency: Currency): string {
  const currencySymbols: Record<Currency, string> = {
    [Currency.JPY]: '¥',
    [Currency.USD]: '$',
    [Currency.EUR]: '€',
    [Currency.GBP]: '£',
    [Currency.CNY]: '¥',
    [Currency.KRW]: '₩',
    [Currency.TWD]: 'NT$',
    [Currency.THB]: '฿',
    [Currency.AUD]: 'A$',
  };

  const symbol = currencySymbols[currency] || currency;
  const roundedAmount = roundAmount(amount, currency);

  if (currency === Currency.JPY || currency === Currency.KRW) {
    return `${symbol}${roundedAmount.toLocaleString()}`;
  }

  return `${symbol}${roundedAmount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Convert amount from one currency to another
 */
export function convertAmount(
  amount: number,
  fromCurrency: Currency,
  toCurrency: Currency,
  exchangeRates: Record<string, number>
): number {
  if (fromCurrency === toCurrency) {
    return amount;
  }

  // Exchange rates are relative to base currency (usually JPY or USD)
  const fromRate = exchangeRates[fromCurrency] || 1;
  const toRate = exchangeRates[toCurrency] || 1;

  return (amount / fromRate) * toRate;
}

/**
 * Generate a unique share code for a group
 */
export function generateShareCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude similar chars (0O, 1I)
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}
