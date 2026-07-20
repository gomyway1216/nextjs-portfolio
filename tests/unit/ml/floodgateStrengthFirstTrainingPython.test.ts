import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  FLOODGATE_STRENGTH_FIRST_TRAINING_PYTHON_RELATIVE_PATH,
  resolveFloodgateStrengthFirstTrainingPythonCoreForTests,
} from "../../../ml/floodgate-strength-first-training-python";

const temporaryHomes: string[] = [];

async function temporaryHome(): Promise<string> {
  const home = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "strength-first-training-python-"),
  );
  temporaryHomes.push(home);
  return home;
}

afterEach(async () => {
  await Promise.all(
    temporaryHomes.splice(0).map((home) =>
      fs.promises.rm(home, { force: true, recursive: true }),
    ),
  );
});

describe("fixed strength-first training Python", () => {
  it("returns only the executable in the fixed private training venv", async () => {
    const home = await temporaryHome();
    const executable = path.join(
      home,
      FLOODGATE_STRENGTH_FIRST_TRAINING_PYTHON_RELATIVE_PATH,
    );
    await fs.promises.mkdir(path.dirname(executable), {
      mode: 0o700,
      recursive: true,
    });
    await fs.promises.writeFile(executable, "#!/bin/sh\n", { mode: 0o700 });

    await expect(
      resolveFloodgateStrengthFirstTrainingPythonCoreForTests(home),
    ).resolves.toBe(executable);
  });

  it("fails closed when the fixed interpreter is absent without a PATH fallback", async () => {
    const home = await temporaryHome();
    const repositoryPython = path.join(home, "repository", ".venv", "bin", "python3");
    await fs.promises.mkdir(path.dirname(repositoryPython), {
      mode: 0o700,
      recursive: true,
    });
    await fs.promises.writeFile(repositoryPython, "#!/bin/sh\n", { mode: 0o700 });

    await expect(
      resolveFloodgateStrengthFirstTrainingPythonCoreForTests(home),
    ).rejects.toThrow(/fixed strength-first training Python is absent/);
  });

  it("fails closed when the fixed interpreter is not executable", async () => {
    const home = await temporaryHome();
    const executable = path.join(
      home,
      FLOODGATE_STRENGTH_FIRST_TRAINING_PYTHON_RELATIVE_PATH,
    );
    await fs.promises.mkdir(path.dirname(executable), {
      mode: 0o700,
      recursive: true,
    });
    await fs.promises.writeFile(executable, "#!/bin/sh\n", { mode: 0o600 });

    await expect(
      resolveFloodgateStrengthFirstTrainingPythonCoreForTests(home),
    ).rejects.toThrow(/not executable/);
  });

  it("rejects a relative home instead of resolving against the process cwd", async () => {
    await expect(
      resolveFloodgateStrengthFirstTrainingPythonCoreForTests("."),
    ).rejects.toThrow(/absolute home/);
  });
});
