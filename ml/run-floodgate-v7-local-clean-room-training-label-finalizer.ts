/**
 * Explicit argumentless Mac-local finalizer command.
 * Importing this file does not execute the finalizer.
 */

import { runFloodgateV7LocalCleanRoomTrainingLabelFinalizerCli } from "./floodgate-v7-local-clean-room-training-label-finalizer";

if (require.main === module) {
  void runFloodgateV7LocalCleanRoomTrainingLabelFinalizerCli();
}
