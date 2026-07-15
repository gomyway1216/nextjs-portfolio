/** Argumentless entry point for the fixed durable-prefix-500 gate. */

import { runFloodgateV7ProductionConnectorPrefix500Cli } from "./floodgate-v7-production-connector-cli";

if (require.main === module) {
  void runFloodgateV7ProductionConnectorPrefix500Cli();
}
