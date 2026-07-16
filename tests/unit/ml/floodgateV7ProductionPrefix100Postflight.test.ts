import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import {
  FLOODGATE_V7_PREFIX_100_CALLER_ANCHOR_SCAN_CONTRACT,
  FLOODGATE_V7_PREFIX_100_CALLER_ANCHOR_SCAN_EXECUTION_BOUNDARY,
  FLOODGATE_V7_PREFIX_100_CALLER_ANCHOR_SCAN_STATUS,
  scanFloodgateV7Prefix100CallerAnchor,
  scanFloodgateV7Prefix100CallerAnchorCoreForTests,
  type FloodgateV7Prefix100CallerAnchorScanDependenciesForTests,
  type FloodgateV7Prefix100WorkScanAnchor,
} from "../../../ml/floodgate-v7-production-prefix-100-postflight";

const RUN_ID = "ab".repeat(32);
const SOURCE_PATH = fileURLToPath(
  new URL(
    "../../../ml/floodgate-v7-production-prefix-100-postflight.ts",
    import.meta.url,
  ),
);
const roots: string[] = [];

interface Fixture {
  readonly root: string;
  readonly runs: string;
  readonly stage: string;
  readonly work: string;
  readonly anchor: Readonly<FloodgateV7Prefix100WorkScanAnchor>;
}

function makeContent(records = 102, finalLf = true): Buffer {
  const rows = Array.from({ length: records }, (_value, index) =>
    JSON.stringify({ record: index }),
  ).join("\n");
  return Buffer.from(`${rows}${finalLf ? "\n" : ""}`, "utf8");
}

function fixture(records = 102, finalLf = true): Fixture {
  const temporaryParent = fs.realpathSync.native(os.tmpdir());
  const root = fs.mkdtempSync(
    path.join(temporaryParent, "floodgate-v7-prefix100-postflight-"),
  );
  roots.push(root);
  fs.chmodSync(root, 0o700);
  const runs = path.join(root, "runs");
  const stageBasename = `floodgate-v7-${RUN_ID}-stage`;
  const stage = path.join(runs, stageBasename);
  fs.mkdirSync(stage, { mode: 0o700, recursive: true });
  fs.chmodSync(runs, 0o700);
  fs.chmodSync(stage, 0o700);
  const work = path.join(stage, "work.jsonl");
  const content = makeContent(records, finalLf);
  fs.writeFileSync(work, content, { mode: 0o600 });
  fs.chmodSync(work, 0o600);
  const anchor = Object.freeze({
    publicationParent: runs,
    stageBasename,
    destinationBasename: `floodgate-v7-${RUN_ID}-final`,
    workBasename: "work.jsonl" as const,
    workBytes: content.byteLength,
    workSha256: createHash("sha256").update(content).digest("hex"),
    workRecords: 102 as const,
    completedParents: 100 as const,
  });
  return { root, runs, stage, work, anchor };
}

function dependencies(
  overrides: Partial<FloodgateV7Prefix100CallerAnchorScanDependenciesForTests> = {},
): FloodgateV7Prefix100CallerAnchorScanDependenciesForTests {
  if (typeof process.geteuid !== "function") {
    throw new Error("effective user id is unavailable");
  }
  return { effectiveUserId: process.geteuid(), ...overrides };
}

function treeSnapshot(value: Fixture): unknown {
  return {
    runs: fs.readdirSync(value.runs),
    stage: fs.readdirSync(value.stage),
    bytes: fs.readFileSync(value.work).toString("hex"),
    runsMode: fs.statSync(value.runs).mode & 0o7777,
    stageMode: fs.statSync(value.stage).mode & 0o7777,
    workMode: fs.statSync(value.work).mode & 0o7777,
  };
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { force: true, recursive: true });
  }
});

