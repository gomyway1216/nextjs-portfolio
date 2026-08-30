'use client';

import { useMemo, useState, type CSSProperties } from 'react';
import { CalendarDays, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import PageIntro from '@/components/common/PageIntro';
import {
  buildPublicMemoryConnections,
  countPublicMemoryCategories,
  sortPublicMemories,
  type PublicMemoryCategory,
  type PublicMemoryItem,
} from '@/lib/memory/publicMemory';
import styles from './PublicMemoryAtlas.module.css';
import MemoryDashboardNav from './MemoryDashboardNav';

interface PublicMemoryAtlasProps {
  items: PublicMemoryItem[];
  unavailable: boolean;
}

type CategoryFilter = 'all' | PublicMemoryCategory;

function displayDate(value: string | undefined, language: string, fallback: string): string {
  if (!value) return fallback;
  return new Intl.DateTimeFormat(language.startsWith('ja') ? 'ja-JP' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(value));
}

export default function PublicMemoryAtlas({ items, unavailable }: PublicMemoryAtlasProps) {
  const { t, i18n } = useTranslation();
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>('all');
  const sortedItems = useMemo(() => sortPublicMemories(items), [items]);
  const categoryCounts = useMemo(() => countPublicMemoryCategories(items), [items]);
  const filteredItems = useMemo(
    () => activeCategory === 'all'
      ? sortedItems
      : sortedItems.filter((item) => item.category === activeCategory),
    [activeCategory, sortedItems],
  );
  const connections = useMemo(
    () => buildPublicMemoryConnections(filteredItems).slice(0, 12),
    [filteredItems],
  );
  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const yearCount = useMemo(() => new Set(
    items.flatMap((item) => item.occurredAt ? [new Date(item.occurredAt).getUTCFullYear()] : []),
  ).size, [items]);
  const maxCategoryCount = Math.max(1, ...categoryCounts.map(({ count }) => count));

  return (
    <main className={styles.page}>
      <section className={styles.shell}>
        <MemoryDashboardNav active="public" />
        <PageIntro
          kicker={t('memoryPage.kicker')}
          title={t('memoryPage.title')}
          subtitle={t('memoryPage.subtitle')}
          accent="#0f766e"
          meta={!unavailable && items.length > 0 ? (
            <div className={styles.stats} aria-label={t('memoryPage.statsLabel')}>
              <span>{t('memoryPage.memoryCount', { count: items.length })}</span>
              <span>{t('memoryPage.categoryCount', { count: categoryCounts.length })}</span>
              <span>{t('memoryPage.yearCount', { count: yearCount })}</span>
            </div>
          ) : null}
        />

        <div className={styles.privacyNote}>
          <ShieldCheck size={18} aria-hidden="true" />
          <p><strong>{t('memoryPage.privacyTitle')}</strong> {t('memoryPage.privacyText')}</p>
        </div>

        {unavailable ? (
          <div className={styles.statusPanel} role="status">
            <h2>{t('memoryPage.unavailableTitle')}</h2>
            <p>{t('memoryPage.unavailableText')}</p>
          </div>
        ) : null}

        {!unavailable && items.length === 0 ? (
          <div className={styles.statusPanel} role="status">
            <h2>{t('memoryPage.emptyTitle')}</h2>
            <p>{t('memoryPage.emptyText')}</p>
          </div>
        ) : null}

        {!unavailable && items.length > 0 ? (
          <>
            <section className={styles.overview} aria-labelledby="memory-overview-title">
              <div className={styles.sectionHeading}>
                <p>{t('memoryPage.overviewKicker')}</p>
                <h2 id="memory-overview-title">{t('memoryPage.overviewTitle')}</h2>
              </div>

              <div className={styles.overviewGrid}>
                <article className={styles.panel}>
                  <div className={styles.panelHeading}>
                    <h3>{t('memoryPage.categoryDistribution')}</h3>
                    <span>{t('memoryPage.selectHint')}</span>
                  </div>
                  <div className={styles.categoryBars}>
                    {categoryCounts.map(({ category, count }) => {
                      const isActive = activeCategory === category;
                      const barStyle = {
                        '--memory-bar-width': `${Math.max(8, (count / maxCategoryCount) * 100)}%`,
                      } as CSSProperties;
                      return (
                        <button
                          type="button"
                          key={category}
                          className={isActive ? `${styles.categoryBar} ${styles.categoryBarActive}` : styles.categoryBar}
                          onClick={() => setActiveCategory(isActive ? 'all' : category)}
                          aria-pressed={isActive}
                        >
                          <span className={styles.barLabel}>{t(`memoryPage.categories.${category}`)}</span>
                          <span className={styles.barTrack} aria-hidden="true">
                            <span style={barStyle} />
                          </span>
                          <strong>{count}</strong>
                        </button>
                      );
                    })}
                  </div>
                </article>

                <article className={styles.panel}>
                  <div className={styles.panelHeading}>
                    <h3>{t('memoryPage.connectionsTitle')}</h3>
                    <span>{t('memoryPage.connectionsHint')}</span>
                  </div>
                  {connections.length > 0 ? (
                    <ul className={styles.connectionList}>
                      {connections.map((connection) => {
                        const source = itemById.get(connection.sourceId);
                        const target = itemById.get(connection.targetId);
                        if (!source || !target) return null;
                        return (
                          <li key={`${connection.sourceId}-${connection.targetId}`}>
                            <div className={styles.connectionTitles}>
                              <span>{source.title}</span>
                              <span aria-hidden="true" className={styles.connectionLine} />
                              <span>{target.title}</span>
                            </div>
                            <div className={styles.sharedTags} aria-label={t('memoryPage.sharedTags')}>
                              {connection.sharedTags.map((tag) => <span key={tag}>#{tag}</span>)}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className={styles.noConnections}>{t('memoryPage.noConnections')}</p>
                  )}
                </article>
              </div>
            </section>

            <section className={styles.timelineSection} aria-labelledby="memory-timeline-title">
              <div className={styles.sectionHeadingRow}>
                <div className={styles.sectionHeading}>
                  <p>{t('memoryPage.timelineKicker')}</p>
                  <h2 id="memory-timeline-title">{t('memoryPage.timelineTitle')}</h2>
                </div>
                <span className={styles.resultCount} aria-live="polite">
                  {t('memoryPage.showingCount', { count: filteredItems.length })}
                </span>
              </div>

              <div className={styles.filterBar} aria-label={t('memoryPage.filterLabel')}>
                <button
                  type="button"
                  className={activeCategory === 'all' ? `${styles.filterButton} ${styles.filterButtonActive}` : styles.filterButton}
                  onClick={() => setActiveCategory('all')}
                  aria-pressed={activeCategory === 'all'}
                >
                  {t('memoryPage.all')}
                </button>
                {categoryCounts.map(({ category, count }) => (
                  <button
                    type="button"
                    key={category}
                    className={activeCategory === category ? `${styles.filterButton} ${styles.filterButtonActive}` : styles.filterButton}
                    onClick={() => setActiveCategory(category)}
                    aria-pressed={activeCategory === category}
                  >
                    {t(`memoryPage.categories.${category}`)} <span>{count}</span>
                  </button>
                ))}
              </div>

              <ol className={styles.timeline}>
                {filteredItems.map((item) => (
                  <li key={item.id}>
                    <div className={styles.timelineMarker} aria-hidden="true" />
                    <article className={styles.memoryCard}>
                      <div className={styles.memoryMeta}>
                        <time dateTime={item.occurredAt}>
                          <CalendarDays size={14} aria-hidden="true" />
                          {displayDate(item.occurredAt, i18n.language, t('memoryPage.dateUnknown'))}
                        </time>
                        <span>{t(`memoryPage.categories.${item.category}`)}</span>
                      </div>
                      <h3>{item.title}</h3>
                      <p>{item.summary}</p>
                      {item.tags.length > 0 ? (
                        <div className={styles.tags} aria-label={t('memoryPage.tagsLabel')}>
                          {item.tags.map((tag) => <span key={tag}>#{tag}</span>)}
                        </div>
                      ) : null}
                    </article>
                  </li>
                ))}
              </ol>
            </section>
          </>
        ) : null}
      </section>
    </main>
  );
}
