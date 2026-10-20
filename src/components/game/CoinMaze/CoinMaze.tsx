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
import { PUBLISHED_MAZE_ODDS } from './published';
import styles from './CoinMaze.module.css';

type Tab = 'machine' | 'odds';

/** A return as the rules say it: to two decimals. */
const percentOf = (value: number, language: 'en' | 'ja'): string =>
  `${(value * 100).toLocaleString(language === 'ja' ? 'ja-JP' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

export type CoinMazeProps = PlayTabProps;

/** A little picture for the title: a silver medal rolling down a shelf toward a lever's red knob. */
const TitleMedal = () => (
  <svg className={styles.titleMedal} viewBox="0 0 40 40" aria-hidden="true" focusable="false">
    <line x1="4" y1="30" x2="34" y2="36" stroke="#8a5a2b" strokeWidth="3" strokeLinecap="round" />
    <circle cx="18" cy="21" r="9" fill="#dfe4ea" stroke="#5f6874" strokeWidth="1.6" />
    <path d="M18 16.5l1.3 3 3.3.1-2.6 2 .9 3.2-2.9-1.8-2.9 1.8.9-3.2-2.6-2 3.3-.1z" fill="#aab3be" />
    <circle cx="35" cy="14" r="4" fill="#e53935" stroke="#7a1414" strokeWidth="1.2" />
    <line x1="35" y1="18" x2="35" y2="28" stroke="#7a1414" strokeWidth="2" />
  </svg>
);

/** Candy Shop Medal Maze: the machine, and its exact odds. Who is playing is passed straight on to the machine. */
export const CoinMaze = ({ player }: CoinMazeProps = {}) => {
  const [tab, setTab] = useState<Tab>('machine');
  const [infoOpen, setInfoOpen] = useState(false);
  const { language } = useGameLanguage();
  const t = getStrings(language);
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
  const odds = PUBLISHED_MAZE_ODDS;

  return (
    <div className={styles.root}>
      <div className={styles.shell}>
        <div className={styles.header}>
          <div className={styles.headerText}>
            {/* The machine stands on the medal center's floor, whose front has the medals, the daily bonus and the reset. */}
            <a className={styles.centerLink} href={MEDAL_CENTER_PATH} data-testid="cm-center">
              <span aria-hidden>← </span>
              {t.centerLink}
            </a>
            <h1 className={styles.title}>
              <TitleMedal />{' '}
              <span className={styles.titleText}>
                {t.titleParts[0]}
                {language === 'en' ? ' ' : <wbr />}
                {t.titleParts[1]}
              </span>
            </h1>
            <p className={styles.subtitle}>{t.subtitle}</p>
          </div>
          <button type="button" className={styles.btn} aria-haspopup="dialog" data-testid="cm-how-to-play" onClick={() => setInfoOpen(true)}>
            {t.howToPlay}
          </button>
        </div>

        {/* The floor jackpot, live, over the machine: every medal played here by a player on the floor feeds it. */}
        <FloorJackpotStrip game="coin-maze" />

        <div className={`${styles.tabs} ${floorTabs.tabs}`} role="tablist" aria-label={t.title}>
          {tabs.map((tb, index) => (
            <button
              key={tb.id}
              ref={(element) => {
                tabButtons.current[tb.id] = element;
              }}
              type="button"
              role="tab"
              id={`cm-tab-${tb.id}`}
              aria-selected={tab === tb.id}
              aria-controls={`cm-panel-${tb.id}`}
              tabIndex={tab === tb.id ? 0 : -1}
              className={`${styles.tab} ${floorTabs.tab}`}
              onClick={() => setTab(tb.id)}
              onKeyDown={(event) => onTabKeyDown(event, index)}
            >
              {tb.label}
            </button>
          ))}
        </div>

        {/* Both panels stay mounted (the one not shown is hidden), so switching tabs never drops a play under way. */}
        <div role="tabpanel" id="cm-panel-machine" aria-labelledby="cm-tab-machine" hidden={tab !== 'machine'}>
          <PlayTab player={player} active={tab === 'machine' && !infoOpen} />
        </div>
        <div role="tabpanel" id="cm-panel-odds" aria-labelledby="cm-tab-odds" hidden={tab !== 'odds'}>
          <OddsTab />
          {/* What the floor jackpot adds to the medals played here, on top of the machine's own return. Kept out of the tab itself, which never touches the player's medals. */}
          <FloorJackpotOddsNote game="coin-maze" />
        </div>
      </div>

      <InfoModal isOpen={infoOpen} onClose={() => setInfoOpen(false)} title={t.howToPlay}>
        {t.infoBody(percentOf(valueOf(odds.perfect.back), language), percentOf(valueOf(odds.typical.back), language), percentOf(valueOf(odds.blind.back), language)).map((p, i) => (
          <p key={i} className={styles.infoP}>
            {p}
          </p>
        ))}
      </InfoModal>
    </div>
  );
};

export default CoinMaze;
