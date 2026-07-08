/**
 * Territory Number — board + draw-pool + status, presentation only.
 *
 * Parent owns the state machine (AI mode or online mode). This component just
 * renders, surfaces user intent (selectCard / placeCard), animates freshly
 * placed cards and freshly captured lines, and shows the running score.
 *
 * Theme-aware via the shared --games-route-* CSS variables (light/dark).
 */

'use client';

import React, { useEffect, useRef, useState } from 'react';
import type { Board, BoardEvaluation, PlayerSlot } from './types';
import { getTerritoryNumberStrings } from './i18n';
import type { GameLanguage } from '../constants/gameTranslations';
import styles from './TerritoryNumber.module.css';

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
  /** Optional extra header control (e.g. info button). */
  headerExtra?: React.ReactNode;
  language: GameLanguage;
}

/** Per-player accent colours (kept vivid so they read in light + dark). */
const P1 = { color: '#2563eb', soft: 'rgba(37, 99, 235, 0.16)' };
const P2 = { color: '#ef4444', soft: 'rgba(239, 68, 68, 0.16)' };
const TIE = { color: '#94a3b8', soft: 'rgba(148, 163, 184, 0.14)' };

const accent = (slot: PlayerSlot | null) =>
  slot === 'p1' ? P1 : slot === 'p2' ? P2 : TIE;

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
    headerExtra,
    language,
  } = props;

  const s = getTerritoryNumberStrings(language);
  const ja = language === 'ja';

  const oppSlot: PlayerSlot = mySlot === 'p1' ? 'p2' : 'p1';
  const myCaptures = mySlot === 'p1' ? evaluation.p1Captures : evaluation.p2Captures;
  const oppCaptures = oppSlot === 'p1' ? evaluation.p1Captures : evaluation.p2Captures;

  const canInteract = phase === 'your-turn';

  // Track score changes to trigger a one-shot "bump" animation. We keep the
  // previous values in refs (mutated only inside the effect) and drive the
  // animation flag through state so we never read refs during render.
  const prevMine = useRef(myCaptures);
  const prevOpp = useRef(oppCaptures);
  const [myBump, setMyBump] = useState(false);
  const [oppBump, setOppBump] = useState(false);
  useEffect(() => {
    if (prevMine.current !== myCaptures) {
      prevMine.current = myCaptures;
      setMyBump(true);
      const id = setTimeout(() => setMyBump(false), 450);
      return () => clearTimeout(id);
    }
  }, [myCaptures]);
  useEffect(() => {
    if (prevOpp.current !== oppCaptures) {
      prevOpp.current = oppCaptures;
      setOppBump(true);
      const id = setTimeout(() => setOppBump(false), 450);
      return () => clearTimeout(id);
    }
  }, [oppCaptures]);

  const myAcc = accent(mySlot);
  const oppAcc = accent(oppSlot);

  return (
    <div className={styles.screen}>
      {/* Header */}
      <div className={styles.header}>
        <button type="button" onClick={onLeave} className={styles.ghostButton}>
          ← {s.leave}
        </button>
        <span className={styles.headerTitle}>{ja ? '陣取り数字' : 'Territory Number'}</span>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {headerExtra}
        </div>
      </div>

      {/* Scoreboard */}
      <div className={styles.scoreboard}>
        <ScoreCard
          name={opponentLabel}
          captures={oppCaptures}
          acc={oppAcc}
          active={phase === 'opponent-turn'}
          bump={oppBump}
          turnLabel={s.oppTurn}
          linesLabel={s.lines}
        />
        <ScoreCard
          name={myLabel}
          captures={myCaptures}
          acc={myAcc}
          active={phase === 'your-turn'}
          bump={myBump}
          turnLabel={s.yourTurn}
          linesLabel={s.lines}
        />
      </div>

      {/* Status line */}
      <div className={`${styles.status} ${phase === 'finished' ? styles.statusFinished : ''}`}>
        {phase === 'your-turn' && (statusText ?? s.yourTurn)}
        {phase === 'opponent-turn' && (statusText ?? s.oppTurn)}
        {phase === 'finished' && (finalMessage ?? s.finished)}
      </div>

      {/* Board */}
      <div className={styles.boardArea}>
        <div className={styles.board} role="grid" aria-label={ja ? '3×3 盤面' : '3 by 3 board'}>
          {board.map((cell, idx) => {
            const empty = cell.value === null;
            const acc = accent(cell.owner);
            const interactable = canInteract && empty && selectedCard !== null;
            const row = Math.floor(idx / 3) + 1;
            const col = (idx % 3) + 1;
            const ownerLabel = cell.owner === mySlot ? myLabel : opponentLabel;
            return (
              <button
                key={idx}
                role="gridcell"
                disabled={!interactable}
                onClick={() => interactable && onPlaceOnCell(idx)}
                aria-label={
                  empty
                    ? s.emptyCell(row, col)
                    : s.filledCell(cell.value as number, ownerLabel)
                }
                className={[
                  styles.cell,
                  interactable ? styles.cellPlayable : '',
                  !empty ? styles.cellFilled : '',
                ].filter(Boolean).join(' ')}
                style={
                  !empty
                    ? ({ ['--own-color' as string]: acc.color, ['--own-soft' as string]: acc.soft } as React.CSSProperties)
                    : undefined
                }
              >
                {empty ? '' : cell.value}
              </button>
            );
          })}
        </div>
      </div>

      {/* Line summary */}
      <LineSummary evaluation={evaluation} labels={s.lineLabels} />

      {/* Card pool */}
      <div className={styles.pool}>
        <div className={styles.poolLabel}>{s.remaining}</div>
        <div className={styles.cards} role="group" aria-label={s.remaining}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(card => {
            const inPool = remainingCards.includes(card);
            const isSelected = selectedCard === card;
            const interactable = canInteract && inPool;
            return (
              <button
                key={card}
                type="button"
                disabled={!interactable}
                onClick={() => interactable && onSelectCard(card)}
                aria-pressed={isSelected}
                aria-label={inPool ? s.selectCard(card) : `${card} ${s.used}`}
                className={[
                  styles.card,
                  interactable ? styles.cardPlayable : '',
                  isSelected ? styles.cardSelected : '',
                  !inPool ? styles.cardUsed : '',
                ].filter(Boolean).join(' ')}
              >
                {card}
              </button>
            );
          })}
        </div>

        {phase === 'finished' && onPlayAgain && (
          <button type="button" onClick={onPlayAgain} className={styles.primaryButton}>
            {s.playAgain}
          </button>
        )}
      </div>
    </div>
  );
}

