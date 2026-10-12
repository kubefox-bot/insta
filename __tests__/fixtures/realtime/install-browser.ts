import type { Page } from "@playwright/test";

export const installRealtimeProbe = async (
  page: Page,
  options: Readonly<{ entrypoint: string }> = {
    entrypoint: "__tests__/fixtures/realtime/browser.ts",
  },
) => {
  const build = await Bun.build({
    entrypoints: [options.entrypoint],
    target: "browser",
    format: "iife",
    minify: false,
  });
  if (!build.success || !build.outputs[0])
    throw new Error("Browser realtime probe bundle failed");
  await page.evaluate(
    (content) => {
      const nonce = [...document.scripts].find((script) => script.nonce)?.nonce;
      if (!nonce)
        throw new Error("Page CSP nonce missing for owned test probe");
      const probe = document.createElement("script");
      probe.nonce = nonce;
      probe.textContent = content;
      document.head.append(probe);
    },
    await build.outputs[0].text(),
  );
};
