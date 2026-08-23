'use client';

import { useMemo, type CSSProperties } from 'react';
import {
  CalendarDays,
  CircleAlert,
  Layers3,
  ShieldCheck,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import PageIntro from '@/components/common/PageIntro';
import { summarizeGrowthItems } from '@/lib/publicMemory/presentation';
import type { PublicMemoryResult } from '@/lib/publicMemory/schema';
import styles from './growth-page.module.css';

interface GrowthPageProps {
  result: PublicMemoryResult;
}

const CATEGORY_ACCENTS = ['#d97706', '#0f766e', '#7c3aed', '#2563eb', '#be123c', '#15803d'];

function categoryStyle(index: number, percentage: number): CSSProperties {
  return {
    '--growth-category-accent': CATEGORY_ACCENTS[index % CATEGORY_ACCENTS.length],
    '--growth-category-size': `${percentage}%`,
  } as CSSProperties;
}

export default function GrowthPage({ result }: GrowthPageProps) {
  const { t, i18n } = useTranslation();
  const language = i18n.language?.startsWith('ja') ? 'ja-JP' : 'en-US';

  const summary = useMemo(() => {
    return summarizeGrowthItems(result.status === 'ready' ? result.items : []);
  }, [result]);

  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(language, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    }),
    [language],
  );

  const meta = result.status === 'ready' ? (
    <div className={styles.stats} aria-label={t('growthPage.stats.label')}>
      <span><Sparkles size={14} aria-hidden="true" />{t('growthPage.stats.moments', { count: result.items.length })}</span>
      <span><Layers3 size={14} aria-hidden="true" />{t('growthPage.stats.themes', { count: summary.categories.length })}</span>
      {summary.firstYear ? <span><CalendarDays size={14} aria-hidden="true" />{t('growthPage.stats.since', { year: summary.firstYear })}</span> : null}
    </div>
  ) : undefined;

  return (
    <main className={styles.page}>
      <section className={styles.shell}>
        <PageIntro
          kicker={t('growthPage.kicker')}
          title={t('growthPage.title')}
          subtitle={t('growthPage.subtitle')}
          accent="#d97706"
          meta={meta}
        >
          <div className={styles.publicNote}>
            <ShieldCheck size={17} aria-hidden="true" />
            <span>{t('growthPage.publicNote')}</span>
          </div>
        </PageIntro>

        {result.status === 'unavailable' ? (
          <section className={styles.state} aria-labelledby="growth-error-title">
            <CircleAlert size={28} aria-hidden="true" />
            <h2 id="growth-error-title">{t('growthPage.error.title')}</h2>
            <p>{t('growthPage.error.text')}</p>
          </section>
        ) : null}

        {result.status === 'empty' ? (
          <section className={styles.state} aria-labelledby="growth-empty-title">
            <TrendingUp size={28} aria-hidden="true" />
            <h2 id="growth-empty-title">{t('growthPage.empty.title')}</h2>
            <p>{t('growthPage.empty.text')}</p>
          </section>
        ) : null}

        {result.status === 'ready' ? (
          <div className={styles.content}>
            <aside className={styles.overview} aria-labelledby="growth-themes-title">
              <div className={styles.sectionHeading}>
                <span>{t('growthPage.themes.kicker')}</span>
                <h2 id="growth-themes-title">{t('growthPage.themes.title')}</h2>
                <p>{t('growthPage.themes.text')}</p>
              </div>

              <div className={styles.categoryList}>
                {summary.categories.map((category, index) => (
                  <div
                    className={styles.category}
                    key={category.name}
                    style={categoryStyle(index, category.percentage)}
                  >
                    <div className={styles.categoryLabel}>
                      <span>{category.name}</span>
                      <strong>{category.count}</strong>
                    </div>
                    <div className={styles.categoryTrack} aria-hidden="true">
                      <span />
                    </div>
                  </div>
                ))}
              </div>
            </aside>

            <section className={styles.timelineSection} aria-labelledby="growth-timeline-title">
              <div className={styles.sectionHeading}>
                <span>{t('growthPage.timeline.kicker')}</span>
                <h2 id="growth-timeline-title">{t('growthPage.timeline.title')}</h2>
                <p>{t('growthPage.timeline.text')}</p>
              </div>

              <ol className={styles.timeline}>
                {result.items.map((item, index) => (
                  <li className={styles.timelineItem} key={item.id}>
                    <div
                      className={styles.marker}
                      style={{ '--growth-item-accent': CATEGORY_ACCENTS[index % CATEGORY_ACCENTS.length] } as CSSProperties}
                      aria-hidden="true"
                    />
                    <article className={styles.card}>
                      <div className={styles.cardMeta}>
                        <time dateTime={item.occurredAt}>{dateFormatter.format(new Date(item.occurredAt))}</time>
                        <span>{item.category}</span>
                      </div>
                      <h3>{item.title}</h3>
                      <p>{item.summary}</p>
                      {item.tags.length > 0 ? (
                        <ul className={styles.tags} aria-label={t('growthPage.timeline.tags')}>
                          {item.tags.map((tag) => <li key={tag}>{tag}</li>)}
                        </ul>
                      ) : null}
                    </article>
                  </li>
                ))}
              </ol>
            </section>
          </div>
        ) : null}
      </section>
    </main>
  );
}
