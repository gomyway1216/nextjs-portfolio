import { describe, expect, it } from "vitest";

import {
  assertDistinctFloodgatePlayerIdentities,
  compareUtf8Bytes,
  eligibleGroupZeroIdentities,
  parseEligibleFloodgateCsaMetadata,
  parseFloodgateCsaMetadata,
  parseFloodgateCsaUrl,
  parseFloodgateDailyListingEvidence,
  parseFloodgateDailyListingUrl,
  parseFloodgateDailyRatingUrl,
  parseFloodgateGameSourceEvidence,
  parseFloodgateRatingSnapshot,
  sha256Hex,
} from "../../../ml/floodgate-source";

const DIGEST_A = "11111111111111111111111111111111";
const DIGEST_B = "22222222222222222222222222222222";
const DIGEST_C = "33333333333333333333333333333333";
const DIGEST_D = "44444444444444444444444444444444";

interface RowOptions {
  visibleHtml?: string;
  href?: string;
  hrefIdentity?: string;
  tooltipIdentity?: string;
  rating?: string;
  wins?: string;
  losses?: string;
  rate24?: string;
}

function ratingRow(
  name: string,
  digest: string,
  options: RowOptions = {},
): string {
  const identity = `${name}+${digest}`;
  const hrefIdentity = options.hrefIdentity ?? identity;
  const tooltipIdentity = options.tooltipIdentity ?? identity;
  const href =
    options.href ??
    `/shogi/view/show-player.cgi?event=LATEST&amp;filter=floodgate&amp;show_self_play=1&amp;user=${encodeURIComponent(hrefIdentity)}`;
  return [
    '  <tr class="default">',
    '    <td class="name">',
    `      <a id="popup-${digest}" href="${href}">${options.visibleHtml ?? name}</a>`,
    '      <script type="text/javascript">',
    '        var tooltip = new YAHOO.widget.Tooltip("myTooltip", {',
    `          context:"popup-${digest}",`,
    `          text:"${tooltipIdentity}" } );`,
    "      </script>",
    "    </td>",
    `    <td class="rate"><span id="rate-${digest}"> ${options.rating ?? "3600"}</span></td>`,
    `    <td class="ngames"> ${options.wins ?? "20"} </td>`,
    `    <td class="ngames"> ${options.losses ?? "10"} </td>`,
    '    <td class="win_rate"> 0.667 </td>',
    '    <td class="last_modified"> 2026-03-31 </td>',
    `    <td class="rate"> ${options.rate24 ?? (options.rating === "N/A" ? "N/A" : "3500")} </td>`,
    "  </tr>",
  ].join("\n");
}

function ratingTable(group: number | string, rows: readonly string[]): string {
  return [
    "<table>",
    `<caption>Group: ${group}</caption>`,
    "<thead><tr><th>name</th></tr></thead>",
    "<tbody>",
    ...rows,
    "</tbody>",
    "</table>",
  ].join("\n");
}

interface CsaMetadataOptions {
  senteName?: string;
  goteName?: string;
  senteIdentity?: string;
  goteIdentity?: string;
  blackIdentity?: string;
  whiteIdentity?: string;
  blackRating?: string;
  whiteRating?: string;
  eventTimestamp?: string;
  startTime?: string;
}

function liveShapedCsa(options: CsaMetadataOptions = {}): string {
  const senteName = options.senteName ?? "Alpha";
  const goteName = options.goteName ?? "Beta";
  const senteIdentity = options.senteIdentity ?? `Alpha+${DIGEST_A}`;
  const goteIdentity = options.goteIdentity ?? `Beta+${DIGEST_B}`;
  const eventTimestamp = options.eventTimestamp ?? "20260331233001";
  const startTime = options.startTime ?? "2026/03/31 23:30:00";
  return [
    "V2",
    `N+${senteName}`,
    `N-${goteName}`,
    "'Max_Moves:512",
    `$EVENT:wdoor+floodgate-300-10F+Alpha+Beta+${eventTimestamp}`,
    `$START_TIME:${startTime}`,
    "PI",
    "+",
    `'rating:${senteIdentity}:${goteIdentity}`,
    `'black_rate:${options.blackIdentity ?? senteIdentity}:${options.blackRating ?? "3600.0"}`,
    `'white_rate:${options.whiteIdentity ?? goteIdentity}:${options.whiteRating ?? "4200.5"}`,
    "+7776FU",
    "T0",
    "'** 123 -3334FU",
    "%TORYO",
  ].join("\r\n");
}

function evidenceRatingHtml(
  footerDate = "2026-03-30",
  offset = "+0900",
): string {
  return [
    "<html><body>",
    ratingTable(0, [
      ratingRow("Alpha", DIGEST_A, {
        rating: "100",
        wins: "20",
        losses: "10",
      }),
      ratingRow("Beta", DIGEST_B, {
        rating: "200",
        wins: "30",
        losses: "0",
      }),
    ]),
    `<div id="ft"><p>Last modified at ${footerDate} 23:54:25 ${offset}  <p>$Revision$</div>`,
    "</body></html>",
  ].join("\n");
}

