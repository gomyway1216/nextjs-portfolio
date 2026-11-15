/**
 * Shichinarabe (七並べ) - Online Multiplayer (3–6 players)
 */

'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { GameTopBar, InfoModal, GameStats } from '../common';
import { ShichinarabeMultiplayerLobby } from './ShichinarabeMultiplayerLobby';
import { useShichinarabeMultiplayer } from './useShichinarabeMultiplayer';
import { getPlayableCardsForPlayer } from './gameLogic';
import { rankToLabel, SUITS, SUIT_SYMBOL } from './types';
import { PlayingCard, PlayingCardStyles } from './PlayingCard';
import type { Card, CardSuit } from './types';
import type { ShichinarabeLogEntry } from './multiplayerTypes';
import screenStyles from './ShichinarabeScreen.module.css';
import styles from './ShichinarabeVsAI.module.css';
import { usePageTop } from './usePageTop';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { formatShichinarabeLog, getShichinarabeLobbyStrings, getShichinarabeStrings, isDefaultYouName } from './i18n';

const RED_SUITS: Record<CardSuit, boolean> = { S: false, H: true, D: true, C: false };
const cardLabel = (card: { suit: CardSuit; rank: number }) => `${rankToLabel(card.rank)}${SUIT_SYMBOL[card.suit]}`;

interface ShichinarabeOnlineProps {
  onBackToMenu: () => void;
}

