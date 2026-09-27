'use client';

import { useCallback, useRef, useState } from 'react';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import {
  HARD_PAYS,
  LAY_ODDS,
  ONE_ROLL_PAYS,
  PLACE_PAYS,
  POINT_NUMBERS,
  TRUE_ODDS,
  hardNumber,
  maxOdds,
  placeNumber,
  placementError,
  resolveRoll,
  rollDice,
  totalOnTable,
  type BetId,
  type Bets,
  type Dice,
  type PlacementError,
  type PointNumber,
  type Ratio,
  type RollResolution,
} from './engine';
import { DiceTray, DieFace } from './Dice';
import { getStrings } from './i18n';
import styles from './Craps.module.css';

export const INITIAL_BANKROLL = 1000;
export const CHIP_VALUES = [1, 5, 10, 25, 100] as const;
const CHIP_COLORS: Record<number, string> = { 1: '#e2e8f0', 5: '#ef4444', 10: '#3b82f6', 25: '#22c55e', 100: '#1a1a1f' };
const HISTORY_LIMIT = 18;

const ratioText = ([n, d]: Ratio) => `${n}:${d}`;

interface Stats {
  rolls: number;
  shooter: number;
  handRolls: number;
  longestHand: number;
  pointsMade: number;
  sevenOuts: number;
}

const EMPTY_STATS: Stats = { rolls: 0, shooter: 1, handRolls: 0, longestHand: 0, pointsMade: 0, sevenOuts: 0 };

interface HistoryEntry {
  id: number;
  dice: Dice;
  event: RollResolution['event'];
}

const money = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));

