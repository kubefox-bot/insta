import { expect, test } from "bun:test";
import { settleOwnedProcesses } from "../../scripts/infra/commands/processes";
import { selectCommand } from "../../scripts/infra/commands/select";

const terminateFixtureGroup = (groupId: number) => {
  try {
    process.kill(-groupId, "SIGKILL");
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ESRCH"))
      throw error;
  }
};

test("infrastructure selection never launches applications or proxy", () => {
  expect(selectCommand("infra:up")).toEqual({ kind: "infrastructure" });
});
test("independent container selection owns exactly one app", () => {
  expect(selectCommand("compose:backend")).toEqual({
    kind: "compose",
    services: ["be-insta"],
  });
  expect(selectCommand("compose:frontend")).toEqual({
    kind: "compose",
    services: ["fe-insta"],
  });
});
test("legacy full aliases and down preserve their contracts", () => {
  expect(selectCommand("up")).toEqual(selectCommand("compose:up"));
  expect(selectCommand("compose:up")).toEqual({
    kind: "compose",
    services: [],
  });
  expect(selectCommand("down")).toEqual({ kind: "down" });
  expect(selectCommand("infra:prepare")).toEqual({ kind: "prepare" });
});
test("host dev selects only requested apps", () => {
  expect(selectCommand("dev:backend")).toEqual({
    kind: "dev",
    apps: ["backend"],
  });
  expect(selectCommand("dev:frontend")).toEqual({
    kind: "dev",
    apps: ["frontend"],
  });
  expect(selectCommand("dev")).toEqual({
    kind: "dev",
    apps: ["backend", "frontend"],
  });
});
test("unknown commands fail before effects", () => {
  expect(() => selectCommand("unsupported")).toThrow(
    "Unknown infrastructure command",
  );
});
test("owned process settlement has a bounded wait for an unsignaled child", async () => {
  const settlement = await settleOwnedProcesses(
    [new Promise<void>(() => {})],
    5,
  );
  expect(settlement.kind).toBe("timed-out");
});
test("close runs owned resource cleanup even when it reports cleanup failure", async () => {
  const { OwnedProcesses } = await import(
    "../../scripts/infra/commands/processes"
  );
  const owner = new OwnedProcesses(new AbortController().signal);
  let cleaned = false;
  owner.onClose(async () => {
    cleaned = true;
    throw new Error("owned cleanup failed");
  });
  await expect(owner.close()).rejects.toThrow("Owned process cleanup failed");
  expect(cleaned).toBe(true);
});
test("cleanup commands kill and settle their complete owned process group on timeout", async () => {
  const { mkdtemp, readFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { OwnedProcesses } = await import(
    "../../scripts/infra/commands/processes"
  );
  const directory = await mkdtemp(join(tmpdir(), "insta-cleanup-"));
  const groupIdPath = join(directory, "group-id");
  const owner = new OwnedProcesses(new AbortController().signal);
  const startedAt = performance.now();
  try {
    await expect(
      owner.runCleanup(
        {
          args: ["sh", "-c", `printf '%s' "$$" > "${groupIdPath}"; sleep 30 &`],
        },
        50,
      ),
    ).rejects.toThrow("Cleanup command exceeded its settlement deadline");
    expect(performance.now() - startedAt).toBeLessThan(1500);
    const groupId = Number(await readFile(groupIdPath, "utf8"));
    expect(groupId).toBeGreaterThan(0);
    expect(() => process.kill(-groupId, 0)).toThrow();
  } finally {
    await owner.close();
    await rm(directory, { recursive: true, force: true });
  }
});
test("build selects only the requested app", () => {
  expect(selectCommand("build:backend")).toEqual({
    kind: "build",
    app: "backend",
  });
  expect(selectCommand("build:frontend")).toEqual({
    kind: "build",
    app: "frontend",
  });
});

test("owned processes preserve failure exit and settle cancellation", async () => {
  const { OwnedProcesses } = await import(
    "../../scripts/infra/commands/processes"
  );
  const owner = new OwnedProcesses(new AbortController().signal);
  try {
    expect(
      await owner.run({
        args: [process.execPath, "-e", "process.exit(7)"],
        quiet: true,
      }),
    ).toBe(7);
  } finally {
    await owner.close();
  }
  const controller = new AbortController();
  const cancelled = new OwnedProcesses(controller.signal);
  const exit = cancelled.run({
    args: [process.execPath, "-e", "setInterval(() => {}, 1000)"],
    quiet: true,
  });
  controller.abort();
  expect(await exit).not.toBe(0);
  await cancelled.close();
});
test("close settles a TERM-resistant descendant after its group leader exits", async () => {
  const { OwnedProcesses } = await import(
    "../../scripts/infra/commands/processes"
  );
  const { z } = await import("zod");
  const owner = new OwnedProcesses(new AbortController().signal);
  const borrowed = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () => new Response("borrowed survives"),
  });
  const descendant = z
    .object({
      groupId: z.number().int().positive(),
      port: z.number().int().positive(),
    })
    .parse(
      JSON.parse(
        await owner.capture({
          args: [
            process.execPath,
            "--no-env-file",
            "__tests__/config/fixtures/owned-processes/leader.ts",
          ],
        }),
      ),
    );
  try {
    expect(
      await (await fetch(`http://127.0.0.1:${descendant.port}`)).text(),
    ).toBe("owned descendant");
    await owner.close();
    const { assertPortAvailable } = await import(
      "../../scripts/infra/host/preflight"
    );
    await expect(
      assertPortAvailable({ port: descendant.port }),
    ).resolves.toBeUndefined();
    expect(() => process.kill(-descendant.groupId, 0)).toThrow();
    expect(await (await fetch(borrowed.url)).text()).toBe("borrowed survives");
  } finally {
    terminateFixtureGroup(descendant.groupId);
    await owner.close();
    await borrowed.stop(true);
  }
}, 30000);

