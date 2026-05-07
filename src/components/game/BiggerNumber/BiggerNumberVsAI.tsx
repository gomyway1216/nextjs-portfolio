/**
 * Bigger Number — VS AI mode.
 * Pure local state machine; no networking.
 */

'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BiggerNumberTable, type RoundPhase } from './BiggerNumberTable';
import { RuleConfigEditor } from './RuleConfigEditor';
import { pickAICard } from './BiggerNumberAI';
import {
  freshHand,
  removeCard,
  resolveRound,
  evaluateMatch,
  cardLabel,
} from './gameLogic';
import type { AIDifficulty, BiggerNumberRules, CardValue } from './types';
import { DEFAULT_RULES } from './types';
import { useGameLanguage } from '../contexts/GameLanguageContext';

interface BiggerNumberVsAIProps {
  onBackToMenu: () => void;
}

const REVEAL_DELAY_MS = 800;
const BETWEEN_DELAY_MS = 1400;

const HUMAN_ID = 'you';
const AI_ID = 'ai';

function describeResult(
  ja: boolean,
  result: { youCard: CardValue; aiCard: CardValue; winnerId: string | null; cardsReturnedToHand: boolean }
): string {
  const yourLabel = cardLabel(result.youCard);
  const aiLabel = cardLabel(result.aiCard);

  if (result.winnerId === HUMAN_ID) {
    return ja ? `${yourLabel} vs ${aiLabel} — あなたの勝ち！` : `${yourLabel} vs ${aiLabel} — You win!`;
  }
  if (result.winnerId === AI_ID) {
    return ja ? `${yourLabel} vs ${aiLabel} — AIの勝ち` : `${yourLabel} vs ${aiLabel} — AI wins`;
  }
  if (result.cardsReturnedToHand) {
    return ja
      ? `${yourLabel} vs ${aiLabel} — 引き分け、カードを戻します`
      : `${yourLabel} vs ${aiLabel} — Tie, cards returned`;
  }
  return ja
    ? `${yourLabel} vs ${aiLabel} — 引き分け`
    : `${yourLabel} vs ${aiLabel} — Tie`;
}

