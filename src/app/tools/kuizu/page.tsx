'use client';

import { useState } from 'react';
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
  Play, Users, Calendar, Trophy, PlusCircle, History, BarChart3,
  Zap, Timer, Brain, Share2, Sparkles, ArrowRight, Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/providers/AuthProvider';
import { KuizuLogo } from '@/components/kuizu/KuizuLogo';
import { DailyChallengeBanner } from '@/components/kuizu/DailyChallengeBanner';
import { useKuizuDaily } from '@/hooks/useKuizu';
import { useTranslation } from 'react-i18next';
import { useFeatureLifecycle } from '@/hooks/useActivityTracker';

export default function KuizuPage() {
  const lifecycle = useFeatureLifecycle('tool.kuizu');
  const { t } = useTranslation();
  const router = useRouter();
  const { currentUser } = useAuth();
  const { challenge, userEntry, loading: dailyLoading } = useKuizuDaily();
  const [roomCode, setRoomCode] = useState('');
  const [joining, setJoining] = useState(false);

  const handleJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = roomCode.trim().toUpperCase();
    if (!code) {
      toast.error(t('kuizu.page.toast.enterRoomCode', 'Enter a room code'));
      return;
    }
    setJoining(true);
    lifecycle.trackEvent('multiplayer_join', { code_len: code.length });
    router.push(`/tools/kuizu/multiplayer/${code}`);
  };

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-orange-500/10 via-amber-500/10 to-yellow-500/10 -z-10" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-gradient-to-r from-orange-500/20 to-amber-500/20 rounded-full blur-3xl -z-10" />

        <div className="container mx-auto px-4 py-16 text-center space-y-8">
          <div className="flex justify-center">
            <KuizuLogo size={80} showText variant="gradient" />
          </div>
          <div className="space-y-4 max-w-2xl mx-auto">
            <p className="text-xl md:text-2xl text-muted-foreground">
              {t('kuizu.page.hero.title', 'Test Your Knowledge, Challenge Your Friends')}
            </p>
            <p className="text-sm md:text-base text-muted-foreground/80">
              {t('kuizu.page.hero.subtitle', 'Solo quizzes, multiplayer battles, daily challenges, and custom quiz creation. 400+ questions across 10+ categories.')}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
            <Link href="/tools/kuizu/play">
              <Button size="lg" className="w-full sm:w-auto bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white shadow-lg shadow-orange-500/25" style={{ borderRadius: '9999px' }}>
                <Play className="h-5 w-5 mr-2" />
                {t('kuizu.page.hero.playSolo', 'Play Solo')}
              </Button>
            </Link>
            <Link href="/tools/kuizu/multiplayer">
              <Button size="lg" variant="outline" className="w-full sm:w-auto border-orange-300 text-orange-700 hover:bg-orange-50" style={{ borderRadius: '9999px' }}>
                <Users className="h-5 w-5 mr-2" />
                {t('kuizu.page.hero.multiplayer', 'Multiplayer')}
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Join Room */}
      <div className="container mx-auto px-4 pt-6 pb-2 max-w-md">
        <form onSubmit={handleJoinRoom} className="flex gap-2 items-center">
          <span className="text-sm text-muted-foreground shrink-0">{t('kuizu.page.joinRoom', 'Join:')}</span>
          <Input value={roomCode} onChange={(e) => setRoomCode(e.target.value.toUpperCase())} placeholder={t('kuizu.page.roomCodePlaceholder', 'ROOM CODE')} className="font-mono text-center uppercase tracking-widest" style={{ borderRadius: '9999px' }} maxLength={10} disabled={joining} />
          <Button type="submit" size="icon" disabled={joining || !roomCode.trim()} style={{ borderRadius: '9999px' }} className="shrink-0">
            {joining ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
          </Button>
        </form>
      </div>

      {/* Daily Challenge */}
      <div className="container mx-auto px-4 py-6 max-w-2xl">
        <DailyChallengeBanner challenge={challenge ?? undefined} userEntry={userEntry ?? undefined} onPlay={() => router.push('/tools/kuizu/daily')} loading={dailyLoading} />
      </div>

      {/* Quick Actions */}
      <div className="container mx-auto px-4 py-6 max-w-2xl">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { href: '/tools/kuizu/custom/new', icon: PlusCircle, label: t('kuizu.page.createQuiz', 'Create Quiz') },
            { href: '/tools/kuizu/daily', icon: Calendar, label: t('kuizu.page.daily', 'Daily Challenge') },
            ...(currentUser ? [
              { href: '/tools/kuizu/history', icon: History, label: t('kuizu.page.history', 'History') },
              { href: '/tools/kuizu/stats', icon: BarChart3, label: t('kuizu.page.stats', 'Stats') },
            ] : []),
          ].map(({ href, icon: Icon, label }) => (
            <Link key={href} href={href}>
              <Card className="hover:shadow-md transition-all cursor-pointer border-orange-200 hover:border-orange-300">
                <CardContent className="p-4 text-center">
                  <Icon className="h-8 w-8 mx-auto mb-2 text-orange-500" />
                  <p className="text-sm font-medium">{label}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      {/* Features */}
      <div className="container mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold mb-4">
            <span className="bg-gradient-to-r from-orange-500 to-amber-500 bg-clip-text text-transparent">
              {t('kuizu.page.featuresTitle', 'Features')}
            </span>
          </h2>
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[
            { icon: Brain, title: t('kuizu.page.features.categories.title', '10+ Categories'), description: t('kuizu.page.features.categories.description', 'From English vocab to geography, science to Japanese culture'), gradient: 'from-orange-500 to-amber-500' },
            { icon: Users, title: t('kuizu.page.features.multiplayer.title', 'Multiplayer'), description: t('kuizu.page.features.multiplayer.description', 'Create rooms and battle friends in real-time'), gradient: 'from-blue-500 to-cyan-500' },
            { icon: Calendar, title: t('kuizu.page.features.daily.title', 'Daily Challenges'), description: t('kuizu.page.features.daily.description', 'New challenge every day with global leaderboards'), gradient: 'from-purple-500 to-indigo-500' },
            { icon: Zap, title: t('kuizu.page.features.streak.title', 'Streak Bonus'), description: t('kuizu.page.features.streak.description', 'Consecutive correct answers earn multiplied points'), gradient: 'from-red-500 to-pink-500' },
            { icon: Timer, title: t('kuizu.page.features.timed.title', 'Time-Based Scoring'), description: t('kuizu.page.features.timed.description', 'Answer faster to earn more bonus points'), gradient: 'from-green-500 to-teal-500' },
            { icon: PlusCircle, title: t('kuizu.page.features.custom.title', 'Custom Quizzes'), description: t('kuizu.page.features.custom.description', 'Create your own quizzes and share with friends'), gradient: 'from-yellow-500 to-orange-500' },
            { icon: Share2, title: t('kuizu.page.features.share.title', 'Share & QR'), description: t('kuizu.page.features.share.description', 'Share quizzes via link, code, or QR code'), gradient: 'from-teal-500 to-emerald-500' },
            { icon: BarChart3, title: t('kuizu.page.features.stats.title', 'Progress Tracking'), description: t('kuizu.page.features.stats.description', 'Track accuracy and scores per category'), gradient: 'from-pink-500 to-rose-500' },
            { icon: Sparkles, title: t('kuizu.page.features.formats.title', '4 Question Types'), description: t('kuizu.page.features.formats.description', 'Multiple choice, true/false, fill-in-blank, and image-based'), gradient: 'from-amber-500 to-yellow-500' },
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

      {/* How to Play */}
      <div className="bg-muted/30 py-16">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-12">{t('kuizu.page.howToUseTitle', 'How to Play')}</h2>
          <div className="grid gap-8 md:grid-cols-4 max-w-4xl mx-auto">
            {[
              { step: 1, title: t('kuizu.page.howToUse.step1.title', 'Choose Category'), desc: t('kuizu.page.howToUse.step1.desc', 'Pick from 10+ categories and set difficulty'), icon: Brain },
              { step: 2, title: t('kuizu.page.howToUse.step2.title', 'Answer Questions'), desc: t('kuizu.page.howToUse.step2.desc', 'Answer quickly for bonus points and build streaks'), icon: Zap },
              { step: 3, title: t('kuizu.page.howToUse.step3.title', 'View Results'), desc: t('kuizu.page.howToUse.step3.desc', 'See your score, accuracy, and review each question'), icon: Trophy },
              { step: 4, title: t('kuizu.page.howToUse.step4.title', 'Challenge Friends'), desc: t('kuizu.page.howToUse.step4.desc', 'Create multiplayer rooms or share custom quizzes'), icon: Users },
            ].map(({ step, title, desc, icon: Icon }) => (
              <div key={step} className="flex flex-col items-center text-center">
                <div className="relative mb-4">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-r from-orange-500 to-amber-500 flex items-center justify-center shadow-lg">
                    <Icon className="h-7 w-7 text-white" />
                  </div>
                  <div className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-white dark:bg-gray-900 border-2 border-orange-500 flex items-center justify-center text-sm font-bold text-orange-500">{step}</div>
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
        <h2 className="text-3xl font-bold text-center mb-12">{t('kuizu.page.faqTitle', 'FAQ')}</h2>
        <Accordion type="single" collapsible className="max-w-2xl mx-auto">
          <AccordionItem value="item-1">
            <AccordionTrigger>{t('kuizu.page.faq.q1', 'Do I need an account?')}</AccordionTrigger>
            <AccordionContent>{t('kuizu.page.faq.a1', 'No! You can play solo quizzes and daily challenges without an account. Login is needed for multiplayer, history tracking, and custom quiz creation.')}</AccordionContent>
          </AccordionItem>
          <AccordionItem value="item-2">
            <AccordionTrigger>{t('kuizu.page.faq.q2', 'How does scoring work?')}</AccordionTrigger>
            <AccordionContent>{t('kuizu.page.faq.a2', 'You earn 1000 base points per correct answer plus up to 500 bonus points for answering quickly. Consecutive correct answers build a streak multiplier (up to 2x).')}</AccordionContent>
          </AccordionItem>
          <AccordionItem value="item-3">
            <AccordionTrigger>{t('kuizu.page.faq.q3', 'Can I create my own quizzes?')}</AccordionTrigger>
            <AccordionContent>{t('kuizu.page.faq.a3', 'Yes! Create custom quizzes with your own questions, set passcodes for privacy, and share them via link, code, or QR code.')}</AccordionContent>
          </AccordionItem>
          <AccordionItem value="item-4">
            <AccordionTrigger>{t('kuizu.page.faq.q4', 'How does multiplayer work?')}</AccordionTrigger>
            <AccordionContent>{t('kuizu.page.faq.a4', 'Create a room, share the room code with friends, and compete in real-time. The host controls the quiz flow, and everyone sees live scores.')}</AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>

      {/* CTA for anonymous */}
      {!currentUser && (
        <div className="container mx-auto px-4 py-8 pb-16">
          <Card className="bg-gradient-to-r from-orange-500/10 to-amber-500/10 border-orange-500/20">
            <CardContent className="p-8 text-center space-y-4">
              <h3 className="text-xl font-semibold">{t('kuizu.page.cta.title', 'Track Your Progress')}</h3>
              <p className="text-muted-foreground max-w-md mx-auto">
                {t('kuizu.page.cta.subtitle', 'Sign in to save quiz history, track stats, create custom quizzes, and play multiplayer.')}
              </p>
              <div className="flex gap-3 justify-center pt-2">
                <Link href="/signin">
                  <Button className="bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600" style={{ borderRadius: '9999px' }}>
                    {t('kuizu.page.cta.login', 'Sign In')}
                  </Button>
                </Link>
                <Link href="/tools/kuizu/play">
                  <Button variant="outline" style={{ borderRadius: '9999px' }}>{t('kuizu.page.cta.tryNow', 'Play Now')}</Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
