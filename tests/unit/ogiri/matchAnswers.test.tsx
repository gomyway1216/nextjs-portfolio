import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { act, createRoom, joinRoom, newPlayer, project } from '@/lib/ogiri/engine';
import { snapshotHistory } from '@/lib/ogiri/history';
import { prompts } from '@/lib/ogiri/prompts';
import { PartyGamePanel } from '@/components/game/Ogiri/PartyGamePanel';
import type { Room } from '@/lib/ogiri/types';

const now = 10000;
function setup(n: number, automatic = true) {
  const room = createRoom('ABC234', newPlayer('host', 'h', '進行役', '🐱', now), now);
  room.players.host.spectator = true;
  for (let i = 0; i < n; i++) joinRoom(room, newPlayer(`p${i}`, 's', `参加者${i}`, 'rabbit', now));
  room.settings = { ...room.settings, gameType: 'match', rounds: 2, autoAdvance: automatic };
  act(room, 'host', { type: 'start' }, now, prompts, () => 0.3);
  return room;
}
function answerAll(room: Room, answers: string[]) {
  answers.forEach((text, i) => {
    act(room, `p${i}`, { type: 'partyAnswer', text }, now, prompts);
    act(room, `p${i}`, { type: 'answerReady', ready: true }, now, prompts);
  });
}
const render = (room: Room, me: string | null, tv: boolean) => renderToStaticMarkup(
  <PartyGamePanel view={project(room, me, now + 1, prompts)} tv={tv} busy={false} connected reduced remaining={30} send={async () => true} />);

describe('せーので同じ答え', () => {
  it('keeps every answer private until all are in, then groups the ones that read the same', () => {
    const room = setup(5);
    expect(room.phase).toBe('answering');
    act(room, 'p0', { type: 'partyAnswer', text: 'ツナマヨ' }, now, prompts);
    const poll = JSON.stringify(project(room, 'p1', now, prompts));
    expect(poll).not.toContain('ツナマヨ');
    expect(JSON.stringify(project(room, null, now, prompts))).not.toContain('ツナマヨ');
    expect(project(room, 'p0', now, prompts).sideGame!.answer).toBe('ツナマヨ');
    expect(() => act(room, 'p1', { type: 'partyAnswer', text: 'あ'.repeat(21) }, now, prompts)).toThrow('1〜20文字');
    answerAll(room, ['ツナマヨ', 'つなまよ', ' ツナ マヨ ', '梅', 'しゃけ']);
    expect(room.phase).toBe('reveal');
    const result = project(room, null, now, prompts).sideGame!.result!;
    expect(result.groups![0]).toEqual({ label: 'ツナマヨ', ids: ['p0', 'p1', 'p2'] });
    expect(result.groups!.slice(1).map(group => group.ids.length)).toEqual([1, 1]);
    expect(['p0', 'p1', 'p2', 'p3', 'p4'].map(id => room.players[id].score)).toEqual([200, 200, 200, 0, 0]);
    const tv = render(room, null, true);
    expect(tv).toContain('3人がハモった！');
    expect(tv).toContain('ひとりだけ');
    expect(tv).toContain('ハモった人、得点です。');
  });

  it('adds a bonus when the whole room says the same thing', () => {
    const room = setup(3);
    answerAll(room, ['りんご', 'リンゴ', 'ﾘﾝｺﾞ']);
    expect(['p0', 'p1', 'p2'].map(id => room.players[id].score)).toEqual([300, 300, 300]);
  });

  it('takes back the points a removed player gave the others they matched', () => {
    const room = setup(4);
    answerAll(room, ['うどん', 'うどん', 'うどん', 'そば']);
    expect(room.players.p0.score).toBe(200);
    act(room, 'host', { type: 'kick', playerId: 'p2' }, now, prompts);
    expect(room.players.p0.score).toBe(100);
    expect(room.players.p1.score).toBe(100);
    expect(project(room, null, now, prompts).sideGame!.result!.groups![0].ids).toEqual(['p0', 'p1']);
  });

  it('plays its rounds through to a history of who matched', () => {
    const room = setup(3, false);
    answerAll(room, ['夏', '夏', '秋']);
    act(room, 'host', { type: 'next' }, now, prompts);
    expect(room.phase).toBe('reveal');
    act(room, 'host', { type: 'next' }, now, prompts);
    expect(room.phase).toBe('ranking');
    act(room, 'host', { type: 'next' }, now, prompts);
    expect(room.phase).toBe('answering');
    expect(room.round).toBe(2);
    answerAll(room, ['あ', 'い', 'う']);
    act(room, 'host', { type: 'next' }, now, prompts);
    expect(render(room, 'p0', false)).toContain('だれともハモらず');
    act(room, 'host', { type: 'next' }, now, prompts);
    act(room, 'host', { type: 'next' }, now, prompts);
    expect(room.phase).toBe('finished');
    const history = snapshotHistory(room, 'h', now, prompts);
    expect(history.matches).toHaveLength(2);
    expect(history.matches[0].answers[0]).toMatchObject({ text: '夏', votes: 2, points: 100, name: '参加者0・参加者1' });
    expect(history.matches[0].note).toContain('同じ答えの人1人につき100点');
  });
});
