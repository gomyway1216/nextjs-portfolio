const test = require('node:test');
const assert = require('node:assert/strict');

const { InitialPositionImproved } = require('../src/components/game/ShogiImproved/InitialPositionImproved.ts');
const { GenerateMovesImproved } = require('../src/components/game/ShogiImproved/GenerateMovesImproved.ts');
const { getOpeningMoveImproved } = require('../src/components/game/ShogiImproved/OpeningBookImproved.ts');
const { SENTE, SFU } = require('../src/components/game/ShogiImproved/types.ts');

function pos(suji, dan) {
  return (suji << 4) + dan;
}

function findMove(k, fromSuji, fromDan, toSuji, toDan, promote = false) {
  const from = pos(fromSuji, fromDan);
  const to = pos(toSuji, toDan);
  const koma = from === 0 ? 0 : k.get(from);
  const legal = GenerateMovesImproved.generateLegalMoves(k);
  const te =
    legal.find((m) => m.from === from && m.to === to && m.promote === promote && m.koma === koma) ??
    legal.find((m) => m.from === from && m.to === to && m.promote === promote) ??
    null;
  assert.ok(te, `expected legal move from=${from} to=${to} promote=${promote}`);
  return te;
}

function playMove(k, fromSuji, fromDan, toSuji, toDan, promote = false) {
  const te = findMove(k, fromSuji, fromDan, toSuji, toDan, promote).clone();
  te.capture = k.get(te.to);
  k.move(te);
  k.toggleTeban();
}

test('KyokumenImproved PSQT eval is stable across move/back', () => {
  const k = InitialPositionImproved.createInitialPosition();
  k.setTeban(SENTE);

  const hash0 = k.HashVal;
  const psqt0 = k.psqtEval;
  const eval0 = k.evaluate();

  const legal = GenerateMovesImproved.generateLegalMoves(k);
  assert.ok(legal.length > 0);

  const te = legal[0].clone();
  te.capture = k.get(te.to);

  k.move(te);
  k.back(te);

  assert.equal(k.HashVal, hash0);
  assert.equal(k.psqtEval, psqt0);
  assert.equal(k.evaluate(), eval0);
});

test('OpeningBookImproved returns a legal move from the initial position', () => {
  const k = InitialPositionImproved.createInitialPosition();
  k.setTeban(SENTE);

  const move = getOpeningMoveImproved(k, 'master');
  assert.ok(move);

  const legal = GenerateMovesImproved.generateLegalMoves(k);
  assert.ok(legal.some((m) => m.equals(move)));
});

test('OpeningBookImproved returns null outside the opening phase proxy', () => {
  const k = InitialPositionImproved.createInitialPosition();
  k.setTeban(SENTE);

  // Simulate a midgame-ish state by putting some pieces in hand.
  k.hand[SFU] = 3;
  k.initAll();

  const move = getOpeningMoveImproved(k, 'master');
  assert.equal(move, null);
});

test('OpeningBookImproved continues 2六歩△3四歩 with 7六歩 (no safety-filter false negative)', () => {
  const k = InitialPositionImproved.createInitialPosition();
  k.setTeban(SENTE);

  // ▲2六歩 △3四歩
  playMove(k, 2, 7, 2, 6, false);
  playMove(k, 3, 3, 3, 4, false);

  const expected = findMove(k, 7, 7, 7, 6, false);
  const move = getOpeningMoveImproved(k, 'medium');
  assert.ok(move);
  assert.ok(expected.equals(move));
});
