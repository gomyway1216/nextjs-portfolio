'use client';

import { Suspense, useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import {
  ArrowRight,
  BarChart3,
  Calendar,
  CloudUpload,
  Globe,
  HardDrive,
  Loader2,
  Plus,
  Share2,
  Shield,
  Trophy,
  Users,
  Zap,
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
import styles from '../tool-landing.module.css';

const scoreTrackerTheme = {
  '--tool-accent': '#14b8a6',
  '--tool-accent-strong': '#0f766e',
  '--tool-accent-soft': '#2dd4bf',
} as CSSProperties;

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
    <div className={styles.page} style={scoreTrackerTheme}>
      <div className={styles.sectionNarrow}>
        <div className="h-16 w-16 mx-auto rounded-lg bg-muted animate-pulse" />
      </div>
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
    <div className={styles.page} style={scoreTrackerTheme}>
      <div className={styles.hero}>
        <div className={styles.heroInner}>
          <div className={styles.logoWrap}>
            <div
              className="w-20 h-20 rounded-lg flex items-center justify-center text-white shadow-lg"
              style={{ background: 'linear-gradient(135deg, #0f766e, #14b8a6, #2dd4bf)' }}
            >
              <ScoreTrackerIcon size={44} />
            </div>
          </div>

          <div className={styles.heroCopy}>
            <h1 className={`${styles.heroBrand} ${styles.heroBrandCompact}`}>スコアトラッカー</h1>
            <p className={styles.heroTitle}>
              麻雀、ゴルフ、ボードゲーム会の累計をきれいに残す
            </p>
            <p className={styles.heroSubtitle}>
              日付ごとの最終点、参加メンバー、累計ランキングをローカルでもクラウドでも記録。
              招待コードでグループ参加もできます。
            </p>
          </div>

          <div className={styles.heroActions}>
            <Button
              onClick={() => setCreateOpen(true)}
              size="lg"
              className="w-full sm:w-auto bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-600 hover:to-cyan-600 text-white shadow-lg shadow-teal-500/25"
              style={{ borderRadius: '9999px' }}
            >
              <Plus className="h-4 w-4 mr-1.5" />
              新規グループ
            </Button>
            {!currentUser && (
              <Link href="/signin">
                <Button size="lg" variant="outline" className={`w-full sm:w-auto ${styles.outlineButton}`} style={{ borderRadius: '9999px' }}>
                  ログインして共有
                </Button>
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Join by code */}
      <div className={styles.joinPanel}>
        <form onSubmit={handleJoin} className="flex gap-2 items-center">
          <span className="text-sm text-muted-foreground shrink-0 hidden sm:block">
            招待コード
          </span>
          <Input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            placeholder="ABCDEFGH"
            className="font-mono text-center uppercase tracking-widest"
            style={{ borderRadius: '9999px' }}
            maxLength={8}
            disabled={joining}
            aria-label="招待コード"
          />
          <Button type="submit" size="icon" disabled={joining || !joinCode.trim()} style={{ borderRadius: '9999px' }} className="shrink-0">
            {joining ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
          </Button>
        </form>
        {!currentUser && joinCode && (
          <p className="text-xs text-muted-foreground mt-2">
            参加には<Link href="/signin" className="underline">ログイン</Link>が必要です
          </p>
        )}
      </div>

      <div className={styles.sectionNarrow}>
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
              <div className={`divide-y ${styles.listFrame}`}>
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
            <div className={`divide-y ${styles.listFrame}`}>
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
          <div className={styles.emptyState}>
            <h2 className="text-lg font-semibold mb-2">まだグループはありません</h2>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              まずはグループを作って、メンバーと日付ごとのスコアを記録しましょう。
              ログインなしなら端末内に、ログイン後はクラウドに保存できます。
            </p>
            <div className={styles.emptyStateActions}>
              <Button onClick={() => setCreateOpen(true)} style={{ borderRadius: '9999px' }}>
                <Plus className="h-4 w-4 mr-1.5" />
                新規グループ
              </Button>
              {!currentUser && (
                <Link href="/signin">
                  <Button variant="outline" className={styles.outlineButton} style={{ borderRadius: '9999px' }}>
                    ログイン
                  </Button>
                </Link>
              )}
            </div>
          </div>
        )}
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionHeading}>
            <span className={styles.sectionHeadingAccent}>できること</span>
          </h2>
          <p className={styles.sectionText}>
            点数の入力から累計確認、共有までを小さくまとめたスコア管理ツールです。
          </p>
        </div>

        <div className={styles.featureGrid}>
          {[
            {
              icon: Calendar,
              title: '日付ごとの記録',
              description: 'ゲーム会、ラウンド、卓ごとに最終点とメモを残せます。',
              gradient: 'from-teal-500 to-cyan-500',
            },
            {
              icon: Trophy,
              title: '累計ランキング',
              description: 'メンバー別の合計点を自動集計して、長期戦の流れを追えます。',
              gradient: 'from-amber-500 to-yellow-500',
            },
            {
              icon: BarChart3,
              title: '参加者ごとの推移',
              description: '参加人数が変わる会でも、各回の参加者だけを記録できます。',
              gradient: 'from-blue-500 to-sky-500',
            },
            {
              icon: HardDrive,
              title: 'ローカル保存',
              description: 'ログインなしでもすぐ開始。端末内のグループとして使えます。',
              gradient: 'from-slate-500 to-zinc-500',
            },
            {
              icon: Share2,
              title: '招待コード共有',
              description: 'クラウドグループは招待コードで参加でき、共同管理に使えます。',
              gradient: 'from-violet-500 to-purple-500',
            },
            {
              icon: Shield,
              title: 'クラウド移行',
              description: 'あとからログインして、ローカルの記録をクラウドへ移せます。',
              gradient: 'from-emerald-500 to-green-500',
            },
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

      <div className={styles.sectionMuted}>
        <div className={styles.sectionMutedInner}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionHeading}>使い方</h2>
          </div>
          <div className={styles.stepGrid}>
            {[
              { step: 1, title: 'グループ作成', desc: '会の名前とメンバーを登録します。', icon: Users },
              { step: 2, title: 'スコア入力', desc: '日付ごとに参加者と最終点を追加します。', icon: Zap },
              { step: 3, title: '累計確認', desc: 'メンバー別の合計と順位を確認します。', icon: BarChart3 },
              { step: 4, title: '共有・移行', desc: '必要に応じてクラウド保存や招待コード共有を使います。', icon: Share2 },
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
