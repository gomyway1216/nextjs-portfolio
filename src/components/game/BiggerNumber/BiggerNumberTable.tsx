/**
 * Bigger Number — game table view.
 *
 * Pure presentational + interaction layer. The parent (AI mode or Online mode)
 * owns the state machine and passes everything in via props.
 */

'use client';

import React from 'react';
import type { CardValue } from './types';
import { cardLabel, isDragon } from './gameLogic';
import { getStrings } from './i18n';
import styles from './BiggerNumberTable.module.css';

export type RoundPhase =
  | 'picking'
  | 'waiting-opponent'
  | 'revealing'
  | 'between-rounds'
  | 'finished';

/** Which side (if any) took the round that is currently being shown. */
export type RevealWinner = 'you' | 'opponent' | 'tie' | null;

interface BiggerNumberTableProps {
  // Identities
  youLabel: string;
  opponentLabel: string;
  // Hands
  yourHand: CardValue[];
  opponentHandCount: number;
  // Score & round
  yourWins: number;
  opponentWins: number;
  round: number;
  totalRounds: number;
  winsToWin: number;
  // Picks
  yourPick: CardValue | null;
  opponentPickCount: number; // 0 or 1 — whether opponent has locked in
  yourPickShown: CardValue | null; // null while hidden, set during reveal
  opponentPickShown: CardValue | null; // null while hidden, set during reveal
  // Phase / messaging
  phase: RoundPhase;
  revealWinner?: RevealWinner;
  lastResultText: string | null;
  finalMessage: string | null;
  // Callbacks
  onPickCard: (card: CardValue) => void;
  onLeave: () => void;
  onPlayAgain?: () => void; // shown only when finished
  language: 'en' | 'ja';
}

type CardSize = 'small' | 'medium' | 'large';

const SIZES: Record<CardSize, { w: number; h: number; font: string }> = {
  small: { w: 40, h: 56, font: '1.25rem' },
  medium: { w: 62, h: 88, font: '2.2rem' },
  large: { w: 92, h: 130, font: '3.4rem' },
};

interface CardFaceOpts {
  facedown?: boolean;
  size?: CardSize;
  animate?: boolean;
}

function CardFace({ card, opts = {} }: { card: CardValue; opts?: CardFaceOpts }) {
  const { facedown, size = 'large', animate } = opts;
  const dim = SIZES[size];

  if (facedown) {
    return (
      <div
        aria-hidden="true"
        style={{
          width: dim.w,
          height: dim.h,
          borderRadius: '0.55rem',
          background:
            'repeating-linear-gradient(135deg, #1e293b 0 8px, #172033 8px 16px)',
          border: '1px solid rgba(148, 163, 184, 0.35)',
          boxShadow:
            '0 6px 14px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(148, 163, 184, 0.15)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'rgba(148, 163, 184, 0.65)',
          fontSize: size === 'small' ? '0.85rem' : '1.5rem',
          fontWeight: 800,
        }}
      >
        ?
      </div>
    );
  }

  const dragon = isDragon(card);
  return (
    <div
      className={animate ? styles.revealAnim : undefined}
      style={{
        width: dim.w,
        height: dim.h,
        borderRadius: '0.55rem',
        background: dragon
          ? 'linear-gradient(135deg, #1e293b, #0b1220)'
          : 'linear-gradient(135deg, #ffffff, #e8eef7)',
        border: dragon
          ? '2px solid rgba(251, 191, 36, 0.9)'
          : '1px solid rgba(148, 163, 184, 0.5)',
        boxShadow: dragon
          ? '0 6px 16px rgba(251,191,36,0.25), 0 6px 14px rgba(0,0,0,0.45)'
          : '0 6px 14px rgba(0, 0, 0, 0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: dragon ? '#fbbf24' : '#0f172a',
        fontSize: dim.font,
        fontWeight: 900,
        fontFamily: dragon ? 'serif' : 'system-ui, sans-serif',
      }}
    >
      {cardLabel(card)}
    </div>
  );
}

function Pips({ count, target, side }: { count: number; target: number; side: 'you' | 'opp' }) {
  return (
    <span className={styles.pips} aria-hidden="true">
      {Array.from({ length: target }).map((_, i) => (
        <span
          key={i}
          className={`${styles.pip} ${
            i < count ? (side === 'you' ? styles.pipYouOn : styles.pipOppOn) : ''
          }`}
        />
      ))}
    </span>
  );
}

