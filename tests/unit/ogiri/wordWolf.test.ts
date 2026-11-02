import { describe, expect, it } from 'vitest';
import { act, createRoom, joinRoom, newPlayer, project, rankPlayers, settingsInput, tick } from '@/lib/ogiri/engine';
import { historyText, snapshotHistory } from '@/lib/ogiri/history';
import { gamePlayerIds, settlePartyPoints } from '@/lib/ogiri/party';
import { prompts } from '@/lib/ogiri/prompts';
import { canonicalWord, currentWordWolf, WOLF_POINTS } from '@/lib/ogiri/word-wolf';
import { WORD_WOLF_PAIRS } from '@/lib/ogiri/word-wolf-words';
import type { Room } from '@/lib/ogiri/types';

const now = 10000;
function setup(count: number, { automatic = true, rounds = 1, wolves = 1, rng = () => 0.3 }: {
  automatic?: boolean; rounds?: number; wolves?: 1 | 2; rng?: () => number;
} = {}) {
  const room = createRoom('ABC234', newPlayer('host', 'h', '進行役', '🐱', now), now);
  room.players.host.spectator = true;
  for (let i = 0; i < count; i++) joinRoom(room, newPlayer(`p${i}`, 's', `参加者${i}`, 'rabbit', now));
  room.settings = { ...room.settings, gameType: 'wordwolf', autoAdvance: automatic, rounds, wolves };
  act(room, 'host', { type: 'start' }, now, prompts, rng);
  return room;
}
const round = (room: Room) => currentWordWolf(room)!;
const words = (room: Room) => {
  const pair = WORD_WOLF_PAIRS[round(room).pair];
  return { wolf: pair.ja[round(room).wolfSide], citizen: pair.ja[1 - round(room).wolfSide], citizenEn: pair.en[1 - round(room).wolfSide] };
};
const citizens = (room: Room) => round(room).players.filter(id => !round(room).wolves.includes(id));
const talkDone = (room: Room, time = now + 1) => {
  for (const id of round(room).players) act(room, id, { type: 'answerReady', ready: true }, time, prompts);
};
/** Everyone votes for `target`, while the target votes for someone else. */
function voteFor(room: Room, target: string, time = now + 2) {
  const fallback = round(room).players.find(id => id !== target)!;
  for (const id of round(room).players)
    act(room, id, { type: 'partyVote', choice: id === target ? fallback : target }, time, prompts);
}
const scores = (room: Room) => Object.fromEntries(round(room).players.map(id => [id, room.players[id].score]));

describe('ワードウルフ role assignment', () => {
  it.each([3, 4, 5, 6, 8, 12])('gives %i players one secret wolf word and one shared citizen word', count => {
    const room = setup(count);
    expect(room.phase).toBe('answering');
    expect(round(room).players).toHaveLength(count);
    expect(round(room).wolves).toHaveLength(1);
    expect(round(room).players).not.toContain('host');
    const { wolf, citizen } = words(room);
    expect(wolf).not.toBe(citizen);
    for (const id of round(room).players)
      expect(project(room, id, now, prompts).wordWolfGame?.myWord).toBe(round(room).wolves.includes(id) ? wolf : citizen);
    expect(room.usedPrompts).toEqual([`wordwolf:${round(room).pair}`]);
  });

  it('uses two wolves only when chosen and at least six players are playing', () => {
    expect(round(setup(6, { wolves: 2 })).wolves).toHaveLength(2);
    expect(round(setup(12, { wolves: 2 })).wolves).toHaveLength(2);
    expect(round(setup(5, { wolves: 2 })).wolves).toHaveLength(1);
    expect(new Set(round(setup(8, { wolves: 2 })).wolves).size).toBe(2);
    expect(() => settingsInput({ ...room0().settings, gameType: 'wordwolf', wolves: 3 })).toThrow('ウルフの人数');
    expect(settingsInput({ ...room0().settings, gameType: 'wordwolf', wolves: 2 })).toMatchObject({ gameType: 'wordwolf', wolves: 2 });
  });

  it('varies the wolf and the pair, and does not repeat a pair until the list runs out', () => {
    let seed = 7;
    const rng = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
    const room = setup(5, { rounds: 5, rng });
    const seen = new Set<number>();
    const wolves = new Set<string>();
    for (let r = 0; r < 5; r++) {
      seen.add(round(room).pair);
      wolves.add(round(room).wolves[0]);
      if (r < 4) for (let step = 0; step < 4; step++) act(room, 'host', { type: 'next' }, now + r * 10 + step, prompts, rng);
    }
    expect(seen.size).toBe(5);
    expect(wolves.size).toBeGreaterThan(1);
    expect(new Set(WORD_WOLF_PAIRS.map(pair => pair.ja.join('/'))).size).toBe(WORD_WOLF_PAIRS.length);
    expect(WORD_WOLF_PAIRS.length).toBeGreaterThanOrEqual(48);
    for (const pair of WORD_WOLF_PAIRS) {
      expect(pair.ja[0]).not.toBe(pair.ja[1]);
      expect(pair.en.every(word => word.trim().length > 0)).toBe(true);
    }
  });
});

