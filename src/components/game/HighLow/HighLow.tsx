'use client';

import { useRef, useState, type KeyboardEvent } from 'react';
import { InfoModal } from '../common';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { FloorJackpotOddsNote, FloorJackpotStrip } from '../MedalCenter/floor/FloorJackpot';
import { MEDAL_CENTER_PATH } from '../MedalCenter/paths';
import floorTabs from '../MedalCenter/tabs.module.css';
import { BET_MOST, TOP, payFor, valueOf } from './engine';
import { getStrings } from './i18n';
import { OddsTab } from './OddsTab';
import { PlayTab, type PlayTabProps } from './PlayTab';
import { PUBLISHED_LADDER } from './published';
import styles from './HighLow.module.css';

type Tab = 'machine' | 'odds';

/** Best play's return, as the rules say it: to two decimals. */
export const bestPercent = (language: 'en' | 'ja'): string =>
  `${(valueOf(PUBLISHED_LADDER.best) * 100).toLocaleString(language === 'ja' ? 'ja-JP' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

export type HighLowProps = PlayTabProps;

/** A little picture for the title: two cards, one face up, one face down, and the ladder's rungs beside them. */
const TitleCards = () => (
  <svg className={styles.titleCards} viewBox="0 0 40 40" aria-hidden="true" focusable="false">
    <rect x="3" y="8" width="17" height="24" rx="2.5" fill="#fffdf6" stroke="#2a0d15" strokeWidth="1.2" transform="rotate(-8 11.5 20)" />
    <text x="11.5" y="24" textAnchor="middle" fontSize="11" fontWeight="800" fill="#c8102e" transform="rotate(-8 11.5 20)">
      ♥
    </text>
    <rect x="19" y="7" width="17" height="24" rx="2.5" fill="#8f1730" stroke="#f2c14e" strokeWidth="1.2" transform="rotate(7 27.5 19)" />
    <path d="M24 10V28M31 10V28M24 14H31M24 19H31M24 24H31" stroke="#f2c14e" strokeWidth="1.1" fill="none" transform="rotate(7 27.5 19)" />
  </svg>
);

/** The High & Low Ladder: the machine, and its exact odds. Who is playing is passed straight on to the machine. */
export const HighLow = ({ player }: HighLowProps = {}) => {
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

  return (
    <div className={styles.root}>
      <div className={styles.shell}>
        <div className={styles.header}>
          <div className={styles.headerText}>
            {/* The machine stands on the medal center's floor, whose front has the medals, the daily bonus and the reset. */}
            <a className={styles.centerLink} href={MEDAL_CENTER_PATH} data-testid="hl-center">
              <span aria-hidden>← </span>
              {t.centerLink}
            </a>
            <h1 className={styles.title}>
              <TitleCards />{' '}
              <span className={styles.titleText}>
                {t.titleParts[0]}
                {language === 'en' ? ' ' : <wbr />}
                {t.titleParts[1]}
              </span>
            </h1>
            <p className={styles.subtitle}>{t.subtitle}</p>
          </div>
          <button type="button" className={styles.btn} aria-haspopup="dialog" data-testid="hl-how-to-play" onClick={() => setInfoOpen(true)}>
            {t.howToPlay}
          </button>
        </div>

        {/* The floor jackpot, live, over the machine: every medal played here by a player on the floor feeds it. */}
        <FloorJackpotStrip game="high-low" />

        <div className={`${styles.tabs} ${floorTabs.tabs}`} role="tablist" aria-label={t.title}>
          {tabs.map((tb, index) => (
            <button
              key={tb.id}
              ref={(element) => {
                tabButtons.current[tb.id] = element;
              }}
              type="button"
              role="tab"
              id={`hl-tab-${tb.id}`}
              aria-selected={tab === tb.id}
              aria-controls={`hl-panel-${tb.id}`}
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
        <div role="tabpanel" id="hl-panel-machine" aria-labelledby="hl-tab-machine" hidden={tab !== 'machine'}>
          <PlayTab player={player} active={tab === 'machine' && !infoOpen} />
        </div>
        <div role="tabpanel" id="hl-panel-odds" aria-labelledby="hl-tab-odds" hidden={tab !== 'odds'}>
          <OddsTab />
          {/* What the floor jackpot adds to the medals played here, on top of the machine's own return. Kept out of the tab itself, which never touches the player's medals. */}
          <FloorJackpotOddsNote game="high-low" />
        </div>
      </div>

      <InfoModal isOpen={infoOpen} onClose={() => setInfoOpen(false)} title={t.howToPlay}>
        {t.infoBody(payFor(BET_MOST, TOP), bestPercent(language)).map((p, i) => (
          <p key={i} className={styles.infoP}>
            {p}
          </p>
        ))}
      </InfoModal>
    </div>
  );
};

export default HighLow;
