import * as fs from "node:fs";
import * as path from "node:path";

export const FLOODGATE_STRENGTH_FIRST_TRAINING_PYTHON_RELATIVE_PATH =
  ".codex/shogi-data/floodgate-training-venv/bin/python3" as const;

type TrainingPythonFileSystem = Readonly<{
  access: (pathname: string, mode: number) => Promise<void>;
  stat: (pathname: string) => Promise<Readonly<fs.Stats>>;
}>;

const PRODUCTION_FILE_SYSTEM: TrainingPythonFileSystem = Object.freeze({
  access: fs.promises.access,
  stat: fs.promises.stat,
});

export async function resolveFloodgateStrengthFirstTrainingPythonCoreForTests(
  homeDirectory: string,
  fileSystem: TrainingPythonFileSystem = PRODUCTION_FILE_SYSTEM,
): Promise<string> {
  if (!path.isAbsolute(homeDirectory)) {
    throw new Error("strength-first training Python requires an absolute home");
  }
  const executable = path.join(
    homeDirectory,
    FLOODGATE_STRENGTH_FIRST_TRAINING_PYTHON_RELATIVE_PATH,
  );
  try {
    const metadata = await fileSystem.stat(executable);
    if (!metadata.isFile()) {
      throw new Error("not a regular file");
    }
    await fileSystem.access(executable, fs.constants.X_OK);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `fixed strength-first training Python is absent or not executable: ${executable} (${detail})`,
      { cause: error },
    );
  }
  return executable;
}

export async function resolveFloodgateStrengthFirstTrainingPython(
  homeDirectory: string,
): Promise<string> {
  return resolveFloodgateStrengthFirstTrainingPythonCoreForTests(homeDirectory);
}
