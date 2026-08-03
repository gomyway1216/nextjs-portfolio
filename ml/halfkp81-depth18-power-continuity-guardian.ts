#!/usr/bin/env -S npx tsx

import {
  HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_POWER_GUARDIAN_IPC_SCHEMA,
  runHalfkp81Depth18V1R11PowerContinuityGuardianProcess,
  type Halfkp81Depth18PowerContinuityGuardianConfig,
} from "./halfkp81-depth18-teacher-runner";

async function main(): Promise<void> {
  if (process.argv.length !== 2 || process.send === undefined) {
    throw new Error("v1r11 power guardian requires a private IPC parent");
  }
  const encoded = process.env.HALFKP81_DEPTH18_POWER_GUARDIAN_CONFIG;
  if (encoded === undefined) {
    throw new Error("v1r11 power guardian configuration is missing");
  }
  delete process.env.HALFKP81_DEPTH18_POWER_GUARDIAN_CONFIG;
  const config = JSON.parse(
    Buffer.from(encoded, "base64").toString("utf8"),
  ) as Halfkp81Depth18PowerContinuityGuardianConfig;
  await runHalfkp81Depth18V1R11PowerContinuityGuardianProcess(config);
}

main().catch((error: unknown) => {
  process.send?.({
    schema: HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_POWER_GUARDIAN_IPC_SCHEMA,
    type: "fatal",
    reason: error instanceof Error ? error.message : String(error),
  });
  process.stderr.write(
    `[halfkp81-depth18-v1r11-power-guardian] STOP: ${
      error instanceof Error ? error.message : String(error)
    }\n`,
  );
  process.exitCode = 1;
});
