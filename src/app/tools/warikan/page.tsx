'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Plus, History, Calculator, Users, ArrowRight, Share2 } from 'lucide-react';
import { useAuth } from '@/providers/AuthProvider';
import { GroupCard } from '@/components/warikan';
import { useWarikanHistory } from '@/hooks/useWarikan';
import * as warikanService from '@/services/warikanService';
import type { WarikanGroup } from '@/types/warikan';

export default function WarikanPage() {
  const { currentUser } = useAuth();
  const { history, loading: historyLoading } = useWarikanHistory();
  const [recentGroups, setRecentGroups] = useState<WarikanGroup[]>([]);
  const [loading, setLoading] = useState(false);

  // Fetch recent groups from history
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

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold">ワリカン</h1>
        <p className="text-lg text-muted-foreground max-w-xl mx-auto">
          グループ旅行や飲み会の割り勘計算を簡単に。
          <br />
          最適な精算方法を自動で計算します。
        </p>
      </div>

      {/* Main Actions */}
      <div className="grid gap-4 md:grid-cols-2">
        <Link href="/tools/warikan/new" className="block">
          <Card className="hover:border-primary transition-colors h-full">
            <CardContent className="p-6 flex flex-col items-center text-center">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <Plus className="h-8 w-8 text-primary" />
              </div>
              <h2 className="text-xl font-semibold mb-2">新しいグループを作成</h2>
              <p className="text-muted-foreground">
                旅行や飲み会の割り勘グループを作成します
              </p>
            </CardContent>
          </Card>
        </Link>

        {currentUser && (
          <Link href="/tools/warikan/history" className="block">
            <Card className="hover:border-primary transition-colors h-full">
              <CardContent className="p-6 flex flex-col items-center text-center">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                  <History className="h-8 w-8 text-primary" />
                </div>
                <h2 className="text-xl font-semibold mb-2">履歴を見る</h2>
                <p className="text-muted-foreground">
                  過去の割り勘グループを確認できます
                </p>
              </CardContent>
            </Card>
          </Link>
        )}
      </div>

      {/* Recent Groups (for logged in users) */}
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

      {/* Features */}
      <div className="pt-8 border-t">
        <h2 className="text-xl font-semibold text-center mb-6">機能</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="p-4 flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                <Calculator className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h3 className="font-medium">最適精算</h3>
                <p className="text-sm text-muted-foreground">
                  送金回数を最小限に抑える最適な精算方法を自動計算
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center shrink-0">
                <Users className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <h3 className="font-medium">傾斜配分</h3>
                <p className="text-sm text-muted-foreground">
                  途中参加やお酒を飲まない人など柔軟な負担割合の設定
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center shrink-0">
                <Share2 className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <h3 className="font-medium">簡単共有</h3>
                <p className="text-sm text-muted-foreground">
                  リンクやQRコードでメンバーに簡単共有
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Login prompt for anonymous users */}
      {!currentUser && (
        <Card className="bg-muted/50">
          <CardContent className="p-6 text-center">
            <p className="text-muted-foreground mb-4">
              ログインすると履歴が保存され、いつでもグループにアクセスできます
            </p>
            <Link href="/signin">
              <Button variant="outline">ログイン</Button>
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
