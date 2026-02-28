/**
 * Shichinarabe (七並べ) - Online Multiplayer (3–6 players)
 */

'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GameTopBar, InfoModal, GameStats } from '../common';
import { ShichinarabeMultiplayerLobby } from './ShichinarabeMultiplayerLobby';
import { useShichinarabeMultiplayer } from './useShichinarabeMultiplayer';
import { applyAction, createInitialShichinarabeState, getPlayableCardsForPlayer } from './gameLogic';
import { rankToLabel, SUITS } from './types';
import { PlayingCard, PlayingCardStyles } from './PlayingCard';
import type { Card, CardSuit } from './types';
import type { ShichinarabeAction, ShichinarabeLogEntry } from './multiplayerTypes';

function createActionId(): string {
  return `act_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function suitLabel(suit: CardSuit): string {
  if (suit === 'S') return '♠';
  if (suit === 'H') return '♥';
  if (suit === 'D') return '♦';
  return '♣';
}

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

  const lastProcessedActionId = useRef<string | null>(null);

  const room = multiplayer.room;
  const gameState = multiplayer.gameState;

  const myPlayerName = room?.players?.[multiplayer.context.playerId]?.name || multiplayer.context.playerName || 'You';

  const myHand = useMemo<Card[]>(() => {
    if (!gameState) return [];
    return gameState.hands[multiplayer.context.playerId] ?? [];
  }, [gameState, multiplayer.context.playerId]);

  const isMyTurn = !!gameState && !gameState.finished && gameState.currentTurnPlayerId === multiplayer.context.playerId;

  const isSubmitting = !multiplayer.context.isHost
    && multiplayer.pendingAction?.playerId === multiplayer.context.playerId;

  const playerNameOf = useCallback((playerId: string): string => (
    room?.players?.[playerId]?.name
      || (playerId === multiplayer.context.playerId ? myPlayerName : playerId)
  ), [multiplayer.context.playerId, myPlayerName, room?.players]);

  const playableCards = useMemo(() => {
    if (!gameState) return [];
    return getPlayableCardsForPlayer(gameState, multiplayer.context.playerId);
  }, [gameState, multiplayer.context.playerId]);

  const playableIdSet = useMemo(() => new Set(playableCards.map(c => c.id)), [playableCards]);

  const draggingCard = useMemo(() => {
    if (!draggingCardId) return null;
    return myHand.find(c => c.id === draggingCardId) ?? null;
  }, [draggingCardId, myHand]);

  const canPlaySelected = useMemo(() => {
    if (!gameState || !isMyTurn) return { ok: false, error: 'Not your turn' };
    if (!selectedCardId) return { ok: false, error: 'Select a card' };
    const probe: ShichinarabeAction = {
      actionId: 'probe',
      type: 'play',
      playerId: multiplayer.context.playerId,
      cardId: selectedCardId,
      timestamp: 0,
    };
    const result = applyAction(gameState, probe);
    return result.ok ? { ok: true, error: null } : { ok: false, error: result.error };
  }, [gameState, isMyTurn, multiplayer.context.playerId, selectedCardId]);

  const playerSummaries = useMemo(() => {
    if (!gameState) return [];
    return gameState.playerOrder.map((id) => {
      const finishedPos = gameState.finishedOrder.indexOf(id);
      const eliminatedPos = gameState.eliminatedOrder.indexOf(id);
      const status = finishedPos >= 0 ? 'Finished' : eliminatedPos >= 0 ? 'Eliminated' : 'Active';
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
    const players = Object.values(room.players || {}).sort((a, b) => (a.lastUpdate - b.lastUpdate) || a.id.localeCompare(b.id));
    const playerIds = players.map(p => p.id);
    if (playerIds.length < 3) {
      setLocalError('Need 3 players');
      return;
    }

    const initialState = createInitialShichinarabeState(playerIds, { maxPasses: 3 });
    await multiplayer.clearPendingAction();
    const ok = await multiplayer.startGame(initialState);
    if (!ok) setLocalError('Failed to start game');
  };

  const applyAndBroadcast = useCallback(async (action: ShichinarabeAction) => {
    if (!gameState) return;
    const result = applyAction(gameState, action);
    if (!result.ok) {
      setLocalError(result.error);
      return;
    }
    await multiplayer.updateGameState(result.state);
  }, [gameState, multiplayer]);

  // Host processes pending actions from non-host players
  useEffect(() => {
    if (!multiplayer.context.isHost) return;
    if (!multiplayer.pendingAction) return;
    if (!gameState) return;

    const action = multiplayer.pendingAction;
    if (action.actionId === lastProcessedActionId.current) return;
    lastProcessedActionId.current = action.actionId;

    // Host ignores own pending actions
    if (action.playerId === multiplayer.context.playerId) {
      multiplayer.clearPendingAction().catch(() => {});
      return;
    }

    const run = async () => {
      try {
        const result = applyAction(gameState, action);
        await multiplayer.clearPendingAction();
        if (!result.ok) return;
        await multiplayer.updateGameState(result.state);
      } catch {
        // ignore
      }
    };
    run();
  }, [multiplayer.context.isHost, multiplayer.pendingAction, multiplayer.context.playerId, multiplayer, gameState]);

  const playCardById = useCallback(async (cardId: string) => {
    setLocalError(null);
    setDragOverSlot(null);
    setDraggingCardId(null);
    if (!gameState) return;
    if (!cardId) return;
    if (!isMyTurn || isSubmitting || gameState.finished) return;

    const action: ShichinarabeAction = {
      actionId: createActionId(),
      type: 'play',
      playerId: multiplayer.context.playerId,
      cardId,
      timestamp: Date.now(),
    };

    setSelectedCardId(null);

    if (multiplayer.context.isHost) {
      await applyAndBroadcast(action);
      return;
    }

    // Validate locally before sending (non-host clients don't apply state directly).
    const probe: ShichinarabeAction = { ...action, actionId: 'probe', timestamp: 0 };
    const probeResult = applyAction(gameState, probe);
    if (!probeResult.ok) {
      setLocalError(probeResult.error);
      return;
    }

    await multiplayer.sendAction(action);
  }, [applyAndBroadcast, gameState, isMyTurn, isSubmitting, multiplayer]);

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

    const action: ShichinarabeAction = {
      actionId: createActionId(),
      type: 'pass',
      playerId: multiplayer.context.playerId,
      timestamp: Date.now(),
    };

    setSelectedCardId(null);

    if (multiplayer.context.isHost) {
      await applyAndBroadcast(action);
      return;
    }

    await multiplayer.sendAction(action);
  };

  const handleNewGame = async () => {
    if (!multiplayer.context.isHost) return;
    if (!gameState?.finished) return;
    const nextState = createInitialShichinarabeState(gameState.playerOrder, { maxPasses: gameState.maxPasses });
    setSelectedCardId(null);
    setLocalError(null);
    await multiplayer.clearPendingAction();
    await multiplayer.updateGameState(nextState);
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
                    <div style={{ color: '#fff', fontWeight: 900, fontSize: '1.1rem' }}>Shichinarabe (Online)</div>
                    <div style={{ color: '#9ca3af', fontSize: '0.85rem' }}>
                      {gameState.playerOrder.length} players · {isMyTurn ? 'Your turn' : `${playerNameOf(gameState.currentTurnPlayerId)}'s turn`}
                    </div>
                    {gameState.finished && (
                      <div style={{ color: '#fbbf24', fontWeight: 800, fontSize: '0.95rem' }}>
                        Finished
                      </div>
                    )}
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
                          {p.handCount} cards · Pass {p.passCount}/{gameState.maxPasses}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: p.status === 'Eliminated' ? '#f87171' : '#9ca3af', fontWeight: 800, marginTop: '0.25rem' }}>
                          {p.place ? `#${p.place}` : p.status}
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
                      <div style={{ color: '#9ca3af', fontSize: '0.85rem', fontWeight: 700 }}>Table</div>
                      <div style={{ color: '#9ca3af', fontSize: '0.85rem' }}>
                        {lastPlayed ? `Last: ${rankToLabel(lastPlayed.rank)}${suitLabel(lastPlayed.suit)}` : '—'}
                      </div>
                    </div>

	                    <div style={{ marginTop: '0.75rem', display: 'grid', gridTemplateColumns: '1fr', gap: '0.5rem' }}>
	                      {SUITS.map((suit) => {
	                        const bounds = gameState.table[suit];
	                        const low = bounds.low;
	                        const high = bounds.high;
	                        const playableDown = low - 1;
	                        const playableUp = high + 1;
	                        return (
	                          <div key={suit} style={{ overflowX: 'auto', paddingBottom: '0.25rem' }}>
	                            <div style={{ display: 'grid', gridTemplateColumns: '2.25rem repeat(13, 48px)', gap: '0.25rem', alignItems: 'center' }}>
	                              <div style={{ color: '#e5e7eb', fontWeight: 900, textAlign: 'center' }}>{suitLabel(suit)}</div>
	                              {Array.from({ length: 13 }, (_, i) => i + 1).map((rank) => {
	                                const played = rank >= low && rank <= high;
	                                const isEnd = rank === playableDown || rank === playableUp;
	                                const isLast = !!lastPlayed && lastPlayed.suit === suit && lastPlayed.rank === rank;
	                                const slotKey = `${suit}_${rank}`;

	                                if (played) {
	                                  const tableCard: Card = { id: `table_${suit}_${rank}`, suit, rank };
	                                  return (
	                                    <PlayingCard
	                                      key={`${suit}_${rank}`}
	                                      card={tableCard}
	                                      size="small"
	                                      disabled
	                                      variant={isLast ? 'table' : 'static'}
	                                    />
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
	                                      key={`${suit}_${rank}`}
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
	                                      style={{
	                                        width: 48,
	                                        height: 68,
	                                        borderRadius: 8,
	                                        border: canAcceptDrop
	                                          ? `2px dashed ${isOver ? 'rgba(34, 197, 94, 1)' : 'rgba(34, 197, 94, 0.85)'}`
	                                          : '1px dashed rgba(156, 163, 175, 0.55)',
	                                        background: isOver ? 'rgba(34, 197, 94, 0.12)' : 'rgba(0,0,0,0.25)',
	                                        display: 'flex',
	                                        alignItems: 'center',
	                                        justifyContent: 'center',
	                                        color: canAcceptDrop ? '#bbf7d0' : '#6b7280',
	                                        fontWeight: 900,
	                                        fontSize: '0.85rem',
	                                        userSelect: 'none',
	                                      }}
	                                    >
	                                      {rankToLabel(rank)}
	                                    </div>
	                                  );
	                                }

	                                return (
	                                  <div
	                                    key={`${suit}_${rank}`}
	                                    style={{
	                                      width: 48,
	                                      height: 68,
	                                      borderRadius: 8,
	                                      border: '1px solid rgba(55, 65, 81, 1)',
	                                      background: 'rgba(0,0,0,0.15)',
	                                    }}
	                                  />
	                                );
	                              })}
	                            </div>
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
                        Pass
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
                        Play
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
                          New Game
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
                      {selectedCardId ? 'Selected' : 'Select a card'}
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
                    {myHand.map(renderCard)}
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
                  {gameState.log.length === 0 ? (
                    <div style={{ color: '#6b7280', fontStyle: 'italic' }}>No actions yet</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', color: '#e5e7eb', fontSize: '0.85rem' }}>
                      {gameState.log.slice(-10).map((entry, idx) => {
                        const name = playerNameOf(entry.playerId);
                        const text = entry.type === 'play' && entry.card
                          ? `${name}: played ${rankToLabel(entry.card.rank)}${suitLabel(entry.card.suit)}`
                          : entry.type === 'pass'
                          ? `${name}: pass (${entry.passCount ?? 0}/${gameState.maxPasses})`
                          : entry.detail
                          ? `${name}: ${entry.detail}`
                          : `${name}: ...`;
                        return (
                          <div key={`${idx}_${entry.id}`} style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                            {text}
                          </div>
                        );
                      })}
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
        title="How to Play Shichinarabe"
      >
        <div style={{ color: '#e5e7eb', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div>
            <div style={{ fontWeight: 800, color: '#fbbf24' }}>Goal</div>
            <div style={{ color: '#cbd5e1' }}>Get rid of all your cards first.</div>
          </div>
          <div>
            <div style={{ fontWeight: 800, color: '#fbbf24' }}>Setup</div>
            <div style={{ color: '#cbd5e1' }}>
              7 of each suit is placed on the table at the start.
            </div>
          </div>
          <div>
            <div style={{ fontWeight: 800, color: '#fbbf24' }}>Play</div>
            <div style={{ color: '#cbd5e1' }}>
              On your turn, play one card adjacent to the current run of that suit (e.g., 6 or 8 next to 7).
            </div>
          </div>
          <div>
            <div style={{ fontWeight: 800, color: '#fbbf24' }}>Pass</div>
            <div style={{ color: '#cbd5e1' }}>
              You may pass up to {gameState?.maxPasses ?? 3} times. Reaching the limit eliminates you.
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
