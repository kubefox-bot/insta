import { defineConfig } from "@playwright/test";
import { readAcceptanceChromeOptions } from "../../scripts/testing/browser/config";

const chrome = readAcceptanceChromeOptions();
const launchOptions = { args: ["--proxy-bypass-list=<-loopback>"] };

export default defineConfig({
  outputDir: new URL(
    `../../.infra/priv01-browser/${crypto.randomUUID()}/`,
    import.meta.url,
  ).pathname,
  testDir: "..",
  testMatch: ["e2e/**/*.spec.ts", "abuse/conversations/browser-queue.spec.ts"],
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 30000,
  use: {
    launchOptions,
    ignoreHTTPSErrors: true,
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  projects: [
    {
      name: "chrome",
      use: {
        ...chrome,
        launchOptions: {
          ...launchOptions,
          ...("launchOptions" in chrome ? chrome.launchOptions : {}),
        },
      },
    },
    { name: "msedge", use: { channel: "msedge" } },
  ],
  reporter: "list",
});
