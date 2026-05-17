/**
 * Bigger Number — Online mode wrapper (Phase 1 CF migration).
 *
 * Both clients are now render-only. Picks land via the gameAction CF
 * (`multiplayer.submitPick`); the CF resolves the round atomically when
 * both picks arrive. After `REVEAL_HOLD_MS` either client may call
 * `multiplayer.advanceRound` to clear the reveal and advance — idempotent
 * on the server side, first call wins.
 */

'use client';

import React, { useCallback, useEffect } from 'react';
import Link from 'next/link';
import { useBiggerNumberMultiplayer } from './useBiggerNumberMultiplayer';
import { BiggerNumberMultiplayerLobby } from './BiggerNumberMultiplayerLobby';
import { BiggerNumberTable, type RoundPhase } from './BiggerNumberTable';
import { cardLabel } from './gameLogic';
import type { CardValue } from './types';
import { useGameLanguage } from '../contexts/GameLanguageContext';

const REVEAL_HOLD_MS = 1500;

interface BiggerNumberOnlineProps {
  onBackToMenu: () => void;
}

export function BiggerNumberOnline({ onBackToMenu }: BiggerNumberOnlineProps) {
  const { language } = useGameLanguage();
  const ja = language === 'ja';
  const multiplayer = useBiggerNumberMultiplayer();
  const {
    context,
    gameState,
    pendingActions,
    otherPlayerId,
    otherPlayerName,
  } = multiplayer;

  const myId = context.playerId;
  const opponentId = otherPlayerId;

  const handleStartGame = useCallback(async () => {
    if (!context.isHost) return;
    await multiplayer.startGame();
  }, [context.isHost, multiplayer]);

  // === BOTH: handle pick ===
  const handlePickCard = useCallback(async (card: CardValue) => {
    if (!gameState || !opponentId) return;
    if (gameState.finished) return;
    if (gameState.lastReveal) return;
    // Don't resubmit if already picked this round.
    if (pendingActions?.[myId]?.round === gameState.round) return;
    await multiplayer.submitPick(card, gameState.round);
  }, [gameState, opponentId, pendingActions, myId, multiplayer]);

  // === BOTH: ack reveal after REVEAL_HOLD_MS so the CF advances ===
  // Server is the source of truth; whichever client's timer fires first
  // calls advanceRound, the other is a no-op (idempotent).
  useEffect(() => {
    if (!gameState || gameState.finished) return;
    if (!gameState.lastReveal) return;
    const revealedRound = gameState.lastReveal.round;
    if (gameState.round !== revealedRound) return; // already advanced
    const elapsed = Date.now() - gameState.lastReveal.revealedAt;
    const remaining = Math.max(0, REVEAL_HOLD_MS - elapsed);
    const timer = setTimeout(() => {
      void multiplayer.advanceRound(revealedRound);
    }, remaining);
    return () => clearTimeout(timer);
  }, [gameState, multiplayer]);

  const handleLeave = useCallback(async () => {
    await multiplayer.leaveRoom();
    onBackToMenu();
  }, [multiplayer, onBackToMenu]);

  const handlePlayAgain = useCallback(async () => {
    await multiplayer.leaveRoom();
    multiplayer.resetMultiplayer();
  }, [multiplayer]);

  // === Render ===

  if (context.lobbyState !== 'playing' && context.lobbyState !== 'finished') {
    return (
      <div style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        background: 'linear-gradient(to bottom, #020617, #0f172a)',
        color: '#f8fafc',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        padding: '1.25rem',
        overflow: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button
            onClick={onBackToMenu}
            style={{
              padding: '0.4rem 0.9rem',
              background: 'transparent',
              border: '1px solid rgba(148, 163, 184, 0.35)',
              color: '#cbd5e1',
              borderRadius: '0.5rem',
              fontWeight: 700,
              cursor: 'pointer',
              fontSize: '0.85rem',
            }}
          >
            ← {ja ? 'モード選択' : 'Mode select'}
          </button>
          <Link href="/games" style={{ color: '#94a3b8', textDecoration: 'none', fontSize: '0.85rem' }}>
            {ja ? 'ゲーム一覧' : 'Games hub'}
          </Link>
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <BiggerNumberMultiplayerLobby
            multiplayer={multiplayer}
            onGameStart={handleStartGame}
          />
        </div>
      </div>
    );
  }

  if (!gameState || !opponentId) {
    return (
      <div style={{
        position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#020617', color: '#f8fafc', fontFamily: 'system-ui',
      }}>
        {ja ? 'ゲーム状態を読み込み中…' : 'Loading game state…'}
      </div>
    );
  }

  // Derive UI props from network state.
  const myHand = gameState.hands[myId] ?? [];
  const opponentHand = gameState.hands[opponentId] ?? [];
  const myWins = gameState.scores[myId] ?? 0;
  const opponentWins = gameState.scores[opponentId] ?? 0;

  const myPickPending = pendingActions?.[myId]?.round === gameState.round
    ? pendingActions[myId].card
    : null;
  const opponentPicked = pendingActions?.[opponentId]?.round === gameState.round ? 1 : 0;

  const reveal = gameState.lastReveal;
  const inReveal = reveal?.round === gameState.round;
  const myReveal = inReveal ? reveal!.picks[myId] ?? null : null;
  const opponentReveal = inReveal ? reveal!.picks[opponentId] ?? null : null;

  let phase: RoundPhase;
  let lastResultText: string | null = null;
  let finalMessage: string | null = null;

  if (gameState.finished) {
    phase = 'finished';
    if (gameState.winnerId === myId) finalMessage = ja ? '🎉 あなたの勝利！' : '🎉 You won the match!';
    else if (gameState.winnerId === opponentId) finalMessage = ja ? '😢 相手の勝ち' : '😢 Opponent won';
    else finalMessage = ja ? '🤝 引き分け' : '🤝 Draw';
  } else if (inReveal) {
    phase = 'between-rounds';
    const myCard = reveal!.picks[myId];
    const oppCard = reveal!.picks[opponentId];
    const tag = `${cardLabel(myCard)} vs ${cardLabel(oppCard)}`;
    if (reveal!.winnerId === myId) {
      lastResultText = ja ? `${tag} — あなたの勝ち！` : `${tag} — You win!`;
    } else if (reveal!.winnerId === opponentId) {
      lastResultText = ja ? `${tag} — 相手の勝ち` : `${tag} — Opponent wins`;
    } else if (reveal!.cardsReturnedToHand) {
      lastResultText = ja ? `${tag} — 引き分け、カードを戻します` : `${tag} — Tie, cards returned`;
    } else {
      lastResultText = ja ? `${tag} — 引き分け` : `${tag} — Tie`;
    }
  } else if (myPickPending != null) {
    phase = 'waiting-opponent';
  } else {
    phase = 'picking';
  }

  return (
    <BiggerNumberTable
      youLabel={ja ? 'あなた' : 'You'}
      opponentLabel={otherPlayerName ?? (ja ? '相手' : 'Opponent')}
      yourHand={myHand}
      opponentHandCount={opponentHand.length}
      yourWins={myWins}
      opponentWins={opponentWins}
      round={gameState.round}
      totalRounds={gameState.rules.totalRounds}
      winsToWin={gameState.rules.winsToWin}
      yourPick={myPickPending}
      opponentPickCount={opponentPicked}
      yourPickShown={myReveal}
      opponentPickShown={opponentReveal}
      phase={phase}
      lastResultText={lastResultText}
      finalMessage={finalMessage}
      onPickCard={handlePickCard}
      onLeave={handleLeave}
      onPlayAgain={gameState.finished ? handlePlayAgain : undefined}
      language={language}
    />
  );
}

