'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { ScoreGroupMember, ScoreSession } from '@/types/scoreTracker';

interface ParticipantRow {
  id: string;
  /** Member id from the group, or '' if this row is a guest (free-text name). */
  memberId: string;
  name: string;
  scoreText: string;
}

export interface SessionFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members: ScoreGroupMember[];
  /** When provided, the dialog opens in edit mode. */
  existing?: ScoreSession | null;
  onSubmit: (input: {
    date: string;
    note: string;
    participants: { id?: string; name: string; memberId?: string; score: number }[];
  }) => Promise<void>;
}

function todayLocalIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function rowFromMember(m: ScoreGroupMember): ParticipantRow {
  return { id: crypto.randomUUID(), memberId: m.id, name: m.name, scoreText: '' };
}

function emptyGuestRow(): ParticipantRow {
  return { id: crypto.randomUUID(), memberId: '', name: '', scoreText: '' };
}

export function SessionFormDialog({
  open,
  onOpenChange,
  members,
  existing,
  onSubmit,
}: SessionFormDialogProps) {
  const [date, setDate] = useState(todayLocalIso());
  const [note, setNote] = useState('');
  const [rows, setRows] = useState<ParticipantRow[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset / seed when the dialog opens. Keep dependencies minimal so reopening
  // for a different existing session refreshes correctly.
  useEffect(() => {
    if (!open) return;
    if (existing) {
      setDate(existing.date);
      setNote(existing.note || '');
      setRows(
        existing.participants.map((p) => ({
          id: p.id,
          memberId: p.memberId || '',
          name: p.name,
          scoreText: String(p.score),
        })),
      );
    } else {
      setDate(todayLocalIso());
      setNote('');
      // Seed with all current members so the common case (everyone played) is one-click.
      const seeded = members.map(rowFromMember);
      setRows(seeded.length >= 2 ? seeded : [...seeded, emptyGuestRow(), emptyGuestRow()].slice(0, 4));
    }
    setError(null);
  }, [open, existing, members]);

  const memberOptions = useMemo(
    () => members.filter((m) => !rows.some((r) => r.memberId === m.id)),
    [members, rows],
  );

  function setRow(id: string, patch: Partial<ParticipantRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function addRow(memberId?: string) {
    if (memberId) {
      const m = members.find((x) => x.id === memberId);
      if (m) setRows((prev) => [...prev, rowFromMember(m)]);
    } else {
      setRows((prev) => [...prev, emptyGuestRow()]);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validRows = rows.filter((r) => r.name.trim() && r.scoreText.trim() !== '');
    if (validRows.length < 2) {
      setError('2人以上のプレイヤーが必要です');
      return;
    }
    for (const r of validRows) {
      if (Number.isNaN(Number(r.scoreText))) {
        setError(`「${r.name}」の点数が数値ではありません`);
        return;
      }
    }
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit({
        date,
        note: note.trim(),
        participants: validRows.map((r) => ({
          id: existing ? r.id : undefined,
          name: r.name.trim(),
          memberId: r.memberId || undefined,
          score: Number(r.scoreText),
        })),
      });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存に失敗しました');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{existing ? 'セッションを編集' : 'セッションを追加'}</DialogTitle>
            <DialogDescription>
              日付・参加者・各自の最終点（素点）を入力します。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <Label htmlFor="session-date">日付</Label>
              <Input
                id="session-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label>参加者と点数</Label>
              <div className="space-y-2">
                {rows.map((row) => {
                  const isMember = !!row.memberId;
                  return (
                    <div key={row.id} className="flex gap-2 items-center">
                      {isMember ? (
                        <div className="flex-1 px-3 py-2 text-sm rounded-md border bg-muted/30 truncate">
                          {row.name}
                        </div>
                      ) : (
                        <Input
                          className="flex-1"
                          value={row.name}
                          onChange={(e) => setRow(row.id, { name: e.target.value })}
                          placeholder="ゲスト名"
                        />
                      )}
                      <Input
                        className="w-28"
                        type="number"
                        inputMode="numeric"
                        value={row.scoreText}
                        onChange={(e) => setRow(row.id, { scoreText: e.target.value })}
                        placeholder="点数"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => setRows((prev) => prev.filter((r) => r.id !== row.id))}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                {memberOptions.map((m) => (
                  <Button
                    key={m.id}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => addRow(m.id)}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    {m.name}
                  </Button>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={() => addRow()}>
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  ゲスト
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="session-note">メモ（任意）</Label>
              <Textarea
                id="session-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="例: 場所、ハイライト"
                rows={2}
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              キャンセル
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {existing ? '更新' : '追加'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
