'use client';

import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import type { AccountStore } from './account';
import { BonusDot } from './DailyBonus';
import { POUR } from './hopper';
import { getStrings } from './i18n';
import { InstructionPlateDialog, PlateSwitch } from './InstructionPlate';
import { OddsTab } from './OddsTab';
import { PlayTab, type PlayTabProps } from './PlayTab';
import { records } from './recordsStore';
import { RecordsTab } from './RecordsTab';
import { MAX_STOCK } from './session';
import { SimTab } from './SimTab';
import { getWorksStrings } from './worksStrings';
import styles from './MedalPusher.module.css';

type Tab = 'machine' | 'odds' | 'sim' | 'records';

export interface MedalPusherProps extends Pick<PlayTabProps, 'player' | 'store' | 'signInHref'> {
  /** The account's store for the record book, which is a document of its own beside the machine. Without one the book is this device's alone. */
  recordsStore?: AccountStore | null;
}

/** The game. Who is playing and where their machine is kept is the cabinet's business: it is passed straight on. */
export const MedalPusher = ({ player, store, signInHref, recordsStore = null }: MedalPusherProps = {}) => {
  const [tab, setTab] = useState<Tab>('machine');
  // The record book follows the player as the machine does. It is told who they are before anything on the page
  // listens to it (a layout effect runs before the effects that listen), so the first book it opens is theirs.
  const { uid = null, settled = true, expected = false } = player ?? {};
  useLayoutEffect(() => {
    records.attend({ uid, settled, expected }, recordsStore);
  }, [uid, settled, expected, recordsStore]);
  const [infoOpen, setInfoOpen] = useState(false);
  const { language } = useGameLanguage();
  const t = getStrings(language);

  const tabs: { id: Tab; label: string }[] = [
    { id: 'machine', label: t.tabMachine },
    { id: 'odds', label: t.tabOdds },
    { id: 'sim', label: t.tabSim },
    { id: 'records', label: t.tabRecords },
  ];
  const tabButtons = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({});

  // The standard tab pattern: one tab stop, and the arrow keys, Home and End move between tabs.
  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = tabs.length - 1;
    const next =
      event.key === 'ArrowRight'
        ? (index + 1) % tabs.length
        : event.key === 'ArrowLeft'
          ? (index + last) % tabs.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : null;
    if (next === null) return;
    event.preventDefault();
    setTab(tabs[next].id);
    tabButtons.current[tabs[next].id]?.focus();
  };

  return (
    <div className={styles.root}>
      <div className={styles.shell}>
        <div className={styles.header}>
          <div style={{ flex: 1 }}>
            <h1 className={styles.title}>
              <span aria-hidden>🪙</span> {t.title}
            </h1>
            <p className={styles.subtitle}>{t.subtitle}</p>
          </div>
          <button type="button" className={styles.btn} aria-haspopup="dialog" data-testid="pusher-how-to-play" onClick={() => setInfoOpen(true)}>
            {t.howToPlay}
          </button>
        </div>

        <div className={styles.tabs} role="tablist" aria-label={t.title}>
          {tabs.map((tb, index) => (
            <button
              key={tb.id}
              ref={(element) => {
                tabButtons.current[tb.id] = element;
              }}
              type="button"
              role="tab"
              id={`pusher-tab-${tb.id}`}
              aria-selected={tab === tb.id}
              aria-controls={`pusher-panel-${tb.id}`}
              tabIndex={tab === tb.id ? 0 : -1}
              className={styles.tab}
              onClick={() => setTab(tb.id)}
              onKeyDown={(event) => onTabKeyDown(event, index)}
            >
              {tb.label}
              {tb.id === 'records' && <BonusDot />}
            </button>
          ))}
        </div>

        {/* Every panel stays mounted (inactive ones are hidden) so switching tabs never
            resets the machine or drops a finished simulation. The machine only runs while its tab is showing. */}
        <div role="tabpanel" id="pusher-panel-machine" aria-labelledby="pusher-tab-machine" hidden={tab !== 'machine'}>
          {/* The compact instruction plate on the cabinet opens the full one, which is held here. */}
          <PlateSwitch.Provider value={setInfoOpen}>
            <PlayTab active={tab === 'machine'} player={player} store={store} signInHref={signInHref} />
          </PlateSwitch.Provider>
        </div>
        <div role="tabpanel" id="pusher-panel-odds" aria-labelledby="pusher-tab-odds" hidden={tab !== 'odds'}>
          <OddsTab />
        </div>
        <div role="tabpanel" id="pusher-panel-sim" aria-labelledby="pusher-tab-sim" hidden={tab !== 'sim'}>
          <SimTab />
        </div>
        <div role="tabpanel" id="pusher-panel-records" aria-labelledby="pusher-tab-records" hidden={tab !== 'records'}>
          <RecordsTab />
        </div>
      </div>

      <InstructionPlateDialog
        isOpen={infoOpen}
        onClose={() => setInfoOpen(false)}
        title={t.howToPlay}
        body={[...t.infoBody(MAX_STOCK), ...getWorksStrings(language).howItPays(POUR.threshold)]}
      />

    </div>
  );
};

export default MedalPusher;
