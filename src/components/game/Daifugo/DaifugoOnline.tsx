/**
 * Daifugo (大富豪) - Online Multiplayer (3–6 players)
 */

'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GameTopBar, InfoModal, GameStats } from '../common';
import { DaifugoMultiplayerLobby } from './DaifugoMultiplayerLobby';
import { useDaifugoMultiplayer } from './useDaifugoMultiplayer';
import { applyAction, createInitialDaifugoState, getPlayShape, getSelectedCards, getNextPlayerId, sortHand } from './gameLogic';
import { cardToShortLabel, isJoker, rankToLabel } from './types';
import type { Card } from './types';
import { DAIFUGO_RANK_PRIORITY, daifugoRankToLabel } from './multiplayerTypes';
import type { DaifugoAction, DaifugoLogEntry } from './multiplayerTypes';

function createActionId(): string {
  return `act_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

interface DaifugoOnlineProps {
  onBackToMenu: () => void;
}

export function DaifugoOnline({ onBackToMenu }: DaifugoOnlineProps) {
  const multiplayer = useDaifugoMultiplayer();
  const stats = useMemo<GameStats>(() => ({ wins: 0, losses: 0, draws: 0 }), []);
  const [showInfo, setShowInfo] = useState(false);

  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);
  const [selectedGiveCardIds, setSelectedGiveCardIds] = useState<string[]>([]);
  const [localError, setLocalError] = useState<string | null>(null);

  const lastProcessedActionId = useRef<string | null>(null);

  const room = multiplayer.room;
  const gameState = multiplayer.gameState;
  const isReversed = !!gameState && (gameState.revolution !== gameState.jackBack);

  const myPlayerName = room?.players?.[multiplayer.context.playerId]?.name || multiplayer.context.playerName || 'You';

  const myHand = useMemo<Card[]>(() => {
    if (!gameState) return [];
    return gameState.hands[multiplayer.context.playerId] ?? [];
  }, [gameState, multiplayer.context.playerId]);

  const isMyTurn = !!gameState && !gameState.finished && gameState.currentTurnPlayerId === multiplayer.context.playerId;

  const isSubmitting = !multiplayer.context.isHost
    && multiplayer.pendingAction?.playerId === multiplayer.context.playerId;

  const effectiveSelectedCardIds = useMemo(() => {
    if (selectedCardIds.length === 0) return [];
    const myIds = new Set(myHand.map(c => c.id));
    return selectedCardIds.filter(id => myIds.has(id));
  }, [myHand, selectedCardIds]);

  const playerNameOf = useCallback((playerId: string): string => {
    return room?.players?.[playerId]?.name
      || (playerId === multiplayer.context.playerId ? myPlayerName : playerId);
  }, [multiplayer.context.playerId, myPlayerName, room?.players]);

  const selectedCards = useMemo(
    () => getSelectedCards(myHand, effectiveSelectedCardIds) ?? [],
    [myHand, effectiveSelectedCardIds]
  );
  const selectedShape = useMemo(() => getPlayShape(selectedCards), [selectedCards]);

  const sevenGiveContext = useMemo(() => {
    if (!gameState) return { needed: false as const, giveCount: 0, toPlayerId: null as string | null };
    if (!isMyTurn || isSubmitting || gameState.finished) {
      return { needed: false as const, giveCount: 0, toPlayerId: null as string | null };
    }
    if (!selectedShape || selectedShape.kind !== 'group' || selectedShape.rankKey !== 7) {
      return { needed: false as const, giveCount: 0, toPlayerId: null as string | null };
    }

    const remainingCount = myHand.length - effectiveSelectedCardIds.length;
    if (remainingCount <= 0) return { needed: false as const, giveCount: 0, toPlayerId: null as string | null };

    // Next active (skip finished players)
    let cur = multiplayer.context.playerId;
    let toPlayerId: string | null = null;
    for (let i = 0; i < gameState.playerOrder.length; i++) {
      cur = getNextPlayerId(gameState.playerOrder, cur);
      if (!gameState.finishedOrder.includes(cur)) {
        toPlayerId = cur;
        break;
      }
    }

    const giveCount = Math.min(selectedShape.count, Math.max(0, remainingCount));
    return toPlayerId
      ? { needed: true as const, giveCount, toPlayerId }
      : { needed: false as const, giveCount: 0, toPlayerId: null as string | null };
  }, [
    effectiveSelectedCardIds.length,
    gameState,
    isMyTurn,
    isSubmitting,
    multiplayer.context.playerId,
    myHand.length,
    selectedShape,
  ]);

  const sevenGiveCandidates = useMemo(() => {
    if (!sevenGiveContext.needed) return [];
    const selectedSet = new Set(effectiveSelectedCardIds);
    return myHand.filter(c => !selectedSet.has(c.id));
  }, [effectiveSelectedCardIds, myHand, sevenGiveContext.needed]);

  const effectiveGiveCardIds = useMemo(() => {
    if (!sevenGiveContext.needed) return [];
    const available = new Set(sevenGiveCandidates.map(c => c.id));
    return selectedGiveCardIds
      .filter(id => available.has(id))
      .slice(0, sevenGiveContext.giveCount);
  }, [selectedGiveCardIds, sevenGiveCandidates, sevenGiveContext.giveCount, sevenGiveContext.needed]);

  const finalGiveCardIds = useMemo(() => {
    if (!sevenGiveContext.needed) return [];
    if (effectiveGiveCardIds.length >= sevenGiveContext.giveCount) {
      return effectiveGiveCardIds.slice(0, sevenGiveContext.giveCount);
    }

    const selectedSet = new Set(effectiveGiveCardIds);
    const rest = sortHand(sevenGiveCandidates.filter(c => !selectedSet.has(c.id))).map(c => c.id);
    return [...effectiveGiveCardIds, ...rest].slice(0, sevenGiveContext.giveCount);
  }, [effectiveGiveCardIds, sevenGiveCandidates, sevenGiveContext.giveCount, sevenGiveContext.needed]);

  const canPlaySelected = useMemo(() => {
    if (!gameState || !isMyTurn) return { ok: false, error: 'Not your turn' };
    if (!selectedShape) return { ok: false, error: 'Select cards' };
    const probe: DaifugoAction = {
      actionId: 'probe',
      type: 'play',
      playerId: multiplayer.context.playerId,
      cardIds: effectiveSelectedCardIds,
      timestamp: 0,
    };
    const result = applyAction(gameState, probe);
    return result.ok ? { ok: true, error: null } : { ok: false, error: result.error };
  }, [gameState, isMyTurn, selectedShape, effectiveSelectedCardIds, multiplayer.context.playerId]);

  const toggleCard = (cardId: string) => {
    setLocalError(null);
    setSelectedCardIds(prev => (
      prev.includes(cardId) ? prev.filter(id => id !== cardId) : [...prev, cardId]
    ));
  };

  const toggleGiveCard = (cardId: string) => {
    if (!sevenGiveContext.needed) return;
    setSelectedGiveCardIds((prev) => {
      if (prev.includes(cardId)) return prev.filter(id => id !== cardId);
      if (prev.length >= sevenGiveContext.giveCount) return prev;
      return [...prev, cardId];
    });
  };

  const handleStartGame = async () => {
    setLocalError(null);
    if (!room || !multiplayer.context.isHost) return;
    const players = Object.values(room.players || {}).sort((a, b) => (a.lastUpdate - b.lastUpdate) || a.id.localeCompare(b.id));
    const playerIds = players.map(p => p.id);
    if (playerIds.length < 3) {
      setLocalError('Need 3 players');
      return;
    }

    const initialState = createInitialDaifugoState(playerIds);
    await multiplayer.clearPendingAction();
    const ok = await multiplayer.startGame(initialState);
    if (!ok) setLocalError('Failed to start game');
  };

  const applyAndBroadcast = useCallback(async (action: DaifugoAction) => {
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

  const handlePlay = async () => {
    if (!gameState) return;
    setLocalError(null);
    if (!isMyTurn) return;
    if (!canPlaySelected.ok) {
      setLocalError(canPlaySelected.error);
      return;
    }

    const action: DaifugoAction = {
      actionId: createActionId(),
      type: 'play',
      playerId: multiplayer.context.playerId,
      cardIds: effectiveSelectedCardIds,
      giveCardIds: sevenGiveContext.needed ? finalGiveCardIds : undefined,
      timestamp: Date.now(),
    };

    setSelectedCardIds([]);
    setSelectedGiveCardIds([]);

    if (multiplayer.context.isHost) {
      await applyAndBroadcast(action);
      return;
    }

    await multiplayer.sendAction(action);
  };

  const handlePass = async () => {
    if (!gameState) return;
    setLocalError(null);
    if (!isMyTurn) return;

    const action: DaifugoAction = {
      actionId: createActionId(),
      type: 'pass',
      playerId: multiplayer.context.playerId,
      timestamp: Date.now(),
    };

    setSelectedCardIds([]);
    setSelectedGiveCardIds([]);

    if (multiplayer.context.isHost) {
      await applyAndBroadcast(action);
      return;
    }

    await multiplayer.sendAction(action);
  };

  const handleNextRound = async () => {
    if (!multiplayer.context.isHost) return;
    if (!gameState?.finished) return;
    const nextState = createInitialDaifugoState(gameState.playerOrder, {
      round: gameState.round + 1,
      previousRanks: gameState.ranks ?? undefined,
    });
    setSelectedCardIds([]);
    setSelectedGiveCardIds([]);
    setLocalError(null);
    await multiplayer.clearPendingAction();
    await multiplayer.updateGameState(nextState);
  };

  const logLines = useMemo(() => {
    const log: DaifugoLogEntry[] = gameState?.log ?? [];
    return log.slice(-10).map((entry) => {
      const name = playerNameOf(entry.playerId);
      if (entry.detail) return `${name}: ${entry.detail}`;
      if (entry.type === 'play' && entry.cardCount && entry.rankKey) {
        if (entry.playKind === 'straight') {
          const start = entry.rankKey - entry.cardCount + 1;
          return `${name}: straight ${entry.cardCount} (${rankToLabel(start)}-${rankToLabel(entry.rankKey)})`;
        }
        return `${name}: played ${entry.cardCount} × ${rankToLabel(entry.rankKey)}`;
      }
      if (entry.type === 'pass') return `${name}: pass`;
      if (entry.type === 'trick_end') return `${name}: table cleared`;
      if (entry.type === 'round_end') return `${name}: round end`;
      if (entry.type === 'next_round') return `${name}: next round`;
      return `${name}: ...`;
    });
  }, [gameState?.log, playerNameOf]);

  const daifugoId = useMemo(() => {
    if (!gameState?.ranks) return null;
    return Object.entries(gameState.ranks).find(([, r]) => r === 'daifugo')?.[0] ?? null;
  }, [gameState?.ranks]);

  const resultRows = useMemo(() => {
    if (!gameState?.ranks) return [];
    const finishedPos = new Map<string, number>();
    gameState.finishedOrder.forEach((id, idx) => finishedPos.set(id, idx));

    return gameState.playerOrder
      .map((id) => ({
        id,
        name: playerNameOf(id),
        rank: gameState.ranks?.[id] ?? null,
      }))
      .filter((row): row is { id: string; name: string; rank: NonNullable<typeof row.rank> } => !!row.rank)
      .sort((a, b) => {
        const pa = DAIFUGO_RANK_PRIORITY[a.rank];
        const pb = DAIFUGO_RANK_PRIORITY[b.rank];
        if (pa !== pb) return pa - pb;
        return (finishedPos.get(a.id) ?? 999) - (finishedPos.get(b.id) ?? 999);
      });
  }, [gameState, playerNameOf]);

  const playerSummaries = useMemo(() => {
    if (!gameState) return [];
    return gameState.playerOrder.map((id) => ({
      id,
      name: playerNameOf(id),
      handCount: (gameState.hands[id] ?? []).length,
      isTurn: id === gameState.currentTurnPlayerId,
      isMe: id === multiplayer.context.playerId,
      finishedPos: gameState.finishedOrder.indexOf(id),
      rank: gameState.ranks?.[id] ?? null,
    }));
  }, [gameState, multiplayer.context.playerId, playerNameOf]);

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

  const renderCard = (card: Card, idx: number) => {
    const selected = effectiveSelectedCardIds.includes(card.id);
    const isRed = card.suit === 'H' || card.suit === 'D';
    const disabled = !isMyTurn || isSubmitting || gameState?.finished;

    return (
      <button
        key={card.id}
        onClick={() => toggleCard(card.id)}
        disabled={disabled}
        style={{
          width: '3.1rem',
          height: '4.2rem',
          borderRadius: '0.5rem',
          border: selected ? '2px solid #0ea5e9' : '1px solid rgba(55, 65, 81, 1)',
          background: selected ? 'rgba(14, 165, 233, 0.15)' : 'rgba(17, 24, 39, 0.8)',
          color: isJoker(card) ? '#fbbf24' : isRed ? '#fb7185' : '#e5e7eb',
          fontWeight: 800,
          fontSize: '1rem',
          cursor: disabled ? 'not-allowed' : 'pointer',
          transform: selected ? 'translateY(-6px)' : 'translateY(0)',
          transition: 'transform 0.12s, background 0.12s, border-color 0.12s',
          animation: gameState ? 'deal 260ms ease-out both' : undefined,
          animationDelay: gameState ? `${Math.min(idx * 18, 180)}ms` : undefined,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          userSelect: 'none',
          flex: '0 0 auto',
          opacity: disabled ? 0.7 : 1,
        }}
      >
        {cardToShortLabel(card)}
      </button>
    );
  };

  const pileCards = gameState?.pile?.cards ?? [];

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
        paddingTop: '5.5rem',
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
              <DaifugoMultiplayerLobby multiplayer={multiplayer} onGameStart={handleStartGame} />
              {localError && (
                <p style={{ marginTop: '1rem', color: '#f87171', textAlign: 'center' }}>{localError}</p>
              )}
            </div>
          )}

          {/* Game */}
          {(multiplayer.context.lobbyState === 'playing' || multiplayer.context.lobbyState === 'finished') && (
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
	                    <div style={{ color: '#fff', fontWeight: 900, fontSize: '1.1rem' }}>Daifugo (Online)</div>
	                    <div style={{ color: '#9ca3af', fontSize: '0.85rem' }}>
	                      Round {gameState?.round ?? 1} · {gameState?.playerOrder.length ?? 0} players · {isMyTurn ? 'Your turn' : `${playerNameOf(gameState?.currentTurnPlayerId ?? '')}'s turn`}
	                    </div>
	                    {gameState?.finished && (
	                      <div style={{ color: '#fbbf24', fontWeight: 800, fontSize: '0.95rem' }}>
	                        Result: {daifugoId ? `${playerNameOf(daifugoId)} is ${daifugoRankToLabel('daifugo')}` : 'Finished'}
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
	                          minWidth: '9rem',
	                        }}
	                      >
	                        <div style={{ fontSize: '0.85rem', fontWeight: 800, color: p.isMe ? '#fbbf24' : '#e5e7eb' }}>
	                          {p.name}{p.isMe ? ' (You)' : ''}
	                        </div>
	                        <div style={{ fontSize: '0.8rem', color: '#9ca3af' }}>{p.handCount} cards</div>
	                        {gameState?.ranks && p.rank && (
	                          <div style={{ fontSize: '0.8rem', color: '#fbbf24', fontWeight: 900, marginTop: '0.25rem' }}>
	                            {daifugoRankToLabel(p.rank)}
	                          </div>
	                        )}
	                        {!gameState?.ranks && p.finishedPos >= 0 && (
	                          <div style={{ fontSize: '0.8rem', color: '#fbbf24', fontWeight: 900, marginTop: '0.25rem' }}>
	                            Finished #{p.finishedPos + 1}
	                          </div>
	                        )}
	                      </div>
	                    ))}
	                  </div>
	                </div>

                {gameState?.finished && gameState?.ranks && (
                  <div style={{
                    marginTop: '0.75rem',
                    background: 'rgba(251, 191, 36, 0.08)',
                    border: '1px solid rgba(251, 191, 36, 0.35)',
                    borderRadius: '0.75rem',
                    padding: '0.75rem',
                  }}>
                    <div style={{ color: '#fbbf24', fontWeight: 900, fontSize: '0.95rem' }}>Results</div>
                    <div style={{ marginTop: '0.5rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                      {resultRows.map((row) => (
                        <div
                          key={row.id}
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
                          {daifugoRankToLabel(row.rank)}: {row.name}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem', marginTop: '1rem' }}>
                  {/* Table / pile */}
                  <div style={{
                    background: 'rgba(17, 24, 39, 0.6)',
                    border: '1px solid rgba(55, 65, 81, 1)',
                    borderRadius: '0.75rem',
                    padding: '1rem',
                    minHeight: '8rem',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
                      <div style={{ color: '#9ca3af', fontSize: '0.85rem', fontWeight: 700 }}>Table</div>
                      <div style={{ color: '#9ca3af', fontSize: '0.85rem' }}>
                        {gameState?.pile
                          ? `Need ${gameState.pile.count} · ${isReversed ? 'Lower' : 'Higher'} than ${rankToLabel(gameState.pile.rankKey)}`
                          : 'Free play'}
                      </div>
                    </div>

                    <div style={{
                      marginTop: '0.75rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      flexWrap: 'wrap',
                      minHeight: '4.5rem',
                    }}>
                      {pileCards.length === 0 ? (
                        <div style={{ color: '#6b7280', fontStyle: 'italic' }}>No cards on table</div>
                      ) : (
                        pileCards.map((c) => (
                          <div
                            key={c.id}
                            style={{
                              width: '3.1rem',
                              height: '4.2rem',
                              borderRadius: '0.5rem',
                              border: '1px solid rgba(55, 65, 81, 1)',
                              background: 'rgba(0,0,0,0.6)',
                              animation: 'toTable 180ms ease-out both',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 900,
                              color: isJoker(c) ? '#fbbf24' : (c.suit === 'H' || c.suit === 'D') ? '#fb7185' : '#e5e7eb',
                            }}
                          >
                            {cardToShortLabel(c)}
                          </div>
                        ))
                      )}
                    </div>

                    {gameState?.passes?.length ? (
                      <div style={{ marginTop: '0.5rem', color: '#6b7280', fontSize: '0.8rem' }}>
                        Passed: {gameState.passes.map(pid => playerNameOf(pid)).join(', ')}
                      </div>
                    ) : null}
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
                        disabled={!isMyTurn || isSubmitting || !gameState?.pile || !!gameState?.finished}
                        style={{
                          padding: '0.6rem 1.25rem',
                          borderRadius: '0.75rem',
                          border: '1px solid rgba(55, 65, 81, 1)',
                          backgroundColor: (!isMyTurn || isSubmitting || !gameState?.pile || !!gameState?.finished) ? '#374151' : '#ca8a04',
                          color: '#fff',
                          fontWeight: 900,
                          cursor: (!isMyTurn || isSubmitting || !gameState?.pile || !!gameState?.finished) ? 'not-allowed' : 'pointer',
                        }}
                      >
                        Pass
                      </button>

                      <button
                        onClick={handlePlay}
                        disabled={!canPlaySelected.ok || isSubmitting || !!gameState?.finished}
                        style={{
                          padding: '0.6rem 1.25rem',
                          borderRadius: '0.75rem',
                          border: '1px solid rgba(55, 65, 81, 1)',
                          backgroundColor: (!canPlaySelected.ok || isSubmitting || !!gameState?.finished) ? '#374151' : '#16a34a',
                          color: '#fff',
                          fontWeight: 900,
                          cursor: (!canPlaySelected.ok || isSubmitting || !!gameState?.finished) ? 'not-allowed' : 'pointer',
                        }}
                      >
                        Play
                      </button>

                      <button
                        onClick={() => setSelectedCardIds([])}
                        disabled={isSubmitting || effectiveSelectedCardIds.length === 0}
                        style={{
                          padding: '0.6rem 1.25rem',
                          borderRadius: '0.75rem',
                          border: '1px solid rgba(55, 65, 81, 1)',
                          backgroundColor: isSubmitting || effectiveSelectedCardIds.length === 0 ? '#111827' : '#4b5563',
                          color: '#e5e7eb',
                          fontWeight: 900,
                          cursor: isSubmitting || effectiveSelectedCardIds.length === 0 ? 'not-allowed' : 'pointer',
                        }}
                      >
                        Clear
                      </button>
                    </div>

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
                      Back
                    </button>

                    {multiplayer.context.isHost && gameState?.finished && (
                      <button
                        onClick={handleNextRound}
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
                        Next Round
                      </button>
                    )}
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
                      {selectedShape
                        ? selectedShape.kind === 'straight'
                          ? `Selected: straight ${selectedShape.count} (${rankToLabel(selectedShape.startRank)}-${rankToLabel(selectedShape.endRank)})`
                          : `Selected: ${selectedShape.count} × ${rankToLabel(selectedShape.rankKey)}`
                        : 'Select cards to play'}
                    </div>
                  </div>

                  {sevenGiveContext.needed && (
                    <div style={{
                      marginTop: '0.75rem',
                      background: 'rgba(202, 138, 4, 0.12)',
                      border: '1px solid rgba(202, 138, 4, 0.35)',
                      borderRadius: '0.75rem',
                      padding: '0.75rem',
                    }}>
                      <div style={{ color: '#fbbf24', fontWeight: 900, fontSize: '0.9rem' }}>
                        7渡し: {sevenGiveContext.giveCount}枚を {sevenGiveContext.toPlayerId ? playerNameOf(sevenGiveContext.toPlayerId) : 'next player'} に渡す
                      </div>
                      <div style={{ color: '#9ca3af', fontSize: '0.8rem', marginTop: '0.25rem' }}>
                        渡すカードを選択（未選択分は自動で弱いカードになります）
                      </div>
                      <div style={{
                        marginTop: '0.5rem',
                        display: 'flex',
                        gap: '0.5rem',
                        flexWrap: 'nowrap',
                        overflowX: 'auto',
                        paddingBottom: '0.25rem',
                      }}>
                        {sevenGiveCandidates.map((card) => {
                          const selected = effectiveGiveCardIds.includes(card.id);
                          const isRed = card.suit === 'H' || card.suit === 'D';
                          const disabled = !isMyTurn || isSubmitting || !!gameState?.finished;
                          return (
                            <button
                              key={card.id}
                              onClick={() => toggleGiveCard(card.id)}
                              disabled={disabled}
                              style={{
                                width: '3.1rem',
                                height: '4.2rem',
                                borderRadius: '0.5rem',
                                border: selected ? '2px solid #fbbf24' : '1px solid rgba(55, 65, 81, 1)',
                                background: selected ? 'rgba(251, 191, 36, 0.12)' : 'rgba(17, 24, 39, 0.5)',
                                color: isJoker(card) ? '#fbbf24' : isRed ? '#fb7185' : '#e5e7eb',
                                fontWeight: 800,
                                fontSize: '1rem',
                                cursor: disabled ? 'not-allowed' : 'pointer',
                                transform: selected ? 'translateY(-4px)' : 'translateY(0)',
                                transition: 'transform 0.12s, background 0.12s, border-color 0.12s',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                userSelect: 'none',
                                flex: '0 0 auto',
                                opacity: disabled ? 0.7 : 1,
                              }}
                            >
                              {cardToShortLabel(card)}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
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
                  {logLines.length === 0 ? (
                    <div style={{ color: '#6b7280', fontStyle: 'italic' }}>No actions yet</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', color: '#e5e7eb', fontSize: '0.85rem' }}>
                      {logLines.map((line, idx) => (
                        <div key={`${idx}_${line}`} style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                          {line}
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
        title="How to Play Daifugo"
      >
        <div style={{ color: '#e5e7eb', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div>
            <div style={{ fontWeight: 800, color: '#fbbf24' }}>Goal</div>
            <div style={{ color: '#cbd5e1' }}>Get rid of all your cards first.</div>
          </div>
          <div>
            <div style={{ fontWeight: 800, color: '#fbbf24' }}>Plays</div>
            <div style={{ color: '#cbd5e1' }}>
              Play groups (same rank) or stairs (same suit, 3+ consecutive). Joker is a single only.
            </div>
          </div>
          <div>
            <div style={{ fontWeight: 800, color: '#fbbf24' }}>Beating the table</div>
            <div style={{ color: '#cbd5e1' }}>
              Match type + card count, then play a stronger set (order can reverse during revolution / eleven-back).
            </div>
          </div>
          <div>
            <div style={{ fontWeight: 800, color: '#fbbf24' }}>Special Rules</div>
            <div style={{ color: '#cbd5e1' }}>
              8-cut clears the table. Playing 4+ cards triggers revolution. J triggers eleven-back (temporary reverse) except in stairs.
              Consecutive identical suit signatures cause shibari (suit lock). 3♠ can beat a single Joker. 5 skips next player. 7 gives card(s) to next player.
            </div>
          </div>
          <div style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
            Note: Rules include stairs/revolution/8-cut/eleven-back/shibari and multi-round exchange.
          </div>
        </div>
      </InfoModal>
      <style jsx>{`
        @keyframes deal {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes toTable {
          from {
            opacity: 0;
            transform: scale(0.96) translateY(-6px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
