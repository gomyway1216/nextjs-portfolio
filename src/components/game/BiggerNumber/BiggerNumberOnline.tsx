/**
 * Bigger Number — Online mode wrapper.
 *
 * Both clients render the same UI from `gameState`. The HOST is the only
 * one who advances state: it watches `pendingActions`, resolves the round
 * once both picks have arrived, writes the new gameState, and then
 * transitions through reveal → between-rounds → next-round.
 *
 * Non-host clients are render-only; they submit their pick and wait.
 */

'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useBiggerNumberMultiplayer } from './useBiggerNumberMultiplayer';
import { BiggerNumberMultiplayerLobby } from './BiggerNumberMultiplayerLobby';
import { BiggerNumberTable, type RoundPhase } from './BiggerNumberTable';
import {
  freshHand,
  removeCard,
  resolveRound,
  evaluateMatch,
  cardLabel,
} from './gameLogic';
import type {
  BiggerNumberLastReveal,
  BiggerNumberNetworkState,
} from './multiplayerTypes';
import type { BiggerNumberRules, CardValue } from './types';
import { useGameLanguage } from '../contexts/GameLanguageContext';

const REVEAL_HOLD_MS = 1500;

interface BiggerNumberOnlineProps {
  onBackToMenu: () => void;
}

function buildInitialGameState(
  rules: BiggerNumberRules,
  p1Id: string,
  p2Id: string,
): BiggerNumberNetworkState {
  return {
    version: 1,
    rules,
    playerOrder: [p1Id, p2Id],
    round: 1,
    scores: { [p1Id]: 0, [p2Id]: 0 },
    hands: { [p1Id]: freshHand(), [p2Id]: freshHand() },
    lastReveal: null,
    log: [],
    finished: false,
    winnerId: null,
    startedAt: Date.now(),
    lastUpdate: Date.now(),
  };
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

  // Track last processed round to avoid double-resolving via the same snapshot.
  const lastResolvedRoundRef = useRef<number>(0);
  const advancingRef = useRef(false);

  const handleStartGame = useCallback(async (rules: BiggerNumberRules) => {
    if (!context.isHost) return;
    if (!opponentId) return;
    const initial = buildInitialGameState(rules, context.playerId, opponentId);
    await multiplayer.startGame(initial);
  }, [context.isHost, context.playerId, opponentId, multiplayer]);

  // === HOST: resolve a round once both picks have arrived ===
  useEffect(() => {
    if (!context.isHost) return;
    if (!gameState || gameState.finished) return;
    if (!opponentId) return;
    if (advancingRef.current) return;
    if (gameState.lastReveal) return; // already in reveal phase
    if (gameState.round === lastResolvedRoundRef.current) return;

    const myPick = pendingActions?.[context.playerId];
    const oppPick = pendingActions?.[opponentId];
    if (!myPick || !oppPick) return;
    if (myPick.round !== gameState.round || oppPick.round !== gameState.round) return;

    advancingRef.current = true;
    lastResolvedRoundRef.current = gameState.round;

    const result = resolveRound(gameState.rules, myPick.card, oppPick.card);
    const winnerId =
      result.outcome === 'p1' ? context.playerId
      : result.outcome === 'p2' ? opponentId
      : null;

    const nextScores = { ...gameState.scores };
    if (winnerId) nextScores[winnerId] = (nextScores[winnerId] ?? 0) + 1;

    const nextHands = { ...gameState.hands };
    if (!result.cardsReturnedToHand) {
      nextHands[context.playerId] = removeCard(nextHands[context.playerId] ?? [], myPick.card);
      nextHands[opponentId] = removeCard(nextHands[opponentId] ?? [], oppPick.card);
    }

    const reveal: BiggerNumberLastReveal = {
      round: gameState.round,
      picks: { [context.playerId]: myPick.card, [opponentId]: oppPick.card },
      winnerId,
      involvedDragon: result.involvedDragon,
      cardsReturnedToHand: result.cardsReturnedToHand,
      revealedAt: Date.now(),
    };

    const log = [
      ...gameState.log,
      {
        round: gameState.round,
        p1Id: context.playerId,
        p2Id: opponentId,
        p1Card: myPick.card,
        p2Card: oppPick.card,
        winnerId,
        involvedDragon: result.involvedDragon,
        cardsReturnedToHand: result.cardsReturnedToHand,
        timestamp: Date.now(),
      },
    ];

    const completedRounds = result.cardsReturnedToHand ? gameState.round - 1 : gameState.round;
    const matchWinner = evaluateMatch(
      gameState.rules,
      { p1Wins: nextScores[context.playerId] ?? 0, p2Wins: nextScores[opponentId] ?? 0 },
      completedRounds,
      { p1: context.playerId, p2: opponentId },
    );

    const updatedState: BiggerNumberNetworkState = {
      ...gameState,
      scores: nextScores,
      hands: nextHands,
      lastReveal: reveal,
      log,
      lastUpdate: Date.now(),
    };

    (async () => {
      try {
        await multiplayer.updateGameState(updatedState);
        await multiplayer.clearPendingActions();

        // Hold the reveal so both clients see it, then advance.
        await new Promise(r => setTimeout(r, REVEAL_HOLD_MS));

        if (matchWinner !== undefined) {
          const finalState: BiggerNumberNetworkState = {
            ...updatedState,
            finished: true,
            winnerId: matchWinner,
            lastUpdate: Date.now(),
          };
          await multiplayer.updateGameState(finalState);
          await multiplayer.endGame(matchWinner);
        } else {
          const advancedState: BiggerNumberNetworkState = {
            ...updatedState,
            round: result.cardsReturnedToHand ? gameState.round : gameState.round + 1,
            lastReveal: null,
            lastUpdate: Date.now(),
          };
          await multiplayer.updateGameState(advancedState);
        }
      } finally {
        advancingRef.current = false;
      }
    })();
  }, [context.isHost, context.playerId, opponentId, gameState, pendingActions, multiplayer]);

  // === BOTH: handle pick ===
  const handlePickCard = useCallback(async (card: CardValue) => {
    if (!gameState || !opponentId) return;
    if (gameState.finished) return;
    if (gameState.lastReveal) return;
    // Don't resubmit if already picked this round.
    if (pendingActions?.[myId]?.round === gameState.round) return;
    await multiplayer.submitPick(card, gameState.round);
  }, [gameState, opponentId, pendingActions, myId, multiplayer]);

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

