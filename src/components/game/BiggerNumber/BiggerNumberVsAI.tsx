/**
 * Bigger Number — VS AI mode.
 * Pure local state machine; no networking.
 */

'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BiggerNumberTable, type RoundPhase, type RevealWinner } from './BiggerNumberTable';
import { RuleConfigEditor } from './RuleConfigEditor';
import {
  pickAICard,
  createOpponentModel,
  observeOpponentPlay,
  type MatchContext,
} from './BiggerNumberAI';
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
import { getStrings } from './i18n';
import styles from './BiggerNumberVsAI.module.css';

interface BiggerNumberVsAIProps {
  onBackToMenu: () => void;
}

const REVEAL_DELAY_MS = 750;
const BETWEEN_DELAY_MS = 1500;

const HUMAN_ID = 'you';
const AI_ID = 'ai';

const DIFFICULTIES: AIDifficulty[] = ['easy', 'medium', 'hard', 'master'];

function describeResult(
  language: 'ja' | 'en',
  result: {
    youCard: CardValue;
    aiCard: CardValue;
    winnerId: string | null;
    cardsReturnedToHand: boolean;
  },
): string {
  const t = getStrings(language);
  const y = cardLabel(result.youCard);
  const a = cardLabel(result.aiCard);
  const vs = `${y} vs ${a} — `;
  if (result.winnerId === HUMAN_ID) return vs + t.youWinRound;
  if (result.winnerId === AI_ID) return vs + t.aiWinRound;
  if (result.cardsReturnedToHand) return vs + t.tieReturned;
  return vs + t.tie;
}

