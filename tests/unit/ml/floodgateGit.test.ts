import { execFile as execFileCallback } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import {
  FLOODGATE_GIT_COMMAND_PREFIX,
  FLOODGATE_GIT_EXECUTABLE,
  FLOODGATE_GIT_FIXED_ENVIRONMENT,
  assertFloodgateGitExactCleanRevision,
  assertFloodgateGitTrackedTreeMatchesHead,
  floodgateGitEnvironment,
  floodgateGitTrackedEntriesAreOrdinary,
} from "../../../ml/floodgate-git";

const execFile = promisify(execFileCallback);
const roots: string[] = [];

async function git(
  root: string,
  arguments_: readonly string[],
): Promise<string> {
  const { stdout } = await execFile("git", [...arguments_], {
    cwd: root,
    encoding: "utf8",
  });
  return stdout;
}

async function createCommittedRepository(): Promise<
  Readonly<{
    root: string;
    revision: string;
    trackedPath: string;
  }>
> {
  const created = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "floodgate-git-exact-"),
  );
  const root = await fs.promises.realpath(created);
  roots.push(root);
  await git(root, ["init", "-q"]);
  await git(root, ["config", "user.name", "Floodgate Test"]);
  await git(root, ["config", "user.email", "floodgate@example.invalid"]);
  const trackedPath = path.join(root, "tracked.txt");
  await fs.promises.writeFile(trackedPath, "good\n");
  await git(root, ["add", "tracked.txt"]);
  await git(root, ["commit", "-q", "-m", "tracked"]);
  const revision = (await git(root, ["rev-parse", "HEAD"])).trim();
  return Object.freeze({ root, revision, trackedPath });
}

afterEach(async () => {
  await Promise.all(
    roots
      .splice(0)
      .map((root) => fs.promises.rm(root, { recursive: true, force: true })),
  );
});

