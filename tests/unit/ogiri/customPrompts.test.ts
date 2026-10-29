import { describe, expect, it } from 'vitest';
import { act, createRoom, joinRoom, newPlayer, project, settingsInput } from '@/lib/ogiri/engine';
import { CUSTOM_PROMPT_LIMIT, isCustomPromptId } from '@/lib/ogiri/custom-prompts';
import { historyText, snapshotHistory } from '@/lib/ogiri/history';
import { DEFAULT_SETTINGS, type Room } from '@/lib/ogiri/types';
import { prompts } from '@/lib/ogiri/prompts';

const now = 1_000_000;
function setup(n = 5, settings: Partial<Room['settings']> = {}) {
  const room = createRoom('ABC234', newPlayer('p0', 'secret0', '主催者', '🐱', now), now);
  for (let i = 1; i < n; i++) joinRoom(room, newPlayer(`p${i}`, `secret${i}`, `参加者${i}`, '🐶', now));
  room.settings = { ...room.settings, ...settings };
  return room;
}
const add = (room: Room, id: string, text: string) => act(room, id, { type: 'customPromptAdd', text }, now, prompts);
const customIds = (room: Room) => room.matches.map((m) => m.promptId).filter(isCustomPromptId);
function playRound(room: Room) {
  for (const m of room.matches)
    for (const id of m.players) act(room, id, { type: 'answer', matchId: m.id, text: `答え ${id}` }, now, prompts);
  act(room, 'p0', { type: 'next' }, now, prompts);
  while (!['ranking', 'finished'].includes(room.phase)) act(room, 'p0', { type: 'next' }, now, prompts);
}