export function BiggerNumberVsAI({ onBackToMenu }: BiggerNumberVsAIProps) {
  const { language } = useGameLanguage();
  const t = getStrings(language);

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
  const [revealWinner, setRevealWinner] = useState<RevealWinner>(null);
  const [lastResultText, setLastResultText] = useState<string | null>(null);
  const [finalMessage, setFinalMessage] = useState<string | null>(null);

  // The master AI's opponent model. It describes the human, not the AI tier,
  // so it persists across matches and difficulty changes for as long as the
  // component is mounted (i.e. it keeps learning across "play again").
  const opponentModelRef = useRef(createOpponentModel());

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
    setRevealWinner(null);
    setLastResultText(null);
    setFinalMessage(null);
  }, [clearPendingTimeouts]);

  const handleStart = useCallback(() => {
    resetMatch();
    setPhase('playing');
  }, [resetMatch]);

  const handlePickCard = useCallback(
    (card: CardValue) => {
      if (roundPhase !== 'picking') return;

      setYouPick(card);

      // Give the hard AI the match context it needs to value future rounds.
      const context: MatchContext = {
        myWinsNeeded: Math.max(1, rules.winsToWin - aiWins),
        oppWinsNeeded: Math.max(1, rules.winsToWin - youWins),
        roundsLeft: Math.max(1, rules.totalRounds - (round - 1)),
      };
      const aiDecision = pickAICard(
        difficulty,
        rules,
        aiHand,
        youHand,
        context,
        Math.random,
        opponentModelRef.current,
      );
      // Record the human's reveal AFTER the AI has committed its own card
      // (simultaneous play — this round's pick must not leak into this
      // round's decision), so the master tier can learn for future rounds.
      observeOpponentPlay(opponentModelRef.current, rules, youHand, card, {
        oppWins: youWins,
        myWins: aiWins,
      });
      setAiPick(aiDecision.card);
      setRoundPhase('revealing');

      const revealId = setTimeout(() => {
        setYouReveal(card);
        setAiReveal(aiDecision.card);

        const result = resolveRound(rules, card, aiDecision.card);
        const winnerId =
          result.outcome === 'p1' ? HUMAN_ID : result.outcome === 'p2' ? AI_ID : null;
        setRevealWinner(
          winnerId === HUMAN_ID ? 'you' : winnerId === AI_ID ? 'opponent' : 'tie',
        );

        // Compute next state, then animate the between-rounds pause.
        const nextYouWins = winnerId === HUMAN_ID ? youWins + 1 : youWins;
        const nextAiWins = winnerId === AI_ID ? aiWins + 1 : aiWins;

        const nextYouHand = result.cardsReturnedToHand
          ? youHand
          : removeCard(youHand, card);
        const nextAiHand = result.cardsReturnedToHand
          ? aiHand
          : removeCard(aiHand, aiDecision.card);

        const roundsPlayed = result.cardsReturnedToHand ? round - 1 : round;

        setLastResultText(
          describeResult(language, {
            youCard: card,
            aiCard: aiDecision.card,
            winnerId,
            cardsReturnedToHand: result.cardsReturnedToHand,
          }),
        );

        const advanceId = setTimeout(() => {
          setYouHand(nextYouHand);
          setAiHand(nextAiHand);
          setYouWins(nextYouWins);
          setAiWins(nextAiWins);

          // Match also ends if either side runs out of cards.
          const outOfCards = nextYouHand.length === 0 || nextAiHand.length === 0;
          let winner = evaluateMatch(
            rules,
            { p1Wins: nextYouWins, p2Wins: nextAiWins },
            roundsPlayed,
            { p1: HUMAN_ID, p2: AI_ID },
          );
          if (winner === undefined && outOfCards) {
            winner =
              nextYouWins > nextAiWins
                ? HUMAN_ID
                : nextAiWins > nextYouWins
                  ? AI_ID
                  : null;
          }

          if (winner !== undefined) {
            setRoundPhase('finished');
            setFinalMessage(
              winner === HUMAN_ID
                ? t.matchYouWin
                : winner === AI_ID
                  ? t.matchAiWin
                  : t.matchDraw,
            );
            return;
          }

          setYouPick(null);
          setAiPick(null);
          setYouReveal(null);
          setAiReveal(null);
          setRevealWinner(null);
          setRoundPhase('picking');
          if (!result.cardsReturnedToHand) {
            setRound((r) => r + 1);
          }
        }, BETWEEN_DELAY_MS);
        pendingTimeoutsRef.current.push(advanceId);

        setRoundPhase('between-rounds');
      }, REVEAL_DELAY_MS);
      pendingTimeoutsRef.current.push(revealId);
    },
    [roundPhase, rules, difficulty, aiHand, youHand, youWins, aiWins, round, language, t],
  );

  const handleLeave = useCallback(() => {
    clearPendingTimeouts();
    onBackToMenu();
  }, [clearPendingTimeouts, onBackToMenu]);

  if (phase === 'setup') {
    return (
      <div className={styles.setupRoot}>
        <div className={styles.setupHeader}>
          <button className={styles.backBtn} onClick={onBackToMenu} type="button">
            ← {t.modeSelect}
          </button>
          <span className={styles.setupKicker}>{t.vsAi}</span>
        </div>

        <div className={styles.setupCard}>
          <div className={styles.setupIcon} aria-hidden="true">
            🀄
          </div>
          <h2 className={styles.setupTitle}>{t.difficulty}</h2>

          <div className={styles.diffGrid} role="radiogroup" aria-label={t.difficulty}>
            {DIFFICULTIES.map((d) => {
              const selected = difficulty === d;
              return (
                <button
                  key={d}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setDifficulty(d)}
                  className={`${styles.diffBtn} ${selected ? styles.diffBtnActive : ''}`}
                  data-level={d}
                >
                  <span className={styles.diffLabel}>{t.difficultyLabels[d]}</span>
                  <span className={styles.diffDesc}>{t.difficultyDescriptions[d]}</span>
                </button>
              );
            })}
          </div>

          <RuleConfigEditor rules={rules} onChange={setRules} language={language} />

          <button className={styles.startBtn} onClick={handleStart} type="button">
            ▶ {t.startMatch}
          </button>

          <div className={styles.rulesBox}>
            <div className={styles.rulesHeading}>{t.rulesHeading}</div>
            <ul className={styles.rulesList}>
              {t.ruleLines.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    );
  }

  return (
    <BiggerNumberTable
      youLabel={t.you}
      opponentLabel={`AI · ${t.difficultyLabels[difficulty]}`}
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
      revealWinner={revealWinner}
      lastResultText={lastResultText}
      finalMessage={finalMessage}
      onPickCard={handlePickCard}
      onLeave={handleLeave}
      onPlayAgain={handleStart}
      language={language}
    />
  );
}
