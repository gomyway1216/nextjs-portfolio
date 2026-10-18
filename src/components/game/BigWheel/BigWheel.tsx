'use client';

import { useRef, useState, type KeyboardEvent } from 'react';
import { InfoModal } from '../common';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { FloorJackpotOddsNote, FloorJackpotStrip } from '../MedalCenter/floor/FloorJackpot';
import { MEDAL_CENTER_PATH } from '../MedalCenter/paths';
import floorTabs from '../MedalCenter/tabs.module.css';
import { SPOT_MAX } from './medalTable';
import { TOP_MULTIPLE, WHEEL } from './engine';
import { getStrings } from './i18n';
import { OddsTab } from './OddsTab';
import { PlayTab, type PlayTabProps } from './PlayTab';
import { lookOf } from './Wheel';
import styles from './BigWheel.module.css';

type Tab = 'machine' | 'odds';

export type BigWheelProps = PlayTabProps;

/** A little picture of the wheel for the title: its segments in their colours round a gold hub. */
const TitleWheel = () => (
  <svg className={styles.titleWheel} viewBox="-20 -20 40 40" aria-hidden="true" focusable="false">
    {WHEEL.map((segment, i) => {
      const a0 = ((i - 0.5) * 2 * Math.PI) / WHEEL.length;
      const a1 = ((i + 0.5) * 2 * Math.PI) / WHEEL.length;
      const d = `M0 0L${(19 * Math.sin(a0)).toFixed(2)} ${(-19 * Math.cos(a0)).toFixed(2)}A19 19 0 0 1 ${(19 * Math.sin(a1)).toFixed(2)} ${(-19 * Math.cos(a1)).toFixed(2)}Z`;
      return <path key={i} d={d} fill={lookOf(segment).fill} />;
    })}
    <circle r={19} fill="none" stroke="#d2a23c" strokeWidth={1.6} />
    <circle r={6.5} fill="#17134a" stroke="#d2a23c" strokeWidth={1.4} />
    <path d="M-3 -20 L3 -20 L0 -14 Z" fill="#d2a23c" />
  </svg>
);

/** The Star Festival Big Wheel: the machine, and its exact odds. Who is playing is passed straight on to the machine. */
export const BigWheel = ({ player }: BigWheelProps = {}) => {
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
            <a className={styles.centerLink} href={MEDAL_CENTER_PATH} data-testid="bw-center">
              <span aria-hidden>← </span>
              {t.centerLink}
            </a>
            <h1 className={styles.title}>
              <TitleWheel />{' '}
              <span className={styles.titleText}>
                {t.titleParts[0]}
                {language === 'en' ? ' ' : <wbr />}
                {t.titleParts[1]}
              </span>
            </h1>
            <p className={styles.subtitle}>{t.subtitle}</p>
          </div>
          <button type="button" className={styles.btn} aria-haspopup="dialog" data-testid="bw-how-to-play" onClick={() => setInfoOpen(true)}>
            {t.howToPlay}
          </button>
        </div>

        {/* The floor jackpot, live, over the machine: every medal played here by a player on the floor feeds it. */}
        <FloorJackpotStrip game="big-wheel" />

        <div className={`${styles.tabs} ${floorTabs.tabs}`} role="tablist" aria-label={t.title}>
          {tabs.map((tb, index) => (
            <button
              key={tb.id}
              ref={(element) => {
                tabButtons.current[tb.id] = element;
              }}
              type="button"
              role="tab"
              id={`bw-tab-${tb.id}`}
              aria-selected={tab === tb.id}
              aria-controls={`bw-panel-${tb.id}`}
              tabIndex={tab === tb.id ? 0 : -1}
              className={`${styles.tab} ${floorTabs.tab}`}
              onClick={() => setTab(tb.id)}
              onKeyDown={(event) => onTabKeyDown(event, index)}
            >
              {tb.label}
            </button>
          ))}
        </div>

        {/* Both panels stay mounted (the one not shown is hidden), so switching tabs never drops a spin under way. */}
        <div role="tabpanel" id="bw-panel-machine" aria-labelledby="bw-tab-machine" hidden={tab !== 'machine'}>
          <PlayTab player={player} active={tab === 'machine' && !infoOpen} />
        </div>
        <div role="tabpanel" id="bw-panel-odds" aria-labelledby="bw-tab-odds" hidden={tab !== 'odds'}>
          <OddsTab />
          {/* What the floor jackpot adds to the medals played here, on top of the machine's own return. Kept out of the tab itself, which never touches the player's medals. */}
          <FloorJackpotOddsNote game="big-wheel" />
        </div>
      </div>

      <InfoModal isOpen={infoOpen} onClose={() => setInfoOpen(false)} title={t.howToPlay}>
        {t.infoBody(TOP_MULTIPLE * SPOT_MAX).map((p, i) => (
          <p key={i} className={styles.infoP}>
            {p}
          </p>
        ))}
      </InfoModal>
    </div>
  );
};

export default BigWheel;
