import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  bootoutHalfkp81Depth18OneShotLaunchAgent,
  buildHalfkp81Depth18OneShotLaunchAgentPlist,
  getHalfkp81Depth18OneShotLaunchAgentStatus,
  Halfkp81Depth18LaunchAgentError,
  type Halfkp81Depth18LaunchAgentDependencies,
  type Halfkp81Depth18OneShotLaunchAgentSpec,
  launchHalfkp81Depth18OneShotLaunchAgent,
  type LaunchctlResult,
} from "../../../ml/halfkp81-depth18-one-shot-launch-agent";

const roots: string[] = [];
const uid =
  typeof process.getuid === "function" && process.getuid() > 0
    ? process.getuid()
    : 501;

function result(status: number, stdout = "", stderr = ""): LaunchctlResult {
  return { signal: null, status, stderr, stdout };
}

function absentResult(): LaunchctlResult {
  return result(
    113,
    "",
    `Bad request.\nCould not find service "example" in domain for user gui/${uid}\n`,
  );
}

function queuedLaunchctl(responses: readonly LaunchctlResult[]): {
  readonly calls: string[][];
  readonly dependencies: Halfkp81Depth18LaunchAgentDependencies;
} {
  const calls: string[][] = [];
  let index = 0;
  return {
    calls,
    dependencies: {
      runLaunchctl(arguments_) {
        calls.push([...arguments_]);
        const response = responses[index];
        index += 1;
        if (response === undefined) {
          throw new Error("unexpected launchctl call");
        }
        return response;
      },
    },
  };
}

function fixture(): {
  readonly root: string;
  readonly spec: Halfkp81Depth18OneShotLaunchAgentSpec;
} {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "halfkp81-launch-agent-")),
  );
  roots.push(root);
  fs.chmodSync(root, 0o700);
  const entrypointPath = path.join(root, "formal-runner.cjs");
  const preloadPath = path.join(root, "tsx-preload.cjs");
  fs.writeFileSync(entrypointPath, "process.exitCode = 0;\n", {
    mode: 0o600,
  });
  fs.writeFileSync(preloadPath, "module.exports = {};\n", { mode: 0o600 });
  const formalOutputNamespace = path.join(root, "formal-output-v3");
  fs.mkdirSync(formalOutputNamespace, { mode: 0o700 });
  const teacherPlanPath = path.join(formalOutputNamespace, "teacher-plan.json");
  const teacherPlanRaw = Buffer.from('{"schema":"teacher-plan-v3"}\n');
  fs.writeFileSync(teacherPlanPath, teacherPlanRaw, { mode: 0o600 });
  return {
    root,
    spec: {
      entrypointPath,
      formalOutputNamespace,
      label: "com.meetyudai.shogi.halfkp81-depth18-v3-test",
      nodePath: fs.realpathSync(process.execPath),
      nodePreloadPath: preloadPath,
      privateStateDirectory: path.join(root, "private-launch-agent"),
      teacherPlanBytes: teacherPlanRaw.length,
      teacherPlanPath,
      teacherPlanSha256: createHash("sha256")
        .update(teacherPlanRaw)
        .digest("hex"),
      uid,
      workingDirectory: root,
    },
  };
}

afterEach(() => {
  while (roots.length > 0) {
    fs.rmSync(roots.pop()!, { force: true, recursive: true });
  }
});

