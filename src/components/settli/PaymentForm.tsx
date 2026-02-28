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
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { Member, CreatePaymentInput, Payment, Participant } from '@/types/settli';
import {
  SplitType,
  PaymentCategory,
  Currency,
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
  const [payerId, setPayerId] = useState(initialPayment?.payerId || '');
  const [amount, setAmount] = useState(initialPayment?.amount?.toString() || '');
  const [description, setDescription] = useState(initialPayment?.description || '');
  const [category, setCategory] = useState<PaymentCategory | ''>(
    initialPayment?.category || ''
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {initialPayment ? '支払いを編集' : '支払いを追加'}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Payer */}
          <div className="space-y-2">
            <Label htmlFor="payer">支払った人 *</Label>
            <Select value={payerId} onValueChange={setPayerId}>
              <SelectTrigger id="payer">
                <SelectValue placeholder="選択してください" />
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

          {/* Amount */}
          <div className="space-y-2">
            <Label htmlFor="amount">金額 ({currency}) *</Label>
            <Input
              id="amount"
              type="number"
              min="0"
              step="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="1000"
              required
              disabled={loading}
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">内容 *</Label>
            <Input
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="ランチ、タクシー代など"
              required
              disabled={loading}
            />
          </div>

          {/* Category */}
          <div className="space-y-2">
            <Label htmlFor="category">カテゴリ (任意)</Label>
            <Select
              value={category}
              onValueChange={(v) => setCategory(v as PaymentCategory)}
            >
              <SelectTrigger id="category">
                <SelectValue placeholder="選択してください" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(PAYMENT_CATEGORY_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Date */}
          <div className="space-y-2">
            <Label htmlFor="date">日付</Label>
            <Input
              id="date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              disabled={loading}
            />
          </div>

          {/* Participants */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>割り勘メンバー *</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={selectAllParticipants}
                >
                  全選択
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={clearAllParticipants}
                >
                  全解除
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {activeMembers.map((member) => (
                <label
                  key={member.id}
                  className="flex items-center gap-2 p-2 rounded-lg border cursor-pointer hover:bg-muted/50"
                >
                  <Checkbox
                    checked={selectedParticipants.includes(member.id)}
                    onCheckedChange={() => toggleParticipant(member.id)}
                    disabled={loading}
                  />
                  <span>{member.name}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 justify-end pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={loading}
            >
              キャンセル
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
            >
              {initialPayment ? '更新' : '追加'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
