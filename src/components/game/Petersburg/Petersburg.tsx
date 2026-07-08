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
            id="petersburg-tab-play"
            aria-selected={tab === 'play'}
            aria-controls="petersburg-panel-play"
            tabIndex={tab === 'play' ? 0 : -1}
            className={`${styles.tab} ${tab === 'play' ? styles.tabActive : ''}`}
            onClick={() => setTab('play')}
          >
            {t.tabPlay}
          </button>
          <button
            role="tab"
            id="petersburg-tab-sim"
            aria-selected={tab === 'sim'}
            aria-controls="petersburg-panel-sim"
            tabIndex={tab === 'sim' ? 0 : -1}
            className={`${styles.tab} ${tab === 'sim' ? styles.tabActive : ''}`}
            onClick={() => setTab('sim')}
          >
            {t.tabSim}
          </button>
        </div>

        {tab === 'play' ? (
          <div role="tabpanel" id="petersburg-panel-play" aria-labelledby="petersburg-tab-play">
            <PlayTab />
          </div>
        ) : (
          <div role="tabpanel" id="petersburg-panel-sim" aria-labelledby="petersburg-tab-sim">
            <SimTab />
          </div>
        )}
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
