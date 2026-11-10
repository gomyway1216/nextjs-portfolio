/**
 * Doubt (ダウト) - Post-game bluff report
 *
 * Shown once a local game is over: turns every face-down claim face-up and
 * sums up who bluffed, who got caught and whose doubts were right.
 */

'use client';

import React, { useMemo, useState } from 'react';
import { summarizeClaims, type ClaimRecord } from './claimHistory';
import type { DoubtStrings } from './i18n';
import { rankToLabel, SUIT_SYMBOL } from './types';
import type { Card, CardRank } from './types';

interface BluffReportProps {
  history: ClaimRecord[];
  playerOrder: string[];
  humanId: string;
  nameOf: (playerId: string) => string;
  strings: DoubtStrings;
  /** Start with the claim-by-claim list open. */
  defaultExpanded?: boolean;
}

const BORDER = 'rgba(55, 65, 81, 1)';
const TRUTH_COLOR = '#22c55e';
const BLUFF_COLOR = '#f87171';

function CardChip({ card, declaredRank }: { card: Card; declaredRank: CardRank }) {
  const offRank = card.rank !== declaredRank;
  const red = card.suit === 'H' || card.suit === 'D';
  return (
    <span style={{
      display: 'inline-block',
      minWidth: '2.1rem',
      textAlign: 'center',
      padding: '0.1rem 0.3rem',
      borderRadius: '0.35rem',
      background: '#f8fafc',
      color: red ? '#dc2626' : '#1a1a2e',
      fontWeight: 900,
      fontSize: '0.8rem',
      boxShadow: offRank ? `0 0 0 2px ${BLUFF_COLOR}` : undefined,
    }}>
      {rankToLabel(card.rank)}{SUIT_SYMBOL[card.suit]}
    </span>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      flex: '1 1 11rem',
      background: 'rgba(0,0,0,0.35)',
      border: `1px solid ${BORDER}`,
      borderRadius: '0.75rem',
      padding: '0.55rem 0.75rem',
    }}>
      <div style={{ color: '#9ca3af', fontSize: '0.75rem', fontWeight: 700 }}>{label}</div>
      <div style={{ color: '#e5e7eb', fontSize: '0.9rem', fontWeight: 900, marginTop: '0.15rem' }}>{value}</div>
    </div>
  );
}

