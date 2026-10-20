'use client';

import { useRef, useState, type KeyboardEvent } from 'react';
import { InfoModal } from '../common';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { FloorJackpotOddsNote, FloorJackpotStrip } from '../MedalCenter/floor/FloorJackpot';
import { MEDAL_CENTER_PATH } from '../MedalCenter/paths';
import floorTabs from '../MedalCenter/tabs.module.css';
import { valueOf } from './engine';
import { getStrings } from './i18n';
import { OddsTab } from './OddsTab';
import { PlayTab, type PlayTabProps } from './PlayTab';
import { PUBLISHED_KENO_ODDS } from './published';
import styles from './Keno.module.css';

type Tab = 'machine' | 'odds';

/** A return as the rules say it: to two decimals. */
export const percentOf = (value: number, language: 'en' | 'ja'): string =>
  `${(value * 100).toLocaleString(language === 'ja' ? 'ja-JP' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

export type KenoProps = PlayTabProps;

/** A little picture for the title: a keno ball over a corner of the board. */
const TitleBall = () => (
  <svg className={styles.titleBall} viewBox="0 0 40 40" aria-hidden="true" focusable="false">
    <rect x="2" y="16" width="22" height="22" rx="3" fill="#0d2a6b" stroke="#7fd3ff" strokeWidth="1.2" />
    <path d="M2 23.3H24M2 30.6H24M9.3 16V38M16.6 16V38" stroke="#7fd3ff" strokeWidth="0.8" opacity="0.7" />
    <circle cx="25" cy="15" r="12" fill="#ffd34d" stroke="#8a5a00" strokeWidth="1.4" />
    <circle cx="25" cy="15" r="7" fill="#fffbea" />
    <text x="25" y="18.6" textAnchor="middle" fontSize="9.5" fontWeight="900" fill="#0d2a6b">
      80
    </text>
  </svg>
);

/** Video Keno: the machine, and its exact odds. Who is playing is passed straight on to the machine. */
export const Keno = ({ player }: KenoProps = {}) => {
  const [tab, setTab] = useState<Tab>('machine');
  const [infoOpen, setInfoOpen] = useState(false);
  const { language } = useGameLanguage();
  const t = getStrings(language);
  // Written out in published.ts: nothing is worked out as the page opens.
  const odds = PUBLISHED_KENO_ODDS;
  const tabs: { id: Tab; label: string }[] = [
    { id: 'machine', label: t.tabMachine },
    { id: 'odds', label: t.tabOdds },
  ];
  const tabButtons = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({});
  // The standard tab pattern: one tab stop, and the arrow keys, Home and End move between tabs.
  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = tabs.length - 1;
    const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index + last) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? last : null;
    if (next === null) return;
    event.preventDefault();
    setTab(tabs[next].id);
    tabButtons.current[tabs[next].id]?.focus();
  };

  return (
    <div className={styles.root}>
      <div className={styles.shell}>
        <div className={styles.header}>
          <div className={styles.headerText}>
            {/* The machine stands on the medal center's floor, whose front has the medals, the daily bonus and the reset. */}
            <a className={styles.centerLink} href={MEDAL_CENTER_PATH} data-testid="kn-center">
              <span aria-hidden>← </span>
              {t.centerLink}
            </a>
            <h1 className={styles.title}>
              <TitleBall />{' '}
              <span className={styles.titleText}>
                {t.titleParts[0]}
                {language === 'en' ? ' ' : <wbr />}
                {t.titleParts[1]}
              </span>
            </h1>
            <p className={styles.subtitle}>{t.subtitle}</p>
          </div>
          <button type="button" className={styles.btn} aria-haspopup="dialog" data-testid="kn-how-to-play" onClick={() => setInfoOpen(true)}>
            {t.howToPlay}
          </button>
        </div>

        {/* The floor jackpot, live, over the machine: every medal played here by a player on the floor feeds it. */}
        <FloorJackpotStrip game="keno" />

        <div className={`${styles.tabs} ${floorTabs.tabs}`} role="tablist" aria-label={t.title}>
          {tabs.map((tb, index) => (
            <button
              key={tb.id}
              ref={(element) => {
                tabButtons.current[tb.id] = element;
              }}
              type="button"
              role="tab"
              id={`kn-tab-${tb.id}`}
              aria-selected={tab === tb.id}
              aria-controls={`kn-panel-${tb.id}`}
              tabIndex={tab === tb.id ? 0 : -1}
              className={`${styles.tab} ${floorTabs.tab}`}
              onClick={() => setTab(tb.id)}
              onKeyDown={(event) => onTabKeyDown(event, index)}
            >
              {tb.label}
            </button>
          ))}
        </div>

        {/* Both panels stay mounted (the one not shown is hidden), so switching tabs never drops a game under way. */}
        <div role="tabpanel" id="kn-panel-machine" aria-labelledby="kn-tab-machine" hidden={tab !== 'machine'}>
          <PlayTab player={player} active={tab === 'machine' && !infoOpen} />
        </div>
        <div role="tabpanel" id="kn-panel-odds" aria-labelledby="kn-tab-odds" hidden={tab !== 'odds'}>
          <OddsTab />
          {/* What the floor jackpot adds to the medals played here, on top of the machine's own return. Kept out of the tab itself, which never touches the player's medals. */}
          <FloorJackpotOddsNote game="keno" />
        </div>
      </div>

      <InfoModal isOpen={infoOpen} onClose={() => setInfoOpen(false)} title={t.howToPlay}>
        {t.infoBody(percentOf(valueOf(odds.best), language), percentOf(valueOf(odds.worst), language)).map((p, i) => (
          <p key={i} className={styles.infoP}>
            {p}
          </p>
        ))}
      </InfoModal>
    </div>
  );
};

export default Keno;