describe("Floodgate Git provenance environment", () => {
  it("uses an exact allowlist and removes all inherited controls and credentials", () => {
    const environment = floodgateGitEnvironment({
      NODE_ENV: "test",
      PATH: "/usr/bin:/bin",
      SAFE_VALUE: "kept",
      GIT_DIR: "/attacker/repository",
      Git_Graft_File: "/attacker/grafts",
      GIT_CONFIG_COUNT: "1",
      DYLD_INSERT_LIBRARIES: "/attacker/dylib",
      LD_PRELOAD: "/attacker/library",
      AWS_SECRET_ACCESS_KEY: "attacker",
      HTTPS_PROXY: "https://attacker.invalid",
      SSH_AUTH_SOCK: "/attacker/ssh-agent",
      LC_ALL: "ja_JP.UTF-8",
      LANG: "ja_JP.UTF-8",
      LANGUAGE: "ja",
    });
    expect(environment).toEqual(FLOODGATE_GIT_FIXED_ENVIRONMENT);
    expect(environment.NODE_ENV).toBe("production");
    expect(environment.SAFE_VALUE).toBeUndefined();
    expect(Object.keys(environment).some((key) => key === "GIT_DIR")).toBe(
      false,
    );
    expect(
      Object.keys(environment).some((key) => key === "Git_Graft_File"),
    ).toBe(false);
    expect(environment.GIT_CONFIG_COUNT).toBeUndefined();
    expect(environment.DYLD_INSERT_LIBRARIES).toBeUndefined();
    expect(environment.LD_PRELOAD).toBeUndefined();
    expect(environment.AWS_SECRET_ACCESS_KEY).toBeUndefined();
    expect(environment.HTTPS_PROXY).toBeUndefined();
    expect(environment.SSH_AUTH_SOCK).toBeUndefined();
    expect(FLOODGATE_GIT_EXECUTABLE).toBe("/usr/bin/git");
  });

  it("defeats both repository and inherited graft ancestry spoofing", async () => {
    const created = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "floodgate-git-graft-"),
    );
    const root = await fs.promises.realpath(created);
    roots.push(root);
    await git(root, ["init", "-q"]);
    await git(root, ["config", "user.name", "Floodgate Test"]);
    await git(root, ["config", "user.email", "floodgate@example.invalid"]);
    await fs.promises.writeFile(path.join(root, "first.txt"), "first\n");
    await git(root, ["add", "first.txt"]);
    await git(root, ["commit", "-q", "-m", "first"]);
    const first = (await git(root, ["rev-parse", "HEAD"])).trim();
    await git(root, ["checkout", "-q", "--orphan", "unrelated"]);
    await git(root, ["rm", "-q", "--cached", "first.txt"]);
    await fs.promises.rm(path.join(root, "first.txt"));
    await fs.promises.writeFile(path.join(root, "second.txt"), "second\n");
    await git(root, ["add", "second.txt"]);
    await git(root, ["commit", "-q", "-m", "second"]);
    const second = (await git(root, ["rev-parse", "HEAD"])).trim();
    expect(
      floodgateGitTrackedEntriesAreOrdinary(
        await git(root, ["ls-files", "-v", "-z"]),
      ),
    ).toBe(true);
    await git(root, ["update-index", "--assume-unchanged", "second.txt"]);
    expect(
      floodgateGitTrackedEntriesAreOrdinary(
        await git(root, ["ls-files", "-v", "-z"]),
      ),
    ).toBe(false);
    await git(root, ["update-index", "--no-assume-unchanged", "second.txt"]);
    await git(root, ["update-index", "--skip-worktree", "second.txt"]);
    expect(
      floodgateGitTrackedEntriesAreOrdinary(
        await git(root, ["ls-files", "-v", "-z"]),
      ),
    ).toBe(false);
    await git(root, ["update-index", "--no-skip-worktree", "second.txt"]);
    const graft = `${second} ${first}\n`;
    const repositoryGrafts = path.join(root, ".git", "info", "grafts");
    await fs.promises.writeFile(repositoryGrafts, graft);

    await expect(
      execFile(
        "git",
        ["--no-replace-objects", "merge-base", "--is-ancestor", first, second],
        { cwd: root, encoding: "utf8" },
      ),
    ).resolves.toBeDefined();
    await expect(
      execFile(
        "git",
        ["--no-replace-objects", "merge-base", "--is-ancestor", first, second],
        { cwd: root, encoding: "utf8", env: floodgateGitEnvironment() },
      ),
    ).rejects.toMatchObject({ code: 1 });

    await fs.promises.rm(repositoryGrafts);
    const inheritedGrafts = path.join(root, "inherited-grafts");
    await fs.promises.writeFile(inheritedGrafts, graft);
    await expect(
      execFile(
        "git",
        ["--no-replace-objects", "merge-base", "--is-ancestor", first, second],
        {
          cwd: root,
          encoding: "utf8",
          env: { ...process.env, GIT_GRAFT_FILE: inheritedGrafts },
        },
      ),
    ).resolves.toBeDefined();
    await expect(
      execFile(
        "git",
        ["--no-replace-objects", "merge-base", "--is-ancestor", first, second],
        {
          cwd: root,
          encoding: "utf8",
          env: floodgateGitEnvironment({
            ...process.env,
            GIT_GRAFT_FILE: inheritedGrafts,
          }),
        },
      ),
    ).rejects.toMatchObject({ code: 1 });
  });

  it("disables a repository-local fsmonitor that hides tracked changes", async () => {
    const created = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "floodgate-git-fsmonitor-"),
    );
    const root = await fs.promises.realpath(created);
    roots.push(root);
    await git(root, ["init", "-q"]);
    await git(root, ["config", "user.name", "Floodgate Test"]);
    await git(root, ["config", "user.email", "floodgate@example.invalid"]);
    const trackedPath = path.join(root, "tracked.txt");
    await fs.promises.writeFile(trackedPath, "good\n");
    await git(root, ["add", "tracked.txt"]);
    await git(root, ["commit", "-q", "-m", "tracked"]);
    await expect(
      assertFloodgateGitTrackedTreeMatchesHead(root),
    ).resolves.toBeUndefined();

    const hookPath = path.join(root, ".git", "hooks", "fake-fsmonitor");
    await fs.promises.writeFile(
      hookPath,
      "#!/bin/sh\nprintf 'fake-token\\0'\n",
      { mode: 0o755 },
    );
    await git(root, ["config", "core.fsmonitor", hookPath]);
    await git(root, ["config", "core.fsmonitorHookVersion", "2"]);
    await git(root, ["status", "--porcelain=v1", "--untracked-files=all"]);
    const before = await fs.promises.stat(trackedPath);
    await fs.promises.writeFile(trackedPath, "evil\n");
    await fs.promises.utimes(trackedPath, before.atime, before.mtime);

    const { stdout: hardenedStatus } = await execFile(
      FLOODGATE_GIT_EXECUTABLE,
      [
        ...FLOODGATE_GIT_COMMAND_PREFIX,
        "status",
        "--porcelain=v1",
        "--untracked-files=all",
      ],
      {
        cwd: root,
        encoding: "utf8",
        env: floodgateGitEnvironment(),
      },
    );
    expect(hardenedStatus).toBe(" M tracked.txt\n");
    await expect(
      assertFloodgateGitTrackedTreeMatchesHead(root),
    ).rejects.toThrow(/tracked bytes differ from HEAD/);
  });
});