export function BluffReport({ history, playerOrder, humanId, nameOf, strings: t, defaultExpanded = false }: BluffReportProps) {
  const [showClaims, setShowClaims] = useState(defaultExpanded);
  const [bluffsOnly, setBluffsOnly] = useState(false);

  const resolved = useMemo(() => history.filter(r => r.outcome !== 'pending'), [history]);
  const summary = useMemo(() => summarizeClaims(resolved, playerOrder), [resolved, playerOrder]);
  const mine = summary[humanId];

  const rows = useMemo(
    () => resolved
      .map((record, idx) => ({ record, turn: idx + 1 }))
      .filter(({ record }) => !bluffsOnly || !record.truthful),
    [resolved, bluffsOnly],
  );

  if (!mine || resolved.length === 0) return null;

  const outcomeText = (record: ClaimRecord): string => {
    if (record.outcome === 'doubted' && record.challengerId && record.pileTakerId) {
      return t.reportDoubtedBy(nameOf(record.challengerId), nameOf(record.pileTakerId), record.pileSize);
    }
    if (record.outcome === 'accepted' && record.challengerId) return t.reportAcceptedBy(nameOf(record.challengerId));
    return t.reportUnchallenged;
  };

  const cell: React.CSSProperties = { padding: '0.3rem 0.6rem', textAlign: 'center', whiteSpace: 'nowrap' };
  const headCell: React.CSSProperties = { ...cell, color: '#9ca3af', fontWeight: 700, fontSize: '0.75rem' };

  return (
    <section
      aria-label={t.reportTitle}
      style={{
        marginTop: '0.75rem',
        background: 'rgba(17, 24, 39, 0.6)',
        border: `1px solid ${BORDER}`,
        borderRadius: '0.75rem',
        padding: '0.85rem',
      }}
    >
      <div style={{ color: '#fbbf24', fontWeight: 900, fontSize: '1rem' }}>{t.reportTitle}</div>
      <div style={{ color: '#9ca3af', fontSize: '0.85rem', marginTop: '0.15rem' }}>{t.reportIntro}</div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.65rem' }}>
        <StatTile label={t.reportYourBluffs} value={t.reportBluffsValue(mine.bluffsPassed, mine.bluffsCaught)} />
        <StatTile label={t.reportYourDoubts} value={t.reportDoubtsValue(mine.doubtsCorrect, mine.doubts - mine.doubtsCorrect)} />
        <StatTile label={t.reportMissed} value={t.reportMissedValue(mine.liesAccepted)} />
      </div>

      <div style={{ overflowX: 'auto', marginTop: '0.65rem' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', color: '#e5e7eb', fontSize: '0.85rem' }}>
          <thead>
            <tr>
              <th scope="col" style={{ ...headCell, textAlign: 'left' }}>{t.reportColPlayer}</th>
              <th scope="col" style={headCell}>{t.reportColClaims}</th>
              <th scope="col" style={headCell}>{t.reportColBluffs}</th>
              <th scope="col" style={headCell}>{t.reportColCaught}</th>
              <th scope="col" style={headCell}>{t.reportColDoubts}</th>
              <th scope="col" style={headCell}>{t.reportColPickedUp}</th>
            </tr>
          </thead>
          <tbody>
            {playerOrder.map((id) => {
              const s = summary[id];
              if (!s) return null;
              return (
                <tr key={id} style={{ borderTop: `1px solid ${BORDER}` }}>
                  <th scope="row" style={{ ...cell, textAlign: 'left', fontWeight: 800, color: id === humanId ? '#fbbf24' : '#e5e7eb' }}>
                    {nameOf(id)}{id === humanId ? t.youSuffix : ''}
                  </th>
                  <td style={cell}>{s.claims}</td>
                  <td style={cell}>{s.bluffs}</td>
                  <td style={cell}>{s.bluffsCaught}</td>
                  <td style={cell}>{s.doubtsCorrect}/{s.doubts}</td>
                  <td style={cell}>{s.cardsPickedUp}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.75rem', marginTop: '0.65rem' }}>
        <button
          type="button"
          onClick={() => setShowClaims(v => !v)}
          aria-expanded={showClaims}
          style={{
            padding: '0.5rem 1rem',
            borderRadius: '0.75rem',
            border: `1px solid ${BORDER}`,
            backgroundColor: '#1f2937',
            color: '#e5e7eb',
            fontWeight: 900,
            cursor: 'pointer',
            minHeight: '2.75rem',
          }}
        >
          {showClaims ? t.reportHideClaims : t.reportShowClaims(resolved.length)}
        </button>
        {showClaims && (
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#cbd5e1', fontSize: '0.85rem', fontWeight: 700, minHeight: '2.75rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={bluffsOnly} onChange={(e) => setBluffsOnly(e.target.checked)} />
            {t.reportBluffsOnly}
          </label>
        )}
      </div>

      {showClaims && (
        rows.length === 0 ? (
          <div style={{ color: '#6b7280', fontStyle: 'italic', marginTop: '0.5rem' }}>{t.reportNoBluffs}</div>
        ) : (
          <ol style={{
            listStyle: 'none',
            margin: '0.5rem 0 0',
            padding: 0,
            maxHeight: '18rem',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.35rem',
          }}>
            {rows.map(({ record, turn }) => {
              const verdictColor = record.truthful ? TRUTH_COLOR : BLUFF_COLOR;
              return (
                <li
                  key={record.id}
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    gap: '0.3rem 0.6rem',
                    padding: '0.4rem 0.6rem',
                    borderRadius: '0.6rem',
                    background: 'rgba(0,0,0,0.3)',
                    borderLeft: `3px solid ${verdictColor}`,
                    fontSize: '0.85rem',
                    color: '#e5e7eb',
                  }}
                >
                  <span style={{ color: '#6b7280', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', minWidth: '2rem' }}>
                    {turn}.
                  </span>
                  <span>
                    <span style={{ fontWeight: 800, color: record.playerId === humanId ? '#fbbf24' : '#e5e7eb' }}>
                      {nameOf(record.playerId)}
                    </span>
                    {' '}{t.reportClaimed(record.cards.length, rankToLabel(record.declaredRank))}
                  </span>
                  <span aria-label={t.reportActualCards} style={{ display: 'inline-flex', gap: '0.3rem', padding: '2px' }}>
                    {record.cards.map(c => <CardChip key={c.id} card={c} declaredRank={record.declaredRank} />)}
                  </span>
                  <span style={{ color: verdictColor, fontWeight: 900, fontSize: '0.75rem' }}>
                    {record.truthful ? t.verdictTruth : t.verdictBluff}
                  </span>
                  <span style={{ color: '#9ca3af' }}>{outcomeText(record)}</span>
                </li>
              );
            })}
          </ol>
        )
      )}
    </section>
  );
}