export function BiggerNumberVsAI({ onBackToMenu }: BiggerNumberVsAIProps) {
  const { language } = useGameLanguage();
  const ja = language === 'ja';

  const [phase, setPhase] = useState<'setup' | 'playing'>('setup');
  const [rules, setRules] = useState<BiggerNumberRules>({ ...DEFAULT_RULES });
  const [difficulty, setDifficulty] = useState<AIDifficulty>('medium');

  const [youHand, setYouHand] = useState<CardValue[]>(freshHand());
  const [aiHand, setAiHand] = useState<CardValue[]>(freshHand());
  const [youWins, setYouWins] = useState(0);
  const [aiWins, setAiWins] = useState(0);
  const [round, setRound] = useState(1);

  const [youPick, setYouPick] = useState<CardValue | null>(null);
  const [aiPick, setAiPick] = useState<CardValue | null>(null);
  const [youReveal, setYouReveal] = useState<CardValue | null>(null);
  const [aiReveal, setAiReveal] = useState<CardValue | null>(null);

  const [roundPhase, setRoundPhase] = useState<RoundPhase>('picking');
  const [lastResultText, setLastResultText] = useState<string | null>(null);
  const [finalMessage, setFinalMessage] = useState<string | null>(null);

  // Track scheduled round-progression timeouts so we can cancel them on
  // unmount (or when the user leaves mid-reveal) and avoid setting state
  // on an unmounted component.
  const pendingTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const clearPendingTimeouts = useCallback(() => {
    for (const id of pendingTimeoutsRef.current) clearTimeout(id);
    pendingTimeoutsRef.current = [];
  }, []);
  useEffect(() => clearPendingTimeouts, [clearPendingTimeouts]);

  const resetMatch = useCallback(() => {
    clearPendingTimeouts();
    setYouHand(freshHand());
    setAiHand(freshHand());
    setYouWins(0);
    setAiWins(0);
    setRound(1);
    setYouPick(null);
    setAiPick(null);
    setYouReveal(null);
    setAiReveal(null);
    setRoundPhase('picking');
    setLastResultText(null);
    setFinalMessage(null);
  }, []);

  const handleStart = useCallback(() => {
    resetMatch();
    setPhase('playing');
  }, [resetMatch]);

  const handlePickCard = useCallback((card: CardValue) => {
    if (roundPhase !== 'picking') return;

    setYouPick(card);
    const aiDecision = pickAICard(difficulty, rules, aiHand, youHand);
    setAiPick(aiDecision.card);
    setRoundPhase('revealing');

    const revealId = setTimeout(() => {
      setYouReveal(card);
      setAiReveal(aiDecision.card);

      const result = resolveRound(rules, card, aiDecision.card);
      const winnerId = result.outcome === 'p1' ? HUMAN_ID : result.outcome === 'p2' ? AI_ID : null;

      // Update scores immediately, then animate the between-rounds pause.
      const nextYouWins = winnerId === HUMAN_ID ? youWins + 1 : youWins;
      const nextAiWins = winnerId === AI_ID ? aiWins + 1 : aiWins;

      const nextYouHand = result.cardsReturnedToHand ? youHand : removeCard(youHand, card);
      const nextAiHand = result.cardsReturnedToHand ? aiHand : removeCard(aiHand, aiDecision.card);

      const roundsPlayed = result.cardsReturnedToHand ? round - 1 : round;

      setLastResultText(describeResult(ja, {
        youCard: card,
        aiCard: aiDecision.card,
        winnerId,
        cardsReturnedToHand: result.cardsReturnedToHand,
      }));

      const advanceId = setTimeout(() => {
        setYouHand(nextYouHand);
        setAiHand(nextAiHand);
        setYouWins(nextYouWins);
        setAiWins(nextAiWins);

        const winner = evaluateMatch(
          rules,
          { p1Wins: nextYouWins, p2Wins: nextAiWins },
          roundsPlayed,
          { p1: HUMAN_ID, p2: AI_ID },
        );

        if (winner !== undefined) {
          setRoundPhase('finished');
          setFinalMessage(
            winner === HUMAN_ID
              ? (ja ? '🎉 あなたの勝利！' : '🎉 You won the match!')
              : winner === AI_ID
              ? (ja ? '😢 AIの勝利' : '😢 AI won the match')
              : (ja ? '🤝 引き分け' : '🤝 Draw'),
          );
          return;
        }

        setYouPick(null);
        setAiPick(null);
        setYouReveal(null);
        setAiReveal(null);
        setRoundPhase('picking');
        if (!result.cardsReturnedToHand) {
          setRound(r => r + 1);
        }
      }, BETWEEN_DELAY_MS);
      pendingTimeoutsRef.current.push(advanceId);

      setRoundPhase('between-rounds');
    }, REVEAL_DELAY_MS);
    pendingTimeoutsRef.current.push(revealId);
  }, [roundPhase, rules, difficulty, aiHand, youHand, youWins, aiWins, round, ja]);

  const handleLeave = useCallback(() => {
    clearPendingTimeouts();
    onBackToMenu();
  }, [clearPendingTimeouts, onBackToMenu]);

  if (phase === 'setup') {
    return (
      <div style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start',
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

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.85rem', marginTop: '1rem' }}>
          <h2 style={{ margin: 0, color: '#fbbf24', fontSize: '1.5rem' }}>
            {ja ? 'AI 難易度' : 'AI difficulty'}
          </h2>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {(['easy', 'medium', 'hard'] as AIDifficulty[]).map(d => (
              <button
                key={d}
                onClick={() => setDifficulty(d)}
                style={{
                  padding: '0.5rem 1.1rem',
                  background: difficulty === d ? '#16a34a' : 'transparent',
                  border: `1px solid ${difficulty === d ? '#22c55e' : 'rgba(148, 163, 184, 0.35)'}`,
                  color: difficulty === d ? '#fff' : '#cbd5e1',
                  borderRadius: '999px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {ja
                  ? d === 'easy' ? '弱い' : d === 'medium' ? '普通' : '強い'
                  : d.charAt(0).toUpperCase() + d.slice(1)}
              </button>
            ))}
          </div>

          <RuleConfigEditor rules={rules} onChange={setRules} language={language} />

          <button
            onClick={handleStart}
            style={{
              marginTop: '0.5rem',
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
        </div>
      </div>
    );
  }

  return (
    <BiggerNumberTable
      youLabel={ja ? 'あなた' : 'You'}
      opponentLabel={ja ? `AI (${difficulty})` : `AI (${difficulty})`}
      yourHand={youHand}
      opponentHandCount={aiHand.length}
      yourWins={youWins}
      opponentWins={aiWins}
      round={round}
      totalRounds={rules.totalRounds}
      winsToWin={rules.winsToWin}
      yourPick={youPick}
      opponentPickCount={aiPick != null ? 1 : 0}
      yourPickShown={youReveal}
      opponentPickShown={aiReveal}
      phase={roundPhase}
      lastResultText={lastResultText}
      finalMessage={finalMessage}
      onPickCard={handlePickCard}
      onLeave={handleLeave}
      onPlayAgain={handleStart}
      language={language}
    />
  );
}