describe("Floodgate v7 prefix-100 caller-anchor scan", () => {
  it("scans the exact private namespace without claiming authenticated origin", async () => {
    const value = fixture();
    const before = treeSnapshot(value);
    const receipt = await scanFloodgateV7Prefix100CallerAnchorCoreForTests(
      value.anchor,
      dependencies(),
    );

    expect(receipt).toEqual({
      contract: FLOODGATE_V7_PREFIX_100_CALLER_ANCHOR_SCAN_CONTRACT,
      status: FLOODGATE_V7_PREFIX_100_CALLER_ANCHOR_SCAN_STATUS,
      execution_boundary:
        FLOODGATE_V7_PREFIX_100_CALLER_ANCHOR_SCAN_EXECUTION_BOUNDARY,
      verification: {
        namespace_exact: true,
        held_vs_named_identity_matched: true,
        anchor_bytes_digest_and_record_count_matched: true,
        descriptors_closed: true,
        namespace_or_file_content_mutated: false,
      },
      nonclaims: {
        outer_lock_origin: false,
        connector_receipt_origin: false,
        independent_hmac_authentication: false,
        authenticated_continuity: false,
        production_gate_authority: false,
        atime_invariance: false,
      },
    });
    expect(treeSnapshot(value)).toEqual(before);
  });

  it("keeps an arbitrary synthetic caller anchor explicitly non-authorizing", async () => {
    const value = fixture();
    const receipt = await scanFloodgateV7Prefix100CallerAnchor(value.anchor);

    expect(receipt.execution_boundary).toBe(
      FLOODGATE_V7_PREFIX_100_CALLER_ANCHOR_SCAN_EXECUTION_BOUNDARY,
    );
    expect(receipt.nonclaims).toEqual({
      outer_lock_origin: false,
      connector_receipt_origin: false,
      independent_hmac_authentication: false,
      authenticated_continuity: false,
      production_gate_authority: false,
      atime_invariance: false,
    });
    expect(receipt.verification).toMatchObject({
      anchor_bytes_digest_and_record_count_matched: true,
      namespace_or_file_content_mutated: false,
    });
  });

  it("accepts the runner's frozen null-prototype private anchor", async () => {
    const value = fixture();
    const anchor = Object.assign(
      Object.create(null),
      value.anchor,
    ) as Readonly<FloodgateV7Prefix100WorkScanAnchor>;
    await expect(
      scanFloodgateV7Prefix100CallerAnchorCoreForTests(anchor, dependencies()),
    ).resolves.toMatchObject({
      verification: {
        anchor_bytes_digest_and_record_count_matched: true,
      },
      nonclaims: {
        independent_hmac_authentication: false,
        authenticated_continuity: false,
      },
    });
  });

  it.each([101, 103])("rejects an exact %i-record stream", async (records) => {
    const value = fixture(records);
    await expect(
      scanFloodgateV7Prefix100CallerAnchorCoreForTests(
        value.anchor,
        dependencies(),
      ),
    ).rejects.toThrow("prefix 100 continuity postflight failed");
  });

  it("rejects a torn final record even when its size and digest match", async () => {
    const value = fixture(102, false);
    await expect(
      scanFloodgateV7Prefix100CallerAnchorCoreForTests(
        value.anchor,
        dependencies(),
      ),
    ).rejects.toThrow("prefix 100 continuity postflight failed");
  });

  it.each(["digest", "size"] as const)(
    "rejects a mismatched caller-supplied %s anchor",
    async (kind) => {
      const value = fixture();
      const anchor = {
        ...value.anchor,
        ...(kind === "digest"
          ? { workSha256: "cd".repeat(32) }
          : { workBytes: value.anchor.workBytes + 1 }),
      };
      await expect(
        scanFloodgateV7Prefix100CallerAnchorCoreForTests(
          anchor,
          dependencies(),
        ),
      ).rejects.toThrow("prefix 100 continuity postflight failed");
    },
  );

  it.each(["runs", "stage"] as const)(
    "rejects an extra %s namespace entry",
    async (where) => {
      const value = fixture();
      fs.writeFileSync(
        path.join(where === "runs" ? value.runs : value.stage, "extra"),
        "x",
      );
      await expect(
        scanFloodgateV7Prefix100CallerAnchorCoreForTests(
          value.anchor,
          dependencies(),
        ),
      ).rejects.toThrow("prefix 100 continuity postflight failed");
    },
  );

  it.each(["destination", "lease"] as const)(
    "rejects a present %s path",
    async (kind) => {
      const value = fixture();
      const target =
        kind === "destination"
          ? path.join(value.runs, value.anchor.destinationBasename)
          : path.join(
              value.runs,
              `.${value.anchor.stageBasename}.authorization-lease`,
            );
      fs.mkdirSync(target, { mode: 0o700 });
      await expect(
        scanFloodgateV7Prefix100CallerAnchorCoreForTests(
          value.anchor,
          dependencies(),
        ),
      ).rejects.toThrow("prefix 100 continuity postflight failed");
    },
  );

  it.each(["stage", "work"] as const)("rejects a %s symlink", async (kind) => {
    const value = fixture();
    if (kind === "work") {
      const target = path.join(value.root, "target.jsonl");
      fs.renameSync(value.work, target);
      fs.symlinkSync(target, value.work);
    } else {
      const target = path.join(value.root, "stage-target");
      fs.renameSync(value.stage, target);
      fs.symlinkSync(target, value.stage);
    }
    await expect(
      scanFloodgateV7Prefix100CallerAnchorCoreForTests(
        value.anchor,
        dependencies(),
      ),
    ).rejects.toThrow();
  });

  it("rejects a hard-linked work file", async () => {
    const value = fixture();
    fs.linkSync(value.work, path.join(value.root, "work-alias.jsonl"));
    await expect(
      scanFloodgateV7Prefix100CallerAnchorCoreForTests(
        value.anchor,
        dependencies(),
      ),
    ).rejects.toThrow("prefix 100 continuity postflight failed");
  });

  it.each(["runs", "stage", "work"] as const)(
    "rejects unsafe %s mode",
    async (kind) => {
      const value = fixture();
      fs.chmodSync(value[kind], kind === "work" ? 0o640 : 0o750);
      await expect(
        scanFloodgateV7Prefix100CallerAnchorCoreForTests(
          value.anchor,
          dependencies(),
        ),
      ).rejects.toThrow("prefix 100 continuity postflight failed");
    },
  );

  it("rejects a namespace not owned by the expected user", async () => {
    const value = fixture();
    await expect(
      scanFloodgateV7Prefix100CallerAnchorCoreForTests(
        value.anchor,
        dependencies({ effectiveUserId: process.geteuid!() + 1 }),
      ),
    ).rejects.toThrow("prefix 100 continuity postflight failed");
  });

  it("rejects a path-escaping stage basename before filesystem access", async () => {
    const value = fixture();
    await expect(
      scanFloodgateV7Prefix100CallerAnchorCoreForTests(
        { ...value.anchor, stageBasename: "../escape" },
        dependencies(),
      ),
    ).rejects.toThrow("postflight basename differs");
  });

  it.each(["rename", "same-size-mutation"] as const)(
    "rejects a %s after the byte scan",
    async (mutation) => {
      const value = fixture();
      await expect(
        scanFloodgateV7Prefix100CallerAnchorCoreForTests(
          value.anchor,
          dependencies({
            afterReadForTests() {
              if (mutation === "rename") {
                fs.renameSync(value.stage, `${value.stage}-moved`);
                return;
              }
              const descriptor = fs.openSync(value.work, "r+");
              try {
                fs.writeSync(descriptor, Buffer.from("X"), 0, 1, 0);
                fs.fsyncSync(descriptor);
              } finally {
                fs.closeSync(descriptor);
              }
            },
          }),
        ),
      ).rejects.toThrow("prefix 100 continuity postflight failed");
    },
  );

  it("rejects any descriptor close failure after attempting every close once", async () => {
    const value = fixture();
    const closed: string[] = [];
    await expect(
      scanFloodgateV7Prefix100CallerAnchorCoreForTests(
        value.anchor,
        dependencies({
          closeDescriptorForTests(kind, descriptor) {
            closed.push(kind);
            fs.closeSync(descriptor);
            if (kind === "work") throw new Error("synthetic close failure");
          },
        }),
      ),
    ).rejects.toThrow("prefix 100 continuity postflight failed");
    expect(closed).toEqual(["work", "stage", "runs"]);
  });

  it("rejects an undefined hook rejection and still closes every descriptor", async () => {
    const value = fixture();
    const closed: string[] = [];
    await expect(
      scanFloodgateV7Prefix100CallerAnchorCoreForTests(
        value.anchor,
        dependencies({
          afterReadForTests() {
            return Promise.reject(undefined);
          },
          closeDescriptorForTests(kind, descriptor) {
            closed.push(kind);
            fs.closeSync(descriptor);
          },
        }),
      ),
    ).rejects.toThrow("prefix 100 continuity postflight failed");
    expect(closed).toEqual(["work", "stage", "runs"]);
  });

  it("contains no write primitive or production-looking caller-path API", async () => {
    const source = await fs.promises.readFile(SOURCE_PATH, "utf8");
    expect(source).not.toMatch(
      /\bfs\.(?:appendFile|chmod|chown|copyFile|link|mkdir|rename|rm|rmdir|symlink|truncate|unlink|writeFile)/u,
    );
    expect(source).not.toContain(
      "verifyFloodgateV7ProductionPrefix100Postflight",
    );
    expect(source).not.toContain(
      "exact-private-namespace-and-prior-authenticated-scan-continuity-confirmed",
    );
    expect(source).not.toMatch(/export function \w*Production\w*Postflight/u);
    const scannerStart = source.indexOf(
      "export function scanFloodgateV7Prefix100CallerAnchor(",
    );
    expect(scannerStart).toBeGreaterThan(-1);
    expect(source.slice(scannerStart)).not.toContain("ForTests");
  });
});
