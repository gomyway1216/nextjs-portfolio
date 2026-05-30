'use client';

import { GroupCard,SettliLogo } from '@/components/settli';
import {
Accordion,
AccordionContent,
AccordionItem,
AccordionTrigger,
} from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Card,CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useFeatureLifecycle } from '@/hooks/useActivityTracker';
import { useSettliHistory } from '@/hooks/useSettli';
import { useAuth } from '@/providers/AuthProvider';
import * as settliService from '@/services/settliService';
import type { SettliGroup } from '@/types/settli';
import {
ArrowRight,
Calculator,
ChevronRight,
Clock,
Globe,
History,
Loader2,
Plus,
Share2,
Shield,
Sparkles,
Users,
Zap
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect,useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

// Local storage key for anonymous users
const LOCAL_STORAGE_KEY = 'settli_recent_groups';

interface LocalGroupEntry {
  id: string;
  name: string;
  accessedAt: string;
}

export default function SettliPage() {
  const lifecycle = useFeatureLifecycle('tool.settli');
  const { t } = useTranslation();
  const router = useRouter();
  const { currentUser } = useAuth();
  const { history, loading: historyLoading } = useSettliHistory();
  const [recentGroups, setRecentGroups] = useState<SettliGroup[]>([]);
  const [localGroups, setLocalGroups] = useState<LocalGroupEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joining, setJoining] = useState(false);

  // Load local storage groups for anonymous users
  useEffect(() => {
    if (!currentUser) {
      try {
        const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored) as LocalGroupEntry[];
          setLocalGroups(parsed.slice(0, 5));
        }
      } catch {
        // Ignore localStorage errors
      }
    }
  }, [currentUser]);

  // Fetch recent groups from history for logged in users
  useEffect(() => {
    if (history.length > 0 && currentUser) {
      fetchRecentGroups();
    }
  }, [history, currentUser]);

  const fetchRecentGroups = async () => {
    setLoading(true);
    try {
      const { groups } = await settliService.getGroups();
      setRecentGroups(groups.slice(0, 5));
    } catch (error) {
      console.error('Failed to fetch groups:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleJoinByCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = joinCode.trim().toUpperCase();

    if (!code) {
      toast.error(t('settli.page.toast.enterShareCode'));
      return;
    }

    setJoining(true);
    try {
      const group = await settliService.getGroupByShareCode(code);
      lifecycle.trackEvent('share_join', { code_len: code.length });
      router.push(`/tools/settli/${group.id}`);
    } catch {
      toast.error(t('settli.page.toast.groupNotFound'));
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        {/* Background gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 via-purple-500/10 to-pink-500/10 -z-10" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-gradient-to-r from-indigo-500/20 to-purple-500/20 rounded-full blur-3xl -z-10" />

        <div className="container mx-auto px-4 py-16 text-center space-y-8">
          {/* Logo */}
          <div className="flex justify-center">
            <SettliLogo size={80} showText variant="gradient" />
          </div>

          {/* Tagline */}
          <div className="space-y-4 max-w-2xl mx-auto">
            <p className="text-xl md:text-2xl text-muted-foreground">
              {t('settli.page.hero.title')}
            </p>
            <p className="text-sm md:text-base text-muted-foreground/80">
              {t('settli.page.hero.subtitle')}
            </p>
          </div>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
            <Link href="/tools/settli/new">
              <Button size="lg" className="w-full sm:w-auto bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white shadow-lg shadow-indigo-500/25" style={{ borderRadius: '9999px' }}>
                <Plus className="h-5 w-5 mr-2" />
                {t('settli.page.hero.createGroup')}
              </Button>
            </Link>
            {currentUser && (
              <Link href="/tools/settli/history">
                <Button size="lg" variant="outline" className="w-full sm:w-auto" style={{ borderRadius: '9999px' }}>
                  <History className="h-5 w-5 mr-2" />
                  {t('settli.page.hero.viewHistory')}
                </Button>
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Join by Code Section */}
      <div className="container mx-auto px-4 pt-6 pb-2 max-w-md">
        <form onSubmit={handleJoinByCode} className="flex gap-2 items-center">
          <span className="text-sm text-muted-foreground shrink-0">{t('settli.page.joinByCode')}</span>
          <Input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            placeholder={t('settli.page.shareCodePlaceholder')}
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

      {/* Recent Groups */}
      {(currentUser && recentGroups.length > 0) && (
        <div className="container mx-auto px-4 py-6 max-w-2xl">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-base font-semibold flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-muted-foreground" />
              {t('settli.page.recentGroups')}
            </h2>
            <Link href="/tools/settli/history">
              <Button variant="ghost" size="sm" style={{ borderRadius: '9999px' }} className="text-xs h-7 px-2">
                {t('settli.page.viewAll')} <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
              </Button>
            </Link>
          </div>
          {(loading || historyLoading) ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-10 bg-muted animate-pulse rounded-lg" />
              ))}
            </div>
          ) : (
            <div className="divide-y rounded-xl border overflow-hidden">
              {recentGroups.map((group) => (
                <GroupCard key={group.id} group={group} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Local Groups for anonymous users */}
      {!currentUser && localGroups.length > 0 && (
        <div className="container mx-auto px-4 py-6 max-w-2xl">
          <h2 className="text-base font-semibold flex items-center gap-1.5 mb-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            {t('settli.page.recentAccessed')}
          </h2>
          <div className="divide-y rounded-xl border overflow-hidden">
            {localGroups.map((entry) => (
              <Link key={entry.id} href={`/tools/settli/${entry.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors">
                <span className="font-medium text-sm">{entry.name}</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Features Section */}
      <div className="container mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold mb-4">
            <span className="bg-gradient-to-r from-indigo-500 to-purple-500 bg-clip-text text-transparent">
              {t('settli.page.featuresTitle')}
            </span>
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            {t('settli.page.featuresSubtitle')}
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[
            {
              icon: Zap,
              title: t('settli.page.features.items.optimize.title'),
              description: t('settli.page.features.items.optimize.description'),
              gradient: 'from-yellow-500 to-orange-500',
            },
            {
              icon: Users,
              title: t('settli.page.features.items.weighted.title'),
              description: t('settli.page.features.items.weighted.description'),
              gradient: 'from-green-500 to-emerald-500',
            },
            {
              icon: Share2,
              title: t('settli.page.features.items.share.title'),
              description: t('settli.page.features.items.share.description'),
              gradient: 'from-blue-500 to-cyan-500',
            },
            {
              icon: Shield,
              title: t('settli.page.features.items.passcode.title'),
              description: t('settli.page.features.items.passcode.description'),
              gradient: 'from-red-500 to-pink-500',
            },
            {
              icon: Globe,
              title: t('settli.page.features.items.multicurrency.title'),
              description: t('settli.page.features.items.multicurrency.description'),
              gradient: 'from-purple-500 to-indigo-500',
            },
            {
              icon: Sparkles,
              title: t('settli.page.features.items.noLogin.title'),
              description: t('settli.page.features.items.noLogin.description'),
              gradient: 'from-pink-500 to-rose-500',
            },
          ].map(({ icon: Icon, title, description, gradient }) => (
            <Card key={title} className="group hover:shadow-lg transition-all duration-300 overflow-hidden">
              <CardContent className="p-6">
                <div className={`w-12 h-12 rounded-2xl bg-gradient-to-r ${gradient} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
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
      <div className="bg-muted/30 py-16">
        <div className="container mx-auto px-4">
        <h2 className="text-3xl font-bold text-center mb-12">{t('settli.page.howToUseTitle')}</h2>
          <div className="grid gap-8 md:grid-cols-4 max-w-4xl mx-auto">
            {[
              { step: 1, title: t('settli.page.howToUse.step1.title'), desc: t('settli.page.howToUse.step1.desc'), icon: Users },
              { step: 2, title: t('settli.page.howToUse.step2.title'), desc: t('settli.page.howToUse.step2.desc'), icon: Calculator },
              { step: 3, title: t('settli.page.howToUse.step3.title'), desc: t('settli.page.howToUse.step3.desc'), icon: Zap },
              { step: 4, title: t('settli.page.howToUse.step4.title'), desc: t('settli.page.howToUse.step4.desc'), icon: Share2 },
            ].map(({ step, title, desc, icon: Icon }) => (
              <div key={step} className="flex flex-col items-center text-center">
                <div className="relative mb-4">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-r from-indigo-500 to-purple-500 flex items-center justify-center shadow-lg">
                    <Icon className="h-7 w-7 text-white" />
                  </div>
                  <div className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-white dark:bg-gray-900 border-2 border-indigo-500 flex items-center justify-center text-sm font-bold text-indigo-500">
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
      <div className="container mx-auto px-4 py-16">
        <h2 className="text-3xl font-bold text-center mb-12">{t('settli.page.faqTitle')}</h2>
        <Accordion type="single" collapsible className="max-w-2xl mx-auto">
          <AccordionItem value="item-1">
            <AccordionTrigger>{t('settli.page.faq.q1')}</AccordionTrigger>
            <AccordionContent>
              {t('settli.page.faq.a1')}
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="item-2">
            <AccordionTrigger>{t('settli.page.faq.q2')}</AccordionTrigger>
            <AccordionContent>
              {t('settli.page.faq.a2')}
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="item-3">
            <AccordionTrigger>{t('settli.page.faq.q3')}</AccordionTrigger>
            <AccordionContent>
              {t('settli.page.faq.a3')}
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="item-4">
            <AccordionTrigger>{t('settli.page.faq.q4')}</AccordionTrigger>
            <AccordionContent>
              {t('settli.page.faq.a4')}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>

      {/* CTA for anonymous users */}
      {!currentUser && (
        <div className="container mx-auto px-4 py-8 pb-16">
          <Card className="bg-gradient-to-r from-indigo-500/10 to-purple-500/10 border-indigo-500/20">
            <CardContent className="p-8 text-center space-y-4">
              <h3 className="text-xl font-semibold">{t('settli.page.cta.title')}</h3>
              <p className="text-muted-foreground max-w-md mx-auto">
                {t('settli.page.cta.subtitle')}
              </p>
              <div className="flex gap-3 justify-center pt-2">
                <Link href="/signin">
                  <Button className="bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600" style={{ borderRadius: '9999px' }}>
                    {t('settli.page.cta.login')}
                  </Button>
                </Link>
                <Link href="/tools/settli/new">
                  <Button variant="outline" style={{ borderRadius: '9999px' }}>{t('settli.page.cta.tryNow')}</Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
