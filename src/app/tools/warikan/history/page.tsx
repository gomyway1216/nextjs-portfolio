'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowLeft, History, Loader2, LogIn } from 'lucide-react';
import { useAuth } from '@/providers/AuthProvider';
import { GroupCard } from '@/components/warikan';
import * as warikanService from '@/services/warikanService';
import type { WarikanGroup } from '@/types/warikan';

export default function WarikanHistoryPage() {
  const { currentUser } = useAuth();
  const [groups, setGroups] = useState<WarikanGroup[]>([]);
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
      const { groups } = await warikanService.getGroups();
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
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/tools/warikan">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-2xl font-bold">履歴</h1>
        </div>

        <Card>
          <CardContent className="p-8 text-center">
            <LogIn className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-xl font-semibold mb-2">ログインが必要です</h2>
            <p className="text-muted-foreground mb-6">
              履歴を見るにはログインしてください。
              <br />
              ログインすると過去の割り勘グループにいつでもアクセスできます。
            </p>
            <Link href="/signin">
              <Button>ログイン</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/tools/warikan">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <h1 className="text-2xl font-bold">履歴</h1>
      </div>

      {groups.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <History className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-xl font-semibold mb-2">履歴がありません</h2>
            <p className="text-muted-foreground mb-6">
              まだ割り勘グループを作成していません。
            </p>
            <Link href="/tools/warikan/new">
              <Button>新しいグループを作成</Button>
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
