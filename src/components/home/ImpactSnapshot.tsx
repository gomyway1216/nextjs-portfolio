'use client';

import { CreditCard, LineChart, ShieldCheck, Workflow } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import styles from './ImpactSnapshot.module.css';

const pillars = [
  { key: 'growth', Icon: LineChart },
  { key: 'risk', Icon: ShieldCheck },
  { key: 'payments', Icon: CreditCard },
  { key: 'platforms', Icon: Workflow },
] as const;

const metrics = ['annual', 'platform', 'coverage'] as const;

export default function ImpactSnapshot() {
  const { t } = useTranslation();

  return (
    <section id="impact" className={styles.section}>
      <div className={styles.inner}>
        <div className={styles.header}>
          <span className={styles.eyebrow}>{t('home.impact.eyebrow')}</span>
          <h2>{t('home.impact.title')}</h2>
          <p>{t('home.impact.subtitle')}</p>
        </div>

        <ul className={styles.metrics} aria-label={t('home.impact.metricsLabel')}>
          {metrics.map((metric) => (
            <li className={styles.metric} key={metric}>
              <strong>{t(`home.impact.metrics.${metric}.value`)}</strong>
              <span>{t(`home.impact.metrics.${metric}.label`)}</span>
            </li>
          ))}
        </ul>

        <div className={styles.grid}>
          {pillars.map(({ key, Icon }) => (
            <article className={styles.card} key={key}>
              <div className={styles.icon} aria-hidden="true">
                <Icon size={22} strokeWidth={2} />
              </div>
              <div>
                <h3>{t(`home.impact.pillars.${key}.title`)}</h3>
                <p>{t(`home.impact.pillars.${key}.description`)}</p>
              </div>
            </article>
          ))}
        </div>

        <p className={styles.note}>{t('home.impact.note')}</p>
      </div>
    </section>
  );
}