export function BiggerNumberTable(props: BiggerNumberTableProps) {
  const {
    youLabel,
    opponentLabel,
    yourHand,
    opponentHandCount,
    yourWins,
    opponentWins,
    round,
    totalRounds,
    winsToWin,
    yourPick,
    opponentPickCount,
    yourPickShown,
    opponentPickShown,
    phase,
    revealWinner = null,
    lastResultText,
    finalMessage,
    onPickCard,
    onLeave,
    onPlayAgain,
    language,
  } = props;

  const t = getStrings(language);
  const canPick = phase === 'picking';
  const showingReveal = phase === 'between-rounds' || phase === 'finished';

  const arenaStateClass =
    showingReveal && revealWinner === 'you'
      ? styles.arenaWinYou
      : showingReveal && revealWinner === 'opponent'
        ? styles.arenaWinOpp
        : phase === 'revealing'
          ? styles.arenaHot
          : '';

  const opponentCards = Array.from({ length: opponentHandCount });

  return (
    <div className={styles.root}>
      {/* Header */}
      <div className={styles.header}>
        <button className={styles.leaveBtn} onClick={onLeave} aria-label={t.leave}>
          ← {t.leave}
        </button>
        <div className={styles.roundMeta}>
          <span className={styles.roundMetaMain}>
            {t.round} {round} / {totalRounds}
          </span>
          <span className={styles.roundMetaSub}>{t.target(winsToWin)}</span>
        </div>
        <div style={{ minWidth: '5rem' }} aria-hidden="true" />
      </div>

      {/* Opponent panel */}
      <div className={styles.section}>
        <div className={styles.paneLabelRow}>
          <span className={styles.paneName}>{opponentLabel}</span>
          <span className={`${styles.scorePill} ${styles.scorePillOpp}`} aria-label={`${opponentLabel} ${t.wins} ${opponentWins}`}>
            {t.wins} {opponentWins}
            <Pips count={opponentWins} target={winsToWin} side="opp" />
          </span>
          {opponentPickCount > 0 && phase !== 'revealing' && !showingReveal && (
            <span className={styles.lockedTag}>✓ {t.locking}</span>
          )}
        </div>
        <div className={styles.oppHand}>
          {opponentCards.map((_, idx) => (
            <CardFace key={idx} card={0} opts={{ facedown: true, size: 'small' }} />
          ))}
          {opponentHandCount === 0 && (
            <span className={styles.roundMetaSub}>{t.noCardsLeft}</span>
          )}
        </div>
      </div>

      {/* Center stage */}
      <div className={styles.stage}>
        <div
          className={`${styles.arena} ${arenaStateClass}`}
          role="group"
          aria-label={t.scoreboard}
        >
          <div className={styles.slot}>
            <div className={styles.slotLabel}>{opponentLabel}</div>
            {opponentPickShown != null ? (
              <CardFace
                card={opponentPickShown}
                opts={{ animate: showingReveal, size: 'large' }}
              />
            ) : opponentPickCount > 0 ? (
              <CardFace card={0} opts={{ facedown: true, size: 'large' }} />
            ) : (
              <EmptySlot />
            )}
          </div>
          <div className={styles.vs}>VS</div>
          <div className={styles.slot}>
            <div className={styles.slotLabel}>{t.you}</div>
            {yourPickShown != null ? (
              <CardFace
                card={yourPickShown}
                opts={{ animate: showingReveal, size: 'large' }}
              />
            ) : yourPick != null ? (
              <CardFace card={0} opts={{ facedown: true, size: 'large' }} />
            ) : (
              <EmptySlot />
            )}
          </div>
        </div>

        <div className={styles.statusLine} role="status" aria-live="polite">
          {phase === 'picking' && <span className={styles.statusPrompt}>{t.pickPrompt}</span>}
          {phase === 'waiting-opponent' && (
            <span className={styles.statusMuted}>{t.aiThinking}</span>
          )}
          {phase === 'revealing' && <span className={styles.statusReveal}>{t.reveal}</span>}
          {phase === 'between-rounds' && lastResultText && (
            <span
              className={
                revealWinner === 'you'
                  ? styles.statusWin
                  : revealWinner === 'opponent'
                    ? styles.statusLose
                    : styles.statusTie
              }
            >
              {lastResultText}
            </span>
          )}
          {phase === 'finished' && finalMessage && (
            <span className={styles.statusFinal}>{finalMessage}</span>
          )}
        </div>
      </div>

      {/* Your hand */}
      <div className={styles.handSection}>
        <div className={styles.paneLabelRow}>
          <span className={styles.paneName}>{youLabel}</span>
          <span className={`${styles.scorePill} ${styles.scorePillYou}`} aria-label={`${youLabel} ${t.wins} ${yourWins}`}>
            {t.wins} {yourWins}
            <Pips count={yourWins} target={winsToWin} side="you" />
          </span>
        </div>

        <div className={styles.hand} role="group" aria-label={t.handLabel}>
          {yourHand.map((card) => {
            const cardKey = isDragon(card) ? 'dragon' : `n${card}`;
            const label = isDragon(card) ? t.dragonCard : t.cardN(card);
            return (
              <button
                key={cardKey}
                type="button"
                onClick={() => canPick && onPickCard(card)}
                disabled={!canPick}
                aria-label={label}
                title={label}
                className={`${styles.cardBtn} ${!canPick ? styles.cardBtnDisabled : ''}`}
              >
                <CardFace card={card} opts={{ size: 'medium' }} />
              </button>
            );
          })}
          {yourHand.length === 0 && (
            <div className={styles.statusMuted} style={{ padding: '1rem' }}>
              {t.noCardsLeft}
            </div>
          )}
        </div>

        {phase === 'finished' && onPlayAgain && (
          <button className={styles.playAgainBtn} onClick={onPlayAgain} type="button">
            {t.playAgain}
          </button>
        )}
      </div>
    </div>
  );
}

function EmptySlot() {
  return (
    <div
      aria-hidden="true"
      style={{
        width: SIZES.large.w,
        height: SIZES.large.h,
        border: '2px dashed rgba(148, 163, 184, 0.3)',
        borderRadius: '0.55rem',
      }}
    />
  );
}
