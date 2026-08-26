/**
 * Riichi Mahjong — the action prompt.
 *
 * Shows every non-discard action the engine is offering the human, as buttons,
 * with **no timeout** (§M6: "人間はじっくり型"). That covers both windows:
 *
 * - `call` phase — ron, pon, chi, kan, pass
 * - `discard` phase — tsumo, closed/added kan, nine terminals and honours
 *   (the plain discards belong to `HandView`, so they are filtered out here)
 *
 * A claim that can be made in more than one way — chi with two different
 * sequences, pon that either uses or keeps a red five — expands into a second
 * row of tile buttons rather than picking for the player.
 */

import { useState, type JSX } from 'react';

import type { Action, ActionType, TileId } from './engine/types';
import type { MahjongCopy } from './i18n';
import styles from './CallPrompt.module.css';
import { TileById } from './TileSvg';

/** Claim types, in the order they are offered — most committal first. */
export const CLAIM_ORDER: readonly ActionType[] = [
  'ron',
  'tsumo',
  'minkan',
  'ankan',
  'kakan',
  'pon',
  'chi',
  'kyuushu',
  'pass',
];

export interface ClaimGroup {
  type: ActionType;
  /** Every distinct way of making this claim; length 1 means "just do it". */
  actions: Action[];
}

/**
 * Bucket the hero's legal actions into one group per claim type.
 *
 * Plain discards are dropped (the hand owns those) and the groups come back in
 * {@link CLAIM_ORDER}, so the button row is stable no matter what order the
 * engine enumerated in.
 */
export function groupClaims(actions: readonly Action[]): ClaimGroup[] {
  const buckets = new Map<ActionType, Action[]>();
  for (const action of actions) {
    if (action.type === 'discard') continue;
    const existing = buckets.get(action.type);
    if (existing === undefined) buckets.set(action.type, [action]);
    else existing.push(action);
  }
  const groups: ClaimGroup[] = [];
  for (const type of CLAIM_ORDER) {
    const bucket = buckets.get(type);
    if (bucket !== undefined) groups.push({ type, actions: bucket });
  }
  return groups;
}

/** Tiles to show on the button for one concrete claim. */
export function claimTiles(action: Action): TileId[] {
  switch (action.type) {
    case 'chi':
    case 'pon':
    case 'minkan':
      return [...action.tiles];
    case 'ankan':
      // Four copies of the kind; copy 0 may be the red five, so start at 1.
      return [action.kind * 4 + 1];
    case 'kakan':
      return [action.tile];
    default:
      return [];
  }
}

function claimLabel(type: ActionType, copy: MahjongCopy): string {
  switch (type) {
    case 'ron':
      return copy.actionRon;
    case 'tsumo':
      return copy.actionTsumo;
    case 'chi':
      return copy.actionChi;
    case 'pon':
      return copy.actionPon;
    case 'minkan':
      return copy.actionKan;
    case 'ankan':
      return copy.actionAnkan;
    case 'kakan':
      return copy.actionKakan;
    case 'kyuushu':
      return copy.actionKyuushu;
    default:
      return copy.actionPass;
  }
}

const WINNING_CLAIMS = new Set<ActionType>(['ron', 'tsumo']);

export interface CallPromptProps {
  /** `legalActions(state, heroSeat)`. Plain discards are ignored. */
  actions: readonly Action[];
  copy: MahjongCopy;
  onAct: (action: Action) => void;
  /** Greys the prompt out while an action is already being applied. */
  disabled?: boolean;
}

export function CallPrompt({
  actions,
  copy,
  onAct,
  disabled = false,
}: CallPromptProps): JSX.Element | null {
  const [expanded, setExpanded] = useState<ActionType | null>(null);
  const groups = groupClaims(actions);
  if (groups.length === 0) return null;

  const openGroup = groups.find((group) => group.type === expanded) ?? null;

  return (
    <section className={styles.prompt} aria-label={copy.promptTitle}>
      <span className={styles.title}>{copy.promptTitle}</span>

      <div className={styles.buttons}>
        {groups.map((group) => (
          <button
            key={group.type}
            type="button"
            className={styles.claimButton}
            data-claim={group.type}
            data-win={WINNING_CLAIMS.has(group.type)}
            data-expanded={expanded === group.type}
            disabled={disabled}
            aria-expanded={group.actions.length > 1 ? expanded === group.type : undefined}
            onClick={() => {
              if (group.actions.length === 1) {
                setExpanded(null);
                onAct(group.actions[0]);
                return;
              }
              setExpanded((current) => (current === group.type ? null : group.type));
            }}
          >
            {claimLabel(group.type, copy)}
            {group.actions.length > 1 && (
              <span className={styles.count}>×{group.actions.length}</span>
            )}
          </button>
        ))}
      </div>

      {openGroup !== null && (
        <div className={styles.choices}>
          <span className={styles.choicesLabel}>{copy.chooseTiles}</span>
          <div className={styles.choiceRow}>
            {openGroup.actions.map((action, index) => {
              const tiles = claimTiles(action);
              return (
                <button
                  key={`${openGroup.type}-${index}-${tiles.join('-')}`}
                  type="button"
                  className={styles.choiceButton}
                  disabled={disabled}
                  onClick={() => {
                    setExpanded(null);
                    onAct(action);
                  }}
                >
                  {tiles.map((tile, tileIndex) => (
                    <TileById key={`${tile}-${tileIndex}`} tileId={tile} size="sm" />
                  ))}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

export default CallPrompt;
