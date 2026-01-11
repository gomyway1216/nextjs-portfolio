'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ArrowLeft,
  Plus,
  Users,
  Receipt,
  Calculator,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  useWarikanGroup,
  useWarikanPayments,
  useWarikanSettlements,
  useWarikanMutations,
} from '@/hooks/useWarikan';
import {
  MemberList,
  PaymentCard,
  PaymentForm,
  SettlementList,
  BalanceSummary,
  ShareDialog,
  PasscodeDialog,
} from '@/components/warikan';
import type { CreatePaymentInput } from '@/types/warikan';

export default function WarikanGroupPage() {
  const params = useParams();
  const router = useRouter();
  const groupId = params.groupId as string;

  const { group, loading: groupLoading, refetch: refetchGroup, requiresPasscode, verifyPasscode } = useWarikanGroup(groupId);
  const { payments, loading: paymentsLoading, refetch: refetchPayments } = useWarikanPayments(groupId);
  const { settlements, loading: settlementsLoading, refetch: refetchSettlements } = useWarikanSettlements(groupId);
  const { addMember, updateMember, removeMember, createPayment, deletePayment, generateQRCode, loading: mutationLoading } = useWarikanMutations();

  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [activeTab, setActiveTab] = useState('payments');

  // Refetch settlements when payments change
  useEffect(() => {
    if (!paymentsLoading) {
      refetchSettlements();
    }
  }, [payments.length, paymentsLoading]);

  const handleAddMember = async (name: string, email?: string, weight?: number) => {
    try {
      await addMember(groupId, { name, email, weight });
      await refetchGroup();
      toast.success('メンバーを追加しました');
    } catch {
      toast.error('メンバーの追加に失敗しました');
    }
  };

  const handleUpdateMember = async (memberId: string, name: string, weight: number) => {
    try {
      await updateMember(groupId, memberId, { name, weight });
      await refetchGroup();
      toast.success('メンバーを更新しました');
    } catch {
      toast.error('メンバーの更新に失敗しました');
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    try {
      await removeMember(groupId, memberId);
      await refetchGroup();
      toast.success('メンバーを削除しました');
    } catch {
      toast.error('メンバーの削除に失敗しました');
    }
  };

  const handleAddPayment = async (input: CreatePaymentInput) => {
    try {
      await createPayment(input);
      await refetchPayments();
      setShowPaymentForm(false);
      toast.success('支払いを追加しました');
    } catch {
      toast.error('支払いの追加に失敗しました');
    }
  };

  const handleDeletePayment = async (paymentId: string) => {
    try {
      await deletePayment(groupId, paymentId);
      await refetchPayments();
      toast.success('支払いを削除しました');
    } catch {
      toast.error('支払いの削除に失敗しました');
    }
  };

  const handleGenerateQR = async () => {
    return await generateQRCode(groupId);
  };

  if (groupLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Show passcode dialog if required
  if (requiresPasscode && group) {
    return (
      <PasscodeDialog
        open={true}
        groupName={group.name}
        onVerify={verifyPasscode}
        onCancel={() => router.push('/tools/warikan')}
      />
    );
  }

  if (!group) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold mb-2">グループが見つかりません</h2>
        <p className="text-muted-foreground mb-4">
          このグループは存在しないか、アクセス権限がありません
        </p>
        <Link href="/tools/warikan">
          <Button>トップに戻る</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/tools/warikan">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">{group.name}</h1>
            {group.description && (
              <p className="text-muted-foreground">{group.description}</p>
            )}
          </div>
        </div>
        <ShareDialog
          groupId={group.id}
          groupName={group.name}
          shareCode={group.shareCode}
          onGenerateQR={handleGenerateQR}
        />
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">
                {group.members.filter((m) => m.isActive !== false).length}
              </p>
              <p className="text-sm text-muted-foreground">メンバー</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <Receipt className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{payments.length}</p>
              <p className="text-sm text-muted-foreground">支払い</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
              <Calculator className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">
                {settlements?.settlements.length || 0}
              </p>
              <p className="text-sm text-muted-foreground">精算件数</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full grid grid-cols-3">
          <TabsTrigger value="payments" className="flex items-center gap-1">
            <Receipt className="h-4 w-4" />
            支払い
          </TabsTrigger>
          <TabsTrigger value="members" className="flex items-center gap-1">
            <Users className="h-4 w-4" />
            メンバー
          </TabsTrigger>
          <TabsTrigger value="settlements" className="flex items-center gap-1">
            <Calculator className="h-4 w-4" />
            精算
          </TabsTrigger>
        </TabsList>

        {/* Payments Tab */}
        <TabsContent value="payments" className="space-y-4 mt-4">
          {showPaymentForm ? (
            <PaymentForm
              members={group.members}
              groupId={group.id}
              currency={group.currency}
              onSubmit={handleAddPayment}
              onCancel={() => setShowPaymentForm(false)}
              loading={mutationLoading}
            />
          ) : (
            <Button
              onClick={() => setShowPaymentForm(true)}
              className="w-full"
              disabled={group.members.filter((m) => m.isActive !== false).length < 2}
            >
              <Plus className="h-4 w-4 mr-2" />
              支払いを追加
            </Button>
          )}

          {paymentsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : payments.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <Receipt className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">
                  まだ支払いがありません。
                  <br />
                  上のボタンから支払いを追加してください。
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {payments.map((payment) => (
                <PaymentCard
                  key={payment.id}
                  payment={payment}
                  members={group.members}
                  currency={group.currency}
                  onDelete={() => handleDeletePayment(payment.id)}
                  loading={mutationLoading}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Members Tab */}
        <TabsContent value="members" className="mt-4">
          <MemberList
            members={group.members}
            onAddMember={handleAddMember}
            onUpdateMember={handleUpdateMember}
            onRemoveMember={handleRemoveMember}
            loading={mutationLoading}
          />
        </TabsContent>

        {/* Settlements Tab */}
        <TabsContent value="settlements" className="space-y-4 mt-4">
          {settlementsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : settlements ? (
            <>
              <BalanceSummary
                summaries={settlements.summaries}
                totalAmount={settlements.totalAmount}
                currency={settlements.currency}
              />
              <SettlementList
                settlements={settlements.settlements}
                currency={settlements.currency}
              />
            </>
          ) : (
            <Card>
              <CardContent className="p-8 text-center">
                <Calculator className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">
                  精算情報を読み込み中...
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
