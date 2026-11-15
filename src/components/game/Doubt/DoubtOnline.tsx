/**
 * Doubt (ダウト) - Online Multiplayer (3–6 players)
 */

'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { GameTopBar, InfoModal, GameStats } from '../common';
import { DoubtMultiplayerLobby } from './DoubtMultiplayerLobby';
import { useDoubtMultiplayer } from './useDoubtMultiplayer';
import { rankToLabel } from './types';
import type { Card } from './types';
import { CardBack, PlayingCard, PlayingCardStyles } from './PlayingCard';
import screenStyles from './DoubtScreen.module.css';
import { usePageTop } from './usePageTop';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { formatDoubtLog, getDoubtLobbyStrings, getDoubtStrings, isDefaultYouName } from './i18n';

interface DoubtOnlineProps {
  onBackToMenu: () => void;
}

export function DoubtOnline({ onBackToMenu }: DoubtOnlineProps) {
  const multiplayer = useDoubtMultiplayer();
  const stats = useMemo<GameStats>(() => ({ wins: 0, losses: 0, draws: 0 }), []);
  const [showInfo, setShowInfo] = useState(false);

  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);
  const [draggingCardId, setDraggingCardId] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [dragOverSlot, setDragOverSlot] = useState<string | null>(null);

  const room = multiplayer.room;
  const gameState = multiplayer.gameState;
  const inMatch = multiplayer.context.lobbyState === 'playing' || multiplayer.context.lobbyState === 'finished';
  usePageTop(inMatch ? 'match' : 'lobby');
  const { language } = useGameLanguage();
  const t = getDoubtStrings(language);
  const lobbyT = getDoubtLobbyStrings(language);

  const myPlayerName = room?.players?.[multiplayer.context.playerId]?.name || multiplayer.context.playerName || t.yourNamePlaceholder;

  const myHand = useMemo<Card[]>(() => {
    if (!gameState) return [];
    return gameState.hands[multiplayer.context.playerId] ?? [];
  }, [gameState, multiplayer.context.playerId]);

  const isMyTurn = !!gameState && !gameState.finished && gameState.currentTurnPlayerId === multiplayer.context.playerId;
  const [isSubmitting, setIsSubmitting] = useState(false);

  const requiredRank = gameState?.requiredRank ?? 1;
  const pendingClaim = gameState?.pendingClaim ?? null;
  const pileCount = gameState?.pile.length ?? 0;

  const canSelectMore = isMyTurn && !isSubmitting && gameState?.phase === 'play' && selectedCardIds.length < 4;

  const playerNameOf = useCallback((playerId: string): string => (
    room?.players?.[playerId]?.name
      || (playerId === multiplayer.context.playerId ? myPlayerName : playerId)
  ), [multiplayer.context.playerId, myPlayerName, room?.players]);

  const playerSummaries = useMemo(() => {
    if (!gameState) return [];
    return gameState.playerOrder.map((id) => {
      const finishedPos = gameState.finishedOrder.indexOf(id);
      const status = finishedPos >= 0 ? t.out : t.active;
      const place = gameState.ranks?.[id] ?? null;
      return {
        id,
        name: playerNameOf(id),
        handCount: (gameState.hands[id] ?? []).length,
        isTurn: id === gameState.currentTurnPlayerId,
        isMe: id === multiplayer.context.playerId,
        status,
        place,
      };
    });
  }, [gameState, multiplayer.context.playerId, playerNameOf, t]);

  const selectedCards = useMemo(() => {
    if (!selectedCardIds.length) return [];
    const byId = new Map(myHand.map(c => [c.id, c]));
    return selectedCardIds.map(id => byId.get(id)).filter(Boolean) as Card[];
  }, [myHand, selectedCardIds]);

  const validatePlay = useMemo<{ ok: boolean; error: string | null }>(() => {
    if (!gameState) return { ok: false, error: null };
    if (!isMyTurn || isSubmitting) return { ok: false, error: t.errorGeneric };
    if (gameState.phase !== 'play') return { ok: false, error: lobbyT.notPlayPhase };
    if (selectedCardIds.length < 1 || selectedCardIds.length > 4) return { ok: false, error: t.errorSelectCards };
    // Soft check: every selected id is in the player's hand.
    const handIds = new Set(myHand.map((c) => c.id));
    if (!selectedCardIds.every((id) => handIds.has(id))) {
      return { ok: false, error: lobbyT.cardNotInHand };
    }
    return { ok: true, error: null };
  }, [gameState, isMyTurn, isSubmitting, myHand, selectedCardIds, t, lobbyT]);

  /** A message to show: the hook's own (English) messages translated, a server's message as sent. */
  const errorText = (message: string) => lobbyT.errors[message] ?? message;

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

  const playSelected = async () => {
    setLocalError(null);
    if (!validatePlay.ok) {
      setLocalError(validatePlay.error);
      return;
    }
    const ids = selectedCardIds;
    setSelectedCardIds([]);
    setDraggingCardId(null);
    setIsSubmitting(true);
    try {
      const res = await multiplayer.submitPlay(ids);
      if (!res.success) setLocalError(res.error ? errorText(res.error) : lobbyT.playRejected);
    } finally {
      setIsSubmitting(false);
    }
  };

  const acceptClaim = async () => {
    if (!gameState) return;
    if (!isMyTurn || isSubmitting || gameState.phase !== 'challenge') return;
    setIsSubmitting(true);
    try {
      const res = await multiplayer.submitAccept();
      if (!res.success) setLocalError(res.error ? errorText(res.error) : lobbyT.acceptRejected);
    } finally {
      setIsSubmitting(false);
    }
  };

  const doubtClaim = async () => {
    if (!gameState) return;
    if (!isMyTurn || isSubmitting || gameState.phase !== 'challenge') return;
    setIsSubmitting(true);
    try {
      const res = await multiplayer.submitDoubt();
      if (!res.success) setLocalError(res.error ? errorText(res.error) : lobbyT.doubtRejected);
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleCard = (cardId: string) => {
    setLocalError(null);
    setSelectedCardIds((prev) => {
      if (prev.includes(cardId)) return prev.filter(id => id !== cardId);
      if (prev.length >= 4) return prev;
      return [...prev, cardId];
    });
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

  const claimText = pendingClaim
    ? t.claimText(playerNameOf(pendingClaim.playerId), pendingClaim.cardCount, rankToLabel(pendingClaim.declaredRank))
    : t.noClaim;

  const logLines = useMemo(() => {
    if (!gameState) return [];
    const log = gameState.log ?? [];
    return log.slice(-10).map((entry) => formatDoubtLog(t, entry, playerNameOf));
  }, [gameState, playerNameOf, t]);

  const renderHandCard = (card: Card, idx: number) => {
    const selected = selectedCardIds.includes(card.id);
    const truthful = gameState?.phase === 'play' && card.rank === requiredRank;
    const disabled = !isMyTurn || isSubmitting || gameState?.phase !== 'play' || !!gameState?.finished;
    return (
      <PlayingCard
        key={card.id}
        card={card}
        size="small"
        selected={selected}
        playable={truthful}
        disabled={disabled}
        onClick={() => toggleCard(card.id)}
        variant="hand"
        animationDelay={Math.min(idx * 18, 180)}
        draggable={!disabled}
        onDragStart={(e) => {
          if (disabled) return;
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

  const renderSelectedCard = (card: Card, idx: number) => (
    <PlayingCard
      key={card.id}
      card={card}
      size="small"
      selected
      playable={card.rank === requiredRank}
      disabled={!isMyTurn || isSubmitting || gameState?.phase !== 'play' || !!gameState?.finished}
      onClick={() => toggleCard(card.id)}
      variant="static"
      animationDelay={Math.min(idx * 18, 180)}
    />
  );

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
              <DoubtMultiplayerLobby multiplayer={multiplayer} onGameStart={handleStartGame} />
              {localError && (
                <p style={{ marginTop: '1rem', color: '#f87171' }}>{localError}</p>
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
                padding: '1rem',
              }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <h2 style={{ margin: 0, color: '#fff', fontWeight: 900, fontSize: '1.1rem' }}>{lobbyT.matchTitle}</h2>
                    <div data-testid="doubt-online-status" style={{ color: '#9ca3af', fontSize: '0.85rem' }}>
                      {gameState.finished ? t.finished : isMyTurn ? t.yourTurn : t.turnOf(playerNameOf(gameState.currentTurnPlayerId))}
                    </div>
                    <div style={{ color: '#9ca3af', fontSize: '0.85rem' }}>
                      {lobbyT.phase}: <span style={{ color: '#e5e7eb', fontWeight: 800 }}>{gameState.finished || gameState.phase === 'finished' ? t.finished : gameState.phase === 'challenge' ? t.phaseChallenge : t.phasePlay}</span> · {t.nextRank}: <span style={{ color: '#fbbf24', fontWeight: 900 }}>{rankToLabel(requiredRank)}</span>
                    </div>
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
                          {p.name}{p.isMe && !isDefaultYouName(p.name) ? t.youSuffix : ''}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: '#9ca3af' }}>
                          {t.handOf(p.handCount)} · {p.status}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: '#9ca3af', fontWeight: 800, marginTop: '0.25rem' }}>
                          {p.place ? t.place(p.place) : '—'}
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
                  {/* Table */}
                  <div style={{
                    background: 'rgba(17, 24, 39, 0.6)',
                    border: '1px solid rgba(55, 65, 81, 1)',
                    borderRadius: '0.75rem',
                    padding: '1rem',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
                      <div style={{ color: '#9ca3af', fontSize: '0.85rem', fontWeight: 700, whiteSpace: 'nowrap' }}>{t.pile}</div>
                      <div style={{ color: '#9ca3af', fontSize: '0.85rem', textAlign: 'right' }}>
                        {t.cardsCount(pileCount)} · {t.lastClaim}: {claimText}
                      </div>
                    </div>

                    <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.35rem', flexWrap: 'wrap', minHeight: '4.5rem' }}>
                      {pileCount === 0 ? (
                        <div style={{ color: '#9ca3af', fontStyle: 'italic' }}>{t.noPileYet}</div>
                      ) : (
                        Array.from({ length: Math.min(12, pileCount) }, (_, i) => (
                          <CardBack key={i} size="small" />
                        ))
                      )}
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
                        onClick={acceptClaim}
                        disabled={!isMyTurn || isSubmitting || gameState.phase !== 'challenge' || gameState.finished}
                        style={{
                          padding: '0.6rem 1.25rem',
                          borderRadius: '0.75rem',
                          border: '1px solid rgba(55, 65, 81, 1)',
                          backgroundColor: (!isMyTurn || isSubmitting || gameState.phase !== 'challenge' || gameState.finished) ? '#374151' : '#2563eb',
                          color: '#fff',
                          fontWeight: 900,
                          cursor: (!isMyTurn || isSubmitting || gameState.phase !== 'challenge' || gameState.finished) ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {t.accept}
                      </button>

                      <button
                        onClick={doubtClaim}
                        disabled={!isMyTurn || isSubmitting || gameState.phase !== 'challenge' || gameState.finished}
                        style={{
                          padding: '0.6rem 1.25rem',
                          borderRadius: '0.75rem',
                          border: '1px solid rgba(55, 65, 81, 1)',
                          backgroundColor: (!isMyTurn || isSubmitting || gameState.phase !== 'challenge' || gameState.finished) ? '#374151' : '#dc2626',
                          color: '#fff',
                          fontWeight: 900,
                          cursor: (!isMyTurn || isSubmitting || gameState.phase !== 'challenge' || gameState.finished) ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {t.doubt}
                      </button>

                      <button
                        onClick={playSelected}
                        disabled={!validatePlay.ok || isSubmitting || gameState.finished}
                        style={{
                          padding: '0.6rem 1.25rem',
                          borderRadius: '0.75rem',
                          border: '1px solid rgba(55, 65, 81, 1)',
                          backgroundColor: (!validatePlay.ok || isSubmitting || gameState.finished) ? '#374151' : '#16a34a',
                          color: '#fff',
                          fontWeight: 900,
                          cursor: (!validatePlay.ok || isSubmitting || gameState.finished) ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {t.play}
                      </button>

                      <button
                        onClick={() => setSelectedCardIds([])}
                        disabled={isSubmitting || !selectedCardIds.length}
                        style={{
                          padding: '0.6rem 1.25rem',
                          borderRadius: '0.75rem',
                          border: '1px solid rgba(55, 65, 81, 1)',
                          backgroundColor: isSubmitting || !selectedCardIds.length ? '#111827' : '#4b5563',
                          color: '#e5e7eb',
                          fontWeight: 900,
                          cursor: isSubmitting || !selectedCardIds.length ? 'not-allowed' : 'pointer',
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
                    </div>
                  </div>

                  {localError && (
                    <div style={{ color: '#f87171', fontSize: '0.9rem', fontWeight: 700 }}>
                      {localError}
                    </div>
                  )}
                </div>

                {/* Play Area */}
                <div style={{
                  marginTop: '1rem',
                  background: 'rgba(17, 24, 39, 0.6)',
                  border: '1px solid rgba(55, 65, 81, 1)',
                  borderRadius: '0.75rem',
                  padding: '1rem',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
                    <div style={{ color: '#9ca3af', fontSize: '0.85rem', fontWeight: 700 }}>
                      {t.playAreaTitle(rankToLabel(requiredRank))}
                    </div>
                    <div style={{ color: '#9ca3af', fontSize: '0.85rem', textAlign: 'right' }}>
                      {gameState.phase === 'challenge' ? t.decideHint : selectedCardIds.length ? t.selected(selectedCardIds.length) : t.dropHint}
                    </div>
                  </div>

                  <div
                    onDragEnter={() => { if (canSelectMore) setDragOverSlot('drop'); }}
                    onDragLeave={() => { setDragOverSlot(prev => (prev === 'drop' ? null : prev)); }}
                    onDragOver={(e) => {
                      if (!canSelectMore) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                    }}
                    onDrop={(e) => {
                      if (!canSelectMore) return;
                      e.preventDefault();
                      setDragOverSlot(null);
                      const droppedId = e.dataTransfer.getData('text/plain');
                      if (!droppedId) return;
                      if (!myHand.some(c => c.id === droppedId)) return;
                      if (selectedCardIds.includes(droppedId)) return;
                      setSelectedCardIds(prev => (prev.length >= 4 ? prev : [...prev, droppedId]));
                    }}
                    style={{
                      marginTop: '0.75rem',
                      minHeight: '5.2rem',
                      borderRadius: '0.75rem',
                      border: canSelectMore ? '2px dashed rgba(34, 197, 94, 0.75)' : '1px dashed rgba(75, 85, 99, 0.6)',
                      background: dragOverSlot === 'drop' && canSelectMore ? 'rgba(34, 197, 94, 0.12)' : draggingCardId && canSelectMore ? 'rgba(34, 197, 94, 0.08)' : 'rgba(0,0,0,0.2)',
                      padding: '0.75rem',
                      display: 'flex',
                      gap: '0.5rem',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                    }}
                  >
                    {selectedCards.length === 0 ? (
                      <div style={{ color: '#6b7280', fontStyle: 'italic' }}>
                        {canSelectMore ? t.errorSelectCards : '—'}
                      </div>
                    ) : (
                      selectedCards.map(renderSelectedCard)
                    )}
                  </div>
                </div>

                {/* Hand */}
                <div style={{
                  marginTop: '1rem',
                  background: 'rgba(17, 24, 39, 0.6)',
                  border: '1px solid rgba(55, 65, 81, 1)',
                  borderRadius: '0.75rem',
                  padding: '1rem',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ color: '#9ca3af', fontSize: '0.85rem', fontWeight: 700, whiteSpace: 'nowrap' }}>{t.yourHand} ({myHand.length})</div>
                    <div style={{ color: '#9ca3af', fontSize: '0.85rem', textAlign: 'right' }}>
                      {gameState.phase === 'play' ? t.truthHighlight(rankToLabel(requiredRank)) : t.noClaim}
                    </div>
                  </div>
                  <div data-testid="doubt-online-hand" style={{
                    marginTop: '0.75rem',
                    display: 'flex',
                    gap: '0.5rem',
                    // Wrapped, as on the vs-AI table: in one row a full hand ran off the side of a phone.
                    flexWrap: 'wrap',
                    paddingBottom: '0.25rem',
                  }}>
                    {myHand.length === 0
                      ? <div style={{ color: '#9ca3af', fontStyle: 'italic' }}>{t.out}</div>
                      : myHand.map(renderHandCard)}
                  </div>
                </div>

                {/* Log */}
                <div style={{
                  marginTop: '1rem',
                  background: 'rgba(0, 0, 0, 0.45)',
                  border: '1px solid rgba(55, 65, 81, 1)',
                  borderRadius: '0.75rem',
                  padding: '1rem',
                }}>
                  <div style={{ color: '#9ca3af', fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.5rem' }}>{t.log}</div>
                  {logLines.length === 0 ? (
                    <div style={{ color: '#9ca3af', fontStyle: 'italic' }}>{t.noActions}</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', color: '#e5e7eb', fontSize: '0.85rem' }}>
                      {logLines.map((text, idx) => (
                        <div key={idx} style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                          {text}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Finished room state fallback */}
          {multiplayer.context.lobbyState === 'finished' && !gameState && (
            <div style={{
              background: 'rgba(0, 0, 0, 0.92)',
              border: '2px solid rgba(251, 191, 36, 0.35)',
              borderRadius: '1rem',
              padding: '1.5rem',
            }}>
              <h2 style={{ margin: 0, color: '#fff', fontWeight: 900, fontSize: '1.25rem' }}>{lobbyT.gameFinished}</h2>
              <div style={{ marginTop: '1rem' }}>
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
            <div style={{ fontWeight: 800, color: '#fbbf24' }}>{t.goalTitle}</div>
            <div style={{ color: '#cbd5e1' }}>{t.goalBody}</div>
          </div>
          <div>
            <div style={{ fontWeight: 800, color: '#fbbf24' }}>{t.playTitle}</div>
            <div style={{ color: '#cbd5e1' }}>{t.playBody}</div>
          </div>
          <div>
            <div style={{ fontWeight: 800, color: '#fbbf24' }}>{t.challengeTitle}</div>
            <div style={{ color: '#cbd5e1' }}>{t.challengeBody}</div>
          </div>
          <div style={{ color: '#94a3b8', fontSize: '0.85rem' }}>{lobbyT.hostNote}</div>
        </div>
      </InfoModal>

      <PlayingCardStyles />
    </div>
  );
}