function room0() {
  return createRoom('ABC234', newPlayer('host', 'h', '進行役', '🐱', now), now);
}

describe('ワードウルフ projection secrecy', () => {
  it('never shows either word or any role to the TV, the GM or the wrong player before the result', () => {
    const room = setup(6, { wolves: 2 });
    const { wolf, citizen } = words(room);
    const check = () => {
      const tv = JSON.stringify(project(room, null, now, prompts));
      const gm = JSON.stringify(project(room, 'host', now, prompts));
      for (const view of [tv, gm]) {
        expect(view).not.toContain(wolf);
        expect(view).not.toContain(citizen);
        expect(view).not.toContain('"wolves":[');
        expect(view).not.toContain('"wordWolf"');
      }
      for (const id of round(room).players) {
        const view = JSON.stringify(project(room, id, now, prompts));
        expect(view).not.toContain(round(room).wolves.includes(id) ? citizen : wolf);
        expect(view).not.toContain('wolfSide');
        expect(view).not.toContain('ballots');
      }
    };
    check();
    expect(project(room, null, now, prompts).wordWolfGame).toMatchObject({ myWord: null, wolfCount: 2, result: null, accused: null });
    talkDone(room);
    expect(room.phase).toBe('voting');
    check();
    voteFor(room, round(room).wolves[0]);
    expect(room.phase).toBe('reveal');
    expect(room.matchIndex).toBe(0);
    check();
    // The caught wolf is announced, but the other wolf stays hidden until the result.
    const tv = project(room, null, now, prompts).wordWolfGame!;
    expect(tv.accused).toMatchObject({ id: round(room).wolves[0], isWolf: true });
    expect(tv.result).toBeNull();
    expect(JSON.stringify(tv).match(/isWolf/g)).toHaveLength(1);
  });

  it('does not reveal who voted for whom, and reveals both words only with the result', () => {
    const room = setup(4);
    talkDone(room);
    const wolf = round(room).wolves[0];
    const citizen = citizens(room)[0];
    act(room, citizen, { type: 'partyVote', choice: wolf }, now + 2, prompts);
    const other = JSON.stringify(project(room, citizens(room)[1], now + 2, prompts));
    expect(other).not.toContain(`"${citizen}":"${wolf}"`);
    expect(project(room, citizens(room)[1], now + 2, prompts).wordWolfGame).toMatchObject({ votesReceived: 1, counts: null });
    for (const id of round(room).players.filter(id => id !== citizen)) act(room, id, { type: 'partyVote', choice: id === wolf ? citizen : wolf }, now + 3, prompts);
    act(room, wolf, { type: 'partyAnswer', text: 'まちがい' }, now + 4, prompts);
    expect(project(room, null, now + 4, prompts).wordWolfGame?.result).toMatchObject({
      citizenWord: words(room).citizen, wolfWord: words(room).wolf, wolves: [{ id: wolf }], winner: 'citizens',
    });
  });
});

