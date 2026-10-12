import { defineConfig } from "@playwright/test";
import { readAcceptanceChromeOptions } from "../../../../scripts/testing/browser/config";

const config = defineConfig({
  testDir: ".",
  testMatch: "components.spec.ts",
  workers: 1,
  retries: 0,
  timeout: 10000,
  outputDir: "../../../../.infra/ui/components",
  use: {
    baseURL: "http://127.0.0.1:4178",
    trace: "off",
    video: "off",
    screenshot: "off",
  },
  webServer: {
    cwd: new URL("../../../../", import.meta.url).pathname,
    command:
      "bun --bun apps/fe-insta/node_modules/vite/bin/vite.js --config packages/ui-kit/__tests__/fixtures/vite.config.ts --host 127.0.0.1 --port 4178 --strictPort",
    url: "http://127.0.0.1:4178",
    reuseExistingServer: false,
  },
  projects: [
    { name: "chrome", use: readAcceptanceChromeOptions() },
    { name: "edge", use: { channel: "msedge" } },
  ],
});

export { config as default };
