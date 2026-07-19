/**
 * Explicit package-command entry point. Importing this file does not execute
 * the runner; only direct invocation reaches the argumentless CLI.
 */

import { runFloodgateV7LocalCleanRoomTeacherCli } from "./floodgate-v7-local-clean-room-teacher-cli";

if (require.main === module) {
  void runFloodgateV7LocalCleanRoomTeacherCli();
}
