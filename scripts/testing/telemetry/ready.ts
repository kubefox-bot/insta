import { readHostSettings } from "../../infra/host/config";
import { waitUntil } from "../../infra/readiness";
import { readinessRequestDeadlineMs, telemetrySetupDeadlineMs } from "../conts";

const certificate = await Bun.file("infra/certs/localhost.crt").text();
await waitUntil({
  timeoutMs: telemetrySetupDeadlineMs,
  check: async () => {
    try {
      const response = await fetch(
        `https://localhost:${readHostSettings().httpsPort}/api/health/ready`,
        {
          tls: { ca: certificate },
          signal: AbortSignal.timeout(readinessRequestDeadlineMs),
        },
      );
      await response.body?.cancel();
      return response.ok;
    } catch {
      return false;
    }
  },
});
