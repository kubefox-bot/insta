import { test as base } from "../../../fixtures/browser-egress/test";
import { startChatFixture } from "../../../fixtures/chat05/browser";
import { withResource } from "../../../fixtures/lifecycle/with-resource";
import type { UiFixtures } from "./types";

export { expect } from "../../../fixtures/browser-egress/test";
export const test = base.extend<UiFixtures>({
  chatFixture: async ({ browserEgress: _browserEgress }, use) => {
    await withResource({ start: startChatFixture, use });
  },
  secondaryContextOptions: [{ locale: "en-US" }, { option: true }],
  secondaryContext: async (
    { browser, proxy, chatFixture: _chatFixture, secondaryContextOptions },
    use,
  ) => {
    // Explicit dependency keeps this context's teardown before synthetic resources.
    await withResource({
      start: async () => {
        const context = await browser.newContext({
          proxy,
          ignoreHTTPSErrors: true,
          ...secondaryContextOptions,
        });
        return { context, dispose: () => context.close() };
      },
      use: ({ context }) => use(context),
    });
  },
});
