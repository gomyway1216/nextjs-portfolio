'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import {
  ArrowRight,
  CloudUpload,
  Globe,
  HardDrive,
  Loader2,
  Plus,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/providers/AuthProvider';
import { ScoreTrackerIcon, CreateGroupDialog } from '@/components/scoretracker';
import * as svc from '@/services/scoreTrackerService';
import * as local from '@/lib/scoreTrackerLocal';
import type { LocalScoreGroup } from '@/lib/scoreTrackerLocal';
import type { ScoreGroup } from '@/types/scoreTracker';

// useSearchParams forces a CSR bailout, which Next.js requires to live inside
// a Suspense boundary for static-rendered routes. Splitting the page into an
// inner component lets us keep the static shell while still reading the
// `?code=` invite-link param on mount.
export default function ScoreTrackerPage() {
  return (
    <Suspense fallback={<ScoreTrackerLoading />}>
      <ScoreTrackerPageInner />
    </Suspense>
  );
}

function ScoreTrackerLoading() {
  return (
    <div className="min-h-screen container mx-auto px-4 py-10 max-w-3xl">
      <div className="h-16 w-16 mx-auto rounded-2xl bg-muted animate-pulse" />
    </div>
  );
}

function ScoreTrackerPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { currentUser } = useAuth();

  const [cloudGroups, setCloudGroups] = useState<ScoreGroup[]>([]);
  const [localGroups, setLocalGroups] = useState<LocalScoreGroup[]>([]);
  const [loadingCloud, setLoadingCloud] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [migratingId, setMigratingId] = useState<string | null>(null);

  const isCloud = !!currentUser;
  const defaultOwnerName = useMemo(
    () => currentUser?.displayName || currentUser?.email?.split('@')[0] || '',
    [currentUser],
  );

  const refreshLocal = useCallback(() => {
    setLocalGroups(local.listLocalGroups());
  }, []);

  const refreshCloud = useCallback(async () => {
    if (!currentUser) {
      setCloudGroups([]);
      return;
    }
    setLoadingCloud(true);
    try {
      const { groups } = await svc.listGroups();
      setCloudGroups(groups);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'クラウドグループの取得に失敗しました');
    } finally {
      setLoadingCloud(false);
    }
  }, [currentUser]);

  useEffect(() => {
    refreshLocal();
  }, [refreshLocal]);

  useEffect(() => {
    refreshCloud();
  }, [refreshCloud]);

  // Auto-fill join code from ?code= query param when present (invite-link flow).
  useEffect(() => {
    const code = searchParams.get('code');
    if (code) setJoinCode(code.toUpperCase());
  }, [searchParams]);

  async function handleCreate(input: {
    name: string;
    description: string;
    ownerName: string;
    extraMembers: { name: string }[];
  }) {
    if (isCloud) {
      try {
        const { id } = await svc.createGroup({
          name: input.name,
          description: input.description,
          ownerName: input.ownerName,
          members: input.extraMembers,
        });
        toast.success('グループを作成しました');
        router.push(`/tools/score-tracker/${id}`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : '作成に失敗しました');
        throw err;
      }
    } else {
      const g = local.createLocalGroup({
        name: input.name,
        description: input.description,
        ownerName: input.ownerName,
        extraMembers: input.extraMembers,
      });
      toast.success('ローカルにグループを作成しました');
      router.push(`/tools/score-tracker/${g.id}`);
    }
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    const code = joinCode.trim().toUpperCase();
    if (!code) return;
    if (!currentUser) {
      // Don't router.push to /signin — that would drop the code from the URL
      // and the user would have to find the invite again after login. The
      // inline "ログイン" link below the input handles navigation; the code
      // stays in the field so it's still here when they return.
      toast.error('グループに参加するにはログインしてください');
      return;
    }
    setJoining(true);
    try {
      const preview = await svc.getGroupByShareCode(code);
      const memberName = currentUser.displayName || currentUser.email?.split('@')[0] || 'メンバー';
      await svc.joinGroup(preview.id, { shareCode: code, memberName });
      toast.success(`「${preview.name}」に参加しました`);
      router.push(`/tools/score-tracker/${preview.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '参加に失敗しました');
    } finally {
      setJoining(false);
    }
  }

  async function handleMigrate(g: LocalScoreGroup) {
    if (!currentUser) return;
    setMigratingId(g.id);
    try {
      const ownerName = currentUser.displayName || currentUser.email?.split('@')[0] || 'オーナー';
      const localOwner = g.members.find((m) => m.role === 'owner');
      const { id } = await svc.migrateLocalGroup({
        name: g.name,
        description: g.description,
        ownerName,
        // Pass the local owner id so the server can remap session participants
        // to the new cloud owner — otherwise the owner's historical scores
        // would degrade into guest totals after migration.
        ownerLocalId: localOwner?.id,
        members: g.members
          .filter((m) => m.role !== 'owner')
          .map((m) => ({ id: m.id, name: m.name })),
        sessions: g.sessions.map((s) => ({
          date: s.date,
          note: s.note,
          participants: s.participants.map((p) => ({
            id: p.id,
            name: p.name,
            memberId: p.memberId,
            score: p.score,
          })),
        })),
      });
      local.removeLocalGroup(g.id);
      refreshLocal();
      await refreshCloud();
      toast.success('クラウドに移行しました');
      router.push(`/tools/score-tracker/${id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '移行に失敗しました');
    } finally {
      setMigratingId(null);
    }
  }

  return (
    <div className="min-h-screen container mx-auto px-4 py-10 max-w-3xl">
      {/* Hero */}
      <div className="flex flex-col items-center text-center space-y-4 mb-10">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center text-white shadow-lg"
          style={{ background: 'linear-gradient(135deg, #0f766e, #14b8a6, #2dd4bf)' }}
        >
          <ScoreTrackerIcon size={36} />
        </div>
        <div className="space-y-1">
          <h1 className="text-3xl font-bold">スコアトラッカー</h1>
          <p className="text-muted-foreground text-sm max-w-md">
            麻雀の素点、ゴルフ、ボドゲ会など — 日付ごとの最終点を記録して累計を追跡。
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setCreateOpen(true)} className="rounded-full">
            <Plus className="h-4 w-4 mr-1.5" />
            新規グループ
          </Button>
        </div>
      </div>

      {/* Join by code */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <form onSubmit={handleJoin} className="flex gap-2 items-center">
            <span className="text-sm text-muted-foreground shrink-0 hidden sm:block">
              招待コード
            </span>
            <Input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="ABCDEFGH"
              className="font-mono text-center uppercase tracking-widest"
              maxLength={8}
              disabled={joining}
              aria-label="招待コード"
            />
            <Button type="submit" size="icon" disabled={joining || !joinCode.trim()}>
              {joining ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            </Button>
          </form>
          {!currentUser && joinCode && (
            <p className="text-xs text-muted-foreground mt-2">
              参加には<Link href="/signin" className="underline">ログイン</Link>が必要です
            </p>
          )}
        </CardContent>
      </Card>

      {/* Cloud groups */}
      {currentUser && (
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
            <Globe className="h-4 w-4" />
            クラウドのグループ
          </h2>
          {loadingCloud ? (
            <div className="h-12 rounded-lg bg-muted animate-pulse" />
          ) : cloudGroups.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">まだクラウドのグループはありません</p>
          ) : (
            <div className="divide-y rounded-xl border overflow-hidden">
              {cloudGroups.map((g) => (
                <GroupRow key={g.id} id={g.id} name={g.name} memberCount={g.members.length} badge="cloud" />
              ))}
            </div>
          )}
        </section>
      )}

      {/* Local groups */}
      {localGroups.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
            <HardDrive className="h-4 w-4" />
            ローカルのグループ
          </h2>
          <div className="divide-y rounded-xl border overflow-hidden">
            {localGroups.map((g) => (
              <div key={g.id} className="flex items-center gap-2 px-4 py-2.5 hover:bg-muted/50">
                <Link href={`/tools/score-tracker/${g.id}`} className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">{g.name}</span>
                    <Badge variant="secondary" className="text-[10px] px-1 py-0 shrink-0">
                      <HardDrive className="h-2.5 w-2.5 mr-0.5" />
                      ローカル
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                    <span className="flex items-center gap-0.5">
                      <Users className="h-3 w-3" />
                      {g.members.length}人
                    </span>
                    <span>{g.sessions.length} セッション</span>
                  </div>
                </Link>
                {currentUser && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleMigrate(g)}
                    disabled={migratingId === g.id}
                  >
                    {migratingId === g.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <>
                        <CloudUpload className="h-3.5 w-3.5 mr-1" />
                        クラウドへ
                      </>
                    )}
                  </Button>
                )}
              </div>
            ))}
          </div>
          {!currentUser && (
            <p className="text-xs text-muted-foreground mt-2">
              <Link href="/signin" className="underline">ログイン</Link>するとクラウドに保存・共有できます
            </p>
          )}
        </section>
      )}

      {cloudGroups.length === 0 && localGroups.length === 0 && !loadingCloud && (
        <p className="text-center text-sm text-muted-foreground py-8">
          「新規グループ」から始めましょう
        </p>
      )}

      <CreateGroupDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        isCloud={isCloud}
        defaultOwnerName={defaultOwnerName}
        onSubmit={handleCreate}
      />
    </div>
  );
}

function GroupRow({
  id,
  name,
  memberCount,
  badge,
}: {
  id: string;
  name: string;
  memberCount: number;
  badge: 'cloud' | 'local';
}) {
  return (
    <Link
      href={`/tools/score-tracker/${id}`}
      className="flex items-center justify-between px-4 py-2.5 hover:bg-muted/50 transition-colors"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm truncate">{name}</span>
          {badge === 'cloud' && (
            <Badge variant="secondary" className="text-[10px] px-1 py-0 shrink-0">
              <Globe className="h-2.5 w-2.5 mr-0.5" />
              クラウド
            </Badge>
          )}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-0.5">
          <Users className="h-3 w-3" /> {memberCount}人
        </div>
      </div>
      <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
    </Link>
  );
}
