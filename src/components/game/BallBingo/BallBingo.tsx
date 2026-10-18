'use client';

import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { InfoModal } from '../common';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import type { AccountStore, Player } from '../MedalPusher/account';
import { bank as medalBank } from '../MedalCenter/bank';
import { MEDAL_CENTER_PATH } from '../MedalCenter/paths';
import floorTabs from '../MedalCenter/tabs.module.css';
import { analyzeMachine } from './engine';
import { getStrings } from './i18n';
import { OddsTab } from './OddsTab';
import { PlayTab } from './PlayTab';
import styles from './BallBingo.module.css';
import { FloorJackpotOddsNote, FloorJackpotStrip } from '../MedalCenter/floor/FloorJackpot';

type Tab = 'machine' | 'odds';

const RTP_LABEL = `${(analyzeMachine().rtp * 100).toFixed(2)}%`;

export interface BallBingoProps {
  /** Who is playing. Without one the medals are this device's guest's. */
  player?: Player;
  /** The account's store for the medals, which every machine at the medal center plays with. Without one they are this device's alone. */
  bankStore?: AccountStore | null;
  /** Where the account keeps what the Medal Pusher held before there was a medal center, read once whichever page opens first. */
  legacyStores?: { machines: AccountStore | null; books: AccountStore | null };
}

/** The title's ball: a steel ball in a numbered pocket. */
const TitleBall = () => (
  <svg className={styles.titleBall} viewBox="0 0 40 40" aria-hidden focusable="false">
    <defs>
      <radialGradient id="bb-title-ball" cx="35%" cy="30%" r="70%">
        <stop offset="0%" stopColor="#ffffff" />
        <stop offset="40%" stopColor="#d5dae3" />
        <stop offset="100%" stopColor="#4b5262" />
      </radialGradient>
    </defs>
    <rect x="3" y="20" width="34" height="16" rx="4" fill="#1d2a7a" />
    <circle cx="20" cy="18" r="12" fill="url(#bb-title-ball)" />
    <text x="20" y="34" textAnchor="middle" fontSize="8" fontWeight="800" fill="#ffd34d">
      5
    </text>
  </svg>
);

/** Ball Bingo: the machine, and its exact odds. */
export const BallBingo = ({ player, bankStore = null, legacyStores }: BallBingoProps = {}) => {
  const [tab, setTab] = useState<Tab>('machine');
  const [infoOpen, setInfoOpen] = useState(false);
  const { language } = useGameLanguage();
  const t = getStrings(language);

  // The medals follow the player. The bank is told who they are before anything on the page listens to it (a layout
  // effect runs before the effects that do), so the first medals it opens are theirs.
  const { uid = null, settled = true, expected = false } = player ?? {};
  const machines = legacyStores?.machines ?? null;
  const books = legacyStores?.books ?? null;
  useLayoutEffect(() => {
    medalBank().attend({ uid, settled, expected }, bankStore, bankStore ? { machines, books } : {});
  }, [uid, settled, expected, bankStore, machines, books]);

  const tabs: { id: Tab; label: string }[] = [
    { id: 'machine', label: t.tabMachine },
    { id: 'odds', label: t.tabOdds },
  ];
  const tabButtons = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({});
  // The standard tab pattern: one tab stop, and the arrow keys, Home and End move between tabs.
  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = tabs.length - 1;
    const next =
      event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index + last) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? last : null;
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
            <a className={styles.centerLink} href={MEDAL_CENTER_PATH} data-testid="bingo-center">
              <span aria-hidden>← </span>
              {t.centerLink}
            </a>
            <h1 className={styles.title}>
              <TitleBall /> {t.title}
            </h1>
            <p className={styles.subtitle}>{t.subtitle}</p>
          </div>
          <button type="button" className={styles.btn} aria-haspopup="dialog" data-testid="bingo-how-to-play" onClick={() => setInfoOpen(true)}>
            {t.howToPlay}
          </button>
        </div>

        {/* The floor jackpot, live, over the machine: every medal played here by a player on the floor feeds it. */}
        <FloorJackpotStrip game="ball-bingo" />

        <div className={`${styles.tabs} ${floorTabs.tabs}`} role="tablist" aria-label={t.title}>
          {tabs.map((tb, index) => (
            <button
              key={tb.id}
              ref={(element) => {
                tabButtons.current[tb.id] = element;
              }}
              type="button"
              role="tab"
              id={`bingo-tab-${tb.id}`}
              aria-selected={tab === tb.id}
              aria-controls={`bingo-panel-${tb.id}`}
              tabIndex={tab === tb.id ? 0 : -1}
              className={`${styles.tab} ${floorTabs.tab}`}
              onClick={() => setTab(tb.id)}
              onKeyDown={(event) => onTabKeyDown(event, index)}
            >
              {tb.label}
            </button>
          ))}
        </div>

        {/* Both panels stay mounted (the one not shown is hidden), so switching tabs never drops a game in play. */}
        <div role="tabpanel" id="bingo-panel-machine" aria-labelledby="bingo-tab-machine" hidden={tab !== 'machine'}>
          <PlayTab player={player ? { uid, settled } : undefined} active={tab === 'machine' && !infoOpen} />
        </div>
        <div role="tabpanel" id="bingo-panel-odds" aria-labelledby="bingo-tab-odds" hidden={tab !== 'odds'}>
          <OddsTab />
          {/* What the floor jackpot adds to the medals played here, on top of the machine's own return. Kept out of the tab itself, which never touches the player's medals. */}
          <FloorJackpotOddsNote game="ball-bingo" />
        </div>
      </div>

      <InfoModal isOpen={infoOpen} onClose={() => setInfoOpen(false)} title={t.howToPlay}>
        {t.infoBody(RTP_LABEL).map((p, i) => (
          <p key={i} className={styles.infoP}>
            {p}
          </p>
        ))}
      </InfoModal>
    </div>
  );
};

export default BallBingo;
