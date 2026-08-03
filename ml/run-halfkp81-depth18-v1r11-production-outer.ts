#!/usr/bin/env -S npx tsx

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import {
  parseV1R11CanonicalObject,
  pinV1R11AuthorityDirectory,
  readV1R11HeldFile,
  v1r11Sha256,
} from "./halfkp81-depth18-v1r11-authority-io";
import {
  HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R11,
  HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_DEFAULT_PLAN_PATH,
  authenticateHalfkp81Depth18TeacherPlan,
} from "./halfkp81-depth18-teacher-runner";
import { buildHalfkp81V1R11ExactPowerGuardianCommand } from "./halfkp81-depth18-v1r11-stage-b-launchagent-supervisor";
import { buildHalfkp81V1R11RecursiveProducerIdentity } from "./halfkp81-depth18-v1r11-producer-closure";
import { validateHalfkp81V1R11StageCLaunchEvidenceForTests } from "./halfkp81-depth18-v1r11-stage-c-live-evidence";
import {
  assertHalfkp81V1R11OuterProductionReadyForTests,
  recomputeHalfkp81V1R11FormalRunForRuntimePlan,
  runHalfkp81V1R11ProductionPreformalOrchestrator,
} from "./run-halfkp81-depth18-v1r11-preformal-orchestrator";
import { runHalfkp81V1R11ProductionPostFormalSupervisor } from "./run-halfkp81-depth18-v1r11-postformal-supervisor";

const AUTHORITY_DIRECTORY =
  "/Users/yudaiyaguchi/.codex/shogi-runs/halfkp81-hard-depth18-yaneura-only-v1r11-authority";
const LAUNCH_SCHEMA =
  "shogi-halfkp81-depth18-yaneura-only-launchagent-authority-evidence-v1r11";
const ENGINE_PATH =
  "/Users/yudaiyaguchi/.codex/shogi-data/floodgate-teacher-assets-v1/bin/yaneuraou";
const PRODUCTION_OUTER_ENTRYPOINT =
  "ml/run-halfkp81-depth18-v1r11-production-outer.ts" as const;

export function validateHalfkp81V1R11ProductionOuterPlanContractForTests(
  plan: unknown,
): void {
  if (plan === null || typeof plan !== "object" || Array.isArray(plan)) {
    throw new Error("v1r11 production outer plan contract differs");
  }
  const preformal = (plan as Readonly<Record<string, unknown>>)
    .preformal_authority;
  if (
    preformal === null ||
    typeof preformal !== "object" ||
    Array.isArray(preformal)
  ) {
    throw new Error("v1r11 production outer plan contract differs");
  }
  const contract = (preformal as Readonly<Record<string, unknown>>)
    .outer_orchestrator_contract;
  if (contract === null || typeof contract !== "object" || Array.isArray(contract)) {
    throw new Error("v1r11 production outer plan contract differs");
  }
  const value = contract as Readonly<Record<string, unknown>>;
  if (
    value.entrypoint_exact !== PRODUCTION_OUTER_ENTRYPOINT ||
    value.preformal_component_entrypoint_exact !==
      "ml/run-halfkp81-depth18-v1r11-preformal-orchestrator.ts" ||
    value.formal_child_entrypoint_exact !==
      "ml/run-halfkp81-depth18-v1r11-formal-child.ts" ||
    value.postformal_component_entrypoint_exact !==
      "ml/run-halfkp81-depth18-v1r11-postformal-supervisor.ts" ||
    typeof value.ownership_interval !== "string" ||
    !value.ownership_interval.includes("runner-terminal-observation")
  ) {
    throw new Error("v1r11 production outer plan contract differs");
  }
}

export function parseHalfkp81V1R11ProductionOuterArgumentsForTests(
  argv: readonly string[],
): Readonly<{ prNumber: number }> {
  if (
    argv.length !== 2 ||
    argv[0] !== "--pr-number" ||
    !/^[1-9]\d*$/u.test(argv[1] ?? "")
  ) {
    throw new Error("v1r11 production outer requires exactly --pr-number N");
  }
  const prNumber = Number(argv[1]);
  if (!Number.isSafeInteger(prNumber)) {
    throw new Error("v1r11 production outer PR number differs");
  }
  return Object.freeze({ prNumber });
}

