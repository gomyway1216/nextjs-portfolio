/**
 * Shichinarabe (七並べ) - Vs AI (3–6 players)
 *
 * Revamped: polished 4-suit tableau, legal-move highlighting, per-opponent pass
 * counters, difficulty tiers, bilingual (ja/en), responsive + dark-mode + a11y.
 */

'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GameTopBar, InfoModal, GameStats, getDifficultyColor } from '../common';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { applyAction, createInitialShichinarabeState, getPlayableCardsForPlayer } from './gameLogic';
import { decideShichinarabeAction, ShichinarabeAIDifficulty } from './ShichinarabeAI';
import { cardToShortLabel, rankToLabel, SUITS, SUIT_SYMBOL } from './types';
import { PlayingCard, PlayingCardStyles } from './PlayingCard';
import { getShichinarabeStrings, DIFFICULTY_ORDER } from './i18n';
import styles from './ShichinarabeVsAI.module.css';
import type { Card, CardSuit } from './types';
import type { ShichinarabeAction, ShichinarabeLogEntry, ShichinarabeNetworkState } from './multiplayerTypes';

interface ShichinarabeVsAIProps {
  onBackToMenu: () => void;
}

type LocalPlayerMeta = { name: string; isAI: boolean };

function createActionId(): string {
  return `act_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function createLocalId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

const RED_SUITS: Record<CardSuit, boolean> = { S: false, C: false, H: true, D: true };

const MEDALS = ['🥇', '🥈', '🥉'];

export function ShichinarabeVsAI({ onBackToMenu }: ShichinarabeVsAIProps) {
  const { language } = useGameLanguage();
  const t = useMemo(() => getShichinarabeStrings(language), [language]);
  const stats = useMemo<GameStats>(() => ({ wins: 0, losses: 0, draws: 0 }), []);
  const [showInfo, setShowInfo] = useState(false);

  const [playerName, setPlayerName] = useState('');
  const [aiCount, setAiCount] = useState<number>(3); // total players = aiCount + 1 (min 3, max 6)
  const [difficulty, setDifficulty] = useState<ShichinarabeAIDifficulty>('hard');

  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [draggingCardId, setDraggingCardId] = useState<string | null>(null);
  const [dragOverSlot, setDragOverSlot] = useState<string | null>(null);

  const [humanId] = useState(() => createLocalId('human'));
  const [players, setPlayers] = useState<Record<string, LocalPlayerMeta>>({});
  const [gameState, setGameState] = useState<ShichinarabeNetworkState | null>(null);
  // The difficulty the current game is being played at (locked in at start).
  const [activeDifficulty, setActiveDifficulty] = useState<ShichinarabeAIDifficulty>('hard');
  const difficultyRef = useRef<ShichinarabeAIDifficulty>('hard');

  const aiTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const playerNameOf = useCallback((playerId: string): string => {
    if (playerId === humanId) return players[playerId]?.name ?? t.you;
    return players[playerId]?.name ?? playerId;
  }, [players, humanId, t.you]);

  const myHand = useMemo<Card[]>(() => {
    if (!gameState) return [];
    return gameState.hands[humanId] ?? [];
  }, [gameState, humanId]);

  const isMyTurn = !!gameState && !gameState.finished && gameState.currentTurnPlayerId === humanId;

  const playableCards = useMemo(() => {
    if (!gameState) return [];
    return getPlayableCardsForPlayer(gameState, humanId);
  }, [gameState, humanId]);

  const playableIdSet = useMemo(() => new Set(playableCards.map(c => c.id)), [playableCards]);
  const iHaveNoLegalMove = isMyTurn && playableCards.length === 0;

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
      playerId: humanId,
      cardId: selectedCardId,
      timestamp: 0,
    };
    const result = applyAction(gameState, probe);
    return result.ok ? { ok: true, error: null } : { ok: false, error: result.error };
  }, [gameState, humanId, isMyTurn, selectedCardId]);

  const playerSummaries = useMemo(() => {
    if (!gameState) return [];
    return gameState.playerOrder.map((id) => {
      const finishedPos = gameState.finishedOrder.indexOf(id);
      const eliminatedPos = gameState.eliminatedOrder.indexOf(id);
      const statusKind = finishedPos >= 0 ? 'finished' : eliminatedPos >= 0 ? 'eliminated' : 'active';
      const place = gameState.ranks?.[id] ?? null;
      return {
        id,
        name: playerNameOf(id),
        handCount: (gameState.hands[id] ?? []).length,
        passCount: gameState.passCounts[id] ?? 0,
        isTurn: id === gameState.currentTurnPlayerId,
        isMe: id === humanId,
        statusKind,
        place,
      };
    });
  }, [gameState, humanId, playerNameOf]);

  const lastPlayed = useMemo(() => {
    if (!gameState) return null;
    const log: ShichinarabeLogEntry[] = gameState.log ?? [];
    for (let i = log.length - 1; i >= 0; i--) {
      const entry = log[i]!;
      if (entry.type === 'play' && entry.card) return entry.card;
    }
    return null;
  }, [gameState]);

  const startGame = () => {
    setLocalError(null);
    const clampedAI = Math.max(2, Math.min(5, aiCount));
    const totalPlayers = clampedAI + 1;
    if (totalPlayers < 3 || totalPlayers > 6) {
      setLocalError('Total players must be between 3 and 6.');
      return;
    }

    const trimmedName = playerName.trim() || t.namePlaceholder;
    const aiIds = Array.from({ length: clampedAI }, (_, i) => createLocalId(`ai${i + 1}`));
    const playerOrder = [humanId, ...aiIds];

    const initial = createInitialShichinarabeState(playerOrder, { maxPasses: 3 });

    const nextPlayers: Record<string, LocalPlayerMeta> = {
      [humanId]: { name: trimmedName, isAI: false },
    };
    aiIds.forEach((id, idx) => {
      nextPlayers[id] = { name: `AI ${idx + 1}`, isAI: true };
    });

    difficultyRef.current = difficulty;
    setActiveDifficulty(difficulty);
    setPlayers(nextPlayers);
    setGameState(initial);
    setSelectedCardId(null);
  };

  const resetToSetup = () => {
    setLocalError(null);
    setSelectedCardId(null);
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

        const decision = decideShichinarabeAction(prev, currentPlayerId, difficultyRef.current);
        const action: ShichinarabeAction = decision.type === 'play'
          ? {
            actionId: createActionId(),
            type: 'play',
            playerId: currentPlayerId,
            cardId: decision.cardId,
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
    }, 620);

    return () => {
      if (aiTimeoutRef.current) {
        clearTimeout(aiTimeoutRef.current);
        aiTimeoutRef.current = null;
      }
    };
  }, [gameState, players]);

  const toggleCard = (cardId: string) => {
    setLocalError(null);
    setSelectedCardId(prev => (prev === cardId ? null : cardId));
  };

  const playCardById = useCallback((cardId: string) => {
    setLocalError(null);
    setDragOverSlot(null);
    setDraggingCardId(null);
    if (!cardId) return;
    if (!isMyTurn) return;

    const action: ShichinarabeAction = {
      actionId: createActionId(),
      type: 'play',
      playerId: humanId,
      cardId,
      timestamp: Date.now(),
    };

    setSelectedCardId(null);

    setGameState((prev) => {
      if (!prev) return prev;
      if (prev.finished) return prev;
      if (prev.currentTurnPlayerId !== humanId) return prev;
      const result = applyAction(prev, action);
      if (!result.ok) {
        setLocalError(result.error);
        return prev;
      }
      return result.state;
    });
  }, [humanId, isMyTurn]);

  const handlePlay = () => {
    setLocalError(null);
    if (!canPlaySelected.ok || !selectedCardId) {
      setLocalError(canPlaySelected.error);
      return;
    }
    playCardById(selectedCardId);
  };

  const handlePass = () => {
    if (!gameState) return;
    setLocalError(null);
    if (!isMyTurn) return;

    const action: ShichinarabeAction = {
      actionId: createActionId(),
      type: 'pass',
      playerId: humanId,
      timestamp: Date.now(),
    };

    setSelectedCardId(null);

    const result = applyAction(gameState, action);
    if (!result.ok) {
      setLocalError(result.error);
      return;
    }
    setGameState(result.state);
  };

  const handleNewGame = () => {
    if (!gameState) return;
    const nextState = createInitialShichinarabeState(gameState.playerOrder, { maxPasses: gameState.maxPasses });
    setSelectedCardId(null);
    setLocalError(null);
    setGameState(nextState);
  };

  const modeBadge = gameState ? (
    <div style={{
      background: 'rgba(251, 191, 36, 0.12)',
      border: '1px solid rgba(251, 191, 36, 0.35)',
      borderRadius: '0.5rem',
      padding: '0.35rem 0.75rem',
      color: '#fbbf24',
      fontSize: '0.72rem',
      fontWeight: 700,
      fontFamily: 'monospace',
      letterSpacing: '0.06em',
    }}>
      {t.difficultyNames[activeDifficulty]} · {gameState.playerOrder.length}P
    </div>
  ) : null;

  const table = gameState?.table;

  // Render a hand card.
  const renderCard = (card: Card, idx: number) => {
    const selected = selectedCardId === card.id;
    const playable = playableIdSet.has(card.id);
    const disabled = !isMyTurn || gameState?.finished;
    const canDrag = !disabled && playable;

    return (
      <PlayingCard
        key={card.id}
        card={card}
        size="small"
        selected={selected}
        playable={playable}
        disabled={disabled}
        onClick={() => (playable ? toggleCard(card.id) : undefined)}
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

  const logText = (entry: ShichinarabeLogEntry): string => {
    const name = playerNameOf(entry.playerId);
    if (entry.type === 'play' && entry.card) {
      const label = `${rankToLabel(entry.card.rank)}${SUIT_SYMBOL[entry.card.suit]}`;
      if (entry.detail === 'Revealed on elimination') return t.logRevealed(name, label);
      return t.logPlayed(name, label);
    }
    if (entry.type === 'pass') return t.logPassed(name, entry.passCount ?? 0, gameState?.maxPasses ?? 3);
    if (entry.type === 'eliminate') return t.logEliminated(name);
    if (entry.type === 'start') return t.logStart;
    if (entry.type === 'finish') return t.logFinish;
    return `${name}: …`;
  };

  const myPlace = gameState?.ranks?.[humanId] ?? null;

  return (
    <div className={styles.root}>
      <GameTopBar stats={stats} onInfoClick={() => setShowInfo(true)} additionalContent={modeBadge} />

      <div className={styles.scroll}>
        <div className={styles.container}>
          {!gameState && (
            <div className={styles.setupCard}>
              <div className={styles.setupHeader}>
                <div>
                  <h1 className={styles.setupTitle}>{t.title}</h1>
                  <p className={styles.setupSubtitle}>{t.subtitle}</p>
                </div>
                <button className={styles.ghostBtn} onClick={handleBack}>{t.back}</button>
              </div>

              <div className={styles.setupGrid}>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>{t.yourName}</span>
                  <input
                    className={styles.input}
                    type="text"
                    value={playerName}
                    onChange={(e) => setPlayerName(e.target.value)}
                    placeholder={t.namePlaceholder}
                    maxLength={20}
                  />
                </label>

                <label className={styles.field}>
                  <span className={styles.fieldLabel}>{t.opponents}</span>
                  <select
                    className={styles.select}
                    value={aiCount}
                    onChange={(e) => setAiCount(Number(e.target.value))}
                    aria-label={t.opponents}
                  >
                    {[2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>{n} — {t.totalPlayers(n + 1)}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div className={styles.field} style={{ marginTop: '1.25rem' }}>
                <span className={styles.fieldLabel}>{t.difficulty}</span>
                <div className={styles.diffRow} role="group" aria-label={t.difficulty}>
                  {DIFFICULTY_ORDER.map((d) => {
                    const colors = getDifficultyColor(d);
                    const isSel = difficulty === d;
                    return (
                      <button
                        key={d}
                        type="button"
                        aria-pressed={isSel}
                        data-selected={isSel ? 'true' : 'false'}
                        className={styles.diffButton}
                        style={{
                          ['--diff-bg' as string]: colors.bg,
                          ['--diff-border' as string]: colors.border,
                          ['--diff-text' as string]: colors.text,
                        }}
                        onClick={() => setDifficulty(d)}
                      >
                        {t.difficultyNames[d]}
                      </button>
                    );
                  })}
                </div>
                <div className={styles.diffDesc}>{t.difficultyDescs[difficulty]}</div>
              </div>

              <button className={styles.primaryBtn} onClick={startGame}>{t.start}</button>

              {localError && <p className={styles.errorText} style={{ marginTop: '1rem' }}>{localError}</p>}
            </div>
          )}

          {gameState && (
            <>
              {/* Status bar */}
              <div className={styles.statusBar}>
                <div className={styles.turnPill} data-mine={isMyTurn ? 'true' : 'false'}>
                  {!gameState.finished && <span className={styles.turnDot} aria-hidden />}
                  <span aria-live="polite">
                    {gameState.finished
                      ? t.finished
                      : isMyTurn
                        ? t.yourTurn
                        : t.waitingTurn(playerNameOf(gameState.currentTurnPlayerId))}
                  </span>
                </div>
                <div className={styles.headerBtns}>
                  {gameState.finished && (
                    <button className={styles.ghostBtn} onClick={handleNewGame} style={{ background: 'rgba(37,99,235,0.85)', color: '#fff', borderColor: 'transparent' }}>
                      {t.newGame}
                    </button>
                  )}
                  <button className={styles.ghostBtn} onClick={resetToSetup}>{t.restart}</button>
                  <button className={styles.ghostBtn} onClick={handleBack}>{t.back}</button>
                </div>
              </div>

              {/* Results banner */}
              {gameState.finished && gameState.ranks && (
                <div className={styles.resultBanner}>
                  <div className={styles.resultTitle}>
                    {myPlace === 1 ? t.youWin : gameState.winnerId ? t.winnerBanner(playerNameOf(gameState.winnerId)) : t.finished}
                  </div>
                  {myPlace && myPlace !== 1 && <div className={styles.resultSub}>{t.youPlaced(myPlace)}</div>}
                  <div className={styles.standings}>
                    {playerSummaries
                      .filter(p => typeof p.place === 'number')
                      .sort((a, b) => (a.place ?? 999) - (b.place ?? 999))
                      .map((p) => (
                        <div key={p.id} className={styles.standRow}>
                          {p.place && p.place <= 3
                            ? <span className={styles.medal} role="img" aria-label={t.place(p.place)}>{MEDALS[p.place - 1]}</span>
                            : <span>{t.place(p.place ?? 0)}</span>}
                          <span style={{ color: p.isMe ? '#fbbf24' : undefined }}>{p.name}</span>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Players */}
              <div className={styles.playerRow}>
                {playerSummaries.map((p) => (
                  <div key={p.id} className={styles.playerChip} data-turn={p.isTurn ? 'true' : 'false'} data-out={p.statusKind !== 'active' ? 'true' : 'false'}>
                    <div className={styles.playerName} data-me={p.isMe ? 'true' : 'false'}>
                      {p.name}{p.isMe ? ` (${t.you})` : ''}
                    </div>
                    <div className={styles.playerMeta}>
                      {t.cardsLeft(p.handCount)}
                      <span className={styles.passPips} aria-label={t.passesLabel(p.passCount, gameState.maxPasses)} title={t.passesLabel(p.passCount, gameState.maxPasses)}>
                        {Array.from({ length: gameState.maxPasses }, (_, i) => (
                          <span
                            key={i}
                            className={styles.passPip}
                            data-used={i < p.passCount ? 'true' : 'false'}
                            data-danger={i < p.passCount && i === gameState.maxPasses - 1 ? 'true' : 'false'}
                          />
                        ))}
                      </span>
                    </div>
                    <div className={styles.playerStatus} data-kind={p.statusKind}>
                      {p.place
                        ? t.place(p.place)
                        : p.statusKind === 'finished'
                          ? t.statusFinished
                          : p.statusKind === 'eliminated'
                            ? t.statusEliminated
                            : t.statusActive}
                    </div>
                  </div>
                ))}
              </div>

              {/* Tableau */}
              <div className={styles.panel}>
                <div className={styles.panelHead}>
                  <span className={styles.panelTitle}>{t.table}</span>
                  <span className={styles.hint}>
                    {lastPlayed ? `${rankToLabel(lastPlayed.rank)}${SUIT_SYMBOL[lastPlayed.suit]}` : '—'}
                  </span>
                </div>

                <div className={styles.tableauScroll}>
                  {SUITS.map((suit) => {
                    const bounds = table?.[suit];
                    const low = bounds?.low ?? 7;
                    const high = bounds?.high ?? 7;
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
                              <div key={slotKey} className={rank === 7 ? styles.slotSeven : undefined}>
                                <PlayingCard
                                  card={tableCard}
                                  size="small"
                                  disabled
                                  variant={isLast ? 'table' : 'static'}
                                />
                              </div>
                            );
                          }

                          if (isEnd) {
                            const canAcceptDrop = !!draggingCard
                              && isMyTurn
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
                                onDragEnter={() => { if (canAcceptDrop) setDragOverSlot(slotKey); }}
                                onDragLeave={() => setDragOverSlot((prev) => (prev === slotKey ? null : prev))}
                                onDragOver={(e) => {
                                  // Only accept (and show the 'move' cursor) when this exact
                                  // slot matches the dragged card; otherwise leave the browser's
                                  // default "no-drop" feedback.
                                  if (!canAcceptDrop) return;
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
                                  playCardById(droppedId);
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
              <div className={styles.panel}>
                <div className={styles.controls}>
                  <button
                    className={`${styles.actionBtn} ${styles.playBtn}`}
                    onClick={handlePlay}
                    disabled={!canPlaySelected.ok || gameState.finished}
                  >
                    {t.play}
                  </button>
                  <button
                    className={`${styles.actionBtn} ${styles.passBtn}`}
                    onClick={handlePass}
                    disabled={!isMyTurn || gameState.finished}
                  >
                    {t.pass}
                  </button>
                  <button
                    className={`${styles.actionBtn} ${styles.clearBtn}`}
                    onClick={() => setSelectedCardId(null)}
                    disabled={!selectedCardId}
                  >
                    {t.clear}
                  </button>
                  <span className={styles.hint} style={{ marginLeft: 'auto' }}>
                    {iHaveNoLegalMove ? t.noLegalMove : isMyTurn ? t.legalHint : ''}
                  </span>
                </div>
                {localError && <div className={styles.errorText} style={{ marginTop: '0.6rem' }}>{localError}</div>}
              </div>

              {/* Hand */}
              <div className={styles.panel}>
                <div className={styles.panelHead}>
                  <span className={styles.panelTitle}>{t.yourHand}</span>
                  <span className={styles.hint}>
                    {selectedCardId
                      ? t.selected(cardToShortLabel(myHand.find(c => c.id === selectedCardId) ?? myHand[0] ?? { id: '', suit: 'S', rank: 1 }))
                      : t.selectCard}
                  </span>
                </div>
                <div className={styles.hand}>
                  {myHand.length === 0
                    ? <span className={styles.hint}>—</span>
                    : myHand.map(renderCard)}
                </div>
              </div>

              {/* Log */}
              <div className={styles.panel}>
                <div className={styles.panelHead}>
                  <span className={styles.panelTitle}>{t.activityLog}</span>
                </div>
                {gameState.log.length <= 1 ? (
                  <div className={styles.hint} style={{ fontStyle: 'italic' }}>{t.noActions}</div>
                ) : (
                  <div className={styles.logList}>
                    {gameState.log.slice(-12).reverse().map((entry, idx) => (
                      <div key={`${idx}_${entry.id}`}>{logText(entry)}</div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <InfoModal
        isOpen={showInfo}
        onClose={() => setShowInfo(false)}
        title={t.howToTitle}
      >
        <div style={{ color: '#e5e7eb', display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
          <Section heading={t.goalHeading} body={t.goalBody} />
          <Section heading={t.setupHeading} body={t.setupBody} />
          <Section heading={t.playHeading} body={t.playBody} />
          <Section heading={t.passHeading} body={t.passBody(gameState?.maxPasses ?? 3)} />
          <Section heading={t.tipHeading} body={t.tipBody} />
        </div>
      </InfoModal>

      <PlayingCardStyles />
    </div>
  );
}

function Section({ heading, body }: { heading: string; body: string }) {
  return (
    <div>
      <div style={{ fontWeight: 800, color: '#fbbf24', marginBottom: '0.2rem' }}>{heading}</div>
      <div style={{ color: '#cbd5e1', lineHeight: 1.55 }}>{body}</div>
    </div>
  );
}
