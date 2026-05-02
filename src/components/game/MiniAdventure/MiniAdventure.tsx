/**
 * Mini Adventure - React Component
 * A roguelike dungeon crawler game
 */

'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { RotateCcw, Heart, Sword, Shield, Flame, Package, Info } from 'lucide-react';
import { GameTopBar, InfoModal, GameStats } from '../common';
import { useFeatureLifecycle } from '@/hooks/useActivityTracker';
import {
  GameState,
  ActionType,
  Direction,
  TileType,
  ItemType,
  MAP_WIDTH,
  MAP_HEIGHT,
  getVisionRadius,
  StatusEffect,
} from './types';
import { createGameState, processAction, getDirectionFromKey } from './GameEngine';
import { getItemChar, getItemColor } from './Items';
import { getEnemyChar, getEnemyColor } from './Enemies';

// Tile display characters
const TILE_CHARS: Record<TileType, string> = {
  [TileType.WALL]: '#',
  [TileType.FLOOR]: '.',
  [TileType.STAIRS_DOWN]: '>',
  [TileType.DOOR]: '+',
};

const TILE_COLORS: Record<TileType, string> = {
  [TileType.WALL]: '#4b5563',
  [TileType.FLOOR]: '#374151',
  [TileType.STAIRS_DOWN]: '#fbbf24',
  [TileType.DOOR]: '#92400e',
};