/** The only public production owner from preregistered plan to post-formal. */
export async function runHalfkp81V1R11ProductionOuter(
  request: Readonly<{ prNumber: number }>,
) {
  // This is deliberately first. A locked outer cannot read a plan, create a
  // namespace, bootstrap launchd, observe a process, or publish a fault.
  assertHalfkp81V1R11OuterProductionReadyForTests();
  if (
    Object.keys(request).length !== 1 ||
    !Object.prototype.hasOwnProperty.call(request, "prNumber") ||
    !Number.isSafeInteger(request.prNumber) ||
    request.prNumber < 1
  ) {
    throw new Error("v1r11 production outer request differs");
  }
  const repositoryRoot = fs.realpathSync.native(path.resolve(__dirname, ".."));
  const authenticated = await authenticateHalfkp81Depth18TeacherPlan(
    HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_DEFAULT_PLAN_PATH,
  );
  if (
    authenticated.planIdentity.schema !==
      HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R11
  ) {
    throw new Error("v1r11 production outer plan differs");
  }
  validateHalfkp81V1R11ProductionOuterPlanContractForTests(
    authenticated.plan,
  );
  const outerProducer = buildHalfkp81V1R11RecursiveProducerIdentity(
    repositoryRoot,
    authenticated.sourceRevision,
    PRODUCTION_OUTER_ENTRYPOINT,
  );
  if (
    outerProducer.entrypoint !== PRODUCTION_OUTER_ENTRYPOINT ||
    outerProducer.dependency_closure.length < 2
  ) {
    throw new Error("v1r11 production outer source authority differs");
  }
  const preformal = await runHalfkp81V1R11ProductionPreformalOrchestrator({
    repositoryRoot,
    teacherPlan: authenticated.planIdentity,
    prNumber: request.prNumber,
  });
  if (preformal.status !== "verified-formal-admission-handoff") {
    return Object.freeze({ status: preformal.status, preformal });
  }
  const authorityDirectory = await pinV1R11AuthorityDirectory(
    AUTHORITY_DIRECTORY,
  );
  const launchPath = path.join(
    AUTHORITY_DIRECTORY,
    "launchagent-authority-evidence.json",
  );
  const launchRaw = await readV1R11HeldFile(
    launchPath,
    "production outer retained LaunchAgent evidence",
  );
  const launchAgentAuthority = Object.freeze({
    path: launchPath,
    bytes: launchRaw.byteLength,
    sha256: v1r11Sha256(launchRaw),
    schema: LAUNCH_SCHEMA,
  });
  const launchValue = parseV1R11CanonicalObject(
    launchRaw,
    "production outer retained LaunchAgent evidence",
  );
  const planned = launchValue.plist_snapshot;
  if (planned === null || typeof planned !== "object" || Array.isArray(planned)) {
    throw new Error("production outer retained planned descriptor differs");
  }
  const formalRun = await recomputeHalfkp81V1R11FormalRunForRuntimePlan(
    repositoryRoot,
    authenticated.planIdentity,
    authenticated.sourceRevision,
    planned as never,
  );
  const homeDirectory = fs.realpathSync.native(os.homedir());
  const uid = process.geteuid?.();
  if (!Number.isSafeInteger(uid) || Number(uid) < 1) {
    throw new Error("production outer euid differs");
  }
  const parsedLaunch = validateHalfkp81V1R11StageCLaunchEvidenceForTests(
    launchValue,
    {
      repositoryRoot,
      authorityDirectory: AUTHORITY_DIRECTORY,
      homeDirectory,
      expectedUid: Number(uid),
      sourceRevision: authenticated.sourceRevision,
      runFingerprint: formalRun.fingerprint,
      formalRunIntent: formalRun.input,
      teacherPlan: authenticated.planIdentity,
      expectedNodePath: fs.realpathSync.native(process.execPath),
    },
  );
  const formalDirectory = await pinV1R11AuthorityDirectory(
    path.dirname(authenticated.planIdentity.path),
  );
  const nodePath = fs.realpathSync.native(process.execPath);
  const postformal = await runHalfkp81V1R11ProductionPostFormalSupervisor({
    repositoryRoot,
    formalDirectory,
    teacherPlan: authenticated.planIdentity,
    sourceRevision: authenticated.sourceRevision,
    runFingerprint: formalRun.fingerprint,
    formalRunIntent: formalRun.input,
    launchAgentAuthority,
    preformalAuthority: preformal.verifiedReceipt,
    launchagent: Object.freeze({
      label: parsedLaunch.label,
      plistSnapshot: parsedLaunch.plistSnapshot,
    }),
    runnerIdentity: Object.freeze({
      pid: parsedLaunch.runnerProcess.pid,
      pgid: parsedLaunch.runnerProcess.pgid,
      lstart: parsedLaunch.runnerProcess.lstart,
    }),
    fixedRoles: Object.freeze({
      powerGuardian: Object.freeze({
        executable: nodePath,
        argv: buildHalfkp81V1R11ExactPowerGuardianCommand(
          nodePath,
          repositoryRoot,
        ),
      }),
      stageBSupervisor: Object.freeze({
        executable: nodePath,
        argv: [
          nodePath,
          "-r",
          path.join(repositoryRoot, "node_modules/tsx/dist/cjs/index.cjs"),
          path.join(
            repositoryRoot,
            "ml/halfkp81-depth18-v1r11-stage-b-launchagent-supervisor.ts",
          ),
        ].join(" "),
      }),
      yaneuraouEngine: Object.freeze({
        executable: ENGINE_PATH,
        argv: ENGINE_PATH,
      }),
    }),
  });
  return Object.freeze({
    status: "post-formal-terminal-supervision-complete" as const,
    preformal,
    postformal,
  });
}

async function main(): Promise<void> {
  const request = parseHalfkp81V1R11ProductionOuterArgumentsForTests(
    process.argv.slice(2),
  );
  const result = await runHalfkp81V1R11ProductionOuter(request);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (require.main === module) {
  main().catch((error: unknown) => {
    process.stderr.write(
      `[halfkp81-v1r11-production-outer] STOP: ${
        error instanceof Error ? error.message : String(error)
      }\n`,
    );
    process.exitCode = 1;
  });
}
