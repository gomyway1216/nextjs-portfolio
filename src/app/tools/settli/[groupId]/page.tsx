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
import { type CSSProperties,useEffect,useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import detailStyles from '../../tool-detail.module.css';

// Local storage key for anonymous users
const LOCAL_STORAGE_KEY = 'settli_recent_groups';
const MAX_LOCAL_GROUPS = 10;

const settliTheme = {
  '--tool-accent': 'hsl(232 76% 58%)',
  '--tool-accent-strong': 'hsl(245 68% 52%)',
  '--tool-accent-soft': 'hsl(278 73% 58%)',
} as CSSProperties;

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
      <div className={detailStyles.page} style={settliTheme}>
        <div className={detailStyles.loadingShell}>
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
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
      <div className={detailStyles.page} style={settliTheme}>
        <div className={detailStyles.statePanel}>
          <div className={detailStyles.stateIcon}>
            <SettliLogo size={42} />
          </div>
          <h2 className={detailStyles.stateTitle}>{t('settli.group.notFoundTitle')}</h2>
          <p className={detailStyles.stateText}>
            {t('settli.group.notFoundDescription')}
          </p>
          <Link href="/tools/settli" className="mt-6 inline-flex">
            <Button className={detailStyles.primaryButton}>
              {t('settli.group.backToTop')}
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const activeMemberCount = group.members.filter((m) => m.isActive !== false).length;
  const settlementCount = settlements?.totalSettlementCount || 0;

  return (
    <div className={detailStyles.page} style={settliTheme}>
      <div className={detailStyles.innerWide}>
        {/* Header */}
        <header className={detailStyles.header}>
          <div className={detailStyles.headerMain}>
            <Link href="/tools/settli">
              <Button variant="ghost" size="icon" className={detailStyles.backIconButton} aria-label={t('common.back', 'Back')}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div className={detailStyles.logoTile}>
              <SettliLogo size={30} />
            </div>
            <div className={detailStyles.titleBlock}>
              <h1 className={detailStyles.title}>{group.name}</h1>
              {group.description && (
                <p className={detailStyles.subtitle}>{group.description}</p>
              )}
            </div>
          </div>
          <div className={detailStyles.headerActions}>
            <ShareDialog
              groupId={group.id}
              groupName={group.name}
              shareCode={group.shareCode}
              onGenerateQR={handleGenerateQR}
            />
          </div>
        </header>

      {/* Summary Stats */}
        <div className={detailStyles.statsGrid}>
          <div className={detailStyles.statCard}>
            <span className={detailStyles.statIcon}>
              <Users className="h-4 w-4" />
            </span>
            <div>
              <div className={detailStyles.statLabel}>{t('settli.group.tabs.members')}</div>
              <div className={detailStyles.statValue}>{activeMemberCount}{t('settli.common.peopleSuffix')}</div>
            </div>
          </div>
          <div className={detailStyles.statCard}>
            <span className={detailStyles.statIcon}>
              <Receipt className="h-4 w-4" />
            </span>
            <div>
              <div className={detailStyles.statLabel}>{t('settli.group.tabs.payments')}</div>
              <div className={detailStyles.statValue}>{payments.length}{t('settli.common.itemsSuffix')}</div>
            </div>
          </div>
          <div className={detailStyles.statCard}>
            <span className={detailStyles.statIcon}>
              <Calculator className="h-4 w-4" />
            </span>
            <div>
              <div className={detailStyles.statLabel}>{t('settli.group.settlement')}</div>
              <div className={detailStyles.statValue}>{settlementCount}</div>
            </div>
          </div>
        </div>

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className={`${detailStyles.tabsList} w-full grid grid-cols-3`}>
          <TabsTrigger value="payments" className={detailStyles.tabTrigger}>
            <Receipt className="h-4 w-4" />
            {t('settli.group.tabs.payments')}
          </TabsTrigger>
          <TabsTrigger value="members" className={detailStyles.tabTrigger}>
            <Users className="h-4 w-4" />
            {t('settli.group.tabs.members')}
          </TabsTrigger>
          <TabsTrigger value="settlements" className={detailStyles.tabTrigger}>
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
                className={`${detailStyles.primaryButton} w-full mb-3 hidden md:flex`}
                disabled={activeMemberCount < 2}
              >
                <Plus className="h-4 w-4 mr-2" />
                {t('settli.group.addPayment')}
              </Button>
              <Button
                onClick={() => setShowPaymentForm(true)}
                disabled={activeMemberCount < 2}
                size="icon"
                className={`${detailStyles.mobileFab} md:hidden [&_svg]:size-6`}
                aria-label={t('settli.group.addPayment')}
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
            <Card className={detailStyles.panel}>
              <CardContent className="p-8 text-center">
                <Receipt className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">
                  {t('settli.group.emptyPayments')}
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card className={`${detailStyles.panel} py-0 gap-0`}>
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
            <Card className={detailStyles.panel}>
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
    </div>
  );
}
