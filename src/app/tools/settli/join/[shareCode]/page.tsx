'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Users, ArrowRight } from 'lucide-react';
import { useSettliGroupByShareCode } from '@/hooks/useSettli';

export default function JoinSettliGroupPage() {
  const params = useParams();
  const router = useRouter();
  const shareCode = params.shareCode as string;

  const { group, loading, error } = useSettliGroupByShareCode(shareCode);

  // Redirect to group page once loaded
  useEffect(() => {
    if (group && !loading) {
      // Small delay to show the success state
      const timer = setTimeout(() => {
        router.push(`/tools/settli/${group.id}`);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [group, loading, router]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="text-muted-foreground">グループを読み込み中...</p>
      </div>
    );
  }

  if (error || !group) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-6">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-4">
              <Users className="h-8 w-8 text-red-600 dark:text-red-400" />
            </div>
            <h2 className="text-xl font-semibold mb-2">グループが見つかりません</h2>
            <p className="text-muted-foreground mb-6">
              このリンクは無効か、グループが削除された可能性があります。
            </p>
            <Link href="/tools/settli">
              <Button>Settliのトップへ</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] gap-6">
      <Card className="max-w-md w-full">
        <CardContent className="p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-4">
            <Users className="h-8 w-8 text-green-600 dark:text-green-400" />
          </div>
          <h2 className="text-xl font-semibold mb-2">参加しました!</h2>
          <p className="text-2xl font-bold mb-2">{group.name}</p>
          <p className="text-muted-foreground mb-6">
            {group.members.filter((m) => m.isActive !== false).length}人のメンバー
          </p>
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            グループページへ移動中...
          </div>
        </CardContent>
      </Card>

      <Link href={`/tools/settli/${group.id}`}>
        <Button variant="ghost">
          今すぐ移動する
          <ArrowRight className="h-4 w-4 ml-1" />
        </Button>
      </Link>
    </div>
  );
}
