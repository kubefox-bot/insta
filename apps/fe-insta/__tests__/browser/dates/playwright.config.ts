import { defineConfig } from "@playwright/test";
import { readAcceptanceChromeOptions } from "../../../../../scripts/testing/browser/config";

const config = defineConfig({
  testDir: ".",
  testMatch: "lifecycle.spec.ts",
  workers: 1,
  retries: 0,
  timeout: 30000,
  outputDir: "../../../../../.infra/dates/browser",
  use: {
    baseURL: "http://127.0.0.1:4189",
    ...readAcceptanceChromeOptions(),
    timezoneId: "Asia/Tbilisi",
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  webServer: {
    cwd: new URL("../../../../../", import.meta.url).pathname,
    command:
      "TZ=UTC bun --bun apps/fe-insta/node_modules/vite/bin/vite.js --config apps/fe-insta/__tests__/browser/dates/fixtures/vite.config.ts --host 127.0.0.1 --port 4189 --strictPort",
    url: "http://127.0.0.1:4189",
    reuseExistingServer: false,
  },
});

export { config as default };
