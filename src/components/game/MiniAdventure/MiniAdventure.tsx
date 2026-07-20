/**
 * Mini Adventure - React Component
 * A roguelike dungeon crawler game.
 */

'use client';

import { useFeatureLifecycle } from '@/hooks/useActivityTracker';
import {
  ArrowDown, ArrowDownLeft, ArrowDownRight, ArrowLeft, ArrowRight,
  ArrowUp, ArrowUpLeft, ArrowUpRight, ChevronsDown, Flame, Hand,
  Heart, Info, PawPrint, Package, RotateCcw, Shield, Sword, Timer,
} from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { GameStats, GameTopBar, InfoModal } from '../common';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { getEnemyChar, getEnemyColor } from './Enemies';
import {
  createGameState, getDirectionFromKey, getPlayerAttack, getPlayerDefense, processAction,
} from './GameEngine';
import { getMiniAdventureStrings } from './i18n';
import { getItemChar, getItemColor } from './Items';
import {
  ActionType, Direction, GameState, ItemType, MAX_FLOORS, MiniAdventureDifficulty,
  MAP_HEIGHT, MAP_WIDTH, StatusEffect, TileType, TORCH_MAX,
} from './types';
import styles from './MiniAdventure.module.css';

const TILE_CHARS: Record<TileType, string> = {
  [TileType.WALL]: '#',
  [TileType.FLOOR]: '·',
  [TileType.STAIRS_DOWN]: '>',
  [TileType.DOOR]: '+',
};

const TILE_COLORS: Record<TileType, string> = {
  [TileType.WALL]: '#475569',
  [TileType.FLOOR]: '#334155',
  [TileType.STAIRS_DOWN]: '#fbbf24',
  [TileType.DOOR]: '#b45309',
};

const DIFFICULTIES: MiniAdventureDifficulty[] = ['easy', 'normal', 'hard'];