const MiniAdventure: React.FC = () => {
  useFeatureLifecycle('game.mini-adventure');
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [showInventory, setShowInventory] = useState(false);
  const [selectedItemIndex, setSelectedItemIndex] = useState<number | null>(null);
  const [stats, setStats] = useState<GameStats>({ wins: 0, losses: 0, draws: 0 });
  const [showStartScreen, setShowStartScreen] = useState(true);
  const gameContainerRef = useRef<HTMLDivElement>(null);

  // Initialize game
  const startNewGame = useCallback(() => {
    const newState = createGameState();
    setGameState(newState);
    setShowStartScreen(false);
    setShowInventory(false);
    setSelectedItemIndex(null);
  }, []);

  // Handle keyboard input
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!gameState || gameState.gameOver || showStartScreen) return;

    // Prevent default for game keys
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd', 'g', '.', '>', 'i', 'p', 'Escape'].includes(e.key)) {
      e.preventDefault();
    }

    // Toggle inventory
    if (e.key === 'i' || e.key === 'I') {
      setShowInventory(prev => !prev);
      setSelectedItemIndex(null);
      return;
    }

    // Close inventory
    if (e.key === 'Escape') {
      if (showInventory) {
        setShowInventory(false);
        setSelectedItemIndex(null);
      }
      return;
    }

    // If inventory is open, handle item selection
    if (showInventory) {
      const num = parseInt(e.key);
      if (!isNaN(num) && num >= 1 && num <= gameState.player.inventory.length) {
        setSelectedItemIndex(num - 1);
        return;
      }

      if (selectedItemIndex !== null) {
        // Use selected item
        if (e.key === 'u' || e.key === 'U' || e.key === 'Enter') {
          const newState = processAction(gameState, {
            type: ActionType.USE_ITEM,
            itemIndex: selectedItemIndex,
          });
          setGameState(newState);
          setSelectedItemIndex(null);
          return;
        }

        // Drop selected item
        if (e.key === 'd' || e.key === 'D') {
          const newState = processAction(gameState, {
            type: ActionType.DROP,
            itemIndex: selectedItemIndex,
          });
          setGameState(newState);
          setSelectedItemIndex(null);
          return;
        }

        // Throw card in direction
        const dir = getDirectionFromKey(e.key);
        if (dir && gameState.player.inventory[selectedItemIndex]?.type === ItemType.CARD) {
          const newState = processAction(gameState, {
            type: ActionType.USE_ITEM,
            itemIndex: selectedItemIndex,
            direction: dir,
          });
          setGameState(newState);
          setSelectedItemIndex(null);
          setShowInventory(false);
          return;
        }
      }
      return;
    }

    // Movement
    const direction = getDirectionFromKey(e.key);
    if (direction) {
      const newState = processAction(gameState, {
        type: ActionType.MOVE,
        direction,
      });
      setGameState(newState);
      return;
    }

    // Pick up item
    if (e.key === 'g' || e.key === 'G' || e.key === ',') {
      const newState = processAction(gameState, { type: ActionType.PICK_UP });
      setGameState(newState);
      return;
    }

    // Use stairs
    if (e.key === '>' || e.key === 'Enter') {
      const newState = processAction(gameState, { type: ActionType.USE_STAIRS });
      setGameState(newState);
      if (newState.victory) {
        setStats(prev => ({ ...prev, wins: prev.wins + 1 }));
      }
      return;
    }

    // Wait
    if (e.key === '.' || e.key === ' ') {
      const newState = processAction(gameState, { type: ActionType.WAIT });
      setGameState(newState);
      return;
    }

    // Use pet
    if (e.key === 'p' || e.key === 'P') {
      const newState = processAction(gameState, { type: ActionType.USE_PET });
      setGameState(newState);
      return;
    }
  }, [gameState, showStartScreen, showInventory, selectedItemIndex]);

  // Add keyboard listener
  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Focus game container
  useEffect(() => {
    if (gameContainerRef.current && !showStartScreen) {
      gameContainerRef.current.focus();
    }
  }, [showStartScreen]);

  // Track game over
  useEffect(() => {
    if (gameState?.gameOver && !gameState.victory) {
      setStats(prev => ({ ...prev, losses: prev.losses + 1 }));
    }
  }, [gameState?.gameOver, gameState?.victory]);

  // Render map
  const renderMap = () => {
    if (!gameState) return null;

    const { player, floor } = gameState;
    const lines: React.ReactElement[] = [];

    for (let y = 0; y < MAP_HEIGHT; y++) {
      const chars: React.ReactElement[] = [];

      for (let x = 0; x < MAP_WIDTH; x++) {
        const tile = floor.tiles[y][x];
        let char = TILE_CHARS[tile.type];
        let color = TILE_COLORS[tile.type];
        let bgColor = 'transparent';

        // Check if visible or explored
        if (!tile.visible && !tile.explored) {
          char = ' ';
          color = '#000';
        } else if (!tile.visible && tile.explored) {
          // Dim explored tiles
          color = '#1f2937';
        }

        // Player
        if (x === player.x && y === player.y) {
          char = '@';
          color = '#60a5fa';
          bgColor = 'rgba(96, 165, 250, 0.2)';
        }

        // Enemies (only if visible)
        if (tile.visible) {
          const enemy = floor.enemies.find(e => e.x === x && e.y === y && e.hp > 0);
          if (enemy) {
            char = getEnemyChar(enemy);
            color = getEnemyColor(enemy);
          }

          // Items
          const item = floor.items.find(i => i.x === x && i.y === y);
          if (item && !enemy) {
            char = getItemChar(item.item);
            color = getItemColor(item.item);
          }
        }

        chars.push(
          <span
            key={`${x}-${y}`}
            style={{
              color,
              backgroundColor: bgColor,
              fontFamily: 'monospace',
            }}
          >
            {char}
          </span>
        );
      }

      lines.push(
        <div key={y} style={{ height: '16px', lineHeight: '16px' }}>
          {chars}
        </div>
      );
    }

    return lines;
  };

  // Render status bar
  const renderStatusBar = () => {
    if (!gameState) return null;
    const { player, currentFloor, turn } = gameState;

    return (
      <div style={{
        display: 'flex',
        gap: '1.5rem',
        padding: '0.5rem 1rem',
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        borderRadius: '0.5rem',
        marginBottom: '0.5rem',
        flexWrap: 'wrap',
        justifyContent: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: '#ef4444' }}>
          <Heart size={16} />
          <span>{player.hp}/{player.maxHp}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: '#60a5fa' }}>
          <Sword size={16} />
          <span>{player.baseAttack + (player.weapon?.weaponData?.attack || 0)}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: '#34d399' }}>
          <Shield size={16} />
          <span>{player.baseDefense + (player.armor?.armorData?.defense || 0)}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: '#fbbf24' }}>
          <Flame size={16} />
          <span>{player.torch}</span>
        </div>
        <div style={{ color: '#9ca3af' }}>
          Lv.{player.level} | Floor {currentFloor} | Turn {turn}
        </div>
        {player.status !== StatusEffect.NONE && (
          <div style={{ color: '#f472b6' }}>
            [{player.status}]
          </div>
        )}
        {player.pet && (
          <div style={{ color: '#a78bfa' }}>
            Pet: {player.pet}
          </div>
        )}
      </div>
    );
  };

  // Render message log
  const renderMessages = () => {
    if (!gameState) return null;

    const recentMessages = gameState.messages.slice(-5);

    return (
      <div style={{
        padding: '0.5rem',
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        borderRadius: '0.5rem',
        marginTop: '0.5rem',
        maxHeight: '100px',
        overflow: 'auto',
      }}>
        {recentMessages.map((msg, i) => (
          <div
            key={i}
            style={{
              color: msg.type === 'combat' ? '#ef4444' :
                     msg.type === 'item' ? '#34d399' :
                     msg.type === 'important' ? '#fbbf24' : '#9ca3af',
              fontSize: '0.875rem',
            }}
          >
            {msg.text}
          </div>
        ))}
      </div>
    );
  };

  // Render inventory panel
  const renderInventory = () => {
    if (!gameState || !showInventory) return null;

    const { player } = gameState;

    return (
      <div style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        backgroundColor: 'rgba(0, 0, 0, 0.95)',
        border: '2px solid #4b5563',
        borderRadius: '0.5rem',
        padding: '1rem',
        minWidth: '300px',
        zIndex: 100,
      }}>
        <h3 style={{ color: '#fff', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Package size={20} />
          Inventory ({player.inventory.length}/10)
        </h3>

        {/* Equipment */}
        <div style={{ marginBottom: '1rem', padding: '0.5rem', backgroundColor: 'rgba(75, 85, 99, 0.3)', borderRadius: '0.25rem' }}>
          <div style={{ color: '#9ca3af', fontSize: '0.75rem', marginBottom: '0.25rem' }}>Equipped:</div>
          <div style={{ color: '#60a5fa' }}>
            Weapon: {player.weapon?.name || 'None'}
          </div>
          <div style={{ color: '#34d399' }}>
            Armor: {player.armor?.name || 'None'}
          </div>
        </div>

        {/* Items */}
        {player.inventory.length === 0 ? (
          <div style={{ color: '#6b7280' }}>No items</div>
        ) : (
          player.inventory.map((item, i) => (
            <div
              key={item.id}
              style={{
                padding: '0.5rem',
                backgroundColor: selectedItemIndex === i ? 'rgba(96, 165, 250, 0.2)' : 'transparent',
                borderRadius: '0.25rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
              onClick={() => setSelectedItemIndex(i)}
            >
              <span style={{ color: '#6b7280' }}>{i + 1}.</span>
              <span style={{ color: getItemColor(item) }}>{getItemChar(item)}</span>
              <span style={{ color: '#fff' }}>{item.name}</span>
              {item.type === ItemType.EGG && item.eggTurns !== undefined && (
                <span style={{ color: '#9ca3af', fontSize: '0.75rem' }}>
                  ({item.eggTurns}/100)
                </span>
              )}
            </div>
          ))
        )}

        {/* Instructions */}
        <div style={{ marginTop: '1rem', color: '#6b7280', fontSize: '0.75rem' }}>
          Press number to select, U to use, D to drop, ESC to close
          {selectedItemIndex !== null && gameState.player.inventory[selectedItemIndex]?.type === ItemType.CARD && (
            <div style={{ color: '#f472b6' }}>Arrow key to throw card</div>
          )}
        </div>
      </div>
    );
  };

  // Render game over screen
  const renderGameOver = () => {
    if (!gameState?.gameOver) return null;

    return (
      <div style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        backgroundColor: 'rgba(0, 0, 0, 0.95)',
        border: `2px solid ${gameState.victory ? '#22c55e' : '#ef4444'}`,
        borderRadius: '1rem',
        padding: '2rem',
        textAlign: 'center',
        zIndex: 100,
      }}>
        <h2 style={{
          color: gameState.victory ? '#22c55e' : '#ef4444',
          fontSize: '2rem',
          marginBottom: '1rem',
        }}>
          {gameState.victory ? 'Victory!' : 'Game Over'}
        </h2>
        <div style={{ color: '#9ca3af', marginBottom: '1.5rem' }}>
          <div>Floor: {gameState.currentFloor}</div>
          <div>Level: {gameState.player.level}</div>
          <div>Turns: {gameState.turn}</div>
        </div>
        <button
          onClick={startNewGame}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.75rem 1.5rem',
            backgroundColor: '#3b82f6',
            color: '#fff',
            border: 'none',
            borderRadius: '0.5rem',
            cursor: 'pointer',
            fontSize: '1rem',
            margin: '0 auto',
          }}
        >
          <RotateCcw size={20} />
          Play Again
        </button>
      </div>
    );
  };

  // Info modal content
  const infoContent = (
    <div style={{ color: '#d1d5db' }}>
      <p style={{ marginBottom: '0.75rem' }}>
        <strong>Objective:</strong> Descend through 10 floors and defeat the Dragon boss!
      </p>
      <p style={{ marginBottom: '0.5rem' }}><strong>Controls:</strong></p>
      <ul style={{ listStyle: 'none', marginLeft: '0', marginBottom: '0.75rem' }}>
        <li>Arrow Keys / WASD - Move & Attack</li>
        <li>G or , - Pick up item</li>
        <li>&gt; or Enter - Use stairs</li>
        <li>. or Space - Wait a turn</li>
        <li>I - Open inventory</li>
        <li>P - Use pet ability</li>
      </ul>
      <p style={{ marginBottom: '0.5rem' }}><strong>Tips:</strong></p>
      <ul style={{ listStyle: 'disc', marginLeft: '1.5rem' }}>
        <li>Keep your torch lit - darkness increases damage taken!</li>
        <li>HP regenerates slowly when you move or attack</li>
        <li>Eggs hatch after 100 turns into helpful pets</li>
        <li>Watch out for Worms - they eat your eggs!</li>
        <li>The Dragon boss resists magic attacks</li>
      </ul>
    </div>
  );

  // Start screen
  if (showStartScreen) {
    return (
      <div style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(to bottom, #111827, #000)',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        padding: '1rem',
      }}>
        <div style={{
          background: 'rgba(0, 0, 0, 0.95)',
          border: '3px solid #3b82f6',
          borderRadius: '1rem',
          padding: '3rem',
          textAlign: 'center',
          maxWidth: '500px',
        }}>
          <h1 style={{
            color: '#fff',
            fontSize: '2.5rem',
            marginBottom: '0.5rem',
          }}>
            Mini Adventure
          </h1>
          <p style={{
            color: '#9ca3af',
            marginBottom: '2rem',
          }}>
            A roguelike dungeon crawler
          </p>

          <div style={{
            color: '#6b7280',
            fontSize: '0.875rem',
            marginBottom: '2rem',
            textAlign: 'left',
          }}>
            <p>Descend through 10 floors of the dungeon.</p>
            <p>Find equipment, manage your torch, and defeat the Dragon!</p>
            <p>Be careful - death is permanent!</p>
          </div>

          <button
            onClick={startNewGame}
            style={{
              background: '#3b82f6',
              border: 'none',
              borderRadius: '0.5rem',
              color: '#fff',
              fontSize: '1.5rem',
              fontWeight: 'bold',
              padding: '1rem 3rem',
              cursor: 'pointer',
              width: '100%',
            }}
          >
            Start Game
          </button>

          <button
            onClick={() => setShowInfo(true)}
            style={{
              background: 'transparent',
              border: '1px solid #4b5563',
              borderRadius: '0.5rem',
              color: '#9ca3af',
              fontSize: '1rem',
              padding: '0.75rem 2rem',
              cursor: 'pointer',
              width: '100%',
              marginTop: '1rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
            }}
          >
            <Info size={18} />
            How to Play
          </button>
        </div>

        <InfoModal
          isOpen={showInfo}
          title="How to Play"
          onClose={() => setShowInfo(false)}
        >
          {infoContent}
        </InfoModal>
      </div>
    );
  }

  // Main game screen
  return (
    <div
      ref={gameContainerRef}
      tabIndex={0}
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(to bottom, #111827, #000)',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        padding: '1rem',
        outline: 'none',
      }}
    >
      <div style={{ width: '100%', maxWidth: '700px' }}>
        <GameTopBar
          stats={stats}
          onInfoClick={() => setShowInfo(true)}
        />

        {renderStatusBar()}

        <div style={{
          position: 'relative',
          backgroundColor: '#000',
          padding: '0.5rem',
          borderRadius: '0.5rem',
          border: '2px solid #374151',
        }}>
          <div style={{
            fontFamily: 'monospace',
            fontSize: '14px',
            lineHeight: '16px',
            whiteSpace: 'pre',
          }}>
            {renderMap()}
          </div>

          {renderInventory()}
          {renderGameOver()}
        </div>

        {renderMessages()}

        {/* Controls hint */}
        <div style={{
          marginTop: '0.5rem',
          textAlign: 'center',
          color: '#6b7280',
          fontSize: '0.75rem',
        }}>
          Move: Arrows/WASD | Pick up: G | Stairs: &gt; | Wait: . | Inventory: I | Pet: P
        </div>
      </div>

      <InfoModal
        isOpen={showInfo}
        title="How to Play"
        onClose={() => setShowInfo(false)}
      >
        {infoContent}
      </InfoModal>
    </div>
  );
};

export default MiniAdventure;
export { MiniAdventure };