describe("Floodgate rating snapshot", () => {
  it("parses real-shaped rows and preserves group, visible name, full identity, and integer stats", () => {
    const html = [
      "<html><body>",
      ratingTable(0, [
        ratingRow("Strong_A", DIGEST_A, {
          rating: " 3725.0 ",
          wins: "29",
          losses: "1",
        }),
        ratingRow("Strong_B", DIGEST_B, {
          rating: "3610",
          wins: "25",
          losses: "8",
        }),
      ]),
      ratingTable("Not-Yet-Rated Players", [
        ratingRow("Ignored", DIGEST_C, { rating: "N/A" }),
      ]),
      "</body></html>",
    ].join("\n");

    expect(parseFloodgateRatingSnapshot(html)).toEqual([
      {
        groupNumber: 0,
        visibleName: "Strong_A",
        identity: `Strong_A+${DIGEST_A}`,
        rating: 3725,
        wins: 29,
        losses: 1,
      },
      {
        groupNumber: 0,
        visibleName: "Strong_B",
        identity: `Strong_B+${DIGEST_B}`,
        rating: 3610,
        wins: 25,
        losses: 8,
      },
    ]);
  });

  it("decodes named and numeric entities without merging equal visible names with distinct identities", () => {
    const rows = parseFloodgateRatingSnapshot(
      ratingTable(0, [
        ratingRow("A&B", DIGEST_A, { visibleHtml: "A&amp;B" }),
        ratingRow("A&B", DIGEST_B, { visibleHtml: "A&#38;B" }),
      ]),
    );

    expect(rows.map((row) => row.visibleName)).toEqual(["A&B", "A&B"]);
    expect(rows.map((row) => row.identity)).toEqual([
      `A&B+${DIGEST_A}`,
      `A&B+${DIGEST_B}`,
    ]);
  });

  it("derives group-0 identities at 30+ cumulative games without using snapshot rating", () => {
    const rows = parseFloodgateRatingSnapshot(
      [
        ratingTable(0, [
          ratingRow("zeta", DIGEST_A, {
            rating: "3600",
            wins: "30",
            losses: "0",
          }),
          ratingRow("Alpha", DIGEST_B, {
            rating: "3599",
            wins: "100",
            losses: "100",
          }),
          ratingRow("LowSnapshot", DIGEST_C, {
            rating: "454",
            wins: "48",
            losses: "188",
          }),
        ]),
        ratingTable(1, [
          ratingRow("GroupOne", DIGEST_D, {
            rating: "4500",
            wins: "40",
            losses: "0",
          }),
        ]),
      ].join("\n"),
    );

    expect(eligibleGroupZeroIdentities(rows)).toEqual([
      `Alpha+${DIGEST_B}`,
      `LowSnapshot+${DIGEST_C}`,
      `zeta+${DIGEST_A}`,
    ]);
    expect(eligibleGroupZeroIdentities(rows, { minimumGames: 201 })).toEqual([
      `LowSnapshot+${DIGEST_C}`,
    ]);
  });

  it("enforces distinct full identities while allowing the same visible name with different credentials", () => {
    expect(
      assertDistinctFloodgatePlayerIdentities([
        `Same+${DIGEST_A}`,
        `Same+${DIGEST_B}`,
      ]),
    ).toEqual([`Same+${DIGEST_A}`, `Same+${DIGEST_B}`]);
    expect(() =>
      assertDistinctFloodgatePlayerIdentities([
        `Same+${DIGEST_A}`,
        `Same+${DIGEST_A}`,
      ]),
    ).toThrow(/distinct full identities/);
    expect(() =>
      assertDistinctFloodgatePlayerIdentities(["Same", `Same+${DIGEST_A}`]),
    ).toThrow(/canonical full identity/);
    expect(() =>
      assertDistinctFloodgatePlayerIdentities([
        { toString: () => `Same+${DIGEST_A}` } as unknown as string,
        `Same+${DIGEST_B}`,
      ]),
    ).toThrow(/canonical full identity/);
  });

  it("rejects duplicate identities, including identities crossing rating groups", () => {
    const duplicate = ratingTable(0, [
      ratingRow("Same", DIGEST_A),
      ratingRow("Same", DIGEST_A),
    ]);
    expect(() => parseFloodgateRatingSnapshot(duplicate)).toThrow(
      /duplicated or crosses/,
    );

    const crossover = [
      ratingTable(0, [ratingRow("Same", DIGEST_A)]),
      ratingTable(1, [ratingRow("Same", DIGEST_A)]),
    ].join("\n");
    expect(() => parseFloodgateRatingSnapshot(crossover)).toThrow(
      /duplicated or crosses/,
    );

    const unratedCrossover = [
      ratingTable(0, [ratingRow("Same", DIGEST_A)]),
      ratingTable("Not-Yet-Rated Players", [
        ratingRow("Same", DIGEST_A, { rating: "N/A" }),
      ]),
    ].join("\n");
    expect(() => parseFloodgateRatingSnapshot(unratedCrossover)).toThrow(
      /duplicated or crosses/,
    );
  });

  it("rejects conflicting href/tooltip identity and ambiguous rating groups", () => {
    expect(() =>
      parseFloodgateRatingSnapshot(
        ratingTable(0, [
          ratingRow("Same", DIGEST_A, { tooltipIdentity: `Same+${DIGEST_B}` }),
        ]),
      ),
    ).toThrow(/identities conflict/);

    expect(() =>
      parseFloodgateRatingSnapshot(
        [
          ratingTable(0, [ratingRow("One", DIGEST_A)]),
          ratingTable(0, [ratingRow("Two", DIGEST_B)]),
        ].join("\n"),
      ),
    ).toThrow(/duplicated or invalid/);

    expect(() =>
      parseFloodgateRatingSnapshot(
        ratingTable("0 and 1", [ratingRow("One", DIGEST_A)]),
      ),
    ).toThrow(/ambiguous table caption/);
    expect(() =>
      parseFloodgateRatingSnapshot(
        ratingTable("00", [ratingRow("One", DIGEST_A)]),
      ),
    ).toThrow(/ambiguous table caption/);
  });

  it("allows the official legacy style comment wrapper but rejects hidden structural rating markup", () => {
    expect(
      parseFloodgateRatingSnapshot(
        [
          '<style type="text/css"><!-- body { color: black; } --></style>',
          ratingTable(0, [ratingRow("One", DIGEST_A)]),
        ].join("\n"),
      ),
    ).toHaveLength(1);

    const hiddenTable =
      "<table><caption>Group: 0</caption><tbody></tbody></table>";
    for (const hidden of [
      `<!-- ${hiddenTable} -->`,
      `<script>${hiddenTable}</script>`,
      `<style>${hiddenTable}</style>`,
    ]) {
      expect(() => parseFloodgateRatingSnapshot(hidden)).toThrow(
        /hides structural markup/,
      );
    }
    expect(() =>
      parseFloodgateRatingSnapshot("<script>const tooltip = true;"),
    ).toThrow(/unclosed script block/);
  });

  it("rejects player href backslash aliases before URL normalization", () => {
    const identity = encodeURIComponent(`Alias+${DIGEST_A}`);
    const href = `https://wdoor.c.u-tokyo.ac.jp\\shogi\\view\\show-player.cgi?event=LATEST&amp;filter=floodgate&amp;show_self_play=1&amp;user=${identity}`;
    expect(() =>
      parseFloodgateRatingSnapshot(
        ratingTable(0, [ratingRow("Alias", DIGEST_A, { href })]),
      ),
    ).toThrow(/path alias/);
  });

  it("fails closed on malformed rows, non-integer ratings, bad credentials, and missing group 0", () => {
    expect(() =>
      parseFloodgateRatingSnapshot(
        ratingTable(0, [ratingRow("Bad", DIGEST_A, { rating: "Infinity" })]),
      ),
    ).toThrow(/integer-like/);
    expect(() =>
      parseFloodgateRatingSnapshot(
        ratingTable(0, [ratingRow("Bad", DIGEST_A, { rating: "3600.5" })]),
      ),
    ).toThrow(/integer-like/);
    expect(() =>
      parseFloodgateRatingSnapshot(
        ratingTable(0, [
          ratingRow("Bad", DIGEST_A, { hrefIdentity: `Other+${DIGEST_A}` }),
        ]),
      ),
    ).toThrow(/identities conflict/);
    expect(() =>
      parseFloodgateRatingSnapshot(
        ratingTable(1, [ratingRow("One", DIGEST_A)]),
      ),
    ).toThrow(/group 0/);

    const missingCell = ratingRow("Bad", DIGEST_A).replace(
      '<td class="ngames"> 10 </td>',
      "",
    );
    expect(() =>
      parseFloodgateRatingSnapshot(ratingTable(0, [missingCell])),
    ).toThrow(/seven cells/);

    const parsed = parseFloodgateRatingSnapshot(
      ratingTable(0, [ratingRow("One", DIGEST_A)]),
    );
    expect(() =>
      eligibleGroupZeroIdentities([{ ...parsed[0], wins: Number.NaN }]),
    ).toThrow(/malformed rating row/);
  });
});

