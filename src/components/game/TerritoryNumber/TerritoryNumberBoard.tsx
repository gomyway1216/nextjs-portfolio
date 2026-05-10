/**
 * Territory Number — board + draw-pool + status, presentation only.
 *
 * Parent owns the state machine (AI mode or online host loop). This component
 * just renders, surfaces user intent (selectCard / placeCard), and animates
 * the line-capture overlay when the match ends.
 */

'use client';

import React from 'react';
import type { Board, BoardEvaluation, PlayerSlot } from './types';
import { LINES } from './types';

export type Phase = 'your-turn' | 'opponent-turn' | 'finished';

interface TerritoryNumberBoardProps {
  board: Board;
  /** Cards still in the shared pool, in display order (1..9, missing ones omitted). */
  remainingCards: number[];
  /** Currently-selected card for the local player (null = none). */
  selectedCard: number | null;
  /** Local player's slot, used for colouring + interactivity. */
  mySlot: PlayerSlot;
  /** Labels for the two players. */
  myLabel: string;
  opponentLabel: string;
  /** Captures so far (computed from board). */
  evaluation: BoardEvaluation;
  /** Phase from the parent's state machine. */
  phase: Phase;
  /** Final-result message (only shown when phase === 'finished'). */
  finalMessage: string | null;
  /** Optional explanatory text under the status row (e.g. "Pick a card"). */
  statusText: string | null;
  // Callbacks.
  onSelectCard: (card: number) => void;
  onPlaceOnCell: (cellIndex: number) => void;
  onLeave: () => void;
  onPlayAgain?: () => void; // shown only when finished
  language: 'en' | 'ja';
}

const COLORS = {
  bg: '#0f172a',
  panel: 'rgba(15, 23, 42, 0.92)',
  border: 'rgba(148, 163, 184, 0.25)',
  text: '#f8fafc',
  muted: '#94a3b8',
  p1: '#3b82f6', // blue
  p2: '#ef4444', // red
  p1Soft: 'rgba(59, 130, 246, 0.18)',
  p2Soft: 'rgba(239, 68, 68, 0.18)',
  unowned: 'rgba(148, 163, 184, 0.12)',
  cellBg: '#1e293b',
  highlight: '#fbbf24',
};

const playerColor = (slot: PlayerSlot | null) =>
  slot === 'p1' ? COLORS.p1 : slot === 'p2' ? COLORS.p2 : COLORS.muted;

const playerSoft = (slot: PlayerSlot | null) =>
  slot === 'p1' ? COLORS.p1Soft : slot === 'p2' ? COLORS.p2Soft : COLORS.unowned;

