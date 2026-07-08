/**
 * Territory Number — VS AI mode.
 * Pure local state machine; no networking.
 */

'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Info } from 'lucide-react';
import { TerritoryNumberBoard, type Phase } from './TerritoryNumberBoard';
import { pickAIMove } from './TerritoryNumberAI';
import {
  emptyBoard,
  evaluateBoard,
  evaluateMatch,
  isBoardFull,
  placeCard,
  remainingCards,
} from './gameLogic';
import type {
  AIDifficulty,
  Board,
  FirstPlayerRule,
  PlayerSlot,
} from './types';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { InfoModal } from '../common';
import { getDifficultyColor } from '../common/utils';
import { getTerritoryNumberStrings } from './i18n';
import styles from './TerritoryNumber.module.css';

interface TerritoryNumberVsAIProps {
  onBackToMenu: () => void;
}

const AI_THINK_MS = 550;

function pickFirstPlayer(rule: FirstPlayerRule): PlayerSlot {
  switch (rule) {
    case 'host':
      return 'p1';
    case 'guest':
      return 'p2';
    case 'random':
      return Math.random() < 0.5 ? 'p1' : 'p2';
  }
}

export function TerritoryNumberVsAI({ onBackToMenu }: TerritoryNumberVsAIProps) {
  const { language } = useGameLanguage();
  const s = getTerritoryNumberStrings(language);

  const [phase, setPhase] = useState<'setup' | 'playing'>('setup');
  const [difficulty, setDifficulty] = useState<AIDifficulty>('medium');
  const [firstRule, setFirstRule] = useState<FirstPlayerRule>('host');
  const [infoOpen, setInfoOpen] = useState(false);

  const humanSlot: PlayerSlot = 'p1'; // human is always p1 (blue); AI is p2 (red).
  const aiSlot: PlayerSlot = 'p2';
  const [board, setBoard] = useState<Board>(emptyBoard());
  const [currentTurn, setCurrentTurn] = useState<PlayerSlot>('p1');
  const [selectedCard, setSelectedCard] = useState<number | null>(null);

  // Pending AI move handle, so we can cancel on unmount or leave.
  const aiTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearAiTimer = useCallback(() => {
    if (aiTimerRef.current !== null) {
      clearTimeout(aiTimerRef.current);
      aiTimerRef.current = null;
    }
  }, []);
  useEffect(() => clearAiTimer, [clearAiTimer]);

  const evaluation = useMemo(() => evaluateBoard(board), [board]);
  const remaining = useMemo(() => remainingCards(board), [board]);
  const matchOutcome = useMemo(() => evaluateMatch(board), [board]);
  const finished = matchOutcome !== undefined;

  const myLabel = s.you;
  const difficultyLabel = difficulty === 'easy' ? s.easy : difficulty === 'medium' ? s.medium : s.hard;
  const opponentLabel = `AI · ${difficultyLabel}`;

  // Drive the AI when it's its turn.
  useEffect(() => {
    if (phase !== 'playing') return;
    if (finished) return;
    if (currentTurn !== aiSlot) return;
    clearAiTimer();
    aiTimerRef.current = setTimeout(() => {
      // Re-check before mutating: state may have moved on (unmount, Leave, etc.)
      // while the timer was pending.
      if (isBoardFull(board)) return;
      const move = pickAIMove(difficulty, board, aiSlot);
      const next = placeCard(board, move.cellIndex, move.card, aiSlot);
      setBoard(next);
      setCurrentTurn(humanSlot);
      aiTimerRef.current = null;
    }, AI_THINK_MS);
  }, [phase, finished, currentTurn, aiSlot, board, difficulty, humanSlot, clearAiTimer]);

  const startMatch = useCallback(() => {
    const first = pickFirstPlayer(firstRule);
    setBoard(emptyBoard());
    setCurrentTurn(first);
    setSelectedCard(null);
    setPhase('playing');
    clearAiTimer();
  }, [firstRule, clearAiTimer]);

  const handleSelectCard = useCallback((card: number) => {
    setSelectedCard(prev => (prev === card ? null : card));
  }, []);

  const handlePlaceOnCell = useCallback((cellIndex: number) => {
    if (selectedCard === null) return;
    if (currentTurn !== humanSlot) return;
    if (board[cellIndex].value !== null) return;
    if (!remaining.includes(selectedCard)) return;

    const next = placeCard(board, cellIndex, selectedCard, humanSlot);
    setBoard(next);
    setSelectedCard(null);
    setCurrentTurn(aiSlot);
  }, [selectedCard, currentTurn, humanSlot, board, remaining, aiSlot]);

  const handleLeave = useCallback(() => {
    clearAiTimer();
    setPhase('setup');
  }, [clearAiTimer]);

  const finalMessage = useMemo(() => {
    if (matchOutcome === undefined) return null;
    if (matchOutcome === humanSlot) return s.youWon;
    if (matchOutcome === aiSlot) return s.aiWon;
    return s.draw;
  }, [matchOutcome, humanSlot, aiSlot, s]);

  const statusText = useMemo(() => {
    if (finished) return null;
    if (currentTurn === humanSlot) {
      if (selectedCard === null) return s.pickCard;
      return s.tapToPlace(selectedCard);
    }
    return s.aiThinking;
  }, [finished, currentTurn, humanSlot, selectedCard, s]);

  const tablePhase: Phase = finished ? 'finished'
    : currentTurn === humanSlot ? 'your-turn' : 'opponent-turn';

  const infoButton = (
    <button
      type="button"
      onClick={() => setInfoOpen(true)}
      className={styles.ghostButton}
      aria-label={s.howToPlayTitle}
    >
      <Info size={16} aria-hidden />
      <span>{s.howToPlayTitle}</span>
    </button>
  );

  const infoModal = (
    <InfoModal isOpen={infoOpen} onClose={() => setInfoOpen(false)} title={s.strategyTitle}>
      <ol className={styles.modalList}>
        {s.strategyBody.map((line, i) => <li key={i}>{line}</li>)}
      </ol>
      <div className={styles.legend}>
        <span className={styles.legendItem}>
          <span className={styles.legendSwatch} style={{ background: '#2563eb' }} />
          {s.legendYou}
        </span>
        <span className={styles.legendItem}>
          <span className={styles.legendSwatch} style={{ background: '#ef4444' }} />
          {s.legendAi}
        </span>
        <span className={styles.legendItem}>
          <span className={styles.legendSwatch} style={{ background: '#94a3b8' }} />
          {s.legendTie}
        </span>
      </div>
    </InfoModal>
  );

  // ---- Setup screen ----
  if (phase === 'setup') {
    const difficultyOptions: Array<{ value: AIDifficulty; label: string; desc: string }> = [
      { value: 'easy', label: s.easy, desc: s.easyDesc },
      { value: 'medium', label: s.medium, desc: s.mediumDesc },
      { value: 'hard', label: s.hard, desc: s.hardDesc },
    ];
    const firstOptions: Array<{ value: FirstPlayerRule; label: string }> = [
      { value: 'host', label: s.firstMoveYou },
      { value: 'guest', label: s.firstMoveAi },
      { value: 'random', label: s.firstMoveRandom },
    ];

    return (
      <div className={styles.screen}>
        <div className={styles.header}>
          <button type="button" onClick={onBackToMenu} className={styles.ghostButton}>
            ← {s.modeSelect}
          </button>
          <span className={styles.headerTitle}>{s.vsAi}</span>
          {infoButton}
        </div>

        <div className={styles.setupScroll}>
          <div className={styles.setupCard}>
            <div className={styles.setupHero}>
              <span className={styles.setupIcon}>🎯</span>
              <div>
                <h1 className={styles.setupTitle}>{language === 'ja' ? '陣取り数字' : 'Territory Number'}</h1>
                <p className={styles.setupSubtitle}>{s.setupHint}</p>
              </div>
            </div>

            <div>
              <div className={styles.sectionKicker}>{s.gameSetup}</div>
              <h2 className={styles.sectionTitle}>{s.aiDifficulty}</h2>
              <div className={styles.optionGrid}>
                {difficultyOptions.map(o => {
                  const colors = getDifficultyColor(o.value);
                  const selected = difficulty === o.value;
                  return (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => setDifficulty(o.value)}
                      className={styles.optionButton}
                      data-selected={selected ? 'true' : 'false'}
                      aria-pressed={selected}
                      style={{
                        ['--opt-border' as string]: colors.border,
                        ['--opt-bg' as string]: colors.bg,
                        ['--opt-text' as string]: colors.text,
                      } as React.CSSProperties}
                    >
                      <span className={styles.optionLabel}>{o.label}</span>
                      <span className={styles.optionDesc}>{o.desc}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <h2 className={styles.sectionTitle}>{s.firstMove}</h2>
              <div className={styles.pillRow}>
                {firstOptions.map(o => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => setFirstRule(o.value)}
                    className={`${styles.pill} ${firstRule === o.value ? styles.pillActive : ''}`}
                    aria-pressed={firstRule === o.value}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            <button type="button" onClick={startMatch} className={styles.primaryButton}>
              {s.startMatch}
            </button>
          </div>
        </div>
        {infoModal}
      </div>
    );
  }

  return (
    <>
      <TerritoryNumberBoard
        board={board}
        remainingCards={remaining}
        selectedCard={selectedCard}
        mySlot={humanSlot}
        myLabel={myLabel}
        opponentLabel={opponentLabel}
        evaluation={evaluation}
        phase={tablePhase}
        finalMessage={finalMessage}
        statusText={statusText}
        onSelectCard={handleSelectCard}
        onPlaceOnCell={handlePlaceOnCell}
        onLeave={handleLeave}
        onPlayAgain={startMatch}
        headerExtra={infoButton}
        language={language}
      />
      {infoModal}
    </>
  );
}
