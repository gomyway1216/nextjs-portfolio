'use client';

import { ArrowUpRight, CalendarClock, Layers, Sparkles, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import styles from './CommunityLeadership.module.css';

// Maps to home.community.highlights.* — order is the rendered card order.
const highlights = [
  { key: 'organize', Icon: CalendarClock },
  { key: 'platform', Icon: Layers },
  { key: 'curate', Icon: Sparkles },
  { key: 'bridge', Icon: Users },
] as const;

const metrics = ['cadence', 'platform', 'network'] as const;

const COMMUNITY_URL = 'https://bayarea-ai.com';

export default function CommunityLeadership() {
  const { t, i18n } = useTranslation();
  // Send English readers to the English site and JA readers to the JA site.
  const lang = i18n.language === 'ja' ? 'ja' : 'en';
  const communityHref = `${COMMUNITY_URL}/${lang}`;

  return (
    <section id="community" className={styles.section}>
      <div className={styles.inner}>
        <div className={styles.header}>
          <span className={styles.eyebrow}>{t('home.community.eyebrow')}</span>
          <h2>{t('home.community.title')}</h2>
          <p className={styles.role}>{t('home.community.role')}</p>
          <p>{t('home.community.subtitle')}</p>
        </div>

        <ul className={styles.metrics} aria-label={t('home.community.metricsLabel')}>
          {metrics.map((metric) => (
            <li className={styles.metric} key={metric}>
              <strong>{t(`home.community.metrics.${metric}.value`)}</strong>
              <span>{t(`home.community.metrics.${metric}.label`)}</span>
            </li>
          ))}
        </ul>

        <div className={styles.grid}>
          {highlights.map(({ key, Icon }) => (
            <article className={styles.card} key={key}>
              <div className={styles.icon} aria-hidden="true">
                <Icon size={22} strokeWidth={2} />
              </div>
              <div>
                <h3>{t(`home.community.highlights.${key}.title`)}</h3>
                <p>{t(`home.community.highlights.${key}.description`)}</p>
              </div>
            </article>
          ))}
        </div>

        <div className={styles.actions}>
          <a
            className={styles.cta}
            href={communityHref}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t('home.community.cta')}
            <ArrowUpRight size={18} aria-hidden="true" />
          </a>
          <p className={styles.note}>{t('home.community.note')}</p>
        </div>
      </div>
    </section>
  );
}
