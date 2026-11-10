import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { playRound, switchCandidates, type Round } from "@/components/game/MontyHall/engine";
import {
  latestRecords,
  recordSwitched,
  recordWon,
  summarizeHistory,
  toRecord,
  whatIf,
  type RoundRecord,
  type WhatIfKind,
} from "@/components/game/MontyHall/history";
import { getStrings } from "@/components/game/MontyHall/i18n";
import { HISTORY_SHOWN, RoundHistory } from "@/components/game/MontyHall/RoundHistory";

const round = (doorCount: number, prizeDoor: number, pickedDoor: number, opened: number): Round => ({
  doorCount,
  prizeDoor,
  pickedDoor,
  openedDoors: [opened],
});

const rec = (id: number, doorCount: number, prize: number, pick: number, opened: number, final: number): RoundRecord =>
  toRecord(id, round(doorCount, prize, pick, opened), final);

describe("MontyHall history — records", () => {
  it("copies the round and derives switched / won", () => {
    const source = round(3, 2, 0, 1);
    const record = toRecord(7, source, 2);
    expect(record).toEqual({ id: 7, doorCount: 3, pickedDoor: 0, openedDoors: [1], finalDoor: 2, prizeDoor: 2 });
    expect(record.openedDoors).not.toBe(source.openedDoors);
    expect(recordSwitched(record)).toBe(true);
    expect(recordWon(record)).toBe(true);
    const stayed = toRecord(8, source, 0);
    expect(recordSwitched(stayed)).toBe(false);
    expect(recordWon(stayed)).toBe(false);
  });
});

describe("MontyHall history — what the other choice would have done", () => {
  it("3 doors: exactly one of stay / switch wins every round", () => {
    expect(whatIf(rec(1, 3, 2, 0, 1, 0))).toEqual({ kind: "switchWouldWin", switchOptions: 1 });
    expect(whatIf(rec(1, 3, 0, 0, 1, 0))).toEqual({ kind: "switchWouldLose", switchOptions: 1 });
    expect(whatIf(rec(1, 3, 0, 0, 1, 2))).toEqual({ kind: "stayWouldWin", switchOptions: 1 });
    expect(whatIf(rec(1, 3, 2, 0, 1, 2))).toEqual({ kind: "stayWouldLose", switchOptions: 1 });
  });

  it("4+ doors: a switch can also move from one goat to another", () => {
    expect(whatIf(rec(1, 4, 3, 0, 1, 2))).toEqual({ kind: "stayWouldLoseToo", switchOptions: 2 });
    expect(whatIf(rec(1, 4, 3, 0, 1, 3))).toEqual({ kind: "stayWouldLose", switchOptions: 2 });
    expect(whatIf(rec(1, 8, 5, 0, 1, 0))).toEqual({ kind: "switchWouldWin", switchOptions: 6 });
  });

  it("agrees with the engine on every round it deals", () => {
    for (const doorCount of [3, 4, 5]) {
      for (let pick = 0; pick < doorCount; pick++) {
        for (let seed = 0; seed < 40; seed++) {
          let i = seed;
          const played = playRound(pick, doorCount, () => (i++ * 0.37) % 1);
          const options = switchCandidates(played);
          const stayWins = played.pickedDoor === played.prizeDoor;
          const someSwitchWins = options.includes(played.prizeDoor);
          expect(stayWins).toBe(!someSwitchWins);
          for (const final of [pick, ...options]) {
            const record = toRecord(1, played, final);
            const w = whatIf(record);
            expect(w.switchOptions).toBe(options.length);
            if (final === pick) {
              expect(w.kind).toBe(someSwitchWins ? "switchWouldWin" : "switchWouldLose");
            } else if (stayWins) {
              expect(w.kind).toBe("stayWouldWin");
            } else {
              expect(w.kind).toBe(recordWon(record) ? "stayWouldLose" : "stayWouldLoseToo");
            }
          }
        }
      }
    }
  });
});

describe("MontyHall history — summary", () => {
  it("counts first picks, independent of what the player then did", () => {
    expect(summarizeHistory([])).toEqual({ rounds: 0, firstPickRight: 0, firstPickWrong: 0 });
    const records = [
      rec(1, 3, 0, 0, 1, 0), // right, stayed
      rec(2, 3, 0, 0, 1, 2), // right, switched away
      rec(3, 3, 2, 0, 1, 0), // wrong, stayed
      rec(4, 3, 2, 0, 1, 2), // wrong, switched
      rec(5, 3, 1, 2, 0, 1), // wrong, switched
    ];
    expect(summarizeHistory(records)).toEqual({ rounds: 5, firstPickRight: 2, firstPickWrong: 3 });
  });

  it("returns the newest records first, capped", () => {
    const records = [1, 2, 3, 4].map((id) => rec(id, 3, 0, 0, 1, 0));
    expect(latestRecords(records, 3).map((r) => r.id)).toEqual([4, 3, 2]);
    expect(latestRecords(records, 10).map((r) => r.id)).toEqual([4, 3, 2, 1]);
    expect(records.map((r) => r.id)).toEqual([1, 2, 3, 4]);
  });
});

