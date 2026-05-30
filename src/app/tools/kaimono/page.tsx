'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Plus,
  History,
  ArrowRight,
  Share2,
  QrCode,
  Lock,
  ChevronRight,
  Loader2,
  Clock,
  Sparkles,
  ShoppingBasket,
  Wallet,
  RefreshCw,
  Tags,
  Star,
  StickyNote,
  Store,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/providers/AuthProvider';
import { KaimonoLogo, ListCard } from '@/components/kaimono';
import { useKaimonoHistory } from '@/hooks/useKaimono';
import * as kaimonoService from '@/services/kaimonoService';
import type { ShoppingList } from '@/types/kaimono';
import { useTranslation } from 'react-i18next';
import { useFeatureLifecycle } from '@/hooks/useActivityTracker';
import styles from '../tool-landing.module.css';

const LOCAL_STORAGE_KEY = 'kaimono_recent_lists';
const kaimonoTheme = {
  '--tool-accent': '#10b981',
  '--tool-accent-strong': '#059669',
  '--tool-accent-soft': '#14b8a6',
} as CSSProperties;

interface LocalListEntry {
  id: string;
  name: string;
  accessedAt: string;
}

export default function KaimonoPage() {
  const lifecycle = useFeatureLifecycle('tool.kaimono');
  const { t } = useTranslation();
  const router = useRouter();
  const { currentUser } = useAuth();
  const { history, loading: historyLoading } = useKaimonoHistory();
  const [recentLists, setRecentLists] = useState<ShoppingList[]>([]);
  const [localLists, setLocalLists] = useState<LocalListEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joining, setJoining] = useState(false);

  // Load local storage lists for anonymous users
  useEffect(() => {
    if (!currentUser) {
      try {
        const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored) as LocalListEntry[];
          setLocalLists(parsed.slice(0, 5));
        }
      } catch {
        // Ignore localStorage errors
      }
    }
  }, [currentUser]);

  // Fetch recent lists from history for logged in users
  useEffect(() => {
    if (history.length > 0 && currentUser) {
      fetchRecentLists();
    }
  }, [history, currentUser]);

  const fetchRecentLists = async () => {
    setLoading(true);
    try {
      const { lists } = await kaimonoService.getLists();
      setRecentLists(lists.slice(0, 5));
    } catch (error) {
      console.error('Failed to fetch lists:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleJoinByCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = joinCode.trim().toUpperCase();

    if (!code) {
      toast.error(t('kaimono.page.toast.enterShareCode', 'Enter a share code'));
      return;
    }

    setJoining(true);
    try {
      const list = await kaimonoService.getListByShareCode(code);
      lifecycle.trackEvent('share_join', { code_len: code.length });
      router.push(`/tools/kaimono/${list.id}`);
    } catch {
      toast.error(t('kaimono.page.toast.listNotFound', 'List not found'));
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className={styles.page} style={kaimonoTheme}>
      {/* Hero Section */}
      <div className={styles.hero}>
        <div className={styles.heroInner}>
          <div className={styles.logoWrap}>
            <KaimonoLogo size={80} showText variant="gradient" />
          </div>

          <div className={styles.heroCopy}>
            <p className={styles.heroTitle}>
              {t('kaimono.page.hero.title', 'Smart Shopping Lists for Everyone')}
            </p>
            <p className={styles.heroSubtitle}>
              {t('kaimono.page.hero.subtitle', 'Create shopping lists with budgets, categories, and sharing. Free and no login required.')}
            </p>
          </div>

          <div className={styles.heroActions}>
            <Link href="/tools/kaimono/new">
              <Button size="lg" className="w-full sm:w-auto bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-600 hover:to-green-600 text-white shadow-lg shadow-emerald-500/25" style={{ borderRadius: '9999px' }}>
                <Plus className="h-5 w-5 mr-2" />
                {t('kaimono.page.hero.createList', 'Create List')}
              </Button>
            </Link>
            {currentUser && (
              <Link href="/tools/kaimono/history">
                <Button size="lg" variant="outline" className={`w-full sm:w-auto ${styles.outlineButton}`} style={{ borderRadius: '9999px' }}>
                  <History className="h-5 w-5 mr-2" />
                  {t('kaimono.page.hero.viewHistory', 'View History')}
                </Button>
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Join by Code Section */}
      <div className={styles.joinPanel}>
        <form onSubmit={handleJoinByCode} className="flex gap-2 items-center">
          <span className="text-sm text-muted-foreground shrink-0">{t('kaimono.page.joinByCode', 'Join:')}</span>
          <Input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            placeholder={t('kaimono.page.shareCodePlaceholder', 'SHARE CODE')}
            className="font-mono text-center uppercase tracking-widest"
            style={{ borderRadius: '9999px' }}
            maxLength={10}
            disabled={joining}
          />
          <Button type="submit" size="icon" disabled={joining || !joinCode.trim()} style={{ borderRadius: '9999px' }} className="shrink-0">
            {joining ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
          </Button>
        </form>
      </div>

      {/* Recent Lists */}
      {currentUser && recentLists.length > 0 && (
        <div className={styles.compactSection}>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-base font-semibold flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-muted-foreground" />
              {t('kaimono.page.recentLists', 'Recent Lists')}
            </h2>
            <Link href="/tools/kaimono/history">
              <Button variant="ghost" size="sm" style={{ borderRadius: '9999px' }} className="text-xs h-7 px-2">
                {t('kaimono.page.viewAll', 'View All')} <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
              </Button>
            </Link>
          </div>
          {(loading || historyLoading) ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <div key={i} className="h-10 bg-muted animate-pulse rounded-lg" />)}
            </div>
          ) : (
            <div className={`divide-y ${styles.listFrame}`}>
              {recentLists.map((list) => <ListCard key={list.id} list={list} />)}
            </div>
          )}
        </div>
      )}

      {/* Local Lists for anonymous users */}
      {!currentUser && localLists.length > 0 && (
        <div className={styles.compactSection}>
          <h2 className="text-base font-semibold flex items-center gap-1.5 mb-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            {t('kaimono.page.recentAccessed', 'Recently Accessed')}
          </h2>
          <div className={`divide-y ${styles.listFrame}`}>
            {localLists.map((entry) => (
              <Link key={entry.id} href={`/tools/kaimono/${entry.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors">
                <span className="font-medium text-sm">{entry.name}</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Features Section */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionHeading}>
            <span className={styles.sectionHeadingAccent}>
              {t('kaimono.page.featuresTitle', 'Features')}
            </span>
          </h2>
          <p className={styles.sectionText}>
            {t('kaimono.page.featuresSubtitle', 'Everything you need for smarter shopping')}
          </p>
        </div>

        <div className={styles.featureGrid}>
          {[
            { icon: ShoppingBasket, title: t('kaimono.page.features.checklist.title', 'Smart Checklists'), description: t('kaimono.page.features.checklist.description', 'Create lists with purchase checkboxes and track progress'), gradient: 'from-emerald-500 to-green-500' },
            { icon: Tags, title: t('kaimono.page.features.categories.title', 'Categories'), description: t('kaimono.page.features.categories.description', 'Organize items by food, daily goods, clothing, and more'), gradient: 'from-blue-500 to-cyan-500' },
            { icon: Wallet, title: t('kaimono.page.features.budget.title', 'Budget Tracking'), description: t('kaimono.page.features.budget.description', 'Set budgets and track spending in real time'), gradient: 'from-yellow-500 to-orange-500' },
            { icon: Sparkles, title: t('kaimono.page.features.frequent.title', 'Smart Suggestions'), description: t('kaimono.page.features.frequent.description', 'Auto-suggest items from your purchase history'), gradient: 'from-purple-500 to-indigo-500' },
            { icon: RefreshCw, title: t('kaimono.page.features.recurring.title', 'Recurring Items'), description: t('kaimono.page.features.recurring.description', 'Set reminders for items you buy regularly'), gradient: 'from-pink-500 to-rose-500' },
            { icon: Share2, title: t('kaimono.page.features.share.title', 'Share & Collaborate'), description: t('kaimono.page.features.share.description', 'Share lists with family via QR code or share link'), gradient: 'from-teal-500 to-emerald-500' },
            { icon: Store, title: t('kaimono.page.features.stores.title', 'Store-based Lists'), description: t('kaimono.page.features.stores.description', 'Group items by store for efficient shopping trips'), gradient: 'from-amber-500 to-yellow-500' },
            { icon: Star, title: t('kaimono.page.features.priority.title', 'Priority Levels'), description: t('kaimono.page.features.priority.description', "Mark items as must-buy or nice-to-have"), gradient: 'from-red-500 to-pink-500' },
            { icon: StickyNote, title: t('kaimono.page.features.notes.title', 'Item Notes'), description: t('kaimono.page.features.notes.description', 'Add brand preferences, sale info, or special instructions'), gradient: 'from-green-500 to-teal-500' },
          ].map(({ icon: Icon, title, description, gradient }) => (
            <Card key={title} className={`group ${styles.featureCard}`}>
              <CardContent className="p-6">
                <div className={`${styles.featureIcon} bg-gradient-to-r ${gradient} flex items-center justify-center mb-4 group-hover:scale-105 transition-transform`}>
                  <Icon className="h-6 w-6 text-white" />
                </div>
                <h3 className="font-semibold text-lg mb-2">{title}</h3>
                <p className="text-sm text-muted-foreground">{description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* How it Works */}
      <div className={styles.sectionMuted}>
        <div className={styles.sectionMutedInner}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionHeading}>{t('kaimono.page.howToUseTitle', 'How to Use')}</h2>
          </div>
          <div className={styles.stepGrid}>
            {[
              { step: 1, title: t('kaimono.page.howToUse.step1.title', 'Create a List'), desc: t('kaimono.page.howToUse.step1.desc', 'Name your list and set an optional budget'), icon: Plus },
              { step: 2, title: t('kaimono.page.howToUse.step2.title', 'Add Items'), desc: t('kaimono.page.howToUse.step2.desc', 'Add items with categories, prices, and notes'), icon: ShoppingBasket },
              { step: 3, title: t('kaimono.page.howToUse.step3.title', 'Shop & Check'), desc: t('kaimono.page.howToUse.step3.desc', 'Check off items as you shop and track spending'), icon: Wallet },
              { step: 4, title: t('kaimono.page.howToUse.step4.title', 'Share & Reuse'), desc: t('kaimono.page.howToUse.step4.desc', 'Share lists with family and build buying habits'), icon: Share2 },
            ].map(({ step, title, desc, icon: Icon }) => (
              <div key={step} className={styles.stepItem}>
                <div className={styles.stepIcon}>
                  <div className={styles.stepIconBox}>
                    <Icon className="h-7 w-7 text-white" />
                  </div>
                  <div className={styles.stepBadge}>
                    {step}
                  </div>
                </div>
                <h3 className="font-semibold mb-1">{title}</h3>
                <p className="text-sm text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* FAQ */}
      <div className={styles.sectionNarrow}>
        <h2 className={`${styles.sectionHeading} text-center mb-12`}>{t('kaimono.page.faqTitle', 'FAQ')}</h2>
        <Accordion type="single" collapsible className="max-w-2xl mx-auto">
          <AccordionItem value="item-1">
            <AccordionTrigger>{t('kaimono.page.faq.q1', 'Do I need an account?')}</AccordionTrigger>
            <AccordionContent>{t('kaimono.page.faq.a1', 'No! You can create and use shopping lists without logging in. Login is only needed for history and recurring items.')}</AccordionContent>
          </AccordionItem>
          <AccordionItem value="item-2">
            <AccordionTrigger>{t('kaimono.page.faq.q2', 'Can I share lists with others?')}</AccordionTrigger>
            <AccordionContent>{t('kaimono.page.faq.a2', 'Yes! Share lists via QR code, link, or share code. Others can view and check off items too.')}</AccordionContent>
          </AccordionItem>
          <AccordionItem value="item-3">
            <AccordionTrigger>{t('kaimono.page.faq.q3', 'What are recurring items?')}</AccordionTrigger>
            <AccordionContent>{t('kaimono.page.faq.a3', 'Recurring items are things you buy regularly. Set a schedule and get reminded when items are due to be purchased again.')}</AccordionContent>
          </AccordionItem>
          <AccordionItem value="item-4">
            <AccordionTrigger>{t('kaimono.page.faq.q4', 'Is my data safe?')}</AccordionTrigger>
            <AccordionContent>{t('kaimono.page.faq.a4', 'Yes. Data is stored securely in the cloud. You can protect lists with a passcode for extra security.')}</AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>

      {/* CTA for anonymous users */}
      {!currentUser && (
        <div className={styles.sectionNarrow}>
          <Card className={styles.ctaCard}>
            <CardContent className="p-8 text-center space-y-4">
              <h3 className="text-xl font-semibold">{t('kaimono.page.cta.title', 'Save Your Shopping History')}</h3>
              <p className="text-muted-foreground max-w-md mx-auto">
                {t('kaimono.page.cta.subtitle', 'Sign in to track your purchases, get smart suggestions, and set up recurring items.')}
              </p>
              <div className="flex gap-3 justify-center pt-2">
                <Link href="/signin">
                  <Button className="bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-600 hover:to-green-600" style={{ borderRadius: '9999px' }}>
                    {t('kaimono.page.cta.login', 'Sign In')}
                  </Button>
                </Link>
                <Link href="/tools/kaimono/new">
                  <Button variant="outline" style={{ borderRadius: '9999px' }}>{t('kaimono.page.cta.tryNow', 'Try Now')}</Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
