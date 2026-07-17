import { claimFloodgateV7ProductionRecoveryOperatorNativeLauncherAttestationCoreForDarwinIntegrationTests } from "../../../ml/floodgate-v7-production-recovery-operator-native-launcher-attestation";

const mode = process.env.FLOODGATE_V7_RECOVERY_LAUNCHER_TEST_CHILD_MODE;

claimFloodgateV7ProductionRecoveryOperatorNativeLauncherAttestationCoreForDarwinIntegrationTests();

if (mode === "reuse") {
  let replayRejected = false;
  try {
    claimFloodgateV7ProductionRecoveryOperatorNativeLauncherAttestationCoreForDarwinIntegrationTests();
  } catch {
    replayRejected = true;
  }
  process.stdout.write(
    `${JSON.stringify({
      attested: true,
      replay_rejected: replayRejected,
    })}\n`,
  );
  process.exit(replayRejected ? 0 : 1);
}

process.stdout.write(
  `${JSON.stringify({
    attested: true,
    node_options_present: process.env.NODE_OPTIONS !== undefined,
    production_launcher_environment_present:
      process.env.FLOODGATE_V7_NATIVE_LAUNCHER_PURPOSE !== undefined,
    exec_argv: process.execArgv,
  })}\n`,
);
