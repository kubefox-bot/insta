import { expect, test } from "bun:test";
import { cleanupResources } from "../../../scripts/testing/cleanup";
import type { OwnedResource } from "../../../scripts/testing/types";
import { readAuthFixtureConfig } from "../../fixtures/auth05/config";
import { startRestartWorker } from "../../fixtures/support/restart/providers";

test("AUTH06 isolated restart cleanup admits its UUID owner and refuses foreign labels", async () => {
  const testRunId = `insta-auth06-${crypto.randomUUID()}`;
  const removed: string[] = [];
  await cleanupResources({
    testRunId,
    resources: [{ kind: "container", id: "owned" }],
    execute: async (...args) => {
      if (args[1] === "inspect") return testRunId;
      removed.push(args.at(-1) ?? "");
      return "";
    },
  });
  expect(removed).toEqual(["owned"]);
  await expect(
    cleanupResources({
      testRunId,
      resources: [{ kind: "volume", id: "foreign" }],
      execute: async (...args) => {
        if (args[1] === "inspect") return "another-owner";
        removed.push("foreign");
        return "";
      },
    }),
  ).rejects.toThrow("Owned resource cleanup incomplete");
  expect(removed).toEqual(["owned"]);
});

for (const imageMode of [true, false])
  test(`restart worker preserves ${imageMode ? "immutable zero-mount" : "readonly source"} setup`, async () => {
    const image = `sha256:${"a".repeat(64)}`;
    const configuration = {
      ...readAuthFixtureConfig(),
      image: imageMode ? image : undefined,
    };
    const providers = {
      network: "owned",
      workerImage: image,
      mongo: "owned",
      broker: "owned",
      mailUrl: "owned",
      mongoUrl: "owned",
      brokerUrl: "owned",
    };
    const resources: OwnedResource[] = [];
    const recorded: string[][] = [];
    await startRestartWorker(
      `insta-auth06-${crypto.randomUUID()}`,
      providers,
      resources,
      {
        configuration,
        execute: async (...args) => {
          recorded.push(args);
          return args[0] === "logs" ? "support-restart-worker-ready" : "owned";
        },
      },
    );
    expect(recorded[0]?.includes("-v")).toBe(!imageMode);
    if (!imageMode)
      expect(recorded[0]?.find((value) => value.endsWith(":ro"))).toContain(
        "/__tests__:/workspace/__tests__:ro",
      );
    expect(resources).toEqual([{ kind: "container", id: "owned" }]);
    await expect(
      startRestartWorker("insta-auth06-aabbcc", providers, [], {
        configuration: { ...configuration, image: `sha256:${"b".repeat(64)}` },
        execute: async () => {
          throw new Error("Mismatched worker must not start");
        },
      }),
    ).rejects.toThrow("exact image mismatch");
  });
