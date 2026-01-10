'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Edit2, Trash2, Users } from 'lucide-react';
import type { Payment, Member } from '@/types/warikan';
import { formatAmount } from '@/lib/warikanAlgorithm';
import { PAYMENT_CATEGORY_LABELS, PaymentCategory, Currency } from '@/types/warikan';

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
  const payer = members.find((m) => m.id === payment.payerId);
  const participantNames = payment.participants
    .map((p) => members.find((m) => m.id === p.memberId)?.name)
    .filter(Boolean);

  const dateStr = new Date(payment.date).toLocaleDateString('ja-JP', {
    month: 'short',
    day: 'numeric',
  });

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-medium">{payment.description}</span>
              {payment.category && (
                <Badge variant="secondary" className="text-xs">
                  {PAYMENT_CATEGORY_LABELS[payment.category as PaymentCategory]}
                </Badge>
              )}
            </div>
            <div className="text-2xl font-bold text-primary">
              {formatAmount(payment.amount, currency)}
            </div>
            <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
              <span>
                <span className="font-medium text-foreground">{payer?.name}</span>
                {' '}が支払い
              </span>
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3" />
                {participantNames.length}人で割り勘
              </span>
              <span>{dateStr}</span>
            </div>
          </div>
          <div className="flex gap-1">
            {onEdit && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onEdit}
                disabled={loading}
              >
                <Edit2 className="h-4 w-4" />
              </Button>
            )}
            {onDelete && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onDelete}
                disabled={loading}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
