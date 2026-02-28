'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import type { SettlementCalculation } from '@/types/settli';
import { formatAmount } from '@/lib/settliAlgorithm';
import { useTranslation } from 'react-i18next';

interface SettlementListProps {
  calculations: SettlementCalculation[];
  totalSettlementCount: number;
}

export function SettlementList({ calculations, totalSettlementCount }: SettlementListProps) {
  const { t } = useTranslation();
  if (totalSettlementCount === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <CheckCircle2 className="h-12 w-12 mx-auto mb-4 text-green-500" />
          <p className="text-lg font-medium">{t('settli.settlement.completedTitle')}</p>
          <p className="text-muted-foreground">
            {t('settli.settlement.completedDescription')}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {calculations.map((calc) => {
        if (calc.settlements.length === 0) return null;

        return (
          <Card key={calc.currency}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {t('settli.settlement.listTitle')} ({calc.currency})
                <span className="text-sm font-normal text-muted-foreground">
                  ({t('settli.settlement.transferCount', { count: calc.settlements.length })})
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {calc.settlements.map((settlement, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-4 bg-muted/50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center text-sm font-medium text-red-700 dark:text-red-300">
                        {settlement.from.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="font-medium">{settlement.from.name}</span>
                    </div>

                    <ArrowRight className="h-5 w-5 text-muted-foreground" />

                    <div className="flex items-center gap-2">
                      <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-sm font-medium text-green-700 dark:text-green-300">
                        {settlement.to.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="font-medium">{settlement.to.name}</span>
                    </div>
                  </div>

                  <div className="text-xl font-bold text-primary">
                    {formatAmount(settlement.amount, calc.currency)}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        );
      })}

      <p className="text-sm text-muted-foreground text-center">
        {t('settli.settlement.optimizedNote')}
      </p>
    </div>
  );
}
