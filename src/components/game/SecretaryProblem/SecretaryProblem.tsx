'use client';

import { useMemo, useState } from 'react';
import { GameStats, GameTopBar, InfoModal } from '../common';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { getStrings } from './i18n';
import { PlayTab } from './PlayTab';
import { SimTab } from './SimTab';
import styles from './SecretaryProblem.module.css';

type Tab = 'play' | 'sim';

export const SecretaryProblem = () => {
  const { language } = useGameLanguage();
  const t = useMemo(() => getStrings(language), [language]);
  const [tab, setTab] = useState<Tab>('play');
  const [infoOpen, setInfoOpen] = useState(false);
  const [stats, setStats] = useState<GameStats>({ wins: 0, losses: 0, draws: 0 });

  return (
    <div className={styles.root}>
      <GameTopBar stats={stats} onInfoClick={() => setInfoOpen(true)} />

      <div className={styles.shell}>
        <header className={styles.header}>
          <h1 className={styles.title}>
            <span aria-hidden="true">👔</span> {t.title}
          </h1>
          <p className={styles.subtitle}>{t.subtitle}</p>
        </header>

        <div className={styles.tabs} role="tablist" aria-label={t.title}>
          <button
            role="tab"
            aria-selected={tab === 'play'}
            className={`${styles.tab} ${tab === 'play' ? styles.tabActive : ''}`}
            onClick={() => setTab('play')}
          >
            {t.tabPlay}
          </button>
          <button
            role="tab"
            aria-selected={tab === 'sim'}
            className={`${styles.tab} ${tab === 'sim' ? styles.tabActive : ''}`}
            onClick={() => setTab('sim')}
          >
            {t.tabSim}
          </button>
        </div>

        {tab === 'play' ? (
          <PlayTab t={t} stats={stats} setStats={setStats} />
        ) : (
          <SimTab t={t} />
        )}
      </div>

      <InfoModal isOpen={infoOpen} onClose={() => setInfoOpen(false)} title={t.infoTitle}>
        <div className={styles.infoSection}>
          <h3>{t.infoRulesTitle}</h3>
          <p>{t.infoRules}</p>
        </div>
        <div className={styles.infoSection}>
          <h3>{t.infoStrategyTitle}</h3>
          <p>{t.infoStrategy}</p>
        </div>
        <div className={styles.infoSection}>
          <h3>{t.infoWhyTitle}</h3>
          <p>{t.infoWhy}</p>
        </div>
      </InfoModal>
    </div>
  );
};

export default SecretaryProblem;