test("owned group probe and termination retry transient Darwin EPERM without treating it as absence", async () => {
  const { signalOwnedGroup } = await import(
    "../../scripts/infra/commands/group-signal"
  );
  await Promise.all(
    ([0, "SIGTERM", "SIGKILL"] as const).map(async (signal) => {
      const calls: number[] = [];
      expect(
        await signalOwnedGroup({
          id: 1234,
          signal,
          send: (target) => {
            calls.push(target);
            if (calls.length === 1)
              throw Object.assign(new Error("Transient exiting group"), {
                code: "EPERM",
              });
          },
        }),
      ).toBe(true);
      expect(calls).toEqual([-1234, -1234]);
      const exiting: number[] = [];
      expect(
        await signalOwnedGroup({
          id: 1234,
          signal,
          send: (target) => {
            exiting.push(target);
            throw Object.assign(new Error("Exiting group"), {
              code: exiting.length === 1 ? "EPERM" : "ESRCH",
            });
          },
        }),
      ).toBe(false);
      expect(exiting).toEqual([-1234, -1234]);
    }),
  );
});

test("persistent group permission failures remain explicit and bounded for probe TERM and KILL", async () => {
  const { signalOwnedGroup } = await import(
    "../../scripts/infra/commands/group-signal"
  );
  const start = performance.now();
  const outcomes = await Promise.allSettled(
    ([0, "SIGTERM", "SIGKILL"] as const).map((signal) =>
      signalOwnedGroup({
        id: 1234,
        signal,
        send: () => {
          throw Object.assign(new Error("Persistent denied group"), {
            code: "EPERM",
          });
        },
      }),
    ),
  );
  for (const outcome of outcomes) {
    expect(outcome.status).toBe("rejected");
    if (outcome.status === "rejected")
      expect(outcome.reason).toMatchObject({
        message:
          "Owned process group signal remained denied after bounded retry",
        cause: { code: "EPERM" },
      });
  }
  expect(performance.now() - start).toBeGreaterThanOrEqual(5000);
  expect(performance.now() - start).toBeLessThan(8000);
}, 10000);
