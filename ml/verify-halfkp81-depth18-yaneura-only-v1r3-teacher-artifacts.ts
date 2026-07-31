#!/usr/bin/env npx tsx

async function main(): Promise<void> {
  if (process.argv.length !== 2) {
    throw new Error(
      "the formal Yaneura-only v1r3 artifact verifier accepts no arguments",
    );
  }
  throw new Error(
    "Yaneura-only v1r3 artifact publication is closed before artifact reads; use v1r4",
  );
}

main().catch((error: unknown) => {
  process.stderr.write(
    `[halfkp81-depth18-yaneura-only-v1r3-artifacts] STOP: ${
      error instanceof Error ? error.message : String(error)
    }\n`,
  );
  process.exitCode = 1;
});
