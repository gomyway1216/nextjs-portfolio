'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TrendingUp, TrendingDown, Minus, ArrowRight, Loader2 } from 'lucide-react';
import type { SettlementCalculation, Currency, OptimizedSettlement } from '@/types/settli';
import { CURRENCY_NAMES } from '@/types/settli';
import { formatAmount } from '@/lib/settliAlgorithm';
import * as settliService from '@/services/settliService';

interface BalanceSummaryProps {
  calculations: SettlementCalculation[];
  defaultCurrency: Currency;
}

interface SettlementWithCurrency {
  settlement: OptimizedSettlement;
  currency: Currency;
}

interface ConsolidatedSettlement {
  fromName: string;
  fromInitial: string;
  toName: string;
  toInitial: string;
  amount: number;
}

export function BalanceSummary({
  calculations,
  defaultCurrency,
}: BalanceSummaryProps) {
  const [displayCurrency, setDisplayCurrency] = useState<Currency>(defaultCurrency);
  const [rates, setRates] = useState<Record<string, number> | null>(null);
  const [ratesLoading, setRatesLoading] = useState(false);

  const hasMultipleCurrencies = calculations.length > 1;
  const needsConversion = hasMultipleCurrencies ||
    (calculations.length === 1 && calculations[0].currency !== displayCurrency);

  useEffect(() => {
    if (!needsConversion) return;

    let cancelled = false;
    setRatesLoading(true);

    settliService.getExchangeRates('USD').then((data) => {
      if (!cancelled) {
        setRates(data.rates);
        setRatesLoading(false);
      }
    }).catch(() => {
      if (!cancelled) setRatesLoading(false);
    });

    return () => { cancelled = true; };
  }, [needsConversion]);

  const convert = useMemo(() => {
    if (!rates) {
      return (amount: number, from: Currency) => {
        if (from === displayCurrency) return amount;
        return amount;
      };
    }
    return (amount: number, from: Currency): number => {
      if (from === displayCurrency) return amount;
      const fromRate = rates[from] || 1;
      const toRate = rates[displayCurrency] || 1;
      return (amount / fromRate) * toRate;
    };
  }, [rates, displayCurrency]);

  // Per-currency settlements (for "通貨ごと" tab)
  const allSettlements = useMemo(() => {
    const result: SettlementWithCurrency[] = [];
    for (const calc of calculations) {
      if (!calc.settlements) continue;
      for (const s of calc.settlements) {
        result.push({ settlement: s, currency: calc.currency });
      }
    }
    return result;
  }, [calculations]);

  // Consolidated settlements in display currency (for "まとめて精算" tab)
  const consolidatedSettlements = useMemo((): ConsolidatedSettlement[] => {
    const memberBalances = new Map<string, { name: string; balance: number }>();

    for (const calc of calculations) {
      for (const s of calc.summaries) {
        const existing = memberBalances.get(s.memberId);
        const balance = convert(s.balance, calc.currency);
        if (existing) {
          existing.balance += balance;
        } else {
          memberBalances.set(s.memberId, {
            name: s.memberName,
            balance,
          });
        }
      }
    }

    // Greedy settlement on combined balances
    const threshold = 0.01;
    const creditors = Array.from(memberBalances.entries())
      .filter(([, v]) => v.balance > threshold)
      .map(([, v]) => ({ ...v }))
      .sort((a, b) => b.balance - a.balance);

    const debtors = Array.from(memberBalances.entries())
      .filter(([, v]) => v.balance < -threshold)
      .map(([, v]) => ({ name: v.name, balance: Math.abs(v.balance) }))
      .sort((a, b) => b.balance - a.balance);

    const result: ConsolidatedSettlement[] = [];
    let i = 0;
    let j = 0;

    while (i < creditors.length && j < debtors.length) {
      const creditor = creditors[i];
      const debtor = debtors[j];
      const amount = Math.min(creditor.balance, debtor.balance);

      if (amount > threshold) {
        result.push({
          fromName: debtor.name,
          fromInitial: debtor.name.charAt(0).toUpperCase(),
          toName: creditor.name,
          toInitial: creditor.name.charAt(0).toUpperCase(),
          amount,
        });
      }

      creditor.balance -= amount;
      debtor.balance -= amount;
      if (creditor.balance <= threshold) i++;
      if (debtor.balance <= threshold) j++;
    }

    return result;
  }, [calculations, convert]);

  const { memberSummaries, totalAmount } = useMemo(() => {
    const memberMap = new Map<string, {
      memberId: string;
      memberName: string;
      totalPaid: number;
      totalOwed: number;
      balance: number;
    }>();

    let total = 0;

    for (const calc of calculations) {
      total += convert(calc.totalAmount, calc.currency);

      for (const s of calc.summaries) {
        const existing = memberMap.get(s.memberId);
        const paid = convert(s.totalPaid, calc.currency);
        const owed = convert(s.totalOwed, calc.currency);

        if (existing) {
          existing.totalPaid += paid;
          existing.totalOwed += owed;
          existing.balance += convert(s.balance, calc.currency);
        } else {
          memberMap.set(s.memberId, {
            memberId: s.memberId,
            memberName: s.memberName,
            totalPaid: paid,
            totalOwed: owed,
            balance: convert(s.balance, calc.currency),
          });
        }
      }
    }

    const summaries = Array.from(memberMap.values())
      .filter((s) => Math.abs(s.totalPaid) > 0.001 || Math.abs(s.totalOwed) > 0.001)
      .sort((a, b) => b.balance - a.balance);

    return { memberSummaries: summaries, totalAmount: total };
  }, [calculations, convert]);

  const hasTotalSettlements = allSettlements.length > 0 || consolidatedSettlements.length > 0;

  return (
    <div className="space-y-4">
      {/* Settlement Directions */}
      {hasTotalSettlements && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-2">
              <span>精算方法</span>
              <Select
                value={displayCurrency}
                onValueChange={(v) => setDisplayCurrency(v as Currency)}
              >
                <SelectTrigger className="w-[130px] h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CURRENCY_NAMES).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {key} - {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="consolidated">
              <TabsList className="w-full grid grid-cols-2 mb-4">
                <TabsTrigger value="consolidated">まとめて精算</TabsTrigger>
                <TabsTrigger value="by-currency">通貨ごと</TabsTrigger>
              </TabsList>

              {/* Consolidated tab */}
              <TabsContent value="consolidated" className="space-y-3 mt-0">
                {ratesLoading && needsConversion ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    <span className="ml-2 text-sm text-muted-foreground">為替レート取得中...</span>
                  </div>
                ) : consolidatedSettlements.length > 0 ? (
                  <>
                    {consolidatedSettlements.map((s, idx) => (
                      <SettlementRow
                        key={idx}
                        fromName={s.fromName}
                        fromInitial={s.fromInitial}
                        toName={s.toName}
                        toInitial={s.toInitial}
                        amountLabel={formatAmount(s.amount, displayCurrency)}
                      />
                    ))}
                    <p className="text-xs text-muted-foreground text-center pt-1">
                      全通貨を{CURRENCY_NAMES[displayCurrency]}に換算してまとめています（概算）
                    </p>
                  </>
                ) : (
                  <p className="text-center text-muted-foreground py-4">精算不要です</p>
                )}
              </TabsContent>

              {/* By-currency tab */}
              <TabsContent value="by-currency" className="space-y-3 mt-0">
                {calculations.map((calc) => {
                  if (!calc.settlements || calc.settlements.length === 0) return null;
                  return (
                    <div key={calc.currency} className="space-y-2">
                      {hasMultipleCurrencies && (
                        <p className="text-sm font-medium text-muted-foreground">
                          {calc.currency} - {CURRENCY_NAMES[calc.currency]}
                        </p>
                      )}
                      {calc.settlements.map((settlement, idx) => (
                        <SettlementRow
                          key={`${calc.currency}-${idx}`}
                          fromName={settlement.from.name}
                          fromInitial={settlement.from.name.charAt(0).toUpperCase()}
                          toName={settlement.to.name}
                          toInitial={settlement.to.name.charAt(0).toUpperCase()}
                          amountLabel={formatAmount(settlement.amount, calc.currency)}
                        />
                      ))}
                    </div>
                  );
                })}
                <p className="text-xs text-muted-foreground text-center pt-1">
                  各通貨の実額で精算してください
                </p>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}

      {/* Balance Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-2">
            <span>収支サマリー</span>
            <span className="text-sm font-normal text-muted-foreground whitespace-nowrap">
              合計: {formatAmount(totalAmount, displayCurrency)}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {ratesLoading && needsConversion ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">為替レート取得中...</span>
            </div>
          ) : (
            <>
              {needsConversion && !rates && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  為替レートの取得に失敗しました。通貨換算なしで表示しています。
                </p>
              )}
              {memberSummaries.map((summary) => (
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
                        支払い: {formatAmount(summary.totalPaid, displayCurrency)} / 負担: {formatAmount(summary.totalOwed, displayCurrency)}
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
                        +{formatAmount(summary.balance, displayCurrency)}
                      </>
                    ) : summary.balance < 0 ? (
                      <>
                        <TrendingDown className="h-4 w-4" />
                        {formatAmount(summary.balance, displayCurrency)}
                      </>
                    ) : (
                      <>
                        <Minus className="h-4 w-4" />
                        {formatAmount(0, displayCurrency)}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </>
          )}

          <div className="pt-2 text-xs text-muted-foreground">
            <span className="text-green-600 dark:text-green-400">+</span> 受け取る金額
            {' / '}
            <span className="text-red-600 dark:text-red-400">-</span> 支払う金額
            {needsConversion && rates && (
              <span className="ml-1">（為替レートによる概算）</span>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SettlementRow({
  fromName,
  fromInitial,
  toName,
  toInitial,
  amountLabel,
}: {
  fromName: string;
  fromInitial: string;
  toName: string;
  toInitial: string;
  amountLabel: string;
}) {
  return (
    <div className="flex items-center justify-between p-4 rounded-lg border">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center text-sm font-medium text-red-700 dark:text-red-300 flex-shrink-0">
          {fromInitial}
        </div>
        <span className="font-medium truncate">{fromName}</span>

        <ArrowRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />

        <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-sm font-medium text-green-700 dark:text-green-300 flex-shrink-0">
          {toInitial}
        </div>
        <span className="font-medium truncate">{toName}</span>
      </div>

      <div className="text-lg font-bold text-primary flex-shrink-0 ml-3">
        {amountLabel}
      </div>
    </div>
  );
}
