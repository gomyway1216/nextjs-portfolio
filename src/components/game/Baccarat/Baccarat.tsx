'use client';

import { useState } from 'react';
import { InfoModal } from '../common';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { MEDAL_CENTER_PATH } from '../MedalCenter/paths';
import { getStrings } from './i18n';
import { OddsTab } from './OddsTab';
import { GUEST_PLAYER, PlayTab, type TablePlayer } from './PlayTab';
import { SimTab } from './SimTab';
import styles from './Baccarat.module.css';
import floorTabs from '../MedalCenter/tabs.module.css';

type Tab = 'play' | 'odds' | 'sim';

export interface BaccaratProps {
  /** Who is playing, as the site knows it: the table plays with their medals once it is sure. A guest without one. */
  player?: TablePlayer;
}

export const Baccarat = ({ player = GUEST_PLAYER }: BaccaratProps = {}) => {
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
            {/* The table stands on the medal floor, whose front has the player's medals, the daily bonus and the reset. */}
            <a className={styles.centerLink} href={MEDAL_CENTER_PATH} data-testid="baccarat-center">
              <span aria-hidden>← </span>
              {t.centerLink}
            </a>
            <h1 className={styles.title}>
              <span aria-hidden>♦️</span> {t.title}
            </h1>
            <p className={styles.subtitle}>{t.subtitle}</p>
          </div>
          <button type="button" className={styles.btn} onClick={() => setInfoOpen(true)}>
            {t.howToPlay}
          </button>
        </div>

        <div className={`${styles.tabs} ${floorTabs.tabs}`} role="tablist" aria-label={t.title}>
          {tabs.map((tb) => (
            <button
              key={tb.id}
              type="button"
              role="tab"
              id={`baccarat-tab-${tb.id}`}
              aria-selected={tab === tb.id}
              aria-controls={`baccarat-panel-${tb.id}`}
              className={`${styles.tab} ${floorTabs.tab}`}
              onClick={() => setTab(tb.id)}
            >
              {tb.label}
            </button>
          ))}
        </div>

        {/* Every panel stays mounted (inactive ones are hidden) so switching tabs
            never drops a hand that is still being dealt. */}
        <div role="tabpanel" id="baccarat-panel-play" aria-labelledby="baccarat-tab-play" hidden={tab !== 'play'}>
          <PlayTab player={player} active={tab === 'play'} />
        </div>
        <div role="tabpanel" id="baccarat-panel-odds" aria-labelledby="baccarat-tab-odds" hidden={tab !== 'odds'}>
          <OddsTab />
        </div>
        <div role="tabpanel" id="baccarat-panel-sim" aria-labelledby="baccarat-tab-sim" hidden={tab !== 'sim'}>
          <SimTab />
        </div>
      </div>

      <InfoModal isOpen={infoOpen} onClose={() => setInfoOpen(false)} title={t.howToPlay}>
        {t.infoBody.map((p, i) => (
          <p key={i} className={styles.infoP}>
            {p}
          </p>
        ))}
        <p className={styles.infoP} data-testid="baccarat-help-not-money">
          {t.notMoney}
        </p>
      </InfoModal>
    </div>
  );
};

export default Baccarat;
