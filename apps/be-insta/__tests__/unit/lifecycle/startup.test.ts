import { expect, spyOn, test } from "bun:test";
import * as startup from "../../../src/app/lifecycle/startup";

test("failed listen drains services before observability and infrastructure", async () => {
  const events: string[] = [];
  const failure = new Error("listen failed");
  const lifecycle = startup.createStartupLifecycle();
  await lifecycle.start({
    name: "infrastructure",
    start: () => "infrastructure",
    close: async (resource) => {
      events.push(resource);
    },
  });
  await lifecycle.start({
    name: "observability",
    start: () => "observability",
    close: async (resource) => {
      events.push(resource);
    },
  });
  const app = await lifecycle.start({
    name: "application",
    start: () => ({
      listen: async () => {
        events.push("listen");
        throw failure;
      },
      close: async () => {
        events.push("app");
        await lifecycle.closeStage("services");
        await lifecycle.closeStage("observability");
        await lifecycle.closeStage("infrastructure");
      },
    }),
    close: (resource) => resource.close(),
  });
  await lifecycle.start({
    name: "services",
    start: () => "services",
    close: async (resource) => {
      events.push(resource);
    },
  });

  await expect(
    startup.startApplication({
      prepare: async () => ({ app, close: lifecycle.close }),
      port: 0,
      host: "localhost",
    }),
  ).rejects.toBe(failure);
  await lifecycle.close();
  expect(events).toEqual([
    "listen",
    "services",
    "observability",
    "app",
    "infrastructure",
  ]);
});

test("cleanup keeps draining after failures and preserves the listen error", async () => {
  const events: string[] = [];
  const failure = new Error("listen failed");
  const lifecycle = startup.createStartupLifecycle();
  const diagnostics = spyOn(process.stderr, "write").mockImplementation(
    () => true,
  );
  try {
    for (const name of [
      "infrastructure",
      "application",
      "observability",
      "services",
    ] as const) {
      await lifecycle.start({
        name,
        start: () => name,
        close: async (resource) => {
          events.push(resource);
          throw new Error(`${resource} cleanup failed`);
        },
      });
    }
    await expect(
      startup.startApplication({
        prepare: async () => ({
          app: {
            listen: async () => {
              throw failure;
            },
          },
          close: lifecycle.close,
        }),
        port: 0,
        host: "localhost",
      }),
    ).rejects.toBe(failure);
    await lifecycle.close();
    expect(events).toEqual([
      "services",
      "observability",
      "application",
      "infrastructure",
    ]);
    expect(diagnostics.mock.calls.length).toBeGreaterThan(0);
  } finally {
    diagnostics.mockRestore();
  }
});

test("failed application acquisition closes only earlier resources and preserves the startup error", async () => {
  const events: string[] = [];
  const failure = new Error("application acquisition failed");
  const lifecycle = startup.createStartupLifecycle();
  const prepare = async () => {
    try {
      await lifecycle.start({
        name: "infrastructure",
        start: () => "infrastructure",
        close: async (resource) => {
          events.push(resource);
        },
      });
      await lifecycle.start({
        name: "observability",
        start: () => "observability",
        close: async (resource) => {
          events.push(resource);
        },
      });
      await lifecycle.start({
        name: "application",
        start: () => {
          throw failure;
        },
        close: async () => {
          events.push("unacquired application");
        },
      });
    } catch (error) {
      await lifecycle.close();
      throw error;
    }
  };
  await expect(prepare()).rejects.toBe(failure);
  expect(events).toEqual(["observability", "infrastructure"]);
});

test("failed analytics acquisition drains realtime once even when application hooks close the same stages", async () => {
  const events: string[] = [];
  const failure = new Error("analytics acquisition failed");
  const lifecycle = startup.createStartupLifecycle();
  const diagnostics = spyOn(process.stderr, "write").mockImplementation(
    () => true,
  );
  const prepare = async () => {
    try {
      await lifecycle.start({
        name: "infrastructure",
        start: () => "infrastructure",
        close: async (resource) => {
          events.push(resource);
        },
      });
      await lifecycle.start({
        name: "observability",
        start: () => "observability",
        close: async (resource) => {
          events.push(resource);
        },
      });
      await lifecycle.start({
        name: "application",
        start: () => "application",
        close: async (resource) => {
          events.push(resource);
          await lifecycle.closeStage("services");
          await lifecycle.closeStage("observability");
          await lifecycle.closeStage("infrastructure");
        },
      });
      await lifecycle.start({
        name: "services",
        start: () => "server/workers",
        close: async (resource) => {
          events.push(resource);
          throw new Error("workers cleanup failed");
        },
      });
      await lifecycle.start({
        name: "services",
        start: () => "realtime",
        close: async (resource) => {
          events.push(resource);
        },
      });
      await lifecycle.start({
        name: "services",
        start: () => {
          throw failure;
        },
        close: async () => {
          events.push("unacquired analytics");
        },
      });
    } catch (error) {
      await lifecycle.close();
      throw error;
    }
  };
  try {
    await expect(prepare()).rejects.toBe(failure);
    await lifecycle.close();
    expect(events).toEqual([
      "server/workers",
      "realtime",
      "observability",
      "application",
      "infrastructure",
    ]);
  } finally {
    diagnostics.mockRestore();
  }
});
