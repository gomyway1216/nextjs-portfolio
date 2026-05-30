'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Calendar,
  Globe,
  HardDrive,
  Loader2,
  MoreVertical,
  Pencil,
  Plus,
  Share2,
  Trash2,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/providers/AuthProvider';
import { SessionFormDialog, ShareDialog } from '@/components/scoretracker';
import * as svc from '@/services/scoreTrackerService';
import * as local from '@/lib/scoreTrackerLocal';
import type { LocalScoreGroup } from '@/lib/scoreTrackerLocal';
import type { ScoreGroup, ScoreSession } from '@/types/scoreTracker';
import { computeTotals } from '@/lib/scoreTrackerTotals';

type Mode = 'local' | 'cloud';

interface LoadedState {
  mode: Mode;
  group: ScoreGroup | LocalScoreGroup;
  sessions: ScoreSession[];
}

export default function ScoreTrackerGroupPage() {
  const params = useParams<{ groupId: string }>();
  const groupId = params.groupId;
  const router = useRouter();
  const { currentUser } = useAuth();

  const [state, setState] = useState<LoadedState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionDialog, setSessionDialog] = useState<{ open: boolean; editing: ScoreSession | null }>({
    open: false,
    editing: null,
  });
  const [shareOpen, setShareOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    // Local IDs are UUIDs we minted; check there first so cloud requests aren't
    // wasted on offline-only data.
    const localGroup = local.getLocalGroup(groupId);
    if (localGroup) {
      setState({ mode: 'local', group: localGroup, sessions: localGroup.sessions });
      setLoading(false);
      return;
    }

    if (!currentUser) {
      setError('このグループはクラウドに保存されているか、削除されています。ログインしてください。');
      setLoading(false);
      return;
    }

    try {
      const [g, sess] = await Promise.all([
        svc.getGroup(groupId),
        svc.listSessions(groupId),
      ]);
      setState({ mode: 'cloud', group: g, sessions: sess.sessions });
    } catch (err) {
      setError(err instanceof Error ? err.message : '読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  }, [groupId, currentUser]);

  useEffect(() => {
    load();
  }, [load]);

  const totals = useMemo(() => {
    if (!state) return [];
    return computeTotals(state.group.members, state.sessions);
  }, [state]);

  async function handleAddSession(input: {
    date: string;
    note: string;
    participants: { id?: string; name: string; memberId?: string; score: number }[];
  }) {
    if (!state) return;
    if (state.mode === 'local') {
      local.addLocalSession(groupId, input);
    } else {
      await svc.createSession(groupId, input);
    }
    await load();
  }

  async function handleUpdateSession(
    sessionId: string,
    input: {
      date: string;
      note: string;
      participants: { id?: string; name: string; memberId?: string; score: number }[];
    },
  ) {
    if (!state) return;
    if (state.mode === 'local') {
      local.updateLocalSession(groupId, sessionId, input);
    } else {
      await svc.updateSession(groupId, sessionId, input);
    }
    await load();
  }

  async function handleDeleteSession(sessionId: string) {
    if (!state) return;
    if (!confirm('このセッションを削除しますか？')) return;
    try {
      if (state.mode === 'local') {
        local.deleteLocalSession(groupId, sessionId);
      } else {
        await svc.deleteSession(groupId, sessionId);
      }
      await load();
      toast.success('削除しました');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '削除に失敗しました');
    }
  }

  async function handleDeleteGroup() {
    if (!state) return;
    if (!confirm(`「${state.group.name}」を削除しますか？セッションも全て削除されます。`)) return;
    try {
      if (state.mode === 'local') {
        local.deleteLocalGroup(groupId);
      } else {
        await svc.deleteGroup(groupId);
      }
      toast.success('グループを削除しました');
      router.push('/tools/score-tracker');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '削除に失敗しました');
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !state) {
    return (
      <div className="min-h-screen container mx-auto px-4 py-10 max-w-2xl">
        <Link href="/tools/score-tracker">
          <Button variant="ghost" size="sm" className="mb-4">
            <ArrowLeft className="h-4 w-4 mr-1" />
            戻る
          </Button>
        </Link>
        <Card>
          <CardContent className="p-6 text-center space-y-3">
            <p className="text-sm text-muted-foreground">{error || 'グループが見つかりません'}</p>
            {!currentUser && (
              <Link href="/signin">
                <Button>ログイン</Button>
              </Link>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  const isOwner =
    state.mode === 'local'
      ? true
      : !!currentUser && (state.group as ScoreGroup).createdBy === currentUser.uid;
  const canShare = state.mode === 'cloud';
  const shareCode = state.mode === 'cloud' ? (state.group as ScoreGroup).shareCode : '';

  return (
    <div className="min-h-screen container mx-auto px-4 py-6 max-w-3xl">
      <Link href="/tools/score-tracker">
        <Button variant="ghost" size="sm" className="mb-3">
          <ArrowLeft className="h-4 w-4 mr-1" />
          グループ一覧
        </Button>
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-6">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold truncate">{state.group.name}</h1>
            {state.mode === 'local' ? (
              <Badge variant="secondary" className="text-[10px]">
                <HardDrive className="h-2.5 w-2.5 mr-0.5" />
                ローカル
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-[10px]">
                <Globe className="h-2.5 w-2.5 mr-0.5" />
                クラウド
              </Badge>
            )}
          </div>
          {state.group.description && (
            <p className="text-sm text-muted-foreground mt-1">{state.group.description}</p>
          )}
          <div className="text-xs text-muted-foreground mt-2 flex items-center gap-3 flex-wrap">
            <span className="flex items-center gap-0.5">
              <Users className="h-3 w-3" />
              {state.group.members.length}人
            </span>
            <span>{state.sessions.length} セッション</span>
          </div>
        </div>

        <div className="flex gap-2 shrink-0">
          {canShare && (
            <Button variant="outline" size="sm" onClick={() => setShareOpen(true)}>
              <Share2 className="h-4 w-4 mr-1" />
              共有
            </Button>
          )}
          <Button size="sm" onClick={() => setSessionDialog({ open: true, editing: null })}>
            <Plus className="h-4 w-4 mr-1" />
            セッション追加
          </Button>
          {isOwner && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="グループ操作メニュー">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem className="text-destructive" onClick={handleDeleteGroup}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  グループを削除
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* Totals */}
      <Card className="mb-6">
        <CardContent className="p-0">
          <div className="px-4 py-2 border-b text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            累計
          </div>
          {totals.length === 0 ? (
            <p className="text-sm text-muted-foreground p-4">まだセッションがありません</p>
          ) : (
            <div className="divide-y">
              {totals.map((row) => (
                <div key={row.memberId} className="flex items-center justify-between px-4 py-2.5">
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">{row.name}</div>
                    <div className="text-xs text-muted-foreground">{row.sessionCount} 回</div>
                  </div>
                  <div
                    className={`font-mono font-semibold tabular-nums ${
                      row.total > 0
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : row.total < 0
                          ? 'text-rose-600 dark:text-rose-400'
                          : ''
                    }`}
                  >
                    {row.total > 0 ? '+' : ''}
                    {row.total.toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sessions */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground mb-1 flex items-center gap-1.5">
          <Calendar className="h-4 w-4" />
          セッション履歴
        </h2>
        {state.sessions.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center">
              <p className="text-sm text-muted-foreground">まだセッションがありません</p>
              <Button
                size="sm"
                variant="outline"
                className="mt-3"
                onClick={() => setSessionDialog({ open: true, editing: null })}
              >
                <Plus className="h-4 w-4 mr-1" />
                最初のセッションを追加
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {state.sessions.map((s) => (
              <Card key={s.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <div className="font-semibold text-sm">{formatDate(s.date)}</div>
                      {s.note && (
                        <p className="text-xs text-muted-foreground mt-0.5">{s.note}</p>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setSessionDialog({ open: true, editing: s })}
                        aria-label="編集"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => handleDeleteSession(s.id)}
                        aria-label="削除"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[...s.participants]
                      .sort((a, b) => b.score - a.score)
                      .map((p) => (
                        <div
                          key={p.id}
                          className="rounded-md border px-2 py-1.5 text-xs flex items-center justify-between gap-2"
                        >
                          <span className="truncate">{p.name}</span>
                          <span
                            className={`font-mono font-semibold tabular-nums ${
                              p.score > 0
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : p.score < 0
                                  ? 'text-rose-600 dark:text-rose-400'
                                  : ''
                            }`}
                          >
                            {p.score > 0 ? '+' : ''}
                            {p.score.toLocaleString()}
                          </span>
                        </div>
                      ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <SessionFormDialog
        open={sessionDialog.open}
        onOpenChange={(open) => setSessionDialog({ open, editing: open ? sessionDialog.editing : null })}
        members={state.group.members}
        existing={sessionDialog.editing}
        onSubmit={async (input) => {
          if (sessionDialog.editing) {
            await handleUpdateSession(sessionDialog.editing.id, input);
          } else {
            await handleAddSession(input);
          }
        }}
      />

      {canShare && (
        <ShareDialog
          open={shareOpen}
          onOpenChange={setShareOpen}
          shareCode={shareCode}
          groupName={state.group.name}
        />
      )}
    </div>
  );
}

function formatDate(iso: string): string {
  // Expect YYYY-MM-DD; render as YYYY/MM/DD with weekday.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const d = new Date(`${iso}T00:00:00`);
  const weekday = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()];
  return `${m[1]}/${m[2]}/${m[3]} (${weekday})`;
}
