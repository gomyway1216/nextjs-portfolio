/**
 * Bigger Number — rule config editor.
 *
 * Compact form used by both AI and Online lobbies.
 * Pure presentational; parent owns the rules state.
 */

'use client';

import React from 'react';
import type { BiggerNumberRules, DragonRule, TieRule } from './types';

interface RuleConfigEditorProps {
  rules: BiggerNumberRules;
  onChange: (rules: BiggerNumberRules) => void;
  language: 'en' | 'ja';
  disabled?: boolean;
}

const labelStyle: React.CSSProperties = {
  color: '#94a3b8',
  fontSize: '0.78rem',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

const groupStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.35rem',
};

function pillButton(active: boolean, disabled: boolean | undefined): React.CSSProperties {
  return {
    padding: '0.4rem 0.85rem',
    background: active ? '#2563eb' : 'transparent',
    border: `1px solid ${active ? '#3b82f6' : 'rgba(148, 163, 184, 0.35)'}`,
    color: active ? '#fff' : '#cbd5e1',
    borderRadius: '999px',
    fontWeight: 700,
    cursor: disabled ? 'default' : 'pointer',
    fontSize: '0.85rem',
    opacity: disabled ? 0.6 : 1,
  };
}

export function RuleConfigEditor({ rules, onChange, language, disabled }: RuleConfigEditorProps) {
  const ja = language === 'ja';
  const t = {
    title: ja ? 'ルール設定' : 'Rules',
    dragon: ja ? '龍タイル' : 'Dragon tile',
    dragonLosesTo1: ja ? '1にだけ負ける' : 'Loses to 1',
    dragonBeatsAll: ja ? '最強' : 'Beats all',
    tie: ja ? '同点処理' : 'Ties',
    tieDiscard: ja ? 'カード捨て' : 'Discard cards',
    tieReplay: ja ? '再出し' : 'Replay',
    wins: ja ? '何勝で勝利' : 'Wins to win',
    rounds: ja ? '最大ラウンド数' : 'Max rounds',
  };

  const setDragon = (dragonRule: DragonRule) => onChange({ ...rules, dragonRule });
  const setTie = (tieRule: TieRule) => onChange({ ...rules, tieRule });
  const setWinsToWin = (winsToWin: number) => onChange({ ...rules, winsToWin });
  const setTotalRounds = (totalRounds: number) => onChange({ ...rules, totalRounds });

  const numberOptionsWins = [3, 4, 5, 6, 7];
  const numberOptionsRounds = [7, 8, 9, 10, 12, 15];

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '0.85rem',
      padding: '1rem',
      background: 'rgba(15, 23, 42, 0.7)',
      border: '1px solid rgba(148, 163, 184, 0.2)',
      borderRadius: '0.75rem',
      width: '20rem',
      maxWidth: '90vw',
    }}>
      <div style={{ color: '#fbbf24', fontWeight: 800, fontSize: '0.95rem' }}>{t.title}</div>

      <div style={groupStyle}>
        <div style={labelStyle}>{t.dragon}</div>
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          <button
            onClick={() => !disabled && setDragon('loses-to-1')}
            style={pillButton(rules.dragonRule === 'loses-to-1', disabled)}
            disabled={disabled}
          >
            {t.dragonLosesTo1}
          </button>
          <button
            onClick={() => !disabled && setDragon('beats-all')}
            style={pillButton(rules.dragonRule === 'beats-all', disabled)}
            disabled={disabled}
          >
            {t.dragonBeatsAll}
          </button>
        </div>
      </div>

      <div style={groupStyle}>
        <div style={labelStyle}>{t.tie}</div>
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          <button
            onClick={() => !disabled && setTie('discard')}
            style={pillButton(rules.tieRule === 'discard', disabled)}
            disabled={disabled}
          >
            {t.tieDiscard}
          </button>
          <button
            onClick={() => !disabled && setTie('replay')}
            style={pillButton(rules.tieRule === 'replay', disabled)}
            disabled={disabled}
          >
            {t.tieReplay}
          </button>
        </div>
      </div>

      <div style={groupStyle}>
        <div style={labelStyle}>{t.wins}</div>
        <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
          {numberOptionsWins.map(n => (
            <button
              key={n}
              onClick={() => !disabled && setWinsToWin(n)}
              style={pillButton(rules.winsToWin === n, disabled)}
              disabled={disabled}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      <div style={groupStyle}>
        <div style={labelStyle}>{t.rounds}</div>
        <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
          {numberOptionsRounds.map(n => (
            <button
              key={n}
              onClick={() => !disabled && setTotalRounds(n)}
              style={pillButton(rules.totalRounds === n, disabled)}
              disabled={disabled}
            >
              {n}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
