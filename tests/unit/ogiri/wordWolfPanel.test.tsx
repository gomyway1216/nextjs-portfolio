import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { WordWolfPanel } from '@/components/game/Ogiri/WordWolfPanel';
import { act, createRoom, joinRoom, newPlayer, project } from '@/lib/ogiri/engine';
import { prompts } from '@/lib/ogiri/prompts';
import { currentWordWolf } from '@/lib/ogiri/word-wolf';
import { WORD_WOLF_PAIRS } from '@/lib/ogiri/word-wolf-words';
import type { Room } from '@/lib/ogiri/types';

const now = 10000;
const render = (room: Room, me: string | null, tv = false) => renderToStaticMarkup(
  <WordWolfPanel view={project(room, me, now, prompts)} tv={tv} busy={false} connected reduced remaining={30} send={async () => true} />);

it('renders each stage with only what that screen may see', () => {
  const room = createRoom('ABC234', newPlayer('host', 'h', '進行役', '🐱', now), now);
  room.players.host.spectator = true;
  for (let i = 0; i < 4; i++) joinRoom(room, newPlayer(`p${i}`, 's', `参加者${i}`, 'rabbit', now));
  room.settings = { ...room.settings, gameType: 'wordwolf' };
  act(room, 'host', { type: 'start' }, now, prompts, () => 0.3);
  const round = currentWordWolf(room)!;
  const [wolf] = round.wolves;
  const citizen = round.players.find(id => id !== wolf)!;
  const pair = WORD_WOLF_PAIRS[round.pair].ja;
  const wolfWord = pair[round.wolfSide], citizenWord = pair[1 - round.wolfSide];

  expect(render(room, citizen)).toContain(citizenWord);
  expect(render(room, citizen)).not.toContain(wolfWord);
  expect(render(room, citizen)).toContain('話し合いOK');
  expect(render(room, null, true)).not.toContain(citizenWord);
  expect(render(room, null, true)).not.toContain(wolfWord);

  for (const id of round.players) act(room, id, { type: 'answerReady', ready: true }, now + 1, prompts);
  const ballot = render(room, citizen);
  expect(ballot).toContain('がウルフだと思う');
  expect(ballot).not.toContain(`${room.players[citizen].name}がウルフだと思う`);

  for (const id of round.players) act(room, id, { type: 'partyVote', choice: id === wolf ? citizen : wolf }, now + 2, prompts);
  expect(render(room, wolf)).toContain('wordwolf-guess-form');
  expect(render(room, citizen)).not.toContain('wordwolf-guess-form');
  expect(render(room, null, true)).toContain('ウルフでした');
  expect(render(room, null, true)).not.toContain(citizenWord);

  act(room, wolf, { type: 'partyAnswer', text: 'はずれ' }, now + 3, prompts);
  const result = render(room, null, true);
  expect(result).toContain('市民の勝ち');
  expect(result).toContain(citizenWord);
  expect(result).toContain(wolfWord);
  expect(result).not.toContain('この推理を正解にする');
  expect(render(room, 'host')).toContain('この推理を正解にする');
});
