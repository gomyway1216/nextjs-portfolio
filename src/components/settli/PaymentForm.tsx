'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Check } from 'lucide-react';
import type { Member, CreatePaymentInput, Payment, Participant } from '@/types/settli';
import { useTranslation } from 'react-i18next';
import {
  SplitType,
  PaymentCategory,
  Currency,
  CURRENCY_NAMES,
  CURRENCY_SYMBOLS,
  PAYMENT_CATEGORY_LABELS,
} from '@/types/settli';

interface PaymentFormProps {
  members: Member[];
  groupId: string;
  currency: Currency;
  initialPayment?: Payment;
  onSubmit: (input: CreatePaymentInput) => Promise<void>;
  onCancel: () => void;
  loading?: boolean;
}

export function PaymentForm({
  members,
  groupId,
  currency,
  initialPayment,
  onSubmit,
  onCancel,
  loading,
}: PaymentFormProps) {
  const { t } = useTranslation();
  const [payerId, setPayerId] = useState(initialPayment?.payerId || '');
  const [amount, setAmount] = useState(initialPayment?.amount?.toString() || '');
  const [description, setDescription] = useState(initialPayment?.description || '');
  const [category, setCategory] = useState<PaymentCategory | ''>(
    initialPayment?.category || ''
  );
  const [paymentCurrency, setPaymentCurrency] = useState<Currency>(
    (initialPayment?.currency as Currency) || currency
  );
  const [date, setDate] = useState(
    initialPayment?.date
      ? new Date(initialPayment.date).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0]
  );
  const [splitType] = useState<SplitType>(
    initialPayment?.splitType || SplitType.EQUAL
  );
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>(
    initialPayment?.participants.map((p) => p.memberId) ||
      members.filter((m) => m.isActive !== false).map((m) => m.id)
  );

  const activeMembers = members.filter((m) => m.isActive !== false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!payerId || !amount || !description || selectedParticipants.length === 0) {
      return;
    }

    const participants: Participant[] = selectedParticipants.map((memberId) => ({
      memberId,
    }));

    const input: CreatePaymentInput = {
      groupId,
      payerId,
      amount: parseFloat(amount),
      currency: paymentCurrency,
      description,
      category: category || undefined,
      date,
      splitType,
      participants,
    };

    await onSubmit(input);
  };

  const toggleParticipant = (memberId: string) => {
    setSelectedParticipants((prev) =>
      prev.includes(memberId)
        ? prev.filter((id) => id !== memberId)
        : [...prev, memberId]
    );
  };

  const selectAllParticipants = () => {
    setSelectedParticipants(activeMembers.map((m) => m.id));
  };

  const clearAllParticipants = () => {
    setSelectedParticipants([]);
  };

  const allSelected = selectedParticipants.length === activeMembers.length;
  const currencyName = (key: string, fallback: string) =>
    t(`settli.currency.${key}`, { defaultValue: fallback });
  const categoryLabel = (key: string, fallback: string) =>
    t(`settli.payment.categories.${key}`, { defaultValue: fallback });

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-lg">
          {initialPayment ? t('settli.payment.editTitle') : t('settli.payment.addTitle')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Payer */}
          <div className="space-y-1.5">
            <Label htmlFor="payer" className="text-sm font-medium">{t('settli.payment.payer')} *</Label>
            <Select value={payerId} onValueChange={setPayerId}>
              <SelectTrigger id="payer" className="w-full">
                <SelectValue placeholder={t('settli.common.select')} />
              </SelectTrigger>
              <SelectContent>
                {activeMembers.map((member) => (
                  <SelectItem key={member.id} value={member.id}>
                    {member.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Amount + Currency */}
          <div className="space-y-1.5">
            <Label htmlFor="amount" className="text-sm font-medium">{t('settli.payment.amount')} *</Label>
            <div className="flex gap-2">
              <div
                className="flex items-center h-9 w-full rounded-md border border-input bg-transparent shadow-sm focus-within:outline-none focus-within:ring-1 focus-within:ring-ring min-w-0"
                style={{ flex: '1 1 0' }}
              >
                <span className="pl-3 text-muted-foreground text-sm select-none shrink-0">
                  {CURRENCY_SYMBOLS[paymentCurrency]}
                </span>
                <input
                  id="amount"
                  type="text"
                  inputMode="decimal"
                  pattern="[0-9]*\.?[0-9]*"
                  value={amount}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === '' || /^\d*\.?\d*$/.test(v)) {
                      setAmount(v);
                    }
                  }}
                  placeholder="0"
                  required
                  disabled={loading}
                  className="flex-1 min-w-0 h-full bg-transparent pl-1 pr-3 py-1 text-base md:text-sm placeholder:text-muted-foreground outline-none border-none shadow-none ring-0 focus:outline-none focus:border-none focus:shadow-none focus:ring-0 disabled:cursor-not-allowed disabled:opacity-50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  style={{ WebkitAppearance: 'none', outline: 'none', boxShadow: 'none' }}
                />
              </div>
              <Select
                value={paymentCurrency}
                onValueChange={(v) => setPaymentCurrency(v as Currency)}
              >
                <SelectTrigger className="shrink-0" style={{ width: '5.5rem' }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CURRENCY_NAMES).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {key} - {currencyName(key, label)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="description" className="text-sm font-medium">{t('settli.payment.description')} *</Label>
            <Input
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('settli.payment.descriptionPlaceholder')}
              required
              disabled={loading}
            />
          </div>

          {/* Category & Date row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="category" className="text-sm font-medium">{t('settli.payment.category')}</Label>
              <Select
                value={category}
                onValueChange={(v) => setCategory(v as PaymentCategory)}
              >
                <SelectTrigger id="category" className="w-full">
                  <SelectValue placeholder={t('settli.common.optional')} />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PAYMENT_CATEGORY_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {categoryLabel(key, label)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="date" className="text-sm font-medium">{t('settli.payment.date')}</Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                disabled={loading}
              />
            </div>
          </div>

          {/* Participants */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">
                {t('settli.payment.splitMembers')} *
                <span className="text-muted-foreground font-normal ml-1">
                  ({selectedParticipants.length}/{activeMembers.length})
                </span>
              </Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs px-2"
                onClick={allSelected ? clearAllParticipants : selectAllParticipants}
              >
                {allSelected ? t('settli.common.clearAll') : t('settli.common.selectAll')}
              </Button>
            </div>
            <div className="space-y-1.5">
              {activeMembers.map((member) => {
                const isSelected = selectedParticipants.includes(member.id);
                return (
                  <div
                    key={member.id}
                    role="checkbox"
                    aria-checked={isSelected}
                    tabIndex={0}
                    onClick={() => !loading && toggleParticipant(member.id)}
                    onKeyDown={(e) => {
                      if (e.key === ' ' || e.key === 'Enter') {
                        e.preventDefault();
                        if (!loading) toggleParticipant(member.id);
                      }
                    }}
                    className={`flex items-center gap-3 w-full p-3 rounded-lg border cursor-pointer select-none transition-colors ${
                      isSelected
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:bg-muted/50'
                    } ${loading ? 'opacity-50 pointer-events-none' : ''}`}
                  >
                    <div className={`w-5 h-5 rounded-sm border shrink-0 flex items-center justify-center transition-colors ${
                      isSelected
                        ? 'bg-primary border-primary text-primary-foreground'
                        : 'border-primary'
                    }`}>
                      {isSelected && <Check className="h-3.5 w-3.5" />}
                    </div>
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium shrink-0 ${
                        isSelected
                          ? 'bg-primary/10 text-primary'
                          : 'bg-muted text-muted-foreground'
                      }`}>
                        {member.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="truncate text-sm">{member.name}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={loading}
              className="flex-1"
            >
              {t('settli.common.cancel')}
            </Button>
            <Button
              type="submit"
              disabled={
                loading ||
                !payerId ||
                !amount ||
                !description ||
                selectedParticipants.length === 0
              }
              className="flex-1"
            >
              {loading
                ? t('settli.common.processing')
                : initialPayment
                  ? t('settli.common.update')
                  : t('settli.common.add')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
