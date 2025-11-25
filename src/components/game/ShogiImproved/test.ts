import {
  SENTE, GOTE, EMPTY,
  SFU, SKY, SKE, SGI, SKI, SKA, SHI, SOU,
  GFU, GKY, GKE, GGI, GKI, GKA, GHI, GOU,
  Te
} from './types';
import { KyokumenImproved } from './KyokumenImproved';
import { GenerateMovesImproved } from './GenerateMovesImproved';
import { ShogiAIImproved } from './ShogiAIImproved';
import { InitialPositionImproved } from './InitialPositionImproved';

// Test suite for ShogiImproved implementation
export class ShogiImprovedTest {
  private passedTests = 0;
  private failedTests = 0;

  // Run all tests
  runAll(): void {
    console.log('Starting ShogiImproved Tests...\n');

    this.testInitialPosition();
    this.testHandManagement();
    this.testPieceCapture();
    this.testPieceDrop();
    this.testMoveGeneration();
    this.testPromotion();
    this.testHashingConsistency();
    this.testAIMove();
    this.testEvaluationSymmetry();
    this.testTranspositionTable();

    console.log('\n=== Test Results ===');
    console.log(`Passed: ${this.passedTests}`);
    console.log(`Failed: ${this.failedTests}`);
    console.log(`Total: ${this.passedTests + this.failedTests}`);
  }

  private assert(condition: boolean, message: string): void {
    if (condition) {
      console.log(`✓ ${message}`);
      this.passedTests++;
    } else {
      console.error(`✗ ${message}`);
      this.failedTests++;
    }
  }

  // Test 1: Initial position setup
  private testInitialPosition(): void {
    console.log('\nTest 1: Initial Position Setup');

    const k = new KyokumenImproved();
    k.initHirate();

    // Check some key pieces
    this.assert(k.get(0x55) === SOU, 'Sente king at 5-5');
    this.assert(k.get(0x51) === GOU, 'Gote king at 5-1');
    this.assert(k.get(0x27) === SFU, 'Sente pawn at 2-7');
    this.assert(k.get(0x83) === GFU, 'Gote pawn at 8-3');

    // Check empty hands
    this.assert(k.hand[SFU] === 0, 'Sente has no pawns in hand');
    this.assert(k.hand[GHI] === 0, 'Gote has no rook in hand');

    // Check turn
    this.assert(k.teban === SENTE, 'Initial turn is Sente');
  }

  // Test 2: Hand management
  private testHandManagement(): void {
    console.log('\nTest 2: Hand Management');

    const k = new KyokumenImproved();
    k.initHirate();

    // Manually add pieces to hand
    k.hand[SFU] = 2;
    k.hand[GHI] = 1;

    this.assert(k.hand[SFU] === 2, 'Sente has 2 pawns in hand');
    this.assert(k.hand[GHI] === 1, 'Gote has 1 rook in hand');

    // Test hand indexing
    this.assert(k.hand[SFU] === k.hand[SENTE | 1], 'Hand indexing with SENTE flag works');
    this.assert(k.hand[GHI] === k.hand[GOTE | 7], 'Hand indexing with GOTE flag works');
  }

  // Test 3: Piece capture
  private testPieceCapture(): void {
    console.log('\nTest 3: Piece Capture');

    const k = new KyokumenImproved();
    k.initHirate();

    // Create a capture scenario: Move Sente pawn to capture Gote pawn
    // First, set up a position where capture is possible
    k.put(0x54, SFU);  // Sente pawn at 5-4
    k.put(0x53, GFU);  // Gote pawn at 5-3

    const initialEval = k.eval;
    const capture = new Te(SFU, 0x54, 0x53, false, GFU);

    k.move(capture);

    this.assert(k.get(0x53) === SFU, 'Sente pawn moved to 5-3');
    this.assert(k.get(0x54) === EMPTY, 'Original position is empty');
    this.assert(k.hand[SFU] === 1, 'Captured pawn in Sente hand (unpromoted)');
    this.assert(k.eval !== initialEval, 'Evaluation changed after capture');

    // Test undo
    k.back(capture);
    this.assert(k.get(0x54) === SFU, 'Sente pawn back at 5-4');
    this.assert(k.get(0x53) === GFU, 'Gote pawn restored at 5-3');
    this.assert(k.hand[SFU] === 0, 'Hand restored to 0');
  }

