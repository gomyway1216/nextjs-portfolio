/**
 * Doubt (ダウト) - Vs AI (3–6 players)
 */

'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GameTopBar, InfoModal, GameStats } from '../common';
import { applyAction, createInitialDoubtState } from './gameLogic';
import { decideDoubtAIDecision } from './DoubtAI';
import { rankToLabel } from './types';
import type { Card } from './types';
import type { DoubtAction, DoubtLogEntry, DoubtNetworkState } from './multiplayerTypes';
import { CardBack, PlayingCard, PlayingCardStyles } from './PlayingCard';

interface DoubtVsAIProps {
  onBackToMenu: () => void;
}

type LocalPlayerMeta = { name: string; isAI: boolean };

function createActionId(): string {
  return `act_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function createLocalId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function DoubtVsAI({ onBackToMenu }: DoubtVsAIProps) {
  const stats = useMemo<GameStats>(() => ({ wins: 0, losses: 0, draws: 0 }), []);
  const [showInfo, setShowInfo] = useState(false);

  const [playerName, setPlayerName] = useState('You');
  const [aiCount, setAiCount] = useState<number>(3); // total players = aiCount + 1 (min 3, max 6)

  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);
  const [draggingCardId, setDraggingCardId] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const [humanId] = useState(() => createLocalId('human'));
  const [players, setPlayers] = useState<Record<string, LocalPlayerMeta>>({});
  const [gameState, setGameState] = useState<DoubtNetworkState | null>(null);

  const aiTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const playerNameOf = useCallback((playerId: string): string => players[playerId]?.name ?? playerId, [players]);

  const myHand = useMemo<Card[]>(() => {
    if (!gameState) return [];
    return gameState.hands[humanId] ?? [];
  }, [gameState, humanId]);

  const isMyTurn = !!gameState && !gameState.finished && gameState.currentTurnPlayerId === humanId;

  const requiredRank = gameState?.requiredRank ?? 1;
  const pendingClaim = gameState?.pendingClaim ?? null;

  const selectedCards = useMemo(() => {
    if (!selectedCardIds.length) return [];
    const byId = new Map(myHand.map(c => [c.id, c]));
    return selectedCardIds.map(id => byId.get(id)).filter(Boolean) as Card[];
  }, [myHand, selectedCardIds]);

  const canSelectMore = isMyTurn && gameState?.phase === 'play' && selectedCardIds.length < 4;

  const validatePlay = useMemo(() => {
    if (!gameState) return { ok: false, error: 'No game' };
    if (!isMyTurn) return { ok: false, error: 'Not your turn' };
    if (gameState.phase !== 'play') return { ok: false, error: 'Not in play phase' };
    if (selectedCardIds.length < 1 || selectedCardIds.length > 4) return { ok: false, error: 'Select 1–4 cards' };
    const probe: DoubtAction = {
      actionId: 'probe',
      type: 'play',
      playerId: humanId,
      cardIds: selectedCardIds,
      timestamp: 0,
    };
    const result = applyAction(gameState, probe);
    return result.ok ? { ok: true, error: null } : { ok: false, error: result.error };
  }, [gameState, humanId, isMyTurn, selectedCardIds]);

  const handleBack = () => {
    setSelectedCardIds([]);
    setDraggingCardId(null);
    setLocalError(null);
    setGameState(null);
    setPlayers({});
    if (aiTimeoutRef.current) {
      clearTimeout(aiTimeoutRef.current);
      aiTimeoutRef.current = null;
    }
    onBackToMenu();
  };

  const startGame = () => {
    setLocalError(null);
    const clampedAI = Math.max(2, Math.min(5, aiCount));
    const total = clampedAI + 1;
    if (total < 3 || total > 6) {
      setLocalError('Total players must be between 3 and 6.');
      return;
    }

    const trimmedName = playerName.trim() || 'You';
    const aiIds = Array.from({ length: clampedAI }, (_, i) => createLocalId(`ai${i + 1}`));
    const playerOrder = [humanId, ...aiIds];

    const initial = createInitialDoubtState(playerOrder);

    const nextPlayers: Record<string, LocalPlayerMeta> = { [humanId]: { name: trimmedName, isAI: false } };
    aiIds.forEach((id, idx) => { nextPlayers[id] = { name: `AI ${idx + 1}`, isAI: true }; });

    setPlayers(nextPlayers);
    setGameState(initial);
    setSelectedCardIds([]);
    setDraggingCardId(null);
  };

  const toggleCard = (cardId: string) => {
    setLocalError(null);
    setSelectedCardIds((prev) => {
      if (prev.includes(cardId)) return prev.filter(id => id !== cardId);
      if (prev.length >= 4) return prev;
      return [...prev, cardId];
    });
  };

  const playSelected = () => {
    setLocalError(null);
    if (!validatePlay.ok) {
      setLocalError(validatePlay.error);
      return;
    }

    const action: DoubtAction = {
      actionId: createActionId(),
      type: 'play',
      playerId: humanId,
      cardIds: selectedCardIds,
      timestamp: Date.now(),
    };

    setSelectedCardIds([]);
    setDraggingCardId(null);

    setGameState((prev) => {
      if (!prev) return prev;
      const result = applyAction(prev, action);
      if (!result.ok) {
        setLocalError(result.error);
        return prev;
      }
      return result.state;
    });
  };

  const acceptClaim = () => {
    if (!gameState) return;
    setLocalError(null);
    if (!isMyTurn || gameState.phase !== 'challenge') return;

    const action: DoubtAction = {
      actionId: createActionId(),
      type: 'accept',
      playerId: humanId,
      timestamp: Date.now(),
    };

    setGameState((prev) => {
      if (!prev) return prev;
      const result = applyAction(prev, action);
      if (!result.ok) {
        setLocalError(result.error);
        return prev;
      }
      return result.state;
    });
  };

  const doubtClaim = () => {
    if (!gameState) return;
    setLocalError(null);
    if (!isMyTurn || gameState.phase !== 'challenge') return;

    const action: DoubtAction = {
      actionId: createActionId(),
      type: 'doubt',
      playerId: humanId,
      timestamp: Date.now(),
    };

    setGameState((prev) => {
      if (!prev) return prev;
      const result = applyAction(prev, action);
      if (!result.ok) {
        setLocalError(result.error);
        return prev;
      }
      return result.state;
    });
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

        const decision = decideDoubtAIDecision(prev, currentPlayerId);
        const action: DoubtAction = decision.type === 'play'
          ? {
            actionId: createActionId(),
            type: 'play',
            playerId: currentPlayerId,
            cardIds: decision.cardIds,
            timestamp: Date.now(),
          }
          : decision.type === 'doubt'
          ? {
            actionId: createActionId(),
            type: 'doubt',
            playerId: currentPlayerId,
            timestamp: Date.now(),
          }
          : {
            actionId: createActionId(),
            type: 'accept',
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
        isMe: id === humanId,
        status,
        place,
      };
    });
  }, [gameState, humanId, playerNameOf]);

  const pileCount = gameState?.pile.length ?? 0;

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

  const renderHandCard = (card: Card, idx: number) => {
    const selected = selectedCardIds.includes(card.id);
    const truthful = gameState?.phase === 'play' && card.rank === requiredRank;
    const disabled = !isMyTurn || gameState?.phase !== 'play' || !!gameState?.finished;

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
      disabled={!isMyTurn || gameState?.phase !== 'play' || !!gameState?.finished}
      onClick={() => toggleCard(card.id)}
      variant="static"
      animationDelay={Math.min(idx * 18, 180)}
    />
  );

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
                  <div style={{ color: '#fff', fontWeight: 900, fontSize: '1.25rem' }}>Doubt (ダウト) vs AI</div>
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
                    <div style={{ color: '#fff', fontWeight: 900, fontSize: '1.1rem' }}>Doubt (Vs AI)</div>
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
                        disabled={!isMyTurn || gameState.phase !== 'challenge' || gameState.finished}
                        style={{
                          padding: '0.6rem 1.25rem',
                          borderRadius: '0.75rem',
                          border: '1px solid rgba(55, 65, 81, 1)',
                          backgroundColor: (!isMyTurn || gameState.phase !== 'challenge' || gameState.finished) ? '#374151' : '#2563eb',
                          color: '#fff',
                          fontWeight: 900,
                          cursor: (!isMyTurn || gameState.phase !== 'challenge' || gameState.finished) ? 'not-allowed' : 'pointer',
                        }}
                      >
                        Accept
                      </button>

                      <button
                        onClick={doubtClaim}
                        disabled={!isMyTurn || gameState.phase !== 'challenge' || gameState.finished}
                        style={{
                          padding: '0.6rem 1.25rem',
                          borderRadius: '0.75rem',
                          border: '1px solid rgba(55, 65, 81, 1)',
                          backgroundColor: (!isMyTurn || gameState.phase !== 'challenge' || gameState.finished) ? '#374151' : '#dc2626',
                          color: '#fff',
                          fontWeight: 900,
                          cursor: (!isMyTurn || gameState.phase !== 'challenge' || gameState.finished) ? 'not-allowed' : 'pointer',
                        }}
                      >
                        Doubt!
                      </button>

                      <button
                        onClick={playSelected}
                        disabled={!validatePlay.ok || gameState.finished}
                        style={{
                          padding: '0.6rem 1.25rem',
                          borderRadius: '0.75rem',
                          border: '1px solid rgba(55, 65, 81, 1)',
                          backgroundColor: (!validatePlay.ok || gameState.finished) ? '#374151' : '#16a34a',
                          color: '#fff',
                          fontWeight: 900,
                          cursor: (!validatePlay.ok || gameState.finished) ? 'not-allowed' : 'pointer',
                        }}
                      >
                        Play
                      </button>

                      <button
                        onClick={() => setSelectedCardIds([])}
                        disabled={!selectedCardIds.length}
                        style={{
                          padding: '0.6rem 1.25rem',
                          borderRadius: '0.75rem',
                          border: '1px solid rgba(55, 65, 81, 1)',
                          backgroundColor: !selectedCardIds.length ? '#111827' : '#4b5563',
                          color: '#e5e7eb',
                          fontWeight: 900,
                          cursor: !selectedCardIds.length ? 'not-allowed' : 'pointer',
                        }}
                      >
                        Clear
                      </button>
                    </div>

                    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
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
                    onDragOver={(e) => {
                      if (!canSelectMore) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                    }}
                    onDrop={(e) => {
                      if (!canSelectMore) return;
                      e.preventDefault();
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
                      background: draggingCardId && canSelectMore ? 'rgba(34, 197, 94, 0.08)' : 'rgba(0,0,0,0.2)',
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
            Tip: You can drag cards from your hand into the Play Area.
          </div>
        </div>
      </InfoModal>

      <PlayingCardStyles />
    </div>
  );
}

