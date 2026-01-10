import {
  Payment,
  Member,
  SplitType,
  SettlementSummary,
  OptimizedSettlement,
  Balance,
  SettlementCalculation,
  Currency,
} from '@/types/warikan';

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
 * Calculate each member's balance based on all payments
 */
export function calculateBalances(
  payments: Payment[],
  members: Member[]
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

  // Calculate final balance for each member
  summaries.forEach((summary) => {
    // Round to avoid floating point issues
    summary.totalPaid = Math.round(summary.totalPaid);
    summary.totalOwed = Math.round(summary.totalOwed);
    summary.balance = summary.totalPaid - summary.totalOwed;
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
  members: Member[]
): OptimizedSettlement[] {
  const settlements: OptimizedSettlement[] = [];

  // Separate creditors (positive balance) and debtors (negative balance)
  const creditors = balances
    .filter((b) => b.amount > 0)
    .map((b) => ({ ...b }))
    .sort((a, b) => b.amount - a.amount); // Sort descending

  const debtors = balances
    .filter((b) => b.amount < 0)
    .map((b) => ({ ...b, amount: Math.abs(b.amount) }))
    .sort((a, b) => b.amount - a.amount); // Sort descending

  let i = 0;
  let j = 0;

  while (i < creditors.length && j < debtors.length) {
    const creditor = creditors[i];
    const debtor = debtors[j];
    const settleAmount = Math.min(creditor.amount, debtor.amount);

    if (settleAmount > 0) {
      const fromMember = members.find((m) => m.id === debtor.memberId);
      const toMember = members.find((m) => m.id === creditor.memberId);

      if (fromMember && toMember) {
        settlements.push({
          from: fromMember,
          to: toMember,
          amount: Math.round(settleAmount),
        });
      }
    }

    creditor.amount -= settleAmount;
    debtor.amount -= settleAmount;

    // Move to next creditor/debtor if current one is settled
    if (creditor.amount <= 0.01) i++;
    if (debtor.amount <= 0.01) j++;
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
  // Calculate summaries for all members
  const summaries = calculateBalances(payments, members);

  // Convert summaries to balances for settlement calculation
  const balances: Balance[] = summaries.map((s) => ({
    memberId: s.memberId,
    memberName: s.memberName,
    amount: s.balance,
  }));

  // Calculate optimal settlements
  const settlements = calculateOptimalSettlements(balances, members);

  // Calculate total amount
  const totalAmount = payments.reduce((sum, p) => sum + p.amount, 0);

  return {
    summaries,
    settlements,
    totalAmount: Math.round(totalAmount),
    currency,
  };
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