export function ShichinarabeOnline({ onBackToMenu }: ShichinarabeOnlineProps) {
  const multiplayer = useShichinarabeMultiplayer();
  const stats = useMemo<GameStats>(() => ({ wins: 0, losses: 0, draws: 0 }), []);
  const [showInfo, setShowInfo] = useState(false);

  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [draggingCardId, setDraggingCardId] = useState<string | null>(null);
  const [dragOverSlot, setDragOverSlot] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const room = multiplayer.room;
  const gameState = multiplayer.gameState;
  const inMatch = multiplayer.context.lobbyState === 'playing' || multiplayer.context.lobbyState === 'finished';
  usePageTop(inMatch ? 'match' : 'lobby');
  const { language } = useGameLanguage();
  const t = getShichinarabeStrings(language);
  const lobbyT = getShichinarabeLobbyStrings(language);

  const myPlayerName = room?.players?.[multiplayer.context.playerId]?.name || multiplayer.context.playerName || t.you;
  /** A message to show: the hook's own (English) messages translated, a server's message as sent. */
  const errorText = (message: string) => lobbyT.errors[message] ?? message;

  const myHand = useMemo<Card[]>(() => {
    if (!gameState) return [];
    return gameState.hands[multiplayer.context.playerId] ?? [];
  }, [gameState, multiplayer.context.playerId]);

  const isMyTurn = !!gameState && !gameState.finished && gameState.currentTurnPlayerId === multiplayer.context.playerId;

  const playerNameOf = useCallback((playerId: string): string => (
    room?.players?.[playerId]?.name
      || (playerId === multiplayer.context.playerId ? myPlayerName : playerId)
  ), [multiplayer.context.playerId, myPlayerName, room?.players]);

  const playableCards = useMemo(() => {
    if (!gameState) return [];
    return getPlayableCardsForPlayer(gameState, multiplayer.context.playerId);
  }, [gameState, multiplayer.context.playerId]);

  const playableIdSet = useMemo(() => new Set(playableCards.map(c => c.id)), [playableCards]);

  const selectedCard = useMemo(
    () => (selectedCardId ? myHand.find((c) => c.id === selectedCardId) ?? null : null),
    [myHand, selectedCardId],
  );

  const draggingCard = useMemo(() => {
    if (!draggingCardId) return null;
    return myHand.find(c => c.id === draggingCardId) ?? null;
  }, [draggingCardId, myHand]);

  const canPlaySelected = useMemo<{ ok: boolean; error: string | null }>(() => {
    if (!gameState || !isMyTurn) return { ok: false, error: t.notYourTurn };
    if (!selectedCardId) return { ok: false, error: t.selectCardFirst };
    const card = myHand.find((c) => c.id === selectedCardId);
    if (!card) return { ok: false, error: lobbyT.cardNotInHand };
    const bounds = gameState.table[card.suit];
    const playable =
      (bounds.low > 1 && card.rank === bounds.low - 1) ||
      (bounds.high < 13 && card.rank === bounds.high + 1);
    return playable ? { ok: true, error: null } : { ok: false, error: lobbyT.cardNotAdjacent };
  }, [gameState, isMyTurn, myHand, selectedCardId, t, lobbyT]);

  const playerSummaries = useMemo(() => {
    if (!gameState) return [];
    return gameState.playerOrder.map((id) => {
      const finishedPos = gameState.finishedOrder.indexOf(id);
      const eliminatedPos = gameState.eliminatedOrder.indexOf(id);
      const status = finishedPos >= 0 ? 'finished' : eliminatedPos >= 0 ? 'eliminated' : 'active';
      const place = gameState.ranks?.[id] ?? null;
      return {
        id,
        name: playerNameOf(id),
        handCount: (gameState.hands[id] ?? []).length,
        passCount: gameState.passCounts[id] ?? 0,
        isTurn: id === gameState.currentTurnPlayerId,
        isMe: id === multiplayer.context.playerId,
        status,
        place,
      };
    });
  }, [gameState, multiplayer.context.playerId, playerNameOf]);

  const lastPlayed = useMemo(() => {
    if (!gameState) return null;
    const log: ShichinarabeLogEntry[] = gameState.log ?? [];
    for (let i = log.length - 1; i >= 0; i--) {
      const entry = log[i]!;
      if (entry.type === 'play' && entry.card) return entry.card;
    }
    return null;
  }, [gameState]);

  const handleStartGame = async () => {
    setLocalError(null);
    if (!room || !multiplayer.context.isHost) return;
    const playerCount = Object.keys(room.players || {}).length;
    if (playerCount < 3) {
      setLocalError(lobbyT.needPlayers(3));
      return;
    }
    const ok = await multiplayer.startGame();
    if (!ok) setLocalError(lobbyT.startFailed);
  };

  const playCardById = useCallback(async (cardId: string) => {
    setLocalError(null);
    setDragOverSlot(null);
    setDraggingCardId(null);
    if (!gameState) return;
    if (!cardId) return;
    if (!isMyTurn || isSubmitting || gameState.finished) return;

    setSelectedCardId(null);
    setIsSubmitting(true);
    try {
      const result = await multiplayer.submitPlay(cardId);
      if (!result.success) setLocalError(result.error ? (lobbyT.errors[result.error] ?? result.error) : lobbyT.moveRejected);
    } finally {
      setIsSubmitting(false);
    }
  }, [gameState, isMyTurn, isSubmitting, multiplayer, lobbyT]);

  const handlePlay = async () => {
    setLocalError(null);
    if (!canPlaySelected.ok || !selectedCardId) {
      setLocalError(canPlaySelected.error);
      return;
    }
    await playCardById(selectedCardId);
  };

  const handlePass = async () => {
    if (!gameState) return;
    setLocalError(null);
    if (!isMyTurn || isSubmitting) return;
    setSelectedCardId(null);
    setIsSubmitting(true);
    try {
      const result = await multiplayer.submitPass();
      if (!result.success) setLocalError(result.error ? errorText(result.error) : lobbyT.passRejected);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNewGame = async () => {
    // Starting a fresh match needs a new room — CF is the only writer of
    // gameState and doesn't expose a reset action. Drop us back to the
    // lobby so the host can spin up a new room.
    setSelectedCardId(null);
    setLocalError(null);
    await multiplayer.leaveRoom();
    multiplayer.resetMultiplayer();
    onBackToMenu();
  };

  const toggleCard = (cardId: string) => {
    setLocalError(null);
    setSelectedCardId(prev => (prev === cardId ? null : cardId));
  };

  const renderCard = (card: Card, idx: number) => {
    const selected = selectedCardId === card.id;
    const playable = playableIdSet.has(card.id);
    const disabled = !isMyTurn || isSubmitting || gameState?.finished;
    const canDrag = !disabled && playable;

    return (
      <PlayingCard
        key={card.id}
        card={card}
        size="small"
        selected={selected}
        playable={playable}
        disabled={disabled}
        onClick={() => toggleCard(card.id)}
        variant="hand"
        animationDelay={Math.min(idx * 18, 180)}
        draggable={canDrag}
        onDragStart={(e) => {
          if (!canDrag) return;
          setLocalError(null);
          setSelectedCardId(card.id);
          setDraggingCardId(card.id);
          e.dataTransfer.setData('text/plain', card.id);
          e.dataTransfer.effectAllowed = 'move';
        }}
        onDragEnd={() => {
          setDraggingCardId(null);
          setDragOverSlot(null);
        }}
      />
    );
  };

  const roomBadge = multiplayer.context.roomId ? (
    <div style={{
      // Opaque: the top bar is light in the light theme, and amber on it could not be read.
      background: '#3b2a06',
      border: '1px solid rgba(251, 191, 36, 0.35)',
      borderRadius: '0.5rem',
      padding: '0.35rem 0.75rem',
      color: '#fbbf24',
      fontSize: '0.75rem',
      fontWeight: 700,
      fontFamily: 'monospace',
      letterSpacing: '0.12em',
      whiteSpace: 'nowrap',
    }}>
      {lobbyT.roomBadge(multiplayer.context.roomId)}
    </div>
  ) : null;

  const handleBackToMenu = async () => {
    try {
      await multiplayer.leaveRoom();
    } catch {
      // ignore
    }
    onBackToMenu();
  };

  return (
    <div className={screenStyles.screen}>
      <GameTopBar stats={stats} onInfoClick={() => setShowInfo(true)} additionalContent={roomBadge} />

      <div className={screenStyles.area}>
        <div style={{ width: 'min(1100px, 100%)', padding: '1rem' }}>
          {/* Lobby */}
          {(multiplayer.context.lobbyState === 'idle' ||
            multiplayer.context.lobbyState === 'creating' ||
            multiplayer.context.lobbyState === 'joining' ||
            multiplayer.context.lobbyState === 'waiting' ||
            multiplayer.context.lobbyState === 'ready') && (
            <div style={{
              background: 'rgba(0, 0, 0, 0.92)',
              border: '2px solid rgba(251, 191, 36, 0.35)',
              borderRadius: '1rem',
              padding: '1.5rem',
            }}>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.75rem' }}>
                <button
                  onClick={handleBackToMenu}
                  style={{
                    padding: '0.5rem 1rem',
                    borderRadius: '0.75rem',
                    border: '1px solid rgba(55, 65, 81, 1)',
                    backgroundColor: '#111827',
                    color: '#e5e7eb',
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  {lobbyT.back}
                </button>
              </div>
              <ShichinarabeMultiplayerLobby multiplayer={multiplayer} onGameStart={handleStartGame} />
              {localError && (
                <p style={{ marginTop: '1rem', color: '#f87171', textAlign: 'center' }}>{localError}</p>
              )}
            </div>
          )}

          {/* Game */}
          {(multiplayer.context.lobbyState === 'playing' || multiplayer.context.lobbyState === 'finished') && gameState && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr)',
              gap: '1rem',
            }}>
              <div style={{
                background: 'rgba(0, 0, 0, 0.92)',
                border: '2px solid rgba(14, 165, 233, 0.35)',
                borderRadius: '1rem',
                padding: 'clamp(0.75rem, 3vw, 1rem)',
                minWidth: 0,
              }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <h2 style={{ margin: 0, color: '#fff', fontWeight: 900, fontSize: '1.1rem' }}>{lobbyT.matchTitle}</h2>
                    <div data-testid="shichinarabe-online-status" style={{ color: '#9ca3af', fontSize: '0.85rem' }}>
                      {lobbyT.playerCount(gameState.playerOrder.length)} · {isMyTurn ? t.yourTurn : t.waitingTurn(playerNameOf(gameState.currentTurnPlayerId))}
                    </div>
                    {gameState.finished && (
                      <div style={{ color: '#fbbf24', fontWeight: 800, fontSize: '0.95rem' }}>
                        {t.finished}
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(7rem, 100%), 1fr))', gap: '0.5rem', width: '100%' }}>
                    {playerSummaries.map((p) => (
                      <div
                        key={p.id}
                        style={{
                          background: p.isTurn ? 'rgba(34, 197, 94, 0.16)' : 'rgba(255, 255, 255, 0.06)',
                          border: p.isTurn ? '1px solid rgba(34, 197, 94, 0.55)' : '1px solid rgba(55, 65, 81, 1)',
                          borderRadius: '0.75rem',
                          padding: '0.45rem 0.75rem',
                          color: '#e5e7eb',
                          minWidth: 0,
                        }}
                      >
                        <div style={{ fontSize: '0.85rem', fontWeight: 800, color: p.isMe ? '#fbbf24' : '#e5e7eb', overflowWrap: 'anywhere' }}>
                          {p.name}{p.isMe && !isDefaultYouName(p.name) ? lobbyT.youSuffix : ''}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: '#9ca3af' }}>
                          {t.cardsLeft(p.handCount)} · {t.passesLabel(p.passCount, gameState.maxPasses)}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: p.status === 'eliminated' ? '#f87171' : '#9ca3af', fontWeight: 800, marginTop: '0.25rem' }}>
                          {p.place
                            ? t.place(p.place)
                            : p.status === 'finished' ? t.statusFinished
                              : p.status === 'eliminated' ? t.statusEliminated
                                : t.statusActive}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {gameState.finished && gameState.ranks && (
                  <div style={{
                    marginTop: '0.75rem',
                    background: 'rgba(251, 191, 36, 0.08)',
                    border: '1px solid rgba(251, 191, 36, 0.35)',
                    borderRadius: '0.75rem',
                    padding: '0.75rem',
                  }}>
                    <h3 style={{ margin: 0, color: '#fbbf24', fontWeight: 900, fontSize: '0.95rem' }}>{t.results}</h3>
                    <div style={{ marginTop: '0.5rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                      {playerSummaries
                        .filter(p => typeof p.place === 'number')
                        .sort((a, b) => (a.place ?? 999) - (b.place ?? 999))
                        .map((p) => (
                          <div
                            key={p.id}
                            style={{
                              background: 'rgba(0,0,0,0.35)',
                              border: '1px solid rgba(55, 65, 81, 1)',
                              borderRadius: '0.75rem',
                              padding: '0.45rem 0.75rem',
                              color: '#e5e7eb',
                              fontSize: '0.85rem',
                              fontWeight: 800,
                            }}
                          >
                            {t.place(p.place ?? 0)}: {p.name}
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '1rem', marginTop: '1rem' }}>
                  {/* Table: on a phone the thirteen columns share the panel's width, as on the vs-AI table. */}
                  <div className={styles.panel}>
                    <div className={styles.panelHead}>
                      <span className={styles.panelTitle}>{t.table}</span>
                      <span style={{ color: '#9ca3af', fontSize: '0.85rem' }}>
                        {lastPlayed ? lobbyT.lastPlayed(cardLabel(lastPlayed)) : '—'}
                      </span>
                    </div>

                    <div className={styles.tableauScroll} data-testid="shichinarabe-online-board">
                      {SUITS.map((suit) => {
                        const bounds = gameState.table[suit];
                        const low = bounds.low;
                        const high = bounds.high;
                        const playableDown = low - 1;
                        const playableUp = high + 1;
                        return (
                          <div key={suit} className={styles.tableauGrid} style={{ marginBottom: '0.35rem' }}>
                            <div className={styles.suitLabel} data-red={RED_SUITS[suit]}>{SUIT_SYMBOL[suit]}</div>
                            {Array.from({ length: 13 }, (_, i) => i + 1).map((rank) => {
                              const played = rank >= low && rank <= high;
                              const isEnd = rank === playableDown || rank === playableUp;
                              const isLast = !!lastPlayed && lastPlayed.suit === suit && lastPlayed.rank === rank;
                              const slotKey = `${suit}_${rank}`;

                              if (played) {
                                const tableCard: Card = { id: `table_${suit}_${rank}`, suit, rank };
                                return (
                                  <div key={slotKey} className={rank === 7 ? `${styles.slotCard} ${styles.slotSeven}` : styles.slotCard}>
                                    <div className={styles.slotCardFull}>
                                      <PlayingCard
                                        card={tableCard}
                                        size="small"
                                        disabled
                                        variant={isLast ? 'table' : 'static'}
                                      />
                                    </div>
                                    <div
                                      className={styles.slotCardMini}
                                      data-red={RED_SUITS[suit]}
                                      data-last={isLast ? 'true' : 'false'}
                                      role="img"
                                      aria-label={cardLabel(tableCard)}
                                    >
                                      <span>{rankToLabel(rank)}</span>
                                      <span aria-hidden>{SUIT_SYMBOL[suit]}</span>
                                    </div>
                                  </div>
                                );
                              }

                              if (isEnd) {
                                const canAcceptDrop = !!draggingCard
                                  && isMyTurn
                                  && !isSubmitting
                                  && !gameState.finished
                                  && draggingCard.suit === suit
                                  && draggingCard.rank === rank;
                                const isOver = dragOverSlot === slotKey;

                                return (
                                  <div
                                    key={slotKey}
                                    className={styles.slotEnd}
                                    data-droppable={canAcceptDrop ? 'true' : 'false'}
                                    data-over={isOver ? 'true' : 'false'}
                                    onDragEnter={() => {
                                      if (canAcceptDrop) setDragOverSlot(slotKey);
                                    }}
                                    onDragLeave={() => {
                                      setDragOverSlot((prev) => (prev === slotKey ? null : prev));
                                    }}
                                    onDragOver={(e) => {
                                      if (!isMyTurn || isSubmitting || gameState.finished) return;
                                      e.preventDefault();
                                      e.dataTransfer.dropEffect = 'move';
                                    }}
                                    onDrop={(e) => {
                                      e.preventDefault();
                                      setDragOverSlot(null);
                                      const droppedId = e.dataTransfer.getData('text/plain');
                                      if (!droppedId) return;
                                      const droppedCard = myHand.find(c => c.id === droppedId);
                                      if (!droppedCard) return;
                                      if (droppedCard.suit !== suit || droppedCard.rank !== rank) return;
                                      void playCardById(droppedId);
                                    }}
                                  >
                                    {rankToLabel(rank)}
                                  </div>
                                );
                              }

                              return <div key={slotKey} className={styles.slotEmpty} />;
                            })}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Controls */}
                  <div style={{
                    display: 'flex',
                    gap: '0.75rem',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}>
                    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                      <button
                        onClick={handlePass}
                        disabled={!isMyTurn || isSubmitting || gameState.finished}
                        style={{
                          padding: '0.6rem 1.25rem',
                          borderRadius: '0.75rem',
                          border: '1px solid rgba(55, 65, 81, 1)',
                          backgroundColor: (!isMyTurn || isSubmitting || gameState.finished) ? '#374151' : '#ca8a04',
                          color: '#fff',
                          fontWeight: 900,
                          cursor: (!isMyTurn || isSubmitting || gameState.finished) ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {t.pass}
                      </button>

                      <button
                        onClick={handlePlay}
                        disabled={!canPlaySelected.ok || isSubmitting || gameState.finished}
                        style={{
                          padding: '0.6rem 1.25rem',
                          borderRadius: '0.75rem',
                          border: '1px solid rgba(55, 65, 81, 1)',
                          backgroundColor: (!canPlaySelected.ok || isSubmitting || gameState.finished) ? '#374151' : '#16a34a',
                          color: '#fff',
                          fontWeight: 900,
                          cursor: (!canPlaySelected.ok || isSubmitting || gameState.finished) ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {t.play}
                      </button>

                      <button
                        onClick={() => setSelectedCardId(null)}
                        disabled={isSubmitting || !selectedCardId}
                        style={{
                          padding: '0.6rem 1.25rem',
                          borderRadius: '0.75rem',
                          border: '1px solid rgba(55, 65, 81, 1)',
                          backgroundColor: isSubmitting || !selectedCardId ? '#111827' : '#4b5563',
                          color: '#e5e7eb',
                          fontWeight: 900,
                          cursor: isSubmitting || !selectedCardId ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {t.clear}
                      </button>
                    </div>

                    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                      <button
                        onClick={handleBackToMenu}
                        style={{
                          padding: '0.6rem 1.25rem',
                          borderRadius: '0.75rem',
                          border: '1px solid rgba(55, 65, 81, 1)',
                          backgroundColor: '#111827',
                          color: '#e5e7eb',
                          fontWeight: 900,
                          cursor: 'pointer',
                        }}
                      >
                        {lobbyT.leave}
                      </button>

                      {multiplayer.context.isHost && gameState.finished && (
                        <button
                          onClick={handleNewGame}
                          style={{
                            padding: '0.6rem 1.25rem',
                            borderRadius: '0.75rem',
                            border: '1px solid rgba(55, 65, 81, 1)',
                            backgroundColor: '#2563eb',
                            color: '#fff',
                            fontWeight: 900,
                            cursor: 'pointer',
                          }}
                        >
                          {t.newGame}
                        </button>
                      )}
                    </div>
                  </div>

                  {localError && (
                    <div style={{ color: '#f87171', fontSize: '0.9rem', fontWeight: 700 }}>
                      {localError}
                    </div>
                  )}
                </div>

                {/* Hand */}
                <div className={styles.panel} style={{ marginTop: '1rem' }}>
                  <div className={styles.panelHead}>
                    <span className={styles.panelTitle} style={{ whiteSpace: 'nowrap' }}>{t.yourHand}</span>
                    <span style={{ color: '#9ca3af', fontSize: '0.85rem' }}>
                      {selectedCard ? t.selected(cardLabel(selectedCard)) : t.selectCard}
                    </span>
                  </div>
                  <div className={styles.hand} data-testid="shichinarabe-online-hand">
                    {myHand.map(renderCard)}
                  </div>
                </div>

                {/* Log */}
                <div className={styles.panel} style={{ marginTop: '1rem' }}>
                  <div className={styles.panelHead}>
                    <span className={styles.panelTitle}>{t.activityLog}</span>
                  </div>
                  {gameState.log.length === 0 ? (
                    <div style={{ color: '#94a3b8', fontStyle: 'italic' }}>{t.noActions}</div>
                  ) : (
                    <div className={styles.logList} style={{ maxHeight: 'none' }}>
                      {gameState.log.slice(-10).map((entry, idx) => (
                        <div key={`${idx}_${entry.id}`}>
                          {formatShichinarabeLog(t, entry, playerNameOf(entry.playerId), gameState.maxPasses)}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <InfoModal
        isOpen={showInfo}
        onClose={() => setShowInfo(false)}
        title={t.howToTitle}
      >
        <div style={{ color: '#e5e7eb', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div>
            <div style={{ fontWeight: 800, color: '#fbbf24' }}>{t.goalHeading}</div>
            <div style={{ color: '#cbd5e1' }}>{t.goalBody}</div>
          </div>
          <div>
            <div style={{ fontWeight: 800, color: '#fbbf24' }}>{t.setupHeading}</div>
            <div style={{ color: '#cbd5e1' }}>{t.setupBody}</div>
          </div>
          <div>
            <div style={{ fontWeight: 800, color: '#fbbf24' }}>{t.playHeading}</div>
            <div style={{ color: '#cbd5e1' }}>{t.playBody}</div>
          </div>
          <div>
            <div style={{ fontWeight: 800, color: '#fbbf24' }}>{t.passHeading}</div>
            <div style={{ color: '#cbd5e1' }}>{t.passBody(gameState?.maxPasses ?? 3)}</div>
          </div>
          <div style={{ color: '#94a3b8', fontSize: '0.85rem' }}>{lobbyT.hostNote}</div>
        </div>
      </InfoModal>

      <PlayingCardStyles />
    </div>
  );
}
