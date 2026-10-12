import { expect, test } from "bun:test";
import { waitUntil } from "../../scripts/infra/readiness";

test("shared readiness waits for observable ready and fails a permanently unavailable target", async () => {
  let probes = 0;
  await waitUntil({
    timeoutMs: 500,
    check: async () => {
      probes++;
      return probes === 2;
    },
  });
  expect(probes).toBe(2);
  await expect(
    waitUntil({ timeoutMs: 20, check: async () => false }),
  ).rejects.toThrow("Readiness barrier deadline exceeded");
});
