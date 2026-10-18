'use client';

import { useRef, useState, type KeyboardEvent } from 'react';
import { InfoModal } from '../common';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { FloorJackpotOddsNote, FloorJackpotStrip } from '../MedalCenter/floor/FloorJackpot';
import { MEDAL_CENTER_PATH } from '../MedalCenter/paths';
import floorTabs from '../MedalCenter/tabs.module.css';
import { MOST_BACK_PER_MEDAL } from './engine';
import { SPOT_MAX } from './medalTable';
import { getStrings } from './i18n';
import { OddsTab } from './OddsTab';
import { PlayTab, type PlayTabProps } from './PlayTab';
import { DieFace } from './Dice';
import styles from './SicBo.module.css';

type Tab = 'table' | 'odds';

export type SicBoProps = PlayTabProps;

/** A little picture for the title: three dice under the moon. */
const TitleDice = () => (
  <span className={styles.titleDice} aria-hidden="true">
    <DieFace face={4} className={styles.titleDie} />
    <DieFace face={5} className={styles.titleDie} />
    <DieFace face={6} className={styles.titleDie} />
  </span>
);

/** Moonlit Sic Bo: the table, and its exact odds. Who is playing is passed straight on to the table. */
export const SicBo = ({ player }: SicBoProps = {}) => {
  const [tab, setTab] = useState<Tab>('table');
  const [infoOpen, setInfoOpen] = useState(false);
  const { language } = useGameLanguage();
  const t = getStrings(language);
  const tabs: { id: Tab; label: string }[] = [
    { id: 'table', label: t.tabTable },
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
            {/* The table stands on the medal center's floor, whose front has the medals, the daily bonus and the reset. */}
            <a className={styles.centerLink} href={MEDAL_CENTER_PATH} data-testid="sb-center">
              <span aria-hidden>← </span>
              {t.centerLink}
            </a>
            <h1 className={styles.title}>
              <TitleDice />{' '}
              <span className={styles.titleText}>
                {t.titleParts[0]}
                {language === 'en' ? ' ' : <wbr />}
                {t.titleParts[1]}
              </span>
            </h1>
            <p className={styles.subtitle}>{t.subtitle}</p>
          </div>
          <button type="button" className={styles.btn} aria-haspopup="dialog" data-testid="sb-how-to-play" onClick={() => setInfoOpen(true)}>
            {t.howToPlay}
          </button>
        </div>

        {/* The floor jackpot, live, over the machine: every medal played here by a player on the floor feeds it. */}
        <FloorJackpotStrip game="sic-bo" />

        <div className={`${styles.tabs} ${floorTabs.tabs}`} role="tablist" aria-label={t.title}>
          {tabs.map((tb, index) => (
            <button
              key={tb.id}
              ref={(element) => {
                tabButtons.current[tb.id] = element;
              }}
              type="button"
              role="tab"
              id={`sb-tab-${tb.id}`}
              aria-selected={tab === tb.id}
              aria-controls={`sb-panel-${tb.id}`}
              tabIndex={tab === tb.id ? 0 : -1}
              className={`${styles.tab} ${floorTabs.tab}`}
              onClick={() => setTab(tb.id)}
              onKeyDown={(event) => onTabKeyDown(event, index)}
            >
              {tb.label}
            </button>
          ))}
        </div>

        {/* Both panels stay mounted (the one not shown is hidden), so switching tabs never drops a roll under way. */}
        <div role="tabpanel" id="sb-panel-table" aria-labelledby="sb-tab-table" hidden={tab !== 'table'}>
          <PlayTab player={player} active={tab === 'table' && !infoOpen} />
        </div>
        <div role="tabpanel" id="sb-panel-odds" aria-labelledby="sb-tab-odds" hidden={tab !== 'odds'}>
          <OddsTab />
          {/* What the floor jackpot adds to the medals played here, on top of the machine's own return. Kept out of the tab itself, which never touches the player's medals. */}
          <FloorJackpotOddsNote game="sic-bo" />
        </div>
      </div>

      <InfoModal isOpen={infoOpen} onClose={() => setInfoOpen(false)} title={t.howToPlay}>
        {t.infoBody(MOST_BACK_PER_MEDAL * SPOT_MAX).map((p, i) => (
          <p key={i} className={styles.infoP}>
            {p}
          </p>
        ))}
      </InfoModal>
    </div>
  );
};

export default SicBo;
