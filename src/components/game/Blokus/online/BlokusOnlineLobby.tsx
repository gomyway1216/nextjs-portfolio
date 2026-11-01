/**
 * The online lobby: create or join a room, then the waiting room with the invite
 * link, the seats, colours and ready. Takes the hook's return value, so the page
 * owns the room and this only draws it. Draws nothing once the game is on: see
 * BlokusOnlineBar for that.
 */

'use client';

import { ArrowLeft, Check, Copy, LogOut, Play, Share2 } from 'lucide-react';
import type { FormEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { useGameLanguage } from '../../contexts/GameLanguageContext';
import { RULES, type Mode } from '../engine';
import { getBlokusStrings } from '../i18n';
import { SHARED, ownerOf, seatCounts, type Seating } from '../seating';
import { errorText, getBlokusOnlineStrings, type BlokusOnlineStrings } from './strings';
import type { UseBlokusOnlineReturn } from './useBlokusOnline';
import type { WireSeat } from './wire';
import styles from './online.module.css';

const MODES: Mode[] = ['classic', 'duo'];
const NAME_LENGTH = 20;

interface BlokusOnlineLobbyProps {
  online: UseBlokusOnlineReturn;
  /** Back to the single-player screen. */
  onBack: () => void;
}

const ErrorLine = ({ online, t }: { online: UseBlokusOnlineReturn; t: BlokusOnlineStrings }) =>
  online.error ? (
    <p className={styles.error} role="alert">
      {errorText(t, online.error)}
    </p>
  ) : null;

const Swatch = ({ color }: { color: number }) => <span className={styles.swatch} data-color={color} aria-hidden="true" />;

const JoinAndCreate = ({ online, t, onBack }: { online: UseBlokusOnlineReturn; t: BlokusOnlineStrings; onBack: () => void }) => {
  const { invite, savedName, lobbyState } = online;
  const busy = lobbyState !== 'idle';
  const [name, setName] = useState(savedName);
  const [mode, setMode] = useState<Mode>('classic');
  const [code, setCode] = useState(invite?.roomId ?? '');
  const [password, setPassword] = useState(invite?.key ?? '');

  // The saved name and the invite arrive after hydration, so they can't be initial values.
  useEffect(() => setName((current) => current || savedName), [savedName]);
  useEffect(() => {
    if (!invite) return;
    setCode(invite.roomId);
    setPassword(invite.key);
  }, [invite]);

  const trimmed = name.trim();
  const canJoin = !!trimmed && !!code.trim() && !!password.trim();
  const needsPassword = !invite || !invite.key;

  const onCreate = (event: FormEvent) => {
    event.preventDefault();
    if (trimmed && !busy) void online.create(mode, trimmed);
  };

  const onJoin = (event: FormEvent) => {
    event.preventDefault();
    if (canJoin && !busy) void online.join(code, password.trim(), trimmed);
  };

  const nameField = (
    <div className={styles.field}>
      <label className={styles.label} htmlFor="blokus-online-name">
        {t.yourName}
      </label>
      <input
        id="blokus-online-name"
        className={styles.input}
        data-testid="blokus-online-name"
        value={name}
        maxLength={NAME_LENGTH}
        autoComplete="nickname"
        onChange={(event) => setName(event.target.value)}
      />
    </div>
  );

  const joinForm = (
    <form className={styles.card} onSubmit={onJoin} aria-labelledby="blokus-online-join">
      <h3 className={styles.cardTitle} id="blokus-online-join">
        {invite ? t.invitedTo(invite.roomId) : t.joinTitle}
      </h3>
      {!invite && (
        <div className={styles.field}>
          <label className={styles.label} htmlFor="blokus-online-code">
            {t.roomCode}
          </label>
          <input
            id="blokus-online-code"
            className={`${styles.input} ${styles.code}`}
            data-testid="blokus-online-code"
            value={code}
            maxLength={6}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
          />
        </div>
      )}
      {needsPassword && (
        <div className={styles.field}>
          <label className={styles.label} htmlFor="blokus-online-password">
            {t.roomPassword}
          </label>
          <input
            id="blokus-online-password"
            className={styles.input}
            data-testid="blokus-online-password"
            value={password}
            autoCapitalize="none"
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>
      )}
      <button type="submit" className={styles.primary} data-testid="blokus-online-join" disabled={!canJoin || busy}>
        {t.join}
      </button>
    </form>
  );

  const createForm = (
    <form className={styles.card} onSubmit={onCreate} aria-labelledby="blokus-online-create">
      <h3 className={styles.cardTitle} id="blokus-online-create">
        {t.createTitle}
      </h3>
      <fieldset className={styles.choices}>
        <legend className={styles.label}>{t.board}</legend>
        <div className={styles.choiceList}>
          {MODES.map((value) => (
            <label key={value} className={styles.choice}>
              <input
                type="radio"
                name="blokus-online-mode"
                value={value}
                data-testid={`blokus-online-mode-${value}`}
                checked={mode === value}
                onChange={() => setMode(value)}
              />
              <span>
                <span className={styles.choiceLabel}>{t.modes[value].label}</span>
                <span className={styles.muted}>{t.modes[value].description}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <button type="submit" className={styles.primary} data-testid="blokus-online-create" disabled={!trimmed || busy}>
        {t.create}
      </button>
    </form>
  );

  return (
    <section className={styles.panel} data-testid="blokus-online-lobby" aria-labelledby="blokus-online-title">
      <h2 className={styles.title} id="blokus-online-title">
        {t.title}
      </h2>
      <p className={styles.muted}>{t.subtitle}</p>
      {nameField}
      <ErrorLine online={online} t={t} />
      <p className={styles.notice} role="status">
        {lobbyState === 'creating' ? t.creating : lobbyState === 'joining' ? t.joining : ''}
      </p>
      {invite ? joinForm : createForm}
      {invite ? createForm : joinForm}
      <button type="button" className={styles.secondary} data-testid="blokus-online-back" onClick={onBack} disabled={busy}>
        <ArrowLeft className={styles.icon} aria-hidden="true" />
        {t.back}
      </button>
    </section>
  );
};

const InviteCard = ({ online, t }: { online: UseBlokusOnlineReturn; t: BlokusOnlineStrings }) => {
  const { shareUrl, roomId, roomKey } = online;
  const linkRef = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState('');
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl ?? '');
      setNotice(t.linkCopied);
    } catch {
      // Clipboard access can be refused: leave the link selected for a manual copy.
      linkRef.current?.select();
      setNotice(t.copyFailed);
    }
  };

  const share = async () => {
    try {
      await navigator.share({ title: t.shareText, text: t.shareText, url: shareUrl ?? '' });
    } catch {
      // The sheet was dismissed, which is not an error worth showing.
    }
  };

  return (
    <div className={styles.card}>
      <h3 className={styles.cardTitle}>{t.inviteTitle}</h3>
      <p className={styles.muted}>{t.inviteHint}</p>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="blokus-online-link">
          {t.inviteLink}
        </label>
        <input id="blokus-online-link" ref={linkRef} className={styles.input} data-testid="blokus-online-link" value={shareUrl ?? ''} readOnly onFocus={(event) => event.target.select()} />
      </div>
      <div className={styles.row}>
        <button type="button" className={styles.secondary} data-testid="blokus-online-copy" onClick={copy}>
          <Copy className={styles.icon} aria-hidden="true" />
          {t.copyLink}
        </button>
        {canShare && (
          <button type="button" className={styles.secondary} onClick={share}>
            <Share2 className={styles.icon} aria-hidden="true" />
            {t.share}
          </button>
        )}
      </div>
      <p className={styles.notice} role="status">
        {notice}
      </p>
      <dl className={styles.facts}>
        <div>
          <dt className={styles.label}>{t.roomCode}</dt>
          <dd className={styles.code} data-testid="blokus-online-room-code">
            {roomId}
          </dd>
        </div>
        <div>
          <dt className={styles.label}>{t.roomPassword}</dt>
          <dd className={styles.code}>{roomKey}</dd>
        </div>
      </dl>
    </div>
  );
};

const SeatRow = ({ seat, online, t, colorNames }: { seat: WireSeat; online: UseBlokusOnlineReturn; t: BlokusOnlineStrings; colorNames: readonly string[] }) => {
  const { room, playerId, presence } = online;
  const player = seat.id ? room?.players[seat.id] : undefined;
  const swatches = seat.colors.map((color) => <Swatch key={color} color={color} />);
  if (!player) {
    return (
      <li className={styles.seat} data-testid="blokus-online-seat-open">
        <span className={styles.swatches}>{swatches}</span>
        <span className={styles.muted}>{t.openSeat}</span>
      </li>
    );
  }
  const here = seat.id === playerId || !!presence[seat.id];
  return (
    <li className={styles.seat} data-testid="blokus-online-seat">
      <span className={styles.swatches}>{swatches}</span>
      <span className={styles.seatName}>
        <span className={styles.name}>
          {seat.name}
          {seat.id === playerId && ` (${t.you})`}
        </span>
        <span className={styles.muted}>
          {seat.colors.map((color) => colorNames[color]).join(' + ')}
          {seat.id === room?.hostId && ` · ${t.host}`}
        </span>
      </span>
      <span className={styles.dot} data-here={here} title={here ? t.connected : t.away}>
        <span className={styles.visuallyHidden}>{here ? t.connected : t.away}</span>
      </span>
      <span className={styles.badge} data-ready={player.ready}>
        {player.ready && <Check className={styles.icon} aria-hidden="true" />}
        {player.ready ? t.ready : t.notReady}
      </span>
    </li>
  );
};

const ColorPicker = ({ online, seating, t, colorNames }: { online: UseBlokusOnlineReturn; seating: Seating; t: BlokusOnlineStrings; colorNames: readonly string[] }) => {
  const { mySeat, room, pickColor } = online;
  const holderOf = (color: number): string => {
    const owner = ownerOf(seating, color);
    if (owner === mySeat) return t.holder.you;
    if (owner === SHARED) return t.holder.shared;
    const seat = seating.seats[owner]?.controller;
    return (seat?.kind === 'human' && seat.id && room?.players[seat.id]?.name) || t.holder.open;
  };
  return (
    <fieldset className={styles.colors}>
      <legend className={styles.label}>{t.colorTitle}</legend>
      <div className={styles.colorList}>
        {Array.from({ length: RULES[seating.mode].colors }, (_, color) => {
          const mine = ownerOf(seating, color) === mySeat;
          const holder = holderOf(color);
          return (
            <button
              key={color}
              type="button"
              className={styles.color}
              data-testid={`blokus-online-color-${color}`}
              aria-pressed={mine}
              aria-label={t.takeColor(colorNames[color], holder)}
              onClick={() => void pickColor(color)}
            >
              <Swatch color={color} />
              <span className={styles.seatName}>
                <span className={styles.name}>{colorNames[color]}</span>
                <span className={styles.muted}>{holder}</span>
              </span>
              {mine && <Check className={styles.icon} aria-hidden="true" />}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
};

const WaitingRoom = ({ online, t, colorNames, seats, seating, mode }: {
  online: UseBlokusOnlineReturn;
  t: BlokusOnlineStrings;
  colorNames: readonly string[];
  seats: readonly WireSeat[];
  seating: Seating;
  mode: Mode;
}) => {
  const { room, playerId, isHost } = online;
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headingRef.current?.focus(), []);

  const players = Object.values(room?.players ?? {});
  const counts = seatCounts(mode);
  const most = counts[counts.length - 1];
  const enough = players.length >= counts[0];
  const allReady = enough && players.every((player) => player.ready);
  const iAmReady = !!room?.players[playerId]?.ready;
  const seatHint = seating.shared !== null ? t.sharedHint : mode === 'classic' && seats.length === 2 ? t.twoColorHint : t.oneColorHint;

  return (
    <section className={styles.panel} data-testid="blokus-online-waiting" aria-labelledby="blokus-online-waiting-title">
      <h2 className={styles.title} id="blokus-online-waiting-title" ref={headingRef} tabIndex={-1}>
        {t.waitingTitle}
      </h2>
      <p className={styles.muted}>{t.boardIs(t.modes[mode].label)}</p>
      <ErrorLine online={online} t={t} />
      {players.length < most && <InviteCard online={online} t={t} />}

      <div className={styles.card} data-mode={mode}>
        <h3 className={styles.cardTitle}>{t.seatsTitle(players.length, most)}</h3>
        <ul className={styles.seats}>
          {seats.map((seat, index) => (
            <SeatRow key={seat.id || index} seat={seat} online={online} t={t} colorNames={colorNames} />
          ))}
        </ul>
        {seating.shared !== null && (
          <p className={styles.sharedLine}>
            <Swatch color={seating.shared} />
            {t.sharedColor(colorNames[seating.shared])}
          </p>
        )}
        <p className={styles.muted}>{seatHint}</p>
        <ColorPicker online={online} seating={seating} t={t} colorNames={colorNames} />
      </div>

      <div className={styles.row}>
        <button type="button" className={iAmReady ? styles.secondary : styles.primary} data-testid="blokus-online-ready" onClick={() => void online.setReady(!iAmReady)}>
          {iAmReady ? t.cancelReady : t.setReady}
        </button>
        {isHost && (
          <button type="button" className={styles.primary} data-testid="blokus-online-start" disabled={!allReady} onClick={() => void online.start()}>
            <Play className={styles.icon} aria-hidden="true" />
            {t.start}
          </button>
        )}
      </div>
      <p className={styles.muted} role="status">
        {!enough ? t.needPlayers : !allReady ? t.needReady : isHost ? '' : t.waitingForHost}
      </p>
      <button type="button" className={styles.secondary} data-testid="blokus-online-leave" onClick={() => void online.leave()}>
        <LogOut className={styles.icon} aria-hidden="true" />
        {t.leave}
      </button>
    </section>
  );
};

export const BlokusOnlineLobby = ({ online, onBack }: BlokusOnlineLobbyProps) => {
  const { language } = useGameLanguage();
  const t = getBlokusOnlineStrings(language);
  const { lobbyState, seating, mode, room } = online;

  if (online.rejoining) {
    return (
      <p className={styles.panel} role="status" data-testid="blokus-online-connecting">
        <span>
          <span className={styles.spinner} aria-hidden="true" />
          {t.reconnecting}
        </span>
      </p>
    );
  }
  // The forms stay up while connecting, so a wrong password keeps what was typed.
  if (lobbyState === 'idle' || lobbyState === 'creating' || lobbyState === 'joining') {
    return <JoinAndCreate online={online} t={t} onBack={onBack} />;
  }
  if ((lobbyState === 'waiting' || lobbyState === 'ready') && mode && seating && room) {
    const seats = seating.seats.map((seat) => ({
      colors: seat.colors,
      id: seat.controller.kind === 'human' ? seat.controller.id ?? '' : '',
      name: seat.controller.kind === 'human' ? seat.controller.name ?? '' : '',
    }));
    return <WaitingRoom online={online} t={t} colorNames={getBlokusStrings(language).colors[mode]} seats={seats} seating={seating} mode={mode} />;
  }
  return null;
};
