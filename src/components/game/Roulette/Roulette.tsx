'use client';

import { useCallback, useState } from 'react';
import { InfoModal } from '../common';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { MEDAL_CENTER_PATH } from '../MedalCenter/paths';
import { putNoticeAway, useNoticeShown } from './notice';
import { PlayTab, type PlayTabProps } from './PlayTab';
import { SimTab } from './SimTab';
import { EdgeTab } from './EdgeTab';
import { getStrings, betName } from './i18n';
import { BET_ODDS } from './engine';
import styles from './Roulette.module.css';
import { FloorJackpotOddsNote, FloorJackpotStrip } from '../MedalCenter/floor/FloorJackpot';

type Tab = 'play' | 'sim' | 'edge';

export type RouletteProps = PlayTabProps;

/** The game. Who is playing is passed straight on to the table, which plays with that player's medals. */
export const Roulette = ({ player }: RouletteProps = {}) => {
  const [tab, setTab] = useState<Tab>('play');
  const [infoOpen, setInfoOpen] = useState(false);
  const { language } = useGameLanguage();
  const t = getStrings(language);

  const openInfo = useCallback(() => setInfoOpen(true), []);
  // Once: the table plays with the medal center's medals now, and its old chips are retired.
  const noticeShown = useNoticeShown();

  const tabs: { id: Tab; label: string }[] = [
    { id: 'play', label: t.tabPlay },
    { id: 'sim', label: t.tabSim },
    { id: 'edge', label: t.tabEdge },
  ];

  return (
    <div className={styles.root}>
      <div className={styles.shell}>
        <div className={styles.header}>
          <div style={{ flex: 1 }}>
            {/* The table stands on the medal center's floor, whose front has the medals, the daily bonus and the reset. */}
            <a className={styles.centerLink} href={MEDAL_CENTER_PATH} data-testid="roulette-center">
              <span aria-hidden>← </span>
              {t.centerLink}
            </a>
            <h1 className={styles.title}>
              <span aria-hidden>🎡</span> {t.title}
            </h1>
            <p className={styles.subtitle}>{t.subtitle}</p>
          </div>
          <button type="button" className={styles.btn} aria-haspopup="dialog" onClick={openInfo}>
            {t.howToPlay}
          </button>
        </div>

        {noticeShown && (
          <div className={styles.notice} role="note" data-testid="roulette-notice">
            <p>
              {t.notice}{' '}
              <a className={styles.meterLink} href={MEDAL_CENTER_PATH}>
                {t.noticeLink}
              </a>
            </p>
            <button type="button" className={styles.btn} onClick={putNoticeAway} data-testid="roulette-notice-ok">
              {t.noticeOk}
            </button>
          </div>
        )}

        {/* The floor jackpot, live, over the machine: every medal played here by a player on the floor feeds it. */}
        <FloorJackpotStrip />

        <div className={styles.tabs} role="tablist" aria-label={t.title}>
          {tabs.map((tb) => (
            <button
              key={tb.id}
              role="tab"
              id={`rl-tab-${tb.id}`}
              aria-selected={tab === tb.id}
              aria-controls={`rl-panel-${tb.id}`}
              className={styles.tab}
              onClick={() => setTab(tb.id)}
            >
              {tb.label}
            </button>
          ))}
        </div>

        {/* Every panel stays mounted (inactive ones are hidden) so switching tabs
            never clears the felt or drops a spin that is still rolling (its
            medals are already taken and it pays on settle). */}
        <div role="tabpanel" id="rl-panel-play" aria-labelledby="rl-tab-play" hidden={tab !== 'play'}>
          <PlayTab player={player} active={tab === 'play'} />
        </div>
        <div role="tabpanel" id="rl-panel-sim" aria-labelledby="rl-tab-sim" hidden={tab !== 'sim'}>
          <SimTab />
        </div>
        <div role="tabpanel" id="rl-panel-edge" aria-labelledby="rl-tab-edge" hidden={tab !== 'edge'}>
          <EdgeTab />
          {/* What the floor jackpot adds to the medals played here, on top of the machine's own return. Kept out of the tab itself, which never touches the player's medals. */}
          <FloorJackpotOddsNote />
        </div>
      </div>

      <InfoModal isOpen={infoOpen} onClose={() => setInfoOpen(false)} title={t.howToPlay}>
        {t.infoBody.map((p, i) => (
          <p key={i} className={styles.infoP}>
            {p}
          </p>
        ))}
        <h3 className={styles.blockTitle}>{t.payoutTableTitle}</h3>
        <table className={styles.payTable}>
          <tbody>
            {(
              [
                ['straight', BET_ODDS.straight],
                ['split', BET_ODDS.split],
                ['street', BET_ODDS.street],
                ['corner', BET_ODDS.corner],
                ['line', BET_ODDS.line],
                ['dozen', BET_ODDS.dozen],
                ['column', BET_ODDS.column],
                ['red', BET_ODDS.even],
                ['odd', BET_ODDS.even],
                ['low', BET_ODDS.even],
              ] as const
            ).map(([kind, odds]) => (
              <tr key={kind}>
                <td>{betName(kind, language)}</td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{odds}:1</td>
              </tr>
            ))}
          </tbody>
        </table>
      </InfoModal>
    </div>
  );
};

export default Roulette;