export function TerritoryNumberBoard(props: TerritoryNumberBoardProps) {
  const {
    board,
    remainingCards,
    selectedCard,
    mySlot,
    myLabel,
    opponentLabel,
    evaluation,
    phase,
    finalMessage,
    statusText,
    onSelectCard,
    onPlaceOnCell,
    onLeave,
    onPlayAgain,
    language,
  } = props;

  const ja = language === 'ja';
  const t = {
    leave: ja ? '退室' : 'Leave',
    playAgain: ja ? 'もう一度' : 'Play Again',
    yourTurn: ja ? 'あなたの番' : 'Your turn',
    oppTurn: ja ? '相手の番' : 'Opponent\'s turn',
    finished: ja ? '終了' : 'Finished',
    pool: ja ? '残りカード' : 'Remaining',
    captures: ja ? '獲得ライン' : 'Lines',
  };

  const oppSlot: PlayerSlot = mySlot === 'p1' ? 'p2' : 'p1';
  const myCaptures = mySlot === 'p1' ? evaluation.p1Captures : evaluation.p2Captures;
  const oppCaptures = oppSlot === 'p1' ? evaluation.p1Captures : evaluation.p2Captures;

  const canInteract = phase === 'your-turn';

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
        padding: '0.75rem 1rem',
        borderBottom: `1px solid ${COLORS.border}`,
        gap: '0.75rem',
      }}>
        <button
          onClick={onLeave}
          style={{
            padding: '0.4rem 0.85rem',
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

        <ScoreBadge label={opponentLabel} captures={oppCaptures} color={playerColor(oppSlot)} soft={playerSoft(oppSlot)} t={t} />
        <ScoreBadge label={myLabel} captures={myCaptures} color={playerColor(mySlot)} soft={playerSoft(mySlot)} t={t} />

        <div style={{ width: '5rem' }} />
      </div>

      {/* Status line */}
      <div style={{
        textAlign: 'center',
        padding: '0.75rem 1rem 0',
        fontSize: '0.95rem',
        fontWeight: 700,
        color: phase === 'your-turn' ? COLORS.highlight
              : phase === 'finished' ? COLORS.highlight
              : COLORS.muted,
      }}>
        {phase === 'your-turn' && (statusText ?? t.yourTurn)}
        {phase === 'opponent-turn' && (statusText ?? t.oppTurn)}
        {phase === 'finished' && (finalMessage ?? t.finished)}
      </div>

      {/* Board */}
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.25rem',
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 5.5rem)',
          gridTemplateRows: 'repeat(3, 5.5rem)',
          gap: '0.5rem',
          background: COLORS.panel,
          border: `1px solid ${COLORS.border}`,
          borderRadius: '1rem',
          padding: '0.85rem',
        }}>
          {board.map((cell, idx) => {
            const empty = cell.value === null;
            const ownerColor = playerColor(cell.owner);
            const ownerSoft = playerSoft(cell.owner);
            const interactable = canInteract && empty && selectedCard !== null;
            return (
              <button
                key={idx}
                disabled={!interactable}
                onClick={() => interactable && onPlaceOnCell(idx)}
                aria-label={
                  empty
                    ? (ja ? `空マス ${idx}` : `Empty cell ${idx}`)
                    : (ja ? `${cell.value} のマス` : `Cell with ${cell.value}`)
                }
                style={{
                  width: '5.5rem',
                  height: '5.5rem',
                  borderRadius: '0.6rem',
                  border: empty
                    ? `2px dashed ${interactable ? COLORS.highlight : COLORS.border}`
                    : `2px solid ${ownerColor}`,
                  background: empty
                    ? (interactable ? 'rgba(251, 191, 36, 0.08)' : COLORS.cellBg)
                    : ownerSoft,
                  color: empty ? COLORS.muted : ownerColor,
                  fontSize: empty ? '1.5rem' : '2.5rem',
                  fontWeight: 900,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: interactable ? 'pointer' : 'default',
                  transition: 'transform 0.12s, background 0.12s',
                  fontFamily: 'system-ui, sans-serif',
                }}
                onMouseEnter={(e) => {
                  if (interactable) e.currentTarget.style.transform = 'scale(1.04)';
                }}
                onMouseLeave={(e) => {
                  if (interactable) e.currentTarget.style.transform = 'scale(1)';
                }}
              >
                {empty ? '' : cell.value}
              </button>
            );
          })}
        </div>
      </div>

      {/* Line summary */}
      <LineSummary evaluation={evaluation} ja={ja} />

      {/* Card pool */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '0.6rem',
        padding: '0.75rem 1rem 1.25rem',
        borderTop: `1px solid ${COLORS.border}`,
        background: 'rgba(15, 23, 42, 0.55)',
      }}>
        <div style={{
          fontSize: '0.78rem',
          color: COLORS.muted,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
        }}>
          {t.pool}
        </div>
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', justifyContent: 'center' }}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(card => {
            const inPool = remainingCards.includes(card);
            const isSelected = selectedCard === card;
            const interactable = canInteract && inPool;
            return (
              <button
                key={card}
                disabled={!interactable}
                onClick={() => interactable && onSelectCard(card)}
                aria-label={
                  inPool
                    ? (ja ? `カード ${card} を選ぶ` : `Select card ${card}`)
                    : (ja ? `カード ${card} 使用済み` : `Card ${card} used`)
                }
                style={{
                  width: '3rem',
                  height: '4rem',
                  borderRadius: '0.5rem',
                  border: isSelected
                    ? `3px solid ${COLORS.highlight}`
                    : `2px solid ${inPool ? COLORS.border : 'rgba(148,163,184,0.15)'}`,
                  background: inPool ? '#f1f5f9' : 'rgba(15, 23, 42, 0.6)',
                  color: inPool ? '#0f172a' : 'rgba(148, 163, 184, 0.4)',
                  fontSize: '1.5rem',
                  fontWeight: 900,
                  cursor: interactable ? 'pointer' : 'default',
                  opacity: inPool ? 1 : 0.45,
                  transform: isSelected ? 'translateY(-4px)' : 'translateY(0)',
                  transition: 'transform 0.12s',
                }}
              >
                {card}
              </button>
            );
          })}
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
            {t.playAgain}
          </button>
        )}
      </div>
    </div>
  );
}

function ScoreBadge({
  label, captures, color, soft, t,
}: {
  label: string;
  captures: number;
  color: string;
  soft: string;
  t: { captures: string };
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.15rem' }}>
      <span style={{ color: COLORS.muted, fontSize: '0.78rem', fontWeight: 700 }}>{label}</span>
      <span style={{
        background: soft,
        border: `1px solid ${color}`,
        color,
        padding: '0.2rem 0.85rem',
        borderRadius: '999px',
        fontWeight: 800,
        fontSize: '0.85rem',
      }}>
        {t.captures}: {captures}
      </span>
    </div>
  );
}

function LineSummary({ evaluation, ja }: { evaluation: BoardEvaluation; ja: boolean }) {
  // 8 small chips, one per line, coloured by winner.
  const lineLabels = ja
    ? ['1行目', '2行目', '3行目', '1列目', '2列目', '3列目', '\\対角', '/対角']
    : ['Row 1', 'Row 2', 'Row 3', 'Col 1', 'Col 2', 'Col 3', '\\ Diag', '/ Diag'];
  return (
    <div style={{
      display: 'flex',
      gap: '0.35rem',
      flexWrap: 'wrap',
      justifyContent: 'center',
      padding: '0 1rem 0.75rem',
    }}>
      {evaluation.lines.map((r, i) => {
        const color = playerColor(r.winner);
        const soft = playerSoft(r.winner);
        // Avoid ambiguous "0-0 unowned" looking the same as a 4-4 tied line.
        const empty = r.p1Sum === 0 && r.p2Sum === 0;
        const sumLabel = empty ? '–' : `${r.p1Sum} – ${r.p2Sum}`;
        return (
          <div
            key={i}
            style={{
              fontSize: '0.7rem',
              padding: '0.2rem 0.55rem',
              background: soft,
              border: `1px solid ${color}`,
              borderRadius: '999px',
              color,
              fontWeight: 700,
              minWidth: '5rem',
              textAlign: 'center',
            }}
            // Show line indices on hover for debugging / replays.
            title={`${lineLabels[i]}: cells ${LINES[i].join(',')}`}
          >
            {lineLabels[i]} ({sumLabel})
          </div>
        );
      })}
    </div>
  );
}
