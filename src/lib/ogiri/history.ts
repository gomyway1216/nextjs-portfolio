import { rankPlayers } from './engine';
import { GAME_TITLES, type GameHistory, type Prompt, type Room } from './types';
import { partyStandings } from '../party/points';
import { gamePlayerIds } from './party';
import { drawingHistory } from './drawing-game';
import { drawingSvg } from './drawing-data';
import { isCustomPromptId, withCustomPrompts } from './custom-prompts';

export const HISTORY_TTL = 90 * 24 * 60 * 60 * 1000;
export const validHistoryId = (id: string) => /^[a-f0-9]{32}$/.test(id);

function sideHistory(room: Room): GameHistory['matches'] {
  return (room.sideRounds ?? []).flatMap(round => round.results.map(entry => {
    const awards = entry.result.awards.filter(award => !room.players[award.id]?.kicked).map(award => ({
      name: room.players[award.id].name, avatar: room.players[award.id].avatar, points: award.points,
    }));
    if (round.type === 'majority') return {
      round: round.round, text: round.prompt,
      answers: round.options.map((option, index) => ({
        name: `選択肢${index + 1}`, avatar: '', text: option.label,
        votes: entry.result.counts[option.id] ?? 0,
        points: entry.result.awards.filter(award => round.ballots[String(entry.index)]?.[award.id] === option.id)
          .reduce((sum, award) => sum + award.points, 0),
      })),
      awards, note: '最多票の選択肢を選ぶと100点。同率最多はすべて対象、無投票は0点。',
    };
    const author = entry.author ? room.players[entry.author] : undefined;
    const visible = author && !author.kicked;
    return {
      round: round.round, text: round.prompt,
      answers: [{ name: visible ? author.name : '退出したプレイヤー', avatar: visible ? author.avatar : '',
        text: visible ? entry.text : null,
        votes: visible ? entry.result.counts[author.id] ?? 0 : 0,
        points: visible ? entry.result.awards.find(award => award.id === author.id)?.points ?? 0 : 0 }],
      awards, note: '票数は作者を当てた票。正解者100点、作者は外された票1つにつき50点。',
    };
  }));
}

/** Only revealed, scored answers are archived. No guest secrets or individual votes leave the room. */
export function snapshotHistory(
  room: Room,
  id: string,
  now: number,
  prompts: Prompt[],
): GameHistory {
  const participants = gamePlayerIds(room);
  prompts = withCustomPrompts(room, prompts);
  return {
    version: 1,
    gameType: room.gameType ?? 'ogiri',
    ...(room.gameType === 'drawing' ? { drawingChains: drawingHistory(room) } : {}),
    partyGames: room.partyGames ?? 0,
    partyRankings: partyStandings(
      Object.values(room.players).filter(
        (p) => !p.kicked && (!p.spectator || (p.partyPoints ?? 0) > 0),
      ),
    ).map((p) => ({
      name: p.name,
      avatar: p.avatar,
      rank: p.partyRank,
      points: p.partyPoints ?? 0,
      earned: p.partyEarned ?? 0,
    })),
    id,
    code: room.code,
    game: room.game,
    finishedAt: now,
    expiresAt: now + HISTORY_TTL,
    rounds: room.round,
    rankings: rankPlayers(room).filter((p) => participants.has(p.id)).map(({ name, avatar, rank, score }) => ({
      name,
      avatar,
      rank,
      score,
    })),
    matches: room.gameType === 'drawing' ? [] : room.gameType === 'majority' || room.gameType === 'identity' ? sideHistory(room) : [...(room.pastRounds ?? []), { round: room.round, matches: room.matches }].flatMap(
      ({ round, matches }) =>
        matches
          .filter((m) => m.scored)
          .map((m) => ({
            round,
            text: prompts.find((p) => p.id === m.promptId)?.text ?? 'お題が見つかりません',
            ...(isCustomPromptId(m.promptId) ? { custom: true } : {}),
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
    `${GAME_TITLES[history.gameType ?? 'ogiri']} · ${history.code} · 第${history.game}ゲーム`,
    `終了日時: ${new Date(history.finishedAt).toISOString()}`,
    '',
    '【最終順位】',
    ...history.rankings.map((p) => `${p.rank}位 ${p.avatar} ${p.name} — ${p.score} 点`),
    ...(history.partyGames
      ? [
          '',
          `【パーティー総合順位 · ${history.partyGames}ゲーム終了】`,
          ...(history.partyRankings ?? []).map(
            (p) => `${p.rank}位 ${p.avatar} ${p.name} — ${p.points} pt (今回 +${p.earned})`,
          ),
        ]
      : []),
    '',
    '【お題と回答】',
    ...(history.drawingChains ?? []).flatMap((chain, i) => [
      '', `伝言${i + 1}: ${chain.prompt}`,
      ...chain.steps.map((step, j) => `${j + 1}. ${step.name}: ${step.kind === 'draw' ? step.drawing ? '（絵）' : '今回はパス' : step.text ?? '今回はパス'} (${step.votes}票 / ${step.points}点)`),
    ]),
    ...history.matches.flatMap((m, i) => [
      '',
      `ROUND ${m.round} / お題${i + 1}${m.custom ? '（自作）' : ''}: ${m.text}`,
      ...(m.note ? [m.note] : []),
      ...m.answers.map(
        (a) =>
          `${a.avatar} ${a.name}: ${a.text ?? '未回答・非表示'} (${a.votes}票 / ${a.points} 点)`,
      ),
      ...(m.awards?.map(a => `獲得点: ${a.avatar} ${a.name} +${a.points} 点`) ?? []),
    ]),
  ].join('\n');
}

const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
/** Self-contained drawing archive: numeric SVG only, escaped text, no scripts or network. */
export function drawingHistoryHtml(history: GameHistory): string {
  const chains = (history.drawingChains ?? []).map((chain, i) => `<section><h2>伝言${i + 1} · ${escapeHtml(chain.prompt)}</h2><div class="steps">${chain.steps.map((step, j) =>
    `<article><h3>${j + 1}. ${step.kind === 'draw' ? '絵' : '言葉'} · ${escapeHtml(step.name)}</h3>${step.drawing ? drawingSvg(JSON.parse(step.drawing)) : `<p>${escapeHtml(step.text ?? '今回はパス！')}</p>`}${step.kind === 'draw' ? `<p>${step.votes}票 · +${step.points}点</p>` : ''}</article>`).join('')}</div></section>`).join('');
  return `<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>おえかき伝言便 · ゲームの記録</title><style>body{font-family:system-ui,sans-serif;max-width:1200px;margin:auto;padding:24px;background:#fff8de;color:#19162f}h1,h2{line-height:1.4}.steps{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:16px}article{padding:16px;background:white;border:2px solid;border-radius:12px;overflow-wrap:anywhere}svg{width:100%;height:auto}pre{white-space:pre-wrap;overflow-wrap:anywhere}</style><h1>おえかき伝言便 · ゲームの記録</h1><pre>${escapeHtml(historyText(history))}</pre>${chains}</html>`;
}
