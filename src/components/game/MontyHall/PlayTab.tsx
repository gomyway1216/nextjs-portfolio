'use client';

import { useState } from 'react';
import {
  Door,
  Round,
  playRound,
  switchCandidates,
  won,
  theoreticalStay,
  theoreticalSwitch,
  DEFAULT_DOOR_COUNT,
} from './engine';
import type { MontyHallStrings } from './i18n';
import styles from './MontyHall.module.css';

type Phase = 'pick' | 'reveal' | 'final';

interface Stats {
  stayWins: number;
  stayTotal: number;
  switchWins: number;
  switchTotal: number;
}

const INITIAL_STATS: Stats = { stayWins: 0, stayTotal: 0, switchWins: 0, switchTotal: 0 };

const DOOR_OPTIONS = [3, 4, 5, 8];

const doorEmoji = (state: 'closed' | 'goat' | 'prize') =>
  state === 'closed' ? '🚪' : state === 'goat' ? '🐐' : '🎁';

export const PlayTab = ({ t }: { t: MontyHallStrings }) => {
  const [doorCount, setDoorCount] = useState(DEFAULT_DOOR_COUNT);
  const [phase, setPhase] = useState<Phase>('pick');
  const [round, setRound] = useState<Round | null>(null);
  const [finalDoor, setFinalDoor] = useState<Door | null>(null);
  const [switchTarget, setSwitchTarget] = useState<Door | null>(null);
  const [didSwitch, setDidSwitch] = useState(false);
  const [stats, setStats] = useState<Stats>(INITIAL_STATS);

  const pick = (door: Door) => {
    if (phase !== 'pick') return;
    setRound(playRound(door, doorCount));
    setFinalDoor(null);
    setSwitchTarget(null);
    setPhase('reveal');
  };

  const resolve = (finalChoice: Door, switched: boolean) => {
    if (!round) return;
    setDidSwitch(switched);
    setFinalDoor(finalChoice);
    setPhase('final');
    const w = won(round, finalChoice);
    setStats((s) => ({
      stayWins: s.stayWins + (!switched && w ? 1 : 0),
      stayTotal: s.stayTotal + (!switched ? 1 : 0),
      switchWins: s.switchWins + (switched && w ? 1 : 0),
      switchTotal: s.switchTotal + (switched ? 1 : 0),
    }));
  };

  const stay = () => {
    if (phase !== 'reveal' || !round) return;
    resolve(round.pickedDoor, false);
  };

  // Switch: if only one candidate (3-door classic), auto-pick it. Otherwise let
  // the user click a specific unopened door.
  const beginSwitch = () => {
    if (phase !== 'reveal' || !round) return;
    const candidates = switchCandidates(round);
    if (candidates.length === 1) {
      resolve(candidates[0], true);
    } else {
      // enter "choose a door to switch to" sub-mode
      setSwitchTarget(-1);
    }
  };

  const chooseSwitchDoor = (door: Door) => {
    if (phase !== 'reveal' || !round || switchTarget === null) return;
    const candidates = switchCandidates(round);
    if (!candidates.includes(door)) return;
    resolve(door, true);
  };

  const nextRound = () => {
    setPhase('pick');
    setRound(null);
    setFinalDoor(null);
    setSwitchTarget(null);
  };

  const resetStats = () => {
    setStats(INITIAL_STATS);
    nextRound();
  };

  const changeDoorCount = (n: number) => {
    setDoorCount(n);
    setStats(INITIAL_STATS);
    nextRound();
  };

  const doorState = (i: Door): 'closed' | 'goat' | 'prize' => {
    if (!round) return 'closed';
    if (phase === 'reveal' && round.openedDoors.includes(i)) return 'goat';
    if (phase === 'final') return i === round.prizeDoor ? 'prize' : 'goat';
    return 'closed';
  };

  const isPicked = (i: Door) => {
    if (!round) return false;
    if (phase === 'final' && finalDoor !== null) return finalDoor === i;
    return round.pickedDoor === i;
  };

  const choosingSwitch = phase === 'reveal' && switchTarget === -1;
  const candidates = round ? switchCandidates(round) : [];

  const justWon = phase === 'final' && finalDoor !== null && round !== null && won(round, finalDoor);

  const openedText =
    round && round.openedDoors.length > 0
      ? round.openedDoors.map((d) => t.doorLabel(d + 1)).join(', ')
      : '';

  return (
    <div className={styles.playGrid}>
      <div>
        <div className={styles.field} style={{ marginBottom: '1rem', maxWidth: 200 }}>
          <label className={styles.fieldLabel} htmlFor="mh-doorcount">
            {t.doorCountLabel}
          </label>
          <select
            id="mh-doorcount"
            className={styles.select}
            value={doorCount}
            onChange={(e) => changeDoorCount(Number(e.target.value))}
            disabled={phase !== 'pick'}
          >
            {DOOR_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>

        <div
          className={styles.doorsRow}
          style={{ gridTemplateColumns: `repeat(${Math.min(doorCount, 4)}, 1fr)` }}
        >
          {Array.from({ length: doorCount }, (_, i) => i as Door).map((i) => {
            const state = doorState(i);
            const picked = isPicked(i);
            const isSwitchCandidate = choosingSwitch && candidates.includes(i);
            const clickable = phase === 'pick' || isSwitchCandidate;
            const cls = [
              styles.door,
              phase === 'pick' ? styles.doorPickable : '',
              picked ? styles.doorPicked : '',
              state === 'prize' ? styles.doorPrize : '',
              state === 'goat' ? styles.doorGoat : '',
              phase === 'final' ? styles.doorReveal : '',
              isSwitchCandidate ? styles.doorPickable : '',
            ]
              .filter(Boolean)
              .join(' ');
            return (
              <button
                key={i}
                className={cls}
                onClick={() => (phase === 'pick' ? pick(i) : isSwitchCandidate ? chooseSwitchDoor(i) : undefined)}
                disabled={!clickable}
                aria-label={`${t.doorLabel(i + 1)}${picked ? t.pickedSuffix : ''}${
                  state === 'prize' ? ' 🎁' : state === 'goat' ? ' 🐐' : ''
                }`}
                style={isSwitchCandidate ? { borderColor: '#22c55e', boxShadow: '0 0 0 3px rgba(34,197,94,0.35)' } : undefined}
              >
                <span className={styles.doorNum}>{i + 1}</span>
                {doorEmoji(state)}
                {picked && phase !== 'final' && <span className={styles.pickedBadge}>{t.stay}</span>}
              </button>
            );
          })}
        </div>

        <div className={styles.prompt}>
          {phase === 'pick' && <p style={{ margin: 0 }}>{t.pickPrompt}</p>}
          {phase === 'reveal' && round && (
            <div>
              <p style={{ margin: '0 0 0.5rem' }}>
                {round.openedDoors.length === 1
                  ? t.hostRevealed(round.openedDoors[0] + 1)
                  : t.hostRevealedMulti(openedText)}
              </p>
              {choosingSwitch ? (
                <p style={{ margin: 0, color: '#22c55e', fontWeight: 700 }}>
                  {t.switchTo} → {candidates.map((d) => t.doorLabel(d + 1)).join(' / ')}
                </p>
              ) : (
                <div className={styles.actionRow}>
                  <button className={`${styles.btn} ${styles.btnSwitch}`} onClick={beginSwitch}>
                    {t.switchBtn}
                  </button>
                  <button className={`${styles.btn} ${styles.btnStay}`} onClick={stay}>
                    {t.stayBtn}
                  </button>
                </div>
              )}
            </div>
          )}
          {phase === 'final' && round && finalDoor !== null && (
            <div>
              <p className={`${styles.result} ${justWon ? styles.resultWin : styles.resultLose}`}>
                {justWon ? t.youWon : t.youLost}{' '}
                <span className={styles.resultSub}>
                  — {didSwitch ? t.youSwitched : t.youStayed}
                </span>
              </p>
              <button className={`${styles.btn} ${styles.btnNext}`} onClick={nextRound}>
                {t.nextRound}
              </button>
            </div>
          )}
        </div>
      </div>

      <div>
        <h3 className={styles.statsHeading}>{t.yourRecord}</h3>
        <div className={styles.statGrid}>
          <StatCard
            label={t.labelStay}
            wins={stats.stayWins}
            total={stats.stayTotal}
            theoretical={theoreticalStay(doorCount)}
            color="#94a3b8"
            t={t}
          />
          <StatCard
            label={t.labelSwitch}
            wins={stats.switchWins}
            total={stats.switchTotal}
            theoretical={theoreticalSwitch(doorCount)}
            color="#22c55e"
            t={t}
          />
        </div>
        <p className={styles.note}>{t.theoryNote}</p>
        <button className={styles.iconBtn} onClick={resetStats} style={{ marginTop: '0.5rem' }}>
          {t.reset}
        </button>
      </div>
    </div>
  );
};

const StatCard = ({
  label,
  wins,
  total,
  theoretical,
  color,
  t,
}: {
  label: string;
  wins: number;
  total: number;
  theoretical: number;
  color: string;
  t: MontyHallStrings;
}) => {
  const rate = total === 0 ? null : wins / total;
  return (
    <div className={styles.statCard}>
      <div className={styles.statLabel}>{label}</div>
      <div className={styles.statValue} style={{ color }}>
        {rate === null ? '—' : `${(rate * 100).toFixed(1)}%`}
      </div>
      <div className={styles.statSub}>
        {wins} / {total} · {t.theoretical} {(theoretical * 100).toFixed(1)}%
      </div>
      <div className={styles.statBar}>
        <div
          className={styles.statBarFill}
          style={{ width: `${(rate ?? 0) * 100}%`, background: color }}
        />
      </div>
    </div>
  );
};
