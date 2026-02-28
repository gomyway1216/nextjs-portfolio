'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { SettlementSummary, Currency } from '@/types/settli';
import { formatAmount } from '@/lib/settliAlgorithm';

interface BalanceSummaryProps {
  summaries: SettlementSummary[];
  totalAmount: number;
  currency: Currency;
}

export function BalanceSummary({
  summaries,
  totalAmount,
  currency,
}: BalanceSummaryProps) {
  // Sort by balance (most positive first)
  const sortedSummaries = [...summaries].sort((a, b) => b.balance - a.balance);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>収支サマリー</span>
          <span className="text-sm font-normal text-muted-foreground">
            合計: {formatAmount(totalAmount, currency)}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {sortedSummaries.map((summary) => (
          <div
            key={summary.memberId}
            className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium">
                {summary.memberName.charAt(0).toUpperCase()}
              </div>
              <div>
                <span className="font-medium">{summary.memberName}</span>
                <div className="text-xs text-muted-foreground">
                  支払い: {formatAmount(summary.totalPaid, currency)} / 負担: {formatAmount(summary.totalOwed, currency)}
                </div>
              </div>
            </div>

            <div
              className={`flex items-center gap-1 font-bold ${
                summary.balance > 0
                  ? 'text-green-600 dark:text-green-400'
                  : summary.balance < 0
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-muted-foreground'
              }`}
            >
              {summary.balance > 0 ? (
                <>
                  <TrendingUp className="h-4 w-4" />
                  +{formatAmount(summary.balance, currency)}
                </>
              ) : summary.balance < 0 ? (
                <>
                  <TrendingDown className="h-4 w-4" />
                  {formatAmount(summary.balance, currency)}
                </>
              ) : (
                <>
                  <Minus className="h-4 w-4" />
                  {formatAmount(0, currency)}
                </>
              )}
            </div>
          </div>
        ))}

        <div className="pt-2 text-sm text-muted-foreground">
          <p>
            <span className="text-green-600 dark:text-green-400">+</span> 受け取る金額
            {' / '}
            <span className="text-red-600 dark:text-red-400">-</span> 支払う金額
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
