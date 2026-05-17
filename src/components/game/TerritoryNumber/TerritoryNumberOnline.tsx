/**
 * Territory Number — Online mode wrapper.
 *
 * Phase 1 of the CF migration. Both clients render the same UI from
 * `gameState`; nobody runs game logic locally — the host loop is gone.
 * Each player just submits their move via `multiplayer.submitMove(...)`,
 * which calls the `gameAction` Cloud Function. The CF validates and
 * writes the new state to RTDB; both clients see the update via the
 * existing RTDB onSnapshot subscription.
 *
 * Match-end / `winnerId` is also set by the CF — the client just renders
 * what `gameState.finished` and `gameState.winnerId` say.
 */

'use client';

import React, { useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useTerritoryNumberMultiplayer } from './useTerritoryNumberMultiplayer';
import { TerritoryNumberMultiplayerLobby } from './TerritoryNumberMultiplayerLobby';
import { TerritoryNumberBoard, type Phase } from './TerritoryNumberBoard';
import {
  emptyBoard,
  evaluateBoard,
  remainingCards,
} from './gameLogic';
import type { PlayerSlot } from './types';
import { useGameLanguage } from '../contexts/GameLanguageContext';

interface TerritoryNumberOnlineProps {
  onBackToMenu: () => void;
}

export function TerritoryNumberOnline({ onBackToMenu }: TerritoryNumberOnlineProps) {
  const { language } = useGameLanguage();
  const ja = language === 'ja';
  const multiplayer = useTerritoryNumberMultiplayer();
  const {
    context,
    gameState,
    otherPlayerId,
    otherPlayerName,
  } = multiplayer;

  const myId = context.playerId;
  const opponentId = otherPlayerId;

  const handleStartGame = useCallback(async () => {
    if (!context.isHost) return;
    if (!opponentId) return;
    // Server builds the initial state (incl. who goes first per rules);
    // we just trigger the start.
    await multiplayer.startGame();
  }, [context.isHost, opponentId, multiplayer]);

  // Local UI state only: which card is currently selected for placement.
  const [selectedCard, setSelectedCard] = React.useState<number | null>(null);
  // Tracks an in-flight move so we don't double-submit.
  const [submittingTurn, setSubmittingTurn] = React.useState<number | null>(null);

  const handleSelectCard = useCallback((card: number) => {
    setSelectedCard((prev) => (prev === card ? null : card));
  }, []);

  const handlePlaceOnCell = useCallback(async (cellIndex: number) => {
    if (!gameState || gameState.finished) return;
    if (selectedCard === null) return;
    if (gameState.currentTurnPlayerId !== myId) return;
    if (gameState.board[cellIndex].value !== null) return;
    if (!remainingCards(gameState.board).includes(selectedCard)) return;

    const turn = gameState.log.length + 1;
    if (submittingTurn === turn) return;
    setSubmittingTurn(turn);
    const card = selectedCard;
    setSelectedCard(null);
    try {
      const result = await multiplayer.submitMove(card, cellIndex, turn);
      if (!result.success) {
        // Server rejected (e.g. someone else moved first). Re-select for retry.
        setSelectedCard(card);
      }
    } finally {
      setSubmittingTurn(null);
    }
  }, [gameState, selectedCard, myId, submittingTurn, multiplayer]);

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

  // Lobby until status flips to playing/finished.
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
