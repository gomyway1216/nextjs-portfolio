import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  PINNED_ROOT_MOVE_BUFFER_OFFSET,
  PINNED_WASM_BYTES,
  PINNED_WASM_SHA256,
  ProductionRootMoveUniverseBridge,
  REQUEST_SCHEMA,
  RESPONSE_SCHEMA,
  verifyPinnedWasmBytes,
} from "../../../ml/child-board-root-move-universe-bridge";

const START =
  "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1";
const BISHOP = "4k4/9/9/9/4B4/9/9/9/K8 b - 1";
const ROOK = "k8/9/9/9/4R4/9/9/9/K8 b - 1";
const ONE_REPLY = "4k4/2B6/3GRG3/9/9/9/9/9/K8 w - 17";
const UCHIFUZUME_SENTE = "6+R2/8k/9/7G1/9/9/9/9/K8 b 2P 1";
const LEGAL_PAWN_CHECK_SENTE = "5+R3/8k/9/7G1/9/9/9/9/K8 b 2P 1";
const UCHIFUZUME_GOTE = "k8/9/9/9/9/7g1/9/8K/6+r2 w 2p 1";

interface FixtureFile {
  readonly caseCount: number;
  readonly cases: readonly {
    readonly sfen: string;
    readonly legalMoves: number;
  }[];
}

describe("pinned production root move universe bridge", () => {
  it("returns exact JS and actual-WASM membership for all 71 fixtures", () => {
    const fixture = JSON.parse(
      readFileSync(
        join(
          process.cwd(),
          "wasm-spike",
          "lazy-move-picker-fixture-v2.json",
        ),
        "utf8",
      ),
    ) as FixtureFile;
    expect(fixture.caseCount).toBe(64);
    const bridge = new ProductionRootMoveUniverseBridge();
    const sfens = [
      ...fixture.cases.map((row) => row.sfen),
      START,
      BISHOP,
      ROOK,
      ONE_REPLY,
      UCHIFUZUME_SENTE,
      LEGAL_PAWN_CHECK_SENTE,
      UCHIFUZUME_GOTE,
    ];
    expect(sfens).toHaveLength(71);

    const responses = sfens.map((parent_sfen, sequence) =>
      bridge.verify({
        schema: REQUEST_SCHEMA,
        sequence,
        domain: sequence % 2 === 0 ? "browser" : "v9",
        parent_id: `fixture-${sequence.toString().padStart(2, "0")}`,
        parent_sfen,
      }),
    );
    for (const response of responses) {
      expect(response.schema).toBe(RESPONSE_SCHEMA);
      expect(response.wasm.bytes).toBe(PINNED_WASM_BYTES);
      expect(response.wasm.sha256).toBe(PINNED_WASM_SHA256);
      expect(response.wasm.root_move_buffer_offset).toBe(
        PINNED_ROOT_MOVE_BUFFER_OFFSET,
      );
      expect(response.wasm_usi).toEqual(response.js_usi);
      expect(response.wasm.legal_moves).toBe(response.wasm_usi.length);
      expect(response.wasm_usi).toEqual([...response.wasm_usi].sort());
      expect(new Set(response.wasm_usi).size).toBe(response.wasm_usi.length);
      // The root universe now comes straight from the engine's root filter,
      // so the evidence is that the fill agrees with countLegalMoves — not
      // that a second search collapsed to a single transposition-table node.
      expect(response.wasm.root_move_fill).toBe(response.wasm.legal_moves);
    }

    const bishop = responses[65].wasm_usi;
    expect(bishop).toContain("5e3c+");
    expect(bishop).not.toContain("5e3c");
    const rook = responses[66].wasm_usi;
    expect(rook).toContain("5e5c+");
    expect(rook).not.toContain("5e5c");
    expect(responses[67].wasm_usi).toEqual(["5a4a"]);
    expect(responses[68].wasm_usi).not.toContain("P*1c");
    expect(responses[69].wasm_usi).toContain("P*1c");
    expect(responses[70].wasm_usi).not.toContain("P*1g");
  });

  it("rejects any byte drift before WASM instantiation", () => {
    const actual = readFileSync(
      join(
        process.cwd(),
        "src",
        "components",
        "game",
        "ShogiImproved",
        "wasm",
        "shogi-halfkp81-production.wasm",
      ),
    );
    expect(actual.byteLength).toBe(PINNED_WASM_BYTES);
    expect(() => verifyPinnedWasmBytes(actual)).not.toThrow();
    const changed = Buffer.from(actual);
    changed[changed.length - 1] ^= 1;
    expect(() => verifyPinnedWasmBytes(changed)).toThrow(
      /WASM identity mismatch/u,
    );
  });

  it("rejects malformed requests without guessing", () => {
    const bridge = new ProductionRootMoveUniverseBridge();
    expect(() =>
      bridge.verify({
        schema: REQUEST_SCHEMA,
        sequence: 0,
        domain: "browser",
        parent_id: "fixture",
        parent_sfen: "9/9 b - 1",
      }),
    ).toThrow(/nine ranks/u);
    expect(() =>
      bridge.verify({
        schema: "wrong",
        sequence: 0,
        domain: "browser",
        parent_id: "fixture",
        parent_sfen: START,
      }),
    ).toThrow(/request schema mismatch/u);
  });
});
