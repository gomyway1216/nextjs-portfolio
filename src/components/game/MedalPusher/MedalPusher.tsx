'use client';

import { useRef, useState, type KeyboardEvent } from 'react';
import { InfoModal } from '../common';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { getStrings } from './i18n';
import { OddsTab } from './OddsTab';
import { PlayTab } from './PlayTab';
import { SimTab } from './SimTab';
import styles from './MedalPusher.module.css';

type Tab = 'machine' | 'odds' | 'sim';

export const MedalPusher = () => {
  const [tab, setTab] = useState<Tab>('machine');
  const [infoOpen, setInfoOpen] = useState(false);
  const { language } = useGameLanguage();
  const t = getStrings(language);

  const tabs: { id: Tab; label: string }[] = [
    { id: 'machine', label: t.tabMachine },
    { id: 'odds', label: t.tabOdds },
    { id: 'sim', label: t.tabSim },
  ];
  const tabButtons = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({});

  // The standard tab pattern: one tab stop, and the arrow keys, Home and End move between tabs.
  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = tabs.length - 1;
    const next =
      event.key === 'ArrowRight'
        ? (index + 1) % tabs.length
        : event.key === 'ArrowLeft'
          ? (index + last) % tabs.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : null;
    if (next === null) return;
    event.preventDefault();
    setTab(tabs[next].id);
    tabButtons.current[tabs[next].id]?.focus();
  };

  return (
    <div className={styles.root}>
      <div className={styles.shell}>
        <div className={styles.header}>
          <div style={{ flex: 1 }}>
            <h1 className={styles.title}>
              <span aria-hidden>🪙</span> {t.title}
            </h1>
            <p className={styles.subtitle}>{t.subtitle}</p>
          </div>
          <button type="button" className={styles.btn} onClick={() => setInfoOpen(true)}>
            {t.howToPlay}
          </button>
        </div>

        <div className={styles.tabs} role="tablist" aria-label={t.title}>
          {tabs.map((tb, index) => (
            <button
              key={tb.id}
              ref={(element) => {
                tabButtons.current[tb.id] = element;
              }}
              type="button"
              role="tab"
              id={`pusher-tab-${tb.id}`}
              aria-selected={tab === tb.id}
              aria-controls={`pusher-panel-${tb.id}`}
              tabIndex={tab === tb.id ? 0 : -1}
              className={styles.tab}
              onClick={() => setTab(tb.id)}
              onKeyDown={(event) => onTabKeyDown(event, index)}
            >
              {tb.label}
            </button>
          ))}
        </div>

        {/* Every panel stays mounted (inactive ones are hidden) so switching tabs never
            resets the machine or drops a finished simulation. The machine only runs while its tab is showing. */}
        <div role="tabpanel" id="pusher-panel-machine" aria-labelledby="pusher-tab-machine" hidden={tab !== 'machine'}>
          <PlayTab active={tab === 'machine'} />
        </div>
        <div role="tabpanel" id="pusher-panel-odds" aria-labelledby="pusher-tab-odds" hidden={tab !== 'odds'}>
          <OddsTab />
        </div>
        <div role="tabpanel" id="pusher-panel-sim" aria-labelledby="pusher-tab-sim" hidden={tab !== 'sim'}>
          <SimTab />
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

export default MedalPusher;
