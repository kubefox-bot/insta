import { defineConfig } from "@playwright/test";
import { readAcceptanceChromeOptions } from "../../../../../scripts/testing/browser/config";

const config = defineConfig({
  testDir: "..",
  testMatch: "message-marks.spec.ts",
  workers: 1,
  retries: 0,
  timeout: 30000,
  outputDir: "../../../../../.infra/marks/browser",
  projects: [
    { name: "chrome", use: readAcceptanceChromeOptions() },
    { name: "edge", use: { channel: "msedge" } },
  ],
  use: {
    baseURL: "http://127.0.0.1:4193",
    timezoneId: "Asia/Tbilisi",
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  webServer: {
    cwd: new URL("../../../../../", import.meta.url).pathname,
    command:
      "bun --bun apps/fe-insta/node_modules/vite/bin/vite.js --config apps/fe-insta/__tests__/browser/marks/fixtures/vite.config.ts --host 127.0.0.1 --port 4193 --strictPort",
    url: "http://127.0.0.1:4193",
    reuseExistingServer: false,
  },
});

export { config as default };
