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
import type { DoubtLogEntry } from './multiplayerTypes';
import { CardBack, PlayingCard, PlayingCardStyles } from './PlayingCard';

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

  const myPlayerName = room?.players?.[multiplayer.context.playerId]?.name || multiplayer.context.playerName || 'You';

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
      const status = finishedPos >= 0 ? 'Finished' : 'Active';
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
  }, [gameState, multiplayer.context.playerId, playerNameOf]);

  const selectedCards = useMemo(() => {
    if (!selectedCardIds.length) return [];
    const byId = new Map(myHand.map(c => [c.id, c]));
    return selectedCardIds.map(id => byId.get(id)).filter(Boolean) as Card[];
  }, [myHand, selectedCardIds]);

  const validatePlay = useMemo<{ ok: boolean; error: string | null }>(() => {
    if (!gameState) return { ok: false, error: 'No game' };
    if (!isMyTurn || isSubmitting) return { ok: false, error: 'Not your turn' };
    if (gameState.phase !== 'play') return { ok: false, error: 'Not in play phase' };
    if (selectedCardIds.length < 1 || selectedCardIds.length > 4) return { ok: false, error: 'Select 1–4 cards' };
    // Soft check: every selected id is in the player's hand.
    const handIds = new Set(myHand.map((c) => c.id));
    if (!selectedCardIds.every((id) => handIds.has(id))) {
      return { ok: false, error: 'Card not in hand' };
    }
    return { ok: true, error: null };
  }, [gameState, isMyTurn, isSubmitting, myHand, selectedCardIds]);

  const handleStartGame = async () => {
    setLocalError(null);
    if (!room || !multiplayer.context.isHost) return;
    const playerCount = Object.keys(room.players || {}).length;
    if (playerCount < 3) {
      setLocalError('Need 3 players');
      return;
    }
    const ok = await multiplayer.startGame();
    if (!ok) setLocalError('Failed to start game');
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
      if (!res.success) setLocalError(res.error ?? 'Play rejected');
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
      if (!res.success) setLocalError(res.error ?? 'Accept rejected');
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
      if (!res.success) setLocalError(res.error ?? 'Doubt rejected');
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
      background: 'rgba(251, 191, 36, 0.12)',
      border: '1px solid rgba(251, 191, 36, 0.35)',
      borderRadius: '0.5rem',
      padding: '0.35rem 0.75rem',
      color: '#fbbf24',
      fontSize: '0.75rem',
      fontWeight: 700,
      fontFamily: 'monospace',
      letterSpacing: '0.12em',
    }}>
      ROOM {multiplayer.context.roomId}
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
    ? `${playerNameOf(pendingClaim.playerId)} claimed ${pendingClaim.cardCount} card(s) of ${rankToLabel(pendingClaim.declaredRank)}`
    : '—';

  const logLines = useMemo(() => {
    if (!gameState) return [];
    const log: DoubtLogEntry[] = gameState.log ?? [];
    return log.slice(-10).map((entry) => {
      const name = playerNameOf(entry.playerId);
      if (entry.type === 'play') {
        return `${name}: played ${entry.count ?? 0} claiming ${rankToLabel(entry.declaredRank ?? 1)}`;
      }
      if (entry.type === 'accept') return `${name}: accept`;
      if (entry.type === 'doubt') return `${name}: DOUBT!`;
      if (entry.type === 'resolve') return `${name}: ${entry.detail ?? 'resolved'}`;
      if (entry.type === 'finish') return `${name}: finished`;
      return `${name}: ${entry.detail ?? entry.type}`;
    });
  }, [gameState, playerNameOf]);

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
    <div style={{
      position: 'fixed',
      inset: 0,
      display: 'flex',
      flexDirection: 'column',
      background: 'linear-gradient(to bottom, #111827, #000)',
      overflow: 'hidden',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      <GameTopBar stats={stats} onInfoClick={() => setShowInfo(true)} additionalContent={roomBadge} />

      <div style={{
        flex: 1,
        paddingTop: '4rem',
        paddingBottom: '1.25rem',
        display: 'flex',
        justifyContent: 'center',
        overflow: 'auto',
      }}>
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
                  Back
                </button>
              </div>
              <DoubtMultiplayerLobby multiplayer={multiplayer} onGameStart={handleStartGame} />
              {localError && (
                <p style={{ marginTop: '1rem', color: '#f87171' }}>{localError}</p>
              )}
            </div>
          )}

          {/* Game */}
          {multiplayer.context.lobbyState === 'playing' && gameState && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr',
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
                    <div style={{ color: '#fff', fontWeight: 900, fontSize: '1.1rem' }}>Doubt (Online)</div>
                    <div style={{ color: '#9ca3af', fontSize: '0.85rem' }}>
                      {gameState.finished ? 'Finished' : isMyTurn ? 'Your turn' : `${playerNameOf(gameState.currentTurnPlayerId)}'s turn`}
                    </div>
                    <div style={{ color: '#9ca3af', fontSize: '0.85rem' }}>
                      Phase: <span style={{ color: '#e5e7eb', fontWeight: 800 }}>{gameState.phase}</span> · Next rank: <span style={{ color: '#fbbf24', fontWeight: 900 }}>{rankToLabel(requiredRank)}</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'stretch', justifyContent: 'flex-end' }}>
                    {playerSummaries.map((p) => (
                      <div
                        key={p.id}
                        style={{
                          background: p.isTurn ? 'rgba(34, 197, 94, 0.16)' : 'rgba(255, 255, 255, 0.06)',
                          border: p.isTurn ? '1px solid rgba(34, 197, 94, 0.55)' : '1px solid rgba(55, 65, 81, 1)',
                          borderRadius: '0.75rem',
                          padding: '0.45rem 0.75rem',
                          color: '#e5e7eb',
                          minWidth: '10rem',
                        }}
                      >
                        <div style={{ fontSize: '0.85rem', fontWeight: 800, color: p.isMe ? '#fbbf24' : '#e5e7eb' }}>
                          {p.name}{p.isMe ? ' (You)' : ''}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: '#9ca3af' }}>
                          {p.handCount} cards · {p.status}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: '#9ca3af', fontWeight: 800, marginTop: '0.25rem' }}>
                          {p.place ? `#${p.place}` : '—'}
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
                    <div style={{ color: '#fbbf24', fontWeight: 900, fontSize: '0.95rem' }}>Results</div>
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
                            #{p.place}: {p.name}
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem', marginTop: '1rem' }}>
                  {/* Table */}
                  <div style={{
                    background: 'rgba(17, 24, 39, 0.6)',
                    border: '1px solid rgba(55, 65, 81, 1)',
                    borderRadius: '0.75rem',
                    padding: '1rem',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
                      <div style={{ color: '#9ca3af', fontSize: '0.85rem', fontWeight: 700 }}>Pile</div>
                      <div style={{ color: '#9ca3af', fontSize: '0.85rem' }}>
                        {pileCount} cards · Last claim: {claimText}
                      </div>
                    </div>

                    <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.35rem', flexWrap: 'wrap', minHeight: '4.5rem' }}>
                      {pileCount === 0 ? (
                        <div style={{ color: '#6b7280', fontStyle: 'italic' }}>No pile yet</div>
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
                        Accept
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
                        Doubt!
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
                        Play
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
                        Clear
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
                        Leave
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
                      Play Area (declare {rankToLabel(requiredRank)})
                    </div>
                    <div style={{ color: '#9ca3af', fontSize: '0.85rem' }}>
                      {gameState.phase === 'challenge' ? 'Decide: Accept or Doubt' : selectedCardIds.length ? `Selected ${selectedCardIds.length}/4` : 'Drag cards here or click to select'}
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
                        {canSelectMore ? 'Drop 1–4 cards here' : '—'}
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
                    <div style={{ color: '#9ca3af', fontSize: '0.85rem', fontWeight: 700 }}>Your Hand</div>
                    <div style={{ color: '#9ca3af', fontSize: '0.85rem' }}>
                      {gameState.phase === 'play' ? `Truth cards highlighted (rank ${rankToLabel(requiredRank)})` : '—'}
                    </div>
                  </div>
                  <div style={{
                    marginTop: '0.75rem',
                    display: 'flex',
                    gap: '0.5rem',
                    flexWrap: 'nowrap',
                    overflowX: 'auto',
                    paddingBottom: '0.25rem',
                  }}>
                    {myHand.map(renderHandCard)}
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
                  <div style={{ color: '#9ca3af', fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.5rem' }}>Log</div>
                  {logLines.length === 0 ? (
                    <div style={{ color: '#6b7280', fontStyle: 'italic' }}>No actions yet</div>
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
          {multiplayer.context.lobbyState === 'finished' && (
            <div style={{
              background: 'rgba(0, 0, 0, 0.92)',
              border: '2px solid rgba(251, 191, 36, 0.35)',
              borderRadius: '1rem',
              padding: '1.5rem',
            }}>
              <div style={{ color: '#fff', fontWeight: 900, fontSize: '1.25rem' }}>Game finished</div>
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
                  Leave
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <InfoModal
        isOpen={showInfo}
        onClose={() => setShowInfo(false)}
        title="How to Play Doubt (ダウト)"
      >
        <div style={{ color: '#e5e7eb', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div>
            <div style={{ fontWeight: 800, color: '#fbbf24' }}>Goal</div>
            <div style={{ color: '#cbd5e1' }}>Get rid of all your cards.</div>
          </div>
          <div>
            <div style={{ fontWeight: 800, color: '#fbbf24' }}>Play</div>
            <div style={{ color: '#cbd5e1' }}>
              On your turn, place 1–4 cards face-down and declare them as the required rank (A→K loop).
            </div>
          </div>
          <div>
            <div style={{ fontWeight: 800, color: '#fbbf24' }}>Challenge</div>
            <div style={{ color: '#cbd5e1' }}>
              The next player may Accept or call Doubt. If the claim was true, the doubter takes the pile. If it was a lie, the claimant takes the pile.
            </div>
          </div>
          <div style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
            Note: Host is authoritative. Keep the host tab open during play.
          </div>
        </div>
      </InfoModal>

      <PlayingCardStyles />
    </div>
  );
}

