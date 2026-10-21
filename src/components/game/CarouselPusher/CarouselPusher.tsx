'use client';

import { useRef, useState, type KeyboardEvent } from 'react';
import { InfoModal } from '../common';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { FloorJackpotOddsNote, FloorJackpotStrip } from '../MedalCenter/floor/FloorJackpot';
import floorTabs from '../MedalCenter/tabs.module.css';
import { MEDAL_CENTER_PATH } from '../MedalCenter/paths';
import { getStrings } from './i18n';
import { PUBLISHED_CAROUSEL } from './published';
import { OddsTab } from './OddsTab';
import { PlayTab, type PlayTabProps } from './PlayTab';
import styles from './CarouselPusher.module.css';

type Tab = 'machine' | 'odds';

/** A return as the page says it: to one decimal. */
const percentOf = (value: number, language: 'en' | 'ja'): string =>
  `${(value * 100).toLocaleString(language === 'ja' ? 'ja-JP' : 'en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

export type CarouselPusherProps = PlayTabProps;

/** A little picture for the title: a carousel's canopy on its pole, a blossom on top. */
const TitleCarousel = () => (
  <svg className={styles.titleIcon} viewBox="0 0 40 40" aria-hidden="true" focusable="false">
    <path d="M 6 15 Q 20 3 34 15 Z" fill="#d0335c" />
    <path d="M 6 15 L 34 15 L 33 18 L 7 18 Z" fill="#e8b84a" />
    <rect x="18.6" y="17" width="2.8" height="16" fill="#e8b84a" />
    <ellipse cx="20" cy="34" rx="13" ry="3.4" fill="#b8325a" />
    <ellipse cx="20" cy="33" rx="13" ry="3" fill="#f7d5e1" />
    <circle cx="20" cy="6" r="2.6" fill="#fbe9ef" />
    <circle cx="20" cy="6" r="1" fill="#f08fae" />
  </svg>
);

/** Cherry Blossom Carousel: the machine, and its measured returns. Who is playing is passed straight on to the machine. */
export const CarouselPusher = ({ player }: CarouselPusherProps = {}) => {
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
  const ways = PUBLISHED_CAROUSEL.ways;

  return (
    <div className={styles.root}>
      <div className={styles.shell}>
        <div className={styles.header}>
          <div className={styles.headerText}>
            {/* The machine stands on the medal center's floor, whose front has the medals, the daily bonus and the reset. */}
            <a className={styles.centerLink} href={MEDAL_CENTER_PATH} data-testid="cp-center">
              <span aria-hidden>← </span>
              {t.centerLink}
            </a>
            <h1 className={styles.title}>
              <TitleCarousel />{' '}
              <span className={styles.titleText}>
                {t.titleParts[0]}
                {language === 'en' ? ' ' : <wbr />}
                {t.titleParts[1]}
              </span>
            </h1>
            <p className={styles.subtitle}>{t.subtitle}</p>
          </div>
          <button type="button" className={styles.btn} aria-haspopup="dialog" data-testid="cp-how-to-play" onClick={() => setInfoOpen(true)}>
            {t.howToPlay}
          </button>
        </div>

        {/* The floor jackpot, live, over the machine: every medal dropped here by a player on the floor feeds it. */}
        <FloorJackpotStrip game="carousel-pusher" />

        <div className={`${styles.tabs} ${floorTabs.tabs}`} role="tablist" aria-label={t.title}>
          {tabs.map((tb, index) => (
            <button
              key={tb.id}
              ref={(element) => {
                tabButtons.current[tb.id] = element;
              }}
              type="button"
              role="tab"
              id={`cp-tab-${tb.id}`}
              aria-selected={tab === tb.id}
              aria-controls={`cp-panel-${tb.id}`}
              tabIndex={tab === tb.id ? 0 : -1}
              className={`${styles.tab} ${floorTabs.tab}`}
              onClick={() => setTab(tb.id)}
              onKeyDown={(event) => onTabKeyDown(event, index)}
            >
              {tb.label}
            </button>
          ))}
        </div>

        {/* Both panels stay mounted (the one not shown is hidden), so switching tabs never loses a medal on its way. */}
        <div role="tabpanel" id="cp-panel-machine" aria-labelledby="cp-tab-machine" hidden={tab !== 'machine'}>
          <PlayTab player={player} active={tab === 'machine' && !infoOpen} />
        </div>
        <div role="tabpanel" id="cp-panel-odds" aria-labelledby="cp-tab-odds" hidden={tab !== 'odds'}>
          <OddsTab />
          {/* What the floor jackpot adds to the medals dropped here, on top of the machine's own return. Kept out of the tab itself, which never touches the player's medals. */}
          <FloorJackpotOddsNote game="carousel-pusher" />
        </div>
      </div>

      <InfoModal isOpen={infoOpen} onClose={() => setInfoOpen(false)} title={t.howToPlay}>
        {t.infoBody(percentOf(ways.timed.return, language), percentOf(ways.steady.return, language), percentOf(ways.held.return, language)).map((p, i) => (
          <p key={i} className={styles.infoP}>
            {p}
          </p>
        ))}
      </InfoModal>
    </div>
  );
};

export default CarouselPusher;
