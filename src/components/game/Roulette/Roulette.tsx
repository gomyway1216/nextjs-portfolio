'use client';

import { useCallback, useState } from 'react';
import { InfoModal } from '../common';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { PlayTab } from './PlayTab';
import { SimTab } from './SimTab';
import { EdgeTab } from './EdgeTab';
import { getStrings, betName } from './i18n';
import { BET_ODDS } from './engine';
import styles from './Roulette.module.css';

type Tab = 'play' | 'sim' | 'edge';

export const Roulette = () => {
  const [tab, setTab] = useState<Tab>('play');
  const [infoOpen, setInfoOpen] = useState(false);
  const { language } = useGameLanguage();
  const t = getStrings(language);

  const openInfo = useCallback(() => setInfoOpen(true), []);

  const tabs: { id: Tab; label: string }[] = [
    { id: 'play', label: t.tabPlay },
    { id: 'sim', label: t.tabSim },
    { id: 'edge', label: t.tabEdge },
  ];

  return (
    <div className={styles.root}>
      <div className={styles.shell}>
        <div className={styles.header}>
          <div style={{ flex: 1 }}>
            <h1 className={styles.title}>
              <span aria-hidden>🎡</span> {t.title}
            </h1>
            <p className={styles.subtitle}>{t.subtitle}</p>
          </div>
          <button type="button" className={styles.btn} onClick={openInfo}>
            {t.howToPlay}
          </button>
        </div>

        <div className={styles.tabs} role="tablist" aria-label={t.title}>
          {tabs.map((tb) => (
            <button
              key={tb.id}
              role="tab"
              id={`rl-tab-${tb.id}`}
              aria-selected={tab === tb.id}
              aria-controls={`rl-panel-${tb.id}`}
              className={styles.tab}
              onClick={() => setTab(tb.id)}
            >
              {tb.label}
            </button>
          ))}
        </div>

        <div
          role="tabpanel"
          id={`rl-panel-${tab}`}
          aria-labelledby={`rl-tab-${tab}`}
        >
          {tab === 'play' && <PlayTab />}
          {tab === 'sim' && <SimTab />}
          {tab === 'edge' && <EdgeTab />}
        </div>
      </div>

      <InfoModal isOpen={infoOpen} onClose={() => setInfoOpen(false)} title={t.howToPlay}>
        {t.infoBody.map((p, i) => (
          <p key={i} className={styles.infoP}>
            {p}
          </p>
        ))}
        <h3 className={styles.blockTitle}>{t.payoutTableTitle}</h3>
        <table className={styles.payTable}>
          <tbody>
            {(
              [
                ['straight', BET_ODDS.straight],
                ['split', BET_ODDS.split],
                ['street', BET_ODDS.street],
                ['corner', BET_ODDS.corner],
                ['line', BET_ODDS.line],
                ['dozen', BET_ODDS.dozen],
                ['column', BET_ODDS.column],
                ['red', BET_ODDS.even],
                ['odd', BET_ODDS.even],
                ['low', BET_ODDS.even],
              ] as const
            ).map(([kind, odds]) => (
              <tr key={kind}>
                <td>{betName(kind, language)}</td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{odds}:1</td>
              </tr>
            ))}
          </tbody>
        </table>
      </InfoModal>
    </div>
  );
};

export default Roulette;
