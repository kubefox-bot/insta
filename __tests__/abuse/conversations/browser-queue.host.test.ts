import { expect, test } from "bun:test";

test("CHAT-04 native Chrome/Edge browser queue abuse", async () => {
  const child = Bun.spawn(
    [
      process.execPath,
      "node_modules/@playwright/test/cli.js",
      "test",
      "__tests__/abuse/conversations/browser-queue.spec.ts",
      "--config",
      "__tests__/e2e/playwright.config.ts",
    ],
    { stdout: "inherit", stderr: "inherit" },
  );
  expect(await child.exited).toBe(0);
}, 240000);