const MiniAdventure: React.FC = () => {
  useFeatureLifecycle('game.mini-adventure');
  const { language } = useGameLanguage();
  const t = getMiniAdventureStrings(language);

  const [gameState, setGameState] = useState<GameState | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [showInventory, setShowInventory] = useState(false);
  const [selectedItemIndex, setSelectedItemIndex] = useState<number | null>(null);
  const [stats, setStats] = useState<GameStats>({ wins: 0, losses: 0, draws: 0 });
  const [showStartScreen, setShowStartScreen] = useState(true);
  const [difficulty, setDifficulty] = useState<MiniAdventureDifficulty>('normal');
  const gameContainerRef = useRef<HTMLDivElement>(null);

  // gameStateRef mirrors gameState synchronously so rapid dispatches (key
  // repeat before React commits a re-render) act on the latest snapshot
  // instead of a stale render-time closure. It is written eagerly at every
  // point that replaces gameState; the effect covers any other path.
  const gameStateRef = useRef<GameState | null>(null);
  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  const startNewGame = useCallback((diff: MiniAdventureDifficulty = difficulty) => {
    const fresh = createGameState(diff);
    gameStateRef.current = fresh;
    setGameState(fresh);
    setShowStartScreen(false);
    setShowInventory(false);
    setSelectedItemIndex(null);
  }, [difficulty]);

  const returnToMenu = useCallback(() => {
    gameStateRef.current = null;
    setGameState(null);
    setShowStartScreen(true);
    setShowInventory(false);
    setSelectedItemIndex(null);
  }, []);

  // ---- Action dispatch helpers (shared by keyboard + touch) ----
  // processAction (which rolls Math.random) runs OUTSIDE the setState updater:
  // updaters must stay pure and Strict Mode runs them twice in dev.
  const dispatch = useCallback((action: Parameters<typeof processAction>[1]) => {
    const current = gameStateRef.current;
    if (!current || current.gameOver) return;
    const next = processAction(current, action);
    gameStateRef.current = next;
    setGameState(next);
  }, []);

  // Record win/loss as a side effect of the run finishing, not inside a state
  // updater. hasRecordedRef keeps this idempotent so the double-invoked effect
  // in dev Strict Mode can't double-count.
  const hasRecordedRef = useRef(false);
  useEffect(() => {
    if (!gameState || !gameState.gameOver) {
      hasRecordedRef.current = false;
      return;
    }
    if (hasRecordedRef.current) return;
    hasRecordedRef.current = true;
    setStats(s => gameState.victory
      ? { ...s, wins: s.wins + 1 }
      : { ...s, losses: s.losses + 1 });
  }, [gameState]);

  const move = useCallback((direction: Direction) => dispatch({ type: ActionType.MOVE, direction }), [dispatch]);

  const activateSelectedItem = useCallback((direction?: Direction) => {
    if (selectedItemIndex === null) return;
    dispatch({ type: ActionType.USE_ITEM, itemIndex: selectedItemIndex, direction });
    setSelectedItemIndex(null);
    if (direction) setShowInventory(false);
  }, [dispatch, selectedItemIndex]);

  const dropSelectedItem = useCallback(() => {
    if (selectedItemIndex === null) return;
    dispatch({ type: ActionType.DROP, itemIndex: selectedItemIndex });
    setSelectedItemIndex(null);
  }, [dispatch, selectedItemIndex]);

  // ---- Keyboard input ----
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!gameState || gameState.gameOver || showStartScreen) return;

    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd', 'g', '.', '>', 'i', 'p', ' ', 'Escape'].includes(e.key)) {
      e.preventDefault();
    }

    if (e.key === 'i' || e.key === 'I') {
      setShowInventory(prev => !prev);
      setSelectedItemIndex(null);
      return;
    }

    if (e.key === 'Escape') {
      if (showInventory) {
        setShowInventory(false);
        setSelectedItemIndex(null);
      }
      return;
    }

    if (showInventory) {
      const num = parseInt(e.key, 10);
      if (!isNaN(num) && num >= 1 && num <= gameState.player.inventory.length) {
        setSelectedItemIndex(num - 1);
        return;
      }
      if (selectedItemIndex !== null) {
        if (e.key === 'u' || e.key === 'U' || e.key === 'Enter') { activateSelectedItem(); return; }
        if (e.key === 'd' || e.key === 'D') { dropSelectedItem(); return; }
        const dir = getDirectionFromKey(e.key);
        if (dir && gameState.player.inventory[selectedItemIndex]?.type === ItemType.CARD) {
          activateSelectedItem(dir);
          return;
        }
      }
      return;
    }

    const direction = getDirectionFromKey(e.key);
    if (direction) { move(direction); return; }

    if (e.key === 'g' || e.key === 'G' || e.key === ',') { dispatch({ type: ActionType.PICK_UP }); return; }
    if (e.key === '>' || e.key === 'Enter') { dispatch({ type: ActionType.USE_STAIRS }); return; }
    if (e.key === '.' || e.key === ' ') { dispatch({ type: ActionType.WAIT }); return; }
    if (e.key === 'p' || e.key === 'P') { dispatch({ type: ActionType.USE_PET }); return; }
  }, [gameState, showStartScreen, showInventory, selectedItemIndex, move, dispatch, activateSelectedItem, dropSelectedItem]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    if (gameContainerRef.current && !showStartScreen) gameContainerRef.current.focus();
  }, [showStartScreen]);

  // ---- Rendering ----
  const renderMap = () => {
    if (!gameState) return null;
    const { player, floor } = gameState;
    const cells: React.ReactElement[] = [];

    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        const tile = floor.tiles[y][x];
        let char = TILE_CHARS[tile.type];
        let color = TILE_COLORS[tile.type];
        let extraClass = '';

        if (!tile.visible && !tile.explored) {
          char = ' ';
          color = 'transparent';
        } else if (!tile.visible && tile.explored) {
          color = '#1e293b';
        }

        if (tile.type === TileType.STAIRS_DOWN && (tile.visible || tile.explored)) {
          extraClass = styles.stairs;
        }

        if (tile.visible) {
          const enemy = floor.enemies.find(e => e.x === x && e.y === y && e.hp > 0);
          if (enemy) {
            char = getEnemyChar(enemy);
            color = getEnemyColor(enemy);
          } else {
            const item = floor.items.find(i => i.x === x && i.y === y);
            if (item) {
              char = getItemChar(item.item);
              color = getItemColor(item.item);
            }
          }
        }

        if (x === player.x && y === player.y) {
          char = '@';
          color = '#93c5fd';
          extraClass = styles.player;
        }

        cells.push(
          <span
            key={`${x}-${y}`}
            className={`${styles.cell} ${extraClass}`}
            style={{ color }}
            aria-hidden="true"
          >
            {char}
          </span>,
        );
      }
    }

    return (
      <div
        className={styles.mapGrid}
        style={{ gridTemplateColumns: `repeat(${MAP_WIDTH}, 1fr)`, fontSize: 'clamp(7px, 1.7vw, 13px)' }}
        role="img"
        aria-label={gameState.isOnSurface ? t.aria.surfaceMap : t.aria.floorMap(gameState.currentFloor)}
      >
        {cells}
      </div>
    );
  };

  const renderHud = () => {
    if (!gameState) return null;
    const { player, currentFloor, turn, isOnSurface } = gameState;
    const atk = getPlayerAttack(player);
    const def = getPlayerDefense(player);
    const hpPct = Math.max(0, Math.round((player.hp / player.maxHp) * 100));
    const torchPct = Math.max(0, Math.round((player.torch / TORCH_MAX) * 100));

    return (
      <>
        <div className={styles.hud}>
          <div className={styles.statCard}>
            <div className={styles.statHead}><Heart size={13} color="var(--ma-hp)" />{t.hp}</div>
            <div className={styles.statValue}>{Math.max(0, player.hp)}/{player.maxHp}</div>
            <div className={styles.bar}>
              <div className={styles.barFill} style={{ width: `${hpPct}%`, background: 'var(--ma-hp)' }} />
            </div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statHead}><Flame size={13} color="var(--ma-torch)" />{t.torch}</div>
            <div className={styles.statValue}>{player.torch}</div>
            <div className={styles.bar}>
              <div className={styles.barFill} style={{ width: `${torchPct}%`, background: 'var(--ma-torch)' }} />
            </div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statHead}><Sword size={13} color="var(--ma-atk)" />{t.attack}</div>
            <div className={styles.statValue}>{atk}</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statHead}><Shield size={13} color="var(--ma-def)" />{t.defense}</div>
            <div className={styles.statValue}>{def}</div>
          </div>
        </div>

        <div className={styles.metaRow}>
          <span className={styles.metaPill}>{t.level} {player.level}</span>
          <span className={styles.metaPill}>
            {isOnSurface ? t.surface : `${t.floor} ${currentFloor}/${MAX_FLOORS}`}
          </span>
          <span className={styles.metaPill}><Timer size={12} /> {turn}</span>
          {player.status !== StatusEffect.NONE && (
            <span className={`${styles.metaPill} ${styles.statusPill}`}>{player.status}</span>
          )}
          {player.pet && (
            <span className={`${styles.metaPill} ${styles.petPill}`}><PawPrint size={12} /> {player.pet.replace(/_/g, ' ')}</span>
          )}
        </div>
      </>
    );
  };

  const renderMessages = () => {
    if (!gameState) return null;
    const recent = gameState.messages.slice(-6);
    return (
      <div className={styles.log} aria-live="polite">
        {recent.map((msg, i) => (
          <div
            key={`${msg.turn}-${i}`}
            className={`${styles.logLine} ${
              msg.type === 'combat' ? styles.logCombat :
              msg.type === 'item' ? styles.logItem :
              msg.type === 'important' ? styles.logImportant : styles.logInfo
            }`}
          >
            {msg.text}
          </div>
        ))}
      </div>
    );
  };

  const renderControls = () => {
    if (!gameState) return null;
    const dirBtn = (dir: Direction, label: string, Icon: React.ComponentType<{ size?: number }>) => (
      <button
        type="button"
        className={styles.dBtn}
        aria-label={label}
        onClick={() => move(dir)}
      >
        <Icon size={18} />
      </button>
    );

    return (
      <div className={styles.controls}>
        <div className={styles.dpad} aria-label={t.move}>
          {dirBtn(Direction.UP_LEFT, t.aria.dir.upLeft, ArrowUpLeft)}
          {dirBtn(Direction.UP, t.aria.dir.up, ArrowUp)}
          {dirBtn(Direction.UP_RIGHT, t.aria.dir.upRight, ArrowUpRight)}
          {dirBtn(Direction.LEFT, t.aria.dir.left, ArrowLeft)}
          <button type="button" className={`${styles.dBtn} ${styles.dCenter}`} aria-label={t.wait} onClick={() => dispatch({ type: ActionType.WAIT })}>
            {t.wait}
          </button>
          {dirBtn(Direction.RIGHT, t.aria.dir.right, ArrowRight)}
          {dirBtn(Direction.DOWN_LEFT, t.aria.dir.downLeft, ArrowDownLeft)}
          {dirBtn(Direction.DOWN, t.aria.dir.down, ArrowDown)}
          {dirBtn(Direction.DOWN_RIGHT, t.aria.dir.downRight, ArrowDownRight)}
        </div>

        <div className={styles.actionCol}>
          <button type="button" className={styles.actionBtn} onClick={() => dispatch({ type: ActionType.PICK_UP })}>
            <Hand size={15} /> {t.pickUp}
          </button>
          <button type="button" className={`${styles.actionBtn} ${styles.primary}`} onClick={() => dispatch({ type: ActionType.USE_STAIRS })}>
            <ChevronsDown size={15} /> {t.stairs}
          </button>
          <button
            type="button"
            className={styles.actionBtn}
            aria-expanded={showInventory}
            onClick={() => { setShowInventory(v => !v); setSelectedItemIndex(null); }}
          >
            <Package size={15} /> {t.openInventory}
          </button>
          <button type="button" className={styles.actionBtn} disabled={!gameState.player.pet} onClick={() => dispatch({ type: ActionType.USE_PET })}>
            <PawPrint size={15} /> {t.usePet}
          </button>
        </div>
      </div>
    );
  };

  const renderInventory = () => {
    if (!gameState || !showInventory) return null;
    const { player } = gameState;
    const selected = selectedItemIndex !== null ? player.inventory[selectedItemIndex] : null;
    const isCard = selected?.type === ItemType.CARD;
    const isEquip = selected?.type === ItemType.WEAPON || selected?.type === ItemType.ARMOR;

    return (
      <div className={styles.overlay} onClick={() => { setShowInventory(false); setSelectedItemIndex(null); }}>
        <div className={styles.panel} onClick={e => e.stopPropagation()} role="dialog" aria-label={t.inventory}>
          <div className={styles.panelTitle}>
            <Package size={18} /> {t.inventory} ({player.inventory.length}/10)
          </div>

          <div className={styles.equipBox}>
            <span className={styles.equipLabel}>{t.equipped}</span>
            <span style={{ color: 'var(--ma-atk)' }}>{t.weapon}: {player.weapon?.name || t.none}</span>
            <span style={{ color: 'var(--ma-def)' }}>{t.armor}: {player.armor?.name || t.none}</span>
          </div>

          {player.inventory.length === 0 ? (
            <div className={styles.hintText}>{t.noItems}</div>
          ) : (
            <div className={styles.itemList}>
              {player.inventory.map((item, i) => (
                <button
                  type="button"
                  key={item.id}
                  className={styles.itemRow}
                  data-selected={selectedItemIndex === i}
                  onClick={() => setSelectedItemIndex(i)}
                >
                  <span className={styles.itemGlyph} style={{ color: getItemColor(item) }}>{getItemChar(item)}</span>
                  <span className={styles.itemName}>{item.name}</span>
                  {item.type === ItemType.EGG && item.eggTurns !== undefined && (
                    <span className={styles.itemMeta}>{item.eggTurns}/60</span>
                  )}
                  {item.description && item.type !== ItemType.EGG && (
                    <span className={styles.itemMeta}>{item.description}</span>
                  )}
                </button>
              ))}
            </div>
          )}

          {selected && (
            <div className={styles.itemActions}>
              <button type="button" className={`${styles.smallBtn} ${styles.primary}`} onClick={() => activateSelectedItem()} disabled={isCard}>
                {isEquip ? t.equip : t.use}
              </button>
              <button type="button" className={styles.smallBtn} onClick={dropSelectedItem}>{t.drop}</button>
            </div>
          )}

          {isCard && (
            <div className={styles.hintText}>{t.throwHint}: {['←', '→', '↑', '↓'].join(' ')}
              <div className={styles.itemActions}>
                <button type="button" className={styles.smallBtn} onClick={() => activateSelectedItem(Direction.LEFT)} aria-label={t.aria.throwDir.left}>←</button>
                <button type="button" className={styles.smallBtn} onClick={() => activateSelectedItem(Direction.UP)} aria-label={t.aria.throwDir.up}>↑</button>
                <button type="button" className={styles.smallBtn} onClick={() => activateSelectedItem(Direction.DOWN)} aria-label={t.aria.throwDir.down}>↓</button>
                <button type="button" className={styles.smallBtn} onClick={() => activateSelectedItem(Direction.RIGHT)} aria-label={t.aria.throwDir.right}>→</button>
              </div>
            </div>
          )}

          {!selected && player.inventory.length > 0 && (
            <div className={styles.hintText}>{t.emptyHint}</div>
          )}

          <button type="button" className={styles.ghostBtn} style={{ marginTop: '0.75rem' }} onClick={() => { setShowInventory(false); setSelectedItemIndex(null); }}>
            {t.close}
          </button>
        </div>
      </div>
    );
  };

  const renderGameOver = () => {
    if (!gameState?.gameOver) return null;
    const win = gameState.victory;
    return (
      <div className={styles.overlay}>
        <div className={styles.panel} role="dialog" aria-label={win ? t.victory : t.defeat}>
          <div className={`${styles.gameOverTitle} ${win ? styles.gameOverWin : styles.gameOverLose}`}>
            {win ? t.victory : t.defeat}
          </div>
          <div className={styles.summaryGrid}>
            <div className={styles.summaryCell}>
              <div className={styles.summaryLabel}>{t.floor}</div>
              <div className={styles.summaryValue}>{gameState.currentFloor}</div>
            </div>
            <div className={styles.summaryCell}>
              <div className={styles.summaryLabel}>{t.level}</div>
              <div className={styles.summaryValue}>{gameState.player.level}</div>
            </div>
            <div className={styles.summaryCell}>
              <div className={styles.summaryLabel}>{t.enemiesDefeated}</div>
              <div className={styles.summaryValue}>{gameState.enemiesDefeated}</div>
            </div>
            <div className={styles.summaryCell}>
              <div className={styles.summaryLabel}>{t.turn}</div>
              <div className={styles.summaryValue}>{gameState.turn}</div>
            </div>
          </div>
          <div className={styles.overBtns}>
            <button type="button" className={styles.startBtn} onClick={() => startNewGame(gameState.difficulty)}>
              <RotateCcw size={18} /> {t.playAgain}
            </button>
            <button type="button" className={styles.ghostBtn} onClick={returnToMenu}>{t.backToMenu}</button>
          </div>
        </div>
      </div>
    );
  };

  const infoContent = (
    <div className={styles.infoBlock}>
      <p><span className={styles.infoHead}>{t.objective}:</span> {t.objectiveText}</p>
      <p className={styles.infoHead}>{t.controlsTitle}</p>
      <ul>{t.controlsList.map((c, i) => <li key={i}>{c}</li>)}</ul>
      <p className={styles.infoHead}>{t.tipsTitle}</p>
      <ul>{t.tips.map((tip, i) => <li key={i}>{tip}</li>)}</ul>
    </div>
  );

  // ---- Start screen ----
  if (showStartScreen) {
    return (
      <div className={styles.startScreen}>
        <div className={styles.startCard}>
          <h1 className={styles.startTitle}>{t.title}</h1>
          <p className={styles.startTag}>{t.tagline}</p>

          <div className={styles.introList}>
            {t.intro.map((line, i) => (
              <div className={styles.introItem} key={i}>
                <span className={styles.introBullet}>▸</span>
                <span>{line}</span>
              </div>
            ))}
          </div>

          <div className={styles.diffLabel}>{t.difficulty}</div>
          <div className={styles.diffGrid}>
            {DIFFICULTIES.map(d => (
              <button
                type="button"
                key={d}
                className={styles.diffBtn}
                data-selected={difficulty === d}
                aria-pressed={difficulty === d}
                onClick={() => setDifficulty(d)}
              >
                <div className={styles.diffName}>{t.difficultyNames[d]}</div>
                <div className={styles.diffDesc}>{t.difficultyDescs[d]}</div>
              </button>
            ))}
          </div>

          <button type="button" className={styles.startBtn} onClick={() => startNewGame(difficulty)}>
            <Sword size={20} /> {t.start}
          </button>
          <button type="button" className={styles.ghostBtn} onClick={() => setShowInfo(true)}>
            <Info size={18} /> {t.howToPlay}
          </button>
        </div>

        <InfoModal isOpen={showInfo} title={t.howToPlay} onClose={() => setShowInfo(false)}>
          {infoContent}
        </InfoModal>
      </div>
    );
  }

  // ---- Main game screen ----
  return (
    <div ref={gameContainerRef} tabIndex={0} className={styles.root}>
      <div className={styles.frame}>
        <GameTopBar stats={stats} onInfoClick={() => setShowInfo(true)} />

        {renderHud()}

        <div className={styles.mapWrap}>
          {renderMap()}
          {renderInventory()}
          {renderGameOver()}
        </div>

        {renderMessages()}
        {renderControls()}

        <div className={styles.keyHint}>{t.controlsHint}</div>
      </div>

      <InfoModal isOpen={showInfo} title={t.howToPlay} onClose={() => setShowInfo(false)}>
        {infoContent}
      </InfoModal>
    </div>
  );
};

export default MiniAdventure;
export { MiniAdventure };
