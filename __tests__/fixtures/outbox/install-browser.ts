import type { Page } from "@playwright/test";
export const installOutboxProbe = async (page: Page) => {
  const build = await Bun.build({
    entrypoints: ["__tests__/fixtures/outbox/browser.ts"],
    target: "browser",
    format: "iife",
  });
  if (!build.success || !build.outputs[0])
    throw new Error("Outbox probe build failed");
  await page.evaluate(
    (content) => {
      const nonce = [...document.scripts].find((script) => script.nonce)?.nonce;
      if (!nonce) throw new Error("CSP nonce missing");
      const script = document.createElement("script");
      script.nonce = nonce;
      script.textContent = content;
      document.head.append(script);
    },
    await build.outputs[0].text(),
  );
};
