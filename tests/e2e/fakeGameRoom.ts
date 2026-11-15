import type { Page, WebSocketRoute } from '@playwright/test';

/**
 * A multiplayer card game's room, faked in the browser so its match screen can be seen without a backend.
 *
 * The online card games (Daifugo, Shichinarabe, Doubt) create a room through the `gameAction` Cloud Function and then
 * read it live from Firebase's Realtime Database over a WebSocket. CI has neither (placeholder credentials), so:
 * - the Cloud Function is answered here: `createRoom` returns the room, every other action succeeds;
 * - the Realtime Database's WebSocket is answered here, speaking just enough of its protocol (the handshake, a reply
 *   to every request, and the room's data for a listen on it) for the page to receive the room;
 * - anonymous sign-in is refused at once (the page carries on without a token, as it does when sign-in fails).
 * Nothing in the app changes: it runs exactly as it does against the real services.
 */

export interface FakePlayer {
  id: string;
  name: string;
}

export interface FakeRoomOptions {
  /** e.g. 'shichinarabe' — the room's gameType. */
  gameType: string;
  roomId: string;
  /** The player this browser is: stored where the game's hook looks for its player id. */
  me: FakePlayer;
  /** The game's localStorage key for its player id, e.g. 'shichinarabePlayerId'. */
  playerIdKey: string;
  players: FakePlayer[];
  /** The room's `gameState` exactly as the backend writes it (the strippable fields JSON-stringified). */
  gameState: Record<string, unknown>;
  status?: 'playing' | 'finished';
}

export interface FakeRoom {
  /** Replaces the room's game state (and status) and sends it to the page, as the database would on a change. */
  update: (gameState: Record<string, unknown>, status?: 'playing' | 'finished') => void;
}

function roomData(options: FakeRoomOptions, gameState: Record<string, unknown>, status: 'playing' | 'finished') {
  const players: Record<string, unknown> = {};
  for (const p of options.players) players[p.id] = { id: p.id, name: p.name, ready: true, lastUpdate: 1 };
  return {
    id: options.roomId,
    hostId: options.players[0]!.id,
    gameType: options.gameType,
    status,
    players,
    createdAt: 1,
    gameState,
  };
}

export async function fakeGameRoom(page: Page, options: FakeRoomOptions): Promise<FakeRoom> {
  let gameState = options.gameState;
  let status = options.status ?? 'playing';
  const sockets = new Set<WebSocketRoute>();
  const roomPath = `gameRooms/${options.roomId}`;

  await page.addInitScript(([key, id]) => {
    try { window.localStorage.setItem(key, id); } catch { /* storage blocked: the page makes its own id */ }
  }, [options.playerIdKey, options.me.id] as const);

  await page.route(/identitytoolkit\.googleapis\.com|securetoken\.googleapis\.com/, (route) => route.fulfill({
    status: 400,
    contentType: 'application/json',
    body: JSON.stringify({ error: { code: 400, message: 'ADMIN_ONLY_OPERATION' } }),
  }));

  await page.route(/gameaction-[^/]*\.a\.run\.app/, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: corsHeaders() });
      return;
    }
    let action = '';
    try { action = (route.request().postDataJSON() as { action?: string }).action ?? ''; } catch { /* not JSON */ }
    const body = action === 'createRoom' || action === 'joinRoom' || action === 'getRoom'
      ? { success: true, roomId: options.roomId, room: roomData(options, gameState, status) }
      : { success: true };
    await route.fulfill({ status: 200, contentType: 'application/json', headers: corsHeaders(), body: JSON.stringify(body) });
  });

  const push = (ws: WebSocketRoute) => {
    ws.send(JSON.stringify({ t: 'd', d: { a: 'd', b: { p: roomPath, d: roomData(options, gameState, status) } } }));
  };

  await page.routeWebSocket(/firebaseio\.com|firebasedatabase\.app/, (ws) => {
    sockets.add(ws);
    ws.onClose(() => sockets.delete(ws));
    const host = new URL(ws.url()).host;
    ws.send(JSON.stringify({ t: 'c', d: { t: 'h', d: { ts: Date.now(), v: '5', h: host, s: 'fake-session' } } }));
    ws.onMessage((message) => {
      if (typeof message !== 'string' || message === '0') return; // keep-alive
      let frame: { t?: string; d?: { r?: number; a?: string; b?: { p?: string } } };
      try { frame = JSON.parse(message); } catch { return; }
      const request = frame.d;
      if (frame.t !== 'd' || !request || typeof request.r !== 'number') return;
      const path = (request.b?.p ?? '').replace(/^\/+/, '');
      if (request.a === 'q' && path === roomPath) push(ws);
      ws.send(JSON.stringify({ t: 'd', d: { r: request.r, b: { s: 'ok', d: {} } } }));
    });
  });

  return {
    update: (next, nextStatus) => {
      gameState = next;
      if (nextStatus) status = nextStatus;
      for (const ws of sockets) push(ws);
    },
  };
}

function corsHeaders(): Record<string, string> {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
    'access-control-allow-methods': 'POST, OPTIONS',
  };
}
