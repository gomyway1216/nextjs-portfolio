'use client';

import { useState } from 'react';
import { InfoModal } from '../common';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { analyzeMachine } from './engine';
import { getStrings } from './i18n';
import { OddsTab } from './OddsTab';
import { PlayTab } from './PlayTab';
import { SimTab } from './SimTab';
import styles from './SlotMachine.module.css';

type Tab = 'play' | 'odds' | 'sim';

const RTP_LABEL = `${(analyzeMachine().rtp * 100).toFixed(2)}%`;

export const SlotMachine = () => {
  const [tab, setTab] = useState<Tab>('play');
  const [infoOpen, setInfoOpen] = useState(false);
  const { language } = useGameLanguage();
  const t = getStrings(language);

  const tabs: { id: Tab; label: string }[] = [
    { id: 'play', label: t.tabPlay },
    { id: 'odds', label: t.tabOdds },
    { id: 'sim', label: t.tabSim },
  ];

  return (
    <div className={styles.root}>
      <div className={styles.shell}>
        <div className={styles.header}>
          <div style={{ flex: 1 }}>
            <h1 className={styles.title}>
              <span aria-hidden>🎰</span> {t.title}
            </h1>
            <p className={styles.subtitle}>{t.subtitle}</p>
          </div>
          <button type="button" className={styles.btn} onClick={() => setInfoOpen(true)}>
            {t.howToPlay}
          </button>
        </div>

        <div className={styles.tabs} role="tablist" aria-label={t.title}>
          {tabs.map((tb) => (
            <button
              key={tb.id}
              type="button"
              role="tab"
              id={`slot-tab-${tb.id}`}
              aria-selected={tab === tb.id}
              aria-controls={`slot-panel-${tb.id}`}
              className={styles.tab}
              onClick={() => setTab(tb.id)}
            >
              {tb.label}
            </button>
          ))}
        </div>

        <div role="tabpanel" id={`slot-panel-${tab}`} aria-labelledby={`slot-tab-${tab}`}>
          {tab === 'play' && <PlayTab />}
          {tab === 'odds' && <OddsTab />}
          {tab === 'sim' && <SimTab />}
        </div>
      </div>

      <InfoModal isOpen={infoOpen} onClose={() => setInfoOpen(false)} title={t.howToPlay}>
        {t.infoBody(RTP_LABEL).map((p, i) => (
          <p key={i} className={styles.infoP}>
            {p}
          </p>
        ))}
      </InfoModal>
    </div>
  );
};

export default SlotMachine;
