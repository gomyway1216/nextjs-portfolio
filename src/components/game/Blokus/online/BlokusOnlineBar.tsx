/**
 * The room during and after a game: who is here, whose turn it is and how long
 * they have, leaving, and the rematch. The board itself stays the page's.
 */

'use client';

import { LogOut, RotateCcw, ScrollText } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useGameLanguage } from '../../contexts/GameLanguageContext';
import { getBlokusStrings } from '../i18n';
import { seatScores } from '../seating';
import { errorText, getBlokusOnlineStrings } from './strings';
import type { UseBlokusOnlineReturn } from './useBlokusOnline';
import styles from './online.module.css';

const useSecondsLeft = (deadline: number | null): number | null => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (deadline === null) return undefined;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [deadline]);
  return deadline === null ? null : Math.max(0, Math.ceil((deadline - now) / 1000));
};

export const BlokusOnlineBar = ({ online, onRecord }: { online: UseBlokusOnlineReturn; onRecord?: () => void }) => {
  const { language } = useGameLanguage();
  const t = getBlokusOnlineStrings(language);
  const { seating, game, mode, mySeat, currentSeat, leftSeats, winners, presence, playerId, isHost, isMyTurn, turnDeadline, roomId, lobbyState } = online;
  const seconds = useSecondsLeft(turnDeadline);
  const [leaving, setLeaving] = useState(false);

  if (!seating || !game || !mode || (lobbyState !== 'playing' && lobbyState !== 'finished')) return null;

  const strings = getBlokusStrings(language);
  const colorNames = strings.colors[mode];
  const finished = lobbyState === 'finished';
  const scores = seatScores(seating, game);
  const nameOf = (seat: number): string => {
    const controller = seating.seats[seat]?.controller;
    return (controller?.kind === 'human' && controller.name) || '';
  };
  const headline = !finished
    ? isMyTurn
      ? t.yourTurn
      : currentSeat >= 0
        ? t.turnOf(nameOf(currentSeat))
        : ''
    : winners.length > 1
      ? t.tie
      : winners[0] === mySeat
        ? t.win
        : winners.length === 1
          ? t.winnerIs(nameOf(winners[0]))
          : t.lose;

  return (
    <section className={styles.bar} data-mode={mode} data-testid="blokus-online-bar" aria-label={roomId ? t.roomLabel(roomId) : undefined}>
      <div className={styles.barHead}>
        <p className={styles.headline} role="status" data-testid="blokus-online-turn">
          {headline}
        </p>
        {seconds !== null && (
          <span className={styles.timer} role="timer" data-urgent={seconds <= 15} data-testid="blokus-online-timer" aria-label={t.timeLeft(seconds)}>
            {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
          </span>
        )}
      </div>

      <ul className={styles.seats} aria-label={t.seatsLabel}>
        {seating.seats.map((seat, index) => {
          const { controller } = seat;
          const id = controller.kind === 'human' ? controller.id : undefined;
          const left = leftSeats.includes(index);
          const here = !left && (id === playerId || (!!id && !!presence[id]));
          return (
            <li key={id ?? index} className={styles.seat} data-turn={index === currentSeat} data-winner={finished && winners.includes(index)} data-testid="blokus-online-player">
              <span className={styles.swatches}>
                {seat.colors.map((color) => (
                  <span key={color} className={styles.swatch} data-color={color} aria-hidden="true" />
                ))}
              </span>
              <span className={styles.seatName}>
                <span className={styles.name}>
                  {nameOf(index)}
                  {index === mySeat && ` (${t.you})`}
                </span>
                <span className={styles.muted}>{left ? t.leftGame : seat.colors.map((color) => colorNames[color]).join(' + ')}</span>
              </span>
              <span className={styles.dot} data-here={here} title={here ? t.connected : t.away}>
                <span className={styles.visuallyHidden}>{here ? t.connected : t.away}</span>
              </span>
              <span className={styles.score}>{t.points(scores[index])}</span>
            </li>
          );
        })}
      </ul>

      {online.error && (
        <p className={styles.error} role="alert">
          {errorText(t, online.error)}
        </p>
      )}

      {finished && (
        <div className={styles.row}>
          {isHost ? (
            <button type="button" className={styles.primary} data-testid="blokus-online-rematch" onClick={() => void online.rematch()}>
              <RotateCcw className={styles.icon} aria-hidden="true" />
              {t.rematch}
            </button>
          ) : (
            <p className={styles.muted}>{t.rematchWait}</p>
          )}
          {onRecord && (
            <button type="button" className={styles.secondary} data-testid="blokus-record-open" onClick={onRecord}>
              <ScrollText className={styles.icon} aria-hidden="true" />
              {strings.record.open}
            </button>
          )}
        </div>
      )}

      {leaving ? (
        <div className={styles.confirm} role="group" aria-label={t.leaveAsk}>
          <p className={styles.muted}>{t.leaveAsk}</p>
          <div className={styles.row}>
            <button type="button" className={styles.secondary} data-testid="blokus-online-leave-yes" onClick={() => void online.leave()}>
              {t.leaveYes}
            </button>
            <button type="button" className={styles.secondary} onClick={() => setLeaving(false)}>
              {t.stay}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className={styles.secondary}
          data-testid="blokus-online-leave"
          onClick={() => (finished ? void online.leave() : setLeaving(true))}
        >
          <LogOut className={styles.icon} aria-hidden="true" />
          {t.leave}
        </button>
      )}
    </section>
  );
};
