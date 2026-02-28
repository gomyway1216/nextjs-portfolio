'use client';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Edit2, Trash2, Users } from 'lucide-react';
import type { Payment, Member } from '@/types/settli';
import { formatAmount } from '@/lib/settliAlgorithm';
import { PAYMENT_CATEGORY_LABELS, PaymentCategory, Currency } from '@/types/settli';
import { useTranslation } from 'react-i18next';

interface PaymentCardProps {
  payment: Payment;
  members: Member[];
  currency: Currency;
  onEdit?: () => void;
  onDelete?: () => void;
  loading?: boolean;
}

export function PaymentCard({
  payment,
  members,
  currency,
  onEdit,
  onDelete,
  loading,
}: PaymentCardProps) {
  const { t, i18n } = useTranslation();
  const language = i18n.language === 'ja' ? 'ja-JP' : 'en-US';
  const payer = members.find((m) => m.id === payment.payerId);
  const participantNames = payment.participants
    .map((p) => members.find((m) => m.id === p.memberId)?.name)
    .filter(Boolean);

  const dateStr = new Date(payment.date).toLocaleDateString(language, {
    month: 'short',
    day: 'numeric',
  });

  return (
    <div className="flex items-center justify-between gap-2 py-3 border-b last:border-b-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-medium text-sm truncate">{payment.description}</span>
          {payment.category && (
            <Badge variant="secondary" className="text-[10px] px-1 py-0 shrink-0 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
              {t(`settli.payment.categories.${payment.category as PaymentCategory}`, {
                defaultValue: PAYMENT_CATEGORY_LABELS[payment.category as PaymentCategory],
              })}
            </Badge>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0 mt-0.5 text-[11px] text-muted-foreground">
          <span>
            <span className="font-medium text-foreground">{payer?.name}</span>
            {' '}{t('settli.payment.paidBy')}
          </span>
          <span className="flex items-center gap-0.5">
            <Users className="h-3 w-3" />
            {t('settli.common.memberCount', { count: participantNames.length })}
          </span>
          <span>{dateStr}</span>
        </div>
      </div>
      <div className="text-right font-semibold text-sm shrink-0">
        {formatAmount(payment.amount, (payment.currency as Currency) || currency)}
      </div>
      <div className="flex gap-0 shrink-0">
        {onEdit && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onEdit}
            disabled={loading}
          >
            <Edit2 className="h-3 w-3" />
          </Button>
        )}
        {onDelete && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onDelete}
            disabled={loading}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        )}
      </div>
    </div>
  );
}
