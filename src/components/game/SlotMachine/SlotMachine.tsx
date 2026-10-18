'use client';

import { useLayoutEffect, useState, useSyncExternalStore } from 'react';
import { InfoModal } from '../common';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { bank as medalBank } from '../MedalCenter/bank';
import { NoteGate, noteAttributes } from '../MedalCenter/onceNote';
import { MEDAL_CENTER_PATH } from '../MedalCenter/paths';
import type { AccountStore } from '../MedalPusher/account';
import { analyzeMachine } from './engine';
import { getStrings } from './i18n';
import { NOTICE_KEY, browserStorage, markNoticeRead, noticeRead } from './medals';
import { OddsTab } from './OddsTab';
import { PlayTab } from './PlayTab';
import { SimTab } from './SimTab';
import styles from './SlotMachine.module.css';
import { FloorJackpotOddsNote, FloorJackpotStrip } from '../MedalCenter/floor/FloorJackpot';

type Tab = 'play' | 'odds' | 'sim';

const RTP_LABEL = `${(analyzeMachine().rtp * 100).toFixed(2)}%`;

export interface SlotMachineProps {
  /** Who is playing, as the site says. Without one, a guest. */
  player?: { uid: string | null; settled: boolean; expected: boolean };
  /** The account's store for the medals, which every game at the medal center plays with. Without one the medals are this device's alone. */
  bankStore?: AccountStore | null;
  /** Where the account keeps what the Medal Pusher kept before the medal center: read once, for the medals and the bonus days it held. */
  legacyStores?: { machines: AccountStore | null; books: AccountStore | null };
}

// Whether the one-time note has been read on this device: kept in storage, and on this page too, for a browser whose
// storage keeps nothing. Nothing is known of the device on the server, which draws the note, and its gate hides it
// before the page is painted where it has been read (MedalCenter/onceNote.tsx): the machine never moves for it.
const noticeHeard = new Set<() => void>();
let readHere = false;
const subscribeNotice = (listener: () => void) => {
  noticeHeard.add(listener);
  return () => {
    noticeHeard.delete(listener);
  };
};
const noticeIsRead = () => readHere || noticeRead(browserStorage());
const readOnServer = () => false;

/** The one-time note that the machine plays with the player's medals now, until they have read it on this device. */
const MedalsNotice = () => {
  const { language } = useGameLanguage();
  const t = getStrings(language);
  const read = useSyncExternalStore(subscribeNotice, noticeIsRead, readOnServer);
  if (read) return null;
  const dismiss = () => {
    readHere = true;
    markNoticeRead(browserStorage());
    for (const listener of [...noticeHeard]) listener();
    // The button goes with the note: the keyboard goes on to the tabs that came after it.
    document.querySelector<HTMLElement>('[role="tab"][id^="slot-tab-"][aria-selected="true"]')?.focus();
  };
  return (
    <>
      <NoteGate name="slot-machine" storageKey={NOTICE_KEY} readValue="1" />
      <section className={styles.notice} aria-labelledby="slot-notice-title" data-testid="slot-notice" {...noteAttributes('slot-machine')}>
        <h2 id="slot-notice-title" className={styles.noticeTitle}>
          {t.noticeTitle}
        </h2>
        <p>{t.noticeBody}</p>
        <div className={styles.noticeActions}>
          <a className={styles.noticeLink} href={MEDAL_CENTER_PATH} data-testid="slot-notice-link">
            {t.noticeLink}
          </a>
          <button type="button" className={styles.btn} data-testid="slot-notice-dismiss" onClick={dismiss}>
            {t.noticeDismiss}
          </button>
        </div>
      </section>
    </>
  );
};

export const SlotMachine = ({ player, bankStore = null, legacyStores }: SlotMachineProps = {}) => {
  const [tab, setTab] = useState<Tab>('play');
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
    { id: 'play', label: t.tabPlay },
    { id: 'odds', label: t.tabOdds },
    { id: 'sim', label: t.tabSim },
  ];

  return (
    <div className={styles.root}>
      <div className={styles.shell}>
        <div className={styles.header}>
          <div style={{ flex: 1 }}>
            {/* The machine stands on the medal center's floor, whose front has the medals, the daily bonus and the reset. */}
            <a className={styles.centerLink} href={MEDAL_CENTER_PATH} data-testid="slot-center">
              <span aria-hidden>← </span>
              {t.centerLink}
            </a>
            <h1 className={styles.title}>
              <span aria-hidden>🎰</span> {t.title}
            </h1>
            <p className={styles.subtitle}>{t.subtitle}</p>
          </div>
          <button type="button" className={styles.btn} aria-haspopup="dialog" onClick={() => setInfoOpen(true)}>
            {t.howToPlay}
          </button>
        </div>

        <MedalsNotice />

        {/* The floor jackpot, live, over the machine: every medal played here by a player on the floor feeds it. */}
        <FloorJackpotStrip game="slot-machine" />

        <div className={styles.tabs} role="tablist" aria-label={t.title}>
          {tabs.map((tb) => (
            <button
              key={tb.id}
              type="button"
              role="tab"
              id={`slot-tab-${tb.id}`}
              aria-selected={tab === tb.id}
              aria-controls={`slot-panel-${tb.id}`}
              className={styles.tab}
              onClick={() => setTab(tb.id)}
            >
              {tb.label}
            </button>
          ))}
        </div>

        {/* Every panel stays mounted (inactive ones are hidden) so switching tabs
            never drops the play session, a spin that is still rolling (its bet
            is already taken and it pays on settle) or a running simulation. */}
        <div role="tabpanel" id="slot-panel-play" aria-labelledby="slot-tab-play" hidden={tab !== 'play'}>
          <PlayTab player={player ? { uid, settled } : undefined} active={tab === 'play'} />
        </div>
        <div role="tabpanel" id="slot-panel-odds" aria-labelledby="slot-tab-odds" hidden={tab !== 'odds'}>
          <OddsTab />
          {/* What the floor jackpot adds to the medals played here, on top of the machine's own return. Kept out of the tab itself, which never touches the player's medals. */}
          <FloorJackpotOddsNote game="slot-machine" />
        </div>
        <div role="tabpanel" id="slot-panel-sim" aria-labelledby="slot-tab-sim" hidden={tab !== 'sim'}>
          <SimTab />
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

export default SlotMachine;
