import { expect, test } from "bun:test";
import { readSourceBudget } from "../../fixtures/browser-egress/observe";

test("observer selects the native limit key; missing budget differs from failed or malformed read", async () => {
  const config = {
    authSigningKey: "a".repeat(64),
    authLimitsKey: "b".repeat(64),
  };
  const input = { address: "172.18.255.250", config, generation: "synthetic" };
  const nativeKey =
    "auth:synthetic:users:limit:loginIp:9579f4076ed282b0dd2e27bba50f12d09077a35d95b15374ebe04ee772023036";
  expect(
    await readSourceBudget({
      ...input,
      read: async (key) => (key === nativeKey ? "2" : null),
    }),
  ).toBe(2);
  expect(await readSourceBudget({ ...input, read: async () => null })).toBe(0);
  await expect(
    readSourceBudget({
      ...input,
      read: async () => {
        throw new Error("Read unavailable");
      },
    }),
  ).rejects.toThrow("Read unavailable");
  await expect(
    readSourceBudget({ ...input, read: async () => "malformed" }),
  ).rejects.toThrow();
});
