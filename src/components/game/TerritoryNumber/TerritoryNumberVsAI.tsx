/**
 * Territory Number — VS AI mode.
 * Pure local state machine; no networking.
 */

'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

interface TerritoryNumberVsAIProps {
  onBackToMenu: () => void;
}

const AI_THINK_MS = 600;

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
  const ja = language === 'ja';

  const [phase, setPhase] = useState<'setup' | 'playing'>('setup');
  const [difficulty, setDifficulty] = useState<AIDifficulty>('medium');
  const [firstRule, setFirstRule] = useState<FirstPlayerRule>('host');

  const [humanSlot, setHumanSlot] = useState<PlayerSlot>('p1');
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

  const aiSlot: PlayerSlot = humanSlot === 'p1' ? 'p2' : 'p1';

  const evaluation = useMemo(() => evaluateBoard(board), [board]);
  const remaining = useMemo(() => remainingCards(board), [board]);
  const matchOutcome = useMemo(() => evaluateMatch(board), [board]);
  const finished = matchOutcome !== undefined;

  const myLabel = ja ? 'あなた' : 'You';
  const opponentLabel = ja ? `AI (${difficulty})` : `AI (${difficulty})`;

  // Drive the AI when it's its turn.
  useEffect(() => {
    if (phase !== 'playing') return;
    if (finished) return;
    if (currentTurn !== aiSlot) return;
    clearAiTimer();
    aiTimerRef.current = setTimeout(() => {
      // Re-check before mutating: state may have moved on (component unmount,
      // user pressed Leave, etc.) while the timer was pending.
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
    setHumanSlot('p1'); // human is always p1 visually; AI is p2.
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
    onBackToMenu();
  }, [clearAiTimer, onBackToMenu]);

  // Final message
  const finalMessage = useMemo(() => {
    if (matchOutcome === undefined) return null;
    if (matchOutcome === humanSlot) return ja ? '🎉 あなたの勝利！' : '🎉 You won the match!';
    if (matchOutcome === aiSlot) return ja ? '😢 AIの勝利' : '😢 AI won the match';
    return ja ? '🤝 引き分け' : '🤝 Draw';
  }, [matchOutcome, humanSlot, aiSlot, ja]);

  const statusText = useMemo(() => {
    if (finished) return null;
    if (currentTurn === humanSlot) {
      if (selectedCard === null) return ja ? 'カードを1枚選んでください' : 'Pick a card';
      return ja ? `${selectedCard} を置くマスをタップ` : `Tap a cell to place ${selectedCard}`;
    }
    return ja ? 'AIが考えています...' : 'AI is thinking...';
  }, [finished, currentTurn, humanSlot, selectedCard, ja]);

  const tablePhase: Phase = finished ? 'finished'
    : currentTurn === humanSlot ? 'your-turn' : 'opponent-turn';

  // ---- Setup screen ----
  if (phase === 'setup') {
    return (
      <div style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        background: 'linear-gradient(to bottom, #020617, #0f172a)',
        color: '#f8fafc',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        overflow: 'auto',
        padding: '1.25rem',
        gap: '1rem',
      }}>
        <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button
            onClick={onBackToMenu}
            style={{
              padding: '0.4rem 0.9rem',
              background: 'transparent',
              border: '1px solid rgba(148, 163, 184, 0.35)',
              color: '#cbd5e1',
              borderRadius: '0.5rem',
              fontWeight: 700,
              cursor: 'pointer',
              fontSize: '0.85rem',
            }}
          >
            ← {ja ? 'モード選択' : 'Mode select'}
          </button>
          <div style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
            {ja ? 'AI対戦' : 'VS AI'}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', marginTop: '1rem' }}>
          <h2 style={{ margin: 0, color: '#fbbf24', fontSize: '1.5rem' }}>
            {ja ? 'AI 難易度' : 'AI difficulty'}
          </h2>
          <Pillset
            options={[
              { value: 'easy', label: ja ? '弱い' : 'Easy' },
              { value: 'medium', label: ja ? '普通' : 'Medium' },
              { value: 'hard', label: ja ? '強い' : 'Hard' },
            ]}
            value={difficulty}
            onChange={setDifficulty}
          />

          <h2 style={{ margin: '0.5rem 0 0', color: '#fbbf24', fontSize: '1.25rem' }}>
            {ja ? '先手' : 'First move'}
          </h2>
          <Pillset
            options={[
              { value: 'host', label: ja ? 'あなた' : 'You' },
              { value: 'guest', label: 'AI' },
              { value: 'random', label: ja ? 'ランダム' : 'Random' },
            ]}
            value={firstRule}
            onChange={setFirstRule}
          />

          <button
            onClick={startMatch}
            style={{
              marginTop: '1rem',
              padding: '0.7rem 2rem',
              background: '#2563eb',
              border: 'none',
              borderRadius: '0.65rem',
              color: '#fff',
              fontWeight: 800,
              fontSize: '1rem',
              cursor: 'pointer',
            }}
          >
            {ja ? '対戦開始' : 'Start match'}
          </button>

          <p style={{ margin: '1rem 0 0', maxWidth: '34rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem', lineHeight: 1.6 }}>
            {ja
              ? '中央マスは4ライン、コーナーは3ライン、辺は2ライン。9を温存するか早めに通すか、読み合おう。'
              : 'Centre cell hits 4 lines, corners 3, edges 2. When to spend your 9 and when to save it — read your opponent.'}
          </p>
        </div>
      </div>
    );
  }

  return (
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
      language={language}
    />
  );
}

interface PillsetOption<T extends string> {
  value: T;
  label: string;
}

function Pillset<T extends string>({
  options, value, onChange,
}: {
  options: PillsetOption<T>[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'center' }}>
      {options.map(o => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            style={{
              padding: '0.5rem 1.1rem',
              background: active ? '#16a34a' : 'transparent',
              border: `1px solid ${active ? '#22c55e' : 'rgba(148, 163, 184, 0.35)'}`,
              color: active ? '#fff' : '#cbd5e1',
              borderRadius: '999px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
