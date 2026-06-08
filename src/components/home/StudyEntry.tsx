'use client';

import Link from 'next/link';
import { ArrowRight, BookOpenText, Code2, KeyRound, ListChecks } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import styles from './StudyEntry.module.css';

const STUDY_CARDS = [
  {
    key: 'articles',
    href: '/study',
    Icon: BookOpenText,
    accent: 'teal',
    metaIcon: ListChecks,
  },
  {
    key: 'cs',
    href: '/study/cs',
    Icon: Code2,
    accent: 'blue',
    metaIcon: KeyRound,
  },
] as const;

export default function StudyEntry() {
  const { t } = useTranslation();

  return (
    <div className={styles.grid}>
      {STUDY_CARDS.map(({ key, href, Icon, accent, metaIcon: MetaIcon }) => (
        <Link key={key} href={href} className={`${styles.card} ${styles[accent]}`}>
          <div className={styles.iconBox}>
            <Icon size={28} strokeWidth={1.9} />
          </div>
          <div className={styles.content}>
            <p className={styles.eyebrow}>{t(`home.study.${key}.eyebrow`)}</p>
            <h4 className={styles.title}>{t(`home.study.${key}.title`)}</h4>
            <p className={styles.description}>{t(`home.study.${key}.description`)}</p>
            <div className={styles.meta}>
              <MetaIcon size={15} strokeWidth={2} />
              <span>{t(`home.study.${key}.meta`)}</span>
            </div>
          </div>
          <span className={styles.arrow} aria-hidden="true">
            <ArrowRight size={20} strokeWidth={2} />
          </span>
        </Link>
      ))}
    </div>
  );
}
