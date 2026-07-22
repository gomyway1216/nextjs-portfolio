/**
 * Daifugo (大富豪) - Online Multiplayer (3–6 players)
 */

'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GameTopBar, InfoModal, GameStats } from '../common';
import { DaifugoMultiplayerLobby } from './DaifugoMultiplayerLobby';
import { useDaifugoMultiplayer } from './useDaifugoMultiplayer';
import { getPlayShape, getSelectedCards, getNextPlayerId, sortHand } from './gameLogic';
import { formatDaifugoLogCards } from './errorMessages';
import { rankToLabel } from './types';
import type { Card } from './types';
import { PlayingCard, PlayingCardStyles } from './PlayingCard';
import { DAIFUGO_RANK_PRIORITY, daifugoRankToLabel } from './multiplayerTypes';
import type { DaifugoLogEntry } from './multiplayerTypes';
import type { DaifugoUITranslations } from '../constants/gameTranslations';

interface DaifugoOnlineProps {
  onBackToMenu: () => void;
}

export function DaifugoOnline({ onBackToMenu }: DaifugoOnlineProps) {
  const multiplayer = useDaifugoMultiplayer();
  const stats = useMemo<GameStats>(() => ({ wins: 0, losses: 0, draws: 0 }), []);
  const [showInfo, setShowInfo] = useState(false);
  const { t: translate } = useTranslation();

  // Build translation objects from i18next
  const gameT = {
    title: translate('games.daifugo.title'),
    longDescription: translate('games.daifugo.longDescription'),
    howToPlay: translate('games.daifugo.howToPlay', { returnObjects: true }) as string[],
    features: translate('games.daifugo.features', { returnObjects: true }) as string[],
  };

  const d: DaifugoUITranslations = {
    vsAI: translate('games.daifugo.ui.vsAI'),
    online: translate('games.daifugo.ui.online'),
    chooseAICount: translate('games.daifugo.ui.chooseAICount'),
    yourName: translate('games.daifugo.ui.yourName'),
    aiPlayers: translate('games.daifugo.ui.aiPlayers'),
    total: translate('games.daifugo.ui.total'),
    startGame: translate('games.daifugo.ui.startGame'),
    back: translate('games.daifugo.ui.back'),
    round: translate('games.daifugo.ui.round'),
    yourTurn: translate('games.daifugo.ui.yourTurn'),
    playerTurn: translate('games.daifugo.ui.playerTurn'),
    result: translate('games.daifugo.ui.result'),
    isDaifugo: translate('games.daifugo.ui.isDaifugo'),
    finished: translate('games.daifugo.ui.finished'),
    results: translate('games.daifugo.ui.results'),
    pass: translate('games.daifugo.ui.pass'),
    play: translate('games.daifugo.ui.play'),
    clear: translate('games.daifugo.ui.clear'),
    nextRound: translate('games.daifugo.ui.nextRound'),
    newGame: translate('games.daifugo.ui.newGame'),
    yourHand: translate('games.daifugo.ui.yourHand'),
    selectCards: translate('games.daifugo.ui.selectCards'),
    selectedStraight: translate('games.daifugo.ui.selectedStraight'),
    selectedGroup: translate('games.daifugo.ui.selectedGroup'),
    sevenGive: translate('games.daifugo.ui.sevenGive'),
    sevenGiveDesc: translate('games.daifugo.ui.sevenGiveDesc'),
    giveToPlayer: translate('games.daifugo.ui.giveToPlayer'),
    tenDiscard: translate('games.daifugo.ui.tenDiscard'),
    tenDiscardDesc: translate('games.daifugo.ui.tenDiscardDesc'),
    discardUpTo: translate('games.daifugo.ui.discardUpTo'),
    log: translate('games.daifugo.ui.log'),
    noActionsYet: translate('games.daifugo.ui.noActionsYet'),
    logPass: translate('games.daifugo.ui.logPass'),
    logTableCleared: translate('games.daifugo.ui.logTableCleared'),
    logRoundEnd: translate('games.daifugo.ui.logRoundEnd'),
    logNextRound: translate('games.daifugo.ui.logNextRound'),
    daifugo: translate('games.daifugo.ui.ranks.daifugo'),
    fugo: translate('games.daifugo.ui.ranks.fugo'),
    heimin: translate('games.daifugo.ui.ranks.heimin'),
    hinmin: translate('games.daifugo.ui.ranks.hinmin'),
    daihinmin: translate('games.daifugo.ui.ranks.daihinmin'),
    revolution: translate('games.daifugo.ui.status.revolution'),
    elevenBack: translate('games.daifugo.ui.status.elevenBack'),
    shibari: translate('games.daifugo.ui.status.shibari'),
    gekishiba: translate('games.daifugo.ui.status.gekishiba'),
    rankOnly: translate('games.daifugo.ui.status.rankOnly'),
    cards: translate('games.daifugo.ui.table.cards'),
    finishedLabel: translate('games.daifugo.ui.table.finishedLabel'),
    anyCard: translate('games.daifugo.ui.table.anyCard'),
    tableCard: translate('games.daifugo.ui.table.tableCard'),
    weak: translate('games.daifugo.ui.table.weak'),
    strong: translate('games.daifugo.ui.table.strong'),
    passLabel: translate('games.daifugo.ui.table.passLabel'),
    players: translate('games.daifugo.ui.table.players'),
    you: translate('games.daifugo.ui.table.you'),
  };

  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);
  const [selectedGiveCardIds, setSelectedGiveCardIds] = useState<string[]>([]);
  const [selectedDiscardCardIds, setSelectedDiscardCardIds] = useState<string[]>([]);
  const [localError, setLocalError] = useState<string | null>(null);

  const room = multiplayer.room;
  const gameState = multiplayer.gameState;
  const isReversed = !!gameState && (gameState.revolution !== gameState.jackBack);

  const myPlayerName = room?.players?.[multiplayer.context.playerId]?.name || multiplayer.context.playerName || 'You';

  const myHand = useMemo<Card[]>(() => {
    if (!gameState) return [];
    return gameState.hands[multiplayer.context.playerId] ?? [];
  }, [gameState, multiplayer.context.playerId]);

  const isMyTurn = !!gameState && !gameState.finished && gameState.currentTurnPlayerId === multiplayer.context.playerId;
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  // 10捨て context
  const tenDiscardContext = useMemo(() => {
    if (!gameState) return { needed: false as const, discardCount: 0 };
    if (!isMyTurn || isSubmitting || gameState.finished) return { needed: false as const, discardCount: 0 };
    if (!selectedShape || selectedShape.kind !== 'group' || !selectedShape.containsTen) {
      return { needed: false as const, discardCount: 0 };
    }
    const remainingCount = myHand.length - effectiveSelectedCardIds.length;
    if (remainingCount <= 0) return { needed: false as const, discardCount: 0 };

    const discardCount = Math.min(selectedShape.count, remainingCount);
    return { needed: true as const, discardCount };
  }, [
    effectiveSelectedCardIds.length,
    gameState,
    isMyTurn,
    isSubmitting,
    myHand.length,
    selectedShape,
  ]);

  const tenDiscardCandidates = useMemo(() => {
    if (!tenDiscardContext.needed) return [];
    const selectedSet = new Set(effectiveSelectedCardIds);
    const giveSet = new Set(finalGiveCardIds);
    return myHand.filter(c => !selectedSet.has(c.id) && !giveSet.has(c.id));
  }, [effectiveSelectedCardIds, myHand, tenDiscardContext.needed, finalGiveCardIds]);

  const effectiveDiscardCardIds = useMemo(() => {
    if (!tenDiscardContext.needed) return [];
    const available = new Set(tenDiscardCandidates.map(c => c.id));
    return selectedDiscardCardIds
      .filter(id => available.has(id))
      .slice(0, tenDiscardContext.discardCount);
  }, [selectedDiscardCardIds, tenDiscardCandidates, tenDiscardContext.discardCount, tenDiscardContext.needed]);

  const canPlaySelected = useMemo<{ ok: boolean; error: string | null }>(() => {
    if (!gameState || !isMyTurn) return { ok: false, error: translate('games.daifugo.ui.errors.notYourTurn') };
    if (!selectedShape) return { ok: false, error: translate('games.daifugo.ui.errors.selectCards') };
    // Soft client-side check: all selected cards are in the player's
    // hand. The server runs the full Daifugo rule check (shibari,
    // revolution, signature, …); on rejection the response error is
    // surfaced to the user.
    const hand = gameState.hands[multiplayer.context.playerId] ?? [];
    const handIds = new Set(hand.map((c) => c.id));
    if (!effectiveSelectedCardIds.every((id) => handIds.has(id))) {
      return { ok: false, error: translate('games.daifugo.ui.errors.cardNotInHand') };
    }
    return { ok: true, error: null };
  }, [gameState, isMyTurn, selectedShape, effectiveSelectedCardIds, multiplayer.context.playerId, translate]);

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

  const toggleDiscardCard = (cardId: string) => {
    if (!tenDiscardContext.needed) return;
    setSelectedDiscardCardIds((prev) => {
      if (prev.includes(cardId)) return prev.filter(id => id !== cardId);
      if (prev.length >= tenDiscardContext.discardCount) return prev;
      return [...prev, cardId];
    });
  };

  const handleStartGame = async () => {
    setLocalError(null);
    if (!room || !multiplayer.context.isHost) return;
    const playerCount = Object.keys(room.players || {}).length;
    if (playerCount < 3) {
      setLocalError(translate('games.daifugo.ui.errors.playerCount'));
      return;
    }
    const ok = await multiplayer.startGame();
    if (!ok) setLocalError('Failed to start game');
  };

  const handlePlay = async () => {
    if (!gameState) return;
    setLocalError(null);
    if (!isMyTurn) return;
    if (!canPlaySelected.ok) {
      setLocalError(canPlaySelected.error);
      return;
    }

    const cardIds = effectiveSelectedCardIds;
    const giveCardIds = sevenGiveContext.needed ? finalGiveCardIds : undefined;
    const discardCardIds = tenDiscardContext.needed ? effectiveDiscardCardIds : undefined;

    setSelectedCardIds([]);
    setSelectedGiveCardIds([]);
    setSelectedDiscardCardIds([]);

    setIsSubmitting(true);
    try {
      const res = await multiplayer.submitPlay(cardIds, { giveCardIds, discardCardIds });
      if (!res.success) setLocalError(res.error ?? 'Play rejected');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePass = async () => {
    if (!gameState) return;
    setLocalError(null);
    if (!isMyTurn) return;
    setSelectedCardIds([]);
    setSelectedGiveCardIds([]);
    setSelectedDiscardCardIds([]);
    setIsSubmitting(true);
    try {
      const res = await multiplayer.submitPass();
      if (!res.success) setLocalError(res.error ?? 'Pass rejected');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNextRound = async () => {
    // Multi-round flow (post-game card exchange) isn't expressed as a
    // single CF action yet. Drop back to the menu so the host can spin
    // up a new room. (CF is the only writer; we can't reset state from
    // the client.)
    setLocalError(null);
    setSelectedCardIds([]);
    setSelectedGiveCardIds([]);
    setSelectedDiscardCardIds([]);
    await multiplayer.leaveRoom();
    multiplayer.resetMultiplayer();
    onBackToMenu();
  };

  const logLines = useMemo(() => {
    const log: DaifugoLogEntry[] = gameState?.log ?? [];
    return log.slice(-10).map((entry) => {
      const name = playerNameOf(entry.playerId);
      if (entry.detail) return `${name}: ${entry.detail}`;
      if (entry.type === 'play' && entry.cardCount && entry.rankKey) {
        const cards = formatDaifugoLogCards(entry);
        const key = entry.playKind === 'straight' ? 'logStraight' : 'logPlayed';
        return `${name}: ${translate(`games.daifugo.ui.${key}`, { cards, count: entry.cardCount })}`;
      }
      if (entry.type === 'pass') return `${name}: ${d.logPass}`;
      if (entry.type === 'trick_end') return `${name}: ${d.logTableCleared}`;
      if (entry.type === 'round_end') return `${name}: ${d.logRoundEnd}`;
      if (entry.type === 'next_round') return `${name}: ${d.logNextRound}`;
      return `${name}: ...`;
    });
  }, [gameState?.log, playerNameOf, d, translate]);

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
    const disabled = !isMyTurn || isSubmitting || gameState?.finished;

    return (
      <PlayingCard
        key={card.id}
        card={card}
        selected={selected}
        disabled={disabled}
        onClick={() => toggleCard(card.id)}
        size="medium"
        variant="hand"
        animationDelay={Math.min(idx * 25, 200)}
      />
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
                  {d.back}
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
	                    <div style={{ color: '#fff', fontWeight: 900, fontSize: '1.1rem' }}>{gameT.title} (Online)</div>
	                    <div style={{ color: '#9ca3af', fontSize: '0.85rem' }}>
	                      {d.round} {gameState?.round ?? 1} · {gameState?.playerOrder.length ?? 0} {d.players} · {isMyTurn ? d.yourTurn : `${playerNameOf(gameState?.currentTurnPlayerId ?? '')}${d.playerTurn}`}
	                    </div>
	                    {gameState?.finished && (
	                      <div style={{ color: '#fbbf24', fontWeight: 800, fontSize: '0.95rem' }}>
	                        {d.result}: {daifugoId ? `${playerNameOf(daifugoId)} ${d.isDaifugo}` : d.finished}
                      </div>
                    )}
                  </div>

	                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'stretch', justifyContent: 'flex-end' }}>
	                    {playerSummaries.map((p) => {
	                      const rankLabel = p.rank === 'daifugo' ? d.daifugo
	                        : p.rank === 'fugo' ? d.fugo
	                        : p.rank === 'heimin' ? d.heimin
	                        : p.rank === 'hinmin' ? d.hinmin
	                        : p.rank === 'daihinmin' ? d.daihinmin
	                        : p.rank ? daifugoRankToLabel(p.rank) : null;
	                      return (
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
	                            {p.name}{p.isMe ? ` (${d.you})` : ''}
	                          </div>
	                          <div style={{ fontSize: '0.8rem', color: '#9ca3af' }}>{p.handCount} {d.cards}</div>
	                          {gameState?.ranks && rankLabel && (
	                            <div style={{ fontSize: '0.8rem', color: '#fbbf24', fontWeight: 900, marginTop: '0.25rem' }}>
	                              {rankLabel}
	                            </div>
	                          )}
	                          {!gameState?.ranks && p.finishedPos >= 0 && (
	                            <div style={{ fontSize: '0.8rem', color: '#fbbf24', fontWeight: 900, marginTop: '0.25rem' }}>
	                              {d.finishedLabel} #{p.finishedPos + 1}
	                            </div>
	                          )}
	                        </div>
	                      );
	                    })}
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
                    <div style={{ color: '#fbbf24', fontWeight: 900, fontSize: '0.95rem' }}>{d.results}</div>
                    <div style={{ marginTop: '0.5rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                      {resultRows.map((row) => {
                        const rankLabel = row.rank === 'daifugo' ? d.daifugo
                          : row.rank === 'fugo' ? d.fugo
                          : row.rank === 'heimin' ? d.heimin
                          : row.rank === 'hinmin' ? d.hinmin
                          : row.rank === 'daihinmin' ? d.daihinmin
                          : row.rank;
                        return (
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
                            {rankLabel}: {row.name}
                          </div>
                        );
                      })}
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
                      <div style={{ color: '#9ca3af', fontSize: '0.85rem', fontWeight: 700 }}>{d.tableCard}</div>
                      <div style={{ color: '#9ca3af', fontSize: '0.85rem' }}>
                        {gameState?.pile
                          ? `${gameState.pile.count}${d.cards} · ${isReversed ? d.weak : d.strong} > ${rankToLabel(gameState.pile.rankKey)}`
                          : d.anyCard}
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
                        <div style={{ color: '#6b7280', fontStyle: 'italic' }}>{d.noActionsYet}</div>
                      ) : (
                        pileCards.map((c, idx) => (
                          <PlayingCard
                            key={c.id}
                            card={c}
                            size="medium"
                            variant="table"
                            disabled
                            animationDelay={idx * 30}
                          />
                        ))
                      )}
                    </div>

                    {gameState?.passes?.length ? (
                      <div style={{ marginTop: '0.5rem', color: '#6b7280', fontSize: '0.8rem' }}>
                        {d.passLabel} {gameState.passes.map(pid => playerNameOf(pid)).join(', ')}
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
                        {d.pass}
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
                        {d.play}
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
                        {d.clear}
                      </button>

                      {/* Show why play is disabled */}
                      {!canPlaySelected.ok && canPlaySelected.error && effectiveSelectedCardIds.length > 0 && (
                        <div style={{ color: '#fca5a5', fontSize: '0.8rem', alignSelf: 'center' }}>
                          {canPlaySelected.error}
                        </div>
                      )}
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
                      {d.back}
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
                        {d.nextRound}
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
                    <div style={{ color: '#9ca3af', fontSize: '0.85rem', fontWeight: 700 }}>{d.yourHand}</div>
                    <div style={{ color: '#9ca3af', fontSize: '0.85rem' }}>
                      {selectedShape
                        ? selectedShape.kind === 'straight'
                          ? `${d.selectedStraight} ${selectedShape.count} (${rankToLabel(selectedShape.startRank)}-${rankToLabel(selectedShape.endRank)})`
                          : `${d.selectedGroup} ${selectedShape.count} × ${rankToLabel(selectedShape.rankKey)}`
                        : d.selectCards}
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
                        {d.sevenGive}: {translate('games.daifugo.ui.giveToPlayer', { count: sevenGiveContext.giveCount, player: sevenGiveContext.toPlayerId ? playerNameOf(sevenGiveContext.toPlayerId) : '' })}
                      </div>
                      <div style={{ color: '#9ca3af', fontSize: '0.8rem', marginTop: '0.25rem' }}>
                        {d.sevenGiveDesc}
                      </div>
                      <div style={{
                        marginTop: '0.5rem',
                        display: 'flex',
                        gap: '0.5rem',
                        flexWrap: 'nowrap',
                        overflowX: 'auto',
                        paddingBottom: '0.25rem',
                      }}>
                        {sevenGiveCandidates.map((card, idx) => (
                          <PlayingCard
                            key={card.id}
                            card={card}
                            giveSelected={effectiveGiveCardIds.includes(card.id)}
                            disabled={!isMyTurn || isSubmitting || !!gameState?.finished}
                            onClick={() => toggleGiveCard(card.id)}
                            size="medium"
                            variant="hand"
                            animationDelay={idx * 20}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {tenDiscardContext.needed && (
                    <div style={{
                      marginTop: '0.75rem',
                      background: 'rgba(239, 68, 68, 0.12)',
                      border: '1px solid rgba(239, 68, 68, 0.35)',
                      borderRadius: '0.75rem',
                      padding: '0.75rem',
                    }}>
                      <div style={{ color: '#ef4444', fontWeight: 900, fontSize: '0.9rem' }}>
                        {d.tenDiscard}: {translate('games.daifugo.ui.discardUpTo', { count: tenDiscardContext.discardCount })}
                      </div>
                      <div style={{ color: '#9ca3af', fontSize: '0.8rem', marginTop: '0.25rem' }}>
                        {d.tenDiscardDesc}
                      </div>
                      <div style={{
                        marginTop: '0.5rem',
                        display: 'flex',
                        gap: '0.5rem',
                        flexWrap: 'nowrap',
                        overflowX: 'auto',
                        paddingBottom: '0.25rem',
                      }}>
                        {tenDiscardCandidates.map((card, idx) => (
                          <PlayingCard
                            key={card.id}
                            card={card}
                            discardSelected={effectiveDiscardCardIds.includes(card.id)}
                            disabled={!isMyTurn || isSubmitting || !!gameState?.finished}
                            onClick={() => toggleDiscardCard(card.id)}
                            size="medium"
                            variant="hand"
                            animationDelay={idx * 20}
                          />
                        ))}
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
        title={`${translate('games.howToPlay')} - ${gameT.title}`}
      >
        <div style={{ color: '#e5e7eb', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div style={{ color: '#cbd5e1', marginBottom: '0.5rem' }}>
            {gameT.longDescription}
          </div>
          <div>
            <div style={{ fontWeight: 800, color: '#fbbf24', marginBottom: '0.5rem' }}>{translate('games.howToPlay')}</div>
            <ul style={{ margin: 0, paddingLeft: '1.25rem', color: '#cbd5e1', lineHeight: 1.6 }}>
              {gameT.howToPlay.map((item, idx) => (
                <li key={idx} style={{ marginBottom: '0.25rem' }}>{item}</li>
              ))}
            </ul>
          </div>
          <div>
            <div style={{ fontWeight: 800, color: '#fbbf24', marginBottom: '0.5rem' }}>{translate('games.features')}</div>
            <ul style={{ margin: 0, paddingLeft: '1.25rem', color: '#cbd5e1', lineHeight: 1.6 }}>
              {gameT.features.map((item, idx) => (
                <li key={idx} style={{ marginBottom: '0.25rem' }}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      </InfoModal>
      <PlayingCardStyles />
    </div>
  );
}
