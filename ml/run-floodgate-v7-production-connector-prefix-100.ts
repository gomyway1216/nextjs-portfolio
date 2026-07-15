/** Argumentless entry point for the fixed durable-prefix-100 gate. */

import { runFloodgateV7ProductionConnectorPrefix100Cli } from "./floodgate-v7-production-connector-cli";

if (require.main === module) {
  void runFloodgateV7ProductionConnectorPrefix100Cli();
}
