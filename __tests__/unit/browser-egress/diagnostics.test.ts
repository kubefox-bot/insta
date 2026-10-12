import { expect, test } from "bun:test";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dockerFields } from "../../fixtures/browser-egress/conts";
import { captureEgressFailure } from "../../fixtures/browser-egress/diagnostics";

test("egress failure diagnostics require exact owner and persist only private bounded metadata", async () => {
  const directory = await mkdtemp(join(tmpdir(), "insta-egress-diagnostic-"));
  const runId = `insta-egress-${crypto.randomUUID()}`;
  const path = join(directory, "failure.json");
  const state = {
    [dockerFields.image]: `sha256:${"a".repeat(64)}`,
    [dockerFields.config]: {
      [dockerFields.labels]: {
        "insta.testRunId": runId,
        private: "CANARY_LABEL",
      },
      [dockerFields.environment]: ["SECRET=CANARY_ENV"],
    },
    [dockerFields.state]: {
      [dockerFields.running]: false,
      [dockerFields.oomKilled]: true,
      [dockerFields.exitCode]: 137,
      [dockerFields.status]: "exited",
      [dockerFields.error]: "CANARY_ERROR",
    },
    [dockerFields.networkSettings]: {
      [dockerFields.ports]: {
        "3128/tcp": [
          {
            [dockerFields.hostIp]: "127.0.0.1",
            [dockerFields.hostPort]: "45678",
          },
        ],
      },
    },
  };
  try {
    await expect(
      captureEgressFailure({
        runId: "foreign",
        path,
        execute: async () => JSON.stringify([state]),
      }),
    ).rejects.toThrow("foreign");
    expect(await Bun.file(path).exists()).toBe(false);
    await captureEgressFailure({
      runId,
      path,
      execute: async (...args) =>
        args[0] === "logs"
          ? "browser-egress-ready\nCANARY_URL"
          : JSON.stringify([state]),
    });
    const output = await Bun.file(path).text();
    expect(output).not.toContain("CANARY");
    expect(JSON.parse(output)).toMatchObject({
      runId,
      readyLogged: true,
      state: { [dockerFields.oomKilled]: true, [dockerFields.exitCode]: 137 },
    });
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    expect((await stat(directory)).mode & 0o777).toBe(0o700);
  } finally {
    await rm(directory, { recursive: true });
  }
});
