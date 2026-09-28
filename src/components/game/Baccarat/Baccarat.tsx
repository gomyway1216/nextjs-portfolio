'use client';

import { useState } from 'react';
import { InfoModal } from '../common';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { getStrings } from './i18n';
import { OddsTab } from './OddsTab';
import { PlayTab } from './PlayTab';
import styles from './Baccarat.module.css';

type Tab = 'play' | 'odds';

export const Baccarat = () => {
  const [tab, setTab] = useState<Tab>('play');
  const [infoOpen, setInfoOpen] = useState(false);
  const { language } = useGameLanguage();
  const t = getStrings(language);

  const tabs: { id: Tab; label: string }[] = [
    { id: 'play', label: t.tabPlay },
    { id: 'odds', label: t.tabOdds },
  ];

  return (
    <div className={styles.root}>
      <div className={styles.shell}>
        <div className={styles.header}>
          <div style={{ flex: 1 }}>
            <h1 className={styles.title}>
              <span aria-hidden>♦️</span> {t.title}
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
              id={`baccarat-tab-${tb.id}`}
              aria-selected={tab === tb.id}
              aria-controls={`baccarat-panel-${tb.id}`}
              className={styles.tab}
              onClick={() => setTab(tb.id)}
            >
              {tb.label}
            </button>
          ))}
        </div>

        {/* Every panel stays mounted (inactive ones are hidden) so switching tabs
            never drops the bankroll or a hand that is still being dealt. */}
        <div role="tabpanel" id="baccarat-panel-play" aria-labelledby="baccarat-tab-play" hidden={tab !== 'play'}>
          <PlayTab />
        </div>
        <div role="tabpanel" id="baccarat-panel-odds" aria-labelledby="baccarat-tab-odds" hidden={tab !== 'odds'}>
          <OddsTab />
        </div>
      </div>

      <InfoModal isOpen={infoOpen} onClose={() => setInfoOpen(false)} title={t.howToPlay}>
        {t.infoBody.map((p, i) => (
          <p key={i} className={styles.infoP}>
            {p}
          </p>
        ))}
      </InfoModal>
    </div>
  );
};

export default Baccarat;
