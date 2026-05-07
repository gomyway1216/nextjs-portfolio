/**
 * Bigger Number — game table view.
 *
 * Pure presentational + interaction layer. The parent (AI mode or Online mode)
 * owns the state machine and passes everything in via props.
 *
 *   ┌────────────────────────────────────────────┐
 *   │ Opponent name           Wins: 3            │
 *   │ Opponent's hand (face-down)                │
 *   │                                            │
 *   │ Round 4 / 10        ┌──┐    ┌──┐           │
 *   │                     │? │ vs │? │           │
 *   │ Last round result   └──┘    └──┘           │
 *   │                                            │
 *   │ Your hand (face-up, click to pick)         │
 *   │ You name           Wins: 2                 │
 *   └────────────────────────────────────────────┘
 */

'use client';

import React from 'react';
import type { CardValue } from './types';
import { cardLabel, isDragon } from './gameLogic';

export type RoundPhase = 'picking' | 'waiting-opponent' | 'revealing' | 'between-rounds' | 'finished';

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
  yourPickShown: CardValue | null;     // null while hidden, set during reveal
  opponentPickShown: CardValue | null; // null while hidden, set during reveal
  // Phase / messaging
  phase: RoundPhase;
  lastResultText: string | null;
  finalMessage: string | null;
  // Callbacks
  onPickCard: (card: CardValue) => void;
  onLeave: () => void;
  onPlayAgain?: () => void; // shown only when finished
  language: 'en' | 'ja';
}

const COLORS = {
  bg: '#0f172a',
  panel: 'rgba(15, 23, 42, 0.92)',
  border: 'rgba(148, 163, 184, 0.25)',
  borderHot: 'rgba(251, 191, 36, 0.55)',
  text: '#f8fafc',
  muted: '#94a3b8',
  win: '#4ade80',
  lose: '#f87171',
  tie: '#fbbf24',
  faceUp: '#f1f5f9',
  faceDown: '#1e293b',
  faceUpText: '#0f172a',
  dragon: '#fbbf24',
};

