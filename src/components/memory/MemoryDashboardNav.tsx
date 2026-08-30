'use client';

import Link from 'next/link';
import { Database, Globe2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import styles from './MemoryDashboardNav.module.css';

export default function MemoryDashboardNav({ active }: { active: 'private' | 'public' }) {
  const { t } = useTranslation();
  return (
    <nav className={styles.nav} aria-label={t('memoryAdminNav.label')}>
      <Link href="/memory?view=private" aria-current={active === 'private' ? 'page' : undefined}>
        <Database size={16} aria-hidden="true" />
        <span>{t('memoryAdminNav.private')}</span>
        <small>{t('memoryAdminNav.privateHint')}</small>
      </Link>
      <Link href="/memory?view=public" aria-current={active === 'public' ? 'page' : undefined}>
        <Globe2 size={16} aria-hidden="true" />
        <span>{t('memoryAdminNav.public')}</span>
        <small>{t('memoryAdminNav.publicHint')}</small>
      </Link>
    </nav>
  );
}
