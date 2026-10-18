'use client';

import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { InfoModal } from '../common';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { bank as medalBank } from '../MedalCenter/bank';
import { FloorJackpotOddsNote, FloorJackpotStrip } from '../MedalCenter/floor/FloorJackpot';
import { MEDAL_CENTER_PATH } from '../MedalCenter/paths';
import floorTabs from '../MedalCenter/tabs.module.css';
import type { AccountStore } from '../MedalPusher/account';
import { FishArt } from './art';
import { Cabinet } from './Cabinet';
import { MOST_MEDALS } from './engine';
import { getStrings } from './i18n';
import { OddsTab } from './OddsTab';
import styles from './Fishing.module.css';

type Tab = 'machine' | 'odds';

export interface FishingProps {
  /** Who is playing, as the site says. Without one, a guest. */
  player?: { uid: string | null; settled: boolean; expected: boolean };
  /** The account's store for the medals, which every machine at the medal center plays with. Without one they are this device's alone. */
  bankStore?: AccountStore | null;
  /** Where the account keeps what the Medal Pusher kept before the medal center: read once, for the medals and the bonus days it held. */
  legacyStores?: { machines: AccountStore | null; books: AccountStore | null };
}

/** Big Catch Harbor: the machine, and its exact odds. */
export const Fishing = ({ player, bankStore = null, legacyStores }: FishingProps = {}) => {
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
            <a className={styles.centerLink} href={MEDAL_CENTER_PATH} data-testid="fishing-center">
              <span aria-hidden>← </span>
              {t.centerLink}
            </a>
            <h1 className={styles.title}>
              <FishArt id="tuna" className={styles.titleFish} /> {t.title}
            </h1>
            <p className={styles.subtitle}>{t.subtitle}</p>
          </div>
          <button type="button" className={styles.btn} aria-haspopup="dialog" data-testid="fishing-how-to-play" onClick={() => setInfoOpen(true)}>
            {t.howToPlay}
          </button>
        </div>

        {/* The floor jackpot, live, over the machine: every medal played here by a player on the floor feeds it. */}
        <FloorJackpotStrip game="fishing" />

        <div className={`${styles.tabs} ${floorTabs.tabs}`} role="tablist" aria-label={t.title}>
          {tabs.map((tb, index) => (
            <button
              key={tb.id}
              ref={(element) => {
                tabButtons.current[tb.id] = element;
              }}
              type="button"
              role="tab"
              id={`fishing-tab-${tb.id}`}
              aria-selected={tab === tb.id}
              aria-controls={`fishing-panel-${tb.id}`}
              tabIndex={tab === tb.id ? 0 : -1}
              className={`${styles.tab} ${floorTabs.tab}`}
              onClick={() => setTab(tb.id)}
              onKeyDown={(event) => onTabKeyDown(event, index)}
            >
              {tb.label}
            </button>
          ))}
        </div>

        {/* Both panels stay mounted (the one not shown is hidden), so switching tabs never drops a cast on the line. */}
        <div role="tabpanel" id="fishing-panel-machine" aria-labelledby="fishing-tab-machine" hidden={tab !== 'machine'}>
          <Cabinet player={player ? { uid, settled } : undefined} active={tab === 'machine' && !infoOpen} />
        </div>
        <div role="tabpanel" id="fishing-panel-odds" aria-labelledby="fishing-tab-odds" hidden={tab !== 'odds'}>
          <OddsTab />
          {/* What the floor jackpot adds to the medals played here, on top of the machine's own return. Kept out of the tab itself, which never touches the player's medals. */}
          <FloorJackpotOddsNote game="fishing" />
        </div>
      </div>

      <InfoModal isOpen={infoOpen} onClose={() => setInfoOpen(false)} title={t.howToPlay}>
        {t.infoBody(MOST_MEDALS).map((p, i) => (
          <p key={i} className={styles.infoP}>
            {p}
          </p>
        ))}
      </InfoModal>
    </div>
  );
};

export default Fishing;
