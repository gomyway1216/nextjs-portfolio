/**
 * Riichi Mahjong game page.
 *
 * This is where the UI meets the AI. `MahjongGame` renders the table and asks
 * an {@link AiDriverFactory} for each opponent's move; the factory below hands
 * it the M5 heuristic policy, running in the decision worker when the browser
 * has one and in-process otherwise (`mahjongAiWorkerClient` handles both).
 *
 * The client is created once per mount and shared by all three seats — the
 * worker is stateless, so one is enough — and the per-decision seed is derived
 * from the position so a replay of the same hand plays out identically.
 */

'use client';

import { useEffect, useMemo } from 'react';

import { MahjongGame, type AiDriverFactory } from '@/components/game/Mahjong/MahjongGame';
import { createMahjongAiClient } from '@/components/game/Mahjong/mahjongAiWorkerClient';
import { buildGameMetadata } from '@/lib/games/gameMetadata';

export const metadata = buildGameMetadata('mahjong');

export default function MahjongPage() {
  const client = useMemo(() => createMahjongAiClient(), []);

  useEffect(() => () => client.terminate(), [client]);

  const createAiDriver = useMemo<AiDriverFactory>(
    () => (difficulty) => (state, seat) =>
      client.requestAction({
        state,
        seat,
        difficulty,
        seed: `${state.roundWind}-${state.dealer}-${state.honba}-${state.turnCount}-${seat}`,
      }),
    [client],
  );

  return <MahjongGame createAiDriver={createAiDriver} />;
}
