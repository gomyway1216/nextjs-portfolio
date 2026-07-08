'use client';

import { useState } from 'react';
import { Info } from 'lucide-react';
import { PlayTab } from './PlayTab';
import { SimTab } from './SimTab';
import { InfoModal } from '../common/InfoModal';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { getStrings } from './i18n';
import styles from './BirthdayParadox.module.css';

type Tab = 'play' | 'sim';

export const BirthdayParadox = () => {
  const [tab, setTab] = useState<Tab>('play');
  const [infoOpen, setInfoOpen] = useState(false);
  const { language } = useGameLanguage();
  const t = getStrings(language);

  return (
    <div className={styles.root}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div>
            <h1 className={styles.title}>
              <span aria-hidden>🎂</span> {t.title}
            </h1>
            <p className={styles.subtitle}>{t.subtitle}</p>
          </div>
          <button
            type="button"
            className={styles.infoBtn}
            onClick={() => setInfoOpen(true)}
            aria-label={t.howToPlay}
          >
            <Info size={16} aria-hidden />
            {t.howToPlay}
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

        {tab === 'play' ? <PlayTab t={t} /> : <SimTab t={t} language={language} />}
      </div>

      <InfoModal isOpen={infoOpen} onClose={() => setInfoOpen(false)} title={t.infoTitle}>
        <div className={styles.infoBody}>
          <p>{t.infoP1}</p>
          <p>{t.infoP2}</p>
          <code className={styles.formula}>{t.infoFormula}</code>
          <p>{t.infoP3}</p>
        </div>
      </InfoModal>
    </div>
  );
};

export default BirthdayParadox;
