'use client';

import { useRef, useState, type KeyboardEvent } from 'react';
import { InfoModal } from '../common';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { FloorJackpotOddsNote, FloorJackpotStrip } from '../MedalCenter/floor/FloorJackpot';
import floorTabs from '../MedalCenter/tabs.module.css';
import { MEDAL_CENTER_PATH } from '../MedalCenter/paths';
import { valueOf } from './engine';
import { getStrings } from './i18n';
import { PUBLISHED_SHOOTING_GALLERY_ODDS } from './published';
import { OddsTab } from './OddsTab';
import { PlayTab, type PlayTabProps } from './PlayTab';
import styles from './ShootingGallery.module.css';

type Tab = 'machine' | 'odds';

/** A return as the rules say it: to two decimals. */
const percentOf = (value: number, language: 'en' | 'ja'): string =>
  `${(value * 100).toLocaleString(language === 'ja' ? 'ja-JP' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

export type ShootingGalleryProps = PlayTabProps;

/** A little picture for the title: a cork in flight at a red lantern. */
const TitleCork = () => (
  <svg className={styles.titleCork} viewBox="0 0 40 40" aria-hidden="true" focusable="false">
    <ellipse cx="25" cy="21" rx="11" ry="14" fill="#e2452e" stroke="#8e1d12" strokeWidth="1.4" />
    <rect x="19" y="5" width="12" height="4" rx="1.5" fill="#1a120c" />
    <rect x="19" y="33" width="12" height="4" rx="1.5" fill="#1a120c" />
    <path d="M 4 25 L 13 24 L 13 30 L 4 29 Z" fill="#c99a62" stroke="#7a5528" strokeWidth="1" />
    <path d="M 1 22 L 0 22 M 2 32 L 0 33" stroke="#9aa4ae" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

/** Onsen Shooting Gallery: the machine, and its exact odds. Who is playing is passed straight on to the machine. */
export const ShootingGallery = ({ player }: ShootingGalleryProps = {}) => {
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
  const odds = PUBLISHED_SHOOTING_GALLERY_ODDS;

  return (
    <div className={styles.root}>
      <div className={styles.shell}>
        <div className={styles.header}>
          <div className={styles.headerText}>
            {/* The machine stands on the medal center's floor, whose front has the medals, the daily bonus and the reset. */}
            <a className={styles.centerLink} href={MEDAL_CENTER_PATH} data-testid="sht-center">
              <span aria-hidden>← </span>
              {t.centerLink}
            </a>
            <h1 className={styles.title}>
              <TitleCork />{' '}
              <span className={styles.titleText}>
                {t.titleParts[0]}
                {language === 'en' ? ' ' : <wbr />}
                {t.titleParts[1]}
              </span>
            </h1>
            <p className={styles.subtitle}>{t.subtitle}</p>
          </div>
          <button type="button" className={styles.btn} aria-haspopup="dialog" data-testid="sht-how-to-play" onClick={() => setInfoOpen(true)}>
            {t.howToPlay}
          </button>
        </div>

        {/* The floor jackpot, live, over the machine: every medal played here by a player on the floor feeds it. */}
        <FloorJackpotStrip game="shooting-gallery" />

        <div className={`${styles.tabs} ${floorTabs.tabs}`} role="tablist" aria-label={t.title}>
          {tabs.map((tb, index) => (
            <button
              key={tb.id}
              ref={(element) => {
                tabButtons.current[tb.id] = element;
              }}
              type="button"
              role="tab"
              id={`sht-tab-${tb.id}`}
              aria-selected={tab === tb.id}
              aria-controls={`sht-panel-${tb.id}`}
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
        <div role="tabpanel" id="sht-panel-machine" aria-labelledby="sht-tab-machine" hidden={tab !== 'machine'}>
          <PlayTab player={player} active={tab === 'machine' && !infoOpen} />
        </div>
        <div role="tabpanel" id="sht-panel-odds" aria-labelledby="sht-tab-odds" hidden={tab !== 'odds'}>
          <OddsTab />
          {/* What the floor jackpot adds to the medals played here, on top of the machine's own return. Kept out of the tab itself, which never touches the player's medals. */}
          <FloorJackpotOddsNote game="shooting-gallery" />
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

export default ShootingGallery;
