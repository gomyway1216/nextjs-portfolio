'use client';

import { useState } from 'react';
import { Info, Globe } from 'lucide-react';
import { InfoModal } from '../common';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { PlayTab } from './PlayTab';
import { SimTab } from './SimTab';
import { getStrings } from './i18n';
import { theoreticalStay, theoreticalSwitch } from './engine';
import styles from './MontyHall.module.css';

type Tab = 'play' | 'sim';

const fmtPct = (v: number) => `${(v * 100).toFixed(1)}%`;

export const MontyHall = () => {
  const [tab, setTab] = useState<Tab>('play');
  const [showInfo, setShowInfo] = useState(false);
  const { language, setLanguage } = useGameLanguage();
  const t = getStrings(language);

  return (
    <div className={styles.root}>
      <div className={styles.container}>
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>
              <span aria-hidden>🚪</span> {t.title}
            </h1>
            <p className={styles.subtitle}>{t.subtitle}</p>
          </div>
          <div className={styles.controls}>
            <button
              type="button"
              className={styles.iconBtn}
              onClick={() => setLanguage(language === 'ja' ? 'en' : 'ja')}
              aria-label="Toggle language"
            >
              <Globe size={16} aria-hidden />
              {language === 'ja' ? 'EN' : '日本語'}
            </button>
            <button
              type="button"
              className={styles.iconBtn}
              onClick={() => setShowInfo(true)}
              aria-label={t.howToPlay}
            >
              <Info size={16} aria-hidden />
              {t.howToPlay}
            </button>
          </div>
        </div>

        <div className={styles.tabs} role="tablist" aria-label="Monty Hall modes">
          <button
            role="tab"
            id="mh-tab-play"
            aria-controls="mh-panel-play"
            aria-selected={tab === 'play'}
            className={`${styles.tab} ${tab === 'play' ? styles.tabActive : ''}`}
            onClick={() => setTab('play')}
          >
            {t.tabPlay}
          </button>
          <button
            role="tab"
            id="mh-tab-sim"
            aria-controls="mh-panel-sim"
            aria-selected={tab === 'sim'}
            className={`${styles.tab} ${tab === 'sim' ? styles.tabActive : ''}`}
            onClick={() => setTab('sim')}
          >
            {t.tabSim}
          </button>
        </div>

        {/* Both panels stay mounted (the inactive one is hidden) so switching tabs
            never drops the record on Play or a finished simulation. */}
        <div className={styles.panel}>
          <div role="tabpanel" id="mh-panel-play" aria-labelledby="mh-tab-play" hidden={tab !== 'play'}>
            <PlayTab t={t} />
          </div>
          <div role="tabpanel" id="mh-panel-sim" aria-labelledby="mh-tab-sim" hidden={tab !== 'sim'}>
            <SimTab t={t} />
          </div>
        </div>
      </div>

      <InfoModal isOpen={showInfo} onClose={() => setShowInfo(false)} title={t.infoTitle}>
        <div className={styles.infoBody}>
          <p>{t.infoIntro}</p>
          <h3>{t.infoWhy}</h3>
          <p>{t.infoWhyBody}</p>
          <h3>{t.infoGeneral}</h3>
          <p>{t.infoGeneralBody(4, fmtPct(theoreticalStay(4)), fmtPct(theoreticalSwitch(4)))}</p>
        </div>
      </InfoModal>
    </div>
  );
};

export default MontyHall;
