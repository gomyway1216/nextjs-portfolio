'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Wallet, TrendingDown, TrendingUp } from 'lucide-react';
import { KAIMONO_CURRENCY_SYMBOLS, KaimonoCurrency } from '@/types/kaimono';
import { useTranslation } from 'react-i18next';

interface BudgetSummaryProps {
  budget?: number;
  totalSpent: number;
  currency: string;
  itemCount: number;
  purchasedCount: number;
}

export function BudgetSummary({
  budget,
  totalSpent,
  currency,
  itemCount,
  purchasedCount,
}: BudgetSummaryProps) {
  const { t } = useTranslation();
  const symbol = KAIMONO_CURRENCY_SYMBOLS[currency as KaimonoCurrency] || currency;
  const remaining = budget ? budget - totalSpent : null;
  const isOverBudget = remaining !== null && remaining < 0;
  const budgetPercentage = budget ? Math.min((totalSpent / budget) * 100, 100) : 0;

  const formatAmount = (amount: number) => {
    if (currency === 'JPY' || currency === 'KRW') {
      return `${symbol}${Math.round(amount).toLocaleString()}`;
    }
    return `${symbol}${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-4">
          {/* Spent */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
              <Wallet className="h-5 w-5 text-emerald-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t('kaimono.budget.spent', 'Spent')}</p>
              <p className="text-lg font-bold">{formatAmount(totalSpent)}</p>
            </div>
          </div>

          {/* Remaining */}
          {budget !== undefined && budget > 0 && (
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                isOverBudget ? 'bg-red-500/10' : 'bg-blue-500/10'
              }`}>
                {isOverBudget ? (
                  <TrendingUp className="h-5 w-5 text-red-500" />
                ) : (
                  <TrendingDown className="h-5 w-5 text-blue-500" />
                )}
              </div>
              <div>
                <p className="text-xs text-muted-foreground">
                  {isOverBudget ? t('kaimono.budget.over', 'Over') : t('kaimono.budget.remaining', 'Remaining')}
                </p>
                <p className={`text-lg font-bold ${isOverBudget ? 'text-red-500' : ''}`}>
                  {formatAmount(Math.abs(remaining!))}
                </p>
              </div>
            </div>
          )}

          {/* Items count */}
          <div className="text-right">
            <p className="text-xs text-muted-foreground">{t('kaimono.budget.items', 'Items')}</p>
            <p className="text-lg font-bold">{purchasedCount}/{itemCount}</p>
          </div>
        </div>

        {/* Budget bar */}
        {budget !== undefined && budget > 0 && (
          <div className="mt-3">
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>{t('kaimono.budget.budget', 'Budget')}: {formatAmount(budget)}</span>
              <span>{Math.round(budgetPercentage)}%</span>
            </div>
            <div className="w-full bg-muted rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all ${
                  isOverBudget ? 'bg-red-500' : budgetPercentage > 80 ? 'bg-yellow-500' : 'bg-emerald-500'
                }`}
                style={{ width: `${Math.min(budgetPercentage, 100)}%` }}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