describe("MontyHall history — strings", () => {
  const kinds: WhatIfKind[] = ["switchWouldWin", "switchWouldLose", "stayWouldWin", "stayWouldLose", "stayWouldLoseToo"];
  const record = rec(1, 4, 3, 0, 1, 2);

  it.each(["en", "ja"] as const)("%s: every what-if kind has its own sentence", (lang) => {
    const t = getStrings(lang);
    const sentences = kinds.flatMap((kind) => [1, 2].map((switchOptions) => t.whatIf({ kind, switchOptions }, record)));
    for (const s of sentences) expect(s.length).toBeGreaterThan(0);
    // 5 kinds, and switchWouldWin is worded differently when there are several doors to switch to.
    expect(new Set(sentences).size).toBe(6);
    expect(t.whatIf({ kind: "switchWouldWin", switchOptions: 2 }, record)).toContain("4");
    expect(t.whatIf({ kind: "stayWouldWin", switchOptions: 1 }, record)).toContain("1");
  });

  it.each(["en", "ja"] as const)("%s: the theory note quotes the rates it is given", (lang) => {
    const note = getStrings(lang).theoryNote("25.0%", "37.5%");
    expect(note).toContain("25.0%");
    expect(note).toContain("37.5%");
  });

  it("the always-stay note only promises a switch win when there is one door to switch to", () => {
    const en = getStrings("en");
    expect(en.alwaysStayNote(5, 2, 1)).toContain("2 of 5 rounds");
    expect(en.alwaysStayNote(5, 2, 1)).toContain("would have won the other 3");
    expect(en.alwaysStayNote(5, 2, 2)).toContain("one of the 2 doors");
    expect(en.alwaysStayNote(5, 2, 2)).not.toContain("would have won");
    expect(en.alwaysStayNote(1, 0, 1)).toContain("0 of 1 round ");
    const ja = getStrings("ja");
    expect(ja.alwaysStayNote(5, 2, 1)).toContain("5回中2回");
    expect(ja.alwaysStayNote(5, 2, 1)).toContain("残りの3回で勝てました");
    expect(ja.alwaysStayNote(5, 2, 2)).not.toContain("勝てました");
  });
});

describe("MontyHall history — list", () => {
  it.each(["en", "ja"] as const)("%s: shows the empty hint before any round", (lang) => {
    const t = getStrings(lang);
    const html = renderToStaticMarkup(<RoundHistory records={[]} t={t} />);
    expect(html).toContain(t.historyTitle);
    expect(html).toContain(t.historyEmpty);
    expect(html).not.toContain('role="region"');
  });

  it.each(["en", "ja"] as const)("%s: lists rounds newest first in a focusable, labelled region", (lang) => {
    const t = getStrings(lang);
    const records = [rec(1, 3, 2, 0, 1, 0), rec(2, 3, 2, 0, 1, 2)];
    const html = renderToStaticMarkup(<RoundHistory records={records} t={t} />);
    expect(html).toContain(`aria-label="${t.historyTitle}"`);
    expect(html).toContain('tabindex="0"');
    expect(html.indexOf("#2")).toBeLessThan(html.indexOf("#1"));
    expect(html).toContain(t.historyRow(records[0], false));
    expect(html).toContain(t.historyRow(records[1], true));
    expect(html).toContain(t.historyWin);
    expect(html).toContain(t.historyLose);
    expect(html).not.toContain(t.historyShowing(2, 2));
  });

  it("caps the list and says so", () => {
    const t = getStrings("en");
    const total = HISTORY_SHOWN + 5;
    const records = Array.from({ length: total }, (_, i) => rec(i + 1, 3, 0, 0, 1, 0));
    const html = renderToStaticMarkup(<RoundHistory records={records} t={t} />);
    expect(html.match(/<li/g)).toHaveLength(HISTORY_SHOWN);
    expect(html).toContain(`#${total}<`);
    expect(html).not.toContain("#5<");
    expect(html).toContain(t.historyShowing(HISTORY_SHOWN, total));
  });
});
