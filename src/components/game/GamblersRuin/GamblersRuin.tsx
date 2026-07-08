'use client';

import { useState } from 'react';
import { PlayTab } from './PlayTab';
import { SimTab } from './SimTab';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { makeT } from './i18n';
import styles from './GamblersRuin.module.css';

type Tab = 'play' | 'sim';

export const GamblersRuin = () => {
  const [tab, setTab] = useState<Tab>('play');
  const [showInfo, setShowInfo] = useState(false);
  const { language } = useGameLanguage();
  const t = makeT(language);

  return (
    <div className={styles.root}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div>
            <h1 className={styles.title}>💸 {t('title')}</h1>
            <p className={styles.subtitle}>{t('subtitle')}</p>
          </div>
          <div className={styles.headerActions}>
            <button
              type="button"
              className={styles.infoBtn}
              onClick={() => setShowInfo(true)}
              aria-label={t('infoTitle')}
            >
              ⓘ {t('info')}
            </button>
          </div>
        </header>

        <div className={styles.tabs} role="tablist" aria-label={t('title')}>
          <button
            role="tab"
            aria-selected={tab === 'play'}
            className={`${styles.tab} ${tab === 'play' ? styles.tabActive : ''}`}
            onClick={() => setTab('play')}
          >
            ▶ {t('tabPlay')}
          </button>
          <button
            role="tab"
            aria-selected={tab === 'sim'}
            className={`${styles.tab} ${tab === 'sim' ? styles.tabActive : ''}`}
            onClick={() => setTab('sim')}
          >
            📊 {t('tabSim')}
          </button>
        </div>

        {tab === 'play' ? <PlayTab t={t} /> : <SimTab t={t} />}
      </div>

      {showInfo && (
        <div
          className={styles.overlay}
          role="dialog"
          aria-modal="true"
          aria-label={t('infoTitle')}
          onClick={() => setShowInfo(false)}
        >
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>{t('infoTitle')}</h2>
            <div className={styles.modalBody}>{t('infoBody')}</div>
            <button type="button" className={styles.modalClose} onClick={() => setShowInfo(false)} autoFocus>
              {t('close')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default GamblersRuin;