function ScoreCard({
  name, captures, acc, active, bump, turnLabel, linesLabel,
}: {
  name: string;
  captures: number;
  acc: { color: string; soft: string };
  active: boolean;
  bump: boolean;
  turnLabel: string;
  linesLabel: string;
}) {
  return (
    <div
      className={`${styles.scoreCard} ${active ? styles.scoreCardActive : ''}`}
      style={{
        ['--sc-border' as string]: acc.color,
        ['--sc-soft' as string]: acc.soft,
        ['--sc-text' as string]: acc.color,
      } as React.CSSProperties}
    >
      {active && <span className={styles.turnTag}>{turnLabel}</span>}
      <span className={styles.scoreName}>
        <span className={styles.scoreDot} />
        {name}
      </span>
      <span className={`${styles.scoreValue} ${bump ? styles.bump : ''}`}>{captures}</span>
      <span className={styles.scoreCaptionRow}>
        <span style={{ fontSize: '0.66rem', color: 'var(--games-route-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {linesLabel}
        </span>
      </span>
    </div>
  );
}

function LineSummary({
  evaluation, labels,
}: {
  evaluation: BoardEvaluation;
  labels: string[];
}) {
  return (
    <div className={styles.lineSummary}>
      {evaluation.lines.map((r, i) => {
        const acc = accent(r.winner);
        const empty = r.p1Sum === 0 && r.p2Sum === 0;
        const decided = r.winner !== null;
        const sumLabel = empty ? '–' : `${r.p1Sum}–${r.p2Sum}`;
        return (
          <div
            key={i}
            className={`${styles.lineChip} ${decided ? styles.lineChipCaptured : ''}`}
            style={{
              ['--chip-border' as string]: acc.color,
              ['--chip-soft' as string]: acc.soft,
              ['--chip-text' as string]: acc.color,
            } as React.CSSProperties}
            title={labels[i]}
          >
            {labels[i]} ({sumLabel})
          </div>
        );
      })}
    </div>
  );
}
