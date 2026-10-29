import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { act, createRoom, joinRoom, newPlayer, project } from '@/lib/ogiri/engine';
import { prompts } from '@/lib/ogiri/prompts';
import { PartyGamePanel } from '@/components/game/Ogiri/PartyGamePanel';
import type { GameType, Room } from '@/lib/ogiri/types';

const now = 10000;
function setup(gameType: GameType) {
  const room = createRoom('ABC234', newPlayer('host', 'h', '進行役', '🐱', now), now);
  room.players.host.spectator = true;
  for (let i = 0; i < 3; i++) joinRoom(room, newPlayer(`p${i}`, 's', `参加者${i}`, 'rabbit', now));
  room.settings = { ...room.settings, gameType, rounds: 1 };
  act(room, 'host', { type: 'start' }, now, prompts, () => 0.3);
  return room;
}
const render = (room: Room, me: string | null, tv: boolean) => renderToStaticMarkup(
  <PartyGamePanel view={project(room, me, now + 1, prompts)} tv={tv} busy={false} connected reduced remaining={30}
    send={async () => true} />);

it('thermometer shows a slider to voters, only the scale to the TV, then an anonymous distribution', () => {
  const room = setup('thermometer');
  const phone = render(room, 'p0', false);
  expect(phone).toContain('type="range"');
  expect(phone).toContain('50度で送る');
  const tv = render(room, null, true);
  expect(tv).not.toContain('type="range"');
  expect(tv).toContain(`100 · ${room.sideRounds![0].scale!.high}`);
  for (const [i, choice] of ['10', '20', '90'].entries()) act(room, `p${i}`, { type: 'partyVote', choice }, now + 1, prompts);
  const reveal = render(room, null, true);
  expect(reveal).toContain('みんなの温度の分布');
  expect(reveal).toContain('平均 40');
  expect(reveal).toContain('平均に近かった人、得点です。');
  const distribution = reveal.slice(reveal.indexOf('<figure'), reveal.indexOf('</figure>'));
  expect(distribution).toContain('title="90度 · 1人"');
  expect(distribution).not.toContain('参加者');
});

it('minority marks the fewest-picked option and says when there is no minority', () => {
  const room = setup('minority');
  expect(render(room, 'p0', false)).toContain('みんなが選ばなそうな方へ');
  for (const [i, choice] of ['0', '0', '1'].entries()) act(room, `p${i}`, { type: 'partyVote', choice }, now + 1, prompts);
  const reveal = render(room, null, true);
  expect(reveal).toContain('1票 · 少数派！');
  expect(reveal).not.toContain('多数派！');
  expect(reveal).toContain('少数派のみなさん、得点です。');
  const tied = setup('minority');
  for (const id of ['p0', 'p1', 'p2']) act(tied, id, { type: 'partyVote', choice: '2' }, now + 1, prompts);
  const none = render(tied, null, true);
  expect(none).not.toContain('少数派！');
  expect(none).toContain('全部同じ人数で、少数派なし！');
});
