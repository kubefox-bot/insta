import { expect, test } from "bun:test";
import { disposeAuthFixture } from "../../fixtures/auth05/dispose";

test("egress reuses owned fixture disposal and refuses foreign labels before any effect", async () => {
  const runId = `insta-egress-${crypto.randomUUID()}`;
  const effects: string[] = [];
  await disposeAuthFixture({
    runId,
    execute: async (...args) => {
      effects.push(args[0] ?? "");
      return args.includes("{{.State.ExitCode}}") ? "0" : runId;
    },
  });
  expect(effects).toEqual([
    "container",
    "stop",
    "inspect",
    "container",
    "container",
  ]);
  await expect(
    disposeAuthFixture({
      runId,
      execute: async (...args) => {
        effects.push(args[0] ?? "");
        return "foreign";
      },
    }),
  ).rejects.toThrow("unowned");
  expect(effects.at(-1)).toBe("container");
  expect(effects.filter((effect) => effect === "stop")).toHaveLength(1);
});
