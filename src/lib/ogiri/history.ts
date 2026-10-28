import { rankPlayers } from './engine';
import type { GameHistory, Prompt, Room } from './types';

export const HISTORY_TTL = 90 * 24 * 60 * 60 * 1000;
export const validHistoryId = (id: string) => /^[a-f0-9]{32}$/.test(id);

/** Only revealed, scored answers are archived. No guest secrets or individual votes leave the room. */
export function snapshotHistory(
  room: Room,
  id: string,
  now: number,
  prompts: Prompt[],
): GameHistory {
  return {
    version: 1,
    id,
    code: room.code,
    game: room.game,
    finishedAt: now,
    expiresAt: now + HISTORY_TTL,
    rounds: room.round,
    rankings: rankPlayers(room).map(({ name, avatar, rank, score }) => ({
      name,
      avatar,
      rank,
      score,
    })),
    matches: [...(room.pastRounds ?? []), { round: room.round, matches: room.matches }].flatMap(
      ({ round, matches }) =>
        matches
          .filter((m) => m.scored)
          .map((m) => ({
            round,
            text: prompts.find((p) => p.id === m.promptId)?.text ?? 'お題が見つかりません',
            answers: m.players.map((id, i) => {
              const player = room.players[id];
              const visible = Boolean(player && !m.hidden[id] && !player.kicked && m.answers[id]);
              return {
                name: !player || player.kicked ? '退出したプレイヤー' : player.name,
                avatar: !player || player.kicked ? '' : player.avatar,
                text: visible ? m.answers[id] : null,
                votes: visible ? Object.values(m.votes).filter((v) => v === i).length : 0,
                points: visible ? m.points[i] : 0,
              };
            }),
          })),
    ),
  };
}

/** A plain text file remains readable offline and never executes player-supplied HTML. */
export function historyText(history: GameHistory): string {
  return [
    `みんなの大喜利王 · ${history.code} · 第${history.game}ゲーム`,
    `終了日時: ${new Date(history.finishedAt).toISOString()}`,
    '',
    '【最終順位】',
    ...history.rankings.map((p) => `${p.rank}位 ${p.avatar} ${p.name} — ${p.score} pt`),
    '',
    '【お題と回答】',
    ...history.matches.flatMap((m, i) => [
      '',
      `ROUND ${m.round} / お題${i + 1}: ${m.text}`,
      ...m.answers.map(
        (a) =>
          `${a.avatar} ${a.name}: ${a.text ?? '未回答・非表示'} (${a.votes}票 / ${a.points} pt)`,
      ),
    ]),
  ].join('\n');
}
