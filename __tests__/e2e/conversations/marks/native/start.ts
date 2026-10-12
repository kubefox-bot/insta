import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, expect } from "@playwright/test";
import { readAcceptanceChromeOptions } from "../../../../../scripts/testing/browser/config";
import { nativePolicy } from "./conts";

// The standard Playwright context emulates focus. Use the native default context
// for this visibility contract, and keep every application request in the browser.
export const startNativeRecipient = async ({
  channel,
  proxy,
}: Readonly<{
  channel: string;
  proxy: Readonly<{ server: string; bypass?: string }>;
}>) => {
  if (channel !== "chrome" && channel !== "msedge")
    throw new Error("Native recipient requires the actual Chrome/Edge channel");
  const endpoint = new URL(proxy.server);
  if (endpoint.hostname !== "127.0.0.1" || !endpoint.port)
    throw new Error(
      "Native recipient requires the owned loopback CONNECT proxy",
    );
  const chrome = channel === "chrome" ? readAcceptanceChromeOptions() : null;
  const executable =
    chrome?.launchOptions?.executablePath ?? nativePolicy.executables[channel];
  const profile = await mkdtemp(join(tmpdir(), "marks-native-"));
  const process = Bun.spawn(
    [
      executable,
      `--user-data-dir=${profile}`,
      "--remote-debugging-port=0",
      "--no-first-run",
      "--no-default-browser-check",
      "--ignore-certificate-errors",
      "--lang=en-US",
      `--window-size=${nativePolicy.viewport}`,
      `--proxy-server=${proxy.server}`,
      `--proxy-bypass-list=${proxy.bypass ?? "<-loopback>"}`,
      "about:blank",
    ],
    { stdout: "ignore", stderr: "ignore" },
  );
  const disposeProcess = async () => {
    process.kill();
    await process.exited;
    await rm(profile, { recursive: true, force: true });
  };
  try {
    const devtools = join(profile, "DevToolsActivePort");
    await expect
      .poll(
        async () => {
          if (!(await Bun.file(devtools).exists())) return false;
          return /^\d+\n\/devtools\/browser\//.test(
            await readFile(devtools, "utf8"),
          );
        },
        {
          timeout: nativePolicy.readyTimeoutMs,
          intervals: [nativePolicy.readyIntervalMs],
        },
      )
      .toBe(true);
    const [port, path] = (await readFile(devtools, "utf8")).split("\n");
    const browser = await chromium.connectOverCDP(
      `ws://127.0.0.1:${port}${path}`,
      { noDefaults: true },
    );
    const context = browser.contexts()[0];
    if (!context) {
      await browser.close();
      throw new Error("Native browser has no default context");
    }
    return {
      context,
      version: browser.version(),
      dispose: async () => {
        try {
          await browser.close();
        } finally {
          await disposeProcess();
        }
      },
    };
  } catch (error) {
    await disposeProcess();
    throw error;
  }
};
