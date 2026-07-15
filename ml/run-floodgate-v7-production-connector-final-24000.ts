/** Argumentless entry point for the fixed sealed-final-24000 gate. */

import { runFloodgateV7ProductionConnectorFinal24000Cli } from "./floodgate-v7-production-connector-cli";

if (require.main === module) {
  void runFloodgateV7ProductionConnectorFinal24000Cli();
}
