'use client';

import { useCallback, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { bank as medalBank } from '../MedalCenter/bank';
import { MEDAL_CENTER_PATH } from '../MedalCenter/paths';
import type { AccountStore } from './account';
import { BonusDot } from './DailyBonus';
import { POUR } from './hopper';
import { FACE_STAR, MEDAL_PAINT } from './medalLook';
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
import { FloorJackpotOddsNote, FloorJackpotStrip } from '../MedalCenter/floor/FloorJackpot';

type Tab = 'machine' | 'odds' | 'sim' | 'records';

/** The star on the title's medal, in its view box: the one struck on every medal (medalLook.ts). */
const TITLE_STAR = FACE_STAR.map(([x, y]) => `${(16 + x * 15).toFixed(2)},${(16 + y * 15).toFixed(2)}`).join(' ');

/** The title's medal: one of the machine's own, copper-nickel with a raised rim and its star, where a coin emoji would be gold. */
const TitleMedal = () => (
  <svg className={styles.titleMedal} viewBox="0 0 32 32" aria-hidden focusable="false">
    <circle cx="16" cy="16" r="15" fill={MEDAL_PAINT.face} stroke={MEDAL_PAINT.edge} strokeWidth="1.4" />
    <circle cx="16" cy="16" r="12.2" fill="none" stroke={MEDAL_PAINT.light} strokeWidth="1.6" />
    <circle cx="16.4" cy="16.5" r="12.2" fill="none" stroke={MEDAL_PAINT.rim} strokeWidth="0.8" opacity="0.7" />
    <polygon points={TITLE_STAR} fill={MEDAL_PAINT.dark} />
  </svg>
);

export interface MedalPusherProps extends Pick<PlayTabProps, 'player' | 'store' | 'signInHref'> {
  /** The account's store for the record book, which is a document of its own beside the machine. Without one the book is this device's alone. */
  recordsStore?: AccountStore | null;
  /** The account's store for the medal bank, which every game at the medal center plays from. Without one the bank is this device's alone. */
  bankStore?: AccountStore | null;
}

/** The game. Who is playing and where their machine is kept is the cabinet's business: it is passed straight on. */
export const MedalPusher = ({ player, store, signInHref, recordsStore = null, bankStore = null }: MedalPusherProps = {}) => {
  const [tab, setTab] = useState<Tab>('machine');
  // The record book and the medal bank follow the player as the machine does. They are told who they are before
  // anything on the page listens to them (a layout effect runs before the effects that listen), so the first book and
  // the first bank they open are theirs. The bank is told where the machine is kept on the account too: a machine
  // from before the bank may have had a purse, which is moved into the bank once.
  const { uid = null, settled = true, expected = false } = player ?? {};
  useLayoutEffect(() => {
    records.attend({ uid, settled, expected }, recordsStore);
    medalBank().attend({ uid, settled, expected }, bankStore, bankStore ? { machines: store ?? null, books: recordsStore } : {});
  }, [uid, settled, expected, recordsStore, bankStore, store]);
  const [infoOpen, setInfoOpen] = useState(false);
  // What opened the instruction plate (How to play, or the compact plate on the cabinet), which has the focus back after.
  const plateOpener = useRef<HTMLElement | null>(null);
  const openPlate = useCallback((open: boolean, opener?: HTMLElement | null) => {
    if (open) plateOpener.current = opener ?? null;
    setInfoOpen(open);
  }, []);
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
            {/* The machine stands in the medal center, whose front has the bank, the daily bonus and the reset. */}
            <a className={styles.centerLink} href={MEDAL_CENTER_PATH} data-testid="pusher-center">
              <span aria-hidden>← </span>
              {t.centerLink}
            </a>
            <h1 className={styles.title}>
              <TitleMedal /> {t.title}
            </h1>
            <p className={styles.subtitle}>{t.subtitle}</p>
          </div>
          <button type="button" className={styles.btn} aria-haspopup="dialog" data-testid="pusher-how-to-play" onClick={(event) => openPlate(true, event.currentTarget)}>
            {t.howToPlay}
          </button>
        </div>

        {/* The floor jackpot, live, over the machine: every medal played here by a player on the floor feeds it. */}
        <FloorJackpotStrip game="medal-pusher" />

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
          <PlateSwitch.Provider value={openPlate}>
            <PlayTab active={tab === 'machine'} player={player} store={store} signInHref={signInHref} />
          </PlateSwitch.Provider>
        </div>
        <div role="tabpanel" id="pusher-panel-odds" aria-labelledby="pusher-tab-odds" hidden={tab !== 'odds'}>
          <OddsTab />
          {/* What the floor jackpot adds to the medals played here, on top of the machine's own return. Kept out of the tab itself, which never touches the player's medals. */}
          <FloorJackpotOddsNote game="medal-pusher" />
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
        opener={() => plateOpener.current}
        title={t.howToPlay}
        body={[...t.infoBody(MAX_STOCK), ...getWorksStrings(language).howItPays(POUR.threshold)]}
      />

    </div>
  );
};

export default MedalPusher;
