import {
  assertFloodgateStrengthFirstFreshLaneBenchmarkCliArguments,
  runFloodgateStrengthFirstFreshLaneBenchmark,
} from "./floodgate-strength-first-fresh-lane-benchmark";

assertFloodgateStrengthFirstFreshLaneBenchmarkCliArguments(
  process.argv.slice(2),
);

void runFloodgateStrengthFirstFreshLaneBenchmark()
  .then((receipt) => {
    process.stdout.write(`${JSON.stringify(receipt)}\n`);
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`fresh-lane benchmark failed: ${message}\n`);
    process.exitCode = 1;
  });