describe('ワードウルフ flow and scoring', () => {
  it('ends talk at the deadline when automatic, but waits for the host when manual', () => {
    const auto = setup(4);
    expect(tick(auto, now + 179_000, prompts)).toBe(false);
    expect(tick(auto, now + 180_000, prompts)).toBe(true);
    expect(auto.phase).toBe('voting');
    const manual = setup(4, { automatic: false });
    expect(tick(manual, now + 999_000, prompts)).toBe(false);
    talkDone(manual);
    expect(manual.phase).toBe('answering');
    act(manual, 'host', { type: 'next' }, now + 2, prompts);
    expect(manual.phase).toBe('voting');
  });

  it('rejects self votes, double votes, GM votes and guesses from anyone but the caught wolf', () => {
    const room = setup(4);
    talkDone(room);
    const [a, b] = round(room).players;
    expect(() => act(room, a, { type: 'partyVote', choice: a }, now + 2, prompts)).toThrow('自分には投票できません');
    expect(() => act(room, 'host', { type: 'partyVote', choice: a }, now + 2, prompts)).toThrow('参加できません');
    act(room, a, { type: 'partyVote', choice: b }, now + 2, prompts);
    expect(() => act(room, a, { type: 'partyVote', choice: b }, now + 2, prompts)).toThrow('投票済み');
    expect(() => act(room, a, { type: 'partyAnswer', text: 'カレー' }, now + 2, prompts)).toThrow('推理できません');
  });

  it('pays every citizen and the detectives when the wolf is caught and misses the guess', () => {
    const room = setup(5);
    talkDone(room);
    const wolf = round(room).wolves[0];
    voteFor(room, wolf);
    expect(project(room, wolf, now, prompts).wordWolfGame?.canGuess).toBe(true);
    expect(project(room, citizens(room)[0], now, prompts).wordWolfGame?.canGuess).toBe(false);
    act(room, wolf, { type: 'partyAnswer', text: 'ぜんぜんちがう' }, now + 3, prompts);
    expect(room.matchIndex).toBe(1);
    expect(() => act(room, wolf, { type: 'partyAnswer', text: 'もう一回' }, now + 4, prompts)).toThrow();
    expect(scores(room)).toEqual(Object.fromEntries(round(room).players.map(id =>
      [id, id === wolf ? 0 : WOLF_POINTS.caught + WOLF_POINTS.detective])));
  });

  it('lets a caught wolf reverse the round by guessing the citizen word in another spelling', () => {
    const room = setup(4);
    talkDone(room);
    const wolf = round(room).wolves[0];
    voteFor(room, wolf);
    const { citizen } = words(room);
    const kana = [...citizen].map(ch => /[ぁ-ゖ]/.test(ch) ? String.fromCharCode(ch.charCodeAt(0) + 0x60) : ch).join('');
    act(room, wolf, { type: 'partyAnswer', text: ` ${kana} ` }, now + 3, prompts);
    expect(round(room).guessCorrect).toBe(true);
    expect(project(room, null, now, prompts).wordWolfGame?.result?.winner).toBe('wolves');
    expect(scores(room)).toEqual(Object.fromEntries(round(room).players.map(id =>
      [id, id === wolf ? WOLF_POINTS.escape : WOLF_POINTS.detective])));
  });

  it('accepts the English word and ignores width, case and punctuation differences', () => {
    expect(canonicalWord('ＣＵＲＲＹ！')).toBe(canonicalWord('curry'));
    expect(canonicalWord('ハヤシ ライス')).toBe(canonicalWord('はやしらいす'));
    const room = setup(3);
    talkDone(room);
    const wolf = round(room).wolves[0];
    voteFor(room, wolf);
    act(room, wolf, { type: 'partyAnswer', text: words(room).citizenEn.toUpperCase() }, now + 3, prompts);
    expect(round(room).guessCorrect).toBe(true);
  });

  it('lets the wolf escape when a citizen is accused or the vote ties', () => {
    const accused = setup(5);
    talkDone(accused);
    const wolf = round(accused).wolves[0];
    const innocent = citizens(accused)[0];
    voteFor(accused, innocent);
    expect(accused).toMatchObject({ phase: 'reveal', matchIndex: 1 });
    expect(scores(accused)).toEqual(Object.fromEntries(round(accused).players.map(id => [id, id === wolf ? WOLF_POINTS.escape : 0])));
    expect(project(accused, null, now, prompts).wordWolfGame?.accused).toMatchObject({ id: innocent, isWolf: false, votes: 4 });

    const tied = setup(4);
    talkDone(tied);
    const tiedWolf = round(tied).wolves[0];
    const [c1, c2, c3] = citizens(tied);
    act(tied, c1, { type: 'partyVote', choice: tiedWolf }, now + 2, prompts);
    act(tied, c2, { type: 'partyVote', choice: tiedWolf }, now + 2, prompts);
    act(tied, c3, { type: 'partyVote', choice: c1 }, now + 2, prompts);
    act(tied, tiedWolf, { type: 'partyVote', choice: c1 }, now + 2, prompts);
    expect(round(tied).accused).toBeNull();
    expect(scores(tied)).toMatchObject({ [tiedWolf]: WOLF_POINTS.escape, [c1]: WOLF_POINTS.detective, [c2]: WOLF_POINTS.detective, [c3]: 0 });
    expect(project(tied, null, now, prompts).wordWolfGame?.result?.winner).toBe('wolves');
  });

  it('treats two wolves as one team when one of them is caught', () => {
    const room = setup(6, { wolves: 2 });
    talkDone(room);
    const [caught, hidden] = round(room).wolves;
    voteFor(room, caught);
    act(room, caught, { type: 'partyAnswer', text: 'はずれ' }, now + 3, prompts);
    const result = scores(room);
    expect(result[caught]).toBe(0);
    expect(result[hidden]).toBe(0);
    for (const id of citizens(room)) expect(result[id]).toBe(WOLF_POINTS.caught + WOLF_POINTS.detective);
  });

  it('closes the last chance at its deadline and lets the host accept a close guess', () => {
    const room = setup(4);
    talkDone(room);
    const wolf = round(room).wolves[0];
    voteFor(room, wolf);
    expect(tick(room, room.deadline, prompts)).toBe(true);
    expect(room.matchIndex).toBe(1);
    expect(round(room).guess).toBeNull();
    expect(project(room, 'host', now, prompts).wordWolfGame?.canAccept).toBe(false);

    const close = setup(4);
    talkDone(close);
    const closeWolf = round(close).wolves[0];
    voteFor(close, closeWolf);
    act(close, closeWolf, { type: 'partyAnswer', text: 'ちかいけど別の言葉' }, now + 3, prompts);
    expect(project(close, 'host', now, prompts).wordWolfGame?.canAccept).toBe(true);
    expect(project(close, citizens(close)[0], now, prompts).wordWolfGame?.canAccept).toBe(false);
    expect(() => act(close, citizens(close)[0], { type: 'wolfAccept' }, now + 4, prompts)).toThrow('主催者');
    act(close, 'host', { type: 'wolfAccept' }, now + 4, prompts);
    expect(scores(close)).toEqual(Object.fromEntries(round(close).players.map(id =>
      [id, id === closeWolf ? WOLF_POINTS.escape : WOLF_POINTS.detective])));
    expect(() => act(close, 'host', { type: 'wolfAccept' }, now + 5, prompts)).toThrow();
  });

  it('drops a kicked player\'s ballots before the tally', () => {
    const room = setup(5);
    talkDone(room);
    const wolf = round(room).wolves[0];
    const [kicked, ...rest] = citizens(room);
    act(room, kicked, { type: 'partyVote', choice: wolf }, now + 2, prompts);
    act(room, 'host', { type: 'kick', playerId: kicked }, now + 2, prompts);
    expect(round(room).ballots).not.toHaveProperty(kicked);
    for (const id of rest) act(room, id, { type: 'partyVote', choice: wolf }, now + 3, prompts);
    act(room, wolf, { type: 'partyVote', choice: rest[0] }, now + 3, prompts);
    expect(room.phase).toBe('reveal');
    expect(round(room).counts).not.toHaveProperty(kicked);
  });

  it('settles party points once, archives words and roles, and clears the round on rematch', () => {
    const room = setup(4, { rounds: 2 });
    talkDone(room);
    const wolf = round(room).wolves[0];
    voteFor(room, wolf);
    act(room, wolf, { type: 'partyAnswer', text: 'はずれ' }, now + 3, prompts);
    act(room, 'host', { type: 'next' }, now + 4, prompts);
    expect(room.phase).toBe('ranking');
    act(room, 'host', { type: 'next' }, now + 5, prompts);
    expect(room.round).toBe(2);
    expect(room.phase).toBe('answering');
    act(room, 'host', { type: 'finish' }, now + 6, prompts);
    expect(gamePlayerIds(room).size).toBe(4);
    settlePartyPoints(room, rankPlayers(room));
    const awarded = round(room).players.map(id => room.players[id].partyPoints);
    settlePartyPoints(room, rankPlayers(room));
    expect(round(room).players.map(id => room.players[id].partyPoints)).toEqual(awarded);
    expect(room.partyGames).toBe(1);
    const history = snapshotHistory(room, 'a'.repeat(32), now, prompts);
    // Only the scored first round is archived; the unfinished second round's words stay private.
    expect(history.gameType).toBe('wordwolf');
    expect(history.matches).toHaveLength(1);
    const first = room.wordWolf![0];
    const pair = WORD_WOLF_PAIRS[first.pair].ja;
    expect(history.matches[0].text).toBe(`市民「${pair[1 - first.wolfSide]}」 / ウルフ「${pair[first.wolfSide]}」`);
    expect(history.matches[0].answers.find(answer => answer.name === room.players[wolf].name)?.text).toContain('ウルフ');
    expect(round(room).pair).not.toBe(first.pair);
    for (const word of WORD_WOLF_PAIRS[round(room).pair].ja) expect(JSON.stringify(history)).not.toContain(word);
    expect(historyText(history)).toContain('ワードウルフ');
    expect(historyText(history)).toContain('ウルフを発見');
    act(room, 'host', { type: 'rematch', gameType: 'majority' }, now + 7, prompts);
    expect(room.wordWolf).toBeUndefined();
    expect(room.settings.gameType).toBe('majority');
  });
});
