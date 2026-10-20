'use client';

import { useState } from 'react';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { ScrollArea } from '../common/ScrollArea';
import {
  BLIND,
  GATE_KINDS,
  GATE_PATTERNS,
  PAYS,
  PERFECT,
  POCKETS,
  POCKET_CHANCES,
  STAGES,
  STAGE_SETTINGS,
  TYPICAL,
  checkPlays,
  gatePass,
  seeded,
  valueOf,
  type Fraction,
  type GateKind,
  type Player,
} from './engine';
import { getStrings } from './i18n';
import { PUBLISHED_MAZE_ODDS } from './published';
import styles from './CoinMaze.module.css';

/** How many plays the check plays for each hand. */
export const CHECK_PLAYS = 40_000;

const HANDS: readonly Player[] = ['perfect', 'typical', 'blind'];

/** Candy Shop Medal Maze's exact odds (engine.ts): the three hands, each gate, the pins, skipping, and a check by play. */
export const OddsTab = () => {
  const { language } = useGameLanguage();
  const t = getStrings(language);
  const locale = language === 'ja' ? 'ja-JP' : 'en-US';
  const fmt = (n: number, digits = 0) => n.toLocaleString(locale, { maximumFractionDigits: digits, minimumFractionDigits: digits });
  const pct = (v: number, digits = 2) => `${fmt(v * 100, digits)}%`;
  const ratio = (f: Fraction) => `${f.num.toString()}/${f.den.toString()}`;
  // Written out in published.ts: nothing is worked out as the tab is drawn (it is drawn, hidden, as the page opens).
  const odds = PUBLISHED_MAZE_ODDS;

  const [running, setRunning] = useState(false);
  const [seen, setSeen] = useState<Record<Player, number> | null>(null);
  const [seed, setSeed] = useState(1);
  const runCheck = () => {
    setRunning(true);
    // Let "Playing…" be drawn before the plays are played.
    window.setTimeout(() => {
      const random = seeded(20_261_018 + seed);
      setSeen({ perfect: checkPlays(CHECK_PLAYS, 'perfect', random).back, typical: checkPlays(CHECK_PLAYS, 'typical', random).back, blind: checkPlays(CHECK_PLAYS, 'blind', random).back });
      setSeed((s) => s + 1);
      setRunning(false);
    }, 30);
  };

  const hands = [
    { key: 'perfect' as const, label: t.perfectLabel, note: t.perfectNote, model: odds.perfect, testId: 'cm-perfect' },
    { key: 'typical' as const, label: t.typicalLabel, note: t.typicalNote, model: odds.typical, testId: 'cm-typical' },
    { key: 'blind' as const, label: t.blindLabel, note: t.blindNote, model: odds.blind, testId: 'cm-blind' },
  ];
  const settings = (stage: number): string => {
    const counts = new Map<GateKind, number>();
    for (const kind of STAGE_SETTINGS[stage]) counts.set(kind, (counts.get(kind) ?? 0) + 1);
    return GATE_KINDS.filter((kind) => counts.has(kind))
      .map((kind) => `${t.kindName(kind)} ${counts.get(kind)}`)
      .join(language === 'ja' ? '・' : ' · ');
  };
  const turnOf = (kind: GateKind) => GATE_PATTERNS[kind].map((slot) => (slot === 'open' ? 'O' : slot === 'half' ? '½' : '×')).join(' ');

  return (
    <div className={styles.odds}>
      <div className={styles.intro}>
        {t.oddsIntro.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>

      <div className={styles.statGrid}>
        {hands.map((hand) => (
          <div className={styles.stat} key={hand.key}>
            <span className={styles.statLabel}>{hand.label}</span>
            <span className={styles.statValue} data-testid={hand.testId}>
              {pct(valueOf(hand.model.back))}
            </span>
            <span className={styles.statNote}>{hand.note}</span>
            <span className={styles.statFraction}>{t.fractionNote(ratio(hand.model.back))}</span>
          </div>
        ))}
        <div className={styles.stat}>
          <span className={styles.statLabel}>{t.reachLabel}</span>
          <span className={styles.statValue} data-testid="cm-reach">
            {pct(valueOf(odds.perfect.reach))}
          </span>
          <span className={styles.statFraction}>{t.fractionNote(ratio(odds.perfect.reach))}</span>
        </div>
      </div>

      <section>
        <h2 className={styles.blockTitle}>{t.rulesTitle}</h2>
        <ul className={styles.ruleList}>
          {t.rules.map((rule, i) => (
            <li key={i}>{rule}</li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className={styles.blockTitle}>{t.gatesTitle}</h2>
        <ScrollArea className={styles.tableWrap}>
          <table className={styles.oddsTable} data-testid="cm-gates-table">
            <thead>
              <tr>
                <th scope="col">{t.colGate}</th>
                <th scope="col">{t.colSettings}</th>
                <th scope="col" className={styles.num}>
                  {t.colPerfect}
                </th>
                <th scope="col" className={styles.num}>
                  {t.colTypical}
                </th>
                <th scope="col" className={styles.num}>
                  {t.colBlind}
                </th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: STAGES }, (_, stage) => (
                <tr key={stage} data-stage={stage}>
                  <th scope="row">
                    {stage + 1} {t.gateName(stage)}
                  </th>
                  <td>{settings(stage)}</td>
                  <td className={styles.num}>{pct(valueOf(odds.perfect.stages[stage]), 1)}</td>
                  <td className={styles.num}>{pct(valueOf(odds.typical.stages[stage]), 1)}</td>
                  <td className={styles.num}>{pct(valueOf(odds.blind.stages[stage]), 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollArea>
      </section>

      <section>
        <h2 className={styles.blockTitle}>{t.kindsTitle}</h2>
        <p className={styles.note}>{t.turnKey}</p>
        <ScrollArea className={styles.tableWrap}>
          <table className={styles.oddsTable} data-testid="cm-kinds-table">
            <thead>
              <tr>
                <th scope="col">{t.colKind}</th>
                <th scope="col">{t.colTurn}</th>
                <th scope="col" className={styles.num}>
                  {t.colPerfect}
                </th>
                <th scope="col" className={styles.num}>
                  {t.colTypical}
                </th>
                <th scope="col" className={styles.num}>
                  {t.colBlind}
                </th>
              </tr>
            </thead>
            <tbody>
              {GATE_KINDS.map((kind) => (
                <tr key={kind} data-kind={kind}>
                  <th scope="row">{t.kindName(kind)}</th>
                  <td className={styles.turn}>{turnOf(kind)}</td>
                  <td className={styles.num}>{pct(valueOf(gatePass(kind, PERFECT)), 1)}</td>
                  <td className={styles.num}>{pct(valueOf(gatePass(kind, TYPICAL)), 1)}</td>
                  <td className={styles.num}>{pct(valueOf(gatePass(kind, BLIND)), 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollArea>
      </section>

      <section>
        <h2 className={styles.blockTitle}>{t.pinsTitle}</h2>
        <ScrollArea className={styles.tableWrap}>
          <table className={styles.oddsTable} data-testid="cm-pins-table">
            <thead>
              <tr>
                <th scope="col">{t.colPocket}</th>
                <th scope="col" className={styles.num}>
                  {t.colChance}
                </th>
                <th scope="col" className={styles.num}>
                  {t.colPays}
                </th>
              </tr>
            </thead>
            <tbody>
              {POCKETS.map((pocket, k) => (
                <tr key={k} data-pocket={pocket}>
                  <th scope="row">{t.pocketName(pocket)}</th>
                  <td className={styles.num}>
                    {ratio(POCKET_CHANCES[k])} <span className={styles.percent}>{pct(valueOf(POCKET_CHANCES[k]), 2)}</span>
                  </td>
                  <td className={styles.num}>{PAYS[pocket]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollArea>
      </section>

      <section>
        <h2 className={styles.blockTitle}>{t.skipTitle}</h2>
        <p className={styles.note}>{t.skipNote}</p>
        <ScrollArea className={styles.tableWrap}>
          <table className={styles.oddsTable} data-testid="cm-skip-table">
            <thead>
              <tr>
                <th scope="col">{t.colSkipAt}</th>
                <th scope="col" className={styles.num}>
                  {t.colBack}
                </th>
              </tr>
            </thead>
            <tbody>
              {odds.skipAt.map((back, s) => (
                <tr key={s}>
                  <th scope="row">{s < STAGES ? t.skipAtGate(s) : t.skipNever}</th>
                  <td className={styles.num}>{pct(valueOf(back))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollArea>
      </section>

      <section>
        <h2 className={styles.blockTitle}>{t.checkTitle}</h2>
        <p className={styles.note}>{t.checkNote(fmt(CHECK_PLAYS))}</p>
        <button type="button" className={styles.btn} onClick={runCheck} disabled={running} data-testid="cm-check">
          {running ? t.checkRunning : t.checkRun}
        </button>
        <ScrollArea className={styles.tableWrap}>
          <table className={styles.oddsTable} data-testid="cm-check-table">
            <thead>
              <tr>
                <th scope="col">{t.colHand}</th>
                <th scope="col" className={styles.num}>
                  {t.colExact}
                </th>
                <th scope="col" className={styles.num}>
                  {t.colSeen}
                </th>
              </tr>
            </thead>
            <tbody>
              {HANDS.map((hand) => (
                <tr key={hand}>
                  <th scope="row">{hands.find((h) => h.key === hand)!.label}</th>
                  <td className={styles.num}>{pct(valueOf(odds[hand].back))}</td>
                  <td className={styles.num}>{seen ? pct(seen[hand]) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollArea>
      </section>
    </div>
  );
};

export default OddsTab;
