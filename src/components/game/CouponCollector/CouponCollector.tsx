'use client';

import { useState } from 'react';
import { Info, Globe } from 'lucide-react';
import { InfoModal } from '../common';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { PlayTab } from './PlayTab';
import { SimTab } from './SimTab';
import { getStrings } from './i18n';
import styles from './CouponCollector.module.css';

type Tab = 'play' | 'sim';

export const CouponCollector = () => {
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
              <span aria-hidden>🎟️</span> {t.title}
            </h1>
            <p className={styles.subtitle}>{t.subtitle}</p>
          </div>
          <div className={styles.controls}>
            <button
              type="button"
              className={styles.iconBtn}
              onClick={() => setLanguage(language === 'ja' ? 'en' : 'ja')}
              aria-label={t.toggleLanguage}
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

        <div className={styles.tabs} role="tablist" aria-label="Coupon Collector modes">
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

        <div className={styles.panel}>{tab === 'play' ? <PlayTab t={t} /> : <SimTab t={t} />}</div>
      </div>

      <InfoModal isOpen={showInfo} onClose={() => setShowInfo(false)} title={t.infoTitle}>
        <div className={styles.infoBody}>
          <p>{t.infoIntro}</p>
          <h3>{t.infoFormula}</h3>
          <p>{t.infoFormulaBody}</p>
          <h3>{t.infoTail}</h3>
          <p>{t.infoTailBody}</p>
        </div>
      </InfoModal>
    </div>
  );
};

export default CouponCollector;
