import { expect, spyOn, test } from "bun:test";
import { RedisClient } from "bun";
import {
  connectDragonfly,
  evaluateFenced,
  readGeneration,
} from "../../src/dragonfly/server/index";

test("namespace and caller keys/arguments remain distinct from reserved fencing slots", async () => {
  const calls: string[][] = [];
  const client = {
    get: async () => null,
    send: async (_command: string, args: string[]) => {
      calls.push(args);
      return "generation";
    },
  };
  const namespace = { generationKey: "owned:generation", keyPrefix: "owned" };
  expect(await readGeneration({ client, namespace })).toBe("generation");
  await evaluateFenced({
    client,
    namespace,
    generation: "g",
    script: "return ARGV[2]",
    keys: ["record"],
    arguments: ["payload"],
  });
  expect(calls[0]?.slice(1)).toEqual(["1", "owned:generation"]);
  expect(calls[1]?.slice(1)).toEqual([
    "2",
    "owned:generation",
    "owned:g:record",
    "g",
    "payload",
  ]);
});
test("failed connection closes its client and preserves the original failure", async () => {
  const error = new Error("synthetic connection failure");
  const connect = spyOn(RedisClient.prototype, "connect").mockRejectedValue(
    error,
  );
  const close = spyOn(RedisClient.prototype, "close").mockImplementation(
    () => {},
  );
  try {
    await expect(
      connectDragonfly({ url: "redis://127.0.0.1:1", timeoutMs: 1 }),
    ).rejects.toBe(error);
    expect(close).toHaveBeenCalledTimes(1);
  } finally {
    connect.mockRestore();
    close.mockRestore();
  }
});
