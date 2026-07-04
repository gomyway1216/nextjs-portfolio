/**
 * Opening-book validation for both engines.
 *
 * 1. OpeningBookImproved: importing the module builds the hash book, which THROWS on any
 *    illegal/teban-mismatched line. We trigger it explicitly and also confirm the initial
 *    position returns a legal move.
 * 2. OpeningBookComprehensive: replays every line from the initial position and reports:
 *    - OK:      every move is legal, on the right teban, and offered by the runtime getter
 *    - DEAD@n:  the line stops being playable at ply n (illegal move / teban mismatch / unmatched)
 *
 *    Lines with explicit `teban` on every move MUST be fully OK (exit code 1 otherwise).
 *    Legacy teban-less lines are reported but tolerated: they derive teban from the move index,
 *    which silently kills them after ply 1-2 (the historical "dead book" bug). Fix them by adding
 *    explicit teban when touching them.
 *
 * Usage: node -r tsx/cjs scripts/shogi-validate-opening-books.ts
 */
import {
  ALL_OPENING_SEQUENCES,
  getOpeningMoveCandidatesComprehensive,
} from '../src/components/game/Shogi/OpeningBookComprehensive';
import { generateLegalMoves } from '../src/components/game/Shogi/GenerateMoves';
import { createInitialPosition } from '../src/components/game/Shogi/InitialPosition';
import { SENTE, GOTE, Te, getKomashu } from '../src/components/game/Shogi/types';
import { getOpeningMoveImproved } from '../src/components/game/ShogiImproved/OpeningBookImproved';
import { GenerateMovesImproved } from '../src/components/game/ShogiImproved/GenerateMovesImproved';
import { InitialPositionImproved } from '../src/components/game/ShogiImproved/InitialPositionImproved';
import { SENTE as ISENTE } from '../src/components/game/ShogiImproved/types';

// ---------------------------------------------------------------------------
// 1. OpeningBookImproved (throws at build time on any illegal line)
// ---------------------------------------------------------------------------
{
  const k = InitialPositionImproved.createInitialPosition();
  k.setTeban(ISENTE);
  const move = getOpeningMoveImproved(k, 'master'); // forces buildBook()
  if (!move) throw new Error('[improved] no book move from the initial position');
  const legal = GenerateMovesImproved.generateLegalMoves(k);
  if (!legal.some((m) => m.equals(move))) {
    throw new Error('[improved] initial-position book move is not legal');
  }
  console.log('[improved] book built and initial-position move is legal\n');
}

// ---------------------------------------------------------------------------
// 2. OpeningBookComprehensive (replay every line)
// ---------------------------------------------------------------------------
let hardFailures = 0;

for (const line of ALL_OPENING_SEQUENCES) {
  const k = createInitialPosition();
  k.teban = SENTE;
  const history: Te[] = [];
  const allTebanExplicit = line.moves.every((m) => m.teban !== undefined);
  let status = 'OK';

  for (let i = 0; i < line.moves.length; i++) {
    const bm = line.moves[i];
    const expectedTeban = bm.teban ?? (i % 2 === 0 ? SENTE : GOTE);
    if (expectedTeban !== k.teban) {
      status = `DEAD@${i + 1} (teban mismatch)`;
      break;
    }

    const legal = generateLegalMoves(k);
    const isDrop = bm.from.suji === 0 && bm.from.dan === 0;
    const found = legal.find(
      (m) =>
        m.from.suji === bm.from.suji &&
        m.from.dan === bm.from.dan &&
        m.to.suji === bm.to.suji &&
        m.to.dan === bm.to.dan &&
        m.promote === bm.promote &&
        (!isDrop || getKomashu(m.koma) === (bm as { drop?: number }).drop)
    );
    if (!found) {
      status = `DEAD@${i + 1} (illegal/unmatched: ${bm.from.suji}${bm.from.dan}->${bm.to.suji}${bm.to.dan}${isDrop ? ' drop' : ''})`;
      break;
    }

    // Also confirm the runtime book getter would offer this move at this point.
    const candidates = getOpeningMoveCandidatesComprehensive(k, i + 1, k.teban, history);
    const offered = candidates.some(
      (c) =>
        c.move.from.suji === bm.from.suji &&
        c.move.from.dan === bm.from.dan &&
        c.move.to.suji === bm.to.suji &&
        c.move.to.dan === bm.to.dan &&
        c.move.promote === bm.promote &&
        // For drops (from 0,0) the coordinates alone are ambiguous — also match the piece.
        (bm.from.suji !== 0 || getKomashu(c.move.koma) === getKomashu(found.koma))
    );
    if (!offered) {
      status = `DEAD@${i + 1} (not offered by getOpeningMoveCandidatesComprehensive)`;
      break;
    }

    k.move(found);
    history.push(found);
    k.teban = k.teban === SENTE ? GOTE : SENTE;
  }

  const tag = allTebanExplicit ? '[strict]' : '[legacy]';
  console.log(`${tag} ${line.name} (${line.moves.length} plies): ${status}`);
  if (allTebanExplicit && status !== 'OK') hardFailures++;
}

if (hardFailures > 0) {
  console.error(`\n${hardFailures} strict line(s) failed`);
  process.exit(1);
}
console.log('\nAll strict (teban-explicit) lines OK');
