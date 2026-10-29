import { GameError } from './errors';
import { normalizePlayerText } from './text';
import type { Action, CustomPrompt, Prompt, Room, RoomView } from './types';

export const CUSTOM_PROMPT_LIMIT = 30;
export const CUSTOM_PENDING_PER_PLAYER = 5;
const requireThat: (ok: unknown, message: string, status?: number) => asserts ok = (ok, message, status) => {
  if (!ok) throw new GameError(message, status);
};
type CustomAction = Extract<Action, { type: 'customPromptAdd' | 'customPromptApprove' | 'customPromptRemove' }>;
export const isCustomPromptAction = (action: Action): action is CustomAction =>
  ['customPromptAdd', 'customPromptApprove', 'customPromptRemove'].includes(action.type);
export const isCustomPromptId = (id: string) => id.startsWith('custom-');

const asPrompt = (custom: CustomPrompt): Prompt => ({
  id: custom.id,
  text: custom.text,
  category: 'random',
  format: 'custom',
  difficulty: 'easy',
  tags: ['custom'],
  origin: 'original',
  sourceUrl: null,
  license: 'room',
  enabled: true,
  createdAt: new Date(custom.createdAt).toISOString(),
});
export const approvedCustomPrompts = (room: Room) =>
  (room.customPrompts ?? []).filter((custom) => custom.approved).map(asPrompt);
/** Catalog plus this room's approved prompts, for looking up a match's prompt text. */
export const withCustomPrompts = (room: Room, prompts: Prompt[]) =>
  room.customPrompts?.length ? [...prompts, ...approvedCustomPrompts(room)] : prompts;

function shuffled<T>(items: T[], rng: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
/** Called before a round's catalog prompts. 'mix' spreads unused prompts over the remaining
 * rounds so every one is asked; 'only' fills the round and recycles the least recently asked. */
export function pickCustomPrompts(room: Room, needed: number, rng: () => number): Prompt[] {
  const custom = approvedCustomPrompts(room);
  const only = room.settings.customMode === 'only';
  if (room.round === 0) {
    requireThat(!only || custom.length >= needed,
      `自作お題だけで遊ぶには、回答者の人数分（${needed}問）以上の採用済みお題が必要です。`, 409);
    // A new game starts the room's prompts over once every one has been asked.
    if (custom.length && custom.every((p) => room.usedPrompts.includes(p.id)))
      room.usedPrompts = room.usedPrompts.filter((id) => !isCustomPromptId(id));
  }
  const unused = shuffled(custom.filter((p) => !room.usedPrompts.includes(p.id)), rng);
  if (!only) {
    const roundsLeft = Math.max(1, room.settings.rounds - room.round);
    return unused.slice(0, Math.min(needed, Math.ceil(unused.length / roundsLeft)));
  }
  const recent = (p: Prompt) => room.usedPrompts.lastIndexOf(p.id);
  const used = custom.filter((p) => room.usedPrompts.includes(p.id)).sort((a, b) => recent(a) - recent(b));
  return [...unused, ...used].slice(0, needed);
}

function customText(value: unknown): string {
  requireThat(typeof value === 'string', '文字で入力してください。');
  const text = normalizePlayerText(value);
  requireThat([...text].length > 0 && [...text].length <= 100, '1〜100文字で入力してください。');
  return text;
}
const sameText = (a: string, b: string) =>
  a.replace(/\s+/g, '').toLocaleLowerCase('ja') === b.replace(/\s+/g, '').toLocaleLowerCase('ja');
function askedThisGame(room: Room, id: string) {
  return [...(room.pastRounds ?? []).flatMap((r) => r.matches), ...room.matches].some((m) => m.promptId === id);
}
export function customPromptAction(room: Room, playerId: string, action: CustomAction, now: number) {
  requireThat(['lobby', 'finished'].includes(room.phase), '自作お題は参加受付中に編集できます。', 409);
  const host = room.hostId === playerId;
  const list = (room.customPrompts ??= []);
  if (action.type === 'customPromptAdd') {
    requireThat(host || room.settings.customSubmissions, '主催者がお題の募集をオンにすると送れます。', 403);
    const text = customText(action.text);
    requireThat(list.length < CUSTOM_PROMPT_LIMIT, `自作お題は1ルーム${CUSTOM_PROMPT_LIMIT}問までです。`, 409);
    requireThat(host || list.filter((p) => p.author === playerId && !p.approved).length < CUSTOM_PENDING_PER_PLAYER,
      `審査待ちのお題は1人${CUSTOM_PENDING_PER_PLAYER}問までです。`, 409);
    requireThat(!list.some((p) => sameText(p.text, text)), '同じお題がすでにあります。', 409);
    room.customPromptSeq = (room.customPromptSeq ?? 0) + 1;
    list.push({ id: `custom-${room.customPromptSeq}`, text, author: playerId, approved: host, createdAt: now });
    return;
  }
  const index = list.findIndex((p) => p.id === action.id);
  requireThat(typeof action.id === 'string' && index >= 0, 'お題が見つかりません。', 404);
  const target = list[index];
  if (action.type === 'customPromptApprove') {
    requireThat(host, '主催者だけが操作できます。', 403);
    target.approved = true;
    return;
  }
  requireThat(host || (target.author === playerId && !target.approved), '採用済みのお題は主催者だけが削除できます。', 403);
  requireThat(!askedThisGame(room, target.id), 'このゲームで出題したお題は、次のゲームの受付で削除できます。', 409);
  list.splice(index, 1);
}
/** A kicked participant's unreviewed submissions go with them. */
export function dropPendingCustomPrompts(room: Room, playerId: string) {
  if (room.customPrompts)
    room.customPrompts = room.customPrompts.filter((p) => p.approved || p.author !== playerId);
}
/** Host sees every submission and its author; participants only their own; the TV only a count. */
export function projectCustomPrompts(room: Room, me: string | null): Pick<RoomView, 'customPromptCount' | 'customPrompts'> {
  const list = room.customPrompts ?? [];
  const count = list.filter((p) => p.approved).length;
  const view: Pick<RoomView, 'customPromptCount' | 'customPrompts'> = count ? { customPromptCount: count } : {};
  if (!me || !['lobby', 'finished'].includes(room.phase)) return view;
  const host = me === room.hostId;
  const visible = list.filter((p) => host || p.author === me);
  if (!visible.length) return view;
  return {
    ...view,
    customPrompts: visible.map((p) => ({
      id: p.id,
      text: p.text,
      author: room.players[p.author] && !room.players[p.author].kicked ? room.players[p.author].name : '退出したプレイヤー',
      approved: p.approved,
      mine: p.author === me,
    })),
  };
}
