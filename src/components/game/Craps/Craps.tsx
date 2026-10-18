'use client';

import Link from 'next/link';
import { useLayoutEffect, useState } from 'react';
import { InfoModal } from '../common';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { bank as medalBank } from '../MedalCenter/bank';
import { MEDAL_CENTER_PATH } from '../MedalCenter/paths';
import type { AccountStore, Player } from '../MedalPusher/account';
import { getStrings } from './i18n';
import { OddsTab } from './OddsTab';
import { PlayTab } from './PlayTab';
import { SimTab } from './SimTab';
import styles from './Craps.module.css';
import { FloorJackpotOddsNote, FloorJackpotStrip } from '../MedalCenter/floor/FloorJackpot';
import floorTabs from '../MedalCenter/tabs.module.css';

type Tab = 'play' | 'odds' | 'sim';

export interface CrapsProps {
  /** Who is playing. Without one, a guest on this device. */
  player?: Player;
  /** The account's store for the medals of the Medal Game Center. Without one, the medals are this device's alone. */
  bankStore?: AccountStore | null;
  /** Where the account keeps what the Medal Pusher kept before the medals were shared, read once by the medals (bank.ts). */
  legacy?: { machines?: AccountStore | null; books?: AccountStore | null };
}

export const Craps = ({ player, bankStore = null, legacy }: CrapsProps = {}) => {
  const [tab, setTab] = useState<Tab>('play');
  const [infoOpen, setInfoOpen] = useState(false);
  const { language } = useGameLanguage();
  const t = getStrings(language);

  // The medals follow the player. They are told who is playing before anything on the page listens to them (a layout
  // effect runs before the effects that listen), so the first medals the table opens are the player's.
  const { uid = null, settled = true, expected = false } = player ?? {};
  const machines = legacy?.machines ?? null;
  const books = legacy?.books ?? null;
  useLayoutEffect(() => {
    medalBank().attend({ uid, settled, expected }, bankStore, bankStore ? { machines, books } : {});
  }, [uid, settled, expected, bankStore, machines, books]);

  const tabs: { id: Tab; label: string }[] = [
    { id: 'play', label: t.tabPlay },
    { id: 'odds', label: t.tabOdds },
    { id: 'sim', label: t.tabSim },
  ];

  return (
    <div className={styles.root}>
      <div className={styles.shell}>
        <div className={styles.header}>
          <div style={{ flex: 1 }}>
            {/* The table stands on the floor of the Medal Game Center, whose front has the medals, the daily bonus and the reset. */}
            <Link className={styles.centerLink} href={MEDAL_CENTER_PATH} data-testid="craps-center">
              <span aria-hidden>← </span>
              {t.centerLink}
            </Link>
            <h1 className={styles.title}>
              <span aria-hidden>🎲</span> {t.title}
            </h1>
            <p className={styles.subtitle}>{t.subtitle}</p>
          </div>
          <button type="button" className={styles.btn} onClick={() => setInfoOpen(true)}>
            {t.howToPlay}
          </button>
        </div>

        {/* The floor jackpot, live, over the machine: every medal played here by a player on the floor feeds it. */}
        <FloorJackpotStrip />

        <div className={`${styles.tabs} ${floorTabs.tabs}`} role="tablist" aria-label={t.title}>
          {tabs.map((tb) => (
            <button
              key={tb.id}
              type="button"
              role="tab"
              id={`craps-tab-${tb.id}`}
              aria-selected={tab === tb.id}
              aria-controls={`craps-panel-${tb.id}`}
              className={`${styles.tab} ${floorTabs.tab}`}
              onClick={() => setTab(tb.id)}
            >
              {tb.label}
            </button>
          ))}
        </div>

        {/* Every panel stays mounted (inactive ones are hidden) so switching tabs
            never drops the table or a roll that is still tumbling. */}
        <div role="tabpanel" id="craps-panel-play" aria-labelledby="craps-tab-play" hidden={tab !== 'play'}>
          <PlayTab settled={settled} active={tab === 'play'} />
        </div>
        <div role="tabpanel" id="craps-panel-odds" aria-labelledby="craps-tab-odds" hidden={tab !== 'odds'}>
          <OddsTab />
          {/* What the floor jackpot adds to the medals played here, on top of the machine's own return. Kept out of the tab itself, which never touches the player's medals. */}
          <FloorJackpotOddsNote />
        </div>
        <div role="tabpanel" id="craps-panel-sim" aria-labelledby="craps-tab-sim" hidden={tab !== 'sim'}>
          <SimTab />
        </div>
      </div>

      <InfoModal isOpen={infoOpen} onClose={() => setInfoOpen(false)} title={t.howToPlay}>
        {t.infoBody.map((p, i) => (
          <p key={i} className={styles.infoP}>
            {p}
          </p>
        ))}
      </InfoModal>
    </div>
  );
};

export default Craps;
