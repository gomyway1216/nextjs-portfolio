/**
 * Territory Number — Online mode wrapper.
 *
 * Both clients render the same UI from `gameState`. The HOST is the only
 * one who advances state: it watches `pendingAction`, validates it, applies
 * it to the board (via gameLogic.placeCard), advances currentTurn, and
 * checks for match end.
 *
 * Non-host clients render-only; they `submitAction` and wait.
 */

'use client';

import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useTerritoryNumberMultiplayer } from './useTerritoryNumberMultiplayer';
import { TerritoryNumberMultiplayerLobby } from './TerritoryNumberMultiplayerLobby';
import { TerritoryNumberBoard, type Phase } from './TerritoryNumberBoard';
import {
  emptyBoard,
  evaluateBoard,
  evaluateMatch,
  isCellEmpty,
  placeCard,
  remainingCards,
  isBoardFull,
} from './gameLogic';
import type {
  TerritoryNumberNetworkState,
} from './multiplayerTypes';
import type {
  FirstPlayerRule,
  PlayerSlot,
  TerritoryNumberRules,
} from './types';
import { useGameLanguage } from '../contexts/GameLanguageContext';

interface TerritoryNumberOnlineProps {
  onBackToMenu: () => void;
}

function pickFirstPlayer(rule: FirstPlayerRule, hostId: string, guestId: string): string {
  switch (rule) {
    case 'host':   return hostId;
    case 'guest':  return guestId;
    case 'random': return Math.random() < 0.5 ? hostId : guestId;
  }
}

function buildInitialGameState(
  rules: TerritoryNumberRules,
  hostId: string,
  guestId: string,
): TerritoryNumberNetworkState {
  const firstId = pickFirstPlayer(rules.firstPlayer, hostId, guestId);
  const secondId = firstId === hostId ? guestId : hostId;
  return {
    version: 1,
    rules,
    playerOrder: [firstId, secondId],
    board: emptyBoard(),
    currentTurnPlayerId: firstId,
    log: [],
    finished: false,
    winnerId: null,
    startedAt: Date.now(),
    lastUpdate: Date.now(),
  };
}

