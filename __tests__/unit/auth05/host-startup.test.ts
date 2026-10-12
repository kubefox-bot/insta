import { expect, test } from "bun:test";
import { startAuthHost } from "../../fixtures/auth05/host/start";

for (const failingPhase of [
  "second account",
  "registration",
  "observer",
  "server",
] as const) {
  test(`startup failure at ${failingPhase} releases acquired fixture and partial resources`, async () => {
    const events: string[] = [];
    const original = new Error(`Synthetic ${failingPhase} failure`);
    const fixture = {
      native: {
        account: async () => {
          events.push("account");
          if (failingPhase === "second account" && events.length === 2)
            throw original;
          return { email: "owned@example.test", password: "synthetic" };
        },
        email: (purpose: string) => `${purpose}@example.test`,
      },
      dispose: async () => {
        events.push("fixture disposed");
      },
    };
    await expect(
      startAuthHost({
        createFixture: async () => fixture,
        createRegistration: async () => {
          if (failingPhase === "registration") throw original;
          return {
            cleanup: async () => {
              events.push("registration disposed");
            },
            close: () => {
              events.push("broker closed");
            },
          };
        },
        createObserver: () => {
          if (failingPhase === "observer") throw original;
          return {
            dispose: async () => {
              events.push("observer disposed");
            },
          };
        },
        serve: () => {
          throw original;
        },
      }),
    ).rejects.toBe(original);
    expect(events).toContain("fixture disposed");
    if (failingPhase === "observer" || failingPhase === "server")
      expect(events).toContain("broker closed");
    if (failingPhase === "server")
      expect(events).toContain("observer disposed");
  });
}

test("startup preserves original and cleanup failures while releasing every acquired resource", async () => {
  const original = new Error("server refused");
  const cleanup = new Error("observer failed");
  const events: string[] = [];
  const result = await startAuthHost({
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
    createRegistration: async () => ({
      cleanup: async () => {
        events.push("registration");
      },
      close: () => {
        events.push("broker");
      },
    }),
    createObserver: () => ({
      dispose: async () => {
        events.push("observer");
        throw cleanup;
      },
    }),
    serve: () => {
      throw original;
    },
  }).then(
    () => null,
    (error: unknown) => error,
  );
  expect(result).toBeInstanceOf(AggregateError);
  if (!(result instanceof AggregateError)) throw new Error("Missing aggregate");
  expect(result.cause).toBe(original);
  expect(result.errors[0]).toBe(original);
  expect(result.errors[1].errors).toContain(cleanup);
  expect(events).toEqual(["observer", "registration", "broker", "fixture"]);
});