describe('custom prompts', () => {
  it('validates text, duplicates, the room limit and the lobby-only window', () => {
    const room = setup();
    add(room, 'p0', ' 社員旅行で　部長が言いがちなこと\n');
    expect(room.customPrompts).toEqual([
      expect.objectContaining({ id: 'custom-1', text: '社員旅行で 部長が言いがちなこと', approved: true, author: 'p0' }),
    ]);
    expect(() => add(room, 'p0', '社員旅行で部長が言いがちなこと')).toThrow('同じお題');
    expect(() => add(room, 'p0', '')).toThrow('1〜100文字');
    expect(() => add(room, 'p0', 'あ'.repeat(101))).toThrow('1〜100文字');
    expect(() => act(room, 'p0', { type: 'customPromptAdd', text: 42 as unknown as string }, now, prompts)).toThrow('文字で');
    for (let i = 1; i < CUSTOM_PROMPT_LIMIT; i++) add(room, 'p0', `お題その${i}`);
    expect(() => add(room, 'p0', '31問目')).toThrow(`${CUSTOM_PROMPT_LIMIT}問まで`);
    const started = setup();
    act(started, 'p0', { type: 'start' }, now, prompts);
    expect(() => add(started, 'p0', 'ゲーム中のお題')).toThrow('参加受付中');
  });

  it('keeps the settings and rejects unknown modes', () => {
    expect(settingsInput({ ...DEFAULT_SETTINGS, customMode: 'only', customSubmissions: true }))
      .toMatchObject({ customMode: 'only', customSubmissions: true });
    const plain = settingsInput({ ...DEFAULT_SETTINGS, customMode: 'mix', customSubmissions: false });
    expect(plain).not.toHaveProperty('customMode');
    expect(plain).not.toHaveProperty('customSubmissions');
    expect(() => settingsInput({ ...DEFAULT_SETTINGS, customMode: 'all' })).toThrow();
    expect(() => settingsInput({ ...DEFAULT_SETTINGS, customSubmissions: 'yes' })).toThrow();
  });

  it('lets participants submit only when the host opens submissions, and only the host approves', () => {
    const room = setup();
    expect(() => add(room, 'p1', 'みんなのお題')).toThrow('募集をオン');
    room.settings.customSubmissions = true;
    for (let i = 0; i < 5; i++) add(room, 'p1', `参加者のお題${i}`);
    expect(() => add(room, 'p1', '6問目')).toThrow('1人5問');
    expect(room.customPrompts!.every((p) => !p.approved)).toBe(true);
    expect(() => act(room, 'p2', { type: 'customPromptApprove', id: 'custom-1' }, now, prompts)).toThrow('主催者だけ');
    act(room, 'p0', { type: 'customPromptApprove', id: 'custom-1' }, now, prompts);
    expect(room.customPrompts![0].approved).toBe(true);
    // The author may withdraw a pending prompt but not an approved one; others may not touch it.
    expect(() => act(room, 'p1', { type: 'customPromptRemove', id: 'custom-1' }, now, prompts)).toThrow('主催者だけ');
    expect(() => act(room, 'p2', { type: 'customPromptRemove', id: 'custom-2' }, now, prompts)).toThrow('主催者だけ');
    act(room, 'p1', { type: 'customPromptRemove', id: 'custom-2' }, now, prompts);
    act(room, 'p0', { type: 'customPromptRemove', id: 'custom-1' }, now, prompts);
    expect(room.customPrompts!.map((p) => p.id)).toEqual(['custom-3', 'custom-4', 'custom-5']);
    expect(() => act(room, 'p0', { type: 'customPromptRemove', id: 'custom-9' }, now, prompts)).toThrow('見つかりません');
    act(room, 'p0', { type: 'kick', playerId: 'p1' }, now, prompts);
    expect(room.customPrompts).toEqual([]);
  });

  it('shows pending prompts only to the host, and prompt texts never to the TV or other players', () => {
    const room = setup();
    room.settings.customSubmissions = true;
    add(room, 'p0', '主催者のお題');
    add(room, 'p1', 'ひみつの審査待ちお題');
    const host = project(room, 'p0', now, prompts);
    expect(host.customPromptCount).toBe(1);
    expect(host.customPrompts).toEqual([
      { id: 'custom-1', text: '主催者のお題', author: '主催者', approved: true, mine: true },
      { id: 'custom-2', text: 'ひみつの審査待ちお題', author: '参加者1', approved: false, mine: false },
    ]);
    expect(project(room, 'p1', now, prompts).customPrompts).toEqual([
      { id: 'custom-2', text: 'ひみつの審査待ちお題', author: '参加者1', approved: false, mine: true },
    ]);
    const other = project(room, 'p2', now, prompts);
    const tv = project(room, null, now, prompts);
    for (const view of [other, tv]) {
      expect(view.customPromptCount).toBe(1);
      expect(view.customPrompts).toBeUndefined();
      expect(JSON.stringify(view)).not.toContain('ひみつの審査待ちお題');
      expect(JSON.stringify(view)).not.toContain('主催者のお題');
    }
    act(room, 'p0', { type: 'start' }, now, prompts);
    expect(project(room, 'p0', now, prompts).customPrompts).toBeUndefined();
    expect(JSON.stringify(project(room, null, now, prompts))).not.toContain('ひみつの審査待ちお題');
  });

  it('mixes every approved prompt into the game, spread over the rounds, and never a pending one', () => {
    const room = setup(10);
    room.settings.customSubmissions = true;
    for (let i = 1; i <= 7; i++) add(room, 'p0', `自作お題${i}`);
    add(room, 'p1', '審査待ちのお題');
    act(room, 'p0', { type: 'start' }, now, prompts);
    const asked: string[] = [];
    const perRound: number[] = [];
    while (room.phase !== 'finished') {
      perRound.push(customIds(room).length);
      asked.push(...customIds(room));
      expect(new Set(room.matches.map((m) => m.promptId)).size).toBe(room.matches.length);
      playRound(room);
      if (room.phase === 'ranking') act(room, 'p0', { type: 'next' }, now, prompts);
    }
    expect(perRound).toEqual([3, 2, 2]);
    expect(new Set(asked)).toEqual(new Set(['custom-1', 'custom-2', 'custom-3', 'custom-4', 'custom-5', 'custom-6', 'custom-7']));
    expect(asked).not.toContain('custom-8');
  });

  it('asks only custom prompts in "only" mode and recycles the least recently asked', () => {
    const room = setup(3, { customMode: 'only', rounds: 2 });
    add(room, 'p0', '一問目');
    add(room, 'p0', '二問目');
    expect(() => act(room, 'p0', { type: 'start' }, now, prompts)).toThrow('人数分（3問）');
    add(room, 'p0', '三問目');
    add(room, 'p0', '四問目');
    act(room, 'p0', { type: 'start' }, now, prompts);
    const first = customIds(room);
    expect(first).toHaveLength(3);
    playRound(room);
    act(room, 'p0', { type: 'next' }, now, prompts);
    const second = customIds(room);
    expect(second).toHaveLength(3);
    expect(new Set(second).size).toBe(3);
    const unused = ['custom-1', 'custom-2', 'custom-3', 'custom-4'].find((id) => !first.includes(id));
    expect(second).toContain(unused);
    // The prompt's text reaches the players as a normal prompt.
    const assignment = project(room, 'p1', now, prompts).assignments[0];
    expect(['一問目', '二問目', '三問目', '四問目']).toContain(assignment?.text);
  });

  it('marks custom prompts on the match, in history and keeps the list across rematches', () => {
    const room = setup(3, { customMode: 'only', rounds: 1 });
    for (const text of ['一問目', '二問目', '三問目']) add(room, 'p0', text);
    act(room, 'p0', { type: 'start' }, now, prompts);
    for (const m of room.matches)
      for (const id of m.players) act(room, id, { type: 'answer', matchId: m.id, text: `答え ${id}` }, now, prompts);
    act(room, 'p0', { type: 'next' }, now, prompts);
    expect(project(room, null, now, prompts).match).toMatchObject({ custom: true });
    while (room.phase !== 'finished') act(room, 'p0', { type: 'next' }, now, prompts);
    expect(() => act(room, 'p0', { type: 'customPromptRemove', id: 'custom-1' }, now, prompts)).toThrow('次のゲーム');
    const history = snapshotHistory(room, 'a'.repeat(32), now, prompts);
    expect(history.matches).toHaveLength(3);
    expect(history.matches.every((m) => m.custom && ['一問目', '二問目', '三問目'].includes(m.text))).toBe(true);
    expect(historyText(history)).toContain('（自作）');
    act(room, 'p0', { type: 'rematch' }, now, prompts);
    expect(room.customPrompts).toHaveLength(3);
    act(room, 'p0', { type: 'customPromptRemove', id: 'custom-1' }, now, prompts);
    add(room, 'p0', '四問目');
    act(room, 'p0', { type: 'start' }, now, prompts);
    expect(new Set(customIds(room))).toEqual(new Set(['custom-2', 'custom-3', 'custom-4']));
  });
});
