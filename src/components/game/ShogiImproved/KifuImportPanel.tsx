/**
 * KifuImportPanel
 *
 * "棋譜を読み込む" UI: a textarea for pasting Japanese kifu text plus a button
 * that parses it (via `parseKifuText`) and reports success/partial-failure.
 * Kept as its own component so `ShogiImproved.tsx` only owns the *result*
 * (the parsed steps get handed to the parent via `onImported`, which drives
 * replay/playback) rather than parsing details.
 */

'use client';

import React, { useState } from 'react';
import { KyokumenImproved } from './KyokumenImproved';
import type { KifuImportStep } from './KifuImportImproved';
import { parseKifuText } from './KifuImportImproved';

interface KifuImportPanelProps {
  /** The position the pasted kifu should be replayed from (usually the game's hirate/handicap start). */
  startingPosition: KyokumenImproved;
  /** Called with every successfully parsed step (in order) once parsing finishes, even partially. */
  onImported: (steps: KifuImportStep[]) => void;
}

export function KifuImportPanel({ startingPosition, onImported }: KifuImportPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [text, setText] = useState('');
  const [status, setStatus] = useState<
    | { kind: 'idle' }
    | { kind: 'success'; count: number }
    | { kind: 'partial'; parsed: number; moveNumber: number; token: string; reason: string }
  >({ kind: 'idle' });

  const handleImport = () => {
    if (!text.trim()) return;
    const result = parseKifuText(text, startingPosition);
    onImported(result.steps);
    if (result.error) {
      setStatus({
        kind: 'partial',
        parsed: result.steps.length,
        moveNumber: result.error.moveNumber,
        token: result.error.token,
        reason: result.error.reason,
      });
    } else {
      setStatus({ kind: 'success', count: result.steps.length });
    }
  };

  return (
    <div style={{ width: 'min(680px, 100%)', background: 'rgba(255,255,255,0.06)', borderRadius: '8px', padding: '12px 16px' }}>
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'transparent',
          border: 'none',
          color: '#e6e6e6',
          fontSize: '1rem',
          fontWeight: 700,
          cursor: 'pointer',
          padding: 0,
        }}
        aria-expanded={expanded}
      >
        <span>棋譜を読み込む</span>
        <span aria-hidden="true" style={{ fontSize: '0.85rem', opacity: 0.7 }}>{expanded ? '▲ 閉じる' : '▼ 開く'}</span>
      </button>

      {expanded && (
        <div style={{ marginTop: '10px' }}>
          <p style={{ fontSize: '0.78rem', lineHeight: 1.5, opacity: 0.7, marginTop: 0, marginBottom: '8px' }}>
            日本語棋譜を貼り付けてください（例: 「1. ▲７六歩 2. △８四歩 3. ▲７七角 ...」）。
            手数番号・▲△の有無、全角/半角、同・打・成・成駒名（と馬龍/竜全圭杏）に対応しています。
          </p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="1. ▲７六歩 2. △８四歩 3. ▲７七角 ..."
            rows={5}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              resize: 'vertical',
              background: 'rgba(0,0,0,0.25)',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: '6px',
              color: '#e6e6e6',
              fontSize: '13px',
              padding: '8px 10px',
              fontFamily: 'inherit',
            }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '8px' }}>
            <button
              type="button"
              onClick={handleImport}
              style={{
                padding: '6px 14px',
                borderRadius: '6px',
                border: '1px solid rgba(66,153,225,0.6)',
                background: 'rgba(66,153,225,0.18)',
                color: '#8ec5ff',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              読み込む
            </button>
            {status.kind === 'success' && (
              <span style={{ fontSize: '13px', color: '#4ade80' }}>
                {status.count}手すべて読み込みました ✓
              </span>
            )}
            {status.kind === 'partial' && (
              <span style={{ fontSize: '13px', color: '#fbbf24' }}>
                {status.parsed}手目まで読み込み、{status.moveNumber}手目「{status.token}」で停止（{status.reason}）
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
