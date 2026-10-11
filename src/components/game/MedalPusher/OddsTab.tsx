'use client';

import { useId, useState } from 'react';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { FieldDiagram } from './charts';
import { percent, tidyPercent } from './format';
import { PART_IDS, getStrings } from './i18n';
import {
  BALL_JACKPOT_CHANCE,
  BOARD,
  BOARD_VALUE,
  BOWL,
  CHAIN_GOAL,
  CHALLENGE_CHANCE,
  CHESTS,
  CHEST_TOWERS_FROM,
  CHEST_VALUE,
  FEVER_SQUARE,
  JACKPOT_CHANCE,
  JACKPOT_START,
  JACKPOT_STEP,
  LONG_REACH,
  POCKET_VALUE,
  REACH_RATE,
  ROULETTE,
  SPIN_TABLE,
  SPIN_TOTAL,
  TIER_BONUS,
  boardAfter,
  bowlValue,
  chainChance,
  reachChance,
  reachHitChance,
  rouletteValue,
  spinValue,
  tierChance,
  tierValue,
  type Pocket,
  type ReachShown,
  type Tier,
} from './lottery';
import { towerSizes } from './engine';
import { MAX_STOCK, TIMING } from './session';
import styles from './MedalPusher.module.css';

/** The slot's lines, best first. */
const LINES: Tier[] = ['seven', 'big', 'small', 'miss'];
/** The reaches the Odds tab weighs up: the long one, the usual one, and the two together. */
export const REACH_ROWS: ReachShown[] = ['long', 'normal', 'any'];
/** Jackpot sizes the value table is worked out for. */
export const JACKPOT_LEVELS = [JACKPOT_START, 500, 1000] as const;
/** What the calculator starts from: about what following a gate at two medals a second measures on the Simulation tab. */
export const CALC_DEFAULT = { front: 80, spins: 19 } as const;

/** Rolls after which the Odds tab shows how even the board has become. */
export const BOARD_ROLLS = 6;

/** The furthest any square's chance is from an even share after `rolls` rolls from the start. */
export function boardSpread(rolls: number): number {
  const even = 1 / BOARD.length;
  return Math.max(...boardAfter(rolls).map((chance) => Math.abs(chance - even)));
}

/** The roulette's pockets grouped by what they do: the cross first, then the largest number down. */
export function pocketGroups(): { pocket: Pocket; count: number }[] {
  const counts = new Map<Pocket, number>();
  for (const pocket of ROULETTE) counts.set(pocket, (counts.get(pocket) ?? 0) + 1);
  return [...counts.entries()]
    .map(([pocket, count]) => ({ pocket, count }))
    .sort((a, b) => (a.pocket === 'stop' ? -1 : b.pocket === 'stop' ? 1 : (b.pocket as number) - (a.pocket as number)));
}

/**
 * What comes back per medal dropped when `front` of the medals on the field
 * leave by the front and each medal dropped starts `spins` spins worth `value`.
 */
export const returnFor = (front: number, spins: number, value: number): number => front * (1 + spins * value);

/** The spins per medal that would make the return exactly 1 at this front share. */
export const breakEvenSpins = (front: number, value: number): number => (1 / front - 1) / value;

