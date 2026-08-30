'use client';

import { useMemo, useState } from 'react';
import {
  BookOpenText,
  CalendarClock,
  ChevronRight,
  Eye,
  RefreshCw,
  Search,
  ShieldCheck,
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
import MemoryDashboardNav from './MemoryDashboardNav';
import styles from './PrivateMemoryDashboard.module.css';

interface PrivateMemoryDashboardProps {
  items: PrivateMemoryIndexItem[];
  publicMemoryIds: string[];
  unavailable: boolean;
}

type CategoryFilter = 'all' | PublicMemoryCategory;
type SensitivityFilter = 'all' | PrivateMemorySensitivity;
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
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [sensitivity, setSensitivity] = useState<SensitivityFilter>('all');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [history, setHistory] = useState<PrivateMemoryRevision[]>([]);
  const [detailState, setDetailState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');

  const publicSet = useMemo(() => new Set(publicMemoryIds), [publicMemoryIds]);
  const categoryCounts = useMemo(() => countPrivateMemoryCategories(items), [items]);
  const sorted = useMemo(() => [...items].sort((left, right) =>
    Date.parse(right.updatedAt) - Date.parse(left.updatedAt) || left.title.localeCompare(right.title)), [items]);
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
  const recentAccessed = useMemo(() => items
    .filter((item) => item.lastAccessedAt)
    .sort((left, right) => Date.parse(right.lastAccessedAt!) - Date.parse(left.lastAccessedAt!))
    .slice(0, 6), [items]);
  const publishedCount = items.filter((item) => publicSet.has(item.id)).length;
  const revisionCount = items.reduce((total, item) => total + item.revision, 0);
  const selected = history[0];

  async function selectMemory(memoryId: string) {
    setSelectedId(memoryId);
    setDetailState('loading');
    setHistory([]);
    try {
      const response = await fetch(`/api/admin/memory-history?memoryId=${encodeURIComponent(memoryId)}`, {
        cache: 'no-store',
        credentials: 'same-origin',
      });
      if (!response.ok) throw new Error('history unavailable');
      const parsed = parsePrivateMemoryHistoryResponse(await response.json(), memoryId);
      if (parsed.length === 0) throw new Error('history empty');
      setHistory(parsed);
      setDetailState('ready');
    } catch {
      setDetailState('error');
    }
  }

  function resetResultWindow() {
    setVisibleCount(PAGE_SIZE);
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
          meta={!unavailable && items.length > 0 ? (
            <div className={styles.stats} aria-label={t('privateMemoryPage.statsLabel')}>
              <span>{t('privateMemoryPage.memoryCount', { count: items.length })}</span>
              <span>{t('privateMemoryPage.revisionCount', { count: revisionCount })}</span>
              <span>{t('privateMemoryPage.publishedCount', { count: publishedCount })}</span>
            </div>
          ) : null}
        />

        <div className={styles.privacyNote}>
          <ShieldCheck size={18} aria-hidden="true" />
          <p><strong>{t('privateMemoryPage.privacyTitle')}</strong> {t('privateMemoryPage.privacyText')}</p>
        </div>

        {unavailable ? (
          <div className={styles.statusPanel} role="status">
            <h2>{t('privateMemoryPage.unavailableTitle')}</h2>
            <p>{t('privateMemoryPage.unavailableText')}</p>
          </div>
        ) : null}

        {!unavailable && items.length === 0 ? (
          <div className={styles.statusPanel} role="status">
            <h2>{t('privateMemoryPage.emptyTitle')}</h2>
            <p>{t('privateMemoryPage.emptyText')}</p>
          </div>
        ) : null}

        {!unavailable && items.length > 0 ? (
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
                      <h3>{selected.snapshot.title}</h3>
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
      </section>
    </main>
  );
}

const PRIVATE_SENSITIVITIES: PrivateMemorySensitivity[] = ['normal', 'sensitive', 'restricted'];
