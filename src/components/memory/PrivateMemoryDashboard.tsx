'use client';

import { useMemo, useRef, useState } from 'react';
import {
  BookOpenText,
  CalendarClock,
  ChevronRight,
  Eye,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import PageIntro from '@/components/common/PageIntro';
import {
  countPrivateMemoryCategories,
  parsePrivateMemoryHistoryResponse,
  type PrivateMemoryIndexItem,
  type PrivateMemoryRevision,
  type PrivateMemorySensitivity,
} from '@/lib/memory/privateMemory';
import type { PublicMemoryCategory } from '@/lib/memory/publicMemory';
import {
  isExactMemoryDeleteConfirmation,
  parsePrivateMemoryDeleteResponse,
} from '@/lib/memory/privateMemoryDeletion';
import MemoryDashboardNav from './MemoryDashboardNav';
import styles from './PrivateMemoryDashboard.module.css';

interface PrivateMemoryDashboardProps {
  items: PrivateMemoryIndexItem[];
  publicMemoryIds: string[];
  unavailable: boolean;
}

type CategoryFilter = 'all' | PublicMemoryCategory;
type SensitivityFilter = 'all' | PrivateMemorySensitivity;
interface DeleteTarget {
  id: string;
  title: string;
  revision: number;
  hasPublicProjection: boolean;
}
const PAGE_SIZE = 50;

function displayDate(value: string | undefined, language: string, fallback: string): string {
  if (!value) return fallback;
  return new Intl.DateTimeFormat(language.startsWith('ja') ? 'ja-JP' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export default function PrivateMemoryDashboard({
  items,
  publicMemoryIds,
  unavailable,
}: PrivateMemoryDashboardProps) {
  const { t, i18n } = useTranslation();
  const [memories, setMemories] = useState(items);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [sensitivity, setSensitivity] = useState<SensitivityFilter>('all');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [history, setHistory] = useState<PrivateMemoryRevision[]>([]);
  const [detailState, setDetailState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [deleteState, setDeleteState] = useState<'idle' | 'deleting' | 'error'>('idle');
  const [deleteNotice, setDeleteNotice] = useState<string | null>(null);
  const detailRequestSequence = useRef(0);

  const publicSet = useMemo(() => new Set(publicMemoryIds), [publicMemoryIds]);
  const categoryCounts = useMemo(() => countPrivateMemoryCategories(memories), [memories]);
  const sorted = useMemo(() => [...memories].sort((left, right) =>
    Date.parse(right.updatedAt) - Date.parse(left.updatedAt) || left.title.localeCompare(right.title)), [memories]);
  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().normalize('NFKC').toLowerCase();
    return sorted.filter((item) => {
      if (category !== 'all' && item.category !== category) return false;
      if (sensitivity !== 'all' && item.sensitivity !== sensitivity) return false;
      if (!normalizedQuery) return true;
      return [item.title, item.indexSummary ?? '', ...item.tags]
        .join('\n').normalize('NFKC').toLowerCase().includes(normalizedQuery);
    });
  }, [category, query, sensitivity, sorted]);
  const recentUpdated = sorted.slice(0, 6);
  const recentAccessed = useMemo(() => memories
    .filter((item) => item.lastAccessedAt)
    .sort((left, right) => Date.parse(right.lastAccessedAt!) - Date.parse(left.lastAccessedAt!))
    .slice(0, 6), [memories]);
  const publishedCount = memories.filter((item) => publicSet.has(item.id)).length;
  const revisionCount = memories.reduce((total, item) => total + item.revision, 0);
  const selected = history[0];

  async function selectMemory(memoryId: string) {
    const requestSequence = ++detailRequestSequence.current;
    setSelectedId(memoryId);
    setDetailState('loading');
    setHistory([]);
    try {
      const response = await fetch(`/api/admin/memory-history?memoryId=${encodeURIComponent(memoryId)}`, {
        cache: 'no-store',
        credentials: 'same-origin',
      });
      if (!response.ok) throw new Error('history unavailable');
      const parsed = parsePrivateMemoryHistoryResponse(await response.json(), memoryId)
        .sort((left, right) => right.revision - left.revision
          || Date.parse(right.committedAt) - Date.parse(left.committedAt));
      if (parsed.length === 0) throw new Error('history empty');
      if (requestSequence !== detailRequestSequence.current) return;
      setHistory(parsed);
      setDetailState('ready');
    } catch {
      if (requestSequence !== detailRequestSequence.current) return;
      setDetailState('error');
    }
  }

  function resetResultWindow() {
    setVisibleCount(PAGE_SIZE);
  }

  function openDeleteDialog() {
    if (!selected) return;
    setDeleteTarget({
      id: selected.memoryId,
      title: selected.snapshot.title,
      revision: selected.revision,
      hasPublicProjection: publicSet.has(selected.memoryId),
    });
    setDeleteConfirmation('');
    setDeleteState('idle');
  }

  function closeDeleteDialog() {
    if (deleteState === 'deleting') return;
    setDeleteTarget(null);
    setDeleteConfirmation('');
    setDeleteState('idle');
  }

  async function deleteMemory() {
    if (!deleteTarget || !isExactMemoryDeleteConfirmation(deleteConfirmation, deleteTarget.title)) return;
    setDeleteState('deleting');
    try {
      const response = await fetch('/api/admin/memory-record', {
        method: 'DELETE',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          memoryId: deleteTarget.id,
          expectedRevision: deleteTarget.revision,
          confirmationTitle: deleteConfirmation,
          confirmed: true,
        }),
      });
      if (!response.ok) throw new Error(response.status === 409 ? 'stale' : 'unavailable');
      parsePrivateMemoryDeleteResponse(await response.json(), deleteTarget.id);
      detailRequestSequence.current += 1;
      setMemories((current) => current.filter((item) => item.id !== deleteTarget.id));
      setSelectedId(null);
      setHistory([]);
      setDetailState('idle');
      setDeleteTarget(null);
      setDeleteConfirmation('');
      setDeleteState('idle');
      setDeleteNotice(t('privateMemoryPage.deleteSuccess', {title: deleteTarget.title}));
    } catch (error) {
      setDeleteState('error');
      setDeleteNotice(null);
      if (error instanceof Error && error.message === 'stale') return;
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.shell}>
        <MemoryDashboardNav active="private" />
        <PageIntro
          kicker={t('privateMemoryPage.kicker')}
          title={t('privateMemoryPage.title')}
          subtitle={t('privateMemoryPage.subtitle')}
          accent="#7c3aed"
          meta={!unavailable && memories.length > 0 ? (
            <div className={styles.stats} aria-label={t('privateMemoryPage.statsLabel')}>
              <span>{t('privateMemoryPage.memoryCount', { count: memories.length })}</span>
              <span>{t('privateMemoryPage.revisionCount', { count: revisionCount })}</span>
              <span>{t('privateMemoryPage.publishedCount', { count: publishedCount })}</span>
            </div>
          ) : null}
        />

        <div className={styles.privacyNote}>
          <ShieldCheck size={18} aria-hidden="true" />
          <p><strong>{t('privateMemoryPage.privacyTitle')}</strong> {t('privateMemoryPage.privacyText')}</p>
        </div>

        {deleteNotice ? <p className={styles.deleteNotice} role="status">{deleteNotice}</p> : null}

        {unavailable ? (
          <div className={styles.statusPanel} role="status">
            <h2>{t('privateMemoryPage.unavailableTitle')}</h2>
            <p>{t('privateMemoryPage.unavailableText')}</p>
          </div>
        ) : null}

        {!unavailable && memories.length === 0 ? (
          <div className={styles.statusPanel} role="status">
            <h2>{t('privateMemoryPage.emptyTitle')}</h2>
            <p>{t('privateMemoryPage.emptyText')}</p>
          </div>
        ) : null}

        {!unavailable && memories.length > 0 ? (
          <>
            <section className={styles.activityGrid} aria-label={t('privateMemoryPage.activityTitle')}>
              <article className={styles.panel}>
                <div className={styles.panelHeading}>
                  <div><RefreshCw size={16} /><h2>{t('privateMemoryPage.recentUpdates')}</h2></div>
                  <span>{t('privateMemoryPage.currentState')}</span>
                </div>
                <ol className={styles.activityList}>
                  {recentUpdated.map((item) => (
                    <li key={item.id}>
                      <button type="button" onClick={() => selectMemory(item.id)}>
                        <span>{item.title}</span>
                        <time dateTime={item.updatedAt}>{displayDate(item.updatedAt, i18n.language, '')}</time>
                      </button>
                    </li>
                  ))}
                </ol>
              </article>
              <article className={styles.panel}>
                <div className={styles.panelHeading}>
                  <div><Eye size={16} /><h2>{t('privateMemoryPage.recentAccesses')}</h2></div>
                  <span>{t('privateMemoryPage.answersUsingMemory')}</span>
                </div>
                {recentAccessed.length > 0 ? (
                  <ol className={styles.activityList}>
                    {recentAccessed.map((item) => (
                      <li key={item.id}>
                        <button type="button" onClick={() => selectMemory(item.id)}>
                          <span>{item.title}</span>
                          <time dateTime={item.lastAccessedAt}>{displayDate(item.lastAccessedAt, i18n.language, '')}</time>
                        </button>
                      </li>
                    ))}
                  </ol>
                ) : <p className={styles.muted}>{t('privateMemoryPage.noAccesses')}</p>}
              </article>
            </section>

            <section className={styles.browserSection} aria-labelledby="private-memory-index-title">
              <div className={styles.sectionHeading}>
                <p>{t('privateMemoryPage.indexKicker')}</p>
                <h2 id="private-memory-index-title">{t('privateMemoryPage.indexTitle')}</h2>
              </div>
              <div className={styles.controls}>
                <label className={styles.searchBox}>
                  <Search size={16} aria-hidden="true" />
                  <span className="sr-only">{t('privateMemoryPage.searchLabel')}</span>
                  <input
                    type="search"
                    value={query}
                    placeholder={t('privateMemoryPage.searchPlaceholder')}
                    onChange={(event) => { setQuery(event.target.value); resetResultWindow(); }}
                  />
                </label>
                <select value={category} onChange={(event) => {
                  setCategory(event.target.value as CategoryFilter); resetResultWindow();
                }} aria-label={t('privateMemoryPage.categoryFilter')}>
                  <option value="all">{t('privateMemoryPage.allCategories')}</option>
                  {categoryCounts.map(({ category: value, count }) => (
                    <option key={value} value={value}>{t(`memoryPage.categories.${value}`)} ({count})</option>
                  ))}
                </select>
                <select value={sensitivity} onChange={(event) => {
                  setSensitivity(event.target.value as SensitivityFilter); resetResultWindow();
                }} aria-label={t('privateMemoryPage.sensitivityFilter')}>
                  <option value="all">{t('privateMemoryPage.allSensitivity')}</option>
                  {PRIVATE_SENSITIVITIES.map((value) => (
                    <option key={value} value={value}>{t(`privateMemoryPage.sensitivities.${value}`)}</option>
                  ))}
                </select>
              </div>

              <div className={styles.browserGrid}>
                <div className={styles.memoryIndex}>
                  <div className={styles.resultHeader}>
                    <strong>{t('privateMemoryPage.resultCount', { count: filtered.length })}</strong>
                    <span>{t('privateMemoryPage.selectForDetails')}</span>
                  </div>
                  <ol>
                    {filtered.slice(0, visibleCount).map((item) => (
                      <li key={item.id}>
                        <button
                          type="button"
                          className={selectedId === item.id ? styles.selectedMemory : undefined}
                          onClick={() => selectMemory(item.id)}
                        >
                          <div className={styles.memoryTitleRow}>
                            <span>{item.title}</span>
                            <ChevronRight size={15} aria-hidden="true" />
                          </div>
                          {item.indexSummary ? <p>{item.indexSummary}</p> : null}
                          <div className={styles.badges}>
                            <span>{t(`memoryPage.categories.${item.category}`)}</span>
                            <span>{t(`privateMemoryPage.sensitivities.${item.sensitivity}`)}</span>
                            <span>rev {item.revision}</span>
                            {publicSet.has(item.id) ? <span className={styles.publicBadge}>{t('privateMemoryPage.public')}</span> : null}
                          </div>
                        </button>
                      </li>
                    ))}
                  </ol>
                  {visibleCount < filtered.length ? (
                    <button className={styles.loadMore} type="button" onClick={() => setVisibleCount((value) => value + PAGE_SIZE)}>
                      {t('privateMemoryPage.loadMore')}
                    </button>
                  ) : null}
                </div>

                <aside className={styles.detailPanel} aria-live="polite">
                  {detailState === 'idle' ? (
                    <div className={styles.detailPlaceholder}>
                      <BookOpenText size={30} aria-hidden="true" />
                      <h3>{t('privateMemoryPage.detailPlaceholderTitle')}</h3>
                      <p>{t('privateMemoryPage.detailPlaceholderText')}</p>
                    </div>
                  ) : null}
                  {detailState === 'loading' ? <p className={styles.detailStatus}>{t('privateMemoryPage.loadingDetail')}</p> : null}
                  {detailState === 'error' ? <p className={styles.detailStatus}>{t('privateMemoryPage.detailError')}</p> : null}
                  {detailState === 'ready' && selected ? (
                    <div className={styles.detailContent}>
                      <div className={styles.detailMeta}>
                        <span>{t(`memoryPage.categories.${selected.snapshot.category}`)}</span>
                        <span>{t(`privateMemoryPage.sensitivities.${selected.snapshot.sensitivity}`)}</span>
                        <span>{selected.snapshot.visibility}</span>
                      </div>
                      <div className={styles.detailTitleRow}>
                        <h3>{selected.snapshot.title}</h3>
                        <button className={styles.deleteButton} type="button" onClick={openDeleteDialog}>
                          <Trash2 size={15} aria-hidden="true" />
                          {t('privateMemoryPage.deleteAction')}
                        </button>
                      </div>
                      <p className={styles.summary}>{selected.snapshot.canonicalSummaryJa}</p>
                      <div className={styles.evidenceBoundary}>
                        <ShieldCheck size={15} aria-hidden="true" />
                        {t('privateMemoryPage.evidenceBoundary')}
                      </div>
                      <div className={styles.historyHeading}>
                        <CalendarClock size={16} aria-hidden="true" />
                        <h4>{t('privateMemoryPage.revisionHistory')}</h4>
                      </div>
                      <ol className={styles.historyList}>
                        {history.map((revision) => (
                          <li key={revision.id}>
                            <strong>rev {revision.revision}</strong>
                            <time dateTime={revision.committedAt}>{displayDate(revision.committedAt, i18n.language, '')}</time>
                            <p>{revision.snapshot.canonicalSummaryJa}</p>
                          </li>
                        ))}
                      </ol>
                    </div>
                  ) : null}
                </aside>
              </div>
            </section>
          </>
        ) : null}

        {deleteTarget ? (
          <div className={styles.dialogBackdrop} onClick={closeDeleteDialog}>
            <section
              className={styles.deleteDialog}
              role="dialog"
              aria-modal="true"
              aria-labelledby="memory-delete-title"
              aria-describedby="memory-delete-description"
              onClick={(event) => event.stopPropagation()}
            >
              <div className={styles.dialogHeading}>
                <div className={styles.warningIcon}><TriangleAlert size={20} aria-hidden="true" /></div>
                <div>
                  <p>{t('privateMemoryPage.deleteKicker')}</p>
                  <h2 id="memory-delete-title">{t('privateMemoryPage.deleteTitle')}</h2>
                </div>
                <button type="button" onClick={closeDeleteDialog} aria-label={t('privateMemoryPage.deleteCancel')}>
                  <X size={18} aria-hidden="true" />
                </button>
              </div>
              <p id="memory-delete-description" className={styles.deleteDescription}>
                {t('privateMemoryPage.deleteDescription')}
              </p>
              {deleteTarget.hasPublicProjection ? (
                <p className={styles.publicDeleteWarning}>{t('privateMemoryPage.deletePublicWarning')}</p>
              ) : null}
              <dl className={styles.deleteTargetMeta}>
                <div><dt>{t('privateMemoryPage.deleteRecord')}</dt><dd>{deleteTarget.title}</dd></div>
                <div><dt>{t('privateMemoryPage.deleteRecordId')}</dt><dd><code>{deleteTarget.id}</code></dd></div>
                <div><dt>{t('privateMemoryPage.deleteRevision')}</dt><dd>{deleteTarget.revision}</dd></div>
              </dl>
              <label className={styles.deleteConfirmationLabel}>
                <span>{t('privateMemoryPage.deleteConfirmationLabel')}</span>
                <strong>{deleteTarget.title}</strong>
                <input
                  autoFocus
                  type="text"
                  value={deleteConfirmation}
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(event) => { setDeleteConfirmation(event.target.value); setDeleteState('idle'); }}
                />
              </label>
              {deleteState === 'error' ? (
                <p className={styles.deleteError} role="alert">{t('privateMemoryPage.deleteError')}</p>
              ) : null}
              <div className={styles.dialogActions}>
                <button type="button" onClick={closeDeleteDialog} disabled={deleteState === 'deleting'}>
                  {t('privateMemoryPage.deleteCancel')}
                </button>
                <button
                  type="button"
                  className={styles.confirmDeleteButton}
                  onClick={deleteMemory}
                  disabled={deleteState === 'deleting' ||
                    !isExactMemoryDeleteConfirmation(deleteConfirmation, deleteTarget.title)}
                >
                  <Trash2 size={15} aria-hidden="true" />
                  {deleteState === 'deleting' ? t('privateMemoryPage.deleting') : t('privateMemoryPage.deleteConfirm')}
                </button>
              </div>
            </section>
          </div>
        ) : null}
      </section>
    </main>
  );
}

const PRIVATE_SENSITIVITIES: PrivateMemorySensitivity[] = ['normal', 'sensitive', 'restricted'];
