/** Zero-argument CLI for fixed, read-only fresh-selection semantic validation. */

import { canonicalFreshTeacherJson } from "./floodgate-fresh-teacher-artifact-validation";
import {
  validateFreshSelectionSemanticArtifacts,
  type FreshSelectionSemanticValidationReceipt,
} from "./floodgate-fresh-selection-semantic-validation";

export interface FreshSelectionSemanticValidationCliDependencies {
  readonly validate: () => Promise<
    Readonly<FreshSelectionSemanticValidationReceipt>
  >;
  readonly writeStdout: (text: string) => void;
}

export async function validateFreshSelectionTeacherCliCore(
  arguments_: readonly string[],
  dependencies: Readonly<FreshSelectionSemanticValidationCliDependencies>,
): Promise<Readonly<FreshSelectionSemanticValidationReceipt>> {
  if (arguments_.length !== 0) {
    throw new Error(
      "fresh-selection semantic validation accepts no arguments or path overrides",
    );
  }
  const receipt = await dependencies.validate();
  dependencies.writeStdout(`${canonicalFreshTeacherJson(receipt)}\n`);
  return receipt;
}

export function validateFreshSelectionTeacherCli(): Promise<
  Readonly<FreshSelectionSemanticValidationReceipt>
> {
  return validateFreshSelectionTeacherCliCore(process.argv.slice(2), {
    validate: validateFreshSelectionSemanticArtifacts,
    writeStdout: (text) => process.stdout.write(text),
  });
}

if (require.main === module) {
  void validateFreshSelectionTeacherCli().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(
      `fresh-selection semantic validation failed: ${message}\n`,
    );
    process.exitCode = 1;
  });
}
