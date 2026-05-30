'use client';

import type { DaifugoUITranslations } from '../constants/gameTranslations';
import type { DaifugoNetworkState,DaifugoRank } from './multiplayerTypes';
import { daifugoRankToLabel } from './multiplayerTypes';
import { CardBack,PlayingCard } from './PlayingCard';
import type { Card } from './types';
import { rankToLabel } from './types';

interface PlayerPosition {
  id: string;
  name: string;
  handCount: number;
  isTurn: boolean;
  isMe: boolean;
  finishedPos: number;
  rank: DaifugoRank | null;
}

interface DaifugoTableViewProps {
  gameState: DaifugoNetworkState;
  myPlayerId: string;
  playerSummaries: PlayerPosition[];
  pileCards: Card[];
  isReversed: boolean;
  playerNameOf: (id: string) => string;
  translations?: DaifugoUITranslations;
}

// Avatar colors based on player index
const AVATAR_COLORS = [
  '#ef4444', // red
  '#3b82f6', // blue
  '#22c55e', // green
  '#f59e0b', // amber
  '#8b5cf6', // purple
  '#ec4899', // pink
];

function PlayerAvatar({
  player,
  colorIndex,
  showCardsBelow,
  translations,
}: {
  player: PlayerPosition;
  colorIndex: number;
  showCardsBelow?: boolean;
  translations?: DaifugoUITranslations;
}) {
  const cardsLabel = translations?.cards ?? '枚';
  const finishedLabel = translations?.finishedLabel ?? 'あがり';
  const rankLabels = translations ? {
    daifugo: translations.daifugo,
    fugo: translations.fugo,
    heimin: translations.heimin,
    hinmin: translations.hinmin,
    daihinmin: translations.daihinmin,
  } : null;
  const color = AVATAR_COLORS[colorIndex % AVATAR_COLORS.length];
  const initial = player.name.charAt(0).toUpperCase();

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '0.25rem',
      }}
    >
      {/* Avatar circle */}
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: '50%',
          background: color,
          border: player.isTurn ? '3px solid #22c55e' : '2px solid rgba(255,255,255,0.3)',
          boxShadow: player.isTurn ? '0 0 12px rgba(34, 197, 94, 0.5)' : '0 2px 8px rgba(0,0,0,0.3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          fontSize: '1.1rem',
          fontWeight: 900,
          transition: 'all 0.3s ease',
        }}
      >
        {initial}
      </div>

      {/* Name and status */}
      <div
        style={{
          background: 'rgba(0,0,0,0.7)',
          borderRadius: '0.5rem',
          padding: '0.2rem 0.5rem',
          textAlign: 'center',
          minWidth: '3.5rem',
        }}
      >
        <div style={{
          color: player.isTurn ? '#22c55e' : '#e5e7eb',
          fontSize: '0.65rem',
          fontWeight: 700,
          whiteSpace: 'nowrap',
        }}>
          {player.name}
        </div>
        <div style={{
          color: '#9ca3af',
          fontSize: '0.6rem',
        }}>
          {player.handCount > 0 ? `${player.handCount}${cardsLabel}` : finishedLabel}
        </div>
        {player.rank && (
          <div style={{
            color: '#fbbf24',
            fontSize: '0.55rem',
            fontWeight: 700,
          }}>
            {rankLabels ? (rankLabels[player.rank] ?? daifugoRankToLabel(player.rank)) : daifugoRankToLabel(player.rank)}
          </div>
        )}
        {!player.rank && player.finishedPos >= 0 && (
          <div style={{
            color: '#fbbf24',
            fontSize: '0.55rem',
            fontWeight: 700,
          }}>
            #{player.finishedPos + 1}
          </div>
        )}
      </div>

      {/* Mini card backs to show hand */}
      {player.handCount > 0 && showCardsBelow && (
        <div style={{
          display: 'flex',
          marginTop: '0.15rem',
        }}>
          {Array.from({ length: Math.min(player.handCount, 4) }).map((_, i) => (
            <div
              key={i}
              style={{
                marginLeft: i > 0 ? '-12px' : 0,
                transform: `rotate(${(i - 1.5) * 4}deg)`,
              }}
            >
              <CardBack size="small" />
            </div>
          ))}
          {player.handCount > 4 && (
            <div style={{
              color: '#9ca3af',
              fontSize: '0.55rem',
              marginLeft: '0.2rem',
              alignSelf: 'center',
            }}>
              +{player.handCount - 4}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function DaifugoTableView({
  gameState,
  playerSummaries,
  pileCards,
  isReversed,
  playerNameOf,
  translations,
}: DaifugoTableViewProps) {
  // Get other players (not me)
  const otherPlayers = playerSummaries.filter(p => !p.isMe);

  // Translation helpers
  const d = translations;
  const cardsLabel = d?.cards ?? '枚';
  const anyCardLabel = d?.anyCard ?? '何でもOK';
  const tableCardLabel = d?.tableCard ?? '場札';
  const weakLabel = d?.weak ?? '弱';
  const strongLabel = d?.strong ?? '強';
  const passLabelText = d?.passLabel ?? 'パス:';
  const revolutionLabel = d?.revolution ?? '革命';
  const elevenBackLabel = d?.elevenBack ?? '11バック';
  const gekishibaLabel = d?.gekishiba ?? '激縛り';
  const shibariLabel = d?.shibari ?? '縛り';
  const rankOnlyLabel = d?.rankOnly ?? 'のみ';

  // Split players into top row and side positions
  const topPlayers = otherPlayers.slice(0, Math.min(3, otherPlayers.length));
  const leftPlayer = otherPlayers.length > 3 ? otherPlayers[3] : null;
  const rightPlayer = otherPlayers.length > 4 ? otherPlayers[4] : null;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
        marginTop: '1rem',
      }}
    >
      {/* Top row - opponent avatars */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          gap: '1.5rem',
          padding: '0 1rem',
        }}
      >
        {topPlayers.map((player) => {
          const originalIndex = playerSummaries.findIndex(p => p.id === player.id);
          return (
            <PlayerAvatar
              key={player.id}
              player={player}
              colorIndex={originalIndex}
              showCardsBelow
              translations={translations}
            />
          );
        })}
      </div>

      {/* Middle row - left player, table, right player */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
        }}
      >
        {/* Left player */}
        <div style={{ width: '6rem', flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
          {leftPlayer && (
            <PlayerAvatar
              player={leftPlayer}
              colorIndex={playerSummaries.findIndex(p => p.id === leftPlayer.id)}
              showCardsBelow
              translations={translations}
            />
          )}
        </div>

        {/* Table */}
        <div
          style={{
            flex: 1,
            minHeight: '12rem',
            background: 'radial-gradient(ellipse at center, #1a472a 0%, #0f2b1a 70%, #0a1f12 100%)',
            borderRadius: '1rem',
            border: '6px solid #3b2f1a',
            boxShadow: 'inset 0 0 40px rgba(0,0,0,0.5), 0 4px 16px rgba(0,0,0,0.4)',
            padding: '1rem',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            position: 'relative',
          }}
        >
          {/* Table felt pattern */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: '0.5rem',
              background: `
                radial-gradient(circle at 30% 30%, rgba(255,255,255,0.02) 0%, transparent 50%),
                radial-gradient(circle at 70% 70%, rgba(0,0,0,0.08) 0%, transparent 50%)
              `,
              pointerEvents: 'none',
            }}
          />

          {/* Pile info */}
          <div style={{
            color: '#fef3c7',
            fontSize: '0.7rem',
            fontWeight: 700,
            textShadow: '0 1px 2px rgba(0,0,0,0.5)',
            background: 'rgba(0,0,0,0.4)',
            padding: '0.2rem 0.6rem',
            borderRadius: '1rem',
            zIndex: 1,
          }}>
            {gameState.pile
              ? `${gameState.pile.count}${cardsLabel} · ${isReversed ? weakLabel : strongLabel} > ${rankToLabel(gameState.pile.rankKey)}`
              : anyCardLabel}
          </div>

          {/* Pile cards */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              minHeight: '5.5rem',
              zIndex: 1,
            }}
          >
            {pileCards.length === 0 ? (
              <div
                style={{
                  width: 60,
                  height: 84,
                  borderRadius: 8,
                  border: '2px dashed rgba(255,255,255,0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'rgba(255,255,255,0.3)',
                  fontSize: '0.65rem',
                }}
              >
                {tableCardLabel}
              </div>
            ) : (
              pileCards.map((c, idx) => (
                <div
                  key={c.id}
                  style={{
                    marginLeft: idx > 0 ? '-1rem' : 0,
                    transform: `rotate(${(idx - Math.floor(pileCards.length / 2)) * 3}deg)`,
                    zIndex: idx,
                  }}
                >
                  <PlayingCard
                    card={c}
                    size="medium"
                    variant="table"
                    disabled
                    animationDelay={idx * 30}
                  />
                </div>
              ))
            )}
          </div>

          {/* Last played by */}
          {gameState.lastPlayedBy && (
            <div style={{
              color: '#a7f3d0',
              fontSize: '0.6rem',
              textShadow: '0 1px 2px rgba(0,0,0,0.5)',
              zIndex: 1,
            }}>
              {playerNameOf(gameState.lastPlayedBy)}
            </div>
          )}

          {/* Pass info */}
          {gameState.passes.length > 0 && (
            <div style={{
              color: '#fca5a5',
              fontSize: '0.55rem',
              textShadow: '0 1px 2px rgba(0,0,0,0.5)',
              zIndex: 1,
            }}>
              {passLabelText} {gameState.passes.map(pid => playerNameOf(pid)).join(', ')}
            </div>
          )}

          {/* Revolution / Jack Back indicators */}
          <div style={{
            display: 'flex',
            gap: '0.4rem',
            zIndex: 1,
          }}>
            {gameState.revolution && (
              <div style={{
                background: 'rgba(220, 38, 38, 0.85)',
                color: '#fff',
                fontSize: '0.6rem',
                fontWeight: 700,
                padding: '0.15rem 0.4rem',
                borderRadius: '0.25rem',
              }}>
                {revolutionLabel}
              </div>
            )}
            {gameState.jackBack && (
              <div style={{
                background: 'rgba(147, 51, 234, 0.85)',
                color: '#fff',
                fontSize: '0.6rem',
                fontWeight: 700,
                padding: '0.15rem 0.4rem',
                borderRadius: '0.25rem',
              }}>
                {elevenBackLabel}
              </div>
            )}
            {gameState.gekishibaNextRank !== null ? (
              <div style={{
                background: 'rgba(220, 38, 38, 0.85)',
                color: '#fff',
                fontSize: '0.6rem',
                fontWeight: 700,
                padding: '0.15rem 0.4rem',
                borderRadius: '0.25rem',
              }}>
                {gekishibaLabel} ({rankToLabel(gameState.gekishibaNextRank)}{rankOnlyLabel})
              </div>
            ) : gameState.lockSignature && (
              <div style={{
                background: 'rgba(234, 179, 8, 0.85)',
                color: '#fff',
                fontSize: '0.6rem',
                fontWeight: 700,
                padding: '0.15rem 0.4rem',
                borderRadius: '0.25rem',
              }}>
                {shibariLabel}
              </div>
            )}
          </div>
        </div>

        {/* Right player */}
        <div style={{ width: '6rem', flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
          {rightPlayer && (
            <PlayerAvatar
              player={rightPlayer}
              colorIndex={playerSummaries.findIndex(p => p.id === rightPlayer.id)}
              showCardsBelow
              translations={translations}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default DaifugoTableView;
