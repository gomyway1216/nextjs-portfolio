'use client';

import { CSSProperties, useState } from 'react';
import { Plus, Pencil, Trash2, ExternalLink, Eye, EyeOff } from 'lucide-react';
import { useWritings, useWritingMutations } from '@/hooks/useWriting';
import type { WritingInput } from '@/services/writingService';
import type { Writing } from '@/lib/writing';

const EMPTY: WritingInput = {
  title: '',
  source: '',
  url: '',
  date: '',
  summaryEn: '',
  summaryJa: '',
  isPublic: true,
  order: 0,
};

const s: Record<string, CSSProperties> = {
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', gap: '16px', flexWrap: 'wrap' },
  title: { fontSize: '22px', fontWeight: 600, color: 'var(--admin-text)', margin: 0 },
  subtitle: { color: 'var(--admin-text-muted)', fontSize: '14px', margin: '4px 0 0' },
  primaryBtn: { display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 16px', borderRadius: '8px', border: '1px solid var(--admin-accent)', background: 'var(--admin-accent)', color: 'var(--admin-primary-text)', fontWeight: 500, cursor: 'pointer' },
  card: { border: '1px solid var(--admin-border)', borderRadius: '8px', background: 'var(--admin-surface)', boxShadow: 'var(--admin-shadow-surface)', overflow: 'hidden' },
  empty: { padding: '24px', color: 'var(--admin-text-muted)', fontSize: '14px', lineHeight: 1.6 },
  row: { display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto auto auto', gap: '12px', alignItems: 'center', padding: '14px 18px', borderTop: '1px solid var(--admin-border)' },
  rowTitle: { color: 'var(--admin-text)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  rowMeta: { color: 'var(--admin-text-subtle)', fontSize: '13px', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  badge: { display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12px', padding: '3px 9px', borderRadius: '999px' },
  iconBtn: { display: 'inline-flex', padding: '7px', borderRadius: '8px', border: '1px solid var(--admin-border-strong)', background: 'var(--admin-surface-raised)', color: 'var(--admin-text-muted)', cursor: 'pointer' },
  form: { display: 'grid', gap: '14px', padding: '20px', border: '1px solid var(--admin-accent-border)', borderRadius: '8px', background: 'var(--admin-accent-soft)', marginBottom: '20px' },
  label: { display: 'block', fontSize: '13px', color: 'var(--admin-text-muted)', marginBottom: '6px', fontWeight: 500 },
  input: { width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--admin-border-strong)', background: 'var(--admin-surface-raised)', color: 'var(--admin-text)', fontSize: '14px', boxSizing: 'border-box' },
  twoCol: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px' },
  formActions: { display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '4px' },
  ghostBtn: { padding: '10px 16px', borderRadius: '8px', border: '1px solid var(--admin-border-strong)', background: 'var(--admin-surface-raised)', color: 'var(--admin-text)', fontWeight: 500, cursor: 'pointer' },
  error: { color: 'var(--admin-danger-text)', fontSize: '13px', margin: 0 },
  checkboxRow: { display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--admin-text-soft)', fontSize: '14px' },
};

const disabledActionStyle = (disabled: boolean): CSSProperties => ({
  opacity: disabled ? 0.5 : 1,
  cursor: disabled ? 'not-allowed' : 'pointer',
});

export default function PublishedWritingAdminPanel() {
  const { writings, loading, refetch } = useWritings();
  const { createWriting, updateWriting, deleteWriting, loading: saving } = useWritingMutations();

  // null = form closed, 'new' = create, otherwise the id being edited.
  const [mode, setMode] = useState<null | 'new' | string>(null);
  const [form, setForm] = useState<WritingInput>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const openCreate = () => { setForm(EMPTY); setMode('new'); setError(null); };
  const openEdit = (w: Writing) => {
    setForm({
      // <input type="date"> needs YYYY-MM-DD, but stored dates are full ISO.
      title: w.title, source: w.source, url: w.url, date: w.date ? w.date.slice(0, 10) : '',
      summaryEn: w.summaryEn, summaryJa: w.summaryJa, isPublic: w.isPublic, order: w.order,
    });
    setMode(w.id);
    setError(null);
  };
  const close = () => { setMode(null); setForm(EMPTY); setError(null); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title?.trim() || !form.source?.trim() || !form.url?.trim()) {
      setError('Title, source and URL are required.');
      return;
    }
    const payload: WritingInput = {
      ...form,
      date: form.date?.trim() ? form.date : undefined,
      order: Number(form.order) || 0,
    };
    try {
      if (mode === 'new') await createWriting(payload);
      else if (mode) await updateWriting(mode, payload);
      close();
      refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteWriting(id);
      setConfirmId(null);
      refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  const set = <K extends keyof WritingInput>(key: K, value: WritingInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  return (
    <div>
      <div style={s.header}>
        <div>
          <h2 style={s.title}>Published Writing</h2>
          <p style={s.subtitle}>External articles surfaced in the home &ldquo;Published Writing&rdquo; section.</p>
        </div>
        {mode === null && (
          <button type="button" style={s.primaryBtn} onClick={openCreate}>
            <Plus size={16} /> New entry
          </button>
        )}
      </div>

      {/* Panel-level so create/edit/delete errors are all visible, including
          when the table (no form) is showing. */}
      {error && <p style={{ ...s.error, marginBottom: '14px' }}>{error}</p>}

      {mode !== null && (
        <form style={s.form} onSubmit={handleSubmit}>
          <div style={s.twoCol}>
            <div>
              <label style={s.label}>Title *</label>
              <input style={s.input} value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="Why Financial Products Need Explainable States" />
            </div>
            <div>
              <label style={s.label}>Source / publisher *</label>
              <input style={s.input} value={form.source} onChange={(e) => set('source', e.target.value)} placeholder="Atlas Engineering" />
            </div>
          </div>

          <div>
            <label style={s.label}>URL *</label>
            <input style={s.input} value={form.url} onChange={(e) => set('url', e.target.value)} placeholder="https://www.atlasfin.com/post/..." />
          </div>

          <div style={s.twoCol}>
            <div>
              <label style={s.label}>Publish date</label>
              <input style={s.input} type="date" value={form.date} onChange={(e) => set('date', e.target.value)} />
            </div>
            <div>
              <label style={s.label}>Order (lower first)</label>
              <input style={s.input} type="number" value={String(form.order ?? 0)} onChange={(e) => set('order', Number(e.target.value))} />
            </div>
          </div>

          <div>
            <label style={s.label}>Summary (English)</label>
            <textarea style={{ ...s.input, minHeight: '64px', resize: 'vertical' }} value={form.summaryEn} onChange={(e) => set('summaryEn', e.target.value)} />
          </div>
          <div>
            <label style={s.label}>Summary (日本語)</label>
            <textarea style={{ ...s.input, minHeight: '64px', resize: 'vertical' }} value={form.summaryJa} onChange={(e) => set('summaryJa', e.target.value)} />
          </div>

          <label style={s.checkboxRow}>
            <input type="checkbox" checked={form.isPublic} onChange={(e) => set('isPublic', e.target.checked)} />
            Visible on the site
          </label>

          <div style={s.formActions}>
            <button type="button" style={s.ghostBtn} onClick={close} disabled={saving}>Cancel</button>
            <button type="submit" style={s.primaryBtn} disabled={saving}>{saving ? 'Saving…' : mode === 'new' ? 'Create' : 'Save'}</button>
          </div>
        </form>
      )}

      <div style={s.card}>
        {loading ? (
          <div style={s.empty}>Loading…</div>
        ) : writings.length === 0 ? (
          <div style={s.empty}>
            No entries yet. Add one here to show the Published Writing section on the public site.
          </div>
        ) : (
          writings.map((w) => (
            <div style={s.row} key={w.id}>
              <div style={{ minWidth: 0 }}>
                <div style={s.rowTitle}>{w.title}</div>
                <div style={s.rowMeta}>
                  {w.source}{w.date ? ` · ${w.date.slice(0, 10)}` : ''}
                </div>
              </div>
              <span style={{
                ...s.badge,
                background: w.isPublic ? 'var(--admin-success-soft)' : 'var(--admin-surface-muted)',
                border: `1px solid ${w.isPublic ? 'var(--admin-success-border)' : 'var(--admin-border)'}`,
                color: w.isPublic ? 'var(--admin-success)' : 'var(--admin-text-muted)',
              }}>
                {w.isPublic ? <Eye size={13} /> : <EyeOff size={13} />}{w.isPublic ? 'Visible' : 'Hidden'}
              </span>
              <a style={s.iconBtn} href={w.url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${w.title}`}>
                <ExternalLink size={15} />
              </a>
              {confirmId === w.id ? (
                <span style={{ display: 'inline-flex', gap: '6px' }}>
                  <button
                    type="button"
                    disabled={saving}
                    style={{
                      ...s.iconBtn,
                      color: 'var(--admin-danger-text)',
                      borderColor: 'var(--admin-danger-border)',
                      background: 'var(--admin-danger-soft)',
                      ...disabledActionStyle(saving),
                    }}
                    onClick={() => handleDelete(w.id)}
                  >
                    Yes
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    style={{ ...s.iconBtn, ...disabledActionStyle(saving) }}
                    onClick={() => setConfirmId(null)}
                  >
                    No
                  </button>
                </span>
              ) : (
                <span style={{ display: 'inline-flex', gap: '6px' }}>
                  <button
                    type="button"
                    disabled={saving}
                    style={{ ...s.iconBtn, ...disabledActionStyle(saving) }}
                    onClick={() => openEdit(w)}
                    aria-label={`Edit ${w.title}`}
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    style={{ ...s.iconBtn, color: 'var(--admin-danger-text)', ...disabledActionStyle(saving) }}
                    onClick={() => setConfirmId(w.id)}
                    aria-label={`Delete ${w.title}`}
                  >
                    <Trash2 size={15} />
                  </button>
                </span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
