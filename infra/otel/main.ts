import { readReceiverConfig } from "./config";
import { createTelemetryReceiver } from "./receiver";

const server = Bun.serve({
  ...readReceiverConfig(),
  fetch: createTelemetryReceiver(),
});
/** При сигнале запрашивает принудительную остановку принадлежащего процессу HTTP receiver; rejection остановки обрабатывает краткой диагностикой без payload. */
const close = () => {
  server.stop(true).catch(() => {
    process.stderr.write("Telemetry receiver shutdown failed\n");
  });
};
process.once("SIGTERM", close);
process.once("SIGINT", close);
