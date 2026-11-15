/**
 * The online lobbies of Daifugo, Shichinarabe and Doubt (three copies of one screen) follow the page's language.
 * Render-to-string checks (the repo has no DOM test environment): in Japanese, no English is left on the mode
 * choice or in the waiting room.
 */

import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DaifugoMultiplayerLobby } from '@/components/game/Daifugo/DaifugoMultiplayerLobby';
import { getDaifugoLobbyStrings } from '@/components/game/Daifugo/lobbyStrings';
import { DoubtMultiplayerLobby } from '@/components/game/Doubt/DoubtMultiplayerLobby';
import { getDoubtLobbyStrings } from '@/components/game/Doubt/i18n';
import { ShichinarabeMultiplayerLobby } from '@/components/game/Shichinarabe/ShichinarabeMultiplayerLobby';
import { getShichinarabeLobbyStrings } from '@/components/game/Shichinarabe/i18n';

const page = vi.hoisted(() => ({ language: 'ja' }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ i18n: { language: page.language, changeLanguage: () => undefined } }),
}));

type Lobby = (props: { multiplayer: never; onGameStart: () => void }) => ReactElement;

const LOBBIES = [
  { name: 'Daifugo', Lobby: DaifugoMultiplayerLobby as unknown as Lobby, strings: getDaifugoLobbyStrings },
  { name: 'Shichinarabe', Lobby: ShichinarabeMultiplayerLobby as unknown as Lobby, strings: getShichinarabeLobbyStrings },
  { name: 'Doubt', Lobby: DoubtMultiplayerLobby as unknown as Lobby, strings: getDoubtLobbyStrings },
] as const;

const PLAYERS = {
  host: { id: 'host', name: 'たろう', ready: true, lastUpdate: 1 },
  me: { id: 'me', name: 'はなこ', ready: false, lastUpdate: 2 },
};

function multiplayer(lobbyState: 'idle' | 'waiting', error: string | null = null) {
  return {
    context: { lobbyState, playerId: 'me', roomId: lobbyState === 'idle' ? null : '7391', isHost: false, error },
    room: lobbyState === 'idle' ? null : { hostId: 'host', players: PLAYERS },
  } as never;
}

/** What is written on the screen: the text between the tags, and each field's placeholder. */
function shown(html: string): string {
  const placeholders = Array.from(html.matchAll(/placeholder="([^"]*)"/g), (m) => m[1]);
  return [html.replace(/<[^>]+>/g, ' '), ...placeholders].join(' ');
}

describe.each(LOBBIES)('$name online lobby', ({ Lobby, strings }) => {
  beforeEach(() => {
    page.language = 'ja';
  });

  it('offers to create or join a room in Japanese, with no English left', () => {
    const text = shown(renderToStaticMarkup(<Lobby multiplayer={multiplayer('idle')} onGameStart={() => undefined} />));
    const t = strings('ja');
    expect(text).toContain(t.createRoom);
    expect(text).toContain(t.joinRoom);
    expect(text).toContain(t.intro(3, 6));
    expect(text).not.toMatch(/[A-Za-z]{2,}/);
  });

  it('shows the waiting room in Japanese, with no English left', () => {
    const text = shown(renderToStaticMarkup(<Lobby multiplayer={multiplayer('waiting')} onGameStart={() => undefined} />));
    const t = strings('ja');
    expect(text).toContain(t.waitingRoom);
    expect(text).toContain(`はなこ${t.youSuffix}`);
    expect(text).toContain(t.host);
    expect(text).toContain(t.needMore(1, 3, 6));
    expect(text).toContain(t.leave);
    expect(text.replace(/OK/g, '')).not.toMatch(/[A-Za-z]{2,}/);
  });

  it('translates the messages the room hook reports, and shows any other as it came', () => {
    const closed = shown(renderToStaticMarkup(<Lobby multiplayer={multiplayer('idle', 'Room was closed')} onGameStart={() => undefined} />));
    expect(closed).toContain(strings('ja').errors['Room was closed']);
    expect(closed).not.toContain('Room was closed');
    const other = shown(renderToStaticMarkup(<Lobby multiplayer={multiplayer('idle', 'Wrong password')} onGameStart={() => undefined} />));
    expect(other).toContain('Wrong password');
  });

  it('keeps its English wording in English', () => {
    page.language = 'en';
    const text = shown(renderToStaticMarkup(<Lobby multiplayer={multiplayer('idle', 'Network error')} onGameStart={() => undefined} />));
    expect(text).toContain('Create Room');
    expect(text).toContain('Join Room');
    expect(text).toContain('Online mode (3–6 players). Create a room, share the code, and play together.');
    expect(text).toContain('Network error');
  });

  it('has every string in both languages', () => {
    const ja = strings('ja');
    const en = strings('en');
    expect(Object.keys(ja).sort()).toEqual(Object.keys(en).sort());
    for (const key of ['createRoom', 'joinRoom', 'yourName', 'roomPassword', 'roomCode', 'back', 'waitingRoom', 'leave', 'startGame', 'backToMenu'] as const) {
      expect(ja[key]).not.toBe(en[key]);
      expect(ja[key]).not.toMatch(/[A-Za-z]{2,}/);
    }
  });
});
