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
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/providers/AuthProvider';
import { GroupCard } from '@/components/warikan';
import { useWarikanHistory } from '@/hooks/useWarikan';
import * as warikanService from '@/services/warikanService';
import type { WarikanGroup } from '@/types/warikan';

// Local storage key for anonymous users
const LOCAL_STORAGE_KEY = 'warikan_recent_groups';

interface LocalGroupEntry {
  id: string;
  name: string;
  accessedAt: string;
}

export default function WarikanPage() {
  const router = useRouter();
  const { currentUser } = useAuth();
  const { history, loading: historyLoading } = useWarikanHistory();
  const [recentGroups, setRecentGroups] = useState<WarikanGroup[]>([]);
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
      const { groups } = await warikanService.getGroups();
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
      const group = await warikanService.getGroupByShareCode(code);
      router.push(`/tools/warikan/${group.id}`);
    } catch {
      toast.error('グループが見つかりません。コードを確認してください。');
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="space-y-10">
      {/* Hero Section */}
      <div className="text-center space-y-4 py-4">
        <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
          ワリカン
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          グループ旅行や飲み会の割り勘計算を簡単に。
          誰がいくら払って、誰がいくら受け取るか、最適な精算方法を自動で計算します。
        </p>
      </div>

      {/* Main Actions */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Link href="/tools/warikan/new" className="block">
          <Card className="hover:border-primary hover:shadow-md transition-all h-full group">
            <CardContent className="p-6 flex flex-col items-center text-center">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Plus className="h-8 w-8 text-primary" />
              </div>
              <h2 className="text-xl font-semibold mb-2">新しいグループを作成</h2>
              <p className="text-muted-foreground text-sm">
                旅行や飲み会の割り勘グループを作成
              </p>
            </CardContent>
          </Card>
        </Link>

        {/* Join by Code */}
        <Card className="h-full">
          <CardContent className="p-6 flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-4">
              <QrCode className="h-8 w-8 text-green-600 dark:text-green-400" />
            </div>
            <h2 className="text-xl font-semibold mb-2">共有コードで参加</h2>
            <p className="text-muted-foreground text-sm mb-4">
              共有されたコードを入力して参加
            </p>
            <form onSubmit={handleJoinByCode} className="w-full space-y-2">
              <Input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="例: ABC123"
                className="text-center font-mono uppercase"
                maxLength={10}
                disabled={joining}
              />
              <Button
                type="submit"
                variant="outline"
                className="w-full"
                disabled={joining || !joinCode.trim()}
              >
                {joining ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <ChevronRight className="h-4 w-4 mr-2" />
                )}
                参加する
              </Button>
            </form>
          </CardContent>
        </Card>

        {currentUser ? (
          <Link href="/tools/warikan/history" className="block">
            <Card className="hover:border-primary hover:shadow-md transition-all h-full group">
              <CardContent className="p-6 flex flex-col items-center text-center">
                <div className="w-16 h-16 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <History className="h-8 w-8 text-purple-600 dark:text-purple-400" />
                </div>
                <h2 className="text-xl font-semibold mb-2">履歴を見る</h2>
                <p className="text-muted-foreground text-sm">
                  過去の割り勘グループを確認
                </p>
              </CardContent>
            </Card>
          </Link>
        ) : (
          <Card className="h-full bg-muted/30">
            <CardContent className="p-6 flex flex-col items-center text-center">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                <History className="h-8 w-8 text-muted-foreground" />
              </div>
              <h2 className="text-xl font-semibold mb-2">履歴を見る</h2>
              <p className="text-muted-foreground text-sm mb-4">
                ログインすると履歴が保存されます
              </p>
              <Link href="/signin">
                <Button variant="outline" size="sm">ログイン</Button>
              </Link>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Recent Groups for logged in users */}
      {currentUser && recentGroups.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">最近のグループ</h2>
            <Link href="/tools/warikan/history">
              <Button variant="ghost" size="sm">
                すべて見る
                <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </Link>
          </div>
          <div className="space-y-3">
            {(loading || historyLoading) ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Card key={i}>
                    <CardContent className="p-4">
                      <div className="h-12 bg-muted animate-pulse rounded" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              recentGroups.map((group) => (
                <GroupCard key={group.id} group={group} />
              ))
            )}
          </div>
        </div>
      )}

      {/* Recent Groups for anonymous users (from localStorage) */}
      {!currentUser && localGroups.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-xl font-semibold">最近アクセスしたグループ</h2>
          </div>
          <div className="space-y-2">
            {localGroups.map((entry) => (
              <Link key={entry.id} href={`/tools/warikan/${entry.id}`}>
                <Card className="hover:border-primary transition-colors">
                  <CardContent className="p-4 flex items-center justify-between">
                    <span className="font-medium">{entry.name}</span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
          <p className="text-xs text-muted-foreground text-center">
            ログインすると履歴がアカウントに保存されます
          </p>
        </div>
      )}

      {/* How it Works */}
      <div className="space-y-6 pt-8 border-t">
        <h2 className="text-2xl font-semibold text-center">使い方</h2>
        <div className="grid gap-6 md:grid-cols-4">
          {[
            { step: 1, title: 'グループ作成', desc: 'グループ名とメンバーを入力して作成', icon: Users },
            { step: 2, title: '支払いを記録', desc: '誰がいくら払ったかを登録', icon: Calculator },
            { step: 3, title: '精算を確認', desc: '最適な精算方法を自動計算', icon: ArrowRight },
            { step: 4, title: '共有', desc: 'リンクやQRコードでメンバーに共有', icon: Share2 },
          ].map(({ step, title, desc, icon: Icon }) => (
            <div key={step} className="flex flex-col items-center text-center">
              <div className="relative">
                <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                  <Icon className="h-6 w-6 text-primary" />
                </div>
                <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-primary text-primary-foreground text-sm font-bold flex items-center justify-center">
                  {step}
                </div>
              </div>
              <h3 className="font-semibold mb-1">{title}</h3>
              <p className="text-sm text-muted-foreground">{desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Features */}
      <div className="space-y-6">
        <h2 className="text-2xl font-semibold text-center">機能</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[
            {
              icon: Calculator,
              title: '最適精算アルゴリズム',
              desc: '送金回数を最小限に抑える最適な精算方法を自動計算。複雑な割り勘も簡単に解決。',
              color: 'blue',
            },
            {
              icon: Users,
              title: '傾斜配分（重み付け）',
              desc: '途中参加やお酒を飲まない人など、メンバーごとに負担割合を柔軟に設定可能。',
              color: 'green',
            },
            {
              icon: Share2,
              title: '簡単共有',
              desc: 'リンクやQRコードでメンバーに簡単共有。ログイン不要で誰でも参加可能。',
              color: 'purple',
            },
            {
              icon: Lock,
              title: 'パスコード保護',
              desc: 'グループにパスコードを設定して、メンバー以外のアクセスを制限。',
              color: 'orange',
            },
            {
              icon: Globe,
              title: '多通貨対応',
              desc: '日本円、米ドル、ユーロなど複数の通貨に対応。海外旅行でも便利。',
              color: 'cyan',
            },
            {
              icon: History,
              title: '履歴管理',
              desc: 'ログインすると過去のグループ履歴が保存され、いつでも確認可能。',
              color: 'pink',
            },
          ].map(({ icon: Icon, title, desc, color }) => (
            <Card key={title}>
              <CardContent className="p-4 flex items-start gap-3">
                <div className={`w-10 h-10 rounded-full bg-${color}-100 dark:bg-${color}-900/30 flex items-center justify-center shrink-0`}>
                  <Icon className={`h-5 w-5 text-${color}-600 dark:text-${color}-400`} />
                </div>
                <div>
                  <h3 className="font-medium">{title}</h3>
                  <p className="text-sm text-muted-foreground">{desc}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* FAQ */}
      <div className="space-y-6 pt-8 border-t">
        <h2 className="text-2xl font-semibold text-center">よくある質問</h2>
        <Accordion type="single" collapsible className="max-w-2xl mx-auto">
          <AccordionItem value="item-1">
            <AccordionTrigger>ログインしなくても使えますか？</AccordionTrigger>
            <AccordionContent>
              はい、ログインなしでもグループの作成・支払い記録・精算計算のすべての機能が使えます。
              ただし、ログインすると履歴が保存され、後から簡単にアクセスできるようになります。
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="item-2">
            <AccordionTrigger>グループのURLを忘れてしまいました</AccordionTrigger>
            <AccordionContent>
              ログインしていた場合は「履歴」から確認できます。
              ログインしていなかった場合は、グループを共有したメンバーにリンクを聞いてください。
              パスコードを設定している場合は、パスコードも必要です。
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="item-3">
            <AccordionTrigger>途中から参加した人の負担を減らせますか？</AccordionTrigger>
            <AccordionContent>
              はい、「傾斜配分」機能を使って、メンバーごとに負担割合（重み）を設定できます。
              例えば、途中参加の人は0.5倍、幹事は0倍など柔軟に設定可能です。
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="item-4">
            <AccordionTrigger>データはどこに保存されますか？</AccordionTrigger>
            <AccordionContent>
              データはクラウド（Firebase）に安全に保存されます。
              グループのURLさえあれば、どの端末からでもアクセスできます。
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="item-5">
            <AccordionTrigger>グループを削除できますか？</AccordionTrigger>
            <AccordionContent>
              グループの作成者（ログインユーザーの場合）はグループを削除できます。
              削除するとすべての支払い記録も消去されますのでご注意ください。
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>

      {/* CTA for anonymous users */}
      {!currentUser && (
        <Card className="bg-gradient-to-r from-primary/10 to-primary/5 border-primary/20">
          <CardContent className="p-6 text-center space-y-4">
            <h3 className="text-lg font-semibold">アカウントを作成して履歴を保存</h3>
            <p className="text-muted-foreground">
              ログインすると、作成したグループや参加したグループの履歴が保存され、
              いつでも簡単にアクセスできるようになります。
            </p>
            <div className="flex gap-3 justify-center">
              <Link href="/signin">
                <Button>ログイン / 新規登録</Button>
              </Link>
              <Link href="/tools/warikan/new">
                <Button variant="outline">まずは試してみる</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
