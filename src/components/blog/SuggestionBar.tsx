'use client';
import Link from 'next/link';
import styles from './suggestion-bar.module.css';

interface SuggestionBarProps {
  activeTab?: string;
  setActiveTab?: (tab: string) => void;
}

const DEFAULT_OPTIONS = [
  { id: 0, title: 'All', url: '/blog/all' },
  { id: 1, title: 'Technology', url: '/blog/technology' },
  { id: 2, title: 'Life', url: '/blog/life' },
];

const SuggestionBar = ({ activeTab, setActiveTab }: SuggestionBarProps) => {
  const options = DEFAULT_OPTIONS;

  return (
    <nav className={styles.nav} aria-label="Blog categories">
      {options.map((option) => {
        const value = option.title.toLowerCase();
        const isActive = activeTab === value;
        return (
          <Link
            href={option.url}
            onClick={() => setActiveTab?.(value)}
            className={`${styles.link} ${isActive ? styles.active : ''}`}
            aria-current={isActive ? 'page' : undefined}
            key={option.id}
          >
            {option.title}
          </Link>
        );
      })}
    </nav>
  );
};

export default SuggestionBar;
