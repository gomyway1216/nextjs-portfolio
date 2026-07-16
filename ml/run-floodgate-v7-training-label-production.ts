/** Argumentless entry point for fixed production training-label finalization. */

import { runFloodgateV7TrainingLabelProductionCli } from "./floodgate-v7-training-label-production-cli";

if (require.main === module) {
  void runFloodgateV7TrainingLabelProductionCli();
}
