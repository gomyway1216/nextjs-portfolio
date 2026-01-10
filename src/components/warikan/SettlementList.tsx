'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import type { OptimizedSettlement, Currency } from '@/types/warikan';
import { formatAmount } from '@/lib/warikanAlgorithm';

interface SettlementListProps {
  settlements: OptimizedSettlement[];
  currency: Currency;
}

export function SettlementList({ settlements, currency }: SettlementListProps) {
  if (settlements.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <CheckCircle2 className="h-12 w-12 mx-auto mb-4 text-green-500" />
          <p className="text-lg font-medium">精算完了!</p>
          <p className="text-muted-foreground">
            全員の収支がバランスしています
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          精算リスト
          <span className="text-sm font-normal text-muted-foreground">
            ({settlements.length}件の送金)
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {settlements.map((settlement, index) => (
          <div
            key={index}
            className="flex items-center justify-between p-4 bg-muted/50 rounded-lg"
          >
            <div className="flex items-center gap-3">
              {/* From */}
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center text-sm font-medium text-red-700 dark:text-red-300">
                  {settlement.from.name.charAt(0).toUpperCase()}
                </div>
                <span className="font-medium">{settlement.from.name}</span>
              </div>

              {/* Arrow */}
              <ArrowRight className="h-5 w-5 text-muted-foreground" />

              {/* To */}
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-sm font-medium text-green-700 dark:text-green-300">
                  {settlement.to.name.charAt(0).toUpperCase()}
                </div>
                <span className="font-medium">{settlement.to.name}</span>
              </div>
            </div>

            {/* Amount */}
            <div className="text-xl font-bold text-primary">
              {formatAmount(settlement.amount, currency)}
            </div>
          </div>
        ))}

        <p className="text-sm text-muted-foreground text-center pt-2">
          最適化された精算で、送金回数を最小限にしています
        </p>
      </CardContent>
    </Card>
  );
}
