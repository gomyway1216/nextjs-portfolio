'use client';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import styles from './suggestion-bar.module.css';

interface SuggestionBarProps {
  activeTab?: string;
  setActiveTab?: (tab: string) => void;
}

const DEFAULT_OPTIONS = [
  { id: 0, value: 'all', titleKey: 'blogPage.index.categories.all', url: '/blog' },
  { id: 1, value: 'applied-algorithms', titleKey: 'blogPage.index.categories.appliedAlgorithms', url: '/blog/applied-algorithms' },
  { id: 2, value: 'system-design', titleKey: 'blogPage.index.categories.systemDesign', url: '/blog/system-design' },
  { id: 3, value: 'engineering-practices', titleKey: 'blogPage.index.categories.engineeringPractices', url: '/blog/engineering-practices' },
  { id: 4, value: 'fintech-payments', titleKey: 'blogPage.index.categories.fintechPayments', url: '/blog/fintech-payments' },
  { id: 5, value: 'career', titleKey: 'blogPage.index.categories.career', url: '/blog/career' },
  { id: 6, value: 'life', titleKey: 'blogPage.index.categories.life', url: '/blog/life' },
];

const SuggestionBar = ({ activeTab, setActiveTab }: SuggestionBarProps) => {
  const { t } = useTranslation();
  const options = DEFAULT_OPTIONS;

  return (
    <nav className={styles.nav} aria-label="Blog categories">
      {options.map((option) => {
        const value = option.value;
        const isActive = activeTab === value;
        return (
          <Link
            href={option.url}
            onClick={() => setActiveTab?.(value)}
            className={`${styles.link} ${isActive ? styles.active : ''}`}
            aria-current={isActive ? 'page' : undefined}
            key={option.id}
          >
            {t(option.titleKey)}
          </Link>
        );
      })}
    </nav>
  );
};

export default SuggestionBar;
