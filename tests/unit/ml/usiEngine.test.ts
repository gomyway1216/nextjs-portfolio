import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  USI_TEACHER_ENGINE_CONTRACT,
  UsiTeacherEngine,
  fixedUsiOptionCommands,
} from '../../../ml/usi-engine';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FAKE_ENGINE = path.resolve(HERE, '../../fixtures/ml/fake-usi-engine.mjs');

describe('USI teacher engine subprocess contract', () => {
  it('derives the executed fixed options from the exported manifest contract', () => {
    expect(fixedUsiOptionCommands()).toEqual([
      `setoption name Threads value ${USI_TEACHER_ENGINE_CONTRACT.threads}`,
      `setoption name USI_OwnBook value ${USI_TEACHER_ENGINE_CONTRACT.usi_own_book}`,
      `setoption name BookFile value ${USI_TEACHER_ENGINE_CONTRACT.book_file}`,
      `setoption name NetworkDelay value ${USI_TEACHER_ENGINE_CONTRACT.network_delay_ms}`,
      `setoption name NetworkDelay2 value ${USI_TEACHER_ENGINE_CONTRACT.network_delay2_ms}`,
    ]);
  });

  it('initializes and returns an exact fixed-depth candidate snapshot', async () => {
    const engine = new UsiTeacherEngine({
      engineBin: process.execPath,
      engineArgs: [FAKE_ENGINE],
      timeoutMs: 5_000,
    });
    try {
      await engine.init();
      await engine.resetForParent();
      const result = await engine.search(
        'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1',
        2,
        { depth: 8 },
        ['7g7f', '2g2f']
      );
      expect(result.depth).toBe(8);
      expect(result.bestmove).toBe('7g7f');
      expect(result.lines.map((line) => [line.multipv, line.move, line.cp])).toEqual([
        [1, '7g7f', 260],
        [2, '2g2f', 220],
      ]);
    } finally {
      await engine.quit();
    }
  });
});
