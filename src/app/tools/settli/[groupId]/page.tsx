'use client';

import {
BalanceSummary,
MemberList,
PasscodeDialog,
PaymentCard,
PaymentForm,
SettliLogo,
ShareDialog,
} from '@/components/settli';
import { Button } from '@/components/ui/button';
import { Card,CardContent } from '@/components/ui/card';
import { Tabs,TabsContent,TabsList,TabsTrigger } from '@/components/ui/tabs';
import {
useSettliGroup,
useSettliMutations,
useSettliPayments,
useSettliSettlements,
} from '@/hooks/useSettli';
import { useAuth } from '@/providers/AuthProvider';
import type { CreatePaymentInput,Payment,UpdatePaymentInput } from '@/types/settli';
import {
ArrowLeft,
Calculator,
Loader2,
Plus,
Receipt,
Users,
} from 'lucide-react';
import Link from 'next/link';
import { useParams,useRouter } from 'next/navigation';
import { useEffect,useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

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
  const { t } = useTranslation();
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
      toast.success(t('settli.group.toast.memberAdded'));
    } catch {
      toast.error(t('settli.group.toast.memberAddFailed'));
    }
  };

  const handleUpdateMember = async (memberId: string, name: string, weight: number) => {
    try {
      await updateMember(groupId, memberId, { name, weight });
      await refetchGroup();
      toast.success(t('settli.group.toast.memberUpdated'));
    } catch {
      toast.error(t('settli.group.toast.memberUpdateFailed'));
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    try {
      await removeMember(groupId, memberId);
      await refetchGroup();
      toast.success(t('settli.group.toast.memberRemoved'));
    } catch {
      toast.error(t('settli.group.toast.memberRemoveFailed'));
    }
  };

  const handleAddPayment = async (input: CreatePaymentInput) => {
    try {
      await createPayment(input);
      await refetchPayments();
      setShowPaymentForm(false);
      toast.success(t('settli.group.toast.paymentAdded'));
    } catch {
      toast.error(t('settli.group.toast.paymentAddFailed'));
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
      toast.success(t('settli.group.toast.paymentUpdated'));
    } catch {
      toast.error(t('settli.group.toast.paymentUpdateFailed'));
    }
  };

  const handleDeletePayment = async (paymentId: string) => {
    try {
      await deletePayment(groupId, paymentId);
      await refetchPayments();
      toast.success(t('settli.group.toast.paymentDeleted'));
    } catch {
      toast.error(t('settli.group.toast.paymentDeleteFailed'));
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
        <h2 className="text-xl font-semibold mb-2">{t('settli.group.notFoundTitle')}</h2>
        <p className="text-muted-foreground mb-6">
          {t('settli.group.notFoundDescription')}
        </p>
        <Link href="/tools/settli">
          <Button className="bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600" style={{ borderRadius: '9999px' }}>
            {t('settli.group.backToTop')}
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
          {t('settli.common.peopleSuffix')}
        </span>
        <span className="text-border">|</span>
        <span className="flex items-center gap-1.5">
          <Receipt className="h-3.5 w-3.5" />
          <span className="font-medium text-foreground">{payments.length}</span>
          {t('settli.common.itemsSuffix')}
        </span>
        <span className="text-border">|</span>
        <span className="flex items-center gap-1.5">
          <Calculator className="h-3.5 w-3.5" />
          <span className="font-medium text-foreground">{settlements?.totalSettlementCount || 0}</span>
          {t('settli.group.settlement')}
        </span>
      </div>

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full grid grid-cols-3">
          <TabsTrigger value="payments" className="flex items-center gap-1">
            <Receipt className="h-4 w-4" />
            {t('settli.group.tabs.payments')}
          </TabsTrigger>
          <TabsTrigger value="members" className="flex items-center gap-1">
            <Users className="h-4 w-4" />
            {t('settli.group.tabs.members')}
          </TabsTrigger>
          <TabsTrigger value="settlements" className="flex items-center gap-1">
            <Calculator className="h-4 w-4" />
            {t('settli.group.tabs.settlements')}
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
                {t('settli.group.addPayment')}
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
                  {t('settli.group.emptyPayments')}
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
                  {t('settli.group.loadingSettlement')}
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
