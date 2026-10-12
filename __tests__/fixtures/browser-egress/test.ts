import { test as base } from "@playwright/test";
import { readHostSettings } from "../../../scripts/infra/host/config";
import { egressPolicy } from "./conts";
import { captureEgressFailure } from "./diagnostics";
import { startBrowserEgress } from "./start";
import type { Egress } from "./types";

export type { Page } from "@playwright/test";
export { expect } from "@playwright/test";
export const test = base.extend<{ browserEgress: Egress }>({
  browserEgress: async ({ browserName, browser }, use, info) => {
    if (browserName !== "chromium")
      throw new Error(
        "Owned browser egress requires the configured Chrome/Edge engine",
      );
    const egress = await startBrowserEgress();
    try {
      console.log(
        JSON.stringify({
          testRunId: egress.runId,
          browser: info.project.name,
          browserVersion: browser.version(),
          actualSourceAddress: egress.address,
        }),
      );
      await use(egress);
    } finally {
      try {
        if (info.status !== info.expectedStatus)
          await captureEgressFailure({
            runId: egress.runId,
            path: info.outputPath("egress-state.json"),
          });
      } finally {
        await egress.dispose();
      }
    }
  },
  proxy: async ({ browserEgress }, use) => {
    await use({
      server: browserEgress.server,
      bypass: `${egressPolicy.bypass},localhost:${readHostSettings().httpPort}`,
    });
  },
});