describe("exact clean Floodgate Git revision", () => {
  it("accepts only the exact clean canonical worktree revision", async () => {
    const { root, revision } = await createCommittedRepository();

    await expect(
      assertFloodgateGitExactCleanRevision(root, revision),
    ).resolves.toBeUndefined();
  });

  it("rejects malformed revisions and non-canonical repository roots", async () => {
    const { root, revision } = await createCommittedRepository();
    const nested = path.join(root, "nested");
    await fs.promises.mkdir(nested);
    const alias = `${root}-alias`;
    await fs.promises.symlink(root, alias);
    roots.push(alias);

    await expect(
      assertFloodgateGitExactCleanRevision(root, revision.slice(0, 12)),
    ).rejects.toThrow(/full lowercase object ID/);
    await expect(
      assertFloodgateGitExactCleanRevision(root, revision.toUpperCase()),
    ).rejects.toThrow(/full lowercase object ID/);
    await expect(
      assertFloodgateGitExactCleanRevision(
        path.relative(process.cwd(), root),
        revision,
      ),
    ).rejects.toThrow(/canonical absolute path/);
    await expect(
      assertFloodgateGitExactCleanRevision(nested, revision),
    ).rejects.toThrow(/exact worktree top-level/);
    await expect(
      assertFloodgateGitExactCleanRevision(alias, revision),
    ).rejects.toThrow(/real directory/);
  });

  it("rejects a different HEAD and every non-ignored untracked worktree entry", async () => {
    const { root, revision, trackedPath } = await createCommittedRepository();
    await fs.promises.writeFile(trackedPath, "second\n");
    await git(root, ["add", "tracked.txt"]);
    await git(root, ["commit", "-q", "-m", "second"]);

    await expect(
      assertFloodgateGitExactCleanRevision(root, revision),
    ).rejects.toThrow(/HEAD is not the expected exact revision/);

    const currentRevision = (await git(root, ["rev-parse", "HEAD"])).trim();
    await fs.promises.writeFile(path.join(root, "untracked.txt"), "hidden\n");
    await expect(
      assertFloodgateGitExactCleanRevision(root, currentRevision),
    ).rejects.toThrow(/including non-ignored untracked files/);
  });

  it("uses standard Git-clean ignore rules without claiming ignored-entry closure", async () => {
    const { root } = await createCommittedRepository();
    await fs.promises.writeFile(path.join(root, ".gitignore"), "ignored.txt\n");
    await git(root, ["add", ".gitignore"]);
    await git(root, ["commit", "-q", "-m", "ignore fixture"]);
    const revision = (await git(root, ["rev-parse", "HEAD"])).trim();
    await fs.promises.writeFile(path.join(root, "ignored.txt"), "ignored\n");

    await expect(
      assertFloodgateGitExactCleanRevision(root, revision),
    ).resolves.toBeUndefined();
  });

  it("rejects special index flags and tracked byte or mode tampering", async () => {
    const { root, revision, trackedPath } = await createCommittedRepository();
    await git(root, ["update-index", "--assume-unchanged", "tracked.txt"]);
    await expect(
      assertFloodgateGitExactCleanRevision(root, revision),
    ).rejects.toThrow(/special tracked flags/);

    await git(root, ["update-index", "--no-assume-unchanged", "tracked.txt"]);
    const before = await fs.promises.stat(trackedPath);
    await fs.promises.writeFile(trackedPath, "evil\n");
    await fs.promises.utimes(trackedPath, before.atime, before.mtime);
    await expect(
      assertFloodgateGitExactCleanRevision(root, revision),
    ).rejects.toThrow();

    await fs.promises.writeFile(trackedPath, "good\n");
    await fs.promises.chmod(trackedPath, 0o755);
    await expect(
      assertFloodgateGitExactCleanRevision(root, revision),
    ).rejects.toThrow();
  });

  it("fails closed when the worktree changes after verification starts", async () => {
    const { root, revision } = await createCommittedRepository();

    const verification = assertFloodgateGitExactCleanRevision(
      root,
      revision,
    ).then(
      () => null,
      (error: unknown) => error,
    );
    await fs.promises.writeFile(path.join(root, "raced.txt"), "race\n");

    expect(await verification).toBeInstanceOf(Error);
  });

  it("checks the HEAD blob size before allocating tracked file contents", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "ml", "floodgate-git.ts"),
      "utf8",
    );
    const sizeCheck = source.indexOf(
      "if (before.size !== BigInt(entry.bytes))",
    );
    const allocation = source.indexOf(
      "const bytes = new Uint8Array(expectedBytes)",
    );
    const boundedRead = source.indexOf(
      "readExactTrackedBytes(fd, entry.bytes, entry.path)",
      sizeCheck,
    );
    const extraByteCheck = source.indexOf(
      "fs.readSync(descriptor, extra, 0, 1, null)",
    );
    expect(sizeCheck).toBeGreaterThan(-1);
    expect(allocation).toBeGreaterThan(-1);
    expect(boundedRead).toBeGreaterThan(sizeCheck);
    expect(extraByteCheck).toBeGreaterThan(allocation);
    expect(source).not.toContain("fs.readFileSync(fd)");
  });
});
