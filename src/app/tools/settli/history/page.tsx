'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowLeft, History, Loader2, LogIn } from 'lucide-react';
import { useAuth } from '@/providers/AuthProvider';
import { GroupCard, SettliLogo } from '@/components/settli';
import * as settliService from '@/services/settliService';
import type { SettliGroup } from '@/types/settli';

export default function SettliHistoryPage() {
  const { currentUser } = useAuth();
  const [groups, setGroups] = useState<SettliGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    // Wait for auth to initialize
    const timer = setTimeout(() => {
      setInitialized(true);
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!initialized) return;

    if (currentUser) {
      fetchGroups();
    } else {
      setLoading(false);
    }
  }, [currentUser, initialized]);

  const fetchGroups = async () => {
    setLoading(true);
    try {
      const { groups } = await settliService.getGroups();
      setGroups(groups);
    } catch (error) {
      console.error('Failed to fetch groups:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!initialized || loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-2xl space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/tools/settli">
            <Button variant="ghost" size="icon" className="rounded-full">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="flex items-center gap-3">
            <SettliLogo size={32} />
            <h1 className="text-2xl font-bold">履歴</h1>
          </div>
        </div>

        <Card className="border-2">
          <CardContent className="p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-gradient-to-r from-indigo-500/10 to-purple-500/10 flex items-center justify-center mx-auto mb-4">
              <LogIn className="h-8 w-8 text-indigo-500" />
            </div>
            <h2 className="text-xl font-semibold mb-2">ログインが必要です</h2>
            <p className="text-muted-foreground mb-6">
              履歴を見るにはログインしてください。
              <br />
              ログインすると過去のグループにいつでもアクセスできます。
            </p>
            <Link href="/signin">
              <Button className="bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600">
                ログイン
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/tools/settli">
          <Button variant="ghost" size="icon" className="rounded-full">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex items-center gap-3">
          <SettliLogo size={32} />
          <h1 className="text-2xl font-bold">履歴</h1>
        </div>
      </div>

      {groups.length === 0 ? (
        <Card className="border-2">
          <CardContent className="p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-gradient-to-r from-indigo-500/10 to-purple-500/10 flex items-center justify-center mx-auto mb-4">
              <History className="h-8 w-8 text-indigo-500" />
            </div>
            <h2 className="text-xl font-semibold mb-2">履歴がありません</h2>
            <p className="text-muted-foreground mb-6">
              まだグループを作成していません。
            </p>
            <Link href="/tools/settli/new">
              <Button className="bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600">
                新しいグループを作成
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {groups.map((group) => (
            <GroupCard key={group.id} group={group} />
          ))}
        </div>
      )}
    </div>
  );
}
