'use client';

import { useRef, useState, type KeyboardEvent } from 'react';
import { InfoModal } from '../common';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { FloorJackpotOddsNote, FloorJackpotStrip } from '../MedalCenter/floor/FloorJackpot';
import floorTabs from '../MedalCenter/tabs.module.css';
import { MEDAL_CENTER_PATH } from '../MedalCenter/paths';
import { valueOf } from './analysis';
import { getStrings } from './i18n';
import { PUBLISHED_PACHINKO_ODDS } from './published';
import { OddsTab } from './OddsTab';
import { PlayTab, type PlayTabProps } from './PlayTab';
import styles from './Pachinko.module.css';

type Tab = 'machine' | 'odds';

/** A return as the rules say it: to two decimals. */
const percentOf = (value: number, language: 'en' | 'ja'): string =>
  `${(value * 100).toLocaleString(language === 'ja' ? 'ja-JP' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

export type PachinkoProps = PlayTabProps;

/** A little picture for the title: a red goldfish lantern on its string, and a steel ball. */
const TitleLantern = () => (
  <svg className={styles.titleLantern} viewBox="0 0 40 40" aria-hidden="true" focusable="false">
    <path d="M 18 2 L 18 9" stroke="#8a6a3a" strokeWidth="1.6" />
    <ellipse cx="18" cy="20" rx="11" ry="9" fill="#e8432f" />
    <path d="M 27 20 L 36 13 L 36 27 Z" fill="#e8432f" />
    <path d="M 10 14 Q 18 11 26 14 M 10 26 Q 18 29 26 26" stroke="#ffb199" strokeWidth="1.2" fill="none" />
    <circle cx="13" cy="18" r="1.6" fill="#1a1a1a" />
    <circle cx="9" cy="35" r="3.6" fill="#c3cbd3" />
    <circle cx="8" cy="34" r="1.2" fill="#ffffff" />
  </svg>
);

/** Goldfish Lantern Pachinko: the machine, and its exact returns. Who is playing is passed straight on to the machine. */
export const Pachinko = ({ player }: PachinkoProps = {}) => {
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
  const odds = PUBLISHED_PACHINKO_ODDS;

  return (
    <div className={styles.root}>
      <div className={styles.shell}>
        <div className={styles.header}>
          <div className={styles.headerText}>
            {/* The machine stands on the medal center's floor, whose front has the medals, the daily bonus and the reset. */}
            <a className={styles.centerLink} href={MEDAL_CENTER_PATH} data-testid="pk-center">
              <span aria-hidden>← </span>
              {t.centerLink}
            </a>
            <h1 className={styles.title}>
              <TitleLantern />{' '}
              <span className={styles.titleText}>
                {t.titleParts[0]}
                {language === 'en' ? ' ' : <wbr />}
                {t.titleParts[1]}
              </span>
            </h1>
            <p className={styles.subtitle}>{t.subtitle}</p>
          </div>
          <button type="button" className={styles.btn} aria-haspopup="dialog" data-testid="pk-how-to-play" onClick={() => setInfoOpen(true)}>
            {t.howToPlay}
          </button>
        </div>

        {/* The floor jackpot, live, over the machine: every medal lent here by a player on the floor feeds it. */}
        <FloorJackpotStrip game="pachinko" />

        <div className={`${styles.tabs} ${floorTabs.tabs}`} role="tablist" aria-label={t.title}>
          {tabs.map((tb, index) => (
            <button
              key={tb.id}
              ref={(element) => {
                tabButtons.current[tb.id] = element;
              }}
              type="button"
              role="tab"
              id={`pk-tab-${tb.id}`}
              aria-selected={tab === tb.id}
              aria-controls={`pk-panel-${tb.id}`}
              tabIndex={tab === tb.id ? 0 : -1}
              className={`${styles.tab} ${floorTabs.tab}`}
              onClick={() => setTab(tb.id)}
              onKeyDown={(event) => onTabKeyDown(event, index)}
            >
              {tb.label}
            </button>
          ))}
        </div>

        {/* Both panels stay mounted (the one not shown is hidden), so switching tabs never drops a ball on its way. */}
        <div role="tabpanel" id="pk-panel-machine" aria-labelledby="pk-tab-machine" hidden={tab !== 'machine'}>
          <PlayTab player={player} active={tab === 'machine' && !infoOpen} />
        </div>
        <div role="tabpanel" id="pk-panel-odds" aria-labelledby="pk-tab-odds" hidden={tab !== 'odds'}>
          <OddsTab />
          {/* What the floor jackpot adds to the medals lent here, on top of the machine's own return. Kept out of the tab itself, which never touches the player's medals. */}
          <FloorJackpotOddsNote game="pachinko" />
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

export default Pachinko;
