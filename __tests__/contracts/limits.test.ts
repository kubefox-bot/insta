import { expect, test } from "bun:test";
import { messageInputSchema } from "@insta/contracts/messages";
import { storyWireLimits } from "@insta/contracts/stories";

test("message admission counts Unicode code points at4000, not UTF16 bytes", () => {
  expect(
    messageInputSchema.safeParse({ text: "😀".repeat(4000) }).success,
  ).toBe(true);
  expect(
    messageInputSchema.safeParse({ text: "😀".repeat(4001) }).success,
  ).toBe(false);
  expect(messageInputSchema.safeParse({ text: "" }).success).toBe(false);
});
test("shared deferred story wire limits expose precise bytes and duration", () => {
  expect(storyWireLimits.maxFileBytes).toBe(20971520);
  expect(storyWireLimits.maxEnvelopeBytes).toBe(1048576);
  expect(storyWireLimits.maxDurationMs).toBe(15000);
});
