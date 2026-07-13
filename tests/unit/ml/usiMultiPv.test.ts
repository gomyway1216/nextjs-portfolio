import { describe, expect, it } from 'vitest';

import { UsiMultiPvAccumulator, buildGo, parseUsiInfoLine } from '../../../ml/usi-multipv';

describe('USI MultiPV parsing', () => {
  it('parses exact cp and mate PV records and excludes bounds', () => {
    expect(parseUsiInfoLine('info depth 8 seldepth 12 multipv 2 score cp -42 nodes 901 pv 3c3d 7g7f')).toEqual({
      depth: 8,
      multipv: 2,
      cp: -42,
      nodes: 901,
      move: '3c3d',
      pv: ['3c3d', '7g7f'],
      scoreKind: 'cp',
    });
    expect(parseUsiInfoLine('info depth 9 multipv 1 score mate -3 nodes 1200 pv 8b8h+')).toMatchObject({
      cp: -999_997,
      mate: -3,
      mateSign: -1,
      scoreKind: 'mate',
    });
    expect(parseUsiInfoLine('info depth 9 multipv 1 score mate 5 nodes 1200 pv 8b8h+')).toMatchObject({
      cp: 999_995,
      mate: 5,
      mateSign: 1,
    });
    expect(parseUsiInfoLine('info depth 9 multipv 1 score mate -0 nodes 1200 pv 8b8h+')).toMatchObject({
      cp: -1_000_000,
      mateSign: -1,
    });

    expect(parseUsiInfoLine('info depth 9 multipv 1 score cp 100 lowerbound nodes 1200 pv 7g7f')).toBeNull();
    expect(parseUsiInfoLine('info depth 9 multipv 1 score cp 100 upperbound nodes 1200 pv 7g7f')).toBeNull();
    expect(parseUsiInfoLine('info depth 9 score cp 100 pv 7g7f')).toBeNull();
    expect(parseUsiInfoLine('info depth 9 multipv nope score cp 100 nodes 1200 pv 7g7f')).toBeNull();
  });

  it('rejects unsafe integer tokens and non-canonical PV moves', () => {
    const unsafe = '9007199254740992';
    for (const line of [
      `info depth ${unsafe} multipv 1 score cp 100 nodes 1200 pv 7g7f`,
      `info depth 9 multipv ${unsafe} score cp 100 nodes 1200 pv 7g7f`,
      `info depth 9 multipv 1 score cp 100 nodes ${unsafe} pv 7g7f`,
      `info depth 9 multipv 1 score cp ${unsafe} nodes 1200 pv 7g7f`,
      `info depth 9 multipv 1 score mate -${unsafe} nodes 1200 pv 7g7f`,
    ]) {
      expect(parseUsiInfoLine(line), line).toBeNull();
    }

    expect(parseUsiInfoLine('info depth 9 multipv 1 score cp 100 nodes 1200 pv 7g7f ???')).toBeNull();
    expect(parseUsiInfoLine('info depth 9 multipv 1 score cp 100 nodes 1200 pv P*5e')).toMatchObject({
      move: 'P*5e',
      pv: ['P*5e'],
    });
    expect(parseUsiInfoLine('info depth 9 depth 10 multipv 1 score cp 100 nodes 1200 pv 7g7f')).toBeNull();
    expect(parseUsiInfoLine('info depth 9 multipv 1 score cp 100 nodes 1200 nodes 1300 pv 7g7f')).toBeNull();
    expect(parseUsiInfoLine('info depth 9 multipv 1 multipv 2 score cp 100 nodes 1200 pv 7g7f')).toBeNull();
    expect(parseUsiInfoLine('info depth 9 multipv 1 score cp 100 score cp 101 nodes 1200 pv 7g7f')).toBeNull();
    expect(parseUsiInfoLine('info depth 9 multipv 1 score cp 100 nodes 1200 pv 7g7f pv 2g2f')).toBeNull();
  });

  it('selects the deepest complete single-depth snapshot from split CRLF chunks', () => {
    const transcript = [
      'info depth 7 multipv 2 score cp 80 nodes 800 pv 3c3d',
      'info depth 7 multipv 1 score cp 120 nodes 750 pv 7g7f',
      'info depth 8 multipv 1 score cp 120 nodes 900 pv 2g2f',
      'info depth 8 multipv 2 score mate -3 nodes 1000 pv 8b8h+',
      // Newer same-depth/rank update wins.
      'info depth 8 multipv 1 score cp 130 nodes 1000 pv 2g2f 8c8d',
      // A stale lower-node update must not overwrite it.
      'info depth 8 multipv 1 score cp 999 nodes 950 pv 5g5f',
      // The partial/bounded depth-9 iteration must not mix with rank 2 at depth 8.
      'info depth 9 multipv 1 score cp 140 lowerbound nodes 1100 pv 5g5f',
      'bestmove 2g2f ponder 8c8d',
    ].join('\r\n');

    const accumulator = new UsiMultiPvAccumulator({ multipv: 2 });
    // Deliberately split inside tokens and between CR/LF.
    for (const chunk of [
      transcript.slice(0, 31),
      transcript.slice(31, 106),
      transcript.slice(106, 233),
      transcript.slice(233, 371),
      transcript.slice(371),
    ]) {
      accumulator.push(chunk);
    }

    const result = accumulator.finish();
    expect(result).toEqual({
      depth: 8,
      bestmove: '2g2f',
      observedNodes: 1000,
      lines: [
        {
          depth: 8,
          multipv: 1,
          cp: 130,
          nodes: 1000,
          move: '2g2f',
          pv: ['2g2f', '8c8d'],
          scoreKind: 'cp',
        },
        {
          depth: 8,
          multipv: 2,
          cp: -999_997,
          nodes: 1000,
          move: '8b8h+',
          pv: ['8b8h+'],
          scoreKind: 'mate',
          mate: -3,
          mateSign: -1,
        },
      ],
    });
  });

  it('can require the exact completed depth for fixed-depth searches', () => {
    const accumulator = new UsiMultiPvAccumulator({
      multipv: 2,
      requiredDepth: 7,
    });
    accumulator.push(
      [
        'info depth 7 multipv 1 score cp 10 nodes 100 pv 7g7f',
        'info depth 7 multipv 2 score cp 5 nodes 100 pv 2g2f',
        'bestmove 7g7f',
      ].join('\n'),
    );
    const result = accumulator.finish();
    expect(result.depth).toBe(7);
    expect(result.lines[0].move).toBe('7g7f');
    expect(result.bestmove).toBe('7g7f');
  });

  it('rejects a historical required-depth snapshot after later rank updates', () => {
    const accumulator = new UsiMultiPvAccumulator({
      multipv: 2,
      requiredDepth: 7,
    });
    accumulator.push(
      [
        'info depth 7 multipv 1 score cp 10 nodes 100 pv 7g7f',
        'info depth 7 multipv 2 score cp 5 nodes 100 pv 2g2f',
        'info depth 8 multipv 1 score cp 20 nodes 200 pv 5g5f',
        'info depth 8 multipv 2 score cp 15 nodes 200 pv 4g4f',
        'bestmove 7g7f',
      ].join('\n'),
    );
    expect(() => accumulator.finish()).toThrow(/did not end with exact updates/);
  });

  it('never assembles a mixed-depth result', () => {
    const accumulator = new UsiMultiPvAccumulator({ multipv: 2 });
    accumulator.push(
      [
        'info depth 9 multipv 1 score cp 20 nodes 200 pv 7g7f',
        'info depth 8 multipv 2 score cp 10 nodes 180 pv 2g2f',
        'bestmove 7g7f',
      ].join('\n'),
    );
    expect(() => accumulator.finish()).toThrow(/incomplete MultiPV/);
  });

  it('rejects a malformed explicit multipv token instead of treating it as rank 1', () => {
    const accumulator = new UsiMultiPvAccumulator({
      multipv: 1,
      requiredDepth: 8,
    });
    accumulator.push(
      [
        'info depth 8 multipv 1 score cp 20 nodes 200 pv 7g7f',
        'info depth 8 multipv nope score cp 30 nodes 220 pv 7g7f',
        'bestmove 7g7f',
      ].join('\n'),
    );
    expect(() => accumulator.finish()).toThrow(/malformed explicit multipv/);
  });

  it('fails closed after malformed structured evidence even when a later line is valid', () => {
    const accumulator = new UsiMultiPvAccumulator({
      multipv: 1,
      requiredDepth: 8,
    });
    accumulator.push(
      [
        'info string harmless engine diagnostic',
        'info depth 8 currmove 7g7f currmovenumber 1 nodes 100',
        'info depth 8 multipv 1 score cp 20 nodes 200 pv 7g7f ???',
        'info depth 8 multipv 1 score cp 21 nodes 220 pv 7g7f',
        'bestmove 7g7f',
      ].join('\n'),
    );
    expect(() => accumulator.finish()).toThrow(/malformed structured teacher evidence/);
  });

  it('fails closed after duplicated critical fields even when a later line is valid', () => {
    const accumulator = new UsiMultiPvAccumulator({
      multipv: 1,
      requiredDepth: 8,
    });
    accumulator.push(
      [
        'info depth 8 depth 9 multipv 1 score cp 20 nodes 200 pv 7g7f',
        'info depth 8 multipv 1 score cp 21 nodes 220 pv 7g7f',
        'bestmove 7g7f',
      ].join('\n'),
    );
    expect(() => accumulator.finish()).toThrow(/malformed structured teacher evidence/);
  });

  it('rejects unsafe structured evidence even when a later line is valid', () => {
    const accumulator = new UsiMultiPvAccumulator({
      multipv: 1,
      requiredDepth: 8,
    });
    accumulator.push(
      [
        'info depth 8 multipv 1 score cp 20 nodes 9007199254740992 pv 7g7f',
        'info depth 8 multipv 1 score cp 21 nodes 220 pv 7g7f',
        'bestmove 7g7f',
      ].join('\n'),
    );
    expect(() => accumulator.finish()).toThrow(/malformed structured teacher evidence/);
  });

  it('rejects malformed bound evidence while preserving its tombstone', () => {
    const accumulator = new UsiMultiPvAccumulator({
      multipv: 1,
      requiredDepth: 8,
    });
    accumulator.push(
      [
        'info depth 8 multipv 1 score cp 20 nodes 200 pv 7g7f',
        'info depth 8 multipv 1 score cp 9007199254740992 upperbound nodes 220 pv 7g7f ???',
        'info depth 8 multipv 1 score cp 21 nodes 240 pv 7g7f',
        'bestmove 7g7f',
      ].join('\n'),
    );
    expect(() => accumulator.finish()).toThrow(/malformed structured teacher evidence/);
  });

  it('accepts a valid score-only bound tombstone and rejects an unsafe one', () => {
    const valid = new UsiMultiPvAccumulator({ multipv: 1, requiredDepth: 8 });
    valid.push(
      [
        'info depth 8 multipv 1 score cp 20 nodes 200 pv 7g7f',
        'info depth 8 multipv 1 score cp 22 upperbound nodes 220',
        'info depth 8 multipv 1 score cp 21 nodes 240 pv 7g7f',
        'bestmove 7g7f',
      ].join('\n'),
    );
    expect(valid.finish().lines[0].cp).toBe(21);

    const unsafe = new UsiMultiPvAccumulator({ multipv: 1, requiredDepth: 8 });
    unsafe.push(
      [
        'info depth 8 multipv 1 score cp 20 nodes 200 pv 7g7f',
        'info depth 8 multipv 1 score mate 9007199254740992 lowerbound nodes 220',
        'info depth 8 multipv 1 score cp 21 nodes 240 pv 7g7f',
        'bestmove 7g7f',
      ].join('\n'),
    );
    expect(() => unsafe.finish()).toThrow(/malformed structured teacher evidence/);
  });

  it('allows ordinary info telemetry around valid structured evidence', () => {
    const accumulator = new UsiMultiPvAccumulator({
      multipv: 1,
      requiredDepth: 8,
    });
    accumulator.push(
      [
        'info string harmless engine diagnostic',
        'info string score cp ??? pv ??? multipv nope',
        'info depth 8 currmove 7g7f currmovenumber 1 nodes 100',
        'info nodes 180 nps 9000 hashfull 3',
        'info depth 8 multipv 1 score cp 21 nodes 220 pv 7g7f',
        'info depth 8 currmove 2g2f currmovenumber 2 nodes 221',
        'bestmove 7g7f',
      ].join('\n'),
    );
    expect(accumulator.finish()).toMatchObject({ bestmove: '7g7f', depth: 8 });
  });

  it('tombstones an older exact score when a newer bound update arrives', () => {
    const accumulator = new UsiMultiPvAccumulator({
      multipv: 2,
      requiredDepth: 8,
    });
    accumulator.push(
      [
        'info depth 8 multipv 1 score cp 20 nodes 200 pv 7g7f',
        'info depth 8 multipv 2 score cp 10 nodes 200 pv 2g2f',
        'info depth 8 multipv 2 score cp 12 lowerbound nodes 220 pv 2g2f',
        'bestmove 7g7f',
      ].join('\n'),
    );
    expect(() => accumulator.finish()).toThrow(/incomplete MultiPV/);
  });

  it('allows a newer exact score to replace a bound tombstone', () => {
    const accumulator = new UsiMultiPvAccumulator({
      multipv: 2,
      requiredDepth: 8,
    });
    accumulator.push(
      [
        'info depth 8 multipv 1 score cp 20 nodes 200 pv 7g7f',
        'info depth 8 multipv 2 score cp 12 upperbound nodes 220 pv 2g2f',
        'info depth 8 multipv 2 score cp 10 nodes 240 pv 2g2f',
        'bestmove 7g7f',
      ].join('\n'),
    );
    expect(accumulator.finish().lines.map((line) => line.cp)).toEqual([20, 10]);
  });

  it('does not resurrect a bound tombstone with a lower-node exact update', () => {
    const accumulator = new UsiMultiPvAccumulator({
      multipv: 1,
      requiredDepth: 8,
    });
    accumulator.push(
      [
        'info depth 8 multipv 1 score cp 12 lowerbound nodes 220 pv 7g7f',
        'info depth 8 multipv 1 score cp 10 nodes 200 pv 7g7f',
        'bestmove 7g7f',
      ].join('\n'),
    );
    expect(() => accumulator.finish()).toThrow(/incomplete MultiPV/);
  });

  it('preserves the node watermark when a newer bound omits nodes', () => {
    const accumulator = new UsiMultiPvAccumulator({
      multipv: 1,
      requiredDepth: 8,
    });
    accumulator.push(
      [
        'info depth 8 multipv 1 score cp 10 nodes 220 pv 7g7f',
        'info depth 8 multipv 1 score cp 12 lowerbound pv 7g7f',
        'info depth 8 multipv 1 score cp 9 nodes 200 pv 7g7f',
        'bestmove 7g7f',
      ].join('\n'),
    );
    expect(() => accumulator.finish()).toThrow(/incomplete MultiPV/);
  });

  it('accepts only a final exact mate when a forced fixed-depth search terminates early', () => {
    const terminalMate = new UsiMultiPvAccumulator({
      multipv: 1,
      requiredDepth: 18,
      allowTerminalMateBeforeRequiredDepth: true,
    });
    terminalMate.push(['info depth 16 multipv 1 score mate -4 nodes 966 pv 5h4h', 'bestmove 5h4h'].join('\n'));
    expect(terminalMate.finish()).toMatchObject({
      depth: 16,
      bestmove: '5h4h',
      lines: [{ scoreKind: 'mate', mate: -4, mateSign: -1 }],
    });

    const earlyCp = new UsiMultiPvAccumulator({
      multipv: 1,
      requiredDepth: 18,
      allowTerminalMateBeforeRequiredDepth: true,
    });
    earlyCp.push('info depth 16 multipv 1 score cp -40 nodes 966 pv 5h4h\nbestmove 5h4h');
    expect(() => earlyCp.finish()).toThrow(/incomplete MultiPV/);

    const laterBound = new UsiMultiPvAccumulator({
      multipv: 1,
      requiredDepth: 18,
      allowTerminalMateBeforeRequiredDepth: true,
    });
    laterBound.push(
      [
        'info depth 16 multipv 1 score mate -4 nodes 966 pv 5h4h',
        'info depth 17 multipv 1 score mate -4 lowerbound pv 5h4h',
        'bestmove 5h4h',
      ].join('\n'),
    );
    expect(() => laterBound.finish()).toThrow(/incomplete MultiPV/);

    const sameDepthBound = new UsiMultiPvAccumulator({
      multipv: 1,
      requiredDepth: 18,
      allowTerminalMateBeforeRequiredDepth: true,
    });
    sameDepthBound.push(
      [
        'info depth 16 multipv 1 score mate -4 nodes 966 pv 5h4h',
        'info depth 16 multipv 1 score mate -4 upperbound pv 5h4h',
        'bestmove 5h4h',
      ].join('\n'),
    );
    expect(() => sameDepthBound.finish()).toThrow(/incomplete MultiPV/);

    const noFallback = new UsiMultiPvAccumulator({
      multipv: 1,
      requiredDepth: 18,
    });
    noFallback.push('info depth 16 multipv 1 score mate -4 nodes 966 pv 5h4h\nbestmove 5h4h');
    expect(() => noFallback.finish()).toThrow(/incomplete MultiPV/);

    const laterLowerDepthUpdate = new UsiMultiPvAccumulator({
      multipv: 1,
      requiredDepth: 18,
      allowTerminalMateBeforeRequiredDepth: true,
    });
    laterLowerDepthUpdate.push(
      [
        'info depth 16 multipv 1 score mate -4 nodes 966 pv 5h4h',
        'info depth 15 multipv 1 score cp -20 nodes 1000 pv 5h4h',
        'bestmove 5h4h',
      ].join('\n'),
    );
    expect(() => laterLowerDepthUpdate.finish()).toThrow(/incomplete MultiPV/);

    const laterLowerDepthMate = new UsiMultiPvAccumulator({
      multipv: 1,
      requiredDepth: 18,
      allowTerminalMateBeforeRequiredDepth: true,
    });
    laterLowerDepthMate.push(
      [
        'info depth 16 multipv 1 score mate -4 nodes 966 pv 5h4h',
        'info depth 15 multipv 1 score mate -5 nodes 1000 pv 5h4h',
        'bestmove 5h4h',
      ].join('\n'),
    );
    expect(() => laterLowerDepthMate.finish()).toThrow(/incomplete MultiPV/);

    const unexpectedRank = new UsiMultiPvAccumulator({
      multipv: 1,
      requiredDepth: 18,
      allowTerminalMateBeforeRequiredDepth: true,
    });
    unexpectedRank.push(
      [
        'info depth 16 multipv 1 score mate -4 nodes 966 pv 5h4h',
        'info depth 16 multipv 2 score mate -6 nodes 1000 pv 4a4b',
        'bestmove 5h4h',
      ].join('\n'),
    );
    expect(() => unexpectedRank.finish()).toThrow(/unexpected multipv rank/);

    expect(
      () =>
        new UsiMultiPvAccumulator({
          multipv: 2,
          requiredDepth: 18,
          allowTerminalMateBeforeRequiredDepth: true,
        }),
    ).toThrow(/forced MultiPV=1/);
  });

  it('rejects duplicate moves in a completed snapshot and missing bestmove', () => {
    const duplicate = new UsiMultiPvAccumulator({ multipv: 2 });
    duplicate.push(
      [
        'info depth 8 multipv 1 score cp 20 nodes 200 pv 7g7f',
        'info depth 8 multipv 2 score cp 10 nodes 200 pv 7g7f',
        'bestmove 7g7f',
      ].join('\n'),
    );
    expect(() => duplicate.finish()).toThrow(/duplicate PV move/);

    const noBestmove = new UsiMultiPvAccumulator({ multipv: 1 });
    noBestmove.push('info depth 8 score cp 20 nodes 200 pv 7g7f\n');
    expect(() => noBestmove.finish()).toThrow(/without bestmove/);

    const mismatch = new UsiMultiPvAccumulator({ multipv: 2 });
    mismatch.push(
      [
        'info depth 8 multipv 1 score cp 20 nodes 200 pv 7g7f',
        'info depth 8 multipv 2 score cp 10 nodes 200 pv 2g2f',
        'bestmove 5g5f ponder 3c3d',
      ].join('\n'),
    );
    expect(() => mismatch.finish()).toThrow(/does not match completed PV1/);

    const fixedDepthMismatch = new UsiMultiPvAccumulator({
      multipv: 1,
      requiredDepth: 7,
    });
    fixedDepthMismatch.push(['info depth 7 multipv 1 score cp 20 nodes 200 pv 7g7f', 'bestmove 5g5f'].join('\n'));
    expect(() => fixedDepthMismatch.finish()).toThrow(/does not match completed PV1/);
  });

  it('rejects malformed, terminal, or trailing-token bestmove values', () => {
    for (const bestmove of ['???', 'resign', 'win', '7g7f garbage', '7g7f ponder ???', '7g7f ponder 3c3d trailing']) {
      const accumulator = new UsiMultiPvAccumulator({
        multipv: 1,
        requiredDepth: 8,
      });
      accumulator.push(['info depth 8 multipv 1 score cp 20 nodes 200 pv 7g7f', `bestmove ${bestmove}`].join('\n'));
      expect(() => accumulator.finish(), bestmove).toThrow(/malformed bestmove|terminal bestmove/);
    }

    const ponder = new UsiMultiPvAccumulator({ multipv: 1, requiredDepth: 8 });
    ponder.push(['info depth 8 multipv 1 score cp 20 nodes 200 pv 7g7f', 'bestmove 7g7f ponder 3c3d'].join('\n'));
    expect(ponder.finish().bestmove).toBe('7g7f');
  });
});

describe('buildGo', () => {
  it('builds fixed-node and fixed-depth commands', () => {
    expect(buildGo({ nodes: 4096 })).toBe('go nodes 4096');
    expect(buildGo({ depth: 8 }, ['7g7f', '2g2f'])).toBe('go depth 8 searchmoves 7g7f 2g2f');
  });

  it('requires exactly one positive integral limit', () => {
    expect(() => buildGo({})).toThrow(/exactly one/);
    expect(() => buildGo({ nodes: 100, depth: 8 })).toThrow(/exactly one/);
    expect(() => buildGo({ nodes: 0 })).toThrow(/positive integer/);
    expect(() => buildGo({ depth: 1.5 })).toThrow(/positive integer/);
    expect(() => buildGo({ depth: Number.MAX_SAFE_INTEGER + 1 })).toThrow(/positive integer/);
    expect(() => buildGo({ nodes: 10 }, ['7g 7f'])).toThrow(/invalid USI searchmove/);
    expect(() => buildGo({ nodes: 10 }, ['???'])).toThrow(/invalid USI searchmove/);
  });
});