export function TerritoryNumberOnline({ onBackToMenu }: TerritoryNumberOnlineProps) {
  const { language } = useGameLanguage();
  const ja = language === 'ja';
  const multiplayer = useTerritoryNumberMultiplayer();
  const {
    context,
    gameState,
    pendingAction,
    otherPlayerId,
    otherPlayerName,
  } = multiplayer;

  const myId = context.playerId;
  const opponentId = otherPlayerId;

  const advancingRef = useRef(false);
  const lastResolvedActionIdRef = useRef<string>('');

  const handleStartGame = useCallback(async (rules: TerritoryNumberRules) => {
    if (!context.isHost) return;
    if (!opponentId) return;
    const initial = buildInitialGameState(rules, context.playerId, opponentId);
    await multiplayer.startGame(initial);
  }, [context.isHost, context.playerId, opponentId, multiplayer]);

  // === HOST: apply a pending action ===
  useEffect(() => {
    if (!context.isHost) return;
    if (!gameState || gameState.finished) return;
    if (!opponentId) return;
    if (advancingRef.current) return;
    if (!pendingAction) return;
    if (pendingAction.actionId === lastResolvedActionIdRef.current) return;

    // Stale check: must match the current turn AND that player.
    const expectedTurn = gameState.log.length + 1;
    if (pendingAction.turn !== expectedTurn) {
      void multiplayer.clearPendingAction();
      return;
    }
    if (pendingAction.playerId !== gameState.currentTurnPlayerId) {
      void multiplayer.clearPendingAction();
      return;
    }

    // Anti-cheat validation: cell must be empty AND card must still be available.
    if (!isCellEmpty(gameState.board[pendingAction.cellIndex])) {
      void multiplayer.clearPendingAction();
      return;
    }
    const remaining = remainingCards(gameState.board);
    if (!remaining.includes(pendingAction.card)) {
      void multiplayer.clearPendingAction();
      return;
    }

    advancingRef.current = true;
    lastResolvedActionIdRef.current = pendingAction.actionId;

    const slot: PlayerSlot = pendingAction.playerId === gameState.playerOrder[0] ? 'p1' : 'p2';
    const nextBoard = placeCard(gameState.board, pendingAction.cellIndex, pendingAction.card, slot);
    const nextTurnPlayerId = pendingAction.playerId === gameState.playerOrder[0]
      ? gameState.playerOrder[1]
      : gameState.playerOrder[0];

    const log = [
      ...gameState.log,
      {
        turn: expectedTurn,
        playerId: pendingAction.playerId,
        card: pendingAction.card,
        cellIndex: pendingAction.cellIndex,
        timestamp: Date.now(),
      },
    ];

    const matchOutcome = isBoardFull(nextBoard) ? evaluateMatch(nextBoard) : undefined;
    const finished = matchOutcome !== undefined;
    let winnerId: string | null = null;
    if (finished) {
      if (matchOutcome === 'p1') winnerId = gameState.playerOrder[0];
      else if (matchOutcome === 'p2') winnerId = gameState.playerOrder[1];
      // matchOutcome === null → draw, leave winnerId null
    }

    const updated: TerritoryNumberNetworkState = {
      ...gameState,
      board: nextBoard,
      currentTurnPlayerId: nextTurnPlayerId,
      log,
      finished,
      winnerId,
      lastUpdate: Date.now(),
    };

    (async () => {
      try {
        await multiplayer.updateGameState(updated);
        await multiplayer.clearPendingAction();
        if (finished) {
          await multiplayer.endGame(winnerId);
        }
      } finally {
        advancingRef.current = false;
      }
    })();
  }, [context.isHost, gameState, pendingAction, opponentId, multiplayer]);

  // === BOTH: pick + place ===
  const [selectedCard, setSelectedCard] = React.useState<number | null>(null);

  const handleSelectCard = useCallback((card: number) => {
    setSelectedCard(prev => (prev === card ? null : card));
  }, []);

  const handlePlaceOnCell = useCallback(async (cellIndex: number) => {
    if (!gameState || gameState.finished) return;
    if (selectedCard === null) return;
    if (gameState.currentTurnPlayerId !== myId) return;
    if (gameState.board[cellIndex].value !== null) return;
    if (!remainingCards(gameState.board).includes(selectedCard)) return;
    if (pendingAction && pendingAction.playerId === myId) return; // already submitted

    const turn = gameState.log.length + 1;
    await multiplayer.submitAction(selectedCard, cellIndex, turn);
    setSelectedCard(null);
  }, [gameState, selectedCard, myId, pendingAction, multiplayer]);

  const handleLeave = useCallback(async () => {
    await multiplayer.leaveRoom();
    onBackToMenu();
  }, [multiplayer, onBackToMenu]);

  const handlePlayAgain = useCallback(async () => {
    await multiplayer.leaveRoom();
    multiplayer.resetMultiplayer();
  }, [multiplayer]);

  const evaluation = useMemo(
    () => (gameState ? evaluateBoard(gameState.board) : evaluateBoard(emptyBoard())),
    [gameState],
  );
  const remaining = useMemo(
    () => (gameState ? remainingCards(gameState.board) : [1, 2, 3, 4, 5, 6, 7, 8, 9]),
    [gameState],
  );

  // Render lobby until we're playing/finished.
  if (context.lobbyState !== 'playing' && context.lobbyState !== 'finished') {
    return (
      <div style={{
        position: 'fixed', inset: 0,
        display: 'flex', flexDirection: 'column',
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
          <TerritoryNumberMultiplayerLobby
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
        position: 'fixed', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#020617', color: '#f8fafc', fontFamily: 'system-ui',
      }}>
        {ja ? 'ゲーム状態を読み込み中…' : 'Loading game state…'}
      </div>
    );
  }

  const mySlot: PlayerSlot = gameState.playerOrder[0] === myId ? 'p1' : 'p2';
  const myTurn = gameState.currentTurnPlayerId === myId;
  const finished = gameState.finished;

  let phase: Phase;
  let finalMessage: string | null = null;
  let statusText: string | null = null;

  if (finished) {
    phase = 'finished';
    if (gameState.winnerId === myId) finalMessage = ja ? '🎉 あなたの勝利！' : '🎉 You won the match!';
    else if (gameState.winnerId === opponentId) finalMessage = ja ? '😢 相手の勝ち' : '😢 Opponent won';
    else finalMessage = ja ? '🤝 引き分け' : '🤝 Draw';
  } else if (myTurn) {
    phase = 'your-turn';
    statusText = selectedCard === null
      ? (ja ? 'カードを1枚選んでください' : 'Pick a card')
      : (ja ? `${selectedCard} を置くマスをタップ` : `Tap a cell to place ${selectedCard}`);
  } else {
    phase = 'opponent-turn';
    statusText = ja ? '相手の番です…' : 'Opponent\'s turn…';
  }

  return (
    <TerritoryNumberBoard
      board={gameState.board}
      remainingCards={remaining}
      selectedCard={selectedCard}
      mySlot={mySlot}
      myLabel={ja ? 'あなた' : 'You'}
      opponentLabel={otherPlayerName ?? (ja ? '相手' : 'Opponent')}
      evaluation={evaluation}
      phase={phase}
      finalMessage={finalMessage}
      statusText={statusText}
      onSelectCard={handleSelectCard}
      onPlaceOnCell={handlePlaceOnCell}
      onLeave={handleLeave}
      onPlayAgain={finished ? handlePlayAgain : undefined}
      language={language}
    />
  );
}
