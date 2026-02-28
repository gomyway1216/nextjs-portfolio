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
  useSettliGroup,
  useSettliPayments,
  useSettliSettlements,
  useSettliMutations,
} from '@/hooks/useSettli';
import {
  MemberList,
  PaymentCard,
  PaymentForm,
  BalanceSummary,
  ShareDialog,
  PasscodeDialog,
  SettliLogo,
} from '@/components/settli';
import { useAuth } from '@/providers/AuthProvider';
import type { CreatePaymentInput, UpdatePaymentInput, Payment } from '@/types/settli';

// Local storage key for anonymous users
const LOCAL_STORAGE_KEY = 'settli_recent_groups';
const MAX_LOCAL_GROUPS = 10;

interface LocalGroupEntry {
  id: string;
  name: string;
  accessedAt: string;
}

// Helper function to save group to localStorage
function saveToLocalStorage(groupId: string, groupName: string) {
  try {
    const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
    let groups: LocalGroupEntry[] = stored ? JSON.parse(stored) : [];

    // Remove existing entry if present
    groups = groups.filter((g) => g.id !== groupId);

    // Add new entry at the beginning
    groups.unshift({
      id: groupId,
      name: groupName,
      accessedAt: new Date().toISOString(),
    });

    // Keep only the most recent entries
    groups = groups.slice(0, MAX_LOCAL_GROUPS);

    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(groups));
  } catch {
    // Ignore localStorage errors
  }
}

export default function SettliGroupPage() {
  const params = useParams();
  const router = useRouter();
  const { currentUser } = useAuth();
  const groupId = params.groupId as string;

  const { group, loading: groupLoading, refetch: refetchGroup, requiresPasscode, verifyPasscode } = useSettliGroup(groupId);
  const { payments, loading: paymentsLoading, refetch: refetchPayments } = useSettliPayments(groupId);
  const { settlements, loading: settlementsLoading, refetch: refetchSettlements } = useSettliSettlements(groupId);
  const { addMember, updateMember, removeMember, createPayment, updatePayment, deletePayment, generateQRCode, loading: mutationLoading } = useSettliMutations();

  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);
  const [activeTab, setActiveTab] = useState('payments');

  // Save to localStorage for anonymous users when group is loaded
  useEffect(() => {
    if (group && !requiresPasscode && !currentUser) {
      saveToLocalStorage(group.id, group.name);
    }
  }, [group, requiresPasscode, currentUser]);

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

  const handleUpdatePayment = async (input: CreatePaymentInput) => {
    if (!editingPayment) return;
    try {
      const updateInput: UpdatePaymentInput = {
        payerId: input.payerId,
        amount: input.amount,
        currency: input.currency,
        description: input.description,
        category: input.category,
        date: input.date,
        splitType: input.splitType,
        participants: input.participants,
      };
      await updatePayment(groupId, editingPayment.id, updateInput);
      await refetchPayments();
      setEditingPayment(null);
      toast.success('支払いを更新しました');
    } catch {
      toast.error('支払いの更新に失敗しました');
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
        onCancel={() => router.push('/tools/settli')}
      />
    );
  }

  if (!group) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <SettliLogo size={48} className="mx-auto mb-6" />
        <h2 className="text-xl font-semibold mb-2">グループが見つかりません</h2>
        <p className="text-muted-foreground mb-6">
          このグループは存在しないか、アクセス権限がありません
        </p>
        <Link href="/tools/settli">
          <Button className="bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600" style={{ borderRadius: '9999px' }}>
            トップに戻る
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/tools/settli">
            <Button variant="ghost" size="icon" className="rounded-full">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <SettliLogo size={28} />
              <h1 className="text-2xl font-bold">{group.name}</h1>
            </div>
            {group.description && (
              <p className="text-muted-foreground ml-9">{group.description}</p>
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

      {/* Summary Stats */}
      <div className="flex items-center justify-center gap-6 text-sm text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5" />
          <span className="font-medium text-foreground">{group.members.filter((m) => m.isActive !== false).length}</span>
          人
        </span>
        <span className="text-border">|</span>
        <span className="flex items-center gap-1.5">
          <Receipt className="h-3.5 w-3.5" />
          <span className="font-medium text-foreground">{payments.length}</span>
          件
        </span>
        <span className="text-border">|</span>
        <span className="flex items-center gap-1.5">
          <Calculator className="h-3.5 w-3.5" />
          <span className="font-medium text-foreground">{settlements?.totalSettlementCount || 0}</span>
          精算
        </span>
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
        <TabsContent value="payments" className="space-y-3 mt-4">
          {showPaymentForm || editingPayment ? (
            <PaymentForm
              members={group.members}
              groupId={group.id}
              currency={group.currency}
              initialPayment={editingPayment || undefined}
              onSubmit={editingPayment ? handleUpdatePayment : handleAddPayment}
              onCancel={() => {
                setShowPaymentForm(false);
                setEditingPayment(null);
              }}
              loading={mutationLoading}
            />
          ) : (
            <>
              <Button
                onClick={() => setShowPaymentForm(true)}
                className="w-full mb-3 hidden md:flex"
                style={{ borderRadius: '9999px' }}
                disabled={group.members.filter((m) => m.isActive !== false).length < 2}
              >
                <Plus className="h-4 w-4 mr-2" />
                支払いを追加
              </Button>
              <Button
                onClick={() => setShowPaymentForm(true)}
                disabled={group.members.filter((m) => m.isActive !== false).length < 2}
                size="icon"
                className="md:hidden fixed bottom-6 right-6 z-50 h-14 w-14 shadow-lg bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 [&_svg]:size-6"
                style={{ borderRadius: '9999px' }}
              >
                <Plus className="h-6 w-6" />
              </Button>
            </>
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
            <Card className="py-0 gap-0">
              <CardContent className="px-4">
                {payments.map((payment) => (
                  <PaymentCard
                    key={payment.id}
                    payment={payment}
                    members={group.members}
                    currency={group.currency}
                    onEdit={() => setEditingPayment(payment)}
                    onDelete={() => handleDeletePayment(payment.id)}
                    loading={mutationLoading}
                  />
                ))}
              </CardContent>
            </Card>
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
            <BalanceSummary
              calculations={settlements.byCurrency}
              defaultCurrency={group.currency}
            />
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
