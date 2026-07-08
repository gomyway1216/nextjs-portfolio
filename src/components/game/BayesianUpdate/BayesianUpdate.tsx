'use client';

import { useState } from 'react';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { getStrings } from './i18n';
import { PlayTab } from './PlayTab';
import { SimTab } from './SimTab';
import styles from './BayesianUpdate.module.css';

type Tab = 'play' | 'sim';

export const BayesianUpdate = () => {
  const { language } = useGameLanguage();
  const t = getStrings(language);
  const [tab, setTab] = useState<Tab>('play');

  return (
    <div className={styles.root}>
      <div className={styles.container}>
        <header className={styles.header}>
          <h1 className={styles.title}>
            <span aria-hidden>🪙</span>
            {t.title}
          </h1>
          <p className={styles.subtitle}>{t.subtitle}</p>
        </header>

        <div className={styles.tabs} role="tablist" aria-label={t.title}>
          <button
            role="tab"
            id="tab-play"
            aria-selected={tab === 'play'}
            aria-controls="panel-play"
            className={`${styles.tab} ${tab === 'play' ? styles.tabActive : ''}`}
            onClick={() => setTab('play')}
          >
            {t.tabPlay}
          </button>
          <button
            role="tab"
            id="tab-sim"
            aria-selected={tab === 'sim'}
            aria-controls="panel-sim"
            className={`${styles.tab} ${tab === 'sim' ? styles.tabActive : ''}`}
            onClick={() => setTab('sim')}
          >
            {t.tabSim}
          </button>
        </div>

        {tab === 'play' ? (
          <div role="tabpanel" id="panel-play" aria-labelledby="tab-play">
            <PlayTab t={t} />
          </div>
        ) : (
          <div role="tabpanel" id="panel-sim" aria-labelledby="tab-sim">
            <SimTab t={t} />
          </div>
        )}
      </div>
    </div>
  );
};

export default BayesianUpdate;
