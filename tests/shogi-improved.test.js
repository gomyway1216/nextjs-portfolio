const test = require('node:test');
const assert = require('node:assert/strict');

const { InitialPositionImproved } = require('../src/components/game/ShogiImproved/InitialPositionImproved.ts');
const { GenerateMovesImproved } = require('../src/components/game/ShogiImproved/GenerateMovesImproved.ts');
const { getOpeningMoveImproved } = require('../src/components/game/ShogiImproved/OpeningBookImproved.ts');
const { SENTE, SFU } = require('../src/components/game/ShogiImproved/types.ts');

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

