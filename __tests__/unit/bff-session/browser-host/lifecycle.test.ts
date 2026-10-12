import { expect, test } from "bun:test";
import { startBrowserHost } from "../../../fixtures/bff-session/browser-host/start";

for (const stage of [
  "first account",
  "second account",
  "router",
  "server",
] as const) {
  test(`BFF browser startup failure at ${stage} disposes its acquired fixture`, async () => {
    const original = new Error(`Synthetic ${stage} failure`);
    const events: string[] = [];
    let accounts = 0;
    await expect(
      startBrowserHost({
        createFixture: async () => ({
          native: {
            account: async () => {
              accounts++;
              if (
                stage === "first account" ||
                (stage === "second account" && accounts === 2)
              )
                throw original;
              return {
                email: `owned-${accounts}@example.test`,
                password: "synthetic",
              };
            },
            email: (purpose) => `${purpose}@example.test`,
          },
          dispose: async () => {
            events.push("fixture");
          },
        }),
        createFaults: async () => {
          if (stage === "router") throw original;
          return {
            request: () => new Response(),
            release: () => {
              events.push("faults");
            },
          };
        },
        serve: () => {
          throw original;
        },
        cleanupBindings: async () => {
          events.push("bindings");
        },
      }),
    ).rejects.toBe(original);
    expect(events.at(-1)).toBe("fixture");
    expect(events).toContain("bindings");
    expect(events.filter((event) => event === "fixture")).toHaveLength(1);
    if (stage === "server") expect(events[0]).toBe("faults");
  });
}

test("normal BFF browser shutdown releases faults, HTTP, bindings and fixture exactly once", async () => {
  const events: string[] = [];
  const host = await startBrowserHost({
    createFixture: async () => ({
      native: {
        account: async () => ({
          email: "owned@example.test",
          password: "synthetic",
        }),
        email: (purpose) => `${purpose}@example.test`,
      },
      dispose: async () => {
        events.push("fixture");
      },
    }),
    createFaults: async () => ({
      request: () => new Response(),
      release: () => {
        events.push("faults");
      },
    }),
    serve: () => ({
      stop: async () => {
        events.push("HTTP");
      },
    }),
    cleanupBindings: async () => {
      events.push("bindings");
    },
  });
  const first = host.dispose();
  expect(host.dispose()).toBe(first);
  await first;
  expect(events).toEqual(["faults", "HTTP", "bindings", "fixture"]);
});

test("a shutdown failure cannot skip later resource owners or repeat cleanup", async () => {
  const failure = new Error("Fault release failed");
  const events: string[] = [];
  const host = await startBrowserHost({
    createFixture: async () => ({
      native: {
        account: async () => ({
          email: "owned@example.test",
          password: "synthetic",
        }),
        email: (purpose) => `${purpose}@example.test`,
      },
      dispose: async () => {
        events.push("fixture");
      },
    }),
    createFaults: async () => ({
      request: () => new Response(),
      release: () => {
        throw failure;
      },
    }),
    serve: () => ({
      stop: async () => {
        events.push("HTTP");
      },
    }),
    cleanupBindings: async () => {
      events.push("bindings");
    },
  });
  const disposal = host.dispose();
  const error = await disposal.then(
    () => undefined,
    (error: unknown) => error,
  );
  expect(error).toBeInstanceOf(AggregateError);
  if (!(error instanceof AggregateError))
    throw new Error("Missing cleanup failure");
  expect(error.errors).toContain(failure);
  expect(events).toEqual(["HTTP", "bindings", "fixture"]);
  expect(host.dispose()).toBe(disposal);
});