describe("HalfKP81 depth18 one-shot LaunchAgent", () => {
  it("builds the exact direct caffeinate one-shot policy without a shell", () => {
    const plist = buildHalfkp81Depth18OneShotLaunchAgentPlist({
      entrypointPath: "/absolute/formal-runner.cjs",
      label: "com.meetyudai.shogi.v3",
      nodePath: "/absolute/node",
      nodePreloadPath: "/absolute/tsx-preload.cjs",
      stderrPath: "/private/launch/stderr.log",
      stdoutPath: "/private/launch/stdout.log",
      workingDirectory: "/absolute/repository",
    });

    expect(plist).toContain("<key>RunAtLoad</key>\n  <true/>");
    expect(plist).toContain("<key>KeepAlive</key>\n  <false/>");
    expect(plist).toContain("<key>LaunchOnlyOnce</key>\n  <true/>");
    expect(plist).toContain("<key>Umask</key>\n  <integer>63</integer>");
    expect(plist).toContain("<key>AbandonProcessGroup</key>\n  <false/>");
    expect(plist).toContain(
      [
        "    <string>/usr/bin/caffeinate</string>",
        "    <string>-dimsu</string>",
        "    <string>/absolute/node</string>",
        "    <string>-r</string>",
        "    <string>/absolute/tsx-preload.cjs</string>",
        "    <string>/absolute/formal-runner.cjs</string>",
      ].join("\n"),
    );
    expect(plist).toContain(
      "<key>WorkingDirectory</key>\n    <string>/absolute/repository</string>",
    );
    expect(plist).toContain(
      "<key>StandardOutPath</key>\n    <string>/private/launch/stdout.log</string>",
    );
    expect(plist).toContain(
      "<key>StandardErrorPath</key>\n    <string>/private/launch/stderr.log</string>",
    );
    expect(plist).not.toMatch(/(?:sh|bash|zsh|Shell|Program)\s*=/u);
  });

  it("preflights absence, writes a private 0600 plist, and bootstraps gui/UID", () => {
    const { root, spec } = fixture();
    const launchctl = queuedLaunchctl([
      absentResult(),
      result(0),
      result(0, "loaded service"),
    ]);

    const receipt = launchHalfkp81Depth18OneShotLaunchAgent(
      spec,
      launchctl.dependencies,
    );

    expect(launchctl.calls).toEqual([
      ["print", `gui/${uid}/${spec.label}`],
      ["bootstrap", `gui/${uid}`, receipt.plistPath],
      ["print", `gui/${uid}/${spec.label}`],
    ]);
    expect(receipt.status.loaded).toBe(true);
    expect(receipt.plistPath.startsWith(spec.privateStateDirectory)).toBe(true);
    expect(receipt.plistPath.startsWith(spec.formalOutputNamespace)).toBe(
      false,
    );
    expect(fs.readdirSync(spec.formalOutputNamespace)).toEqual([
      "teacher-plan.json",
    ]);
    expect(fs.statSync(spec.privateStateDirectory).mode & 0o777).toBe(0o700);
    expect(fs.statSync(receipt.plistPath).mode & 0o777).toBe(0o600);
    const plist = fs.readFileSync(receipt.plistPath, "utf8");
    expect(plist).toContain(
      `<string>${path.join(root, "formal-runner.cjs")}</string>`,
    );
    expect(plist).toContain(`<string>${receipt.stdoutPath}</string>`);
    expect(plist).toContain(`<string>${receipt.stderrPath}</string>`);
  });

  it("fails before launchctl when a mutable output artifact already exists", () => {
    const { spec } = fixture();
    fs.writeFileSync(
      path.join(spec.formalOutputNamespace, "teacher-work.jsonl"),
      "",
      { mode: 0o600 },
    );
    const calls: string[][] = [];
    const dependencies: Halfkp81Depth18LaunchAgentDependencies = {
      runLaunchctl(arguments_) {
        calls.push([...arguments_]);
        return absentResult();
      },
    };

    expect(() =>
      launchHalfkp81Depth18OneShotLaunchAgent(spec, dependencies),
    ).toThrowError(Halfkp81Depth18LaunchAgentError);
    expect(calls).toEqual([]);
    expect(fs.existsSync(spec.privateStateDirectory)).toBe(false);
  });

  it("fails before launchctl when the published plan identity drifts", () => {
    const { spec } = fixture();
    fs.appendFileSync(spec.teacherPlanPath, "drift\n");
    const launchctl = queuedLaunchctl([absentResult()]);

    expect(() =>
      launchHalfkp81Depth18OneShotLaunchAgent(spec, launchctl.dependencies),
    ).toThrow(/bytes\/SHA-256/u);
    expect(launchctl.calls).toEqual([]);
    expect(fs.existsSync(spec.privateStateDirectory)).toBe(false);
  });

  it("refuses an existing label without writing a plist or bootstrapping", () => {
    const { spec } = fixture();
    const launchctl = queuedLaunchctl([result(0, "already loaded")]);

    expect(() =>
      launchHalfkp81Depth18OneShotLaunchAgent(spec, launchctl.dependencies),
    ).toThrow(/existing launchd service/u);
    expect(launchctl.calls).toEqual([["print", `gui/${uid}/${spec.label}`]]);
    expect(
      fs.existsSync(
        path.join(
          spec.privateStateDirectory,
          `${spec.label}.launch-agent.plist`,
        ),
      ),
    ).toBe(false);
  });

  it("status and bootout recognize only the exact absent result", () => {
    const label = "com.meetyudai.shogi.halfkp81-depth18-v3-test";
    const launchctl = queuedLaunchctl([
      result(0, "loaded"),
      result(0, "loaded"),
      result(0),
      absentResult(),
    ]);

    expect(
      getHalfkp81Depth18OneShotLaunchAgentStatus(
        label,
        uid,
        launchctl.dependencies,
      ).loaded,
    ).toBe(true);
    expect(
      bootoutHalfkp81Depth18OneShotLaunchAgent(
        label,
        uid,
        launchctl.dependencies,
      ).loaded,
    ).toBe(false);
    expect(launchctl.calls).toEqual([
      ["print", `gui/${uid}/${label}`],
      ["print", `gui/${uid}/${label}`],
      ["bootout", `gui/${uid}/${label}`],
      ["print", `gui/${uid}/${label}`],
    ]);

    const ambiguous = queuedLaunchctl([result(1, "", "permission denied")]);
    expect(() =>
      getHalfkp81Depth18OneShotLaunchAgentStatus(
        label,
        uid,
        ambiguous.dependencies,
      ),
    ).toThrow(/unrecognized failure/u);
  });

  it("rejects overlapping private and formal output trees", () => {
    const { root, spec } = fixture();
    const overlapping = {
      ...spec,
      formalOutputNamespace: path.join(root, "private", "formal"),
      privateStateDirectory: path.join(root, "private"),
    };
    const launchctl = queuedLaunchctl([absentResult()]);

    expect(() =>
      launchHalfkp81Depth18OneShotLaunchAgent(
        overlapping,
        launchctl.dependencies,
      ),
    ).toThrow(/disjoint trees/u);
    expect(launchctl.calls).toEqual([]);
  });
});