export const OddsTab = () => {
  const { language } = useGameLanguage();
  const t = getStrings(language);
  const locale = language === 'ja' ? 'ja-JP' : 'en-US';
  const fmt = (n: number) => n.toLocaleString(locale);
  const frontId = useId();
  const spinsId = useId();
  const jackpotId = useId();

  const [front, setFront] = useState<number>(CALC_DEFAULT.front);
  const [spins, setSpins] = useState<number>(CALC_DEFAULT.spins);
  const [jackpot, setJackpot] = useState<number>(JACKPOT_START);

  const value = spinValue(jackpot);
  const result = returnFor(front / 100, spins / 100, value);
  const needed = breakEvenSpins(front / 100, value);

  const lineName: Record<Tier, string> = { seven: t.lineSeven, big: t.lineOdd, small: t.lineEven, miss: t.lineMiss };
  const linePays = (tier: Tier) => {
    if (tier === 'miss') return '—';
    const leadsTo = TIER_BONUS[tier];
    return leadsTo === 'ball' ? t.paysBall : leadsTo === 'chest' ? t.paysChest : t.paysSugoroku;
  };
  const trim = (value: number, digits = 2) => String(Number(value.toFixed(digits)));

  return (
    <div className={styles.oddsLayout}>
      <p className={styles.lead}>{t.oddsIntro}</p>

      <section className={styles.panelBox}>
        <h2 className={styles.blockTitle}>{t.fieldTitle}</h2>
        <div className={styles.diagramGrid}>
          <FieldDiagram ariaLabel={t.diagramAria} />
          <ol className={styles.parts}>
            {PART_IDS.map((id, index) => (
              <li key={id}>
                <span className={styles.partBadge} aria-hidden>
                  {index + 1}
                </span>
                <span>
                  <strong>{t.partName[id]}</strong> — {t.partText[id]}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className={styles.panelBox}>
        <h2 className={styles.blockTitle}>{t.slotTitle}</h2>
        <p className={styles.body}>{t.slotIntro(MAX_STOCK)}</p>
        <div className={styles.tableWrap}>
          <table className={styles.oddsTable} data-testid="pusher-slot-table">
            <caption className={styles.srOnly}>{t.slotCaption}</caption>
            <thead>
              <tr>
                <th scope="col">{t.colLine}</th>
                <th scope="col" className={styles.num}>
                  {t.colChance}
                </th>
                <th scope="col" className={styles.num}>
                  {t.colOneIn}
                </th>
                <th scope="col">{t.colPays}</th>
                <th scope="col" className={styles.num}>
                  {t.colAverage}
                </th>
              </tr>
            </thead>
            <tbody>
              {LINES.map((tier) => (
                <tr key={tier} data-tier={tier}>
                  <th scope="row">{lineName[tier]}</th>
                  <td className={styles.num}>{tidyPercent(tierChance(tier))}</td>
                  <td className={styles.num}>{tier === 'miss' ? '—' : t.oneIn(fmt(Math.round(SPIN_TOTAL / SPIN_TABLE[tier])))}</td>
                  <td>{linePays(tier)}</td>
                  <td className={styles.num}>{tier === 'miss' ? '—' : t.paysMedals(trim(tierValue(tier, JACKPOT_START), 1))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className={styles.note}>{t.reachNote(tidyPercent(REACH_RATE))}</p>
        <div className={styles.tableWrap}>
          <table className={styles.oddsTable} data-testid="pusher-reach-table">
            <caption className={styles.srOnly}>{t.reachCaption}</caption>
            <thead>
              <tr>
                <th scope="col">{t.colReach}</th>
                <th scope="col" className={styles.num}>
                  {t.colReachShare}
                </th>
                <th scope="col" className={styles.num}>
                  {t.colReachHits}
                </th>
              </tr>
            </thead>
            <tbody>
              {REACH_ROWS.map((kind) => (
                <tr key={kind} data-reach={kind}>
                  <th scope="row">{t.reachName[kind]}</th>
                  <td className={styles.num}>{percent(reachChance(kind))}</td>
                  <td className={styles.num}>{percent(reachHitChance(kind))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className={styles.note}>
          {t.reachTrustNote(
            percent(reachHitChance('long')),
            percent(reachHitChance('normal')),
            trim(reachHitChance('long') / reachHitChance('normal'), 1),
            tidyPercent(LONG_REACH.win),
            tidyPercent(LONG_REACH.miss),
          )}
        </p>
      </section>

      <section className={styles.panelBox}>
        <h2 className={styles.blockTitle}>{t.boardTitle}</h2>
        <p className={styles.body}>{t.boardIntro(BOARD.length)}</p>
        <div className={styles.tableWrap}>
          <table className={`${styles.oddsTable} ${styles.boardTable}`} data-testid="pusher-board-table">
            <caption className={styles.srOnly}>{t.boardCaption}</caption>
            <thead>
              <tr>
                <th scope="row">{t.colSquare}</th>
                {BOARD.map((_, square) => (
                  <th key={square} scope="col" className={styles.num}>
                    <span className={styles.srOnly}>{t.squareName(square + 1)}</span>
                    <span aria-hidden>{square + 1}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">{t.colPays}</th>
                {BOARD.map((medals, square) => (
                  <td key={square} className={styles.num} data-fever={square === FEVER_SQUARE}>
                    {medals}
                    {square === FEVER_SQUARE && <span className={styles.srOnly}> ({t.squareFever})</span>}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <p className={styles.note}>{t.boardNote(trim(BOARD_VALUE), BOARD_ROLLS, percent(boardSpread(BOARD_ROLLS)))}</p>
      </section>

      <section className={styles.panelBox}>
        <h2 className={styles.blockTitle}>{t.chestOddsTitle}</h2>
        <p className={styles.body}>{t.chestOddsIntro(TIMING.choose)}</p>
        <div className={styles.tableWrap}>
          <table className={styles.oddsTable} data-testid="pusher-chest-table">
            <caption className={styles.srOnly}>{t.chestOddsCaption}</caption>
            <thead>
              <tr>
                <th scope="col">{t.colChest}</th>
                <th scope="col" className={styles.num}>
                  {t.colChance}
                </th>
                <th scope="col">{t.colPaidAs}</th>
              </tr>
            </thead>
            <tbody>
              {CHESTS.map((medals) => (
                <tr key={medals}>
                  <th scope="row">{t.paysMedals(medals)}</th>
                  <td className={styles.num}>{percent(1 / CHESTS.length)}</td>
                  <td>{medals >= CHEST_TOWERS_FROM ? t.chestPaidTowers(towerSizes(medals).length) : t.chestPaidLoose}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className={styles.note}>{t.chestOddsNote(trim(CHEST_VALUE))}</p>
        <p className={styles.note}>{t.towerNote}</p>
      </section>

      <section className={styles.panelBox}>
        <h2 className={styles.blockTitle}>{t.rouletteTitle}</h2>
        <p className={styles.body}>{t.rouletteIntro(ROULETTE.length, CHAIN_GOAL)}</p>
        <div className={styles.tableWrap}>
          <table className={styles.oddsTable} data-testid="pusher-roulette-table">
            <caption className={styles.srOnly}>{t.rouletteCaption}</caption>
            <thead>
              <tr>
                <th scope="col">{t.colPocket}</th>
                <th scope="col" className={styles.num}>
                  {t.colPockets}
                </th>
                <th scope="col" className={styles.num}>
                  {t.colChance}
                </th>
              </tr>
            </thead>
            <tbody>
              {pocketGroups().map(({ pocket, count }) => (
                <tr key={pocket} data-pocket={pocket}>
                  <th scope="row">{pocket === 'stop' ? t.pocketStopName : t.pocketTower(pocket)}</th>
                  <td className={styles.num}>{count}</td>
                  <td className={styles.num}>{percent(count / ROULETTE.length)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className={styles.tableWrap}>
          <table className={`${styles.oddsTable} ${styles.boardTable}`} data-testid="pusher-chain-table">
            <caption className={styles.srOnly}>{t.chainCaption}</caption>
            <thead>
              <tr>
                <th scope="row">{t.colInARow}</th>
                {Array.from({ length: CHAIN_GOAL }, (_, index) => (
                  <th key={index} scope="col" className={styles.num}>
                    {index + 1}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">{t.colGetsThere}</th>
                {Array.from({ length: CHAIN_GOAL }, (_, index) => (
                  <td key={index} className={styles.num} data-fever={index === CHAIN_GOAL - 1}>
                    {percent(chainChance(index + 1))}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <p className={styles.body}>{t.bowlIntro(BOWL.length)}</p>
        <div className={styles.tableWrap}>
          <table className={styles.oddsTable} data-testid="pusher-bowl-table">
            <caption className={styles.srOnly}>{t.bowlCaption}</caption>
            <thead>
              <tr>
                <th scope="col">{t.colHole}</th>
                <th scope="col" className={styles.num}>
                  {t.colChance}
                </th>
                <th scope="col">{t.colPaidAs}</th>
              </tr>
            </thead>
            <tbody>
              {BOWL.map((hole) => (
                <tr key={hole} data-hole={hole}>
                  <th scope="row">{hole === 'jackpot' ? t.holeJackpot : t.paysMedals(hole)}</th>
                  <td className={styles.num}>{percent(1 / BOWL.length)}</td>
                  <td>
                    {hole === 'jackpot' ? t.holeJackpotPaid(towerSizes(JACKPOT_START).length, JACKPOT_START) : t.chestPaidTowers(towerSizes(hole).length)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className={styles.note}>{t.bowlNote(JACKPOT_START, trim(bowlValue(JACKPOT_START)), percent(CHALLENGE_CHANCE))}</p>
        <p className={styles.note}>
          {t.jackpotNote(JACKPOT_START, JACKPOT_STEP, trim(1 / BALL_JACKPOT_CHANCE, 1), fmt(Math.round(1 / JACKPOT_CHANCE)), trim(POCKET_VALUE))}
        </p>
      </section>

      <section className={styles.panelBox}>
        <h2 className={styles.blockTitle}>{t.valueTitle}</h2>
        <p className={styles.body}>{t.valueIntro}</p>
        <div className={styles.tableWrap}>
          <table className={styles.oddsTable} data-testid="pusher-value-table">
            <caption className={styles.srOnly}>{t.valueCaption}</caption>
            <thead>
              <tr>
                <th scope="col">{t.colJackpotAt}</th>
                <th scope="col" className={styles.num}>
                  {t.colRouletteAverage}
                </th>
                <th scope="col" className={styles.num}>
                  {t.colSpinValue}
                </th>
              </tr>
            </thead>
            <tbody>
              {JACKPOT_LEVELS.map((level) => (
                <tr key={level}>
                  <th scope="row">{t.paysMedals(fmt(level))}</th>
                  <td className={styles.num}>{t.paysMedals(Number(rouletteValue(level).toFixed(1)))}</td>
                  <td className={styles.num}>{t.paysMedals(Number(spinValue(level).toFixed(3)))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className={styles.note}>{t.valueNote(spinValue(JACKPOT_START).toFixed(2))}</p>
      </section>

      <section className={styles.panelBox}>
        <h2 className={styles.blockTitle}>{t.edgeTitle}</h2>
        <p className={styles.body}>{t.edgeBody[0]}</p>
        <p className={styles.formula}>{t.edgeFormula}</p>
        <p className={styles.body}>{t.edgeBody[1]}</p>
        <div className={styles.calc}>
          <div className={styles.calcField}>
            <label htmlFor={frontId} className={styles.calcLabel}>
              <span>{t.calcFront}</span>
              <strong>{front}%</strong>
            </label>
            <input
              id={frontId}
              type="range"
              className={styles.slider}
              min={50}
              max={100}
              step={1}
              value={front}
              onChange={(event) => setFront(Number(event.target.value))}
            />
          </div>
          <div className={styles.calcField}>
            <label htmlFor={spinsId} className={styles.calcLabel}>
              <span>{t.calcSpins}</span>
              <strong>{(spins / 100).toFixed(2)}</strong>
            </label>
            <input
              id={spinsId}
              type="range"
              className={styles.slider}
              min={0}
              max={40}
              step={1}
              value={spins}
              aria-valuetext={(spins / 100).toFixed(2)}
              onChange={(event) => setSpins(Number(event.target.value))}
            />
          </div>
          <div className={styles.calcField}>
            <label htmlFor={jackpotId} className={styles.calcLabel}>
              <span>{t.calcJackpot}</span>
              <strong>{t.paysMedals(fmt(jackpot))}</strong>
            </label>
            <input
              id={jackpotId}
              type="range"
              className={styles.slider}
              min={JACKPOT_START}
              max={2000}
              step={50}
              value={jackpot}
              aria-valuetext={t.paysMedals(fmt(jackpot))}
              onChange={(event) => setJackpot(Number(event.target.value))}
            />
          </div>
        </div>
        <div className={styles.calcResult} aria-live="polite">
          <div className={styles.fieldLabel}>{t.calcReturn}</div>
          <div className={styles.calcValue} data-sign={result >= 1 ? 'pos' : 'neg'} data-testid="pusher-calc-return">
            {percent(result)}
          </div>
          <p className={styles.note} data-testid="pusher-calc-note">
            {needed <= 1 ? t.calcBreakEven(percent(Math.max(0, needed), 0)) : t.calcNever}
          </p>
        </div>
        <p className={styles.note}>{t.calcNote(MAX_STOCK)}</p>
      </section>
    </div>
  );
};
