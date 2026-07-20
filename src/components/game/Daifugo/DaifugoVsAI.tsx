/**
 * Daifugo (大富豪) - Vs AI (3–6 players)
 */

'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
import type { DaifugoDifficulty } from './DaifugoAI';
import { rankToLabel } from './types';
import type { Card } from './types';
import { PlayingCard, PlayingCardStyles } from './PlayingCard';
import {
  DAIFUGO_RANK_PRIORITY,
} from './multiplayerTypes';
import type { DaifugoAction, DaifugoLogEntry, DaifugoNetworkState } from './multiplayerTypes';
import { DaifugoTableView } from './DaifugoTableView';
import type { DaifugoUITranslations } from '../constants/gameTranslations';

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
    logPlayed: translate('games.daifugo.ui.logPlayed'),
    logPass: translate('games.daifugo.ui.logPass'),
    logTableCleared: translate('games.daifugo.ui.logTableCleared'),
    logRoundEnd: translate('games.daifugo.ui.logRoundEnd'),
    logNextRound: translate('games.daifugo.ui.logNextRound'),
    logStraight: translate('games.daifugo.ui.logStraight'),
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

  const isJa = (translate('games.daifugo.title') || '').match(/[぀-ヿ一-鿿]/) !== null
    || (typeof window !== 'undefined' && (document?.documentElement?.lang ?? '').startsWith('ja'));

  const [playerName, setPlayerName] = useState('');
  const [aiCount, setAiCount] = useState<number>(2); // total players = aiCount + 1 (min 3, max 6)
  const [difficulty, setDifficulty] = useState<DaifugoDifficulty>('medium');

  const difficultyOptions = useMemo(() => ([
    { value: 'easy' as const, label: isJa ? 'かんたん' : 'Easy', desc: isJa ? '低い札から素直に出す' : 'Plays low cards plainly' },
    { value: 'medium' as const, label: isJa ? 'ふつう' : 'Medium', desc: isJa ? '強い札を温存する' : 'Saves strong cards' },
    { value: 'hard' as const, label: isJa ? 'つよい' : 'Hard', desc: isJa ? 'パスを読み、8切りを狙う' : 'Passes wisely, uses 8-cut' },
    { value: 'expert' as const, label: isJa ? 'エキスパート' : 'Expert', desc: isJa ? '相手の手札枚数を意識' : 'Reads opponents’ hands' },
    { value: 'master' as const, label: isJa ? 'マスター' : 'Master', desc: isJa ? '隙のない最善手' : 'Near-optimal play' },
  ]), [isJa]);

  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);
  const [selectedGiveCardIds, setSelectedGiveCardIds] = useState<string[]>([]);
  const [selectedDiscardCardIds, setSelectedDiscardCardIds] = useState<string[]>([]);
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
    if (!gameState || !isMyTurn) return { ok: false, error: translate('games.daifugo.ui.errors.notYourTurn') };
    if (!selectedShape) return { ok: false, error: translate('games.daifugo.ui.errors.selectCards') };
    const probe: DaifugoAction = {
      actionId: 'probe',
      type: 'play',
      playerId: humanId,
      cardIds: effectiveSelectedCardIds,
      timestamp: 0,
    };
    const result = applyAction(gameState, probe);
    return result.ok ? { ok: true, error: null } : { ok: false, error: result.error };
  }, [gameState, isMyTurn, selectedShape, effectiveSelectedCardIds, humanId, translate]);

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

  // 10捨て context - detect when playing 10s
  const tenDiscardContext = useMemo(() => {
    if (!gameState) return { needed: false as const, discardCount: 0 };
    if (!isMyTurn || gameState.finished) return { needed: false as const, discardCount: 0 };
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
    myHand.length,
    selectedShape,
  ]);

  const tenDiscardCandidates = useMemo(() => {
    if (!tenDiscardContext.needed) return [];
    const selectedSet = new Set(effectiveSelectedCardIds);
    // Exclude cards that are being given away (7渡し)
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

  const startGame = () => {
    setLocalError(null);
    const clampedAI = Math.max(2, Math.min(5, aiCount));
    const totalPlayers = clampedAI + 1;
    if (totalPlayers < 3 || totalPlayers > 6) {
      setLocalError(translate('games.daifugo.ui.errors.playerCount'));
      return;
    }

    const trimmedName = playerName.trim() || d.you;
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
    setSelectedDiscardCardIds([]);
  };

  const resetToSetup = () => {
    setLocalError(null);
    setSelectedCardIds([]);
    setSelectedGiveCardIds([]);
    setSelectedDiscardCardIds([]);
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

        const decision = decideDaifugoAction(prev, currentPlayerId, difficulty);
        const action: DaifugoAction = decision.type === 'play'
          ? {
            actionId: createActionId(),
            type: 'play',
            playerId: currentPlayerId,
            cardIds: decision.cardIds,
            giveCardIds: decision.giveCardIds,
            discardCardIds: decision.discardCardIds,
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
  }, [gameState, players, difficulty]);

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
      discardCardIds: tenDiscardContext.needed ? effectiveDiscardCardIds : undefined,
      timestamp: Date.now(),
    };

    setSelectedCardIds([]);
    setSelectedGiveCardIds([]);
    setSelectedDiscardCardIds([]);

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
    setSelectedDiscardCardIds([]);

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
          return `${name}: ${d.logStraight} ${entry.cardCount} (${rankToLabel(start)}-${rankToLabel(entry.rankKey)})`;
        }
        return `${name}: ${d.logPlayed} ${entry.cardCount} × ${rankToLabel(entry.rankKey)}`;
      }
      if (entry.type === 'pass') return `${name}: ${d.logPass}`;
      if (entry.type === 'trick_end') return `${name}: ${d.logTableCleared}`;
      if (entry.type === 'round_end') return `${name}: ${d.logRoundEnd}`;
      if (entry.type === 'next_round') return `${name}: ${d.logNextRound}`;
      return `${name}: ...`;
    });
  }, [gameState?.log, playerNameOf, d]);

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
    setSelectedDiscardCardIds([]);
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
      AI ×{Math.max(2, Math.min(5, aiCount))} · {difficultyOptions.find(o => o.value === difficulty)?.label}
    </div>
  );

  const renderCard = (card: Card, idx: number) => {
    const selected = effectiveSelectedCardIds.includes(card.id);
    const disabled = !isMyTurn || gameState?.finished;

    return (
      <div
        key={card.id}
        style={{
          marginLeft: idx > 0 ? '-1.1rem' : 0,
          transition: 'margin 0.15s ease',
          flex: '0 0 auto',
        }}
      >
        <PlayingCard
          card={card}
          selected={selected}
          disabled={disabled}
          onClick={() => toggleCard(card.id)}
          size="medium"
          variant="hand"
          animationDelay={Math.min(idx * 25, 200)}
        />
      </div>
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
        paddingTop: '4rem',
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
                  <div style={{ color: '#fff', fontWeight: 900, fontSize: '1.25rem' }}>{d.vsAI}</div>
                  <div style={{ color: '#9ca3af', fontSize: '0.9rem' }}>{d.chooseAICount}</div>
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
                  {d.back}
                </button>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginTop: '1rem', alignItems: 'center' }}>
                <input
                  type="text"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  placeholder={d.yourName}
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
                  {d.aiPlayers}
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
                  <span style={{ color: '#6b7280' }}>{d.total} {aiCount + 1}</span>
                </label>
              </div>

              {/* Difficulty selector */}
              <div style={{ marginTop: '1rem' }}>
                <div style={{ color: '#9ca3af', fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.5rem' }}>
                  {isJa ? 'AIの強さ' : 'AI difficulty'}
                </div>
                <div
                  role="group"
                  aria-label={isJa ? 'AIの強さ' : 'AI difficulty'}
                  style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}
                >
                  {difficultyOptions.map((opt) => {
                    const active = difficulty === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setDifficulty(opt.value)}
                        title={opt.desc}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'flex-start',
                          gap: '0.15rem',
                          padding: '0.5rem 0.85rem',
                          minWidth: '8.5rem',
                          borderRadius: '0.75rem',
                          border: active ? '2px solid #16a34a' : '1px solid rgba(55, 65, 81, 1)',
                          background: active ? 'rgba(22, 163, 74, 0.18)' : '#111827',
                          color: '#e5e7eb',
                          cursor: 'pointer',
                          textAlign: 'left',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <span style={{ fontWeight: 800, fontSize: '0.9rem', color: active ? '#22c55e' : '#e5e7eb' }}>
                          {opt.label}
                        </span>
                        <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>{opt.desc}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginTop: '1.25rem', alignItems: 'center' }}>
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
                  {d.startGame}
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
                {/* Header */}
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <div style={{ color: '#fff', fontWeight: 900, fontSize: '1.1rem' }}>{d.vsAI}</div>
                      <span style={{
                        fontSize: '0.7rem',
                        fontWeight: 800,
                        color: '#93c5fd',
                        background: 'rgba(59,130,246,0.15)',
                        border: '1px solid rgba(59,130,246,0.4)',
                        borderRadius: '0.5rem',
                        padding: '0.1rem 0.5rem',
                      }}>
                        {difficultyOptions.find(o => o.value === difficulty)?.label}
                      </span>
                    </div>
                    <div
                      role="status"
                      aria-live="polite"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                        alignSelf: 'flex-start',
                        color: isMyTurn ? '#052e16' : '#e5e7eb',
                        background: isMyTurn ? '#22c55e' : 'rgba(75,85,99,0.5)',
                        border: `1px solid ${isMyTurn ? '#16a34a' : 'rgba(107,114,128,0.6)'}`,
                        borderRadius: '999px',
                        padding: '0.2rem 0.7rem',
                        fontSize: '0.8rem',
                        fontWeight: 800,
                      }}>
                      <span aria-hidden style={{
                        width: 8, height: 8, borderRadius: '50%',
                        background: isMyTurn ? '#052e16' : '#9ca3af',
                        animation: isMyTurn ? 'daifugoPulse 1.2s ease-in-out infinite' : undefined,
                      }} />
                      {d.round} {gameState.round} · {isMyTurn ? d.yourTurn : `${playerNameOf(gameState.currentTurnPlayerId)}${d.playerTurn}`}
                    </div>
                    {gameState.finished && (
                      <div style={{ color: '#fbbf24', fontWeight: 800, fontSize: '0.95rem' }}>
                        {d.result}: {daifugoId ? `${playerNameOf(daifugoId)} ${d.isDaifugo}` : d.finished}
                      </div>
                    )}
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

                {/* Table View */}
                <DaifugoTableView
                  gameState={gameState}
                  playerSummaries={playerSummaries}
                  pileCards={pileCards}
                  isReversed={isReversed}
                  playerNameOf={playerNameOf}
                  translations={d}
                />

                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem', marginTop: '1rem' }}>
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
                        {d.pass}
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
                        {d.play}
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
                        {d.clear}
                      </button>

                      {/* Show why play is disabled */}
                      {!canPlaySelected.ok && canPlaySelected.error && effectiveSelectedCardIds.length > 0 && (
                        <div style={{
                          color: '#fca5a5',
                          fontSize: '0.8rem',
                          alignSelf: 'center',
                        }}>
                          {canPlaySelected.error}
                        </div>
                      )}
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
                          {d.nextRound}
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
                        {d.newGame}
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
                        {d.back}
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
                            disabled={!isMyTurn || gameState?.finished}
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
                            disabled={!isMyTurn || gameState?.finished}
                            onClick={() => toggleDiscardCard(card.id)}
                            size="medium"
                            variant="hand"
                            animationDelay={idx * 20}
                          />
                        ))}
	                      </div>
	                    </div>
	                  )}

	                  <div
	                    role="group"
	                    aria-label={d.yourHand}
	                    style={{
	                    marginTop: '0.75rem',
	                    display: 'flex',
                    flexWrap: 'nowrap',
                    overflowX: 'auto',
                    alignItems: 'flex-end',
                    paddingTop: '0.75rem',
                    paddingBottom: '0.5rem',
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
                  <div style={{ color: '#9ca3af', fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.5rem' }}>{d.log}</div>
                  {logLines.length === 0 ? (
                    <div style={{ color: '#6b7280', fontStyle: 'italic' }}>{d.noActionsYet}</div>
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