function cardFace(card: CardValue, opts: { facedown?: boolean; small?: boolean } = {}) {
  const { facedown, small } = opts;
  const size = small ? { w: 44, h: 60, font: '1.4rem' } : { w: 88, h: 124, font: '3.25rem' };

  if (facedown) {
    return (
      <div style={{
        width: size.w,
        height: size.h,
        borderRadius: '0.5rem',
        background: 'linear-gradient(135deg, #0f172a, #1e293b 60%, #0b1220)',
        border: '1px solid rgba(148, 163, 184, 0.3)',
        boxShadow: '0 6px 14px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(148, 163, 184, 0.15)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'rgba(148, 163, 184, 0.6)',
        fontSize: small ? '0.85rem' : '1.5rem',
        fontWeight: 800,
        letterSpacing: '0.05em',
      }}>
        ?
      </div>
    );
  }

  const dragon = isDragon(card);
  return (
    <div style={{
      width: size.w,
      height: size.h,
      borderRadius: '0.5rem',
      background: dragon ? 'linear-gradient(135deg, #1e293b, #0b1220)' : '#f1f5f9',
      border: dragon ? '2px solid rgba(251, 191, 36, 0.85)' : '1px solid rgba(148, 163, 184, 0.4)',
      boxShadow: '0 6px 14px rgba(0, 0, 0, 0.45)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: dragon ? COLORS.dragon : COLORS.faceUpText,
      fontSize: size.font,
      fontWeight: 900,
      fontFamily: dragon ? 'serif' : 'system-ui, sans-serif',
    }}>
      {cardLabel(card)}
    </div>
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
    lastResultText,
    finalMessage,
    onPickCard,
    onLeave,
    onPlayAgain,
    language,
  } = props;

  const ja = language === 'ja';
  const t = {
    you: ja ? 'あなた' : 'You',
    wins: ja ? '勝' : 'Wins',
    round: ja ? 'ラウンド' : 'Round',
    target: ja ? `${winsToWin}勝先取` : `First to ${winsToWin}`,
    pickPrompt: ja ? '手札から1枚選んで「セーノ！」' : 'Pick a card and reveal!',
    waitingOpp: ja ? '相手の選択を待っています...' : 'Waiting for opponent...',
    youLocked: ja ? '札を伏せました' : 'Card locked in',
    revealing: ja ? 'オープン！' : 'Reveal!',
    leave: ja ? '退室' : 'Leave',
    again: ja ? 'もう一度' : 'Play Again',
  };

  const canPick = phase === 'picking';

  const opponentCards = Array.from({ length: opponentHandCount });

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      display: 'flex',
      flexDirection: 'column',
      background: `linear-gradient(to bottom, #020617, ${COLORS.bg})`,
      color: COLORS.text,
      fontFamily: 'system-ui, -apple-system, sans-serif',
      overflow: 'auto',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0.85rem 1.25rem',
        borderBottom: `1px solid ${COLORS.border}`,
      }}>
        <button
          onClick={onLeave}
          style={{
            padding: '0.4rem 0.9rem',
            background: 'rgba(220, 38, 38, 0.12)',
            border: '1px solid rgba(220, 38, 38, 0.4)',
            borderRadius: '0.5rem',
            color: '#fecaca',
            fontWeight: 700,
            cursor: 'pointer',
            fontSize: '0.85rem',
          }}
        >
          ← {t.leave}
        </button>
        <div style={{ color: COLORS.muted, fontSize: '0.85rem', fontWeight: 700 }}>
          {t.round} {round} / {totalRounds} · {t.target}
        </div>
        <div style={{ width: '5rem' }} />
      </div>

      {/* Opponent panel */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '0.6rem',
        padding: '1rem 1rem 0.5rem',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          fontSize: '0.95rem',
        }}>
          <span style={{ color: COLORS.muted }}>{opponentLabel}</span>
          <span style={{
            background: 'rgba(248, 113, 113, 0.15)',
            border: '1px solid rgba(248, 113, 113, 0.3)',
            color: COLORS.lose,
            padding: '0.15rem 0.7rem',
            borderRadius: '999px',
            fontWeight: 800,
            fontSize: '0.85rem',
          }}>
            {t.wins}: {opponentWins}
          </span>
          {opponentPickCount > 0 && phase !== 'revealing' && (
            <span style={{ color: COLORS.tie, fontSize: '0.8rem', fontWeight: 700 }}>
              ✓ {t.youLocked}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', justifyContent: 'center' }}>
          {opponentCards.map((_, idx) => (
            <div key={idx}>{cardFace(0, { facedown: true, small: true })}</div>
          ))}
        </div>
      </div>

      {/* Center stage */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '1rem',
        padding: '1rem',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '2.5rem',
          background: COLORS.panel,
          border: `1px solid ${phase === 'revealing' ? COLORS.borderHot : COLORS.border}`,
          borderRadius: '1rem',
          padding: '1.25rem 2rem',
          minHeight: '10rem',
          transition: 'border-color 0.25s',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem' }}>
            <div style={{ fontSize: '0.75rem', color: COLORS.muted, fontWeight: 700 }}>{opponentLabel}</div>
            {opponentPickShown != null
              ? cardFace(opponentPickShown)
              : opponentPickCount > 0
              ? cardFace(0, { facedown: true })
              : <div style={{ width: 88, height: 124, border: `2px dashed ${COLORS.border}`, borderRadius: '0.5rem' }} />}
          </div>
          <div style={{ fontSize: '1.5rem', color: COLORS.muted, fontWeight: 800 }}>VS</div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem' }}>
            <div style={{ fontSize: '0.75rem', color: COLORS.muted, fontWeight: 700 }}>{t.you}</div>
            {yourPickShown != null
              ? cardFace(yourPickShown)
              : yourPick != null
              ? cardFace(0, { facedown: true })
              : <div style={{ width: 88, height: 124, border: `2px dashed ${COLORS.border}`, borderRadius: '0.5rem' }} />}
          </div>
        </div>

        <div style={{ minHeight: '1.5rem', textAlign: 'center', fontWeight: 700 }}>
          {phase === 'picking' && (
            <span style={{ color: COLORS.tie }}>{t.pickPrompt}</span>
          )}
          {phase === 'waiting-opponent' && (
            <span style={{ color: COLORS.muted }}>{t.waitingOpp}</span>
          )}
          {phase === 'revealing' && (
            <span style={{ color: COLORS.tie, fontSize: '1.15rem' }}>{t.revealing}</span>
          )}
          {phase === 'between-rounds' && lastResultText && (
            <span style={{ color: COLORS.text }}>{lastResultText}</span>
          )}
          {phase === 'finished' && finalMessage && (
            <span style={{ color: COLORS.tie, fontSize: '1.15rem' }}>{finalMessage}</span>
          )}
        </div>
      </div>

      {/* Your hand */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '0.75rem',
        padding: '0.5rem 1rem 1.25rem',
        borderTop: `1px solid ${COLORS.border}`,
        background: 'rgba(15, 23, 42, 0.5)',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          fontSize: '0.95rem',
        }}>
          <span style={{ color: COLORS.muted }}>{youLabel}</span>
          <span style={{
            background: 'rgba(74, 222, 128, 0.15)',
            border: '1px solid rgba(74, 222, 128, 0.3)',
            color: COLORS.win,
            padding: '0.15rem 0.7rem',
            borderRadius: '999px',
            fontWeight: 800,
            fontSize: '0.85rem',
          }}>
            {t.wins}: {yourWins}
          </span>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'center' }}>
          {yourHand.map((card) => {
            const cardKey = isDragon(card) ? 'dragon' : `n${card}`;
            const interactive = canPick;
            return (
              <button
                key={cardKey}
                onClick={() => interactive && onPickCard(card)}
                disabled={!interactive}
                aria-label={isDragon(card) ? 'Dragon card' : `Card ${card}`}
                style={{
                  padding: 0,
                  background: 'transparent',
                  border: 'none',
                  cursor: interactive ? 'pointer' : 'default',
                  opacity: interactive ? 1 : 0.55,
                  transform: 'translateY(0)',
                  transition: 'transform 0.15s, filter 0.15s',
                  filter: interactive ? 'drop-shadow(0 0 0 transparent)' : 'grayscale(0.3)',
                }}
                onMouseEnter={(e) => {
                  if (interactive) e.currentTarget.style.transform = 'translateY(-6px)';
                }}
                onMouseLeave={(e) => {
                  if (interactive) e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                {cardFace(card)}
              </button>
            );
          })}
          {yourHand.length === 0 && (
            <div style={{ color: COLORS.muted, fontSize: '0.9rem', padding: '1rem' }}>
              {ja ? '手札を使い切りました' : 'No cards left'}
            </div>
          )}
        </div>

        {phase === 'finished' && onPlayAgain && (
          <button
            onClick={onPlayAgain}
            style={{
              marginTop: '0.5rem',
              padding: '0.6rem 1.5rem',
              background: '#16a34a',
              border: 'none',
              borderRadius: '0.5rem',
              color: '#fff',
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            {t.again}
          </button>
        )}
      </div>
    </div>
  );
}