describe("Floodgate raw CSA identity and rating metadata", () => {
  const alphaIdentity = `Alpha+${DIGEST_A}`;
  const betaIdentity = `Beta+${DIGEST_B}`;

  it("parses a live-shaped CRLF sample and cross-checks all three metadata lines with N+/N-", () => {
    const metadata = parseFloodgateCsaMetadata(
      new TextEncoder().encode(liveShapedCsa()),
    );
    expect(metadata).toEqual({
      sente: {
        visibleName: "Alpha",
        identity: alphaIdentity,
        embeddedGameTimeRating: 3600,
      },
      gote: {
        visibleName: "Beta",
        identity: betaIdentity,
        embeddedGameTimeRating: 4200.5,
      },
      identities: [alphaIdentity, betaIdentity],
      embeddedGameTimeRatings: [3600, 4200.5],
    });
    expect(Object.isFrozen(metadata)).toBe(true);
    expect(Object.isFrozen(metadata.sente)).toBe(true);
  });

  it("rejects missing, duplicate, conflicting, name-mismatched, and nonfinite metadata", () => {
    const sample = liveShapedCsa();
    const ratingLine = sample
      .split("\r\n")
      .find((line) => line.startsWith("'rating:"));
    expect(ratingLine).toBeDefined();

    expect(() =>
      parseFloodgateCsaMetadata(sample.replace(/^'white_rate:.*\r\n/m, "")),
    ).toThrow(/white_rate.*exactly once/);
    expect(() =>
      parseFloodgateCsaMetadata(`${sample}\r\n${ratingLine}`),
    ).toThrow(/rating:.*exactly once/);
    expect(() =>
      parseFloodgateCsaMetadata(liveShapedCsa({ blackIdentity: betaIdentity })),
    ).toThrow(/identities conflict/);
    expect(() =>
      parseFloodgateCsaMetadata(liveShapedCsa({ senteName: "Other" })),
    ).toThrow(/names conflict/);
    expect(() =>
      parseFloodgateCsaMetadata(liveShapedCsa({ blackRating: "1e309" })),
    ).toThrow(/finite numeric rating/);
  });

  it("uses fatal UTF-8 decoding", () => {
    const valid = new TextEncoder().encode(liveShapedCsa());
    const invalid = new Uint8Array(valid.length + 1);
    invalid.set(valid);
    invalid[valid.length] = 0xff;
    expect(() => parseFloodgateCsaMetadata(invalid)).toThrow(
      /fatal-valid UTF-8/,
    );
  });

  it("enforces daily membership, distinct identities, and the inclusive 3600 game-time boundary", () => {
    const eligible = [alphaIdentity, betaIdentity];
    expect(
      parseEligibleFloodgateCsaMetadata(
        liveShapedCsa({ blackRating: "3600", whiteRating: "3600.0" }),
        eligible,
      ).identities,
    ).toEqual(eligible);

    expect(() =>
      parseEligibleFloodgateCsaMetadata(liveShapedCsa(), [alphaIdentity]),
    ).toThrow(/daily group-0 30-game set/);
    expect(() =>
      parseEligibleFloodgateCsaMetadata(
        liveShapedCsa({ blackRating: "3599.999" }),
        eligible,
      ),
    ).toThrow(/at least 3600/);
    expect(() =>
      parseEligibleFloodgateCsaMetadata(
        liveShapedCsa({
          goteName: "Alpha",
          goteIdentity: alphaIdentity,
          whiteIdentity: alphaIdentity,
        }),
        [alphaIdentity],
      ),
    ).toThrow(/distinct full identities/);

    const arbitraryScoredObject = {
      label_blind: true,
      score: 9000,
      cp: 9000,
    };
    expect(() =>
      parseEligibleFloodgateCsaMetadata(
        arbitraryScoredObject as unknown as Uint8Array,
        eligible,
      ),
    ).toThrow(/string or Uint8Array/);
  });
});

describe("canonical Floodgate game source evidence", () => {
  const ratingUrl =
    "https://wdoor.c.u-tokyo.ac.jp/shogi/x/rating/players-floodgate-20260331.html";
  const csaUrl =
    "https://wdoor.c.u-tokyo.ac.jp/shogi/x/2026/03/31/wdoor+floodgate-300-10F+Alpha+Beta+20260331233001.csa";

  function validInput() {
    return {
      ratingUrl,
      ratingBytes: new TextEncoder().encode(evidenceRatingHtml()),
      csaUrl,
      csaBytes: new TextEncoder().encode(liveShapedCsa()),
    };
  }

  it("binds exact response bytes, previous-day footer, headers, eligibility, and immutable outputs", () => {
    const input = validInput();
    const expectedRatingSha = sha256Hex(input.ratingBytes);
    const expectedCsaSha = sha256Hex(input.csaBytes);
    const evidence = parseFloodgateGameSourceEvidence(input);

    expect(evidence).toMatchObject({
      schema: "shogi-floodgate-game-source-evidence-v1",
      date: "2026-03-31",
      rating: {
        body: {
          bytes: input.ratingBytes.byteLength,
          sha256: expectedRatingSha,
        },
        lastModifiedAt: "2026-03-30 23:54:25 +0900",
        eligibleGroupZeroIdentities: [`Alpha+${DIGEST_A}`, `Beta+${DIGEST_B}`],
      },
      csa: {
        body: { bytes: input.csaBytes.byteLength, sha256: expectedCsaSha },
        header: {
          event: "wdoor+floodgate-300-10F+Alpha+Beta+20260331233001",
          startTime: "2026/03/31 23:30:00",
        },
      },
    });
    expect(Object.isFrozen(evidence)).toBe(true);
    expect(Object.isFrozen(evidence.rating)).toBe(true);
    expect(Object.isFrozen(evidence.rating.rows)).toBe(true);
    expect(Object.isFrozen(evidence.rating.rows[0])).toBe(true);
    expect(Object.isFrozen(evidence.rating.eligibleGroupZeroIdentities)).toBe(
      true,
    );
    expect(Object.isFrozen(evidence.csa.location.visiblePlayers)).toBe(true);
    expect(Object.isFrozen(evidence.csa.metadata.identities)).toBe(true);

    input.ratingBytes.fill(0);
    expect(evidence.rating.body.sha256).toBe(expectedRatingSha);
    expect(() =>
      (evidence.rating.eligibleGroupZeroIdentities as unknown as string[]).push(
        "mutate",
      ),
    ).toThrow();
  });

  it("fatal-decodes the exact rating bytes before hashing or parsing", () => {
    const input = validInput();
    const malformed = new Uint8Array(input.ratingBytes.length + 1);
    malformed.set(input.ratingBytes);
    malformed[input.ratingBytes.length] = 0xff;
    expect(() =>
      parseFloodgateGameSourceEvidence({
        ...input,
        ratingBytes: malformed,
      }),
    ).toThrow(/rating snapshot bytes are not fatal-valid UTF-8/);
  });

  it("requires exactly one +0900 footer dated one calendar day before the snapshot", () => {
    const input = validInput();
    expect(() =>
      parseFloodgateGameSourceEvidence({
        ...input,
        ratingBytes: new TextEncoder().encode(evidenceRatingHtml("2026-03-31")),
      }),
    ).toThrow(/previous calendar date/);
    expect(() =>
      parseFloodgateGameSourceEvidence({
        ...input,
        ratingBytes: new TextEncoder().encode(
          evidenceRatingHtml("2026-03-30", "+0000"),
        ),
      }),
    ).toThrow(/exactly one Last modified/);
    expect(() =>
      parseFloodgateGameSourceEvidence({
        ...input,
        ratingBytes: new TextEncoder().encode(
          `${evidenceRatingHtml()} Last modified at 2026-03-30 00:00:00 +0900`,
        ),
      }),
    ).toThrow(/exactly one Last modified/);
  });

  it("does not accept a rating footer hidden in a comment, script, or style", () => {
    const input = validInput();
    const footer =
      '<div id="ft"><p>Last modified at 2026-03-30 23:54:25 +0900  <p>$Revision$</div>';
    for (const hiddenFooter of [
      "<!-- Last modified at 2026-03-30 23:54:25 +0900 -->",
      "<script>Last modified at 2026-03-30 23:54:25 +0900</script>",
      "<style>Last modified at 2026-03-30 23:54:25 +0900</style>",
    ]) {
      expect(() =>
        parseFloodgateGameSourceEvidence({
          ...input,
          ratingBytes: new TextEncoder().encode(
            evidenceRatingHtml().replace(footer, hiddenFooter),
          ),
        }),
      ).toThrow(/hides structural markup/);
    }
  });

  it("rejects adjacent snapshots instead of filling missing daily evidence", () => {
    const input = validInput();
    expect(() =>
      parseFloodgateGameSourceEvidence({
        ...input,
        ratingUrl:
          "https://wdoor.c.u-tokyo.ac.jp/shogi/x/rating/players-floodgate-20260326.html",
        csaUrl:
          "https://wdoor.c.u-tokyo.ac.jp/shogi/x/2026/03/27/wdoor+floodgate-300-10F+Alpha+Beta+20260327233001.csa",
      }),
    ).toThrow(/adjacent snapshots are forbidden/);
  });

  it("binds $EVENT exactly and constrains $START_TIME to the same URL event minute", () => {
    const input = validInput();
    expect(() =>
      parseFloodgateGameSourceEvidence({
        ...input,
        csaBytes: new TextEncoder().encode(
          liveShapedCsa().replace(
            "$EVENT:wdoor+floodgate-300-10F+Alpha+Beta+20260331233001",
            "$EVENT:wdoor+floodgate-300-10F+Beta+Alpha+20260331233001",
          ),
        ),
      }),
    ).toThrow(/\$EVENT does not match/);
    expect(() =>
      parseFloodgateGameSourceEvidence({
        ...input,
        csaBytes: new TextEncoder().encode(
          liveShapedCsa().replace(
            "$START_TIME:2026/03/31",
            "$START_TIME:2026/03/30",
          ),
        ),
      }),
    ).toThrow(/\$START_TIME is invalid or does not match/);
    expect(() =>
      parseFloodgateGameSourceEvidence({
        ...input,
        csaBytes: new TextEncoder().encode(
          `${liveShapedCsa()}\r\n$EVENT:wdoor+floodgate-300-10F+Alpha+Beta+20260331233001`,
        ),
      }),
    ).toThrow(/\$EVENT:.*exactly once/);

    expect(
      parseFloodgateGameSourceEvidence({
        ...input,
        csaBytes: new TextEncoder().encode(
          liveShapedCsa({ startTime: "2026/03/31 23:30:01" }),
        ),
      }).csa.header.startTime,
    ).toBe("2026/03/31 23:30:01");

    const timestampAtSecond59 = "20260331233059";
    expect(
      parseFloodgateGameSourceEvidence({
        ...input,
        csaUrl: csaUrl.replace("20260331233001", timestampAtSecond59),
        csaBytes: new TextEncoder().encode(
          liveShapedCsa({
            eventTimestamp: timestampAtSecond59,
            startTime: "2026/03/31 23:30:00",
          }),
        ),
      }).csa.header.startTime,
    ).toBe("2026/03/31 23:30:00");

    for (const startTime of [
      "2026/03/31 23:29:59",
      "2026/03/31 23:30:02",
      "2026/03/31 23:31:00",
    ]) {
      expect(() =>
        parseFloodgateGameSourceEvidence({
          ...input,
          csaBytes: new TextEncoder().encode(liveShapedCsa({ startTime })),
        }),
      ).toThrow(/share the URL event minute|must not follow/);
    }
  });

  it("rejects coercion objects and unknown score-like fields", () => {
    const input = validInput();
    expect(() =>
      parseFloodgateGameSourceEvidence({
        ...input,
        ratingUrl: new String(ratingUrl) as unknown as string,
      }),
    ).toThrow(/primitive strings/);
    expect(() =>
      parseFloodgateGameSourceEvidence({
        ...input,
        score: 9000,
      } as unknown as Parameters<typeof parseFloodgateGameSourceEvidence>[0]),
    ).toThrow(/unknown or missing fields/);
    expect(() =>
      parseFloodgateGameSourceEvidence({
        ...input,
        csaBytes: {
          toString: () => liveShapedCsa(),
        } as unknown as Uint8Array,
      }),
    ).toThrow(/exact Uint8Array body/);
  });
});

describe("Floodgate 2026-Q1 URL contract", () => {
  const listing = "https://wdoor.c.u-tokyo.ac.jp/shogi/x/2026/02/03/";
  const filename = "wdoor+floodgate-300-10F+Alpha_1+Beta-2+20260203235958.csa";
  const csaUrl = `${listing}${filename}`;

  function listingEvidence(html: string, listingUrl = listing) {
    return parseFloodgateDailyListingEvidence({
      listingUrl,
      listingBytes: new TextEncoder().encode(html),
    });
  }

  it("parses daily listings only inside the fixed Q1 date interval", () => {
    expect(
      parseFloodgateDailyListingUrl(
        "https://wdoor.c.u-tokyo.ac.jp/shogi/x/2026/01/01/",
      ),
    ).toMatchObject({
      date: "2026-01-01",
      year: 2026,
      month: 1,
      day: 1,
    });
    expect(
      parseFloodgateDailyListingUrl(
        "https://wdoor.c.u-tokyo.ac.jp:443/shogi/x/2026/03/31/",
      ).date,
    ).toBe("2026-03-31");
    expect(() =>
      parseFloodgateDailyListingUrl(
        "https://wdoor.c.u-tokyo.ac.jp/shogi/x/2026/02/30/",
      ),
    ).toThrow(/calendar day/);
    expect(() =>
      parseFloodgateDailyListingUrl(
        "https://wdoor.c.u-tokyo.ac.jp/shogi/x/2026/04/01/",
      ),
    ).toThrow(/2026 Q1/);
  });

  it("parses only exact same-origin Q1 daily cumulative rating URLs", () => {
    expect(
      parseFloodgateDailyRatingUrl(
        "https://wdoor.c.u-tokyo.ac.jp/shogi/x/rating/players-floodgate-20260101.html",
      ),
    ).toEqual({
      url: "https://wdoor.c.u-tokyo.ac.jp/shogi/x/rating/players-floodgate-20260101.html",
      filename: "players-floodgate-20260101.html",
      date: "2026-01-01",
      year: 2026,
      month: 1,
      day: 1,
    });
    expect(
      parseFloodgateDailyRatingUrl(
        "https://wdoor.c.u-tokyo.ac.jp:443/shogi/x/rating/players-floodgate-20260331.html",
      ).date,
    ).toBe("2026-03-31");
    expect(() =>
      parseFloodgateDailyRatingUrl(
        "https://wdoor.c.u-tokyo.ac.jp/shogi/x/rating/players-floodgate-20260401.html",
      ),
    ).toThrow(/2026 Q1/);
    expect(() =>
      parseFloodgateDailyRatingUrl(
        "https://wdoor.c.u-tokyo.ac.jp/shogi/x/rating/players-floodgate-20260230.html",
      ),
    ).toThrow(/calendar day/);
    expect(() =>
      parseFloodgateDailyRatingUrl(
        "https://wdoor.c.u-tokyo.ac.jp/shogi/x/rating/players-floodgate-20260331.html?raw=1",
      ),
    ).toThrow(/exact Floodgate HTTPS origin/);
    expect(() =>
      parseFloodgateDailyRatingUrl(
        "https://evil.example/shogi/x/rating/players-floodgate-20260331.html",
      ),
    ).toThrow(/exact Floodgate HTTPS origin/);
    expect(() =>
      parseFloodgateDailyRatingUrl(
        "https://wdoor.c.u-tokyo.ac.jp/shogi/x/rating/%2e%2e/players-floodgate-20260331.html",
      ),
    ).toThrow(/encoded traversal/);
  });

  it("parses a valid corpus filename but marks filename players as visible hints", () => {
    expect(parseFloodgateCsaUrl(csaUrl)).toEqual({
      url: csaUrl,
      date: "2026-02-03",
      year: 2026,
      month: 2,
      day: 3,
      filename,
      event: "floodgate-300-10F",
      visiblePlayers: ["Alpha_1", "Beta-2"],
      timestamp: "20260203235958",
    });

    const encoded = parseFloodgateCsaUrl(
      `${listing}wdoor+floodgate-300-10F+%E7%8E%8B+Beta+20260203010203.csa`,
    );
    expect(encoded.visiblePlayers).toEqual(["王", "Beta"]);
  });

  it.each([
    "http://wdoor.c.u-tokyo.ac.jp/shogi/x/2026/02/03/",
    "https://evil.example/shogi/x/2026/02/03/",
    "https://wdoor.c.u-tokyo.ac.jp.evil.example/shogi/x/2026/02/03/",
    "https://user@wdoor.c.u-tokyo.ac.jp/shogi/x/2026/02/03/",
    "https://wdoor.c.u-tokyo.ac.jp:444/shogi/x/2026/02/03/",
    "https://wdoor.c.u-tokyo.ac.jp/not-shogi/x/2026/02/03/",
    "https://wdoor.c.u-tokyo.ac.jp/shogi/x/2026/02/03/?raw=1",
    "https://wdoor.c.u-tokyo.ac.jp/shogi/x/2026/02/03/#today",
    "https://wdoor.c.u-tokyo.ac.jp/shogi/x/2026/02/%2e%2e/",
    "https://wdoor.c.u-tokyo.ac.jp/shogi/x/2026/02/%252e%252e/",
    "https://wdoor.c.u-tokyo.ac.jp/shogi/x/2026/02/./03/",
    "https://wdoor.c.u-tokyo.ac.jp/shogi/x/2026/02/04/../03/",
    "https://wdoor.c.u-tokyo.ac.jp\\shogi\\x\\2026\\02\\03\\",
  ])("rejects unsafe listing URL %s", (url) => {
    expect(() => parseFloodgateDailyListingUrl(url)).toThrow(
      /invalid Floodgate source/,
    );
  });

  it.each([
    `${listing}wdoor+floodgate-600-10+Alpha+Beta+20260203010203.csa`,
    `${listing}wdoor+floodgate-300-10F+Alpha+Beta+20260204010203.csa`,
    `${listing}wdoor+floodgate-300-10F+Alpha+Beta+20260203246000.csa`,
    `${listing}wdoor+floodgate-300-10F+Alpha+Beta+20260203010203.CSA`,
    `https://wdoor.c.u-tokyo.ac.jp/not-shogi/x/2026/02/03/wdoor+floodgate-300-10F+Alpha+Beta+20260203010203.csa`,
    `${listing}wdoor+floodgate-300-10F+Alpha+Extra+Beta+20260203010203.csa`,
    `${listing}wdoor+floodgate-300-10F+Alpha+Beta+20260203010203.csa?download=1`,
    `${listing}%2e%2e/wdoor+floodgate-300-10F+Alpha+Beta+20260203010203.csa`,
  ])(
    "rejects a CSA URL outside the exact event/filename contract %s",
    (url) => {
      expect(() => parseFloodgateCsaUrl(url)).toThrow(
        /invalid Floodgate source/,
      );
    },
  );

  it("ignores well-formed other events while sorting targets and rejecting hostile CSA links", () => {
    const earlier = "wdoor+floodgate-300-10F+A+B+20260203000001.csa";
    const otherEvent = "wdoor+default-1500-0+Kiri_d16+Beta+20260203020734.csa";
    const html = [
      `<a href="${filename}">later</a>`,
      '<a href="notes.txt">notes</a>',
      `<a href="${otherEvent}">valid official other event</a>`,
      `<a href="${earlier}">earlier</a>`,
      `<a href="${filename}">duplicate</a>`,
    ].join("\n");
    expect(
      listingEvidence(html).csaLocations.map((entry) => entry.filename),
    ).toEqual([earlier, filename]);

    expect(() =>
      listingEvidence(
        '<a href="https://evil.example/wdoor+floodgate-300-10F+A+B+20260203000001.csa">bad</a>',
      ),
    ).toThrow(/exact Floodgate HTTPS origin/);
    expect(() =>
      listingEvidence(
        '<a href="wdoor+default-1500-0+OnlyOnePlayer+20260203000001.csa">malformed</a>',
      ),
    ).toThrow(/canonical official event token/);
    expect(() =>
      listingEvidence(
        '<a href="https://wdoor.c.u-tokyo.ac.jp/shogi/x/2026/02/04/wdoor+default-1500-0+A+B+20260204000001.csa">wrong day</a>',
      ),
    ).toThrow(/another date/);
    expect(() =>
      listingEvidence(`<a href="./${earlier}">raw dot alias</a>`),
    ).toThrow(/raw or encoded path alias/);
  });

  it("binds listing discovery to exact fatal-valid bytes and immutable evidence", () => {
    const html = `<a href="${filename}">game</a>`;
    const listingBytes = new TextEncoder().encode(html);
    const expectedSha = sha256Hex(listingBytes);
    const evidence = parseFloodgateDailyListingEvidence({
      listingUrl: listing,
      listingBytes,
    });
    expect(evidence).toMatchObject({
      schema: "shogi-floodgate-daily-listing-evidence-v1",
      date: "2026-02-03",
      listing: {
        body: { bytes: listingBytes.byteLength, sha256: expectedSha },
      },
    });
    expect(evidence.csaLocations.map((location) => location.filename)).toEqual([
      filename,
    ]);
    expect(Object.isFrozen(evidence)).toBe(true);
    expect(Object.isFrozen(evidence.listing)).toBe(true);
    expect(Object.isFrozen(evidence.listing.location)).toBe(true);
    expect(Object.isFrozen(evidence.listing.body)).toBe(true);
    expect(Object.isFrozen(evidence.csaLocations)).toBe(true);
    expect(Object.isFrozen(evidence.csaLocations[0])).toBe(true);
    expect(Object.isFrozen(evidence.csaLocations[0].visiblePlayers)).toBe(true);

    listingBytes.fill(0);
    expect(evidence.listing.body.sha256).toBe(expectedSha);

    const malformed = new Uint8Array(
      new TextEncoder().encode(html).byteLength + 1,
    );
    malformed.set(new TextEncoder().encode(html));
    malformed[malformed.length - 1] = 0xff;
    expect(() =>
      parseFloodgateDailyListingEvidence({
        listingUrl: listing,
        listingBytes: malformed,
      }),
    ).toThrow(/daily listing bytes are not fatal-valid UTF-8/);
    expect(() =>
      parseFloodgateDailyListingEvidence({
        listingUrl: listing,
        listingBytes: html as unknown as Uint8Array,
      }),
    ).toThrow(/exact Uint8Array body/);
    expect(() =>
      parseFloodgateDailyListingEvidence({
        listingUrl: new String(listing) as unknown as string,
        listingBytes: new TextEncoder().encode(html),
      }),
    ).toThrow(/primitive string/);
    expect(() =>
      parseFloodgateDailyListingEvidence({
        listingUrl: listing,
        listingBytes: new TextEncoder().encode(html),
        score: 9000,
      } as unknown as Parameters<typeof parseFloodgateDailyListingEvidence>[0]),
    ).toThrow(/unknown or missing fields/);
  });

  it("rejects hidden listing links and raw backslash aliases before normalization", () => {
    const game = "wdoor+floodgate-300-10F+A+B+20260203000001.csa";
    for (const hidden of [
      `<!-- <a href="${game}">hidden</a> -->`,
      `<script><a href="${game}">hidden</a></script>`,
      `<style><a href="${game}">hidden</a></style>`,
    ]) {
      expect(() => listingEvidence(hidden)).toThrow(/hides structural markup/);
    }
    for (const href of [`.\\${game}`, `folder\\..\\${game}`]) {
      expect(() => listingEvidence(`<a href="${href}">alias</a>`)).toThrow(
        /path alias/,
      );
    }
  });
});

describe("deterministic helpers", () => {
  it("uses UTF-8 byte ordering and hashes exact bytes", () => {
    expect(["王", "Alpha", "zeta"].sort(compareUtf8Bytes)).toEqual([
      "Alpha",
      "zeta",
      "王",
    ]);
    expect(sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(sha256Hex(Uint8Array.from([0, 255]))).toBe(
      "06eb7d6a69ee19e5fbdf749018d3d2abfa04bcbd1365db312eb86dc7169389b8",
    );
  });
});
