import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createV1R11AuthorityDirectory } from "../../../ml/halfkp81-depth18-v1r11-authority-io";
import {
  bootstrapHalfkp81V1R11PlannedLaunchAgentForTests,
  prepareHalfkp81V1R11PlannedLaunchAgentForTests,
} from "../../../ml/prepare-halfkp81-depth18-v1r11-planned-launchagent";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots
      .splice(0)
      .map((root) => fs.promises.rm(root, { recursive: true, force: true })),
  );
});

describe("HalfKP81 v1r11 planned LaunchAgent bootstrap", () => {
  it("keeps the legacy descriptor default and scopes recovery overrides to its caller", async () => {
    const root = await fs.promises.realpath(
      await fs.promises.mkdtemp(
        path.join(os.tmpdir(), "halfkp81-v1r11-descriptor-scope-"),
      ),
    );
    roots.push(root);
    const legacyAuthority = await createV1R11AuthorityDirectory(
      path.join(root, "legacy-authority"),
    );
    const recoveryAuthority = await createV1R11AuthorityDirectory(
      path.join(root, "recovery-authority"),
    );
    const common = {
      repositoryRoot: path.join(root, "repository"),
      homeDirectory: path.join(root, "home"),
      nodePath: process.execPath,
      sourceRevision: "d".repeat(40),
    } as const;
    const legacy = await prepareHalfkp81V1R11PlannedLaunchAgentForTests({
      ...common,
      authorityDirectory: legacyAuthority,
    });
    const recovery = await prepareHalfkp81V1R11PlannedLaunchAgentForTests({
      ...common,
      authorityDirectory: recoveryAuthority,
      labelPrefix:
        "com.meetyudai.shogi.halfkp81-depth18-yaneura-only-v1r11-minimal-r7-",
      runDirectoryName: "halfkp81-hard-depth18-yaneura-only-v1r11-minimal-r7",
    });
    expect(legacy.label).toBe(
      "com.meetyudai.shogi.halfkp81-depth18-yaneura-only-v1r11-dddddddd",
    );
    expect(legacy.stdoutPath).toContain(
      "/halfkp81-hard-depth18-yaneura-only-v1r11/",
    );
    expect(recovery.label).toBe(
      "com.meetyudai.shogi.halfkp81-depth18-yaneura-only-v1r11-minimal-r7-dddddddd",
    );
    expect(recovery.stdoutPath).toContain(
      "/halfkp81-hard-depth18-yaneura-only-v1r11-minimal-r7/",
    );
  });

  it("reauthenticates exact bytes then uses print→bootstrap→kickstart", async () => {
    const root = await fs.promises.realpath(
      await fs.promises.mkdtemp(
        path.join(os.tmpdir(), "halfkp81-v1r11-bootstrap-"),
      ),
    );
    roots.push(root);
    const authority = await createV1R11AuthorityDirectory(
      path.join(root, "authority"),
    );
    const descriptor = await prepareHalfkp81V1R11PlannedLaunchAgentForTests({
      authorityDirectory: authority,
      repositoryRoot: path.join(root, "repository"),
      homeDirectory: path.join(root, "home"),
      nodePath: process.execPath,
      sourceRevision: "a".repeat(40),
    });
    const calls: readonly string[][] = [];
    await bootstrapHalfkp81V1R11PlannedLaunchAgentForTests(descriptor, 501, {
      run(arguments_) {
        (calls as string[][]).push([...arguments_]);
        return {
          exitCode: arguments_[0] === "print" ? 113 : 0,
          stdout: Buffer.alloc(0),
          stderr: Buffer.alloc(0),
        };
      },
    });
    const service = `gui/501/${descriptor.label}`;
    expect(calls).toEqual([
      ["print", service],
      ["bootstrap", "gui/501", descriptor.plistSource.path],
      ["kickstart", service],
    ]);
  });

  it("fails closed before launchctl when live plist bytes changed", async () => {
    const root = await fs.promises.realpath(
      await fs.promises.mkdtemp(
        path.join(os.tmpdir(), "halfkp81-v1r11-bootstrap-tamper-"),
      ),
    );
    roots.push(root);
    const authority = await createV1R11AuthorityDirectory(
      path.join(root, "authority"),
    );
    const descriptor = await prepareHalfkp81V1R11PlannedLaunchAgentForTests({
      authorityDirectory: authority,
      repositoryRoot: path.join(root, "repository"),
      homeDirectory: path.join(root, "home"),
      nodePath: process.execPath,
      sourceRevision: "b".repeat(40),
    });
    await fs.promises.appendFile(descriptor.plistSource.path, "tamper");
    let called = false;
    await expect(
      bootstrapHalfkp81V1R11PlannedLaunchAgentForTests(descriptor, 501, {
        run() {
          called = true;
          return {
            exitCode: 0,
            stdout: Buffer.alloc(0),
            stderr: Buffer.alloc(0),
          };
        },
      }),
    ).rejects.toThrow(/source changed before bootstrap/u);
    expect(called).toBe(false);
  });

  it("fails closed before launchctl when the planned snapshot content changes", async () => {
    const root = await fs.promises.realpath(
      await fs.promises.mkdtemp(
        path.join(os.tmpdir(), "halfkp81-v1r11-snapshot-tamper-"),
      ),
    );
    roots.push(root);
    const authority = await createV1R11AuthorityDirectory(
      path.join(root, "authority"),
    );
    const descriptor = await prepareHalfkp81V1R11PlannedLaunchAgentForTests({
      authorityDirectory: authority,
      repositoryRoot: path.join(root, "repository"),
      homeDirectory: path.join(root, "home"),
      nodePath: process.execPath,
      sourceRevision: "c".repeat(40),
    });
    await fs.promises.appendFile(descriptor.plistSnapshot.path, "tamper");
    let called = false;
    await expect(
      bootstrapHalfkp81V1R11PlannedLaunchAgentForTests(descriptor, 501, {
        run() {
          called = true;
          return {
            exitCode: 0,
            stdout: Buffer.alloc(0),
            stderr: Buffer.alloc(0),
          };
        },
      }),
    ).rejects.toThrow(/differ/u);
    expect(called).toBe(false);
  });
});
