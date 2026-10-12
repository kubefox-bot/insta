import { expect, test } from "bun:test";
import { withResource } from "../../fixtures/lifecycle/with-resource";

for (const stage of ["newContext", "newPage"] as const) {
  test(`UI acceptance ${stage} setup failure releases every acquired owner once`, async () => {
    const original = new Error(stage);
    const disposed: string[] = [];
    await expect(
      withResource({
        start: async () => ({
          dispose: async () => {
            disposed.push("synthetic resources");
          },
        }),
        use: async () =>
          withResource({
            start: async () => {
              if (stage === "newContext") throw original;
              return {
                newPage: async () => {
                  throw original;
                },
                dispose: async () => {
                  disposed.push("browser context");
                },
              };
            },
            use: async (context) => {
              await context.newPage();
            },
          }),
      }),
    ).rejects.toBe(original);
    expect(disposed).toEqual(
      stage === "newContext"
        ? ["synthetic resources"]
        : ["browser context", "synthetic resources"],
    );
  });
}

test("UI acceptance first browser cleanup rejection cannot skip synthetic disposal or replace the original failure", async () => {
  const original = new Error("test assertion failed");
  const browserCleanup = new Error("browser context close failed");
  const syntheticCleanup = new Error("synthetic cleanup failed");
  const disposed: string[] = [];
  const error = await withResource({
    start: async () => ({
      dispose: async () => {
        disposed.push("synthetic resources");
        throw syntheticCleanup;
      },
    }),
    use: async () =>
      withResource({
        start: async () => ({
          dispose: async () => {
            disposed.push("browser context");
            throw browserCleanup;
          },
        }),
        use: async () => {
          throw original;
        },
      }),
  }).then(
    () => undefined,
    (failure: unknown) => failure,
  );
  expect(disposed).toEqual(["browser context", "synthetic resources"]);
  expect(error).toBeInstanceOf(AggregateError);
  if (!(error instanceof AggregateError))
    throw new Error("Missing owned failures");
  const primary = error.cause;
  expect(primary).toBeInstanceOf(AggregateError);
  if (!(primary instanceof AggregateError))
    throw new Error("Missing browser failure");
  expect(primary.cause).toBe(original);
  expect(primary.errors).toEqual([original, browserCleanup]);
  expect(error.errors).toEqual([primary, syntheticCleanup]);
});

test("UI acceptance successful body retains its cleanup failure and disposes once", async () => {
  const cleanup = new Error("cleanup failed");
  const disposed: string[] = [];
  await expect(
    withResource({
      start: async () => ({
        dispose: async () => {
          disposed.push("resource");
          throw cleanup;
        },
      }),
      use: async () => {},
    }),
  ).rejects.toBe(cleanup);
  expect(disposed).toEqual(["resource"]);
});

test("UI acceptance successful setup and body dispose once", async () => {
  const events: string[] = [];
  await withResource({
    start: async () => ({
      dispose: async () => {
        events.push("dispose");
      },
    }),
    use: async () => {
      events.push("use");
    },
  });
  expect(events).toEqual(["use", "dispose"]);
});
