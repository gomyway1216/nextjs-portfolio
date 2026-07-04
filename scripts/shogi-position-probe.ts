/**
 * Probe: reproduce the exact game from the user's screenshot and ask the real
 * /games/shogi AI path (getBestMove) what it plays at the critical moments.
 *
 * Game: ▲2六歩 △8四歩 ▲2五歩 △8五歩 ▲7八金 △3二金 ▲2四歩 △同歩 ▲2四飛
 *       (reported: △4二飛?? ▲2三歩打 △9四歩??)
 */
import { generateLegalMoves } from '../src/components/game/Shogi/GenerateMoves';
import { createInitialPosition } from '../src/components/game/Shogi/InitialPosition';
import { getBestMove } from '../src/components/game/Shogi/ShogiAI';
import { FU, GOTE, SENTE, Te, getKomashu } from '../src/components/game/Shogi/types';

const k = createInitialPosition();
k.teban = SENTE;
const history: Te[] = [];
let moveNumber = 1;

function play(fs: number, fd: number, ts: number, td: number, promote = false): void {
  const legal = generateLegalMoves(k);
  const te = legal.find(
    (m) => m.from.suji === fs && m.from.dan === fd && m.to.suji === ts && m.to.dan === td && m.promote === promote
  );
  if (!te) throw new Error(`illegal scripted move ${fs}${fd}->${ts}${td}`);
  k.move(te);
  history.push(te);
  k.teban = k.teban === SENTE ? GOTE : SENTE;
  moveNumber++;
}

function playDrop(komashu: number, ts: number, td: number): void {
  const legal = generateLegalMoves(k);
  const te = legal.find(
    (m) => m.from.suji === 0 && m.to.suji === ts && m.to.dan === td && getKomashu(m.koma) === komashu
  );
  if (!te) throw new Error(`illegal drop ${komashu} to ${ts}${td}`);
  k.move(te);
  history.push(te);
  k.teban = k.teban === SENTE ? GOTE : SENTE;
  moveNumber++;
}

function askAI(label: string): void {
  const t0 = Date.now();
  const move = getBestMove(k, GOTE, 'hard', moveNumber, history);
  const ms = Date.now() - t0;
  if (!move) {
    console.log(`${label}: NO MOVE`);
    return;
  }
  const from = move.from.suji === 0 ? '打' : `${move.from.suji}${move.from.dan}`;
  console.log(`${label}: AI(hard) plays ${from}->${move.to.suji}${move.to.dan}${move.promote ? '成' : ''} (${ms}ms)`);
}

// Moves 1-9 (from the screenshot)
play(2, 7, 2, 6); // 1 ▲2六歩
play(8, 3, 8, 4); // 2 △8四歩
play(2, 6, 2, 5); // 3 ▲2五歩
play(8, 4, 8, 5); // 4 △8五歩
play(6, 9, 7, 8); // 5 ▲7八金
play(4, 1, 3, 2); // 6 △3二金
play(2, 5, 2, 4); // 7 ▲2四歩
play(2, 3, 2, 4); // 8 △同歩
play(2, 8, 2, 4); // 9 ▲同飛

console.log('--- position after ▲2四飛 (move 10 is GOTE to play; joseki: △2三歩) ---');
askAI('move 10');

// Force the reported (bad) move 10 △4二飛, then sente ▲2三歩打 as in the game.
play(8, 2, 4, 2); // 10 △4二飛 (as reported)
playDrop(FU, 2, 3); // 11 ▲2三歩打

console.log('--- position after ▲2三歩打 (threatens 2二歩成 winning the bishop; reported: △9四歩??) ---');
askAI('move 12');
