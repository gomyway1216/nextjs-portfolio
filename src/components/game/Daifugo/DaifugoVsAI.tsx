/**
 * Daifugo (大富豪) - Vs AI (3–6 players)
 */

'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GameTopBar, InfoModal, GameStats } from '../common';
import {
  applyAction,
  createInitialDaifugoState,
  getPlayShape,
  getSelectedCards,
  getNextPlayerId,
  sortHand,
} from './gameLogic';
import { decideDaifugoAction } from './DaifugoAI';
import { cardToShortLabel, isJoker, rankToLabel } from './types';
import type { Card } from './types';
import {
  DAIFUGO_RANK_PRIORITY,
  daifugoRankToLabel,
} from './multiplayerTypes';
import type { DaifugoAction, DaifugoLogEntry, DaifugoNetworkState } from './multiplayerTypes';

interface DaifugoVsAIProps {
  onBackToMenu: () => void;
}

type LocalPlayerMeta = { name: string; isAI: boolean };

function createActionId(): string {
  return `act_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function createLocalId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function DaifugoVsAI({ onBackToMenu }: DaifugoVsAIProps) {
  const stats = useMemo<GameStats>(() => ({ wins: 0, losses: 0, draws: 0 }), []);
  const [showInfo, setShowInfo] = useState(false);

  const [playerName, setPlayerName] = useState('You');
  const [aiCount, setAiCount] = useState<number>(2); // total players = aiCount + 1 (min 3, max 6)

  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);
  const [selectedGiveCardIds, setSelectedGiveCardIds] = useState<string[]>([]);
  const [localError, setLocalError] = useState<string | null>(null);

  const [humanId] = useState(() => createLocalId('human'));
  const [players, setPlayers] = useState<Record<string, LocalPlayerMeta>>({});
  const [gameState, setGameState] = useState<DaifugoNetworkState | null>(null);

  const aiTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const playerNameOf = useCallback((playerId: string): string => players[playerId]?.name ?? playerId, [players]);
  const isReversed = !!gameState && (gameState.revolution !== gameState.jackBack);

  const myHand = useMemo<Card[]>(() => {
    if (!gameState) return [];
    return gameState.hands[humanId] ?? [];
  }, [gameState, humanId]);

  const isMyTurn = !!gameState && !gameState.finished && gameState.currentTurnPlayerId === humanId;

  const effectiveSelectedCardIds = useMemo(() => {
    if (selectedCardIds.length === 0) return [];
    const myIds = new Set(myHand.map(c => c.id));
    return selectedCardIds.filter(id => myIds.has(id));
  }, [myHand, selectedCardIds]);

  const selectedCards = useMemo(
    () => getSelectedCards(myHand, effectiveSelectedCardIds) ?? [],
    [myHand, effectiveSelectedCardIds]
  );
  const selectedShape = useMemo(() => getPlayShape(selectedCards), [selectedCards]);

  const canPlaySelected = useMemo(() => {
    if (!gameState || !isMyTurn) return { ok: false, error: 'Not your turn' };
    if (!selectedShape) return { ok: false, error: 'Select cards' };
    const probe: DaifugoAction = {
      actionId: 'probe',
      type: 'play',
      playerId: humanId,
      cardIds: effectiveSelectedCardIds,
      timestamp: 0,
    };
    const result = applyAction(gameState, probe);
    return result.ok ? { ok: true, error: null } : { ok: false, error: result.error };
  }, [gameState, isMyTurn, selectedShape, effectiveSelectedCardIds, humanId]);

  const playerSummaries = useMemo(() => {
    if (!gameState) return [];
    return gameState.playerOrder.map((id) => ({
      id,
      name: playerNameOf(id),
      handCount: (gameState.hands[id] ?? []).length,
      isTurn: id === gameState.currentTurnPlayerId,
      isMe: id === humanId,
      finishedPos: gameState.finishedOrder.indexOf(id),
      rank: gameState.ranks?.[id] ?? null,
    }));
  }, [gameState, humanId, playerNameOf]);

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

  const sevenGiveContext = useMemo(() => {
    if (!gameState) return { needed: false as const, giveCount: 0, toPlayerId: null as string | null };
    if (!isMyTurn || gameState.finished) return { needed: false as const, giveCount: 0, toPlayerId: null as string | null };
    if (!selectedShape || selectedShape.kind !== 'group' || selectedShape.rankKey !== 7) {
      return { needed: false as const, giveCount: 0, toPlayerId: null as string | null };
    }
    const remainingCount = myHand.length - effectiveSelectedCardIds.length;
    if (remainingCount <= 0) return { needed: false as const, giveCount: 0, toPlayerId: null as string | null };

    // Next active (skip finished players)
    let cur = humanId;
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
    humanId,
    isMyTurn,
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

  const startGame = () => {
    setLocalError(null);
    const clampedAI = Math.max(2, Math.min(5, aiCount));
    const totalPlayers = clampedAI + 1;
    if (totalPlayers < 3 || totalPlayers > 6) {
      setLocalError('Total players must be between 3 and 6.');
      return;
    }

    const trimmedName = playerName.trim() || 'You';
    const aiIds = Array.from({ length: clampedAI }, (_, i) => createLocalId(`ai${i + 1}`));
    const playerOrder = [humanId, ...aiIds];

    const initial = createInitialDaifugoState(playerOrder);

    const nextPlayers: Record<string, LocalPlayerMeta> = {
      [humanId]: { name: trimmedName, isAI: false },
    };
    aiIds.forEach((id, idx) => {
      nextPlayers[id] = { name: `AI ${idx + 1}`, isAI: true };
    });

    setPlayers(nextPlayers);
    setGameState(initial);
    setSelectedCardIds([]);
    setSelectedGiveCardIds([]);
  };

  const resetToSetup = () => {
    setLocalError(null);
    setSelectedCardIds([]);
    setSelectedGiveCardIds([]);
    setGameState(null);
    setPlayers({});
    if (aiTimeoutRef.current) {
      clearTimeout(aiTimeoutRef.current);
      aiTimeoutRef.current = null;
    }
  };

  const handleBack = () => {
    resetToSetup();
    onBackToMenu();
  };

  // AI turn processing
  useEffect(() => {
    if (!gameState) return;
    if (gameState.finished) return;

    const currentPlayerId = gameState.currentTurnPlayerId;
    const currentMeta = players[currentPlayerId];
    if (!currentMeta?.isAI) return;

    if (aiTimeoutRef.current) return;

    aiTimeoutRef.current = setTimeout(() => {
      aiTimeoutRef.current = null;
      setGameState((prev) => {
        if (!prev || prev.finished) return prev;
        if (prev.currentTurnPlayerId !== currentPlayerId) return prev;

        const decision = decideDaifugoAction(prev, currentPlayerId);
        const action: DaifugoAction = decision.type === 'play'
          ? {
            actionId: createActionId(),
            type: 'play',
            playerId: currentPlayerId,
            cardIds: decision.cardIds,
            giveCardIds: decision.giveCardIds,
            timestamp: Date.now(),
          }
          : {
            actionId: createActionId(),
            type: 'pass',
            playerId: currentPlayerId,
            timestamp: Date.now(),
          };

        const result = applyAction(prev, action);
        if (!result.ok) return prev;
        return result.state;
      });
    }, 650);

    return () => {
      if (aiTimeoutRef.current) {
        clearTimeout(aiTimeoutRef.current);
        aiTimeoutRef.current = null;
      }
    };
  }, [gameState, players]);

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

  const handlePlay = () => {
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
      playerId: humanId,
      cardIds: effectiveSelectedCardIds,
      giveCardIds: sevenGiveContext.needed ? finalGiveCardIds : undefined,
      timestamp: Date.now(),
    };

    setSelectedCardIds([]);
    setSelectedGiveCardIds([]);

    const result = applyAction(gameState, action);
    if (!result.ok) {
      setLocalError(result.error);
      return;
    }
    setGameState(result.state);
  };

  const handlePass = () => {
    if (!gameState) return;
    setLocalError(null);
    if (!isMyTurn) return;

    const action: DaifugoAction = {
      actionId: createActionId(),
      type: 'pass',
      playerId: humanId,
      timestamp: Date.now(),
    };

    setSelectedCardIds([]);
    setSelectedGiveCardIds([]);

    const result = applyAction(gameState, action);
    if (!result.ok) {
      setLocalError(result.error);
      return;
    }
    setGameState(result.state);
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

  const handleNextRound = () => {
    if (!gameState?.finished) return;
    const nextState = createInitialDaifugoState(gameState.playerOrder, {
      round: gameState.round + 1,
      previousRanks: gameState.ranks ?? undefined,
    });
    setGameState(nextState);
    setSelectedCardIds([]);
    setSelectedGiveCardIds([]);
    setLocalError(null);
  };

  const modeBadge = (
    <div style={{
      background: 'rgba(251, 191, 36, 0.12)',
      border: '1px solid rgba(251, 191, 36, 0.35)',
      borderRadius: '0.5rem',
      padding: '0.35rem 0.75rem',
      color: '#fbbf24',
      fontSize: '0.75rem',
      fontWeight: 700,
      fontFamily: 'monospace',
      letterSpacing: '0.08em',
    }}>
      AI ×{Math.max(2, Math.min(5, aiCount))} (total {Math.max(2, Math.min(5, aiCount)) + 1})
    </div>
  );

  const renderCard = (card: Card, idx: number) => {
    const selected = effectiveSelectedCardIds.includes(card.id);
    const isRed = card.suit === 'H' || card.suit === 'D';
    const disabled = !isMyTurn || gameState?.finished;

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
      <GameTopBar stats={stats} onInfoClick={() => setShowInfo(true)} additionalContent={modeBadge} />

      <div style={{
        flex: 1,
        paddingTop: '5.5rem',
        paddingBottom: '1.25rem',
        display: 'flex',
        justifyContent: 'center',
        overflow: 'auto',
      }}>
        <div style={{ width: 'min(1100px, 100%)', padding: '1rem' }}>
          {!gameState && (
            <div style={{
              background: 'rgba(0, 0, 0, 0.92)',
              border: '2px solid rgba(251, 191, 36, 0.35)',
              borderRadius: '1rem',
              padding: '1.5rem',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ color: '#fff', fontWeight: 900, fontSize: '1.25rem' }}>Daifugo vs AI</div>
                  <div style={{ color: '#9ca3af', fontSize: '0.9rem' }}>Choose AI count (min 2, max 5) — total 3–6 players.</div>
                </div>
                <button
                  onClick={handleBack}
                  style={{
                    padding: '0.55rem 1.25rem',
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
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginTop: '1rem', alignItems: 'center' }}>
                <input
                  type="text"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  placeholder="Your name"
                  maxLength={20}
                  style={{
                    width: '16rem',
                    padding: '0.6rem 0.9rem',
                    borderRadius: '0.75rem',
                    border: '1px solid rgba(55, 65, 81, 1)',
                    background: '#111827',
                    color: '#fff',
                    outline: 'none',
                  }}
                />

                <label style={{ color: '#9ca3af', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  AI players
                  <select
                    value={aiCount}
                    onChange={(e) => setAiCount(Number(e.target.value))}
                    style={{
                      padding: '0.55rem 0.75rem',
                      borderRadius: '0.75rem',
                      border: '1px solid rgba(55, 65, 81, 1)',
                      background: '#111827',
                      color: '#fff',
                      outline: 'none',
                    }}
                  >
                    <option value={2}>2</option>
                    <option value={3}>3</option>
                    <option value={4}>4</option>
                    <option value={5}>5</option>
                  </select>
                  <span style={{ color: '#6b7280' }}>total {aiCount + 1}</span>
                </label>

                <button
                  onClick={startGame}
                  style={{
                    padding: '0.6rem 1.25rem',
                    borderRadius: '0.75rem',
                    border: '1px solid rgba(55, 65, 81, 1)',
                    backgroundColor: '#16a34a',
                    color: '#fff',
                    fontWeight: 900,
                    cursor: 'pointer',
                  }}
                >
                  Start Game
                </button>
              </div>

              {localError && (
                <p style={{ marginTop: '1rem', color: '#f87171' }}>{localError}</p>
              )}
            </div>
          )}

          {gameState && (
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
                    <div style={{ color: '#fff', fontWeight: 900, fontSize: '1.1rem' }}>Daifugo (Vs AI)</div>
                    <div style={{ color: '#9ca3af', fontSize: '0.85rem' }}>
                      {isMyTurn ? 'Your turn' : `${playerNameOf(gameState.currentTurnPlayerId)}'s turn`}
                    </div>
                    {gameState.finished && (
                      <div style={{ color: '#fbbf24', fontWeight: 800, fontSize: '0.95rem' }}>
                        Result: {daifugoId ? `${playerNameOf(daifugoId)} is Daifugo` : 'Finished'}
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
	                        {gameState.ranks && p.rank && (
	                          <div style={{ fontSize: '0.8rem', color: '#fbbf24', fontWeight: 900, marginTop: '0.25rem' }}>
	                            {daifugoRankToLabel(p.rank)}
	                          </div>
	                        )}
	                        {!gameState.ranks && p.finishedPos >= 0 && (
	                          <div style={{ fontSize: '0.8rem', color: '#fbbf24', fontWeight: 900, marginTop: '0.25rem' }}>
	                            Finished #{p.finishedPos + 1}
	                          </div>
	                        )}
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
	                  {/* Table */}
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
                        {gameState.pile
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

                    {gameState.passes.length ? (
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
                        disabled={!isMyTurn || !gameState.pile || gameState.finished}
                        style={{
                          padding: '0.6rem 1.25rem',
                          borderRadius: '0.75rem',
                          border: '1px solid rgba(55, 65, 81, 1)',
                          backgroundColor: (!isMyTurn || !gameState.pile || gameState.finished) ? '#374151' : '#ca8a04',
                          color: '#fff',
                          fontWeight: 900,
                          cursor: (!isMyTurn || !gameState.pile || gameState.finished) ? 'not-allowed' : 'pointer',
                        }}
                      >
                        Pass
                      </button>

                      <button
                        onClick={handlePlay}
                        disabled={!canPlaySelected.ok || gameState.finished}
                        style={{
                          padding: '0.6rem 1.25rem',
                          borderRadius: '0.75rem',
                          border: '1px solid rgba(55, 65, 81, 1)',
                          backgroundColor: (!canPlaySelected.ok || gameState.finished) ? '#374151' : '#16a34a',
                          color: '#fff',
                          fontWeight: 900,
                          cursor: (!canPlaySelected.ok || gameState.finished) ? 'not-allowed' : 'pointer',
                        }}
                      >
                        Play
                      </button>

                      <button
                        onClick={() => setSelectedCardIds([])}
                        disabled={effectiveSelectedCardIds.length === 0}
                        style={{
                          padding: '0.6rem 1.25rem',
                          borderRadius: '0.75rem',
                          border: '1px solid rgba(55, 65, 81, 1)',
                          backgroundColor: effectiveSelectedCardIds.length === 0 ? '#111827' : '#4b5563',
                          color: '#e5e7eb',
                          fontWeight: 900,
                          cursor: effectiveSelectedCardIds.length === 0 ? 'not-allowed' : 'pointer',
                        }}
                      >
                        Clear
                      </button>
                    </div>

                    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                      {gameState.finished && (
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
                      <button
                        onClick={resetToSetup}
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
                        New Game
                      </button>
                      <button
                        onClick={handleBack}
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
	                          return (
	                            <button
	                              key={card.id}
	                              onClick={() => toggleGiveCard(card.id)}
	                              disabled={!isMyTurn || gameState?.finished}
	                              style={{
	                                width: '3.1rem',
	                                height: '4.2rem',
	                                borderRadius: '0.5rem',
	                                border: selected ? '2px solid #fbbf24' : '1px solid rgba(55, 65, 81, 1)',
	                                background: selected ? 'rgba(251, 191, 36, 0.12)' : 'rgba(17, 24, 39, 0.5)',
	                                color: isJoker(card) ? '#fbbf24' : isRed ? '#fb7185' : '#e5e7eb',
	                                fontWeight: 800,
	                                fontSize: '1rem',
	                                cursor: (!isMyTurn || gameState?.finished) ? 'not-allowed' : 'pointer',
	                                transform: selected ? 'translateY(-4px)' : 'translateY(0)',
	                                transition: 'transform 0.12s, background 0.12s, border-color 0.12s',
	                                display: 'flex',
	                                alignItems: 'center',
	                                justifyContent: 'center',
	                                userSelect: 'none',
	                                flex: '0 0 auto',
	                                opacity: (!isMyTurn || gameState?.finished) ? 0.7 : 1,
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
            Note: Multi-round play includes ranking + card exchange from round 2.
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
