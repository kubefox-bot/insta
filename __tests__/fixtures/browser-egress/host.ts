import { egressPolicy } from "./conts";
import { startEgressServer } from "./server";

const server = await startEgressServer();
process.stdout.write(`${egressPolicy.readyMarker}\n`);
process.once("SIGTERM", () => {
  server.stop().then(
    () => process.exit(0),
    () => process.exit(1),
  );
});
