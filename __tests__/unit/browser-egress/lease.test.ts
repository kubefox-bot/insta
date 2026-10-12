import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { reserveEgressAddress } from "../../fixtures/browser-egress/lease";

test("private leases keep retired container addresses unavailable and stale lock/corrupt ownership fail closed", async () => {
  const directory = await mkdtemp(join(tmpdir(), "insta-egress-"));
  const options = {
    directory,
    subnet: "172.19.0.0/16",
    occupied: new Set<string>(),
    now: 1000,
    runId: `insta-egress-${crypto.randomUUID()}`,
  };
  try {
    const first = await reserveEgressAddress(options);
    const second = await reserveEgressAddress({
      ...options,
      runId: `insta-egress-${crypto.randomUUID()}`,
    });
    expect(second).not.toBe(first);
    await Bun.write(`${directory}/allocation.lock`, "owned-stale-lock");
    const before = await Bun.file(`${directory}/leases.json`).text();
    await expect(reserveEgressAddress(options)).rejects.toThrow(
      "lock exists or is unavailable",
    );
    expect(await Bun.file(`${directory}/leases.json`).text()).toBe(before);
    expect(await Bun.file(`${directory}/allocation.lock`).text()).toBe(
      "owned-stale-lock",
    );
    await rm(`${directory}/allocation.lock`);
    await Bun.write(
      `${directory}/leases.json`,
      JSON.stringify({ owner: "foreign", leases: [] }),
    );
    await expect(reserveEgressAddress(options)).rejects.toThrow();
    expect(await Bun.file(`${directory}/leases.json`).json()).toEqual({
      owner: "foreign",
      leases: [],
    });
  } finally {
    await rm(directory, { recursive: true });
  }
});
