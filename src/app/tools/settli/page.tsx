'use client';

import { useEffect, useState } from 'react';
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
  Calculator,
  Users,
  ArrowRight,
  Share2,
  QrCode,
  Lock,
  Globe,
  ChevronRight,
  Loader2,
  Clock,
  Sparkles,
  Zap,
  Shield,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/providers/AuthProvider';
import { GroupCard, SettliLogo } from '@/components/settli';
import { useSettliHistory } from '@/hooks/useSettli';
import * as settliService from '@/services/settliService';
import type { SettliGroup } from '@/types/settli';

// Local storage key for anonymous users
const LOCAL_STORAGE_KEY = 'settli_recent_groups';

interface LocalGroupEntry {
  id: string;
  name: string;
  accessedAt: string;
}

export default function SettliPage() {
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
      toast.error('共有コードを入力してください');
      return;
    }

    setJoining(true);
    try {
      const group = await settliService.getGroupByShareCode(code);
      router.push(`/tools/settli/${group.id}`);
    } catch {
      toast.error('グループが見つかりません');
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
              グループの精算を、スマートに。
            </p>
            <p className="text-sm md:text-base text-muted-foreground/80">
              旅行、飲み会、イベント。複雑な割り勘も、最適な精算方法を自動で計算。
            </p>
          </div>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
            <Link href="/tools/settli/new">
              <Button size="lg" className="w-full sm:w-auto bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white shadow-lg shadow-indigo-500/25" style={{ borderRadius: '9999px' }}>
                <Plus className="h-5 w-5 mr-2" />
                新しいグループを作成
              </Button>
            </Link>
            {currentUser && (
              <Link href="/tools/settli/history">
                <Button size="lg" variant="outline" className="w-full sm:w-auto" style={{ borderRadius: '9999px' }}>
                  <History className="h-5 w-5 mr-2" />
                  履歴を見る
                </Button>
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Join by Code Section */}
      <div className="container mx-auto px-4 pt-6 pb-2 max-w-md">
        <form onSubmit={handleJoinByCode} className="flex gap-2 items-center">
          <span className="text-sm text-muted-foreground shrink-0">コードで参加</span>
          <Input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            placeholder="ABC123"
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
              最近のグループ
            </h2>
            <Link href="/tools/settli/history">
              <Button variant="ghost" size="sm" style={{ borderRadius: '9999px' }} className="text-xs h-7 px-2">
                すべて見る <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
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
            最近アクセスしたグループ
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
              シンプルで、パワフル
            </span>
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            複雑な割り勘計算を、誰でも簡単に。
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[
            {
              icon: Zap,
              title: '最適精算アルゴリズム',
              description: '送金回数を最小限に。AIが最も効率的な精算方法を瞬時に計算。',
              gradient: 'from-yellow-500 to-orange-500',
            },
            {
              icon: Users,
              title: '柔軟な傾斜配分',
              description: '途中参加、お酒を飲まない人など、一人ひとりの負担割合をカスタマイズ。',
              gradient: 'from-green-500 to-emerald-500',
            },
            {
              icon: Share2,
              title: 'ワンクリック共有',
              description: 'リンクやQRコードで即座に共有。アプリのインストール不要。',
              gradient: 'from-blue-500 to-cyan-500',
            },
            {
              icon: Shield,
              title: 'パスコード保護',
              description: 'グループをパスコードで保護。プライバシーを守ります。',
              gradient: 'from-red-500 to-pink-500',
            },
            {
              icon: Globe,
              title: '多通貨対応',
              description: '日本円、ドル、ユーロなど。海外旅行でもそのまま使える。',
              gradient: 'from-purple-500 to-indigo-500',
            },
            {
              icon: Sparkles,
              title: 'ログイン不要',
              description: 'すぐに使い始められる。ログインすれば履歴も保存。',
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
          <h2 className="text-3xl font-bold text-center mb-12">使い方</h2>
          <div className="grid gap-8 md:grid-cols-4 max-w-4xl mx-auto">
            {[
              { step: 1, title: 'グループ作成', desc: 'メンバーを追加', icon: Users },
              { step: 2, title: '支払いを記録', desc: '誰が何を払ったか', icon: Calculator },
              { step: 3, title: '精算を確認', desc: '自動で最適計算', icon: Zap },
              { step: 4, title: '共有', desc: 'リンクで共有', icon: Share2 },
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
        <h2 className="text-3xl font-bold text-center mb-12">よくある質問</h2>
        <Accordion type="single" collapsible className="max-w-2xl mx-auto">
          <AccordionItem value="item-1">
            <AccordionTrigger>ログインしなくても使えますか？</AccordionTrigger>
            <AccordionContent>
              はい、ログインなしでもすべての機能が使えます。
              ログインすると履歴が保存され、後から簡単にアクセスできます。
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="item-2">
            <AccordionTrigger>グループのURLを忘れてしまいました</AccordionTrigger>
            <AccordionContent>
              ログインしていた場合は「履歴」から確認できます。
              そうでない場合は、共有した相手にリンクを聞いてください。
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="item-3">
            <AccordionTrigger>途中参加の人の負担を減らせますか？</AccordionTrigger>
            <AccordionContent>
              はい、メンバーごとに「重み」を設定できます。
              例：途中参加 → 0.5倍、幹事 → 0倍など。
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="item-4">
            <AccordionTrigger>データは安全ですか？</AccordionTrigger>
            <AccordionContent>
              はい、データはクラウドに安全に保存されます。
              パスコードを設定すれば、第三者のアクセスを防げます。
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>

      {/* CTA for anonymous users */}
      {!currentUser && (
        <div className="container mx-auto px-4 py-8 pb-16">
          <Card className="bg-gradient-to-r from-indigo-500/10 to-purple-500/10 border-indigo-500/20">
            <CardContent className="p-8 text-center space-y-4">
              <h3 className="text-xl font-semibold">アカウントを作成して履歴を保存</h3>
              <p className="text-muted-foreground max-w-md mx-auto">
                ログインすると、作成したグループの履歴が保存され、いつでもアクセスできます。
              </p>
              <div className="flex gap-3 justify-center pt-2">
                <Link href="/signin">
                  <Button className="bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600" style={{ borderRadius: '9999px' }}>
                    ログイン / 新規登録
                  </Button>
                </Link>
                <Link href="/tools/settli/new">
                  <Button variant="outline" style={{ borderRadius: '9999px' }}>まずは試してみる</Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
