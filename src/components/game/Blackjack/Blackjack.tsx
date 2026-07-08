'use client';

import { useState } from 'react';
import { Info } from 'lucide-react';
import { InfoModal } from '../common';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { getBlackjackStrings } from './i18n';
import { PlayTab } from './PlayTab';
import { SimTab } from './SimTab';
import styles from './blackjack.module.css';

type Tab = 'play' | 'sim';

export const Blackjack = () => {
  const { language } = useGameLanguage();
  const s = getBlackjackStrings(language);
  const [tab, setTab] = useState<Tab>('play');
  const [infoOpen, setInfoOpen] = useState(false);

  return (
    <div className={styles.root}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div className={styles.titleWrap}>
            <h1 className={styles.title}><span aria-hidden>🃏</span>{s.title}</h1>
            <p className={styles.subtitle}>{s.subtitle}</p>
          </div>
          <div className={styles.headerButtons}>
            <button
              type="button"
              className={styles.iconBtn}
              onClick={() => setInfoOpen(true)}
              aria-label={s.play.rulesTitle}
            >
              <Info size={16} aria-hidden />
              {s.play.rulesTitle}
            </button>
          </div>
        </header>

        <div className={styles.tabs} role="tablist" aria-label={s.title}>
          <button
            role="tab"
            aria-selected={tab === 'play'}
            className={`${styles.tab} ${tab === 'play' ? styles.tabActive : ''}`}
            onClick={() => setTab('play')}
          >
            {s.tabs.play}
          </button>
          <button
            role="tab"
            aria-selected={tab === 'sim'}
            className={`${styles.tab} ${tab === 'sim' ? styles.tabActive : ''}`}
            onClick={() => setTab('sim')}
          >
            {s.tabs.sim}
          </button>
        </div>

        {tab === 'play' ? <PlayTab /> : <SimTab />}
      </div>

      <InfoModal isOpen={infoOpen} onClose={() => setInfoOpen(false)} title={s.play.rulesTitle}>
        <ul style={{ lineHeight: 1.7, paddingLeft: '1.1rem', margin: 0 }}>
          {s.play.rules.map((r, i) => (
            <li key={i} style={{ marginBottom: '0.5rem' }}>{r}</li>
          ))}
        </ul>
      </InfoModal>
    </div>
  );
};

export default Blackjack;
