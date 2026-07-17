import { claimFloodgateV7ProductionNativeLauncherAttestationCoreForTests } from "../../../ml/floodgate-v7-production-native-launcher-attestation";

const mode = process.env.FLOODGATE_V7_LAUNCHER_TEST_CHILD_MODE;

claimFloodgateV7ProductionNativeLauncherAttestationCoreForTests();

if (mode === "reuse") {
  let rejected = false;
  try {
    claimFloodgateV7ProductionNativeLauncherAttestationCoreForTests();
  } catch {
    rejected = true;
  }
  process.stdout.write(
    `${JSON.stringify({ attested: true, reuse_rejected: rejected })}\n`,
  );
  process.exit(rejected ? 0 : 1);
}

process.stdout.write(
  `${JSON.stringify({
    attested: true,
    node_options_present: process.env.NODE_OPTIONS !== undefined,
    untrusted_sentinel_present:
      process.env.FLOODGATE_V7_UNTRUSTED_SENTINEL !== undefined,
    exec_argv: process.execArgv,
  })}\n`,
);
