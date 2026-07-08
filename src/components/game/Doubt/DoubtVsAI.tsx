/**
 * Doubt (ダウト) - Vs AI (3–6 players)
 */

'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GameTopBar, InfoModal, GameStats, DifficultySelector } from '../common';
import type { Difficulty, DifficultyOption } from '../common';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { applyAction, createInitialDoubtState } from './gameLogic';
import { decideDoubtAIDecision, type DoubtDifficulty } from './DoubtAI';
import { rankToLabel } from './types';
import type { Card } from './types';
import type { DoubtAction, DoubtLogEntry, DoubtNetworkState } from './multiplayerTypes';
import { CardBack, PlayingCard, PlayingCardStyles } from './PlayingCard';
import { getDoubtStrings } from './i18n';

interface DoubtVsAIProps {
  onBackToMenu: () => void;
}

type LocalPlayerMeta = { name: string; isAI: boolean; difficulty?: DoubtDifficulty };

// Map the shared 5-tier Difficulty onto the 4 AI tiers (master === expert).
const AI_DIFFICULTY: Record<Difficulty, DoubtDifficulty> = {
  easy: 'easy',
  medium: 'medium',
  hard: 'hard',
  expert: 'expert',
  master: 'expert',
};

function createActionId(): string {
  return `act_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function createLocalId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

const CONTROL_BORDER = '1px solid rgba(55, 65, 81, 1)';

function ControlButton({ label, onClick, color, enabled }: {
  label: string;
  onClick: () => void;
  color: string;
  enabled: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={!enabled}
      aria-label={label}
      style={{
        padding: '0.6rem 1.25rem',
        borderRadius: '0.75rem',
        border: CONTROL_BORDER,
        backgroundColor: enabled ? color : '#374151',
        color: '#fff',
        fontWeight: 900,
        cursor: enabled ? 'pointer' : 'not-allowed',
        transition: 'transform 0.12s ease, filter 0.12s ease',
        minHeight: '2.75rem',
        minWidth: '5rem',
        opacity: enabled ? 1 : 0.7,
      }}
    >
      {label}
    </button>
  );
}

export function DoubtVsAI({ onBackToMenu }: DoubtVsAIProps) {
  const { language } = useGameLanguage();
  const t = useMemo(() => getDoubtStrings(language), [language]);

  const [stats, setStats] = useState<GameStats>({ wins: 0, losses: 0, draws: 0 });
  const [showInfo, setShowInfo] = useState(false);

  const [playerName, setPlayerName] = useState('You');
  const [aiCount, setAiCount] = useState<number>(3); // total players = aiCount + 1 (min 3, max 6)
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');

  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);
  const [draggingCardId, setDraggingCardId] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [revealPile, setRevealPile] = useState<{ cards: Card[]; truth: boolean } | null>(null);

  const [humanId] = useState(() => createLocalId('human'));
  const [players, setPlayers] = useState<Record<string, LocalPlayerMeta>>({});
  const [gameState, setGameState] = useState<DoubtNetworkState | null>(null);

  const aiTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revealTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resultRecordedRef = useRef(false);

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
    // These first three are guard states where the Play button is already disabled;
    // they should never surface to the user, but keep the message localized just in case.
    if (!gameState || !isMyTurn || gameState.phase !== 'play') return { ok: false, error: t.errorGeneric };
    if (selectedCardIds.length < 1 || selectedCardIds.length > 4) return { ok: false, error: t.errorSelectCards };
    const probe: DoubtAction = {
      actionId: 'probe',
      type: 'play',
      playerId: humanId,
      cardIds: selectedCardIds,
      timestamp: 0,
    };
    const result = applyAction(gameState, probe);
    // The engine returns internal English strings; surface a localized card-count
    // hint for the common case and a generic localized message otherwise.
    return result.ok ? { ok: true, error: null } : { ok: false, error: t.errorSelectCards };
  }, [gameState, humanId, isMyTurn, selectedCardIds, t.errorGeneric, t.errorSelectCards]);

  const clearTimers = useCallback(() => {
    if (aiTimeoutRef.current) {
      clearTimeout(aiTimeoutRef.current);
      aiTimeoutRef.current = null;
    }
    if (revealTimeoutRef.current) {
      clearTimeout(revealTimeoutRef.current);
      revealTimeoutRef.current = null;
    }
  }, []);

  const handleBack = () => {
    setSelectedCardIds([]);
    setDraggingCardId(null);
    setLocalError(null);
    setRevealPile(null);
    setGameState(null);
    setPlayers({});
    clearTimers();
    onBackToMenu();
  };

  const startGame = useCallback(() => {
    setLocalError(null);
    clearTimers();
    setRevealPile(null);
    resultRecordedRef.current = false;
    const clampedAI = Math.max(2, Math.min(5, aiCount));

    const trimmedName = playerName.trim() || t.yourNamePlaceholder;
    const aiIds = Array.from({ length: clampedAI }, (_, i) => createLocalId(`ai${i + 1}`));
    const playerOrder = [humanId, ...aiIds];

    const initial = createInitialDoubtState(playerOrder);

    const tier = AI_DIFFICULTY[difficulty];
    const nextPlayers: Record<string, LocalPlayerMeta> = { [humanId]: { name: trimmedName, isAI: false } };
    aiIds.forEach((id, idx) => { nextPlayers[id] = { name: `AI ${idx + 1}`, isAI: true, difficulty: tier }; });

    setPlayers(nextPlayers);
    setGameState(initial);
    setSelectedCardIds([]);
    setDraggingCardId(null);
  }, [aiCount, playerName, difficulty, humanId, clearTimers, t.yourNamePlaceholder]);

  const restartGame = () => startGame();

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
        setLocalError(t.errorGeneric);
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
        setLocalError(t.errorGeneric);
        return prev;
      }
      return result.state;
    });
  };

  // Reveal the challenged cards briefly before the pile is swept up.
  const revealChallenge = useCallback((prev: DoubtNetworkState) => {
    const claim = prev.pendingClaim;
    if (!claim) return;
    const cards = claim.cardIds
      .map(id => prev.pile.find(c => c.id === id))
      .filter(Boolean) as Card[];
    if (!cards.length) return;
    const truth = cards.every(c => c.rank === claim.declaredRank);
    setRevealPile({ cards, truth });
    if (revealTimeoutRef.current) clearTimeout(revealTimeoutRef.current);
    revealTimeoutRef.current = setTimeout(() => {
      setRevealPile(null);
      revealTimeoutRef.current = null;
    }, 1600);
  }, []);

  const doubtClaim = () => {
    if (!gameState) return;
    setLocalError(null);
    if (!isMyTurn || gameState.phase !== 'challenge') return;

    revealChallenge(gameState);

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
        setLocalError(t.errorGeneric);
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

        const decision = decideDoubtAIDecision(prev, currentPlayerId, currentMeta.difficulty);

        // Show the reveal when an AI doubts the human (or anyone).
        if (decision.type === 'doubt') {
          revealChallenge(prev);
        }

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
    }, 720);

    return () => {
      if (aiTimeoutRef.current) {
        clearTimeout(aiTimeoutRef.current);
        aiTimeoutRef.current = null;
      }
    };
  }, [gameState, players, revealChallenge]);

  // Record win/loss once when a game finishes.
  useEffect(() => {
    if (!gameState?.finished || !gameState.ranks) return;
    if (resultRecordedRef.current) return;
    resultRecordedRef.current = true;
    const myPlace = gameState.ranks[humanId];
    setStats((s) => (myPlace === 1
      ? { ...s, wins: s.wins + 1 }
      : { ...s, losses: s.losses + 1 }));
  }, [gameState?.finished, gameState?.ranks, humanId]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  const playerSummaries = useMemo(() => {
    if (!gameState) return [];
    return gameState.playerOrder.map((id) => {
      const finishedPos = gameState.finishedOrder.indexOf(id);
      const isFinished = finishedPos >= 0;
      const place = gameState.ranks?.[id] ?? null;
      return {
        id,
        name: playerNameOf(id),
        handCount: (gameState.hands[id] ?? []).length,
        isTurn: id === gameState.currentTurnPlayerId,
        isMe: id === humanId,
        isFinished,
        place,
      };
    });
  }, [gameState, humanId, playerNameOf]);

  const pileCount = gameState?.pile.length ?? 0;
  const myPlace = gameState?.ranks?.[humanId] ?? null;

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
      AI ×{Math.max(2, Math.min(5, aiCount))}
    </div>
  );

  const difficultyOptions: DifficultyOption[] = useMemo(() => [
    { value: 'easy', label: t.diffEasyLabel, description: t.diffEasyDesc },
    { value: 'medium', label: t.diffMediumLabel, description: t.diffMediumDesc },
    { value: 'hard', label: t.diffHardLabel, description: t.diffHardDesc },
    { value: 'expert', label: t.diffExpertLabel, description: t.diffExpertDesc },
  ], [t]);

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
    ? t.claimText(playerNameOf(pendingClaim.playerId), pendingClaim.cardCount, rankToLabel(pendingClaim.declaredRank))
    : t.noClaim;

  const logLines = useMemo(() => {
    if (!gameState) return [];
    const log: DoubtLogEntry[] = gameState.log ?? [];
    return log.slice(-12).map((entry) => {
      const name = playerNameOf(entry.playerId);
      if (entry.type === 'play') {
        return t.logPlayed(name, entry.count ?? 0, rankToLabel(entry.declaredRank ?? 1));
      }
      if (entry.type === 'accept') return t.logAccept(name);
      if (entry.type === 'doubt') return t.logDoubt(name);
      if (entry.type === 'resolve') {
        if (typeof entry.claimTruth === 'boolean') {
          const taker = entry.pileTakerId ? playerNameOf(entry.pileTakerId) : name;
          return entry.claimTruth ? t.logTruth(taker) : t.logLie(taker);
        }
        return t.logFinished(name);
      }
      if (entry.type === 'finish') return t.logFinished(name);
      return `${name}: ${entry.detail ?? entry.type}`;
    });
  }, [gameState, playerNameOf, t]);

  const panel = 'rgba(0, 0, 0, 0.92)';
  const subPanel = 'rgba(17, 24, 39, 0.6)';
  const borderColor = 'rgba(55, 65, 81, 1)';

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      display: 'flex',
      flexDirection: 'column',
      background: 'linear-gradient(to bottom, #0b1220, #000)',
      overflow: 'hidden',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      <GameTopBar stats={stats} onInfoClick={() => setShowInfo(true)} additionalContent={modeBadge} />

      <div style={{
        flex: 1,
        paddingTop: '4rem',
        paddingBottom: '1.25rem',
        display: 'flex',
        justifyContent: 'center',
        overflow: 'auto',
      }}>
        <div style={{ width: 'min(1100px, 100%)', padding: '1rem' }}>
          {!gameState && (
            <DifficultySelector
              title={t.title}
              subtitle={t.subtitle}
              icon={<span style={{ fontSize: '2.5rem' }} aria-hidden>🃏</span>}
              selectedDifficulty={difficulty}
              onSelectDifficulty={setDifficulty}
              options={difficultyOptions}
              onStart={startGame}
              difficultyTitle={t.difficulty}
              startLabel={t.startGame}
              setupContent={(
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'flex-end' }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', color: '#cbd5e1', fontSize: '0.85rem', fontWeight: 700 }}>
                    {t.yourName}
                    <input
                      type="text"
                      value={playerName}
                      onChange={(e) => setPlayerName(e.target.value)}
                      placeholder={t.yourNamePlaceholder}
                      maxLength={20}
                      style={{
                        width: '14rem',
                        padding: '0.6rem 0.9rem',
                        borderRadius: '0.75rem',
                        border: `1px solid ${borderColor}`,
                        background: '#111827',
                        color: '#fff',
                        outline: 'none',
                      }}
                    />
                  </label>

                  <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', color: '#cbd5e1', fontSize: '0.85rem', fontWeight: 700 }}>
                    {t.aiPlayers}
                    <select
                      value={aiCount}
                      onChange={(e) => setAiCount(Number(e.target.value))}
                      style={{
                        padding: '0.6rem 0.75rem',
                        borderRadius: '0.75rem',
                        border: `1px solid ${borderColor}`,
                        background: '#111827',
                        color: '#fff',
                        outline: 'none',
                        minWidth: '8rem',
                      }}
                    >
                      {[2, 3, 4, 5].map((n) => (
                        <option key={n} value={n}>{n} ({t.totalPlayers} {n + 1})</option>
                      ))}
                    </select>
                  </label>
                </div>
              )}
              extraContent={(
                <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <button
                    onClick={handleBack}
                    style={{
                      padding: '0.55rem 1.25rem',
                      borderRadius: '0.75rem',
                      border: `1px solid ${borderColor}`,
                      backgroundColor: '#111827',
                      color: '#e5e7eb',
                      fontWeight: 900,
                      cursor: 'pointer',
                    }}
                  >
                    ← {t.back}
                  </button>
                  {localError && <p style={{ color: '#f87171', margin: 0, alignSelf: 'center' }}>{localError}</p>}
                </div>
              )}
            />
          )}

          {gameState && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem' }}>
              <div style={{
                background: panel,
                border: '2px solid rgba(14, 165, 233, 0.35)',
                borderRadius: '1rem',
                padding: '1rem',
              }}>
                {/* Header: status + opponents */}
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <div style={{ color: '#fff', fontWeight: 900, fontSize: '1.1rem' }}>{t.title}</div>
                    <div style={{ color: '#9ca3af', fontSize: '0.85rem' }}>
                      {gameState.finished ? t.finished : isMyTurn ? t.yourTurn : t.turnOf(playerNameOf(gameState.currentTurnPlayerId))}
                    </div>
                    <div style={{ color: '#9ca3af', fontSize: '0.85rem' }}>
                      {gameState.phase === 'challenge' ? t.phaseChallenge : t.phasePlay} · {t.nextRank}: <span style={{ color: '#fbbf24', fontWeight: 900 }}>{rankToLabel(requiredRank)}</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    {playerSummaries.map((p) => (
                      <div
                        key={p.id}
                        aria-label={`${p.name}: ${t.handOf(p.handCount)}, ${p.isFinished ? t.out : t.active}`}
                        style={{
                          background: p.isTurn ? 'rgba(34, 197, 94, 0.18)' : 'rgba(255, 255, 255, 0.06)',
                          border: p.isTurn ? '1px solid rgba(34, 197, 94, 0.65)' : `1px solid ${borderColor}`,
                          borderRadius: '0.75rem',
                          padding: '0.45rem 0.75rem',
                          color: '#e5e7eb',
                          minWidth: '9rem',
                          boxShadow: p.isTurn ? '0 0 0 2px rgba(34,197,94,0.25)' : undefined,
                          transition: 'background 0.2s ease, box-shadow 0.2s ease',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                          <span style={{ fontSize: '0.85rem', fontWeight: 800, color: p.isMe ? '#fbbf24' : '#e5e7eb' }}>
                            {p.name}{p.isMe ? t.youSuffix : ''}
                          </span>
                          {p.isTurn && <span aria-hidden style={{ fontSize: '0.7rem' }}>🎯</span>}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '0.35rem' }}>
                          <span aria-hidden style={{ fontSize: '0.9rem' }}>🂠</span>
                          <span style={{ fontSize: '0.85rem', color: '#e5e7eb', fontWeight: 800 }}>{p.handCount}</span>
                          <span style={{
                            marginLeft: 'auto',
                            fontSize: '0.7rem',
                            fontWeight: 800,
                            color: p.isFinished ? '#fbbf24' : '#22c55e',
                          }}>
                            {p.place ? t.place(p.place) : p.isFinished ? t.out : t.active}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Results banner */}
                {gameState.finished && gameState.ranks && (
                  <div style={{
                    marginTop: '0.75rem',
                    background: myPlace === 1 ? 'rgba(251, 191, 36, 0.12)' : 'rgba(148, 163, 184, 0.1)',
                    border: `1px solid ${myPlace === 1 ? 'rgba(251, 191, 36, 0.45)' : borderColor}`,
                    borderRadius: '0.75rem',
                    padding: '0.85rem',
                  }}>
                    <div style={{ color: '#fbbf24', fontWeight: 900, fontSize: '1rem' }}>
                      {myPlace === 1 ? t.youWon : t.youPlaced(myPlace ?? 0)}
                    </div>
                    <div style={{ marginTop: '0.5rem', color: '#cbd5e1', fontWeight: 800, fontSize: '0.85rem' }}>{t.results}</div>
                    <div style={{ marginTop: '0.35rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                      {playerSummaries
                        .filter(p => typeof p.place === 'number')
                        .sort((a, b) => (a.place ?? 999) - (b.place ?? 999))
                        .map((p) => (
                          <div
                            key={p.id}
                            style={{
                              background: 'rgba(0,0,0,0.35)',
                              border: `1px solid ${borderColor}`,
                              borderRadius: '0.75rem',
                              padding: '0.4rem 0.75rem',
                              color: p.isMe ? '#fbbf24' : '#e5e7eb',
                              fontSize: '0.85rem',
                              fontWeight: 800,
                            }}
                          >
                            {t.place(p.place ?? 0)} {p.name}
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {/* Pile / table */}
                <div style={{
                  marginTop: '1rem',
                  background: subPanel,
                  border: `1px solid ${borderColor}`,
                  borderRadius: '0.75rem',
                  padding: '1rem',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <div style={{ color: '#9ca3af', fontSize: '0.85rem', fontWeight: 700 }}>{t.pile}</div>
                    <div style={{ color: '#9ca3af', fontSize: '0.85rem' }}>
                      {t.cardsCount(pileCount)} · {t.lastClaim}: <span style={{ color: '#e5e7eb' }}>{claimText}</span>
                    </div>
                  </div>

                  <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.35rem', flexWrap: 'wrap', minHeight: '4.5rem', alignItems: 'center' }}>
                    {revealPile ? (
                      <div
                        role="status"
                        style={{
                          display: 'flex',
                          gap: '0.4rem',
                          flexWrap: 'wrap',
                          alignItems: 'center',
                          padding: '0.4rem 0.6rem',
                          borderRadius: '0.6rem',
                          background: revealPile.truth ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
                          border: `1px solid ${revealPile.truth ? 'rgba(34,197,94,0.5)' : 'rgba(239,68,68,0.5)'}`,
                          animation: 'doubtReveal 0.35s ease-out both',
                        }}
                      >
                        {revealPile.cards.map((c, i) => (
                          <PlayingCard key={c.id} card={c} size="small" variant="table" animationDelay={i * 90} />
                        ))}
                        <span style={{
                          fontWeight: 900,
                          fontSize: '0.85rem',
                          color: revealPile.truth ? '#22c55e' : '#f87171',
                          marginLeft: '0.35rem',
                        }}>
                          {revealPile.truth ? t.verdictTruth : t.verdictBluff}
                        </span>
                      </div>
                    ) : pileCount === 0 ? (
                      <div style={{ color: '#6b7280', fontStyle: 'italic' }}>{t.noPileYet}</div>
                    ) : (
                      Array.from({ length: Math.min(14, pileCount) }, (_, i) => (
                        <div key={i} style={{ marginLeft: i === 0 ? 0 : '-1.4rem', animation: 'cardPlay 0.2s ease-out both' }}>
                          <CardBack size="small" />
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Play area */}
                <div style={{
                  marginTop: '1rem',
                  background: subPanel,
                  border: `1px solid ${borderColor}`,
                  borderRadius: '0.75rem',
                  padding: '1rem',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <div style={{ color: '#9ca3af', fontSize: '0.85rem', fontWeight: 700 }}>
                      {t.playAreaTitle(rankToLabel(requiredRank))}
                    </div>
                    <div style={{ color: '#9ca3af', fontSize: '0.85rem' }}>
                      {gameState.phase === 'challenge' ? t.decideHint : selectedCardIds.length ? t.selected(selectedCardIds.length) : t.dropHint}
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
                        {canSelectMore ? t.dropHint : t.noClaim}
                      </div>
                    ) : (
                      selectedCards.map(renderSelectedCard)
                    )}
                  </div>

                  {/* Controls */}
                  <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.85rem' }}>
                    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                      <ControlButton
                        label={t.accept}
                        onClick={acceptClaim}
                        color="#2563eb"
                        enabled={isMyTurn && gameState.phase === 'challenge' && !gameState.finished}
                      />
                      <ControlButton
                        label={t.doubt}
                        onClick={doubtClaim}
                        color="#dc2626"
                        enabled={isMyTurn && gameState.phase === 'challenge' && !gameState.finished}
                      />
                      <ControlButton
                        label={t.play}
                        onClick={playSelected}
                        color="#16a34a"
                        enabled={validatePlay.ok && !gameState.finished}
                      />
                      <button
                        onClick={() => setSelectedCardIds([])}
                        disabled={!selectedCardIds.length}
                        style={{
                          padding: '0.6rem 1.25rem',
                          borderRadius: '0.75rem',
                          border: `1px solid ${borderColor}`,
                          backgroundColor: !selectedCardIds.length ? '#111827' : '#4b5563',
                          color: '#e5e7eb',
                          fontWeight: 900,
                          cursor: !selectedCardIds.length ? 'not-allowed' : 'pointer',
                          minHeight: '2.75rem',
                        }}
                      >
                        {t.clear}
                      </button>
                    </div>

                    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                      <button
                        onClick={restartGame}
                        style={{
                          padding: '0.6rem 1.25rem',
                          borderRadius: '0.75rem',
                          border: `1px solid ${borderColor}`,
                          backgroundColor: '#7c3aed',
                          color: '#fff',
                          fontWeight: 900,
                          cursor: 'pointer',
                          minHeight: '2.75rem',
                        }}
                      >
                        {gameState.finished ? t.newGame : t.restart}
                      </button>
                      <button
                        onClick={handleBack}
                        style={{
                          padding: '0.6rem 1.25rem',
                          borderRadius: '0.75rem',
                          border: `1px solid ${borderColor}`,
                          backgroundColor: '#111827',
                          color: '#e5e7eb',
                          fontWeight: 900,
                          cursor: 'pointer',
                          minHeight: '2.75rem',
                        }}
                      >
                        {t.back}
                      </button>
                    </div>
                  </div>

                  {localError && (
                    <div style={{ color: '#f87171', fontSize: '0.9rem', fontWeight: 700, marginTop: '0.5rem' }}>
                      {localError}
                    </div>
                  )}
                </div>

                {/* Hand */}
                <div style={{
                  marginTop: '1rem',
                  background: subPanel,
                  border: `1px solid ${borderColor}`,
                  borderRadius: '0.75rem',
                  padding: '1rem',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <div style={{ color: '#9ca3af', fontSize: '0.85rem', fontWeight: 700 }}>{t.yourHand} ({myHand.length})</div>
                    <div style={{ color: '#9ca3af', fontSize: '0.85rem' }}>
                      {gameState.phase === 'play' ? t.truthHighlight(rankToLabel(requiredRank)) : t.noClaim}
                    </div>
                  </div>
                  <div style={{
                    marginTop: '0.75rem',
                    display: 'flex',
                    gap: '0.5rem',
                    flexWrap: 'nowrap',
                    overflowX: 'auto',
                    paddingBottom: '0.5rem',
                  }}>
                    {myHand.length === 0
                      ? <div style={{ color: '#6b7280', fontStyle: 'italic' }}>{t.out}</div>
                      : myHand.map(renderHandCard)}
                  </div>
                </div>

                {/* Log */}
                <div style={{
                  marginTop: '1rem',
                  background: 'rgba(0, 0, 0, 0.45)',
                  border: `1px solid ${borderColor}`,
                  borderRadius: '0.75rem',
                  padding: '1rem',
                }}>
                  <div style={{ color: '#9ca3af', fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.5rem' }}>{t.log}</div>
                  {logLines.length === 0 ? (
                    <div style={{ color: '#6b7280', fontStyle: 'italic' }}>{t.noActions}</div>
                  ) : (
                    <div aria-live="polite" style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', color: '#e5e7eb', fontSize: '0.85rem', maxHeight: '11rem', overflowY: 'auto' }}>
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
          <div style={{ color: '#94a3b8', fontSize: '0.85rem' }}>{t.tip}</div>
        </div>
      </InfoModal>

      <PlayingCardStyles />
      <style jsx global>{`
        @keyframes doubtReveal {
          from { opacity: 0; transform: scale(0.92); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
