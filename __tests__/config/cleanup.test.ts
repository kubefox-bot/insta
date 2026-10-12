import { expect, test } from "bun:test";
import { cleanupResources } from "../../scripts/testing/cleanup";

test("FND05 cleanup cannot remove a resource labelled for a different run", async () => {
  const effects: string[] = [];
  await expect(
    cleanupResources({
      testRunId: "insta-fnd05-aabbcc",
      resources: [{ kind: "container", id: "synthetic" }],
      execute: async (_kind, operation) => {
        effects.push(operation);
        return "insta-fnd04-ddeeff";
      },
    }),
  ).rejects.toThrow("Owned resource cleanup incomplete");
  expect(effects).toEqual(["inspect"]);
});

test("AUTH05 cleanup releases its labelled fixture container", async () => {
  const effects: string[] = [];
  await cleanupResources({
    testRunId: "insta-auth05-aabbcc",
    resources: [{ kind: "container", id: "synthetic" }],
    execute: async (_kind, operation) => {
      effects.push(operation);
      return "insta-auth05-aabbcc";
    },
  });
  expect(effects).toEqual(["inspect", "rm"]);
});

for (const label of ["insta-auth05-ddeeff", ""]) {
  test(`AUTH05 cleanup refuses ${label ? "foreign" : "missing"} ownership`, async () => {
    const effects: string[] = [];
    await expect(
      cleanupResources({
        testRunId: "insta-auth05-aabbcc",
        resources: [{ kind: "container", id: "synthetic" }],
        execute: async (_kind, operation) => {
          effects.push(operation);
          return label;
        },
      }),
    ).rejects.toThrow("Owned resource cleanup incomplete");
    expect(effects).toEqual(["inspect"]);
  });
}

test("CHAT03 cleanup releases its labelled fixture container", async () => {
  const effects: string[] = [];
  await cleanupResources({
    testRunId: "insta-chat03-aabbcc",
    resources: [{ kind: "container", id: "synthetic" }],
    execute: async (_kind, operation) => {
      effects.push(operation);
      return "insta-chat03-aabbcc";
    },
  });
  expect(effects).toEqual(["inspect", "rm"]);
});
test("CHAT-05 fixture lifecycle admits only labelled run-owned resources", async () => {
  const runId = "insta-chat05-aabbcc";
  await cleanupResources({
    testRunId: runId,
    resources: [{ kind: "container", id: runId }],
    execute: async (_kind, operation) => {
      if (operation === "inspect") return runId;
      return "";
    },
  });
  await expect(
    cleanupResources({
      testRunId: runId,
      resources: [{ kind: "container", id: runId }],
      execute: async (_kind, operation) => {
        if (operation === "inspect") return "foreign";
        throw new Error("Foreign removal must not execute");
      },
    }),
  ).rejects.toThrow("Owned resource cleanup incomplete");
});
