import { test as base } from "../../../../fixtures/browser-egress/test";
import { startNativeRecipient } from "./start";

export const test = base.extend<{
  nativeRecipient: Awaited<ReturnType<typeof startNativeRecipient>>;
}>({
  nativeRecipient: async ({ proxy }, use, info) => {
    if (!proxy) throw new Error("Owned browser proxy is required");
    const recipient = await startNativeRecipient({
      channel: info.project.name,
      proxy,
    });
    try {
      await use(recipient);
    } finally {
      await recipient.dispose();
    }
  },
});
