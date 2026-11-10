/**
 * Mini Adventure - "in sight" panel: a legend for the enemy letters on the map,
 * with each one's HP and what a hit does in either direction.
 */

import { ChevronDown, ChevronUp, Eye } from 'lucide-react';
import React from 'react';
import type { MiniAdventureStrings } from './i18n';
import type { DamageSpan, SightEnemy } from './Sight';
import { StatusEffect } from './types';
import styles from './MiniAdventure.module.css';

// The body keeps room for exactly this many rows (see .sightBody), so the log
// and controls below it never move as enemies come and go.
export const SIGHT_MAX_ROWS = 3;

const span = (d: DamageSpan) => (d.min === d.max ? `${d.min}` : `${d.min}–${d.max}`);

interface SightPanelProps {
  enemies: SightEnemy[];
  open: boolean;
  onToggle: () => void;
  t: MiniAdventureStrings;
}

export const SightPanel: React.FC<SightPanelProps> = ({ enemies, open, onToggle, t }) => {
  const shown = enemies.slice(0, SIGHT_MAX_ROWS);
  const s = t.sight;

  return (
    <section className={styles.sight} data-ma-sight="">
      <button
        type="button"
        className={styles.sightToggle}
        aria-expanded={open}
        onClick={onToggle}
      >
        <Eye size={14} aria-hidden="true" />
        <span className={styles.sightTitle}>{s.title}</span>
        <span className={styles.sightCount}>{s.count(shown.length, enemies.length)}</span>
        {open ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
      </button>

      {open && (
        <div className={styles.sightBody}>
          {shown.length === 0 ? (
            <div className={styles.sightEmpty}>{s.empty}</div>
          ) : (
            <ul className={styles.sightList} aria-label={s.title}>
              {shown.map(e => {
                const hpPct = e.maxHp > 0 ? Math.max(0, Math.min(100, Math.round((e.hp / e.maxHp) * 100))) : 0;
                const status = e.status === StatusEffect.NONE ? undefined : s.status[e.status];
                return (
                  <li key={e.id} className={styles.sightRow}>
                    <span className={styles.sightGlyph} style={{ color: e.color }} aria-hidden="true">{e.char}</span>
                    <span className={styles.sightNameCell}>
                      <span className={styles.sightName}>{s.enemyNames[e.type]}</span>
                      {status && <span className={styles.sightStatus}>{status}</span>}
                    </span>
                    <span className={styles.sightHp}>
                      <span className={styles.bar} aria-hidden="true">
                        <span className={styles.barFill} style={{ width: `${hpPct}%`, background: 'var(--ma-hp)' }} />
                      </span>
                      <span className={styles.sightHpNum}>{t.hp} {e.hp}/{e.maxHp}</span>
                    </span>
                    <span className={styles.sightStats}>
                      {[s.dealt(span(e.dealt)), s.taken(span(e.taken)), ...e.traits.map(trait => s.traits[trait])].join(' · ')}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </section>
  );
};
