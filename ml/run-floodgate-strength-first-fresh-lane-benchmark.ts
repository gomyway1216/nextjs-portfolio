import {
  assertFloodgateStrengthFirstFreshLaneBenchmarkCliArguments,
  formatFloodgateStrengthFirstFreshLaneBenchmarkErrorForTests,
  runFloodgateStrengthFirstFreshLaneBenchmark,
} from "./floodgate-strength-first-fresh-lane-benchmark";

async function main(): Promise<void> {
  try {
    assertFloodgateStrengthFirstFreshLaneBenchmarkCliArguments(
      process.argv.slice(2),
    );
    const receipt =
      await runFloodgateStrengthFirstFreshLaneBenchmark();
    process.stdout.write(`${JSON.stringify(receipt)}\n`);
  } catch (error: unknown) {
    process.stderr.write(
      `${formatFloodgateStrengthFirstFreshLaneBenchmarkErrorForTests(error)}\n`,
    );
    process.exitCode = 1;
  }
}

void main();
