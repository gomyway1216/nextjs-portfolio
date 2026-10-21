'use client';

import { useRef, useState, type KeyboardEvent } from 'react';
import { InfoModal } from '../common';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { FloorJackpotOddsNote, FloorJackpotStrip } from '../MedalCenter/floor/FloorJackpot';
import floorTabs from '../MedalCenter/tabs.module.css';
import { MEDAL_CENTER_PATH } from '../MedalCenter/paths';
import { valueOf } from './engine';
import { getStrings } from './i18n';
import { PUBLISHED_BALL_TOWER_ODDS } from './published';
import { OddsTab } from './OddsTab';
import { PlayTab, type PlayTabProps } from './PlayTab';
import styles from './BallTower.module.css';

type Tab = 'machine' | 'odds';

/** A return as the rules say it: to two decimals. */
const percentOf = (value: number, language: 'en' | 'ja'): string =>
  `${(value * 100).toLocaleString(language === 'ja' ? 'ja-JP' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

export type BallTowerProps = PlayTabProps;

/** A little picture for the title: a firework bursting over a tower of three discs. */
const TitleTower = () => (
  <svg className={styles.titleTower} viewBox="0 0 40 40" aria-hidden="true" focusable="false">
    <g stroke="#ffcf4a" strokeWidth="1.6" strokeLinecap="round">
      <path d="M 20 3 L 20 7 M 14 5 L 16 8.5 M 26 5 L 24 8.5 M 12 10 L 15.5 11 M 28 10 L 24.5 11" />
    </g>
    <ellipse cx="20" cy="16" rx="8" ry="2.6" fill="#3b4fb8" stroke="#1f2a72" strokeWidth="1" />
    <ellipse cx="20" cy="24" rx="12" ry="3.4" fill="#b8323f" stroke="#64131d" strokeWidth="1" />
    <ellipse cx="20" cy="33" rx="16" ry="4.2" fill="#c58a12" stroke="#6a4405" strokeWidth="1" />
    <circle cx="27" cy="22.5" r="2.2" fill="#e3e8f2" stroke="#4b5368" strokeWidth="0.8" />
  </svg>
);

/** Firework Ball Tower: the machine, and its exact odds. Who is playing is passed straight on to the machine. */
export const BallTower = ({ player }: BallTowerProps = {}) => {
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
            <a className={styles.centerLink} href={MEDAL_CENTER_PATH} data-testid="bt-center">
              <span aria-hidden>← </span>
              {t.centerLink}
            </a>
            <h1 className={styles.title}>
              <TitleTower />{' '}
              <span className={styles.titleText}>
                {t.titleParts[0]}
                {language === 'en' ? ' ' : <wbr />}
                {t.titleParts[1]}
              </span>
            </h1>
            <p className={styles.subtitle}>{t.subtitle}</p>
          </div>
          <button type="button" className={styles.btn} aria-haspopup="dialog" data-testid="bt-how-to-play" onClick={() => setInfoOpen(true)}>
            {t.howToPlay}
          </button>
        </div>

        {/* The floor jackpot, live, over the machine: every medal played here by a player on the floor feeds it. */}
        <FloorJackpotStrip game="ball-tower" />

        <div className={`${styles.tabs} ${floorTabs.tabs}`} role="tablist" aria-label={t.title}>
          {tabs.map((tb, index) => (
            <button
              key={tb.id}
              ref={(element) => {
                tabButtons.current[tb.id] = element;
              }}
              type="button"
              role="tab"
              id={`bt-tab-${tb.id}`}
              aria-selected={tab === tb.id}
              aria-controls={`bt-panel-${tb.id}`}
              tabIndex={tab === tb.id ? 0 : -1}
              className={`${styles.tab} ${floorTabs.tab}`}
              onClick={() => setTab(tb.id)}
              onKeyDown={(event) => onTabKeyDown(event, index)}
            >
              {tb.label}
            </button>
          ))}
        </div>

        {/* Both panels stay mounted (the one not shown is hidden), so switching tabs never drops a run under way. */}
        <div role="tabpanel" id="bt-panel-machine" aria-labelledby="bt-tab-machine" hidden={tab !== 'machine'}>
          <PlayTab player={player} active={tab === 'machine' && !infoOpen} />
        </div>
        <div role="tabpanel" id="bt-panel-odds" aria-labelledby="bt-tab-odds" hidden={tab !== 'odds'}>
          <OddsTab />
          {/* What the floor jackpot adds to the medals played here, on top of the machine's own return. Kept out of the tab itself, which never touches the player's medals. */}
          <FloorJackpotOddsNote game="ball-tower" />
        </div>
      </div>

      <InfoModal isOpen={infoOpen} onClose={() => setInfoOpen(false)} title={t.howToPlay}>
        {t.infoBody(percentOf(valueOf(PUBLISHED_BALL_TOWER_ODDS.back), language)).map((p, i) => (
          <p key={i} className={styles.infoP}>
            {p}
          </p>
        ))}
      </InfoModal>
    </div>
  );
};

export default BallTower;
