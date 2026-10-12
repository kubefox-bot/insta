import { expect, test } from "bun:test";
import { withOwnedProbe } from "./probe";

test("fixture setup rejection releases already acquired probe and preserves original error", async () => {
  const failure = new Error("Synthetic fixture setup failure");
  let closed = false;
  await expect(
    withOwnedProbe({
      acquire: async () => ({
        close: async () => {
          closed = true;
        },
      }),
      run: async () => {
        throw failure;
      },
    }),
  ).rejects.toBe(failure);
  expect(closed).toBe(true);
});
test("probe cleanup failure preserves setup failure as cause and reports both", async () => {
  const failure = new Error("Synthetic setup failure");
  const cleanup = new Error("Synthetic close failure");
  const error = await withOwnedProbe({
    acquire: async () => ({
      close: async () => {
        throw cleanup;
      },
    }),
    run: async () => {
      throw failure;
    },
  }).catch((error: unknown) => error);
  expect(error).toBeInstanceOf(AggregateError);
  if (!(error instanceof AggregateError))
    throw new Error("Expected both failures");
  expect(error.cause).toBe(failure);
  expect(error.errors).toEqual([failure, cleanup]);
});