  // Test 4: Piece drop
  private testPieceDrop(): void {
    console.log('\nTest 4: Piece Drop');

    const k = new KyokumenImproved();
    k.initHirate();

    // Add a pawn to hand
    k.hand[SFU] = 1;
    k.calcHash();  // Recalculate hash after manual change

    const drop = new Te(SFU, 0, 0x55, false, EMPTY);
    const initialHash = k.HashVal;

    k.move(drop);

    this.assert(k.get(0x55) === SFU, 'Pawn dropped at 5-5');
    this.assert(k.hand[SFU] === 0, 'Hand count decremented');
    this.assert(k.HashVal !== initialHash, 'Hash changed after drop');

    // Test undo
    k.back(drop);
    this.assert(k.get(0x55) === EMPTY, 'Square empty after undo');
    this.assert(k.hand[SFU] === 1, 'Hand count restored');
    this.assert(k.HashVal === initialHash, 'Hash restored after undo');
  }

  // Test 5: Move generation
  private testMoveGeneration(): void {
    console.log('\nTest 5: Move Generation');

    const k = new KyokumenImproved();
    k.initHirate();

    const moves = GenerateMovesImproved.generateLegalMoves(k);

    this.assert(moves.length > 0, 'Legal moves generated');
    this.assert(moves.length === 30, 'Initial position has 30 legal moves');

    // Check that all moves are from Sente pieces
    const allSenteMoves = moves.every(m =>
      m.from === 0 ? (m.koma & SENTE) !== 0 : (k.get(m.from) & SENTE) !== 0
    );
    this.assert(allSenteMoves, 'All moves are from Sente pieces');
  }

  // Test 6: Promotion
  private testPromotion(): void {
    console.log('\nTest 6: Promotion');

    const k = new KyokumenImproved();
    k.initHirate();

    // Set up a promotion scenario
    k.put(0x53, SFU);  // Sente pawn at 5-3 (promotion zone)
    k.put(0x52, EMPTY); // Clear 5-2

    const promote = new Te(SFU, 0x53, 0x52, true, EMPTY);
    const initialEval = k.eval;

    k.move(promote);

    this.assert(k.get(0x52) === (SFU | 8), 'Pawn promoted to Tokin');
    this.assert(k.eval > initialEval, 'Evaluation increased after promotion');

    // Test undo
    k.back(promote);
    this.assert(k.get(0x53) === SFU, 'Unpromoted pawn restored');
    this.assert(k.eval === initialEval, 'Evaluation restored');
  }

  // Test 7: Hashing consistency
  private testHashingConsistency(): void {
    console.log('\nTest 7: Hashing Consistency');

    const k1 = new KyokumenImproved();
    k1.initHirate();

    const k2 = new KyokumenImproved();
    k2.initHirate();

    this.assert(k1.HashVal === k2.HashVal, 'Same positions have same hash');

    // Make a move on k1
    const moves = GenerateMovesImproved.generateLegalMoves(k1);
    if (moves.length > 0) {
      k1.move(moves[0]);

      this.assert(k1.HashVal !== k2.HashVal, 'Different positions have different hash');

      // Make same move on k2
      k2.move(moves[0]);
      this.assert(k1.HashVal === k2.HashVal, 'Same positions after same moves have same hash');
    }
  }

  // Test 8: AI can find a legal move
  private testAIMove(): void {
    console.log('\nTest 8: AI Move Generation');

    const k = new KyokumenImproved();
    k.initHirate();

    const ai = new ShogiAIImproved();
    const aiMove = ai.getNextTe(k);

    this.assert(aiMove !== null, 'AI found a move');

    if (aiMove) {
      const isLegal = GenerateMovesImproved.isLegalMove(k, aiMove);
      this.assert(isLegal, 'AI move is legal');
    }
  }

  // Test 9: Evaluation symmetry
  private testEvaluationSymmetry(): void {
    console.log('\nTest 9: Evaluation Symmetry');

    const k = new KyokumenImproved();
    k.initHirate();

    const senteEval = k.evaluate();

    k.teban = GOTE;
    const goteEval = k.evaluate();

    this.assert(senteEval === -goteEval, 'Evaluation is symmetric (zero for even position)');
    this.assert(senteEval === 0, 'Initial position evaluation is 0');
  }

  // Test 10: Transposition table
  private testTranspositionTable(): void {
    console.log('\nTest 10: Transposition Table');

    const k = new KyokumenImproved();
    k.initHirate();

    const ai = new ShogiAIImproved();

    // Make AI search twice from same position
    const move1 = ai.getNextTe(k);
    const stats1 = ai.getStats();

    // Search again - should hit transposition table
    const move2 = ai.getNextTe(k);
    const stats2 = ai.getStats();

    this.assert(move1?.equals(move2!) === true, 'Same move found both times');
    this.assert(stats2.ttUsage > 0, 'Transposition table was used');
  }
}

// Run tests if this file is executed directly
if (typeof window === 'undefined') {
  const tester = new ShogiImprovedTest();
  tester.runAll();
}