import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  join(process.cwd(), "wasm-spike", "assembly", "index.ts"),
  "utf8",
);

function functionBody(name: string): string {
  const start = source.indexOf(`function ${name}(`);
  expect(start).toBeGreaterThanOrEqual(0);
  const nextSection = source.indexOf("\n// ---------------------------------------------------------------------------", start);
  return source.slice(start, nextSection < 0 ? source.length : nextSection);
}

describe("direct check-evasion generator candidate", () => {
  it("uses the specialized generator only at checked search nodes", () => {
    expect(source).toContain(
      "const n = inCheck ? generateEvasionMoves(ply) : generateMoves(ply);",
    );
    expect(source).toContain("if (parentInCheck) {");
    expect(source).toContain("n = generateEvasionMoves(ply);");
    expect(source).toContain(
      "const pseudoN = rootInCheckG ? generateEvasionMoves(0) : generateMoves(0);",
    );
  });

  it("enumerates direct and sliding checkers and leaves final king safety lazy", () => {
    const body = functionBody("generateEvasionMoves");
    expect(body).toContain("CAN_MOVE[(direct << 6) + checker]");
    expect(body).toContain("CAN_JUMP[(direct << 6) + checker]");
    expect(body).toContain("const isKing = getKomashu(koma) == OU;");
    expect(body).toContain(
      "!isKing && !isEvasionTarget(to, checkerCount, checkerSquare, blockStep, kingPos)",
    );
    expect(body).toContain("if (checkerCount != 1 || blockStep == 0) return n;");
    expect(source).toContain("isKingInCheck(mover)");
  });

  it("keeps all production drop restrictions for interpositions", () => {
    const body = functionBody("generateEvasionMoves");
    expect(body).toContain("dropSujiHasOwnPawn[scratchBase + s]");
    expect(body).toContain("if (isSente && dan <= 2) continue;");
    expect(body).toContain("if (!isSente && dan >= 8) continue;");
    expect(body).toContain("if (isSente && dan == 1) continue;");
    expect(body).toContain("if (!isSente && dan == 9) continue;");
    expect(body).toContain("isUtiFuDume(to, ply + 1)");
  });

  it("does not retain the rejected direct-noisy qsearch candidate", () => {
    expect(source).not.toContain("generateQNoisyMoves");
    expect(source).not.toContain("pushQNoisyMoves");
  });
});