export const PlayTab = () => {
  const { language } = useGameLanguage();
  const t = getStrings(language);

  const [bankroll, setBankroll] = useState(INITIAL_BANKROLL);
  const [chip, setChip] = useState<number>(CHIP_VALUES[1]);
  const [bets, setBets] = useState<Bets>({});
  const [point, setPoint] = useState<PointNumber | null>(null);
  const [rolling, setRolling] = useState(false);
  const [rollId, setRollId] = useState(0);
  const [dice, setDice] = useState<Dice | null>(null);
  const [last, setLast] = useState<RollResolution | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  // Refs mirror state the click / settle handlers must read synchronously.
  const rollingRef = useRef(false);
  const bankrollRef = useRef(INITIAL_BANKROLL);
  const betsRef = useRef<Bets>({});
  const pointRef = useRef<PointNumber | null>(null);
  const undoStack = useRef<{ id: BetId; amount: number }[]>([]);
  const pendingRef = useRef<RollResolution | null>(null);
  const lastRoundBets = useRef<Bets>({});
  const historyId = useRef(0);

  const commitBets = (next: Bets) => {
    betsRef.current = next;
    setBets(next);
  };
  const commitBankroll = (next: number) => {
    bankrollRef.current = Math.round(next * 100) / 100;
    setBankroll(bankrollRef.current);
  };

  const place = (id: BetId, amount: number = chip): boolean => {
    if (rollingRef.current) return false;
    const error: PlacementError | 'noFunds' | null =
      placementError(id, amount, pointRef.current, betsRef.current) ?? (amount > bankrollRef.current ? 'noFunds' : null);
    if (error) {
      const max = error === 'oddsLimit' ? maxOdds(id as 'passOdds' | 'dontPassOdds', pointRef.current, betsRef.current) : undefined;
      setMessage(t.placementError(error, max));
      return false;
    }
    commitBankroll(bankrollRef.current - amount);
    commitBets({ ...betsRef.current, [id]: (betsRef.current[id] ?? 0) + amount });
    undoStack.current.push({ id, amount });
    setMessage(null);
    return true;
  };

  const undo = () => {
    if (rollingRef.current) return;
    const lastPlaced = undoStack.current.pop();
    if (!lastPlaced) return;
    const next = { ...betsRef.current };
    const remaining = (next[lastPlaced.id] ?? 0) - lastPlaced.amount;
    if (remaining > 0) next[lastPlaced.id] = remaining;
    else delete next[lastPlaced.id];
    commitBets(next);
    commitBankroll(bankrollRef.current + lastPlaced.amount);
  };

  const clear = () => {
    while (undoStack.current.length > 0) undo();
  };

  const repeat = () => {
    for (const [id, amount] of Object.entries(lastRoundBets.current) as [BetId, number][]) {
      const missing = amount - (betsRef.current[id] ?? 0);
      if (missing > 0) place(id, missing);
    }
  };

  const roll = () => {
    if (rollingRef.current) return;
    rollingRef.current = true;
    setRolling(true);
    setMessage(null);
    lastRoundBets.current = { ...betsRef.current };
    const thrown = rollDice();
    pendingRef.current = resolveRoll(pointRef.current, betsRef.current, thrown);
    setDice(thrown);
    setRollId((id) => id + 1);
  };

  const settle = useCallback(() => {
    const res = pendingRef.current;
    if (!res) return;
    pendingRef.current = null;
    bankrollRef.current = Math.round((bankrollRef.current + res.returned) * 100) / 100;
    setBankroll(bankrollRef.current);
    betsRef.current = res.bets;
    setBets(res.bets);
    pointRef.current = res.pointAfter;
    setPoint(res.pointAfter);
    setLast(res);
    setStats((s) => {
      const handRolls = s.handRolls + 1;
      const sevenOut = res.event === 'sevenOut';
      return {
        rolls: s.rolls + 1,
        shooter: s.shooter + (sevenOut ? 1 : 0),
        handRolls: sevenOut ? 0 : handRolls,
        longestHand: Math.max(s.longestHand, handRolls),
        pointsMade: s.pointsMade + (res.event === 'pointMade' ? 1 : 0),
        sevenOuts: s.sevenOuts + (sevenOut ? 1 : 0),
      };
    });
    const entry = { id: historyId.current++, dice: res.dice, event: res.event };
    setHistory((h) => [entry, ...h].slice(0, HISTORY_LIMIT));
    undoStack.current = [];
    rollingRef.current = false;
    setRolling(false);
  }, []);

  const reset = () => {
    if (rollingRef.current) return;
    commitBankroll(INITIAL_BANKROLL);
    commitBets({});
    pointRef.current = null;
    setPoint(null);
    undoStack.current = [];
    lastRoundBets.current = {};
    setLast(null);
    setMessage(null);
    setStats(EMPTY_STATS);
    setHistory([]);
  };

  const onTable = totalOnTable(bets);
  const net = Math.round((bankroll + onTable - INITIAL_BANKROLL) * 100) / 100;

  const spot = (id: BetId, label: string, pays: string, extraClass = '', children?: React.ReactNode) => {
    const amount = bets[id] ?? 0;
    const unavailable = placementError(id, chip, point, bets) !== null;
    return (
      <button
        key={id}
        type="button"
        className={`${styles.spot} ${extraClass} ${unavailable ? styles.spotUnavailable : ''}`}
        onClick={() => place(id)}
        disabled={rolling}
        aria-label={t.betAria(t.betName[id], pays, amount)}
        data-bet={id}
      >
        <span className={styles.spotLabel}>{label}</span>
        <span className={styles.spotPays}>{pays}</span>
        {children}
        {amount > 0 && <span className={styles.chipBadge}>{money(amount)}</span>}
        {amount > 0 && point === null && (placeNumber(id) !== null || hardNumber(id) !== null) && (
          <span className={styles.offTag} title={t.offOnComeOut}>
            {t.puckOff}
          </span>
        )}
      </button>
    );
  };

  const oddsSpot = (id: 'passOdds' | 'dontPassOdds') => {
    const max = maxOdds(id, point, bets);
    const pays = point === null ? t.trueOdds : ratioText(id === 'passOdds' ? TRUE_ODDS[point] : LAY_ODDS[point]);
    return spot(
      id,
      t.betName[id],
      pays,
      styles.oddsSpot,
      max > 0 ? <span className={styles.spotMax}>{t.oddsMax(max)}</span> : null,
    );
  };

  return (
    <div className={styles.playGrid}>
      <div className={styles.panel}>
        <DiceTray dice={dice} rollId={rollId} onSettled={settle} label={dice ? t.diceLabel(dice[0], dice[1]) : t.trayIdle} />

        <div className={styles.callout} aria-live="polite" data-testid="craps-callout">
          {rolling ? (
            <span className={styles.calloutRolling}>{t.rolling}</span>
          ) : last ? (
            <span className={last.event === 'sevenOut' || last.event === 'craps' ? styles.calloutBad : styles.calloutGood}>
              {t.event(last.event, last.total, last.pointAfter)}
            </span>
          ) : (
            <span>{t.comeOut}</span>
          )}
        </div>

        {last && !rolling && (
          <div className={styles.results}>
            <div className={styles.sectionLabel}>{t.rollResults}</div>
            {last.results.length === 0 ? (
              <p className={styles.muted}>{t.noBetsRoll}</p>
            ) : (
              <ul className={styles.resultList}>
                {last.results.map((r) => (
                  <li key={r.id} data-outcome={r.outcome}>
                    <span>{t.betName[r.id]}</span>
                    <span className={styles.resultAmount}>
                      {r.outcome === 'win' ? `+${money(r.profit)}` : r.outcome === 'lose' ? `−${money(r.stake)}` : '±0'}{' '}
                      <small>{r.outcome === 'win' ? (r.staysUp ? t.stays : t.won) : r.outcome === 'lose' ? t.lost : t.push}</small>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className={styles.sectionLabel} style={{ marginTop: '0.9rem' }}>
          {t.recentRolls}
        </div>
        <ol className={styles.historyRow} aria-label={t.recentRolls}>
          {history.length === 0 && <li className={styles.muted}>{t.none}</li>}
          {history.map((h) => (
            <li key={h.id} className={styles.historyItem} data-event={h.event} title={t.diceLabel(h.dice[0], h.dice[1])}>
              <span className={styles.historyDice} aria-hidden="true">
                <DieFace value={h.dice[0]} className={styles.miniDie} />
                <DieFace value={h.dice[1]} className={styles.miniDie} />
              </span>
              <span className={styles.historyTotal}>{h.dice[0] + h.dice[1]}</span>
            </li>
          ))}
        </ol>

        <div className={styles.sectionLabel} style={{ marginTop: '0.9rem' }}>
          {t.statsTitle}
        </div>
        <dl className={styles.statList}>
          <div>
            <dt>{t.rolls}</dt>
            <dd>{stats.rolls}</dd>
          </div>
          <div>
            <dt>{t.shooter}</dt>
            <dd>#{stats.shooter}</dd>
          </div>
          <div>
            <dt>{t.handRolls}</dt>
            <dd>{stats.handRolls}</dd>
          </div>
          <div>
            <dt>{t.longestHand}</dt>
            <dd>{stats.longestHand}</dd>
          </div>
          <div>
            <dt>{t.pointsMade}</dt>
            <dd>{stats.pointsMade}</dd>
          </div>
          <div>
            <dt>{t.sevenOuts}</dt>
            <dd>{stats.sevenOuts}</dd>
          </div>
        </dl>
      </div>

      <div className={styles.panel}>
        <div className={styles.pillRow}>
          <div className={styles.pill}>
            <span className={styles.pillLabel}>{t.bankroll}</span>
            <span className={styles.pillValue} data-testid="craps-bankroll">
              {money(bankroll)}
            </span>
          </div>
          <div className={styles.pill}>
            <span className={styles.pillLabel}>{t.onTable}</span>
            <span className={styles.pillValue} data-testid="craps-on-table">
              {money(onTable)}
            </span>
          </div>
          <div className={styles.pill}>
            <span className={styles.pillLabel}>{t.net}</span>
            <span className={`${styles.pillValue} ${net >= 0 ? styles.pos : styles.neg}`}>
              {net > 0 ? '+' : ''}
              {money(net)}
            </span>
          </div>
        </div>

        <div className={styles.chipRow} role="radiogroup" aria-label={t.chip}>
          <span className={styles.chipRowLabel}>{t.chip}:</span>
          {CHIP_VALUES.map((v) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={chip === v}
              aria-label={`${t.chip} ${v}`}
              onClick={() => setChip(v)}
              disabled={rolling}
              className={styles.chip}
              style={{ ['--c' as string]: CHIP_COLORS[v], color: v === 100 ? '#fff' : '#1a1200' }}
            >
              {v}
            </button>
          ))}
        </div>

        <div className={styles.felt}>
          <div className={styles.placeRow}>
            <span className={`${styles.puck} ${point === null ? styles.puckOff : styles.puckHidden}`} aria-hidden="true">
              {t.puckOff}
            </span>
            {POINT_NUMBERS.map((n) =>
              spot(
                `place${n}` as BetId,
                n === 6 ? 'SIX' : n === 9 ? 'NINE' : String(n),
                ratioText(PLACE_PAYS[n]),
                styles.placeSpot,
                point === n ? (
                  <span className={`${styles.puck} ${styles.puckOn}`} data-testid="craps-puck">
                    {t.puckOn}
                  </span>
                ) : null,
              ),
            )}
          </div>

          {spot('field', t.betName.field, t.fieldNote, styles.fieldSpot, (
            <span className={styles.fieldNumbers} aria-hidden="true">
              {Object.keys(ONE_ROLL_PAYS.field).join(' · ')}
            </span>
          ))}

          <div className={styles.lineRow}>
            {spot('dontPass', t.betName.dontPass, '1:1 · Bar 12', styles.dontSpot)}
            {oddsSpot('dontPassOdds')}
          </div>
          <div className={styles.lineRow}>
            {spot('pass', t.betName.pass, '1:1', styles.passSpot)}
            {oddsSpot('passOdds')}
          </div>

          <div className={styles.propBox} aria-label={t.proposition} role="group">
            {spot('any7', t.betName.any7, ratioText(ONE_ROLL_PAYS.any7), styles.any7Spot)}
            {([6, 10, 8, 4] as const).map((h) =>
              spot(`hard${h}` as BetId, t.betName[`hard${h}` as BetId], ratioText(HARD_PAYS[h]), styles.propSpot, (
                <span className={styles.hardDice} aria-hidden="true">
                  <DieFace value={h / 2} className={styles.miniDie} />
                  <DieFace value={h / 2} className={styles.miniDie} />
                </span>
              )),
            )}
            {spot('aces', t.betName.aces, ratioText(ONE_ROLL_PAYS.aces), styles.propSpot)}
            {spot('yo', t.betName.yo, ratioText(ONE_ROLL_PAYS.yo), styles.propSpot)}
            {spot('twelve', t.betName.twelve, ratioText(ONE_ROLL_PAYS.twelve), styles.propSpot)}
            {spot('anyCraps', t.betName.anyCraps, ratioText(ONE_ROLL_PAYS.anyCraps), styles.anyCrapsSpot)}
          </div>
        </div>

        <p className={styles.message} role="status" data-testid="craps-message">
          {message ?? (point === null ? t.comeOut : t.pointIs(point))}
        </p>

        <div className={styles.actions}>
          <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={roll} disabled={rolling}>
            {rolling ? t.rolling : t.roll}
          </button>
          <button type="button" className={styles.btn} onClick={undo} disabled={rolling}>
            {t.undo}
          </button>
          <button type="button" className={styles.btn} onClick={clear} disabled={rolling}>
            {t.clear}
          </button>
          <button type="button" className={styles.btn} onClick={repeat} disabled={rolling}>
            {t.repeat}
          </button>
          <button type="button" className={`${styles.btn} ${styles.spacerLeft}`} onClick={reset} disabled={rolling}>
            {t.reset}
          </button>
        </div>
        <ul className={styles.hint}>
          {t.hint.map((h, i) => (
            <li key={i}>{h}</li>
          ))}
        </ul>
      </div>
    </div>
  );
};
