'use client';

import { useLayoutEffect, useState } from 'react';
import { InfoModal } from '../common';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { bank as medalBank } from '../MedalCenter/bank';
import { NoteGate, createOnceNote, noteAttributes } from '../MedalCenter/onceNote';
import { MEDAL_CENTER_PATH } from '../MedalCenter/paths';
import type { AccountStore, Player } from '../MedalPusher/account';
import { getStrings } from './i18n';
import { NOTICE_KEY } from './medals';
import { OddsTab } from './OddsTab';
import { PlayTab } from './PlayTab';
import { SimTab } from './SimTab';
import styles from './VideoPoker.module.css';
import { FloorJackpotOddsNote, FloorJackpotStrip } from '../MedalCenter/floor/FloorJackpot';
import floorTabs from '../MedalCenter/tabs.module.css';

type Tab = 'play' | 'odds' | 'sim';

/**
 * The note that the machine plays with the player's medals now: told once, on the first visit since the machine came
 * onto the medal center's floor, and kept on the page until it is put away. Whatever is kept under its key counts as
 * told; storage that cannot be read tells them again. The server draws it, and its gate hides it before the page is
 * painted where it has been told (MedalCenter/onceNote.tsx), so the machine never moves for it.
 */
const NOTE = createOnceNote({ name: 'video-poker', storageKey: NOTICE_KEY, readWhenShown: true });

export interface VideoPokerProps {
  /** Who is playing, as far as the site knows. Without one, a guest. */
  player?: Player;
  /** The account's store for the medals, which every machine at the medal center plays from. Without one the medals are this device's alone. */
  bankStore?: AccountStore | null;
  /** The Medal Pusher's machine and record book on the account, which the medals look at once (MedalCenter/bank.ts). */
  legacy?: { machines?: AccountStore | null; books?: AccountStore | null };
}

export const VideoPoker = ({ player, bankStore = null, legacy = {} }: VideoPokerProps = {}) => {
  const [tab, setTab] = useState<Tab>('play');
  const [infoOpen, setInfoOpen] = useState(false);
  const notice = NOTE.useShown();
  const { language } = useGameLanguage();
  const t = getStrings(language);

  // The medals follow the player, as at the medal center. They are told whose they are before anything on the page
  // listens to them (a layout effect runs before the effects that listen), so the first medals opened are theirs.
  const { uid = null, settled = true, expected = false } = player ?? {};
  const { machines = null, books = null } = legacy;
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
            <a className={styles.centerLink} href={MEDAL_CENTER_PATH} data-testid="vp-center">
              <span aria-hidden>←</span>
              {t.centerLink}
            </a>
            <h1 className={styles.title}>
              <span aria-hidden>♣️</span> {t.title}
            </h1>
            <p className={styles.subtitle}>{t.subtitle}</p>
          </div>
          <button type="button" className={styles.btn} onClick={() => setInfoOpen(true)}>
            {t.howToPlay}
          </button>
        </div>

        {notice && (
          <>
            <NoteGate name="video-poker" storageKey={NOTICE_KEY} />
            <section className={styles.notice} aria-labelledby="vp-notice-title" data-testid="vp-notice" {...noteAttributes('video-poker')}>
              <h2 id="vp-notice-title" className={styles.noticeTitle}>
                {t.noticeTitle}
              </h2>
              <p className={styles.noticeBody}>{t.noticeBody}</p>
              <div className={styles.noticeActions}>
                <a className={styles.noticeLink} href={MEDAL_CENTER_PATH} data-testid="vp-notice-center">
                  {t.noticeLink}
                </a>
                <button type="button" className={styles.btn} data-testid="vp-notice-dismiss" onClick={NOTE.putAway}>
                  {t.noticeDismiss}
                </button>
              </div>
            </section>
          </>
        )}

        {/* The floor jackpot, live, over the machine: every medal played here by a player on the floor feeds it. */}
        <FloorJackpotStrip game="video-poker" />

        <div className={`${styles.tabs} ${floorTabs.tabs}`} role="tablist" aria-label={t.title}>
          {tabs.map((tb) => (
            <button
              key={tb.id}
              type="button"
              role="tab"
              id={`vp-tab-${tb.id}`}
              aria-selected={tab === tb.id}
              aria-controls={`vp-panel-${tb.id}`}
              className={`${styles.tab} ${floorTabs.tab}`}
              onClick={() => setTab(tb.id)}
            >
              {tb.label}
            </button>
          ))}
        </div>

        {/* Every panel stays mounted (inactive ones are hidden) so switching tabs
            never drops a hand in progress. */}
        <div role="tabpanel" id="vp-panel-play" aria-labelledby="vp-tab-play" hidden={tab !== 'play'}>
          <PlayTab seatedFor={{ uid: bankStore ? uid : null, settled: bankStore ? settled : true }} active={tab === 'play'} />
        </div>
        <div role="tabpanel" id="vp-panel-odds" aria-labelledby="vp-tab-odds" hidden={tab !== 'odds'}>
          <OddsTab />
          {/* What the floor jackpot adds to the medals played here, on top of the machine's own return. Kept out of the tab itself, which never touches the player's medals. */}
          <FloorJackpotOddsNote game="video-poker" />
        </div>
        <div role="tabpanel" id="vp-panel-sim" aria-labelledby="vp-tab-sim" hidden={tab !== 'sim'}>
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

export default VideoPoker;
