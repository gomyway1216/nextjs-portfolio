'use client';

import { useState } from 'react';
import { Info } from 'lucide-react';
import { InfoModal } from '../common';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { getPetersburgStrings } from './i18n';
import { PlayTab } from './PlayTab';
import { SimTab } from './SimTab';
import styles from './petersburg.module.css';

type Tab = 'play' | 'sim';

export const Petersburg = () => {
  const { language } = useGameLanguage();
  const t = getPetersburgStrings(language);
  const [tab, setTab] = useState<Tab>('play');
  const [infoOpen, setInfoOpen] = useState(false);

  return (
    <div className={styles.root}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div>
            <h1 className={styles.title}>
              <span aria-hidden>🪙</span> {t.title}
            </h1>
            <p className={styles.subtitle}>{t.subtitle}</p>
          </div>
          <button
            type="button"
            className={styles.infoBtn}
            onClick={() => setInfoOpen(true)}
            aria-label={t.info}
          >
            <Info size={16} aria-hidden />
            <span>{t.info}</span>
          </button>
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

        {tab === 'play' ? <PlayTab /> : <SimTab />}
      </div>

      <InfoModal isOpen={infoOpen} onClose={() => setInfoOpen(false)} title={t.howItWorksTitle}>
        <ol className={styles.modalList}>
          {t.howItWorks.map((step, i) => (
            <li key={i} className={styles.modalItem}>
              <span className={styles.modalNum} aria-hidden>
                {i + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </InfoModal>
    </div>
  );
};

export default Petersburg;
